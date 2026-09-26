import puppeteer from "@cloudflare/puppeteer";
import { Stagehand } from "@browserbasehq/stagehand";
import { endpointURLString } from "@cloudflare/playwright";
import { WorkersAIClient } from "./workersAIClient";

const SERVER_INFO = { name: "screenshot-api", version: "1.5.0" };
const PROTOCOL_VERSION = "2024-11-05";

const TOOLS = [
  {
    name: "screenshot_api__capture",
    description: "Take a viewport screenshot of a web page. Returns a JPEG image as base64 plus a public URL. Default viewport is 1440x900 (desktop).",
    inputSchema: { type: "object", properties: { url: { type: "string", description: "The URL to screenshot" }, width: { type: "number", description: "Viewport width (default: 1440)" }, height: { type: "number", description: "Viewport height (default: 900)" }, full_page: { type: "boolean", description: "Full scrollable page (default: false)" }, wait_for_selector: { type: "string", description: "CSS selector to wait for" }, scroll_to_selector: { type: "string", description: "CSS selector to scroll to" }, delay_ms: { type: "number", description: "Delay after load (default: 2500)" }, dismiss_cookies: { type: "boolean", description: "Dismiss cookie banners (default: true)" }, quality: { type: "number", description: "JPEG quality (default: 85)" } }, required: ["url"] },
  },
  {
    name: "screenshot_api__capture_element",
    description: "Screenshot a specific element by CSS selector. Returns a cropped JPEG plus a public URL.",
    inputSchema: { type: "object", properties: { url: { type: "string", description: "The URL" }, selector: { type: "string", description: "CSS selector" }, width: { type: "number", description: "Viewport width (default: 1440)" }, height: { type: "number", description: "Viewport height (default: 900)" }, delay_ms: { type: "number", description: "Delay (default: 2500)" }, quality: { type: "number", description: "JPEG quality (default: 85)" } }, required: ["url", "selector"] },
  },
  {
    name: "screenshot_api__capture_mobile",
    description: "Mobile screenshot at 375x812 with 2x scale. Returns JPEG plus a public URL.",
    inputSchema: { type: "object", properties: { url: { type: "string", description: "The URL" }, full_page: { type: "boolean", description: "Full page (default: false)" }, wait_for_selector: { type: "string" }, scroll_to_selector: { type: "string" }, delay_ms: { type: "number", description: "Delay (default: 2500)" }, dismiss_cookies: { type: "boolean", description: "Dismiss cookies (default: true)" }, quality: { type: "number", description: "JPEG quality (default: 85)" } }, required: ["url"] },
  },
  {
    name: "screenshot_api__annotate",
    description: "Screenshot with red box annotations around CSS-selected elements and a caption. Uses canvas overlay. Returns annotated JPEG plus a public URL.",
    inputSchema: { type: "object", properties: { url: { type: "string", description: "The URL" }, selectors: { type: "array", items: { type: "string" }, description: "CSS selectors to highlight" }, caption: { type: "string", description: "Red caption text" }, width: { type: "number" }, height: { type: "number" }, scroll_to_selector: { type: "string" }, delay_ms: { type: "number" }, dismiss_cookies: { type: "boolean" }, quality: { type: "number" }, padding: { type: "number", description: "Padding (default: 8)" } }, required: ["url", "selectors", "caption"] },
  },
  {
    name: "screenshot_api__ai_annotate",
    description: "Use AI to find elements described in plain English, draw red box annotations via canvas overlay, and add a caption banner. Returns annotated JPEG plus a public URL.",
    inputSchema: { type: "object", properties: { url: { type: "string", description: "The URL" }, find: { type: "array", items: { type: "string" }, description: "Plain-English element descriptions" }, caption: { type: "string", description: "Red caption text" }, width: { type: "number" }, height: { type: "number" }, delay_ms: { type: "number" }, quality: { type: "number" }, padding: { type: "number", description: "Padding (default: 8)" } }, required: ["url", "find", "caption"] },
  },
  {
    name: "screenshot_api__compare_layouts",
    description: "Compare element positions between two web pages pixel-by-pixel. Opens both URLs at the same viewport, extracts bounding rectangles for all elements with IDs (scoped by optional CSS selectors), and returns a structured diff: which elements match, which are offset, by how many pixels, and in what direction. Use this to verify a page clone matches its original, then iterate fixes until the diff hits zero. Returns JSON with summary (verdict PASS/FAIL, counts, worst deltas) and up to 30 worst mismatches with exact pixel deltas.",
    inputSchema: {
      type: "object",
      properties: {
        reference_url: { type: "string", description: "The original/reference URL to compare against" },
        test_url: { type: "string", description: "The duplicate/test URL to check" },
        width: { type: "number", description: "Viewport width in pixels (default: 1920)" },
        height: { type: "number", description: "Viewport height in pixels (default: 1080)" },
        tolerance: { type: "number", description: "Pixel tolerance for position/size matching (default: 2). Elements within this threshold count as matching." },
        reference_scope: { type: "string", description: "CSS selector to scope element extraction on the reference page (default: 'body'). Only elements with IDs inside this scope are compared." },
        test_scope: { type: "string", description: "CSS selector to scope element extraction on the test page (default: 'body'). Useful for MCP-wrapped pages where content lives inside #lp-code-1." },
        delay_ms: { type: "number", description: "Delay in ms after page load before measuring (default: 3000)" },
        full_page: { type: "boolean", description: "Scroll the page first to trigger lazy loading, then measure from scroll position 0 (default: true)" },
      },
      required: ["reference_url", "test_url"],
    },
  },
];

