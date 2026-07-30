const SEVERITY = { GOOD: "good", WARNING: "warning", CRITICAL: "critical" };

// Point deductions per severity — tuneable weighting
const PENALTY = { [SEVERITY.CRITICAL]: 6, [SEVERITY.WARNING]: 2, [SEVERITY.GOOD]: 0 };

/**
 * Computes an overall score (0-100) from a flat list of issues, a per-category
 * breakdown, AND a full point-by-point ledger — a running-total table showing
 * exactly which findings cost how many points, in the order they were
 * evaluated. This is what makes the score explainable to a client rather than
 * a black-box number.
 */
function computeScore(allIssues) {
  let running = 100;
  const byCategory = {};
  const ledger = [];

  // Evaluate criticals first, then warnings, then goods — so the ledger reads
  // "biggest problems first" rather than in arbitrary check order.
  const order = { [SEVERITY.CRITICAL]: 0, [SEVERITY.WARNING]: 1, [SEVERITY.GOOD]: 2 };
  const sorted = [...allIssues].sort((a, b) => order[a.severity] - order[b.severity]);

  for (const item of sorted) {
    const penalty = PENALTY[item.severity] || 0;
    running -= penalty;

    ledger.push({
      id: item.id,
      category: item.category,
      severity: item.severity,
      message: item.message,
      penalty,
      runningTotal: Math.max(0, Math.round(running)),
    });

    if (!byCategory[item.category]) {
      byCategory[item.category] = { good: 0, warning: 0, critical: 0, pointsLost: 0 };
    }
    byCategory[item.category][item.severity]++;
    byCategory[item.category].pointsLost += penalty;
  }

  const score = Math.max(0, Math.min(100, Math.round(running)));

  let grade = "F";
  if (score >= 90) grade = "A";
  else if (score >= 75) grade = "B";
  else if (score >= 60) grade = "C";
  else if (score >= 40) grade = "D";

  const totalCritical = allIssues.filter((i) => i.severity === SEVERITY.CRITICAL).length;
  const totalWarning = allIssues.filter((i) => i.severity === SEVERITY.WARNING).length;
  const totalPointsLost = totalCritical * PENALTY.critical + totalWarning * PENALTY.warning;

  const summary = {
    startingScore: 100,
    totalCritical,
    totalWarning,
    criticalPenaltyEach: PENALTY.critical,
    warningPenaltyEach: PENALTY.warning,
    totalPointsLost,
    flooredAtZero: 100 - totalPointsLost < 0,
    finalScore: score,
  };

  return { score, grade, byCategory, ledger, summary };
}

module.exports = { computeScore, PENALTY };
