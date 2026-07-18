# Project instructions

## Source of truth

- The static site lives in `site/`; it has no server-side component or production build step.
- `data/raw/*.csv` are vendored source files. Run `npm run preprocess` to regenerate
  `site/data/values.json`; do not hand-edit generated JSON.
- `data/curated/*.csv` are hand-transcribed/estimated (no downloadable source exists) — see
  `data/curated/README.md` for exact provenance per file. `npm run preprocess` also compiles these
  into `site/data/languages.json` via `scripts/preprocess_languages.py`; do not hand-edit that JSON.
- `npm test` is the verification gate. It rebuilds data, runs integrity tests, and performs a
  headless browser smoke test.
- The site has two views: the canvas field (`site/index.html`) and the languages explorer
  (`site/languages.html`, deep-linkable via `#languages`). They share `site/styles.css`; the
  explorer's own layout lives in `site/languages.css`. Keep the field's canvas rendering untouched
  when working on the explorer, and vice versa.

## Deployment

- GitHub Pages publishes `site/` through `.github/workflows/pages.yml`.
- Production is served below `/values-in-play/`. Keep runtime assets and fetches relative; a root
  path such as `/data/values.json` works locally but breaks on Pages.
- Keep future data overlays keyed by stable value IDs and separate from canvas rendering.

## Maintaining this file

Record only durable project knowledge that is useful to nearly every future contributor. Prefer links
to authoritative files and commands over duplicating details that the code already makes clear.
