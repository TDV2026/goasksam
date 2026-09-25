// Sam Desk Stage B gate: the 30 test questions (spec s11) through the REAL interpreter (Claude),
// 3 runs each (determinism), matching the Stage A readings; plus the follow-up and clarification
// tests; plus reading-step timing (median + slowest). Runs in a real browser (Attack-Challenge safe).
//   node scripts/deskInterpretGate.mjs
import puppeteer from "puppeteer-core";
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE = (process.argv.find(a => a.startsWith("http")) || "https://goasksam.com").replace(/\/$/, "");
const b = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
const p = await b.newPage();
await p.setCookie({ name: "gas_crew", value: "ok", domain: new URL(BASE).hostname, path: "/" });
await p.goto(BASE + "/sell", { waitUntil: "networkidle2" });

const interp = (question, opts = {}) => p.evaluate(async (BASE, question, opts) => {
  const t0 = performance.now();
  const r = await fetch(BASE + "/api/sellerDecision", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ desk: true, action: "interpret", question, run: false, ...opts }) });
  const ms = Math.round(performance.now() - t0);
  const j = await r.json();
  return { ms, source: j.source, reading: j.reading, clarify: j.clarify, unsupported: j.unsupported, meta: j.meta, honest: j.honest_miss };
}, BASE, question, opts);

// compact signature of a reading for determinism comparison + expectation checks
const sig = (rd) => {
  if (!rd) return "";
  const sc = (rd.scopes || []).map(s => `${s.make} ${s.model}${s.generation ? "(" + s.generation + ")" : ""}`).sort().join(",");
  const gr = rd.grouping ? rd.grouping.name : "";
  const me = rd.metric ? (rd.metric.measure || "ASK") : "-";
  const wi = typeof rd.window === "string" ? rd.window : rd.window ? JSON.stringify(rd.window) : "-";
  const st = (rd.structural || []).map(s => s.kind + (s.dimension || "") + (s.n || "")).sort().join(",");
  const fl = JSON.stringify(rd.filters || {});
  return [sc, gr, me, wi, st, fl].join(" | ");
};

// expected facts per question (spec s11); check the telling fields, not an exact string
const EXP = {
  "best F-body cars from the 90s": r => r.clarify && has(r, "Camaro") && has(r, "Firebird") && era(r, 1990, 1999),
  "which Fox body Mustangs are rising fastest": r => has(r, "Mustang") && metric(r, "trend") && groupby(r, "model_year"),
  "air-cooled 911s under $100k sold this year": r => has(r, "911") && r.reading.filters.price && win(r, "ytd"),
  "Z28 vs Trans Am WS6, last 3 years": r => comparison(r) && has(r, "Camaro") && has(r, "Firebird") && win(r, "36mo"),
  "what 90s Japanese sports cars sold most on Cars & Bids": r => grouping(r, "90s Japanese") && metric(r, "count") && venue(r, "Cars & Bids"),
  "record sale for a BMW M3": r => has(r, "M3") && metric(r, "record"),
  "E30 M3s, median by month, three years, houses and online": r => has(r, "M3") && metric(r, "median") && groupby(r, "month"),
  "993 turbo, low-mile, last 18 months": r => has(r, "911") && r.reading.filters.mileage && win(r, "18mo"),
  "what's a 964 worth": r => has(r, "911") && metric(r, "median") && !r.unsupported,
  "Bird from the 70s": r => r.clarify,
  "Bird with a screaming chicken": r => has(r, "Firebird") && !r.clarify,
  "which house sold the most Lussos in the last two years": r => has(r, "Lusso") && groupby(r, "venue") && win(r, "24mo"),
  "Ferrari vs Lamborghini": r => r.clarify,
  "cheapest E30 M3 ever": r => has(r, "M3") && (metric(r, "median") || metric(r, "min")),
  "muscle cars under $50k on BaT": r => grouping(r, "muscle") && r.reading.filters.price && venue(r, "Bring a Trailer"),
  "how many E30 M3s resold since 2023": r => has(r, "M3") && metric(r, "velocity"),
  "Corvette C2 split window": r => has(r, "Corvette"),
  "manual 997 GT3s this year": r => has(r, "911") && trans(r, "manual") && win(r, "ytd"),
  "Porshe 356 speedster": r => has(r, "356"),
  "concours condition E-Types": r => has(r, "E-Type") && notapplied(r, "concours"),
  "is the Testarossa market softening": r => has(r, "Testarossa") && metric(r, "trend"),
  "Defender 90 NAS, this year vs last year": r => has(r, "Defender") && comparison(r),
  "what sold at Monterey this year over $1m": r => venueish(r, "Monterey") && r.reading.filters.price,
  "should I sell my 993 now": r => r.unsupported,
  "what will 993s be worth next year": r => r.unsupported,
  "what do you cover for Mecum": r => r.meta === "coverage",
  "WDBNG79J36A477562": r => has(r, "S-Class") || has(r, "S65") || (r.reading.scopes || []).length >= 1,
  "E30 vs E36 vs E46 M3": r => comparison(r) && (r.reading.scopes || []).filter(s => /M3/.test(s.model)).length >= 2,
  "anything sold last week for a Duesenberg": r => has(r, "Duesenberg") || has(r, "Model J"),
  "the frog": r => r.honest
};
function has(r, m) { return (r.reading.scopes || []).some(s => (s.model || "").includes(m) || (s.make || "").includes(m)) || (r.reading.grouping && (r.reading.grouping.members || []).some(s => (s.model || "").includes(m) || (s.make || "").includes(m))); }
function metric(r, m) { return r.reading.metric && r.reading.metric.measure === m; }
function grouping(r, n) { return r.reading.grouping && r.reading.grouping.name.toLowerCase().includes(n.toLowerCase()); }
function groupby(r, d) { return (r.reading.structural || []).some(s => s.kind === "group_by" && s.dimension === d); }
function comparison(r) { return (r.reading.structural || []).some(s => s.kind === "comparison"); }
function win(r, w) { return r.reading.window === w; }
function era(r, a, z) { const e = r.reading.filters.era; return e && e[0] === a && e[1] === z; }
function venue(r, v) { const x = r.reading.filters.venue; return x && String(Array.isArray(x) ? x[0] : x).includes(v); }
function venueish(r, v) { return venue(r, v) || (r.reading.filters.event && String(r.reading.filters.event.label || "").includes(v)); }
function trans(r, t) { return r.reading.filters.transmission === t; }
function notapplied(r, w) { return (r.reading.phrases || []).some(p => p.fate === "not_applied" && p.text.toLowerCase().includes(w)); }