async function executeTool(env, name, args) {
  switch (name) {
    case "screenshot_api__capture":
      return captureScreenshot(env, { url: args.url, width: args.width || 1440, height: args.height || 900, fullPage: args.full_page || false, waitForSelector: args.wait_for_selector, scrollToSelector: args.scroll_to_selector, delayMs: args.delay_ms ?? 2500, dismissCookies: args.dismiss_cookies !== false, quality: args.quality || 85, isMobile: false });
    case "screenshot_api__capture_element":
      return captureElement(env, { url: args.url, selector: args.selector, width: args.width || 1440, height: args.height || 900, delayMs: args.delay_ms ?? 2500, quality: args.quality || 85 });
    case "screenshot_api__capture_mobile":
      return captureScreenshot(env, { url: args.url, width: 375, height: 812, fullPage: args.full_page || false, waitForSelector: args.wait_for_selector, scrollToSelector: args.scroll_to_selector, delayMs: args.delay_ms ?? 2500, dismissCookies: args.dismiss_cookies !== false, quality: args.quality || 85, isMobile: true });
    case "screenshot_api__annotate":
      return captureAnnotated(env, { url: args.url, selectors: args.selectors, caption: args.caption, width: args.width || 1440, height: args.height || 900, scrollToSelector: args.scroll_to_selector || args.selectors[0], delayMs: args.delay_ms ?? 3000, dismissCookies: args.dismiss_cookies !== false, quality: args.quality || 90, padding: args.padding ?? 8 });
    case "screenshot_api__ai_annotate":
      return captureAIAnnotated(env, { url: args.url, find: args.find, caption: args.caption, width: args.width ?? 1440, height: args.height ?? 900, delayMs: args.delay_ms ?? 3000, quality: args.quality ?? 90, padding: args.padding ?? 8 });
    case "screenshot_api__compare_layouts":
      return compareLayouts(env, args);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

/* ── Layout comparison ── */

async function compareLayouts(env, opts) {
  const width = opts.width || 1920;
  const height = opts.height || 1080;
  const tolerance = opts.tolerance ?? 2;
  const refScope = opts.reference_scope || "body";
  const testScope = opts.test_scope || "body";
  const delayMs = opts.delay_ms ?? 3000;
  const fullPage = opts.full_page !== false;

  const browser = await puppeteer.launch(env.BROWSER);
  try {
    // Extract element rects from a single page, then close it
    async function extractRects(url, scope) {
      const page = await browser.newPage();
      await page.setViewport({ width, height });
      await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 });
      if (fullPage) await autoScroll(page);
      await sleep(delayMs);
      // Scroll back to top for consistent measurements
      await page.evaluate(() => window.scrollTo(0, 0));
      await sleep(500);

      const data = await page.evaluate((scopeSel) => {
        const scopeEl = document.querySelector(scopeSel);
        if (!scopeEl) return { error: "Scope selector not found: " + scopeSel };

        const results = {};
        scopeEl.querySelectorAll("[id]").forEach((el) => {
          const id = el.id;
          if (!id) return;
          const rect = el.getBoundingClientRect();
          // Skip zero-area elements (hidden, collapsed)
          if (rect.width === 0 && rect.height === 0) return;
          results[id] = {
            x: Math.round(rect.left * 10) / 10,
            y: Math.round(rect.top * 10) / 10,
            w: Math.round(rect.width * 10) / 10,
            h: Math.round(rect.height * 10) / 10,
            tag: el.tagName.toLowerCase(),
          };
        });
        return { elements: results, count: Object.keys(results).length };
      }, scope);

      await page.close();
      return data;
    }

    // Run sequentially (CF browser rendering: one browser, sequential pages)
    const refData = await extractRects(opts.reference_url, refScope);
    if (refData.error) {
      return { content: [{ type: "text", text: "Reference page error: " + refData.error }], isError: true };
    }

    const testData = await extractRects(opts.test_url, testScope);
    if (testData.error) {
      return { content: [{ type: "text", text: "Test page error: " + testData.error }], isError: true };
    }

    const refRects = refData.elements;
    const testRects = testData.elements;
    const refIds = Object.keys(refRects);
    const testIds = Object.keys(testRects);
    const commonIds = refIds.filter((id) => id in testRects);
    const missingInTest = refIds.filter((id) => !(id in testRects));
    const extraInTest = testIds.filter((id) => !(id in refRects));

    const mismatches = [];
    const matches = [];

    for (const id of commonIds) {
      const ref = refRects[id];
      const test = testRects[id];
      const dx = Math.round((test.x - ref.x) * 10) / 10;
      const dy = Math.round((test.y - ref.y) * 10) / 10;
      const dw = Math.round((test.w - ref.w) * 10) / 10;
      const dh = Math.round((test.h - ref.h) * 10) / 10;
      const maxDelta = Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dw), Math.abs(dh));

      if (maxDelta > tolerance) {
        mismatches.push({ id, tag: ref.tag, ref, test, delta: { x: dx, y: dy, w: dw, h: dh }, max_delta: maxDelta });
      } else {
        matches.push(id);
      }
    }

    // Sort worst offenders first
    mismatches.sort((a, b) => b.max_delta - a.max_delta);

    const summary = {
      viewport: width + "x" + height,
      tolerance_px: tolerance,
      reference_url: opts.reference_url,
      test_url: opts.test_url,
      reference_scope: refScope,
      test_scope: testScope,
      reference_elements: refIds.length,
      test_elements: testIds.length,
      common_elements: commonIds.length,
      pixel_perfect_matches: matches.length,
      mismatched: mismatches.length,
      missing_in_test: missingInTest.length,
      extra_in_test: extraInTest.length,
      verdict: mismatches.length === 0 && missingInTest.length === 0 ? "PASS" : "FAIL",
    };

    if (mismatches.length > 0) {
      const xDeltas = mismatches.map((m) => Math.abs(m.delta.x));
      const yDeltas = mismatches.map((m) => Math.abs(m.delta.y));
      summary.worst_x_delta_px = Math.max(...xDeltas);
      summary.worst_y_delta_px = Math.max(...yDeltas);
      summary.avg_x_delta_px = Math.round((xDeltas.reduce((a, b) => a + b, 0) / xDeltas.length) * 10) / 10;
      summary.avg_y_delta_px = Math.round((yDeltas.reduce((a, b) => a + b, 0) / yDeltas.length) * 10) / 10;
    }

    const result = { summary };

    if (mismatches.length > 0) {
      result.worst_mismatches = mismatches.slice(0, 30).map((m) => ({
        element: "#" + m.id,
        tag: m.tag,
        reference_rect: "(" + m.ref.x + ", " + m.ref.y + ") " + m.ref.w + "x" + m.ref.h,
        test_rect: "(" + m.test.x + ", " + m.test.y + ") " + m.test.w + "x" + m.test.h,
        delta_px: "x:" + (m.delta.x > 0 ? "+" : "") + m.delta.x + " y:" + (m.delta.y > 0 ? "+" : "") + m.delta.y + " w:" + (m.delta.w > 0 ? "+" : "") + m.delta.w + " h:" + (m.delta.h > 0 ? "+" : "") + m.delta.h,
        max_delta_px: m.max_delta,
      }));
    }

    if (missingInTest.length > 0) {
      result.missing_in_test = missingInTest.slice(0, 30);
    }
    if (extraInTest.length > 0) {
      result.extra_in_test = extraInTest.slice(0, 30);
    }

    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  } finally {
    await browser.close();
  }
}

