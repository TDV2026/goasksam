// DESK DEMO BLOCKERS (Lane D, Nov 2026; Lane F's live check of two Hagerty test sheets). Offline: a fake archive holds cars whose pool SPLITS by body, the real engine reads it, the real sheet read and sheet actions answer.
//   node scripts/deskBlockersCheck.mjs [repo root]        (scripts/deskBlockersFailsWithout.mjs: each mutant must turn it red)
//  1. A POOL THAT SPLITS ASKS: when the engine finds the pool splits by body (or gearbox, edition, year) the sheet asks which one, from the engine's own options and counts (the VIN's body preselected when known); the tier is then read
//     for that option. A tier click on a split pool is never dropped (the read that threw on a null range left the old "Pick a condition tier" on screen) and the page never says "Pick a condition tier" once one is picked.
//  2. PROOF OF THE NUMBER: the sheet lists every sale of the same tier pool of that one body, each with its real mileage, the ones inside the mileage band marked (the median is taken from those), counts that add up, the split's
//     counts against the headline explained.
//  3. A DRAFT PDF before finalise: watermarked DRAFT, no report number, not an export, not counted against the cap; a finalised sheet behaves as before.
//  4. A typed car (no listing) prints the one line under the tier, on the page and in the PDF.
//  Every check runs over four cars whose pools split (a 911, a Corvette, a Mustang, an M3), not the one example.
import fs from "node:fs"; import path from "node:path"; import { fileURLToPath, pathToFileURL } from "node:url";
const ROOT = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
process.chdir(ROOT);
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const imp = f => import(pathToFileURL(path.join(ROOT, f)).href);
const E = await imp("lib/onebox.js"), S = await imp("lib/sheetRead.js"), A = await imp("lib/desk/sheetActions.js"), SS = await imp("lib/desk/sheetStore.js"), RS = await imp("lib/desk/sheetRead.js"), CT = await imp("lib/conditionTier.js"), DR = await imp("lib/desk/decisionRules.js");
const page = fs.readFileSync("public/js/deskvals.js", "utf8");
const quiet = console.error; console.error = () => {};

// ---------- the fake archive: four cars, two bodies each, priced apart
const CARS = [
  { make: "Porsche", model: "911", trim: "Carrera S", year: 2008, a: "Coupe", b: "Cabriolet", bv: "open", base: 62000, na: 90, nb: 90 },
  { make: "Chevrolet", model: "Corvette", trim: "", year: 1965, a: "Coupe", b: "Convertible", bv: "open", base: 70000, na: 90, nb: 90 },
  { make: "Ford", model: "Mustang", trim: "GT", year: 2005, a: "Coupe", b: "Convertible", bv: "open", base: 15000, na: 90, nb: 90 },
  { make: "BMW", model: "M3", trim: "", year: 2004, a: "Coupe", b: "Convertible", bv: "open", base: 30000, na: 10, nb: 8 }
];
const ROWS = new Map(), TIERS = new Map(); let seed = 5; const rnd = () => (seed = (seed * 48271) % 2147483647) / 2147483647;
for (const [ci, c] of CARS.entries()) {
  const rows = [];
  for (let i = 0; i < c.na + c.nb; i++) {
    const body = i < c.na ? c.a : c.b, k = i < c.na ? i : i - c.na, price = Math.round(c.base * (body === c.a ? 1 : 1.6) * (0.92 + (k % 9) * 0.02)), miles = 8000 + ((k * 7919) % 90000), id = `z${ci}-${String(i).padStart(4, "0")}`;
    const title = `${c.year} ${c.make} ${c.model}${c.trim ? " " + c.trim : ""} ${body}`;
    const raw = { id: "o" + id, title, featured_image_url: "https://img.example/x.jpg", mileage: String(miles), body_style: body, modifications: null, currency: "USD", transmission: "Manual (6-Speed)", exterior_color: "Red", title_status: "Clean", url: "https://bat.example/" + id, source_url: "https://src.example/" + id, city: "Austin", state: "TX", country_code: "US", auction_end_precision: "day" };
    rows.push({ id, source_id: raw.id, sale_price: price, sale_date: new Date(Date.now() - (6 + (k % 88) * 4) * 864e5).toISOString().slice(0, 10), platform: "Bring a Trailer", listing_title: title, year: c.year, make: c.make, model: c.model, vin_norm: null, stated_mileage: null, project_flag: null, desc_facts: null, has_reserve: false, raw_record: raw, vehicle_type: "car", _miles: miles, _body: body, _price: price });
    TIERS.set(id, k % 6 === 5 ? null : 1 + (k % 4));
  }
  ROWS.set(c.model, rows);
}
const jt = v => v === null || v === undefined ? null : typeof v === "string" ? v : JSON.stringify(v);
const evalItem = (row, item) => { const ci = item.indexOf(":"); const hasAlias = ci > 0 && item[ci + 1] !== ":"; const alias = hasAlias ? item.slice(0, ci) : null; const expr = hasAlias ? item.slice(ci + 1) : item;
  if (expr.startsWith("raw_record->>")) return [alias || expr.slice(13), jt(row.raw_record[expr.slice(13)])]; const col = expr.replace(/::text$/, ""); return [alias || col, col in row ? row[col] : null]; };
