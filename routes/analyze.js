const express = require("express");
const crypto = require("crypto");
const cheerio = require("cheerio");
const { crawl, checkLinksHealth, normalizeUrl, fetchStylesheets } = require("../lib/crawler");
const { auditInBrowser, emptyBrowserAudit } = require("../lib/browserAudit");
const {
  checkOnPage,
  checkTechnical,
  checkContent,
  extractInternalLinks,
} = require("../lib/checks");
const { analyzeDesign } = require("../lib/designAnalysis");
const { analyzeKeyword } = require("../lib/keywordAnalysis");
const { analyzeSecurity } = require("../lib/securityAnalysis");
const { analyzeLocalTrust, analyzeSiteNapConsistency } = require("../lib/localTrustAnalysis");
const { fetchSearchConsolePerformance } = require("../lib/searchConsole");
const { generateAiInsights, answerReportQuestion } = require("../lib/aiAnalysis");
const { computeScore } = require("../lib/scorer");
const { buildActionPlan } = require("../lib/actionPlan");
const { generatePdfReport } = require("../lib/pdfReport");

const router = express.Router();

// In-memory scan history (swap for MongoDB/PostgreSQL in production)
// Keyed by report id so a PDF can be regenerated on demand without rescanning.
const scanHistory = [];
const reportsById = new Map();

const DEFAULT_MAX_PAGES = 1;
const HARD_MAX_PAGES = 10;
const DEFAULT_MAX_DEPTH = 1;
const HARD_MAX_DEPTH = 3;

function issue(id, category, severity, message, recommendation, why, evidence, location) {
  return {
    id,
    category,
    severity,
    message,
    recommendation: recommendation || null,
    why: why || null,
    evidence: evidence || null,
    location: location || null,
  };
}

