const PDFDocument = require("pdfkit");

const SEVERITY_COLOR = {
  good: "#2fbf9f",
  warning: "#e8a33d",
  critical: "#e15554",
};
const INK = "#131b2e";
const DIM = "#6b7280";
const LINE = "#e3e0d8";

/**
 * Streams a formatted PDF audit report directly to the given writable stream (e.g. an HTTP response).
 */
function generatePdfReport(report, outputStream) {
  const doc = new PDFDocument({ size: "A4", margin: 50, bufferPages: true });
  doc.pipe(outputStream);

  drawHeader(doc, report);
  drawScoreSummary(doc, report);
  drawSiteAudit(doc, report);
  drawActionPlan(doc, report);
  drawScoreLedger(doc, report);
  drawMetrics(doc, report);
  drawIntelligenceAndSecurity(doc, report);
  drawLocalTrust(doc, report);
  drawAiInsights(doc, report);
  drawScreenshot(doc, report);
  drawCategoryBreakdown(doc, report);
  drawPalette(doc, report);
  drawFindings(doc, report);
  drawMethodology(doc);
  drawFooter(doc);

  doc.end();
}

function drawHeader(doc, report) {
  doc
    .fillColor(INK)
    .font("Helvetica-Bold")
    .fontSize(20)
    .text("Auditline — Site Audit Report", { continued: false });

  doc.moveDown(0.3);
  doc
    .font("Helvetica")
    .fontSize(10)
    .fillColor(DIM)
    .text(`Target: ${report.finalUrl}`)
    .text(`Scanned: ${new Date(report.scannedAt).toLocaleString()}`);

  doc.moveDown(1);
  drawRule(doc);
  doc.moveDown(0.8);
}

function drawScoreSummary(doc, report) {
  const color =
    report.score >= 75 ? SEVERITY_COLOR.good : report.score >= 40 ? SEVERITY_COLOR.warning : SEVERITY_COLOR.critical;

  const startY = doc.y;

  // Score circle
  const cx = doc.x + 35;
  const cy = startY + 35;
  doc.circle(cx, cy, 35).lineWidth(6).strokeColor(LINE).stroke();
  doc
    .save()
    .circle(cx, cy, 35)
    .clip();
  doc.restore();

  doc
    .fillColor(color)
    .font("Helvetica-Bold")
    .fontSize(22)
    .text(String(report.score), cx - 35, cy - 12, { width: 70, align: "center" });
  doc
    .fillColor(DIM)
    .font("Helvetica")
    .fontSize(9)
    .text(`Grade ${report.grade}`, cx - 35, cy + 12, { width: 70, align: "center" });

  doc
    .fillColor(INK)
    .font("Helvetica-Bold")
    .fontSize(13)
    .text("Overall Score", cx + 60, startY + 8);
  doc
    .fillColor(DIM)
    .font("Helvetica")
    .fontSize(10)
    .text(
      "Weighted across on-page SEO, technical SEO, content quality, and link health.",
      cx + 60,
      startY + 28,
      { width: 380 }
    );

  doc.y = startY + 90;
  drawRule(doc);
  doc.moveDown(0.8);
}

function drawMetrics(doc, report) {
  sectionTitle(doc, "Key Metrics");

  const m = report.metrics;
  const vitals = m.webVitals || {};
  const rows = [
    ["Title tag", m.title || "—"],
    ["Meta description", m.metaDescription || "—"],
    ["Word count", String(m.wordCount)],
    ["Readability score", m.readability !== null ? `${m.readability}/100` : "n/a"],
    [m.browserRendered ? "Browser render time" : "Page load time", `${m.loadTimeMs} ms`],
    ["Largest Contentful Paint", vitals.lcp !== null && vitals.lcp !== undefined ? `${vitals.lcp} ms` : "n/a"],
    ["Cumulative Layout Shift", vitals.cls !== null && vitals.cls !== undefined ? String(vitals.cls) : "n/a"],
    ["Interaction to Next Paint", vitals.inp !== null && vitals.inp !== undefined ? `${vitals.inp} ms` : "n/a"],
    ["Internal links sampled", String(m.internalLinksSampled)],
    ["Broken links found", String(m.brokenLinks)],
  ];

  doc.font("Helvetica").fontSize(10);
  rows.forEach(([label, value]) => {
    const y = doc.y;
    doc.fillColor(DIM).text(label, 50, y, { width: 150, continued: false });
    doc.fillColor(INK).text(value, 210, y, { width: 335 });
    doc.moveDown(0.4);
  });

  doc.moveDown(0.5);
  drawRule(doc);
  doc.moveDown(0.8);
}

