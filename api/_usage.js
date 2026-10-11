const OLDCARSDATA_1K_COST_PER_REQUEST = 49 / 1000;
const OLDCARSDATA_10K_COST_PER_REQUEST = 199 / 10000;
const CLAUDE_SONNET_INPUT_COST_PER_TOKEN = 3 / 1000000;
const CLAUDE_SONNET_OUTPUT_COST_PER_TOKEN = 15 / 1000000;

export function oldCarsDataCost(meteredRequests = 0) {
  return {
    plan1k: Number((meteredRequests * OLDCARSDATA_1K_COST_PER_REQUEST).toFixed(3)),
    plan10k: Number((meteredRequests * OLDCARSDATA_10K_COST_PER_REQUEST).toFixed(3))
  };
}

// Prompt cache (Anthropic's 5-minute cache): a cache write is billed at 1.25 times the input price and a
// cache read at 0.1 times; input_tokens is then only the uncached part of the prompt.
const CLAUDE_SONNET_CACHE_WRITE_COST_PER_TOKEN = CLAUDE_SONNET_INPUT_COST_PER_TOKEN * 1.25;
const CLAUDE_SONNET_CACHE_READ_COST_PER_TOKEN = CLAUDE_SONNET_INPUT_COST_PER_TOKEN * 0.1;

export function anthropicCost(usage = {}) {
  const inputTokens = Number(usage.input_tokens || 0);
  const outputTokens = Number(usage.output_tokens || 0);
  return Number((
    inputTokens * CLAUDE_SONNET_INPUT_COST_PER_TOKEN +
    Number(usage.cache_creation_input_tokens || 0) * CLAUDE_SONNET_CACHE_WRITE_COST_PER_TOKEN +
    Number(usage.cache_read_input_tokens || 0) * CLAUDE_SONNET_CACHE_READ_COST_PER_TOKEN +
    outputTokens * CLAUDE_SONNET_OUTPUT_COST_PER_TOKEN
  ).toFixed(6));
}

export async function recordUsageEvent(event, supabaseUrl, supabaseKey) {
  if (!supabaseUrl || !supabaseKey) return { skipped: true, reason: "supabase_not_configured" };

  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/app_usage_events`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        Prefer: "return=minimal"
      },
      body: JSON.stringify({
        created_at: new Date().toISOString(),
        ...event
      })
    });

    if (!res.ok) {
      const text = await res.text();
      // 7A.1: never swallow a failed usage write. Log loudly so a missing or
      // unreadable app_usage_events table is visible in the logs, not silent.
      console.error(`CRITICAL: usage event write failed (${res.status}) - app_usage_events may be missing (run docs/supabase-v1-schema.sql). Detail: ${text.slice(0, 200)}`);
      return { skipped: true, reason: `usage_insert_failed_${res.status}`, detail: text.slice(0, 300) };
    }
    return { recorded: true };
  } catch (err) {
    console.error(`CRITICAL: usage event write threw: ${err.message}`);
    return { skipped: true, reason: err.message };
  }
}

export function requestMetadata(req) {
  return {
    user_agent: req.headers["user-agent"] || null,
    ip_address: req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket?.remoteAddress || null
  };
}
