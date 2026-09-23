// Sam Desk request handler (Stage 1). Pure of Express: takes the request body +
// context, returns a plain { httpStatus, ...payload } object. Hosted inside
// api/sellerDecision.js (Hobby plan caps serverless functions at 12, so the Desk
// rides the existing crew-gated engine function rather than adding a new one).
import { validateDsl, echoChips } from "./query.js";
import { executeDsl } from "./execute.js";

const MAP_MODEL = process.env.SAM_MODEL || "claude-sonnet-4-6";

const MAP_SYSTEM = `You translate a plain-English question about the collector-car AUCTION MARKET into a single JSON object called a Desk DSL. You NEVER write SQL or prose. Output ONLY the JSON object, nothing else.

Shape:
{
  "filters": {
    "make": string?, "model": string?, "trim": string?,
    "descriptor": string?,           // a car phrase to resolve, e.g. "air-cooled 911", "E30 M3"
    "generation": string?,           // a generation code if explicitly named: "964","993","E30"
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
  "measures": string[],  // count, share, median, p25, p75, min, max, sell_through_rate, reserve_not_met_rate, withdrawn_rate, reserve_premium, trend, velocity, day_of_week_effect, month_effect, freshness
  "price_basis": "hammer"|"buyer_paid"?,   // default hammer
  "compare": { "dimension": string, "a": any, "b": any }?
}

Rules: NEVER emit "mean","average","midpoint" (banned). "how many"/"most"->count. "what did they bring"/"prices"->median,p25,p75,min,max. "which house"->groupBy ["venue"], channel "house". "live rooms/live sales only"->sale_type "live"; "online lots/sales"->sale_type "online". "sell-through"->measure sell_through_rate. "reserve not met/didn't sell/no sale + where it clusters"->outcome "reserve_not_met" and groupBy the clustering dimension (price_band or venue); "bid to" is shown automatically. "repeat sales/same car/flipped/time between"->measure "velocity". "day of week effect"->groupBy "day_of_week"; "listing length"->groupBy "listing_length". "over N years/months"->window; two years->"24mo", three years->"36mo", 18 months->"18mo" (if not in the allowed list use the nearest: 24mo). "by X by Y" / "by X, by Y"->groupBy [X,Y] (two dimensions). "this quarter vs last"/"quarter over quarter"->window "6mo" + add "quarter" to groupBy. A pure valuation question ("what's my car worth") is NOT answerable: return {"filters":{},"groupBy":[],"measures":[],"refusal":"valuation"}. Emit only fields you are confident about; omit the rest.

Examples:
Q: "Which house has sold the most air-cooled 911s in the last two years, and what did they bring?"
{"filters":{"make":"Porsche","model":"911","descriptor":"air-cooled 911","channel":"house","window":"24mo"},"groupBy":["venue"],"measures":["count","median","p25","p75","min","max"]}
Q: "Sell-through by price band on Bring a Trailer this quarter versus last."
{"filters":{"venue":"bringatrailer","channel":"online","window":"6mo"},"groupBy":["price_band","quarter"],"measures":["sell_through_rate","count"]}
Q: "E30 M3s: median and count by month over three years, houses and online."
{"filters":{"descriptor":"E30 M3","channel":"all","window":"36mo"},"groupBy":["month"],"measures":["median","count"]}
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
  const channelWord = dsl.filters.channel === "house" ? "at auction houses" : dsl.filters.channel === "online" ? "online" : "across online and house sales";
  sentences.push(`Over ${win}, the pool holds ${total} ${result.resolvedLabel} ${channelWord} sales.`);
  let observation = null;
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
  const caveats = [];
  if (result.coverage.rooms_inferred) caveats.push("rooms marked inferred are read from the house calendar, not the record");
  if (result.coverage.sale_type_inferred) caveats.push("live vs online is inferred from the house calendar where the record does not carry it");
  if (result.coverage.excluded_total) caveats.push(`${result.coverage.excluded_total} rows are shown excluded with a reason, not dropped`);
  if (result.answer.some(r => r.thin)) caveats.push("groups with fewer than 5 sales are shown as counts only, no spread");
  if (dsl.price_basis === "hammer") caveats.push("prices are implied hammer with house premiums backed out");
  if (result.coverage.generations && result.coverage.generations.length) caveats.push(`generations in scope: ${result.coverage.generations.join(", ")}`);
  if (caveats.length) sentences.push("Note: " + caveats.join("; ") + ".");
  return { text: sentences.join(" "), figures, observation };
}

function shapeRun(question, v, result) {
  if (!result.ok) {
    return { httpStatus: 200, status: result.reason === "unresolved_car" ? "unresolved" : "error", question, reason: result.reason, resolution: result.resolution || undefined, chips: echoChips(v.dsl) };
  }
  const read = buildRead(result, v.dsl);
  return {
    httpStatus: 200, status: "ok", question,
    echo: { chips: echoChips(v.dsl, result.resolvedLabel), dsl: v.dsl, ignored: v.ignored, notice: v.notice },
    answer: { dimension: result.primaryDimension, dimensions: (v.dsl.groupBy || []), measures: v.dsl.measures, total: result.total, rows: result.answer, priceLabel: result.priceLabel, outcome: result.outcome },
    velocity: result.velocity || null,
    receipts: result.receipts,
    read: read.text, read_figures: read.figures,
    coverage: result.coverage
  };
}

// ctx = { env:{supabaseUrl,supabaseKey}, apiKey, crew:bool, tester:bool, curtainSealed:bool }
export async function handleDeskRequest(body, ctx) {
  if (ctx.curtainSealed && !ctx.crew && !ctx.tester) return { httpStatus: 403, status: "sealed", error: "Not open yet." };
  const action = body.action || (body.question ? "run" : body.dsl ? "run" : null);

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
