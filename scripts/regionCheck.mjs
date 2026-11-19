// FUNCTION REGION (Lane C, Oct 26 2026): the database is in Dublin (eu-west-1), so the functions run in Dublin (dub1): one database call is a few
// milliseconds there and about 0.12 s from Washington. One region for every function; no route is pinned elsewhere (nothing calls a vendor with a region rule).
// Offline.  node scripts/regionCheck.mjs
import fs from "node:fs";
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const cfg = JSON.parse(fs.readFileSync(new URL("../vercel.json", import.meta.url), "utf8"));
ok(Array.isArray(cfg.regions) && cfg.regions.length === 1 && cfg.regions[0] === "dub1", "vercel.json pins the functions to dub1, the Vercel region next to the database");
ok(!Object.values(cfg.functions || {}).some(f => f && f.regions), "no function is pinned to another region");
console.log(`regionCheck: ${pass} pass, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
