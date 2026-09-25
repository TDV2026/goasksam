// Sam Desk request handler (Stage 1). Pure of Express: takes the request body +
// context, returns a plain { httpStatus, ...payload } object. Hosted inside
// api/sellerDecision.js (Hobby plan caps serverless functions at 12, so the Desk
// rides the existing crew-gated engine function rather than adding a new one).
import { validateDsl, echoChips } from "./query.js";
import { executeDsl } from "./execute.js";
import { supabaseSelect, supabaseInsert } from "../_supabase.js";
import { interpret } from "./interpret.js";
import { resolveVehicle } from "../vehicle.js";
import { logUnresolvedPhrase } from "./queue.js";

// A validated READING -> editable reading-card chips (spec s8 item; the card renders these).
function readingChips(reading) {
  const chips = [];
  for (const s of (reading.scopes || [])) chips.push({ type: "scope", label: [s.make, s.model, s.generation ? "(" + s.generation + ")" : "", s.trim || "", s.marketSpec ? s.marketSpec.toUpperCase() : ""].filter(Boolean).join(" ").trim(), editable: true });
  if (reading.grouping) chips.push({ type: "grouping", label: reading.grouping.name, members: reading.grouping.members.map(m => `${m.make} ${m.model}`), removable: true });
  const f = reading.filters || {};
  if (f.era) chips.push({ type: "era", label: `${f.era[0]} to ${f.era[1]}` });
  if (f.price) chips.push({ type: "price", label: (f.price.min ? "over $" + f.price.min.toLocaleString("en-US") : "") + (f.price.min && f.price.max ? " " : "") + (f.price.max ? "under $" + f.price.max.toLocaleString("en-US") : "") });
  if (f.mileage) chips.push({ type: "mileage", label: f.mileage.band + "-mile" + (f.mileage.threshold ? " (< " + f.mileage.threshold.toLocaleString("en-US") + ")" : ""), defaulted: true });
  if (f.channel) chips.push({ type: "channel", label: f.channel === "house" ? "auction houses" : f.channel === "online" ? "online" : "all channels" });
  if (f.venue) chips.push({ type: "venue", label: Array.isArray(f.venue) ? f.venue.join(" / ") : f.venue });
  if (f.body) chips.push({ type: "body", label: f.body });
  if (f.transmission) chips.push({ type: "transmission", label: f.transmission });
  if (reading.metric && reading.metric.measure) chips.push({ type: "metric", label: reading.metric.measure === "median" ? "median (not average)" : reading.metric.measure, defaulted: /default|single-car/.test(reading.metric.note || "") });
  if (reading.window) chips.push({ type: "window", label: typeof reading.window === "string" ? reading.window : `${reading.window.from || "…"} to ${reading.window.to || "…"}`, defaulted: !!reading.windowDefaulted });
  for (const st of (reading.structural || [])) chips.push({ type: "structural", label: st.kind === "comparison" ? "comparison" : st.kind === "limit" ? "top " + st.n : "by " + (st.dimension || "").replace(/_/g, " ") });
  return chips;
}
// not-applied notes in words (spec s7)
function notApplied(reading) { return (reading.phrases || []).filter(p => p.fate === "not_applied").map(p => ({ phrase: p.text, why: p.note || "not applied" })); }
// reading -> DSL for the ONE runnable single-car scope (Stage B renders the EXISTING answer under the card).
function readingToDsl(reading) {
  const s = (reading.scopes || [])[0]; if (!s || !s.make || !s.model) return null;
  const filters = { make: s.make, model: s.model };
  if (s.generation) filters.generation = s.generation;
  if (s.trim) filters.trim = s.trim;
  const f = reading.filters || {};
  if (f.channel) filters.channel = f.channel;
  if (f.venue) filters.venue = f.venue;
  if (f.transmission) filters.transmission = f.transmission;
  if (f.body) filters.body = f.body;
  if (typeof reading.window === "string") filters.window = reading.window;
  else if (reading.window && reading.window.from) { filters.sale_from = reading.window.from; if (reading.window.to) filters.sale_to = reading.window.to; }
  const measures = (reading.metric && reading.metric.measure) ? [reading.metric.measure] : undefined;
  const groupBy = (reading.structural || []).filter(x => x.kind === "group_by").map(x => x.dimension);
  return { filters, groupBy: groupBy.length ? groupBy : undefined, measures };
}

