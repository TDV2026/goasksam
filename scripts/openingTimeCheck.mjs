// openingTimeCheck (Lane G, Oct 29 2026): THE OPENING TIME IS ONE SETTING THAT STARTS EMPTY. Class: no page, email, tab, meta line or script may print or hold a fixed
// launch time or date ("7:00 AM", "Thursday, October 29", "2026-10-29T07:00") of its own. The only source is LAUNCH_AT read through lib/launchTime.js, and with it empty
// nothing prints a time. Part 1 scans every served source file (lib, api, public) for a hard-coded launch moment; part 2 runs the holding page, the admin Launch tab's
// range and the date words with the setting empty and then set. No network. Usage: node scripts/openingTimeCheck.mjs [rootDir]
import fs from "node:fs"; import path from "node:path"; import { pathToFileURL } from "node:url";
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const root = path.resolve(process.argv[2] || ".");
const BAD = [/7:00\s?(AM|a\.m\.)/i, /Thursday,?\s+(Oct\.?|October)\s+29/i, /2026-10-29T(0[0-9]|1[0-9]):/, /Opening\s+(on\s+)?Thursday/i, /GoAskSam opens (on )?(Thu|Oct)/i];
const ALLOW = new Set(["lib/launchTime.js"]);   // its comment shows the shape of a value (2026-10-29T07:00:00-07:00) for Sam
function walk(d, out = []) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { if (e.name === "node_modules" || e.name.startsWith(".")) continue; const f = path.join(d, e.name); if (e.isDirectory()) walk(f, out); else if (/\.(js|mjs|html|json|xml|txt)$/.test(e.name)) out.push(f); } return out; }
const hits = [];
for (const top of ["lib", "api", "public"]) { const d = path.join(root, top); if (!fs.existsSync(d)) continue; for (const f of walk(d)) { const rel = path.relative(root, f).split(path.sep).join("/"); if (ALLOW.has(rel)) continue; const lines = fs.readFileSync(f, "utf8").split("\n"); lines.forEach((ln, i) => { if (BAD.some(re => re.test(ln))) hits.push(`${rel}:${i + 1}`); }); } }
ok(hits.length === 0, "no served file holds a fixed launch time or date" + (hits.length ? ": " + hits.join(", ") : ""));
const imp = async rel => import(pathToFileURL(path.join(root, rel)).href + "?t=" + Math.random());
const lt = await imp("lib/launchTime.js").catch(() => null);
if (lt && lt.launchAtMs) {
  const hold = await imp("lib/_hold.js");
  delete process.env.LAUNCH_AT;
  ok(lt.launchAtMs() === 0 && lt.launchWords() === "", "empty setting: no time and no date words");
  const vis = h => h.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, "");
  for (const now of [Date.parse("2026-10-29T13:00:00Z"), Date.parse("2026-10-29T14:00:00Z") + 1000, Date.parse("2027-06-01T00:00:00Z")]) {
    const h = hold.holdingHtml(now), v = vis(h);
    ok(!/\d{1,2}:\d{2}|\bAM\b|\bPM\b|Pacific|Thursday|October|Opening now|id="clock"|data-at=/.test(h.replace(/getAttribute\("data-at"\)|document\.getElementById\("clock"\)/g, "")), "empty setting at clock " + new Date(now).toISOString() + ": no time, no date, no countdown, never 'Opening now'");
    ok(/opening soon/i.test(v), "empty setting: the page says it is opening soon");
  }
  const ad = await imp("lib/admin/launch.js").catch(() => null);
  ok(!ad || (ad.launchIso ? ad.launchIso() === null : false), "empty setting: the admin Launch tab has no launch moment of its own");
  process.env.LAUNCH_AT = "2026-10-29T07:00:00-07:00";
  ok(lt.launchAtMs() === Date.UTC(2026, 9, 29, 14, 0, 0) && /^Thursday, October 29, 2026, 7:00 AM Pacific Time$/.test(lt.launchWords()), "set to 7:00 AM Pacific: the words and the moment come from the setting");
  ok(/id="clock"/.test(hold.holdingHtml(Date.parse("2026-10-29T13:55:00Z"))) && /Opening now/.test(vis(hold.holdingHtml(Date.parse("2026-10-29T14:00:01Z")))), "set: countdown before, 'Opening now' after");
  process.env.LAUNCH_AT = "2026-11-02T08:30:00-08:00";
  ok(/Monday, November 2, 2026, 8:30 AM Pacific Time/.test(vis(hold.holdingHtml(Date.parse("2026-10-30T00:00:00Z")))), "set to another time: the page follows the setting (nothing is fixed)");
} else ok(false, "lib/launchTime.js exports launchAtMs (the one setting)");
console.log(`openingTimeCheck: ${pass} pass, ${fail} FAIL`); process.exit(fail ? 1 : 0);
