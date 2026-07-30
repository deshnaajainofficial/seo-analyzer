const SEVERITY = { GOOD: "good", WARNING: "warning", CRITICAL: "critical" };

const LOCAL_BUSINESS_TYPES = new Set([
  "LocalBusiness",
  "Dentist",
  "Restaurant",
  "Store",
  "MedicalBusiness",
  "ProfessionalService",
  "HomeAndConstructionBusiness",
  "AutomotiveBusiness",
  "HealthAndBeautyBusiness",
  "LegalService",
  "RealEstateAgent",
]);

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

function analyzeLocalTrust($, finalUrl) {
  const visibleText = extractVisibleBodyText($);
  const localBusinessSchema = extractLocalBusinessSchema($);
  const phones = extractPhones($, visibleText, localBusinessSchema);
  const addresses = extractAddressCandidates(visibleText);
  const trustSignals = detectTrustSignals($, visibleText, finalUrl);
  const results = [];

  const napWhy =
    "For local-business websites, NAP means name, address, and phone number. Consistent NAP details help visitors contact the business quickly and help local SEO systems connect the website to the same real-world entity across Google Business Profile, directories, and citations.";

  if (phones.length === 0) {
    results.push(
      issue(
        "nap-phone-missing",
        "Local Trust",
        SEVERITY.WARNING,
        "No visible phone number was detected.",
        "Add a clearly visible phone number in the header, footer, or contact section.",
        napWhy,
        "0 phone-number patterns found",
        "Visible page text"
      )
    );
  } else {
    results.push(
      issue(
        "nap-phone-present",
        "Local Trust",
        SEVERITY.GOOD,
        "Visible phone number detected.",
        null,
        napWhy,
        phones.slice(0, 4).join(" | "),
        "Visible page text"
      )
    );
  }

  if (addresses.length === 0) {
    results.push(
      issue(
        "nap-address-missing",
        "Local Trust",
        SEVERITY.WARNING,
        "No likely street address was detected.",
        "Add the business address in the footer/contact section, especially for local service or storefront businesses.",
        napWhy,
        "0 street-address-like patterns found",
        "Visible page text"
      )
    );
  } else {
    results.push(
      issue(
        "nap-address-present",
        "Local Trust",
        SEVERITY.GOOD,
        "Likely street address detected.",
        null,
        napWhy,
        addresses.slice(0, 3).join(" | "),
        "Visible page text"
      )
    );
  }

  const schemaWhy =
    "LocalBusiness structured data helps search engines understand the business entity, address, phone, opening hours, and other local details in a machine-readable way. It does not guarantee rich results, but it improves clarity and validation for local SEO.";

  if (!localBusinessSchema.found) {
    results.push(
      issue(
        "localbusiness-schema-missing",
        "Local Trust",
        SEVERITY.WARNING,
        "No LocalBusiness schema was detected.",
        "Add JSON-LD LocalBusiness schema with name, address, telephone, URL, opening hours, and geo details where possible.",
        schemaWhy,
        "No JSON-LD @type matched LocalBusiness or a common LocalBusiness subtype",
        "Structured data"
      )
    );
  } else if (localBusinessSchema.missingFields.length > 0) {
    results.push(
      issue(
        "localbusiness-schema-incomplete",
        "Local Trust",
        SEVERITY.WARNING,
        `LocalBusiness schema is present but missing ${localBusinessSchema.missingFields.length} recommended field(s).`,
        `Add missing schema fields: ${localBusinessSchema.missingFields.join(", ")}.`,
        schemaWhy,
        `Present: ${localBusinessSchema.presentFields.join(", ") || "none"} | Missing: ${localBusinessSchema.missingFields.join(", ")}`,
        "Structured data"
      )
    );
  } else {
    results.push(
      issue(
        "localbusiness-schema-complete",
        "Local Trust",
        SEVERITY.GOOD,
        "LocalBusiness schema includes the recommended core fields.",
        null,
        schemaWhy,
        `Fields present: ${localBusinessSchema.presentFields.join(", ")}`,
        "Structured data"
      )
    );
  }

  const trustWhy =
    "Trust signals reduce hesitation before a visitor contacts or buys from a business. Testimonials, reviews, visible contact information, secure checkout/trust badges, and privacy-policy links are not classic ranking factors, but they support conversion and credibility.";

  if (trustSignals.testimonials.found) {
    results.push(issue("trust-testimonials-present", "Local Trust", SEVERITY.GOOD, "Testimonials or review signals were detected.", null, trustWhy, trustSignals.testimonials.evidence, "Visible page text or structured data"));
  } else {
    results.push(issue("trust-testimonials-missing", "Local Trust", SEVERITY.WARNING, "No testimonials or review signals were detected.", "Add testimonials, review snippets, star ratings, or review schema where truthful and relevant.", trustWhy, "No testimonial/review keywords, Review schema, or AggregateRating schema found", "Visible page text or structured data"));
  }

  if (trustSignals.contactVisible) {
    results.push(issue("trust-contact-visible", "Local Trust", SEVERITY.GOOD, "Contact information appears visible on the page.", null, trustWhy, "Phone/email/contact link detected", "Visible page text and links"));
  } else {
    results.push(issue("trust-contact-hidden", "Local Trust", SEVERITY.WARNING, "Contact information is not clearly visible.", "Add a visible phone number, email, contact link, or contact section near the header/footer.", trustWhy, "No phone, email, or contact link detected", "Visible page text and links"));
  }

  if (trustSignals.sslBadge) {
    results.push(issue("trust-ssl-badge-present", "Local Trust", SEVERITY.GOOD, "SSL/security badge language was detected.", null, trustWhy, trustSignals.sslBadge, "Visible page text or image alt/src"));
  }

  if (trustSignals.privacyPolicy) {
    results.push(issue("trust-privacy-policy-present", "Local Trust", SEVERITY.GOOD, "Privacy policy link detected.", null, trustWhy, "Privacy policy link/text found", "Links and visible text"));
  } else {
    results.push(issue("trust-privacy-policy-missing", "Local Trust", SEVERITY.WARNING, "No privacy policy link was detected.", "Add a clear privacy policy link in the footer, especially if the site has forms, analytics, ads, or lead tracking.", trustWhy, "No privacy-policy link/text found", "Links and visible text"));
  }

  return {
    results,
    phones,
    addresses,
    localBusinessSchema,
    trustSignals,
    explanation:
      "Checks whether a local-business site shows consistent contact details and trust signals that help visitors feel confident enough to call, submit a form, or buy.",
  };
}

