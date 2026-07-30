const cheerio = require("cheerio");
const { describeLocation, nearbySnippet, splitIntoSections } = require("./location");

// Severity levels used consistently across every check
const SEVERITY = { GOOD: "good", WARNING: "warning", CRITICAL: "critical" };

/**
 * Builds a single issue/finding object.
 * `why` explains the underlying mechanism. `evidence` is the raw value the
 * crawler extracted. `location` pinpoints exactly where on the page the
 * issue lives (nearest heading/section, snippet, index) so a client can
 * find the exact spot without guessing.
 */
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

/* ---------------------------------- */
/* 1. ON-PAGE SEO CHECKS              */
/* ---------------------------------- */
function checkOnPage($) {
  const results = [];

  // ---- Title tag ----
  const title = $("title").first().text().trim();
  const titleWhy =
    "The <title> tag is the single strongest on-page relevance signal Google uses to decide what a page is about, and it's also rendered verbatim as the clickable blue link in search results — it directly affects both ranking and click-through rate.";

  if (!title) {
    results.push(
      issue(
        "title-missing",
        "On-Page",
        SEVERITY.CRITICAL,
        "No <title> tag found.",
        "Add a unique, descriptive <title> tag (50-60 characters) that front-loads the primary keyword.",
        titleWhy,
        "<title></title>",
        "Document <head>"
      )
    );
  } else if (title.length < 30 || title.length > 60) {
    results.push(
      issue(
        "title-length",
        "On-Page",
        SEVERITY.WARNING,
        `Title tag is ${title.length} characters.`,
        "Aim for 50-60 characters. Google truncates titles past ~600px of rendered width (roughly 60 characters), replacing the tail with an ellipsis.",
        titleWhy,
        title,
        "Document <head> → <title>"
      )
    );
  } else {
    results.push(
      issue(
        "title-ok",
        "On-Page",
        SEVERITY.GOOD,
        `Title tag length is within the safe range (${title.length} characters).`,
        null,
        titleWhy,
        title,
        "Document <head> → <title>"
      )
    );
  }

  // ---- Meta description ----
  const metaDesc = $('meta[name="description"]').attr("content") || "";
  const metaWhy =
    "The meta description is not a ranking factor itself, but Google frequently uses it verbatim as the search-result snippet. A well-written description increases click-through rate, which is an indirect but measurable ranking signal.";

  if (!metaDesc.trim()) {
    results.push(
      issue(
        "meta-desc-missing",
        "On-Page",
        SEVERITY.CRITICAL,
        "No meta description found.",
        "Add a meta description of 150-160 characters summarizing the page and including a call to action.",
        metaWhy,
        '<meta name="description" content="">',
        "Document <head>"
      )
    );
  } else if (metaDesc.length < 70 || metaDesc.length > 160) {
    results.push(
      issue(
        "meta-desc-length",
        "On-Page",
        SEVERITY.WARNING,
        `Meta description is ${metaDesc.length} characters.`,
        "Aim for 150-160 characters. Google truncates snippets around 155-160 characters on desktop.",
        metaWhy,
        metaDesc,
        "Document <head> → <meta name=\"description\">"
      )
    );
  } else {
    results.push(
      issue(
        "meta-desc-ok",
        "On-Page",
        SEVERITY.GOOD,
        "Meta description length is within the safe range.",
        null,
        metaWhy,
        metaDesc,
        "Document <head> → <meta name=\"description\">"
      )
    );
  }

  // ---- H1 checks ----
  const h1s = $("h1");
  const h1Why =
    "The H1 is the strongest heading-level signal for topical relevance after the title tag. Screen readers also announce H1s to blind/low-vision users as the page's main heading, so it carries both an SEO and an accessibility function.";

  if (h1s.length === 0) {
    results.push(
      issue(
        "h1-missing",
        "On-Page",
        SEVERITY.CRITICAL,
        "No H1 tag found on the page.",
        "Add exactly one H1 that describes the page's main topic in plain language.",
        h1Why,
        "0 <h1> elements found",
        "Not applicable — no H1 exists anywhere on the page"
      )
    );
  } else if (h1s.length > 1) {
    const locations = h1s
      .toArray()
      .slice(0, 6)
      .map((el, i) => `H1 #${i + 1}: "${$(el).text().trim().slice(0, 60)}"`)
      .join(" | ");
    results.push(
      issue(
        "h1-multiple",
        "On-Page",
        SEVERITY.WARNING,
        `Found ${h1s.length} H1 tags on the page.`,
        "Keep only the first (or most important) H1; demote the rest to H2/H3 so the topical hierarchy stays unambiguous.",
        h1Why,
        `${h1s.length} <h1> elements found`,
        locations
      )
    );
  } else {
    results.push(
      issue(
        "h1-ok",
        "On-Page",
        SEVERITY.GOOD,
        "Exactly one H1 tag found.",
        null,
        h1Why,
        $(h1s[0]).text().trim().slice(0, 80),
        "Top of main content, before the first section"
      )
    );
  }

  // ---- Heading hierarchy ----
  const headingEls = $("h1,h2,h3,h4,h5,h6").toArray();
  const headingLevels = headingEls.map((el) => Number(el.tagName.substring(1)));
  let breakAt = -1;
  for (let i = 1; i < headingLevels.length; i++) {
    if (headingLevels[i] - headingLevels[i - 1] > 1) {
      breakAt = i;
      break;
    }
  }
  const hierarchyWhy =
    "Search engines and assistive technology both parse heading tags as a nested outline, similar to a document's table of contents. Skipping a level (H1 straight to H3) breaks that outline, making the page's structure ambiguous to crawlers and unusable for screen-reader users who navigate by heading level.";

  if (breakAt !== -1) {
    const before = `H${headingLevels[breakAt - 1]} "${$(headingEls[breakAt - 1]).text().trim().slice(0, 40)}"`;
    const after = `H${headingLevels[breakAt]} "${$(headingEls[breakAt]).text().trim().slice(0, 40)}"`;
    results.push(
      issue(
        "heading-hierarchy",
        "On-Page",
        SEVERITY.WARNING,
        "Heading levels skip a level (e.g. H1 straight to H3).",
        "Keep heading order sequential — don't skip levels even for pure styling reasons; use CSS for size instead.",
        hierarchyWhy,
        `Sequence: ${headingLevels.map((l) => "H" + l).join(" > ")}`,
        `Break occurs between ${before} and ${after}`
      )
    );
  } else {
    results.push(
      issue(
        "heading-hierarchy-ok",
        "On-Page",
        SEVERITY.GOOD,
        "Heading hierarchy is sequential with no skipped levels.",
        null,
        hierarchyWhy,
        `Sequence: ${headingLevels.map((l) => "H" + l).join(" > ") || "none"}`,
        "Whole document"
      )
    );
  }

  // ---- Image alt attributes ----
  const images = $("img");
  const missingAltEls = images.toArray().filter((el) => !$(el).attr("alt") || !$(el).attr("alt").trim());
  const altWhy =
    "Alt text is the only description of an image that screen readers can announce and the only text Google Images can index, since crawlers cannot 'see' pixels. It's also the fallback shown when an image fails to load.";

  if (images.length === 0) {
    results.push(
      issue(
        "images-none",
        "On-Page",
        SEVERITY.WARNING,
        "No images found on the page.",
        null,
        "Pages with zero visual content don't get penalized directly, but relevant imagery typically improves engagement metrics that correlate with rankings.",
        "0 <img> elements found",
        "Whole document"
      )
    );
  } else if (missingAltEls.length > 0) {
    const locationList = missingAltEls
      .slice(0, 6)
      .map((el, i) => {
        const src = ($(el).attr("src") || "unknown-src").split("/").pop().slice(0, 40);
        return `image "${src}" — ${describeLocation($, el)}`;
      })
      .join(" | ");
    const suffix = missingAltEls.length > 6 ? ` (+ ${missingAltEls.length - 6} more)` : "";

    results.push(
      issue(
        "alt-missing",
        "On-Page",
        SEVERITY.WARNING,
        `${missingAltEls.length} of ${images.length} images are missing alt text.`,
        "Add concise, descriptive alt attributes (not keyword-stuffed) for every meaningful image; use alt=\"\" only for purely decorative images.",
        altWhy,
        `${missingAltEls.length}/${images.length} <img> tags without an alt attribute`,
        locationList + suffix
      )
    );
  } else {
    results.push(
      issue(
        "alt-ok",
        "On-Page",
        SEVERITY.GOOD,
        `All ${images.length} image(s) have alt attributes.`,
        null,
        altWhy,
        `${images.length}/${images.length} <img> tags have alt text`,
        "Whole document"
      )
    );
  }

  return { results, title, metaDesc };
}

