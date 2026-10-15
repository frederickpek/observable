# Local data

The web app reads everything from `web/public/data/` (served as `/data/...`). That folder is
git-ignored and is **not** the same as the deployed site's data, which lives on the `data`
branch and is rewritten by the nightly GitHub Action. There are two ways to fill it.

## Option A — generate your own snapshot

Fast, self-contained, but only has today's close (no history, so IV rank and the history
chart stay empty).

```sh
.venv/bin/python -m pipeline.run --out web/public/data                  # all tickers, ~2 min
.venv/bin/python -m pipeline.run --out web/public/data --tickers SPY    # just one
```

Re-running on a later day appends to `metrics.json` and adds a new chain file, so a local
history builds up too if you run it regularly.

## Option B — use the deployed history

Check out the `data` branch into its own folder and point `web/public/data` at it:

```sh
git fetch origin data
git worktree add --detach data-store origin/data
rm -rf web/public/data && ln -s ../../data-store web/public/data
cd web && npm run dev
```

You now see exactly what the live site sees, including all stored history.

To pick up the latest nightly snapshot later:

```sh
git fetch origin data && git -C data-store checkout --detach origin/data
```

To go back to Option A:

```sh
rm web/public/data && git worktree remove data-store
```

## Notes

- **Don't commit in `data-store/`.** The nightly job force-pushes the `data` branch as a
  single fresh commit, so anything pushed there by hand is overwritten the next morning.
- Running the pipeline with `--out data-store` adds today's snapshot on top of the deployed
  history locally — handy for testing pipeline changes against real history without pushing.
- Both `web/public/data` and `data-store/` are git-ignored, so neither shows up in `git status`.
