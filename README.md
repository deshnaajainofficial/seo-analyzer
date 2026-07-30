# Auditline — Automated SEO & Technical Site Audit Tool

A full-stack tool that crawls a webpage and generates an automated audit report covering
on-page SEO, technical SEO, content quality, and internal link health — built to speed up
the manual checks typically done before a client landing page goes live.

## Features

- **On-page SEO checks**: title tag, meta description, H1 usage, heading hierarchy, image alt text
- **Technical SEO checks**: HTTPS, viewport/mobile-friendliness, canonical tag, robots.txt,
  sitemap.xml, page load time, structured data (JSON-LD)
- **Content analysis**: word count, practical readability score, and section depth
- **Link health**: samples internal links and flags broken ones
- **Every finding explains itself**: each check reports the raw evidence found (e.g. the actual
  `<title>` text or `<meta viewport>` tag), a "why it matters" explanation of the underlying
  mechanism (what a crawler/browser does with that signal and why it affects rankings or users),
  a concrete fix, and — for on-page issues — the **exact location** on the page (which section,
  which specific image/heading, nearby text) so a client can find the problem without guessing
- **Full score breakdown ledger**: not just a number — a running-total table showing every
  point deducted, which check caused it, and why, so a client can see exactly how "72/100" was
  derived rather than taking it on faith
- **"Fix these, get this score" simulator**: reuses the exact deduction ledger to show projected
  score lift if the top 3, 5, or 10 highest-impact issues are fixed, e.g. "fix these 5 items to
  move from 34 to 78"
- **Effort-vs-impact action plan**: tags findings with rough implementation effort and separates
  the report into **Quick Wins** and **Bigger Projects**, turning the audit into a prioritized
  proposal a business client can act on
- **Design & engagement audit (new category)**: analyzes colors and fonts from **both inline
  styles and up to 6 linked external stylesheets** (the norm for real client sites), computes
  a WCAG contrast ratio between the detected primary color and background, checks for a clear
  above-the-fold call-to-action, and flags "wall of text" paragraphs — then shows the **top 4
  colors actually used most often** across the rendered page/styles with usage counts
- **Section-by-section content analysis**: splits the page at its own H2 headings and reports
  word count per section, naming the specific weak section by its actual heading text
- **Scoring engine**: weighted 0–100 score with letter grade (A–F) and per-category breakdown
- **Keyword intelligence**: optional target keyword input checks placement in the title, H1,
  first paragraph, and visible-text density. If a client provides a connected Google Search
  Console property plus an OAuth access token, the report adds live clicks, impressions, CTR,
  and average position for matching queries.
- **Security basics**: checks exposed `/.env` and `/.git/*` files, missing security headers
  (`Content-Security-Policy`, `X-Frame-Options`, `Strict-Transport-Security`), mixed HTTP
  resources on HTTPS pages, and known vulnerable JavaScript library versions via OSV with a
  local fallback for common libraries.
- **Local trust & NAP checks**: for local-business clients, detects visible phone/address
  presence, checks NAP consistency across crawled pages, reviews LocalBusiness schema
  completeness, and flags conversion trust signals such as testimonials/reviews, visible contact
  info, SSL badge language, and privacy policy links.
- **AI-powered client strategy**: enter an AI API key to generate a plain-English executive summary,
  rewritten copy suggestions, tone/audience analysis, competitor comparison from up to 3 competitor
  URLs, recommended next steps, and Q&A answers grounded in the report. For custom OpenAI-compatible
  APIs, enter the provider's base URL and model in the AI panel.
- **Dashboard UI**: URL input, animated score gauge, a live scan log (console-style, shows each
  crawl/check step as it runs), category breakdown, score breakdown ledger, most-used color
  swatches, keyword/security/local trust intelligence sections, score-lift simulator, action
  plan, filterable findings list with location/evidence/rationale, a methodology reference panel,
  and recent scan history
- **PDF export**: one-click "Download PDF" button generates a client-ready audit report — score
  summary, the full deduction ledger, metrics, category breakdown, most-used color swatches
  (rendered as actual color swatches), every finding with its exact location/evidence/rationale/
  fix, and a methodology appendix — using `pdfkit`, no headless browser required

## Tech Stack

- **Backend**: Node.js, Express, Axios (crawling), Cheerio (HTML parsing)
- **Browser rendering**: Playwright headless Chromium for JavaScript-rendered pages, screenshots,
  rendered DOM, resource collection, and Web Vitals-style measurements
- **Frontend**: Vanilla HTML/CSS/JS (no build step required)
- **Reports**: PDFKit for downloadable client reports
- **Optional APIs**: Google Search Console, OpenAI-compatible LLM APIs, OSV vulnerability data
- **Storage**: In-memory scan history (swap in MongoDB/PostgreSQL for production use)

## Project Structure

```
seo-analyzer/
├── server.js              # Express app entry point
├── routes/
│   └── analyze.js         # /api/analyze and /api/history endpoints
├── lib/
│   ├── crawler.js         # Fetches page HTML, robots.txt, sitemap.xml
│   ├── checks.js          # On-page, technical, content checks (with exact locations)
│   ├── location.js        # Finds exact on-page location of an issue (section, snippet)
│   ├── designAnalysis.js  # Color/typography/CTA/density audit + top color extraction
│   ├── colorTheory.js     # Hex/HSL conversion and WCAG contrast ratio helpers
│   ├── scorer.js          # Weighted scoring + full point-by-point deduction ledger
│   ├── actionPlan.js      # Score simulator + effort-vs-impact proposal planner
│   └── pdfReport.js       # Generates the downloadable PDF audit report
└── public/
    ├── index.html         # Dashboard markup
    ├── style.css           # Design tokens + styling
    └── script.js            # Fetch calls, gauge animation, rendering
```

