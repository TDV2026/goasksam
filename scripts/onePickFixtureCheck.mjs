// ONE PICK, MEANINGFUL (Lane B, Nov 5 2026, nightly #132 "ONE PICK FAIL"). The cross-product check compared a rush seller's "speed pick or null" and read two agreeing nulls as a disagreement (1965 Corvette, rush), and compared the picks of a car the engine cannot
// read (1993 Carrera RS Targa, not tracked) that have no pick at all. Neither was a Sell gap: pickPlatform returns the speed pick when one differs from the standard pick and the standard pick otherwise; decide() shows speedPick only when it differs.
// This check, offline: (1) pickRowState: two empty picks agree and are UNEXERCISED, a pick on one side only and two different venues DISAGREE, an agreeing pair on an exercised shape PASSes; (2) checkPickFixtures runs the rush (distinct and same venue), no-rush, tie and depth rules on
// synthetic pools through the REAL pickPlatform, buildSharedAnalysis and decide and requires both pages to show the same venue, the right one; (3) the live case no longer compares "speed pick or null". The live cases themselves are reported as unexercised when the archive cannot show their shape.
//   node scripts/onePickFixtureCheck.mjs [repo root]
import path from "node:path"; import fs from "node:fs"; import { fileURLToPath, pathToFileURL } from "node:url";
const root = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
process.chdir(root);
process.env.SUPABASE_URL = "https://fake.supabase.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "k";
globalThis.fetch = async () => new Response("[]", { status: 200 });
let failed = 0; const ok = (n, c, d) => { if (!c) failed++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`); };
const X = await import(pathToFileURL(path.join(root, "scripts/crossProductCheck.js")).href);
const st = (sell, shared, exercised, alt) => X.pickRowState({ sell, shared, exercised }, alt);
ok("(1) two empty picks agree and are unexercised, never a pass", (() => { const r = st(null, null, false); return r.agree === true && /^UNEXERCISED/.test(r.state); })());
ok("(1) a pick on the Sell side only is a disagreement", st("Hagerty", null, true).agree === false && st("Hagerty", null, true).state === "DISAGREE");
ok("(1) a pick on the shared side only is a disagreement", st(null, "Hagerty", true).agree === false);
ok("(1) two different venues disagree", st("Hagerty", "Bring a Trailer", true).agree === false);
ok("(1) the same venue on an exercised shape passes", st("Hagerty", "Hagerty", true).state === "PASS");
ok("(1) the same venue on an unexercised shape agrees and is reported unexercised", (() => { const r = st("Hagerty", "Hagerty", false); return r.agree && /^UNEXERCISED/.test(r.state); })());
ok("(1) a display name and a slug are the same venue", st("Bring a Trailer", "Bring a Trailer", true, "bringatrailer").agree && st("Bring a Trailer", "bringatrailer-x", true, "bringatrailer").agree);
const fx = await X.checkPickFixtures();
for (const c of fx.cases) ok(`(2) ${c.name}`, c.pass, JSON.stringify({ want: c.want, sell: c.sell, shared: c.shared, speedPick: c.speedPick }));
ok("(2) five fixtures ran", fx.cases.length >= 5);
const src = fs.readFileSync("scripts/crossProductCheck.js", "utf8"), i = src.indexOf("export async function checkSinglePick"), body = src.slice(i, src.indexOf("// BUY PATHS", i));
ok("(3) a rush case compares what each page shows (the speed pick, else the standard pick), not the speed pick alone", /dec\.speedPick \|\| dec\.recommendedPath/.test(body) && !/shared\.reasonCode === "speed" \? \(shared\.platformDisplay \|\| shared\.platform\) : null/.test(body));
ok("(3) the live cases are gated on a disagreement or error and the unexercised ones are listed", /out\.unexercised = /.test(body) && /if \(!row\.agree\) out\.ok = false/.test(body));
console.log(failed ? `\nonePickFixtureCheck: ${failed} FAILED` : "\nonePickFixtureCheck: all passed");
process.exit(failed ? 1 : 0);
