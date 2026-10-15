"""Static configuration for the nightly snapshot pipeline."""

TICKERS: dict[str, str] = {
    "SPY": "S&P 500 ETF",
    "AAPL": "Apple",
    "MSFT": "Microsoft",
    "NVDA": "NVIDIA",
    "AMZN": "Amazon",
    "GOOGL": "Alphabet",
    "META": "Meta Platforms",
    "TSLA": "Tesla",
}

# Full per-day chain snapshots kept per ticker; daily metrics are kept forever.
CHAIN_RETENTION_DAYS = 60

# Flat discount rate. Only used for discounting (D = e^-rT); dividends and carry are
# captured by the parity-implied forward, so IVs are insensitive to this choice.
RISK_FREE_RATE = 0.04

# Expiries closer than this are dropped: quotes are dominated by pin/gamma noise.
MIN_DAYS_TO_EXPIRY = 2

# Points kept for fitting: |k| / (atm_vol * sqrt(T)) within this many std devs.
MAX_STD_MONEYNESS = 3.5

# Quotes wider than this fraction of mid are kept for display but not fitted.
MAX_REL_SPREAD = 0.6

CONSTANT_MATURITIES = [30, 60, 90, 180]
