"""Vectorised Black-76 pricing and implied volatility."""

import numpy as np
from scipy.special import ndtr


def price(F, K, T, sigma, D, is_call):
    F, K, T, sigma, D = np.broadcast_arrays(*map(np.asarray, (F, K, T, sigma, D)))
    sd = sigma * np.sqrt(T)
    with np.errstate(divide="ignore", invalid="ignore"):
        d1 = np.log(F / K) / sd + 0.5 * sd
    d2 = d1 - sd
    call = D * (F * ndtr(d1) - K * ndtr(d2))
    put = D * (K * ndtr(-d2) - F * ndtr(-d1))
    return np.where(is_call, call, put)


def call_delta(F, K, T, sigma):
    sd = sigma * np.sqrt(T)
    return ndtr(np.log(F / K) / sd + 0.5 * sd)


def vega(F, K, T, sigma, D):
    sd = sigma * np.sqrt(T)
    d1 = np.log(F / K) / sd + 0.5 * sd
    return D * F * np.sqrt(T) * np.exp(-0.5 * d1 * d1) / np.sqrt(2 * np.pi)


def implied_vol(px, F, K, T, D, is_call, lo=1e-3, hi=5.0, iters=60):
    """Bisection IV. NaN where the price is outside the no-arbitrage band."""
    px, F, K, T, D, is_call = np.broadcast_arrays(*map(np.asarray, (px, F, K, T, D, is_call)))
    intrinsic = D * np.where(is_call, np.maximum(F - K, 0), np.maximum(K - F, 0))
    upper = D * np.where(is_call, F, K)
    ok = np.isfinite(px) & (px > intrinsic + 1e-10) & (px < upper)
    a = np.full(px.shape, lo)
    b = np.full(px.shape, hi)
    for _ in range(iters):
        m = 0.5 * (a + b)
        too_high = price(F, K, T, m, D, is_call) > px
        b = np.where(too_high, m, b)
        a = np.where(too_high, a, m)
    iv = 0.5 * (a + b)
    iv[~ok | (iv > hi * 0.999)] = np.nan
    return iv
