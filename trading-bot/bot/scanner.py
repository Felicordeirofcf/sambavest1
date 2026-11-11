"""Varre os pares mais líquidos e ranqueia oportunidades de entrada."""
from __future__ import annotations

import logging
import time

from .binance_client import BinanceClient
from .config import Config
from .strategy import Candle, Signal, evaluate

log = logging.getLogger(__name__)

# Bases que não fazem sentido operar contra USDT (stablecoins / fiat / tokens alavancados)
EXCLUDED_BASES = {
    "USDC", "FDUSD", "TUSD", "BUSD", "DAI", "USDP", "USDD", "PYUSD", "USDE", "USD1", "EUR", "EURI",
    "GBP", "TRY", "BRL", "AEUR", "UST", "PAXG", "WBTC", "WBETH", "BFUSD", "XUSD", "RLUSD",
}
LEVERAGED_SUFFIXES = ("UP", "DOWN", "BULL", "BEAR")


def closed_candles(raw: list[list], now_ms: int | None = None) -> list[Candle]:
    now_ms = now_ms or int(time.time() * 1000)
    return [Candle.from_binance(k) for k in raw if int(k[6]) < now_ms]


def liquid_symbols(client: BinanceClient, cfg: Config, rules: dict | None = None) -> list[str]:
    rules = rules or client.symbol_rules()
    tickers = client.ticker_24h()
    out = []
    for t in tickers:
        sym = t["symbol"]
        r = rules.get(sym)
        if not r or r.quote_asset != cfg.quote_asset:
            continue
        base = r.base_asset
        if base in EXCLUDED_BASES or (base.endswith(LEVERAGED_SUFFIXES) and len(base) > 4):
            continue
        if float(t["quoteVolume"]) < cfg.min_24h_volume_quote:
            continue
        out.append((float(t["quoteVolume"]), sym))
    out.sort(reverse=True)
    return [s for _, s in out[: cfg.top_n_symbols]]


def scan(client: BinanceClient, cfg: Config, symbols: list[str] | None = None) -> tuple[list[Signal], int]:
    """Retorna (sinais ordenados por score, quantidade de pares analisados)."""
    symbols = symbols or liquid_symbols(client, cfg)
    signals: list[Signal] = []
    for sym in symbols:
        try:
            c1h = closed_candles(client.klines(sym, "1h", 260))
            c15 = closed_candles(client.klines(sym, "15m", 100))
            sig = evaluate(sym, c1h, c15, cfg)
            if sig:
                signals.append(sig)
        except Exception as exc:  # um par com problema não derruba a varredura
            log.warning("falha ao analisar %s: %s", sym, exc)
    signals.sort(key=lambda s: s.score, reverse=True)
    return signals, len(symbols)
