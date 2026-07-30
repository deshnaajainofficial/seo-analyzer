# Auditline Project Overview

## 1. Project Name

**Auditline — Automated SEO, Website Quality, and Security Audit Tool**

Auditline is a full-stack web application built for businesses, agencies, freelancers, and website owners who want to inspect a website before launch, during maintenance, or before pitching improvement work to a client.

The software scans a website URL, renders the page in a real browser, checks SEO and technical quality, analyzes content and design, finds internal link problems, reviews security basics, evaluates target keyword placement, optionally pulls Google Search Console performance data, and generates a client-ready PDF report.

## 2. Problem It Solves

Most businesses have websites, but many of those websites have hidden problems that directly affect traffic, trust, conversions, and client confidence. Common issues include missing title tags, weak headings, broken links, slow rendering, poor contrast, missing security headers, exposed sensitive files, thin content, and pages that do not properly target the keywords the business wants to rank for.

Normally, checking these issues requires multiple tools:

- SEO checklist tools
- Browser DevTools
- Broken-link checkers
- Accessibility/color contrast checkers
- Google Search Console
- Security-header checkers
- PDF/report creation tools

Auditline brings many of these checks into one dashboard and produces a clear report that a business owner or client can understand.

## 3. Who This Software Is For

Auditline is designed for:

- **Small businesses** that want to know whether their website is SEO-ready.
- **Digital marketing agencies** that audit client websites before proposing services.
- **Freelance web developers** who want a quality-control checklist before handing off a website.
- **SEO consultants** who need fast technical and content reports.
- **Website maintenance teams** that want to catch broken links, missing metadata, and basic security issues.
- **Students/project evaluators** who need a practical full-stack web application with real-world business use.

## 4. Main Uses

Auditline can be used for:

- Pre-launch website audits
- Client website audits before sending a proposal
- SEO health checks for landing pages
- Multi-page site quality reviews
- Keyword optimization checks
- Internal link and broken-link discovery
- Security basics scanning
- Local-business NAP and trust signal checks
- AI-powered client explanations and recommendations
- Design consistency checks
- Content quality analysis
- Client-ready PDF report generation
- Comparing multiple pages across the same website
- Finding quick wins for business website improvement

## 5. What The Software Does

When a user enters a URL, Auditline performs these major actions:

1. Normalizes the URL.
2. Fetches the page with Axios.
3. Opens the page in headless Chromium using Playwright.
4. Waits for JavaScript-rendered content and network activity.
5. Captures the rendered HTML.
6. Captures a screenshot of the rendered page.
7. Observes Core Web Vitals-style browser metrics.
8. Parses the rendered DOM with Cheerio.
9. Runs SEO, technical, content, design, keyword, security, and link checks.
10. Optionally crawls internal links up to a page/depth limit.
11. Computes a weighted score and grade.
12. Builds a full issue ledger explaining every deduction.
13. Shows results in the dashboard.
14. Stores the report temporarily in memory.
15. Generates a downloadable PDF report.
16. Optionally sends report data to an LLM API to generate plain-English strategy notes and answer report questions.

## 6. Feature List

### 6.1 Real Browser Rendering

Auditline uses Playwright with headless Chromium to load the website like a real browser.

This allows the tool to inspect:

- JavaScript-rendered pages
- React/Vue/Angular-style rendered HTML
- Actual rendered screenshots
- Render-time metrics
- Computed CSS styles
- Browser resource requests
- Mixed-content resources

This is a major improvement over static HTML-only analyzers because many modern websites render important content after JavaScript loads.

### 6.2 On-Page SEO Checks

Auditline checks the most important on-page SEO elements:

- Title tag exists
- Title length is within a recommended range
- Meta description exists
- Meta description length is reasonable
- Exactly one H1 exists
- Heading hierarchy does not skip levels
- Images have alt text

Each finding includes:

- Severity
- Message
- Evidence
- Exact page location where possible
- Why it matters
- Recommended fix

### 6.3 Technical SEO Checks

Technical SEO checks include:

