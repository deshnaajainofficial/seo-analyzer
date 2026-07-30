const axios = require("axios");

const SEVERITY = { GOOD: "good", WARNING: "warning", CRITICAL: "critical" };
const SECURITY_HEADERS = [
  {
    name: "content-security-policy",
    label: "Content-Security-Policy",
    severity: SEVERITY.WARNING,
    fix: "Add a restrictive Content-Security-Policy that only allows scripts, styles, images, and connections from trusted origins.",
  },
  {
    name: "x-frame-options",
    label: "X-Frame-Options",
    severity: SEVERITY.WARNING,
    fix: "Add X-Frame-Options: DENY or SAMEORIGIN, or use frame-ancestors in CSP.",
  },
  {
    name: "strict-transport-security",
    label: "Strict-Transport-Security",
    severity: SEVERITY.WARNING,
    fix: "After HTTPS is stable, add Strict-Transport-Security with a long max-age and includeSubDomains where appropriate.",
    httpsOnly: true,
  },
];

const LOCAL_LIBRARY_RULES = [
  { name: "jquery", maxSafeExclusive: "3.5.0", cve: "CVE-2020-11022 / CVE-2020-11023" },
  { name: "bootstrap", maxSafeExclusive: "3.4.1", cve: "CVE-2019-8331" },
  { name: "lodash", maxSafeExclusive: "4.17.21", cve: "CVE-2021-23337" },
  { name: "moment", maxSafeExclusive: "2.29.4", cve: "CVE-2022-24785" },
];

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

async function analyzeSecurity({ $, crawlData, browserAudit }) {
  const results = [];
  const securityWhy =
    "Security basics affect trust, compliance, and conversion. They also change client risk: exposed config files can leak secrets, weak headers allow browser-level attacks, and vulnerable front-end libraries can turn a brochure site into a practical exploit target.";

  results.push(...checkSecurityHeaders(crawlData, securityWhy));
  results.push(...checkMixedContent(crawlData.finalUrl, browserAudit, securityWhy));
  results.push(...(await checkExposedFiles(crawlData.origin, securityWhy)));

  const libraries = detectJsLibraries($);
  const vulnerabilities = await lookupLibraryVulnerabilities(libraries);
  results.push(...buildLibraryIssues(libraries, vulnerabilities, securityWhy));

  return {
    results,
    libraries,
    vulnerabilities,
    exposedFilesChecked: ["/.env", "/.git/config", "/.git/HEAD"],
    missingHeaders: SECURITY_HEADERS.filter((header) => {
      if (header.httpsOnly && !crawlData.finalUrl.startsWith("https://")) return false;
      return !crawlData.headers[String(header.name).toLowerCase()];
    }).map((header) => header.label),
  };
}

function checkSecurityHeaders(crawlData, securityWhy) {
  const headers = {};
  Object.entries(crawlData.headers || {}).forEach(([key, value]) => {
    headers[key.toLowerCase()] = value;
  });

  return SECURITY_HEADERS.map((header) => {
    if (header.httpsOnly && !crawlData.finalUrl.startsWith("https://")) {
      return issue(
        `security-header-${header.name}-skipped`,
        "Security",
        SEVERITY.WARNING,
        `${header.label} is not active because the page is not served over HTTPS.`,
        "Move the site to HTTPS first, then enable HSTS.",
        securityWhy,
        "HSTS is only valid over HTTPS",
        "HTTP response headers"
      );
    }

    return headers[header.name]
      ? issue(
          `security-header-${header.name}-ok`,
          "Security",
          SEVERITY.GOOD,
          `${header.label} header is present.`,
          null,
          securityWhy,
          `${header.label}: ${headers[header.name]}`,
          "HTTP response headers"
        )
      : issue(
          `security-header-${header.name}-missing`,
          "Security",
          header.severity,
          `${header.label} header is missing.`,
          header.fix,
          securityWhy,
          `${header.label} not found in response headers`,
          "HTTP response headers"
        );
  });
}

function checkMixedContent(finalUrl, browserAudit, securityWhy) {
  if (!String(finalUrl).startsWith("https://")) return [];
  const resources = browserAudit && browserAudit.resources ? browserAudit.resources : [];
  const mixed = resources.filter((resource) => String(resource.url).startsWith("http://")).slice(0, 12);

  if (mixed.length === 0) {
    return [
      issue(
        "security-mixed-content-ok",
        "Security",
        SEVERITY.GOOD,
        "No HTTP resources were detected on the HTTPS page.",
        null,
        securityWhy,
        `${resources.length} browser resource request(s) inspected`,
        "Rendered page resources"
      ),
    ];
  }

  return [
    issue(
      "security-mixed-content",
      "Security",
      SEVERITY.CRITICAL,
      `${mixed.length} HTTP resource${mixed.length === 1 ? "" : "s"} detected on an HTTPS page.`,
      "Load every image, script, stylesheet, font, and API request over HTTPS.",
      securityWhy,
      mixed.map((resource) => `${resource.type}: ${resource.url}`).join(" | "),
      "Rendered page resources"
    ),
  ];
}

