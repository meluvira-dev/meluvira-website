// MELUVIRA website prototype — lightweight QA script.
//
// Usage: node qa/check.mjs <base-url>
//   node qa/check.mjs http://localhost:4173
//   node qa/check.mjs https://<org>.github.io/meluvira-website
//
// Deliberately a single file, no test framework — just Playwright driving
// a real Chromium render and a handful of plain assertions. Exits non-zero
// on any failure so it can be used as a simple CI/manual gate.

import { chromium } from "playwright";

const baseUrl = process.argv[2];
if (!baseUrl) {
  console.error("Usage: node qa/check.mjs <base-url>");
  process.exit(1);
}

const pages = ["/", "/support/", "/privacy/"];
const widths = [320, 390, 430, 768, 1024, 1280];

let failures = 0;
function check(label, condition) {
  if (condition) {
    console.log(`  ok   ${label}`);
  } else {
    console.log(`  FAIL ${label}`);
    failures++;
  }
}

const browser = await chromium.launch();

// --- Load + console errors + local asset 404s + heading/alt checks ------
for (const path of pages) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  const consoleErrors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });

  const failedRequests = [];
  page.on("response", (res) => {
    const url = res.url();
    const isLocal = url.startsWith(baseUrl);
    if (isLocal && res.status() >= 400) failedRequests.push(`${res.status()} ${url}`);
  });

  const response = await page.goto(baseUrl + path, { waitUntil: "load", timeout: 30000 });
  console.log(`\n=== ${path} ===`);
  check(`HTTP 200`, response && response.status() === 200);
  check(`no console errors`, consoleErrors.length === 0);
  if (consoleErrors.length) consoleErrors.forEach((e) => console.log(`       console error: ${e}`));
  check(`no failed local asset requests`, failedRequests.length === 0);
  if (failedRequests.length) failedRequests.forEach((e) => console.log(`       ${e}`));

  const headingInfo = await page.evaluate(() => {
    const h1s = document.querySelectorAll("h1");
    const headings = Array.from(document.querySelectorAll("h1,h2,h3,h4,h5,h6")).map((h) => h.tagName);
    let order = true;
    let prev = 0;
    for (const tag of headings) {
      const level = Number(tag[1]);
      if (prev && level > prev + 1) order = false;
      prev = level;
    }
    const imgs = Array.from(document.querySelectorAll("img"));
    const missingAlt = imgs.filter((img) => img.getAttribute("alt") === null).length;
    return { h1Count: h1s.length, headingOrderOk: order, missingAlt };
  });
  check(`exactly one H1`, headingInfo.h1Count === 1);
  check(`no heading level skips`, headingInfo.headingOrderOk);
  check(`every <img> has an alt attribute`, headingInfo.missingAlt === 0);

  // Internal links resolve (same-origin only, HEAD/GET check).
  const links = await page.evaluate(() =>
    Array.from(document.querySelectorAll("a[href]"))
      .map((a) => a.getAttribute("href"))
      .filter((href) => href && !href.startsWith("http") && !href.startsWith("#") && !href.startsWith("mailto:"))
  );
  let brokenLinks = 0;
  for (const href of new Set(links)) {
    const target = new URL(href, baseUrl + path).toString();
    const res = await page.request.get(target).catch(() => null);
    if (!res || res.status() >= 400) {
      brokenLinks++;
      console.log(`       broken internal link: ${href} -> ${target}`);
    }
  }
  check(`all internal links resolve`, brokenLinks === 0);

  await context.close();
}

// --- Responsive: no horizontal overflow, nav reachable at phone widths --
for (const path of pages) {
  for (const width of widths) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await context.newPage();
    await page.goto(baseUrl + path, { waitUntil: "load", timeout: 30000 });

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
    );
    check(`${path} @ ${width}px: no horizontal overflow`, !overflow);

    if (width <= 430) {
      // Mobile: nav links must be reachable via the hamburger toggle, and
      // every one of them must end up fully within the viewport once open.
      const toggle = page.locator(".nav-toggle");
      await toggle.click();
      const linkBoxes = await page.locator(".site-nav__list a").evaluateAll((els) =>
        els.map((el) => {
          const r = el.getBoundingClientRect();
          return { x: r.x, w: r.width, h: r.height };
        })
      );
      const allOnScreen = linkBoxes.every((b) => b.x >= 0 && b.x + b.w <= width);
      check(`${path} @ ${width}px: all nav links on-screen after opening menu`, allOnScreen);
      const comfortableTapTargets = linkBoxes.every((b) => b.h >= 40);
      check(`${path} @ ${width}px: nav links have comfortable tap height (>=40px)`, comfortableTapTargets);
    }

    await context.close();
  }
}

