"""Per-ticker daily summary metrics (kept forever in metrics.json)."""

import math

import numpy as np

from . import black, svi
from .config import CONSTANT_MATURITIES


def realized_vol(closes: list[float], window: int) -> float | None:
    if len(closes) < window + 1:
        return None
    c = np.asarray(closes[-(window + 1):], float)
    r = np.diff(np.log(c))
    return float(np.std(r, ddof=1) * math.sqrt(252))


def _interp_T(slices, days, fn):
    """Interpolate a per-slice quantity to a constant maturity, linear in T (no extrapolation)."""
    T = days / 365.0
    xs = [s["T"] for s in slices]
    if not xs or T < xs[0] or T > xs[-1]:
        return None
    ys = np.array([fn(s) for s in slices], float)
    ok = np.isfinite(ys)
    if ok.sum() < 1 or T < min(np.array(xs)[ok]) or T > max(np.array(xs)[ok]):
        return None
    return float(np.interp(T, np.array(xs)[ok], ys[ok]))


def _atm_var(s):
    return svi.total_var(s["svi"], 0.0)


def _delta_vol(s, target_call_delta):
    """Fitted vol at the strike whose call delta equals the target (forward delta).
    Searched only over the quoted strike range so extrapolated wings can't leak in."""
    lo, hi = s["kFit"]
    k = np.linspace(lo, hi, 801)
    w = np.maximum(svi.total_var(s["svi"], k), 1e-10)
    iv = np.sqrt(w / s["T"])
    d = black.call_delta(1.0, np.exp(k), s["T"], iv)
    if not (d.min() <= target_call_delta <= d.max()):
        return math.nan
    i = int(np.argmin(np.abs(d - target_call_delta)))
    return float(iv[i])


def _rr25(s):
    return _delta_vol(s, 0.25) - _delta_vol(s, 0.75)  # 25d call vol - 25d put vol


def _bf25(s):
    atm = math.sqrt(_atm_var(s) / s["T"])
    return 0.5 * (_delta_vol(s, 0.25) + _delta_vol(s, 0.75)) - atm


def summarize(asof, spot, slices, closes, history, calendar_bad) -> dict:
    out: dict = {"date": asof.isoformat(), "spot": spot}
    for d in CONSTANT_MATURITIES:
        w = _interp_T(slices, d, _atm_var)
        out[f"atm{d}"] = None if w is None else round(math.sqrt(w / (d / 365)), 4)
    rr = _interp_T(slices, 30, _rr25)
    bf = _interp_T(slices, 30, _bf25)
    out["rr25"] = None if rr is None else round(rr, 4)
    out["bf25"] = None if bf is None else round(bf, 4)
    for wnd in (10, 20, 60):
        rv = realized_vol(closes, wnd)
        out[f"rv{wnd}"] = None if rv is None else round(rv, 4)

    atm30 = out["atm30"]
    past = [h["atm30"] for h in history if h.get("atm30") is not None][-251:]
    if atm30 is not None and len(past) >= 20:
        lo, hi = min(past + [atm30]), max(past + [atm30])
        out["ivRank"] = round((atm30 - lo) / (hi - lo), 3) if hi > lo else None
        out["ivPct"] = round(sum(x <= atm30 for x in past) / len(past), 3)
    else:
        out["ivRank"] = out["ivPct"] = None
    out["histDays"] = len(past) + 1

    rich = cheap = 0
    for s in slices:
        for z, c in zip(s["z"], s["conf"]):
            if z is None or c is None or c < 0.5:
                continue
            rich += z > 0
            cheap += z < 0
    out["signalsRich"] = rich
    out["signalsCheap"] = cheap
    out["fitRmse"] = round(float(np.median([s["rmse"] for s in slices])), 4)
    out["butterflyArb"] = sum(s["butterflyMinG"] < 0 for s in slices)
    out["calendarArb"] = calendar_bad
    return out
