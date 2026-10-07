// The Sam conversation core (Lane C, Oct 2026): one engine shared by /buy (lib/live/samChat.js) and
// /sell (lib/sell/sellChat.js). Each surface brings its own system prompt, tools, tool executor and
// reply-built-in-code; the core runs the turn: Claude streamed with tool use, tool calls first when the
// turn names a car, the server-side output guard (numbers only from this turn's tools or the person's
// words, no approximations, judgements, first person, banned words, choice questions or sentences about
// Sam itself), one regeneration with the failure named, then the reply built in code. 25s deadline.
import { resolveVehicle } from "../vehicle.js";

export const usd = n => (n == null || !Number.isFinite(Number(n)) ? null : "$" + Math.round(Number(n)).toLocaleString("en-US"));
// "AI" is not banned (Oct 2026): a factual product description may name it. Hype and Sam describing
// itself as an AI are blocked by their own guard rules below.
export const BANNED = /\b(valuation|valued|worth|estimate[sd]?|apprais\w*)\b/gi;
// polish: dashes, "an 11k-mile", spacing. Banned words are NOT rewritten here: the guard sees them and
// the reply is regenerated (a mid-sentence rewrite read "in Saratoga Also, at 299 miles").
export const polish = s => String(s || "").replace(/[–—]/g, ",")
  .replace(/\ba (?=(?:8|11|18)(?:\d{0,2})?(?:[,k\s-]|$))/g, "an ").replace(/\bA (?=(?:8|11|18)(?:\d{0,2})?(?:[,k\s-]|$))/g, "An ").replace(/\s+([,.])/g, "$1").replace(/\s{2,}/g, " ").replace(/(^|[.!?]\s+)([a-z])/g, (m, a, b) => a + b.toUpperCase()).trim();
// clean: the last line of defence for the reply built in code (never seen by a model).
export const clean = s => polish(String(s || "").replace(BANNED, ""));


// Does this message name a car (a make, a model or a nickname the resolver knows)? Bounded at 2.5s.
export async function namesCar(text) {
  const t = String(text || "").trim(); if (t.length < 2) return false;
  const r = await Promise.race([resolveVehicle(t).catch(() => null), new Promise(res => setTimeout(() => res(null), 2500))]);
  return !!(r && r.vehicle && r.vehicle.make);
}

// ---------------------------------------------------------------- one Claude call, streamed
export async function claudeStream({ apiKey, model, system, messages, tools, onText, onToolStart, signal, toolChoice }) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST", signal,
    headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model, max_tokens: 700, system, messages, tools, stream: true, ...(toolChoice ? { tool_choice: toolChoice } : {}) })
  });
  if (!r.ok || !r.body) { const t = await r.text().catch(() => ""); throw new Error("anthropic " + r.status + " " + t.slice(0, 200)); }
  const blocks = []; let usage = { input_tokens: 0, output_tokens: 0 }, stop = null, buf = "";
  const dec = new TextDecoder();
  for await (const chunk of r.body) {
    buf += dec.decode(chunk, { stream: true });
    let i;
    while ((i = buf.indexOf("\n\n")) >= 0) {
      const evt = buf.slice(0, i); buf = buf.slice(i + 2);
      const line = evt.split("\n").find(l => l.startsWith("data: "));
      if (!line) continue;
      let j; try { j = JSON.parse(line.slice(6)); } catch { continue; }
      if (j.type === "message_start" && j.message && j.message.usage) usage.input_tokens += Number(j.message.usage.input_tokens || 0);
      else if (j.type === "content_block_start") { blocks[j.index] = j.content_block.type === "tool_use" ? { type: "tool_use", id: j.content_block.id, name: j.content_block.name, json: "" } : { type: "text", text: "" }; if (j.content_block.type === "tool_use" && onToolStart) onToolStart(); }
      else if (j.type === "content_block_delta") {
        const b = blocks[j.index]; if (!b) continue;
        if (j.delta.type === "text_delta") { b.text += j.delta.text; onText && onText(j.delta.text); }
        else if (j.delta.type === "input_json_delta") b.json += j.delta.partial_json;
      } else if (j.type === "message_delta") { if (j.usage) usage.output_tokens += Number(j.usage.output_tokens || 0); if (j.delta && j.delta.stop_reason) stop = j.delta.stop_reason; }
      else if (j.type === "error") throw new Error("anthropic stream error " + JSON.stringify(j.error || {}).slice(0, 200));
    }
  }
  const content = blocks.filter(Boolean).map(b => b.type === "tool_use" ? { type: "tool_use", id: b.id, name: b.name, input: (() => { try { return b.json ? JSON.parse(b.json) : {}; } catch { return {}; } })() } : { type: "text", text: b.text });
  return { content, usage, stop };
}