- HTTPS usage
- Mobile viewport meta tag
- Canonical tag
- robots.txt availability
- sitemap.xml availability
- Page response/render time
- Structured data via JSON-LD
- Browser rendering success
- Core Web Vitals-style lab checks:
  - Largest Contentful Paint
  - Cumulative Layout Shift
  - Interaction to Next Paint when observable

### 6.4 Content Quality Checks

Auditline analyzes visible page text and reports:

- Total word count
- Thin content warnings
- Section-by-section word count using H2 sections
- Weak/thin sections
- Practical readability score
- Sentence length, word length, long-word density, paragraph length, and Flesch evidence

This helps identify whether a page has enough useful content for users and search engines.

### 6.5 Keyword Intelligence

The user can enter a target keyword.

Auditline then checks:

- Whether the keyword appears in the title tag
- Whether the keyword appears in the H1
- Whether the keyword appears in the first paragraph
- Keyword occurrences in visible text
- Keyword density percentage
- Whether the keyword is missing, underused, or overused

This helps businesses understand whether a page is clearly targeting the search term they want to rank for.

### 6.6 Fix Impact Simulator And Action Plan

Auditline converts the deduction ledger into a proposal-style remediation plan.

It provides:

- A "fix top 3 / top 5 / top 10" score simulator
- Before and after score projections
- Recoverable points for each issue
- Rough implementation effort tags
- Quick Wins for simple metadata, keyword, contact, schema, and trust fixes
- Bigger Projects for performance, security, template, content-depth, and site architecture work

This helps agencies tell a business client what to fix first and what score improvement to expect.

### 6.7 Google Search Console Integration

Auditline supports optional Google Search Console data.

If a client provides:

- Search Console property URL
- OAuth access token with `webmasters.readonly` scope
- Optional start and end dates

Then Auditline can fetch real search performance data:

- Clicks
- Impressions
- CTR
- Average position
- Matching query rows

This turns the report from a static best-practice audit into a real search-performance audit.

Important: OAuth tokens are used only for the request and are not stored in the saved report history.

### 6.8 Link Health Checks

Auditline extracts internal links from the page and checks a sample using HTTP HEAD requests.

It reports:

- Number of internal links found
- Sampled internal links
- Broken internal links
- HTTP status codes
- Source pages for broken links during site crawls

Broken internal links are flagged because they harm user experience, waste crawl budget, and make a website look poorly maintained.

### 6.9 Multi-Page Whole-Site Audits

Auditline can crawl beyond one URL.

The user can choose:

- Maximum number of pages
- Maximum crawl depth

The crawler follows internal links and builds a site-level report.

Site-wide checks include:

- Duplicate title tags across crawled pages
- Orphan pages inside the sampled crawl
- Inconsistent heading structure across templates
- Sitewide broken-link map
- One score per crawled page
- Average page score
- Sitewide architecture score
- Overall site health score

This makes the tool useful for business websites with multiple pages, not just one landing page.

### 6.10 Design And Engagement Checks

Auditline checks design basics that affect trust and usability:

- Color palette extraction
- Computed browser colors when available
- Primary color detection
- Top 4 most-used actual colors with usage counts
- Font-family consistency
- CTA detection
- CTA placement
- Long paragraph/wall-of-text detection
- Rendered text contrast checks

The tool reports the colors that are genuinely present most often instead of generating a synthetic palette.

### 6.11 Security Basics

Auditline checks common website security issues:

- Publicly exposed `/.env`
- Publicly exposed `/.git/config`
- Publicly exposed `/.git/HEAD`
- Missing `Content-Security-Policy`
- Missing `X-Frame-Options`
- Missing `Strict-Transport-Security`
- HTTP resources loaded on HTTPS pages
- Known vulnerable JavaScript library versions

JavaScript library checks use the OSV vulnerability API when available, with local fallback rules for common libraries such as jQuery, Bootstrap, Lodash, and Moment.

### 6.12 Local Trust And NAP Checks

Auditline includes a local-business trust layer for service businesses, stores, clinics, restaurants, agencies, and other websites where visitors need to contact or trust the business before converting.

NAP means:

- Name
- Address
- Phone number