function checkBrowserAudit(browserAudit) {
  const browserWhy =
    "A real browser audit executes JavaScript, applies CSS, loads web fonts/images, and observes viewport behavior. That makes the findings closer to what users and modern Google rendering systems actually see than static HTML alone.";

  if (!browserAudit.available) {
    return [
      issue(
        "browser-render-unavailable",
        "Technical",
        "warning",
        "Headless browser rendering was unavailable, so this scan used the static HTML fallback.",
        "Install the Playwright Chromium browser on the server and ensure outbound page loads are allowed.",
        browserWhy,
        browserAudit.error || "Browser audit failed before rendering",
        "Audit infrastructure"
      ),
    ];
  }

  const results = [
    issue(
      "browser-render-ok",
      "Technical",
      "good",
      "Page rendered successfully in headless Chrome.",
      null,
      browserWhy,
      `Rendered final URL: ${browserAudit.finalUrl}`,
      "Rendered page"
    ),
  ];

  const vitals = browserAudit.webVitals || {};
  const lcpWhy =
    "Largest Contentful Paint measures when the largest above-the-fold content finishes rendering. Google recommends LCP under 2500ms because slow primary content delays the moment users can meaningfully engage with the page.";
  if (vitals.lcp !== null) {
    if (vitals.lcp > 4000) {
      results.push(issue("cwv-lcp-poor", "Technical", "critical", `Largest Contentful Paint is ${vitals.lcp}ms.`, "Optimize hero images, preload critical assets, reduce render-blocking CSS/JS, and improve server response time.", lcpWhy, `LCP ${vitals.lcp}ms (poor threshold: >4000ms)`, "Rendered viewport"));
    } else if (vitals.lcp > 2500) {
      results.push(issue("cwv-lcp-needs-improvement", "Technical", "warning", `Largest Contentful Paint is ${vitals.lcp}ms.`, "Aim to get LCP below 2500ms by optimizing the largest hero/text/media element and critical rendering path.", lcpWhy, `LCP ${vitals.lcp}ms (good threshold: <=2500ms)`, "Rendered viewport"));
    } else {
      results.push(issue("cwv-lcp-ok", "Technical", "good", `Largest Contentful Paint is good (${vitals.lcp}ms).`, null, lcpWhy, `LCP ${vitals.lcp}ms`, "Rendered viewport"));
    }
  }

  const clsWhy =
    "Cumulative Layout Shift measures unexpected movement while the page loads. Google recommends CLS below 0.1 because shifting content causes misclicks, visual instability, and a less trustworthy experience.";
  if (vitals.cls !== null && vitals.cls !== undefined) {
    if (vitals.cls > 0.25) {
      results.push(issue("cwv-cls-poor", "Technical", "critical", `Cumulative Layout Shift is ${vitals.cls}.`, "Reserve width/height for images, embeds, ads, and late-loading banners so content does not jump after first paint.", clsWhy, `CLS ${vitals.cls} (poor threshold: >0.25)`, "Rendered viewport"));
    } else if (vitals.cls > 0.1) {
      results.push(issue("cwv-cls-needs-improvement", "Technical", "warning", `Cumulative Layout Shift is ${vitals.cls}.`, "Reserve stable layout space for media and injected UI until CLS is below 0.1.", clsWhy, `CLS ${vitals.cls} (good threshold: <=0.1)`, "Rendered viewport"));
    } else {
      results.push(issue("cwv-cls-ok", "Technical", "good", `Cumulative Layout Shift is good (${vitals.cls}).`, null, clsWhy, `CLS ${vitals.cls}`, "Rendered viewport"));
    }
  }

  const inpWhy =
    "Interaction to Next Paint estimates responsiveness after user input. In a lab scan there may be no natural interaction to observe, so this audit records INP only when Chrome captures an interaction event during the render pass.";
  if (vitals.inp !== null && vitals.inp !== undefined) {
    if (vitals.inp > 500) {
      results.push(issue("cwv-inp-poor", "Technical", "critical", `Interaction to Next Paint is ${vitals.inp}ms.`, "Reduce long JavaScript tasks, defer non-critical scripts, and split heavy client-side work so interactions paint within 200ms.", inpWhy, `INP ${vitals.inp}ms (poor threshold: >500ms)`, "Rendered viewport"));
    } else if (vitals.inp > 200) {
      results.push(issue("cwv-inp-needs-improvement", "Technical", "warning", `Interaction to Next Paint is ${vitals.inp}ms.`, "Profile JavaScript main-thread work and get interaction latency below 200ms.", inpWhy, `INP ${vitals.inp}ms (good threshold: <=200ms)`, "Rendered viewport"));
    } else {
      results.push(issue("cwv-inp-ok", "Technical", "good", `Interaction to Next Paint is good (${vitals.inp}ms).`, null, inpWhy, `INP ${vitals.inp}ms`, "Rendered viewport"));
    }
  } else {
    results.push(issue("cwv-inp-not-observed", "Technical", "warning", "Interaction to Next Paint was not observed during this no-user browser scan.", "For production accuracy, pair this lab audit with field data from Chrome UX Report or Search Console Core Web Vitals.", inpWhy, "No qualifying interaction event was captured", "Rendered viewport"));
  }

  return results;
}

function parsePositiveInt(value, fallback, max) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, max);
}

function normalizeCrawlUrl(url) {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    if ((parsed.protocol === "http:" && parsed.port === "80") || (parsed.protocol === "https:" && parsed.port === "443")) {
      parsed.port = "";
    }
    return parsed.href;
  } catch (_) {
    return null;
  }
}

function extractSitemapUrls(xml, origin, limit) {
  if (!xml || typeof xml !== "string") return [];
  const urls = [];
  const seen = new Set();
  const locPattern = /<loc>\s*([^<]+)\s*<\/loc>/gi;
  let match;
  while ((match = locPattern.exec(xml)) !== null && urls.length < limit) {
    try {
      const url = normalizeCrawlUrl(match[1].trim());
      if (!url) continue;
      const parsed = new URL(url);
      if (parsed.origin !== origin || seen.has(url)) continue;
      seen.add(url);
      urls.push(url);
    } catch (_) {
      /* ignore malformed sitemap URLs */
    }
  }
  return urls;
}