/* ── Existing screenshot tools ── */

async function captureScreenshot(env, opts) {
  const browser = await puppeteer.launch(env.BROWSER);
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: opts.width, height: opts.height, isMobile: opts.isMobile, deviceScaleFactor: opts.isMobile ? 2 : 1 });
    await page.goto(opts.url, { waitUntil: "networkidle0", timeout: 30000 });
    if (opts.dismissCookies) await dismissCookieBanners(page);
    if (opts.waitForSelector) await page.waitForSelector(opts.waitForSelector, { timeout: 10000 }).catch(() => {});
    if (opts.fullPage) await autoScroll(page);
    if (opts.scrollToSelector) await page.evaluate((sel) => { const el = document.querySelector(sel); if (el) el.scrollIntoView({ block: "center" }); }, opts.scrollToSelector);
    await sleep(opts.delayMs);
    const buf = await page.screenshot({ type: "jpeg", quality: opts.quality, fullPage: opts.fullPage });
    return await imageResult(env, buf, `${opts.url} at ${opts.width}x${opts.height}`);
  } finally { await browser.close(); }
}

async function captureElement(env, opts) {
  const browser = await puppeteer.launch(env.BROWSER);
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: opts.width, height: opts.height });
    await page.goto(opts.url, { waitUntil: "networkidle0", timeout: 30000 });
    await sleep(opts.delayMs);
    const el = await page.$(opts.selector);
    if (!el) return { content: [{ type: "text", text: `Element not found: ${opts.selector}` }], isError: true };
    await el.scrollIntoView();
    await sleep(500);
    const buf = await el.screenshot({ type: "jpeg", quality: opts.quality });
    return await imageResult(env, buf, `Element on ${opts.url}`);
  } finally { await browser.close(); }
}

