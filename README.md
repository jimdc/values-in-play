# Values in Play

**[Live site](https://jimdc.github.io/values-in-play/)**

Values in Play is a playful, browse-first explorer for the values Claude expressed in real
conversations. It turns Anthropic's 3,307-value taxonomy into a dense canvas field: drag to roam,
scroll to zoom, click through value families, search the hierarchy, or ask for a rare surprise.

The site is static, dependency-light, and designed to run from the GitHub Pages
`/values-in-play/` path without a build step.

## Run locally

Install the test dependency, start a static server, and open the address it prints:

```bash
npm install
npm run serve
```

The one-line server command, after dependencies are installed, is `npm run serve`.

## Verify

```bash
npm test
```

That command regenerates the browser data, runs three data-integrity checks, and launches a
headless Chromium smoke test that confirms the full field renders and live search filters it.
If Chromium is not already installed for Playwright, run `npx playwright install chromium` once.

## Regenerate the data

The published source files are vendored unchanged in [`data/raw`](./data/raw). Rebuild the compact,
browser-ready JSON with:

```bash
npm run preprocess
```

[`scripts/preprocess.py`](./scripts/preprocess.py) validates every leaf's path to one of the five
domains, joins conversation frequencies to the taxonomy, and assigns deterministic world
coordinates. It writes [`site/data/values.json`](./site/data/values.json). Stable value IDs and a
single generated payload provide a clean seam for future overlays without coupling them to the
canvas renderer.

## Dataset and interpretation

The data comes from Anthropic's
[Values in the Wild dataset](https://huggingface.co/datasets/Anthropic/values-in-the-wild) and the
accompanying paper,
[*Values in the Wild: Discovering and Analyzing Values in Real-World Language Model Interactions*](https://assets.anthropic.com/m/18d20cca3cde3503/original/Values-in-the-Wild-Paper.pdf).
Anthropic extracted and organized values expressed by Claude across roughly 308,000 real-world
conversations using a privacy-preserving methodology.

The dataset's `pct_convos` measure means that Claude's response was detected as demonstrating a
value in that percentage of sampled conversations; it does not measure whether the response
successfully embodied that value. Values can co-occur, so those percentages do not sum to 100%.
The extracted labels, descriptions, and hierarchy are model-generated, value inference is
subjective, and the source may contain inaccuracies.

## Languages explorer

Alongside the field, [`site/languages.html`](./site/languages.html) is a second view — reachable via
the "Languages" toggle in the top bar, or the deep link `#languages` — that explores a companion
question: how does the mix of values Claude expresses shift across languages and models, and does
that rhyme with how people in different countries describe their own values?

It's built from two sources, both hand-curated because neither publishes a downloadable dataset:

- **Anthropic, [_Claude's values across models and languages_](https://www.anthropic.com/research/claude-values-models-languages)**
  (Jul 2026) — the study behind the four value axes (Deference vs. Caution, Warmth vs. Rigor, Depth
  vs. Brevity, Candor vs. Execution), transcribed by hand from the article's published charts for
  all 20 languages and all 3 models it covers.
- **The [Inglehart–Welzel cultural map of the world](https://en.wikipedia.org/wiki/Inglehart%E2%80%93Welzel_cultural_map_of_the_world)**
  (World Values Survey) — used as a loosely-caveated "does this rhyme?" comparison layer, with
  country positions estimated visually from the published chart and each language mapped to a small,
  explicitly-listed set of anchor countries.

See [`data/curated/README.md`](./data/curated/README.md) for exactly what was measured, transcribed,
and estimated, and on what date. `scripts/preprocess_languages.py` (run as part of `npm run
preprocess`) compiles the curated CSVs into [`site/data/languages.json`](./site/data/languages.json);
as with the field's data, edit the CSVs, not the generated JSON.

## License and attribution

The vendored dataset, hierarchy text, and derived JSON are attributed to Anthropic and used under
[Creative Commons Attribution 4.0](https://creativecommons.org/licenses/by/4.0/) (CC BY 4.0).
See [`data/raw/README.md`](./data/raw/README.md) for the pinned source revision. No separate license
has been granted for the original site code unless one is added to this repository.

## Deployment

[`.github/workflows/pages.yml`](./.github/workflows/pages.yml) tests the project and publishes the
`site/` directory to GitHub Pages whenever `main` changes. All runtime URLs are relative so the
site works both at localhost and under `/values-in-play/`.