function severityCounts(issues) {
  return issues.reduce(
    (counts, item) => {
      counts[item.severity] = (counts[item.severity] || 0) + 1;
      return counts;
    },
    { good: 0, warning: 0, critical: 0 }
  );
}

function gradeFromScore(score) {
  if (score >= 90) return "A";
  if (score >= 75) return "B";
  if (score >= 60) return "C";
  if (score >= 40) return "D";
  return "F";
}

async function analyzePage(rawUrl, options = {}) {
  let crawlData;
  try {
    crawlData = await crawl(rawUrl);
  } catch (err) {
    err.auditUrl = rawUrl;
    throw err;
  }

  const browserAudit = await auditInBrowser(crawlData.targetUrl).catch((err) => emptyBrowserAudit(err));
  const renderedHtml = browserAudit.available && browserAudit.html ? browserAudit.html : crawlData.html;
  const renderedFinalUrl = browserAudit.available && browserAudit.finalUrl ? browserAudit.finalUrl : crawlData.finalUrl;
  const effectiveCrawlData = {
    ...crawlData,
    finalUrl: renderedFinalUrl,
    origin: new URL(renderedFinalUrl).origin,
    loadTimeMs: browserAudit.available && browserAudit.loadTimeMs ? browserAudit.loadTimeMs : crawlData.loadTimeMs,
  };
  const $ = cheerio.load(renderedHtml);

  const onPage = checkOnPage($);
  const technicalIssues = checkTechnical($, effectiveCrawlData);
  const content = checkContent($);

  const renderedOrigin = effectiveCrawlData.origin;
  const internalLinks = extractInternalLinks($, renderedOrigin)
    .map(normalizeCrawlUrl)
    .filter(Boolean);
  const linkHealth = await checkLinksHealth(internalLinks, renderedOrigin);
  const brokenLinks = linkHealth.filter((l) => !l.ok);

  const linkIssues = [];
  const linkWhy =
    "Broken internal links waste crawl budget (Googlebot follows links to discover pages, and every dead end is a wasted request) and directly frustrate users navigating the site, which increases bounce rate and pogo-sticking back to search results — a behavioral signal Google associates with poor page quality.";

  if (internalLinks.length === 0) {
    linkIssues.push({
      id: "links-none",
      category: "Links",
      severity: "warning",
      message: "No internal links found on the page.",
      recommendation: "Add internal links to help users and crawlers navigate the site.",
      why: linkWhy,
      evidence: "0 internal <a href> links found",
      location: "Whole page",
    });
  } else if (brokenLinks.length > 0) {
    linkIssues.push({
      id: "links-broken",
      category: "Links",
      severity: "critical",
      message: `${brokenLinks.length} of ${linkHealth.length} sampled internal links appear broken.`,
      recommendation: "Fix or remove broken links; they hurt UX and crawl efficiency.",
      why: linkWhy,
      evidence: brokenLinks.map((l) => `${l.status || "no response"} — ${l.link}`).join("; "),
      location: brokenLinks.map((l) => l.link).slice(0, 5).join(" | "),
    });
  } else {
    linkIssues.push({
      id: "links-ok",
      category: "Links",
      severity: "good",
      message: `Sampled ${linkHealth.length} internal links — all responded successfully.`,
      recommendation: null,
      why: linkWhy,
      evidence: `${linkHealth.length}/${linkHealth.length} sampled links returned a healthy status`,
      location: "Whole page",
    });
  }

  const design = analyzeDesign($, await fetchStylesheets($, renderedOrigin), browserAudit);
  const browserIssues = checkBrowserAudit(browserAudit);
  const searchPerformance = await fetchSearchConsolePerformance({
    accessToken: options.searchConsole?.accessToken,
    propertyUrl: options.searchConsole?.propertyUrl,
    pageUrl: renderedFinalUrl,
    targetKeyword: options.targetKeyword,
    startDate: options.searchConsole?.startDate,
    endDate: options.searchConsole?.endDate,
  });
  const keyword = analyzeKeyword($, options.targetKeyword, searchPerformance);
  const security = await analyzeSecurity({ $, crawlData: effectiveCrawlData, browserAudit });
  const localTrust = analyzeLocalTrust($, renderedFinalUrl);

  const allIssues = [
    ...onPage.results,
    ...technicalIssues,
    ...content.results,
    ...linkIssues,
    ...design.results,
    ...browserIssues,
    ...keyword.results,
    ...security.results,
    ...localTrust.results,
  ];

  const { score, grade, byCategory, ledger, summary } = computeScore(allIssues);
  const actionPlan = buildActionPlan(allIssues, score);
  const report = {
    id: options.id || crypto.randomUUID(),
    url: normalizeUrl(rawUrl),
    finalUrl: renderedFinalUrl,
    scannedAt: options.scannedAt || new Date().toISOString(),
    score,
    grade,
    byCategory,
    scoreLedger: ledger,
    scoreSummary: summary,
    scoreSimulator: actionPlan.scoreSimulator,
    actionPlan,
    design: {
      palette: design.palette,
      topColors: design.topColors,
      primaryColor: design.primaryColor,
      colorSelection: design.colorSelection,
      fonts: design.fonts,
      distinctColorCount: design.distinctColorCount,
      stylesheetsScanned: design.stylesheetsScanned,
      source: design.source,
    },
    metrics: {
      title: onPage.title,
      metaDescription: onPage.metaDesc,
      wordCount: content.wordCount,
      readability: content.readability,
      loadTimeMs: browserAudit.available && browserAudit.loadTimeMs ? browserAudit.loadTimeMs : crawlData.loadTimeMs,
      staticLoadTimeMs: crawlData.loadTimeMs,
      browserRendered: browserAudit.available,
      webVitals: browserAudit.webVitals,
      internalLinksSampled: linkHealth.length,
      brokenLinks: brokenLinks.length,
      keyword: keyword.metrics,
      searchPerformance: keyword.searchPerformance,
    },
    keyword: {
      enabled: keyword.enabled,
      target: keyword.keyword,
      metrics: keyword.metrics,
      searchPerformance: keyword.searchPerformance,
    },
    security: {
      libraries: security.libraries,
      vulnerabilities: security.vulnerabilities,
      missingHeaders: security.missingHeaders,
      exposedFilesChecked: security.exposedFilesChecked,
    },
    localTrust: {
      explanation: localTrust.explanation,
      phones: localTrust.phones,
      addresses: localTrust.addresses,
      localBusinessSchema: localTrust.localBusinessSchema,
      trustSignals: localTrust.trustSignals,
    },
    screenshot: options.includeScreenshot === false ? null : browserAudit.available ? browserAudit.screenshotDataUrl : null,
    issues: allIssues,
    crawl: {
      origin: renderedOrigin,
      internalLinks,
      linkHealth,
      brokenLinks,
      sitemapUrls: extractSitemapUrls(crawlData.sitemapXml, renderedOrigin, HARD_MAX_PAGES * 3),
      h1Count: $("h1").length,
      headingSequence: $("h1,h2,h3,h4,h5,h6")
        .toArray()
        .map((el) => el.tagName.toUpperCase())
        .join(" > "),
    },
  };

  return report;
}