/* ---------------------------------- */
/* 2. TECHNICAL SEO CHECKS            */
/* ---------------------------------- */
function checkTechnical($, crawlData) {
  const results = [];

  // ---- HTTPS ----
  const isHttps = crawlData.finalUrl.startsWith("https://");
  const httpsWhy =
    "Google has used HTTPS as a confirmed ranking signal since 2014, and modern browsers flag plain-HTTP pages as 'Not Secure' in the address bar, which measurably increases bounce rate — so this affects both algorithmic ranking and real-world user trust.";

  results.push(
    isHttps
      ? issue(
          "https-ok",
          "Technical",
          SEVERITY.GOOD,
          "Site is served over HTTPS.",
          null,
          httpsWhy,
          crawlData.finalUrl,
          "Protocol / server configuration (not a specific page element)"
        )
      : issue(
          "https-missing",
          "Technical",
          SEVERITY.CRITICAL,
          "Site is not served over HTTPS.",
          "Install an SSL/TLS certificate (e.g. via Let's Encrypt) and 301-redirect all HTTP traffic to HTTPS.",
          httpsWhy,
          crawlData.finalUrl,
          "Protocol / server configuration (not a specific page element)"
        )
  );

  // ---- Viewport meta ----
  const viewport = $('meta[name="viewport"]').attr("content");
  const viewportWhy =
    "Google has used mobile-first indexing since 2019 — it primarily crawls and ranks pages using the mobile version of your content. Without a viewport tag, mobile browsers render the page at a fixed desktop width and scale it down, producing tiny unreadable text and triggering Google's mobile-usability penalties.";

  results.push(
    viewport
      ? issue(
          "viewport-ok",
          "Technical",
          SEVERITY.GOOD,
          "Viewport meta tag present — page can adapt to mobile screens.",
          null,
          viewportWhy,
          `<meta name="viewport" content="${viewport}">`,
          "Document <head>"
        )
      : issue(
          "viewport-missing",
          "Technical",
          SEVERITY.CRITICAL,
          "No viewport meta tag found.",
          'Add <meta name="viewport" content="width=device-width, initial-scale=1"> inside <head>.',
          viewportWhy,
          "no <meta name=\"viewport\"> found",
          "Document <head>"
        )
  );

  // ---- Canonical tag ----
  const canonical = $('link[rel="canonical"]').attr("href");
  const canonicalWhy =
    "When the same content is reachable at multiple URLs (with/without trailing slash, tracking parameters, http vs https), a canonical tag tells crawlers which single URL should accumulate ranking signals — without it, link equity gets split across duplicates and none of them ranks as well as the merged version would.";

  results.push(
    canonical
      ? issue(
          "canonical-ok",
          "Technical",
          SEVERITY.GOOD,
          "Canonical tag present.",
          null,
          canonicalWhy,
          `<link rel="canonical" href="${canonical}">`,
          "Document <head>"
        )
      : issue(
          "canonical-missing",
          "Technical",
          SEVERITY.WARNING,
          "No canonical tag found.",
          "Add a self-referencing canonical link tag on every indexable page to prevent duplicate-content dilution.",
          canonicalWhy,
          "no <link rel=\"canonical\"> found",
          "Document <head>"
        )
  );

  // ---- robots.txt ----
  const robotsWhy =
    "robots.txt is the first file most crawlers request before indexing anything on the domain. Its absence isn't fatal (crawlers assume everything is allowed), but its presence lets you explicitly control crawl budget — pointing crawlers away from admin/checkout pages and toward the sitemap.";

  results.push(
    crawlData.robotsTxt
      ? issue(
          "robots-ok",
          "Technical",
          SEVERITY.GOOD,
          "robots.txt found.",
          null,
          robotsWhy,
          `${crawlData.origin}/robots.txt (${crawlData.robotsTxt.length} bytes)`,
          "Domain root"
        )
      : issue(
          "robots-missing",
          "Technical",
          SEVERITY.WARNING,
          "robots.txt not found.",
          "Add a robots.txt at the domain root that at minimum references the XML sitemap location.",
          robotsWhy,
          `${crawlData.origin}/robots.txt — 404 or unreachable`,
          "Domain root"
        )
  );

  // ---- sitemap.xml ----
  const sitemapWhy =
    "An XML sitemap is a direct list of URLs handed to crawlers, bypassing the need to discover pages purely through internal links. For sites with deep navigation or pages with few internal links pointing to them, this is often the difference between a page being indexed within days versus never being discovered at all.";

  results.push(
    crawlData.sitemapXml
      ? issue(
          "sitemap-ok",
          "Technical",
          SEVERITY.GOOD,
          "sitemap.xml found.",
          null,
          sitemapWhy,
          `${crawlData.origin}/sitemap.xml (${crawlData.sitemapXml.length} bytes)`,
          "Domain root"
        )
      : issue(
          "sitemap-missing",
          "Technical",
          SEVERITY.WARNING,
          "sitemap.xml not found.",
          "Generate an XML sitemap and submit it in Google Search Console / Bing Webmaster Tools.",
          sitemapWhy,
          `${crawlData.origin}/sitemap.xml — 404 or unreachable`,
          "Domain root"
        )
  );

  // ---- Page load / response time ----
  const loadTime = crawlData.loadTimeMs;
  const loadWhy =
    "Server response time is the foundation of Core Web Vitals (specifically Time to First Byte, which feeds into Largest Contentful Paint). Google has confirmed Core Web Vitals as a ranking factor since 2021, and independent studies consistently show conversion rate drops of roughly 7% for every additional second of load time.";

  if (loadTime > 3000) {
    results.push(
      issue(
        "load-slow",
        "Technical",
        SEVERITY.CRITICAL,
        `Page took ${loadTime}ms to respond.`,
        "Investigate server-side bottlenecks first (database queries, uncached rendering), then add a CDN and enable Gzip/Brotli compression.",
        loadWhy,
        `TTFB-equivalent: ${loadTime}ms (threshold: >3000ms = critical)`,
        "Server response (not a specific page element)"
      )
    );
  } else if (loadTime > 1500) {
    results.push(
      issue(
        "load-moderate",
        "Technical",
        SEVERITY.WARNING,
        `Page took ${loadTime}ms to respond.`,
        "Consider caching, image optimization, and reducing render-blocking resources to get under 1500ms.",
        loadWhy,
        `TTFB-equivalent: ${loadTime}ms (threshold: >1500ms = warning)`,
        "Server response (not a specific page element)"
      )
    );
  } else {
    results.push(
      issue(
        "load-ok",
        "Technical",
        SEVERITY.GOOD,
        `Page responded quickly (${loadTime}ms).`,
        null,
        loadWhy,
        `TTFB-equivalent: ${loadTime}ms`,
        "Server response (not a specific page element)"
      )
    );
  }

  // ---- Structured data (JSON-LD) ----
  const jsonLdBlocks = $('script[type="application/ld+json"]');
  const schemaWhy =
    "Structured data doesn't change core rankings, but it's what unlocks rich results — star ratings, FAQ accordions, breadcrumbs, product prices — directly in the search results page. Rich results occupy more visual space and consistently show higher click-through rates than plain blue-link listings.";

  results.push(
    jsonLdBlocks.length > 0
      ? issue(
          "schema-ok",
          "Technical",
          SEVERITY.GOOD,
          `Found ${jsonLdBlocks.length} structured data (JSON-LD) block(s).`,
          null,
          schemaWhy,
          `${jsonLdBlocks.length} <script type="application/ld+json"> block(s)`,
          "Document <head> or end of <body>"
        )
      : issue(
          "schema-missing",
          "Technical",
          SEVERITY.WARNING,
          "No structured data (schema.org JSON-LD) found.",
          "Add JSON-LD markup (Organization, LocalBusiness, Product, BreadcrumbList, etc.) matching the page's actual content type.",
          schemaWhy,
          "0 <script type=\"application/ld+json\"> blocks found",
          "Document <head> or end of <body>"
        )
  );

  return results;
}

