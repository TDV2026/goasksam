// GoAskSam MCP server (the app for ChatGPT and Claude). Read-only, no sign-in (v1).
// MCP spec 2026-07-28 (the server echoes the client's negotiated protocolVersion), Streamable HTTP:
// a single JSON-RPC 2.0 endpoint at POST /api/mcp handling initialize, notifications/initialized,
// tools/list, tools/call, resources/list, resources/read. OpenAI Apps SDK: market_check returns a
// result card via _meta["openai/outputTemplate"] -> a ui:// HTML resource; the widget reads
// window.openai.toolOutput (structuredContent).
//
// It CALLS the existing engine (never forks it) and never edits Lane B/C files: market_check and
// where_to_sell reuse resolveVehicle + findGeneration + runOneBox / listSalesForVehicle (archive-only,
// ZERO OCD); car_history reuses vinAppearances. Guard rails: answers only (one car / <=20 rows, never
// a list of the archive), a per-client rate limit, and every call logged to mcp_calls.
import { supabaseEnv, supabaseInsert } from "../lib/_supabase.js";
import { marketCheck } from "../lib/tools/marketCheck.js";
import { carHistory } from "../lib/tools/carHistory.js";
import { whereToSell } from "../lib/tools/whereToSell.js";
import { summarize } from "../lib/tools/_shared.js";
import crypto from "node:crypto";

// The three tool handlers + their Sam's-voice summary live in lib/tools/ (one copy), so Lane C's /buy
// conversation imports them instead of keeping duplicates. This file is the MCP transport + guard rails.
const PROTOCOL = "2026-07-28";
const CARD_URI = "ui://widget/market_check.html";

// ---------- rate limit: in-memory token bucket per hashed client (per-minute + per-day) ----------
const PER_MIN = 20, PER_DAY = 400;
const buckets = new Map();
function rateLimit(clientId) {
  const now = Date.now();
  let b = buckets.get(clientId);
  if (!b) { b = { minStart: now, minN: 0, dayStart: now, dayN: 0 }; buckets.set(clientId, b); }
  if (now - b.minStart >= 60000) { b.minStart = now; b.minN = 0; }
  if (now - b.dayStart >= 86400000) { b.dayStart = now; b.dayN = 0; }
  if (b.minN >= PER_MIN || b.dayN >= PER_DAY) return { ok: false };
  b.minN++; b.dayN++; return { ok: true };
}

async function logCall(env, row) { try { await supabaseInsert("mcp_calls", [row], env.supabaseUrl, env.supabaseKey); } catch { /* best-effort */ } }

// ---------- MCP tool catalogue ----------
const TOOLS = [
  { name: "market_check", description: "What have cars like a given collector car actually sold for at auction? Input a plain-language car (for example 'manual 997 Carrera S coupe', '2008 C63 AMG', 'E39 M5'). Returns the exact spec understood, the hammer sold range, the number of recorded sales, the period, and the closest recorded sale with its link. If the car needs a clarifying question (which generation or body), it returns that question and its options so you can ask the user. Read-only.", inputSchema: { type: "object", properties: { car: { type: "string", description: "A plain-language collector car, e.g. 'manual 997 Carrera S coupe'." } }, required: ["car"] }, _meta: { "openai/outputTemplate": CARD_URI } },
  { name: "car_history", description: "The full auction appearance history for one specific car, by VIN or a listing URL. Returns each appearance (date, auction house, miles, sold or not sold, hammer price or high bid, reserve). Read-only.", inputSchema: { type: "object", properties: { vin_or_url: { type: "string", description: "A VIN / chassis number, or a collector-car auction listing URL." } }, required: ["vin_or_url"] } },
  { name: "where_to_sell", description: "Which auction platforms a given collector car has sold on, ranked by recorded sales, with the median hammer per platform. Input a plain-language car. Read-only; archive only.", inputSchema: { type: "object", properties: { car: { type: "string", description: "A plain-language collector car." } }, required: ["car"] } }
];

const CARD_HTML = `<div id="gas-card" class="gas"><div class="gas-inner"><div class="gas-eyebrow">GoAskSam</div><div class="gas-spec"></div><div class="gas-range"></div><div class="gas-meta"></div><a class="gas-link" target="_blank" rel="noopener">View on GoAskSam</a><div class="gas-foot">From GoAskSam</div></div></div>
<style>
#gas-card{font-family:Georgia,'Times New Roman',serif;background:#f6f1e7;color:#2a2622;border:1px solid #e3d9c6;border-radius:14px;padding:20px 22px;max-width:560px}
#gas-card .gas-eyebrow{font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#9a8f79}
#gas-card .gas-spec{font-size:20px;font-weight:700;margin:6px 0 2px}
#gas-card .gas-range{font-size:26px;font-weight:700;color:#1f1b17;margin:8px 0}
#gas-card .gas-meta{font-size:14px;color:#6b6456;line-height:1.5}
#gas-card .gas-link{display:inline-block;margin-top:12px;font-size:14px;color:#8a5a2b;text-decoration:none;border-bottom:1px solid #d8c6a6}
#gas-card .gas-foot{margin-top:12px;font-size:12px;color:#9a8f79;font-style:italic}
</style>
<script>
(function(){function r(){var o=(window.openai&&window.openai.toolOutput)||{};var c=document.getElementById('gas-card');if(!c)return;
c.querySelector('.gas-spec').textContent=o.spec||'';
var rg=o.soldRangeHammerUsd;c.querySelector('.gas-range').textContent=rg?(rg.low+' to '+rg.high+' hammer'):'';
var m=[];if(o.salesCount)m.push(o.salesCount+' recorded sales');if(o.period)m.push(o.period);
if(o.closestSale&&o.closestSale.hammerUsd)m.push('Closest sale: '+o.closestSale.title+', hammer '+o.closestSale.hammerUsd);
c.querySelector('.gas-meta').innerHTML=m.join('<br>');
var a=c.querySelector('.gas-link');if(o.link){a.href=o.link;}else{a.style.display='none';}}
if(window.openai&&window.openai.toolOutput){r();}else{window.addEventListener('openai:set_globals',r);setTimeout(r,200);}})();
</script>`;

