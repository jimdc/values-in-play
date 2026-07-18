const COLORS = {
  Practical: "#ef6848",
  Epistemic: "#4c7dd7",
  Social: "#9b65d4",
  Protective: "#2ca176",
  Personal: "#dda72d",
};

const canvas = document.querySelector("#field");
const context = canvas.getContext("2d", { alpha: false });
const minimap = document.querySelector("#minimap");
const mapContext = minimap.getContext("2d");
const search = document.querySelector("#search");
const detail = document.querySelector("#detail");
const detailContent = document.querySelector("#detail-content");
const resultCount = document.querySelector("#result-count");
const resultLabel = document.querySelector("#result-label");
const empty = document.querySelector("#empty");
const announcement = document.querySelector("#announcement");

let data;
let values = [];
let matches = [];
let valueById = new Map();
let childrenByParent = new Map();
let valuesByLevelTwo = new Map();
let visibleValues = [];
let selected = null;
let hovered = null;
let pointerDown = null;
let moved = false;
let drawQueued = false;
let viewport = { width: innerWidth, height: innerHeight, dpr: devicePixelRatio || 1 };
let camera = { x: 1330, y: 1010, scale: 0.72 };
let savedCamera = { ...camera };

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const formatPct = (value) => value < 0.01 ? `${value.toFixed(3)}%` : value < 1 ? `${value.toFixed(2)}%` : `${value.toFixed(1)}%`;
const roundedRect = (ctx, x, y, width, height, radius) => {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
};

function worldToScreen(x, y) {
  return {
    x: (x - camera.x) * camera.scale + viewport.width / 2,
    y: (y - camera.y) * camera.scale + viewport.height / 2,
  };
}

function screenToWorld(x, y) {
  return {
    x: (x - viewport.width / 2) / camera.scale + camera.x,
    y: (y - viewport.height / 2) / camera.scale + camera.y,
  };
}

function resize() {
  viewport = { width: innerWidth, height: innerHeight, dpr: devicePixelRatio || 1 };
  canvas.width = Math.round(viewport.width * viewport.dpr);
  canvas.height = Math.round(viewport.height * viewport.dpr);
  canvas.style.width = `${viewport.width}px`;
  canvas.style.height = `${viewport.height}px`;
  queueDraw();
}

function queueDraw() {
  if (drawQueued || !data) return;
  drawQueued = true;
  requestAnimationFrame(() => {
    drawQueued = false;
    draw();
  });
}

function draw() {
  const { width, height, dpr } = viewport;
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  context.fillStyle = "#f5efe4";
  context.fillRect(0, 0, width, height);

  const bounds = {
    left: camera.x - width / camera.scale / 2 - 180,
    right: camera.x + width / camera.scale / 2 + 180,
    top: camera.y - height / camera.scale / 2 - 100,
    bottom: camera.y + height / camera.scale / 2 + 100,
  };

  for (const domain of data.domains) {
    const [x, y, w, h] = domain.rect;
    const p = worldToScreen(x, y);
    context.save();
    context.globalAlpha = 0.105;
    context.fillStyle = COLORS[domain.name];
    roundedRect(context, p.x, p.y, w * camera.scale, h * camera.scale, 46 * camera.scale);
    context.fill();
    context.globalAlpha = 0.34;
    context.strokeStyle = COLORS[domain.name];
    context.lineWidth = 1;
    context.stroke();
    context.restore();

    if (camera.scale > 0.36) {
      context.fillStyle = COLORS[domain.name];
      context.globalAlpha = 0.78;
      context.font = `800 ${clamp(21 * camera.scale, 11, 24)}px Inter, system-ui, sans-serif`;
      context.textBaseline = "top";
      context.fillText(`${domain.name.toUpperCase()} · ${domain.count.toLocaleString()}`, p.x + 24 * camera.scale, p.y + 21 * camera.scale);
      context.globalAlpha = 1;
    }
  }

  if (camera.scale > 0.48) {
    for (const region of data.regions) {
      if (region.x > bounds.right || region.x + region.width < bounds.left || region.y > bounds.bottom || region.y + region.height < bounds.top) continue;
      const p = worldToScreen(region.x, region.y);
      context.fillStyle = COLORS[region.domain];
      context.globalAlpha = 0.42;
      context.font = `750 ${clamp(12 * camera.scale, 8, 14)}px Inter, system-ui, sans-serif`;
      context.textBaseline = "top";
      context.fillText(region.name.toUpperCase(), p.x + 3, p.y + 4, Math.max(80, region.width * camera.scale - 10));
    }
    context.globalAlpha = 1;
  }

  visibleValues = [];
  const active = matches;
  for (const value of active) {
    if (value.x + value.width / 2 < bounds.left || value.x - value.width / 2 > bounds.right || value.y + value.height / 2 < bounds.top || value.y - value.height / 2 > bounds.bottom) continue;
    visibleValues.push(value);
    const p = worldToScreen(value.x, value.y);
    const isSelected = selected?.id === value.id;
    const isHovered = hovered?.id === value.id;
    const screenWidth = value.width * camera.scale;
    const screenHeight = value.height * camera.scale;

    if (isSelected || isHovered) {
      context.save();
      context.shadowColor = "rgba(28, 36, 38, .18)";
      context.shadowBlur = 16;
      context.fillStyle = isSelected ? COLORS[value.domain] : "rgba(255, 253, 247, .98)";
      roundedRect(context, p.x - screenWidth / 2, p.y - screenHeight / 2, screenWidth, screenHeight, screenHeight / 2);
      context.fill();
      context.restore();
    }

    context.fillStyle = isSelected ? "#fff" : "#1a2529";
    context.globalAlpha = isSelected || isHovered ? 1 : 0.84;
    context.font = `${value.pctConvos > 1 ? 760 : 620} ${clamp(value.font * camera.scale, 3, 31)}px "Arial Rounded MT Bold", Inter, system-ui, sans-serif`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(value.name, p.x, p.y);
    context.globalAlpha = 1;

    if (!isSelected && camera.scale > 0.54) {
      context.beginPath();
      context.arc(p.x - screenWidth / 2 + 3, p.y, clamp(2.1 * camera.scale, 1.25, 2.4), 0, Math.PI * 2);
      context.fillStyle = COLORS[value.domain];
      context.fill();
    }
  }

  canvas.dataset.renderedCount = String(active.length);
  canvas.dataset.visibleCount = String(visibleValues.length);
  canvas.dataset.ready = "true";
  drawMinimap();
}

