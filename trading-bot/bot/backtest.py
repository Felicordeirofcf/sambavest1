"""Backtest da estratégia em dados históricos de velas.

Premissas conservadoras:
  - entra na ABERTURA da vela seguinte ao sinal;
  - se alvo e stop cabem na mesma vela, assume que o STOP veio primeiro;
  - taxa cobrada na compra e na venda;
  - fechamento por tempo (max_hold_hours) no close da vela.
"""
from __future__ import annotations

import bisect
from dataclasses import asdict, dataclass

from .binance_client import BinanceClient
from .config import Config
from .strategy import MIN_1H, MIN_15M, Candle, evaluate

MS_15M = 15 * 60 * 1000


@dataclass
class Trade:
    symbol: str
    entry_time: int
    exit_time: int
    entry: float
    exit: float
    reason: str
    net_pct: float


def fetch_history(client: BinanceClient, symbol: str, interval: str, start_ms: int, end_ms: int) -> list[Candle]:
    out: list[Candle] = []
    cursor = start_ms
    while cursor < end_ms:
        raw = client.klines(symbol, interval, 1000, start_time=cursor, end_time=end_ms)
        if not raw:
            break
        out.extend(Candle.from_binance(k) for k in raw)
        cursor = int(raw[-1][6]) + 1
        if len(raw) < 1000:
            break
    return out


def simulate(symbol: str, c1h: list[Candle], c15: list[Candle], cfg: Config) -> list[Trade]:
    fee = cfg.fee_pct / 100
    max_bars = int(cfg.max_hold_hours * 4)
    h_close_times = [c.close_time for c in c1h]
    trades: list[Trade] = []
    i = MIN_15M
    while i < len(c15) - 1:
        t = c15[i].close_time
        h_idx = bisect.bisect_right(h_close_times, t)
        if h_idx < MIN_1H:
            i += 1
            continue
        sig = evaluate(symbol, c1h[max(0, h_idx - 260):h_idx], c15[max(0, i - 99):i + 1], cfg)
        if not sig:
            i += 1
            continue
        entry_bar = c15[i + 1]
        entry = entry_bar.open
        tp, stop = cfg.take_profit_price(entry), cfg.stop_price(entry)
        exit_price, reason, j = None, "", i + 1
        last = min(len(c15) - 1, i + 1 + max_bars)
        while j <= last:
            bar = c15[j]
            if bar.low <= stop:
                exit_price, reason = stop, "stop"
                break
            if bar.high >= tp:
                exit_price, reason = tp, "alvo"
                break
            j += 1
        if exit_price is None:
            j = last
            exit_price, reason = c15[j].close, "tempo"
        net = (exit_price * (1 - fee)) / (entry * (1 + fee)) - 1
        trades.append(Trade(symbol, entry_bar.open_time, c15[j].close_time, entry, exit_price, reason, net * 100))
        i = j + 1  # uma posição por vez por par
    return trades


def summarize(trades: list[Trade]) -> dict:
    if not trades:
        return {"trades": 0, "win_rate": 0, "total_pct": 0, "avg_pct": 0, "profit_factor": 0, "max_drawdown_pct": 0}
    wins = [t.net_pct for t in trades if t.net_pct > 0]
    losses = [t.net_pct for t in trades if t.net_pct <= 0]
    equity, peak, mdd = 1.0, 1.0, 0.0
    for t in sorted(trades, key=lambda x: x.entry_time):
        equity *= 1 + t.net_pct / 100
        peak = max(peak, equity)
        mdd = max(mdd, (peak - equity) / peak)
    return {
        "trades": len(trades),
        "win_rate": round(len(wins) / len(trades) * 100, 1),
        "total_pct": round((equity - 1) * 100, 2),
        "avg_pct": round(sum(t.net_pct for t in trades) / len(trades), 3),
        "profit_factor": round(sum(wins) / abs(sum(losses)), 2) if losses and sum(losses) else None,
        "max_drawdown_pct": round(mdd * 100, 2),
        "by_reason": {r: sum(1 for t in trades if t.reason == r) for r in ("alvo", "stop", "tempo")},
    }


def run_backtest(client: BinanceClient, cfg: Config, symbols: list[str], days: int, now_ms: int) -> dict:
    start = now_ms - days * 86_400_000
    warmup = 260 * 3_600_000
    all_trades: list[Trade] = []
    per_symbol = {}
    for sym in symbols:
        c1h = fetch_history(client, sym, "1h", start - warmup, now_ms)
        c15 = fetch_history(client, sym, "15m", start - 100 * MS_15M, now_ms)
        trades = simulate(sym, c1h, c15, cfg)
        per_symbol[sym] = summarize(trades)
        all_trades.extend(trades)
    return {
        "summary": summarize(all_trades),
        "per_symbol": per_symbol,
        "trades": [asdict(t) for t in sorted(all_trades, key=lambda x: x.entry_time)],
    }