/* ---------------------------------- */
/* 3. CONTENT ANALYSIS (section-by-section) */
/* ---------------------------------- */
function checkContent($) {
  const results = [];

  const bodyText = extractReadableBodyText($);
  const words = tokenizeWords(bodyText);
  const wordCount = words.length;

  const contentLengthWhy =
    "Word count is a weak signal on its own, but it correlates strongly with topical depth — pages that thinly cover a topic rarely out-rank pages that answer the query comprehensively. Google's own Helpful Content guidance specifically calls out content that 'leaves readers feeling they need to search again' as a negative quality signal.";

  if (wordCount < 300) {
    results.push(
      issue(
        "content-thin",
        "Content",
        SEVERITY.WARNING,
        `Page has only ${wordCount} words of visible text.`,
        "Thin content can rank poorly for competitive queries. Aim for at least 300-500 words of copy that genuinely adds information, not filler.",
        contentLengthWhy,
        `Word count: ${wordCount} (threshold: <300 = warning)`,
        "Whole page"
      )
    );
  } else {
    results.push(
      issue(
        "content-length-ok",
        "Content",
        SEVERITY.GOOD,
        `Page has ${wordCount} words of visible text.`,
        null,
        contentLengthWhy,
        `Word count: ${wordCount}`,
        "Whole page"
      )
    );
  }

  // Section-by-section breakdown (split at H2 boundaries) so a weak section can be named directly
  const sections = splitIntoSections($);
  const sectionStats = sections.map((s) => {
    const sWords = s.text.split(/\s+/).filter(Boolean);
    return { title: s.title, wordCount: sWords.length };
  });

  if (sections.length > 1) {
    const weakest = sectionStats.reduce((min, s) => (s.wordCount < min.wordCount ? s : min), sectionStats[0]);
    const sectionWhy =
      "Splitting the page at each H2 mirrors how both readers and Google's passage-based indexing evaluate content — each section is effectively judged on its own for the sub-topic it covers, so one very thin section can undersell an otherwise strong page.";

    if (weakest.wordCount < 40) {
      results.push(
        issue(
          "content-section-thin",
          "Content",
          SEVERITY.WARNING,
          `The "${weakest.title}" section has only ${weakest.wordCount} words — noticeably thinner than the rest of the page.`,
          `Expand the "${weakest.title}" section with more specific detail, examples, or supporting copy, or merge it into a neighboring section if it doesn't warrant its own heading.`,
          sectionWhy,
          sectionStats.map((s) => `"${s.title}": ${s.wordCount}w`).join(" | "),
          `Section heading: "${weakest.title}"`
        )
      );
    } else {
      results.push(
        issue(
          "content-sections-ok",
          "Content",
          SEVERITY.GOOD,
          `All ${sections.length} sections have reasonable depth (weakest: "${weakest.title}" at ${weakest.wordCount} words).`,
          null,
          sectionWhy,
          sectionStats.map((s) => `"${s.title}": ${s.wordCount}w`).join(" | "),
          "Whole page, by section"
        )
      );
    }
  }

  const readabilityStats = calculateReadability(bodyText);
  const readability = readabilityStats ? readabilityStats.score : null;

  const readabilityWhy =
    "This practical readability score blends multiple signals that matter for website visitors: sentence length, word length, long-word density, paragraph length, and Flesch Reading Ease. It avoids treating headings, nav labels, and business jargon as an automatic 0, while still warning when copy is genuinely hard to scan.";

  if (readability !== null) {
    if (readability < 40) {
      results.push(
        issue(
          "readability-hard",
          "Content",
          SEVERITY.WARNING,
          `Readability score is ${readability}/100 (difficult to read).`,
          "Shorten sentences, prefer common words over jargon, and break up long paragraphs.",
          readabilityWhy,
          formatReadabilityEvidence(readabilityStats),
          "Whole page"
        )
      );
    } else {
      results.push(
        issue(
          "readability-ok",
          "Content",
          SEVERITY.GOOD,
          `Readability score is ${readability}/100.`,
          null,
          readabilityWhy,
          formatReadabilityEvidence(readabilityStats),
          "Whole page"
        )
      );
    }
  }

  return { results, wordCount, readability, sectionStats };
}