// PATCH helper for desk_saved_views (last_run stamping); returns true on success.
async function supabasePatch(env, pathAndQuery, body) {
  try {
    const r = await fetch(`${env.supabaseUrl}/rest/v1/${pathAndQuery}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", apikey: env.supabaseKey, Authorization: `Bearer ${env.supabaseKey}`, Prefer: "return=minimal" },
      body: JSON.stringify(body)
    });
    return r.ok;
  } catch { return false; }
}
async function supabaseDelete(env, pathAndQuery) {
  try { const r = await fetch(`${env.supabaseUrl}/rest/v1/${pathAndQuery}`, { method: "DELETE", headers: { apikey: env.supabaseKey, Authorization: `Bearer ${env.supabaseKey}` } }); return r.ok; } catch { return false; }
}
function runSummary(result) { return { total: result.total, rows: (result.answer || []).length, thin: !!result.thin, top: (result.answer || [])[0] ? { group: result.answer[0].group, count: result.answer[0].count, median: result.answer[0].median } : null }; }

const MAP_MODEL = process.env.SAM_MODEL || "claude-sonnet-4-6";

const MAP_SYSTEM = `You translate a plain-English question about the collector-car AUCTION MARKET into a single JSON object called a Desk DSL. You NEVER write SQL or prose. Output ONLY the JSON object, nothing else.

Shape:
{
  "filters": {
    "make": string?, "model": string?, "trim": string?,
    "descriptor": string?,           // a car phrase to resolve, e.g. "air-cooled 911", "E30 M3"
    "generation": string?,           // a named chassis/generation code ALWAYS goes here, never in descriptor: "964","993","e30","e46","g80"
    "channel": "online"|"house"|"all"?,   // "house"/"auction house(s)" -> "house"; "BaT/online" -> "online"
    "sale_type": "live"|"online"?,   // "live rooms/live sales only" -> "live"; "online lots/sales" -> "online" (house live room vs house online sale)
    "venue": string|string[]?,       // a named source, e.g. "bringatrailer","gooding"
    "outcome": "sold"|"reserve_not_met"|"withdrawn"|"all"?,  // default sold
    "window": "7d"|"30d"|"90d"|"6mo"|"12mo"|"24mo"|"36mo"|"qtd"|"ytd"|"this_quarter"|"last_quarter"|"this_year"|"last_year"?,
    "sale_from": "YYYY-MM-DD"?, "sale_to": "YYYY-MM-DD"?,
    "year_min": number?, "year_max": number?,
    "state": string?, "country": string?, "flags": ("modified"|"restored"|"matching_numbers"|"documented")[]?
  },
  "groupBy": string[],   // venue, sale_type, month, quarter, year, day_of_week, season, price_band, generation, model_year, transmission, channel
  "measures": string[],  // count, share, median, p25, p75, min, max, record, sell_through_rate, reserve_not_met_rate, withdrawn_rate, reserve_premium, trend, velocity, day_of_week_effect, month_effect, freshness
  "price_basis": "hammer"|"buyer_paid"?,   // default hammer
  "compare": { "dimension": string, "a": any, "b": any }?
}

Rules: NEVER emit "mean","average","midpoint" (banned). "every/all ... sales", "each" -> the whole nameplate, do NOT add year_min/year_max (a leading year like "1929 Duesenberg Model J" names the model era, not a filter; keep a year ONLY when the question is about that specific year's cars or a trim inherently tied to it, e.g. a 1973 Carrera RS 2.7). "rooms stated or inferred" / "with rooms" is a DISPLAY request, never a sale_type filter. Only set sale_type when the user explicitly says live-only or online-only. "how many"/"most"->count. "what did they bring"/"prices"->median,p25,p75,min,max. "record"/"highest"/"most expensive"/"priciest"/"top sale"/"record sale"->measures ["record"] (leads with the single highest sale + top five; do NOT add median for a record question; a record scans the full data so do NOT set a window unless the user names one). "which house"->groupBy ["venue"], channel "house". "live rooms/live sales only"->sale_type "live"; "online lots/sales"->sale_type "online". "sell-through"->measure sell_through_rate. "reserve not met/didn't sell/no sale + where it clusters"->outcome "reserve_not_met" and groupBy the clustering dimension (price_band or venue); "bid to" is shown automatically. "repeat sales/same car/flipped/time between"->measure "velocity". "day of week effect"->groupBy "day_of_week"; "listing length"->groupBy "listing_length". "over N years/months"->window; two years->"24mo", three years->"36mo", 18 months->"18mo" (if not in the allowed list use the nearest: 24mo). "by X by Y" / "by X, by Y"->groupBy [X,Y] (two dimensions). "this quarter vs last"/"quarter over quarter"->window "6mo" + add "quarter" to groupBy. A pure valuation question ("what's my car worth") is NOT answerable: return {"filters":{},"groupBy":[],"measures":[],"refusal":"valuation"}. Emit only fields you are confident about; omit the rest.

Examples:
Q: "Which house has sold the most air-cooled 911s in the last two years, and what did they bring?"
{"filters":{"make":"Porsche","model":"911","descriptor":"air-cooled 911","channel":"house","window":"24mo"},"groupBy":["venue"],"measures":["count","median","p25","p75","min","max"]}
Q: "Sell-through by price band on Bring a Trailer this quarter versus last."
{"filters":{"venue":"bringatrailer","channel":"online","window":"6mo"},"groupBy":["price_band","quarter"],"measures":["sell_through_rate","count"]}
Q: "E30 M3s: median and count by month over three years, houses and online."
{"filters":{"make":"BMW","model":"M3","generation":"e30","channel":"all","window":"36mo"},"groupBy":["month"],"measures":["median","count"]}
Q: "Where does reserve-not-met cluster for C2 Corvettes, and what were they bid to?"
{"filters":{"descriptor":"C2 Corvette","window":"18mo","outcome":"reserve_not_met"},"groupBy":["price_band"],"measures":["count","median","p25","p75"]}
Q: "Day of week and listing length effects for 964s online."
{"filters":{"descriptor":"964","channel":"online","window":"36mo"},"groupBy":["day_of_week"],"measures":["median","count"]}
Q: "Share of 250-series Ferrari sales by house, by year, three years."
{"filters":{"make":"Ferrari","model":"250","channel":"house","window":"36mo"},"groupBy":["venue","year"],"measures":["share","count","median"]}
Q: "Same-chassis repeat sales of 993 Turbos: time between and price change."
{"filters":{"descriptor":"993 Turbo","window":"36mo"},"groupBy":[],"measures":["velocity"]}
Q: "1929 Duesenberg Model J, every house sale, rooms stated or inferred."
{"filters":{"make":"Duesenberg","model":"Model J","channel":"house","window":"36mo"},"groupBy":["venue"],"measures":["count","median","p25","p75","min","max"]}
Q: "1973 Carrera RS 2.7 Lightweight"
{"filters":{"make":"Porsche","model":"911","trim":"Carrera RS 2.7 Lightweight","year_min":1973,"year_max":1973,"window":"36mo"},"groupBy":["venue"],"measures":["count","median"]}
Q: "what's the record sale for a BMW M3"
{"filters":{"make":"BMW","model":"M3"},"groupBy":[],"measures":["record"]}
Q: "most expensive air-cooled 911 ever sold"
{"filters":{"make":"Porsche","model":"911","descriptor":"air-cooled 911"},"groupBy":[],"measures":["record"]}
Q: "what's my car worth"
{"filters":{},"groupBy":[],"measures":[],"refusal":"valuation"}`;

async function mapQuestion(question, apiKey) {
  const body = {
    model: MAP_MODEL, max_tokens: 700, temperature: 0,   // deterministic: the same question maps to the same DSL
    system: [{ type: "text", text: MAP_SYSTEM, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: `Question: ${question}\nReturn only the JSON.` }]
  };
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify(body)
  });
  const data = await r.json();
  if (!r.ok) throw new Error(`map failed: ${r.status} ${JSON.stringify(data).slice(0, 200)}`);
  const text = (data.content && data.content[0] && data.content[0].text) || "";
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("mapper returned no JSON");
  return { raw: JSON.parse(m[0]), usage: data.usage };
}

function usd(n) { if (n == null) return "n/a"; return "$" + Math.round(n).toLocaleString("en-US"); }

// The read: generated ONLY from the structured result. Counts + caveats + at most one
// observation. Bans: worth/estimate/appraisal/valuation/predict/recommend.
function buildRead(result, dsl) {
  const figures = [];
  const total = result.total;
  const win = result.coverage.window;
  const dim = result.primaryDimension;
  const sentences = [];
  figures.push(`pool total ${total}`, `window ${win}`);

  // Record (single highest sale + top five; halos/race/restomods set aside via the shared rule).
  if (result.record) {
    const rec = result.record;
    const top = rec.top && rec.top[0];
    if (!top) return { text: `No qualifying ${result.resolvedLabel} sale to set a record from once halos, race cars and restomods are set aside. ${rec.definition}`, figures: [rec.definition], observation: null };
    const d = top.date ? String(top.date).slice(0, 10) : "n/a";
    sentences.push(`The record ${result.resolvedLabel} sale in our data is ${usd(top.hammer_usd)}: ${top.title || "listing"}, ${top.venue}${d !== "n/a" ? `, ${d}` : ""}.`);
    figures.push(`record ${top.hammer_usd}`, `record car ${top.title || ""}`, `top-five eligible of ${rec.eligible_total}`);
    if (rec.set_aside_total) { sentences.push(`${rec.set_aside_total} higher or special ${rec.set_aside_total === 1 ? "result is" : "results are"} set aside (halo, race car or restomod) and listed separately.`); figures.push(`set aside ${rec.set_aside_total}`); }
    sentences.push(rec.definition);
    // Coverage dates in "why this read": the record is only since our data begins, per source.
    if (rec.coverage_start) figures.push(`coverage begins ${rec.coverage_start}`);
    (rec.coverage_sources || []).forEach(s => figures.push(`coverage: ${s.source} since ${s.since || "?"}`));
    return { text: sentences.join(" "), figures, observation: null };
  }

  // Velocity (same-chassis repeats).
  if (result.velocity) {
    const chains = result.velocity;
    if (!chains.length) return { text: `No same-chassis repeat sales of ${result.resolvedLabel} in the pool over ${win}. A repeat needs the same VIN to appear twice with a recorded chassis.`, figures: [`pool ${total}`], observation: null };
    const ex = chains[0], p = ex.pairs && ex.pairs[0];
    sentences.push(`${chains.length} ${result.resolvedLabel} ${chains.length === 1 ? "chassis" : "chassis"} resold within ${win}.`);
    if (p) { sentences.push(`For example ${ex.chassis}: ${p.from_price != null ? usd(p.from_price) : "n/a"} then ${p.to_price != null ? usd(p.to_price) : "n/a"} ${p.months_between} months later${p.pct_change != null ? ` (${p.pct_change > 0 ? "+" : ""}${p.pct_change}%)` : ""}.`); figures.push(`repeat chassis ${chains.length}`, `example ${ex.chassis} ${p.pct_change}%`); }
    return { text: sentences.join(" "), figures, observation: null };
  }

  // Non-sold outcomes (reserve not met / withdrawn), online reporting platforms only.
  if (result.outcome === "reserve_not_met" || result.outcome === "withdrawn") {
    const word = result.outcome === "reserve_not_met" ? "reserve-not-met" : "withdrawn";
    if (!total) return { text: `No ${word} ${result.resolvedLabel} results over ${win} on the online platforms that report a result (Bring a Trailer, Cars & Bids, Hagerty, Sotheby's Motorsport, MB Market). Auction houses do not report no-sales, so this is not a house figure.`, figures: [`window ${win}`], observation: null };
    sentences.push(`${total} ${result.resolvedLabel} ${word} ${total === 1 ? "result" : "results"} over ${win} on the reporting online platforms.`);
    if (dim && result.answer.length) { const top = result.answer[0]; sentences.push(`Most cluster in ${top.group}${top.median != null ? `, bid to a median of ${usd(top.median)}` : ""} (${top.count} of ${total}).`); figures.push(`${top.group} ${top.count}`, top.median != null ? `bid-to median ${top.median}` : ""); }
    sentences.push("Note: this counts cars that did not sell; the price shown is the high bid they were bid to, not a sale. Houses are not included.");
    return { text: sentences.join(" "), figures: figures.filter(Boolean), observation: null };
  }

  if (total < 5) {
    sentences.push(`Only ${total} qualifying ${total === 1 ? "sale" : "sales"} in the pool over ${win}, which is too thin to read; the record is shown below without a computed spread.`);
    return { text: sentences.join(" "), figures, observation: null };
  }
  const channelWord = dsl.filters.channel === "house" ? "at the auction houses" : dsl.filters.channel === "online" ? "online" : "across online and house";
  sentences.push(`Over ${win}, the pool holds ${total} ${result.resolvedLabel} sales ${channelWord}.`);
  let observation = null;
  // Sell-through range across groups (a rate question).
  if (dsl.measures.includes("sell_through_rate")) {
    const rates = result.answer.filter(r => r.sell_through_rate != null).map(r => r.sell_through_rate);
    if (rates.length) { const lo = Math.min(...rates), hi = Math.max(...rates); sentences.push(`Sell-through runs from ${Math.round(lo * 100)}% to ${Math.round(hi * 100)}% across the ${result.primaryDimension ? result.primaryDimension.replace(/_/g, " ") + "s" : "groups"}.`); figures.push(`sell-through ${Math.round(lo * 100)}-${Math.round(hi * 100)}%`); }
  }
  if (dim === "venue" && result.answer.length) {
    const top = result.answer[0];
    figures.push(`${top.group} count ${top.count}`);
    let bit = `${top.group} accounts for the most at ${top.count} ${top.count === 1 ? "sale" : "sales"}`;
    if (top.median != null) { bit += `, median hammer ${usd(top.median)}`; figures.push(`${top.group} median ${top.median}`); }
    if (top.p25 != null && top.p75 != null) { bit += ` (p25 to p75 ${usd(top.p25)} to ${usd(top.p75)})`; figures.push(`${top.group} p25 ${top.p25}`, `${top.group} p75 ${top.p75}`); }
    bit += ".";
    observation = bit; sentences.push(bit);
    // Flag any venue whose house pool is mostly online lots (explains a lower median).
    const mostlyOnline = result.answer.filter(r => r.online_share != null && r.online_share >= 0.5);
    if (mostlyOnline.length) {
      const names = mostlyOnline.map(r => `${r.group} (${Math.round(r.online_share * 100)}% online)`);
      sentences.push(`${names.join(" and ")} ${mostlyOnline.length === 1 ? "is" : "are"} mostly online lots rather than live-room sales, which sits lower than the live rooms.`);
      mostlyOnline.forEach(r => figures.push(`${r.group} online share ${r.online_share}`));
    }
  } else if (result.answer.length === 1) {
    const a = result.answer[0];
    if (a.median != null) { sentences.push(`Median hammer is ${usd(a.median)} across ${a.count} sales (p25 to p75 ${usd(a.p25)} to ${usd(a.p75)}).`); figures.push(`median ${a.median}`); }
  }
  // (g) METHOD notes belong in "why this read" (figures), not the plain-English read: rooms inferred,
  // live/online inferred, premium back-out, generations in scope. Only a genuine DATA caveat that
  // changes how to read the numbers (excluded rows, thin groups) stays in the read itself.
  if (result.coverage.rooms_inferred) figures.push("method: rooms marked inferred are read from the house calendar, not the record");
  if (result.coverage.sale_type_inferred) figures.push("method: live vs online is inferred from the house calendar where the record does not carry it");
  if (dsl.price_basis === "hammer") figures.push("method: prices are implied hammer with house premiums backed out");
  if (result.coverage.generations && result.coverage.generations.length) figures.push(`method: generations in scope: ${result.coverage.generations.join(", ")}`);
  const caveats = [];
  if (result.coverage.excluded_total) caveats.push(`${result.coverage.excluded_total} rows are shown excluded with a reason, not dropped`);
  if (result.answer.some(r => r.thin)) caveats.push("groups with fewer than 5 sales are shown as counts only, no spread");
  if (caveats.length) sentences.push("Note: " + caveats.join("; ") + ".");
  return { text: sentences.join(" "), figures, observation };
}

// Chart specs, derived deterministically from the DSL groupBy + measures + result. Every spec
// references fields already in the answer/receipts payload; a spec is emitted ONLY when it can be
// drawn from real data points (no invented bins/buckets/smoothing). The renderer draws exactly this.
function buildChartSpecs(dsl, result) {
  const gb = dsl.groupBy || [];
  const TIME = ["month", "quarter", "year"];
  const isSeg = d => d === "venue" || d === "generation";
  const specs = [];
  const timeDim = gb.find(d => TIME.includes(d));
  const priceBasis = (result.coverage && result.coverage.price_basis) || "hammer";
  if (timeDim) {
    const other = gb.find(d => d !== timeDim);
    if (other && isSeg(other)) {
      specs.push({ type: "stacked", x: timeDim, segment: other, thin: 5, basis: priceBasis, title: `Share by ${other} over ${timeDim}` });
    } else {
      specs.push({ type: "line", x: timeDim, y: "median", series: other || null, pool: result.total, mode: result.total >= 300 ? "median_whisker" : "dots", basis: priceBasis, title: `Median over ${timeDim}${other ? " by " + other.replace(/_/g, " ") : ""}` });
    }
  } else if (gb[0]) {
    specs.push({ type: "bars", x: gb[0], y: dsl.measures.includes("median") && !dsl.measures.includes("sell_through_rate") ? "median" : "count", basis: priceBasis, title: `${gb[0].replace(/_/g, " ")} comparison` });
  }
  // Distribution strip: whenever kept receipts carry a USD price. Scale is log when the range
  // exceeds 20x (labelled), else linear. Grouped by generation if that's the grouping, else venue.
  const priced = (result.receipts || []).filter(r => !r.excluded && r.hammer_usd > 0).map(r => r.hammer_usd);
  if (priced.length >= 2) {
    const mn = Math.min(...priced), mx = Math.max(...priced);
    specs.push({ type: "strip", by: gb.includes("generation") ? "generation" : "venue", cap: 500, scale: (mx / mn > 20) ? "log" : "linear", basis: priceBasis, title: "Where sales land" });
  }
  return specs;
}

function shapeRun(question, v, result) {
  if (!result.ok) {
    return { httpStatus: 200, status: result.reason === "unresolved_car" ? "unresolved" : "error", question, reason: result.reason, resolution: result.resolution || undefined, chips: echoChips(v.dsl) };
  }
  const read = buildRead(result, v.dsl);
  return {
    httpStatus: 200, status: "ok", question,
    summary: runSummary(result),
    echo: { chips: echoChips(v.dsl, result.resolvedLabel), dsl: v.dsl, ignored: v.ignored, notice: v.notice },
    answer: { dimension: result.primaryDimension, dimensions: (v.dsl.groupBy || []), measures: v.dsl.measures, total: result.total, rows: result.answer, priceLabel: result.priceLabel, outcome: result.outcome },
    charts: buildChartSpecs(v.dsl, result),
    velocity: result.velocity || null,
    record: result.record || null,
    gen_title_fixed: result.genTitleFixed || 0,
    receipts: result.receipts,
    strip_receipts: result.stripReceipts || null,
    strip_sampled: result.stripSampled || null,
    read: read.text, read_figures: read.figures,
    coverage: result.coverage
  };
}

// ctx = { env:{supabaseUrl,supabaseKey}, apiKey, crew:bool, tester:bool, curtainSealed:bool }
export async function handleDeskRequest(body, ctx) {
  if (ctx.curtainSealed && !ctx.crew && !ctx.tester) return { httpStatus: 403, status: "sealed", error: "Not open yet." };
  const action = body.action || (body.question ? "run" : body.dsl ? "run" : null);
  const org = ctx.org || "sam";

  // ---- Saved views (the "Watch" layer), per org ----
  if (action === "save_view") {
    const v = validateDsl(body.dsl);
    if (!v.dsl) return { httpStatus: 200, status: "invalid", errors: v.errors };
    const name = String(body.name || "").trim() || (body.question ? String(body.question).slice(0, 80) : "Untitled view");
    const row = { org_id: org, created_by: ctx.seat || "crew", name, question: body.question || null, dsl: v.dsl, last_run_at: new Date().toISOString(), last_summary: body.summary || null };
    const res = await supabaseInsert("desk_saved_views", [row], ctx.env.supabaseUrl, ctx.env.supabaseKey, "return=representation", "");
    if (res.error) return { httpStatus: 200, status: "save_error", error: res.error };
    return { httpStatus: 200, status: "saved", view: (res.rows && res.rows[0]) || row };
  }
  if (action === "list_views") {
    const rows = await supabaseSelect(ctx.env, `desk_saved_views?select=id,name,question,dsl,last_run_at,last_summary,updated_at&org_id=eq.${encodeURIComponent(org)}&order=updated_at.desc&limit=100`);
    return { httpStatus: 200, status: "views", views: rows || [] };
  }
  if (action === "delete_view") {
    const ok = await supabaseDelete(ctx.env, `desk_saved_views?id=eq.${encodeURIComponent(body.id)}&org_id=eq.${encodeURIComponent(org)}`);
    return { httpStatus: 200, status: ok ? "deleted" : "delete_error", id: body.id };
  }
  if (action === "rerun_view") {
    const rows = await supabaseSelect(ctx.env, `desk_saved_views?select=id,name,question,dsl,last_summary&org_id=eq.${encodeURIComponent(org)}&id=eq.${encodeURIComponent(body.id)}&limit=1`);
    const view = rows && rows[0];
    if (!view) return { httpStatus: 200, status: "no_view", id: body.id };
    const v = validateDsl(view.dsl);
    if (!v.dsl) return { httpStatus: 200, status: "invalid", errors: v.errors };
    const result = await executeDsl(v.dsl, ctx.env, {});
    const shaped = shapeRun(view.question, v, result);
    // what changed since last run
    const prev = view.last_summary || null, now = runSummary(result);
    shaped.changed_since = prev ? { total_delta: now.total - (prev.total || 0), prev_total: prev.total, now_total: now.total, prev_top: prev.top, now_top: now.top } : { first_run: true };
    shaped.view = { id: view.id, name: view.name };
    await supabasePatch(ctx.env, `desk_saved_views?id=eq.${encodeURIComponent(view.id)}`, { last_run_at: new Date().toISOString(), last_summary: now, updated_at: new Date().toISOString() });
    return { ...shaped, httpStatus: 200, status: "rerun" };
  }

  // STAGE B: the interpreter + reading card. Produce the structured reading (with phrase fates) and,
  // for a single runnable scope, render the EXISTING answer under it (answer layout unchanged; Stage D).
  if (action === "interpret") {
    const question = String(body.question || "").trim();
    if (!question) return { httpStatus: 400, error: "no question" };
    const resolveResidual = async (t) => { try { const r = await resolveVehicle(t, {}); const v = r && r.vehicle; return v && v.make && v.model ? { make: v.make, model: v.model, generation: v.generation || null, trim: v.trim || null, year: v.year || null } : null; } catch { return null; } };
    const out = await interpret(question, { apiKey: ctx.apiKey, env: ctx.env, resolveResidual, threadReading: body.threadReading || null, recentReadings: body.recentReadings || [] });
    const reading = out.reading;
    // no silent drops: log every unresolved phrase to the review queue (service role only)
    for (const p of (reading.phrases || [])) if (p.fate === "unresolved") await logUnresolvedPhrase(ctx.env, { phrase: p.text, question, orgId: ctx.org || "global" }).catch(() => {});
    const resp = {
      httpStatus: 200, status: "interpreted", question,
      reading, chips: readingChips(reading), not_applied: notApplied(reading),
      clarify: reading.clarify || null, unsupported: reading.unsupported ? { reason: "prediction/advice", message: "The Desk reports what the market did, with the receipts. It does not predict or advise. I can show the trend, or where cars like this are selling." } : null,
      meta: reading.meta || null, honest_miss: reading.honestMiss || false,
      understanding_layer: reading.understandingLayer || "ok",
      validation: { ok: out.validation.ok, runnable: out.validation.runnable, unresolved: out.validation.unresolved },
      source: out.source, ms: out.ms
    };
    // Render the existing single-car answer under the card when the reading is one runnable scope with
    // a computable read and no clarify/refuse/comparison/grouping (those are Stage C/D).
    const runnable = reading.scopes.length === 1 && !reading.clarify && !reading.unsupported && !reading.meta && !reading.grouping && !(reading.structural || []).some(s => s.kind === "comparison");
    if (body.run !== false && runnable) {
      const dsl = readingToDsl(reading); const v = dsl ? validateDsl(dsl) : { dsl: null };
      if (v.dsl) { try { const result = await executeDsl(v.dsl, ctx.env, { vehicle: reading.scopes[0] }); resp.answer = shapeRun(question, v, result); } catch (e) { resp.answer_error = String(e.message || e); } }
    }
    return resp;
  }

  if (action === "map" || (action === "run" && body.question && !body.dsl)) {
    const question = String(body.question || "").trim();
    if (!question) return { httpStatus: 400, error: "no question" };
    if (!ctx.apiKey) return { httpStatus: 500, error: "mapper unavailable (no ANTHROPIC_API_KEY)" };
    let mapped;
    try { mapped = await mapQuestion(question, ctx.apiKey); }
    catch (e) { return { httpStatus: 200, status: "map_error", error: String(e.message || e) }; }
    if (mapped.raw && mapped.raw.refusal === "valuation") {
      return { httpStatus: 200, status: "refused", reason: "valuation", question,
        message: "The Desk does not value individual cars. It reports what the market did, with the receipts. For a single car's market reference, use the Leads car read." };
    }
    const v = validateDsl(mapped.raw);
    if (action === "map") return { httpStatus: 200, status: "mapped", question, dsl: v.dsl, ignored: v.ignored, errors: v.errors, notice: v.notice, chips: echoChips(v.dsl) };
    if (!v.dsl) return { httpStatus: 200, status: "invalid", question, errors: v.errors, ignored: v.ignored };
    const result = await executeDsl(v.dsl, ctx.env, { vehicle: body.vehicle });
    return shapeRun(question, v, result);
  }

  if (action === "run") {
    const v = validateDsl(body.dsl);
    if (!v.dsl) return { httpStatus: 200, status: "invalid", errors: v.errors, ignored: v.ignored };
    const result = await executeDsl(v.dsl, ctx.env, { vehicle: body.vehicle });
    return shapeRun(null, v, result);
  }
  return { httpStatus: 400, error: "unknown action" };
}