async function captureAnnotated(env, opts) {
  const browser = await puppeteer.launch(env.BROWSER);
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: opts.width, height: opts.height });
    await page.goto(opts.url, { waitUntil: "networkidle0", timeout: 30000 });
    if (opts.dismissCookies) await dismissCookieBanners(page);
    if (opts.scrollToSelector) await page.evaluate((sel) => { const el = document.querySelector(sel); if (el) el.scrollIntoView({ block: "center" }); }, opts.scrollToSelector);
    await sleep(opts.delayMs);

    const boxes = await page.evaluate((selectors, padding) => {
      const results = [];
      for (const sel of selectors) {
        document.querySelectorAll(sel).forEach((el) => {
          const rect = el.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            results.push({ x: rect.left - padding, y: rect.top - padding, w: rect.width + padding * 2, h: rect.height + padding * 2 });
          }
        });
      }
      return results;
    }, opts.selectors, opts.padding);

    if (boxes.length === 0) return { content: [{ type: "text", text: `No elements found for selectors: ${opts.selectors.join(", ")}` }], isError: true };

    await page.evaluate((rects, caption, vw, vh) => {
      const canvas = document.createElement('canvas');
      canvas.width = vw;
      canvas.height = vh;
      canvas.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:2147483647;pointer-events:none;';
      document.documentElement.appendChild(canvas);
      const ctx = canvas.getContext('2d');

      ctx.strokeStyle = 'rgb(217, 48, 37)';
      ctx.lineWidth = 4;
      for (const r of rects) {
        const radius = 8;
        ctx.beginPath();
        ctx.moveTo(r.x + radius, r.y);
        ctx.lineTo(r.x + r.w - radius, r.y);
        ctx.quadraticCurveTo(r.x + r.w, r.y, r.x + r.w, r.y + radius);
        ctx.lineTo(r.x + r.w, r.y + r.h - radius);
        ctx.quadraticCurveTo(r.x + r.w, r.y + r.h, r.x + r.w - radius, r.y + r.h);
        ctx.lineTo(r.x + radius, r.y + r.h);
        ctx.quadraticCurveTo(r.x, r.y + r.h, r.x, r.y + r.h - radius);
        ctx.lineTo(r.x, r.y + radius);
        ctx.quadraticCurveTo(r.x, r.y, r.x + radius, r.y);
        ctx.closePath();
        ctx.stroke();
      }

      if (caption) {
        const bannerH = 44;
        ctx.fillStyle = 'rgb(217, 48, 37)';
        ctx.fillRect(0, vh - bannerH, vw, bannerH);
        ctx.fillStyle = 'white';
        ctx.font = 'bold 18px Helvetica, Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(caption, vw / 2, vh - bannerH / 2);
      }
    }, boxes, opts.caption, opts.width, opts.height);

    await sleep(300);
    const buf = await page.screenshot({ type: "jpeg", quality: opts.quality, fullPage: false });
    return await imageResult(env, buf, `Annotated: ${opts.url} (${boxes.length} elements)`);
  } finally { await browser.close(); }
}

