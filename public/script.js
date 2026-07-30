const form = document.getElementById("scan-form");
const urlInput = document.getElementById("url-input");
const targetKeywordInput = document.getElementById("target-keyword-input");
const maxPagesInput = document.getElementById("max-pages-input");
const maxDepthInput = document.getElementById("max-depth-input");
const gscPropertyInput = document.getElementById("gsc-property-input");
const gscTokenInput = document.getElementById("gsc-token-input");
const gscStartInput = document.getElementById("gsc-start-input");
const gscEndInput = document.getElementById("gsc-end-input");
const scanBtn = document.getElementById("scan-btn");
const statusEl = document.getElementById("scan-status");
const scanLogEl = document.getElementById("scan-log");
const reportEl = document.getElementById("report");
const historySection = document.getElementById("history-section");
const historyList = document.getElementById("history-list");
const generateAiBtn = document.getElementById("generate-ai-btn");
const askAiBtn = document.getElementById("ask-ai-btn");
const aiKeyInput = document.getElementById("ai-key-input");
const aiModelInput = document.getElementById("ai-model-input");
const customApiBaseUrlInput = document.getElementById("custom-api-base-url-input");
const aiAudienceInput = document.getElementById("ai-audience-input");
const competitorUrlsInput = document.getElementById("competitor-urls-input");
const aiQuestionInput = document.getElementById("ai-question-input");
const aiStatusEl = document.getElementById("ai-status");
const aiOutputEl = document.getElementById("ai-output");
const aiAnswerEl = document.getElementById("ai-answer");

const SCAN_STEPS = [
  "launch headless Chrome and render the page",
  "capture rendered DOM, screenshot, and Core Web Vitals",
  "parse rendered DOM with cheerio",
  "GET /robots.txt",
  "GET /sitemap.xml",
  "extract same-origin <a href> links",
  "queue internal URLs for site crawl",
  "HEAD sampled internal links (link health)",
  "read computed styles (colors, contrast, typography)",
  "check keyword placement and Search Console data",
  "check security headers, exposed files, mixed content, and JS CVEs",
  "run on-page checks (title, meta, headings, alt text)",
  "run technical checks (https, viewport, canonical, schema)",
  "run content checks (word count, practical readability, per-section)",
  "run design/engagement checks (color palette, typography, CTA, density)",
  "compute weighted score + full deduction ledger",
];

let scanLogTimer = null;

function startScanLog() {
  scanLogEl.hidden = false;
  scanLogEl.innerHTML = "";
  let i = 0;
  const addLine = () => {
    if (i > 0) {
      const prev = scanLogEl.querySelector(".log-line:last-child");
      if (prev) prev.classList.add("done");
    }
    if (i < SCAN_STEPS.length) {
      const line = document.createElement("span");
      line.className = "log-line";
      line.textContent = SCAN_STEPS[i];
      scanLogEl.appendChild(line);
      scanLogEl.scrollTop = scanLogEl.scrollHeight;
      i++;
      scanLogTimer = setTimeout(addLine, 280 + Math.random() * 220);
    }
  };
  addLine();
}

function finishScanLog() {
  clearTimeout(scanLogTimer);
  scanLogEl.querySelectorAll(".log-line").forEach((el) => el.classList.add("done"));
}

const GAUGE_ARC_LENGTH = 314; // matches the SVG path's approximate arc length

const SEVERITY_COLOR = {
  good: "var(--good)",
  warning: "var(--warning)",
  critical: "var(--critical)",
};

let currentIssues = [];
let activeFilter = "all";
let currentReportId = null;

document.getElementById("download-pdf-btn").addEventListener("click", () => {
  if (!currentReportId) return;
  window.location.href = `/api/report/${currentReportId}/pdf`;
});

generateAiBtn.addEventListener("click", generateAiAnalysis);
askAiBtn.addEventListener("click", askAiQuestion);
aiQuestionInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") askAiQuestion();
});

