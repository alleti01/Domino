"""Minimal Zetaris REST client: login-token auth through the UI proxy, timeouts, capped retries, query logging.

Uses `POST /api/auth/login` for an idToken instead of API tokens, which often fail with 400
"Not Allowed" on the hackathon build. Standard library only, so a fresh clone runs with no installs.
"""

from __future__ import annotations

import json
import re
import socket
import time
import uuid
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from . import config, query_log

QUERY_PATH = "/api/proxy/sql-editor/sqls/run-query"
LOGIN_PATH = "/api/auth/login"
READ_ONLY_KEYWORDS = ("select", "with", "show", "describe", "desc", "list")
RETRY_BACKOFF_S = (1.0, 3.0)  # at most 2 retries, only for "unavailable"


class ZetarisError(Exception):
    status = "error"


class ZetarisUnavailable(ZetarisError):
    """Network failure or HTTP 5xx: the platform, not the caller, is at fault."""

    status = "unavailable"


class ZetarisTimeout(ZetarisError):
    status = "timeout"


class ZetarisAuthError(ZetarisError):
    pass


@dataclass
class QueryResult:
    query_id: str
    sql: str
    columns: List[str]
    rows: List[Dict[str, Any]]
    duration_ms: int
    truncated: bool = False
    attempts: int = 1
    meta: Dict[str, Any] = field(default_factory=dict)


def prepare_sql(sql: str, read_only: bool) -> str:
    """One statement, no trailing semicolon; read-only callers may only read."""
    text = sql.strip()
    while text.endswith(";"):
        text = text[:-1].rstrip()
    if not text:
        raise ZetarisError("SQL is empty.")
    if read_only:
        first = text.split(None, 1)[0].lower()
        if first not in READ_ONLY_KEYWORDS:
            raise ZetarisError(f"Refused: read-only access allows {', '.join(k.upper() for k in READ_ONLY_KEYWORDS)}, got {first.upper()}.")
        if ";" in text:
            raise ZetarisError("Refused: send one statement per request.")
    return text


def _column_names(spec: List[Any]) -> List[str]:
    names = []
    for i, col in enumerate(spec):
        if isinstance(col, str):
            names.append(col)
        elif isinstance(col, dict):
            names.append(str(col.get("name") or col.get("columnName") or col.get("label") or col.get("field") or f"c{i}"))
        else:
            names.append(f"c{i}")
    return names


def normalize_payload(payload: Any) -> Tuple[List[str], List[Dict[str, Any]]]:
    """Turn a query response into (columns, rows-as-dicts). The response shape is unconfirmed, so accept the likely ones."""
    node, columns = payload, None
    for _ in range(4):
        if not isinstance(node, dict):
            break
        for key in ("columns", "schema", "header", "headers", "columnNames"):
            if columns is None and isinstance(node.get(key), list):
                columns = _column_names(node[key])
        meta = node.get("meta") or node.get("metadata")
        if columns is None and isinstance(meta, dict) and isinstance(meta.get("columns"), list):
            columns = _column_names(meta["columns"])
        for key in ("data", "rows", "records", "result", "results"):
            if key in node:
                node = node[key]
                break
        else:
            break
    if node is None:
        return columns or [], []
    if isinstance(node, list):
        if not node:
            return columns or [], []
        if all(isinstance(r, dict) for r in node):
            cols = columns or list(dict.fromkeys(k for r in node for k in r))
            return cols, [dict(r) for r in node]
        if all(isinstance(r, (list, tuple)) for r in node):
            width = len(node[0])
            if columns is None or len(columns) != width:
                columns = [f"c{i}" for i in range(width)]
            return columns, [dict(zip(columns, r)) for r in node]
    keys = list(payload.keys()) if isinstance(payload, dict) else type(payload).__name__
    raise ZetarisError(f"Unrecognised query response shape (top-level: {keys}). Update normalize_payload.")