function summarizePage(report, depth, source) {
  return {
    url: report.finalUrl,
    depth,
    source,
    score: report.score,
    grade: report.grade,
    title: report.metrics.title || "",
    h1Count: report.crawl.h1Count,
    headingSequence: report.crawl.headingSequence,
    wordCount: report.metrics.wordCount,
    loadTimeMs: report.metrics.loadTimeMs,
    browserRendered: report.metrics.browserRendered,
    internalLinksFound: report.crawl.internalLinks.length,
    brokenLinks: report.crawl.brokenLinks.length,
    keywordDensity: report.keyword?.metrics?.density ?? null,
    keywordInTitle: report.keyword?.metrics?.titleHasKeyword ?? null,
    securityWarnings: report.issues.filter((item) => item.category === "Security" && item.severity !== "good").length,
    localTrustWarnings: report.issues.filter((item) => item.category === "Local Trust" && item.severity !== "good").length,
    severity: severityCounts(report.issues),
  };
}

function buildSitewideIssues(pageReports, inboundMap, seedUrl) {
  const issues = [];
  const titleMap = new Map();
  const brokenMap = [];
  const headingProblemPages = [];
  const auditedUrls = new Set(pageReports.map((page) => normalizeCrawlUrl(page.finalUrl)));

  pageReports.forEach((page) => {
    const title = (page.metrics.title || "").trim().toLowerCase();
    if (title) {
      if (!titleMap.has(title)) titleMap.set(title, []);
      titleMap.get(title).push(page.finalUrl);
    }

    page.crawl.brokenLinks.forEach((link) => {
      brokenMap.push({ from: page.finalUrl, to: link.link, status: link.status });
    });

    if (
      page.issues.some((item) =>
        ["h1-missing", "h1-multiple", "heading-hierarchy"].includes(item.id)
      )
    ) {
      headingProblemPages.push(page.finalUrl);
    }
  });

  const duplicateGroups = Array.from(titleMap.entries()).filter(([, urls]) => urls.length > 1);
  if (duplicateGroups.length > 0) {
    issues.push(
      issue(
        "site-duplicate-titles",
        "Sitewide",
        "critical",
        `${duplicateGroups.length} duplicate title tag group${duplicateGroups.length === 1 ? "" : "s"} found across crawled pages.`,
        "Make every indexable page title unique and specific to that page's search intent.",
        "Duplicate title tags blur page intent for search engines and can cause pages to compete with each other in search results instead of each page ranking for its own focused query.",
        duplicateGroups
          .slice(0, 4)
          .map(([title, urls]) => `"${title}" on ${urls.length} pages: ${urls.join(" | ")}`)
          .join(" ; "),
        "Crawled page titles"
      )
    );
  } else {
    issues.push(issue("site-duplicate-titles-ok", "Sitewide", "good", "No duplicate title tags found across crawled pages.", null, null, `${pageReports.length} page title(s) compared`, "Crawled page titles"));
  }

  const seed = normalizeCrawlUrl(seedUrl);
  const orphanPages = pageReports
    .map((page) => normalizeCrawlUrl(page.finalUrl))
    .filter((url) => url && url !== seed && auditedUrls.has(url) && (!inboundMap.get(url) || inboundMap.get(url).size === 0));

  if (orphanPages.length > 0) {
    issues.push(
      issue(
        "site-orphan-pages",
        "Sitewide",
        "warning",
        `${orphanPages.length} crawled page${orphanPages.length === 1 ? "" : "s"} had no internal links pointing to them in the sampled crawl.`,
        "Add contextual internal links from relevant pages so users and crawlers can discover these URLs without relying only on sitemap discovery.",
        "Pages with no internal inbound links are harder for crawlers to discover, receive less internal PageRank, and often signal thin or disconnected site architecture.",
        orphanPages.slice(0, 8).join(" | "),
        "Internal link graph"
      )
    );
  } else {
    issues.push(issue("site-orphan-pages-ok", "Sitewide", "good", "No orphan pages found inside the sampled crawl.", null, null, `${pageReports.length} crawled page(s) checked`, "Internal link graph"));
  }

  if (headingProblemPages.length > 0) {
    issues.push(
      issue(
        "site-heading-inconsistency",
        "Sitewide",
        "warning",
        `${headingProblemPages.length} crawled page${headingProblemPages.length === 1 ? "" : "s"} have missing, repeated, or skipped heading structure.`,
        "Fix the shared page templates first; heading problems repeated across pages are usually caused by layout components rather than one-off content.",
        "Inconsistent heading structure across templates makes site sections harder for search engines and assistive technology to interpret consistently.",
        headingProblemPages.slice(0, 8).join(" | "),
        "Crawled heading outlines"
      )
    );
  } else {
    issues.push(issue("site-heading-inconsistency-ok", "Sitewide", "good", "Heading structure is consistent across crawled pages.", null, null, `${pageReports.length} heading outline(s) checked`, "Crawled heading outlines"));
  }

  if (brokenMap.length > 0) {
    issues.push(
      issue(
        "site-broken-link-map",
        "Sitewide",
        "critical",
        `${brokenMap.length} broken internal link instance${brokenMap.length === 1 ? "" : "s"} found across the sampled crawl.`,
        "Fix or remove these links at the source pages, then rerun the crawl to confirm the sitewide map is clean.",
        "A sitewide broken-link map shows whether dead links are isolated or repeated across templates/navigation, which helps prioritize the highest-impact fixes.",
        brokenMap.slice(0, 10).map((item) => `${item.status || "no response"} ${item.to} from ${item.from}`).join(" | "),
        "Internal link graph"
      )
    );
  } else {
    issues.push(issue("site-broken-link-map-ok", "Sitewide", "good", "No broken internal links found across sampled pages.", null, null, `${pageReports.length} page(s) checked`, "Internal link graph"));
  }

  return issues;
}

