"""Estratégia de entrada em SPOT para alvo curto (~2% líquido).

Ideia: "comprar o recuo dentro de uma tendência de alta".
Alvos curtos (2%) funcionam melhor quando você entra a favor da tendência
maior, depois de uma correção curta, e quando o ativo tem volatilidade
suficiente para percorrer 2% em poucas horas — mas não tanta que o stop seja
atingido por ruído.

Filtros (todos obrigatórios):
  1. Tendência (1h): close > EMA200, EMA50 > EMA200 e EMA50 subindo.
  2. Volatilidade (1h): ATR14 entre 0,6% e 5% do preço.
  3. Recuo (15m): RSI14 caiu abaixo de 35 nas últimas 8 velas
     ou o preço tocou a Bollinger inferior.
  4. Gatilho (15m): última vela fechada é de alta, RSI virando para cima e
     ainda abaixo de 55 (não compra topo do repique).
  5. Espaço até o alvo: a máxima das últimas 48h está acima do preço-alvo
     (o mercado já negociou lá recentemente — menos resistência inédita).
  6. Não esticado: preço no máximo 3% acima da EMA50 de 1h.

O score ordena candidatos quando há mais de um.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import NamedTuple

from .config import Config
from .indicators import atr, bollinger, ema, rsi, sma


class Candle(NamedTuple):
    open_time: int
    open: float
    high: float
    low: float
    close: float
    volume: float
    close_time: int

    @classmethod
    def from_binance(cls, k: list) -> "Candle":
        return cls(int(k[0]), float(k[1]), float(k[2]), float(k[3]), float(k[4]), float(k[5]), int(k[6]))


@dataclass
class Signal:
    symbol: str
    entry: float
    take_profit: float
    stop: float
    score: float
    reasons: list[str] = field(default_factory=list)

    def describe(self) -> str:
        return (
            f"{self.symbol}: entrada~{self.entry:.8g} alvo {self.take_profit:.8g} "
            f"stop {self.stop:.8g} score {self.score:.1f} | " + "; ".join(self.reasons)
        )


MIN_1H = 210
MIN_15M = 60


def evaluate(symbol: str, c1h: list[Candle], c15m: list[Candle], cfg: Config) -> Signal | None:
    """Retorna um Signal se houver entrada na última vela FECHADA de 15m."""
    if len(c1h) < MIN_1H or len(c15m) < MIN_15M:
        return None

    # --- 1h: tendência e volatilidade ---
    closes_h = [c.close for c in c1h]
    ema50_h = ema(closes_h, 50)
    ema200_h = ema(closes_h, 200)
    atr_h = atr([c.high for c in c1h], [c.low for c in c1h], closes_h, 14)
    price_h = closes_h[-1]
    if not (price_h > ema200_h[-1] and ema50_h[-1] > ema200_h[-1] and ema50_h[-1] > ema50_h[-11]):
        return None
    atr_pct = atr_h[-1] / price_h * 100
    if not (0.6 <= atr_pct <= 5.0):
        return None

    # --- 15m: recuo + gatilho ---
    closes = [c.close for c in c15m]
    rsi15 = rsi(closes, 14)
    lower_bb, _, _ = bollinger(closes, 20, 2.0)
    vol_avg = sma([c.volume for c in c15m], 20)
    last = c15m[-1]
    entry = last.close

    recent_rsi_min = min(rsi15[-8:])
    touched_lower = any(c15m[i].low <= lower_bb[i] for i in range(-8, 0) if not math.isnan(lower_bb[i]))
    if not (recent_rsi_min < 35 or touched_lower):
        return None
    if not (last.close > last.open and rsi15[-1] > rsi15[-2] and rsi15[-1] < 55):
        return None

    take_profit = cfg.take_profit_price(entry)
    stop = cfg.stop_price(entry)

    swing_high = max(c.high for c in c1h[-48:])
    if swing_high < take_profit:
        return None
    stretch = (entry / ema50_h[-1] - 1) * 100
    if stretch > 3.0:
        return None

    # --- score ---
    trend_strength = (ema50_h[-1] / ema200_h[-1] - 1) * 100
    vol_ratio = last.volume / vol_avg[-1] if vol_avg[-1] else 1.0
    room = (swing_high / take_profit - 1) * 100
    score = (
        min(trend_strength, 5) * 4          # tendência
        + max(0, 35 - recent_rsi_min)       # profundidade do recuo
        + min(vol_ratio, 3) * 5             # volume confirmando o repique
        + min(room, 5) * 2                  # espaço acima do alvo
        + (5 if touched_lower else 0)
        - max(0, stretch) * 3               # penaliza preço esticado
    )
    reasons = [
        f"tendência 1h +{trend_strength:.2f}%",
        f"ATR 1h {atr_pct:.2f}%",
        f"RSI15m mín {recent_rsi_min:.0f} -> {rsi15[-1]:.0f}",
        f"volume x{vol_ratio:.1f}",
        f"máx 48h {room:+.2f}% acima do alvo",
    ]
    if touched_lower:
        reasons.append("tocou Bollinger inferior")
    return Signal(symbol, entry, take_profit, stop, score, reasons)