Auditline checks:

- Visible phone number presence
- Visible street-address-like text
- NAP consistency across crawled pages
- LocalBusiness schema presence
- LocalBusiness schema completeness
- Testimonials/review signal presence
- Review or AggregateRating schema
- Contact information visibility
- SSL/security badge language
- Privacy policy link presence

These checks are useful because local-business clients often lose leads when visitors cannot quickly find a phone number, address, contact path, privacy policy, or trust proof. These signals are also useful in local SEO because consistent business details help connect the website to the same real-world business entity across citations and local search systems.

### 6.13 Scoring System

Every finding has a severity:

- `good`
- `warning`
- `critical`

The score starts at 100 points.

Point deductions:

| Severity | Deduction |
|---|---:|
| Critical | -6 |
| Warning | -2 |
| Good | 0 |

Grades:

| Score | Grade |
|---:|---|
| 90-100 | A |
| 75-89 | B |
| 60-74 | C |
| 40-59 | D |
| 0-39 | F |

The report includes a score ledger showing exactly which finding caused each deduction.

### 6.14 AI-Powered Client Strategy

Auditline includes an optional AI layer for turning technical audit findings into client-friendly strategy.

When the user clicks **Generate AI Analysis**, the software can send a compact version of the generated report to an LLM API and produce:

- Plain-English executive summary
- Key strengths
- Biggest risks
- Rewritten meta title
- Rewritten meta description
- Suggested hero headline
- Suggested intro paragraph
- Suggested primary CTA
- Sentiment and tone analysis
- Copy/audience fit analysis
- Competitor comparison using up to 3 competitor URLs
- Recommended next steps
- Questions to ask the client

The AI panel also includes a Q&A feature. A user can ask questions such as:

- "What should this client fix first?"
- "Explain this report in simple language."
- "Why is the score low?"
- "What should I tell the business owner?"
- "How does this site compare to competitors?"

The answer is grounded in the generated audit report rather than general advice.

The AI panel asks for an API key, optional model, and optional custom base URL. If no base URL is entered, Auditline auto-selects a built-in compatible endpoint where possible. If a base URL is entered, Auditline treats it as an OpenAI-compatible Chat Completions API. The key can be supplied as a one-time dashboard key or configured through server environment variables. The key is not saved in report history.

### 6.15 PDF Report Export

Auditline generates downloadable PDF reports using PDFKit.

The PDF includes:

- Target URL
- Scan time
- Overall score and grade
- Site health summary when multi-page mode is used
- Key metrics
- Keyword intelligence summary
- Security summary
- Local trust and NAP summary
- AI strategy summary when generated
- Rendered screenshot
- Category breakdown
- Score calculation ledger
- Top 4 most-used color swatches
- Full findings list
- Why each issue matters
- Fix recommendations
- Methodology section

This is useful for agencies and freelancers who want to send a professional report to a business client.

## 7. Dashboard Features

The frontend dashboard includes:

- URL input
- Target keyword input
- Page limit input
- Depth limit input
- Optional Search Console fields
- Live scan log
- Animated score gauge
- Key metrics cards
- Category breakdown cards
- Keyword intelligence panel
- Security basics panel
- Local Trust & NAP panel
- AI Client Strategist panel
- Site health panel
- Rendered page screenshot
- Fix impact simulator
- Effort-vs-impact action plan
- Score ledger table
- Most-used color swatches
- Filterable findings list
- Recent scan history
- PDF download button

## 8. How The System Works Internally

### 8.1 Request Flow

1. User submits a URL from the dashboard.
2. Frontend sends a `POST /api/analyze` request.
3. Backend validates URL and options.
4. Backend fetches the page using Axios.
5. Backend renders the page using Playwright.
6. Rendered HTML is loaded into Cheerio.
7. Audit modules run independently.
8. Findings are combined into one issue list.
9. Scoring engine calculates score, grade, category counts, and ledger.
10. Report is returned as JSON.
11. Dashboard renders the report.
12. User can generate optional AI insights from `/api/report/:id/ai`.
13. User can ask AI questions about the report through `/api/report/:id/ai/chat`.
14. User can download the PDF from `/api/report/:id/pdf`.