const questions = Object.keys(EXP);
let pass = 0, det = 0; const times = []; const fails = [];
for (const q of questions) {
  const r1 = await interp(q); const r2 = await interp(q); const r3 = await interp(q);
  times.push(r1.ms);
  const s1 = sig(r1.reading), s2 = sig(r2.reading), s3 = sig(r3.reading);
  const deterministic = s1 === s2 && s2 === s3;
  if (deterministic) det++;
  let ok = false; try { ok = !!EXP[q](r1); } catch (e) { ok = false; }
  if (ok) pass++; else fails.push({ q, sig: s1, src: r1.source, clarify: !!r1.clarify, unsup: !!r1.unsupported, honest: !!r1.honest });
  console.log(`${ok ? "PASS" : "FAIL"} ${deterministic ? "[det]" : "[NON-DET]"} ${r1.source.padEnd(8)} ${r1.ms}ms  ${q}`);
}
times.sort((a, z) => a - z);
const median = times[Math.floor(times.length / 2)], slowest = times[times.length - 1];
console.log(`\n30-Q GATE: ${pass}/${questions.length} read correctly | determinism ${det}/${questions.length} | reading step median ${median}ms, slowest ${slowest}ms`);
if (fails.length) { console.log("FAILURES:"); fails.forEach(f => console.log("  " + f.q + "  -> " + f.sig + "  (src " + f.src + ", clarify " + f.clarify + ", unsup " + f.unsup + ", honest " + f.honest + ")")); }

// ---- follow-up test ----
console.log("\n--- FOLLOW-UP TEST ---");
let thread = (await interp("air-cooled 911s this year")).reading;
console.log("1) air-cooled 911s this year:", sig(thread));
thread = (await interp("under $100k", { threadReading: thread })).reading;
console.log("2) + under $100k:", sig(thread), "| price:", JSON.stringify(thread.filters.price));
thread = (await interp("online only", { threadReading: thread })).reading;
console.log("3) + online only:", sig(thread), "| channel:", thread.filters.channel);
thread = (await interp("drop the 964", { threadReading: thread })).reading;
console.log("4) + drop the 964:", sig(thread));

// ---- clarification test ----
console.log("\n--- CLARIFICATION TEST ---");
const c0 = await interp("best F-body cars from the 90s");
console.log("best F-body: clarify =", !!c0.clarify, c0.clarify ? "(" + (c0.clarify.options || []).join(" / ") + ")" : "");
const cTap = await interp("best F-body cars from the 90s, highest median", {});
const cType = await interp("highest", { threadReading: c0.reading });
console.log("answer by tap (highest median):", metricOf(cTap.reading), "| by typing 'highest':", metricOf(cType.reading));
function metricOf(rd) { return rd && rd.metric ? (rd.metric.measure || "ASK") : "-"; }

await b.close();
