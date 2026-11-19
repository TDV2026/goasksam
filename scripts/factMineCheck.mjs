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
  const db = { runs: new Map(), mentions: [], map: [], leases: [], inserts: 0, modelCalls: 0, prompts: [], selects: [], tablesMissing: false };
  db.select = async qs => {
    db.selects.push(qs);
    if (qs.startsWith("sales_archive?")) { const off = Number((/offset=(\d+)/.exec(qs) || [0, 0])[1]), lim = Number((/limit=(\d+)/.exec(qs) || [0, 100])[1]); return rows.slice(off, off + lim); }
    if (qs.startsWith("app_usage_events?")) { if (db.leaseDown) return null; const gte = decodeURIComponent((/created_at=gte\.([^&]*)/.exec(qs) || [0, ""])[1]); return db.leases.filter(l => !gte || l.at >= Date.parse(gte)).map(l => ({ id: l.id, status: l.status, metadata: l.metadata })); }
    if (qs.startsWith("listing_mining_runs?")) { if (db.tablesMissing) return null; const m = /listing_id=in\.([^&]*)/.exec(qs); if (m) { const ids = decodeURIComponent(m[1]).replace(/[()"]/g, "").split(","), ver = (/miner_version=eq\.([^&]*)/.exec(qs) || [0, null])[1]; return ids.filter(i => db.runs.has(i) && (!ver || db.runs.get(i).miner_version === ver)).map(i => ({ listing_id: i, status: db.runs.get(i).status })); } return [...db.runs.values()].filter(r => r.status === "done").slice(0, 1000); }
    if (qs.startsWith("listing_mentions?")) { if (db.tablesMissing) return null; const off = Number((/offset=(\d+)/.exec(qs) || [0, 0])[1]), lim = Number((/limit=(\d+)/.exec(qs) || [0, 1000])[1]); return db.mentions.slice(off, off + lim); }
    if (qs.startsWith("topic_map?")) { if (db.tablesMissing) return null; const off = Number((/offset=(\d+)/.exec(qs) || [0, 0])[1]), lim = Number((/limit=(\d+)/.exec(qs) || [0, 1000])[1]); return db.map.slice(off, off + lim); }
    return [];
  };
  db.insert = async (table, rs, prefer) => { if (table === "app_usage_events") { if (db.leaseWriteDown) return { error: "x" }; for (const r of rs) db.leases.push({ id: db.leases.length + 1, at: Date.now(), status: r.status, metadata: r.metadata, event_type: r.event_type }); return {}; } db.inserts++; if (table === "listing_mining_runs") for (const r of rs) db.runs.set(r.listing_id, r); else if (table === "listing_mentions") db.mentions.push(...rs); else if (table === "topic_map") { for (const r of rs) { const k = db.map.findIndex(m => m.raw_topic === r.raw_topic && m.family === r.family && m.map_version === r.map_version); if (k < 0) db.map.push({ ...r }); else if (/merge-duplicates/.test(prefer || "")) db.map[k] = { ...db.map[k], ...r }; } } return {}; };
  db.model = text => async ({ system, user }) => { db.modelCalls++; db.prompts.push({ system, user }); return { text: typeof text === "function" ? text(user) : text, usage: { input_tokens: 1200, output_tokens: 300 }, stop_reason: "end_turn" }; };
  db.callModel = a => db.model(GOOD)(a);
  return db;
};
// a map model: the groups JSON for the grouping call, kinds for the labelling call
const mapModel = (db, groupsJson, kinds = {}) => async a => { db.modelCalls++; db.mapPrompts = (db.mapPrompts || []).concat([a.system]); const u = { input_tokens: 100, output_tokens: 50 };
  if (/^You label/.test(a.system)) return { text: JSON.stringify({ kinds: JSON.parse(a.user).map(x => ({ topic: x.topic, kind: kinds[x.topic] || "other" })) }), usage: u };
  return { text: groupsJson, usage: u }; };
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
  const greedy = JSON.stringify({ groups: [{ canonical: "paint", kind: "condition", members: ["original paint", "repainted"] }, { canonical: "accident history", kind: "history", members: ["accident", "no accident", "accident free"] }, { canonical: "timing chain work", kind: "work_done", members: ["timing chain replaced", "timing chain guides replaced"] }, { canonical: "rust", kind: "condition", members: ["rust on subframe", "no rust"] }, { canonical: "engine", kind: "history", members: ["original engine", "engine replaced"] }, { canonical: "ghost", kind: "other", members: ["never asked label"] }] });
  const m1 = await MAP.runFactMap({ family: "e46_m3", limit: 300 }, { select: db.select, insert: db.insert, callModel: mapModel(db, greedy, { "service records": "paperwork" }) });
  ok("the map ran", m1.ok, m1.why); const cm = new Map(db.map.map(r => [r.raw_topic, r.canonical_topic]));
  ok("repainted and original paint stay apart", cm.get("repainted") !== cm.get("original paint"), [cm.get("repainted"), cm.get("original paint")]);
  ok("accident and no accident stay apart", cm.get("accident") !== cm.get("no accident"), [cm.get("accident"), cm.get("no accident")]);
  ok("rust and no rust stay apart; original engine and engine replaced stay apart", cm.get("rust on subframe") !== cm.get("no rust") && cm.get("original engine") !== cm.get("engine replaced"));
  ok("the same fact in different words is one topic (timing chain replaced and timing chain guides replaced)", cm.get("timing chain replaced") === cm.get("timing chain guides replaced") && !!cm.get("timing chain replaced"), [cm.get("timing chain replaced"), cm.get("timing chain guides replaced")]);
  ok("a label the model did not ask about is not written; a label it left out stands alone", !cm.has("never asked label") && cm.get("service records") === "service records");
  const n1 = db.map.length, c1 = db.modelCalls; const m2 = await MAP.runFactMap({ family: "e46_m3", limit: 300 }, { select: db.select, insert: db.insert, callModel: mapModel(db, greedy) });
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
  ok("the prompt skips standard equipment and plain feature lists, and names examples", /SKIP:/.test(S) && /every car of this model has/.test(S) && /standard equipment/.test(S) && /climate control/.test(S) && /cruise control/.test(S) && /factory equipment and options of every kind/.test(S) && /even when the seller names/.test(S), S.slice(0, 120));
  ok("fm3: equipment stays only when the statement is about its condition, a fault, a repair, a replacement, an aftermarket change or its absence", /ONLY when the statement is about its condition, a fault, a repair, a replacement, an aftermarket change or its absence/.test(S));
  ok("fm3: the prompt no longer asks to keep factory packages or rare options", !/factory packages or rare options/.test(S) && !/named packages/.test(S));
  ok("the prompt keeps condition, faults, work and when, accident and paint history, rust, originality and modifications, ownership and location, service records, stated absences", ["condition present", "faults and wear", "work done and when", "accident and paint history", "rust", "originality and modifications", "ownership and location history", "service records and paperwork", "stated absences"].every(w => S.includes(w)));
  ok("the prompt orders by buyer weight and caps at 30 items", /most likely to matter to a buyer first/.test(S) && /At most 30 items/.test(S) && FM.MAX_ITEMS === 30);
  ok("the prompt asks for lines, not JSON, quote at most 60 characters", /one item per line, no JSON/.test(S) && /at most 60 characters/.test(S) && !/Return ONLY JSON/.test(S));
  ok("the prompt is still blind (no price, bid, outcome, comment or seller field)", !/PRICEMARK|SELLERMARK/.test(S));
});
await section("equipment", async () => {   // a model that obeys the prompt: it lists equipment only if the prompt does not tell it to skip it
  const EQ = "This 2004 BMW M3 has automatic climate control, cruise control, a Harman Kardon sound system, rain-sensing wipers, 19 inch wheels, power windows, leather seats and a sunroof. It is silver over black. Nothing else is stated about the car in this listing at all.";
  const obeying = ({ system }) => { const skips = /SKIP:/.test(system) && /factory equipment and options of every kind/.test(system); return { text: skips ? "NONE" : [L("automatic climate control", "interior", "condition_present", "positive", 0, 0, "automatic climate control"), L("cruise control", "interior", "condition_present", "positive", 0, 0, "cruise control"), L("sound system", "interior", "condition_present", "positive", 0, 0, "Harman Kardon sound system")].join("\n"), usage: { input_tokens: 900, output_tokens: 40 }, stop_reason: "end_turn" }; };
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
  ok("the miner version is bumped to fm3 (the equipment rule changes what is kept)", FM.MINER_VERSION === "fm3" && FM.MINER_VERSION !== "fm2");
  const db = mkDb(rowsN(8)); for (let i = 0; i < 8; i++) db.runs.set("bringatrailer:N" + (1000 + i), { listing_id: "bringatrailer:N" + (1000 + i), miner_version: "fm2", status: "done" });
  const r = await mine(db, { limit: 8 }); ok("the 8 listings already read under fm2 are read again under fm3", r.ok && r.body.already_mined === 0 && r.body.mined === 8 && db.modelCalls === 8, r.body);
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

// ===== 10 THE QUOTE IS MATCHED AFTER NORMALISING (Lane D, lane-d-factmine-3) =====
// The miner copies a quote in plain characters; the listing text holds curly quotes, dashes, entities, line breaks and runs of spaces. Both sides are normalised, the span is read back from the ORIGINAL text, and a quote that still does not match is dropped.
await section("normalising the quote", async () => {
  const T0 = "The owner’s car has the “original” paint – never repainted. Service — all done at the dealer.\n\nNo accidents &amp; no rust. It&#8217;s a keeper&nbsp;car with 62,000 miles.   Rod bearings replaced in 2021.";
  const keep = (text, quote) => FM.parseItems(L("fact", "other", "claim", "neutral", 0, 0, quote), text);
  const spanOk = (text, quote, plain) => { const r = FM.locate(text, quote); return !!r && FM.norm(text.slice(r[0], r[1])).s === FM.norm(plain || quote).s; };
  const cases = [
    ["curly apostrophe in the listing, plain in the quote", "The owner's car has the"],
    ["curly double quotes in the listing, plain in the quote", 'the "original" paint'],
    ["an en dash in the listing, a hyphen in the quote", "paint - never repainted"],
    ["an em dash in the listing, a hyphen in the quote", "Service - all done at the dealer"],
    ["a paragraph break in the listing, one space in the quote", "dealer. No accidents"],
    ["a non breaking space and a run of spaces", "62,000 miles. Rod bearings"],
    ["case folded", "NO ACCIDENTS & NO RUST"],
    ["the entity &amp; in the listing, & in the quote", "No accidents & no rust"],
    ["the numeric entity &#8217; in the listing, a plain apostrophe in the quote", "It's a keeper"],
    ["the entity &nbsp; in the listing, a space in the quote", "keeper car with"]];
  for (const [name, quote] of cases) { const p = keep(T0, quote); ok("matches: " + name, p.items.length === 1 && p.dropped === 0 && spanOk(T0, quote), [p.dropped, p.reasons]); }
  const pq = keep("x owner's y z w", "owner’s y"); ok("matches: a curly apostrophe in the quote, a plain one in the listing", pq.items.length === 1 && pq.dropped === 0, pq.reasons);
  // the span is the original text, not the normalised one
  const r1 = FM.locate(T0, "paint - never repainted"); ok("the span is read from the original text: it holds the en dash the listing has", !!r1 && T0.slice(r1[0], r1[1]) === "paint – never repainted", r1 && T0.slice(r1[0], r1[1]));
  const r2 = FM.locate(T0, "No accidents & no rust"); ok("the span of an entity quote covers the whole &amp; in the original", !!r2 && T0.slice(r2[0], r2[1]) === "No accidents &amp; no rust", r2 && T0.slice(r2[0], r2[1]));
  // the 60 character cap: the model's quote is cut at 60 and may end in the middle of a word or of an entity
  const LONG = "The seller says that the car’s documented service history includes every oil change since new and a recent major service at the dealer.";
  const longQ = "The seller says that the car's documented service history includes every oil change since new", cut = FM.parseItems(L("cut", "other", "claim", "neutral", 0, 0, longQ), LONG);
  const cutText = cut.items[0] ? LONG.slice(cut.items[0].span_start, cut.items[0].span_end) : "";
  const q60 = longQ.slice(0, FM.MAX_QUOTE);
  ok("fixture: the 60 character cut falls in the middle of a word", /[a-z]$/i.test(q60) && /[a-z]/i.test(longQ[FM.MAX_QUOTE]), q60);
  ok("a quote over 60 characters is cut at 60, ends in the middle of a word, and still matches", cut.items.length === 1 && cut.dropped === 0, [cut.dropped, cutText]);
  ok("the cut quote's span is the first 60 characters of the quote (original positions)", cut.items.length === 1 && FM.norm(cutText).s === FM.norm(longQ.slice(0, FM.MAX_QUOTE)).s, cutText);
  const ENT = "It was repainted &amp; polished by the dealer before the sale in 2024.";
  ok("a quote cut in the middle of an entity (\"&am\") matches the words before it", keep(ENT, "It was repainted &am").items.length === 1 && keep(ENT, "It was repainted &").items.length === 1 && keep(ENT, "It was repainted &#82").items.length === 1);
  ok("a quote the model wrapped in ellipses matches the words inside", keep(T0, "...Rod bearings replaced in 2021...").items.length === 1 && keep(T0, "…no rust…").items.length === 1);
  ok("zero width characters and a soft hyphen in the listing do not break the match", keep("Rod \u200Bbearings re\u00ADplaced in 2021 at the dealer.", "Rod bearings replaced in 2021").items.length === 1);
  // what is still dropped
  const drops = [["a paraphrase", "bearings were changed in 2021"], ["one wrong word", "Rod bearings removed in 2021"], ["words out of order", "2021 in replaced bearings Rod"], ["a quote under four characters", "rod"], ["text that is not in the listing", "the engine was rebuilt in 2019"]];
  for (const [n, q] of drops) { const p = keep(T0, q); ok("still dropped as quote_not_found: " + n, p.items.length === 0 && p.reasons.quote_not_found === 1, p.reasons); }
  ok("a quote that is only punctuation and entities is not a match", keep(T0, "&amp;&amp;&amp;").items.length === 0 && keep(T0, "...").items.length === 0);
  // the class: every character and entity the normaliser knows is matched against its plain form
  const bad = [];
  for (const [k, v] of Object.entries(FM.CHARMAP)) { if (!v || /^\s*$/.test(v)) continue; const text = `before ${k} after the sale`, q = `before ${v} after the sale`; if (!FM.locate(text, q)) bad.push("char " + k.codePointAt(0).toString(16)); }
  for (const [n, v] of Object.entries(FM.ENTITIES)) { if (!v.trim()) continue; const text = `before &${n}; after the sale`, q = `before ${v} after the sale`; if (!FM.locate(text, q)) bad.push("entity " + n); }
  ok("class: every character and entity in the normaliser's tables matches its plain form", bad.length === 0, bad);
  ok("the tables cover the curly quotes, the dashes and the common entities", ["‘", "’", "“", "”", "–", "—"].every(c => c in FM.CHARMAP) && ["amp", "nbsp", "rsquo", "lsquo", "ldquo", "rdquo", "ndash", "mdash", "quot", "apos"].every(n => n in FM.ENTITIES));
  // through the whole call: a curly listing and plain quotes, which used to be dropped, are kept; the answer counts what was recovered and why, with no text
  const CURLY = "The car’s “original” engine was rebuilt – not replaced. No accidents &amp; clean title. The owner’s manuals and both keys are included. ".repeat(3);
  const db = mkDb(rowsN(1, CURLY)); db.callModel2 = async () => ({ text: [L("engine rebuilt", "mechanical work", "work_done", "positive", 0, 0, 'original" engine was rebuilt - not replaced'), L("original engine", "originality", "claim", "positive", 0, 0, 'The car\'s "original" engine'), L("no accidents", "accident and title", "absence_stated", "positive", 0, 0, "No accidents & clean title"), L("manuals", "documentation", "claim", "positive", 0, 0, "The owner's manuals and both keys are included"), L("ghost", "other", "claim", "neutral", 0, 0, "the transmission was replaced last year")].join("\n"), usage: { input_tokens: 900, output_tokens: 100 }, stop_reason: "end_turn" });
  const r = await mine(db, { limit: 1 }), rc = r.body.quotes_recovered_by_cause;
  ok("end to end: four quotes the old exact match would have dropped are kept, the invented one is dropped", r.ok && r.body.items_written === 4 && r.body.dropped_by_reason.quote_not_found === 1 && r.body.items_dropped === 1, [r.body.items_written, r.body.dropped_by_reason]);
  ok("the answer says how many were recovered and which difference they needed (counts only): entity 1, curly quotes 3", !!rc && rc.entity === 1 && rc.curly_quote === 3 && Object.values(rc).reduce((a, b) => a + b, 0) === 4, rc);
  ok("the written rows hold spans into the original text and no quote", db.mentions.every(m => m.span_end > m.span_start && m.span_end <= CURLY.length && !("quote" in m)));
  const plain = mkDb(rowsN(1, DESC(0))), rp = await mine(plain, { limit: 1 });
  ok("a listing whose quotes match exactly recovers nothing", Object.values(rp.body.quotes_recovered_by_cause).every(n => n === 0), rp.body.quotes_recovered_by_cause);
});

// ===== 11 THREE CALLS AT ONCE, NO MORE (Lane D, lane-d-factmine-3) =====
await section("the three call cap", async () => {
  const gateModel = (db, gate) => async a => { db.modelCalls++; await gate; return { text: GOOD(a.user), usage: { input_tokens: 900, output_tokens: 100 }, stop_reason: "end_turn" }; };
  const call = (db, extra = {}) => FM.runFactMine({ ...Q, limit: 1 }, { select: db.select, insert: db.insert, callModel: db.callModel2 || db.model(GOOD), ...extra });
  const wait = async (f, ms = 3000) => { const t0 = Date.now(); while (!f() && Date.now() - t0 < ms) await new Promise(r => setTimeout(r, 5)); return f(); };
  const live = db => FM.activeLeases(db.leases.map(l => ({ status: l.status, metadata: l.metadata }))).length;
  ok("the limit is three", FM.MAX_CONCURRENT === 3);
  // three in flight, a fourth is refused
  const db = mkDb(rowsN(6)); let open; const gate = new Promise(r => { open = r; }); db.callModel2 = gateModel(db, gate);
  const three = [call(db), call(db), call(db)]; await wait(() => db.modelCalls === 3);
  const sel0 = db.selects.filter(q => q.startsWith("sales_archive?")).length, models0 = db.modelCalls;
  const fourthP = await withTimeout(call(db), 1500), hungFourth = fourthP === "HUNG", fourth = hungFourth ? { ok: "never answered: it ran" } : fourthP;   // without the cap the fourth call runs and waits on the gate
  ok("a fourth call while three run is refused with a 429 and a clear reason", fourth.ok === false && fourth.status === 429 && /3 factmine calls are already running/.test(fourth.why) && /limit is 3 at once/.test(fourth.why), fourth);
  ok("the refused call read nothing and asked the model nothing", db.selects.filter(q => q.startsWith("sales_archive?")).length === sel0 && db.modelCalls === models0);
  ok("the refused call released its own lease: three running leases are left, not four", live(db) === 3, db.leases.map(l => l.status));
  const fifthP = hungFourth ? "HUNG" : await withTimeout(call(db), 1500), fifth = fifthP === "HUNG" ? { ok: true } : fifthP; ok("a fifth is refused the same way", fifth.ok === false && fifth.status === 429);
  open(); const done = await Promise.all(three);
  ok("the three that were running all answered", done.every(d => d.ok && d.body.mined === 1), done.map(d => d.ok));
  ok("every lease is released when its call answers: none active", live(db) === 0);
  const after = await call(db, { callModel: db.model(GOOD) }); ok("after they answer a new call runs", after.ok === true && after.body.asked === 1, after.why);
  // four started at the same moment: exactly three run
  const dr = mkDb(rowsN(6)); let open2; const gate2 = new Promise(r => { open2 = r; }); dr.callModel2 = gateModel(dr, gate2);
  const race = [call(dr), call(dr), call(dr), call(dr)]; await wait(() => dr.modelCalls >= 3); await new Promise(r => setTimeout(r, 100)); open2(); const rr = await Promise.all(race);
  ok("four calls started together: three run and one is refused", rr.filter(x => x.ok).length === 3 && rr.filter(x => !x.ok && x.status === 429).length === 1, rr.map(x => x.ok ? "ok" : x.status));
  ok("the refused one is the last to take a lease (leases are counted in order)", !rr[3].ok && rr.slice(0, 3).every(x => x.ok), rr.map(x => x.ok));
  // a lease that is released or old does not count
  const old = mkDb(rowsN(3)); for (let i = 0; i < 3; i++) old.leases.push({ id: i + 1, at: Date.now() - FM.LEASE_MS - 5000, status: "running", metadata: { lease: "old" + i } });
  const ro = await call(old); ok("three leases older than the time budget plus a minute have lapsed: a call runs", ro.ok === true, ro.why);
  const rel = mkDb(rowsN(3)); for (let i = 0; i < 3; i++) { rel.leases.push({ id: 2 * i + 1, at: Date.now(), status: "running", metadata: { lease: "r" + i } }); rel.leases.push({ id: 2 * i + 2, at: Date.now(), status: "released", metadata: { lease: "r" + i } }); }
  const rr2 = await call(rel); ok("three released leases do not count: a call runs", rr2.ok === true, rr2.why);
  const fresh = mkDb(rowsN(3)); for (let i = 0; i < 3; i++) fresh.leases.push({ id: i + 1, at: Date.now() - 1000, status: "running", metadata: { lease: "f" + i } });
  const rf = await call(fresh); ok("three fresh running leases refuse a call", rf.ok === false && rf.status === 429 && fresh.modelCalls === 0, rf.why);
  // fail closed
  const dn = mkDb(rowsN(3)); dn.leaseDown = true; const rd = await call(dn); ok("if the number running cannot be read the call does not start (503), and asks nothing", rd.ok === false && rd.status === 503 && dn.modelCalls === 0, rd);
  const wd = mkDb(rowsN(3)); wd.leaseWriteDown = true; const rw = await call(wd); ok("if the lease cannot be written the call does not start (503)", rw.ok === false && rw.status === 503 && wd.modelCalls === 0, rw);
  // the door first, release on every exit
  const dd = mkDb(rowsN(3)), rb = await FM.runFactMine({ source: "bringatrailer", family: "e46_m3" }, { select: dd.select, insert: dd.insert, callModel: dd.model(GOOD) }); ok("a call the door refuses takes no lease", rb.ok === false && rb.status === 400 && dd.leases.length === 0);
  const mt = mkDb(rowsN(3)); mt.tablesMissing = true; const rm = await call(mt); ok("a call that ends in a refusal after the lease (tables missing) releases it", rm.status === 409 && live(mt) === 0);
  const ex = mkDb(rowsN(3)), bomb = { select: async qs => { if (qs.startsWith("sales_archive?")) throw new Error("boom"); return ex.select(qs); }, insert: ex.insert, callModel: ex.model(GOOD) };
  let thrown = false; try { await FM.runFactMine({ ...Q, limit: 1 }, bomb); } catch { thrown = true; }
  ok("a call that throws releases its lease too", thrown && live(ex) === 0);
  const src = fs.readFileSync("api/usageDashboard.js", "utf8"), at = src.indexOf('task === "factmine"');
  ok("the endpoint passes the refusal's status through (a 429 is a 429)", at > 0 && /res\.status\(r\.status \|\| 400\)/.test(src.slice(at, at + 3000)));
  const mineSrc = fs.readFileSync("lib/factMine.js", "utf8");
  ok("the lease is counted from the database (app_usage_events), not from a variable in one instance", /app_usage_events\?select=id,status,metadata&event_type=eq\./.test(mineSrc) && !/let activeCalls|activeCount\+\+/.test(mineSrc));
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
    ["an item whose quote is not in the text keeps a span", ...sub("lib/factMine.js", "const i = n.s.indexOf(q); if (i < 0) return null;", "const i = n.s.indexOf(q); if (i < 0) return [0, Math.min(q.length, text.length)];")],
    ["the quote match does not fold whitespace", ...sub("lib/factMine.js", "if (/\\s/.test(ch)) {", "if (false) {")],
    ["the quote match does not read curly quotes", ...sub("lib/factMine.js", "\"\\u2018\": \"'\", \"\\u2019\": \"'\",", "")],
    ["the quote match does not read en and em dashes", ...sub("lib/factMine.js", "\"\\u2013\": \"-\", \"\\u2014\": \"-\",", "")],
    ["the quote match does not decode entities", ...sub("lib/factMine.js", "if (c === \"&\") {", "if (false) {")],
    ["the quote match is case sensitive", ...sub("lib/factMine.js", "for (const ch of c.toLowerCase()) {", "for (const ch of c) {")],
    ["the span is the normalised position, not the original", ...sub("lib/factMine.js", "return [n.from[i], n.to[i + q.length - 1]];", "return [i, i + q.length];")],
    ["an unfinished entity at the 60 character cut is not taken off", ...sub("lib/factMine.js", ".replace(/&#?[A-Za-z0-9]{0,8}$/, \"\")", "")],
    ["a leading or trailing ellipsis is not taken off", "lib/factMine.js", s => s.replace(/\.replace\(\/\^\\s\*\(\?:[^\n]*?\$\/g, ""\)/, ""), "ellipsis"],
    ["a recovered quote is not counted", ...sub("lib/factMine.js", "if (textRead.toLowerCase().indexOf(q0.toLowerCase()) < 0) recovered[", "if (false) recovered[")],
    ["the fourth call is not refused", ...sub("lib/factMine.js", "if (rank >= MAX_CONCURRENT) {", "if (false) {")],
    ["the limit is four", ...sub("lib/factMine.js", "MAX_CONCURRENT = 3,", "MAX_CONCURRENT = 4,")],
    ["a lease is not released when the call answers", ...sub("lib/factMine.js", "finally { await releaseLease(deps, L.lease); }", "finally { }")],
    ["a refused call keeps its lease", ...sub("lib/factMine.js", "if (rank >= MAX_CONCURRENT) { await releaseLease(deps, lease); return", "if (rank >= MAX_CONCURRENT) { return")],
    ["a lapsed lease still counts", ...sub("lib/factMine.js", "&created_at=gte.${encodeURIComponent(since)}", "")],
    ["a released lease still counts", ...sub("lib/factMine.js", "r.status === \"running\" && !gone.has(r.metadata && r.metadata.lease)", "r.status === \"running\"")],
    ["the call starts when the lease count cannot be read", ...sub("lib/factMine.js", "if (!act || rank < 0) {", "if (false) {")],
    ["the call starts when the lease cannot be written (both guards: the write error and the missing own row)", "lib/factMine.js", s => s.replace("if (w && w.error) return { ok: false, status: 503, why: \"this call could not be counted", "if (false) return { ok: false, status: 503, why: \"this call could not be counted").replace("if (!act || rank < 0) {", "if (false) {"), "lease write"],
    ["the refusal is a 400, not a 429", ...sub("lib/factMine.js", "return { ok: false, status: 429,", "return { ok: false, status: 400,")],
    ["the endpoint drops the refusal's status", ...sub("api/usageDashboard.js", "res.status(r.status || 400).json({ task, error: r.why });", "res.status(400).json({ task, error: r.why });")],
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
    ["the prompt no longer skips factory equipment", ...sub("lib/factMine.js", "factory equipment and options of every kind, even when", "ordinary things, even when")],
    ["the prompt keeps factory packages again", ...sub("lib/factMine.js", "stated absences (\\\"no accidents\\\", \\\"never tracked\\\").\",", "stated absences (\\\"no accidents\\\", \\\"never tracked\\\"); factory packages or rare options named as such.\",")],
    ["a cut off answer keeps its partial last line", ...sub("lib/factMine.js", "if (opts.truncated && !/\\n\\s*$/.test(raw) && lines.length) {", "if (false) {")],
    ["a truncated listing is not flagged", ...sub("lib/factMine.js", "...(truncated ? { error: \"truncated\" } : {})", "")],
    ["a truncated listing is a failure", ...sub("lib/factMine.js", "if (parsed.bad) return fail(", "if (parsed.bad || truncated) return fail(")],
    ["the item cap of 30 is not applied", ...sub("lib/factMine.js", "if (evaluated >= MAX_ITEMS) {", "if (false) {")],
    ["a quote is not clipped to 60 characters", ...sub("lib/factMine.js", ".trim().slice(0, MAX_QUOTE), topic", ".trim(), topic")],
    ["the miner version is not bumped", ...sub("lib/factMine.js", "export const MINER_VERSION = \"fm3\"", "export const MINER_VERSION = \"fm2\"")],
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