globalThis.fetch = async url => {
  const u = new URL(String(url)), sel = u.searchParams.get("select") || "", dec = decodeURIComponent(String(url));
  if (!u.pathname.endsWith("/sales_archive")) return new Response("[]", { status: 200 });
  if (/condition_tier/.test(sel)) { const ids = (u.searchParams.get("id") || "").replace(/^in\.\(|\)$/g, "").split(",").filter(Boolean); return new Response(JSON.stringify(ids.map(id => ({ id, condition_tier: TIERS.get(id) ?? null, condition_version: CT.TIER_VERSION }))), { status: 200 }); }
  if (u.searchParams.get("id")) return new Response("[]", { status: 200 });
  if (/^model$/.test(sel)) return new Response(JSON.stringify(CARS.map(c => ({ model: c.model }))), { status: 200 });
  const hit = CARS.find(c => dec.toLowerCase().includes(c.model.toLowerCase())), rows = hit ? ROWS.get(hit.model) : [];
  return new Response(JSON.stringify(rows.map(r => Object.fromEntries(sel.split(",").map(it => evalItem(r, it))))), { status: 200 });
};
const env = { supabaseUrl: "https://fake.example", supabaseKey: "k", poolColumns: false, asked: 0, noStageLog: true };
const textOf = c => [c.year, c.make, c.model, c.trim].filter(Boolean).join(" ");
const mkDeps = c => ({ resolveVehicle: async () => ({ status: "valid", vehicle: { year: c.year, make: c.make, model: c.model, ...(c.trim ? { trim: c.trim } : {}) } }), decodeVin: async () => null, archiveMatch: async () => null, vinPlan: null, liveFor: async () => null, carTier: async () => null });
const med = a => { const v = [...a].sort((x, y) => x - y), n = v.length; return n % 2 ? v[(n - 1) / 2] : Math.round((v[n / 2 - 1] + v[n / 2]) / 2); };
const MILES = 30000, BAND = E.bandedRefine({ miTarget: MILES });

