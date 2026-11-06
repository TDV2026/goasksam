// DESK TIER LADDER AND ANALYST PLUS OR MINUS (Lane D, Nov 2026, Clint Sly's Desk Valuations change; CREW ONLY, not live until Sam says so in writing). Offline: the real handleSheetAction, the memory store, the real PDF.
//   node scripts/tierMarkCheck.mjs [repo root]        (a tree without the change fails: scripts/tierMarkFailsWithout.mjs)
// MUST HOLD:
//  (1) THE LADDER IS ONE SOURCE: the four lines and the Untiered line live in lib/conditionTier.js TIER_LADDER only. No other file under lib/, public/ or api/ types them; the sheet view, the PDF and TIER_LABELS read them.
//      Four tiers only: no 5 or 6 anywhere in the ladder, and the comment in the source cites Hagerty's four rung ladder.
//  (2) A MARK CHANGES NOTHING THE ENGINE SAID: saving a plus or minus does not ask the engine again, and the tier, the read (pool, counts, starting figure, comparables) and every stored row but the mark are byte for byte as before.
//      The engine never sets one: no read carries a mark.
//  (3) UNTIERED REFUSES a mark; a new tier clears the old tier's mark; an invalid mark is no mark.
//  (4) A FINALISED SHEET KEEPS THE MARK and cannot be changed afterwards; the PDF and the Send email carry "Engine: tier 2. Analyst: 2 plus" and the one line reason.
//  (5) THE READ-ONLY HINT comes from the engine's own pool: a comparable's half is in the read, the page filters by it and makes no figure.
//  (6) SEAT AND ROW RULES UNCHANGED: a read-only seat cannot mark; nothing outside the sheet's own state and final changes.
import fs from "node:fs"; import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const ROOT = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
process.chdir(ROOT);
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const imp = f => import(pathToFileURL(path.join(ROOT, f)).href);
const CT = await imp("lib/conditionTier.js"), A = await imp("lib/desk/sheetActions.js"), SS = await imp("lib/desk/sheetStore.js"), SH = await imp("lib/desk/sheetShape.js"), RP = await imp("lib/desk/reportPdf.js"), PM = await imp("lib/pdf/mini.js");
const { seed } = await imp("scripts/deskValsRender.mjs");

// ---- (1) the ladder is one source
const lines = [1, 2, 3, 4].map(k => CT.TIER_LADDER && CT.TIER_LADDER[k] && CT.TIER_LADDER[k].line).concat([CT.UNTIERED_LADDER && CT.UNTIERED_LADDER.line]);
ok(lines.every(l => typeof l === "string" && l.length > 10), "the ladder has a one line each for 1 to 4 and Untiered in lib/conditionTier.js");
ok(CT.TIER_LADDER && Object.keys(CT.TIER_LADDER).join() === "1,2,3,4", "four tiers only, no 5 or 6");
ok(JSON.stringify(Object.values(CT.TIER_NAMES)) === JSON.stringify(["Concours", "Excellent", "Good", "Fair"]), "the names are Concours, Excellent, Good, Fair");
ok(/Hagerty/.test(fs.readFileSync("lib/conditionTier.js", "utf8").split("\n").filter(l => /FOUR TIERS ONLY/.test(l))[0] || ""), "the source comment cites Hagerty's four rung ladder");
ok(SH.TIER_LABELS === CT.TIER_NAMES || JSON.stringify(SH.TIER_LABELS) === JSON.stringify(CT.TIER_NAMES), "the Desk's tier labels are the tier job's names (one source)");
{ const files = []; const walk = d => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) { if (!/node_modules|\.git$/.test(e.name)) walk(p); } else if (/\.(js|mjs|html)$/.test(e.name)) files.push(p); } };
  for (const d of ["lib", "public", "api"]) if (fs.existsSync(d)) walk(d);
  const words = lines.filter(Boolean).map(l => l.toLowerCase());
  const typed = files.filter(f => f !== path.join("lib", "conditionTier.js")).filter(f => { const t = fs.readFileSync(f, "utf8").toLowerCase(); return words.some(w => t.includes(w)); });
  ok(typed.length === 0, "no file but lib/conditionTier.js types a ladder line: " + typed.join(", ")); }

