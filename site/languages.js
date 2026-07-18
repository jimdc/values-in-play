const SVG_NS = "http://www.w3.org/2000/svg";
const NEGATIVE_COLOR = [236, 132, 92]; // toward the axis's first-named pole
const POSITIVE_COLOR = [76, 125, 215]; // toward the axis's second-named pole

let data;
let axisById = new Map();
let selectedLanguage = null;
let heatmapState = { clustered: false, transposed: false };

const el = (tag, attrs = {}, children = []) => {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === "class") node.className = value;
    else if (key === "text") node.textContent = value;
    else node.setAttribute(key, value);
  }
  for (const child of children) node.append(child);
  return node;
};

const svgEl = (tag, attrs = {}) => {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  return node;
};

function axisLabel(axis) {
  return `${axis.negativePole} ↔ ${axis.positivePole}`;
}

const PROVENANCE_EXPLAINERS = {
  transcribed: {
    title: "Transcribed",
    body: "Anthropic hasn't released a data file for this study — every number here was copied by hand from labels printed on the study's own published charts.",
  },
  estimated: {
    title: "Estimated",
    body: "This position was read by eye off a published chart image with no printed number next to it — treat it as accurate to roughly ±0.1 to ±0.15, not exact.",
  },
};

let popoverEl = null;
let popoverHideTimer = null;
let activeAnchor = null;

function ensurePopover() {
  if (popoverEl) return popoverEl;
  popoverEl = el("div", { class: "info-popover", role: "tooltip", id: "info-popover" });
  popoverEl.hidden = true;
  document.body.append(popoverEl);
  popoverEl.addEventListener("mouseenter", () => clearTimeout(popoverHideTimer));
  popoverEl.addEventListener("mouseleave", schedulePopoverHide);
  return popoverEl;
}

function positionPopover(anchor) {
  const rect = anchor.getBoundingClientRect();
  popoverEl.style.visibility = "hidden";
  popoverEl.hidden = false;
  const popRect = popoverEl.getBoundingClientRect();
  let left = rect.left + rect.width / 2 - popRect.width / 2;
  left = Math.max(10, Math.min(left, window.innerWidth - popRect.width - 10));
  let top = rect.bottom + 10;
  if (top + popRect.height > window.innerHeight - 10) top = Math.max(10, rect.top - popRect.height - 10);
  popoverEl.style.left = `${left}px`;
  popoverEl.style.top = `${top}px`;
  popoverEl.style.visibility = "visible";
}

function showPopover(anchor, buildContent) {
  clearTimeout(popoverHideTimer);
  ensurePopover();
  activeAnchor = anchor;
  popoverEl.innerHTML = "";
  popoverEl.append(...buildContent());
  positionPopover(anchor);
  anchor.setAttribute("aria-expanded", "true");
}

function schedulePopoverHide() {
  popoverHideTimer = setTimeout(hidePopover, 140);
}

function hidePopover() {
  if (!popoverEl || popoverEl.hidden) return;
  popoverEl.hidden = true;
  if (activeAnchor) activeAnchor.setAttribute("aria-expanded", "false");
  activeAnchor = null;
}

function repositionActivePopover() {
  if (activeAnchor && popoverEl && !popoverEl.hidden) positionPopover(activeAnchor);
}

function wireTermTrigger(node, buildContent) {
  node.classList.add("term-trigger");
  node.setAttribute("tabindex", "0");
  if (node.tagName !== "BUTTON") node.setAttribute("role", "button");
  node.setAttribute("aria-expanded", "false");
  const open = () => showPopover(node, buildContent);
  node.addEventListener("mouseenter", open);
  node.addEventListener("mouseleave", schedulePopoverHide);
  node.addEventListener("focus", open);
  node.addEventListener("blur", schedulePopoverHide);
  node.addEventListener("click", (event) => {
    event.stopPropagation();
    open();
  });
  node.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") { event.preventDefault(); open(); }
    else if (event.key === "Escape") hidePopover();
  });
}

function polePopoverRow(poleName, topValues, emphasized) {
  const row = el("p", { class: `info-popover-pole${emphasized ? " is-emphasized" : ""}` });
  row.append(el("strong", { text: `${poleName}: ` }));
  row.append(document.createTextNode(topValues.slice(0, 3).join(", ")));
  return row;
}

