const cheerio = require("cheerio");

/**
 * Given a cheerio element, walks backward through the DOM to find the nearest
 * preceding heading (H1-H4) so a finding can be described as "under the
 * 'Pricing' section" instead of just "somewhere on the page".
 */
function nearestHeading($, el) {
  // Walk up to body-level, scanning all elements before this one in document order.
  const all = $("h1,h2,h3,h4").toArray();
  const elIndex = $("*").toArray().indexOf(el);
  let best = null;

  for (const h of all) {
    const hIndex = $("*").toArray().indexOf(h);
    if (hIndex !== -1 && hIndex < elIndex) {
      best = h;
    } else if (hIndex >= elIndex) {
      break;
    }
  }
  return best ? $(best).text().trim().replace(/\s+/g, " ").slice(0, 60) : null;
}

/**
 * Builds a short, human-readable location string for an element, e.g.:
 * "Under heading 'Our Services' · image 3 of 11 · near: 'Our team of experts...'"
 */
function describeLocation($, el, opts = {}) {
  const heading = nearestHeading($, el);
  const parts = [];

  if (heading) {
    parts.push(`under "${heading}"`);
  } else {
    parts.push("near the top of the page (before any heading)");
  }

  if (opts.indexLabel) {
    parts.push(opts.indexLabel);
  }

  if (opts.snippet) {
    parts.push(`nearby text: "${opts.snippet}"`);
  }

  return parts.join(" · ");
}

/**
 * Returns a short trimmed text snippet from an element or its siblings,
 * used to help a human locate the exact spot in the rendered page.
 */
function nearbySnippet($, el, maxLen = 70) {
  let text = $(el).parent().text().trim().replace(/\s+/g, " ");
  if (!text) {
    text = $(el).next().text().trim().replace(/\s+/g, " ");
  }
  if (!text) return null;
  return text.length > maxLen ? text.slice(0, maxLen) + "…" : text;
}

/**
 * Splits the page into logical "sections" based on H2 boundaries (falls back
 * to H1 if no H2s exist). Used for section-by-section content/readability
 * breakdowns so a report can say exactly which part of the page is thin.
 */
function splitIntoSections($) {
  const boundaryTag = $("h2").length > 0 ? "h2" : "h1";
  const boundaries = $(boundaryTag).toArray();

  if (boundaries.length === 0) {
    const bodyText = $("body").text().replace(/\s+/g, " ").trim();
    return [{ title: "Full page (no section headings found)", text: bodyText }];
  }

  const sections = [];
  const allNodes = $("body").find("*").toArray();

  boundaries.forEach((h, i) => {
    const title = $(h).text().trim().replace(/\s+/g, " ").slice(0, 60) || `Section ${i + 1}`;
    const startIdx = allNodes.indexOf(h);
    const endIdx = i + 1 < boundaries.length ? allNodes.indexOf(boundaries[i + 1]) : allNodes.length;

    let text = "";
    for (let n = startIdx; n < endIdx; n++) {
      const node = allNodes[n];
      if (node.tagName && /^h[1-6]$/i.test(node.tagName)) continue; // skip heading text itself
      const own = $(node)
        .contents()
        .filter((_, c) => c.type === "text")
        .text();
      text += " " + own;
    }
    sections.push({ title, text: text.replace(/\s+/g, " ").trim() });
  });

  return sections;
}

module.exports = { describeLocation, nearbySnippet, nearestHeading, splitIntoSections };