function drawSiteAudit(doc, report) {
  if (!report.siteAudit || !report.siteAudit.enabled) return;

  checkPageBreak(doc, 160);
  sectionTitle(doc, "Site Health");
  const s = report.siteAudit;
  doc
    .fillColor(DIM)
    .font("Helvetica")
    .fontSize(9.5)
    .text(
      `Overall site score ${s.overallScore}/100 (Grade ${s.overallGrade}) blends 75% average page score (${s.averagePageScore}) with 25% sitewide architecture score (${s.sitewideScore}). Crawled ${s.pagesCrawled} of up to ${s.maxPages} pages at depth ${s.maxDepth}.`,
      { width: 495 }
    );
  doc.moveDown(0.8);

  doc.fillColor(INK).font("Helvetica-Bold").fontSize(10).text("Pages Crawled");
  doc.moveDown(0.3);
  s.pages.slice(0, 10).forEach((page) => {
    checkPageBreak(doc, 28);
    const y = doc.y;
    doc.fillColor(INK).font("Helvetica-Bold").fontSize(8.5).text(`${page.score} · ${page.grade}`, 50, y, { width: 55 });
    doc.fillColor(DIM).font("Helvetica").fontSize(8.5).text(page.url, 112, y, { width: 320 });
    doc.fillColor(DIM).font("Helvetica").fontSize(8.5).text(`${page.severity.critical} critical · ${page.severity.warning} warning`, 438, y, { width: 107 });
    doc.moveDown(0.7);
  });

  doc.moveDown(0.4);
  doc.fillColor(INK).font("Helvetica-Bold").fontSize(10).text("Sitewide Findings");
  doc.moveDown(0.3);
  s.issues.forEach((item) => {
    checkPageBreak(doc, 35);
    doc.fillColor(SEVERITY_COLOR[item.severity]).font("Helvetica-Bold").fontSize(8.5).text(item.severity.toUpperCase(), 50, doc.y, { width: 60, continued: false });
    doc.fillColor(INK).font("Helvetica").fontSize(9).text(item.message, 112, doc.y - 10, { width: 433 });
    if (item.evidence) {
      doc.fillColor(DIM).font("Courier").fontSize(7.5).text(item.evidence, 112, doc.y + 2, { width: 433 });
    }
    doc.moveDown(0.5);
  });

  doc.moveDown(0.5);
  drawRule(doc);
  doc.moveDown(0.8);
}

function drawIntelligenceAndSecurity(doc, report) {
  if (!report.keyword?.enabled && !report.security) return;

  checkPageBreak(doc, 130);
  sectionTitle(doc, "Keyword Intelligence & Security");

  if (report.keyword?.enabled) {
    const k = report.keyword;
    const m = k.metrics || {};
    doc.fillColor(INK).font("Helvetica-Bold").fontSize(10).text(`Target keyword: ${k.target}`);
    doc
      .fillColor(DIM)
      .font("Helvetica")
      .fontSize(9)
      .text(
        `Title: ${m.titleHasKeyword ? "present" : "missing"} · H1: ${m.h1HasKeyword ? "present" : "missing"} · First paragraph: ${m.firstParagraphHasKeyword ? "present" : "missing"} · Density: ${m.density}% (${m.occurrences} occurrence${m.occurrences === 1 ? "" : "s"})`,
        { width: 495 }
      );

    if (k.searchPerformance?.available) {
      const s = k.searchPerformance.summary;
      doc
        .fillColor(DIM)
        .font("Helvetica")
        .fontSize(9)
        .text(
          `Search Console: ${s.clicks} clicks · ${s.impressions} impressions · ${(s.ctr * 100).toFixed(1)}% CTR · average position ${s.position.toFixed(1)}.`,
          { width: 495 }
        );
    }
    doc.moveDown(0.7);
  }

  if (report.security) {
    const security = report.security;
    doc.fillColor(INK).font("Helvetica-Bold").fontSize(10).text("Security basics");
    doc
      .fillColor(DIM)
      .font("Helvetica")
      .fontSize(9)
      .text(
        `${security.missingHeaders.length} missing security header(s) · ${security.libraries.length} JS librar${security.libraries.length === 1 ? "y" : "ies"} detected · ${security.vulnerabilities.length} known vulnerabilit${security.vulnerabilities.length === 1 ? "y" : "ies"} found · ${security.exposedFilesChecked.length} sensitive file endpoint(s) checked.`,
        { width: 495 }
      );
    if (security.vulnerabilities.length > 0) {
      doc
        .fillColor("#e15554")
        .font("Helvetica")
        .fontSize(8.5)
        .text(
          security.vulnerabilities
            .slice(0, 5)
            .map((v) => `${v.library.name}@${v.library.version}: ${v.id}`)
            .join(" | "),
          { width: 495 }
        );
    }
  }

  doc.moveDown(0.8);
  drawRule(doc);
  doc.moveDown(0.8);
}

