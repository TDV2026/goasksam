// factMapCheck (Lane D, Nov 18 2026, lane-d-factmine-3): the KIND of a canonical topic, on fixtures and a fake database (no network, no model). There was no factMapCheck before: the map's own cases live in factMineCheck section 7; this file is the kind.
//  1 THE KINDS are the seven in the order: condition, history, work_done, modification, paperwork, equipment, other. The map prompt names them and asks for one per group.
//  2 THE MAP GIVES EVERY RAW TOPIC THE KIND OF ITS GROUP: a part the opposite-meaning guard splits off keeps the kind; "Work Done" and "work-done" are work_done; a kind outside the list is stored as nothing (null), counted, never guessed.
//  3 THE ROWS WRITTEN BEFORE KINDS (the m1 map) are asked ONCE, labels and counts only (no listing text), without changing a canonical name; a second call asks nothing; a label the model left out is asked in the same call.
//  4 THE REPORT sets equipment aside by default and SAYS HOW MANY (topics, mentions, listings); equipment=include shows it; shares keep the same denominators; the pairs never hold an equipment topic; a topic with no kind is never set aside and is counted.
//  5 THE PRICE READ sets equipment aside by default and says how many topics and mentions; equipment=include reads them.
//  6 THE CLASS: every task that ranks canonical topics (factreport, factprice) reads the kind through kindsOf; the SQL adds the column.
//   node scripts/factMapCheck.mjs [repo root]      --mutants breaks one rule at a time (each must fail)
import fs from "node:fs"; import path from "node:path"; import { spawnSync } from "node:child_process"; import { fileURLToPath, pathToFileURL } from "node:url";
const args = process.argv.slice(2), here = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.resolve(args.find(a => !a.startsWith("--")) || path.join(here, ".."));
if (args.includes("--mutants")) process.exit(mutants());
process.chdir(ROOT);
const imp = f => import(pathToFileURL(path.join(ROOT, f)).href);
const MAP = await imp("lib/factMap.js"), REP = await imp("lib/factReport.js"), FP = await imp("lib/factPrice.js"), FM = await imp("lib/factMine.js");
let pass = 0, fail = 0; const fails = []; const ok = (n, c, d) => { if (c) pass++; else { fail++; fails.push(n + (d !== undefined ? " " + JSON.stringify(d).slice(0, 260) : "")); } };
const section = async (name, fn) => { try { await fn(); } catch (e) { ok(name + " ran without throwing", false, String(e && e.stack || e).slice(0, 300)); } };

// ---- a fake database for the map: mentions (raw topics with counts) and topic_map rows --------------------------------------------
const mkDb = (rawCounts, mapRows = []) => {
  const db = { mentions: [], map: mapRows.map(r => ({ ...r })), calls: [], writes: [] };
  let n = 0; for (const [topic, k] of Object.entries(rawCounts)) for (let i = 0; i < k; i++) db.mentions.push({ topic, listing_id: "bringatrailer:L" + (n++) });
  const page = (rows, qs) => { const off = Number((/offset=(\d+)/.exec(qs) || [0, 0])[1]), lim = Number((/limit=(\d+)/.exec(qs) || [0, 1000])[1]); return rows.slice(off, off + lim); };
  db.select = async qs => qs.startsWith("listing_mentions?") ? page(db.mentions, qs) : qs.startsWith("topic_map?") ? page(db.map, qs) : [];
  db.insert = async (table, rows, prefer) => { db.writes.push({ table, prefer, n: rows.length }); for (const r of rows) { const k = db.map.findIndex(m => m.raw_topic === r.raw_topic && m.family === r.family && m.map_version === r.map_version); if (k < 0) db.map.push({ ...r }); else if (/merge-duplicates/.test(prefer || "")) db.map[k] = { ...db.map[k], ...r }; } return {}; };
  db.model = (groups, kinds = {}) => async a => { db.calls.push({ system: a.system, user: a.user }); const u = { input_tokens: 100, output_tokens: 50 };
    if (/^You label/.test(a.system)) return { text: JSON.stringify({ kinds: JSON.parse(a.user).map(x => ({ topic: x.topic, kind: kinds[x.topic] || "other" })) }), usage: u };
    return { text: JSON.stringify({ groups }), usage: u }; };
  return db;
};
const run = (db, model, q = {}) => MAP.runFactMap({ family: "e46_m3", limit: 300, ...q }, { select: db.select, insert: db.insert, callModel: model });
const kindOfRaw = (db, raw) => (db.map.find(m => m.raw_topic === raw) || {}).kind;

