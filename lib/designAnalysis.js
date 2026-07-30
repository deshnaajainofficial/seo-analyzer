const { contrastRatio, hexToRgb, rgbToHsl } = require("./colorTheory");

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

const NEUTRALS = new Set([
  "#ffffff", "#fff", "#000000", "#000", "#ffffff00", "#00000000",
  "#f5f5f5", "#fafafa", "#eeeeee", "#e0e0e0", "#cccccc", "#dddddd",
]);

const NAMED_COLOR_HEX = {
  white: "#ffffff", black: "#000000", red: "#ff0000", blue: "#0000ff",
  green: "#008000", gray: "#808080", grey: "#808080",
};

/** Extracts hex colors from inline <style> blocks, style="" attributes, and external stylesheets. */
function extractColorSignals($, externalCss = []) {
  const raw = [];
  const hexPattern = /#[0-9a-fA-F]{3,6}\b/g;
  const roles = {};

  const addRole = (hex, role) => {
    const normalized = normalizeHex(hex);
    if (!normalized) return;
    roles[normalized] = roles[normalized] || {};
    roles[normalized][role] = (roles[normalized][role] || 0) + 1;
  };

  const scanDeclarations = (text) => {
    const declarationPattern = /([a-z-]*color|background(?:-color)?|border(?:-[a-z]+)?-color|fill|stroke)\s*:\s*(#[0-9a-fA-F]{3,6})\b/gi;
    let match;
    while ((match = declarationPattern.exec(text)) !== null) {
      const property = match[1].toLowerCase();
      const role = property.includes("background")
        ? "background"
        : property === "color"
        ? "text"
        : property.includes("border")
        ? "border"
        : "accent";
      addRole(match[2], role);
    }
  };

  $("style").each((_, el) => {
    const text = $(el).html() || "";
    const found = text.match(hexPattern);
    if (found) raw.push(...found);
    scanDeclarations(text);
  });

  $("[style]").each((_, el) => {
    const styleAttr = $(el).attr("style") || "";
    const found = styleAttr.match(hexPattern);
    if (found) raw.push(...found);
    scanDeclarations(styleAttr);
  });

  externalCss.forEach(({ css }) => {
    const found = css.match(hexPattern);
    if (found) raw.push(...found);
    scanDeclarations(css);
  });

  const normalized = raw.map(normalizeHex).filter(Boolean);
  const freq = {};
  normalized.forEach((h) => {
    freq[h] = (freq[h] || 0) + 1;
  });

  return { colors: freq, colorRoles: roles };
}

/** Extracts distinct font-family declarations from <style> blocks, inline styles, and external stylesheets. */
function extractFonts($, externalCss = []) {
  const families = new Set();
  const fontPattern = /font-family\s*:\s*([^;}]+)/gi;

  const scanText = (text) => {
    let match;
    while ((match = fontPattern.exec(text)) !== null) {
      const first = match[1].split(",")[0].trim().replace(/["']/g, "");
      if (first) families.add(first);
    }
  };

  $("style").each((_, el) => scanText($(el).html() || ""));
  $("[style]").each((_, el) => scanText($(el).attr("style") || ""));
  externalCss.forEach(({ css }) => scanText(css));

  return Array.from(families);
}

/** Looks for a clear call-to-action (button/link with action-oriented text) near the top of the page. */
function findPrimaryCTA($) {
  const actionWords = /\b(get started|sign up|book|buy now|shop now|contact us|get in touch|request|schedule|start free|try free|learn more|subscribe|download|order now|apply now|join|get a quote|free quote|get quote|call now|call us|reserve|claim|redeem|add to cart|checkout)\b/i;
  const candidates = $("a,button").toArray();
  const total = candidates.length || 1;

  for (let i = 0; i < candidates.length; i++) {
    const text = $(candidates[i]).text().trim().replace(/\s+/g, " ");
    if (actionWords.test(text)) {
      return { found: true, text: text.slice(0, 60), positionPercentile: Math.round((i / total) * 100) };
    }
  }
  return { found: false };
}

/** Flags unusually long, unbroken paragraphs — a common cause of low engagement. */
function analyzeParagraphDensity($) {
  const paragraphs = $("p")
    .toArray()
    .map((el) => $(el).text().trim())
    .filter((t) => t.length > 0);

  if (paragraphs.length === 0) return { paragraphCount: 0, longParagraphs: [] };

  const longParagraphs = paragraphs
    .map((text, i) => ({ index: i + 1, wordCount: text.split(/\s+/).length, snippet: text.slice(0, 70) }))
    .filter((p) => p.wordCount > 120);

  return { paragraphCount: paragraphs.length, longParagraphs };
}

function analyzeDesign($, externalCss = [], browserAudit = null) {
  const results = [];
  const computedStyles = browserAudit && browserAudit.available ? browserAudit.computedStyles : null;

  /* ---- Color palette ---- */
  const hasComputedColors = computedStyles && Object.keys(computedStyles.colors || {}).length > 0;
  const staticColorSignals = hasComputedColors ? null : extractColorSignals($, externalCss);
  const colorFreq = hasComputedColors
    ? computedStyles.colors
    : staticColorSignals.colors;
  const colorRoles = hasComputedColors && computedStyles.colorRoles
    ? computedStyles.colorRoles
    : staticColorSignals.colorRoles;
  const distinctColors = Object.keys(colorFreq);
  const topColors = getTopColors(colorFreq, 4);
  const brandColorSelection = selectPrimaryBrandColor(colorFreq, colorRoles);
  const sortedBrand = brandColorSelection.candidates.map((item) => item.hex);
  const primaryColor = brandColorSelection.primaryColor;

  const sourceNote =
    hasComputedColors
      ? " (from rendered computed styles in headless Chrome)"
      : externalCss.length > 0
      ? ` (scanned inline styles plus ${externalCss.length} linked stylesheet${externalCss.length === 1 ? "" : "s"})`
      : " (scanned inline styles only — no linked stylesheets were found or reachable)";

  const colorWhy =
    "Consistent color usage builds brand recognition — studies on brand consistency (e.g. the widely-cited '80% faster recognition' color research) show a tight, deliberate palette reads as more professional and trustworthy than an inconsistent one. A high color count usually means styles were added ad hoc over time rather than to a shared design system.";

  if (distinctColors.length > 10) {
    results.push(
      issue(
        "design-color-count-high",
        "Design",
        SEVERITY.WARNING,
        `Detected ${distinctColors.length} distinct colors in use across the page's styles${sourceNote}.`,
        `Consolidate around the 3-4 colors used most often on the site: ${topColors.map((item) => item.hex).join(", ") || "n/a"}.`,
        colorWhy,
        `Top colors by usage: ${formatTopColors(topColors)}. Colors found: ${distinctColors.slice(0, 12).join(", ")}${distinctColors.length > 12 ? "…" : ""}`
      )
    );
  } else if (distinctColors.length > 0) {
    results.push(
      issue(
        "design-color-count-ok",
        "Design",
        SEVERITY.GOOD,
        `Color usage is reasonably tight (${distinctColors.length} distinct colors detected${sourceNote}).`,
        null,
        colorWhy,
        `Top colors by usage: ${formatTopColors(topColors)}. Colors found: ${distinctColors.join(", ")}`
      )
    );
  } else {
    results.push(
      issue(
        "design-color-none-found",
        "Design",
        SEVERITY.WARNING,
        `No colors could be extracted from the page's styles${sourceNote}.`,
        hasComputedColors
          ? "A manual color review is recommended; the rendered browser pass did not find reusable computed color values."
          : "This usually means colors are set via a CSS framework's class names (e.g. Tailwind utility classes) rather than raw hex/rgb values — a manual color review is recommended since this engine can't infer colors from class names alone.",
        colorWhy,
        "0 hex/rgb color values found in inline styles or linked stylesheets"
      )
    );
  }

  if (computedStyles && computedStyles.textContrastSamples && computedStyles.textContrastSamples.length > 0) {
    const low = computedStyles.lowContrastSamples || [];
    const contrastWhy =
      "WCAG 2.1 AA requires a contrast ratio of at least 4.5:1 for normal text against its background. The browser audit checks actual rendered text colors against the effective rendered background, so this catches CSS-framework and JavaScript-rendered styles that static HTML cannot infer.";

    if (low.length > 0) {
      results.push(
        issue(
          "design-contrast-low-rendered",
          "Design",
          SEVERITY.CRITICAL,
          `${low.length} sampled rendered text element${low.length === 1 ? "" : "s"} fail WCAG AA contrast.`,
          "Increase the color separation between text and its actual background until all normal text reaches at least 4.5:1 contrast.",
          contrastWhy,
          low
            .slice(0, 5)
            .map((s) => `${s.ratio}:1 ${s.foregroundHex} on ${s.backgroundHex} — ${s.tag} "${s.text.slice(0, 45)}"`)
            .join(" | "),
          "Rendered viewport text"
        )
      );
    } else {
      const weakest = [...computedStyles.textContrastSamples].sort((a, b) => a.ratio - b.ratio)[0];
      results.push(
        issue(
          "design-contrast-ok-rendered",
          "Design",
          SEVERITY.GOOD,
          `Rendered text contrast passes sampled WCAG AA checks (weakest sampled pair: ${weakest.ratio}:1).`,
          null,
          contrastWhy,
          `${computedStyles.textContrastSamples.length} rendered text/background pairs sampled in Chrome`,
          "Rendered viewport text"
        )
      );
    }
  } else if (sortedBrand.length >= 1 && primaryColor) {
    // Static fallback: contrast between the two most frequent colors, as a rough proxy for text/background pairing.
    const bg = distinctColors.includes("#ffffff") ? "#ffffff" : distinctColors.find((c) => NEUTRALS.has(c)) || "#ffffff";
    const ratio = contrastRatio(primaryColor, bg);
    const contrastWhy =
      "WCAG 2.1 AA requires a contrast ratio of at least 4.5:1 for normal text against its background. Below that threshold, text becomes hard to read for users with low vision and fails automated accessibility audits that many enterprise clients now require vendors to pass.";

    if (ratio !== null) {
      if (ratio < 4.5) {
        results.push(
          issue(
            "design-contrast-low",
            "Design",
            SEVERITY.CRITICAL,
            `Estimated contrast between primary color ${primaryColor} and background ${bg} is ${ratio}:1 — below the WCAG AA minimum of 4.5:1.`,
            `Darken/lighten ${primaryColor} or choose a background with more separation until the ratio clears 4.5:1. Use the suggested neutral tones below as a safer background pairing.`,
            contrastWhy,
            `Contrast ratio ${primaryColor} vs ${bg}: ${ratio}:1 (estimated from detected inline/style colors, not full rendered CSS)`
          )
        );
      } else {
        results.push(
          issue(
            "design-contrast-ok",
            "Design",
            SEVERITY.GOOD,
            `Estimated contrast between primary color ${primaryColor} and background ${bg} is ${ratio}:1 — passes WCAG AA.`,
            null,
            contrastWhy,
            `Contrast ratio ${primaryColor} vs ${bg}: ${ratio}:1`
          )
        );
      }
    }
  }

  /* ---- Typography ---- */
  const fonts = computedStyles && computedStyles.fonts && computedStyles.fonts.length
    ? computedStyles.fonts
    : extractFonts($, externalCss);
  const fontWhy =
    "Typography is one of the fastest signals visitors use to judge whether a site is professionally built. More than 2-3 font families on one page almost always reads as inconsistent, and mixing many typefaces increases page weight and slows text rendering slightly on first paint.";

  if (fonts.length > 3) {
    results.push(
      issue(
        "design-fonts-too-many",
        "Design",
        SEVERITY.WARNING,
        `Detected ${fonts.length} distinct font families in use: ${fonts.join(", ")}.`,
        "Standardize on one display font for headings and one body font — three total, maximum, including any monospace/code font.",
        fontWhy,
        `Fonts: ${fonts.join(", ")}`
      )
    );
  } else if (fonts.length > 0) {
    results.push(
      issue(
        "design-fonts-ok",
        "Design",
        SEVERITY.GOOD,
        `Typography is consistent (${fonts.length} font famil${fonts.length === 1 ? "y" : "ies"} detected).`,
        null,
        fontWhy,
        `Fonts: ${fonts.join(", ")}`
      )
    );
  }

  /* ---- Call to action ---- */
  const cta = findPrimaryCTA($);
  const ctaWhy =
    "Landing pages without a clear, action-oriented CTA above the fold see measurably lower conversion — visitors decide whether to act within seconds, and if the next step isn't obvious immediately, most simply leave. This is one of the most consistent findings across conversion-rate-optimization research.";

  if (!cta.found) {
    results.push(
      issue(
        "design-cta-missing",
        "Design",
        SEVERITY.CRITICAL,
        "No clear call-to-action (e.g. 'Get Started', 'Book a Call', 'Contact Us') was detected in any button or link.",
        "Add a single, high-contrast primary CTA button near the top of the page with action-oriented wording — avoid generic labels like 'Submit' or 'Click Here'.",
        ctaWhy,
        "Scanned all <a> and <button> text for action-oriented phrasing — no match found"
      )
    );
  } else if (cta.positionPercentile > 40) {
    results.push(
      issue(
        "design-cta-low",
        "Design",
        SEVERITY.WARNING,
        `The clearest call-to-action ("${cta.text}") appears fairly late in the page (~${cta.positionPercentile}% of the way through the DOM).`,
        "Duplicate the primary CTA near the top of the page, ideally within the first screen's worth of content, in addition to keeping one at the bottom.",
        ctaWhy,
        `CTA text "${cta.text}" found at ~${cta.positionPercentile}% through the page's link/button elements`
      )
    );
  } else {
    results.push(
      issue(
        "design-cta-ok",
        "Design",
        SEVERITY.GOOD,
        `A clear call-to-action ("${cta.text}") appears early on the page.`,
        null,
        ctaWhy,
        `CTA text "${cta.text}" found near the top (~${cta.positionPercentile}% through the page's link/button elements)`
      )
    );
  }

  /* ---- Paragraph density / scannability ---- */
  const density = analyzeParagraphDensity($);
  const densityWhy =
    "Average time-on-page studies (e.g. Nielsen Norman Group's eye-tracking research) show visitors scan web copy in an F-shaped pattern rather than reading linearly — long, unbroken paragraphs get skipped almost entirely. Breaking the same content into shorter paragraphs with subheadings measurably increases how much of it actually gets read.";

  if (density.longParagraphs.length > 0) {
    const locationList = density.longParagraphs
      .slice(0, 5)
      .map((p) => `paragraph ${p.index} (${p.wordCount} words): "${p.snippet}…"`)
      .join(" | ");

    results.push(
      issue(
        "design-paragraphs-dense",
        "Design",
        SEVERITY.WARNING,
        `${density.longParagraphs.length} of ${density.paragraphCount} paragraphs are over 120 words long, which reads as a "wall of text".`,
        "Break long paragraphs into 2-4 sentence chunks, add subheadings every 2-3 paragraphs, and consider bullet points for lists of features/benefits.",
        densityWhy,
        locationList
      )
    );
  } else if (density.paragraphCount > 0) {
    results.push(
      issue(
        "design-paragraphs-ok",
        "Design",
        SEVERITY.GOOD,
        `Paragraph lengths are reader-friendly (longest paragraphs stay under 120 words across ${density.paragraphCount} paragraphs).`,
        null,
        densityWhy,
        `${density.paragraphCount} paragraphs checked, none exceed 120 words`
      )
    );
  }

  return {
    results,
    palette: topColors.map((item) => item.hex),
    topColors,
    primaryColor,
    colorSelection: brandColorSelection,
    fonts,
    distinctColorCount: distinctColors.length,
    stylesheetsScanned: externalCss.length,
    source: computedStyles ? "browser" : "static",
  };
}

function selectPrimaryBrandColor(colorFreq, colorRoles = {}) {
  const candidates = Object.entries(colorFreq || {})
    .map(([hex, count]) => {
      const normalized = normalizeHex(hex);
      if (!normalized) return null;
      const hsl = getHsl(normalized);
      if (!hsl || isNeutralColor(normalized, hsl)) return null;

      const roles = colorRoles[normalized] || {};
      const roleScore =
        (roles.buttonBackground || 0) * 7 +
        (roles.linkText || 0) * 5 +
        (roles.background || 0) * 2.2 +
        (roles.accent || 0) * 2 +
        (roles.border || 0) * 0.5 +
        (roles.text || 0) * 0.25;
      const saturationScore = hsl.s / 18;
      const lightnessScore = Math.max(0, 3 - Math.abs(hsl.l - 48) / 16);
      const frequencyScore = Math.log((count || 0) + 1);
      const textPenalty = roles.text && !roles.linkText && !roles.buttonBackground ? Math.min(2.5, roles.text * 0.04) : 0;

      return {
        hex: normalized,
        count,
        roles,
        score: Math.round((roleScore + saturationScore + lightnessScore + frequencyScore - textPenalty) * 100) / 100,
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score || b.count - a.count);

  const top = candidates[0] || null;
  return {
    primaryColor: top ? top.hex : null,
    candidates: candidates.slice(0, 8),
    evidence: top
      ? `Primary color selected as ${top.hex} from role-weighted usage (${formatRoles(top.roles)}, frequency ${top.count}, confidence score ${top.score})`
      : "No strong non-neutral brand color could be selected",
  };
}

function getTopColors(colorFreq, limit) {
  return Object.entries(colorFreq || {})
    .map(([hex, count]) => ({ hex: normalizeHex(hex), count }))
    .filter((item) => item.hex)
    .sort((a, b) => b.count - a.count || a.hex.localeCompare(b.hex))
    .slice(0, limit);
}

function formatTopColors(topColors) {
  if (!topColors.length) return "none";
  return topColors.map((item) => `${item.hex} (${item.count})`).join(", ");
}

function normalizeHex(hex) {
  const clean = String(hex || "").trim().toLowerCase();
  if (!/^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(clean)) return null;
  if (clean.length === 4) {
    return `#${clean[1]}${clean[1]}${clean[2]}${clean[2]}${clean[3]}${clean[3]}`;
  }
  return clean;
}

function getHsl(hex) {
  const rgb = hexToRgb(hex);
  return rgb ? rgbToHsl(rgb) : null;
}

function isNeutralColor(hex, hsl = getHsl(hex)) {
  if (!hsl) return true;
  if (NEUTRALS.has(hex)) return true;
  if (hsl.s < 12) return true;
  if (hsl.l > 94 || hsl.l < 8) return true;
  return false;
}

function formatRoles(roles = {}) {
  const entries = Object.entries(roles).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) return "general style usage";
  return entries.slice(0, 3).map(([role, count]) => `${role} ${count}`).join(", ");
}

module.exports = { analyzeDesign };
