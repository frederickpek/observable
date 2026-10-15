"""Nightly snapshot: fetch -> analyze -> write data/. Usage: python -m pipeline.run [--out data]"""

import argparse
import json
import sys
import time
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

from . import analyze, fetch, metrics
from .config import CHAIN_RETENTION_DAYS, TICKERS


def _write(path: Path, obj) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, separators=(",", ":"), allow_nan=False))


def _read(path: Path, default):
    return json.loads(path.read_text()) if path.exists() else default


def process(symbol: str, out: Path, all_metrics: dict) -> dict:
    raw = fetch.option_chain(symbol)
    asof = date.fromisoformat(raw["last_trade_time"][:10])
    spot = float(raw["current_price"])

    slices = []
    for exp, strikes in sorted(analyze.parse_chain(raw, asof).items()):
        s = analyze.analyze_expiry(exp, strikes, spot, asof)
        if s is not None:
            slices.append(s)
    if not slices:
        raise RuntimeError("no fittable expiries")

    hist = fetch.daily_history(symbol)
    closes = [h["close"] for h in hist if h["date"] < asof.isoformat()] + [spot]

    history = [h for h in all_metrics.get(symbol, []) if h["date"] != asof.isoformat()]
    summary = metrics.summarize(asof, spot, slices, closes, history,
                                analyze.calendar_violations(slices))
    all_metrics[symbol] = sorted(history + [summary], key=lambda h: h["date"])

    chain = {
        "symbol": symbol,
        "name": TICKERS[symbol],
        "date": asof.isoformat(),
        "spot": spot,
        "cboeIv30": raw.get("iv30"),
        "summary": summary,
        "closes": [{"d": h["date"], "c": h["close"]} for h in hist[-130:]],
        "slices": slices,
    }
    _write(out / "chains" / symbol / f"{asof.isoformat()}.json", chain)
    return summary


def prune(out: Path, today: date) -> None:
    cutoff = (today - timedelta(days=int(CHAIN_RETENTION_DAYS * 7 / 5) + 2)).isoformat()
    for f in (out / "chains").glob("*/*.json"):
        dates = sorted(p.stem for p in f.parent.glob("*.json"))
        keep = set(dates[-CHAIN_RETENTION_DAYS:])
        if f.stem not in keep or f.stem < cutoff:
            f.unlink()


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="data")
    ap.add_argument("--tickers", nargs="*", default=list(TICKERS))
    args = ap.parse_args()
    out = Path(args.out)

    all_metrics = _read(out / "metrics.json", {})
    failures = {}
    for sym in args.tickers:
        t0 = time.time()
        try:
            s = process(sym, out, all_metrics)
            print(f"{sym:6} ok   {s['date']} atm30={s['atm30']} rr25={s['rr25']} "
                  f"signals={s['signalsRich']}/{s['signalsCheap']} ({time.time() - t0:.1f}s)")
        except Exception as e:  # one bad ticker shouldn't sink the run
            failures[sym] = repr(e)
            print(f"{sym:6} FAIL {e!r}", file=sys.stderr)
        time.sleep(0.5)

    _write(out / "metrics.json", all_metrics)
    prune(out, date.today())
    index = {
        "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "retentionDays": CHAIN_RETENTION_DAYS,
        "failures": failures,
        "tickers": [
            {
                "symbol": sym,
                "name": TICKERS[sym],
                "dates": sorted((p.stem for p in (out / "chains" / sym).glob("*.json")), reverse=True),
                "latest": (all_metrics.get(sym) or [None])[-1],
            }
            for sym in TICKERS
            if (out / "chains" / sym).exists()
        ],
    }
    _write(out / "index.json", index)
    return 1 if len(failures) == len(args.tickers) else 0


if __name__ == "__main__":
    sys.exit(main())