let thin = 0, full = 0;
for (const c of CARS) {
  const tag = `${c.year} ${c.make} ${c.model}`, deps = mkDeps(c), base = { text: textOf(c), mileage: MILES };
  // the engine's own split
  const eng = (await E.oneEngineAnswer({ year: c.year, make: c.make, model: c.model, ...(c.trim ? { trim: c.trim } : {}) }, null, textOf(c), env, null)).raw;
  const engQ = S.askOfAnswer(eng);
  ok(engQ && engQ.dimension === "body", `${tag}: the engine splits this pool by body (the sample is the class)`);
  // 1a. no tier: the question, from the engine's options and counts
  const r0 = await S.sheetRead(env, base, deps);
  const q0 = r0 && r0.market.asks && r0.market.asks[0];
  ok(q0 && q0.dimension === "body" && q0.selected == null && q0.options.length === engQ.options.length && q0.options.every((o, i) => o.label === engQ.options[i].label && o.count === engQ.options[i].count), `${tag}: with no tier the sheet asks which body, with the engine's own options and counts`);
  ok(r0 && r0.market.startingFigure == null && r0.market.median == null && /pick/i.test(r0.market.startingNote) && !/^Pick a condition tier for a starting figure\.$/.test(r0.market.startingNote), `${tag}: no figure for the mixed pool, and the note gives the engine's reason`);
  // 1b. tier picked, body not: the read must come back (it threw), say the real reason, never "Pick a condition tier for a starting figure."
  const r1 = await S.sheetRead(env, { ...base, tier: 2 }, deps);
  ok(r1 && r1.condition.selected === 2 && r1.condition.state === "needs_choice" && r1.market.startingFigure == null, `${tag}: a tier picked on a split pool is read, not dropped`);
  ok(r1 && !/^Pick a condition tier for a starting figure\.$/.test(r1.market.startingNote) && /body style/.test(r1.market.startingNote) && /split into options priced apart/.test(r1.market.startingNote), `${tag}: after the tier is picked the note is the engine's reason, not "Pick a condition tier": ` + (r1 && r1.market.startingNote));
  // 1c. the open question stops a finalise
  const ev = DR.evaluateDecision({ read: r1, draft: { mode: "reserve", reserve: "70000", reasons: ["documentation"], line: "x", guardLines: {} }, org: {}, priors: [] });
  ok(ev.missing.some(m => /Pick the body style/.test(m.text)) && !ev.canFinalise, `${tag}: the sheet cannot be finalised with the question open`);
  // 2. each body: the tier pool of that body, every sale, real mileage, the band marked, the median from the band
  for (const [label, val] of [[c.a, "coupe"], [c.b, c.bv]]) {
    const r2 = await S.sheetRead(env, { ...base, tier: 2, picks: [{ dimension: "body", value: val }] }, deps);
    const m = r2 && r2.market, cd = r2 && r2.condition;
    const chosen = (await E.oneEngineAnswer({ year: c.year, make: c.make, model: c.model, ...(c.trim ? { trim: c.trim } : {}) }, null, textOf(c), env, { body: val })).raw.rawPool || [];
    const same = chosen.filter(r => TIERS.get(r.id) === 2 && (r._usd ?? r._allin ?? r._hammer) > 0), inb = same.filter(r => { const mi = Number(r.mileage) || 0; return mi >= BAND.miMin && mi <= BAND.miMax; });
    const exp = inb.length >= 5 ? med(inb.map(r => Math.round(r._usd ?? r._allin ?? r._hammer))) : null;
    ok(r2 && !r2.retry && m.asks[0].selected === val && cd.state === (exp != null ? "ok" : "too_few"), `${tag} ${label}: the pick is read (${cd && cd.state})`);
    if (exp == null) { thin++; continue; }
    full++;
    ok(m.startingFigure === exp, `${tag} ${label}: the starting figure is the median of the in-band sales of that body and tier: ${m.startingFigure} vs ${exp}`);
    ok(m.comparables.length === same.length && cd.sameTierCount === same.length, `${tag} ${label}: EVERY sale of the same tier pool is listed (${m.comparables.length} of ${same.length}), the whole pool the median comes from`);
    ok(m.comparables.every(s => new RegExp(label, "i").test(s.title)), `${tag} ${label}: one body only in the list`);
    ok(m.comparables.every(s => s.mileage != null && s.mileage > 0 && ROWS.get(c.model).some(r => r._miles === s.mileage)), `${tag} ${label}: every sale carries its real mileage (none null)`);
    const nIn = m.comparables.filter(s => s.inBand === true).length, nOut = m.comparables.filter(s => s.inBand === false).length;
    ok(nIn === inb.length && nOut === same.length - inb.length && cd.bandCount === nIn, `${tag} ${label}: the band is marked, ${nIn} in and ${nOut} outside, and they add up to ${same.length}`);
    ok(m.comparables.filter(s => s.mid).every(s => s.inBand === true) && m.comparables.filter(s => s.mid).length >= 1, `${tag} ${label}: the median mark sits on a sale inside the band`);
    ok(new RegExp(`holds ${same.length} sales\\. ${inb.length} of them sit in the mileage band`).test(cd.proofLine) && cd.proofLine.includes(`The other ${same.length - inb.length}`), `${tag} ${label}: the proof line states the counts`);
    ok(m.startingNote === cd.proofLine, `${tag} ${label}: the starting note is the proof line, not "mileage band" in the abstract`);
  }
  // split counts against the headline are explained
  { const sum = r0.market.splits[0].options.reduce((t, o) => t + o.count, 0); ok(sum === r0.market.count || !!r0.market.splitsNote, `${tag}: the split's counts (${sum}) against the headline (${r0.market.count}) are equal or explained: ${r0.market.splitsNote}`); }
}

