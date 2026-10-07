// The streamed chat endpoint shared by /buy and /sell (Lane C, Oct 2026). One turn of a Sam
// conversation as text/event-stream:
//   event: text      the reply (sent once the guard has passed it)
//   event: done      {reply, cards, state, turns, ...surface extras}
//   event: fallback  {}  the Claude call failed before any text
// Turn cap 30; each turn logged to app_usage_events as {surface}_chat_turn (tokens, tools, latency,
// cost), each guard block as {surface}_chat_guard; a timeout ends with a plain line. SAM_MODEL.
import { anthropicCost, recordUsageEvent } from "../../api/_usage.js";

export const CHAT_MODEL = process.env.SAM_MODEL || "claude-sonnet-4-6";
const TURN_CAP = 30;
// opts: { surface: "buy"|"sell", run(args) -> turn result, shape(out) -> {cards, ...extras} for "done" }
export async function chatOut(res, env, b, opts) {
  const surface = opts.surface;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(200).json({ fallback: true });
  const messages = (Array.isArray(b.messages) ? b.messages : []).slice(-40).map(m => ({ role: m && m.role === "assistant" ? "assistant" : "user", content: String((m && m.content) || "").slice(0, 2000) })).filter(m => m.content);
  const turns = Math.max(0, Number(b.turns) || 0);
  const state = b.state && typeof b.state === "object" ? { ...b.state, filters: b.state.filters && typeof b.state.filters === "object" ? b.state.filters : {} } : { filters: {} };
  if (!messages.length || messages[messages.length - 1].role !== "user") return res.status(400).json({ error: "no question" });
  if (turns >= TURN_CAP) return res.status(200).json({ type: "chat", reply: "This conversation has run long. Start a new one to keep going.", cards: [], state, turns });
  res.writeHead(200, { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" });
  const send = (ev, data) => { try { res.write(`event: ${ev}\ndata: ${JSON.stringify(data)}\n\n`); } catch { /* client gone */ } };
  const t0 = Date.now();
  let out = null, streamed = false, status = "ok", err = null;
  try {
    const guards = [];
    out = await opts.run({ env, apiKey, model: CHAT_MODEL, messages, state, onText: t => { streamed = true; send("text", t); }, onGuard: g => guards.push(g) });
    for (const g of guards) await recordUsageEvent({ event_type: `${surface}_chat_guard`, route: `/${surface}#chat`, status: g.attempt === 1 ? "regenerated" : "code_reply", oldcarsdata_metered_requests: 0, metadata: { turn: turns + 1, attempt: g.attempt, reasons: g.reasons, reply: String(g.reply || "").slice(0, 600) } }, env.supabaseUrl, env.supabaseKey).catch(() => {});
    const shaped = await opts.shape(out);
    send("done", { reply: out.reply || "Sam couldn't find an answer to that. Try asking another way.", ...shaped, state: out.state, turns: turns + 1, trace: b.debug ? out.trace : undefined, guards: b.debug ? guards : undefined, forcedTool: b.debug ? out.forcedTool : undefined, ms: out.ms });
  } catch (e) {
    err = String((e && e.message) || e).slice(0, 300);
    const timedOut = /abort/i.test(err);
    status = timedOut ? "timeout" : "error";
    if (!streamed && !timedOut) send("fallback", {});
    else send("done", { reply: "Sam couldn't finish that one. Try asking again in a moment.", cards: [], state, turns: turns + 1, error: b.debug ? err : undefined });
  }
  const usage = (out && out.usage) || { input_tokens: 0, output_tokens: 0 };
  await recordUsageEvent({ event_type: `${surface}_chat_turn`, route: `/${surface}#chat`, status, anthropic_model: CHAT_MODEL,
    anthropic_input_tokens: usage.input_tokens, anthropic_output_tokens: usage.output_tokens, anthropic_cost_usd: anthropicCost(usage), oldcarsdata_metered_requests: 0,
    metadata: { turn: turns + 1, tools: out ? out.trace.map(t => t.tool) : [], latency_ms: Date.now() - t0, error: err || undefined } }, env.supabaseUrl, env.supabaseKey).catch(() => {});
  res.end();
}