function axisPopoverContent(axisId, emphasizePole) {
  const axis = axisById.get(axisId);
  const poles = el("div", { class: "info-popover-poles" }, [
    polePopoverRow(axis.negativePole, axis.negativeTopValues, emphasizePole === axis.negativePole),
    polePopoverRow(axis.positivePole, axis.positiveTopValues, emphasizePole === axis.positivePole),
  ]);
  return [
    el("div", { class: "info-popover-title", text: axisLabel(axis) }),
    el("p", { class: "info-popover-desc", text: axis.description }),
    poles,
  ];
}

function provenancePopoverContent(kind) {
  const info = PROVENANCE_EXPLAINERS[kind];
  return [
    el("div", { class: "info-popover-title", text: info.title }),
    el("p", { class: "info-popover-desc", text: info.body }),
  ];
}

function wireProvenanceBadges() {
  document.querySelectorAll("[data-prov]").forEach((node) => {
    wireTermTrigger(node, () => provenancePopoverContent(node.dataset.prov));
  });
}

function primerPoleChip(poleName, topValues) {
  const chip = el("div", { class: "axis-primer-pole" });
  chip.append(el("strong", { text: poleName }));
  chip.append(el("span", { text: topValues.slice(0, 3).join(", ") }));
  return chip;
}

function renderAxisPrimer() {
  const host = document.querySelector("#axis-primer-body");
  host.innerHTML = "";
  for (const axis of data.axes) {
    const card = el("div", { class: "axis-primer-card" });
    card.append(el("h3", { text: axisLabel(axis) }));
    card.append(el("p", { text: axis.description }));
    card.append(el("div", { class: "axis-primer-poles" }, [
      primerPoleChip(axis.negativePole, axis.negativeTopValues),
      el("span", { class: "axis-primer-vs", text: "↔" }),
      primerPoleChip(axis.positivePole, axis.positiveTopValues),
    ]));
    host.append(card);
  }
}

function wireAxisInfoButtons() {
  const xInfo = document.querySelector("#axis-x-info");
  const yInfo = document.querySelector("#axis-y-info");
  wireTermTrigger(xInfo, () => axisPopoverContent(document.querySelector("#axis-x").value));
  wireTermTrigger(yInfo, () => axisPopoverContent(document.querySelector("#axis-y").value));
}

function formatSigma(value) {
  const sign = value > 0 ? "+" : value < 0 ? "−" : "±";
  return `${sign}${Math.abs(value).toFixed(2)}σ`;
}

function poleForValue(axis, value) {
  if (value === 0) return null;
  return value < 0 ? axis.negativePole : axis.positivePole;
}

function diverging(value, maxAbs) {
  const t = Math.max(-1, Math.min(1, value / maxAbs));
  const base = t < 0 ? NEGATIVE_COLOR : POSITIVE_COLOR;
  const mix = Math.abs(t);
  const r = Math.round(255 + (base[0] - 255) * mix);
  const g = Math.round(255 + (base[1] - 255) * mix);
  const b = Math.round(255 + (base[2] - 255) * mix);
  return `rgb(${r}, ${g}, ${b})`;
}

function maxAbsAxisValue() {
  let max = 0;
  for (const language of data.languages) {
    for (const axisId of data.meta.axisOrder) max = Math.max(max, Math.abs(language.axes[axisId]));
  }
  return max;
}

function setLanguage(name, { updateHash = true } = {}) {
  const language = data.languages.find((item) => item.language === name);
  if (!language) return;
  selectedLanguage = language;
  renderProfileCard(language);
  renderCompare(language);
  highlightScatter(language);
  highlightHeatmapRow(language);
  if (updateHash) history.replaceState(null, "", `#language=${encodeURIComponent(language.language)}`);
}

function preventDuplicateAxisSelection() {
  const xSelect = document.querySelector("#axis-x");
  const ySelect = document.querySelector("#axis-y");
  for (const option of xSelect.options) option.disabled = option.value === ySelect.value;
  for (const option of ySelect.options) option.disabled = option.value === xSelect.value;
}