function jsonrpc(id, result) { return { jsonrpc: "2.0", id, result }; }
function jsonrpcErr(id, code, message) { return { jsonrpc: "2.0", id, error: { code, message } }; }

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "content-type, authorization, mcp-protocol-version");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method === "GET") return res.status(200).json({ name: "GoAskSam", description: "Collector-car auction answers from real sales.", protocol: "mcp", endpoint: "/api/mcp" });
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  const env = supabaseEnv();
  const msg = req.body || {};
  const id = msg.id ?? null;
  const method = msg.method;

  if (method === "initialize") {
    const clientProto = msg.params && msg.params.protocolVersion;
    return res.status(200).json(jsonrpc(id, {
      protocolVersion: clientProto || PROTOCOL,
      capabilities: { tools: {}, resources: {} },
      serverInfo: { name: "GoAskSam", version: "1.0.0" }
    }));
  }
  if (method === "notifications/initialized" || method === "notifications/cancelled") return res.status(202).end();
  if (method === "ping") return res.status(200).json(jsonrpc(id, {}));
  if (method === "tools/list") return res.status(200).json(jsonrpc(id, { tools: TOOLS }));
  if (method === "resources/list") return res.status(200).json(jsonrpc(id, { resources: [{ uri: CARD_URI, name: "GoAskSam market card", mimeType: "text/html+skybridge" }] }));
  if (method === "resources/read") {
    const uri = msg.params && msg.params.uri;
    if (uri === CARD_URI) return res.status(200).json(jsonrpc(id, { contents: [{ uri: CARD_URI, mimeType: "text/html+skybridge", text: CARD_HTML }] }));
    return res.status(200).json(jsonrpcErr(id, -32602, "Unknown resource"));
  }
  if (method === "tools/call") {
    const t0 = Date.now();
    const name = msg.params && msg.params.name;
    const args = (msg.params && msg.params.arguments) || {};
    const clientName = (msg.params && msg.params._meta && msg.params._meta.clientName) || (req.headers["user-agent"] || "").slice(0, 60) || null;
    const clientId = crypto.createHash("sha256").update(String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "") + "|" + String(clientName)).digest("hex").slice(0, 24);
    const input = String(args.car || args.vin_or_url || "").slice(0, 200);
    const rl = rateLimit(clientId);
    if (!rl.ok) { await logCall(env, { tool: name, input, client_id: clientId, client_name: clientName, status: "rate_limited", result_kind: null, ms: 0 }); return res.status(200).json(jsonrpc(id, { content: [{ type: "text", text: "GoAskSam is catching its breath. Please try again in a minute." }], isError: true })); }
    if (!env) return res.status(200).json(jsonrpc(id, { content: [{ type: "text", text: "GoAskSam is unavailable right now." }], isError: true }));
    try {
      let out;
      if (name === "market_check") out = await marketCheck(input, env);
      else if (name === "car_history") out = await carHistory(input, env);
      else if (name === "where_to_sell") out = await whereToSell(input, env);
      else return res.status(200).json(jsonrpcErr(id, -32602, "Unknown tool"));
      const summary = summarize(name, out);
      const structured = { ...out, summary, attribution: "From GoAskSam" };
      const result = { content: [{ type: "text", text: summary + "\n\nFrom GoAskSam" + (out.link ? " " + out.link : "") }], structuredContent: structured };
      if (name === "market_check" && out.kind === "answer") result._meta = { "openai/outputTemplate": CARD_URI };
      await logCall(env, { tool: name, input, client_id: clientId, client_name: clientName, status: out.kind === "refusal" ? "refused" : "ok", result_kind: out.kind, ms: Date.now() - t0 });
      return res.status(200).json(jsonrpc(id, result));
    } catch (e) {
      await logCall(env, { tool: name, input, client_id: clientId, client_name: clientName, status: "error", result_kind: null, ms: Date.now() - t0 });
      return res.status(200).json(jsonrpc(id, { content: [{ type: "text", text: "GoAskSam had trouble reading that just now." }], isError: true }));
    }
  }
  return res.status(200).json(jsonrpcErr(id, -32601, "Method not found"));
}