### 8.2 Multi-Page Flow

1. First page is audited normally.
2. Internal links and sitemap URLs are collected.
3. URLs are normalized and queued.
4. The crawler follows same-origin links only.
5. Crawl stops at the selected max page count or depth.
6. Each page gets its own score.
7. Sitewide issues are calculated from all crawled pages.
8. Overall site score blends average page score and sitewide score.

### 8.3 Search Console Flow

1. User provides target keyword, property URL, and access token.
2. Backend sends request to Google Search Console Search Analytics API.
3. Results are grouped by query and page.
4. Report shows clicks, impressions, CTR, and average ranking position.
5. Token is not stored in report history.

### 8.4 AI Flow

1. A normal audit report is generated first.
2. User clicks **Generate AI Analysis**.
3. Optional target audience and competitor URLs are sent to the backend.
4. Competitor URLs are scanned using the same audit engine.
5. Backend builds a compact report context.
6. Backend calls the LLM API through the Responses API.
7. AI returns structured strategy notes.
8. Dashboard renders the AI summary and copy suggestions.
9. User can ask follow-up questions grounded in the report.

## 9. Tech Stack

### Backend

- **Node.js**: JavaScript runtime used for the server.
- **Express.js**: Web framework used for API routes and static file serving.
- **Axios**: Used to fetch pages, robots.txt, sitemap.xml, security files, OSV API data, and Search Console data.
- **Cheerio**: Server-side HTML parser used to inspect rendered HTML like a jQuery-style DOM.
- **Playwright**: Runs headless Chromium to render JavaScript-heavy websites and capture screenshots/resources.
- **PDFKit**: Generates downloadable PDF reports.
- **OpenAI-compatible LLM APIs**: Optional AI summaries, rewritten copy suggestions, competitor comparison, tone analysis, and report Q&A.
- **CORS**: Enables cross-origin request support if needed.
- **Crypto**: Generates unique report IDs.

### Frontend

- **HTML5**: Dashboard structure.
- **CSS3**: Styling, responsive layout, cards, panels, gauge, and report visuals.
- **Vanilla JavaScript**: Fetch calls, report rendering, filtering, animations, and UI state.
- **SVG**: Used for the animated score gauge.

### External APIs

- **Google Search Console Search Analytics API**: Optional real search performance data.
- **OSV API**: Known vulnerability lookup for detected JavaScript library versions.
- **OpenAI-compatible LLM API**: Optional AI-powered analysis and report Q&A.

### Browser Engine

- **Chromium via Playwright**: Used for real page rendering, screenshots, computed styles, resource inspection, and web-vital-style observations.

### Storage

- **In-memory storage**: Recent scan history and full reports are stored temporarily in memory.
- This can be upgraded later to MongoDB, PostgreSQL, or another persistent database.

## 10. Main Files And Their Purpose

| File | Purpose |
|---|---|
| `server.js` | Starts the Express server and serves the frontend/API. |
| `routes/analyze.js` | Main API logic for single-page and multi-page audits. |
| `lib/crawler.js` | Fetches pages, robots.txt, sitemap.xml, stylesheets, and checks links. |
| `lib/browserAudit.js` | Runs Playwright browser rendering, screenshots, web vitals, resources, and computed styles. |
| `lib/checks.js` | On-page, technical, content, and internal link extraction checks. |
| `lib/designAnalysis.js` | Color, typography, CTA, contrast, and paragraph-density analysis. |
| `lib/keywordAnalysis.js` | Target keyword placement and density analysis. |
| `lib/searchConsole.js` | Optional Google Search Console Search Analytics integration. |
| `lib/securityAnalysis.js` | Security header, exposed file, mixed content, and JS vulnerability checks. |
| `lib/aiAnalysis.js` | Optional LLM-powered executive summary, copy suggestions, competitor analysis, tone analysis, and report Q&A. |
| `lib/colorTheory.js` | Color conversion and contrast ratio helpers. |
| `lib/location.js` | Locates issues near headings/sections and creates snippets. |
| `lib/scorer.js` | Calculates score, grade, category breakdown, and deduction ledger. |
| `lib/actionPlan.js` | Builds score-lift simulations and Quick Wins/Bigger Projects action plans. |
| `lib/pdfReport.js` | Creates the downloadable PDF audit report. |
| `public/index.html` | Main dashboard HTML. |
| `public/style.css` | Dashboard styling. |
| `public/script.js` | Frontend behavior and report rendering. |
| `package.json` | Project metadata, scripts, and dependencies. |

