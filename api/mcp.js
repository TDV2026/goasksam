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
import { supabaseEnv, supabaseInsert, supabaseSelect } from "../lib/_supabase.js";
import { vinAppearances, historyEnv, normVin, carIdentity, carSlug } from "./_historyData.js";
import { resolveVehicle, sanitizeResolvedVehicle } from "../lib/vehicle.js";
import { findGeneration } from "../lib/generations.js";
import { runOneBox, listSalesForVehicle } from "../lib/onebox.js";
import crypto from "node:crypto";

const PROTOCOL = "2026-07-28";
const SITE = "https://goasksam.com";
const MAX_RESULTS = 20;
const CARD_URI = "ui://widget/market_check.html";

// ---------- Sam's voice (third person; no dashes; banned words; never a live-bid verdict / source count) ----------
const BANNED = /\b(valuation|valued|worth|estimate[sd]?|apprais\w*|AI\b)\b/gi;
function sam(s) {
  return String(s || "")
    .replace(/[‒-―−]/g, ", ").replace(/ -- /g, ", ").replace(/ - /g, ", ")
    .replace(BANNED, m => ({ valuation: "market read", valued: "sold", worth: "sold for", estimate: "record", estimates: "records", estimated: "recorded", appraisal: "record", appraised: "recorded", AI: "GoAskSam" }[m.toLowerCase()] || "record"))
    .replace(/\s+/g, " ").trim();
}
const usd = n => (Number.isFinite(Number(n)) && Number(n) > 0 ? "$" + Math.round(Number(n)).toLocaleString() : null);

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

// ---------- shared: resolve plain text to a vehicle, archive-only ----------
async function resolveSpec(text) {
  const resolution = await resolveVehicle(text).catch(() => null);
  const v = resolution && resolution.vehicle;
  if (!v || !v.make) return { question: (resolution && resolution.clarification && resolution.clarification.question) || "Which car is it? A year, make and model works best." };
  if (!v.model) return { question: `Which ${v.make} model is it?` };
  const vehicle = sanitizeResolvedVehicle(v) || v;
  vehicle.raw = vehicle.raw || text;
  return { vehicle };
}

function specLabel(rc) { return rc ? [rc.year, rc.make, rc.model, rc.trim, rc.bodyStyle].filter(Boolean).join(" ") : null; }
function pageLink(rc) {
  const q = specLabel(rc) || "";
  return `${SITE}/onebox?q=${encodeURIComponent(q)}`;
}

// ---------- TOOL: market_check ----------
async function marketCheck(text, env) {
  const r = await resolveSpec(text);
  if (r.question) return { kind: "question", question: sam(r.question), options: [] };
  const generation = await findGeneration(r.vehicle, env).catch(() => null);
  let d = await runOneBox(r.vehicle, generation, r.vehicle.raw, { supabaseUrl: env.supabaseUrl, supabaseKey: env.supabaseKey, asked: 0 }, null).catch(() => null);
  if (d && /_choice$/.test(String(d.tier || ""))) {
    const opts = (d.variantOptions || d.gearboxOptions || d.genChoices || (d.clarification && d.clarification.options) || []).map(o => (typeof o === "string" ? o : (o.label || o.value || o.q))).filter(Boolean).slice(0, 8);
    return { kind: "question", question: sam(d.question || (d.clarification && d.clarification.question) || "Which exact version is it?"), options: opts, spec: specLabel(d.resolvedCar) };
  }
  if (!d || !d.tier) return { kind: "refusal", reason: sam("There is no recorded sales history to read for that car yet."), spec: specLabel(d && d.resolvedCar) };
  const rc = d.resolvedCar || r.vehicle;
  const spec = specLabel(rc);
  const closestRaw = d.representative && d.representative.closest;
  const closest = closestRaw ? {
    title: closestRaw.ctitle || closestRaw.title || spec,
    url: closestRaw.srcurl || closestRaw.url || closestRaw.srcurl2 || null,
    hammerUsd: usd(closestRaw.value || closestRaw.usd || closestRaw.priceUsd),
    date: (closestRaw.date || "").slice(0, 10) || null
  } : null;
  const cluster = Array.isArray(d.cluster) && d.cluster.length === 2 ? d.cluster : null;
  const link = pageLink(rc);
  if (cluster) {
    return {
      kind: "answer", spec,
      soldRangeHammerUsd: { low: usd(cluster[0]), high: usd(cluster[1]) },
      salesCount: Number(d.poolN) || null, period: d.windowLabel || null,
      closestSale: closest, link
    };
  }
  // tier present but no cluster: honest thin / too-spread -> lead with the closest sale, no headline band
  return { kind: "refusal", spec, reason: sam(d.tier === "thin" ? "Too few recorded sales of this exact car to mark a typical band yet." : "The recorded sales are too spread out to mark a typical band."), closestSale: closest, link };
}