// ---------------------------------------------------------------- the output guard (server side)
// Nothing reaches the page unchecked: every number must come from THIS turn's tool results (or the
// buyer's own words), and the reply must not approximate, editorialise or add model facts.
const numTok = /(?<![A-Za-z0-9])\$?\d[\d,]*(?:\.\d+)?k?(?![A-Za-z0-9])/gi;
const normNum = t => { let x = String(t).toLowerCase().replace(/[$,]/g, ""); const k = /k$/.test(x); x = x.replace(/k$/, ""); const n = Number(x); return Number.isFinite(n) ? String(Math.round(k ? n * 1000 : n)) : null; };
function allowedNumbers(trace, userText) {
  const set = new Set();
  const addText = t => { for (const m of String(t).match(numTok) || []) { const n = normNum(m); if (n) set.add(n); } for (const m of String(t).match(/\d+/g) || []) set.add(String(Number(m))); };
  const walk = (o, key) => { if (o == null) return; if (Array.isArray(o)) return o.forEach(x => walk(x, key)); if (typeof o === "object") return Object.entries(o).forEach(([k, v]) => { if (/^(id|vin|url|link)$/i.test(k)) return; addText(k); walk(v, k); }); if (typeof o === "number") { set.add(String(Math.round(o))); return; } addText(o); };
  for (const t of trace) { walk(t.input); walk(t.result); }
  addText(userText || "");
  return set;
}
const BLOCKS = [
  [/\b(?:around|roughly|about|approximately|nearly|almost|some)\s+\$?\d/i, "an approximate number"],
  [/\bhighlights? include/i, "'Highlights include'"],
  [/\b(?:newer|more powerful|faster|rarer|quicker|desirable|sought[- ]after|collectible|iconic|legendary|investment|bargain|deal|cheap|expensive|overpriced|underpriced|good value|steal|solid|nice|great|good|bad|tidy|pristine|immaculate|stunning|gorgeous|beautiful|worth a look)\b/i, "a judgement or a fact not in the tool results"],
  [/\b(?:I|I'm|I've|I'd|I'll)\b|\b(?:me|my|mine)\b/, "first person"],
  [/\b(?:[Ww]e|[Ww]e're|[Ww]e've|[Oo]ur|[Oo]urs)\b|\bus\b/, "first person plural"],
  [/\b(?:well|far|way|just|slightly)\s+(?:below|above|under|over)\b/i, "a judgement on the bid"],
  [/\b(?:should (?:you )?bid|whether (?:you|to) (?:should )?bid)\b/i, "comment on whether to bid"],
  // Sam never describes itself or its limits: facts, then the next step.
  [/\bSam (?:can only|only (?:shares?|states?|gives?|has|knows?)|(?:doesn'?t|does not|won'?t|will not|can'?t|cannot|isn'?t able to|is not able to) (?:give|offer|share|say|judge|tell|comment|make|provide|weigh)|has no (?:view|opinion))\b|\b(?:not a verdict|verdicts?|opinions?|those are the facts|the facts Sam has|facts Sam can)\b|\bSam (?:doesn'?t|does not|can'?t|cannot|never) (?:search|cover|see|find|access|track|include)\b|\bnot (?:a|an) (?:house|site|platform|auction) (?:Sam|GoAskSam)\b/i, "a sentence about Sam itself"],
  [/\b(?:valuation|worth|estimates?|good deal|overpriced|underpriced)\b/i, "a banned word"],
  // AI hype, and Sam describing what it is (a legitimate mention of AI is fine).
  [/\b(?:powered by AI|AI[- ]powered|AI[- ]driven|revolutionary|intelligent AI|cutting[- ]edge)\b/i, "AI hype"],
  [/\bSam is an AI\b|\bas an AI\b|\ban AI (?:model|assistant|system)\b|\blanguage model\b|\bSam is (?:a|an) (?:bot|chatbot|program)\b/i, "Sam describing what it is"],
  // A count never sits directly before a year or a generation number ("3 1966 Mustangs", "35 993s").
  [/(?<!(?:January|February|March|April|May|June|July|August|September|October|November|December)\s\d{0,2},?)(?<![\d,$])\b\d[\d,]*\s+(?:(?:19|20)\d{2}|\d{3}(?:\.\d)?|[A-Z]\d{2,3}[A-Z]?)\b/, "a count directly before a year or a generation number (put the years after the noun)"],
  [/\bthis VIN\b|\bSam found 1 /i, "write 'this car' and 'one', never 'this VIN' or 'found 1'"]
];
export function guardReply(reply, trace, userText, extraBlocks = []) {
  const reasons = [];
  const ok = allowedNumbers(trace, userText);
  const bad = (String(reply).match(numTok) || []).map(normNum).filter(n => n && !ok.has(n));
  if (bad.length) reasons.push("numbers not in this turn's tool results: " + [...new Set(bad)].join(", "));
  if ((String(reply).match(/\?/g) || []).length > 1) reasons.push("more than one question");
  else if (/\?\s*\S/.test(String(reply).trim())) reasons.push("the question must be the last sentence");
  const sentences = (String(reply).trim().match(/[.!?](?=\s+[A-Z0-9"]|\s*$)/g) || []).length;
  if (sentences > 3) reasons.push(`${sentences} sentences (at most 3)`);
  // The live bid is a fact on its own: never set against the range, in either word order.
  for (const sent of String(reply).split(/(?<=[.!?])\s+/)) {
    if (/\bbid\b/i.test(sent) && /\b(?:below|above|under|over|within|inside|outside|beneath|less than|more than|higher|lower|short of|cheap|cheaper|good|in line with|in the range)\b/i.test(sent) && /\b(?:range|sold|sales|most|typical|spec)\b/i.test(sent.replace(/\bbid\b/ig, ""))) { reasons.push(`the live bid compared with the range ("${sent.slice(0, 80)}")`); break; }
  }
  const q = (String(reply).match(/[^.!?]*\?/) || [""])[0];
  if (/\bor\b/i.test(q)) reasons.push(`a choice question ("${q.trim().slice(0, 80)}"): one offer only`);
  for (const [re, why] of BLOCKS.concat(extraBlocks)) { const m = re.exec(reply); if (m) reasons.push(why + ` ("${m[0]}")`); }
  return reasons;
}
// ---------------------------------------------------------------- a turn
// messages: [{role:"user"|"assistant", content:"..."}] (plain text history). Returns the reply, the
// cards' listing rows (to enrich), the updated state, and a trace of tool calls and results.
// surface: { system(ctx, today), tools, execTool(env, name, input, ctx), codeReply(trace, ctx),
//   override(trace, ctx) -> a reply built in code that replaces the model's (or null), extraBlocks,
//   rewriteHint } ; ctx is the surface's own per-turn state (cards, filters, ...).
// testDrafts (probe-only tests): replaces the model's first reply, then its regenerated reply, so the
// guard's block, regenerate and code-built fallback path can be exercised deterministically.
export async function runChatTurn(surface, { env, apiKey, model, messages, ctx, onText, onGuard, deadlineMs = 25000, testDrafts = null }) {
  const t0 = Date.now();
  const today = new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "America/Los_Angeles" });
  const system = surface.system(ctx, today);
  const convo = messages.map(m => ({ role: m.role === "assistant" ? "assistant" : "user", content: String(m.content || "").slice(0, 2000) })).filter(m => m.content);
  const usage = { input_tokens: 0, output_tokens: 0 }, trace = [];
  const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), deadlineMs);
  let reply = "", textOut = false, mustTool = false;
  try {
    // Search first, always: a turn that names a car must call a tool before any words.
    const lastUser = (convo.filter(m => m.role === "user").pop() || {}).content || "";
    mustTool = await namesCar(lastUser);
    for (let round = 0; round < 6; round++) {
      let roundText = "";
      const out = await claudeStream({ apiKey, model, system, tools: surface.tools, messages: convo, signal: ctl.signal, toolChoice: round === 0 && mustTool ? { type: "any" } : null,
        onText: t => { roundText += t; },
        onToolStart: () => { roundText = ""; } });
      usage.input_tokens += out.usage.input_tokens; usage.output_tokens += out.usage.output_tokens;
      // Text written before a tool call is withdrawn (the page clears it); only the answer stays.
      if (!out.content.some(b => b.type === "tool_use")) reply += roundText;
      const uses = out.content.filter(b => b.type === "tool_use");
      if (!uses.length || out.stop !== "tool_use") break;
      convo.push({ role: "assistant", content: out.content });
      const results = [];
      for (const u of uses) {
        const result = await surface.execTool(env, u.name, u.input, ctx);
        trace.push({ tool: u.name, input: u.input, result });
        results.push({ type: "tool_result", tool_use_id: u.id, content: JSON.stringify(result) });
      }
      convo.push({ role: "user", content: results });
    }
    // The guard: checked before anything reaches the page; one regeneration with the failure named.
    const userText = (convo.filter(m => m.role === "user" && typeof m.content === "string").pop() || {}).content || "";
    reply = polish(reply);
    if (testDrafts && testDrafts[0] != null) reply = polish(testDrafts[0]);
    // A surface may answer some turns entirely in code (Buy's "is it any good?").
    const forced = surface.override ? surface.override(trace, ctx) : null;
    if (forced) reply = polish(forced);
    // No words at all (the model spent every round on tools): the reply built in code, never a blank.
    if (!reply.trim()) { onGuard && onGuard({ attempt: 0, reasons: ["empty reply"], reply: "" }); reply = clean(surface.codeReply(trace, ctx)); }
    let reasons = guardReply(reply, trace, userText, surface.extraBlocks || []);
    if (reasons.length) {
      onGuard && onGuard({ attempt: 1, reasons, reply });
      convo.push({ role: "assistant", content: reply || "(empty)" });
      convo.push({ role: "user", content: "Rewrite your reply. It broke these rules: " + reasons.join("; ") + ". " + (surface.rewriteHint || "Use only the tool results above, no approximations, no judgements, nothing about Sam itself, third person.") });
      const out = await claudeStream({ apiKey, model, system, tools: surface.tools, messages: convo, signal: ctl.signal, onText: () => {} });
      usage.input_tokens += out.usage.input_tokens; usage.output_tokens += out.usage.output_tokens;
      reply = polish(out.content.filter(b => b.type === "text").map(b => b.text).join(""));
      if (testDrafts && testDrafts[1] != null) reply = polish(testDrafts[1]);
      reasons = guardReply(reply, trace, userText, surface.extraBlocks || []);
      if (reasons.length) { onGuard && onGuard({ attempt: 2, reasons, reply }); reply = clean(surface.codeReply(trace, ctx)); }
    }
    textOut = true; onText && onText(reply);
  } finally { clearTimeout(timer); }
  return { reply, textOut, ctx, usage, trace, ms: Date.now() - t0, forcedTool: mustTool };
}

