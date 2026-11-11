import json
import math
import os
import sys
import tempfile
import threading
import unittest
import urllib.request
from decimal import Decimal
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from bot.backtest import simulate, summarize  # noqa: E402
from bot.binance_client import SymbolRules  # noqa: E402
from bot.config import Config  # noqa: E402
from bot.indicators import atr, ema, rsi, sma  # noqa: E402
from bot.strategy import Candle, evaluate  # noqa: E402
from bot.trader import Bot  # noqa: E402

H = 3_600_000
M15 = 900_000


def make_candles(closes, step_ms, start=0, wick=0.002):
    out, prev = [], closes[0]
    for i, c in enumerate(closes):
        o = prev
        out.append(Candle(start + i * step_ms, o, max(o, c) * (1 + wick), min(o, c) * (1 - wick), c, 100.0,
                          start + (i + 1) * step_ms - 1))
        prev = c
    return out


def uptrend_with_pullback():
    """1h: alta firme com oscilação; 15m: queda curta seguida de vela de alta."""
    c1h = [100 * (1.0015 ** i) * (1 + 0.012 * math.sin(i / 3)) for i in range(260)]
    hours = make_candles(c1h, H)
    last = c1h[-1]
    c15 = [last * (1 + 0.0005 * math.sin(i)) for i in range(80)]
    c15 += [c15[-1] * (0.996 ** k) for k in range(1, 15)]   # recuo
    c15 += [c15[-1] * 1.004]                                # gatilho de alta
    start15 = hours[-1].close_time + 1 - len(c15) * M15
    return hours, make_candles(c15, M15, start=start15, wick=0.0005)


class IndicatorTests(unittest.TestCase):
    def test_sma_ema(self):
        self.assertEqual(sma([1, 2, 3, 4], 2)[1:], [1.5, 2.5, 3.5])
        e = ema([1.0] * 30, 10)
        self.assertAlmostEqual(e[-1], 1.0)

    def test_rsi_extremes(self):
        self.assertEqual(rsi(list(range(1, 40)), 14)[-1], 100.0)
        self.assertLess(rsi(list(range(40, 1, -1)), 14)[-1], 1)

    def test_atr_positive(self):
        c = make_candles([100 + i for i in range(30)], H)
        a = atr([x.high for x in c], [x.low for x in c], [x.close for x in c], 14)
        self.assertGreater(a[-1], 0)


class ConfigTests(unittest.TestCase):
    def test_take_profit_is_net_of_fees(self):
        cfg = Config(take_profit_pct=2.0, fee_pct=0.1)
        tp = cfg.take_profit_price(100)
        net = tp * (1 - 0.001) / (100 * (1 + 0.001)) - 1
        self.assertAlmostEqual(net, 0.02, places=9)

    def test_update_is_atomic(self):
        cfg = Config()
        with self.assertRaises(ValueError):
            cfg.update({"take_profit_pct": 3, "stop_loss_pct": 99})
        self.assertEqual(cfg.take_profit_pct, 2.0)
        cfg.update({"take_profit_pct": "2.5", "auto_trade": "false", "api_secret": "hack"})
        self.assertEqual(cfg.take_profit_pct, 2.5)
        self.assertFalse(cfg.auto_trade)
        self.assertEqual(cfg.api_secret, "")

    def test_public_dict_hides_secret(self):
        d = Config(api_key="ABCDEFGHIJKL", api_secret="supersecret").public_dict()
        self.assertNotIn("api_secret", d)
        self.assertNotIn("api_key", d)
        self.assertTrue(d["has_keys"])


class RulesTests(unittest.TestCase):
    def test_rounding_floors(self):
        r = SymbolRules("X", "X", "USDT", Decimal("0.01"), Decimal("0.001"), Decimal("0.001"), Decimal("5"))
        self.assertEqual(r.price(123.456), "123.45")
        self.assertEqual(r.qty(0.12399), "0.123")


