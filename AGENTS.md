# Project instructions

## Source of truth

- The static site lives in `site/`; it has no server-side component or production build step.
- `data/raw/*.csv` are vendored source files. Run `npm run preprocess` to regenerate
  `site/data/values.json`; do not hand-edit generated JSON.
- `data/curated/*.csv` are hand-transcribed/estimated (no downloadable source exists) — see
  `data/curated/README.md` for exact provenance per file. `npm run preprocess` also compiles these
  into `site/data/languages.json` via `scripts/preprocess_languages.py`; do not hand-edit that JSON.
- `npm test` is the verification gate. It rebuilds data, runs integrity tests, performs a headless
  browser smoke test (`tests/smoke.mjs`), and a viewport layout check (`tests/layout.mjs`) across
  390/768/1440/2000px on both pages. Screenshots land in the gitignored `test-artifacts/` and are
  uploaded as a CI artifact by `.github/workflows/pages.yml` — check that when a PR needs a visual
  look. Any new page or nav pattern should extend `tests/layout.mjs` rather than relying on a single
  viewport smoke test.
- The site has two views: the canvas field (`site/index.html`) and the languages explorer
  (`site/languages.html`, deep-linkable via `#languages`). They share `site/styles.css`; the
  explorer's own layout lives in `site/languages.css`. Keep the field's canvas rendering untouched
  when working on the explorer, and vice versa.
- The field's `.topbar` uses a fixed 4-column grid sized for its specific header contents (brand,
  search, surprise, one nav toggle). Don't reuse that grid on other pages with a different number of
  header children — `.topbar.static` (used by the languages page) instead lays out with flex and a
  `.view-toggle-group` nav so both view-toggle pills stay the same size regardless of viewport.
- Every value's field position (`x`/`y`/`width`/`height`/`font`) is precomputed in
  `scripts/preprocess.py` and shipped in `values.json`; `site/app.js` only reads and draws it. Don't
  reintroduce client-side bin-packing on load — it was the first thing profiled away for field-load
  performance. Cluster references (`parentId`/`level2Id`/`domainId`, and the `clusters` object's own
  keys) are short integers recoded from the source CSV's long UUID-shaped ids, purely to keep the
  shipped payload small — resolve them with `data.clusters[id]`, don't reintroduce the raw ids.
  `tests/layout.mjs` asserts the field becomes visible/interactive within a fixed budget as a guard
  against regressing this.

## Deployment

- GitHub Pages publishes `site/` through `.github/workflows/pages.yml`.
- Production is served below `/values-in-play/`. Keep runtime assets and fetches relative; a root
  path such as `/data/values.json` works locally but breaks on Pages.
- Keep future data overlays keyed by stable value IDs (a leaf value's `name` is its id — always
  unique, since the source CSV's leaf `cluster_id` is the name itself) and separate from canvas
  rendering.

## Maintaining this file

Record only durable project knowledge that is useful to nearly every future contributor. Prefer links
to authoritative files and commands over duplicating details that the code already makes clear.
