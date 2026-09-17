import puppeteer from "@cloudflare/puppeteer";

// --- TOOLS ---
const TOOLS = {
  screenshot_api__capture: {
    description:
      "Take a viewport screenshot of a web page. Returns a JPEG image as base64. Default viewport is 1440x900 (desktop). Supports full-page capture, waiting for elements, scrolling to elements, and cookie banner dismissal.",
    params: {
      url: { type: "string", description: "The URL to screenshot", required: true },
      width: { type: "number", description: "Viewport width in pixels (default: 1440)", required: false },
      height: { type: "number", description: "Viewport height in pixels (default: 900)", required: false },
      full_page: { type: "boolean", description: "Capture the full scrollable page instead of just the viewport (default: false)", required: false },
      wait_for_selector: { type: "string", description: "CSS selector to wait for before capturing", required: false },
      scroll_to_selector: { type: "string", description: "CSS selector to scroll into view before capturing", required: false },
      delay_ms: { type: "number", description: "Additional delay in ms after page load before capturing (default: 2500)", required: false },
      dismiss_cookies: { type: "boolean", description: "Attempt to dismiss cookie consent banners before capturing (default: true)", required: false },
      quality: { type: "number", description: "JPEG quality 1-100 (default: 85)", required: false },
    },
  },

  screenshot_api__capture_element: {
    description:
      "Screenshot a specific element on a web page by CSS selector. Returns a tightly cropped JPEG of just that element. Useful for capturing a specific form, CTA, hero section, or offer banner.",
    params: {
      url: { type: "string", description: "The URL containing the element", required: true },
      selector: { type: "string", description: "CSS selector of the element to capture", required: true },
      width: { type: "number", description: "Viewport width in pixels (default: 1440)", required: false },
      height: { type: "number", description: "Viewport height in pixels (default: 900)", required: false },
      delay_ms: { type: "number", description: "Additional delay in ms after page load (default: 2500)", required: false },
      quality: { type: "number", description: "JPEG quality 1-100 (default: 85)", required: false },
    },
  },

  screenshot_api__capture_mobile: {
    description:
      "Take a mobile viewport screenshot at 375x812 (iPhone-sized) with 2x device scale factor. Convenience shortcut for mobile-first analysis. Returns a JPEG image as base64.",
    params: {
      url: { type: "string", description: "The URL to screenshot", required: true },
      full_page: { type: "boolean", description: "Capture the full scrollable page (default: false)", required: false },
      wait_for_selector: { type: "string", description: "CSS selector to wait for before capturing", required: false },
      scroll_to_selector: { type: "string", description: "CSS selector to scroll into view before capturing", required: false },
      delay_ms: { type: "number", description: "Additional delay in ms after page load (default: 2500)", required: false },
      dismiss_cookies: { type: "boolean", description: "Attempt to dismiss cookie consent banners (default: true)", required: false },
      quality: { type: "number", description: "JPEG quality 1-100 (default: 85)", required: false },
    },
  },
};

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

    // Scroll lazy-loaded content: walk down the page in 700px steps
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

// --- JSON-RPC ROUTER ---
async function handleRpc(request, env) {
  const body = await request.json();
  const { method, params, id } = body;

  if (method === "tools/list") {
    const tools = Object.entries(TOOLS).map(([name, def]) => ({
      name,
      description: def.description,
      inputSchema: {
        type: "object",
        properties: Object.fromEntries(
          Object.entries(def.params).map(([k, v]) => [
            k,
            { type: v.type, description: v.description },
          ])
        ),
        required: Object.entries(def.params)
          .filter(([_, v]) => v.required)
          .map(([k]) => k),
      },
    }));
    return jsonResponse({ jsonrpc: "2.0", id, result: { tools } });
  }

  if (method === "tools/call") {
    try {
      const result = await executeTool(env, params?.name, params?.arguments || {});
      return jsonResponse({ jsonrpc: "2.0", id, result });
    } catch (err) {
      return jsonResponse({
        jsonrpc: "2.0",
        id,
        result: {
          content: [{ type: "text", text: `Error: ${err.message}` }],
          isError: true,
        },
      });
    }
  }

  return jsonResponse({
    jsonrpc: "2.0",
    id,
    error: { code: -32601, message: `Method not found: ${method}` },
  });
}

function jsonResponse(obj) {
  return new Response(JSON.stringify(obj), {
    headers: { "content-type": "application/json" },
  });
}

// --- WORKER ENTRY ---
export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
        },
      });
    }

    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return jsonResponse({ status: "ok", tools: Object.keys(TOOLS).length });
    }

    const auth = request.headers.get("Authorization");
    if (!auth || auth !== `Bearer ${env.MCP_AUTH_TOKEN}`) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    if (url.pathname === "/mcp" && request.method === "POST") {
      return handleRpc(request, env);
    }

    return new Response("Not Found", { status: 404 });
  },
};
