"""Cboe delayed-quote endpoints (free, no key, one file per underlying)."""

import json
import time
import urllib.request

BASE = "https://cdn.cboe.com/api/global/delayed_quotes"
HEADERS = {"User-Agent": "Mozilla/5.0 (options-snapshot)"}


def _get_json(url: str, retries: int = 3) -> dict:
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers=HEADERS)
            with urllib.request.urlopen(req, timeout=60) as resp:
                return json.load(resp)
        except Exception:
            if attempt == retries - 1:
                raise
            time.sleep(2 * (attempt + 1))
    raise RuntimeError("unreachable")


def option_chain(symbol: str) -> dict:
    return _get_json(f"{BASE}/options/{symbol}.json")["data"]


def daily_history(symbol: str) -> list[dict]:
    return _get_json(f"{BASE}/charts/historical/{symbol}.json")["data"]
