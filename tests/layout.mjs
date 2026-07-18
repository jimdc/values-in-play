import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const port = 4174;
const origin = `http://127.0.0.1:${port}`;
const artifactsDir = fileURLToPath(new URL("../test-artifacts/", import.meta.url));
const server = spawn("python3", ["-m", "http.server", String(port), "--bind", "127.0.0.1", "-d", "site"], {
  stdio: "ignore",
});

const WIDTHS = [390, 768, 1440, 2000];
const HEIGHT = 1200;

// The field's x/y/size layout for all 3,307 values is precomputed at build time
// (scripts/preprocess.py), so a fresh load should only fetch, parse, and draw — no
// client-side bin-packing. Measured locally (unthrottled, unloaded machine): 10 runs at
// 1280x800 landed 155-189ms, median 185ms. CI runners are typically slower and shared, so
// this budget applies roughly 3x headroom over that observed max rather than a strict
// localhost bound. A regression back to computing layout in the browser is the main
// failure mode this guards against; it would blow well past this budget.
const FIELD_RENDER_BUDGET_MS = 3000;

const PAGES = [
  {
    path: "/",
    slug: "field",
    readyExpr: () => document.querySelector("#field")?.dataset.ready === "true",
  },
  {
    path: "/languages.html",
    slug: "languages",
    readyExpr: () => document.body.dataset.ready === "true",
  },
];

async function waitForServer() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(origin);
      if (response.ok) return;
    } catch {}
    await delay(100);
  }
  throw new Error("Static test server did not start");
}

async function assertNoHorizontalOverflow(page, label) {
  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  assert.ok(
    overflow.scrollWidth <= overflow.clientWidth + 1,
    `${label}: document should not overflow horizontally (scrollWidth=${overflow.scrollWidth}, clientWidth=${overflow.clientWidth})`
  );
}

async function assertHeaderNavConsistent(page, label) {
  const toggles = page.locator(".view-toggle");
  const count = await toggles.count();
  assert.ok(count >= 1, `${label}: header should have at least one nav toggle`);

  const boxes = [];
  for (let i = 0; i < count; i += 1) {
    const toggle = toggles.nth(i);
    await expectVisible(toggle, `${label}: nav toggle ${i}`);
    const box = await toggle.boundingBox();
    assert.ok(box, `${label}: nav toggle ${i} should have a bounding box`);
    boxes.push(box);
  }

  if (boxes.length > 1) {
    const widths = boxes.map((box) => box.width);
    const maxWidth = Math.max(...widths);
    const minWidth = Math.min(...widths);
    assert.ok(
      maxWidth <= minWidth * 3,
      `${label}: nav toggles should look like the same kind of component, not wildly different widths (${widths.join(", ")})`
    );
  }
}

async function expectVisible(locator, label) {
  const box = await locator.boundingBox();
  assert.ok(box && box.width > 0 && box.height > 0, `${label}: element should be visible with a real size`);
}

function rectsOverlap(a, b) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

async function checkFieldPage(page, label, elapsedMs) {
  await page.waitForFunction(() => document.querySelector("#field")?.dataset.ready === "true");
  const field = page.locator("#field");
  assert.equal(await field.getAttribute("data-rendered-count"), "3307", `${label}: field should render all values`);
  assert.ok(
    elapsedMs < FIELD_RENDER_BUDGET_MS,
    `${label}: field should be visible and interactive within ${FIELD_RENDER_BUDGET_MS}ms (took ${elapsedMs}ms)`
  );
}

async function checkLanguagesPage(page, label) {
  await page.waitForFunction(() => document.body.dataset.ready === "true");

  const navToggles = page.locator("header.topbar .view-toggle");
  assert.equal(
    await navToggles.count(),
    2,
    `${label}: header should show both Languages explorer and Field as matching nav pills`
  );

  const axisX = page.locator("#axis-x");
  const axisY = page.locator("#axis-y");
  const [xValue, yValue] = await Promise.all([axisX.inputValue(), axisY.inputValue()]);
  assert.notEqual(xValue, yValue, `${label}: the two axis selectors should default to different axes`);

  const scatter = page.locator("#lang-scatter");
  assert.equal(await scatter.getAttribute("data-dot-count"), "20", `${label}: the language map should report 20 rendered dots`);
  assert.equal(await page.locator("#lang-scatter .scatter-dot").count(), 20, `${label}: the language map should draw 20 dots`);

  const panelIds = ["#map-panel", "#card-panel", "#heatmap-panel", "#compare-panel", "#model-panel"];
  const rects = [];
  for (const id of panelIds) {
    const panel = page.locator(id);
    await expectVisible(panel, `${label}: ${id}`);
    rects.push({ id, box: await panel.boundingBox() });
  }
  for (let i = 0; i < rects.length; i += 1) {
    for (let j = i + 1; j < rects.length; j += 1) {
      assert.ok(
        !rectsOverlap(rects[i].box, rects[j].box),
        `${label}: ${rects[i].id} and ${rects[j].id} should not overlap`
      );
    }
  }
}

let browser;
try {
  await mkdir(artifactsDir, { recursive: true });
  await waitForServer();
  browser = await chromium.launch({ headless: true });

  for (const width of WIDTHS) {
    const page = await browser.newPage({ viewport: { width, height: HEIGHT } });
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));

    for (const spec of PAGES) {
      const label = `${spec.slug}@${width}`;
      const navStart = Date.now();
      await page.goto(`${origin}${spec.path}`, { waitUntil: "networkidle" });
      await page.waitForFunction(spec.readyExpr);
      const elapsedMs = Date.now() - navStart;

      await assertNoHorizontalOverflow(page, label);
      await assertHeaderNavConsistent(page, label);

      if (spec.slug === "field") await checkFieldPage(page, label, elapsedMs);
      if (spec.slug === "languages") await checkLanguagesPage(page, label);

      await page.screenshot({
        path: `${artifactsDir}${spec.slug}-${width}.png`,
        fullPage: true,
      });
    }

    assert.deepEqual(pageErrors, [], `page errors at width ${width}: ${pageErrors.join("; ")}`);
    await page.close();
  }

  console.log(`Layout test passed: ${PAGES.length} pages checked at ${WIDTHS.join(", ")}px, screenshots saved to test-artifacts/.`);
} finally {
  if (browser) await browser.close();
  server.kill("SIGTERM");
}