class ZetarisClient:
    """`identity="agent"` is the read-only non-admin login; `identity="admin"` is for setup scripts only."""

    def __init__(self, identity: str = "agent") -> None:
        if identity not in ("agent", "admin"):
            raise ValueError("identity must be 'agent' or 'admin'")
        self.identity = identity
        self.base_url = (config.get("ZETARIS_BASE_URL", "http://localhost:3000") or "").rstrip("/")
        self.org_id = config.get("ZETARIS_ORG_ID")
        prefix = "ZETARIS_AGENT_" if identity == "agent" else "ZETARIS_ADMIN_"
        self._username = config.get(prefix + "USERNAME")
        self._password = config.get(prefix + "PASSWORD")
        self.timeout_s = config.get_int("ZETARIS_TIMEOUT_S", 30)
        self.limit = config.get_int("ZETARIS_QUERY_LIMIT", 1000)
        self._token: Optional[str] = None
        if not re.fullmatch(r"https?://[^/]+", self.base_url):
            raise ZetarisError("ZETARIS_BASE_URL must be an origin like http://localhost:3000 (no path).")
        if not self.org_id or not self.org_id.isdigit():
            raise ZetarisError("Set ZETARIS_ORG_ID to your numeric org ID (Management -> Organisation).")
        if not self._username or not self._password:
            raise ZetarisError(f"Set {prefix}USERNAME and {prefix}PASSWORD in .env.")

    def _http(self, path: str, body: Dict[str, Any], timeout_s: float, auth: bool = True) -> Any:
        headers = {"Content-Type": "application/json", "X-Request-ID": str(uuid.uuid4())}
        if auth:
            headers["Authorization"] = f"Bearer {self._token}"
            headers["X-Org-ID"] = str(self.org_id)
        request = Request(self.base_url + path, data=json.dumps(body).encode("utf-8"), headers=headers, method="POST")
        try:
            with urlopen(request, timeout=timeout_s) as response:
                text = response.read().decode("utf-8")
                return json.loads(text) if text.strip() else None
        except HTTPError as error:
            detail = error.read(500).decode("utf-8", errors="replace")
            if "text/html" in (error.headers.get("content-type") or ""):
                detail = "HTML page returned; check the API route."
            if error.code >= 500:
                raise ZetarisUnavailable(f"HTTP {error.code} from {path}: {detail}") from error
            if error.code in (401, 403):
                raise ZetarisAuthError(f"HTTP {error.code} from {path}: {detail}") from error
            hint = " (400 usually means a bad X-Org-ID or a non-UUID X-Request-ID)" if error.code == 400 else ""
            raise ZetarisError(f"HTTP {error.code} from {path}{hint}: {detail}") from error
        except (socket.timeout, TimeoutError) as error:
            raise ZetarisTimeout(f"No response from {path} within {timeout_s}s") from error
        except URLError as error:
            if isinstance(error.reason, (socket.timeout, TimeoutError)):
                raise ZetarisTimeout(f"No response from {path} within {timeout_s}s") from error
            raise ZetarisUnavailable(f"Cannot reach {self.base_url}: {error.reason}") from error
        except json.JSONDecodeError as error:
            raise ZetarisError(f"Non-JSON response from {path}") from error

    def login(self) -> None:
        reply = self._http(LOGIN_PATH, {"username": self._username, "password": self._password}, self.timeout_s, auth=False)
        token = None
        if isinstance(reply, dict):
            token = reply.get("idToken") or reply.get("token") or reply.get("accessToken")
        if not isinstance(token, str) or not token:
            raise ZetarisAuthError("Login succeeded but returned no idToken.")
        self._token = token

    def run(self, sql: str, limit: Optional[int] = None, timeout_s: Optional[float] = None,
            read_only: Optional[bool] = None, purpose: str = "") -> QueryResult:
        read_only = (self.identity == "agent") if read_only is None else read_only
        timeout_s = timeout_s or self.timeout_s
        limit = limit or self.limit
        query_id = query_log.new_query_id()
        started = time.monotonic()
        entry: Dict[str, Any] = {"query_id": query_id, "identity": self.identity, "purpose": purpose, "sql": sql}
        attempts, reauthed = 0, False
        try:
            text = prepare_sql(sql, read_only)
            entry["sql"] = text
            while True:
                attempts += 1
                try:
                    if self._token is None:
                        self.login()
                    payload = self._http(QUERY_PATH, {"sql": text, "limit": limit}, timeout_s)
                    break
                except ZetarisAuthError:
                    if reauthed:
                        raise
                    reauthed, self._token = True, None
                except ZetarisUnavailable:
                    if attempts > len(RETRY_BACKOFF_S):
                        raise
                    time.sleep(RETRY_BACKOFF_S[attempts - 1])
            # Confirmed shape on 2.4.3.1: {"headers": [...], "data": [[...]], "total": n, "timeUsed": ms}
            columns, rows = normalize_payload(payload)
            meta = {k: payload[k] for k in ("total", "timeUsed") if isinstance(payload, dict) and k in payload}
            total = meta.get("total")
            truncated = total > len(rows) if isinstance(total, int) else len(rows) >= limit
            result = QueryResult(query_id, text, columns, rows, int((time.monotonic() - started) * 1000),
                                 truncated=truncated, attempts=attempts, meta=meta)
            entry.update(status="ok", row_count=len(rows), row_ids=query_log.row_ids(rows)[:500],
                         truncated=result.truncated)
            return result
        except ZetarisError as error:
            entry.update(status=error.status, error=str(error))
            raise
        finally:
            entry.update(attempts=attempts, duration_ms=int((time.monotonic() - started) * 1000))
            query_log.record(entry)

    def health(self) -> Dict[str, Any]:
        """Quick SELECT 1, so platform outages get recorded apart from wrong answers."""
        try:
            result = self.run("SELECT 1", purpose="health", read_only=True, timeout_s=min(self.timeout_s, 15))
            return {"ok": True, "duration_ms": result.duration_ms, "query_id": result.query_id}
        except ZetarisError as error:
            return {"ok": False, "status": error.status, "error": str(error)}