async function analyzeSite(seedUrl, { maxPages, maxDepth, targetKeyword, searchConsole }) {
  const scannedAt = new Date().toISOString();
  const seedReport = await analyzePage(seedUrl, { scannedAt, includeScreenshot: true, targetKeyword, searchConsole });
  const seed = normalizeCrawlUrl(seedReport.finalUrl);
  const origin = seedReport.crawl.origin;
  const queue = [];
  const queued = new Set([seed]);
  const pageReports = [seedReport];
  const pageMeta = new Map([[seed, { depth: 0, source: "seed" }]]);
  const inboundMap = new Map();

  const enqueue = (url, depth, source) => {
    const normalized = normalizeCrawlUrl(url);
    if (!normalized || queued.has(normalized) || queued.size >= maxPages * 4) return;
    try {
      if (new URL(normalized).origin !== origin || depth > maxDepth) return;
      queued.add(normalized);
      pageMeta.set(normalized, { depth, source });
      queue.push({ url: normalized, depth, source });
    } catch (_) {
      /* ignore malformed URLs */
    }
  };

  seedReport.crawl.sitemapUrls.forEach((url) => enqueue(url, 0, "sitemap"));
  seedReport.crawl.internalLinks.forEach((url) => {
    const normalized = normalizeCrawlUrl(url);
    if (!normalized) return;
    if (!inboundMap.has(normalized)) inboundMap.set(normalized, new Set());
    inboundMap.get(normalized).add(seed);
    enqueue(normalized, 1, "link");
  });

  while (queue.length > 0 && pageReports.length < maxPages) {
    const next = queue.shift();
    const normalizedNext = normalizeCrawlUrl(next.url);
    if (!normalizedNext || pageReports.some((page) => normalizeCrawlUrl(page.finalUrl) === normalizedNext)) continue;

    let pageReport;
    try {
      pageReport = await analyzePage(next.url, { scannedAt, includeScreenshot: false, targetKeyword, searchConsole });
    } catch (_) {
      continue;
    }

    pageReports.push(pageReport);
    const currentUrl = normalizeCrawlUrl(pageReport.finalUrl);
    pageReport.crawl.internalLinks.forEach((link) => {
      const normalized = normalizeCrawlUrl(link);
      if (!normalized) return;
      if (!inboundMap.has(normalized)) inboundMap.set(normalized, new Set());
      inboundMap.get(normalized).add(currentUrl);
      enqueue(normalized, next.depth + 1, "link");
    });
  }

  const sitewideIssues = [
    ...buildSitewideIssues(pageReports, inboundMap, seed),
    ...analyzeSiteNapConsistency(pageReports),
  ];
  const sitewideScore = computeScore(sitewideIssues);
  const averagePageScore = Math.round(pageReports.reduce((sum, page) => sum + page.score, 0) / pageReports.length);
  const overallScore = Math.round(averagePageScore * 0.75 + sitewideScore.score * 0.25);
  const overallGrade = gradeFromScore(overallScore);

  seedReport.id = crypto.randomUUID();
  seedReport.scannedAt = scannedAt;
  seedReport.siteAudit = {
    enabled: true,
    seedUrl: seed,
    maxPages,
    maxDepth,
    pagesCrawled: pageReports.length,
    queuedUrlsSeen: queued.size,
    averagePageScore,
    sitewideScore: sitewideScore.score,
    overallScore,
    overallGrade,
    issues: sitewideIssues,
    pages: pageReports.map((page) => {
      const meta = pageMeta.get(normalizeCrawlUrl(page.finalUrl)) || { depth: 0, source: "link" };
      return summarizePage(page, meta.depth, meta.source);
    }),
    brokenLinkMap: pageReports.flatMap((page) =>
      page.crawl.brokenLinks.map((link) => ({
        from: page.finalUrl,
        to: link.link,
        status: link.status,
      }))
    ),
  };

  seedReport.score = overallScore;
  seedReport.grade = overallGrade;

  return seedReport;
}

