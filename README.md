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

`.github/workflows/nightly.yml` (all times SGT, Tue–Sat, i.e. after each US trading day):

| When  | What |
|-------|------|
| 06:00 | Sync: fetch every ticker missing for the latest session → push `data` → deploy |
| 08:00, 10:00, 12:00 | Check: fetch only tickers still missing; no-op (no deploy) if complete. The 12:00 run fails red if anything is still missing |

Reliability rules in the pipeline:
- Transient errors (timeouts, 5xx, 429, garbled JSON) retry twice with backoff (~3s, ~9s); 4xx fails immediately.
- Each ticker (and each expiry within it) is isolated; one failure never stops the rest.
- A chain whose date is older than the latest session is rejected as stale, so a lagging CDN is caught by the next check.
- If the price-history call fails, the snapshot is saved but marked partial, and the next check redoes it.
- Files are written atomically; an interrupted run leaves the ticker "missing", never half-written.

Manual runs (**Actions → Run workflow**): `fill-missing` (default), `refetch-all`, or `deploy-only`.
Pushes to `web/**` on `master` redeploy the site from existing data.

One-time setup: **Settings → Pages → Source: GitHub Actions**.

## Local development

```sh
python3 -m venv .venv && .venv/bin/pip install -r pipeline/requirements.txt
.venv/bin/python -m pipeline.run --out web/public/data          # all tickers, ~3 min
.venv/bin/python -m pipeline.run --out web/public/data --tickers AAPL SPY
.venv/bin/python -m pipeline.run --out web/public/data --only-missing   # gap-fill only

cd web && npm install && npm run dev
```

Edit the universe in `pipeline/config.py`.

The local site reads `web/public/data/`, which is separate from the deployed data. See
[docs/local-data.md](docs/local-data.md) to generate your own or mirror the deployed history.

Commit messages are checked by `.githooks/commit-msg`; enable it with
`git config core.hooksPath .githooks`.

Not investment advice: residuals are relative to a model fit, and closing quotes can be stale.
