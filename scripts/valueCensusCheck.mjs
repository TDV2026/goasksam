// valueCensusCheck (Lane D, Nov 17 2026): the value census task on fixtures. Counts right on a known set; an unwindowed call refused; no counting mode can return text or a seller name; sample mode refuses eleven.
// VC_LIB=<path> points the check at a mutated copy of lib/valueCensus.js (scripts/valueCensusFailsWithout.mjs).
import { pathToFileURL } from "node:url";
import path from "node:path";
const lib = process.env.VC_LIB ? pathToFileURL(path.resolve(process.env.VC_LIB)).href : new URL("../lib/valueCensus.js", import.meta.url).href;
const VC = await import(lib);
let pass = 0, fail = 0;
const ok = (name, cond, detail) => { if (cond) pass++; else { fail++; console.log("FAIL", name, detail === undefined ? "" : JSON.stringify(detail)); } };
const SECRET = "SELLER_SECRET_NAME", TEXTMARK = "LISTING_TEXT_MARKER";
const body = (n, end) => (TEXTMARK + " " + "a".repeat(n)).slice(0, n - end.length) + end;
const pagesOf = rows => async qs => { const off = Number((/offset=(\d+)/.exec(qs) || [])[1] || 0), lim = Number((/limit=(\d+)/.exec(qs) || [])[1] || 100); return rows.slice(off, off + lim); };
const calls = []; const fetchOf = (soldRows, attRows) => async qs => {
  calls.push(qs);
  const rows = qs.startsWith("sales_archive") ? soldRows : attRows;
  const lo = (/_date=gte\.(\d{4}-\d{2}-\d{2})/.exec(qs) || [])[1], hi = (/_date=lte\.(\d{4}-\d{2}-\d{2})/.exec(qs) || [])[1];
  const dk = qs.startsWith("sales_archive") ? "sale_date" : "attempt_date";
  return pagesOf(rows.filter(r => (!lo || r[dk] >= lo) && (!hi || r[dk] <= hi)))(qs);
};
const sold = (o) => ({ source_id: "s" + o.id, listing_title: o.t, year: 2003, sale_date: o.d || "2025-06-10", vin_norm: o.vin || null, url_norm: o.url || null, mileage: o.mi ?? null, mileage_text: null, has_reserve: o.hr ?? null, description: o.desc ?? null, known_flaws: o.kf || null, recent_service_history: null, modifications: null, exterior_color: o.ext || null, interior_color: null, transmission: null, body_style: null, project_flag: o.pf || null, raw_record: { title: o.t, description: o.rdesc !== undefined ? o.rdesc : o.desc, seller: SECRET, seller_name: SECRET, ...(o.raw || {}) } });
const cut = "x".repeat(196) + "...";
const SOLD = [
  sold({ id: 1, t: "2003 BMW M3 Coupe", vin: "AAA", mi: 50000, hr: false, desc: body(300, "."), kf: ["rust"], ext: "Laguna Seca Blue", raw: { comments: [{ author_role: "seller", created_at: "2025-06-11" }] } }),
  sold({ id: 2, t: "2004 BMW M3 Convertible", vin: "BBB", desc: cut, ext: "Silver", d: "2025-07-01" }),
  sold({ id: 3, t: "2003 BMW M3", vin: "AAA", desc: null, rdesc: null, ext: "Laguna Seca Blue" }),
  sold({ id: 4, t: "2003 BMW M3 project", pf: "project", desc: body(250, ".") }),
  sold({ id: 5, t: "2002 BMW M3 Replica", desc: body(250, ".") }),
  sold({ id: 6, t: "2004 BMW M3 Sedan", desc: body(250, ".") }),
  sold({ id: 7, t: "2005 BMW M3 Coupe", vin: "CCC", desc: body(300, "."), rdesc: "a different raw text", d: "2025-08-01", url: "u7", mi: 1 })
];
const CALL = { table: "sold", source: "bringatrailer", family: "e46_m3", from: "2025-01-01", to: "2025-12-31" };
const run = async (q, soldRows = SOLD, att = []) => VC.runValueCensus(q, { fetchPage: fetchOf(soldRows, att) });

