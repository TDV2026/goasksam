import { anthropicCost, recordUsageEvent, requestMetadata } from "./_usage.js";

// Wording layer only. Must never invent market performance (product rule 1).
const CHAT_MODEL = "claude-sonnet-4-6";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "No API key configured" });
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

  const { messages, system } = req.body;
  const startedAt = Date.now();
  const latestUserMessage = [...(messages || [])].reverse().find(message => message.role === "user");
  const searchText = typeof latestUserMessage?.content === "string" ? latestUserMessage.content.slice(0, 500) : null;

  const logError = async (errorMessage, httpStatus) => recordUsageEvent({
    event_type: "chat",
    route: "/api/chat",
    status: "error",
    search_text: searchText,
    anthropic_model: CHAT_MODEL,
    anthropic_input_tokens: 0,
    anthropic_output_tokens: 0,
    anthropic_cost_usd: 0,
    oldcarsdata_metered_requests: 0,
    oldcarsdata_cost_1k_usd: 0,
    oldcarsdata_cost_10k_usd: 0,
    duration_ms: Date.now() - startedAt,
    metadata: {
      ...requestMetadata(req),
      error: String(errorMessage || "unknown").slice(0, 500),
      upstream_status: httpStatus || null
    }
  }, supabaseUrl, supabaseKey);

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: CHAT_MODEL,
        max_tokens: 1000,
        system: system,
        messages: messages
      })
    });

    const data = await response.json();
    if (!response.ok) {
      const errorMessage = data.error?.message || "Anthropic API error";
      await logError(errorMessage, response.status);
      return res.status(response.status).json({ error: errorMessage });
    }
    const text = data.content?.[0]?.text || "";
    if (!text) {
      await logError("empty_completion", response.status);
      return res.status(502).json({ error: "Empty completion from model" });
    }
    const usage = data.usage || {};
    const cost = anthropicCost(usage);
    const usageLog = await recordUsageEvent({
      event_type: "chat",
      route: "/api/chat",
      status: "ok",
      search_text: searchText,
      anthropic_model: CHAT_MODEL,
      anthropic_input_tokens: Number(usage.input_tokens || 0),
      anthropic_output_tokens: Number(usage.output_tokens || 0),
      anthropic_cost_usd: cost,
      oldcarsdata_metered_requests: 0,
      oldcarsdata_cost_1k_usd: 0,
      oldcarsdata_cost_10k_usd: 0,
      duration_ms: Date.now() - startedAt,
      metadata: {
        ...requestMetadata(req),
        usage
      }
    }, supabaseUrl, supabaseKey);
    return res.status(200).json({ text, usage, estimatedCostUsd: cost, usageLog });
  } catch (err) {
    await logError(err.message, null);
    return res.status(500).json({ error: err.message });
  }
}