function renderAxisSelects() {
  const xSelect = document.querySelector("#axis-x");
  const ySelect = document.querySelector("#axis-y");
  for (const axis of data.axes) {
    xSelect.append(el("option", { value: axis.id, text: axisLabel(axis) }));
    ySelect.append(el("option", { value: axis.id, text: axisLabel(axis) }));
  }
  const [defaultX, defaultY] = data.meta.axisOrder.includes("warmth_rigor") && data.meta.axisOrder.includes("candor_execution")
    ? ["warmth_rigor", "candor_execution"]
    : data.meta.axisOrder;
  xSelect.value = defaultX;
  ySelect.value = defaultY;
  preventDuplicateAxisSelection();
  xSelect.addEventListener("change", () => { preventDuplicateAxisSelection(); renderScatter(); });
  ySelect.addEventListener("change", () => { preventDuplicateAxisSelection(); renderScatter(); });
}

function renderScatter() {
  const svg = document.querySelector("#lang-scatter");
  svg.innerHTML = "";
  const xAxisId = document.querySelector("#axis-x").value;
  const yAxisId = document.querySelector("#axis-y").value;
  const xAxis = axisById.get(xAxisId);
  const yAxis = axisById.get(yAxisId);

  const width = 640, height = 480, pad = 66;
  const domain = Math.ceil(maxAbsAxisValue() * 1.25 * 20) / 20; // round up to nearest 0.05
  const scaleX = (v) => pad + ((v + domain) / (2 * domain)) * (width - pad * 2);
  const scaleY = (v) => height - pad - ((v + domain) / (2 * domain)) * (height - pad * 2);

  for (let g = -domain; g <= domain + 1e-9; g += domain / 4) {
    svg.append(svgEl("line", { class: "scatter-grid-line", x1: scaleX(g), y1: pad, x2: scaleX(g), y2: height - pad }));
    svg.append(svgEl("line", { class: "scatter-grid-line", x1: pad, y1: scaleY(g), x2: width - pad, y2: scaleY(g) }));
  }
  svg.append(svgEl("line", { class: "scatter-axis-line", x1: scaleX(0), y1: pad, x2: scaleX(0), y2: height - pad }));
  svg.append(svgEl("line", { class: "scatter-axis-line", x1: pad, y1: scaleY(0), x2: width - pad, y2: scaleY(0) }));

  const labels = [
    { text: xAxis.negativePole, x: 14, y: scaleY(0) - 8, anchor: "start", axisId: xAxisId, pole: xAxis.negativePole },
    { text: xAxis.positivePole, x: width - 14, y: scaleY(0) - 8, anchor: "end", axisId: xAxisId, pole: xAxis.positivePole },
    { text: yAxis.positivePole, x: scaleX(0), y: pad - 14, anchor: "middle", axisId: yAxisId, pole: yAxis.positivePole },
    { text: yAxis.negativePole, x: scaleX(0), y: height - pad + 22, anchor: "middle", axisId: yAxisId, pole: yAxis.negativePole },
  ];
  for (const { text, x, y, anchor, axisId, pole } of labels) {
    const t = svgEl("text", { class: "scatter-axis-label", x, y, "text-anchor": anchor, "aria-label": `What does ${pole} mean?` });
    t.textContent = text;
    svg.append(t);
    wireTermTrigger(t, () => axisPopoverContent(axisId, pole));
  }

  for (const language of data.languages) {
    const cx = scaleX(language.axes[xAxisId]);
    const cy = scaleY(language.axes[yAxisId]);
    const dot = svgEl("circle", {
      class: "scatter-dot",
      cx, cy, r: 6,
      fill: "#4c7dd7",
      "data-language": language.language,
    });
    dot.addEventListener("click", () => setLanguage(language.language));
    svg.append(dot);
    const label = svgEl("text", { class: "scatter-label", x: cx + 9, y: cy + 3 });
    label.textContent = language.isoCode;
    svg.append(label);
  }
  svg.setAttribute("data-dot-count", String(svg.querySelectorAll(".scatter-dot").length));
  highlightScatter(selectedLanguage);
}

function highlightScatter(language) {
  const svg = document.querySelector("#lang-scatter");
  if (!svg) return;
  svg.querySelectorAll(".scatter-dot").forEach((dot) => {
    const isSelected = language && dot.dataset.language === language.language;
    dot.classList.toggle("is-selected", isSelected);
    dot.setAttribute("r", isSelected ? 8 : 6);
  });
  svg.querySelectorAll(".scatter-label").forEach((label) => {
    const isSelected = language && label.previousSibling?.dataset?.language === language.language;
    label.classList.toggle("is-selected", isSelected);
  });
}

