// Sam Desk golden for the two pre-Stage-C fixes (production, browser = Attack-Challenge safe):
//   Fix 1 — the all-time RECORD returns a correct in-model receipt in under 3s for cheap models on
//           pricey marques (944 Turbo etc.), not empty / a wrong model / a 24-month fallback.
//   Fix 2 — air-cooled 911s shows its generations as removable members; "drop the 964" removes it;
//           a follow-up the Desk cannot apply says so in words (no silent no-op).
//   node scripts/deskStageBFixesGolden.mjs
import puppeteer from "puppeteer-core";
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE = (process.argv.find(a => a.startsWith("http")) || "https://goasksam.com").replace(/\/$/, "");
const b = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
const p = await b.newPage();
await p.setCookie({ name: "gas_crew", value: "ok", domain: new URL(BASE).hostname, path: "/" });
await p.goto(BASE + "/sell", { waitUntil: "networkidle2" });
let fails = 0; const ck = (n, ok, d = "") => { console.log((ok ? "PASS" : "FAIL") + "  " + n + (ok ? "" : "  -> " + d)); if (!ok) fails++; };

const rec = (make, model, trim) => p.evaluate(async (BASE, make, model, trim) => {
  const filters = { make, model }; if (trim) filters.trim = trim; const vehicle = { make, model }; if (trim) vehicle.trim = trim;
  const t0 = performance.now();
  const r = await fetch(BASE + "/api/sellerDecision", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ desk: true, action: "run", dsl: { filters, groupBy: [], measures: ["record"] }, vehicle }) });
  const ms = Math.round(performance.now() - t0); const j = await r.json(); const R = (j.answer && j.answer.record) || j.record || null; const top = (R && R.top || [])[0];
  return { ms, wk: R && R.window_kind, price: top && (top.hammer_usd || top.price), title: top && (top.title || top.raw_title), venue: top && top.venue, date: top && (top.date || top.sale_date) };
}, BASE, make, model, trim);

console.log("=== Fix 1: record path (all-time, <3s, correct model, with receipt) ===");
const RECS = [
  ["BMW", "M3", null, /m3/i], ["Porsche", "944", "Turbo", /944/i], ["BMW", "2002tii", null, /2002/i],
  ["Mercedes-Benz", "190E", "2.3-16", /190/i], ["Datsun", "240Z", null, /240 ?z/i]
];
for (const [mk, mo, tr] of RECS) await rec(mk, mo, tr);   // warm
for (const [mk, mo, tr, re] of RECS) {
  const r = await rec(mk, mo, tr);
  const label = mk + " " + mo + (tr ? " " + tr : "");
  console.log(`  ${label}: $${r.price} — ${r.title || "?"} — ${r.venue || "?"} ${r.date || ""} (${r.ms}ms, ${r.wk})`);
  ck(`${label}: record present`, !!r.price, JSON.stringify(r));
  ck(`${label}: all-time path`, r.wk === "all_time", "window=" + r.wk);
  ck(`${label}: under 3s`, r.ms < 3000, r.ms + "ms");
  ck(`${label}: receipt is the right model`, !!(r.title && re.test(r.title)), r.title || "no title");
}

console.log("\n=== Fix 2: air-cooled 911s members + drop + cannot-apply ===");
const interp = (q, tr) => p.evaluate(async (BASE, q, tr) => {
  const body = { desk: true, action: "interpret", question: q, run: false }; if (tr) body.threadReading = tr;
  const r = await fetch(BASE + "/api/sellerDecision", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json();
  return { reading: j.reading, cannot: j.cannot_apply, members: (j.reading && j.reading.grouping && j.reading.grouping.members || []).map(m => m.generation || m.label || m.model) };
}, BASE, q, tr);
const a = await interp("air-cooled 911s under $100k sold this year");
console.log("  members:", a.members.join(", "));
ck("air-cooled shows 4 removable generation members", a.members.length === 4 && a.reading.grouping && a.reading.grouping.sameModel, JSON.stringify(a.members));
ck("air-cooled reads as a single median (not count ranking)", a.reading.metric && a.reading.metric.measure === "median", JSON.stringify(a.reading.metric));
const dropped = await interp("drop the 964", a.reading);
console.log("  after 'drop the 964':", dropped.members.join(", "));
ck("'drop the 964' removes the 964 member", dropped.members.length === 3 && !dropped.members.some(m => /964/.test(m)), JSON.stringify(dropped.members));
const bad = await interp("drop the Cayenne", a.reading);
ck("'drop the Cayenne' says so in words (no silent no-op)", !!bad.cannot && /cayenne/i.test(bad.cannot), bad.cannot || "(no message)");
console.log("  cannot-apply:", bad.cannot);

await b.close();
console.log(`\n${fails ? fails + " FAILURE(S)" : "All Stage B fix checks passed."}`);
process.exit(fails ? 1 : 0);