function drawLocalTrust(doc, report) {
  if (!report.localTrust) return;

  checkPageBreak(doc, 115);
  sectionTitle(doc, "Local Trust & NAP");
  doc
    .fillColor(DIM)
    .font("Helvetica")
    .fontSize(9)
    .text(report.localTrust.explanation || "Checks local business contact consistency and conversion trust signals.", { width: 495 });
  doc.moveDown(0.6);

  const schema = report.localTrust.localBusinessSchema || {};
  const signals = report.localTrust.trustSignals || {};
  const rows = [
    ["Phone", report.localTrust.phones?.length ? "Present" : "Missing"],
    ["Address", report.localTrust.addresses?.[0] || "Missing"],
    ["LocalBusiness schema", schema.found ? `${schema.presentFields?.length || 0} field(s) present` : "Missing"],
    ["Testimonials/reviews", signals.testimonials?.found ? "Present" : "Missing"],
    ["Contact visibility", signals.contactVisible ? "Visible" : "Weak"],
    ["SSL badge", signals.sslBadge ? "Detected" : "Not detected"],
    ["Privacy policy", signals.privacyPolicy ? "Present" : "Missing"],
  ];

  rows.forEach(([label, value]) => {
    const y = doc.y;
    doc.fillColor(DIM).font("Helvetica-Bold").fontSize(8.5).text(label, 50, y, { width: 150 });
    doc.fillColor(INK).font("Helvetica").fontSize(8.5).text(String(value), 210, y, { width: 335 });
    doc.moveDown(0.35);
  });

  doc.moveDown(0.5);
  drawRule(doc);
  doc.moveDown(0.8);
}

function drawActionPlan(doc, report) {
  if (!report.actionPlan) return;

  const plan = report.actionPlan;
  checkPageBreak(doc, 150);
  sectionTitle(doc, "Fix Impact Simulator & Action Plan");

  const topScenario = plan.scoreSimulator?.scenarios?.find((item) => item.count === 5) || plan.scoreSimulator?.scenarios?.[0];
  if (topScenario) {
    doc
      .fillColor(INK)
      .font("Helvetica-Bold")
      .fontSize(10)
      .text(`Fix top ${topScenario.count}: ${topScenario.fromScore} -> ${topScenario.toScore} (+${topScenario.lift} points)`);
    doc
      .fillColor(DIM)
      .font("Helvetica")
      .fontSize(9)
      .text(plan.scoreSimulator.explanation, { width: 495 });
    doc.moveDown(0.5);
  }

  drawPlanList(doc, "Quick Wins", plan.quickWins);
  drawPlanList(doc, "Bigger Projects", plan.biggerProjects);

  drawRule(doc);
  doc.moveDown(0.8);
}

function drawPlanList(doc, title, items) {
  if (!Array.isArray(items) || items.length === 0) return;

  checkPageBreak(doc, 60);
  doc.fillColor(INK).font("Helvetica-Bold").fontSize(10).text(title);
  items.slice(0, 6).forEach((item) => {
    checkPageBreak(doc, 38);
    doc
      .fillColor(DIM)
      .font("Helvetica-Bold")
      .fontSize(8)
      .text(`${item.category} | +${item.points} | ${item.effort.label}`.toUpperCase());
    doc.fillColor(INK).font("Helvetica").fontSize(9).text(item.message, { width: 495 });
    if (item.recommendation) {
      doc.fillColor(DIM).font("Helvetica").fontSize(8).text(`Fix: ${item.recommendation}`, { width: 495 });
    }
    doc.moveDown(0.35);
  });
  doc.moveDown(0.35);
}

