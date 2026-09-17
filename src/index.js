import puppeteer from "@cloudflare/puppeteer";
import { Stagehand } from "@browserbasehq/stagehand";
import { endpointURLString } from "@cloudflare/playwright";
import { WorkersAIClient } from "./workersAIClient";

const SERVER_INFO = { name: "screenshot-api", version: "1.2.0" };
const PROTOCOL_VERSION = "2024-11-05";

const TOOLS = [
  {
    name: "screenshot_api__capture",
    description: "Take a viewport screenshot of a web page. Returns a JPEG image as base64 plus a public URL. Default viewport is 1440x900 (desktop).",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "The URL to screenshot" },
        width: { type: "number", description: "Viewport width in pixels (default: 1440)" },
        height: { type: "number", description: "Viewport height in pixels (default: 900)" },
        full_page: { type: "boolean", description: "Capture the full scrollable page (default: false)" },
        wait_for_selector: { type: "string", description: "CSS selector to wait for before capturing" },
        scroll_to_selector: { type: "string", description: "CSS selector to scroll into view before capturing" },
        delay_ms: { type: "number", description: "Additional delay in ms after page load (default: 2500)" },
        dismiss_cookies: { type: "boolean", description: "Dismiss cookie consent banners (default: true)" },
        quality: { type: "number", description: "JPEG quality 1-100 (default: 85)" },
      },
      required: ["url"],
    },
  },
  {
    name: "screenshot_api__capture_element",
    description: "Screenshot a specific element by CSS selector. Returns a cropped JPEG plus a public URL.",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "The URL containing the element" },
        selector: { type: "string", description: "CSS selector of the element to capture" },
        width: { type: "number", description: "Viewport width (default: 1440)" },
        height: { type: "number", description: "Viewport height (default: 900)" },
        delay_ms: { type: "number", description: "Delay after page load (default: 2500)" },
        quality: { type: "number", description: "JPEG quality 1-100 (default: 85)" },
      },
      required: ["url", "selector"],
    },
  },
  {
    name: "screenshot_api__capture_mobile",
    description: "Mobile screenshot at 375x812 with 2x scale. Returns JPEG plus a public URL.",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "The URL to screenshot" },
        full_page: { type: "boolean", description: "Full scrollable page (default: false)" },
        wait_for_selector: { type: "string", description: "CSS selector to wait for" },
        scroll_to_selector: { type: "string", description: "CSS selector to scroll to" },
        delay_ms: { type: "number", description: "Delay after load (default: 2500)" },
        dismiss_cookies: { type: "boolean", description: "Dismiss cookie banners (default: true)" },
        quality: { type: "number", description: "JPEG quality (default: 85)" },
      },
      required: ["url"],
    },
  },
  {
    name: "screenshot_api__annotate",
    description: "Screenshot with red box annotations around CSS-selected elements and a caption. Returns annotated JPEG plus a public URL.",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "The URL to annotate" },
        selectors: { type: "array", items: { type: "string" }, description: "CSS selectors to highlight" },
        caption: { type: "string", description: "Red caption text below the highlights" },
        width: { type: "number", description: "Viewport width (default: 1440)" },
        height: { type: "number", description: "Viewport height (default: 900)" },
        scroll_to_selector: { type: "string", description: "Scroll target (default: first selector)" },
        delay_ms: { type: "number", description: "Delay after load (default: 3000)" },
        dismiss_cookies: { type: "boolean", description: "Dismiss cookie banners (default: true)" },
        quality: { type: "number", description: "JPEG quality (default: 90)" },
        padding: { type: "number", description: "Padding around elements (default: 8)" },
      },
      required: ["url", "selectors", "caption"],
    },
  },
  {
    name: "screenshot_api__ai_annotate",
    description: "Use AI to find elements described in plain English, draw red box annotations, and add a caption. Returns annotated JPEG plus a public URL.",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "The URL to screenshot" },
        find: { type: "array", items: { type: "string" }, description: "Plain-English element descriptions, e.g. ['the navigation bar', 'the Get Started button']" },
        caption: { type: "string", description: "Red caption text below the highlights" },
        width: { type: "number", description: "Viewport width (default: 1440)" },
        height: { type: "number", description: "Viewport height (default: 900)" },
        delay_ms: { type: "number", description: "Delay after load (default: 3000)" },
        quality: { type: "number", description: "JPEG quality (default: 90)" },
        padding: { type: "number", description: "Padding around elements (default: 8)" },
      },
      required: ["url", "find", "caption"],
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
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

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
    return await imageResult(env, buf, `${opts.url} at ${opts.width}x${opts.height}${opts.fullPage ? " (full page)" : ""}${opts.isMobile ? " (mobile)" : ""}`);
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
    return await imageResult(env, buf, `Element \"${opts.selector}\" on ${opts.url}`);
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

    const annotationResult = await page.evaluate((selectors, caption, padding) => {
      const RED = "rgb(217, 48, 37)";
      const found = [];
      const overlay = document.createElement("div");
      overlay.style.cssText = "position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:999999;";
      document.body.appendChild(overlay);
      let lowestBottom = 0, leftmostLeft = Infinity, rightmostRight = 0;
      for (const sel of selectors) {
        document.querySelectorAll(sel).forEach((el) => {
          const rect = el.getBoundingClientRect();
          const box = document.createElement("div");
          box.style.cssText = `position:absolute;top:${rect.top+window.scrollY-padding}px;left:${rect.left+window.scrollX-padding}px;width:${rect.width+padding*2}px;height:${rect.height+padding*2}px;border:4px solid ${RED};border-radius:8px;pointer-events:none;box-sizing:border-box;`;
          overlay.appendChild(box);
          const bottom = rect.top+window.scrollY+rect.height+padding;
          if (bottom > lowestBottom) lowestBottom = bottom;
          const left = rect.left+window.scrollX-padding;
          if (left < leftmostLeft) leftmostLeft = left;
          const right = rect.left+window.scrollX+rect.width+padding;
          if (right > rightmostRight) rightmostRight = right;
          found.push(sel);
        });
      }
      if (caption && found.length > 0) {
        const label = document.createElement("div");
        label.style.cssText = `position:absolute;top:${lowestBottom+12}px;left:${leftmostLeft}px;width:${rightmostRight-leftmostLeft}px;color:${RED};font-family:Helvetica,Arial,sans-serif;font-size:16px;font-weight:700;text-align:center;pointer-events:none;text-shadow:0 1px 3px rgba(255,255,255,0.9);line-height:1.3;`;
        label.textContent = caption;
        overlay.appendChild(label);
      }
      return { found, count: found.length };
    }, opts.selectors, opts.caption, opts.padding);

    if (annotationResult.count === 0) return { content: [{ type: "text", text: `No elements found for selectors: ${opts.selectors.join(", ")}` }], isError: true };
    await sleep(300);
    const buf = await page.screenshot({ type: "jpeg", quality: opts.quality, fullPage: false });
    return await imageResult(env, buf, `Annotated: ${opts.url} (${annotationResult.count} elements highlighted)`);
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
          if (box && box.width > 0 && box.height > 0) { boxes.push({ selector, ...box }); seenSelectors.add(selector); found = true; }
        } catch (_) {}
      }
      if (!found) notFound.push(description);
    }

    if (boxes.length === 0) { const suffix = notFound.length ? `: ${notFound.join("; ")}` : ""; return { content: [{ type: "text", text: `No elements found for AI descriptions${suffix}` }], isError: true }; }

    await page.evaluate(({ boxes: foundBoxes, caption, padding }) => {
      const RED = "rgb(217, 48, 37)";
      const overlay = document.createElement("div");
      overlay.style.cssText = "position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:999999;";
      document.body.appendChild(overlay);
      let lowestBottom = 0, leftmostLeft = Infinity, rightmostRight = 0;
      for (const f of foundBoxes) {
        const box = document.createElement("div");
        const left = f.x+window.scrollX-padding, top = f.y+window.scrollY-padding, width = f.width+padding*2, height = f.height+padding*2;
        box.style.cssText = `position:absolute;top:${top}px;left:${left}px;width:${width}px;height:${height}px;border:4px solid ${RED};border-radius:8px;pointer-events:none;box-sizing:border-box;`;
        overlay.appendChild(box);
        if (top+height > lowestBottom) lowestBottom = top+height;
        if (left < leftmostLeft) leftmostLeft = left;
        if (left+width > rightmostRight) rightmostRight = left+width;
      }
      if (caption) {
        const label = document.createElement("div");
        label.style.cssText = `position:absolute;top:${lowestBottom+12}px;left:${leftmostLeft}px;width:${rightmostRight-leftmostLeft}px;color:${RED};font-family:Helvetica,Arial,sans-serif;font-size:16px;font-weight:700;text-align:center;pointer-events:none;text-shadow:0 1px 3px rgba(255,255,255,0.9);line-height:1.3;`;
        label.textContent = caption;
        overlay.appendChild(label);
      }
    }, { boxes, caption: opts.caption, padding: opts.padding });

    await sleep(300);
    const buf = await page.screenshot({ type: "jpeg", quality: opts.quality, fullPage: false });
    return await imageResult(env, buf, `AI annotated: ${opts.url} (${boxes.length} elements highlighted)`);
  } finally { if (stagehand) await stagehand.close(); }
}

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

    // Serve screenshots from R2
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