function extractVisibleBodyText($) {
  const bodyHtml = $("body").html() || "";
  const withTagSpaces = bodyHtml
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ");
  return $("<div>").html(withTagSpaces).text().replace(/\s+/g, " ").trim();
}

function analyzeSiteNapConsistency(pageReports) {
  const phoneMap = new Map();
  const addressMap = new Map();
  pageReports.forEach((page) => {
    (page.localTrust?.phones || []).forEach((phone) => addMapValue(phoneMap, normalizePhone(phone), page.finalUrl));
    (page.localTrust?.addresses || []).forEach((address) => addMapValue(addressMap, normalizeAddress(address), page.finalUrl));
  });

  const results = [];
  const why =
    "Inconsistent NAP details across pages can confuse visitors and weaken local SEO consistency. A footer/header template should usually show the same phone and address everywhere.";

  if (phoneMap.size > 1) {
    results.push(
      issue(
        "site-nap-phone-inconsistent",
        "Local Trust",
        SEVERITY.WARNING,
        `${phoneMap.size} different phone number formats/values were found across crawled pages.`,
        "Standardize the primary phone number across the header, footer, contact page, and LocalBusiness schema.",
        why,
        formatMapEvidence(phoneMap),
        "Crawled pages"
      )
    );
  } else if (phoneMap.size === 1) {
    results.push(issue("site-nap-phone-consistent", "Local Trust", SEVERITY.GOOD, "Phone number appears consistent across crawled pages.", null, why, formatMapEvidence(phoneMap), "Crawled pages"));
  }

  if (addressMap.size > 1) {
    results.push(
      issue(
        "site-nap-address-inconsistent",
        "Local Trust",
        SEVERITY.WARNING,
        `${addressMap.size} different address patterns were found across crawled pages.`,
        "Use one canonical business address format across all pages and schema.",
        why,
        formatMapEvidence(addressMap),
        "Crawled pages"
      )
    );
  } else if (addressMap.size === 1) {
    results.push(issue("site-nap-address-consistent", "Local Trust", SEVERITY.GOOD, "Address appears consistent across crawled pages.", null, why, formatMapEvidence(addressMap), "Crawled pages"));
  }

  return results;
}

