# observable

End-of-day options analytics for S&P 500 leaders. Every US close, each option chain is
snapshotted from Cboe's free delayed-quote feed, re-implied, fitted with an SVI smile, and
scored for contracts trading rich or cheap relative to their own surface.

## How it works

```
pipeline/ (Python)                       web/ (Vite + React + Tailwind)
  fetch     Cboe chain + daily closes      Overview   universe table: IV−RV, skew, term, signals
  analyze   parity forward → own IVs       Ticker     smile, term structure, IV vs RV history,
            → SVI fit per expiry                      rich/cheap heatmap, signals table
            → z-score + confidence
  metrics   ATM IV by tenor, 25Δ RR/BF,
            realized vol, IV rank
  run       writes data/, prunes old chains
```

**Scoring.** For each out-of-the-money quote, `resid = IV_mid − IV_fit` and
`z = resid / √(half-spread_IV² + model_unc²)`, where `model_unc` is the robust spread of
residuals across that expiry's fit. Confidence scales |z| from 1→4 and weights by open
interest and volume. *Edge* is the dollar mispricing left after crossing the spread.

## Data storage

Generated data lives on an orphan **`data`** branch that is force-pushed as a single commit
each night, so the repo never accumulates history of large JSON files:

- `chains/<SYM>/<date>.json` — full fitted chain, last 60 trading days
- `metrics.json` — one summary row per ticker per day, kept forever
- `index.json` — available tickers/dates and the latest summary

## Nightly job

`.github/workflows/nightly.yml` runs at 22:00 UTC Mon–Fri (06:00 SGT Tue–Sat, after the US
close in both EDT and EST): snapshot → push `data` branch → build site → deploy to GitHub Pages.
Pushes to `web/**` on `master` rebuild the site from existing data without re-snapshotting.

One-time setup: **Settings → Pages → Source: GitHub Actions**.

## Local development

```sh
python3 -m venv .venv && .venv/bin/pip install -r pipeline/requirements.txt
.venv/bin/python -m pipeline.run --out web/public/data          # all tickers, ~3 min
.venv/bin/python -m pipeline.run --out web/public/data --tickers AAPL SPY

cd web && npm install && npm run dev
```

Edit the universe in `pipeline/config.py`.

Commit messages are checked by `.githooks/commit-msg`; enable it with
`git config core.hooksPath .githooks`.

Not investment advice: residuals are relative to a model fit, and closing quotes can be stale.