function drawMinimap() {
  const width = minimap.width;
  const height = minimap.height;
  const scale = Math.min(width / data.meta.world.width, height / data.meta.world.height);
  const offsetX = (width - data.meta.world.width * scale) / 2;
  const offsetY = (height - data.meta.world.height * scale) / 2;
  mapContext.clearRect(0, 0, width, height);
  for (const domain of data.domains) {
    const [x, y, w, h] = domain.rect;
    mapContext.fillStyle = `${COLORS[domain.name]}55`;
    roundedRect(mapContext, offsetX + x * scale, offsetY + y * scale, w * scale, h * scale, 4);
    mapContext.fill();
  }
  const worldWidth = viewport.width / camera.scale;
  const worldHeight = viewport.height / camera.scale;
  mapContext.strokeStyle = "#182126";
  mapContext.lineWidth = 2;
  mapContext.strokeRect(
    offsetX + (camera.x - worldWidth / 2) * scale,
    offsetY + (camera.y - worldHeight / 2) * scale,
    worldWidth * scale,
    worldHeight * scale,
  );
}

function hitTest(screenX, screenY) {
  const point = screenToWorld(screenX, screenY);
  for (let index = visibleValues.length - 1; index >= 0; index -= 1) {
    const value = visibleValues[index];
    if (Math.abs(point.x - value.x) <= value.width / 2 && Math.abs(point.y - value.y) <= value.height / 2) return value;
  }
  return null;
}

function applySearch({ fit = true } = {}) {
  const query = search.value.trim().toLowerCase();
  matches = query ? values.filter((value) => value.search.includes(query)) : values;
  resultCount.textContent = matches.length.toLocaleString();
  resultLabel.textContent = query ? (matches.length === 1 ? "matching value" : "matching values") : "values to wander";
  empty.hidden = matches.length !== 0;
  if (fit && query && matches.length) fitToValues(matches);
  if (!query && fit) camera = { ...savedCamera };
  announcement.textContent = `${matches.length.toLocaleString()} values match ${query || "the full collection"}.`;
  queueDraw();
}

function fitToValues(items) {
  const minX = Math.min(...items.map((value) => value.x - value.width / 2));
  const maxX = Math.max(...items.map((value) => value.x + value.width / 2));
  const minY = Math.min(...items.map((value) => value.y - value.height / 2));
  const maxY = Math.max(...items.map((value) => value.y + value.height / 2));
  const availableWidth = selected && viewport.width > 820 ? viewport.width - 440 : viewport.width;
  camera.x = (minX + maxX) / 2;
  camera.y = (minY + maxY) / 2;
  camera.scale = clamp(Math.min((availableWidth - 140) / Math.max(100, maxX - minX), (viewport.height - 180) / Math.max(100, maxY - minY)), 0.28, 2.5);
}

