const { PENALTY } = require("./scorer");

const EFFORT = {
  quick: { key: "quick", label: "Quick win", score: 1 },
  medium: { key: "medium", label: "Moderate task", score: 2 },
  project: { key: "project", label: "Bigger project", score: 3 },
};

const QUICK_PATTERNS = [
  /title/i,
  /meta/i,
  /keyword/i,
  /first-paragraph/i,
  /density/i,
  /canonical/i,
  /viewport/i,
  /alt/i,
  /privacy/i,
  /contact/i,
  /phone/i,
  /address/i,
  /testimonial/i,
  /review/i,
  /robots/i,
  /sitemap/i,
];

const PROJECT_PATTERNS = [
  /cwv/i,
  /lcp/i,
  /inp/i,
  /cls/i,
  /load/i,
  /performance/i,
  /vulnerab/i,
  /exposed/i,
  /mixed-content/i,
  /thin-content/i,
  /readability/i,
  /color/i,
  /contrast/i,
  /font/i,
  /site-/i,
  /orphan/i,
  /duplicate-title/i,
  /heading-inconsistent/i,
];

function buildActionPlan(issues, currentScore) {
  const actionable = (issues || [])
    .filter((item) => item.severity !== "good")
    .map(enrichIssue)
    .sort(sortByPriority);

  const scenarios = [3, 5, 10]
    .filter((count) => actionable.length >= count || count === 3)
    .map((count) => buildScenario(actionable, currentScore, count))
    .filter(Boolean);

  const quickWins = actionable
    .filter((item) => item.effort.key === "quick")
    .slice(0, 10);

  const biggerProjects = actionable
    .filter((item) => item.effort.key !== "quick")
    .slice(0, 10);

  return {
    explanation:
      "Prioritizes findings by recoverable score impact and estimated implementation effort so the audit can become a client-ready action plan.",
    currentScore,
    totalRecoverablePoints: actionable.reduce((sum, item) => sum + item.points, 0),
    scoreSimulator: {
      explanation:
        "Shows the projected score if the highest-impact unresolved findings are fixed. The math reuses the same deduction ledger as the main score.",
      scenarios,
    },
    quickWins,
    biggerProjects,
  };
}

function enrichIssue(issue) {
  const effort = classifyEffort(issue);
  return {
    id: issue.id,
    category: issue.category,
    severity: issue.severity,
    message: issue.message,
    recommendation: issue.recommendation || defaultRecommendation(issue),
    points: PENALTY[issue.severity] || 0,
    effort,
  };
}

function classifyEffort(issue) {
  const haystack = `${issue.id || ""} ${issue.category || ""} ${issue.message || ""} ${issue.recommendation || ""}`;

  if (PROJECT_PATTERNS.some((pattern) => pattern.test(haystack))) {
    return EFFORT.project;
  }

  if (QUICK_PATTERNS.some((pattern) => pattern.test(haystack))) {
    return EFFORT.quick;
  }

  if (issue.category === "Security" || issue.category === "Local Trust") {
    return EFFORT.medium;
  }

  return issue.severity === "critical" ? EFFORT.medium : EFFORT.quick;
}

function buildScenario(actionable, currentScore, count) {
  const fixedIssues = actionable.slice(0, count);
  if (fixedIssues.length === 0) return null;

  const recovered = fixedIssues.reduce((sum, item) => sum + item.points, 0);
  const toScore = Math.min(100, currentScore + recovered);

  return {
    count: fixedIssues.length,
    fromScore: currentScore,
    toScore,
    lift: toScore - currentScore,
    fixedIssues,
  };
}

function sortByPriority(a, b) {
  if (b.points !== a.points) return b.points - a.points;
  if (a.effort.score !== b.effort.score) return a.effort.score - b.effort.score;
  return String(a.category).localeCompare(String(b.category));
}

function defaultRecommendation(issue) {
  return `Resolve this ${issue.category || "audit"} finding and rerun the scan to confirm the score recovery.`;
}

module.exports = { buildActionPlan };
