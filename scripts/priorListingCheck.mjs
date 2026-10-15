// Prior listings (Lane C, Oct 15 2026): "sold before" wording can never render unless an earlier listing of the same
// car (VIN) has a sold outcome. Checks the shared rule (lib/live/priorListing.js), the Buy page's real popup builder
// run in a sandbox with the rule written in exactly as the page does, and that no surface keeps its own copy of the
// wording. No network.
import fs from "node:fs";
import vm from "node:vm";
import { priorSold, priorWords, priorTake } from "../lib/live/priorListing.js";

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const NOW = "2026-10-15T12:00:00Z";
const unsold = [{ date: "2026-09-12", house: "Sotheby's Motorsport", result: "not_sold", price: 226000 }];
const sold = [{ date: "2025-03-08", house: "Bring a Trailer", result: "sold", price: 180000, miles: 9000 }];
const mixed = [{ date: "2024-05-02", result: "sold", price: 150000 }, { date: "2026-02-20", result: "not_sold", price: 170000 }];

// ---- 1. the rule
ok(!priorSold(unsold) && priorWords(unsold).button === "This car was listed before" && priorWords(unsold).heading === "This car has been listed before", "every earlier listing unsold: listed wording");
ok(priorSold(sold) && priorWords(sold).button === "This car sold before" && priorWords(sold).heading === "This car has sold before", "an earlier sale: sold wording");
ok(priorSold(mixed) && priorWords(mixed).heading === "This car has sold before", "one sold and one not: sold wins");
for (const r of [undefined, null, "", "unknown", "withdrawn", "not_sold", "reserve_not_met", "Sold?"]) ok(!priorSold([{ date: "2026-01-01", result: r }]), `result ${JSON.stringify(r)} is not a sale`);
ok(!priorSold([]) && !priorSold(null), "no earlier listing is not a sale");

// ---- 2. Sam's Take follows the same split
ok(priorTake(unsold, null, NOW) === "Back for the second time.", "unsold once: second time");
ok(priorTake(unsold.concat({ date: "2026-06-01", result: "withdrawn" }), null, NOW) === "Back for the third time.", "unsold twice: third time");
ok(priorTake(sold, null, NOW) === "Back after selling in March 2025.", "sold last year: month and year");
ok(priorTake([{ date: "2026-03-08", result: "sold" }], null, NOW) === "Back after selling in March.", "sold this year: month only");
ok(priorTake(mixed, null, NOW) === "Back after selling in May 2024.", "mixed: the earlier sale's month, never the unsold one");
ok(priorTake(sold, 10250, NOW) === "Back after selling in March 2025, now with 1,250 more miles.", "the miles clause stays");
ok(priorTake([], null, NOW) === "", "nothing earlier, no Take");
ok(!/sold/i.test(priorTake(unsold, 5, NOW)), "an unsold Take never says sold");

// ---- 3. the Buy page's own popup, run with the rule written in as api/buy.js does
const page = fs.readFileSync(new URL("../api/buy.js", import.meta.url), "utf8");
const client = JSON.parse(/^const CLIENT = (.*);$/m.exec(page)[1]);
ok(client.includes("/*__PRIOR__*/") && /\.replace\("\/\*__PRIOR__\*\/", \(\) => PRIOR_JS\)/.test(page), "the page writes the shared rule into its script");
ok(/import \{ priorSold, priorWords, priorTake \} from "\.\.\/lib\/live\/priorListing\.js"/.test(page), "the page reads the one rule");
const code = client.replace("__KEEP_ICON__", '""').replace("/*__PRIOR__*/", [priorSold, priorWords, priorTake].map(f => f.toString()).join("\n"));
const body = code.replace(/^\(function\s*\(\s*\)\s*\{\n/, "").replace(/\n\}\)\(\);?\s*$/, "");
const noop = () => {}, el = () => ({ addEventListener: noop, setAttribute: noop, getAttribute: () => null, appendChild: noop, querySelector: () => null, querySelectorAll: () => [], classList: { add: noop, remove: noop, toggle: noop, contains: () => false }, style: {}, dataset: {} });
const sb = { window: { addEventListener: noop, GAS_REL: { mc: true, tasks: true } }, document: { getElementById: el, querySelector: el, querySelectorAll: () => [], createElement: el, addEventListener: noop, body: el(), documentElement: el(), cookie: "" }, location: { search: "", pathname: "/buy", hostname: "localhost" }, navigator: { userAgent: "node" }, localStorage: { getItem: () => null, setItem: noop }, sessionStorage: { getItem: () => null, setItem: noop }, history: { replaceState: noop, pushState: noop }, fetch: () => Promise.reject(new Error("no network")), setTimeout: () => 0, clearTimeout: noop, setInterval: () => 0, clearInterval: noop, console, matchMedia: () => ({ matches: false }) };
sb.window.location = sb.location;
const ctx = vm.createContext(sb);
try { vm.runInContext(body, ctx, { timeout: 5000 }); } catch (e) {}
ok(typeof ctx.histHtml === "function", "the popup builder loads");
if (typeof ctx.histHtml === "function") {
  const draw = timeline => { try { return String(ctx.histHtml({ id: 1, miles: null, timeline })); } catch (e) { return "ERROR " + e.message; } };
  const u = draw(unsold), s = draw(sold), m = draw(mixed);
  ok(!/sold before/i.test(u) && /This car has been listed before/.test(u), "popup with only unsold listings never says sold before");
  ok(/Bid to \$226,000 · Not sold/.test(u), "the unsold row keeps its own outcome");
  ok(/Back for the second time\./.test(u), "unsold popup Take: second time");
  ok(/This car has sold before/.test(s) && /Sold for \$180,000/.test(s) && /Back after selling in March 2025\./.test(s), "sold popup keeps the sold wording");
  ok(/This car has sold before/.test(m), "mixed popup: sold wins");
}

// ---- 4. no surface keeps its own copy of the wording
ok(!/This car (has )?sold before/.test(client.replace(/\/\/[^\n]*/g, "")), "the Buy client has no literal sold-before wording of its own");
const landing = fs.readFileSync(new URL("../lib/live/buyLanding.js", import.meta.url), "utf8");
ok(/priorSold\(apps\) \? "sold" : "was listed"/.test(landing) && !/This exact car sold before →/.test(landing.replace(/\/\/[^\n]*/g, "")), "the Buy landing example reads the rule");

console.log(`priorListingCheck: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
