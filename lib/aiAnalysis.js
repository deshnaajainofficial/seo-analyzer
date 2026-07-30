const axios = require("axios");

const PROVIDERS = {
  openai: {
    baseUrl: "https://api.openai.com/v1",
    envKey: "OPENAI_API_KEY",
    defaultModel: process.env.OPENAI_MODEL || "gpt-4.1-mini",
    format: "chat",
    missingKeyMessage:
      "OpenAI API key is not configured. Add OPENAI_API_KEY to the server environment or provide a one-time key in the AI panel.",
  },
  xai: {
    baseUrl: "https://api.x.ai/v1",
    envKey: "XAI_API_KEY",
    defaultModel: process.env.XAI_MODEL || "grok-4.3",
    format: "chat",
    missingKeyMessage:
      "xAI API key is not configured. Add XAI_API_KEY to the server environment or provide a one-time key in the AI panel.",
  },
};

async function generateAiInsights({ report, competitorReports = [], targetAudience = "", apiKey, model, provider, customApiBaseUrl }) {
  const prompt = [
    {
      role: "system",
      content:
        "You are a senior website, SEO, conversion, and client-strategy consultant. Explain audit findings in plain English for non-technical business owners. Be specific, practical, and grounded only in the provided report data.",
    },
    {
      role: "user",
      content:
        "Create an AI-powered client analysis from this audit report. Return valid JSON only with these keys: executiveSummary, keyStrengths, biggestRisks, rewrittenCopySuggestions, toneAnalysis, competitorComparison, recommendedNextSteps, clientQuestionsToAsk. rewrittenCopySuggestions must include metaTitle, metaDescription, heroHeadline, introParagraph, primaryCta. Keep metaDescription near 155 characters.\n\n" +
        JSON.stringify(
          {
            targetAudience,
            clientReport: compactReport(report),
            competitors: competitorReports.map(compactReport),
          },
          null,
          2
        ),
    },
  ];

  const text = await callLlmApi({ apiKey, input: prompt, model, provider, customApiBaseUrl });
  return parseJsonResponse(text);
}

async function answerReportQuestion({ report, aiInsights = null, question, apiKey, model, provider, customApiBaseUrl }) {
  const prompt = [
    {
      role: "system",
      content:
        "You answer questions about a website audit report for a non-technical business client. Use only the provided report and AI insights. If the answer is not in the report, say what extra data would be needed.",
    },
    {
      role: "user",
      content:
        `Question: ${question}\n\n` +
        JSON.stringify(
          {
            report: compactReport(report),
            aiInsights,
          },
          null,
          2
        ),
    },
  ];

  return callLlmApi({ apiKey, input: prompt, model, provider, customApiBaseUrl });
}

async function callLlmApi({ apiKey, input, model, provider, customApiBaseUrl }) {
  const selectedProvider = resolveProvider({ provider, apiKey, customApiBaseUrl });
  const key = apiKey || (selectedProvider.envKey ? process.env[selectedProvider.envKey] : "");
  if (!key) {
    const err = new Error(selectedProvider.missingKeyMessage);
    err.code = "missing_api_key";
    throw err;
  }

  if (selectedProvider.format === "chat") {
    return callChatCompletionsApi({ key, input, model: model || selectedProvider.defaultModel, selectedProvider });
  }

  return callResponsesApi({ key, input, model: model || selectedProvider.defaultModel, selectedProvider });
}

async function callResponsesApi({ key, input, model, selectedProvider }) {
  const res = await axios.post(
    buildEndpoint(selectedProvider.baseUrl, "responses"),
    {
      model,
      input,
      max_output_tokens: 1800,
    },
    {
      timeout: 30000,
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
    }
  );

  return extractOutputText(res.data);
}

async function callChatCompletionsApi({ key, input, model, selectedProvider }) {
  const res = await axios.post(
    buildEndpoint(selectedProvider.baseUrl, "chat/completions"),
    {
      model,
      messages: input,
      max_tokens: 1800,
    },
    {
      timeout: 30000,
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
    }
  );

  return extractOutputText(res.data);
}