await section("the kinds", async () => {
  ok("the eight kinds (the seven and option), in this order", JSON.stringify(MAP.KINDS) === JSON.stringify(["condition", "history", "work_done", "modification", "paperwork", "equipment", "option", "other"]), MAP.KINDS);
  ok("the map prompt names every kind and asks for a kind in each group", MAP.KINDS.every(k => MAP.MAP_SYSTEM.includes(`"${k}"`)) && /Give every group a kind, one of:/.test(MAP.MAP_SYSTEM) && /"kind":/.test(MAP.MAP_SYSTEM.replace(/\\"/g, '"')));
  ok("the labelling prompt names every kind and says what equipment is", MAP.KINDS.every(k => MAP.KIND_SYSTEM.includes(`"${k}"`)) && /equipment \(what the car was built with/.test(MAP.KIND_SYSTEM) && /option \(a factory option, package or trim line named as such/.test(MAP.KIND_SYSTEM));
  ok("kindOf accepts the spellings a model gives and refuses what is not a kind", MAP.kindOf("Work Done") === "work_done" && MAP.kindOf("work-done") === "work_done" && MAP.kindOf(" EQUIPMENT ") === "equipment" && MAP.kindOf("options") === null && MAP.kindOf("") === null && MAP.kindOf(null) === null);
});

await section("the map gives a kind", async () => {
  const raw = { "limited-slip differential": 9, "lsd": 3, "shadowline trim": 6, "repainted": 5, "original paint": 4, "no accidents": 7, "accident": 2, "service records": 8, "records from new": 2, "weird thing": 2, "other fact": 2 };
  const groups = [{ canonical: "limited-slip differential", kind: "equipment", members: ["limited-slip differential", "lsd"] }, { canonical: "shadowline trim", kind: "Equipment", members: ["shadowline trim"] },
    { canonical: "paint", kind: "work done", members: ["repainted", "original paint"] }, { canonical: "accident history", kind: "history", members: ["no accidents", "accident"] },
    { canonical: "service records", kind: "paperwork", members: ["service records", "records from new"] }, { canonical: "weird", kind: "gadgets", members: ["weird thing"] }];
  const db = mkDb(raw), r = await run(db, db.model(groups, { "other fact": "other", "weird": "gadgets" }));
  ok("the map ran", r.ok, r.why);
  ok("every raw topic of a group has the group's kind (lsd and its group are equipment)", kindOfRaw(db, "lsd") === "equipment" && kindOfRaw(db, "limited-slip differential") === "equipment" && kindOfRaw(db, "shadowline trim") === "equipment" && kindOfRaw(db, "service records") === "paperwork" && kindOfRaw(db, "records from new") === "paperwork");
  ok("a kind written as \"work done\" is stored as work_done", kindOfRaw(db, "repainted") === "work_done");
  ok("a part the opposite meaning guard splits off keeps the group's kind (repainted and original paint are apart and both work_done)", db.map.find(m => m.raw_topic === "original paint").canonical_topic !== db.map.find(m => m.raw_topic === "repainted").canonical_topic && kindOfRaw(db, "original paint") === "work_done");
  ok("a no accident and an accident are apart and both history", db.map.find(m => m.raw_topic === "no accidents").canonical_topic !== db.map.find(m => m.raw_topic === "accident").canonical_topic && kindOfRaw(db, "no accidents") === "history" && kindOfRaw(db, "accident") === "history");
  ok("a kind outside the list is stored as nothing, and counted: it is never guessed as other", (kindOfRaw(db, "weird thing") === null || kindOfRaw(db, "weird thing") === undefined) && !db.map.some(m => m.kind === "gadgets"));
  ok("a label the model left out is asked in the same call and gets its kind", kindOfRaw(db, "other fact") === "other" && db.calls.length === 2 && /^You label/.test(db.calls[1].system), db.calls.length);
  const tally = {}; for (const c of new Set(db.map.filter(m => m.kind).map(m => m.canonical_topic))) { const k = db.map.find(m => m.canonical_topic === c).kind; tally[k] = (tally[k] || 0) + 1; }
  ok("the answer counts the kinds it set (equipment 2) and the ones with none (1), counts only", JSON.stringify(r.body.kinds) === JSON.stringify(tally) && r.body.kinds.equipment === 2 && r.body.kind_missing === 1, [r.body.kinds, tally, r.body.kind_missing]);
  ok("the answer holds counts only", (() => { try { FM.assertCountsOnly(r.body); return true; } catch { return false; } })());
});

await section("rows written before kinds", async () => {
  const raw = { "limited-slip differential": 9, "clean carfax report": 12, "rod bearings replaced": 5, "no accidents": 7 };
  const old = [{ raw_topic: "limited-slip differential", canonical_topic: "limited-slip differential", family: "e46_m3", map_version: "m1" }, { raw_topic: "lsd", canonical_topic: "limited-slip differential", family: "e46_m3", map_version: "m1" },
    { raw_topic: "clean carfax report", canonical_topic: "clean carfax report", family: "e46_m3", map_version: "m1" }, { raw_topic: "rod bearings replaced", canonical_topic: "rod bearings replaced", family: "e46_m3", map_version: "m1" }, { raw_topic: "no accidents", canonical_topic: "no accidents", family: "e46_m3", map_version: "m1", kind: "history" }];
  const db = mkDb({ ...raw, lsd: 3 }, old), before = db.map.map(m => m.canonical_topic).join("|");
  const r = await run(db, db.model([], { "limited-slip differential": "equipment", "clean carfax report": "paperwork", "rod bearings replaced": "work_done" }));
  ok("the labelling pass ran for the rows with no kind: 3 canonical topics asked, 3 kinded", r.ok && r.body.kind_asked === 3 && r.body.kinded === 3 && r.body.asked === 0, r.body || r.why);
  ok("every row of a canonical topic got its kind, including the second spelling (lsd)", kindOfRaw(db, "lsd") === "equipment" && kindOfRaw(db, "limited-slip differential") === "equipment" && kindOfRaw(db, "clean carfax report") === "paperwork" && kindOfRaw(db, "rod bearings replaced") === "work_done");
  ok("a row that already had a kind is not asked about and not changed", kindOfRaw(db, "no accidents") === "history" && !JSON.stringify(db.calls.map(c => c.user)).includes("no accidents"));
  ok("no canonical name changed", db.map.map(m => m.canonical_topic).join("|") === before);
  ok("the model was asked labels and counts only, one call, no listing text", db.calls.length === 1 && JSON.parse(db.calls[0].user).every(x => Object.keys(x).sort().join() === "n,topic") && !/DESCMARK|SELLER/.test(db.calls[0].user), db.calls[0] && db.calls[0].user);
  const calls1 = db.calls.length, r2 = await run(db, db.model([], {}));
  ok("a second call asks the model nothing and writes nothing", r2.ok && db.calls.length === calls1 && r2.body.kind_asked === 0 && r2.body.asked === 0 && db.writes.filter(w => /merge/.test(w.prefer || "")).length === 1, r2.body);
  const bad = mkDb({ a: 3 }, [{ raw_topic: "a", canonical_topic: "a", family: "e46_m3", map_version: "m1" }]), rb = await run(bad, async () => ({ text: JSON.stringify({ kinds: [{ topic: "a", kind: "gadgets" }] }), usage: { input_tokens: 1, output_tokens: 1 } }));
  ok("an answer with a kind outside the list leaves the row with no kind and counts it (asked again next time)", rb.ok && rb.body.kind_missing === 1 && !kindOfRaw(bad, "a"), rb.body);
  const unread = mkDb({ a: 3 }, [{ raw_topic: "a", canonical_topic: "a", family: "e46_m3", map_version: "m1" }]), ru = await run(unread, async () => ({ text: "no json", usage: { input_tokens: 1, output_tokens: 1 } }));
  ok("an unreadable labelling answer is an error (502), nothing is written", ru.ok === false && ru.status === 502 && unread.writes.length === 0, ru);
  const noCol = { select: async qs => qs.startsWith("topic_map?") ? null : [], insert: async () => ({}), callModel: async () => ({}) }, rn = await MAP.runFactMap({ family: "e46_m3" }, noCol);
  ok("a topic_map with no kind column refuses cleanly and says to run the SQL", rn.ok === false && rn.status === 409 && /kind column/.test(rn.why) && /supabase-factmine\.sql/.test(rn.why), rn);
});

// ---- the report and the price read ------------------------------------------------------------------------------------------------
const MAPROWS = [["clean carfax report", "clean carfax report", "paperwork"], ["limited-slip differential", "limited-slip differential", "equipment"], ["lsd", "limited-slip differential", "equipment"], ["shadowline trim", "shadowline trim", "equipment"], ["rod bearings replaced", "rod bearings replaced", "work_done"]].map(([raw_topic, canonical_topic, kind]) => ({ raw_topic, canonical_topic, kind }));
const reportData = () => {
  const runs = [], mentions = [], sales = new Map(); const add = (i, t) => mentions.push({ listing_id: `bringatrailer:L${i}`, source: "bringatrailer", topic: t, statement_type: "claim", polarity: "positive", has_date: false, has_mileage: false });
  for (let i = 0; i < 20; i++) { runs.push({ listing_id: `bringatrailer:L${i}`, source: "bringatrailer", sold_or_attempt: "sold", characters_read: 2000 }); if (i < 12) add(i, "clean carfax report"); if (i % 2 === 0 && i < 18) add(i, i % 4 === 0 ? "limited-slip differential" : "lsd"); if (i >= 14) add(i, "shadowline trim"); if ([3, 5, 7, 9, 11].includes(i)) add(i, "rod bearings replaced"); if ([1, 13, 15, 19].includes(i)) add(i, "mystery topic"); }
  return { runs, mentions, map: MAPROWS, sales };
};
await section("the report", async () => {
  const D = reportData(), eqMentions = D.mentions.filter(m => ["limited-slip differential", "lsd", "shadowline trim"].includes(m.topic)).length, eqListings = new Set(D.mentions.filter(m => ["limited-slip differential", "lsd", "shadowline trim"].includes(m.topic)).map(m => m.listing_id)).size;
  const base = { family: "e46_m3", map: "m1", top: 20 }, def = REP.reportFrom(D, { ...base, includeEquipment: false }), inc = REP.reportFrom(D, { ...base, includeEquipment: true });
  const names = o => o.topics.map(t => t.topic);
  ok("by default the equipment topics are not in the list", !names(def).includes("limited-slip differential") && !names(def).includes("shadowline trim") && names(def).includes("clean carfax report") && names(def).includes("rod bearings replaced"), names(def));
  ok("it says how many were set aside: 2 topics, " + eqMentions + " statements, " + eqListings + " listings", def.set_aside.kind === "equipment" && def.set_aside.included === false && def.set_aside.topics === 2 && def.set_aside.mentions === eqMentions && def.set_aside.listings === eqListings, def.set_aside);
  ok("a topic with no kind is not set aside, it is counted", names(def).includes("mystery topic") && def.topics_without_kind === 1 && def.topics.find(t => t.topic === "mystery topic").kind === null, [def.topics_without_kind]);
  ok("each topic shows its kind", def.topics.find(t => t.topic === "clean carfax report").kind === "paperwork" && def.topics.find(t => t.topic === "rod bearings replaced").kind === "work_done");
  ok("the totals still cover everything mined (20 listings, every mention, 5 canonical topics + the unmapped one), only the list is shorter", def.mined_listings === 20 && def.mentions === D.mentions.length && def.canonical_topics === 5 && def.canonical_topics_shown === 3, [def.canonical_topics, def.canonical_topics_shown]);
  ok("a share keeps its denominator: carfax is 12 of 20, 60 percent, with or without the equipment", def.topics.find(t => t.topic === "clean carfax report").share_of_listings_pct === 60 && inc.topics.find(t => t.topic === "clean carfax report").share_of_listings_pct === 60);
  ok("the pairs never hold an equipment topic by default", def.pairs.every(p => !["limited-slip differential", "shadowline trim"].includes(p.a) && !["limited-slip differential", "shadowline trim"].includes(p.b)) && inc.pairs.some(p => ["limited-slip differential", "shadowline trim"].includes(p.a) || ["limited-slip differential", "shadowline trim"].includes(p.b)));
  ok("equipment=include lists them, with their kind, and says none were set aside", names(inc).includes("limited-slip differential") && inc.topics.find(t => t.topic === "limited-slip differential").kind === "equipment" && inc.set_aside.included === true && inc.set_aside.topics === 0, inc.set_aside);
  { // fm4: deciding happens here. A topic's kind can be option; equipment AND option are set aside by default, both come back with equipment=include, and nothing is re-read.
    const runs = Array.from({ length: 10 }, (_, i) => ({ listing_id: "bringatrailer:L" + i, source: "bringatrailer" })), mention = (t, n) => Array.from({ length: n }, (_, i) => ({ listing_id: "bringatrailer:L" + i, source: "bringatrailer", topic: t, statement_type: "claim", polarity: "neutral", has_date: false, has_mileage: false }));
    const mm = [...mention("sport chrono package", 6), ...mention("19 inch wheels", 5), ...mention("clutch replaced", 4)], mp = [{ raw_topic: "sport chrono package", canonical_topic: "sport chrono package", kind: "option" }, { raw_topic: "19 inch wheels", canonical_topic: "19 inch wheels", kind: "equipment" }, { raw_topic: "clutch replaced", canonical_topic: "clutch replaced", kind: "work_done" }];
    const d = REP.reportFrom({ runs, mentions: mm, map: mp, sales: new Map() }, { family: "e46_m3", map: "m1", top: 20, includeEquipment: false }), n = REP.reportFrom({ runs, mentions: mm, map: mp, sales: new Map() }, { family: "e46_m3", map: "m1", top: 20, includeEquipment: true });
    ok("by default an option topic is set aside with the equipment, and the answer counts both (2 topics, 11 statements)", d.topics.map(t => t.topic).join() === "clutch replaced" && d.set_aside.topics === 2 && d.set_aside.mentions === 11 && d.set_aside.included === false && JSON.stringify(d.set_aside.kinds) === JSON.stringify(["equipment", "option"]), d.set_aside);
    ok("with equipment=include the option topic is listed with its kind and nothing is set aside", n.topics.some(t => t.topic === "sport chrono package" && t.kind === "option") && n.set_aside.topics === 0, n.set_aside);
    const g = MAP.ASIDE_KINDS; ok("the kinds set aside by default are exactly equipment and option (a reader's decision, kept in one place)", JSON.stringify(g) === JSON.stringify(["equipment", "option"])); }
  const km = REP.kindsOf([{ canonical_topic: "x", kind: "equipment" }, { canonical_topic: "x", kind: "equipment" }, { canonical_topic: "x", kind: "other" }, { canonical_topic: "y", kind: null }, { canonical_topic: "z", kind: "gadgets" }]);
  ok("the kind of a canonical topic is the most common kind among its rows; no kind or a kind outside the list is none", km.get("x") === "equipment" && !km.has("y") && !km.has("z"), [...km]);
  ok("the two spellings of the limited-slip differential count as one topic on 9 listings", inc.topics.find(t => t.topic === "limited-slip differential").listings === 9);
  const pc = REP.parseReportCall({ family: "e46_m3" }), pi = REP.parseReportCall({ family: "e46_m3", equipment: "include" }), px = REP.parseReportCall({ family: "e46_m3", equipment: "all" });
  ok("the call: equipment set aside by default, include on request, anything else refused", pc.ok && pc.call.includeEquipment === false && pi.ok && pi.call.includeEquipment === true && px.ok === false);
  ok("the report holds counts only", (() => { try { FM.assertCountsOnly(def); return true; } catch { return false; } })());
  const sel = async qs => qs.startsWith("listing_mining_runs?") ? D.runs : qs.startsWith("listing_mentions?") ? D.mentions : qs.startsWith("topic_map?") ? (qs.includes("select=raw_topic,canonical_topic,kind") ? D.map : D.map.map(({ kind, ...r }) => r)) : [];
  const viaTask = await REP.runFactReport({ family: "e46_m3", top: 20 }, { select: sel }), viaInc = await REP.runFactReport({ family: "e46_m3", top: 20, equipment: "include" }, { select: sel });
  ok("through the task body: the default sets 2 aside, include sets none (the topic_map read asks for the kind column)", viaTask.ok && viaTask.body.set_aside.topics === 2 && viaInc.ok && viaInc.body.set_aside.topics === 0, viaTask.ok ? viaTask.body.set_aside : viaTask.why);
});
await section("the price read", async () => {
  const runs = [], mentions = [], sales = new Map();
  for (let i = 0; i < 90; i++) { const id = `bringatrailer:S${i}`; runs.push({ listing_id: id, source: "bringatrailer", sold_or_attempt: "sold", characters_read: 2000 + (i % 7) * 100 }); const price = 40000 + (i % 11) * 300;
    sales.set(id, { source_id: "S" + i, sale_date: "2026-03-01", year: 2003, mileage: String(30000 + i * 100), transmission: "6-speed manual", listing_title: "2003 BMW M3 Coupe", sale_price_usd: price, sale_price: price });
    const add = t => mentions.push({ listing_id: id, source: "bringatrailer", topic: t, statement_type: "claim", polarity: "positive", has_date: false, has_mileage: false });
    if (i % 2 === 0) add("limited-slip differential"); if (i % 3 === 0) add("clean carfax report"); }
  const map = [{ raw_topic: "limited-slip differential", canonical_topic: "limited-slip differential", kind: "equipment" }, { raw_topic: "clean carfax report", canonical_topic: "clean carfax report", kind: "paperwork" }];
  const select = async qs => { const off = Number((/offset=(\d+)/.exec(qs) || [0, 0])[1]), lim = Number((/limit=(\d+)/.exec(qs) || [0, 1000])[1]);
    if (qs.startsWith("listing_mining_runs?")) return runs.slice(off, off + lim); if (qs.startsWith("listing_mentions?")) return mentions.slice(off, off + lim); if (qs.startsWith("topic_map?")) return map.slice(off, off + lim);
    if (qs.startsWith("sales_archive?")) { const m = /source_id=in\.([^&]*)/.exec(qs), ids = decodeURIComponent(m[1]).replace(/[()"]/g, "").split(","); return ids.map(i => sales.get("bringatrailer:" + i)).filter(Boolean); } return []; };
  const d = await FP.runFactPrice({ family: "e46_m3" }, { select }), i = await FP.runFactPrice({ family: "e46_m3", equipment: "include" }, { select });
  ok("the price read ran", d.ok && i.ok, d.why || i.why);
  ok("by default the equipment topic is not read, and the answer says it set 1 topic and 45 statements aside", d.ok && !d.body.reported.some(x => x.topic === "limited-slip differential") && d.body.reported.some(x => x.topic === "clean carfax report") && d.body.set_aside.topics === 1 && d.body.set_aside.mentions === 45 && d.body.set_aside.included === false, d.ok && d.body.set_aside);
  ok("with equipment=include it is read and nothing is said to be set aside", i.ok && i.body.reported.some(x => x.topic === "limited-slip differential") && i.body.set_aside.topics === 0 && i.body.set_aside.included === true, i.ok && i.body.set_aside);
  ok("the other topic is read the same either way (30 listings with it)", d.ok && i.ok && d.body.reported.find(x => x.topic === "clean carfax report").listings_with === 30 && i.body.reported.find(x => x.topic === "clean carfax report").listings_with === 30);
});
await section("the class", async () => {
  const rep = fs.readFileSync("lib/factReport.js", "utf8"), pr = fs.readFileSync("lib/factPrice.js", "utf8"), sql = fs.readFileSync("docs/supabase-factmine.sql", "utf8"), api = fs.readFileSync("api/usageDashboard.js", "utf8");
  ok("every task that ranks canonical topics (factreport, factprice) reads the kind through kindsOf and sets equipment aside", /kindsOf/.test(rep) && /"equipment"/.test(rep) && /kindsOf/.test(pr) && /"equipment"/.test(pr) && /includeEquipment/.test(pr) && /includeEquipment/.test(rep));
  ok("no other lib/fact*.js file ranks canonical topics without the kind (a file that calls canonOf must also use kindsOf)", fs.readdirSync("lib").filter(f => /^fact/.test(f)).every(f => { const s = fs.readFileSync("lib/" + f, "utf8"); return !/import[^;]*\bcanonOf\b[^;]*from "\.\/factReport\.js"/.test(s) || /kindsOf/.test(s); }));
  ok("the SQL adds the kind column with the seven kinds, safe to run again", /^alter table topic_map add column if not exists kind text check \(kind in \('condition','history','work_done','modification','paperwork','equipment','other'\)\)/m.test(sql));
  ok("the topic_map table keeps its lock down lines (row level security, no anon or authenticated grant)", /alter table topic_map\s+enable row level security/.test(sql) && /revoke all on topic_map\s+from anon, authenticated/.test(sql));
  ok("the endpoint hands the query to the tasks as it is (so equipment=include reaches them)", /run\(req\.query \|\| \{\}, deps\)/.test(api));
});

console.log(fails.slice(0, 60).map(f => "FAIL " + f).join("\n") + (fails.length ? "\n" : "") + `factMapCheck: ${pass} pass, ${fail} FAIL`);
process.exit(fail ? 1 : 0);

function mutants() {
  const me = fileURLToPath(import.meta.url), R = ROOT;
  const sub = (file, from, to) => [file, s => { if (!s.includes(from)) return s; return s.replace(from, () => to); }, from];
  const M = [
    ["the map prompt does not ask for a kind", ...sub("lib/factMap.js", "\"Give every group a kind, one of: \"", "\"Give every group a note, one of: \"")],
    ["a kind is not stored on the rows of a group", ...sub("lib/factMap.js", "rows.push({ raw_topic: m, canonical_topic: pt.canonical, family: c.family, map_version: c.version, kind });", "rows.push({ raw_topic: m, canonical_topic: pt.canonical, family: c.family, map_version: c.version, kind: null });")],
    ["a split part loses the group's kind", ...sub("lib/factMap.js", "kindOfCanon.set(pt.canonical, kind); for (const m of pt.members) rows.push({ raw_topic: m, canonical_topic: pt.canonical, family: c.family, map_version: c.version, kind });", "kindOfCanon.set(pt.canonical, kind); for (const m of pt.members) rows.push({ raw_topic: m, canonical_topic: pt.canonical, family: c.family, map_version: c.version, kind: pt === parts[0] ? kind : null });")],
    ["a kind outside the list is accepted", ...sub("lib/factMap.js", "return KINDS.includes(s) ? s : null; };", "return s || null; };")],
    ["a kind outside the list is guessed as other", ...sub("lib/factMap.js", "return KINDS.includes(s) ? s : null; };", "return KINDS.includes(s) ? s : \"other\"; };")],
    ["work done is not read as work_done", ...sub("lib/factMap.js", ".replace(/[\\s-]+/g, \"_\"); return KINDS", "; return KINDS")],
    ["the rows written before kinds are not asked", ...sub("lib/factMap.js", "let kindTodo = kindTodoOf();", "let kindTodo = [];")],
    ["the labelling pass leaves out a label the model skipped", ...sub("lib/factMap.js", "out.left_alone++; unkinded.set(t, n); }", "out.left_alone++; }")],
    ["the labelling pass rewrites the canonical name", ...sub("lib/factMap.js", "rows.push({ raw_topic: m.raw_topic, canonical_topic: m.canonical_topic, family: c.family, map_version: c.version, kind: given.get(m.canonical_topic) });", "rows.push({ raw_topic: m.raw_topic, canonical_topic: m.canonical_topic + \" x\", family: c.family, map_version: c.version, kind: given.get(m.canonical_topic) });")],
    ["the labelling pass asks again for rows that have a kind", ...sub("lib/factMap.js", "if (!kindOf(m.kind)) unkinded.set(", "if (true) unkinded.set(")],
    ["the labelling pass sends more than labels and counts", ...sub("lib/factMap.js", "JSON.stringify(kindTodo.map(([t, n]) => ({ topic: t, n })))", "JSON.stringify(kindTodo.map(([t, n]) => ({ topic: t, n, rows: ms.length })))")],
    ["the report does not set equipment aside", ...sub("lib/factReport.js", ".filter(([c]) => call.includeEquipment || !isEq(c)).sort(", ".sort(")],
    ["the report sets it aside and does not count it", ...sub("lib/factReport.js", "topics: eq.length, mentions: eq.reduce((a, [, t]) => a + t.n, 0), listings: eqListings.size };", "topics: 0, mentions: 0, listings: 0 };")],
    ["the report counts the listings of the equipment wrongly", ...sub("lib/factReport.js", "listings: eqListings.size };", "listings: eq.length };")],
    ["the report sets aside a topic that has no kind", ...sub("lib/factReport.js", "isEq = c => ASIDE_KINDS.includes(kinds.get(c))", "isEq = c => kinds.get(c) !== \"paperwork\" && kinds.get(c) !== \"work_done\"")],
    ["an option topic is not set aside by the report", ...sub("lib/factMap.js", "export const ASIDE_KINDS = [\"equipment\", \"option\"];", "export const ASIDE_KINDS = [\"equipment\"];")],
    ["the option kind is missing from the kinds", ...sub("lib/factMap.js", "\"equipment\", \"option\", \"other\"];\n// the kinds", "\"equipment\", \"other\"];\n// the kinds")],
    ["the labelling prompt does not define option", ...sub("lib/factMap.js", "option (a factory option, package or trim line named as such", "option (")],
    ["equipment=include is ignored by the report", ...sub("lib/factReport.js", "includeEquipment: eq === \"include\" }", "includeEquipment: false }")],
    ["equipment is included by default", ...sub("lib/factReport.js", "includeEquipment: eq === \"include\" }", "includeEquipment: eq !== \"set_aside\" }")],
    ["a bad equipment value is accepted", ...sub("lib/factReport.js", "if (![\"\", \"include\", \"set_aside\"].includes(eq)) return", "if (false) return")],
    ["the report hides the kind of a topic", ...sub("lib/factReport.js", "out.topics.push({ topic: c, kind: kinds.get(c) || null,", "out.topics.push({ topic: c,")],
    ["the topic map read leaves out the kind column", ...sub("lib/factReport.js", "topic_map?select=raw_topic,canonical_topic,kind&family", "topic_map?select=raw_topic,canonical_topic&family")],
    ["the kind of a canonical is the last row's, not the most common", ...sub("lib/factReport.js", "sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0][0]); return out;", "sort((a, b) => a[1] - b[1] || (a[0] < b[0] ? -1 : 1))[0][0]); return out;")],
    ["the price read does not set equipment aside", ...sub("lib/factPrice.js", "if (!p.call.includeEquipment && ASIDE_KINDS.includes(kinds.get(c))) {", "if (false) {")],
    ["the price read sets it aside and does not count it", ...sub("lib/factPrice.js", "aside.topics.add(c); aside.mentions++; continue;", "continue;")],
    ["the price read ignores equipment=include", ...sub("lib/factPrice.js", "if (!p.call.includeEquipment && ASIDE_KINDS.includes(kinds.get(c))) {", "if (ASIDE_KINDS.includes(kinds.get(c))) {")],
    ["the SQL does not add the kind column", ...sub("docs/supabase-factmine.sql", "alter table topic_map add column if not exists kind text check", "-- alter table topic_map add column if not exists kind text check")]
  ].filter(Boolean);
  let survived = 0;
  for (const [name, file, fn, from] of M) {
    const tmp = fs.mkdtempSync(path.join(fs.realpathSync("/tmp"), "fmap-"));
    try {
      for (const d of ["lib", "api", "data", "package.json"]) spawnSync("cp", ["-R", path.join(R, d), tmp]);
      fs.mkdirSync(path.join(tmp, "scripts")); fs.mkdirSync(path.join(tmp, "docs")); spawnSync("cp", [path.join(R, "docs/supabase-factmine.sql"), path.join(tmp, "docs")]); fs.symlinkSync(path.join(R, "node_modules"), path.join(tmp, "node_modules"));
      const f = path.join(tmp, file), before = fs.readFileSync(f, "utf8"), after = fn(before); if (before === after) { console.log("SKIP (no change) " + name); survived++; continue; }
      fs.writeFileSync(f, after);
      const r = spawnSync(process.execPath, [me, tmp], { encoding: "utf8", timeout: 240000 }), killed = r.status !== 0; console.log((killed ? "killed   " : "SURVIVED ") + name); if (!killed) survived++;
    } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  }
  console.log(survived ? `${survived} mutant(s) survived` : "all mutants killed"); return survived ? 1 : 0;
}