// COUNTS: right on a known set
const r = await run(CALL), b = r.body || {};
ok("COUNTS 0 runs", r.ok === true && b.mode === "counts" && b.ocdSpend === 0, r);
ok("COUNTS 1 total counts the family rows only", b.total === 4 && b.total_read === 7, { total: b.total, read: b.total_read });
ok("COUNTS 2 set-asides are counted on their own lines", b.excluded_counts && b.excluded_counts.project === 1 && b.excluded_counts.replica === 1 && b.excluded_counts.sedan === 1, b.excluded_counts);
ok("COUNTS 3 description: null, length percentiles and the spike", b.description && b.description.null_count === 1 && b.description.with_text === 3 && b.description.p50 === 300 && b.description.p10 === 219.2 && b.description.p90 === 300 && b.description.most_common_lengths[0].length === 300 && b.description.most_common_lengths[0].rows === 2, b.description);
ok("COUNTS 4 cut signs: a marker, under 200, a sentence end", b.description && b.description.cut_marker_in_last_40 === 1 && b.description.under_200 === 1 && b.description.not_ending_like_a_sentence === 0 && b.description.ends_like_a_sentence === 3, b.description);
ok("COUNTS 5 the sold column against its raw_record", b.description && b.description.column_equals_raw_record.equal === 2 && b.description.column_equals_raw_record.differ === 1, b.description && b.description.column_equals_raw_record);
ok("COUNTS 6 VIN present, distinct, on two rows", b.vin && b.vin.present === 4 && b.vin.distinct === 3 && b.vin.on_two_or_more_rows === 1, b.vin);
ok("COUNTS 7 mileage present", b.mileage_present === 2, b.mileage_present);
ok("COUNTS 8 sections and colours (distinct values)", b.sections_present.known_flaws === 1 && b.exterior_colour.distinct === 2 && b.exterior_colour.most_common["laguna seca blue"] === 2, [b.sections_present, b.exterior_colour]);
ok("COUNTS 9 comments with role and timestamp by key name", b.comments.present === 1 && b.comments.with_author_role === 1 && b.comments.with_timestamp === 1 && b.raw_record_keys.comments === 1, b.comments);
ok("COUNTS 10 duplicates: same vin and date", b.duplicates.rows_sharing_vin_and_date === 2, b.duplicates);
ok("COUNTS 11 dates and reserve", b.first_date === "2025-06-10" && b.last_date === "2025-08-01" && b.has_reserve.false === 1 && b.has_reserve.null === 3, [b.first_date, b.last_date, b.has_reserve]);
ok("COUNTS 12 the query is bounded by source, dates and make", calls.some(q => /source_slug=eq\.bringatrailer/.test(q) && /sale_date=gte\.2025-01-01/.test(q) && /sale_date=lte\.2025-12-31/.test(q) && /make=ilike/.test(q)), calls[0]);

// ATTEMPTS: outcomes, high bid, chains on the 90 day rule
const att = (id, v, st, d, hb, o = {}) => ({ source_record_id: "a" + id, year: 2003, attempt_date: d, auction_status: st, high_bid: hb, has_reserve: o.hr ?? null, chassis_vin_norm: v, raw_record: { title: o.t || "2003 BMW M3 Coupe", description: o.desc ?? body(120, "."), url: o.url || null, seller: SECRET } });
const ATT = [att(1, "V1", "reserve_not_met", "2025-03-05", 40000, { hr: true }), att(2, "V1", "reserve_not_met", "2025-03-20", 41000), att(3, "V2", "withdrawn", "2025-03-10", null), att(4, "V3", "reserve_not_met", "2025-03-12", 0, { hr: true }), att(5, null, null, "2025-03-15", null, { url: "https://x.test/y" }), att(6, "V3", "reserve_not_met", "2025-07-30", 1), att(7, "V9", "withdrawn", "2025-03-31", null, { t: "2003 BMW M3 Replica" })];
const SALES_AFTER = [sold({ id: 50, t: "2003 BMW M3", vin: "V2", d: "2025-04-15" })];
const ra = await run({ ...CALL, table: "attempts", from: "2025-03-01", to: "2025-03-31" }, SALES_AFTER, ATT), ab = ra.body || {};
ok("ATT 0 runs", ra.ok === true, ra);
ok("ATT 1 outcomes", ab.outcome && ab.outcome.reserve_not_met === 3 && ab.outcome.withdrawn === 1 && ab.outcome.unknown_status === 1, ab.outcome);
ok("ATT 2 rnm with a high bid, high bid present", ab.rnm_with_high_bid === 2 && ab.high_bid_present === 2, [ab.rnm_with_high_bid, ab.high_bid_present]);
ok("ATT 3 chains: a relist inside 90 days, a sale after counts, 140 days does not", ab.attempt_chains === 4 && ab.chains_with_relist === 2, [ab.attempt_chains, ab.chains_with_relist]);
ok("ATT 4 the read says it ran 90 days past the window", /90 days past 2025-03-31/.test(ab.relist_rule || ""), ab.relist_rule);
ok("ATT 5 the replica is a count of its own, the text is read from raw_record", ab.excluded_counts.replica === 1 && ab.description.read_from === "raw_record" && ab.description.with_text === 5, [ab.excluded_counts, ab.description]);
ok("ATT 6 reserve type counts", ab.has_reserve.true === 2, ab.has_reserve);