ok(full >= 4 && thin >= 2, `the sample reaches both the read tier pool (${full} bodies) and the too thin one (${thin} bodies)`);
// ---------- the VIN names the body: preselected, and the expert can pick the other
{ const c = CARS[0], deps = { ...mkDeps(c), decodeVin: async () => ({ year: 2008, make: "Porsche", model: "911", trim: "Carrera S", bodyStyle: "Convertible/Cabriolet" }), vinPlan: async f => ({ vehicle: { ...f, bodyStyle: null }, text: textOf(c), ctx: null }) };
  const rv = await S.sheetRead(env, { vin: "WP0AB29918S745123", mileage: MILES, tier: 2 }, deps);
  ok(rv && rv.market.asks[0] && rv.market.asks[0].selected === "open" && rv.market.asks[0].fromVin === true && rv.condition.state !== "needs_choice", "a VIN whose decode says Cabriolet preselects Cabriolet (and says so)");
  const rv2 = await S.sheetRead(env, { vin: "WP0AB29918S745123", mileage: MILES, tier: 2, picks: [{ dimension: "body", value: "coupe" }] }, deps);
  ok(rv2 && rv2.market.asks[0].selected === "coupe" && rv2.market.asks[0].fromVin === false, "the expert's own pick wins over the VIN's body");
  const bad = await S.sheetRead(env, { ...{ text: textOf(c), mileage: MILES }, tier: 2, picks: [{ dimension: "body", value: "spaceship" }] }, mkDeps(c));
  ok(bad && bad.market.asks[0].selected == null && bad.condition.state === "needs_choice", "a pick the engine does not offer is dropped, never read"); }

// ---------- the actions: the whole path through the sheet, the draft PDF, finalise
const store = SS.memoryStore(), org = "hag";
const c0 = CARS[0], ORG = { name: "Hagerty Marketplace", logo: null, color: "#8b1e2d", monthlyExportCap: 3, standardMessage: "Thanks." };
RS.useSheetEngine((e, input) => S.sheetRead(env, input, mkDeps(c0)));
const cx = (seat = "ava", over = {}) => ({ now: "2026-11-06T12:00:00.000Z", env: {}, org, seat, store, orgSettings: ORG, send: async p => ({ ok: true, subject: "s", payload: p }), ...over });
const run = (a, b, seat, over) => A.handleSheetAction(a, b, cx(seat, over));
const mk = await run("sheet_new", { text: textOf(c0), mileage: "30,000" });
let sh = await store.get(org, mk.id);
ok(sh.read && sh.read.market.asks[0].selected == null, "a new typed sheet on a split pool opens with the question");
await run("sheet_open", { id: mk.id });
{ const r = await run("sheet_save", { id: mk.id, patch: { tier: 2 } }); sh = await store.get(org, mk.id);
  ok(r.ok && !r.retry && sh.read.condition.selected === 2 && !/^Pick a condition tier/.test(sh.read.market.startingNote), "a tier click on the split sheet stores a read that knows the tier is picked: " + sh.read.market.startingNote); }
{ const r = await run("sheet_save", { id: mk.id, baseVersion: sh.version, patch: { picks: [{ dimension: "body", value: "coupe" }, { dimension: "bogus", value: "x" }] } }); sh = await store.get(org, mk.id);
  ok(r.ok && JSON.stringify(sh.state.picks) === JSON.stringify([{ dimension: "body", value: "coupe" }]) && sh.read.condition.state !== "needs_choice" && sh.read.market.asks[0].selected === "coupe" && (sh.read.condition.state !== "ok" || sh.read.market.startingFigure > 0), "the pick is saved (a bogus one is not) and the tier pool for it is read: " + sh.read.condition.state); }
ok(sh.read.condition.carEvidence == null && sh.read.condition.carEvidenceNote === CT.NO_LISTING_LINE && CT.NO_LISTING_LINE === "No listing for this car yet; the tier is the analyst's call", "a typed car carries the one no-listing line");
{ const o = await run("sheet_open", { id: mk.id }); ok(o.sheet.state.picks.length === 1 && o.read.market.asks[0].selected === "coupe", "reopening the sheet keeps the pick"); }
// a read that fails on a click is said, not left looking like the answer
{ RS.useSheetEngine(async () => null); const r = await run("sheet_save", { id: mk.id, baseVersion: sh.version, patch: { tier: 3 } }); ok(r.ok && r.retry && /could not be refreshed/.test(r.retry.line), "a read that fails after a click says so (the earlier read is not passed off as the new one)"); RS.useSheetEngine((e, input) => S.sheetRead(env, input, mkDeps(c0))); sh = await store.get(org, mk.id); }
await run("sheet_save", { id: mk.id, baseVersion: sh.version, patch: { tier: 2 } }); sh = await store.get(org, mk.id);

