import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright";

const port = 4173;
const origin = `http://127.0.0.1:${port}`;
const server = spawn("python3", ["-m", "http.server", String(port), "--bind", "127.0.0.1", "-d", "site"], {
  stdio: "ignore",
});

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

let browser;
try {
  await waitForServer();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto(origin, { waitUntil: "networkidle" });

  const field = page.locator("#field");
  await field.waitFor({ state: "visible" });
  await page.waitForFunction(() => document.querySelector("#field")?.dataset.ready === "true");
  assert.equal(await field.getAttribute("data-rendered-count"), "3307", "the full field should render");
  assert.equal(await page.locator("#result-count").textContent(), "3,307");

  await page.locator("#search").fill("playful creativity");
  await page.waitForFunction(() => document.querySelector("#field")?.dataset.renderedCount === "1");
  assert.equal(await page.locator("#result-count").textContent(), "1", "search should filter the field");

  const toggle = page.locator(".view-toggle");
  await toggle.waitFor({ state: "visible" });
  assert.equal(await toggle.getAttribute("href"), "./languages.html", "field should link to the languages explorer");

  await page.goto(`${origin}/languages.html`, { waitUntil: "networkidle" });
  await page.waitForFunction(() => document.body.dataset.ready === "true");

  const scatterDots = page.locator("#lang-scatter .scatter-dot");
  assert.equal(await scatterDots.count(), 20, "the language map should plot all 20 languages");

  const heatmapCells = page.locator("#heatmap .hm-cell");
  assert.equal(await heatmapCells.count(), 80, "the heatmap should have 20 languages x 4 axes of cells");

  await page.locator("#profile-card .profile-card-head h3").waitFor({ state: "visible" });
  const initialProfile = await page.locator("#profile-card .profile-card-head h3").textContent();

  await page.locator('.scatter-dot[data-language="Japanese"]').click();
  await page.waitForFunction(
    () => document.querySelector("#profile-card .profile-card-head h3")?.textContent === "Japanese"
  );
  assert.notEqual(initialProfile, "Japanese", "clicking a new language should change the selection");
  assert.equal(await page.locator("#compare-note strong").textContent(), "Japanese's anchor countries");

  const clusterToggle = page.locator("#cluster-toggle");
  await clusterToggle.click();
  assert.equal(await clusterToggle.getAttribute("aria-pressed"), "true", "cluster toggle should activate");

  const transposeToggle = page.locator("#transpose-toggle");
  await transposeToggle.click();
  assert.equal(await transposeToggle.getAttribute("aria-pressed"), "true", "transpose toggle should activate");
  assert.equal(await page.locator("#heatmap .hm-cell").count(), 80, "transposed heatmap should keep all 80 cells");

  const modelCards = page.locator(".model-card");
  assert.equal(await modelCards.count(), 3, "should render a profile card for each of the 3 models");

  const backToggle = page.locator('.view-toggle[href="./"]');
  assert.equal(await backToggle.getAttribute("href"), "./", "the languages view should link back to the field");

  assert.deepEqual(pageErrors, [], `page errors: ${pageErrors.join("; ")}`);
  console.log("Smoke test passed: field rendered, search filtered it, and the languages explorer rendered and responded to interaction.");
} finally {
  if (browser) await browser.close();
  server.kill("SIGTERM");
}