function renderProfileCard(language) {
  const card = document.querySelector("#profile-card");
  card.innerHTML = "";
  if (!language) {
    card.append(el("p", { class: "empty-hint", text: "Click a language on the map or heatmap to see its profile." }));
    return;
  }
  const head = el("div", { class: "profile-card-head" }, [
    el("h3", { text: language.language }),
    el("span", { text: `${language.nConversations.toLocaleString()} conversations sampled` }),
  ]);
  card.append(head);

  const rows = el("div", { class: "axis-rows" });
  for (const axisId of data.meta.axisOrder) {
    const axis = axisById.get(axisId);
    const value = language.axes[axisId];
    const pole = poleForValue(axis, value);
    const track = el("div", { class: "axis-track" });
    const domain = 0.55;
    const pct = Math.min(50, (Math.abs(value) / domain) * 50);
    const fill = el("div", { class: "axis-fill" });
    if (value < 0) { fill.style.right = "50%"; fill.style.left = `${50 - pct}%`; }
    else if (value > 0) { fill.style.left = "50%"; fill.style.width = `${pct}%`; }
    else { fill.style.left = "50%"; fill.style.width = "0"; }
    fill.style.background = value < 0 ? "rgb(236, 132, 92)" : "rgb(76, 125, 215)";
    track.append(fill);
    if (value !== 0) {
      const pill = el("div", { class: "axis-value-pill", text: `${formatSigma(value)} ${pole}` });
      pill.style.left = value < 0 ? `${50 - pct}%` : `${50 + pct}%`;
      track.append(pill);
    }
    const negSpan = el("span", { class: `pole${pole === axis.negativePole ? " leaning" : ""}`, text: axis.negativePole });
    const posSpan = el("span", { class: `pole right${pole === axis.positivePole ? " leaning" : ""}`, text: axis.positivePole });
    wireTermTrigger(negSpan, () => axisPopoverContent(axisId, axis.negativePole));
    wireTermTrigger(posSpan, () => axisPopoverContent(axisId, axis.positivePole));
    const row = el("div", { class: "axis-row" }, [negSpan, track, posSpan]);
    rows.append(row);
  }
  card.append(rows);

  card.append(el("h3", { style: "font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#767a76;margin:20px 0 0;", text: "Distinctive behaviors" }));
  const list = el("ul", { class: "distinctive-list" });
  for (const behavior of language.distinctiveBehaviors) list.append(el("li", { text: behavior }));
  card.append(list);
}

function clusterOrder(languages) {
  const remaining = [...languages].sort(
    (a, b) => magnitude(b) - magnitude(a)
  );
  const ordered = [remaining.shift()];
  while (remaining.length) {
    const current = ordered[ordered.length - 1];
    let bestIndex = 0, bestDistance = Infinity;
    remaining.forEach((candidate, index) => {
      const dist = distance(current, candidate);
      if (dist < bestDistance) { bestDistance = dist; bestIndex = index; }
    });
    ordered.push(remaining.splice(bestIndex, 1)[0]);
  }
  return ordered;
}

function magnitude(language) {
  return Math.sqrt(data.meta.axisOrder.reduce((sum, axisId) => sum + language.axes[axisId] ** 2, 0));
}

function distance(a, b) {
  return Math.sqrt(data.meta.axisOrder.reduce((sum, axisId) => sum + (a.axes[axisId] - b.axes[axisId]) ** 2, 0));
}

