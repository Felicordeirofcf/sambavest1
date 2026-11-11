"""Configuração lida de variáveis de ambiente (ou de um arquivo .env)."""
from __future__ import annotations

import json
import os
from dataclasses import asdict, dataclass, fields, replace
from pathlib import Path


def load_dotenv(path: str | Path = ".env") -> None:
    """Carrega KEY=VALUE de um .env simples sem sobrescrever o ambiente."""
    p = Path(path)
    if not p.exists():
        return
    for raw in p.read_text().splitlines():
        line = raw.split(" #", 1)[0].strip()  # remove comentário inline
        if line.startswith("#"):
            continue
        if not line or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def _f(name: str, default: float) -> float:
    return float(os.environ.get(name, default))


def _b(name: str, default: bool) -> bool:
    return os.environ.get(name, str(default)).strip().lower() in {"1", "true", "yes", "sim"}


@dataclass
class Config:
    api_key: str = ""
    api_secret: str = ""
    base_url: str = "https://testnet.binance.vision"
    dry_run: bool = True
    quote_asset: str = "USDT"
    take_profit_pct: float = 2.0
    stop_loss_pct: float = 1.5
    fee_pct: float = 0.1
    risk_per_trade_pct: float = 1.0
    max_position_quote: float = 100.0
    max_open_positions: int = 1
    max_hold_hours: float = 48.0
    daily_max_loss_pct: float = 3.0
    min_24h_volume_quote: float = 50_000_000
    top_n_symbols: int = 40
    scan_interval_sec: int = 300
    auto_trade: bool = True          # False = só sinaliza, não entra sozinho
    symbols_whitelist: str = ""      # ex.: "BTCUSDT,ETHUSDT" (vazio = top por volume)
    sim_balance: float = 1000.0      # saldo inicial do modo simulação

    @classmethod
    def from_env(cls) -> "Config":
        load_dotenv()
        return cls(
            api_key=os.environ.get("BINANCE_API_KEY", ""),
            api_secret=os.environ.get("BINANCE_API_SECRET", ""),
            base_url=os.environ.get("BINANCE_BASE_URL", cls.base_url).rstrip("/"),
            dry_run=_b("DRY_RUN", True),
            quote_asset=os.environ.get("QUOTE_ASSET", "USDT"),
            take_profit_pct=_f("TAKE_PROFIT_PCT", 2.0),
            stop_loss_pct=_f("STOP_LOSS_PCT", 1.5),
            fee_pct=_f("FEE_PCT", 0.1),
            risk_per_trade_pct=_f("RISK_PER_TRADE_PCT", 1.0),
            max_position_quote=_f("MAX_POSITION_QUOTE", 100.0),
            max_open_positions=int(_f("MAX_OPEN_POSITIONS", 1)),
            max_hold_hours=_f("MAX_HOLD_HOURS", 48.0),
            daily_max_loss_pct=_f("DAILY_MAX_LOSS_PCT", 3.0),
            min_24h_volume_quote=_f("MIN_24H_VOLUME_QUOTE", 50_000_000),
            top_n_symbols=int(_f("TOP_N_SYMBOLS", 40)),
            scan_interval_sec=int(_f("SCAN_INTERVAL_SEC", 300)),
            auto_trade=_b("AUTO_TRADE", True),
            symbols_whitelist=os.environ.get("SYMBOLS_WHITELIST", ""),
            sim_balance=_f("SIM_BALANCE", 1000.0),
        )

    # ---------------------------------------------- ajustes feitos pela interface
    SECRET_FIELDS = ("api_key", "api_secret")

    def public_dict(self) -> dict:
        d = asdict(self)
        for k in self.SECRET_FIELDS:
            d.pop(k)
        d["has_keys"] = self.has_keys_ok()
        d["api_key_hint"] = (self.api_key[:4] + "…" + self.api_key[-4:]) if len(self.api_key) > 8 else ""
        return d

    def update(self, values: dict) -> None:
        """Aplica valores vindos da interface, validando tipo e faixa."""
        types = {f.name: f.type for f in fields(self)}
        new: dict = {}
        for key, raw in values.items():
            if key in self.SECRET_FIELDS or key not in types:
                continue
            current = getattr(self, key)
            if isinstance(current, bool):
                val = raw if isinstance(raw, bool) else str(raw).lower() in {"1", "true", "sim", "on"}
            elif isinstance(current, int):
                val = int(float(raw))
            elif isinstance(current, float):
                val = float(raw)
            else:
                val = str(raw).strip()
            new[key] = val
        candidate = replace(self, **new)
        candidate.validate()  # só aplica se TUDO for válido
        for key in new:
            setattr(self, key, getattr(candidate, key))

    def validate(self) -> None:
        if not 0.2 <= self.take_profit_pct <= 20:
            raise ValueError("take_profit_pct deve ficar entre 0,2 e 20")
        if not 0.2 <= self.stop_loss_pct <= 20:
            raise ValueError("stop_loss_pct deve ficar entre 0,2 e 20")
        if not 0.05 <= self.risk_per_trade_pct <= 10:
            raise ValueError("risk_per_trade_pct deve ficar entre 0,05 e 10")
        if self.max_open_positions < 1 or self.top_n_symbols < 1 or self.scan_interval_sec < 30:
            raise ValueError("max_open_positions/top_n_symbols >= 1 e scan_interval_sec >= 30")
        if self.max_position_quote <= 0 or self.max_hold_hours <= 0:
            raise ValueError("max_position_quote e max_hold_hours devem ser positivos")
        self.base_url = self.base_url.rstrip("/")
        if self.base_url not in ("https://api.binance.com", "https://testnet.binance.vision"):
            raise ValueError("base_url deve ser https://api.binance.com ou https://testnet.binance.vision")

    def save_settings(self, path: str | Path = "settings.json") -> None:
        Path(path).write_text(json.dumps({k: v for k, v in self.public_dict().items()
                                          if k not in ("has_keys", "api_key_hint")}, indent=2))

    def load_settings(self, path: str | Path = "settings.json") -> "Config":
        p = Path(path)
        if p.exists():
            self.update(json.loads(p.read_text()))
        return self

    def has_keys_ok(self) -> bool:
        return bool(self.api_key and self.api_secret)

    @property
    def whitelist(self) -> list[str]:
        return [s.strip().upper() for s in self.symbols_whitelist.split(",") if s.strip()]

    # Preço de venda que entrega `take_profit_pct` LÍQUIDO após taxa de compra e venda.
    def take_profit_price(self, entry: float) -> float:
        fee = self.fee_pct / 100
        return entry * (1 + self.take_profit_pct / 100) * (1 + fee) / (1 - fee)

    def stop_price(self, entry: float) -> float:
        return entry * (1 - self.stop_loss_pct / 100)
