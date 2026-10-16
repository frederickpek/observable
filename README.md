# observable

End-of-day options analytics for liquid US stocks and ETFs. After each US close, option chains are
snapshotted from Cboe's free delayed-quote feed, re-implied, and fitted with an SVI smile so you
can browse implied vol, skew, term structure, and realized vol in one place.

## Data storage

Generated data lives on an orphan **`data`** branch that is force-pushed as a single commit
each night, so the repo never accumulates history of large JSON files:

- `chains/<SYM>/<date>.json` — full fitted chain, last 60 trading days
- `metrics.json` — one summary row per ticker per day, kept forever
- `index.json` — available tickers/dates and the latest summary

## Nightly job

A GitHub Actions workflow (`.github/workflows/nightly.yml`) runs after each US trading day: it
syncs any missing tickers for the latest session, pushes the `data` branch, and deploys the site.
Pushes to `web/**` on `master` redeploy from existing data. One-time setup: **Settings → Pages →
Source: GitHub Actions**.

## Local development

```sh
python3 -m venv .venv && .venv/bin/pip install -r pipeline/requirements.txt
.venv/bin/python -m pipeline.run --out web/public/data          # all tickers, ~3 min
.venv/bin/python -m pipeline.run --out web/public/data --tickers AAPL SPY
.venv/bin/python -m pipeline.run --out web/public/data --only-missing   # gap-fill only

cd web && npm install && npm run dev
```

Edit the universe in `pipeline/config.py`.

The local site reads `web/public/data/`, which is separate from the deployed data. See [docs/local-data.md](docs/local-data.md) to generate your own or mirror the deployed history.

Not investment advice: closing quotes can be stale and surfaces are model-assisted views of the chain.