function renderHeatmap() {
  const host = document.querySelector("#heatmap");
  host.innerHTML = "";
  const maxAbs = maxAbsAxisValue();
  const languages = heatmapState.clustered ? clusterOrder(data.languages) : [...data.languages].sort((a, b) => a.language.localeCompare(b.language));
  const axes = data.axes;

  if (!heatmapState.transposed) {
    host.style.gridTemplateColumns = `140px repeat(${axes.length}, minmax(58px, 1fr))`;
    host.append(el("div", { class: "hm-rowhead" }));
    for (const axis of axes) {
      const head = el("div", { class: "hm-colhead", text: axisLabel(axis) });
      wireTermTrigger(head, () => axisPopoverContent(axis.id));
      host.append(head);
    }
    for (const language of languages) {
      host.append(el("div", { class: "hm-rowhead", "data-language": language.language, text: language.language }));
      for (const axis of axes) {
        const value = language.axes[axis.id];
        const cell = el("div", { class: "hm-cell", "data-language": language.language, text: formatSigma(value) });
        cell.style.background = diverging(value, maxAbs);
        cell.addEventListener("click", () => setLanguage(language.language));
        host.append(cell);
      }
    }
  } else {
    host.style.gridTemplateColumns = `170px repeat(${languages.length}, minmax(48px, 1fr))`;
    host.append(el("div", { class: "hm-rowhead" }));
    for (const language of languages) host.append(el("div", { class: "hm-colhead", "data-language": language.language, text: language.isoCode }));
    for (const axis of axes) {
      const head = el("div", { class: "hm-rowhead", text: axisLabel(axis) });
      wireTermTrigger(head, () => axisPopoverContent(axis.id));
      host.append(head);
      for (const language of languages) {
        const value = language.axes[axis.id];
        const cell = el("div", { class: "hm-cell", "data-language": language.language, text: formatSigma(value) });
        cell.style.background = diverging(value, maxAbs);
        cell.addEventListener("click", () => setLanguage(language.language));
        host.append(cell);
      }
    }
  }
  highlightHeatmapRow(selectedLanguage);
}

function highlightHeatmapRow(language) {
  const host = document.querySelector("#heatmap");
  if (!host) return;
  host.querySelectorAll("[data-language]").forEach((node) => {
    node.classList.toggle("is-selected-row", Boolean(language) && node.dataset.language === language.language);
  });
}

function renderCompareMap() {
  const svg = document.querySelector("#wvs-map");
  svg.innerHTML = "";
  const width = 520, height = 480, pad = 50;
  const domainX = [-2.2, 2.2];
  const domainY = [-2.2, 2.2];
  const scaleX = (v) => pad + ((v - domainX[0]) / (domainX[1] - domainX[0])) * (width - pad * 2);
  const scaleY = (v) => height - pad - ((v - domainY[0]) / (domainY[1] - domainY[0])) * (height - pad * 2);

  svg.append(svgEl("line", { class: "scatter-axis-line", x1: scaleX(0), y1: pad, x2: scaleX(0), y2: height - pad }));
  svg.append(svgEl("line", { class: "scatter-axis-line", x1: pad, y1: scaleY(0), x2: width - pad, y2: scaleY(0) }));
  const axisLabels = [
    ["Survival", 14, scaleY(0) - 8, "start"],
    ["Self-expression", width - 14, scaleY(0) - 8, "end"],
    ["Secular-rational", scaleX(0), pad - 14, "middle"],
    ["Traditional", scaleX(0), height - pad + 22, "middle"],
  ];
  for (const [text, x, y, anchor] of axisLabels) {
    const t = svgEl("text", { class: "wvs-axis-label", x, y, "text-anchor": anchor });
    t.textContent = text;
    svg.append(t);
  }

  const anchorNames = selectedLanguage
    ? data.languageCountryMap.find((item) => item.language === selectedLanguage.language)?.anchorCountries ?? []
    : [];
  for (const country of data.wvsCountries) {
    const isAnchor = anchorNames.includes(country.country);
    const cx = scaleX(country.survivalSelfExpression);
    const cy = scaleY(country.traditionalSecular);
    svg.append(svgEl("circle", { class: `wvs-dot${isAnchor ? " is-anchor" : ""}`, cx, cy, r: isAnchor ? 6 : 3.5 }));
    if (isAnchor) {
      const label = svgEl("text", { class: "wvs-label is-anchor", x: cx + 8, y: cy + 3 });
      label.textContent = country.country;
      svg.append(label);
    }
  }
}

function renderCompare(language) {
  renderCompareMap();
  const note = document.querySelector("#compare-note");
  const mapping = data.languageCountryMap.find((item) => item.language === language.language);
  if (!mapping) { note.innerHTML = ""; return; }
  const { wvs, anchorCountries } = mapping;
  note.innerHTML = `
    <strong>${language.language}'s anchor countries</strong> average
    ${wvs.traditionalSecular >= 0 ? "+" : ""}${wvs.traditionalSecular.toFixed(2)} on
    Traditional ↔ Secular-rational and
    ${wvs.survivalSelfExpression >= 0 ? "+" : ""}${wvs.survivalSelfExpression.toFixed(2)} on
    Survival ↔ Self-expression.
    <p class="anchor-list">Anchor countries averaged: ${anchorCountries.join(", ")}.</p>
  `;
}