function drawAiInsights(doc, report) {
  if (!report.aiInsights || !report.aiInsights.insights) return;

  const insights = report.aiInsights.insights;
  checkPageBreak(doc, 180);
  sectionTitle(doc, "AI Client Strategy Summary");

  if (insights.executiveSummary) {
    doc.fillColor(INK).font("Helvetica-Bold").fontSize(10).text("Executive Summary");
    doc.fillColor(DIM).font("Helvetica").fontSize(9).text(insights.executiveSummary, { width: 495 });
    doc.moveDown(0.6);
  }

  drawAiList(doc, "Key Strengths", insights.keyStrengths);
  drawAiList(doc, "Biggest Risks", insights.biggestRisks);

  if (insights.rewrittenCopySuggestions) {
    const copy = insights.rewrittenCopySuggestions;
    checkPageBreak(doc, 85);
    doc.fillColor(INK).font("Helvetica-Bold").fontSize(10).text("Rewritten Copy Suggestions");
    [
      ["Meta title", copy.metaTitle],
      ["Meta description", copy.metaDescription],
      ["Hero headline", copy.heroHeadline],
      ["Intro paragraph", copy.introParagraph],
      ["Primary CTA", copy.primaryCta],
    ].forEach(([label, value]) => {
      if (!value) return;
      doc.fillColor(DIM).font("Helvetica-Bold").fontSize(8.5).text(label.toUpperCase(), { continued: true });
      doc.fillColor("#3d4759").font("Helvetica").fontSize(8.5).text(`  ${value}`, { width: 495 });
    });
    doc.moveDown(0.6);
  }

  if (insights.toneAnalysis) {
    checkPageBreak(doc, 45);
    doc.fillColor(INK).font("Helvetica-Bold").fontSize(10).text("Tone Analysis");
    doc.fillColor(DIM).font("Helvetica").fontSize(9).text(insights.toneAnalysis, { width: 495 });
    doc.moveDown(0.6);
  }

  if (insights.competitorComparison) {
    checkPageBreak(doc, 45);
    doc.fillColor(INK).font("Helvetica-Bold").fontSize(10).text("Competitor Comparison");
    doc.fillColor(DIM).font("Helvetica").fontSize(9).text(insights.competitorComparison, { width: 495 });
    doc.moveDown(0.6);
  }

  drawAiList(doc, "Recommended Next Steps", insights.recommendedNextSteps);
  drawAiList(doc, "Client Questions To Ask", insights.clientQuestionsToAsk);

  drawRule(doc);
  doc.moveDown(0.8);
}

function drawAiList(doc, title, items) {
  if (!Array.isArray(items) || items.length === 0) return;
  checkPageBreak(doc, 45);
  doc.fillColor(INK).font("Helvetica-Bold").fontSize(10).text(title);
  items.slice(0, 8).forEach((item) => {
    checkPageBreak(doc, 24);
    doc.fillColor(DIM).font("Helvetica").fontSize(9).text(`- ${item}`, { width: 495 });
  });
  doc.moveDown(0.5);
}

function drawScreenshot(doc, report) {
  if (!report.screenshot) return;

  checkPageBreak(doc, 260);
  sectionTitle(doc, "Rendered Page Screenshot");

  try {
    const base64 = report.screenshot.replace(/^data:image\/\w+;base64,/, "");
    const image = Buffer.from(base64, "base64");
    doc.image(image, 50, doc.y, { fit: [495, 260], align: "center", valign: "top" });
    doc.y += 270;
    drawRule(doc);
    doc.moveDown(0.8);
  } catch (_) {
    doc.fillColor(DIM).font("Helvetica").fontSize(9.5).text("Screenshot could not be embedded in this PDF.");
    doc.moveDown(0.8);
    drawRule(doc);
    doc.moveDown(0.8);
  }
}

function drawCategoryBreakdown(doc, report) {
  sectionTitle(doc, "Category Breakdown");

  Object.entries(report.byCategory).forEach(([name, counts]) => {
    const y = doc.y;
    doc.fillColor(INK).font("Helvetica-Bold").fontSize(10.5).text(name, 50, y);

    const summary = `${counts.good} passed · ${counts.warning} warnings · ${counts.critical} critical`;
    doc.font("Helvetica").fontSize(9.5).fillColor(DIM).text(summary, 50, y + 14);

    doc.moveDown(1.1);
  });

  drawRule(doc);
  doc.moveDown(0.8);
}

