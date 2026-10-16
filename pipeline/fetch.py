"""Cboe delayed-quote endpoints (free, no key, one file per underlying)."""

import http.client
import json
import random
import time
import urllib.error
import urllib.request

BASE = "https://cdn.cboe.com/api/global/delayed_quotes"
HEADERS = {"User-Agent": "Mozilla/5.0 (options-snapshot)"}
TIMEOUT = 30
# Two retries, ~3s then ~9s: enough to ride out a blip without hammering the CDN.
BACKOFF = (3, 9)
MAX_RETRY_AFTER = 30


class PermanentError(Exception):
    """A response that retrying won't fix (unknown symbol, blocked, malformed)."""


def _transient(e: Exception) -> bool:
    if isinstance(e, urllib.error.HTTPError):
        return e.code == 429 or e.code >= 500
    # IncompleteRead: the CDN closed the connection mid-download (truncated ~1.5MB chain).
    return isinstance(e, (urllib.error.URLError, TimeoutError, ConnectionError, json.JSONDecodeError,
                          http.client.IncompleteRead))


def _get_json(url: str) -> dict:
    for attempt in range(len(BACKOFF) + 1):
        try:
            req = urllib.request.Request(url, headers=HEADERS)
            with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
                return json.load(resp)
        except Exception as e:
            if not _transient(e):
                raise PermanentError(f"{url}: {e!r}") from e
            if attempt == len(BACKOFF):
                raise
            wait = BACKOFF[attempt] * (0.8 + 0.4 * random.random())
            if isinstance(e, urllib.error.HTTPError) and (ra := e.headers.get("Retry-After", "")).isdigit():
                wait = min(max(wait, int(ra)), MAX_RETRY_AFTER)
            print(f"  retry {attempt + 1}/{len(BACKOFF)} in {wait:.0f}s: {e!r}")
            time.sleep(wait)
    raise RuntimeError("unreachable")


def option_chain(symbol: str) -> dict:
    data = _get_json(f"{BASE}/options/{symbol}.json")["data"]
    if not data.get("options"):
        raise PermanentError(f"{symbol}: empty option chain")
    return data


def daily_history(symbol: str) -> list[dict]:
    return _get_json(f"{BASE}/charts/historical/{symbol}.json")["data"]


def last_session(symbol: str = "SPY") -> str:
    """Date (YYYY-MM-DD) of the most recent completed US session, from a ~0.5KB quote."""
    return _get_json(f"{BASE}/quotes/{symbol}.json")["data"]["last_trade_time"][:10]
