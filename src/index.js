import puppeteer from "@cloudflare/puppeteer";

const SERVER_INFO = { name: "screenshot-api", version: "1.0.0" };
const PROTOCOL_VERSION = "2024-11-05";

// --- TOOLS ---
const TOOLS = [
  {
    name: "screenshot_api__capture",
    description: "Take a viewport screenshot of a web page. Returns a JPEG image as base64. Default viewport is 1440x900 (desktop). Supports full-page capture, waiting for elements, scrolling to elements, and cookie banner dismissal.",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "The URL to screenshot" },
        width: { type: "number", description: "Viewport width in pixels (default: 1440)" },
        height: { type: "number", description: "Viewport height in pixels (default: 900)" },
        full_page: { type: "boolean", description: "Capture the full scrollable page instead of just the viewport (default: false)" },
        wait_for_selector: { type: "string", description: "CSS selector to wait for before capturing" },
        scroll_to_selector: { type: "string", description: "CSS selector to scroll into view before capturing" },
        delay_ms: { type: "number", description: "Additional delay in ms after page load before capturing (default: 2500)" },
        dismiss_cookies: { type: "boolean", description: "Attempt to dismiss cookie consent banners before capturing (default: true)" },
        quality: { type: "number", description: "JPEG quality 1-100 (default: 85)" },
      },
      required: ["url"],
    },
  },
  {
    name: "screenshot_api__capture_element",
    description: "Screenshot a specific element on a web page by CSS selector. Returns a tightly cropped JPEG of just that element. Useful for capturing a specific form, CTA, hero section, or offer banner.",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "The URL containing the element" },
        selector: { type: "string", description: "CSS selector of the element to capture" },
        width: { type: "number", description: "Viewport width in pixels (default: 1440)" },
        height: { type: "number", description: "Viewport height in pixels (default: 900)" },
        delay_ms: { type: "number", description: "Additional delay in ms after page load (default: 2500)" },
        quality: { type: "number", description: "JPEG quality 1-100 (default: 85)" },
      },
      required: ["url", "selector"],
    },
  },
  {
    name: "screenshot_api__capture_mobile",
    description: "Take a mobile viewport screenshot at 375x812 (iPhone-sized) with 2x device scale factor. Convenience shortcut for mobile-first analysis. Returns a JPEG image as base64.",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "The URL to screenshot" },
        full_page: { type: "boolean", description: "Capture the full scrollable page (default: false)" },
        wait_for_selector: { type: "string", description: "CSS selector to wait for before capturing" },
        scroll_to_selector: { type: "string", description: "CSS selector to scroll into view before capturing" },
        delay_ms: { type: "number", description: "Additional delay in ms after page load (default: 2500)" },
        dismiss_cookies: { type: "boolean", description: "Attempt to dismiss cookie consent banners (default: true)" },
        quality: { type: "number", description: "JPEG quality 1-100 (default: 85)" },
      },
      required: ["url"],
    },
  },
];

// --- EXECUTE TOOL ---
async function executeTool(env, name, args) {
  switch (name) {
    case "screenshot_api__capture":
      return captureScreenshot(env, {
        url: args.url,
        width: args.width || 1440,
        height: args.height || 900,
        fullPage: args.full_page || false,
        waitForSelector: args.wait_for_selector,
        scrollToSelector: args.scroll_to_selector,
        delayMs: args.delay_ms ?? 2500,
        dismissCookies: args.dismiss_cookies !== false,
        quality: args.quality || 85,
        isMobile: false,
      });

    case "screenshot_api__capture_element":
      return captureElement(env, {
        url: args.url,
        selector: args.selector,
        width: args.width || 1440,
        height: args.height || 900,
        delayMs: args.delay_ms ?? 2500,
        quality: args.quality || 85,
      });

    case "screenshot_api__capture_mobile":
      return captureScreenshot(env, {
        url: args.url,
        width: 375,
        height: 812,
        fullPage: args.full_page || false,
        waitForSelector: args.wait_for_selector,
        scrollToSelector: args.scroll_to_selector,
        delayMs: args.delay_ms ?? 2500,
        dismissCookies: args.dismiss_cookies !== false,
        quality: args.quality || 85,
        isMobile: true,
      });

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// --- SCREENSHOT LOGIC ---
async function captureScreenshot(env, opts) {
  const browser = await puppeteer.launch(env.BROWSER);
  try {
    const page = await browser.newPage();
    await page.setViewport({
      width: opts.width,
      height: opts.height,
      isMobile: opts.isMobile,
      deviceScaleFactor: opts.isMobile ? 2 : 1,
    });

    await page.goto(opts.url, { waitUntil: "networkidle0", timeout: 30000 });

    if (opts.dismissCookies) await dismissCookieBanners(page);

    if (opts.waitForSelector) {
      await page.waitForSelector(opts.waitForSelector, { timeout: 10000 }).catch(() => {});
    }

    if (opts.fullPage) {
      await autoScroll(page);
    }

    if (opts.scrollToSelector) {
      await page.evaluate((sel) => {
        const el = document.querySelector(sel);
        if (el) el.scrollIntoView({ block: "center" });
      }, opts.scrollToSelector);
    }

    await sleep(opts.delayMs);

    const buf = await page.screenshot({
      type: "jpeg",
      quality: opts.quality,
      fullPage: opts.fullPage,
    });

    return imageResult(buf, `${opts.url} at ${opts.width}x${opts.height}${opts.fullPage ? " (full page)" : ""}${opts.isMobile ? " (mobile)" : ""}`);
  } finally {
    await browser.close();
  }
}

async function captureElement(env, opts) {
  const browser = await puppeteer.launch(env.BROWSER);
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: opts.width, height: opts.height });
    await page.goto(opts.url, { waitUntil: "networkidle0", timeout: 30000 });

    await sleep(opts.delayMs);

    const el = await page.$(opts.selector);
    if (!el) {
      return {
        content: [{ type: "text", text: `Element not found: ${opts.selector}` }],
        isError: true,
      };
    }

    await el.scrollIntoView();
    await sleep(500);

    const buf = await el.screenshot({ type: "jpeg", quality: opts.quality });

    return imageResult(buf, `Element \"${opts.selector}\" on ${opts.url}`);
  } finally {
    await browser.close();
  }
}

