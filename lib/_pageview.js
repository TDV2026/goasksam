// Page-view referrer logging (docs/search-rules.md, measurement). Classifies a request's Referer and
// User-Agent into a source so we can see when ChatGPT, Perplexity, Copilot, Gemini, Bing or Google send
// a visitor OR crawl a page, and logs one `page_view` row to app_usage_events. Shared helper so any
// page-serving function (and the /api/pageview beacon for the static pages) logs the same way.
//
// IMPORTANT: AI-answer and search CRAWLERS do not run JavaScript, so a client beacon never sees them;
// the citation signal that matters comes from calling logPageView SERVER-SIDE in the page handlers,
// where the bot's Referer/UA is on the request.
import { recordUsageEvent } from "../api/_usage.js";

// Referrer hostnames -> source (a human arriving from an AI answer or a search result).
const REFERRER_SOURCES = [
  [/(^|\.)chatgpt\.com$/i, "chatgpt"],
  [/(^|\.)openai\.com$/i, "chatgpt"],
  [/(^|\.)perplexity\.ai$/i, "perplexity"],
  [/(^|\.)copilot\.microsoft\.com$/i, "copilot"],
  [/(^|\.)gemini\.google\.com$/i, "gemini"],
  [/(^|\.)bing\.com$/i, "bing"],
  [/(^|\.)google\.[a-z.]+$/i, "google"],
  [/(^|\.)claude\.ai$/i, "claude"]
];

// Crawler User-Agents -> source (the bot itself fetching a page). These never set a browser Referer.
const BOT_UAS = [
  [/OAI-SearchBot/i, "oai-searchbot"],
  [/ChatGPT-User/i, "chatgpt-user"],
  [/GPTBot/i, "gptbot"],
  [/PerplexityBot/i, "perplexitybot"],
  [/Claude-SearchBot/i, "claude-searchbot"],
  [/Claude-User/i, "claude-user"],
  [/ClaudeBot/i, "claudebot"],
  [/Googlebot/i, "googlebot"],
  [/Google-Extended/i, "google-extended"],
  [/\bbingbot\b/i, "bingbot"]
];

export function classifyReferrer(referer, userAgent) {
  const ua = String(userAgent || "");
  for (const [re, tag] of BOT_UAS) if (re.test(ua)) return { source: tag, kind: "crawler" };
  const ref = String(referer || "");
  try { const host = new URL(ref).hostname; for (const [re, tag] of REFERRER_SOURCES) if (re.test(host)) return { source: tag, kind: "referral" }; } catch { /* not a URL */ }
  return { source: ref ? "other" : "direct", kind: "referral" };
}

export async function logPageView(env, { path, referer, userAgent } = {}) {
  if (!env) return;
  const { source, kind } = classifyReferrer(referer, userAgent);
  try {
    await recordUsageEvent({
      event_type: "page_view", route: path || null, status: kind, oldcarsdata_metered_requests: 0,
      metadata: { path: path || null, source, kind, ref: String(referer || "").slice(0, 200), ua: String(userAgent || "").slice(0, 160) }
    }, env.supabaseUrl, env.supabaseKey);
  } catch { /* best-effort; a page view never fails a page */ }
}