function extractReadableBodyText($) {
  const body = $("body").clone();
  body.find("script, style, noscript, svg").remove();
  body.find("br, p, div, section, article, header, footer, main, aside, li, h1, h2, h3, h4, h5, h6").append(" ");
  return body.text().replace(/\s+/g, " ").trim();
}

function tokenizeWords(text) {
  return String(text || "").match(/[A-Za-z0-9]+(?:['-][A-Za-z0-9]+)?/g) || [];
}

function calculateReadability(text) {
  const words = tokenizeWords(text);
  if (words.length < 20) return null;

  const sentences = splitSentences(text);
  const paragraphs = splitParagraphs(text);
  const syllableCount = words.reduce((sum, word) => sum + countSyllables(word), 0);
  const fleschRaw = sentences.length
    ? 206.835 - 1.015 * (words.length / sentences.length) - 84.6 * (syllableCount / words.length)
    : 50;
  const flesch = clamp(Math.round(fleschRaw), 0, 100);

  const avgSentenceWords = sentences.length ? words.length / sentences.length : words.length;
  const avgWordLength = words.reduce((sum, word) => sum + word.length, 0) / words.length;
  const longWordRatio = words.filter((word) => word.replace(/[^A-Za-z]/g, "").length >= 12).length / words.length;
  const paragraphWordCounts = paragraphs.map((p) => tokenizeWords(p).length).filter((count) => count > 0);
  const avgParagraphWords = paragraphWordCounts.length
    ? paragraphWordCounts.reduce((sum, count) => sum + count, 0) / paragraphWordCounts.length
    : words.length;

  const sentenceScore = scoreRange(avgSentenceWords, 12, 24);
  const wordScore = scoreRange(avgWordLength, 4.8, 7.2);
  const longWordScore = scoreRange(longWordRatio * 100, 8, 24);
  const paragraphScore = scoreRange(avgParagraphWords, 45, 130);
  const blended =
    flesch * 0.35 +
    sentenceScore * 0.25 +
    wordScore * 0.15 +
    longWordScore * 0.15 +
    paragraphScore * 0.1;

  return {
    score: clamp(Math.round(blended), 0, 100),
    flesch,
    sentenceCount: sentences.length,
    wordCount: words.length,
    avgSentenceWords: Math.round(avgSentenceWords * 10) / 10,
    avgWordLength: Math.round(avgWordLength * 10) / 10,
    longWordPercent: Math.round(longWordRatio * 100),
    avgParagraphWords: Math.round(avgParagraphWords),
  };
}

function splitSentences(text) {
  const parts = String(text || "")
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => tokenizeWords(s).length >= 3);

  if (parts.length > 0) return parts;

  const words = tokenizeWords(text);
  return words.length ? [words.join(" ")] : [];
}

function splitParagraphs(text) {
  return String(text || "")
    .split(/\n{2,}|(?<=[.!?])\s+(?=[A-Z0-9])/)
    .map((p) => p.trim())
    .filter(Boolean);
}

function scoreRange(value, goodAtOrBelow, poorAtOrAbove) {
  if (value <= goodAtOrBelow) return 100;
  if (value >= poorAtOrAbove) return 20;
  const ratio = (value - goodAtOrBelow) / (poorAtOrAbove - goodAtOrBelow);
  return Math.round(100 - ratio * 80);
}

function formatReadabilityEvidence(stats) {
  return (
    `Practical score: ${stats.score}/100 · Flesch: ${stats.flesch}/100 · ` +
    `${stats.sentenceCount} sentences · ${stats.wordCount} words · ` +
    `avg sentence ${stats.avgSentenceWords} words · avg word ${stats.avgWordLength} chars · ` +
    `${stats.longWordPercent}% long words · avg paragraph ${stats.avgParagraphWords} words`
  );
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function countSyllables(word) {
  const cleaned = word.toLowerCase().replace(/[^a-z]/g, "");
  if (!cleaned) return 0;
  const matches = cleaned.match(/[aeiouy]+/g);
  return matches ? Math.max(1, matches.length) : 1;
}

/* ---------------------------------- */
/* 4. LINK EXTRACTION (for broken-link check) */
/* ---------------------------------- */
function extractInternalLinks($, origin) {
  const links = new Set();
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    try {
      const resolved = new URL(href, origin);
      if (resolved.origin === origin) {
        links.add(resolved.href);
      }
    } catch (_) {
      /* ignore malformed hrefs */
    }
  });
  return Array.from(links);
}

module.exports = {
  SEVERITY,
  checkOnPage,
  checkTechnical,
  checkContent,
  extractInternalLinks,
};
