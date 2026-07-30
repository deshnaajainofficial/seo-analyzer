const SEVERITY = { GOOD: "good", WARNING: "warning", CRITICAL: "critical" };

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

function analyzeKeyword($, targetKeyword, searchPerformance = null) {
  const keyword = String(targetKeyword || "").trim();
  if (!keyword) {
    return {
      enabled: false,
      keyword: "",
      results: [],
      metrics: null,
      searchPerformance,
    };
  }

  const normalizedKeyword = normalizeText(keyword);
  const title = $("title").first().text().trim();
  const h1 = $("h1").first().text().trim();
  const firstParagraph = $("p")
    .toArray()
    .map((el) => $(el).text().trim())
    .find(Boolean) || "";
  const bodyText = $("body").text().replace(/\s+/g, " ").trim();
  const words = bodyText ? bodyText.split(/\s+/).filter(Boolean) : [];
  const occurrences = countOccurrences(normalizeText(bodyText), normalizedKeyword);
  const density = words.length > 0 ? Number(((occurrences / words.length) * 100).toFixed(2)) : 0;

  const titleHasKeyword = includesKeyword(title, normalizedKeyword);
  const h1HasKeyword = includesKeyword(h1, normalizedKeyword);
  const firstParagraphHasKeyword = includesKeyword(firstParagraph, normalizedKeyword);

  const results = [];
  const placementWhy =
    "Keyword placement still matters because title tags, H1s, and early body copy are the strongest page-level clues for search intent. This check is not about stuffing terms everywhere; it verifies that the page clearly declares the query it is trying to win.";

  results.push(
    titleHasKeyword
      ? issue("keyword-title-ok", "Keyword", SEVERITY.GOOD, `Target keyword appears in the title tag.`, null, placementWhy, title, "Document <head> -> <title>")
      : issue("keyword-title-missing", "Keyword", SEVERITY.WARNING, `Target keyword is missing from the title tag.`, `Work "${keyword}" naturally into the title, preferably near the front if it matches the page intent.`, placementWhy, title || "No title text found", "Document <head> -> <title>")
  );

  results.push(
    h1HasKeyword
      ? issue("keyword-h1-ok", "Keyword", SEVERITY.GOOD, `Target keyword appears in the primary H1.`, null, placementWhy, h1, "Primary H1")
      : issue("keyword-h1-missing", "Keyword", SEVERITY.WARNING, `Target keyword is missing from the primary H1.`, `Make the H1 clearly align with "${keyword}" while keeping it readable for humans.`, placementWhy, h1 || "No H1 text found", "Primary H1")
  );

  results.push(
    firstParagraphHasKeyword
      ? issue("keyword-intro-ok", "Keyword", SEVERITY.GOOD, `Target keyword appears in the first paragraph.`, null, placementWhy, firstParagraph.slice(0, 180), "First paragraph")
      : issue("keyword-intro-missing", "Keyword", SEVERITY.WARNING, `Target keyword is missing from the first paragraph.`, `Mention "${keyword}" naturally in the opening copy so users and crawlers see the page intent immediately.`, placementWhy, firstParagraph.slice(0, 180) || "No paragraph text found", "First paragraph")
  );

  const densityWhy =
    "Keyword density is a rough guardrail, not a ranking formula. Extremely low density can mean the page never actually discusses the target topic; extremely high density can read as keyword stuffing and damage trust.";
  if (occurrences === 0) {
    results.push(issue("keyword-density-none", "Keyword", SEVERITY.CRITICAL, `Target keyword was not found in visible body text.`, `Add focused, useful copy that genuinely covers "${keyword}".`, densityWhy, `0 occurrences across ${words.length} words`, "Visible body text"));
  } else if (density > 3) {
    results.push(issue("keyword-density-high", "Keyword", SEVERITY.WARNING, `Keyword density is ${density}%, which may read as over-optimized.`, "Reduce repetition and use natural variants, examples, and supporting terms instead of repeating the exact phrase.", densityWhy, `${occurrences} occurrences across ${words.length} words`, "Visible body text"));
  } else if (density < 0.3 && words.length >= 300) {
    results.push(issue("keyword-density-low", "Keyword", SEVERITY.WARNING, `Keyword density is only ${density}%.`, `Add more specific coverage of "${keyword}" if this page is meant to rank for that query.`, densityWhy, `${occurrences} occurrences across ${words.length} words`, "Visible body text"));
  } else {
    results.push(issue("keyword-density-ok", "Keyword", SEVERITY.GOOD, `Keyword density looks natural at ${density}%.`, null, densityWhy, `${occurrences} occurrences across ${words.length} words`, "Visible body text"));
  }

  if (searchPerformance && searchPerformance.available) {
    const row = searchPerformance.summary;
    const perfWhy =
      "Search Console data turns this from a best-practice audit into a performance audit: impressions show demand, clicks show traffic captured, CTR shows snippet appeal, and average position shows ranking opportunity.";
    const severity = row.impressions > 100 && row.position > 10 ? SEVERITY.WARNING : SEVERITY.GOOD;
    results.push(
      issue(
        severity === SEVERITY.GOOD ? "gsc-performance-ok" : "gsc-performance-opportunity",
        "Keyword",
        severity,
        `Search Console shows ${row.impressions} impressions, ${row.clicks} clicks, ${(row.ctr * 100).toFixed(1)}% CTR, and average position ${row.position.toFixed(1)} for matching queries.`,
        severity === SEVERITY.WARNING
          ? "This keyword has demand but weak rankings; improve page depth, title/snippet appeal, and internal links to move it closer to page one."
          : null,
        perfWhy,
        `${searchPerformance.rows.length} Search Console row(s) matched`,
        "Google Search Console"
      )
    );
  } else if (searchPerformance && searchPerformance.error) {
    results.push(
      issue(
        "gsc-unavailable",
        "Keyword",
        SEVERITY.WARNING,
        "Search Console performance data could not be fetched.",
        "Reconnect the Search Console property or provide a fresh OAuth access token with webmasters.readonly scope.",
        "Connected Search Console data is optional, but it is the difference between estimated optimization advice and real search-performance evidence.",
        searchPerformance.error,
        "Google Search Console"
      )
    );
  }

  return {
    enabled: true,
    keyword,
    results,
    metrics: {
      titleHasKeyword,
      h1HasKeyword,
      firstParagraphHasKeyword,
      occurrences,
      density,
      wordCount: words.length,
    },
    searchPerformance,
  };
}

function includesKeyword(text, normalizedKeyword) {
  return normalizeText(text).includes(normalizedKeyword);
}

function normalizeText(text) {
  return String(text || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function countOccurrences(text, keyword) {
  if (!text || !keyword) return 0;
  let count = 0;
  let index = 0;
  while ((index = text.indexOf(keyword, index)) !== -1) {
    count++;
    index += keyword.length;
  }
  return count;
}

module.exports = { analyzeKeyword };