// THE FAMILIES by the resolver's keys
const F = t => VC.trimFamilyOf("2002 Porsche 911 " + t);
ok("FAM 0 Carrera, Carrera 4S and Targa are p996_carrera", F("Carrera") === "carrera" && F("Carrera 4S") === "carrera" && F("Targa") === "carrera", [F("Carrera"), F("Carrera 4S"), F("Targa")]);
ok("FAM 1 Turbo, GT2 and GT3 are p996_mezger", F("Turbo") === "mezger" && F("GT2") === "mezger" && F("GT3 RS") === "mezger", [F("Turbo"), F("GT2"), F("GT3 RS")]);
ok("FAM 2 a title in both lists is counted in neither", F("Turbo Carrera") === "both" && F("") === null);
ok("FAM 3 every trim the resolver lists lands in at most one family", (await import("../lib/vehicleData.js")).PORSCHE_911_TRIMS.every(t => F(t) !== "both"));
const P = [sold({ id: 1, t: "2002 Porsche 911 Carrera 4S" }), sold({ id: 2, t: "2003 Porsche 911 Turbo" }), sold({ id: 3, t: "2001 Porsche 911 GT3" }), sold({ id: 4, t: "2001 Porsche 911 Turbo Carrera" }), sold({ id: 5, t: "2000 Porsche 911" })];
const pc = (await run({ ...CALL, family: "p996_carrera" }, P)).body, pm = (await run({ ...CALL, family: "p996_mezger" }, P)).body;
ok("FAM 4 the same rows split by family", pc.total === 1 && pm.total === 2 && pc.excluded_counts.two_families === 1 && pc.excluded_counts.other_trim === 3 && pm.excluded_counts.other_trim === 2, [pc.total, pm.total, pc.excluded_counts]);

// REFUSALS: no unwindowed call, no wide window, no bad family or source
const bad = async q => (await run(q)).ok === false;
ok("WINDOW 0 refuses no dates", await bad({ ...CALL, from: undefined, to: undefined }));
ok("WINDOW 1 refuses one missing date", await bad({ ...CALL, to: undefined }) && await bad({ ...CALL, from: undefined }));
ok("WINDOW 2 refuses a window over 366 days", await bad({ ...CALL, from: "2024-01-01", to: "2025-12-31" }));
ok("WINDOW 3 accepts exactly 366 days", (await run({ ...CALL, from: "2024-01-01", to: "2025-01-01" })).ok === true);
ok("WINDOW 4 refuses no source, a bad family, attempts for a house", await bad({ ...CALL, source: "" }) && await bad({ ...CALL, family: "x" }) && await bad({ ...CALL, table: "attempts", source: "gooding" }));
ok("WINDOW 5 a refused call reads nothing", await (async () => { const n = calls.length; await run({ ...CALL, from: undefined }); return calls.length === n; })());

// NO TEXT, NO SELLER in any counting answer
const texts = JSON.stringify([r.body, ra.body, pc, pm]);
ok("TEXT 0 no listing text in a counting answer", !texts.includes(TEXTMARK) && !texts.includes("different raw text"));
ok("TEXT 1 no seller name in a counting answer", !texts.includes(SECRET));
ok("TEXT 2 the read never selects a seller column", calls.every(q => !/seller/i.test(q.split("select=")[1].split("&")[0])), calls[0]);
ok("TEXT 3 the counts answer is checked: a string of text is refused", (() => { try { VC.assertCountsOnly({ total: 1, note: "a long sentence of listing text" }); return false; } catch (e) { return true; } })());

// SAMPLE: up to ten, refused above ten
const MANY = Array.from({ length: 14 }, (_, i) => sold({ id: 100 + i, t: "2003 BMW M3 Coupe", d: "2025-05-" + String(10 + i).padStart(2, "0"), desc: body(210, "."), kf: ["k"] }));
const s10 = await run({ ...CALL, mode: "sample" }, MANY), s11 = await run({ ...CALL, mode: "sample", limit: 11 }, MANY), sIds = await run({ ...CALL, mode: "sample", ids: Array.from({ length: 11 }, (_, i) => "s" + (100 + i)).join(",") }, MANY);
ok("SAMPLE 0 returns at most ten, with the description text", s10.ok && s10.body.count === 10 && s10.body.listings[0].description.includes(TEXTMARK) && s10.body.listings[0].sections.known_flaws, s10.body && s10.body.count);
ok("SAMPLE 1 refuses eleven (limit)", s11.ok === false && /at most 10/.test(s11.why || ""), s11);
ok("SAMPLE 2 refuses eleven ids", sIds.ok === false, sIds);
ok("SAMPLE 3 the sample carries no seller name", !JSON.stringify(s10.body).includes(SECRET));
ok("SAMPLE 4 ids pick their listings", (await run({ ...CALL, mode: "sample", ids: "s101,s103" }, MANY)).body.count === 2);
ok("SAMPLE 5 the sample is windowed too", (await run({ ...CALL, mode: "sample", from: undefined }, MANY)).ok === false);

console.log(fail ? `valueCensusCheck: ${pass} pass, ${fail} FAIL` : `valueCensusCheck: ${pass} pass, 0 fail`);
process.exit(fail ? 1 : 0);