function focusValue(value, { updateHash = true } = {}) {
  selected = value;
  hovered = null;
  const panelOffset = viewport.width > 820 ? 210 / camera.scale : 0;
  camera.x = value.x + panelOffset;
  camera.y = value.y;
  camera.scale = Math.max(camera.scale, 1.05);
  renderDetail(value);
  detail.classList.add("open");
  detail.setAttribute("aria-hidden", "false");
  if (updateHash) history.replaceState(null, "", `#value=${encodeURIComponent(value.id)}`);
  announcement.textContent = `Selected ${value.name}, in ${value.domain} values.`;
  queueDraw();
}

function renderDetail(value) {
  const parent = data.clusters[value.parentId];
  const levelTwo = data.clusters[value.level2Id];
  const domain = data.clusters[value.domainId];
  const siblings = (childrenByParent.get(value.parentId) || [])
    .filter((item) => item.id !== value.id)
    .sort((a, b) => Math.abs(a.pctConvos - value.pctConvos) - Math.abs(b.pctConvos - value.pctConvos))
    .slice(0, 8);
  const siblingIds = new Set(siblings.map((item) => item.id));
  const nearby = (valuesByLevelTwo.get(value.level2Id) || [])
    .filter((item) => item.parentId !== value.parentId && !siblingIds.has(item.id))
    .sort((a, b) => Math.abs(a.pctConvos - value.pctConvos) - Math.abs(b.pctConvos - value.pctConvos))
    .slice(0, 5);

  detail.style.setProperty("--domain", COLORS[value.domain]);
  detailContent.innerHTML = `
    <span class="domain-chip">${escapeHtml(value.domain)}</span>
    <h2>${escapeHtml(value.name)}</h2>
    <p class="context">Part of <strong>${escapeHtml(parent.name)}</strong>: ${escapeHtml(parent.description || levelTwo.description)}</p>
    <div class="breadcrumb" aria-label="Taxonomy path">
      ${[domain, levelTwo, parent].map((node, index) => `${index ? '<span aria-hidden="true">›</span>' : ''}<button type="button" data-search="${escapeAttribute(node.name)}">${escapeHtml(node.name)}</button>`).join("")}
    </div>
    <div class="metrics">
      <div class="metric"><strong>${formatPct(value.pctConvos)}</strong><span>of sampled conversations</span></div>
      <div class="metric"><strong>${formatPct(value.pctExpressions)}</strong><span>of all value expressions</span></div>
    </div>
    <h3>Siblings in this family</h3>
    <div class="value-links">${siblings.map(valueButton).join("") || "<span>No siblings listed.</span>"}</div>
    <h3>A little farther afield</h3>
    <div class="value-links">${nearby.map(valueButton).join("")}</div>
    <p class="detail-note">The source taxonomy describes clusters, not individual leaf values. This context comes from the closest described cluster.</p>
  `;
}

function valueButton(value) {
  return `<button type="button" data-value="${escapeAttribute(value.id)}">${escapeHtml(value.name)}</button>`;
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}

function escapeAttribute(text) {
  return escapeHtml(text);
}

function closeDetail() {
  selected = null;
  detail.classList.remove("open");
  detail.setAttribute("aria-hidden", "true");
  history.replaceState(null, "", location.pathname + location.search);
  queueDraw();
}

function surprise() {
  search.value = "";
  matches = values;
  const rare = [...values].sort((a, b) => a.pctConvos - b.pctConvos).slice(0, Math.floor(values.length * 0.66));
  const weights = rare.map((value) => 1 / Math.sqrt(value.pctConvos + 0.002));
  let target = Math.random() * weights.reduce((sum, weight) => sum + weight, 0);
  let choice = rare[0];
  for (let index = 0; index < rare.length; index += 1) {
    target -= weights[index];
    if (target <= 0) { choice = rare[index]; break; }
  }
  resultCount.textContent = values.length.toLocaleString();
  resultLabel.textContent = "values to wander";
  focusValue(choice);
}

canvas.addEventListener("pointerdown", (event) => {
  canvas.setPointerCapture(event.pointerId);
  pointerDown = { x: event.clientX, y: event.clientY, cameraX: camera.x, cameraY: camera.y };
  moved = false;
  canvas.classList.add("dragging");
});

canvas.addEventListener("pointermove", (event) => {
  if (pointerDown) {
    const dx = event.clientX - pointerDown.x;
    const dy = event.clientY - pointerDown.y;
    if (Math.hypot(dx, dy) > 4) moved = true;
    camera.x = pointerDown.cameraX - dx / camera.scale;
    camera.y = pointerDown.cameraY - dy / camera.scale;
    queueDraw();
    return;
  }
  const next = hitTest(event.clientX, event.clientY);
  if (next?.id !== hovered?.id) {
    hovered = next;
    canvas.style.cursor = next ? "pointer" : "grab";
    queueDraw();
  }
});

