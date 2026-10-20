// trimChipPoolCheck (Lane B, Oct 20 2026, Lane C's look at the 1965 Mustang coupe: "3Speed (three)" opened six sales plus one
// set aside): a trim chip's count comes from the bare page's finished pool (window and set-asides applied), so the chip's
// refine must narrow THAT pool, never re-filter the raw ladder rows (which then pick their own, wider window). Offline: the
// shared buildPool on synthetic rows, the bare pool's trim counts against each chip's opened pool, plus "Other trims".
import { buildPool, trimGroupsFromSales } from "../lib/onebox.js";
let bad = 0;
const ok = (c, m) => { if (c) console.log("ok   " + m); else { bad++; console.log("FAIL " + m); } };
const day = 864e5, now = Date.now();
const iso = d => new Date(now - d * day).toISOString();
let id = 0;
const row = (trim, daysAgo, usd) => { const t = `2021 BMW 3 Series ${trim}`.trim(); return { id: "r" + (++id), title: t, raw_title: t, rtitle: t, year: 2021, make: "BMW", model: "3 Series", _usd: usd, price: usd, auction_end_date: iso(daysAgo).slice(0, 10), source: "Bring a Trailer" }; };
const rows = [
  // the last twelve months: 10 sales (so the bare page's window is twelve months)
  row("330i", 20, 30000), row("330i", 60, 31000), row("330i", 100, 32000), row("330i", 140, 30500),
  row("M340i", 30, 33000), row("M340i", 90, 34000), row("M340i", 150, 33500),
  row("", 40, 31500), row("", 120, 32500), row("", 200, 31000),
  // older 330i sales, two to four years back: outside the bare page's window
  row("330i", 800, 29000), row("330i", 900, 29500), row("330i", 1000, 30000), row("330i", 1100, 29800), row("330i", 1300, 30200), row("330i", 1400, 29900)
];
const spec = { make: "BMW", model: "3 Series", year: 2021, subject: "3 Series" };
const chosen = { rows, step: "model", windowLabel: "last five years" };
const bare = buildPool(chosen, {}, iso, spec, null);
const g = trimGroupsFromSales(bare.solid, spec);
const count = v => (g.named.find(x => x.value === v) || {}).n || 0;
ok(bare.solid.length === 10, `the bare page reads its twelve-month window (${bare.solid.length} sales)`);
for (const v of ["330i", "m340i"]) {
  const opened = buildPool(chosen, {}, iso, spec, { trim: v });
  ok(opened.solid.length === count(v), `chip ${v} (${count(v)}) opens ${opened.solid.length} sales, the same rows`);
  ok(opened.solid.every(r => opened.window.includes(r)) && opened.windowLabel === bare.windowLabel, `chip ${v} keeps the bare page's window (${opened.windowLabel})`);
}
const other = buildPool(chosen, {}, iso, spec, { trim: "other", notTrims: g.named.map(x => x.value).join(",") });
ok(other.solid.length === g.other, `"Other trims" (${g.other}) opens ${other.solid.length} sales`);
ok(buildPool(chosen, {}, iso, spec, { trim: "330i" }).chosenTrimName === "330i", "the chosen trim keeps its name");
console.log(bad ? `trimChipPoolCheck: ${bad} failed` : "trimChipPoolCheck: all passed");
process.exit(bad ? 1 : 0);
