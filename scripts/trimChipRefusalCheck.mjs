// trimChipRefusalCheck (Lane B, Oct 20 2026, the 1971 Ferrari 365 GTB4 chip said 6 and opened 3): a trim question built on a "too
// spread out" refusal counts its chips from the refusal's SOLID rows (the rows a chip page reads), so a chip opens exactly its count;
// the result case (330i) still agrees (scripts/trimChipPoolCheck.mjs). Offline: the shared buildResult and trimGroupsFromSales on
// seeded rows (prices spread enough to refuse; restomods in the pool that a chip page sets aside).
globalThis.fetch = async () => { throw new Error("network blocked in check"); };
const ob = await import("../lib/onebox.js");
let bad = 0;
const ok = (c, m) => { if (c) console.log("ok   " + m); else { bad++; console.log("FAIL " + m); } };
const day = 864e5, now = Date.now(), iso = d => new Date(now - d * day).toISOString();
let id = 0;
const row = (t, usd, d) => ({ id: "r" + (++id), title: t, raw_title: t, rtitle: t, year: 1971, make: "Ferrari", model: "365", _usd: usd, price: usd, auction_end_date: iso(d).slice(0, 10), source: "Bring a Trailer", image: "x" });
const rows = [
  row("1971 Ferrari 365 GTB4 Daytona", 700000, 20), row("1971 Ferrari 365 GTB4 Daytona", 760000, 60), row("1971 Ferrari 365 GTB4 Daytona", 820000, 100),
  row("1971 Ferrari 365 GTB4 Daytona", 4900000, 120), row("1971 Ferrari 365 GTB4 Daytona", 5200000, 140), row("1971 Ferrari 365 GTB4 Daytona", 45000, 150),
  row("1971 Ferrari 365 GTC4", 250000, 30), row("1971 Ferrari 365 GTC4", 270000, 70), row("1971 Ferrari 365 GTC4", 260000, 90),
  row("1971 Ferrari 365 GT 2+2", 120000, 40), row("1971 Ferrari 365 GT 2+2", 110000, 80), row("1971 Ferrari 365 GT 2+2", 130000, 110)
];
const spec = { make: "Ferrari", model: "365", year: 1971, subject: "365" };
const chosen = { rows, step: "model", windowLabel: "last five years" };
const bare = ob.buildResult(chosen, {}, iso, spec, null);
ok(bare.tier === "refusal" && bare.refusal && bare.refusal.kind === "varied", `the seeded pool refuses as too spread out (${bare.tier}, ${bare.refusal && bare.refusal.kind})`);
ok(Array.isArray(bare._solidForChips) && !Object.keys(bare).includes("_solidForChips"), "the refusal carries its solid rows for the chips, hidden from the wire");
ok(!JSON.stringify(bare).includes("_solidForChips"), "the hidden field never serialises");
const tg = ob.trimGroupsFromSales(bare._solidForChips, spec);
const oldSrc = (ob.trimGroupsFromSales(bare.rawPool, spec).named.find(g => g.value === "gtb4") || {}).n, newSrc = (tg.named.find(g => g.value === "gtb4") || {}).n;
ok(oldSrc > newSrc, `the case is real: the refusal's rows count GTB4 ${oldSrc}, its solid rows ${newSrc} (the old chip said ${oldSrc}, its page opened ${newSrc})`);
for (const g of tg.named) {
  const page = ob.buildResult(chosen, {}, iso, spec, { trim: g.value });
  const n = Array.isArray(page.cards) ? page.cards.length : 0;
  ok(n === g.n, `chip ${g.label} (${g.n}) opens ${n} sales`);
}
console.log(bad ? `trimChipRefusalCheck: ${bad} failed` : "trimChipRefusalCheck: all passed");
process.exit(bad ? 1 : 0);