drawGaugeTicks();
loadHistory();

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const url = urlInput.value.trim();
  if (!url) return;
  const maxPages = clampNumber(maxPagesInput.value, 1, 10, 1);
  const maxDepth = clampNumber(maxDepthInput.value, 1, 3, 1);
  const targetKeyword = targetKeywordInput.value.trim();
  const gscPropertyUrl = gscPropertyInput.value.trim();
  const gscAccessToken = gscTokenInput.value.trim();
  const gscStartDate = gscStartInput.value;
  const gscEndDate = gscEndInput.value;

  setLoading(true);
  startScanLog();
  try {
    const res = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url,
        maxPages,
        maxDepth,
        targetKeyword,
        gscPropertyUrl,
        gscAccessToken,
        gscStartDate,
        gscEndDate,
      }),
    });
    const data = await res.json();
    finishScanLog();

    if (!res.ok) {
      showStatus(data.error || "Something went wrong.", true);
      reportEl.hidden = true;
      return;
    }

    showStatus("");
    renderReport(data);
    loadHistory();
  } catch (err) {
    finishScanLog();
    showStatus("Network error — is the server running?", true);
  } finally {
    setLoading(false);
  }
});

document.getElementById("filter-chips").addEventListener("click", (e) => {
  if (!e.target.matches(".chip")) return;
  activeFilter = e.target.dataset.filter;
  document
    .querySelectorAll(".chip")
    .forEach((c) => c.classList.toggle("active", c === e.target));
  renderIssues();
});

function setLoading(loading) {
  scanBtn.disabled = loading;
  scanBtn.textContent = loading ? "Scanning…" : "Run Audit";
  if (loading) {
    const pages = clampNumber(maxPagesInput.value, 1, 10, 1);
    showStatus(pages > 1 ? `Crawling up to ${pages} pages with headless Chrome…` : "Rendering page, robots.txt, sitemap, and internal links…");
  }
}

function showStatus(msg, isError = false) {
  statusEl.hidden = !msg;
  statusEl.textContent = msg;
  statusEl.classList.toggle("error", isError);
}