// ---- world
const org = "mark-org", store = SS.memoryStore();
const cx = (seat = "ava", over = {}) => ({ now: "2026-11-04T12:00:00.000Z", env: {}, org, seat, store, orgSettings: { name: "Hagerty Marketplace", logo: null, monthlyExportCap: 50, standardMessage: "Thanks." }, send: async p => { sent.push(p); return { ok: true, subject: "s" }; }, ...over });
const sent = [];
const run = (a, b, seat) => A.handleSheetAction(a, b, cx(seat));
const sh = await seed(store, { seat: "ava", org });
const stripMark = s => { const c = JSON.parse(JSON.stringify(s)); if (c.state) delete c.state.mark; if (c.final) delete c.final.mark; return c; };
const opened = await run("sheet_open", { id: sh.id });
ok(opened.ok && opened.ladder && opened.ladder.tiers.length === 4 && opened.ladder.untiered.line === CT.UNTIERED_LADDER.line && opened.ladder.tiers.every(t => t.line === CT.TIER_LADDER[t.tier].line), "the sheet view carries the ladder from the one source");
ok(opened.read && !("mark" in opened.read) && !("mark" in (opened.read.condition || {})), "the engine's read carries no mark");

// ---- (3) Untiered refuses a mark
{ const before = JSON.stringify(await store.get(org, sh.id));
  const r = await run("sheet_save", { id: sh.id, patch: { mark: { mark: "plus", reason: "tidy" } } });
  ok(r.refused && /Untiered/.test(r.why), "an Untiered car refuses a mark: " + (r.why || ""));
  ok(JSON.stringify(await store.get(org, sh.id)) === before, "...and nothing was stored"); }

ok(CT.sanitizeMark(null, { mark: "plus" }) === null && CT.sanitizeMark(0, { mark: "minus" }) === null && CT.sanitizeMark(5, { mark: "plus" }) === null, "no mark for an Untiered car or a fifth tier, at the source of the rule");
ok(CT.sanitizeMark(3, { mark: "minus", reason: "x" }).tier === 3, "a mark carries the tier it was made on");
// the engine never sets one: the files that make a read mention no mark at all
{ const own = ["lib/sheetRead.js", "lib/desk/sheetShape.js", "lib/desk/sheetRead.js"].filter(f => /\bmark\b/i.test(fs.readFileSync(f, "utf8").replace(/benchmark/gi, ""))); ok(own.length === 0, "no read-making file sets or names a mark: " + own.join(", ")); }
// ---- (2) a mark changes nothing the engine said
await run("sheet_save", { id: sh.id, patch: { tier: 2 } });
const base = await store.get(org, sh.id), baseRead = JSON.stringify(base.read), baseTier = base.state.tier;
let engineCalls = 0; const countingEngine = async () => { engineCalls++; return null; };
const { useSheetEngine } = await imp("lib/desk/sheetRead.js"); useSheetEngine(countingEngine);
const r1 = await run("sheet_save", { id: sh.id, patch: { mark: { mark: "plus", reason: "Cleaner than the tier median car.\nSecond line" } } });
useSheetEngine(null);
const after = await store.get(org, sh.id);
ok(r1.ok && after.state.mark && after.state.mark.mark === "plus" && after.state.mark.tier === 2, "a plus on tier 2 is saved");
ok(after.state.mark.reason === "Cleaner than the tier median car. Second line", "the one line reason is saved on one line: " + after.state.mark.reason);
ok(engineCalls === 0, "a mark does not ask the engine again (" + engineCalls + " calls)");
ok(JSON.stringify(after.read) === baseRead && after.state.tier === baseTier, "the tier, the pool and the starting figure are as before");
ok(JSON.stringify(stripMark(after)) === JSON.stringify(stripMark(base)) , "every stored field but the mark is as before");
ok(r1.markLine === "Engine: tier 2. Analyst: 2 plus", 'the sheet prints "Engine: tier 2. Analyst: 2 plus": ' + r1.markLine);
{ const bad = await run("sheet_save", { id: sh.id, patch: { mark: { mark: "double plus" } } }); ok(bad.ok && (await store.get(org, sh.id)).state.mark === null, "an invalid mark is no mark"); }
await run("sheet_save", { id: sh.id, patch: { mark: { mark: "minus", reason: "" } } });
ok((await store.get(org, sh.id)).state.mark.mark === "minus", "a minus replaces a plus");
await run("sheet_save", { id: sh.id, patch: { tier: 3 } });
ok((await store.get(org, sh.id)).state.mark === null, "a new tier clears the mark of the old one");
await run("sheet_save", { id: sh.id, patch: { tier: 2, mark: { mark: "plus", reason: "Kept." } } });
ok((await store.get(org, sh.id)).state.mark.mark === "plus" && (await store.get(org, sh.id)).state.tier === 2, "a tier and a mark in one save: the mark follows the new tier");
await run("sheet_save", { id: sh.id, patch: { tier: null } });
ok((await store.get(org, sh.id)).state.mark === null, "clearing the tier clears the mark");
// (6) another seat
await run("sheet_save", { id: sh.id, patch: { tier: 2 } });
{ const b = await store.get(org, sh.id); const r = await run("sheet_save", { id: sh.id, patch: { mark: { mark: "plus" } } }, "ben"); ok(r.refused, "another seat cannot mark: " + (r.why || "")); ok(JSON.stringify(await store.get(org, sh.id)) === JSON.stringify(b), "...and nothing was stored"); }

