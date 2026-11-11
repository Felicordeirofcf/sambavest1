"""Painel web local (somente biblioteca padrão).

Segurança:
  - escuta apenas em 127.0.0.1 por padrão;
  - toda ação (POST) exige o token gerado na inicialização, enviado no
    cabeçalho X-Bot-Token com Content-Type JSON — páginas de outros sites
    não conseguem disparar ordens pelo seu navegador;
  - o cabeçalho Host é validado (proteção contra DNS rebinding);
  - o segredo da API nunca é enviado para o navegador.
"""
from __future__ import annotations

import json
import logging
import secrets
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from .backtest import run_backtest
from .trader import Bot

STATIC = Path(__file__).parent / "static"
log = logging.getLogger(__name__)


class Jobs:
    """Executa tarefas demoradas (varredura, backtest) em segundo plano."""

    def __init__(self):
        self.lock = threading.Lock()
        self.data: dict[str, dict] = {}

    def run(self, name: str, fn) -> bool:
        with self.lock:
            if self.data.get(name, {}).get("status") == "running":
                return False
            self.data[name] = {"status": "running", "started": time.time()}

        def _target():
            try:
                result = fn()
                self.data[name] = {"status": "done", "result": result, "finished": time.time()}
            except Exception as exc:
                log.exception("job %s falhou", name)
                self.data[name] = {"status": "error", "error": str(exc), "finished": time.time()}

        threading.Thread(target=_target, daemon=True).start()
        return True


def make_handler(bot: Bot, token: str, allowed_hosts: set[str]):
    jobs = Jobs()

    class Handler(BaseHTTPRequestHandler):
        server_version = "SpotBot/1.0"

        def log_message(self, fmt, *args):  # silencia log de cada requisição
            pass

        def _json(self, code: int, payload) -> None:
            body = json.dumps(payload, default=str).encode()
            self.send_response(code)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def _host_ok(self) -> bool:
            return self.headers.get("Host", "") in allowed_hosts

        def do_GET(self):
            if not self._host_ok():
                return self._json(403, {"error": "host não permitido"})
            if self.path in ("/", "/index.html"):
                html = (STATIC / "index.html").read_text(encoding="utf-8").replace("__BOT_TOKEN__", token)
                body = html.encode()
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.send_header("Content-Security-Policy",
                                 "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'")
                self.send_header("X-Frame-Options", "DENY")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
            elif self.path == "/api/status":
                st = bot.status()
                st["jobs"] = {k: {kk: vv for kk, vv in v.items() if kk != "result"} for k, v in jobs.data.items()}
                self._json(200, st)
            elif self.path.startswith("/api/job/"):
                self._json(200, jobs.data.get(self.path.rsplit("/", 1)[-1], {"status": "none"}))
            else:
                self._json(404, {"error": "não encontrado"})

        def do_POST(self):
            if not self._host_ok():
                return self._json(403, {"error": "host não permitido"})
            if not secrets.compare_digest(self.headers.get("X-Bot-Token", ""), token):
                return self._json(403, {"error": "token inválido — recarregue a página"})
            if not self.headers.get("Content-Type", "").startswith("application/json"):
                return self._json(415, {"error": "use JSON"})
            length = min(int(self.headers.get("Content-Length", 0)), 100_000)
            try:
                body = json.loads(self.rfile.read(length) or b"{}")
            except ValueError:
                return self._json(400, {"error": "JSON inválido"})
            try:
                self._json(200, self.route(self.path, body))
            except ValueError as exc:
                self._json(400, {"error": str(exc)})
            except Exception as exc:
                log.exception("erro em %s", self.path)
                self._json(500, {"error": str(exc)})

        def route(self, path: str, body: dict):
            if path == "/api/config":
                bot.reconfigure(body)
                return {"ok": True, "config": bot.cfg.public_dict()}
            if path == "/api/start":
                bot.start()
                return {"ok": True}
            if path == "/api/stop":
                bot.stop()
                return {"ok": True}
            if path == "/api/scan":
                def _scan():
                    bot.run_scan()
                    return bot.last_scan
                started = jobs.run("scan", _scan)
                return {"ok": True, "started": started}
            if path == "/api/backtest":
                symbols = [s.strip().upper() for s in str(body.get("symbols", "")).split(",") if s.strip()]
                days = max(1, min(int(body.get("days", 30)), 365))
                if not symbols or len(symbols) > 15:
                    raise ValueError("Informe de 1 a 15 pares, ex.: BTCUSDT,ETHUSDT")
                started = jobs.run("backtest", lambda: run_backtest(
                    bot.client, bot.cfg, symbols, days, int(time.time() * 1000)))
                return {"ok": True, "started": started}
            if path == "/api/enter":
                return {"ok": bot.enter_symbol(str(body["symbol"]).upper())}
            if path == "/api/close":
                bot.close_now(str(body["symbol"]).upper())
                return {"ok": True}
            if path == "/api/check-key":
                return bot.check_api_key()
            raise ValueError("rota desconhecida")

    return Handler


def serve(bot: Bot, host: str = "127.0.0.1", port: int = 8765) -> None:
    token = secrets.token_urlsafe(24)
    allowed = {f"{host}:{port}", f"localhost:{port}", f"127.0.0.1:{port}"}
    httpd = ThreadingHTTPServer((host, port), make_handler(bot, token, allowed))
    print(f"\n  Painel do robô: http://127.0.0.1:{port}\n  (Ctrl+C para encerrar)\n")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        bot.stop_event.set()
        httpd.server_close()
