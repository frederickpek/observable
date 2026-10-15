"""Nightly snapshot: fetch -> analyze -> write data/.

    python -m pipeline.run [--out data] [--tickers A B] [--only-missing] [--status-file f.json]

Each ticker is processed independently; one failure never stops the others. With
--only-missing, tickers that already have a complete snapshot for the latest US session are
skipped, so the same command is safe to re-run as a gap-filling check.
"""

import argparse
import json
import os
import sys
import time
import traceback
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

from . import analyze, fetch, metrics
from .config import CHAIN_RETENTION_DAYS, TICKERS

PAUSE_BETWEEN_TICKERS = 1.0


class StaleData(Exception):
    pass


def _write(path: Path, obj) -> None:
    """Atomic write: a crash mid-run never leaves a truncated JSON file behind."""
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(obj, separators=(",", ":"), allow_nan=False))
    os.replace(tmp, path)


def _read(path: Path, default):
    return json.loads(path.read_text()) if path.exists() else default


def is_complete(out: Path, all_metrics: dict, symbol: str, session: str) -> bool:
    if not (out / "chains" / symbol / f"{session}.json").exists():
        return False
    row = next((h for h in all_metrics.get(symbol, []) if h["date"] == session), None)
    return row is not None and not row.get("partial")


def process(symbol: str, out: Path, all_metrics: dict, session: str | None) -> dict:
    raw = fetch.option_chain(symbol)
    asof = date.fromisoformat(raw["last_trade_time"][:10])
    if session and asof.isoformat() < session:
        raise StaleData(f"chain is from {asof}, expected {session}")
    spot = float(raw["current_price"])

    slices, skipped = [], 0
    for exp, strikes in sorted(analyze.parse_chain(raw, asof).items()):
        try:
            s = analyze.analyze_expiry(exp, strikes, spot, asof)
        except Exception as e:  # one bad expiry shouldn't sink the ticker
            print(f"  {symbol} {exp}: skipped ({e!r})")
            s = None
        if s is None:
            skipped += 1
        else:
            slices.append(s)
    if not slices:
        raise RuntimeError("no fittable expiries")

    # Realized vol needs the price history; if that call fails, keep the snapshot but mark it
    # partial so the next check run redoes it.
    partial = False
    try:
        hist = fetch.daily_history(symbol)
    except Exception as e:
        print(f"  {symbol}: price history unavailable ({e!r}); saving partial snapshot")
        hist, partial = [], True
    closes = [h["close"] for h in hist if h["date"] < asof.isoformat()] + [spot]

    history = [h for h in all_metrics.get(symbol, []) if h["date"] != asof.isoformat()]
    summary = metrics.summarize(asof, spot, slices, closes, history, analyze.calendar_violations(slices))
    summary["partial"] = partial
    summary["expiriesSkipped"] = skipped

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
    # Chain first, metrics second: is_complete() needs both, so an interruption between the
    # two writes is picked up as missing on the next run.
    _write(out / "chains" / symbol / f"{asof.isoformat()}.json", chain)
    all_metrics[symbol] = sorted(history + [summary], key=lambda h: h["date"])
    _write(out / "metrics.json", all_metrics)
    return summary


def prune(out: Path, today: date) -> None:
    cutoff = (today - timedelta(days=int(CHAIN_RETENTION_DAYS * 7 / 5) + 2)).isoformat()
    for d in (out / "chains").glob("*"):
        dates = sorted(p.stem for p in d.glob("*.json"))
        keep = set(dates[-CHAIN_RETENTION_DAYS:])
        for stem in dates:
            if stem not in keep or stem < cutoff:
                (d / f"{stem}.json").unlink()


def write_index(out: Path, all_metrics: dict, session: str | None, failures: dict) -> list[str]:
    tickers, missing = [], []
    for sym in TICKERS:
        dates = sorted((p.stem for p in (out / "chains" / sym).glob("*.json")), reverse=True)
        if session and not is_complete(out, all_metrics, sym, session):
            missing.append(sym)
        if dates:
            tickers.append({"symbol": sym, "name": TICKERS[sym], "dates": dates,
                            "latest": (all_metrics.get(sym) or [None])[-1]})
    _write(out / "index.json", {
        "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "session": session,
        "retentionDays": CHAIN_RETENTION_DAYS,
        "failures": {s: failures[s] for s in missing if s in failures},
        "missing": missing,
        "tickers": tickers,
    })
    return missing


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="data")
    ap.add_argument("--tickers", nargs="*", default=list(TICKERS))
    ap.add_argument("--only-missing", action="store_true",
                    help="skip tickers that already have a complete snapshot for the latest session")
    ap.add_argument("--status-file", help="write a JSON run summary here (for CI)")
    args = ap.parse_args()
    out = Path(args.out)
    unknown = [t for t in args.tickers if t not in TICKERS]
    if unknown:
        ap.error(f"not in config.TICKERS: {unknown}")

    all_metrics = _read(out / "metrics.json", {})
    try:
        session = fetch.last_session()
    except Exception as e:
        print(f"could not determine latest session ({e!r}); processing all requested tickers")
        session = None

    todo = args.tickers
    if args.only_missing and session:
        todo = [t for t in todo if not is_complete(out, all_metrics, t, session)]
    print(f"session {session} · {len(todo)} to fetch: {' '.join(todo) or '(none)'}")

    done, failures = [], {}
    for i, sym in enumerate(todo):
        if i:
            time.sleep(PAUSE_BETWEEN_TICKERS)
        t0 = time.time()
        try:
            s = process(sym, out, all_metrics, session)
            done.append(sym)
            print(f"{sym:6} ok   {s['date']} atm30={s['atm30']} signals={s['signalsRich']}/{s['signalsCheap']}"
                  f"{' PARTIAL' if s['partial'] else ''} ({time.time() - t0:.1f}s)")
        except Exception as e:
            failures[sym] = f"{type(e).__name__}: {e}"
            print(f"{sym:6} FAIL {failures[sym]}", file=sys.stderr)
            if not isinstance(e, (fetch.PermanentError, StaleData)):
                traceback.print_exc(limit=3)

    if session is None and done:
        # Quote endpoint was down: fall back to the newest session we actually fetched.
        session = max(all_metrics[s][-1]["date"] for s in done)

    if done or not (out / "index.json").exists():
        prune(out, date.today())
    missing = write_index(out, all_metrics, session, failures)
    print(f"done {len(done)} · failed {len(failures)} · still missing for {session}: {' '.join(missing) or 'none'}")

    if args.status_file:
        Path(args.status_file).write_text(json.dumps(
            {"session": session, "updated": done, "failures": failures, "missing": missing}))
    # Exit 0 even with failures: partial data is still worth publishing. CI decides on red/green.
    return 0


if __name__ == "__main__":
    sys.exit(main())