async function checkExposedFiles(origin, securityWhy) {
  const targets = [
    { path: "/.env", marker: /DB_|API_|SECRET|TOKEN|PASSWORD|PRIVATE/i },
    { path: "/.git/config", marker: /\[core\]|\[remote /i },
    { path: "/.git/HEAD", marker: /ref:\s*refs\/heads/i },
  ];

  const checks = await Promise.all(
    targets.map(async (target) => {
      const url = `${origin}${target.path}`;
      try {
        const res = await axios.get(url, {
          timeout: 5000,
          validateStatus: () => true,
          maxContentLength: 80_000,
        });
        const body = typeof res.data === "string" ? res.data : JSON.stringify(res.data || "");
        const exposed = res.status === 200 && target.marker.test(body);
        return { ...target, url, status: res.status, exposed };
      } catch (_) {
        return { ...target, url, status: null, exposed: false };
      }
    })
  );

  const exposed = checks.filter((check) => check.exposed);
  if (exposed.length > 0) {
    return [
      issue(
        "security-exposed-sensitive-files",
        "Security",
        SEVERITY.CRITICAL,
        `${exposed.length} sensitive file endpoint${exposed.length === 1 ? "" : "s"} appear publicly exposed.`,
        "Block dotfiles at the web server/CDN layer immediately and rotate any secrets that may have been exposed.",
        securityWhy,
        exposed.map((check) => `${check.status} ${check.url}`).join(" | "),
        "Domain root"
      ),
    ];
  }

  return [
    issue(
      "security-sensitive-files-ok",
      "Security",
      SEVERITY.GOOD,
      "Common sensitive files were not publicly exposed.",
      null,
      securityWhy,
      checks.map((check) => `${check.status || "no response"} ${check.path}`).join(" | "),
      "Domain root"
    ),
  ];
}

function detectJsLibraries($) {
  const libraries = [];
  $("script[src]").each((_, el) => {
    const src = $(el).attr("src") || "";
    const detected = detectLibraryFromUrl(src);
    if (detected) libraries.push(detected);
  });

  const unique = new Map();
  libraries.forEach((library) => {
    const key = `${library.name}@${library.version || "unknown"}`;
    if (!unique.has(key)) unique.set(key, library);
  });
  return Array.from(unique.values());
}

function detectLibraryFromUrl(src) {
  const lower = src.toLowerCase();
  const packages = ["jquery", "lodash", "bootstrap", "moment", "axios", "react", "vue", "angular"];
  const name = packages.find((pkg) => lower.includes(pkg));
  if (!name) return null;

  const versionMatch =
    lower.match(new RegExp(`${name}[@/\\.-]v?(\\d+\\.\\d+\\.\\d+)`)) ||
    lower.match(/[@/.-]v?(\d+\.\d+\.\d+)(?:\.min)?\.js/) ||
    lower.match(/[?&]v=(\d+\.\d+\.\d+)/);

  return {
    name,
    version: versionMatch ? versionMatch[1] : null,
    src,
  };
}

async function lookupLibraryVulnerabilities(libraries) {
  const withVersions = libraries.filter((library) => library.version);
  if (withVersions.length === 0) return [];

  try {
    const res = await axios.post(
      "https://api.osv.dev/v1/querybatch",
      {
        queries: withVersions.map((library) => ({
          package: { name: library.name, ecosystem: "npm" },
          version: library.version,
        })),
      },
      { timeout: 10000 }
    );

    return withVersions.flatMap((library, index) => {
      const vulns = res.data.results?.[index]?.vulns || [];
      return vulns.map((vuln) => ({
        library,
        id: vuln.id,
        summary: vuln.summary || "Known vulnerability",
      }));
    });
  } catch (_) {
    return withVersions.flatMap((library) => {
      const rule = LOCAL_LIBRARY_RULES.find((item) => item.name === library.name);
      if (!rule || compareVersions(library.version, rule.maxSafeExclusive) >= 0) return [];
      return [{ library, id: rule.cve, summary: `${library.name} versions before ${rule.maxSafeExclusive} have known vulnerabilities.` }];
    });
  }
}

function buildLibraryIssues(libraries, vulnerabilities, securityWhy) {
  if (vulnerabilities.length > 0) {
    return [
      issue(
        "security-js-vulnerabilities",
        "Security",
        SEVERITY.CRITICAL,
        `${vulnerabilities.length} known JavaScript library vulnerabilit${vulnerabilities.length === 1 ? "y" : "ies"} detected.`,
        "Upgrade vulnerable libraries and remove unused third-party scripts.",
        securityWhy,
        vulnerabilities
          .slice(0, 8)
          .map((vuln) => `${vuln.library.name}@${vuln.library.version}: ${vuln.id} ${vuln.summary}`)
          .join(" | "),
        "Script tags"
      ),
    ];
  }

  if (libraries.length === 0) {
    return [
      issue(
        "security-js-libraries-none",
        "Security",
        SEVERITY.GOOD,
        "No recognizable third-party JavaScript libraries were detected in script URLs.",
        null,
        securityWhy,
        "0 known library names found in script src attributes",
        "Script tags"
      ),
    ];
  }

  return [
    issue(
      "security-js-libraries-ok",
      "Security",
      SEVERITY.GOOD,
      "No known vulnerabilities were found for detected JavaScript library versions.",
      null,
      securityWhy,
      libraries.map((library) => `${library.name}@${library.version || "unknown"}`).join(" | "),
      "Script tags"
    ),
  ];
}

function compareVersions(a, b) {
  const left = String(a).split(".").map((part) => Number.parseInt(part, 10) || 0);
  const right = String(b).split(".").map((part) => Number.parseInt(part, 10) || 0);
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    if ((left[i] || 0) > (right[i] || 0)) return 1;
    if ((left[i] || 0) < (right[i] || 0)) return -1;
  }
  return 0;
}

module.exports = { analyzeSecurity };