function extractPhones($OrText, maybeText, localBusinessSchema = null) {
  const hasCheerio = typeof $OrText === "function";
  const $ = hasCheerio ? $OrText : null;
  const text = hasCheerio ? maybeText || "" : $OrText || "";
  const candidates = [];

  if ($) {
    $('a[href^="tel:"]').each((_, el) => {
      candidates.push({ value: ($(el).attr("href") || "").replace(/^tel:/i, ""), trusted: true, source: "tel link" });
    });
  }

  const schemaPhone = localBusinessSchema?.schema?.telephone;
  if (schemaPhone) {
    const phones = Array.isArray(schemaPhone) ? schemaPhone : [schemaPhone];
    phones.forEach((phone) => candidates.push({ value: String(phone), trusted: true, source: "LocalBusiness schema" }));
  }

  const phonePattern = /(?:\+?\d{1,3}[\s().-]{0,3})?(?:\(?\d{3,5}\)?[\s.-]{1,3}\d{3,5}[\s.-]{1,3}\d{3,5}|\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4})/g;
  let match;
  while ((match = phonePattern.exec(text)) !== null) {
    const raw = match[0].trim();
    const start = Math.max(0, match.index - 45);
    const end = Math.min(text.length, match.index + raw.length + 45);
    candidates.push({ value: raw, context: text.slice(start, end), trusted: false, source: "visible text" });
  }

  const unique = new Map();
  candidates.forEach((candidate) => {
    const normalized = normalizePhone(candidate.value);
    if (!isLikelyPhone(candidate.value, candidate.context || "", candidate.trusted)) return;
    if (!unique.has(normalized)) unique.set(normalized, formatPhoneDisplay(candidate.value));
  });

  return Array.from(unique.values()).slice(0, 8);
}

function extractAddressCandidates(text) {
  const streetTypes = "street|st\\.?|road|rd\\.?|avenue|ave\\.?|lane|ln\\.?|drive|dr\\.?|boulevard|blvd\\.?|suite|ste\\.?|floor|fl\\.?|market|marg|nagar|colony|sector";
  const pattern = new RegExp(`\\b\\d{1,6}\\s+(?:[A-Za-z0-9#.'-]+\\s+){0,5}(?:${streetTypes})\\b(?:,\\s*[A-Za-z][A-Za-z '-]{1,30})?`, "gi");
  return Array.from(new Set((text.match(pattern) || []).map((address) => address.trim().replace(/\s+/g, " ")))).slice(0, 8);
}

function extractLocalBusinessSchema($) {
  const schemas = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).html();
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      flattenSchema(parsed).forEach((item) => {
        const types = Array.isArray(item["@type"]) ? item["@type"] : [item["@type"]];
        if (types.some((type) => LOCAL_BUSINESS_TYPES.has(String(type)))) schemas.push(item);
      });
    } catch (_) {
      /* ignore invalid JSON-LD */
    }
  });

  const schema = schemas[0] || null;
  const recommended = ["name", "address", "telephone", "url", "openingHours", "geo"];
  const presentFields = schema ? recommended.filter((field) => hasSchemaField(schema, field)) : [];
  return {
    found: Boolean(schema),
    schema,
    presentFields,
    missingFields: schema ? recommended.filter((field) => !hasSchemaField(schema, field)) : recommended,
  };
}

function detectTrustSignals($, visibleText, finalUrl) {
  const lower = visibleText.toLowerCase();
  const schemaText = $('script[type="application/ld+json"]').text().toLowerCase();
  const linkTexts = $("a")
    .toArray()
    .map((el) => `${$(el).text()} ${$(el).attr("href") || ""}`.toLowerCase())
    .join(" ");
  const imageText = $("img")
    .toArray()
    .map((el) => `${$(el).attr("alt") || ""} ${$(el).attr("src") || ""}`.toLowerCase())
    .join(" ");
  const emails = visibleText.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
  const phones = extractPhones($, visibleText, extractLocalBusinessSchema($));
  const testimonialsFound = /\b(testimonial|testimonials|reviews?|rated|rating|stars?|happy clients?|what our clients say)\b/i.test(visibleText) || /"@type"\s*:\s*"(review|aggregaterating)"/i.test(schemaText);

  return {
    testimonials: {
      found: testimonialsFound,
      evidence: testimonialsFound ? "Review/testimonial language or Review/AggregateRating schema detected" : null,
    },
    contactVisible: phones.length > 0 || emails.length > 0 || /\b(contact|call us|get in touch)\b/i.test(linkTexts),
    sslBadge: /\b(ssl|secure checkout|norton|mcafee|trustedsite|trustpilot|bbb accredited|verified secure)\b/i.test(`${visibleText} ${imageText}`) ? "Security/trust badge language detected" : null,
    privacyPolicy: /\bprivacy policy\b/i.test(`${visibleText} ${linkTexts}`),
    isHttps: String(finalUrl).startsWith("https://"),
  };
}

