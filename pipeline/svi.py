"""Raw SVI smile fitting and static-arbitrage diagnostics.

w(k) = a + b * (rho * (k - m) + sqrt((k - m)^2 + s^2)),  w = total implied variance, k = ln(K/F)
"""

import numpy as np
from scipy.optimize import least_squares


def total_var(p, k):
    a, b, rho, m, s = p
    x = k - m
    return a + b * (rho * x + np.sqrt(x * x + s * s))


def _derivs(p, k):
    a, b, rho, m, s = p
    x = k - m
    r = np.sqrt(x * x + s * s)
    return b * (rho + x / r), b * s * s / r**3


def butterfly_g(p, k):
    """Gatheral's density function; g(k) < 0 means butterfly arbitrage."""
    w = total_var(p, k)
    w1, w2 = _derivs(p, k)
    return (1 - k * w1 / (2 * w)) ** 2 - (w1 * w1 / 4) * (1 / w + 0.25) + w2 / 2


def fit(k, iv, unc, T):
    """Weighted robust fit in vol space. `unc` is the per-point vol uncertainty (half-spread)."""
    k, iv, unc = map(np.asarray, (k, iv, unc))
    atm_iv = float(np.interp(0.0, k, iv)) if k.min() < 0 < k.max() else float(np.median(iv))
    w_atm = atm_iv**2 * T

    def resid(p):
        w = total_var(p, k)
        model = np.sqrt(np.maximum(w, 1e-10) / T)
        r = (model - iv) / unc
        a, b, rho, m, s = p
        min_var = a + b * s * np.sqrt(1 - rho * rho)
        # Wing slopes: Lee caps them at 2; real equity smiles sit well below 1, and thin
        # slices otherwise chase a couple of wing quotes into near-vertical wings.
        wing = b * (1 + abs(rho)) - 1.0
        pen = [100 * max(0.0, -min_var) / max(w_atm, 1e-6), 30 * max(0.0, wing)]
        return np.concatenate([r, pen])

    span = max(float(k.max() - k.min()), 0.05)
    # Minimum ATM rounding ~ a quarter of a 1-sd move: stops kinked fits through noise.
    s_min = max(1e-3, 0.25 * atm_iv * np.sqrt(T))
    lo = [-w_atm * 2, 1e-5, -0.999, float(k.min()), s_min]
    hi = [w_atm * 2, 2.0, 0.999, float(k.max()), max(2.0, 2 * s_min)]

    best = None
    for rho0 in (-0.8, -0.4, 0.0):
        for s0 in (0.05 * span, 0.25 * span):
            b0 = max(0.5 * w_atm / max(span, 0.1), 1e-3)
            a0 = w_atm - b0 * s0 * np.sqrt(1 - rho0 * rho0)
            s0 = max(s0, s_min)
            a0 = w_atm - b0 * s0 * np.sqrt(1 - rho0 * rho0)
            x0 = np.clip([a0, b0, rho0, 0.0, s0], lo, hi)
            try:
                r = least_squares(resid, x0, bounds=(lo, hi), loss="soft_l1", f_scale=1.5, max_nfev=2000)
            except ValueError:
                continue
            if best is None or r.cost < best.cost:
                best = r
    if best is None:
        return None
    p = best.x
    model = np.sqrt(np.maximum(total_var(p, k), 1e-10) / T)
    rmse = float(np.sqrt(np.mean((model - iv) ** 2)))
    grid = np.linspace(float(k.min()) - 0.25 * span, float(k.max()) + 0.25 * span, 400)
    g = butterfly_g(p, grid)
    return {"params": p, "rmse": rmse, "butterfly_min_g": float(np.min(g))}