async function captureAIAnnotated(env, opts) {
  let stagehand;
  try {
    stagehand = new Stagehand({ env: "LOCAL", localBrowserLaunchOptions: { cdpUrl: endpointURLString(env.BROWSER) }, llmClient: new WorkersAIClient(env.AI), verbose: 1 });
    await stagehand.init();
    const page = stagehand.page;
    await page.setViewportSize({ width: opts.width, height: opts.height });
    await page.goto(opts.url, { waitUntil: "domcontentloaded", timeout: 60000 });
    await sleep(opts.delayMs);

    const boxes = [];
    const seenSelectors = new Set();
    const notFound = [];
    for (const description of opts.find) {
      const actions = await page.observe(description);
      let found = false;
      for (const action of actions || []) {
        const selector = action?.selector;
        if (!selector || seenSelectors.has(selector)) continue;
        try {
          const box = await page.locator(selector).boundingBox();
          if (box && box.width > 0 && box.height > 0) {
            boxes.push({ x: box.x - opts.padding, y: box.y - opts.padding, w: box.width + opts.padding * 2, h: box.height + opts.padding * 2 });
            seenSelectors.add(selector);
            found = true;
          }
        } catch (_) {}
      }
      if (!found) notFound.push(description);
    }

    if (boxes.length === 0) {
      return { content: [{ type: "text", text: `No elements found${notFound.length ? ': ' + notFound.join('; ') : ''}` }], isError: true };
    }

    await page.evaluate(({ rects, caption, vw, vh }) => {
      const canvas = document.createElement('canvas');
      canvas.width = vw;
      canvas.height = vh;
      canvas.style.cssText = 'position:fixed;top:0;left:0;width:' + vw + 'px;height:' + vh + 'px;z-index:2147483647;pointer-events:none;';
      document.documentElement.appendChild(canvas);
      const ctx = canvas.getContext('2d');

      ctx.strokeStyle = 'rgb(217, 48, 37)';
      ctx.lineWidth = 5;
      ctx.shadowColor = 'rgba(217, 48, 37, 0.5)';
      ctx.shadowBlur = 8;
      for (const r of rects) {
        const radius = 8;
        ctx.beginPath();
        ctx.moveTo(r.x + radius, r.y);
        ctx.lineTo(r.x + r.w - radius, r.y);
        ctx.quadraticCurveTo(r.x + r.w, r.y, r.x + r.w, r.y + radius);
        ctx.lineTo(r.x + r.w, r.y + r.h - radius);
        ctx.quadraticCurveTo(r.x + r.w, r.y + r.h, r.x + r.w - radius, r.y + r.h);
        ctx.lineTo(r.x + radius, r.y + r.h);
        ctx.quadraticCurveTo(r.x, r.y + r.h, r.x, r.y + r.h - radius);
        ctx.lineTo(r.x, r.y + radius);
        ctx.quadraticCurveTo(r.x, r.y, r.x + radius, r.y);
        ctx.closePath();
        ctx.stroke();
      }

      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;

      if (caption) {
        const bannerH = 48;
        ctx.fillStyle = 'rgb(217, 48, 37)';
        ctx.fillRect(0, vh - bannerH, vw, bannerH);
        ctx.fillStyle = 'white';
        ctx.font = 'bold 20px Helvetica, Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(caption, vw / 2, vh - bannerH / 2);
      }
    }, { rects: boxes, caption: opts.caption, vw: opts.width, vh: opts.height });

    await sleep(500);
    const buf = await page.screenshot({ type: "jpeg", quality: opts.quality, fullPage: false });
    return await imageResult(env, buf, `AI annotated: ${opts.url} (${boxes.length} elements)`);
  } finally { if (stagehand) await stagehand.close(); }
}