function renderReport(data) {
  reportEl.hidden = false;
  currentReportId = data.id;

  document.getElementById("report-url-text").textContent = data.finalUrl;
  document.getElementById("report-time").textContent = new Date(
    data.scannedAt
  ).toLocaleString();

  animateGauge(data.score);
  document.getElementById("score-number").textContent = data.score;
  document.getElementById("score-grade").textContent = `Grade ${data.grade}`;

  renderMetrics(data.metrics);
  renderCategories(data.byCategory);
  renderIntelligence(data);
  renderSecurity(data.security);
  renderLocalTrust(data.localTrust);
  renderScoreSimulator(data.scoreSimulator);
  renderActionPlan(data.actionPlan);
  renderSiteAudit(data.siteAudit);
  renderScanMeta(data);
  renderScoreBreakdown(data);
  renderPalette(data.design);
  renderScreenshot(data);
  resetAiPanel();

  currentIssues = data.issues;
  activeFilter = "all";
  document
    .querySelectorAll(".chip")
    .forEach((c) => c.classList.toggle("active", c.dataset.filter === "all"));
  renderIssues();

  reportEl.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function generateAiAnalysis() {
  if (!currentReportId) return;
  const competitorUrls = competitorUrlsInput.value
    .split(",")
    .map((url) => url.trim())
    .filter(Boolean)
    .slice(0, 3);

  setAiLoading(true, "Generating AI client analysis...");
  aiOutputEl.hidden = true;
  try {
    const res = await fetch(`/api/report/${currentReportId}/ai`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        aiProvider: "auto",
        openaiApiKey: aiKeyInput.value.trim(),
        openaiModel: aiModelInput ? aiModelInput.value.trim() : "",
        customApiBaseUrl: customApiBaseUrlInput.value.trim(),
        targetAudience: aiAudienceInput.value.trim(),
        competitorUrls,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      showAiStatus(data.error || "AI analysis failed.", true);
      return;
    }
    showAiStatus("AI analysis generated.", false);
    renderAiOutput(data.insights);
  } catch (_) {
    showAiStatus("Network error while generating AI analysis.", true);
  } finally {
    setAiLoading(false);
  }
}

async function askAiQuestion() {
  if (!currentReportId) return;
  const question = aiQuestionInput.value.trim();
  if (!question) {
    showAiStatus("Enter a question about the report first.", true);
    return;
  }

  askAiBtn.disabled = true;
  aiAnswerEl.hidden = false;
  aiAnswerEl.textContent = "Thinking...";
  try {
    const res = await fetch(`/api/report/${currentReportId}/ai/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question,
        aiProvider: "auto",
        openaiApiKey: aiKeyInput.value.trim(),
        openaiModel: aiModelInput ? aiModelInput.value.trim() : "",
        customApiBaseUrl: customApiBaseUrlInput.value.trim(),
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      aiAnswerEl.textContent = data.error || "AI question answering failed.";
      aiAnswerEl.classList.add("error");
      return;
    }
    aiAnswerEl.classList.remove("error");
    aiAnswerEl.textContent = data.answer;
  } catch (_) {
    aiAnswerEl.classList.add("error");
    aiAnswerEl.textContent = "Network error while asking AI.";
  } finally {
    askAiBtn.disabled = false;
  }
}

function setAiLoading(loading, message = "") {
  generateAiBtn.disabled = loading;
  generateAiBtn.textContent = loading ? "Generating..." : "Generate AI Analysis";
  if (message) showAiStatus(message, false);
}

function showAiStatus(message, isError = false) {
  aiStatusEl.hidden = !message;
  aiStatusEl.textContent = message;
  aiStatusEl.classList.toggle("error", isError);
}

function resetAiPanel() {
  aiOutputEl.hidden = true;
  aiOutputEl.innerHTML = "";
  aiAnswerEl.hidden = true;
  aiAnswerEl.textContent = "";
  showAiStatus("", false);
}

function renderAiOutput(insights) {
  aiOutputEl.hidden = false;
  const copy = insights.rewrittenCopySuggestions || {};
  aiOutputEl.innerHTML = `
    <div class="ai-section">
      <h3>Executive Summary</h3>
      <p>${escapeHtml(insights.executiveSummary || "No summary returned.")}</p>
    </div>
    ${renderAiList("Key Strengths", insights.keyStrengths)}
    ${renderAiList("Biggest Risks", insights.biggestRisks)}
    <div class="ai-section">
      <h3>Rewritten Copy Suggestions</h3>
      <dl class="copy-suggestions">
        <dt>Meta title</dt><dd>${escapeHtml(copy.metaTitle || "n/a")}</dd>
        <dt>Meta description</dt><dd>${escapeHtml(copy.metaDescription || "n/a")}</dd>
        <dt>Hero headline</dt><dd>${escapeHtml(copy.heroHeadline || "n/a")}</dd>
        <dt>Intro paragraph</dt><dd>${escapeHtml(copy.introParagraph || "n/a")}</dd>
        <dt>Primary CTA</dt><dd>${escapeHtml(copy.primaryCta || "n/a")}</dd>
      </dl>
    </div>
    <div class="ai-section">
      <h3>Tone Analysis</h3>
      <p>${escapeHtml(insights.toneAnalysis || "No tone analysis returned.")}</p>
    </div>
    <div class="ai-section">
      <h3>Competitor Comparison</h3>
      <p>${escapeHtml(insights.competitorComparison || "Add competitor URLs to generate a comparison.")}</p>
    </div>
    ${renderAiList("Recommended Next Steps", insights.recommendedNextSteps)}
    ${renderAiList("Client Questions To Ask", insights.clientQuestionsToAsk)}
  `;
}

function renderAiList(title, items) {
  const safeItems = Array.isArray(items) ? items : [];
  if (safeItems.length === 0) return "";
  return `
    <div class="ai-section">
      <h3>${escapeHtml(title)}</h3>
      <ul>${safeItems.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
    </div>`;
}

function animateGauge(score) {
  const fill = document.getElementById("gauge-fill");
  const needle = document.getElementById("gauge-needle");

  const offset = GAUGE_ARC_LENGTH * (1 - score / 100);
  const color =
    score >= 75 ? "var(--good)" : score >= 40 ? "var(--warning)" : "var(--critical)";

  requestAnimationFrame(() => {
    fill.style.stroke = color;
    fill.style.strokeDashoffset = offset;
    const angle = (score / 100) * 180 - 90;
    needle.style.transform = `rotate(${angle}deg)`;
  });
}

function drawGaugeTicks() {
  const g = document.getElementById("gauge-ticks");
  const cx = 120, cy = 130, rOuter = 100, rInner = 88;
  for (let i = 0; i <= 4; i++) {
    const angle = Math.PI * (1 - i / 4); // 180deg to 0deg
    const x1 = cx + rInner * Math.cos(angle);
    const y1 = cy - rInner * Math.sin(angle);
    const x2 = cx + rOuter * Math.cos(angle);
    const y2 = cy - rOuter * Math.sin(angle);
    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", x1);
    line.setAttribute("y1", y1);
    line.setAttribute("x2", x2);
    line.setAttribute("y2", y2);
    line.setAttribute("class", "gauge-tick");
    g.appendChild(line);
  }
}

function renderScanMeta(data) {
  const total = data.issues.length;
  const critical = data.issues.filter((i) => i.severity === "critical").length;
  const warning = data.issues.filter((i) => i.severity === "warning").length;

  document.getElementById("scan-meta").innerHTML = `
    <span>engine <b>auditline v1.2.0</b></span>
    <span><b>${total}</b> checks run</span>
    <span><b>${critical}</b> critical · <b>${warning}</b> warning</span>
    ${data.siteAudit?.enabled ? `<span><b>${data.siteAudit.pagesCrawled}</b> pages crawled</span>` : ""}
    <span>report id <b>${data.id.slice(0, 8)}</b></span>
  `;
}

function renderScoreBreakdown(data) {
  const summary = data.scoreSummary;
  const ledger = data.scoreLedger;
  document.getElementById("breakdown-sub").innerHTML = data.siteAudit?.enabled
    ? `Site health blends <b>75%</b> average page score (<b>${data.siteAudit.averagePageScore}</b>) with <b>25%</b> sitewide architecture score (<b>${data.siteAudit.sitewideScore}</b>). Final site score: <b>${data.siteAudit.overallScore}/100</b>. The ledger below shows deductions for the seed page.`
    : `Starts at <b>100</b> points. Each <b>critical</b> finding costs <b>-${summary.criticalPenaltyEach}</b>, ` +
      `each <b>warning</b> costs <b>-${summary.warningPenaltyEach}</b>. ` +
      `${summary.totalCritical} critical + ${summary.totalWarning} warning finding(s) were found, ` +
      `for a total of <b>-${summary.totalPointsLost} points</b>` +
      (summary.flooredAtZero ? " (floored at 0)." : ".") +
      ` Final score: <b>${summary.finalScore}/100</b>.`;

  const rows = ledger
    .filter((row) => row.penalty > 0)
    .map(
      (row) => `
      <tr>
        <td><span class="ledger-id">${escapeHtml(row.id)}</span></td>
        <td>${escapeHtml(row.category)}</td>
        <td>${escapeHtml(row.message)}</td>
        <td class="penalty-cell">-${row.penalty}</td>
        <td>${row.runningTotal}</td>
      </tr>`
    )
    .join("");

  document.getElementById("ledger-body").innerHTML =
    rows ||
    `<tr><td colspan="5" class="no-deductions">No points were deducted — every check passed.</td></tr>`;
}

function renderPalette(design) {
  const panel = document.getElementById("palette-panel");
  const colors = design?.topColors?.length
    ? design.topColors
    : (design?.palette || []).map((hex) => ({ hex, count: null }));

  if (!design || colors.length === 0) {
    panel.hidden = true;
    return;
  }
  panel.hidden = false;

  document.getElementById("palette-sub").textContent =
    `Showing the 4 colors used most often across the rendered page/styles. ` +
    `${design.distinctColorCount} distinct colors and ${design.fonts.length} font famil${design.fonts.length === 1 ? "y" : "ies"} were found.`;

  document.getElementById("palette-swatches").innerHTML = colors
    .map(
      (item, index) => `
      <div class="swatch">
        <div class="swatch-color" style="background:${item.hex}"></div>
        <div class="swatch-label">#${index + 1} most used${item.count !== null ? ` · ${item.count} uses` : ""}</div>
        <div class="swatch-hex">${item.hex}</div>
      </div>`
    )
    .join("");
}

function renderMetrics(m) {
  const grid = document.getElementById("metrics-grid");
  const vitals = m.webVitals || {};
  const items = [
    ["Word count", m.wordCount],
    [m.browserRendered ? "Render time" : "Load time", `${m.loadTimeMs} ms`],
    ["LCP", vitals.lcp !== null && vitals.lcp !== undefined ? `${vitals.lcp} ms` : "n/a"],
    ["CLS", vitals.cls !== null && vitals.cls !== undefined ? vitals.cls : "n/a"],
    ["INP", vitals.inp !== null && vitals.inp !== undefined ? `${vitals.inp} ms` : "n/a"],
    ["Readability", m.readability !== null ? `${m.readability}/100` : "n/a"],
    ["Broken links", `${m.brokenLinks} / ${m.internalLinksSampled} sampled`],
  ];
  grid.innerHTML = items
    .map(
      ([label, value]) => `
      <div class="metric-card ${statusCardClass(label, value)}">
        <div class="m-label">${escapeHtml(label)}</div>
        <div class="m-value">${escapeHtml(value)}</div>
      </div>`
    )
    .join("");
}

function renderScreenshot(data) {
  const panel = document.getElementById("screenshot-panel");
  const img = document.getElementById("screenshot-img");
  if (!data.screenshot) {
    panel.hidden = true;
    img.removeAttribute("src");
    return;
  }

  panel.hidden = false;
  img.src = data.screenshot;
  img.alt = `Rendered screenshot of ${data.finalUrl}`;
}

function renderCategories(byCategory) {
  const wrap = document.getElementById("categories");
  wrap.innerHTML = Object.entries(byCategory)
    .map(([name, counts]) => {
      const total = counts.good + counts.warning + counts.critical || 1;
      const segs = ["good", "warning", "critical"]
        .map(
          (sev) =>
            `<div style="width:${(counts[sev] / total) * 100}%; background:${SEVERITY_COLOR[sev]}"></div>`
        )
        .join("");
      return `
        <div class="category-card">
          <div class="c-name">${name}</div>
          <div class="c-bar">${segs}</div>
          <div class="c-counts">
            <span><span class="dot" style="background:var(--good)"></span>${counts.good}</span>
            <span><span class="dot" style="background:var(--warning)"></span>${counts.warning}</span>
            <span><span class="dot" style="background:var(--critical)"></span>${counts.critical}</span>
          </div>
        </div>`;
    })
    .join("");
}

function renderIntelligence(data) {
  const panel = document.getElementById("intelligence-panel");
  const grid = document.getElementById("intelligence-grid");
  const gscWrap = document.getElementById("gsc-table-wrap");
  const gscBody = document.getElementById("gsc-table-body");

  if (!data.keyword || !data.keyword.enabled) {
    panel.hidden = true;
    return;
  }

  const metrics = data.keyword.metrics || {};
  const performance = data.keyword.searchPerformance;
  panel.hidden = false;
  grid.innerHTML = [
    ["Keyword", data.keyword.target],
    ["Title", metrics.titleHasKeyword ? "Present" : "Missing"],
    ["H1", metrics.h1HasKeyword ? "Present" : "Missing"],
    ["Intro", metrics.firstParagraphHasKeyword ? "Present" : "Missing"],
    ["Density", `${metrics.density}%`],
    ["Occurrences", metrics.occurrences],
  ]
    .map(
      ([label, value]) => `
      <div class="intel-card ${statusCardClass(label, value)}">
        <div class="intel-label">${escapeHtml(label)}</div>
        <div class="intel-value">${escapeHtml(value)}</div>
      </div>`
    )
    .join("");

  if (performance && performance.available && performance.rows.length > 0) {
    gscWrap.hidden = false;
    gscBody.innerHTML = performance.rows
      .map(
        (row) => `
        <tr>
          <td>${escapeHtml(row.query)}</td>
          <td>${row.clicks}</td>
          <td>${row.impressions}</td>
          <td>${(row.ctr * 100).toFixed(1)}%</td>
          <td>${row.position.toFixed(1)}</td>
        </tr>`
      )
      .join("");
  } else {
    gscWrap.hidden = true;
    gscBody.innerHTML = "";
  }
}

function renderSecurity(security) {
  const panel = document.getElementById("security-panel");
  const grid = document.getElementById("security-grid");
  if (!security) {
    panel.hidden = true;
    return;
  }

  panel.hidden = false;
  const vulnerabilities = security.vulnerabilities || [];
  const libraries = security.libraries || [];
  const missingHeaders = security.missingHeaders || [];
  grid.innerHTML = [
    ["Missing headers", missingHeaders.length],
    ["JS libraries", libraries.length],
    ["Known CVEs", vulnerabilities.length],
    ["Files checked", (security.exposedFilesChecked || []).length],
  ]
    .map(
      ([label, value]) => `
      <div class="security-card ${statusCardClass(label, value)}">
        <div class="security-label">${escapeHtml(label)}</div>
        <div class="security-value">${escapeHtml(value)}</div>
      </div>`
    )
    .join("");
}

function renderLocalTrust(localTrust) {
  const panel = document.getElementById("local-trust-panel");
  const grid = document.getElementById("local-trust-grid");
  const explanation = document.getElementById("local-trust-explanation");
  if (!localTrust) {
    panel.hidden = true;
    return;
  }

  panel.hidden = false;
  explanation.textContent = localTrust.explanation || "Checks local business contact consistency and conversion trust signals.";
  const schema = localTrust.localBusinessSchema || {};
  const signals = localTrust.trustSignals || {};
  grid.innerHTML = [
    ["Phone", localTrust.phones?.length ? "Present" : "Missing"],
    ["Address", localTrust.addresses?.length ? localTrust.addresses[0] : "Missing"],
    ["LocalBusiness schema", schema.found ? `${schema.presentFields?.length || 0} fields` : "Missing"],
    ["Testimonials/reviews", signals.testimonials?.found ? "Present" : "Missing"],
    ["Contact visibility", signals.contactVisible ? "Visible" : "Weak"],
    ["SSL badge", signals.sslBadge ? "Detected" : "Not detected"],
    ["Privacy policy", signals.privacyPolicy ? "Present" : "Missing"],
  ]
    .map(
      ([label, value]) => `
      <div class="local-trust-card ${statusCardClass(label, value)}">
        <div class="local-trust-label">${escapeHtml(label)}</div>
        <div class="local-trust-value">${escapeHtml(value)}</div>
      </div>`
    )
    .join("");
}

function renderScoreSimulator(simulator) {
  const panel = document.getElementById("simulator-panel");
  const grid = document.getElementById("simulator-grid");
  const explanation = document.getElementById("simulator-explanation");
  const scenarios = simulator?.scenarios || [];

  if (!simulator || scenarios.length === 0) {
    panel.hidden = true;
    grid.innerHTML = "";
    return;
  }

  panel.hidden = false;
  explanation.textContent = simulator.explanation || "Projects score lift from fixing the highest-impact findings.";
  grid.innerHTML = scenarios
    .map(
      (scenario) => `
      <div class="sim-card">
        <div class="sim-topline">Fix top ${scenario.count}</div>
        <div class="sim-score">${scenario.fromScore} <span>to</span> ${scenario.toScore}</div>
        <div class="sim-lift">+${scenario.lift} point${scenario.lift === 1 ? "" : "s"}</div>
        <ul>
          ${scenario.fixedIssues
            .slice(0, 5)
            .map((item) => `<li>${escapeHtml(item.message)} <b>+${item.points}</b></li>`)
            .join("")}
        </ul>
      </div>`
    )
    .join("");
}

function renderActionPlan(actionPlan) {
  const panel = document.getElementById("action-plan-panel");
  const explanation = document.getElementById("action-plan-explanation");
  const quickList = document.getElementById("quick-wins-list");
  const projectList = document.getElementById("bigger-projects-list");

  if (!actionPlan || (!actionPlan.quickWins?.length && !actionPlan.biggerProjects?.length)) {
    panel.hidden = true;
    quickList.innerHTML = "";
    projectList.innerHTML = "";
    return;
  }

  panel.hidden = false;
  explanation.textContent = actionPlan.explanation || "Ranks fixes by score impact and implementation effort.";
  quickList.innerHTML = renderPlanItems(actionPlan.quickWins || []);
  projectList.innerHTML = renderPlanItems(actionPlan.biggerProjects || []);
}

function renderPlanItems(items) {
  if (!items.length) {
    return `<li class="plan-empty">No items in this section.</li>`;
  }

  return items
    .map(
      (item) => `
      <li class="plan-item">
        <div class="plan-meta">
          <span>${escapeHtml(item.category)} · ${escapeHtml(item.severity)}</span>
          <span class="points-pill">+${item.points}</span>
          <span class="effort-pill">${escapeHtml(item.effort.label)}</span>
        </div>
        <div class="plan-title">${escapeHtml(item.message)}</div>
        <div class="plan-rec">${escapeHtml(item.recommendation)}</div>
      </li>`
    )
    .join("");
}

function renderSiteAudit(siteAudit) {
  const panel = document.getElementById("site-panel");
  if (!siteAudit || !siteAudit.enabled) {
    panel.hidden = true;
    return;
  }

  panel.hidden = false;
  document.getElementById("site-score-number").textContent = siteAudit.overallScore;
  document.getElementById("site-score-grade").textContent = `Grade ${siteAudit.overallGrade}`;
  document.getElementById("site-summary").innerHTML = `
    <span><b>${siteAudit.pagesCrawled}</b> / ${siteAudit.maxPages} pages crawled</span>
    <span>depth <b>${siteAudit.maxDepth}</b></span>
    <span>avg page score <b>${siteAudit.averagePageScore}</b></span>
    <span>sitewide score <b>${siteAudit.sitewideScore}</b></span>
    <span>broken links <b>${siteAudit.brokenLinkMap.length}</b></span>
  `;

  document.getElementById("site-grid").innerHTML = siteAudit.pages
    .map(
      (page) => `
      <div class="site-page">
        <div class="site-page-top">
          <span class="page-grade">${page.score} · ${page.grade}</span>
          <span class="page-depth">d${page.depth} · ${escapeHtml(page.source)}</span>
        </div>
        <div class="page-url">${escapeHtml(page.url)}</div>
        <div class="page-title">${escapeHtml(page.title || "Untitled page")}</div>
        <div class="page-stats">
          <span>${page.severity.critical} critical</span>
          <span>${page.severity.warning} warning</span>
          <span>${page.internalLinksFound} links</span>
          <span>${page.brokenLinks} broken</span>
        </div>
      </div>`
    )
    .join("");

  document.getElementById("site-issues").innerHTML = siteAudit.issues
    .map(
      (item) => `
      <li>
        <span class="sev-marker" style="background:${SEVERITY_COLOR[item.severity]}"></span>
        <div>
          <div class="cat">${escapeHtml(item.category)} · ${escapeHtml(item.id)}</div>
          <div class="msg">${escapeHtml(item.message)}</div>
          ${item.evidence ? `<div class="evidence">${escapeHtml(item.evidence)}</div>` : ""}
          ${item.recommendation ? `<div class="rec"><b>Fix</b>${escapeHtml(item.recommendation)}</div>` : ""}
        </div>
      </li>`
    )
    .join("");
}

function renderIssues() {
  const list = document.getElementById("issues-list");
  const filtered =
    activeFilter === "all"
      ? currentIssues
      : currentIssues.filter((i) => i.severity === activeFilter);

  const order = { critical: 0, warning: 1, good: 2 };
  const sorted = [...filtered].sort((a, b) => order[a.severity] - order[b.severity]);

  list.innerHTML = sorted
    .map(
      (issue) => `
      <li class="issue">
        <span class="sev-marker" style="background:${SEVERITY_COLOR[issue.severity]}"></span>
        <div class="issue-body">
          <div class="cat">${issue.category} · ${issue.id}</div>
          <div class="msg">${escapeHtml(issue.message)}</div>
          ${issue.location ? `<div class="location">📍 ${escapeHtml(issue.location)}</div>` : ""}
          ${issue.evidence ? `<div class="evidence">${escapeHtml(issue.evidence)}</div>` : ""}
          ${issue.why ? `<div class="why"><b>Why it matters</b>${escapeHtml(issue.why)}</div>` : ""}
          ${issue.recommendation ? `<div class="rec"><b>Fix</b>${escapeHtml(issue.recommendation)}</div>` : ""}
        </div>
      </li>`
    )
    .join("");
}

async function loadHistory() {
  try {
    const res = await fetch("/api/history");
    const data = await res.json();
    if (!data.length) return;

    historySection.hidden = false;
    historyList.innerHTML = data
      .map(
        (h) => `
        <li>
          <span>${escapeHtml(h.url)}</span>
          <span>${h.score} · Grade ${h.grade} · ${h.pagesCrawled || 1} page${(h.pagesCrawled || 1) === 1 ? "" : "s"} · ${new Date(h.scannedAt).toLocaleTimeString()}</span>
        </li>`
      )
      .join("");
  } catch (_) {
    /* history is a non-critical enhancement */
  }
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function statusCardClass(label, value) {
  return isBadStatus(label, value) ? "status-bad" : "";
}

function isBadStatus(label, value) {
  const text = String(value ?? "").trim().toLowerCase();
  const normalizedLabel = String(label ?? "").trim().toLowerCase();

  if (["missing", "weak", "not detected", "n/a", "none"].includes(text)) {
    return true;
  }

  if (normalizedLabel.includes("missing") && Number(value) > 0) return true;
  if (normalizedLabel.includes("cve") && Number(value) > 0) return true;
  if (normalizedLabel.includes("broken links") && parseLeadingNumber(value) > 0) return true;

  return false;
}

function parseLeadingNumber(value) {
  const match = String(value ?? "").match(/^\d+/);
  return match ? Number(match[0]) : 0;
}

function clampNumber(value, min, max, fallback) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}
