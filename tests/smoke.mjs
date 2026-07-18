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
  assert.deepEqual(pageErrors, [], `page errors: ${pageErrors.join("; ")}`);
  console.log("Smoke test passed: field rendered and search filtered it.");
} finally {
  if (browser) await browser.close();
  server.kill("SIGTERM");
}
