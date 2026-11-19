// LEARN WHICH VIN PREFIXES CARRY WHICH TRIM, FROM THE ARCHIVE (Lane B, Nov 3 2026, lane-b-vinpool). READ-ONLY, WRITES NOTHING, APPLIES NOTHING: it prints a table, make by make, of every VIN position 4 to 8 prefix with the sales behind it, whether all those
// sales carry one trim (SINGLE), one trim family (FAMILY) or several (SPLIT). A person reads it and adds the rows he confirms to lib/vinTrimCodes.js; the 997 AA/AB rule stays the only live one until then.
//   node scripts/learnVinTrimCodes.mjs [--make=Porsche] [--model=911] [--from=4] [--to=8] [--min=3] [--max=200000] [--only=split|family|single]
// Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. It pages sales_archive by 1000 rows a request (one at a time, a pause between), so it is ONE heavy read: run it alone (Sam's rule: three heavy reads at most). --max stops it early.
import { learnTable, printTable } from "../lib/vinTrimLearn.js";
const arg = (k, d) => { const a = process.argv.find(x => x.startsWith("--" + k + "=")); return a ? a.slice(k.length + 3) : d; };
const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error("SKIPPED: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set; nothing was read."); process.exit(2); }
const from = Number(arg("from", 4)), to = Number(arg("to", 8)), min = Number(arg("min", 3)), max = Number(arg("max", 200000)), only = arg("only", ""), make = arg("make", ""), model = arg("model", "");
const filt = (make ? "&make=ilike." + encodeURIComponent(make) : "") + (model ? "&model=ilike." + encodeURIComponent(model) : "");
const rows = []; let off = 0;
while (rows.length < max) {
  const r = await fetch(`${url}/rest/v1/sales_archive?select=make,model,year,vin_norm,listing_title&vin_norm=not.is.null${filt}&order=id.asc`, { headers: { apikey: key, Authorization: `Bearer ${key}`, Range: `${off}-${off + 999}`, "Range-Unit": "items" } });
  if (!r.ok) { console.error(`FAILED at row ${off}: ${r.status} ${(await r.text()).slice(0, 160)}`); process.exit(1); }
  const j = await r.json(); if (!Array.isArray(j) || !j.length) break;
  rows.push(...j); off += j.length; if (j.length < 1000) break;
  await new Promise(res => setTimeout(res, 120));
}
let t = learnTable(rows, { from, to, min }); if (only) t = t.filter(x => x.kind === only);
console.log(`learnVinTrimCodes: read ${rows.length} sales with a VIN; ${t.length} prefixes with ${min}+ sales${only ? " (" + only + " only)" : ""}. NOTHING APPLIED.`);
console.log(printTable(t, { from, to }));
const c = k => t.filter(x => x.kind === k).length;
console.log(`\nsummary: single ${c("single")}, family ${c("family")}, split ${c("split")}, untrimmed ${c("untrimmed")}`);
