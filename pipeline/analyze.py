"""Turn a raw Cboe chain into cleaned, fitted, scored per-expiry slices."""

import math
import re
from datetime import date

import numpy as np

from . import black, svi
from .config import MAX_REL_SPREAD, MAX_STD_MONEYNESS, MIN_DAYS_TO_EXPIRY, RISK_FREE_RATE

OCC = re.compile(r"^(.+?)(\d{6})([CP])(\d{8})$")


def parse_chain(raw: dict, asof: date) -> dict[date, dict]:
    """Group contracts by expiry -> strike -> {'C': row, 'P': row}."""
    by_exp: dict[date, dict] = {}
    for row in raw["options"]:
        m = OCC.match(row["option"])
        if not m:
            continue
        yymmdd, cp, strike = m.group(2), m.group(3), int(m.group(4)) / 1000
        exp = date(2000 + int(yymmdd[:2]), int(yymmdd[2:4]), int(yymmdd[4:]))
        if (exp - asof).days < MIN_DAYS_TO_EXPIRY:
            continue
        by_exp.setdefault(exp, {}).setdefault(strike, {})[cp] = row
    return by_exp


def _mid(row):
    if row is None:
        return math.nan
    bid, ask = row.get("bid") or 0, row.get("ask") or 0
    return 0.5 * (bid + ask) if bid > 0 and ask >= bid else math.nan


def implied_forward(strikes: dict, spot: float, D: float) -> float | None:
    """Put-call parity: C - P = D (F - K). Median over the liquid strikes nearest spot."""
    cands = []
    for K, pair in strikes.items():
        c, p = _mid(pair.get("C")), _mid(pair.get("P"))
        if math.isfinite(c) and math.isfinite(p):
            cands.append((abs(K - spot), K + (c - p) / D))
    if not cands:
        return None
    cands.sort()
    return float(np.median([f for _, f in cands[:8]]))


def _liquidity(oi, vol):
    oi_s = np.clip(np.log10(1 + oi) / 4, 0, 1)
    vol_s = np.clip(np.log10(1 + vol) / 3, 0, 1)
    return 0.7 * oi_s + 0.3 * vol_s


def analyze_expiry(exp: date, strikes: dict, spot: float, asof: date) -> dict | None:
    dte = (exp - asof).days
    T = dte / 365.0
    D = math.exp(-RISK_FREE_RATE * T)
    F = implied_forward(strikes, spot, D)
    if F is None:
        return None

    # Out-of-the-money side only: puts below the forward, calls at/above it.
    rows = []
    for K in sorted(strikes):
        cp = "P" if K < F else "C"
        r = strikes[K].get(cp)
        if r is None or not (r.get("bid") or 0) > 0 or not (r.get("ask") or 0) >= r["bid"]:
            continue
        rows.append((K, cp, r))
    if len(rows) < 5:
        return None

    K = np.array([r[0] for r in rows])
    is_call = np.array([r[1] == "C" for r in rows])
    bid = np.array([r[2]["bid"] for r in rows], float)
    ask = np.array([r[2]["ask"] for r in rows], float)
    oi = np.array([r[2].get("open_interest") or 0 for r in rows], float)
    vol = np.array([r[2].get("volume") or 0 for r in rows], float)
    mid = 0.5 * (bid + ask)

    iv_mid = black.implied_vol(mid, F, K, T, D, is_call)
    iv_bid = black.implied_vol(bid, F, K, T, D, is_call)
    iv_ask = black.implied_vol(ask, F, K, T, D, is_call)
    k = np.log(K / F)

    finite = np.isfinite(iv_mid)
    if finite.sum() < 5:
        return None
    atm_guess = float(np.interp(0, k[finite], iv_mid[finite]))
    std_k = np.abs(k) / (atm_guess * math.sqrt(T))
    rel_spread = (ask - bid) / mid
    # Bid IV is NaN when the bid is below intrinsic-ish; treat the mid as the lower edge then.
    half_spread_iv = 0.5 * (np.where(np.isfinite(iv_ask), iv_ask, iv_mid + 0.05)
                            - np.where(np.isfinite(iv_bid), iv_bid, iv_mid))
    unc = np.maximum(half_spread_iv, 0.0025)
    use = finite & (std_k <= MAX_STD_MONEYNESS) & (rel_spread <= MAX_REL_SPREAD)
    if use.sum() < 6:
        return None

    f = svi.fit(k[use], iv_mid[use], unc[use], T)
    if f is None:
        return None
    p = f["params"]
    iv_fit = np.sqrt(np.maximum(svi.total_var(p, k), 1e-10) / T)
    px_fit = black.price(F, K, T, iv_fit, D, is_call)
    resid = iv_mid - iv_fit
    # Model uncertainty: robust spread of residuals across the fitted points. Without it,
    # tight-spread names turn small, smooth SVI shape errors into runs of huge z-scores.
    r_fit = resid[use]
    model_unc = 1.4826 * float(np.median(np.abs(r_fit - np.median(r_fit))))
    z = resid / np.sqrt(unc**2 + model_unc**2)
    delta = black.call_delta(F, K, T, iv_fit) - np.where(is_call, 0, 1)

    # Tradeable edge per share: rich -> sell at bid vs fair; cheap -> buy at ask vs fair.
    edge = np.where(resid > 0, bid - px_fit, px_fit - ask)
    conf = np.clip((np.abs(z) - 1) / 3, 0, 1) * _liquidity(oi, vol)
    conf = np.where(use, conf, 0)

    atm_iv = float(math.sqrt(max(svi.total_var(p, 0.0), 1e-10) / T))
    return {
        "exp": exp.isoformat(),
        "dte": dte,
        "T": T,
        "F": F,
        "D": D,
        "atmIv": atm_iv,
        "svi": [float(x) for x in p],
        "rmse": f["rmse"],
        "modelUnc": round(model_unc, 5),
        "butterflyMinG": f["butterfly_min_g"],
        "nFit": int(use.sum()),
        "kFit": [round(float(k[use].min()), 4), round(float(k[use].max()), 4)],
        # columnar, rounded to keep files small
        "K": K.tolist(),
        "cp": "".join("C" if c else "P" for c in is_call),
        "bid": np.round(bid, 2).tolist(),
        "ask": np.round(ask, 2).tolist(),
        "ivMid": _r(iv_mid, 4),
        "ivBid": _r(iv_bid, 4),
        "ivAsk": _r(iv_ask, 4),
        "ivFit": _r(iv_fit, 4),
        "z": _r(np.where(use, z, np.nan), 2),
        "edge": _r(edge, 2),
        "conf": _r(conf, 3),
        "delta": _r(delta, 3),
        "oi": oi.astype(int).tolist(),
        "vol": vol.astype(int).tolist(),
    }


def _r(a, n):
    return [None if not math.isfinite(x) else round(float(x), n) for x in a]


def calendar_violations(slices: list[dict]) -> int:
    """Count adjacent expiry pairs where total variance decreases at some forward moneyness
    inside the strike range both expiries were actually fitted on (no extrapolated wings)."""
    bad = 0
    for s0, s1 in zip(slices, slices[1:]):
        lo, hi = max(s0["kFit"][0], s1["kFit"][0]), min(s0["kFit"][1], s1["kFit"][1])
        if hi <= lo:
            continue
        grid = np.linspace(lo, hi, 61)
        w0 = svi.total_var(s0["svi"], grid)
        w1 = svi.total_var(s1["svi"], grid)
        if np.any(w1 < w0 - 1e-5):
            bad += 1
    return bad