## 11. Business Value

Auditline gives businesses and agencies a practical way to show website problems with evidence.

Business benefits:

- Helps improve search visibility.
- Helps find technical issues before launch.
- Helps identify weak pages.
- Helps catch broken links.
- Helps improve user trust and conversion.
- Helps detect basic security risks.
- Helps justify SEO/web improvement proposals.
- Helps translate technical findings into simple client-facing language.
- Helps create first-draft copy improvements instead of only pointing out problems.
- Creates professional reports for client communication.
- Saves time compared to manually using multiple audit tools.

For an agency or freelancer, this tool can be used as a lead-generation and sales-support product. A developer can scan a client website, show a professional report, and use the findings to explain what needs to be fixed.

## 12. Example Business Scenario

A local business has a website but is not getting leads from Google.

Auditline can scan the website and show:

- The page title is missing the target keyword.
- The H1 does not match the service offered.
- The first paragraph does not explain the business clearly.
- The page has thin content.
- The website has broken internal links.
- Security headers are missing.
- Some pages have duplicate titles.
- The site loads slowly in a browser.
- The screenshot shows what the page looked like during audit.
- The PDF report gives the owner a clear list of fixes.
- The AI panel rewrites the meta description and explains what to fix first in plain English.

This makes the audit actionable and easy to understand.

## 13. Inputs

The software accepts:

- Website URL
- Target keyword
- Maximum pages to crawl
- Maximum crawl depth
- Optional Google Search Console property URL
- Optional Google Search Console OAuth access token
- Optional Search Console date range
- Optional AI API key, model, and custom compatible base URL
- Optional AI target audience
- Optional competitor URLs for AI comparison

## 14. Outputs

The software produces:

- Overall score
- Letter grade
- Category scores
- Page metrics
- Keyword metrics
- Security metrics
- Search Console performance data when connected
- Sitewide audit summary
- Rendered screenshot
- List of issues
- Evidence for every issue
- Fix recommendations
- PDF report
- AI executive summary
- AI rewritten copy suggestions
- AI Q&A answers based on the report
- Local trust/NAP summary
- Recent scan history

## 15. Current Limitations

- Search Console integration requires the client to provide a valid OAuth access token.
- In-memory history disappears when the server restarts.
- Multi-page crawling is intentionally capped to prevent very large scans.
- INP may not always be observed because it requires user interaction.
- OSV lookup depends on network access; local fallback catches only common known library patterns.
- Security checks are basic checks, not a full penetration test.
- Keyword density is a guide, not a direct ranking formula.
- AI output depends on the configured LLM API and should be reviewed before sending to clients.
- AI features require a compatible API key entered in the dashboard or configured on the server.

## 16. Future Improvements

Possible upgrades:

- User accounts and saved projects
- Persistent database storage
- Scheduled weekly/monthly scans
- Email alerts
- More Search Console charts
- PageSpeed Insights integration
- Lighthouse report import
- Competitor URL comparison
- AI-generated fix suggestions
- AI-powered proposal generator
- AI-generated before/after copy previews
- White-label agency reports
- Export to CSV/Excel
- Authentication for client dashboards
- Historical trend charts

## 17. Summary

Auditline is a business-focused website audit platform. It combines SEO checks, browser rendering, content analysis, keyword intelligence, multi-page crawling, design review, link health, security basics, real search data integration, AI-powered explanation, scoring, and PDF reporting.

The goal of the project is to help businesses understand what is wrong with their website and help developers, freelancers, and agencies explain those problems clearly with evidence and recommendations.
