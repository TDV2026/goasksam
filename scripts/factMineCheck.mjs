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
    if (qs.startsWith("listing_mining_runs?")) { if (db.tablesMissing) return null; const m = /listing_id=in\.([^&]*)/.exec(qs); if (m) { const ids = decodeURIComponent(m[1]).replace(/[()"]/g, "").split(","); return ids.filter(i => db.runs.has(i)).map(i => ({ listing_id: i, status: db.runs.get(i).status })); } return [...db.runs.values()].filter(r => r.status === "done").slice(0, 1000); }
    if (qs.startsWith("listing_mentions?")) { if (db.tablesMissing) return null; const off = Number((/offset=(\d+)/.exec(qs) || [0, 0])[1]), lim = Number((/limit=(\d+)/.exec(qs) || [0, 1000])[1]); return db.mentions.slice(off, off + lim); }
    if (qs.startsWith("topic_map?")) { if (db.tablesMissing) return null; const off = Number((/offset=(\d+)/.exec(qs) || [0, 0])[1]), lim = Number((/limit=(\d+)/.exec(qs) || [0, 1000])[1]); return db.map.slice(off, off + lim); }
    return [];
  };
  db.insert = async (table, rs) => { db.inserts++; if (table === "listing_mining_runs") for (const r of rs) db.runs.set(r.listing_id, r); else if (table === "listing_mentions") db.mentions.push(...rs); else if (table === "topic_map") { for (const r of rs) if (!db.map.some(m => m.raw_topic === r.raw_topic && m.family === r.family && m.map_version === r.map_version)) db.map.push(r); } return {}; };
  db.model = text => async ({ system, user }) => { db.modelCalls++; db.prompts.push({ system, user }); return { text: typeof text === "function" ? text(user) : text, usage: { input_tokens: 1200, output_tokens: 300 } }; };
  db.callModel = a => db.model(GOOD)(a);
  return db;
};
const quoteOf = (d, i) => d.slice(d.indexOf(i), d.indexOf(i) + i.length);
const GOOD = user => { const d = user.split("DESCRIPTION:\n")[1] || ""; return JSON.stringify({ items: [
  { topic: "repainted", category: "paint and body", statement_type: "work_done", polarity: "neutral", has_date: false, has_mileage: false, quote: "repainted in the original color" },
  { topic: "timing chain guides replaced", category: "mechanical work", statement_type: "work_done", polarity: "positive", has_date: true, has_mileage: true, quote: "timing chain guides were replaced at 61,000 miles in 2022" },
  { topic: "service records", category: "documentation", statement_type: "claim", polarity: "positive", has_date: false, has_mileage: false, quote: "Service records are included from new" },
  { topic: "no accidents", category: "accident and title", statement_type: "absence_stated", polarity: "positive", has_date: false, has_mileage: false, quote: "No accidents, clean title" },
  { topic: "invented fact", category: "other", statement_type: "claim", polarity: "neutral", has_date: false, has_mileage: false, quote: "this sentence is not in the description" },
  { topic: "no quote", category: "other", statement_type: "claim", polarity: "neutral", has_date: false, has_mileage: false },
  { topic: "bad category", category: "weather", statement_type: "claim", polarity: "neutral", has_date: false, has_mileage: false, quote: "original 19 inch wheels" },
  { topic: "bad type", category: "other", statement_type: "rumour", polarity: "neutral", has_date: false, has_mileage: false, quote: "original 19 inch wheels" },
  { topic: "bad polarity", category: "other", statement_type: "claim", polarity: "great", has_date: false, has_mileage: false, quote: "original 19 inch wheels" }] }); };
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
  const p = FM.parseItems(JSON.stringify({ items: [
    { topic: "repainted", category: "paint and body", statement_type: "work_done", polarity: "neutral", quote: "repainted paint" }, { topic: "ghost", category: "other", statement_type: "claim", polarity: "neutral", quote: "never written here" }, { topic: "x", category: "other", statement_type: "claim", polarity: "neutral" },
    { topic: "records", category: "documentation", statement_type: "claim", polarity: "positive", quote: "SERVICE RECORDS inside" }] }), text);
  ok("an item whose quote is in the text is kept and its span is the quote's place in the text", p.items.length === 2 && p.items[0].span_start === text.indexOf("repainted paint") && p.items[0].span_end === p.items[0].span_start + "repainted paint".length, p.items[0]);
  ok("an item whose quote is not in the text, or that has no quote, is dropped", p.dropped === 2 && !p.items.some(i => i.topic === "ghost" || i.topic === "x"), p);
  ok("every kept span lies inside the text read", p.items.every(i => i.span_start >= 0 && i.span_end <= text.length && i.span_end > i.span_start));
  ok("an unreadable answer is bad, not an item", FM.parseItems("no json here", text).bad === true);
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
    ["an item with a bad category is kept", ...sub("lib/factMine.js", "|| !category || !type || !pol)", ")")],
    ["a done listing is mined again", ...sub("lib/factMine.js", "const todo = eligible.filter((r, i) => !doneIds.has(ids[i])).slice(0, call.limit);", "const todo = eligible.slice(0, call.limit);")],
    ["an unwindowed call is allowed", ...sub("lib/factMine.js", "if (!DATE.test(from) || !DATE.test(to)) return", "if (false) return")],
    ["a window over 366 days is allowed", ...sub("lib/factMine.js", "if (days(from, to) > MAX_WINDOW_DAYS) return", "if (false) return")],
    ["more than 25 listings are allowed", ...sub("lib/factMine.js", "if (lim > MAX_LISTINGS) return", "if (false) return")],
    ["the token cap is not applied", ...sub("lib/factMine.js", "if (out.tokens_input + out.tokens_output >= call.tokenCap) { out.stopped = \"token_cap\"; break; }", "")],
    ["a token cap over its limit is allowed", ...sub("lib/factMine.js", "if (cap > MAX_TOKEN_CAP) return", "if (false) return")],
    ["a source without full text is allowed", ...sub("lib/factMine.js", "if (!SOURCES.includes(source)) return", "if (false) return")],
    ["text can be returned", ...sub("lib/factMine.js", "if (typeof v === \"string\") return v.length <= 200;", "if (typeof v === \"string\") return true;")],
    ["the map merges opposite meanings", ...sub("lib/factMap.js", "if (parts.size <= 1) return [{ canonical, members: [...members] }];", "return [{ canonical, members: [...members] }];")],
    ["the map asks again for what is mapped", ...sub("lib/factMap.js", "filter(([t]) => !have.has(t))", "filter(([t]) => true)")],
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
