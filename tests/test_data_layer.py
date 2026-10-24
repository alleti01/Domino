"""Offline checks for data_layer against a mock Zetaris server. No Zetaris, Docker or network needed.

    python3 -I tests/test_data_layer.py
"""
import json, os, sys, threading, time, tempfile, pathlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
S = pathlib.Path(tempfile.mkdtemp(prefix="domino-test-"))
for _k in [k for k in os.environ if k.startswith(("ZETARIS_", "DOMINO_"))]:
    del os.environ[_k]
os.environ.update(DOMINO_DATA_MODE="fake", DOMINO_PRIVATE_DIR=str(S / "private"), DOMINO_QUERY_LOG=str(S / "qlog.jsonl"), ZETARIS_ORG_ID="1",
                  ZETARIS_AGENT_USERNAME="agent", ZETARIS_AGENT_PASSWORD="x",
                  ZETARIS_ADMIN_USERNAME="admin", ZETARIS_ADMIN_PASSWORD="x", ZETARIS_TIMEOUT_S="2")
state = {"fail_next": 0, "expire_next": False, "slow": False, "logins": 0, "queries": []}

class H(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def _send(self, code, body):
        data = json.dumps(body).encode(); self.send_response(code)
        self.send_header("Content-Type", "application/json"); self.send_header("Content-Length", str(len(data)))
        self.end_headers(); self.wfile.write(data)
    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        if self.path == "/api/auth/login":
            state["logins"] += 1; return self._send(200, {"idToken": f"tok{state['logins']}"})
        assert self.headers["X-Org-ID"] == "1" and len(self.headers["X-Request-ID"]) == 36
        if state["slow"]: time.sleep(3)
        if state["expire_next"]:
            state["expire_next"] = False; return self._send(401, {"error": "expired"})
        if state["fail_next"]:
            state["fail_next"] -= 1; return self._send(502, {"error": "bad gateway"})
        state["queries"].append(body["sql"])
        return self._send(200, {"data": {"columns": [{"name": "id"}, {"name": "source_system"}, {"name": "source_row_id"}],
                                          "rows": [["1", "grant_catalog", "gc-1"], ["2", "grant_catalog", "gc-2"]]}})

srv = ThreadingHTTPServer(("127.0.0.1", 0), H); threading.Thread(target=srv.serve_forever, daemon=True).start()
os.environ["ZETARIS_BASE_URL"] = f"http://127.0.0.1:{srv.server_port}"

from data_layer import zetaris_client as zc, lookups, experiments
from data_layer.zetaris_client import ZetarisClient, ZetarisError, normalize_payload, prepare_sql
checks = []
def check(name, cond): checks.append((name, bool(cond))); print(("PASS " if cond else "FAIL ") + name)

# SQL guard
check("strips trailing semicolons", prepare_sql("SELECT 1 ;; ", True) == "SELECT 1")
for bad in ("DROP TABLE x", "COMPILE USL y", "SELECT 1; DROP TABLE x"):
    try: prepare_sql(bad, True); check(f"refuses {bad!r}", False)
    except ZetarisError: check(f"refuses {bad!r}", True)
check("admin may send DDL", prepare_sql("COMPILE USL a DDL CREATE TABLE t (x int); CREATE TABLE u (y int);", False).startswith("COMPILE"))
# Response shapes
check("shape: list of dicts", normalize_payload({"data": [{"a": "1"}]}) == (["a"], [{"a": "1"}]))
check("shape: rows + columns", normalize_payload({"columns": ["a", "b"], "data": [["1", "2"]]}) == (["a", "b"], [{"a": "1", "b": "2"}]))
check("shape: bare rows", normalize_payload({"data": [["1"]]})[0] == ["c0"])
try: normalize_payload({"weird": 1}); check("shape: unknown raises", False)
except ZetarisError: check("shape: unknown raises", True)

zc.RETRY_BACKOFF_S = (0.05, 0.05)
c = ZetarisClient("agent")
r = c.run("SELECT id, source_system, source_row_id FROM t;", purpose="test")
check("query ok, rows as dicts", r.rows[0] == {"id": "1", "source_system": "grant_catalog", "source_row_id": "gc-1"})
check("trailing semicolon not sent", state["queries"][-1].endswith("FROM t"))
state["fail_next"] = 2; r = c.run("SELECT 1"); check("retries 502 twice then succeeds", r.attempts == 3)
state["fail_next"] = 3
try: c.run("SELECT 1"); check("gives up after 2 retries", False)
except zc.ZetarisUnavailable: check("gives up after 2 retries (unavailable)", True)
state["expire_next"] = True; before = state["logins"]; c.run("SELECT 1"); check("re-logs in once on 401", state["logins"] == before + 1)
state["slow"] = True; t0 = time.monotonic()
try: c.run("SELECT 1", timeout_s=1); check("timeout raised", False)
except zc.ZetarisTimeout: check(f"timeout raised in {time.monotonic()-t0:.1f}s", time.monotonic() - t0 < 2)
state["slow"] = False
check("health ok", c.health()["ok"])

# Query log
lines = [json.loads(l) for l in (S / "qlog.jsonl").read_text().splitlines()]
first = lines[0]
check("log has sql, row_ids, status, duration", first["row_ids"] == ["grant_catalog:gc-1", "grant_catalog:gc-2"] and first["status"] == "ok" and "duration_ms" in first)
check("log records unavailable + timeout outcomes", {"unavailable", "timeout"} <= {l["status"] for l in lines})
check("no password in log", "\"x\"" not in (S / "qlog.jsonl").read_text())

# Lookup modes
os.environ["DOMINO_DATA_MODE"] = "live"; lookups._agent = None
res = lookups.lookup("SELECT id, source_system, source_row_id FROM t")
check("live lookup contract fields", res["status"] == "ok" and res["mode"] == "live" and res["row_ids"][0] == "grant_catalog:gc-1")
check("live lookup refusal is a status, not an exception", lookups.lookup("DELETE FROM t")["status"] == "error")
os.environ["DOMINO_DATA_MODE"] = "sample"; lookups.SNAPSHOT_DIR = S / "snaps"
check("sample miss -> not_in_sample", lookups.lookup("SELECT 1")["status"] == "not_in_sample")
os.environ.update(DOMINO_DATA_MODE="live", DOMINO_SNAPSHOT_WRITE="1"); lookups.lookup("SELECT  id, source_system, source_row_id FROM t")
os.environ["DOMINO_DATA_MODE"] = "sample"; hit = lookups.lookup("SELECT id, source_system,\n source_row_id FROM t;")
check("sample replays live snapshot (whitespace-insensitive)", hit["status"] == "ok" and hit["mode"] == "sample")
os.environ["DOMINO_DATA_MODE"] = "fake"
check("fake lookup", lookups.lookup("SELECT 1")["mode"] == "fake")
check("fake path", lookups.dependency_path("x")["mode"] == "fake")

# Experiments with a throwaway engine + case
wd = S / "worlds"; (wd / "engines" / "t").mkdir(parents=True, exist_ok=True); (wd / "cases").mkdir(exist_ok=True)
(wd / "cases" / "w-test.json").write_text(json.dumps({"engine": "t", "describe": {"components": ["a", "b"]}, "setup": {"cap": 200}}))
(wd / "engines" / "t" / "run.py").write_text(
"import argparse, json, hashlib, time\np=argparse.ArgumentParser();p.add_argument('--case');p.add_argument('--variant');p.add_argument('--params')\na=p.parse_args()\n"
"if json.loads(a.params): print(json.dumps({'error':'unsupported params'})); raise SystemExit\n"
"if a.variant=='control': time.sleep(5)\nn=280 if a.variant=='candidate' else 140\nok=n<=json.load(open(a.case))['setup']['cap']\n"
"print(json.dumps({'passed':ok,'assertions':[{'name':'b_accepts_input','passed':ok}],'metrics':{'a.entries':n},'artifacts':[],'logs':['ran'],'input_sha256':hashlib.sha256(a.variant.encode()).hexdigest()}))\n")
experiments.WORLDS_DIR = wd
check("list_worlds", experiments.list_worlds() == ["w-test"])
check("describe hides setup", "setup" not in experiments.describe_world("w-test") and experiments.describe_world("w-test")["components"] == ["a", "b"])
b = experiments.run_experiment("w-test", "baseline"); cnd = experiments.run_experiment("w-test", "candidate")
check("baseline passes / candidate fails", b["passed"] is True and cnd["passed"] is False and cnd["status"] == "ok")
check("deterministic input hash", experiments.run_experiment("w-test", "candidate")["reproduce"]["input_sha256"] == cnd["reproduce"]["input_sha256"])
check("world timeout", experiments.run_experiment("w-test", "control", timeout_s=1)["status"] == "timeout")
check("engine error -> status error", experiments.run_experiment("w-test", "baseline", {"x": 1})["status"] == "error")
check("bad variant", experiments.run_experiment("w-test", "prod")["status"] == "error")
os.environ["DOMINO_DATA_MODE"] = "sample"; check("path traversal rejected", experiments.run_experiment("../etc", "baseline")["status"] == "error" and experiments._case_path("../etc") is None)
check("unknown world outside fake mode", (os.environ.__setitem__("DOMINO_DATA_MODE", "sample") or experiments.run_experiment("nope", "baseline"))["status"] == "error")

# dependency_path walk (offline, over a fixed edge list)
E = lambda f, t, rel, st="observed", ev="a:1;b:2": {"from_id": f, "from_type": f.split("/")[1], "to_id": t, "to_type": t.split("/")[1],
                                                      "relation": rel, "edge_status": st, "evidence": ev, "detail": ""}
edges = [E("s/change/1", "s/principal/p", "grants_to"), E("s/principal/p", "s/service/b", "identity_of"),
         E("s/service/b", "s/artifact/x", "writes"), E("s/artifact/x", "s/service/r", "loaded_by"),
         E("s/service/r", "s/service/b", "calls"),  # cycle back
         E("s/change/1", "s/database/?", "grants_on", "unresolved", "a:9"), E("s/other/z", "s/other/y", "x")]
w = lookups._walk("s/change/1", edges, "q-1", 6)
ends = sorted(p["hops"][-1]["to"] for p in w["paths"])
check("walk follows chain and stops at cycle", ends == ["s/database/?", "s/service/r"])
check("walk reports unresolved edge", [u["to"] for u in w["unresolved"]] == ["s/database/?"])
check("walk evidence parsed with query id", w["paths"][-1]["hops"][0]["evidence"][0] == {"source_system": "a", "source_row_id": "1", "query_id": "q-1"})
check("two-source rule flagged per path", all(p["meets_two_source_rule"] for p in w["paths"] if len(p["source_systems"]) >= 2) and
      not [p for p in w["paths"] if p["hops"][-1]["to"] == "s/database/?"][0]["meets_two_source_rule"])
check("walk respects max_hops", max(len(p["hops"]) for p in lookups._walk("s/change/1", edges, "q", 2)["paths"]) == 2)
dup = edges + [E("s/change/1", "s/principal/p", "grants_to", "observed", "a:7")]
wd = lookups._walk("s/change/1", dup, "q", 6)
check("parallel edges merged, evidence combined", len(wd["paths"]) == len(w["paths"]) and
      {ev["source_row_id"] for p in wd["paths"] for h in p["hops"] if h["relation"] == "grants_to" for ev in h["evidence"]} == {"1", "2", "7"})
check("walk marks an unknown start", lookups._walk("s/change/404", edges, "q", 6)["start"]["entity_type"] is None)
os.environ["DOMINO_DATA_MODE"] = "live"
check("dependency_path rejects unsafe entity id", lookups.dependency_path("x'; DROP TABLE t")["status"] == "error")

# Private folder: held-out worlds run but stay out of the repo; their snapshots are saved privately
pw = S / "private" / "worlds"; (pw / "cases").mkdir(parents=True, exist_ok=True)
(pw / "cases" / "w-priv.json").write_text(json.dumps({"engine": "t", "describe": {"components": ["c"]}, "setup": {"cap": 500}}))
check("private world listed", "w-priv" in experiments.list_worlds())
check("private world runs with the repo engine", experiments.run_experiment("w-priv", "candidate")["passed"] is True)
os.environ.update(DOMINO_DATA_MODE="live", DOMINO_SNAPSHOT_WRITE="1"); lookups._agent = None
lookups.SNAPSHOT_DIR = S / "snaps2"
lookups._save_snapshot("lookup", {"sql": "x", "limit": None}, {"status": "ok", "rows": [{"system_id": "w-priv"}]})
lookups._save_snapshot("lookup", {"sql": "y"}, {"status": "ok", "rows": [{"system_id": "w-public"}]})
check("held-out snapshot saved privately", any((S / "private" / "zetaris" / "snapshots").rglob("*.json")) and
      len(list((S / "snaps2").rglob("*.json"))) == 1)
os.environ["DOMINO_DATA_MODE"] = "sample"
check("sample mode reads private snapshots", lookups.lookup("x")["status"] == "ok")

# Contract: fake samples match real output shapes, and every result of a call has the same fields
import subprocess
chk = subprocess.run([sys.executable, "-I", str(pathlib.Path(__file__).resolve().parents[1] / "contracts" / "make_samples.py"), "--check"],
                     capture_output=True, text=True, timeout=120, env={**os.environ, "DOMINO_DATA_MODE": "fake"})
check("fake samples match real output shapes", chk.returncode == 0)
samples = [json.loads(p.read_text()) for p in (pathlib.Path(__file__).resolve().parents[1] / "contracts" / "samples").glob("*.json")]
by_call = {}
for smp in samples:
    by_call.setdefault(smp["call"], []).append(set(smp) - {"_note"})
check("same fields for every status of a call", all(len({frozenset(k) for k in v}) == 1 for v in by_call.values()))

# list_tables, row-id source inference, dq_issues (contract v0.3 additions)
from data_layer import query_log as ql
tb = lookups.list_tables()
names = {t["short_name"]: t for t in tb["tables"]}
check("list_tables ok with system_id column", tb["status"] == "ok" and tb["system_column"] == "system_id")
check("list_tables gives full names and columns", names["dependency_edge"]["name"] == "lightning.metastore.domino.systems.dependency_edge"
      and all(any(c["name"] == "system_id" for c in t["columns"]) for t in tb["tables"]))
check("row ids infer source from prefix", ql.row_ids([{"source_row_id": "jd-0005"}, {"source_row_id": "zz-1"}]) ==
      ["pipeline_repo:jd-0005", "unknown:zz-1"])
lookups.SNAPSHOT_DIR = S / "snaps3"; (S / "snaps3").mkdir(exist_ok=True)
(S / "snaps3" / "dq_report.json").write_text(json.dumps({"generated_at": "t", "rules": [
    {"rule": "principal_id", "table": "job", "type": "Foreign key constraints",
     "invalid_records": [{"system_id": "s1", "principal_id": "s1/principal/ghost", "source_row_id": "jd-0009"},
                         {"system_id": "s2", "principal_id": "s2/principal/x", "source_row_id": "jd-0010"}]},
    {"rule": "resolved_link", "table": "dependency_edge", "type": "Custom Data Quality",
     "invalid_records": [{"system_id": "s1", "relation": "grants_to", "from_id": "a", "to_id": "b", "evidence": "change_records:cr-0001"}]}]}))
iss = lookups.dq_issues("s1")
check("dq_issues filtered to the system with row ids", [i["row_id"] for i in iss] == ["pipeline_repo:jd-0009", "change_records:cr-0001"]
      and "no matching record" in iss[0]["detail"] and "points at nothing" in iss[1]["detail"])
check("dq_issues empty without a report", lookups.dq_issues("nobody") == [])
srv.shutdown()
failed = [n for n, ok in checks if not ok]
print(f"\n{len(checks) - len(failed)}/{len(checks)} checks passed"); sys.exit(1 if failed else 0)
