// modelCrossMakeCheck (Lane B, Oct 21 2026, Sam's Buy 1f "550 Maranello (1)" chip among the Porsche model chips): offline, no
// network. A live listing's resolved model never crosses makes: "Beck 550 Spyder" filed under Porsche resolves to Porsche (the
// title-only read said Ferrari 550 Maranello), listings that already resolve inside their make are untouched, and across a Porsche
// list no chip belongs to another make.
globalThis.fetch = async () => { throw new Error("blocked"); };
delete process.env.SUPABASE_URL; delete process.env.SUPABASE_SERVICE_ROLE_KEY;
const { specOf } = await import("../lib/live/search.js");
let bad = 0;
const ok = (c, m) => { console.log((c ? "ok   " : "FAIL ") + m); if (!c) bad++; };
const row = (title, make, model, year) => ({ listing_title: title, make, model, year });
const rows = [
  row("Beck 550 Spyder", "Porsche", "550 Spyder", 1955), row("1955 Porsche 550 Spyder", "Porsche", "550 Spyder", 1955),
  row("2019 Porsche 911 Carrera S", "Porsche", "911", 2019), row("1973 Porsche 911 T", "Porsche", "911", 1973), row("1985 Porsche 944", "Porsche", "944", 1985),
  row("1965 Porsche 356C", "Porsche", "356", 1965), row("2005 Porsche Cayenne S", "Porsche", "Cayenne", 2005), row("1987 Porsche 959", "Porsche", "959", 1987)
];
const out = [];
for (const r of rows) { const sp = await specOf({}, r, {}); out.push({ r, make: sp && sp.v && sp.v.make, model: sp && sp.v && (sp.v.parentModel || sp.v.model) }); }
for (const o of out) console.log(`     ${o.r.listing_title} -> ${o.make} ${o.model}`);
ok(out[0].make === "Porsche", `"Beck 550 Spyder" (listed under Porsche) resolves to Porsche, not Ferrari (${out[0].make} ${out[0].model})`);
ok(out.every(o => !o.make || /^porsche$/i.test(o.make)), "across the Porsche list no resolved make is another maker's, so no chip crosses makes (a listing the offline resolver cannot read, the 356C and the 959, makes no chip at all, as on main)");
ok(!out.some(o => /maranello/i.test(String(o.model || ""))), "no Porsche chip reads Maranello");
ok(out[1].make === "Porsche" && /550/.test(out[1].model || ""), "a title that names Porsche still resolves as before");
const mb = await specOf({}, row("1998 Mercedes-Benz SL500", "Mercedes", "SL-Class", 1998), {});
ok(mb && mb.v && /mercedes/i.test(mb.v.make || ""), "a spelling variant of the make (Mercedes / Mercedes-Benz) never counts as crossing makes");
console.log(bad ? `modelCrossMakeCheck: ${bad} failed` : "modelCrossMakeCheck: all passed");
process.exit(bad ? 1 : 0);
