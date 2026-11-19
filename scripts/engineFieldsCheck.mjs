// clock: real-ok same pass and fail counts and the same exit with the clock at +0 and +60 days (Lane C probe, Nov 18 2026: node --import scripts/_clockShift.mjs); a date in it is built from the real now or never read
// NO ENGINE FIELD IS DROPPED SILENTLY (Sam, Oct 27 2026). Sell and Find each handed the shared card only the engine fields on their own list; a field the lists did not know was lost without a word
// (the 325i blank card, the thin card that missed, the pooled options). Now: (1) there is ONE list (lib/engineFields.js CARD_FIELDS) and Sell's and Find's card fields both read it, neither keeps a
// list of its own; (2) every top level field the engine can add to an answer is on that list or acknowledged in NOT_CARRIED. The fields are found in the engine's own source (every key a builder adds
// to an answer: { ...d, key: .. } and result.key = ..) and in the real answers in scripts/fixtures, so a new engine field fails here until someone says whether the card carries it.
//   node scripts/engineFieldsCheck.mjs
import fs from "node:fs";
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const { CARD_FIELDS, CARD_DERIVED, NOT_CARRIED } = await import("../lib/engineFields.js");
const read = p => fs.readFileSync(new URL("../" + p, import.meta.url), "utf8");