## Setup (quick version)

```bash
npm install
npm start
```

Then open **http://localhost:3000** in your browser and enter a URL to scan.

## One-Click Run

- **Mac**: double-click `Run SEO Analyzer.command`
- **Windows**: double-click `Run SEO Analyzer.bat`

The launcher installs missing dependencies, installs Playwright Chromium if needed, opens the browser, and starts the server. See `RUN_APP.md` for details.

## Setup in VS Code (step by step)

**1. Prerequisites**
- Install [Node.js](https://nodejs.org) (LTS version, 18+). Verify it's installed:
  ```bash
  node -v
  npm -v
  ```
- Install [VS Code](https://code.visualstudio.com) if you don't have it already.

**2. Unzip and open the project**
- Unzip `seo-analyzer.zip` anywhere on your machine.
- Open VS Code → `File > Open Folder…` → select the unzipped `seo-analyzer` folder.

**3. Open the integrated terminal**
- Menu: `Terminal > New Terminal` (or `` Ctrl+` ``).
- Confirm you're in the project root — you should see `package.json` when you run `ls` (Mac/Linux) or `dir` (Windows).

**4. Install dependencies**
```bash
npm install
```
This downloads `express`, `axios`, `cheerio`, `cors`, and `pdfkit` into a `node_modules` folder (not included in the zip, since it's regenerated locally).

**5. Run the server**
```bash
npm start
```
You should see:
```
SEO Analyzer running at http://localhost:3000
```

**6. Open the app**
- Open your browser to **http://localhost:3000**.
- Or, in VS Code, hold `Ctrl` (Windows/Linux) / `Cmd` (Mac) and click the `localhost:3000` link if it appears in the terminal output.

**7. Try it out**
- Enter any public URL (e.g. `https://example.com`) and click **Run Audit**.
- After the scan completes, click **↓ Download PDF** to export the report.

**8. Stopping the server**
- Back in the terminal, press `Ctrl + C`.

**Recommended VS Code extensions (optional, for editing):**
- *Prettier* — consistent code formatting
- *ESLint* — catches JS errors as you type
- *Live Server* is **not** needed here — the app already runs its own Express server.

**Common issues**
| Problem | Fix |
|---|---|
| `EADDRINUSE: address already in use :::3000` | Another process is using port 3000. Stop it, or change `const PORT = process.env.PORT \|\| 3000;` in `server.js` to another port like `3001`. |
| `npm install` fails with permission errors | Avoid `sudo npm install`; instead fix npm's default directory permissions, or use `nvm` to manage Node versions. |
| Scan fails for a specific site | Some sites block automated requests (bot protection) or require JavaScript rendering — this tool reads static HTML only, so heavily JS-rendered sites (pure SPAs) may show incomplete results. |

## How Scoring Works

Every check returns an issue with a severity: `good`, `warning`, or `critical`.
The scorer starts at 100 points and deducts:

| Severity | Penalty |
|----------|---------|
| Critical | -6      |
| Warning  | -2      |
| Good     | 0       |

Final score maps to a grade: **A** (90+), **B** (75+), **C** (60+), **D** (40+), **F** (below 40).

## Known Limitations (worth mentioning to clients transparently)

- **Color/font detection** now scans inline styles, `<style>` blocks, and up to 6 linked
  external stylesheets — but sites that set colors via a CSS framework's utility classes
  (e.g. Tailwind's `bg-blue-500`) rather than raw hex/rgb values won't be picked up, since
  there's no hex value in the markup or CSS to extract. The tool flags this explicitly when
  it happens rather than silently reporting zero colors as if that were meaningful.
- **Contrast ratio** is estimated from the two most common detected colors, not the actual
  computed foreground/background pairing of specific rendered text — treat it as a signal to
  investigate further with a real contrast checker (e.g. browser DevTools), not a certified
  WCAG audit result.
- **Single-page scans only** — each scan audits one URL at a time. For a multi-page client
  site, run one scan per key page (home, services, contact) and combine the PDFs for the
  client deliverable.
- **Static HTML only** — pages that render their content client-side via JavaScript (heavy
  single-page apps) will show incomplete results, since the crawler reads the initial HTML
  response rather than executing JavaScript like a browser would.

## Possible Extensions (Future Scope)

- Google PageSpeed Insights API integration for real Core Web Vitals
- Multi-page crawl with duplicate-content detection and a combined client-wide summary
- Persistent storage (MongoDB/PostgreSQL) with historical trend charts
- Scheduled recurring scans with email alerts
- AI-generated content/copy suggestions for flagged issues
- Headless-browser rendering (Puppeteer/Playwright) to support JS-rendered pages and get
  real computed-style colors instead of parsing raw CSS text

## Notes for the Internship Report

This tool maps well onto a landing-page/web-development internship: it automates the
manual pre-launch QA checklist (SEO tags, performance, mobile-readiness, broken links)
that agencies typically run for every client site before handoff. Suggested chapter mapping:

- **Ch 1 (Introduction)**: Problem statement — manual audits are slow and inconsistent;
  objective — automate them with a scoring engine
- **Ch 2 (Literature Review)**: Existing tools (SEMrush, Ahrefs, Google Lighthouse) and gaps
- **Ch 3 (System Design)**: Architecture diagram (Crawler → Checks → Scorer → Dashboard),
  tech stack justification, data flow diagram
- **Ch 4 (Implementation)**: Module-wise breakdown with code snippets and dashboard screenshots
- **Ch 5 (Conclusion)**: Results from scanning real client sites, limitations, future scope