function resolveProvider({ provider, apiKey, customApiBaseUrl }) {
  const baseUrl = String(customApiBaseUrl || "").trim();
  if (baseUrl) return customProvider(baseUrl);
  if (provider === "openai" || provider === "xai") return PROVIDERS[provider];

  const key = String(apiKey || "").trim().toLowerCase();
  if (key.startsWith("xai-") || key.startsWith("xai_")) return PROVIDERS.xai;
  if (process.env.XAI_API_KEY && !process.env.OPENAI_API_KEY) return PROVIDERS.xai;
  if (!key && !process.env.OPENAI_API_KEY && !process.env.XAI_API_KEY) {
    return {
      baseUrl: "https://api.openai.com/v1",
      envKey: "",
      defaultModel: process.env.OPENAI_MODEL || "gpt-4.1-mini",
      format: "chat",
      missingKeyMessage:
        "AI API key is not configured. Enter an API key in the AI panel, or set OPENAI_API_KEY, XAI_API_KEY, or CUSTOM_AI_API_KEY on the server.",
    };
  }

  return PROVIDERS.openai;
}

function customProvider(baseUrl) {
  return {
    baseUrl,
    envKey: "CUSTOM_AI_API_KEY",
    defaultModel: process.env.CUSTOM_AI_MODEL || "gpt-4o-mini",
    format: "chat",
    missingKeyMessage:
      "Custom AI API key is not configured. Provide a one-time key in the AI panel or set CUSTOM_AI_API_KEY on the server.",
  };
}

function buildEndpoint(baseUrl, path) {
  const clean = String(baseUrl || "").replace(/\/+$/, "");
  if (clean.endsWith(`/${path}`)) return clean;
  if (path === "chat/completions" && clean.endsWith("/responses")) return clean.replace(/\/responses$/, "/chat/completions");
  if (path === "responses" && clean.endsWith("/chat/completions")) return clean.replace(/\/chat\/completions$/, "/responses");
  return `${clean}/${path}`;
}

function compactReport(report) {
  const topIssues = [...(report.issues || [])]
    .filter((item) => item.severity !== "good")
    .slice(0, 18)
    .map((item) => ({
      id: item.id,
      category: item.category,
      severity: item.severity,
      message: item.message,
      evidence: item.evidence,
      recommendation: item.recommendation,
    }));

  return {
    url: report.finalUrl,
    score: report.score,
    grade: report.grade,
    metrics: report.metrics,
    keyword: report.keyword,
    security: report.security,
    design: report.design
      ? {
          primaryColor: report.design.primaryColor,
          fonts: report.design.fonts,
          distinctColorCount: report.design.distinctColorCount,
          source: report.design.source,
        }
      : null,
    siteAudit: report.siteAudit
      ? {
          pagesCrawled: report.siteAudit.pagesCrawled,
          averagePageScore: report.siteAudit.averagePageScore,
          sitewideScore: report.siteAudit.sitewideScore,
          overallScore: report.siteAudit.overallScore,
          issues: report.siteAudit.issues,
          pages: report.siteAudit.pages,
        }
      : null,
    topIssues,
    categoryBreakdown: report.byCategory,
  };
}

function extractOutputText(data) {
  if (typeof data.choices?.[0]?.message?.content === "string") return data.choices[0].message.content;
  if (typeof data.output_text === "string") return data.output_text;
  const chunks = [];
  for (const item of data.output || []) {
    for (const content of item.content || []) {
      if (content.type === "output_text" && content.text) chunks.push(content.text);
      if (content.type === "text" && content.text) chunks.push(content.text);
    }
  }
  return chunks.join("\n").trim();
}

function parseJsonResponse(text) {
  const trimmed = String(text || "").trim();
  try {
    return JSON.parse(trimmed);
  } catch (_) {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch (_) {
        /* fall through */
      }
    }
  }

  return {
    executiveSummary: trimmed,
    keyStrengths: [],
    biggestRisks: [],
    rewrittenCopySuggestions: {},
    toneAnalysis: "",
    competitorComparison: "",
    recommendedNextSteps: [],
    clientQuestionsToAsk: [],
  };
}

module.exports = { generateAiInsights, answerReportQuestion };
