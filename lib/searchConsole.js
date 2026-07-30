const axios = require("axios");

const SEARCH_ANALYTICS_ENDPOINT = "https://www.googleapis.com/webmasters/v3/sites";

async function fetchSearchConsolePerformance({
  accessToken,
  propertyUrl,
  pageUrl,
  targetKeyword,
  startDate,
  endDate,
}) {
  if (!accessToken || !propertyUrl) return null;

  const range = defaultDateRange();
  const body = {
    startDate: startDate || range.startDate,
    endDate: endDate || range.endDate,
    dimensions: ["query", "page"],
    rowLimit: 25,
    type: "web",
    dimensionFilterGroups: [
      {
        groupType: "and",
        filters: [
          {
            dimension: "page",
            operator: "equals",
            expression: pageUrl,
          },
        ],
      },
    ],
  };

  if (targetKeyword) {
    body.dimensionFilterGroups[0].filters.push({
      dimension: "query",
      operator: "contains",
      expression: targetKeyword,
    });
  }

  try {
    const url = `${SEARCH_ANALYTICS_ENDPOINT}/${encodeURIComponent(propertyUrl)}/searchAnalytics/query`;
    const res = await axios.post(url, body, {
      timeout: 12000,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    });

    const rows = Array.isArray(res.data.rows)
      ? res.data.rows.map((row) => ({
          query: row.keys?.[0] || "",
          page: row.keys?.[1] || "",
          clicks: row.clicks || 0,
          impressions: row.impressions || 0,
          ctr: row.ctr || 0,
          position: row.position || 0,
        }))
      : [];

    const totals = rows.reduce(
      (sum, row) => {
        sum.clicks += row.clicks;
        sum.impressions += row.impressions;
        sum.weightedPosition += row.position * Math.max(1, row.impressions);
        return sum;
      },
      { clicks: 0, impressions: 0, weightedPosition: 0 }
    );

    return {
      available: true,
      propertyUrl,
      pageUrl,
      startDate: body.startDate,
      endDate: body.endDate,
      rows,
      summary: {
        clicks: Math.round(totals.clicks),
        impressions: Math.round(totals.impressions),
        ctr: totals.impressions > 0 ? totals.clicks / totals.impressions : 0,
        position: totals.impressions > 0 ? totals.weightedPosition / totals.impressions : 0,
      },
    };
  } catch (err) {
    return {
      available: false,
      propertyUrl,
      pageUrl,
      error: err.response?.data?.error?.message || err.message,
      rows: [],
      summary: { clicks: 0, impressions: 0, ctr: 0, position: 0 },
    };
  }
}

function defaultDateRange() {
  const end = new Date();
  end.setUTCDate(end.getUTCDate() - 2);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 28);
  return {
    startDate: formatDate(start),
    endDate: formatDate(end),
  };
}

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

module.exports = { fetchSearchConsolePerformance };
