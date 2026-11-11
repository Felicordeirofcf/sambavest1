"""Cliente REST mínimo para a API Spot da Binance (assinatura HMAC-SHA256)."""
from __future__ import annotations

import hashlib
import hmac
import time
from dataclasses import dataclass
from decimal import ROUND_DOWN, Decimal
from urllib.parse import urlencode

import requests


class BinanceError(RuntimeError):
    pass


@dataclass
class SymbolRules:
    symbol: str
    base_asset: str
    quote_asset: str
    tick_size: Decimal
    step_size: Decimal
    min_qty: Decimal
    min_notional: Decimal

    @staticmethod
    def _floor(value: float | Decimal, step: Decimal) -> Decimal:
        v = Decimal(str(value))
        if step == 0:
            return v
        return (v / step).to_integral_value(rounding=ROUND_DOWN) * step

    def price(self, value: float) -> str:
        return format(self._floor(value, self.tick_size).normalize(), "f")

    def qty(self, value: float | Decimal) -> str:
        return format(self._floor(value, self.step_size).normalize(), "f")

    @classmethod
    def from_exchange_info(cls, s: dict) -> "SymbolRules":
        f = {x["filterType"]: x for x in s["filters"]}
        notional = f.get("NOTIONAL") or f.get("MIN_NOTIONAL") or {"minNotional": "0"}
        return cls(
            symbol=s["symbol"],
            base_asset=s["baseAsset"],
            quote_asset=s["quoteAsset"],
            tick_size=Decimal(f["PRICE_FILTER"]["tickSize"]),
            step_size=Decimal(f["LOT_SIZE"]["stepSize"]),
            min_qty=Decimal(f["LOT_SIZE"]["minQty"]),
            min_notional=Decimal(notional["minNotional"]),
        )


class BinanceClient:
    def __init__(self, api_key: str = "", api_secret: str = "", base_url: str = "https://api.binance.com",
                 recv_window: int = 5000, timeout: int = 15):
        self.api_key = api_key
        self.api_secret = api_secret.encode()
        self.base_url = base_url.rstrip("/")
        self.recv_window = recv_window
        self.timeout = timeout
        self.session = requests.Session()
        if api_key:
            self.session.headers["X-MBX-APIKEY"] = api_key
        self._time_offset = 0

    # ------------------------------------------------------------------ core
    def _request(self, method: str, path: str, params: dict | None = None, signed: bool = False):
        params = {k: v for k, v in (params or {}).items() if v is not None}
        if signed:
            if not self.api_key or not self.api_secret:
                raise BinanceError("BINANCE_API_KEY/BINANCE_API_SECRET não configurados")
            params["timestamp"] = int(time.time() * 1000) + self._time_offset
            params["recvWindow"] = self.recv_window
            query = urlencode(params)
            sig = hmac.new(self.api_secret, query.encode(), hashlib.sha256).hexdigest()
            query += f"&signature={sig}"
        else:
            query = urlencode(params)
        url = f"{self.base_url}{path}" + (f"?{query}" if query else "")
        for attempt in range(4):
            resp = self.session.request(method, url, timeout=self.timeout)
            if resp.status_code in (418, 429):  # rate limit
                wait = int(resp.headers.get("Retry-After", 2 ** attempt))
                time.sleep(wait)
                continue
            if resp.status_code >= 500 and attempt < 3:
                time.sleep(2 ** attempt)
                continue
            break
        try:
            data = resp.json()
        except ValueError:
            raise BinanceError(f"{resp.status_code} {resp.text[:200]}")
        if resp.status_code >= 400:
            raise BinanceError(f"{resp.status_code} {data}")
        return data

    def sync_time(self) -> None:
        server = self._request("GET", "/api/v3/time")["serverTime"]
        self._time_offset = server - int(time.time() * 1000)

    # ---------------------------------------------------------------- public
    def exchange_info(self) -> dict:
        return self._request("GET", "/api/v3/exchangeInfo", {"permissions": "SPOT"})

    def symbol_rules(self) -> dict[str, SymbolRules]:
        info = self.exchange_info()
        return {s["symbol"]: SymbolRules.from_exchange_info(s) for s in info["symbols"] if s["status"] == "TRADING"}

    def ticker_24h(self) -> list[dict]:
        return self._request("GET", "/api/v3/ticker/24hr")

    def price(self, symbol: str) -> float:
        return float(self._request("GET", "/api/v3/ticker/price", {"symbol": symbol})["price"])

    def klines(self, symbol: str, interval: str, limit: int = 500,
               start_time: int | None = None, end_time: int | None = None) -> list[list]:
        return self._request("GET", "/api/v3/klines", {
            "symbol": symbol, "interval": interval, "limit": limit,
            "startTime": start_time, "endTime": end_time,
        })

    # ---------------------------------------------------------------- signed
    def account(self) -> dict:
        return self._request("GET", "/api/v3/account", {"omitZeroBalances": "true"}, signed=True)

    def free_balance(self, asset: str) -> float:
        for b in self.account()["balances"]:
            if b["asset"] == asset:
                return float(b["free"])
        return 0.0

    def api_restrictions(self) -> dict:
        """Só existe em produção (sapi)."""
        return self._request("GET", "/sapi/v1/account/apiRestrictions", signed=True)

    def market_buy_quote(self, symbol: str, quote_amount: str) -> dict:
        return self._request("POST", "/api/v3/order", {
            "symbol": symbol, "side": "BUY", "type": "MARKET",
            "quoteOrderQty": quote_amount, "newOrderRespType": "FULL",
        }, signed=True)

    def market_sell(self, symbol: str, quantity: str) -> dict:
        return self._request("POST", "/api/v3/order", {
            "symbol": symbol, "side": "SELL", "type": "MARKET",
            "quantity": quantity, "newOrderRespType": "FULL",
        }, signed=True)

    def oco_sell(self, symbol: str, quantity: str, take_profit: str, stop_trigger: str, stop_limit: str) -> dict:
        """OCO de venda: LIMIT_MAKER no alvo + STOP_LOSS_LIMIT abaixo."""
        return self._request("POST", "/api/v3/orderList/oco", {
            "symbol": symbol, "side": "SELL", "quantity": quantity,
            "aboveType": "LIMIT_MAKER", "abovePrice": take_profit,
            "belowType": "STOP_LOSS_LIMIT", "belowStopPrice": stop_trigger,
            "belowPrice": stop_limit, "belowTimeInForce": "GTC",
            "newOrderRespType": "FULL",
        }, signed=True)

    def order_list(self, order_list_id: int) -> dict:
        return self._request("GET", "/api/v3/orderList", {"orderListId": order_list_id}, signed=True)

    def cancel_order_list(self, symbol: str, order_list_id: int) -> dict:
        return self._request("DELETE", "/api/v3/orderList",
                             {"symbol": symbol, "orderListId": order_list_id}, signed=True)

    def get_order(self, symbol: str, order_id: int) -> dict:
        return self._request("GET", "/api/v3/order", {"symbol": symbol, "orderId": order_id}, signed=True)
