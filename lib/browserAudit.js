const { chromium } = require("playwright");
const { contrastRatio, rgbToHex } = require("./colorTheory");

const VIEWPORT = { width: 1366, height: 768 };
const WAIT_AFTER_LOAD_MS = 2500;

function emptyBrowserAudit(error) {
  return {
    available: false,
    error: error ? error.message : null,
    html: null,
    finalUrl: null,
    loadTimeMs: null,
    screenshotDataUrl: null,
    webVitals: { lcp: null, cls: null, inp: null },
    computedStyles: {
      colors: {},
      fonts: [],
      textContrastSamples: [],
      lowContrastSamples: [],
    },
    resources: [],
  };
}

async function auditInBrowser(targetUrl) {
  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      args: ["--disable-dev-shm-usage"],
    });

    const context = await browser.newContext({
      viewport: VIEWPORT,
      userAgent:
        "Mozilla/5.0 (compatible; SEOAuditBot/1.0; +https://internal-tool.local)",
    });
    const page = await context.newPage();
    const resources = [];
    page.on("requestfinished", async (request) => {
      const response = await request.response().catch(() => null);
      resources.push({
        url: request.url(),
        type: request.resourceType(),
        status: response ? response.status() : null,
      });
    });

    await installWebVitalsObservers(page);

    const start = Date.now();
    const response = await page.goto(targetUrl, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });

    if (!response || response.status() >= 400) {
      const err = new Error(
        response ? `Browser navigation returned HTTP ${response.status()}` : "Browser navigation failed"
      );
      err.httpStatus = response ? response.status() : null;
      throw err;
    }

    await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(WAIT_AFTER_LOAD_MS);
    await triggerLightInteraction(page);

    const loadTimeMs = Date.now() - start;
    const [html, webVitals, computedStyles, screenshotBuffer] = await Promise.all([
      page.content(),
      readWebVitals(page),
      collectComputedStyles(page),
      page.screenshot({ type: "jpeg", quality: 62, fullPage: false }),
    ]);

    return {
      available: true,
      error: null,
      html,
      finalUrl: page.url(),
      loadTimeMs,
      screenshotDataUrl: `data:image/jpeg;base64,${screenshotBuffer.toString("base64")}`,
      webVitals,
      computedStyles,
      resources,
    };
  } catch (err) {
    return emptyBrowserAudit(err);
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

async function installWebVitalsObservers(page) {
  await page.addInitScript(() => {
    window.__auditVitals = { lcp: null, cls: 0, inp: null };

    try {
      new PerformanceObserver((entryList) => {
        const entries = entryList.getEntries();
        const last = entries[entries.length - 1];
        if (last) window.__auditVitals.lcp = Math.round(last.startTime);
      }).observe({ type: "largest-contentful-paint", buffered: true });
    } catch (_) {}

    try {
      new PerformanceObserver((entryList) => {
        for (const entry of entryList.getEntries()) {
          if (!entry.hadRecentInput) window.__auditVitals.cls += entry.value;
        }
      }).observe({ type: "layout-shift", buffered: true });
    } catch (_) {}

    try {
      new PerformanceObserver((entryList) => {
        for (const entry of entryList.getEntries()) {
          const latency = entry.duration || entry.processingStart - entry.startTime;
          if (!window.__auditVitals.inp || latency > window.__auditVitals.inp) {
            window.__auditVitals.inp = Math.round(latency);
          }
        }
      }).observe({ type: "event", buffered: true, durationThreshold: 16 });
    } catch (_) {}
  });
}

async function triggerLightInteraction(page) {
  try {
    const locator = page.locator("a[href], button, input, textarea, select").first();
    if ((await locator.count()) > 0) {
      await locator.hover({ timeout: 1500 }).catch(() => {});
      await page.keyboard.press("Tab").catch(() => {});
    }
  } catch (_) {
    /* INP is opportunistic in a no-user lab scan. */
  }
}

async function readWebVitals(page) {
  const vitals = await page.evaluate(() => {
    const nav = performance.getEntriesByType("navigation")[0];
    return {
      lcp: window.__auditVitals?.lcp ?? null,
      cls: window.__auditVitals?.cls ? Number(window.__auditVitals.cls.toFixed(3)) : 0,
      inp: window.__auditVitals?.inp ?? null,
      ttfb: nav ? Math.round(nav.responseStart) : null,
      domContentLoaded: nav ? Math.round(nav.domContentLoadedEventEnd) : null,
    };
  });

  return vitals;
}

async function collectComputedStyles(page) {
  const snapshot = await page.evaluate(() => {
    const visible = (el) => {
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return (
        style.visibility !== "hidden" &&
        style.display !== "none" &&
        Number(style.opacity) > 0 &&
        rect.width > 0 &&
        rect.height > 0
      );
    };

    const effectiveBackground = (el) => {
      let current = el;
      while (current && current.nodeType === Node.ELEMENT_NODE) {
        const bg = getComputedStyle(current).backgroundColor;
        if (bg && !/^rgba?\(0,\s*0,\s*0,\s*0\)$/i.test(bg) && bg !== "transparent") return bg;
        current = current.parentElement;
      }
      return "rgb(255, 255, 255)";
    };

    const colorFreq = {};
    const colorRoles = {};
    const fonts = {};
    const textSamples = [];
    const elements = Array.from(document.body ? document.body.querySelectorAll("*") : []).filter(visible);

    const addColor = (color, role) => {
      if (!color || color === "transparent" || /^rgba?\(0,\s*0,\s*0,\s*0\)$/i.test(color)) return;
      colorFreq[color] = (colorFreq[color] || 0) + 1;
      colorRoles[color] = colorRoles[color] || {};
      colorRoles[color][role] = (colorRoles[color][role] || 0) + 1;
    };

    for (const el of elements.slice(0, 900)) {
      const style = getComputedStyle(el);
      const tag = el.tagName.toLowerCase();
      const text = (el.innerText || "").replace(/\s+/g, " ").trim();
      const isLink = tag === "a";
      const isButton =
        tag === "button" ||
        el.getAttribute("role") === "button" ||
        /btn|button|cta|primary|submit|hero/i.test(el.className || "") ||
        /button|submit/i.test(el.getAttribute("type") || "");

      addColor(style.color, isLink ? "linkText" : isButton ? "buttonText" : "text");
      addColor(style.backgroundColor, isButton ? "buttonBackground" : "background");
      addColor(style.borderColor, "border");

      const family = (style.fontFamily || "").split(",")[0].replace(/["']/g, "").trim();
      if (family) fonts[family] = (fonts[family] || 0) + 1;

      if (text && textSamples.length < 80) {
        textSamples.push({
          text: text.slice(0, 80),
          tag,
          color: style.color,
          backgroundColor: effectiveBackground(el),
          fontSize: style.fontSize,
        });
      }
    }

    return { colorFreq, fonts, textSamples };
  });

  const colors = {};
  const colorRoles = {};
  Object.entries(snapshot.colorFreq).forEach(([color, count]) => {
    const hex = cssColorToHex(color);
    if (hex) colors[hex] = (colors[hex] || 0) + count;
  });
  Object.entries(snapshot.colorRoles || {}).forEach(([color, roles]) => {
    const hex = cssColorToHex(color);
    if (!hex) return;
    colorRoles[hex] = colorRoles[hex] || {};
    Object.entries(roles).forEach(([role, count]) => {
      colorRoles[hex][role] = (colorRoles[hex][role] || 0) + count;
    });
  });

  const fonts = Object.entries(snapshot.fonts)
    .sort((a, b) => b[1] - a[1])
    .map(([family]) => family);

  const textContrastSamples = snapshot.textSamples
    .map((sample) => {
      const fg = cssColorToHex(sample.color);
      const bg = cssColorToHex(sample.backgroundColor);
      const ratio = fg && bg ? contrastRatio(fg, bg) : null;
      return { ...sample, foregroundHex: fg, backgroundHex: bg, ratio };
    })
    .filter((sample) => sample.ratio !== null);

  return {
    colors,
    colorRoles,
    fonts,
    textContrastSamples,
    lowContrastSamples: textContrastSamples.filter((sample) => sample.ratio < 4.5).slice(0, 8),
  };
}

function cssColorToHex(value) {
  const match = String(value || "").match(/rgba?\(([^)]+)\)/i);
  if (!match) return null;
  const parts = match[1].split(",").map((part) => Number.parseFloat(part.trim()));
  if (parts.length < 3 || parts.some((part, index) => index < 3 && Number.isNaN(part))) return null;
  if (parts.length >= 4 && parts[3] === 0) return null;
  return rgbToHex({ r: parts[0], g: parts[1], b: parts[2] });
}

module.exports = { auditInBrowser, emptyBrowserAudit };