function drawScoreLedger(doc, report) {
  checkPageBreak(doc, 100);
  sectionTitle(doc, "How This Score Was Calculated");

  const s = report.scoreSummary;
  doc
    .fillColor(DIM)
    .font("Helvetica")
    .fontSize(9.5)
    .text(
      `Starts at ${s.startingScore} points. Each critical finding costs -${s.criticalPenaltyEach}, each warning costs -${s.warningPenaltyEach}. ` +
        `${s.totalCritical} critical + ${s.totalWarning} warning finding(s) were found, for a total of -${s.totalPointsLost} points` +
        (s.flooredAtZero ? " (floored at 0)." : ".") +
        ` Final score: ${s.finalScore}/100.`,
      { width: 495 }
    );
  doc.moveDown(0.8);

  const deductions = report.scoreLedger.filter((row) => row.penalty > 0);

  if (deductions.length === 0) {
    doc.fillColor("#2fbf9f").font("Helvetica-Bold").fontSize(10).text("No points were deducted — every check passed.");
    doc.moveDown(0.8);
    drawRule(doc);
    doc.moveDown(0.8);
    return;
  }

  // Table header
  const colX = { check: 50, category: 260, points: 350, total: 420 };
  const headerY = doc.y;
  doc.font("Helvetica-Bold").fontSize(8.5).fillColor(DIM);
  doc.text("FINDING", colX.check, headerY, { width: 205 });
  doc.text("CATEGORY", colX.category, headerY, { width: 85 });
  doc.text("POINTS", colX.points, headerY, { width: 65 });
  doc.text("RUNNING TOTAL", colX.total, headerY, { width: 100 });
  doc.moveDown(0.5);
  drawRule(doc);
  doc.moveDown(0.4);

  deductions.forEach((row) => {
    checkPageBreak(doc, 30);
    const y = doc.y;
    doc.font("Helvetica").fontSize(8.5).fillColor(INK);
    doc.text(row.message, colX.check, y, { width: 205 });
    doc.fillColor(DIM).text(row.category, colX.category, y, { width: 85 });
    doc.fillColor("#e15554").font("Helvetica-Bold").text(`-${row.penalty}`, colX.points, y, { width: 65 });
    doc.fillColor(INK).font("Helvetica").text(String(row.runningTotal), colX.total, y, { width: 100 });
    doc.moveDown(0.7);
  });

  doc.moveDown(0.3);
  drawRule(doc);
  doc.moveDown(0.8);
}

function drawPalette(doc, report) {
  const topColors = report.design?.topColors?.length
    ? report.design.topColors
    : (report.design?.palette || []).map((hex) => ({ hex, count: null }));
  if (!report.design || topColors.length === 0) return;

  checkPageBreak(doc, 140);
  sectionTitle(doc, "Most Used Colors");

  const d = report.design;
  doc
    .fillColor(DIM)
    .font("Helvetica")
    .fontSize(9.5)
    .text(
      `Showing the 4 colors used most often across the rendered page/styles. ${d.distinctColorCount} distinct colors and ${d.fonts.length} font famil${d.fonts.length === 1 ? "y" : "ies"} were found.`,
      { width: 495 }
    );
  doc.moveDown(0.8);

  const swatchSize = 55;
  const gap = 12;
  let x = 50;
  const y = doc.y;

  topColors.forEach((item, index) => {
    doc.rect(x, y, swatchSize, swatchSize).fillColor(item.hex).fill();
    doc.rect(x, y, swatchSize, swatchSize).strokeColor(LINE).lineWidth(1).stroke();
    doc
      .fillColor(DIM)
      .font("Helvetica")
      .fontSize(7.5)
      .text(`#${index + 1} most used`, x, y + swatchSize + 4, { width: swatchSize, align: "center" });
    doc
      .fillColor(INK)
      .font("Courier")
      .fontSize(7)
      .text(item.hex, x, y + swatchSize + 15, { width: swatchSize, align: "center" });
    if (item.count !== null) {
      doc
        .fillColor(DIM)
        .font("Helvetica")
        .fontSize(7)
        .text(`${item.count} uses`, x, y + swatchSize + 25, { width: swatchSize, align: "center" });
    }
    x += swatchSize + gap;
  });

  doc.y = y + swatchSize + 32;
  drawRule(doc);
  doc.moveDown(0.8);
}

