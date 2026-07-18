# Curated data: languages explorer

This directory holds hand-curated data for the "Languages" view, gathered on **2026-07-18**.
Unlike `data/raw` (an unmodified vendor CSV), every file here was assembled by hand from published
sources because no downloadable dataset exists for either source study. Each file below states its
confidence level: **transcribed** means the exact figure was printed in the source and copied
directly; **estimated** means the figure was read visually off a chart with no printed value, so it
carries real error (roughly ±0.1-0.15 on the WVS axes).

## `value_axis_definitions.csv`, `language_value_axes.csv`, `model_value_axes.csv` — transcribed

**Source:** Anthropic, ["Claude's values across models and languages"](https://www.anthropic.com/research/claude-values-models-languages)
(published 2026-07-13), plus its [appendix](https://cdn.sanity.io/files/4zrzovbb/website/02da7f28f74daa1be526d3ded451a4efc86bccdc.pdf).
Accessed 2026-07-18.

The study analyzed 309,815 Claude.ai conversations across 3 models (Sonnet 4.6, Opus 4.6, Opus 4.7)
and 20 languages, compressed into four axes via PCA on a 339-value taxonomy (itself a clustering of
the 3,307 values from *Values in the Wild*, the source behind the original canvas field on this
site). The four axes explain about 15% of value variation after controlling for conversation task,
topic, and user-expressed values.

**No machine-readable data file is published anywhere in the post or appendix.** The appendix (19
pages) is pure methodology: sampling, labeling prompts, PCA method, and limitations - it contains no
data tables. The per-language and per-model numbers exist only as printed labels inside chart images
embedded in the article (Figure 3 for models, Figure 4 for languages, the latter a 7-tab carousel
showing 3 languages at a time). Every number in `language_value_axes.csv` and `model_value_axes.csv`
was copied by hand from those printed chart labels (standard deviations from the cross-conversation
mean, to the two decimal places shown on the chart) and cross-checked against the article's prose
callouts (e.g. "Claude expresses the most warmth in Hindi and Arabic... rigor most in English and
Russian"). Distinctive-behavior bullets are the exact short phrases printed on each language/model's
card. `n_conversations` is the conversation count printed on each card. The four `deference_caution`
/ `warmth_rigor` / `depth_brevity` / `candor_execution` columns use the sign convention: **negative
= leaning toward the axis's first-named pole** (Deference, Warmth, Depth, Candor), **positive =
leaning toward the second-named pole** (Caution, Rigor, Brevity, Execution); `0.0` means the chart
showed that axis at "average" (no visible lean) for that language/model. `value_axis_definitions.csv`
transcribes the axis names, the top contributing values Anthropic lists per pole, and the one-line
definition given in the post text.

**What this is not:** raw conversation-level data, a complete list of all values considered, or a
statement of statistical significance per language. The study itself cautions that the axes are
correlational, capture only part of the variation, and that "more granular differences between
models and languages fall outside what they capture." Treat every number here as a *summary
statistic about a two-week May 2026 sample*, not a durable fact about a language or model.

## `wvs_country_scores.csv`, `language_country_mapping.csv` — estimated (visual approximation)

**Source:** the Inglehart-Welzel cultural map of the world, in the form reproduced at
["Why the U.S. and Belgium are culture buddies?"](https://wxrks.com/blog/world-cultural-map)
(image captioned "The Inglehart-Welzel World Cultural Map (2020)"), which the accompanying Wikipedia
article identifies as built on World Values Survey data. Accessed 2026-07-18.

This map plots each country by two factor scores derived from World Values Survey / European Values
Study responses: **Traditional vs. Secular-rational values** (y-axis) and **Survival vs.
Self-expression values** (x-axis). We could not locate a WVS Wave 7 (2017-2022) numeric coordinate
table published anywhere - not on the WVS website (a JavaScript application with no exposed data
export for the map), not in the Wikipedia article, and not in the commonly-cited Wikimedia Commons
SVG recreation of the map (which turned out to be Wave 4 data from 2004, with country names rendered
as unlabeled vector outlines rather than text, and no coordinate metadata attached to the plotted
points). The 2020-captioned chart used here is the clearest and most recent country-labeled version
we found with visible axis gridlines.

Every value in `wvs_country_scores.csv` was produced by opening that chart image at high
resolution, cropping around each country's plotted dot, and reading its position against the printed
axis gridlines by eye. **These are estimates, not transcriptions** - there is no printed number next
to each dot, only a position on a chart. Expect roughly ±0.1 to ±0.15 error on both axes; treat two
countries within ~0.2 of each other as indistinguishable rather than meaningfully ordered. We could
not locate several populous Arabic-speaking countries (Egypt, Saudi Arabia) on this particular chart,
so the Arabic anchor list below omits them.

`language_country_mapping.csv` maps each of the study's 20 languages to one or more "anchor
countries" whose WVS scores approximate that language's speaker population, so the explorer can
overlay a language's Claude value profile near its rough human-values neighborhood. **A language is
not a country, and this mapping is a simplification the explorer states outright wherever it
appears:**

- Single-country anchors (Hindi->India, Russian->Russia, Japanese->Japan, etc.) stand in for
  languages spoken far beyond one nation's borders and ignore internal variation within that country.
- Multi-country anchors (English, Arabic, Spanish, Portuguese) are the unweighted centroid of a
  small hand-picked set of major speaker countries, not a population-weighted average of every
  country where the language is spoken. The English and Spanish centroids in particular average
  countries from genuinely distant regions of the human-values map (e.g. Spanish averages Spain
  with Mexico, Argentina, and Colombia), which can produce a midpoint that resembles neither
  cluster well - the explorer surfaces the underlying country list next to any centroid so this is
  visible rather than hidden.
- No claim is made that a language's speakers hold the values plotted for its anchor country/ies, or
  that Claude's expressed-value lean in a language and human survey responses from that language's
  anchor country measure the same thing. The comparison is offered as a loose, labeled intuition
  prompt ("does this rhyme?"), not a validated correlation.

## Regenerating the site payload

`npm run preprocess` (via `scripts/preprocess_languages.py`) validates these CSVs and compiles them
into `site/data/languages.json`, the same generated-artifact pattern as `site/data/values.json`. Do
not hand-edit that JSON file; edit the CSVs here and re-run preprocessing instead.