// 1. one list
for (const f of ["lib/sell/sellFacts.js", "lib/live/search.js"]) {
  const s = read(f);
  ok(/import \{ CARD_FIELDS \} from "\.\.\/engineFields\.js"/.test(s) && /for \(const k of CARD_FIELDS\)/.test(s), `${f}: the card fields are read from lib/engineFields.js`);
  ok(!/for \(const k of \[/.test(s.slice(s.indexOf("function cardAnswerOf"), s.indexOf("function cardAnswerOf") + 1200)), `${f}: no list of its own inside cardAnswerOf`);
}
ok(new Set(CARD_FIELDS).size === CARD_FIELDS.length, "no field twice on the card list");
ok(CARD_FIELDS.every(k => !NOT_CARRIED.has(k)) && Object.keys(CARD_DERIVED).every(k => !NOT_CARRIED.has(k) && !CARD_FIELDS.includes(k)), "a field is on one list only");

// 2. every field the engine adds is on a list
const src = read("lib/onebox.js") + "\n" + read("lib/questionWayOut.js"), found = new Map();   // Oct 29 2026: the way-out module adds a field to an answer too, so the scan reads it
const lineOf = i => (src.slice(0, i).match(/\n/g) || []).length + 1;
const re = /\{\s*\.\.\.(d|a|result|base|out|r|ans|answer|res)\s*,/g; let m;
while ((m = re.exec(src))) {
  let depth = 1, i = m.index + 1; const start = i;
  for (; i < src.length && depth > 0; i++) { const ch = src[i]; if (ch === "{" || ch === "(" || ch === "[") depth++; else if (ch === "}" || ch === ")" || ch === "]") depth--; }
  const seg = src.slice(start, i - 1); let dd = 0, buf = ""; const parts = [];
  for (const ch of seg) { if ("{([".includes(ch)) dd++; else if ("})]".includes(ch)) dd--; if (dd === 0 && ch === ",") { parts.push(buf); buf = ""; } else buf += ch; }
  parts.push(buf);
  for (const part of parts) { const km = /^\s*(\w+)\s*(?::|$)/.exec(part); if (km && !/^\s*\.\.\./.test(part)) found.set(km[1], found.get(km[1]) || lineOf(m.index)); }
}
const re2 = /\b(result|base|out|d)\.([A-Za-z_]\w*)\s*=[^=]/g;
while ((m = re2.exec(src))) if (!found.has(m[2])) found.set(m[2], lineOf(m.index));
for (const k of Object.keys(JSON.parse(read("scripts/fixtures/m3Answer.json")))) if (!found.has(k)) found.set(k, "fixtures/m3Answer.json");
const known = k => CARD_FIELDS.includes(k) || k in CARD_DERIVED || NOT_CARRIED.has(k);
const unknown = [...found].filter(([k]) => !known(k));
ok(unknown.length === 0, `every field the engine adds to an answer is on the card list or acknowledged as not carried (${unknown.length} not: ${unknown.map(([k, w]) => k + " (lib/onebox.js:" + w + ")").join(", ")}). Add it to CARD_FIELDS if Sell, Find or the emails should print it, else to NOT_CARRIED.`);
ok(found.size >= 80, `the scan found the engine's fields (${found.size})`);
// the fields the e95 engine adds are known
for (const k of ["pooledApart", "pooledSplit", "trendHeld"]) ok(CARD_FIELDS.includes(k), `the card carries ${k}`);
// 3. the SERVED shape, not only the source (Oct 29 2026, Lane B: answer_line and count_line, wayOut, scopeLine and metaLine reached an answer without being on a list and this check was not run before the tip): the real read-time path
// (withReadFields, freshenStoredText, applyWayOut) is run on every answer kind and every top level key it serves must be on a list.
{
  process.env.SUPABASE_URL = process.env.SUPABASE_URL || "https://fake.supabase.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "k"; process.env.LAUNCH_STAGE = "2";
  const E = await import("../lib/onebox.js"), W = await import("../lib/questionWayOut.js");
  const base = JSON.parse(read("scripts/fixtures/m3Answer.json")), pool = n => Array.from({ length: n }, (_, i) => ({ id: "p" + i, _usd: 40000 + i * 800, auction_end_date: "2026-0" + (1 + (i % 9)) + "-12", year: 1986, rtitle: "x", transmission: "Manual" }));
  const opt = (dim, label, value, n, x) => ({ dimension: dim, label, value, n, low: 50000, high: 80000, rangeFloor: false, ownWindow: false, windowWords: "since November 2025", ...(x || {}) });
  const kinds = {
    "single range": { ...base, optionsState: "none", options: [] },
    "alike (every option kind)": { ...base, tier: "result", poolN: 35, rawPool: pool(35), optionsState: "alike", headlineDimension: "body", cluster: [1, 2], options: [opt("body", "Coupe", "coupe", 16), opt("body", "Targa", "targa", 11)], windowWords: "since November 2025", freshness: { through: "2026-10-20" }, resolvedCar: { year: 1986, canonicalLabel: "1986 Porsche 911" } },
    "split, thin option, held chart": { ...base, tier: "result", poolN: 23, rawPool: pool(23), cluster: null, optionsState: "split", headlineDimension: "gearbox", thinReason: "pooled_apart", trendHeld: { reason: "mix_changes" }, headlineLines: ["a", "b"], options: [opt("gearbox", "Manual", "manual", 14), opt("gearbox", "SMG", "auto", 3, { rangeFloor: true, low: null, high: null })] },
    "thin": { tier: "thin", poolN: 6, rawPool: pool(6), windowWords: "since June 2025", thinReason: "few_sales", thin_sales: { count: 6, answer_line: "Six sales, too few for a range.", count_line: "Since June 2025." } },
    "core-shaped (stored, no tier)": { kind: "count", count: 23, optionsState: "split", optionLines: ["a", "b"], countLine: "23 sales since June 2025.", answerLine: "x" },
    "question": W.applyWayOut({ tier: "model_choice", resolvedCar: { year: 1995, make: "Honda" } }, null)
  };
  const bad = [];
  for (const [name, a] of Object.entries(kinds)) { const d = a && a.tier && /^(result|thin)$/.test(a.tier) ? E.withReadFields(a, "x", { year: 1986 }) : E.freshenStoredText(a); for (const k of Object.keys(d || {})) if (!(k in a) && !known(k)) bad.push(`${k} (${name})`); }
  ok(bad.length === 0, `every top level key the read-time path ADDS to an answer is on a list (${bad.length} not: ${bad.join(", ")})`);
}
// 6. desk.likelyBasis (Lane B, Nov 14 2026): the Desk answer carries { median, low, high, count, ids } over the rows of desk.comparables, at the top of desk and in every desk.views entry, from the engine only.
//    The top of desk and every view are built by the SAME deskBlock return, so one field there is in all of them; the values are asserted per view over two cars in scripts/deskLikelyBasisCheck.mjs.
{ const dv = read("lib/deskV3.js"), block = dv.slice(dv.indexOf("export async function deskBlock"), dv.indexOf("export const viewKey"));
  ok(/likelyBasis = likelyBasisOf\(comparables[,)][^;]*;[\s\S]*comparables: comparablesOut, likelyBasis, comparablesNote/.test(block), "desk.likelyBasis is set in deskBlock from the very comparables list it returns (top of desk and every view are built there)");
  ok(/blocks\[viewKey\(t, m\)\] = await deskBlock\(/.test(read("lib/onebox.js")) && /const \{ sales, comparables, \.\.\.rest \} = b;/.test(dv), "every desk.views entry is a deskBlock result whose rest (including likelyBasis) is stored with it");
  for (const f of ["public/js/desk.js", "public/desk.html", "lib/desk/caseView.js", "lib/desk/reportState.js", "lib/desk/caseWorkflow.js"]) { let s = ""; try { s = read(f); } catch { continue; }
    ok(!/likelyBasis\s*=\s*\{|likelyBasis\.(median|low|high)\s*=[^=]/.test(s), `${f} does not compute likelyBasis (the engine is its one source)`); } }
// 7. desk.reserveLadder (Lane B, Nov 14 2026): { rungs, recommended, reason, thin, thinLine, fallbackView } at the top of desk and in every view, built in deskBlock by reserveLadderOf over the view's own sales; a thin view takes its figures from the same period over all conditions (cfgFor's fallback). Values per view: scripts/deskLadderCheck.mjs.
{ const dv = read("lib/deskV3.js"), ob = read("lib/onebox.js"), block = dv.slice(dv.indexOf("export async function deskBlock"), dv.indexOf("export const viewKey"));
  ok(/reserveLadder = reserveLadderOf\(\{ sales, evidence, reserveStart, reserveMode/.test(block) && /reserveCheck: reserveCheckOut, reserveStart: reserveStartOut, reserveLadder, reserveMode: reserveModeOut/.test(block), "desk.reserveLadder is set in deskBlock from the view's own sales, start and reserve read (top of desk and every view are built there)");
  ok(/fallback: t && !nested \? \(\) =>/.test(ob), "every tier view of the engine read is given its all-conditions fallback (a thin view prices from it)");
  for (const f of ["public/js/desk.js", "public/desk.html", "lib/desk/caseView.js", "lib/desk/reportState.js", "lib/desk/caseWorkflow.js"]) { let s = ""; try { s = read(f); } catch { continue; }
    ok(!/reserveLadder\s*=\s*\{|\.rungs\s*=\s*\[/.test(s), `${f} does not build the reserve ladder (the engine is its one source)`); } }
// 9. desk.comparables[].differences (Lane B, Nov 15 2026, order bc85): { miles, gearbox, body, year, spec, condition } against the case car, on every comparable at the top of desk and in every desk.views entry, from the engine only.
//    Every comparable row of lib/deskV3.js is built through differsOf (one function, three row builders); the values per list and per view are asserted in scripts/deskCompsCheck.mjs.
{ const dv = read("lib/deskV3.js");
  ok((dv.match(/relevance: o\.rel,/g) || []).length >= 3 && (dv.match(/relevance: o\.rel,/g) || []).length === (dv.match(/body: o\.r\.body \|\| null, differences: differsOf\(o\.r, sub\), transmission:/g) || []).length, "every comparable row builder in lib/deskV3.js sets differences from differsOf");
  ok(/miles: rm > 0 && sm > 0 \? rm - sm : null/.test(dv) && /year: ry && sy \? ry - sy : 0/.test(dv), "differences.miles and .year are the sale minus the car (the sale with more miles is positive)");
  ok(/const \{ sales, comparables, \.\.\.rest \} = b;/.test(dv) && /comparablesAt: \(comparables \|\| \[\]\)\.map\(put\)/.test(dv), "every desk.views entry stores the same comparable rows (with differences) through desk.pool");
  for (const f of ["public/js/desk.js", "public/desk.html", "lib/desk/caseView.js", "lib/desk/reportState.js", "lib/desk/caseWorkflow.js"]) { let s2 = ""; try { s2 = read(f); } catch { continue; }
    ok(!/differences\s*=\s*\{|differences\.miles\s*=[^=]|differsOf/.test(s2), `${f} does not compute the comparables' differences (the engine is its one source)`); } }
// 10. desk.reserveLadder.byCondition (Lane B, Nov 15 2026, order bc85): { tier, name, key, reason, cleared, of } for tiers 1 to 4, at the top of desk and in every desk.views entry, set in deskBlock after the fallback is served, from the engine only (values per view in scripts/deskLadderCheck.mjs).
{ const dv = read("lib/deskV3.js"), block = dv.slice(dv.indexOf("export async function deskBlock"), dv.indexOf("export const viewKey"));
  ok(/reserveLadder = \{ \.\.\.reserveLadder, byCondition: byConditionOf\(reserveLadder\) \};\s*return \{ version: 1/.test(block), "byCondition is set on the final ladder (after a thin view is served whole), the one every view and the top of desk return");
  for (const f of ["public/js/desk.js", "public/desk.html", "lib/desk/caseView.js", "lib/desk/reportState.js", "lib/desk/caseWorkflow.js"]) { let s2 = ""; try { s2 = read(f); } catch { continue; }
    ok(!/byCondition\s*=\s*\{|CONDITION_RUNG|byConditionOf/.test(s2), `${f} does not compute byCondition (the engine is its one source)`); } }
// 8. THE DESK FIELD SET IS TIED TO DESK_SHAPE (Lane B, Nov 14 2026). CAUSE: a stored Desk case keeps the answer it was read with and is read again on open only when its shape is below DESK_SHAPE (lib/deskV3.js), so a field the engine gains (desk.reserveLadder) or a changed one (desk.likelyBasis)
// reaches no stored case unless the number rises. A person has to remember; this fails instead. The engine's real answer (a car read with views) gives the set: the desk keys, the keys of each object field one level down and of one view entry. It is recorded with the shape in
// scripts/fixtures/deskShape.json. A changed set with the same shape FAILS (bump DESK_SHAPE); a bumped shape with the old record FAILS (refresh the record: node scripts/engineFieldsCheck.mjs --write-shape). A change in what a field MEANS is not a key change: bump by hand and say so beside DESK_SHAPE.
{ const path = await import("node:path"), { fileURLToPath, pathToFileURL } = await import("node:url"), root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const WLD = await import(pathToFileURL(path.join(root, "scripts/_deskOlderWorld.mjs")).href), SR = await import(pathToFileURL(path.join(root, "lib/sheetRead.js")).href), DV = await import(pathToFileURL(path.join(root, "lib/deskV3.js")).href);
  const err = console.error; console.error = () => {};
  const car = WLD.loadCars(root).find(c => c.n === 4), w = WLD.install(root), head = async () => ({ status: 200, bytes: 50000, type: "image/jpeg" }), today = new Date().toISOString().slice(0, 10);
  const r = await SR.sheetRead(w.env, { year: car.year, make: car.make, model: car.model, mileage: 60000, bodyStyle: car.typedBody || undefined, desk: { caseDate: today, transmission: "Manual", label: "x", case: { verification: {} }, exclusions: [], head, views: true } }, w.deps); console.error = err;
  const d = r && r.desk, plain = v => v && typeof v === "object" && !Array.isArray(v), sig = o => ({ top: Object.keys(o).sort(), nested: Object.fromEntries(Object.keys(o).filter(k => plain(o[k]) && !["views", "pool"].includes(k)).sort().map(k => [k, Object.keys(o[k]).sort()])) });
  const now = d ? { ...sig(d), view: sig(DV.viewOf(d, Object.keys(d.views)[0]) || {}).top } : null, file = path.join(root, "scripts/fixtures/deskShape.json");
  if (process.argv.includes("--write-shape") && now) fs.writeFileSync(file, JSON.stringify({ shape: DV.DESK_SHAPE, ...now }, null, 1) + "\n");
  let rec = null; try { rec = JSON.parse(fs.readFileSync(file, "utf8")); } catch {}
  const same = !!(rec && now && JSON.stringify({ top: rec.top, nested: rec.nested, view: rec.view }) === JSON.stringify(now));
  ok(!!now && !!rec, "the desk field record (scripts/fixtures/deskShape.json) exists and the engine answered a desk");
  ok(!rec || !now || same || DV.DESK_SHAPE !== rec.shape, `the set of desk fields changed and DESK_SHAPE (${DV.DESK_SHAPE}) was not bumped: bump it in lib/deskV3.js, then refresh the record with --write-shape` + (rec && now && !same ? ` (now: ${[...now.top.filter(k => !rec.top.includes(k)).map(k => "+" + k), ...rec.top.filter(k => !now.top.includes(k)).map(k => "-" + k)].join(" ")})` : ""));
  ok(!rec || !now || same || DV.DESK_SHAPE === rec.shape, `DESK_SHAPE is ${DV.DESK_SHAPE} but the desk field record is still at shape ${rec && rec.shape}: refresh it with node scripts/engineFieldsCheck.mjs --write-shape`);
  ok(!rec || rec.shape === DV.DESK_SHAPE, `the record's shape (${rec && rec.shape}) is the engine's DESK_SHAPE (${DV.DESK_SHAPE})`);
  ok(!now || (now.top.includes("reserveLadder") && now.top.includes("likelyBasis") && now.top.includes("shape")), "the record holds the ladder, the likely basis and the shape (the fields this bump is for)"); }
console.log(`engineFieldsCheck: ${pass} pass, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