/* ── Shared helpers ── */

async function dismissCookieBanners(page) {
  for (const sel of ["#onetrust-accept-btn-handler",".cc-accept",".cc-dismiss",'[id*="cookie"] button[class*="accept"]','[class*="cookie"] button[class*="accept"]','[class*="consent"] button[class*="accept"]','button[aria-label*="Accept"]','button[aria-label*="accept"]','button[data-action="accept"]']) {
    try { const btn = await page.$(sel); if (btn) { await btn.click(); await sleep(500); return; } } catch (_) {}
  }
}

async function autoScroll(page) {
  await page.evaluate(async () => { await new Promise((resolve) => { let total = 0; const step = 700; const timer = setInterval(() => { window.scrollBy(0, step); total += step; if (total >= document.body.scrollHeight) { clearInterval(timer); window.scrollTo(0, 0); resolve(); } }, 200); }); });
  await new Promise((r) => setTimeout(r, 1000));
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

async function imageResult(env, buf, description) {
  const base64 = arrayBufferToBase64(buf);
  let publicUrl = null;
  if (env.SCREENSHOTS) {
    const key = `img/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
    await env.SCREENSHOTS.put(key, buf, { httpMetadata: { contentType: "image/jpeg" } });
    const base = env.PUBLIC_URL_BASE || "https://screenshot-mcp-server.adam-efc.workers.dev";
    publicUrl = `${base}/${key}`;
  }
  const textParts = [`Screenshot captured: ${description}`];
  if (publicUrl) textParts.push(`Public URL: ${publicUrl}`);
  return { content: [{ type: "image", data: base64, mimeType: "image/jpeg" }, { type: "text", text: textParts.join("\n") }] };
}

/* ── JSON-RPC router ── */

function jsonrpc(id, result) { return { jsonrpc: "2.0", id, result }; }
function jsonrpcError(id, code, message) { return { jsonrpc: "2.0", id, error: { code, message } }; }

async function handleRpc(env, req) {
  const { method, params, id } = req;
  switch (method) {
    case "initialize": return jsonrpc(id, { protocolVersion: PROTOCOL_VERSION, capabilities: { tools: { listChanged: false } }, serverInfo: SERVER_INFO });
    case "notifications/initialized": case "notifications/cancelled": return null;
    case "ping": return jsonrpc(id, {});
    case "tools/list": return jsonrpc(id, { tools: TOOLS });
    case "tools/call": {
      const { name, arguments: args } = params || {};
      try { const result = await executeTool(env, name, args); return jsonrpc(id, result); }
      catch (err) { return jsonrpc(id, { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true }); }
    }
    default: return jsonrpcError(id, -32601, `Method not found: ${method}`);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/health") return Response.json({ status: "ok", tools: TOOLS.length });
    if (request.method === "GET" && url.pathname.startsWith("/img/")) {
      if (!env.SCREENSHOTS) return new Response("R2 not configured", { status: 500 });
      const key = url.pathname.slice(1);
      const object = await env.SCREENSHOTS.get(key);
      if (!object) return new Response("Not found", { status: 404 });
      const headers = new Headers();
      object.writeHttpMetadata(headers);
      headers.set("Cache-Control", "public, max-age=31536000");
      return new Response(object.body, { headers });
    }
    if (request.method === "OPTIONS") return new Response(null, { headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization, Mcp-Session-Id" } });
    if (env.MCP_AUTH_TOKEN) { const auth = request.headers.get("Authorization"); if (auth !== `Bearer ${env.MCP_AUTH_TOKEN}`) return new Response("Unauthorized", { status: 401 }); }
    if (!url.pathname.startsWith("/mcp")) return new Response("Not found", { status: 404 });
    if (request.method === "GET") return new Response("Use POST", { status: 405 });
    if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
    let body;
    try { body = await request.json(); } catch { return Response.json(jsonrpcError(null, -32700, "Parse error"), { status: 400 }); }
    const headers = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" };
    if (Array.isArray(body)) {
      const results = [];
      for (const req of body) { const res = await handleRpc(env, req); if (res !== null) results.push(res); }
      if (results.length === 0) return new Response(null, { status: 202, headers });
      return Response.json(results, { headers });
    }
    const result = await handleRpc(env, body);
    if (result === null) return new Response(null, { status: 202, headers });
    return Response.json(result, { headers });
  },
};