class StrategyTests(unittest.TestCase):
    def test_signal_on_pullback_in_uptrend(self):
        h, m = uptrend_with_pullback()
        sig = evaluate("TESTUSDT", h, m, Config())
        self.assertIsNotNone(sig)
        self.assertGreater(sig.take_profit, sig.entry)
        self.assertLess(sig.stop, sig.entry)

    def test_no_signal_in_downtrend(self):
        h = make_candles([100 * (0.998 ** i) for i in range(260)], H)
        _, m = uptrend_with_pullback()
        self.assertIsNone(evaluate("TESTUSDT", h, m, Config()))

    def test_backtest_runs(self):
        closes = [100 * (1.0004 ** i) * (1 + 0.01 * math.sin(i / 7)) for i in range(4 * 24 * 40)]
        m = make_candles(closes, M15)
        hourly = [closes[i] for i in range(3, len(closes), 4)]
        h = make_candles(hourly, H)
        trades = simulate("TESTUSDT", h, m, Config())
        s = summarize(trades)
        self.assertEqual(s["trades"], len(trades))
        for t in trades:
            self.assertIn(t.reason, ("alvo", "stop", "tempo"))
        json.dumps(s)  # precisa ser serializável


class FakeClient:
    """Imita a Binance para testar o motor em modo simulação."""

    def __init__(self):
        self.h, self.m = uptrend_with_pullback()
        self.px = self.m[-1].close

    def symbol_rules(self):
        return {"TESTUSDT": SymbolRules("TESTUSDT", "TEST", "USDT", Decimal("0.0001"),
                                        Decimal("0.0001"), Decimal("0.0001"), Decimal("5"))}

    def ticker_24h(self):
        return [{"symbol": "TESTUSDT", "quoteVolume": "1e9"}]

    def klines(self, symbol, interval, limit=500, start_time=None, end_time=None):
        src = {"1h": self.h, "15m": self.m}.get(interval)
        if src is None:  # 1m: uma vela que bate o alvo
            return [[0, self.px, self.px * 1.05, self.px, self.px * 1.05, 1, 1]]
        return [[c.open_time, c.open, c.high, c.low, c.close, c.volume, 1] for c in src]

    def price(self, symbol):
        return self.px


class BotSimTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        os.chdir(self.tmp.name)
        self.bot = Bot(Config(), state_path=Path(self.tmp.name) / "state.json")
        self.bot.client = FakeClient()

    def tearDown(self):
        self.tmp.cleanup()

    def test_full_cycle_sim(self):
        self.bot.tick()
        self.assertEqual(len(self.bot.state["positions"]), 1)
        pos = self.bot.state["positions"][0]
        # risco: 1000 * 1% / 1.5% = 666,67 -> limitado pelo teto de 100 por operação
        self.assertAlmostEqual(pos["quote_spent"], 100.0, places=2)
        self.assertAlmostEqual(self.bot.state["sim_cash"], 900.0, places=2)
        self.bot.manage_positions()
        self.assertEqual(self.bot.state["positions"], [])
        trade = self.bot.state["history"][0]
        self.assertEqual(trade["reason"], "alvo")
        self.assertAlmostEqual(trade["pnl_pct"], 2.0, delta=0.05)

    def test_auto_trade_off_only_signals(self):
        self.bot.cfg.auto_trade = False
        self.bot.tick()
        self.assertEqual(self.bot.state["positions"], [])
        self.assertEqual(len(self.bot.last_scan["signals"]), 1)

    def test_web_requires_token(self):
        from http.server import ThreadingHTTPServer

        from bot.web import make_handler
        httpd = ThreadingHTTPServer(("127.0.0.1", 0), None)
        port = httpd.server_address[1]
        httpd.RequestHandlerClass = make_handler(self.bot, "tok", {f"127.0.0.1:{port}"})
        threading.Thread(target=httpd.serve_forever, daemon=True).start()
        base = f"http://127.0.0.1:{port}"
        try:
            html = urllib.request.urlopen(base + "/").read().decode()
            self.assertIn('const TOKEN = "tok"', html)
            st = json.loads(urllib.request.urlopen(base + "/api/status").read())
            self.assertNotIn("api_secret", json.dumps(st))

            def post(path, body, token):
                req = urllib.request.Request(base + path, data=json.dumps(body).encode(), method="POST",
                                             headers={"Content-Type": "application/json", "X-Bot-Token": token})
                try:
                    return urllib.request.urlopen(req).status
                except urllib.error.HTTPError as e:
                    return e.code

            self.assertEqual(post("/api/config", {"take_profit_pct": 3}, "wrong"), 403)
            self.assertEqual(post("/api/config", {"take_profit_pct": 3}, "tok"), 200)
            self.assertEqual(self.bot.cfg.take_profit_pct, 3.0)
            self.assertEqual(post("/api/config", {"take_profit_pct": 300}, "tok"), 400)
        finally:
            httpd.shutdown()
            httpd.server_close()


if __name__ == "__main__":
    unittest.main()
