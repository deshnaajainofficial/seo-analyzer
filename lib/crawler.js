const axios = require("axios");

const USER_AGENT =
  "Mozilla/5.0 (compatible; SEOAuditBot/1.0; +https://internal-tool.local)";

const client = axios.create({
  timeout: 12000,
  maxRedirects: 5,
  headers: { "User-Agent": USER_AGENT },
  validateStatus: () => true, // we want to inspect status codes ourselves
});

/**
 * Normalizes a user-supplied URL: adds https:// if missing.
 */
function normalizeUrl(input) {
  let url = input.trim();
  if (!/^https?:\/\//i.test(url)) {
    url = "https://" + url;
  }
  return url;
}

/**
 * Fetches the target page along with robots.txt and sitemap.xml.
 * Failures on robots/sitemap are non-fatal — they just get reported as "missing".
 */
async function crawl(rawUrl) {
  const targetUrl = normalizeUrl(rawUrl);
  const origin = new URL(targetUrl).origin;

  const pageRequestStart = Date.now();
  const pageRes = await client.get(targetUrl);
  const loadTimeMs = Date.now() - pageRequestStart;

  if (pageRes.status >= 400) {
    const err = new Error(
      `Target URL responded with HTTP ${pageRes.status}`
    );
    err.httpStatus = pageRes.status;
    throw err;
  }

  const [robotsRes, sitemapRes] = await Promise.all([
    client.get(`${origin}/robots.txt`).catch(() => null),
    client.get(`${origin}/sitemap.xml`).catch(() => null),
  ]);

  return {
    targetUrl,
    origin,
    finalUrl: pageRes.request?.res?.responseUrl || targetUrl,
    html: pageRes.data,
    status: pageRes.status,
    headers: pageRes.headers,
    loadTimeMs,
    robotsTxt:
      robotsRes && robotsRes.status === 200 ? robotsRes.data : null,
    sitemapXml:
      sitemapRes && sitemapRes.status === 200 ? sitemapRes.data : null,
  };
}

/**
 * Checks a batch of internal links for broken (4xx/5xx) responses.
 * Limited to a small sample to keep scans fast.
 */
async function checkLinksHealth(links, origin, limit = 15) {
  const sample = links.slice(0, limit);
  const results = await Promise.all(
    sample.map(async (link) => {
      try {
        const res = await client.head(link, { timeout: 6000 });
        return { link, status: res.status, ok: res.status < 400 };
      } catch (e) {
        return { link, status: null, ok: false };
      }
    })
  );
  return results;
}

/**
 * Fetches up to `limit` external stylesheets linked from the page so the design
 * analysis (colors, fonts) isn't blind to sites that keep all their CSS in
 * separate files — which is the norm for most real client sites.
 * Failures on any individual stylesheet are non-fatal; that sheet is just skipped.
 */
async function fetchStylesheets($, origin, limit = 6) {
  const hrefs = [];
  $('link[rel="stylesheet"]').each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;
    try {
      const resolved = new URL(href, origin).href;
      hrefs.push(resolved);
    } catch (_) {
      /* ignore malformed href */
    }
  });

  const sample = hrefs.slice(0, limit);
  const results = await Promise.all(
    sample.map(async (url) => {
      try {
        const res = await client.get(url, { timeout: 8000, maxContentLength: 2_000_000 });
        if (res.status === 200 && typeof res.data === "string") {
          return { url, css: res.data };
        }
        return null;
      } catch (_) {
        return null;
      }
    })
  );

  return results.filter(Boolean);
}

module.exports = { crawl, checkLinksHealth, normalizeUrl, fetchStylesheets };
