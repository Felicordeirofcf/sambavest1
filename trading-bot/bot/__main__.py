"""Uso:
  python -m bot ui                       # abre o painel em http://127.0.0.1:8765
  python -m bot scan                     # lista oportunidades agora
  python -m bot backtest BTCUSDT,ETHUSDT 60
  python -m bot run                      # robô sem interface (terminal)
  python -m bot check                    # valida a chave da API
"""
from __future__ import annotations

import json
import logging
import sys
import time

from .backtest import run_backtest
from .config import Config
from .trader import Bot


def main(argv: list[str]) -> int:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    cmd = argv[0] if argv else "ui"
    cfg = Config.from_env().load_settings()
    bot = Bot(cfg)
    if cmd == "ui":
        from .web import serve
        port = int(argv[1]) if len(argv) > 1 else 8765
        serve(bot, port=port)
    elif cmd == "scan":
        for s in bot.run_scan():
            print(s.describe())
        if not bot.last_scan["signals"]:
            print("Nenhuma entrada válida agora — o robô espera o setup aparecer.")
    elif cmd == "backtest":
        symbols = (argv[1] if len(argv) > 1 else "BTCUSDT,ETHUSDT,SOLUSDT").upper().split(",")
        days = int(argv[2]) if len(argv) > 2 else 60
        res = run_backtest(bot.client, cfg, symbols, days, int(time.time() * 1000))
        print(json.dumps({"summary": res["summary"], "per_symbol": res["per_symbol"]}, indent=2))
    elif cmd == "run":
        bot.start()
        try:
            while bot.running:
                time.sleep(1)
        except KeyboardInterrupt:
            bot.stop()
    elif cmd == "check":
        print(json.dumps(bot.check_api_key(), indent=2))
    else:
        print(__doc__)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
