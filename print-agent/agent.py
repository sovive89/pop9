"""PØP9 Print Agent: Windows print spooler / ESC-POS TCP bridge.

Protocol:
 GET {api_url}/jobs?device_id=... -> {"jobs":[{"id":"uuid","sector":"cozinha","payload":"texto"}]}
 POST {api_url}/jobs/{id}/ack -> {"device_id":"...","status":"printed"|"failed","error":"..."}
All requests use Authorization: Bearer <device_token>. Backend MUST validate tenant,
device, routing, job ownership and idempotent ACKs. Jobs remain pending until ACK.
"""
import json
import logging
import os
from pathlib import Path
import socket
import sqlite3
import sys
import time
from urllib.parse import quote, urlencode, urlsplit
from urllib.request import Request, urlopen

APP_DIR = Path(os.environ.get("PROGRAMDATA", str(Path.home()))) / "POP9" / "PrintAgent"
CONFIG_FILE = APP_DIR / "config.json"
DB_FILE = APP_DIR / "printed.sqlite3"
LOG_FILE = APP_DIR / "agent.log"


def load_config():
    if not CONFIG_FILE.is_file():
        raise RuntimeError(f"Configure o arquivo {CONFIG_FILE}. Veja config.example.json")
    cfg = json.loads(CONFIG_FILE.read_text(encoding="utf-8"))
    u = urlsplit(cfg["api_url"])
    if u.scheme != "https" or not u.netloc or u.username or u.password:
        raise ValueError("api_url deve ser uma URL HTTPS valida.")
    if not cfg.get("device_token") or not cfg.get("device_id"):
        raise ValueError("device_token e device_id sao obrigatorios.")
    return cfg


def request_json(cfg, method, suffix, body=None):
    url = cfg["api_url"].rstrip("/") + suffix
    headers = {"Authorization": "Bearer " + cfg["device_token"], "Accept": "application/json"}
    data = None
    if body is not None:
        headers["Content-Type"] = "application/json"
        data = json.dumps(body, ensure_ascii=False).encode("utf-8")
    req = Request(url, data=data, headers=headers, method=method)
    with urlopen(req, timeout=15) as response:
        return json.loads(response.read(1024 * 1024).decode("utf-8"))


def send_to_printer(destination, content):
    if not isinstance(content, str) or len(content) > 30000:
        raise ValueError("payload precisa ser texto com ate 30 mil caracteres")
    kind = destination.get("type")
    if kind == "windows":
        import win32print
        name = destination["name"]
        handle = win32print.OpenPrinter(name)
        try:
            doc = win32print.StartDocPrinter(handle, 1, ("POP9 Comanda", None, "RAW"))
            try:
                win32print.StartPagePrinter(handle)
                # CP850 is widely supported on Brazilian ESC/POS printers.
                win32print.WritePrinter(handle, content.encode("cp850", errors="replace"))
                win32print.EndPagePrinter(handle)
            finally:
                win32print.EndDocPrinter(handle)
        finally:
            win32print.ClosePrinter(handle)
    elif kind == "tcp":
        host = destination["host"]
        port = int(destination.get("port", 9100))
        if not 1 <= port <= 65535:
            raise ValueError("porta invalida")
        with socket.create_connection((host, port), timeout=10) as sock:
            sock.sendall(content.encode("cp850", errors="replace"))
    else:
        raise ValueError("tipo de impressora nao suportado")


def run():
    APP_DIR.mkdir(parents=True, exist_ok=True)
    logging.basicConfig(filename=str(LOG_FILE), level=logging.INFO,
                        format="%(asctime)s %(levelname)s %(message)s")
    cfg = load_config()
    with sqlite3.connect(DB_FILE) as db:
        db.execute("CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, printed_at TEXT DEFAULT CURRENT_TIMESTAMP)")
        db.commit()
        while True:
            try:
                query = "?" + urlencode({"device_id": cfg["device_id"]})
                response = request_json(cfg, "GET", "/jobs" + query)
                jobs = response.get("jobs", [])
                if not isinstance(jobs, list):
                    raise ValueError("resposta invalida do servidor")
                for job in jobs[:50]:
                    job_id = str(job["id"])
                    if len(job_id) > 128 or not job_id:
                        continue
                    path = "/jobs/" + quote(job_id, safe="") + "/ack"
                    already_printed = db.execute("SELECT 1 FROM jobs WHERE id=?", (job_id,)).fetchone()
                    if not already_printed:
                        try:
                            destination = cfg["printers"][job["sector"]]
                            send_to_printer(destination, job["payload"])
                            db.execute("INSERT OR IGNORE INTO jobs(id) VALUES(?)", (job_id,))
                            db.commit()
                            logging.info("Spooler accepted job %s", job_id)
                        except Exception as exc:
                            logging.exception("Print failed %s", job_id)
                            request_json(cfg, "POST", path, {
                                "device_id": cfg["device_id"], "status": "failed", "error": str(exc)[:300]})
                            continue
                    request_json(cfg, "POST", path, {
                        "device_id": cfg["device_id"], "status": "printed"})
                time.sleep(max(1, min(60, int(cfg.get("poll_seconds", 3)))))
            except KeyboardInterrupt:
                break
            except Exception:
                logging.exception("Polling failed")
                time.sleep(10)


if __name__ == "__main__":
    try:
        run()
    except Exception as exc:
        print(f"POP9 Print Agent: {exc}", file=sys.stderr)
        sys.exit(1)
