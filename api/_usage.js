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

export function anthropicCost(usage = {}) {
  const inputTokens = Number(usage.input_tokens || 0);
  const outputTokens = Number(usage.output_tokens || 0);
  return Number((
    inputTokens * CLAUDE_SONNET_INPUT_COST_PER_TOKEN +
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
      return { skipped: true, reason: `usage_insert_failed_${res.status}`, detail: text.slice(0, 300) };
    }
    return { recorded: true };
  } catch (err) {
    return { skipped: true, reason: err.message };
  }
}

export function requestMetadata(req) {
  return {
    user_agent: req.headers["user-agent"] || null,
    ip_address: req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket?.remoteAddress || null
  };
}