// 3. the draft PDF
{ const before = await store.exportsThisMonth(org, "2026-11"), nExp = (sh.exports || []).length;
  const d = await run("sheet_pdf", { id: mk.id, draft: true });
  const text = d.ok ? Buffer.from(d.pdf_b64, "base64").toString("latin1") : "";
  ok(d.ok && d.draft === true && /^DRAFT-/.test(d.filename) && d.reportNumber == null && text.startsWith("%PDF"), "a draft PDF is made for an unfinalised sheet: " + (d.ok ? d.filename : d.why));
  ok(/DRAFT/.test(text) && !/DV-\d{4}-\d{4}/.test(text), "the draft is marked DRAFT on the page and carries no report number");
  ok((await store.exportsThisMonth(org, "2026-11")) === before && ((await store.get(org, mk.id)).exports || []).length === nExp, "a draft is not an export and is not counted against the monthly cap");
  for (let i = 0; i < 5; i++) await run("sheet_pdf", { id: mk.id, draft: true }); const d6 = await run("sheet_pdf", { id: mk.id, draft: true });
  ok(d6.ok, "draft after draft after draft is never refused by the export cap (cap 3)");
  const f0 = await run("sheet_pdf", { id: mk.id }); ok(f0.refused && /Finalise the sheet first/.test(f0.why), "the real PDF still needs the sheet finalised");
  const other = await run("sheet_pdf", { id: mk.id, draft: true }, "ben"); ok(other.refused, "a seat that cannot edit the sheet gets no draft of it");
  // the draft shows the whole proof: every sale of the pool, the band, the no-listing line
  const plain = text.replace(/\\\(/g, "(").replace(/\\\)/g, ")");
  ok(/IN BAND/.test(plain) && /OUTSIDE/.test(plain) && plain.includes(CT.NO_LISTING_LINE), "the draft carries the mileage band marks and the no-listing line"); }

// finalise: allowed once the question is answered, and the real report is not a draft
{ const dec = { mode: "reserve", reserve: "69000", reasons: ["documentation"], otherText: "", line: "Close inspection.", guardLines: { prior: "", start: "On purpose." }, note: "" };
  sh = await store.get(org, mk.id); await run("sheet_save", { id: mk.id, baseVersion: sh.version, patch: { decision: dec } });
  sh = await store.get(org, mk.id);
  const f = await run("sheet_finalise", { id: mk.id, baseVersion: sh.version });
  ok(f.ok && f.sheet.status === "Finalised", "finalise still works: " + (f.why || ""));
  const p = await run("sheet_pdf", { id: mk.id }); const t = p.ok ? Buffer.from(p.pdf_b64, "base64").toString("latin1") : "";
  ok(p.ok && /^DV-2026-/.test(p.reportNumber) && !/DRAFT/.test(t), "the finalised PDF has a report number and no DRAFT mark");
  const dd = await run("sheet_pdf", { id: mk.id, draft: true }); ok(dd.ok && !dd.draft && /^DV-/.test(dd.reportNumber), "a draft asked of a finalised sheet gives the real report"); }
{ // a split sheet cannot be finalised with the question open
  const mk2 = await run("sheet_new", { text: textOf(c0), mileage: "30000" }); await run("sheet_open", { id: mk2.id }); await run("sheet_save", { id: mk2.id, patch: { tier: 2 } });
  let s2 = await store.get(org, mk2.id); await run("sheet_save", { id: mk2.id, baseVersion: s2.version, patch: { decision: { mode: "reserve", reserve: "69000", reasons: ["documentation"], line: "x", guardLines: { start: "y" } } } }); s2 = await store.get(org, mk2.id);
  const f = await run("sheet_finalise", { id: mk2.id, baseVersion: s2.version }); ok(f.refused && /Pick the body style/.test(f.why), "finalise is refused while the body is not picked: " + f.why); }

// 4. the page and the PDF print the new parts (one source each)
ok((page.match(/asksHtml\(/g) || []).length >= 3 && /data-pick-dim/.test(page) && /data-pick="?|data-pick-val/.test(page) && /picks:/.test(page), "the page prints the question as a chip row and sends the pick");
ok(/data-pdf="draft"/.test(page) && /draft: true/.test(page), "the page has the draft PDF button");
ok(/cd\.state === "needs_choice"/.test(page) && /c\.inBand/.test(page) && /cd\.proofLine/.test(page), "the page shows the engine's reason when a pick is open, the band mark and the proof line");
ok(!/p25: q\(pick/.test(fs.readFileSync("lib/desk/sheetShape.js", "utf8")), "the sample splits use the read's own field names (low, high), not names the page never reads");
console.error = quiet;
console.log(`deskBlockersCheck: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
