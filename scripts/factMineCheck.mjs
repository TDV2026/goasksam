// factMineCheck (Lane B, Nov 17 2026, lane-b-factmine; order bc85): the value driver miner, its map and its report, on fixtures and a fake database (no network, no model).
//  1 THE MINER IS BLIND: the prompt the model receives holds the description and the car's year, model and variant, and never a price, a bid, an outcome, a comment or a seller (the fixtures carry a marker in every such field; one mutant per field puts it in the prompt).
//  2 A SPAN OR NOTHING: an item whose quote is not inside the text read, or whose category, type or polarity is not in its list, is dropped; a kept item's span is the quote's place in the text.
//  3 IDEMPOTENT: a second run for the same listings and miner version asks the model nothing and writes nothing.
//  4 THE DOOR: an unwindowed call, a window over 366 days, more than 25 listings, a token cap over its limit, a source without full text and a family not in the pilot are refused before anything is read.
//  5 THE TOKEN CAP stops a call; a listing with no text is skipped without the model; missing tables refuse cleanly.
//  6 NO TASK RETURNS TEXT: the answers of the four tasks hold numbers and short labels only (a marker inside every description never appears), and what is written holds no quote and no text.
//  7 THE MAP never merges opposite meanings (repainted and original paint, accident and no accident), whatever the model said; it is idempotent.
//  8 THE REPORT: counts by topic, source and year, the type and polarity split, the date and mileage shares and the pairs, from counts alone.
//   node scripts/factMineCheck.mjs [repo root]      --mutants breaks one rule at a time (each must fail)
import fs from "node:fs"; import path from "node:path"; import { spawnSync } from "node:child_process"; import { fileURLToPath, pathToFileURL } from "node:url";
const args = process.argv.slice(2), here = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.resolve(args.find(a => !a.startsWith("--")) || path.join(here, ".."));
if (args.includes("--mutants")) process.exit(mutants());
process.chdir(ROOT);
const imp = f => import(pathToFileURL(path.join(ROOT, f)).href);
const FM = await imp("lib/factMine.js"), MAP = await imp("lib/factMap.js"), REP = await imp("lib/factReport.js");
let pass = 0, fail = 0; const fails = []; const ok = (n, c, d) => { if (c) pass++; else { fail++; fails.push(n + (d !== undefined ? " " + JSON.stringify(d).slice(0, 240) : "")); } };

// ---- fixtures: seven sold e46 M3 listings, each carrying a marker in every field the miner must never see ----------------------
const DESC = i => `This ${2003 + (i % 3)} BMW M3 has been repainted in the original color and the timing chain guides were replaced at 61,000 miles in 2022. Service records are included from new. No accidents, clean title. DESCMARK${i}. The car has 62,000 miles and the original 19 inch wheels.`.repeat(2);
const ROWS = Array.from({ length: 7 }, (_, i) => ({ source_id: "S" + (100 + i), listing_title: `${2003 + (i % 3)} BMW M3 ${i % 2 ? "Convertible" : "Coupe"}`, year: 2003 + (i % 3), sale_date: `2026-0${1 + (i % 5)}-1${i}`, description: DESC(i), project_flag: null, sale_price_usd: 3133700 + i, high_bid: null,
  raw_record: { title: "x", description: DESC(i), price: "PRICEMARK" + i, high_bid: "BIDMARK" + i, status: "OUTCOMEMARK" + i, seller: "SELLERMARK" + i, seller_username: "SELLERMARK" + i, comments: ["COMMENTMARK" + i], has_reserve: false } }));