router.post("/analyze", async (req, res) => {
  const { url } = req.body;
  const maxPages = parsePositiveInt(req.body.maxPages, DEFAULT_MAX_PAGES, HARD_MAX_PAGES);
  const maxDepth = parsePositiveInt(req.body.maxDepth, DEFAULT_MAX_DEPTH, HARD_MAX_DEPTH);
  const targetKeyword = typeof req.body.targetKeyword === "string" ? req.body.targetKeyword.trim() : "";
  const searchConsole = {
    accessToken: typeof req.body.gscAccessToken === "string" ? req.body.gscAccessToken.trim() : "",
    propertyUrl: typeof req.body.gscPropertyUrl === "string" ? req.body.gscPropertyUrl.trim() : "",
    startDate: typeof req.body.gscStartDate === "string" ? req.body.gscStartDate.trim() : "",
    endDate: typeof req.body.gscEndDate === "string" ? req.body.gscEndDate.trim() : "",
  };

  if (!url || typeof url !== "string" || !url.trim()) {
    return res.status(400).json({ error: "Please provide a URL to analyze." });
  }

  let report;
  try {
    report = maxPages > 1
      ? await analyzeSite(url, { maxPages, maxDepth, targetKeyword, searchConsole })
      : await analyzePage(url, { scannedAt: new Date().toISOString(), includeScreenshot: true, targetKeyword, searchConsole });
  } catch (err) {
    return res.status(422).json({
      error:
        err.httpStatus
          ? `Could not fetch the page (HTTP ${err.httpStatus}).`
          : "Could not reach that URL. Check it's correct and publicly accessible.",
    });
  }

  scanHistory.unshift(report);
  if (scanHistory.length > 50) scanHistory.pop();

  reportsById.set(report.id, report);
  // Cap stored full reports so memory doesn't grow unbounded during long sessions
  if (reportsById.size > 50) {
    const oldestKey = reportsById.keys().next().value;
    reportsById.delete(oldestKey);
  }

  res.json(report);
});

