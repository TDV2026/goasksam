// THE HISTORY PAGES' WINDOW IS THE ENGINE'S (Sam, Oct 29 2026, one engine). The history pages worked out their window from a label and a day count: windowText mapped windowLabel to "the last twelve months" or "the past two
// years", windowStartIso counted 365, 730 or 1096 days back, poolWindow said "the past three years" for a thin read, and the spec rail tested a sale against 730 days. The engine states the window on every answer:
// windowPhrase (the clause after "sold": "in the last twelve months" or "since December 2025") and windowStart (the earliest sale counted). Cause: those fields did not exist as page-ready words, so the page made its own.
// Pages that print a window: the history VIN page (eyebrow, context line, comparison, spec rail, sales lists, other bodies), the history hub (lead, range card, rail), and nothing else reads windowLabel.
//   1. the engine states windowPhrase and windowStart (fake archive, real engine);
//   2. the page prints the engine's phrase: a sentinel phrase appears on every surface that prints a window, and a doctored windowLabel changes nothing;
//   3. static: no day count, no label mapping, no "past three years" in api/history.js.
//   node scripts/historyWindowCheck.mjs
import fs from "node:fs";
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
process.env.LAUNCH_STAGE = "2"; process.env.SUPABASE_URL = "https://example.supabase.co"; process.env.SUPABASE_SERVICE_ROLE_KEY = "x";
const base = JSON.parse(fs.readFileSync("scripts/fixtures/m3Answer.json", "utf8"));
const H = await import("../api/history.js");
const id = { make: "BMW", family: "M3", model: "M3", year: 2001, label: "BMW M3" };
const flat = h => String(h || "").replace(/<style[\s\S]*?<\/style>/g, "").replace(/<[^>]+>/g, " ").replace(/&#8217;/g, "’").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
// 2. the surfaces
const SENT = "SENTINEL WINDOW";
const ranged = { ...base, windowPhrase: SENT, windowStart: "2025-12-12", windowLabel: "last two years" };
const thin = { ...base, tier: "thin", cluster: null, poolN: 5, windowPhrase: SENT, windowStart: "2025-12-12", windowLabel: "past 5 years", thin: { receipts: [1, 2, 3, 4, 5] } };
const spread = { ...base, cluster: null, poolN: 12, windowPhrase: SENT, windowLabel: "last twelve months" };
ok(flat(H.oneBoxBlock(ranged, id, "/x", "")).includes("sold " + SENT), "the range card says sold + the engine's phrase");
ok(flat(H.oneBoxBlock(thin, id, "/x", "")).includes("sold " + SENT) && !/past three years|past two years|twelve months/.test(flat(H.oneBoxBlock(thin, id, "/x", ""))), "a thin read says the engine's phrase, not 'the past three years'");
ok(flat(H.oneBoxBlock(spread, id, "/x", "")).includes(SENT), "a spread-out read says the engine's phrase");
ok(H.hubWindow(ranged) === SENT && H.hubWindow({ ...ranged, windowLabel: "last twelve months", windowPhrase: null, windowWords: null }) === "", "the hub lead's window is the engine's phrase, and a label alone gives no clause");
ok(flat(H.oneBoxBlock({ ...ranged, windowLabel: "last twelve months" }, id, "/x", "")) === flat(H.oneBoxBlock({ ...ranged, windowLabel: "all years on record" }, id, "/x", "")), "a different windowLabel changes nothing on the page");
const none = { ...base, windowPhrase: null, windowWords: null, windowLabel: "last twelve months" };
ok(!/twelve|two years|three years/.test(flat(H.oneBoxBlock(none, id, "/x", ""))), "no engine phrase, no window clause (never a window the engine did not state)");
// 3. static
const src = fs.readFileSync("api/history.js", "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
for (const [re, what] of [[/windowLabel/, "reads windowLabel"], [/864e5\s*\)?\s*\.toISOString|\b(365|730|1096)\b/, "counts days for a window"], [/past (three|two) years|last (12|twelve) months|last 2 years/, "writes a window in words"], [/windowText|poolWindow|windowStartIso/, "keeps the old window helpers"]]) ok(!re.test(src), `api/history.js: no page-built window (${what})`);
// 1. the engine (fake archive, the real engine)
{
  const E = await import("../lib/onebox.js");
  const ev = (row, it) => { const ci = it.indexOf(":"); const alias = ci > 0 && it[ci + 1] !== ":" ? it.slice(0, ci) : null; const expr = alias ? it.slice(ci + 1) : it; if (expr.startsWith("raw_record->>")) { const k = expr.slice(13); const v = row.raw_record && row.raw_record[k]; return [alias || k, v == null ? null : String(v)]; } return [alias || expr, row[expr] ?? null]; };
  const likeRe = v => new RegExp("^" + String(v).replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$", "i");
  let rows = [], n = 0; const MK = "Testmake", day = i => new Date(Date.now() - i * 864e5).toISOString().slice(0, 10);
  const sale = (model, price, ago) => { n++; rows.push({ id: "00000000-0000-4000-8000-" + String(n).padStart(12, "0"), source_id: "w" + n, sale_price: price, sale_date: day(ago), platform: "Bring a Trailer", source_slug: "bringatrailer", make: MK, model, year: 2001, listing_title: `2001 ${MK} ${model}`, vin_norm: "V" + n, stated_mileage: null, project_flag: null, desc_facts: null, has_reserve: null, vehicle_type: "car", sale_price_usd: price, raw_record: { featured_image_url: "https://x/i.jpg", mileage: String(30000 + n * 300), body_style: "Coupe", modifications: null, title: `2001 ${MK} ${model}`, currency: "USD", transmission: null, exterior_color: null } }); };
  for (let i = 0; i < 16; i++) sale("Windowed", 30000 + (i % 5) * 400, 5 + i * 9);
  globalThis.fetch = async (url) => { const u = new URL(String(url)); if (u.pathname.endsWith("/sales_archive")) { const sp = u.searchParams, sel = sp.get("select"); const md = sp.get("model") && likeRe(sp.get("model").replace(/^ilike\./, "")); const keep = rows.filter(r => !md || md.test(r.model)); return new Response(JSON.stringify(keep.map(r => Object.fromEntries(sel.split(",").map(it => ev(r, it))))), { status: 200 }); } if (u.hostname.includes("fake.supabase")) return new Response("[]", { status: 200 }); throw new Error("offline"); };
  const a = (await E.oneEngineAnswer({ make: MK, model: "Windowed", trim: "", year: 2001, bodyStyle: null }, null, `2001 ${MK} Windowed`, { supabaseUrl: "https://fake.supabase.test", supabaseKey: "k", qelig: "compute", asked: 2 }, null)).raw;
  ok(a && /^(in the last twelve months|since [A-Z][a-z]+ \d{4})$/.test(String(a.windowPhrase || "")) && /^\d{4}-\d{2}-\d{2}$/.test(String(a.windowStart || "")), "the engine states windowPhrase and windowStart on the answer (" + (a && a.windowPhrase) + ", " + (a && a.windowStart) + ")");
}
console.log(`historyWindowCheck: ${pass} pass, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