const MARKERS = ["PRICEMARK", "BIDMARK", "OUTCOMEMARK", "SELLERMARK", "COMMENTMARK", "31337"];   // 31337xx is the sale price column
const mkDb = (rows = ROWS) => {
  const db = { runs: new Map(), mentions: [], map: [], inserts: 0, modelCalls: 0, prompts: [], selects: [], tablesMissing: false };
  db.select = async qs => {
    db.selects.push(qs);
    if (qs.startsWith("sales_archive?")) { const off = Number((/offset=(\d+)/.exec(qs) || [0, 0])[1]), lim = Number((/limit=(\d+)/.exec(qs) || [0, 100])[1]); return rows.slice(off, off + lim); }
    if (qs.startsWith("listing_mining_runs?")) { if (db.tablesMissing) return null; const m = /listing_id=in\.([^&]*)/.exec(qs); if (m) { const ids = decodeURIComponent(m[1]).replace(/[()"]/g, "").split(","), ver = (/miner_version=eq\.([^&]*)/.exec(qs) || [0, null])[1]; return ids.filter(i => db.runs.has(i) && (!ver || db.runs.get(i).miner_version === ver)).map(i => ({ listing_id: i, status: db.runs.get(i).status })); } return [...db.runs.values()].filter(r => r.status === "done").slice(0, 1000); }
    if (qs.startsWith("listing_mentions?")) { if (db.tablesMissing) return null; const off = Number((/offset=(\d+)/.exec(qs) || [0, 0])[1]), lim = Number((/limit=(\d+)/.exec(qs) || [0, 1000])[1]); return db.mentions.slice(off, off + lim); }
    if (qs.startsWith("topic_map?")) { if (db.tablesMissing) return null; const off = Number((/offset=(\d+)/.exec(qs) || [0, 0])[1]), lim = Number((/limit=(\d+)/.exec(qs) || [0, 1000])[1]); return db.map.slice(off, off + lim); }
    return [];
  };
  db.insert = async (table, rs) => { db.inserts++; if (table === "listing_mining_runs") for (const r of rs) db.runs.set(r.listing_id, r); else if (table === "listing_mentions") db.mentions.push(...rs); else if (table === "topic_map") { for (const r of rs) if (!db.map.some(m => m.raw_topic === r.raw_topic && m.family === r.family && m.map_version === r.map_version)) db.map.push(r); } return {}; };
  db.model = text => async ({ system, user }) => { db.modelCalls++; db.prompts.push({ system, user }); return { text: typeof text === "function" ? text(user) : text, usage: { input_tokens: 1200, output_tokens: 300 }, stop_reason: "end_turn" }; };
  db.callModel = a => db.model(GOOD)(a);
  return db;
};
const quoteOf = (d, i) => d.slice(d.indexOf(i), d.indexOf(i) + i.length);
const L = (topic, cat, type, pol, d, m, quote) => [topic, cat, type, pol, d ? "D" : "-", m ? "M" : "-", quote].join(" | ");
const GOOD = user => [
  L("repainted", "paint and body", "work_done", "neutral", 0, 0, "repainted in the original color"),
  L("timing chain guides replaced", "mechanical work", "work_done", "positive", 1, 1, "timing chain guides were replaced at 61,000 miles in 2022"),
  L("service records", "documentation", "claim", "positive", 0, 0, "Service records are included from new"),
  L("no accidents", "accident and title", "absence_stated", "positive", 0, 0, "No accidents, clean title"),
  L("invented fact", "other", "claim", "neutral", 0, 0, "this sentence is not in the description"),
  "no quote | other | claim | neutral | - | -",
  L("bad category", "weather", "claim", "neutral", 0, 0, "original 19 inch wheels"),
  L("bad type", "other", "rumour", "neutral", 0, 0, "original 19 inch wheels"),
  L("bad polarity", "other", "claim", "great", 0, 0, "original 19 inch wheels")].join("\n");
const Q = { source: "bringatrailer", family: "e46_m3", from: "2026-01-01", to: "2026-12-31" };

// ===== 1 BLIND =====
{ const db = mkDb(), r = await FM.runFactMine({ ...Q, limit: 7 }, db);
  ok("the call ran and mined the seven listings", r.ok && r.body.mined === 7, r.body || r);
  const all = db.prompts.map(p => p.system + "\n" + p.user).join("\n");
  for (const m of MARKERS) ok(`the prompt never holds the ${m.replace("MARK", "").toLowerCase()} field (marker ${m})`, !all.includes(m));
  ok("the prompt holds the description and the car's year, model and variant", db.prompts.every((p, i) => /Car: 200\d BMW M3 \(E46\), variant: (Coupe|Convertible)/.test(p.user) && p.user.includes("DESCRIPTION:\n") && /DESCMARK\d/.test(p.user)), db.prompts[0] && db.prompts[0].user.slice(0, 160));
  ok("the prompt builder takes year, model, variant and text and nothing else (its source names no price, bid, outcome, comment or seller field)", (() => { const src = FM.buildPrompt.toString(); return !/price|bid|outcome|comment|seller|raw_record|status/i.test(src.replace(/function buildPrompt\(\{ year, model, variant, text \}\)/, "")); })(), FM.buildPrompt.toString().slice(0, 120));
}
// ===== 2 SPANS =====
{ const text = "A short test text with repainted paint and service records inside it. ".repeat(3);
  const p = FM.parseItems([L("repainted", "paint and body", "work_done", "neutral", 0, 0, "repainted paint"), L("ghost", "other", "claim", "neutral", 0, 0, "never written here"), "x | other | claim | neutral | - | -",
    L("records", "documentation", "claim", "positive", 0, 0, "SERVICE RECORDS inside")].join("\n"), text);
  ok("an item whose quote is in the text is kept and its span is the quote's place in the text", p.items.length === 2 && p.items[0].span_start === text.indexOf("repainted paint") && p.items[0].span_end === p.items[0].span_start + "repainted paint".length, p.items[0]);
  ok("an item whose quote is not in the text, or that has no quote, is dropped", p.dropped === 2 && !p.items.some(i => i.topic === "ghost" || i.topic === "x"), p);
  ok("every kept span lies inside the text read", p.items.every(i => i.span_start >= 0 && i.span_end <= text.length && i.span_end > i.span_start));
  ok("an unreadable answer is bad, not an item", FM.parseItems("no lines here", text).bad === true);
  const db = mkDb(); await FM.runFactMine({ ...Q, limit: 1 }, db);
  ok("what is written: only the kept items (an invented quote, no quote, a bad category, type or polarity are dropped), 4 of 9", db.mentions.length === 4, db.mentions.map(m => m.topic));
  ok("every written mention has a span inside the text read and no quote or text field", db.mentions.every(m => m.span_start >= 0 && m.span_end > m.span_start && m.span_end <= db.runs.get(m.listing_id).characters_read && !("quote" in m) && !("text" in m) && !("description" in m)), db.mentions[0]);
}
// ===== 3 IDEMPOTENT =====
{ const db = mkDb(); db.model0 = db.model; const a = await FM.runFactMine({ ...Q, limit: 7 }, { select: db.select, insert: db.insert, callModel: db.model(GOOD) });
  const calls1 = db.modelCalls, ins1 = db.inserts, men1 = db.mentions.length;
  const b = await FM.runFactMine({ ...Q, limit: 7 }, { select: db.select, insert: db.insert, callModel: db.model(GOOD) });
  ok("a second run asks the model nothing and writes nothing", b.ok && db.modelCalls === calls1 && db.inserts === ins1 && db.mentions.length === men1 && b.body.mined === 0 && b.body.already_mined === 7, [b.body, db.modelCalls, calls1, db.inserts, ins1]);
  ok("a first run wrote one run row per listing", db.runs.size === 7 && [...db.runs.values()].every(r => r.status === "done" && r.miner_version === FM.MINER_VERSION), db.runs.size);
}
// ===== 4 THE DOOR =====
{ const refuse = async (q, why) => { const db = mkDb(), r = await FM.runFactMine(q, { select: db.select, insert: db.insert, callModel: db.model(GOOD) }); ok(`refused: ${why}`, r.ok === false && r.status === 400 && db.selects.length === 0 && db.modelCalls === 0 && db.inserts === 0, r); };
  await refuse({ source: "bringatrailer", family: "e46_m3" }, "an unwindowed call");
  await refuse({ ...Q, from: "2025-01-01", to: "2026-01-03" }, "a window over 366 days");
  await refuse({ ...Q, limit: 26 }, "more than 25 listings");
  await refuse({ ...Q, tokenCap: 999999 }, "a token cap over its limit");
  await refuse({ ...Q, source: "collectingcars" }, "a source without full text");
  await refuse({ ...Q, family: "p996_mezger" }, "a family not in the pilot");
  await refuse({ ...Q, to: "2025-12-31" }, "a window that ends before it starts");
  const db = mkDb(), r = await FM.runFactMine({ ...Q, from: "2026-01-01", to: "2027-01-02", limit: 25 }, { select: db.select, insert: db.insert, callModel: db.model(GOOD) });
  ok("a window of 366 days and 25 listings is allowed", r.ok === true, r.why);
}
// ===== 5 TOKEN CAP, NO TEXT, MISSING TABLES =====
{ const db = mkDb(), r = await FM.runFactMine({ ...Q, limit: 7, tokenCap: 1000 }, { select: db.select, insert: db.insert, callModel: db.model(GOOD) });
  ok("the token cap stops the call after the listing that reached it (1500 tokens a listing, cap 1000: one listing)", r.ok && r.body.stopped === "token_cap" && r.body.mined === 1 && db.modelCalls === 1, r.body);
  const short = mkDb([{ ...ROWS[0], description: "too short", raw_record: { ...ROWS[0].raw_record, description: "too short" } }]); const r2 = await FM.runFactMine({ ...Q }, { select: short.select, insert: short.insert, callModel: short.model(GOOD) });
  ok("a listing with no text is skipped without the model and has a run row", r2.ok && r2.body.skipped_no_text === 1 && short.modelCalls === 0 && [...short.runs.values()][0].status === "skipped_no_text", r2.body);
  const miss = mkDb(); miss.tablesMissing = true; const r3 = await FM.runFactMine({ ...Q }, { select: miss.select, insert: miss.insert, callModel: miss.model(GOOD) });
  ok("missing tables refuse cleanly and nothing is asked or written", r3.ok === false && r3.status === 409 && /docs\/supabase-factmine\.sql/.test(r3.why) && miss.modelCalls === 0 && miss.inserts === 0, r3);
  const bad = mkDb(), r4 = await FM.runFactMine({ ...Q, limit: 2 }, { select: bad.select, insert: bad.insert, callModel: bad.model("I cannot do that") });
  ok("an unreadable answer is a failed run (retried next time), not a done one", r4.ok && r4.body.failed === 2 && [...bad.runs.values()].every(r => r.status === "failed") && bad.mentions.length === 0, r4.body);
}
// ===== 6 NO TASK RETURNS TEXT =====
{ const long = "x".repeat(300); let threw = false; try { FM.assertCountsOnly({ a: long }); } catch { threw = true; }
  ok("a long string in an answer is refused (assertCountsOnly)", threw); let threw2 = false; try { FM.assertCountsOnly({ a: { b: [1, "ok", true] } }); } catch { threw2 = true; } ok("numbers and short labels pass", !threw2);
  const db = mkDb(), dep = { select: db.select, insert: db.insert, callModel: db.model(GOOD) }, a = await FM.runFactMine({ ...Q, limit: 7 }, dep);
  const mp = await MAP.runFactMap({ family: "e46_m3" }, { select: db.select, insert: db.insert, callModel: db.model(JSON.stringify({ groups: [] })) }), rp = await REP.runFactReport({ family: "e46_m3" }, dep);
  for (const [n, o] of [["factmine", a], ["factmap", mp], ["factreport", rp]]) ok(`${n} returns no description text, quote or seller`, o.ok && !/DESCMARK|SELLERMARK|PRICEMARK|repainted in the original color/.test(JSON.stringify(o.body)), o.why);
  ok("what is written holds no description, price, bid, outcome, comment or seller text", !/DESCMARK|SELLERMARK|PRICEMARK|BIDMARK|OUTCOMEMARK|COMMENTMARK/.test(JSON.stringify([...db.mentions, ...db.runs.values(), ...db.map])));
}
// ===== 7 THE MAP =====
{ const db = mkDb(); await FM.runFactMine({ ...Q, limit: 7 }, { select: db.select, insert: db.insert, callModel: db.model(GOOD) });
  // add raw topics that a model would be tempted to merge
  for (const t of ["original paint", "repainted", "accident", "no accident", "accident free", "timing chain replaced", "timing chain guides replaced", "rust on subframe", "no rust", "original engine", "engine replaced"]) db.mentions.push({ listing_id: "bringatrailer:S100", source: "bringatrailer", topic: t, statement_type: "claim", polarity: "neutral", has_date: false, has_mileage: false });
  const greedy = JSON.stringify({ groups: [{ canonical: "paint", members: ["original paint", "repainted"] }, { canonical: "accident history", members: ["accident", "no accident", "accident free"] }, { canonical: "timing chain work", members: ["timing chain replaced", "timing chain guides replaced"] }, { canonical: "rust", members: ["rust on subframe", "no rust"] }, { canonical: "engine", members: ["original engine", "engine replaced"] }, { canonical: "ghost", members: ["never asked label"] }] });
  const m1 = await MAP.runFactMap({ family: "e46_m3", limit: 300 }, { select: db.select, insert: db.insert, callModel: db.model(greedy) });
  ok("the map ran", m1.ok, m1.why); const cm = new Map(db.map.map(r => [r.raw_topic, r.canonical_topic]));
  ok("repainted and original paint stay apart", cm.get("repainted") !== cm.get("original paint"), [cm.get("repainted"), cm.get("original paint")]);
  ok("accident and no accident stay apart", cm.get("accident") !== cm.get("no accident"), [cm.get("accident"), cm.get("no accident")]);
  ok("rust and no rust stay apart; original engine and engine replaced stay apart", cm.get("rust on subframe") !== cm.get("no rust") && cm.get("original engine") !== cm.get("engine replaced"));
  ok("the same fact in different words is one topic (timing chain replaced and timing chain guides replaced)", cm.get("timing chain replaced") === cm.get("timing chain guides replaced") && !!cm.get("timing chain replaced"), [cm.get("timing chain replaced"), cm.get("timing chain guides replaced")]);
  ok("a label the model did not ask about is not written; a label it left out stands alone", !cm.has("never asked label") && cm.get("service records") === "service records");
  const n1 = db.map.length, c1 = db.modelCalls; const m2 = await MAP.runFactMap({ family: "e46_m3", limit: 300 }, { select: db.select, insert: db.insert, callModel: db.model(greedy) });
  ok("a second run maps nothing new and asks the model nothing", m2.ok && db.map.length === n1 && db.modelCalls === c1 && m2.body.asked === 0, m2.body);
  ok("the guard's meaning key separates negation and the paint, accident and part classes", MAP.meaningKey("no accident") !== MAP.meaningKey("accident") && MAP.meaningKey("repainted") !== MAP.meaningKey("original paint") && MAP.meaningKey("timing chain replaced") === MAP.meaningKey("timing chain guides replaced"));
  ok("the map refuses a family outside the pilot and a bad limit", (await MAP.runFactMap({ family: "x" }, db)).ok === false && (await MAP.runFactMap({ family: "e46_m3", limit: 999 }, db)).ok === false);
}
// ===== 8 THE REPORT =====
{ const runs = [], mentions = [], sales = new Map(), map = [{ raw_topic: "service records", canonical_topic: "service records" }, { raw_topic: "records from new", canonical_topic: "service records" }];
  for (let i = 0; i < 20; i++) { const src = i < 12 ? "bringatrailer" : "carsandbids", id = `${src}:L${i}`; runs.push({ listing_id: id, source: src, sold_or_attempt: "sold", characters_read: 2000 }); sales.set(id, { sale_date: i % 2 ? "2025-05-05" : "2026-02-02" });
    if (i < 10) mentions.push({ listing_id: id, source: src, topic: i % 2 ? "service records" : "records from new", statement_type: "claim", polarity: "positive", has_date: i < 4, has_mileage: false });
    if (i === 1) mentions.push({ listing_id: id, source: src, topic: "records from new", statement_type: "claim", polarity: "positive", has_date: false, has_mileage: false });   // two spellings of one canonical topic on one listing count once
    if (i % 4 === 0) mentions.push({ listing_id: id, source: src, topic: "repainted", statement_type: "work_done", polarity: "neutral", has_date: false, has_mileage: true }); }
  const rpt = REP.reportFrom({ runs, mentions, map, sales }, { family: "e46_m3", map: "m1", top: 10 }), t = rpt.topics.find(x => x.topic === "service records"), rp = rpt.topics.find(x => x.topic === "repainted");
  ok("a canonical topic counts its raw spellings once per listing: 10 of 20 listings, 50%", !!t && t.listings === 10 && t.share_of_listings_pct === 50, t);
  ok("by source and by sale year", t && t.by_source.bringatrailer === 10 && !t.by_source.carsandbids && t.by_source_share_pct.bringatrailer === 83.3 && t.by_sale_year["2025"] === 5 && t.by_sale_year["2026"] === 5, t && [t.by_source, t.by_sale_year]);
  ok("statement type, polarity, and the date and mileage shares", t.statement_types.claim === 11 && t.polarity.positive === 11 && t.mentions === 11 && t.with_a_date_pct === 36.4 && rp.with_a_mileage_pct === 100, [t.with_a_date_pct, rp && rp.with_a_mileage_pct]);
  ok("a topic not in the map stands as its own words", !!rp && rp.listings === 5, rp);
  ok("pairs: listings with both and the lift over chance", rpt.pairs.length === 1 && rpt.pairs[0].listings_with_both === 3 && Math.abs(rpt.pairs[0].lift - 1) < 0.5 && rpt.mined_listings === 20, rpt.pairs);
  ok("the report holds counts only", (() => { try { FM.assertCountsOnly(rpt); return true; } catch { return false; } })());
}
// ===== 9 THE NEW MINER (Lane D, lane-d-factmine-2): the prompt, the compact answer, the cut-off answer, the time budget =====
const section = async (name, fn) => { try { await fn(); } catch (e) { ok(name + " ran without throwing", false, String(e && e.message || e).slice(0, 160)); } };
const rowsN = (n, desc) => Array.from({ length: n }, (_, i) => ({ source_id: "N" + (1000 + i), listing_title: "2004 BMW M3 Coupe", year: 2004, sale_date: "2026-03-1" + (i % 9), description: desc || DESC(i), project_flag: null, sale_price_usd: 4000000 + i, high_bid: null, raw_record: { description: desc || DESC(i) } }));
const mine = (db, q, extra) => FM.runFactMine({ ...Q, ...q }, { select: db.select, insert: db.insert, callModel: db.callModel2 || db.model(GOOD), ...(extra || {}) });
const withTimeout = (p, ms) => Promise.race([p, new Promise(res => setTimeout(() => res("HUNG"), ms))]);
await section("prompt", async () => {
  const S = FM.SYSTEM;
  ok("the prompt skips standard equipment and plain feature lists, and names examples", /SKIP:/.test(S) && /every car of this model has/.test(S) && /standard equipment/.test(S) && /climate control/.test(S) && /cruise control/.test(S) && /plain lists of features/.test(S), S.slice(0, 120));
  ok("the prompt keeps condition, faults, work and when, accident and paint history, rust, originality and modifications, ownership and location, service records, stated absences and named packages", ["condition present", "faults and wear", "work done and when", "accident and paint history", "rust", "originality and modifications", "ownership and location history", "service records and paperwork", "stated absences", "factory packages or rare options named as such"].every(w => S.includes(w)));
  ok("the prompt orders by buyer weight and caps at 30 items", /most likely to matter to a buyer first/.test(S) && /At most 30 items/.test(S) && FM.MAX_ITEMS === 30);
  ok("the prompt asks for lines, not JSON, quote at most 60 characters", /one item per line, no JSON/.test(S) && /at most 60 characters/.test(S) && !/Return ONLY JSON/.test(S));
  ok("the prompt is still blind (no price, bid, outcome, comment or seller field)", !/PRICEMARK|SELLERMARK/.test(S));
});
await section("equipment", async () => {   // a model that obeys the prompt: it lists equipment only if the prompt does not tell it to skip it
  const EQ = "This 2004 BMW M3 has automatic climate control, cruise control, a Harman Kardon sound system, rain-sensing wipers, 19 inch wheels, power windows, leather seats and a sunroof. It is silver over black. Nothing else is stated about the car in this listing at all.";
  const obeying = ({ system }) => { const skips = /SKIP:/.test(system) && /standard equipment such as climate control/.test(system); return { text: skips ? "NONE" : [L("automatic climate control", "interior", "condition_present", "positive", 0, 0, "automatic climate control"), L("cruise control", "interior", "condition_present", "positive", 0, 0, "cruise control"), L("sound system", "interior", "condition_present", "positive", 0, 0, "Harman Kardon sound system")].join("\n"), usage: { input_tokens: 900, output_tokens: 40 }, stop_reason: "end_turn" }; };
  const db = mkDb(rowsN(1, EQ)); db.callModel2 = async a => obeying(a); const r = await mine(db, { limit: 1 });
  ok("an equipment only description yields no items, and the listing is done, not failed", r.ok && r.body.mined === 1 && r.body.items_written === 0 && r.body.failed === 0 && db.mentions.length === 0 && [...db.runs.values()][0].status === "done", r.body || r);
  ok("NONE is a clean empty answer (also with a trailing full stop or spaces)", FM.parseItems("NONE", "x".repeat(200)).bad === false && FM.parseItems("  none. \n", "x".repeat(200)).items.length === 0);
});
await section("three facts", async () => {
  const D = "The car was repainted in 2019 in the original Laguna Seca Blue. The rod bearings were replaced in March 2021 at 74,000 miles. The owner reports no accidents. Silver wheels and a sunroof are fitted as standard on this model, and the car is sold with a clean title.";
  const db = mkDb(rowsN(1, D)); db.callModel2 = async () => ({ text: [L("repainted", "paint and body", "work_done", "neutral", 1, 0, "repainted in 2019 in the original Laguna Seca Blue"), L("rod bearings replaced", "mechanical work", "work_done", "positive", 1, 1, "rod bearings were replaced in March 2021 at 74,000 miles"), L("no accidents", "accident and title", "absence_stated", "positive", 0, 0, "reports no accidents")].join("\n"), usage: { input_tokens: 900, output_tokens: 120 }, stop_reason: "end_turn" });
  const r = await mine(db, { limit: 1 }), m = db.mentions, by = t => m.find(x => x.topic === t);
  ok("a repaint, a bearing replacement with a date and no accidents give those three", r.ok && m.length === 3 && !!by("repainted") && !!by("rod bearings replaced") && !!by("no accidents"), m.map(x => x.topic));
  ok("with the right type and polarity", by("repainted").statement_type === "work_done" && by("repainted").polarity === "neutral" && by("rod bearings replaced").statement_type === "work_done" && by("rod bearings replaced").polarity === "positive" && by("rod bearings replaced").has_date === true && by("rod bearings replaced").has_mileage === true && by("no accidents").statement_type === "absence_stated" && by("no accidents").polarity === "positive" && by("no accidents").category === "accident and title", m);
});
await section("compact answer", async () => {
  const text = "x ".repeat(80) + Array.from({ length: 40 }, (_, i) => `fact number ${i + 10} stands here.`).join(" ") + " " + "this very long quoted sentence goes on and on far past sixty characters in total length.";
  const lines = Array.from({ length: 35 }, (_, i) => L("fact " + String.fromCharCode(97 + (i % 26)) + (i > 25 ? "x" : ""), "other", "claim", "neutral", 0, 0, `fact number ${i + 10} stands here.`));
  const p = FM.parseItems(lines.join("\n"), text);
  ok("at most 30 items are kept; the 5 beyond are counted as over the cap", p.items.length === 30 && p.reasons.over_item_cap === 5 && p.dropped === 5, [p.items.length, p.reasons]);
  const lq = "this very long quoted sentence goes on and on far past sixty characters in total length.", q = FM.parseItems(L("long quote", "other", "claim", "neutral", 0, 0, lq), text);
  ok("a quote is read to 60 characters only (the span is 60 long)", q.items.length === 1 && q.items[0].span_end - q.items[0].span_start === 60, q.items[0]);
  ok("a pipe inside the quote stays in the quote", FM.parseItems(L("pipe", "other", "claim", "neutral", 0, 0, "one | two"), "x one | two y z").items.length === 1);
  ok("the output limit is the 30 item need (about 1,200 tokens) plus half again: 1,800, down from 4,000", FM.MAX_OUT_TOKENS === 1800);
});
await section("cut off", async () => {
  const D = DESC(0), ln = [L("repainted", "paint and body", "work_done", "neutral", 0, 0, "repainted in the original color"), L("timing chain guides replaced", "mechanical work", "work_done", "positive", 1, 1, "timing chain guides were replaced at 61,000 miles in 2022"), L("service records", "documentation", "claim", "positive", 0, 0, "Service records are included from new"), L("no accidents", "accident and title", "absence_stated", "positive", 0, 0, "No accidents, clean title")];
  const cut = ln.join("\n") + "\n" + "original 19 inch wheels | other | cla";   // the fifth line is cut mid line
  const db = mkDb(rowsN(1, D)); db.callModel2 = async () => ({ text: cut, usage: { input_tokens: 1000, output_tokens: 1800 }, stop_reason: "max_tokens" });
  const r = await mine(db, { limit: 1 }), run = [...db.runs.values()][0];
  ok("a cut off answer keeps its four complete lines and drops the partial fifth", r.ok && r.body.mined === 1 && db.mentions.length === 4 && r.body.failed === 0, r.body || r);
  ok("it is done and flagged: truncated 1 in the counts, the word truncated in the existing error field, no new column", r.body.truncated === 1 && run.status === "done" && run.error === "truncated" && Object.keys(run).every(k => ["listing_id", "miner_version", "source", "family", "sold_or_attempt", "status", "characters_read", "items_found", "tokens_input", "tokens_output", "error"].includes(k)), run);
  const full = FM.parseItems(ln.join("\n") + "\n", D, { truncated: true }); ok("a cut off answer that ends on a line end keeps every line", full.items.length === 4 && full.partial_dropped === 0, full.items.length);
  const dropped = FM.parseItems(cut, D, { truncated: true }); ok("the partial line is dropped before it is read (an unfinished line is never an item)", dropped.partial_dropped === 1 && dropped.items.length === 4 && dropped.reasons.malformed_line === 0);
  const by = mkDb(rowsN(1, D)); by.callModel2 = async () => ({ text: ln.join("\n"), usage: { input_tokens: 1000, output_tokens: 1800 } });   // no stop reason, output tokens at the limit
  const r2 = await mine(by, { limit: 1 }); ok("output tokens at the limit mark it truncated even with no stop reason", r2.body.truncated === 1, r2.body);
  const norm = mkDb(rowsN(1, D)); norm.callModel2 = async () => ({ text: ln.join("\n"), usage: { input_tokens: 1000, output_tokens: 300 }, stop_reason: "end_turn" }); const r3 = await mine(norm, { limit: 1 });
  ok("a whole answer is not flagged and writes no error word", r3.body.truncated === 0 && [...norm.runs.values()][0].error === undefined);
});
await section("dropped and failed reasons", async () => {
  const db = mkDb(rowsN(1)), r = await mine(db, { limit: 1 }), d = r.body.dropped_by_reason;
  ok("the dropped count is split by reason: quote, category, type, polarity (one each) and a malformed line", d.quote_not_found === 1 && d.category_not_in_list === 1 && d.type_not_in_list === 1 && d.polarity_not_in_list === 1 && d.malformed_line === 1, d);
  ok("the split adds up to the dropped total", Object.values(d).reduce((a, b) => a + b, 0) === r.body.items_dropped && r.body.items_dropped === 5, [d, r.body.items_dropped]);
  const f = mkDb(rowsN(5)); let n = 0; f.callModel2 = async () => { n++; if (n === 1) throw new Error("model 429"); if (n === 2) throw new Error("SECRETLISTINGTEXT the seller said so"); if (n === 3) return { text: "I cannot help with that", usage: { input_tokens: 800, output_tokens: 10 }, stop_reason: "end_turn" }; if (n === 4) return { text: "", usage: { input_tokens: 800, output_tokens: 0 }, stop_reason: "end_turn" }; return { text: GOOD(""), usage: { input_tokens: 800, output_tokens: 200 }, stop_reason: "end_turn" }; };
  const r2 = await mine(f, { limit: 5 }), fr = r2.body.failed_by_reason;
  ok("each failed listing has a short code: model_429, model_error, unreadable, no_answer", r2.body.failed === 4 && fr.model_429 === 1 && fr.model_error === 1 && fr.unreadable === 1 && fr.no_answer === 1 && r2.body.failures.length === 4 && r2.body.failures.every(x => typeof x.n === "number" && /^[a-z_0-9]+$/.test(x.reason)), r2.body);
  ok("no listing text, listing id or seller is in the answer or in a failed run row's error", !/SECRETLISTINGTEXT|DESCMARK|SELLERMARK|N100\d|bringatrailer:/.test(JSON.stringify(r2.body)) && ![...f.runs.values()].some(x => /SECRETLISTINGTEXT|seller said/.test(String(x.error || ""))));
  const g = mkDb(rowsN(2)); g.callModel2 = async () => { throw new Error("model 500"); }; await mine(g, { limit: 2 }); g.callModel2 = null; const again = await mine(g, { limit: 2 });
  ok("a failed listing is read again next time (failed is not done)", again.body.mined === 2, again.body);
});
await section("version", async () => {
  ok("the miner version is bumped to fm2", FM.MINER_VERSION === "fm2" && FM.MINER_VERSION !== "fm1");
  const db = mkDb(rowsN(8)); for (let i = 0; i < 8; i++) db.runs.set("bringatrailer:N" + (1000 + i), { listing_id: "bringatrailer:N" + (1000 + i), miner_version: "fm1", status: "done" });
  const r = await mine(db, { limit: 8 }); ok("the 8 listings already read under fm1 are read again", r.ok && r.body.already_mined === 0 && r.body.mined === 8 && db.modelCalls === 8, r.body);
  ok("the done check asks for this miner version only", db.selects.some(q => q.startsWith("listing_mining_runs?") && q.includes("miner_version=eq." + FM.MINER_VERSION)));
});
await section("time budget", async () => {
  const slow = (ms, track) => async a => { track.cur++; track.max = Math.max(track.max, track.cur); await new Promise(r => setTimeout(r, ms)); track.cur--; return { text: GOOD(a.user), usage: { input_tokens: 1000, output_tokens: 400 }, stop_reason: "end_turn" }; };
  const tr = { cur: 0, max: 0 }, db = mkDb(rowsN(30)); db.callModel2 = slow(300, tr);
  const t0 = Date.now(), r = await withTimeout(mine(db, { limit: 25 }, { timing: { budgetMs: 1600, modelTimeoutMs: 500, marginMs: 100 } }), 8000), took = Date.now() - t0;
  ok("a call of 25 with slow listings answers inside the budget", r !== "HUNG" && r.ok && took <= 1600, took);
  ok("it answers with a not started count and stops for time: started + not started = 25", r.body.not_started > 0 && r.body.started + r.body.not_started === 25 && r.body.stopped === "time" && r.body.asked === 25, r.body);
  ok("every listing it started is done (mined = started), none lost", r.body.mined === r.body.started && r.body.failed === 0 && db.runs.size === r.body.started, [r.body.mined, r.body.started, db.runs.size]);
  ok("listings are read five at a time", tr.max === 5, tr.max);
  const tr2 = { cur: 0, max: 0 }, fast = mkDb(rowsN(25)); fast.callModel2 = slow(20, tr2); const rf = await mine(fast, { limit: 25 });
  ok("with time to spare all 25 are read, not started 0, stopped null", rf.body.mined === 25 && rf.body.not_started === 0 && rf.body.stopped === null && tr2.max === 5, rf.body);
  ok("the real limits fit the function: budget plus margin under 300 seconds, a listing started only if its timeout still fits", FM.TIME_BUDGET_MS + 5000 <= 300000 && FM.MODEL_TIMEOUT_MS + FM.START_MARGIN_MS < FM.TIME_BUDGET_MS && FM.PARALLEL === 5);
  const hung = mkDb(rowsN(5)); hung.callModel2 = () => new Promise(() => {});   // a model call that never comes back
  const rh = await withTimeout(mine(hung, { limit: 5 }, { timing: { budgetMs: 1000, modelTimeoutMs: 150, marginMs: 50 } }), 4000);
  ok("a model call that never comes back is cut at its timeout: the call still answers, 5 failed as timeout, nothing hangs", rh !== "HUNG" && rh.ok && rh.body.failed === 5 && rh.body.failed_by_reason.timeout === 5 && [...hung.runs.values()].every(x => x.status === "failed" && x.error === "timeout"), rh.body || rh);
  const stuck = mkDb(rowsN(5)), ins = stuck.insert; stuck.insert = (t, rs, ...a) => t === "listing_mentions" ? new Promise(() => {}) : ins(t, rs, ...a);   // a database write that never returns
  const rs = await withTimeout(mine(stuck, { limit: 5 }, { timing: { budgetMs: 400, modelTimeoutMs: 100, marginMs: 0 } }), 3000);
  ok("a stuck write cannot stop the call answering: it answers at the budget with the listings in flight counted", rs !== "HUNG" && rs.ok && rs.body.in_flight_at_answer === 5 && rs.body.stopped === "time", rs.body || rs);
  const capd = mkDb(rowsN(7)), rc = await mine(capd, { limit: 7, tokenCap: 1000 }); ok("the token cap still stops a call (listings in flight are reserved for), and counts not started", rc.body.stopped === "token_cap" && rc.body.started === 1 && rc.body.not_started === 6, rc.body);
});
await section("failed model calls are logged", async () => {
  const MD = await imp("lib/factModel.js"), real = globalThis.fetch, logged = []; process.env.ANTHROPIC_API_KEY = "test-key"; let mode = "ok";
  globalThis.fetch = async (url, o) => { if (String(url).includes("api.anthropic.com")) { if (mode === "abort") { const e = new Error("aborted"); e.name = "AbortError"; throw e; } if (mode === "500") return { ok: false, status: 500, json: async () => null }; return { ok: true, status: 200, json: async () => ({ content: [{ text: "NONE" }], usage: { input_tokens: 10, output_tokens: 1 }, stop_reason: "end_turn" }) }; } logged.push(JSON.parse(o.body)); return { ok: true, status: 201, text: async () => "" }; };
  try {
    const cm = MD.makeCallModel({ supabaseUrl: "https://x.supabase.co", supabaseKey: "k" }, "factmine");
    mode = "abort"; await cm({ system: "s", user: "u", maxTokens: 10 }).catch(() => {}); mode = "500"; await cm({ system: "s", user: "u", maxTokens: 10 }).catch(() => {}); mode = "ok"; const okr = await cm({ system: "s", user: "u", maxTokens: 10 });
    const errs = logged.filter(e => e.status === "error");
    ok("a call cut by its timeout and a call the model refused are each logged once, with a code and no text", errs.length === 2 && errs[0].metadata.code === "timeout" && errs[1].metadata.code === "model_500" && errs.every(e => e.anthropic_input_tokens === 0), logged);
    ok("a good call is logged once and its stop reason is returned", logged.filter(e => e.status === "ok").length === 1 && okr.stop_reason === "end_turn");
  } finally { globalThis.fetch = real; }
});
await section("class: every model call in the miner's path is cut at a timeout and logged", async () => {
  const files = ["lib/factModel.js", "lib/factMine.js", "lib/factMap.js"].filter(f => fs.existsSync(f));
  const bad = files.filter(f => { const src = fs.readFileSync(f, "utf8"); const calls = src.match(/fetch\(\s*["'`]https:\/\/api\.anthropic\.com[^)]*\)/g) || []; return calls.some(c => !/signal/.test(c)) || (/api\.anthropic\.com/.test(src) && !/logFail/.test(src)); });
  ok("no fact mining file calls the model without an abort signal, and a failed call is logged", bad.length === 0, bad);
  const mineSrc = fs.readFileSync("lib/factMine.js", "utf8");
  ok("the model call is raced against its own timer in the runner (a model that never answers cannot hold the call)", /callWithTimeout/.test(mineSrc) && /Promise\.race/.test(mineSrc));
  ok("the runner has no one-at-a-time loop over the listings", !/for \(let k = 0; k < todo\.length; k\+\+\)/.test(mineSrc));
});
if (args.includes("--estimate")) {
  const sysT = Math.round(FM.SYSTEM.length / 4), long = "The car was repainted in 2019. ".repeat(190).slice(0, 6000), user = FM.buildPrompt({ year: 2004, model: "BMW M3 (E46)", variant: "Coupe", text: long }).user, userT = Math.round(user.length / 4);
  const item = L("rod bearings replaced", "mechanical work", "work_done", "positive", 1, 1, "rod bearings were replaced in March 2021 at 74,000 miles"), itemT = Math.round(item.length / 3.2);
  console.log("estimate per listing: input " + sysT + " (prompt) + " + userT + " (a 6,000 character description) = " + (sysT + userT) + " tokens; output " + itemT + " a line, " + itemT * 30 + " for 30 items, " + itemT * 12 + " for a typical 12; at $3 and $15 per million: $" + ((sysT + userT) * 3e-6 + itemT * 12 * 15e-6).toFixed(4) + " typical, $" + ((sysT + userT) * 3e-6 + itemT * 30 * 15e-6).toFixed(4) + " at 30 items");
}
console.log(fails.slice(0, 60).map(f => "FAIL " + f).join("\n") + (fails.length ? "\n" : "") + `factMineCheck: ${pass} pass, ${fail} FAIL`);
process.exit(fail ? 1 : 0);

function mutants() {
  const me = fileURLToPath(import.meta.url), R = ROOT;
  const sub = (file, from, to) => [file, s => { if (!s.includes(from)) return s; return s.replace(from, () => to); }, from];
  const M = [
    ["the prompt holds the price", ...sub("lib/factMine.js", "variant: variantOf(call.family, title), text });", "variant: variantOf(call.family, title), text: text + ' ' + (rawOf(r).price || '') });")],
    ["the prompt holds the bid", ...sub("lib/factMine.js", "variant: variantOf(call.family, title), text });", "variant: variantOf(call.family, title), text: text + ' ' + (rawOf(r).high_bid || '') });")],
    ["the prompt holds the outcome", ...sub("lib/factMine.js", "variant: variantOf(call.family, title), text });", "variant: variantOf(call.family, title), text: text + ' ' + (rawOf(r).status || '') });")],
    ["the prompt holds the seller", ...sub("lib/factMine.js", "variant: variantOf(call.family, title), text });", "variant: variantOf(call.family, title), text: text + ' ' + (rawOf(r).seller || '') });")],
    ["the prompt holds the comments", ...sub("lib/factMine.js", "variant: variantOf(call.family, title), text });", "variant: variantOf(call.family, title), text: text + ' ' + JSON.stringify(rawOf(r).comments || '') });")],
    ["the prompt holds the sale price column", ...sub("lib/factMine.js", "variant: variantOf(call.family, title), text });", "variant: variantOf(call.family, title), text: text + ' ' + (r.sale_price_usd || '') });")],
    ["an item whose quote is not in the text keeps a span", ...sub("lib/factMine.js", "  i = text.toLowerCase().indexOf(q.toLowerCase()); if (i >= 0) return [i, i + q.length];\n  return null;", "  i = text.toLowerCase().indexOf(q.toLowerCase()); if (i >= 0) return [i, i + q.length];\n  return [0, Math.min(q.length, text.length)];")],
    ["an item with a bad category is kept", ...sub("lib/factMine.js", "const category = enumOf(c, CATEGORIES); if (!category) {", "const category = enumOf(c, CATEGORIES) || \"other\"; if (false) {")],
    ["a done listing is mined again", ...sub("lib/factMine.js", "const todo = eligible.filter((r, i) => !doneIds.has(ids[i])).slice(0, call.limit);", "const todo = eligible.slice(0, call.limit);")],
    ["an unwindowed call is allowed", ...sub("lib/factMine.js", "if (!DATE.test(from) || !DATE.test(to)) return", "if (false) return")],
    ["a window over 366 days is allowed", ...sub("lib/factMine.js", "if (days(from, to) > MAX_WINDOW_DAYS) return", "if (false) return")],
    ["more than 25 listings are allowed", ...sub("lib/factMine.js", "if (lim > MAX_LISTINGS) return", "if (false) return")],
    ["the token cap is not applied", ...sub("lib/factMine.js", "if (out.tokens_input + out.tokens_output + inflight * T.estTokens >= call.tokenCap) {", "if (false) {")],
    ["a token cap over its limit is allowed", ...sub("lib/factMine.js", "if (cap > MAX_TOKEN_CAP) return", "if (false) return")],
    ["a source without full text is allowed", ...sub("lib/factMine.js", "if (!SOURCES.includes(source)) return", "if (false) return")],
    ["text can be returned", ...sub("lib/factMine.js", "if (typeof v === \"string\") return v.length <= 200;", "if (typeof v === \"string\") return true;")],
    ["the map merges opposite meanings", ...sub("lib/factMap.js", "if (parts.size <= 1) return [{ canonical, members: [...members] }];", "return [{ canonical, members: [...members] }];")],
    ["the map asks again for what is mapped", ...sub("lib/factMap.js", "filter(([t]) => !have.has(t))", "filter(([t]) => true)")],
    ["the prompt no longer skips standard equipment", ...sub("lib/factMine.js", "standard equipment such as climate control", "ordinary things such as climate control")],
    ["a cut off answer keeps its partial last line", ...sub("lib/factMine.js", "if (opts.truncated && !/\\n\\s*$/.test(raw) && lines.length) {", "if (false) {")],
    ["a truncated listing is not flagged", ...sub("lib/factMine.js", "...(truncated ? { error: \"truncated\" } : {})", "")],
    ["a truncated listing is a failure", ...sub("lib/factMine.js", "if (parsed.bad) return fail(", "if (parsed.bad || truncated) return fail(")],
    ["the item cap of 30 is not applied", ...sub("lib/factMine.js", "if (evaluated >= MAX_ITEMS) {", "if (false) {")],
    ["a quote is not clipped to 60 characters", ...sub("lib/factMine.js", ".trim().slice(0, MAX_QUOTE), topic", ".trim(), topic")],
    ["the miner version is not bumped", ...sub("lib/factMine.js", "export const MINER_VERSION = \"fm2\"", "export const MINER_VERSION = \"fm1\"")],
    ["the output limit goes back to 4,000", ...sub("lib/factMine.js", "MAX_OUT_TOKENS = 1800", "MAX_OUT_TOKENS = 4000")],
    ["listings are read one at a time", ...sub("lib/factMine.js", "PARALLEL = 5,", "PARALLEL = 1,")],
    ["a listing is started with no time left", ...sub("lib/factMine.js", "if (Date.now() - t0 + T.modelTimeoutMs + T.marginMs > T.budgetMs) {", "if (false) {")],
    ["the call does not answer at its budget", ...sub("lib/factMine.js", "Math.max(0, T.budgetMs - (Date.now() - t0))", "1e9")],
    ["a model call is not cut at its timeout", ...sub("lib/factMine.js", "}, ms);\n  Promise.resolve()", "}, 1e9);\n  Promise.resolve()")],
    ["the model fetch has no abort signal", ...sub("lib/factModel.js", "fetch(\"https://api.anthropic.com/v1/messages\", { signal: signal || AbortSignal.timeout(FACT_TIMEOUT_MS), method", "fetch(\"https://api.anthropic.com/v1/messages\", { method")],
    ["a failed model call is not logged", ...sub("lib/factModel.js", "async function logFail(env, tag, code) { try {", "async function logFail(env, tag, code) { return; try {")],
    ["a failure reason carries the error text", ...sub("lib/factMine.js", "const failCode = e => {", "const failCode = e => { if (e && e.message) return String(e.message).slice(0, 80);")],
    ["a failure names the listing", ...sub("lib/factMine.js", "out.failures.push({ n: k + 1, reason: code });", "out.failures.push({ n: k + 1, reason: code, listing: base.listing_id });")],
    ["the dropped reasons are lumped together", ...sub("lib/factMine.js", "for (const [rs, n] of Object.entries(parsed.reasons)) out.dropped_by_reason[rs] += n;", "out.dropped_by_reason.quote_not_found += parsed.dropped;")],
    ["tokens in flight are not reserved against the cap", ...sub("lib/factMine.js", "+ inflight * T.estTokens >= call.tokenCap", ">= call.tokenCap")],
    ["the report counts every mention as a listing", ...sub("lib/factReport.js", "if (!t.listings.has(m.listing_id)) {", "if (true) {")]
  ].filter(Boolean);
  let survived = 0;
  for (const [name, file, fn, from] of M) {
    const tmp = fs.mkdtempSync(path.join(fs.realpathSync("/tmp"), "fm-"));
    try {
      for (const d of ["lib", "api", "data", "package.json"]) spawnSync("cp", ["-R", path.join(R, d), tmp]);
      fs.mkdirSync(path.join(tmp, "scripts")); fs.symlinkSync(path.join(R, "node_modules"), path.join(tmp, "node_modules"));
      const f = path.join(tmp, file), before = fs.readFileSync(f, "utf8"), after = fn(before); if (before === after) { console.log("SKIP (no change) " + name); survived++; continue; }
      fs.writeFileSync(f, after);
      const r = spawnSync(process.execPath, [me, tmp], { encoding: "utf8", timeout: 240000 }), killed = r.status !== 0; console.log((killed ? "killed   " : "SURVIVED ") + name); if (!killed) survived++;
    } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  }
  console.log(survived ? `${survived} mutant(s) survived` : "all mutants killed"); return survived ? 1 : 0;
}
