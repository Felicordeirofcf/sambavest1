"""Motor do robô: gerencia posições, procura entradas e executa (simulado ou real).

Modo simulação (dry_run=True): nenhuma ordem é enviada; o preenchimento de
alvo/stop é verificado pelas velas de 1 minuto desde a última checagem.

Modo real (dry_run=False): compra a mercado e, imediatamente, registra uma
ordem OCO de venda (alvo LIMIT_MAKER + STOP_LOSS_LIMIT) na própria Binance.
Assim alvo e stop ficam protegidos mesmo que o robô caia.
"""
from __future__ import annotations

import json
import logging
import threading
import time
from collections import deque
from datetime import datetime, timezone
from pathlib import Path

from .binance_client import BinanceClient, SymbolRules
from .config import Config
from .scanner import closed_candles, liquid_symbols, scan
from .strategy import Signal, evaluate

log = logging.getLogger(__name__)


def now_ms() -> int:
    return int(time.time() * 1000)


def utc_day(ms: int) -> str:
    return datetime.fromtimestamp(ms / 1000, tz=timezone.utc).strftime("%Y-%m-%d")


class Bot:
    def __init__(self, cfg: Config, state_path: str | Path = "state.json"):
        self.cfg = cfg
        self.state_path = Path(state_path)
        self.lock = threading.RLock()
        self.stop_event = threading.Event()
        self.thread: threading.Thread | None = None
        self.logs: deque[dict] = deque(maxlen=300)
        self.last_scan: dict = {"at": None, "analyzed": 0, "signals": []}
        self._rules: dict[str, SymbolRules] = {}
        self._rules_at = 0
        self.client = self._make_client()
        self.state = self._load_state()

    # ------------------------------------------------------------ infra
    def _make_client(self) -> BinanceClient:
        return BinanceClient(self.cfg.api_key, self.cfg.api_secret, self.cfg.base_url)

    def reconfigure(self, values: dict) -> None:
        with self.lock:
            if values.get("dry_run") in (False, "false") and self.state["positions"]:
                if any(p["mode"] == "sim" for p in self.state["positions"]):
                    raise ValueError("Feche as posições simuladas antes de ativar o modo real.")
            old_url = self.cfg.base_url
            self.cfg.update(values)
            self.cfg.save_settings()
            if self.cfg.base_url != old_url:
                self.client = self._make_client()
                self._rules = {}
            if "sim_balance" in values and not any(p["mode"] == "sim" for p in self.state["positions"]):
                self.state["sim_cash"] = self.cfg.sim_balance
                self._save_state()
            self.info("Configuração atualizada")

    def _load_state(self) -> dict:
        if self.state_path.exists():
            st = json.loads(self.state_path.read_text())
        else:
            st = {}
        st.setdefault("positions", [])
        st.setdefault("history", [])
        st.setdefault("sim_cash", self.cfg.sim_balance)
        return st

    def _save_state(self) -> None:
        tmp = self.state_path.with_suffix(".tmp")
        tmp.write_text(json.dumps(self.state, indent=2))
        tmp.replace(self.state_path)

    def info(self, msg: str, level: str = "info") -> None:
        getattr(log, "warning" if level == "warn" else level)(msg)
        self.logs.appendleft({"at": now_ms(), "level": level, "msg": msg})

    def rules(self) -> dict[str, SymbolRules]:
        if not self._rules or time.time() - self._rules_at > 3600:
            self._rules = self.client.symbol_rules()
            self._rules_at = time.time()
        return self._rules

    # ------------------------------------------------------------ loop
    @property
    def running(self) -> bool:
        return bool(self.thread and self.thread.is_alive())

    def start(self) -> None:
        if self.running:
            return
        if not self.cfg.dry_run and not self.cfg.has_keys_ok():
            raise ValueError("Modo real exige BINANCE_API_KEY e BINANCE_API_SECRET no .env")
        self.stop_event.clear()
        self.thread = threading.Thread(target=self._loop, daemon=True)
        self.thread.start()
        self.info(f"Robô iniciado ({'SIMULAÇÃO' if self.cfg.dry_run else 'REAL'})")

    def stop(self) -> None:
        self.stop_event.set()
        self.info("Robô parado (ordens OCO já abertas na Binance continuam valendo)")

    def _loop(self) -> None:
        if not self.cfg.dry_run:
            try:
                self.client.sync_time()
            except Exception as exc:
                self.info(f"Falha ao sincronizar horário: {exc}", "warn")
        while not self.stop_event.is_set():
            try:
                self.tick()
            except Exception as exc:
                self.info(f"Erro no ciclo: {exc}", "error")
            self.stop_event.wait(self.cfg.scan_interval_sec)

    # ------------------------------------------------------------ ciclo
    def tick(self) -> None:
        with self.lock:
            self.manage_positions()
        signals = self.run_scan()
        with self.lock:
            if not self.cfg.auto_trade:
                return
            if self.daily_loss_blocked():
                self.info("Limite de perda diária atingido — sem novas entradas hoje", "warn")
                return
            held = {p["symbol"] for p in self.state["positions"]}
            for sig in signals:
                if len(self.state["positions"]) >= self.cfg.max_open_positions:
                    break
                if sig.symbol in held:
                    continue
                if self.open_position(sig):
                    held.add(sig.symbol)

    def run_scan(self) -> list[Signal]:
        symbols = self.cfg.whitelist or liquid_symbols(self.client, self.cfg, self.rules())
        signals, analyzed = scan(self.client, self.cfg, symbols)
        self.last_scan = {
            "at": now_ms(), "analyzed": analyzed,
            "signals": [{"symbol": s.symbol, "entry": s.entry, "take_profit": s.take_profit,
                         "stop": s.stop, "score": round(s.score, 1), "reasons": s.reasons} for s in signals],
        }
        self.info(f"Varredura: {analyzed} pares, {len(signals)} sinal(is)"
                  + (f" — melhor: {signals[0].symbol}" if signals else ""))
        return signals

    # ------------------------------------------------------------ risco
    def quote_available(self) -> float:
        if self.cfg.dry_run:
            return self.state["sim_cash"]
        return self.client.free_balance(self.cfg.quote_asset)

    def equity_estimate(self) -> float:
        open_cost = sum(p["quote_spent"] for p in self.state["positions"])
        return self.quote_available() + open_cost

    def daily_loss_blocked(self) -> bool:
        today = utc_day(now_ms())
        pnl = sum(t["pnl_quote"] for t in self.state["history"] if utc_day(t["exit_time"]) == today)
        equity = self.equity_estimate()
        return equity > 0 and pnl < 0 and abs(pnl) / equity * 100 >= self.cfg.daily_max_loss_pct

    def position_size(self, available: float) -> float:
        equity = self.equity_estimate()
        by_risk = equity * self.cfg.risk_per_trade_pct / self.cfg.stop_loss_pct
        return max(0.0, min(by_risk, self.cfg.max_position_quote, available * 0.98))

    # ------------------------------------------------------------ entrada
    def enter_symbol(self, symbol: str) -> bool:
        """Entrada manual pela interface: reavalia o sinal agora antes de comprar."""
        c1h = closed_candles(self.client.klines(symbol, "1h", 260))
        c15 = closed_candles(self.client.klines(symbol, "15m", 100))
        sig = evaluate(symbol, c1h, c15, self.cfg)
        if not sig:
            raise ValueError(f"{symbol} não tem mais sinal válido agora")
        with self.lock:
            if any(p["symbol"] == symbol for p in self.state["positions"]):
                raise ValueError(f"Já existe posição em {symbol}")
            if len(self.state["positions"]) >= self.cfg.max_open_positions:
                raise ValueError("Número máximo de posições abertas atingido")
            return self.open_position(sig)

    def open_position(self, sig: Signal) -> bool:
        rules = self.rules().get(sig.symbol)
        if not rules:
            self.info(f"{sig.symbol}: regras do par indisponíveis", "warn")
            return False
        size = self.position_size(self.quote_available())
        min_needed = float(rules.min_notional) * 1.15
        if size < min_needed:
            self.info(f"{sig.symbol}: tamanho {size:.2f} abaixo do mínimo {min_needed:.2f} — sem entrada", "warn")
            return False
        if self.cfg.dry_run:
            return self._open_sim(sig, rules, size)
        return self._open_live(sig, rules, size)

    def _open_sim(self, sig: Signal, rules: SymbolRules, size: float) -> bool:
        price = self.client.price(sig.symbol)
        fee = self.cfg.fee_pct / 100
        qty = float(rules.qty(size * (1 - fee) / price))
        pos = {
            "symbol": sig.symbol, "mode": "sim", "qty": qty, "entry": price,
            "take_profit": float(rules.price(self.cfg.take_profit_price(price))),
            "stop": float(rules.price(self.cfg.stop_price(price))),
            "quote_spent": size, "opened_at": now_ms(), "last_check": now_ms(),
            "score": round(sig.score, 1), "reasons": sig.reasons,
        }
        self.state["sim_cash"] -= size
        self.state["positions"].append(pos)
        self._save_state()
        self.info(f"[SIM] COMPRA {sig.symbol} {qty} @ {price:.8g} | alvo {pos['take_profit']} stop {pos['stop']}")
        return True

    def _open_live(self, sig: Signal, rules: SymbolRules, size: float) -> bool:
        order = self.client.market_buy_quote(sig.symbol, f"{size:.2f}")
        executed = float(order["executedQty"])
        if executed <= 0:
            self.info(f"{sig.symbol}: compra não executada ({order.get('status')})", "error")
            return False
        spent = float(order["cummulativeQuoteQty"])
        avg = spent / executed
        base_fee = sum(float(f["commission"]) for f in order.get("fills", []) if f["commissionAsset"] == rules.base_asset)
        free_base = self.client.free_balance(rules.base_asset)
        qty = rules.qty(min(executed - base_fee, free_base))
        tp = rules.price(self.cfg.take_profit_price(avg))
        stop = self.cfg.stop_price(avg)
        stop_trigger = rules.price(stop)
        stop_limit = rules.price(stop * 0.997)  # margem para a ordem stop executar em queda rápida
        pos = {
            "symbol": sig.symbol, "mode": "live", "qty": float(qty), "entry": avg,
            "take_profit": float(tp), "stop": float(stop_trigger), "quote_spent": spent,
            "opened_at": now_ms(), "buy_order_id": order["orderId"], "order_list_id": None,
            "score": round(sig.score, 1), "reasons": sig.reasons,
        }
        try:
            oco = self.client.oco_sell(sig.symbol, qty, tp, stop_trigger, stop_limit)
            pos["order_list_id"] = oco["orderListId"]
        except Exception as exc:
            self.info(f"{sig.symbol}: OCO falhou ({exc}) — vendendo a mercado por segurança", "error")
            sell = self.client.market_sell(sig.symbol, qty)
            self._record_close(pos, float(sell["cummulativeQuoteQty"]), "erro-oco")
            return False
        self.state["positions"].append(pos)
        self._save_state()
        self.info(f"[REAL] COMPRA {sig.symbol} {qty} @ {avg:.8g} | OCO alvo {tp} stop {stop_trigger}")
        return True

    # ------------------------------------------------------------ saída
    def manage_positions(self) -> None:
        for pos in list(self.state["positions"]):
            try:
                if pos["mode"] == "sim":
                    self._check_sim(pos)
                else:
                    self._check_live(pos)
            except Exception as exc:
                self.info(f"{pos['symbol']}: erro ao checar posição: {exc}", "error")

    def _expired(self, pos: dict) -> bool:
        return now_ms() - pos["opened_at"] >= self.cfg.max_hold_hours * 3_600_000

    def _check_sim(self, pos: dict) -> None:
        raw = self.client.klines(pos["symbol"], "1m", 1000, start_time=pos["last_check"])
        fee = self.cfg.fee_pct / 100
        for c in closed_candles(raw):
            if c.low <= pos["stop"]:
                return self._record_close(pos, pos["qty"] * pos["stop"] * (1 - fee), "stop")
            if c.high >= pos["take_profit"]:
                return self._record_close(pos, pos["qty"] * pos["take_profit"] * (1 - fee), "alvo")
            pos["last_check"] = c.close_time + 1
        if self._expired(pos):
            price = self.client.price(pos["symbol"])
            return self._record_close(pos, pos["qty"] * price * (1 - fee), "tempo")
        self._save_state()

    def _check_live(self, pos: dict) -> None:
        olist = self.client.order_list(pos["order_list_id"])
        if olist["listOrderStatus"] == "ALL_DONE":
            for o in olist["orders"]:
                od = self.client.get_order(pos["symbol"], o["orderId"])
                if od["status"] == "FILLED":
                    reason = "alvo" if od["type"] == "LIMIT_MAKER" else "stop"
                    fee = self.cfg.fee_pct / 100
                    return self._record_close(pos, float(od["cummulativeQuoteQty"]) * (1 - fee), reason)
            return self._record_close(pos, 0.0, "cancelada-fora-do-robo")
        if self._expired(pos):
            self.close_now(pos["symbol"], reason="tempo")

    def close_now(self, symbol: str, reason: str = "manual") -> None:
        with self.lock:
            pos = next((p for p in self.state["positions"] if p["symbol"] == symbol), None)
            if not pos:
                raise ValueError(f"Sem posição aberta em {symbol}")
            fee = self.cfg.fee_pct / 100
            if pos["mode"] == "sim":
                price = self.client.price(symbol)
                return self._record_close(pos, pos["qty"] * price * (1 - fee), reason)
            self.client.cancel_order_list(symbol, pos["order_list_id"])
            rules = self.rules()[symbol]
            qty = rules.qty(min(pos["qty"], self.client.free_balance(rules.base_asset)))
            sell = self.client.market_sell(symbol, qty)
            self._record_close(pos, float(sell["cummulativeQuoteQty"]) * (1 - fee), reason)

    def _record_close(self, pos: dict, quote_received: float, reason: str) -> None:
        pnl = quote_received - pos["quote_spent"]
        trade = {
            "symbol": pos["symbol"], "mode": pos["mode"], "entry": pos["entry"],
            "exit_price": quote_received / pos["qty"] if pos["qty"] else 0,
            "qty": pos["qty"], "quote_spent": pos["quote_spent"], "quote_received": quote_received,
            "pnl_quote": pnl, "pnl_pct": pnl / pos["quote_spent"] * 100 if pos["quote_spent"] else 0,
            "reason": reason, "entry_time": pos["opened_at"], "exit_time": now_ms(),
        }
        if pos["mode"] == "sim":
            self.state["sim_cash"] += quote_received
        self.state["positions"] = [p for p in self.state["positions"] if p is not pos]
        self.state["history"].insert(0, trade)
        self._save_state()
        emoji = "✅" if pnl > 0 else "❌"
        self.info(f"{emoji} [{pos['mode'].upper()}] VENDA {pos['symbol']} ({reason}) "
                  f"{trade['pnl_pct']:+.2f}% = {pnl:+.2f} {self.cfg.quote_asset}")

    # ------------------------------------------------------------ status
    def check_api_key(self) -> dict:
        out: dict = {"ok": False}
        self.client.sync_time()
        acct = self.client.account()
        out["can_trade"] = acct.get("canTrade")
        out["quote_free"] = self.client.free_balance(self.cfg.quote_asset)
        if "api.binance.com" in self.cfg.base_url:
            r = self.client.api_restrictions()
            out["withdrawals_enabled"] = r.get("enableWithdrawals")
            out["ip_restricted"] = r.get("ipRestrict")
            out["spot_enabled"] = r.get("enableSpotAndMarginTrading")
        out["ok"] = bool(out["can_trade"]) and not out.get("withdrawals_enabled", False)
        return out

    def status(self) -> dict:
        with self.lock:
            hist = self.state["history"]
            wins = [t for t in hist if t["pnl_quote"] > 0]
            return {
                "running": self.running,
                "config": self.cfg.public_dict(),
                "positions": self.state["positions"],
                "history": hist[:200],
                "sim_cash": self.state["sim_cash"],
                "stats": {
                    "trades": len(hist),
                    "win_rate": round(len(wins) / len(hist) * 100, 1) if hist else 0,
                    "pnl_quote": round(sum(t["pnl_quote"] for t in hist), 4),
                },
                "last_scan": self.last_scan,
                "logs": list(self.logs)[:100],
            }