// ---- (5) the hint: halves come from the engine's own pool, ranks only
{ const sr = await imp("lib/sheetRead.js"), cards = [10, 20, 30, 40, 50].map(price => ({ price })), f = sr.halfFinder(cards, true);
  ok(typeof sr.halfFinder === "function" && JSON.stringify(cards.map(f)) === JSON.stringify(["lower", "lower", null, "upper", "upper"]), "the halves of a five sale tier pool: two lower, the middle in neither, two upper: " + JSON.stringify(cards.map(f)));
  const g = sr.halfFinder([10, 20, 30, 40].map(price => ({ price })), true); ok(JSON.stringify([10, 20, 30, 40].map(price => g({ price }))) === JSON.stringify(["lower", null, null, "upper"]), "an even pool: the two middle sales are in neither half, no new figure");
  ok(sr.halfFinder(cards, false)(cards[0]) === null, "no tier pool, no halves"); }

// ---- (4) finalise keeps the mark; PDF and email carry it
await run("sheet_save", { id: sh.id, patch: { tier: 2, mark: { mark: "plus", reason: "Better than the median car in its tier." }, decision: { mode: "reserve", reserve: "68000", reasons: [], otherText: "", line: "", guardLines: {}, note: "A note." } } });
const fin = await run("sheet_finalise", { id: sh.id });
const fs_ = await store.get(org, sh.id);
ok(fin.ok && fs_.final && fs_.final.mark && fs_.final.mark.mark === "plus" && fs_.final.mark.tier === 2 && fs_.final.mark.reason === "Better than the median car in its tier.", "the finalised sheet keeps the mark and its reason");
{ const r = await run("sheet_save", { id: sh.id, patch: { mark: { mark: "minus" } } }); ok(r.refused, "a finalised sheet refuses a new mark"); ok((await store.get(org, sh.id)).final.mark.mark === "plus", "...and keeps the old one"); }
const rep = await RP.buildReport(await store.get(org, sh.id), { name: "Hagerty Marketplace", logo: null }, {});
const text = PM.pdfPages(rep.bytes).map(p => p.join(" | ")).join("\n");
ok(/Engine: tier 2\. Analyst: 2 plus/.test(text), "the PDF prints Engine: tier 2. Analyst: 2 plus");
ok(/Better than the median car in its tier/.test(text), "the PDF prints the analyst's one line reason");
ok(PM.pdfPages(rep.bytes).map(p => p.join(" ")).join(" ").includes(CT.TIER_LADDER[2].line.slice(0, 20)), "the PDF prints the ladder line from the one source");
const out = await run("sheet_send", { id: sh.id, to: "seller@example.com", message: "Hello." });
ok(out.ok && sent.length === 1 && /Engine: tier 2\. Analyst: 2 plus/.test(sent[0].note) && /Better than the median car/.test(sent[0].note) && /A note\./.test(sent[0].note), "the Send email carries the analyst's mark and reason with the note: " + JSON.stringify(sent[0] && sent[0].note));
// a finalised sheet with no mark prints none
{ const s2 = await seed(store, { seat: "ava", org }); await run("sheet_open", { id: s2.id }); await run("sheet_save", { id: s2.id, patch: { tier: 2, decision: { mode: "reserve", reserve: "68000", reasons: [], otherText: "", line: "", guardLines: {}, note: "" } } }); await run("sheet_finalise", { id: s2.id });
  const r2 = await RP.buildReport(await store.get(org, s2.id), { name: "H", logo: null }, {}); ok(!/Analyst: /.test(PM.pdfPages(r2.bytes).map(p => p.join(" ")).join(" ")), "no mark, no analyst line on the PDF"); }

// ---- the page: it prints the ladder and the mark from the server, and types neither
{ const page = fs.readFileSync("public/js/deskvals.js", "utf8");
  ok(/h\.v\.ladder/.test(page) && /data-mark/.test(page) && /markLine/.test(page), "the page prints h.v.ladder and markLine and has the plus and minus buttons");
  ok(!/"Engine: tier|Engine: tier \d/.test(page.replace(/markLine/g, "")), "the page does not type the Engine line"); }

console.log(`tierMarkCheck: ${pass} pass, ${fail} FAIL`); process.exit(fail ? 1 : 0);