canvas.addEventListener("pointerup", (event) => {
  canvas.releasePointerCapture(event.pointerId);
  canvas.classList.remove("dragging");
  if (!moved) {
    const value = hitTest(event.clientX, event.clientY);
    if (value) focusValue(value);
  } else if (!search.value) {
    savedCamera = { ...camera };
  }
  pointerDown = null;
});

canvas.addEventListener("pointercancel", () => { pointerDown = null; canvas.classList.remove("dragging"); });
canvas.addEventListener("pointerleave", () => { if (!pointerDown) { hovered = null; queueDraw(); } });
canvas.addEventListener("wheel", (event) => {
  event.preventDefault();
  const before = screenToWorld(event.clientX, event.clientY);
  camera.scale = clamp(camera.scale * Math.exp(-event.deltaY * 0.0012), 0.22, 3.2);
  const after = screenToWorld(event.clientX, event.clientY);
  camera.x += before.x - after.x;
  camera.y += before.y - after.y;
  if (!search.value) savedCamera = { ...camera };
  queueDraw();
}, { passive: false });

minimap.addEventListener("pointerdown", (event) => {
  const rect = minimap.getBoundingClientRect();
  const scaleX = minimap.width / rect.width;
  const scaleY = minimap.height / rect.height;
  const x = (event.clientX - rect.left) * scaleX;
  const y = (event.clientY - rect.top) * scaleY;
  const scale = Math.min(minimap.width / data.meta.world.width, minimap.height / data.meta.world.height);
  const offsetX = (minimap.width - data.meta.world.width * scale) / 2;
  const offsetY = (minimap.height - data.meta.world.height * scale) / 2;
  camera.x = clamp((x - offsetX) / scale, 0, data.meta.world.width);
  camera.y = clamp((y - offsetY) / scale, 0, data.meta.world.height);
  if (!search.value) savedCamera = { ...camera };
  queueDraw();
});

search.addEventListener("input", () => applySearch());
document.querySelector("#clear-search").addEventListener("click", () => { search.value = ""; search.focus(); applySearch(); });
document.querySelector("#surprise").addEventListener("click", surprise);
document.querySelector("#detail-close").addEventListener("click", closeDetail);
detail.addEventListener("click", (event) => {
  const valueButton = event.target.closest("[data-value]");
  if (valueButton) focusValue(valueById.get(valueButton.dataset.value));
  const searchButton = event.target.closest("[data-search]");
  if (searchButton) { search.value = searchButton.dataset.search; applySearch(); closeDetail(); }
});

const about = document.querySelector("#about");
document.querySelector("#about-open").addEventListener("click", () => about.showModal());
document.querySelector("#about-close").addEventListener("click", () => about.close());
about.addEventListener("click", (event) => { if (event.target === about) about.close(); });

document.addEventListener("keydown", (event) => {
  if (event.key === "/" && document.activeElement !== search) { event.preventDefault(); search.focus(); }
  if (event.key === "Escape") { if (about.open) about.close(); else if (selected) closeDetail(); else if (search.value) { search.value = ""; applySearch(); } }
});

addEventListener("resize", resize);

async function init() {
  if (location.hash === "#languages") {
    location.replace("./languages.html");
    return;
  }
  const response = await fetch("./data/values.json");
  if (!response.ok) throw new Error(`Could not load values (${response.status})`);
  data = await response.json();
  values = data.values;
  matches = values;
  valueById = new Map(values.map((value) => [value.id, value]));
  for (const value of values) {
    if (!childrenByParent.has(value.parentId)) childrenByParent.set(value.parentId, []);
    childrenByParent.get(value.parentId).push(value);
    if (!valuesByLevelTwo.has(value.level2Id)) valuesByLevelTwo.set(value.level2Id, []);
    valuesByLevelTwo.get(value.level2Id).push(value);
  }
  resize();
  document.querySelector("#loading").classList.add("hidden");
  document.querySelector("#loading").setAttribute("aria-hidden", "true");
  const hash = new URLSearchParams(location.hash.slice(1));
  const initial = hash.get("value");
  if (initial && valueById.has(initial)) focusValue(valueById.get(initial), { updateHash: false });
}

init().catch((error) => {
  document.querySelector("#loading").innerHTML = `<strong>Could not gather the field.</strong><span>${escapeHtml(error.message)}</span>`;
  console.error(error);
});
