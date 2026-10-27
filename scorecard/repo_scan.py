"""Pre-submission scan of the whole git history (every branch and commit) for things that must not ship.

  - files over 1 MB, and file names that should never be committed (.env, keys, disk images, answer files)
  - the real secret values in the local .env files (Domino's, the agent's, the Zetaris platform's), matched
    exactly but never printed
  - common key formats (NVIDIA, OpenAI/Anthropic, GitHub, AWS, private keys, JWTs)
  - email addresses and phone-like numbers, to check by eye for real personal data

    python3 scorecard/repo_scan.py        exit 0 = clean, 1 = something to fix (fetch first to include teammates' latest)
"""

from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ENV_FILES = [ROOT / ".env", ROOT / "agent" / ".env", Path.home() / "zetaris-platform" / ".env"]
BIG_BYTES = 1_000_000
RISKY_NAME = re.compile(r"(^|/)\.env($|\.(?!example$))|\.pem$|\.key$|id_rsa|\.p12$|\.dmg$|\.jar$|node_modules/"
                        r"|^ground_truth/(?!README\.md$)|domino-private", re.IGNORECASE)
KEY_FORMATS = {
    "NVIDIA key": r"nvapi-[A-Za-z0-9_-]{20,}", "OpenAI/Anthropic key": r"\bsk-(?:ant-)?[A-Za-z0-9_-]{20,}",
    "GitHub token": r"\bgh[pousr]_[A-Za-z0-9]{30,}", "AWS key": r"\bAKIA[0-9A-Z]{16}\b",
    "private key": r"-----BEGIN [A-Z ]*PRIVATE KEY-----", "JWT": r"\beyJ[A-Za-z0-9_-]{15,}\.eyJ[A-Za-z0-9_-]{15,}\.",
}
# Addresses that are part of the setup docs, not personal data.
KNOWN_EMAILS = {"admin@zetaris.com", "domino-agent@local.test", "noreply@anthropic.com"}


def _git(*args: str) -> str:
    return subprocess.run(["git", *args], cwd=ROOT, capture_output=True, text=True, check=True, timeout=120).stdout


def _secret_values() -> dict:
    values = {}
    for env in ENV_FILES:
        if env.is_file():
            for line in env.read_text(errors="replace").splitlines():
                m = re.match(r"\s*([A-Z0-9_]*(?:PASSWORD|SECRET|TOKEN|KEY|PASS)[A-Z0-9_]*)\s*=\s*(.+)", line)
                value = m.group(2).strip().strip("\"'") if m else ""
                if len(value) >= 6:
                    values[f"{env.parent.name}/.env {m.group(1)}"] = value
    return values


def _blobs() -> list:
    """(path, size, text) for every file version in every commit."""
    objects = [line.partition(" ") for line in _git("rev-list", "--objects", "--all").splitlines()]
    shas = "\n".join(sha for sha, _, _ in objects) + "\n"
    out = subprocess.run(["git", "cat-file", "--batch"], cwd=ROOT, input=shas.encode(), capture_output=True,
                         check=True, timeout=300).stdout
    blobs, pos, paths = [], 0, {sha: path for sha, _, path in objects}
    while pos < len(out):
        header_end = out.index(b"\n", pos)
        sha, kind, size = out[pos:header_end].decode().split()
        size = int(size)
        body = out[header_end + 1:header_end + 1 + size]
        pos = header_end + 1 + size + 1
        if kind == "blob":
            blobs.append((paths.get(sha, ""), size, body.decode("utf-8", "replace")))
    return blobs


def main() -> int:
    problems, notes = [], []
    commits = len(_git("rev-list", "--all").split())
    blobs = _blobs()
    names = sorted(set(_git("log", "--all", "--name-only", "--format=").split()))
    messages = _git("log", "--all", "--format=%B")

    problems += [f"file over 1 MB: {p} ({s // 1024} KB)" for p, s, _ in blobs if s > BIG_BYTES]
    problems += [f"file that should not be committed: {n}" for n in names if RISKY_NAME.search(n)]
    secrets = _secret_values()
    for label, value in sorted(secrets.items()):
        where = sorted({p for p, _, text in blobs if value in text}) + (["a commit message"] if value in messages else [])
        if where:
            problems.append(f"real secret {label} appears in: {', '.join(where)}")
    for label, pattern in KEY_FORMATS.items():
        hits = sorted({p for p, _, text in blobs if re.search(pattern, text)})
        if hits:
            problems.append(f"{label} format in: {', '.join(hits)}")
    emails = sorted({e.lower() for _, _, t in blobs for e in re.findall(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}", t)})
    unknown = [e for e in emails if e not in KNOWN_EMAILS]
    if unknown:
        notes.append(f"email addresses to check by eye: {unknown}")
    phones = sorted({n for p, _, t in blobs if not p.endswith(".json") for n in re.findall(r"\b\(?\d{3}\)?[-. ]\d{3}[-. ]\d{4}\b", t)})
    if phones:
        notes.append(f"phone-like numbers to check by eye: {phones[:10]}")

    print(f"Scanned {len(blobs)} file versions in {commits} commits on every branch; "
          f"{len(secrets)} real secret values checked (never printed).")
    for note in notes:
        print("  note: " + note)
    if problems:
        print("REPO SCAN FAILED:")
        for p in problems:
            print("  - " + p)
        return 1
    print("Repo scan passed: no big files, no secret files, no secrets or key formats.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