function drawFindings(doc, report) {
  sectionTitle(doc, "Findings");

  const order = { critical: 0, warning: 1, good: 2 };
  const sorted = [...report.issues].sort((a, b) => order[a.severity] - order[b.severity]);

  sorted.forEach((issue) => {
    checkPageBreak(doc, 70);

    const y = doc.y;
    doc.circle(56, y + 5, 3).fillColor(SEVERITY_COLOR[issue.severity]).fill();

    doc
      .fillColor(DIM)
      .font("Helvetica-Bold")
      .fontSize(8.5)
      .text(`${issue.category.toUpperCase()} · ${issue.id}`, 68, y, { continued: false });

    doc
      .fillColor(INK)
      .font("Helvetica")
      .fontSize(10)
      .text(issue.message, 68, y + 11, { width: 477 });

    if (issue.location) {
      doc
        .fillColor("#131b2e")
        .font("Helvetica-Oblique")
        .fontSize(8.5)
        .text(`Location: ${issue.location}`, 68, doc.y + 2, { width: 477 });
    }

    if (issue.evidence) {
      doc
        .fillColor("#3d4759")
        .font("Courier")
        .fontSize(8.5)
        .text(issue.evidence, 68, doc.y + 3, { width: 477 });
    }

    if (issue.why) {
      doc
        .fillColor(DIM)
        .font("Helvetica-Bold")
        .fontSize(8)
        .text("WHY IT MATTERS", 68, doc.y + 5);
      doc
        .fillColor("#3d4759")
        .font("Helvetica")
        .fontSize(9)
        .text(issue.why, 68, doc.y + 1, { width: 477 });
    }

    if (issue.recommendation) {
      doc
        .fillColor(DIM)
        .font("Helvetica-Bold")
        .fontSize(8)
        .text("FIX", 68, doc.y + 5);
      doc
        .fillColor(DIM)
        .font("Helvetica-Oblique")
        .fontSize(9)
        .text(issue.recommendation, 68, doc.y + 1, { width: 477 });
    }

    doc.moveDown(1);
    drawRule(doc);
    doc.moveDown(0.6);
  });
}

function drawMethodology(doc) {
  doc.addPage();
  sectionTitle(doc, "Methodology");
  doc
    .fillColor(DIM)
    .font("Helvetica")
    .fontSize(9.5)
    .text("What this engine inspects, and why each category is weighted the way it is.", { width: 495 });
  doc.moveDown(1);

  const sections = [
    [
      "01 · On-Page",
      "Parses the rendered DOM for title tag, meta description, heading structure (H1-H6), and image alt attributes — the signals a crawler reads to determine topical relevance.",
    ],
    [
      "02 · Technical",
      "Checks HTTPS, mobile viewport config, canonical tags, robots.txt, sitemap.xml, structured data (JSON-LD), and raw server response time — the infrastructure layer search engines evaluate before content is even considered.",
    ],
    [
      "03 · Content",
      "Computes visible word count and a practical readability score from sentence length, word length, long-word density, paragraph length, and Flesch Reading Ease.",
    ],
    [
      "04 · Links",
      "Extracts same-origin links from the DOM and issues HEAD requests against a sample to detect broken (4xx/5xx) internal links.",
    ],
    [
      "Scoring",
      "Starts at 100 points. Each critical finding deducts 6 points, each warning deducts 2. Final score maps to a grade: A (90+), B (75+), C (60+), D (40+), F (below 40).",
    ],
  ];

  sections.forEach(([title, body]) => {
    checkPageBreak(doc, 60);
    doc.fillColor(INK).font("Helvetica-Bold").fontSize(11).text(title);
    doc.fillColor(DIM).font("Helvetica").fontSize(9.5).text(body, { width: 495 });
    doc.moveDown(0.8);
  });
}

function drawFooter(doc) {
  const range = doc.bufferedPageRange();
  const footerY = doc.page.height - doc.page.margins.bottom - 20;
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(i);
    doc
      .fontSize(8)
      .fillColor(DIM)
      .text(`Generated by Auditline · Page ${i + 1} of ${range.count}`, 50, footerY, {
        width: 495,
        align: "center",
        lineBreak: false,
      });
  }
}

function sectionTitle(doc, title) {
  doc.fillColor(INK).font("Helvetica-Bold").fontSize(13).text(title);
  doc.moveDown(0.4);
}

function drawRule(doc) {
  doc
    .moveTo(50, doc.y)
    .lineTo(545, doc.y)
    .strokeColor(LINE)
    .lineWidth(1)
    .stroke();
}

function checkPageBreak(doc, neededSpace) {
  if (doc.y + neededSpace > doc.page.height - doc.page.margins.bottom) {
    doc.addPage();
  }
}

module.exports = { generatePdfReport };
