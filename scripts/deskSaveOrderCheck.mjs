// DESK VALUATIONS: SAVE ORDER CHECK (Lane S, Nov 5 2026). The class behind the reasonRulesCheck flake: the sheet page saves what the expert types after a 400 ms pause, and a save's
// response re-renders the whole sheet. Anything that acts on the sheet (Finalise seals it) must act on exactly what the screen shows. In the real page, in Chrome, over the real actions:
//   1. Finalise clicked straight after typing (inside the 400 ms window) seals the typed reserve, not the last saved one, and not an empty draft.
//   2. A reserve changed after an earlier save and Finalise clicked at once seals the NEW reserve.
//   3. Two kinds of change inside one window (the pinned question, then a correction) both reach the server.
//   4. Saves land in the order they were made even when the first is slow (the sheet ends with the LAST thing typed).
//   5. After a save the page settles (window.__deskVals.settled()) before anything else is typed or clicked: the check itself never races a re-render.
// Each rule runs against MUTANTS of public/js/deskvals.js with the protection removed (and the page as it was on origin/main before the fix); every mutant must fail.
//   node scripts/deskSaveOrderCheck.mjs
import fs from "node:fs";
import { execSync } from "node:child_process";
import { startDesk, seed, wait, press, typeIn, settle } from "./deskValsRender.mjs";

const SRC = fs.readFileSync(new URL("../public/js/deskvals.js", import.meta.url), "utf8");
const base = { reasons: [], otherText: "", line: "", guardLines: {} };

async function scenarios(js) {
  const fails = [], D = await startDesk({ org: "sv", mutateJs: js });
  try {
    const sid = async () => (await seed(D.store, { org: "sv" })).id;
    const open = async id => { const p = await D.open(1440); await press(p, `[data-open="${id}"]`); await wait(500); await press(p, '[data-tier="2"]'); await settle(p); await press(p, '[data-dmode="reserve"]'); await settle(p); return p; };
    // 1. type, then Finalise at once
    { const id = await sid(), p = await open(id); await typeIn(p, '[data-k="d-reserve"]', "68000"); await press(p, "[data-finalise]"); await settle(p); await wait(300);
      const s = await D.store.get("sv", id); if (!(s.status === "Finalised" && s.final && s.final.decision.reserve === "68000")) fails.push(`typed reserve then Finalise at once: not sealed from the screen (status ${s.status}, reserve ${s.state.decision.reserve})`); await p.close(); }
    // 2. a changed value after an earlier save, Finalise at once
    { const id = await sid(), p = await open(id); await typeIn(p, '[data-k="d-reserve"]', "68000"); await settle(p);
      await typeIn(p, '[data-k="d-reserve"]', "69000", true); await press(p, "[data-finalise]"); await settle(p); await wait(300);
      const s = await D.store.get("sv", id); if (!(s.final && s.final.decision.reserve === "69000")) fails.push(`changed reserve then Finalise at once: sealed ${s.final ? s.final.decision.reserve : "nothing"}, the screen said 69000`); await p.close(); }
    // 3. two kinds of change inside one window
    { const id = await sid(), p = await open(id); await typeIn(p, '[data-k="pinned"]', "Is the paint original?"); await typeIn(p, '[data-k="corr-colour"]', "Guards Red"); await settle(p);
      const s = await D.store.get("sv", id); if (!(s.state.pinned === "Is the paint original?" && s.state.corrections && s.state.corrections.colour === "Guards Red")) fails.push(`two kinds of change in one window: pinned "${s.state.pinned}", colour "${s.state.corrections && s.state.corrections.colour}"`); await p.close(); }
    // 4. a slow first save never lands after a later one
    { const id = await sid(), p = await open(id), put = D.store.putIf.bind(D.store); let n = 0, refused = 0;   // saves go through putIf (the version check, Nov 2026)
      D.store.putIf = async (o, sh, e) => { const mine = ++n; if (mine === 1 && sh.state.decision.reserve) await wait(700); const r = await put(o, sh, e); if (r === false) refused++; return r; };
      await typeIn(p, '[data-k="d-reserve"]', "67000"); await p.evaluate(() => { document.querySelector('[data-k="d-reserve"]').blur(); }); await wait(500);   // first save is now in flight and slow
      await typeIn(p, '[data-k="d-reserve"]', "68500", true); await settle(p); await wait(900);
      D.store.putIf = put; const s = await D.store.get("sv", id); if (s.state.decision.reserve !== "68500") fails.push(`a slow earlier save landed after the later one: the sheet ended with ${s.state.decision.reserve}`);
      if (refused) fails.push(`one tab's own saves refused each other (${refused} stale): saves must queue so each carries the version the last one returned`); await p.close(); }
  } finally { await D.close(); }
  return fails;
}
const rep = (s, from, to) => { if (!s.includes(from)) throw new Error("mutant did not apply: " + from.slice(0, 60)); return s.replace(from, () => to); };
let before = null; try { before = execSync("git show origin/main:public/js/deskvals.js", { encoding: "utf8", cwd: new URL("..", import.meta.url).pathname, stdio: ["ignore", "pipe", "ignore"] }); } catch {}
const MUTANTS = [
  ["Finalise does not flush the pending save", s => rep(s, 'flush(id).then(function () { return api("sheet_finalise", { id: id, baseVersion: (S.sheets[id].v.sheet.version || 0) }); }).then(', 'api("sheet_finalise", { id: id }).then(')],
  ["a later patch replaces the earlier one in the window", s => rep(s, "pend[id] = Object.assign(pend[id] || {}, patch);", "pend[id] = patch;")],
  ["saves are not queued behind each other", s => rep(s, "var p = (chains[id] || Promise.resolve()).then(function () {", "var p = Promise.resolve().then(function () {")],
  ["settled() does not wait for the saves", s => rep(s, "function settled() { return", "function settled() { return Promise.resolve(); return")]
];
const MUT_BEFORE = before && !before.includes("function flush(") ? [["the page as it was before the fix (origin/main)", () => before]] : [];

export async function main() {
  let pass = 0, fail = 0;
  const f = await scenarios(SRC).catch(e => ["scenario error: " + String(e.stack).slice(0, 300)]); if (f.length) { fail += f.length; f.forEach(x => console.log("FAIL " + x)); } else pass++;
  for (const [name, m] of [...MUTANTS, ...MUT_BEFORE]) {
    let js; try { js = m(SRC); } catch (e) { fail++; console.log(`FAIL mutant "${name}": ${e.message}`); continue; }
    const g = await scenarios(js).catch(e => ["the page could not complete the scenarios: " + String(e.message).split("\n")[0]]); if (g.length) { pass++; if (process.env.VERBOSE) console.log(`  caught "${name}": ${g[0].slice(0, 110)}`); } else { fail++; console.log(`FAIL mutant "${name}" was NOT caught`); }
  }
  console.log(`deskSaveOrderCheck: ${pass} pass, ${fail} FAIL (${MUTANTS.length + MUT_BEFORE.length} mutants, each must be caught)`);
  return fail ? 1 : 0;
}
if (import.meta.url === `file://${process.argv[1]}`) process.exit(await main());
