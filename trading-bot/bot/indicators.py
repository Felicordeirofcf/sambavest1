"""Indicadores técnicos em Python puro (sem pandas)."""
from __future__ import annotations

import math


def sma(values: list[float], period: int) -> list[float]:
    out = [math.nan] * len(values)
    if len(values) < period:
        return out
    s = sum(values[:period])
    out[period - 1] = s / period
    for i in range(period, len(values)):
        s += values[i] - values[i - period]
        out[i] = s / period
    return out


def ema(values: list[float], period: int) -> list[float]:
    out = [math.nan] * len(values)
    if len(values) < period:
        return out
    k = 2 / (period + 1)
    prev = sum(values[:period]) / period
    out[period - 1] = prev
    for i in range(period, len(values)):
        prev = values[i] * k + prev * (1 - k)
        out[i] = prev
    return out


def rsi(closes: list[float], period: int = 14) -> list[float]:
    """RSI de Wilder."""
    out = [math.nan] * len(closes)
    if len(closes) <= period:
        return out
    gains = losses = 0.0
    for i in range(1, period + 1):
        d = closes[i] - closes[i - 1]
        gains += max(d, 0)
        losses += max(-d, 0)
    avg_g, avg_l = gains / period, losses / period

    def _val(g: float, l: float) -> float:
        if l == 0:
            return 100.0 if g > 0 else 50.0
        return 100 - 100 / (1 + g / l)

    out[period] = _val(avg_g, avg_l)
    for i in range(period + 1, len(closes)):
        d = closes[i] - closes[i - 1]
        avg_g = (avg_g * (period - 1) + max(d, 0)) / period
        avg_l = (avg_l * (period - 1) + max(-d, 0)) / period
        out[i] = _val(avg_g, avg_l)
    return out


def atr(highs: list[float], lows: list[float], closes: list[float], period: int = 14) -> list[float]:
    n = len(closes)
    out = [math.nan] * n
    if n <= period:
        return out
    trs = [highs[0] - lows[0]]
    for i in range(1, n):
        trs.append(max(highs[i] - lows[i], abs(highs[i] - closes[i - 1]), abs(lows[i] - closes[i - 1])))
    prev = sum(trs[1 : period + 1]) / period
    out[period] = prev
    for i in range(period + 1, n):
        prev = (prev * (period - 1) + trs[i]) / period
        out[i] = prev
    return out


def bollinger(values: list[float], period: int = 20, k: float = 2.0) -> tuple[list[float], list[float], list[float]]:
    mid = sma(values, period)
    upper = [math.nan] * len(values)
    lower = [math.nan] * len(values)
    for i in range(period - 1, len(values)):
        window = values[i - period + 1 : i + 1]
        m = mid[i]
        sd = math.sqrt(sum((v - m) ** 2 for v in window) / period)
        upper[i] = m + k * sd
        lower[i] = m - k * sd
    return lower, mid, upper