router.get("/report/:id/pdf", (req, res) => {
  const report = reportsById.get(req.params.id);
  if (!report) {
    return res.status(404).json({ error: "Report not found. Run a new scan first." });
  }

  const safeName = report.finalUrl.replace(/^https?:\/\//, "").replace(/[^a-z0-9.-]/gi, "_");
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="auditline-${safeName}.pdf"`);

  generatePdfReport(report, res);
});

router.post("/report/:id/ai", async (req, res) => {
  const report = reportsById.get(req.params.id);
  if (!report) {
    return res.status(404).json({ error: "Report not found. Run a new scan first." });
  }

  const competitorUrls = Array.isArray(req.body.competitorUrls)
    ? req.body.competitorUrls.map((url) => String(url || "").trim()).filter(Boolean).slice(0, 3)
    : [];
  const targetAudience = typeof req.body.targetAudience === "string" ? req.body.targetAudience.trim() : "";
  const apiKey = typeof req.body.openaiApiKey === "string" ? req.body.openaiApiKey.trim() : "";
  const model = typeof req.body.openaiModel === "string" ? req.body.openaiModel.trim() : "";
  const provider = ["openai", "xai", "auto"].includes(req.body.aiProvider) ? req.body.aiProvider : "auto";
  const customApiBaseUrl = typeof req.body.customApiBaseUrl === "string" ? req.body.customApiBaseUrl.trim() : "";

  try {
    const competitorReports = [];
    for (const url of competitorUrls) {
      try {
        competitorReports.push(
          await analyzePage(url, {
            scannedAt: new Date().toISOString(),
            includeScreenshot: false,
            targetKeyword: report.keyword?.target || "",
          })
        );
      } catch (_) {
        competitorReports.push({
          finalUrl: url,
          score: null,
          grade: null,
          issues: [
            issue(
              "competitor-scan-failed",
              "AI",
              "warning",
              "Competitor URL could not be scanned.",
              "Check that the competitor URL is public and reachable.",
              null,
              url,
              "Competitor comparison"
            ),
          ],
        });
      }
    }

    const insights = await generateAiInsights({
      report,
      competitorReports,
      targetAudience,
      apiKey,
      model,
      provider,
      customApiBaseUrl,
    });

    report.aiInsights = {
      generatedAt: new Date().toISOString(),
      targetAudience,
      competitorUrls,
      insights,
    };

    res.json(report.aiInsights);
  } catch (err) {
    res.status(err.code === "missing_api_key" ? 400 : 502).json({
      error: err.response?.data?.error?.message || err.message || "AI analysis failed.",
    });
  }
});

router.post("/report/:id/ai/chat", async (req, res) => {
  const report = reportsById.get(req.params.id);
  if (!report) {
    return res.status(404).json({ error: "Report not found. Run a new scan first." });
  }

  const question = typeof req.body.question === "string" ? req.body.question.trim() : "";
  if (!question) {
    return res.status(400).json({ error: "Please enter a question about the report." });
  }

  const apiKey = typeof req.body.openaiApiKey === "string" ? req.body.openaiApiKey.trim() : "";
  const model = typeof req.body.openaiModel === "string" ? req.body.openaiModel.trim() : "";
  const provider = ["openai", "xai", "auto"].includes(req.body.aiProvider) ? req.body.aiProvider : "auto";
  const customApiBaseUrl = typeof req.body.customApiBaseUrl === "string" ? req.body.customApiBaseUrl.trim() : "";
  try {
    const answer = await answerReportQuestion({
      report,
      aiInsights: report.aiInsights?.insights || null,
      question,
      apiKey,
      model,
      provider,
      customApiBaseUrl,
    });

    res.json({ answer });
  } catch (err) {
    res.status(err.code === "missing_api_key" ? 400 : 502).json({
      error: err.response?.data?.error?.message || err.message || "AI question answering failed.",
    });
  }
});

router.get("/history", (_req, res) => {
  res.json(
    scanHistory.map((r) => ({
      url: r.url,
      scannedAt: r.scannedAt,
      score: r.score,
      grade: r.grade,
      pagesCrawled: r.siteAudit?.pagesCrawled || 1,
    }))
  );
});

module.exports = router;