// ---------- TOOL: car_history ----------
async function carHistory(input, env) {
  let vin = normVin(input);
  if (!(vin && vin.length >= 6) && /^https?:\/\//i.test(String(input).trim())) {
    // a listing URL -> find its VIN in the archive, then read the history
    const u = String(input).trim();
    const rows = await supabaseSelect(env, `sales_archive?or=(raw_record->>url.eq.${encodeURIComponent(u)},raw_record->>source_url.eq.${encodeURIComponent(u)})&select=vin_norm&limit=1`).catch(() => null);
    if (rows && rows[0] && rows[0].vin_norm) vin = normVin(rows[0].vin_norm);
  }
  if (!(vin && vin.length >= 6)) return { kind: "refusal", reason: sam("That does not look like a VIN or a listing link GoAskSam can match.") };
  const data = await vinAppearances(env, vin);
  if (!data || !data.ok || !data.appearances.length) return { kind: "refusal", vin, reason: sam("GoAskSam has no recorded auction appearances for that car.") };
  // Reserve isn't in vinAppearances' output (Lane C), so read has_reserve from the archive and merge by date.
  const resMap = {};
  try {
    const [sR, aR] = await Promise.all([
      supabaseSelect(env, `sales_archive?vin_norm=eq.${encodeURIComponent(vin)}&select=sale_date,has_reserve`),
      supabaseSelect(env, `auction_attempts?chassis_vin_norm=eq.${encodeURIComponent(vin)}&select=attempt_date,has_reserve`)
    ]);
    for (const x of [...(sR || []), ...(aR || [])]) { const dd = String(x.sale_date || x.attempt_date || "").slice(0, 10); if (dd && x.has_reserve != null) resMap[dd] = x.has_reserve; }
  } catch { /* reserve is additive */ }
  const apps = data.appearances.slice(0, MAX_RESULTS).map(a => {
    const rv = resMap[a.date];
    return {
      date: a.date || null, house: a.house || null, miles: Number.isFinite(a.mileage) ? a.mileage : null,
      result: a.kind === "sale" ? "sold" : "not sold", reserve: rv == null ? null : (rv ? "reserve" : "no reserve"),
      hammerUsd: a.kind === "sale" ? usd(a.priceUsd) : null, highBidUsd: a.kind === "sale" ? null : usd(a.bidUsd), url: a.url || null
    };
  });
  let id = null; try { id = await carIdentity(data.appearances, vin); } catch { /* */ }
  const link = id ? `${SITE}/history/${carSlug(id)}/${vin}` : `${SITE}/vin/${vin}`;
  return { kind: "answer", vin, car: id ? [id.year, id.make, id.family].filter(Boolean).join(" ") : null, appearances: apps, link };
}

// ---------- TOOL: where_to_sell (archive-only; platforms where the spec has sold) ----------
async function whereToSell(text, env) {
  const r = await resolveSpec(text);
  if (r.question) return { kind: "question", question: sam(r.question) };
  const generation = await findGeneration(r.vehicle, env).catch(() => null);
  const lst = await listSalesForVehicle(r.vehicle, generation, { supabaseUrl: env.supabaseUrl, supabaseKey: env.supabaseKey }).catch(() => null);
  const sales = (lst && lst.ok && Array.isArray(lst.sales)) ? lst.sales : [];
  if (!sales.length) return { kind: "refusal", spec: specLabel(r.vehicle), reason: sam("GoAskSam does not have enough recorded sales of this car yet to say where it sells best.") };
  const by = new Map();
  for (const s of sales) {
    const plat = s.platform || s.source || s.source_slug; if (!plat) continue;
    const u = Number(s.priceUsd) || null;
    const b = by.get(plat) || { platform: plat, sales: 0, prices: [] };
    b.sales++; if (u) b.prices.push(u); by.set(plat, b);
  }
  const ranked = [...by.values()].sort((a, z) => z.sales - a.sales).slice(0, MAX_RESULTS).map(b => {
    b.prices.sort((a, z) => a - z); const mid = b.prices.length ? b.prices[Math.floor(b.prices.length / 2)] : null;
    return { platform: b.platform, sales: b.sales, medianHammerUsd: usd(mid) };
  });
  return { kind: "answer", spec: specLabel(r.vehicle), platforms: ranked, link: pageLink(r.vehicle) };
}

// ---------- Sam's-voice one-liner summaries per tool ----------
function summarize(tool, out) {
  if (out.kind === "question") return sam(out.question);
  if (out.kind === "refusal") return sam(out.reason + (out.closestSale && out.closestSale.hammerUsd ? ` The closest recorded sale is ${out.closestSale.title}, hammer ${out.closestSale.hammerUsd}.` : ""));
  if (tool === "market_check") {
    const r = out.soldRangeHammerUsd;
    let s = `Cars like the ${out.spec} have sold between ${r.low} and ${r.high} at the hammer`;
    if (out.period) s += ` over ${out.period.toLowerCase()}`;
    s += ".";
    if (out.closestSale && out.closestSale.hammerUsd) s += ` The closest recorded sale is the ${out.closestSale.title}, hammer ${out.closestSale.hammerUsd}.`;
    return sam(s);
  }
  if (tool === "car_history") {
    const sold = out.appearances.filter(a => a.result === "sold");
    const last = sold[0] || out.appearances[0];
    let s = out.car ? `This ${out.car} ` : "This car ";
    s += sold.length ? `has sold at auction ${sold.length === 1 ? "once" : sold.length + " times"}` : `has been offered at auction without selling`;
    if (last) s += `, most recently ${last.result} ${last.hammerUsd ? "for " + last.hammerUsd + " at the hammer " : ""}${last.house ? "at " + last.house + " " : ""}${last.date ? "in " + last.date : ""}`.replace(/\s+/g, " ").trimEnd();
    return sam(s + ".");
  }
  if (tool === "where_to_sell") {
    const top = out.platforms[0];
    return sam(top ? `Cars like the ${out.spec} have sold most on ${top.platform}${top.medianHammerUsd ? `, where the median hammer was ${top.medianHammerUsd}` : ""}.` : `GoAskSam cannot yet say where the ${out.spec} sells best.`);
  }
  return "";
}

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