function flattenSchema(value) {
  if (Array.isArray(value)) return value.flatMap(flattenSchema);
  if (!value || typeof value !== "object") return [];
  const graph = Array.isArray(value["@graph"]) ? value["@graph"].flatMap(flattenSchema) : [];
  return [value, ...graph];
}

function hasSchemaField(schema, field) {
  const value = schema[field];
  if (Array.isArray(value)) return value.length > 0;
  if (value && typeof value === "object") return Object.keys(value).length > 0;
  return Boolean(value);
}

function normalizePhone(phone) {
  const raw = String(phone || "").trim();
  const hasPlus = raw.startsWith("+");
  const digits = raw.replace(/\D/g, "");
  return `${hasPlus ? "+" : ""}${digits}`;
}

function isLikelyPhone(rawPhone, context = "", trusted = false) {
  const raw = String(rawPhone || "").trim();
  const digits = raw.replace(/\D/g, "");
  const normalizedContext = String(context || "").toLowerCase();

  if (digits.length < 10 || digits.length > 15) return false;
  if (/^(\d)\1+$/.test(digits)) return false;
  if (/^(?:1234567890|0123456789|9876543210)$/.test(digits)) return false;
  if (looksLikeDateOrAmount(raw, normalizedContext)) return false;

  const hasPhoneFormatting = /[+()]/.test(raw) || (raw.match(/[\s.-]/g) || []).length >= 1;
  const hasPhoneContext = /\b(phone|tel|telephone|mobile|call|whatsapp|contact|office|cell|support|sales)\b/i.test(normalizedContext);
  if (looksLikeIdentifierContext(normalizedContext) && !hasPhoneContext) return false;
  const plausibleNanp = digits.length === 10 && /^[2-9]\d{2}[2-9]\d{6}$/.test(digits);
  const plausibleIndia = digits.length === 10 && /^[6-9]\d{9}$/.test(digits);
  const hasCountryCode = raw.startsWith("+") || digits.length > 10;

  if (!trusted && /^[0-9]{10,15}$/.test(raw) && !hasPhoneContext) return false;

  return trusted || hasPhoneContext || hasPhoneFormatting || plausibleNanp || plausibleIndia || hasCountryCode;
}

function looksLikeDateOrAmount(raw, context) {
  if (/\b(19|20)\d{2}[\s.-]?(19|20)?\d{2}\b/.test(raw)) return true;
  if (/\b\d{1,2}[\s/-]\d{1,2}[\s/-]\d{2,4}\b/.test(raw)) return true;
  if (/[₹$€£]\s*\d/.test(context) || /\b(price|cost|rs\.?|usd|inr|discount|off|save)\b/.test(context)) return true;
  return false;
}

function looksLikeIdentifierContext(context) {
  return /\b(order|invoice|receipt|tracking|shipment|awb|gst|gstin|vat|tax id|cin|sku|serial|license|licence|registration|account|application|roll no|zip|postal|pincode|pin code)\b/.test(context);
}

function formatPhoneDisplay(rawPhone) {
  return String(rawPhone || "")
    .replace(/^tel:/i, "")
    .replace(/[^\d+().\s-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeAddress(address) {
  return String(address || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function addMapValue(map, key, value) {
  if (!key) return;
  if (!map.has(key)) map.set(key, new Set());
  map.get(key).add(value);
}

function formatMapEvidence(map) {
  return Array.from(map.entries())
    .slice(0, 6)
    .map(([key, urls]) => `${key}: ${Array.from(urls).slice(0, 4).join(", ")}`)
    .join(" | ");
}

module.exports = { analyzeLocalTrust, analyzeSiteNapConsistency };