function renderModelCards() {
  const host = document.querySelector("#model-cards");
  host.innerHTML = "";
  for (const model of data.models) {
    const card = el("div", { class: "model-card" });
    card.append(el("h3", { text: model.model }));
    card.append(el("span", { text: `${model.nConversations.toLocaleString()} conversations sampled` }));
    const rows = el("div", { class: "axis-rows" });
    for (const axisId of data.meta.axisOrder) {
      const axis = axisById.get(axisId);
      const value = model.axes[axisId];
      const pole = poleForValue(axis, value);
      const domain = 0.3;
      const pct = Math.min(50, (Math.abs(value) / domain) * 50);
      const track = el("div", { class: "axis-track" });
      const fill = el("div", { class: "axis-fill" });
      if (value < 0) { fill.style.right = "50%"; fill.style.left = `${50 - pct}%`; }
      else if (value > 0) { fill.style.left = "50%"; fill.style.width = `${pct}%`; }
      else { fill.style.left = "50%"; fill.style.width = "0"; }
      fill.style.background = value < 0 ? "rgb(236, 132, 92)" : "rgb(76, 125, 215)";
      track.append(fill);
      if (value !== 0) {
        const pill = el("div", { class: "axis-value-pill", text: `${formatSigma(value)} ${pole}` });
        pill.style.left = value < 0 ? `${50 - pct}%` : `${50 + pct}%`;
        track.append(pill);
      }
      const negSpan = el("span", { class: `pole${pole === axis.negativePole ? " leaning" : ""}`, text: axis.negativePole });
      const posSpan = el("span", { class: `pole right${pole === axis.positivePole ? " leaning" : ""}`, text: axis.positivePole });
      wireTermTrigger(negSpan, () => axisPopoverContent(axisId, axis.negativePole));
      wireTermTrigger(posSpan, () => axisPopoverContent(axisId, axis.positivePole));
      rows.append(el("div", { class: "axis-row" }, [negSpan, track, posSpan]));
    }
    card.append(rows);
    const list = el("ul", { class: "distinctive-list" });
    for (const behavior of model.distinctiveBehaviors) list.append(el("li", { text: behavior }));
    card.append(list);
    host.append(card);
  }
}

function wireHeatmapControls() {
  const clusterBtn = document.querySelector("#cluster-toggle");
  const transposeBtn = document.querySelector("#transpose-toggle");
  clusterBtn.addEventListener("click", () => {
    heatmapState.clustered = !heatmapState.clustered;
    clusterBtn.setAttribute("aria-pressed", String(heatmapState.clustered));
    renderHeatmap();
  });
  transposeBtn.addEventListener("click", () => {
    heatmapState.transposed = !heatmapState.transposed;
    transposeBtn.setAttribute("aria-pressed", String(heatmapState.transposed));
    renderHeatmap();
  });
}

function wireGlobalPopoverDismissal() {
  document.addEventListener("click", (event) => {
    if (!popoverEl || popoverEl.hidden) return;
    if (popoverEl.contains(event.target)) return;
    if (activeAnchor && activeAnchor.contains(event.target)) return;
    hidePopover();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") hidePopover();
  });
  window.addEventListener("scroll", repositionActivePopover, { passive: true, capture: true });
}

async function init() {
  const response = await fetch("./data/languages.json");
  if (!response.ok) throw new Error(`Could not load language data (${response.status})`);
  data = await response.json();
  axisById = new Map(data.axes.map((axis) => [axis.id, axis]));

  renderAxisPrimer();
  renderAxisSelects();
  wireAxisInfoButtons();
  renderScatter();
  renderHeatmap();
  renderModelCards();
  wireHeatmapControls();
  wireProvenanceBadges();
  wireGlobalPopoverDismissal();

  const hash = new URLSearchParams(location.hash.slice(1));
  const initial = hash.get("language");
  const startLanguage = data.languages.find((item) => item.language === initial)?.language || "Hindi";
  setLanguage(startLanguage, { updateHash: false });
  document.body.dataset.ready = "true";
}

init().catch((error) => {
  console.error(error);
  const card = document.querySelector("#profile-card");
  if (card) card.innerHTML = `<p class="empty-hint">Could not load language data: ${error.message}</p>`;
});