// --- Images stay proportionate at 768px (the Wix tablet regression) -----
{
  const context = await browser.newContext({ viewport: { width: 768, height: 1024 } });
  const page = await context.newPage();
  await page.goto(baseUrl + "/", { waitUntil: "load", timeout: 30000 });
  const tall = await page.evaluate(() => {
    const vh = window.innerHeight;
    return Array.from(document.querySelectorAll("img")).some((img) => img.getBoundingClientRect().height > vh * 1.2);
  });
  check(`home @ 768px: no image taller than 1.2x the viewport`, !tall);
  await context.close();
}

// --- Support 01-04 stay structurally grouped with their content ---------
{
  const context = await browser.newContext({ viewport: { width: 390, height: 900 } });
  const page = await context.newPage();
  await page.goto(baseUrl + "/support/", { waitUntil: "load", timeout: 30000 });
  const grouped = await page.evaluate(() => {
    const items = Array.from(document.querySelectorAll(".feature-list__item"));
    return (
      items.length === 4 &&
      items.every((li) => li.querySelector(".feature-list__index") && li.querySelector("h3") && li.querySelector("p"))
    );
  });
  check(`support: all 4 steps have number+heading+description inside one <li>`, grouped);
  await context.close();
}

// --- 200% zoom stays usable (no overflow, content still reachable) ------
{
  const context = await browser.newContext({ viewport: { width: 640, height: 450 } }); // ~1280x900 at 200%
  const page = await context.newPage();
  await page.goto(baseUrl + "/", { waitUntil: "load", timeout: 30000 });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
  );
  check(`home @ simulated 200% zoom: no horizontal overflow`, !overflow);
  await context.close();
}

// --- Keyboard navigation reaches the mobile menu toggle ------------------
{
  const context = await browser.newContext({ viewport: { width: 390, height: 900 } });
  const page = await context.newPage();
  await page.goto(baseUrl + "/", { waitUntil: "load", timeout: 30000 });
  await page.keyboard.press("Tab"); // skip link
  await page.keyboard.press("Tab"); // logo
  await page.keyboard.press("Tab"); // nav toggle
  const focused = await page.evaluate(() => document.activeElement?.className || "");
  check(`home: keyboard tab order reaches nav toggle`, focused.includes("nav-toggle"));
  await context.close();
}

// --- Favicon: fetchable in production, and declared via <link> on every page ---
{
  const faviconFiles = ["favicon.ico", "favicon-32x32.png", "favicon-16x16.png", "apple-touch-icon.png"];
  for (const file of faviconFiles) {
    const res = await fetch(baseUrl + "/" + file).catch(() => null);
    check(`${file}: fetchable (HTTP 200)`, !!res && res.status === 200);
  }

  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  for (const path of pages) {
    const page = await context.newPage();
    await page.goto(baseUrl + path, { waitUntil: "load", timeout: 30000 });
    const iconLinks = await page.evaluate(() =>
      Array.from(document.querySelectorAll('link[rel="icon"], link[rel="apple-touch-icon"]')).map((el) => ({
        rel: el.getAttribute("rel"),
        href: el.getAttribute("href"),
        sizes: el.getAttribute("sizes"),
      }))
    );
    check(`${path}: declares favicon.ico (any size)`, iconLinks.some((l) => l.href?.endsWith("favicon.ico")));
    check(`${path}: declares favicon-32x32.png`, iconLinks.some((l) => l.href?.endsWith("favicon-32x32.png")));
    check(`${path}: declares favicon-16x16.png`, iconLinks.some((l) => l.href?.endsWith("favicon-16x16.png")));
    check(`${path}: declares apple-touch-icon.png`, iconLinks.some((l) => l.rel === "apple-touch-icon"));
    await page.close();
  }
  await context.close();
}

await browser.close();

console.log(`\n${failures === 0 ? "PASS" : "FAIL"} — ${failures} failing check(s)`);
process.exit(failures === 0 ? 0 : 1);