// --- HELPERS ---
async function dismissCookieBanners(page) {
  const selectors = [
    "#onetrust-accept-btn-handler",
    ".cc-accept",
    ".cc-dismiss",
    '[id*="cookie"] button[class*="accept"]',
    '[id*="cookie"] button[class*="agree"]',
    '[class*="cookie"] button[class*="accept"]',
    '[class*="consent"] button[class*="accept"]',
    'button[aria-label*="Accept"]',
    'button[aria-label*="accept"]',
    'button[aria-label*="agree"]',
    'button[data-action="accept"]',
  ];
  for (const sel of selectors) {
    try {
      const btn = await page.$(sel);
      if (btn) {
        await btn.click();
        await sleep(500);
        return;
      }
    } catch (_) {}
  }
}

async function autoScroll(page) {
  await page.evaluate(async () => {
    await new Promise((resolve) => {
      let total = 0;
      const step = 700;
      const timer = setInterval(() => {
        window.scrollBy(0, step);
        total += step;
        if (total >= document.body.scrollHeight) {
          clearInterval(timer);
          window.scrollTo(0, 0);
          resolve();
        }
      }, 200);
    });
  });
  await new Promise((r) => setTimeout(r, 1000));
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function imageResult(buf, description) {
  const base64 = arrayBufferToBase64(buf);
  return {
    content: [
      { type: "image", data: base64, mimeType: "image/jpeg" },
      { type: "text", text: `Screenshot captured: ${description}` },
    ],
  };
}

// --- MCP Protocol (JSON-RPC 2.0) ---
function jsonrpc(id, result) {
  return { jsonrpc: "2.0", id, result };
}

function jsonrpcError(id, code, message) {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

async function handleRpc(env, req) {
  const { method, params, id } = req;

  switch (method) {
    case "initialize":
      return jsonrpc(id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
      });

    case "notifications/initialized":
    case "notifications/cancelled":
      return null;

    case "ping":
      return jsonrpc(id, {});

    case "tools/list":
      return jsonrpc(id, { tools: TOOLS });

    case "tools/call": {
      const { name, arguments: args } = params || {};
      try {
        const result = await executeTool(env, name, args);
        return jsonrpc(id, result);
      } catch (err) {
        return jsonrpc(id, {
          content: [{ type: "text", text: `Error: ${err.message}` }],
          isError: true,
        });
      }
    }

    default:
      return jsonrpcError(id, -32601, `Method not found: ${method}`);
  }
}

// --- Worker entry ---
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return Response.json({ status: "ok", tools: TOOLS.length });
    }

    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization, Mcp-Session-Id",
        },
      });
    }

    if (env.MCP_AUTH_TOKEN) {
      const auth = request.headers.get("Authorization");
      if (auth !== `Bearer ${env.MCP_AUTH_TOKEN}`) {
        return new Response("Unauthorized", { status: 401 });
      }
    }

    if (!url.pathname.startsWith("/mcp")) {
      return new Response("Not found", { status: 404 });
    }

    if (request.method === "GET") {
      return new Response("Use POST for MCP requests", { status: 405 });
    }

    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return Response.json(jsonrpcError(null, -32700, "Parse error"), { status: 400 });
    }

    const headers = {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    };

    if (Array.isArray(body)) {
      const results = [];
      for (const req of body) {
        const res = await handleRpc(env, req);
        if (res !== null) results.push(res);
      }
      if (results.length === 0) return new Response(null, { status: 202, headers });
      return Response.json(results, { headers });
    }

    const result = await handleRpc(env, body);
    if (result === null) return new Response(null, { status: 202, headers });
    return Response.json(result, { headers });
  },
};
