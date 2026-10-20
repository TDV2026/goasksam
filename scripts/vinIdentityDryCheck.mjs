// vinIdentityDryCheck (Lane B, Oct 20 2026): offline check of the read-only ops task=vinidentitydry. Without the ops key the
// request is refused (401); with the key and no database env it reaches the task and stops before any read (500, "Supabase
// env not set."). No network, no database.
process.env.PROBE_KEY = "local-check-key"; process.env.OLDCARSDATA_API_KEY = "unused-local-check";   // the ops handler checks it is set; nothing here calls OldCarsData
delete process.env.SUPABASE_URL; delete process.env.SUPABASE_SERVICE_ROLE_KEY; delete process.env.SUPABASE_ANON_KEY;
const { default: handler } = await import("../api/usageDashboard.js");
const call = async headers => {
  let code = 200, body = null;
  const res = { statusCode: 200, setHeader() {}, getHeader() {}, status(c) { code = c; return this; }, json(o) { body = o; return this; }, send(o) { body = o; return this; }, end() { return this; } };
  await handler({ method: "GET", url: "/api/usageDashboard?view=ops&task=vinidentitydry", query: { view: "ops", task: "vinidentitydry" }, headers }, res);
  return { code, body };
};
let bad = 0;
const a = await call({});
if (a.code !== 401) { bad++; console.log("FAIL no key:", a.code, JSON.stringify(a.body).slice(0, 120)); } else console.log("ok   no key -> 401");
const b = await call({ "x-ops-key": "local-check-key" });
if (!(b.code === 500 && /Supabase env not set/.test(JSON.stringify(b.body)))) { bad++; console.log("FAIL with key:", b.code, JSON.stringify(b.body).slice(0, 160)); } else console.log("ok   with key, no database -> stops at the env check before any read");
// decode first (Lane F, Oct 20 2026): the decoded model wins when it is in the title; the stored model only without a decode
const fs = await import("fs");
const src = fs.readFileSync(new URL("../api/usageDashboard.js", import.meta.url), "utf8");
const blk = src.slice(src.indexOf('if (task === "vinidentitydry")'), src.indexOf('if (task === "projdry")'));
const okD = /decodeIdentityFix\(v, title, dv\)/.test(blk) && /resolveVehicle\(vin, \{ vinConfirm: true \}\)/.test(blk) && !/basis = "stored"/.test(blk);
if (!okD) { bad++; console.log("FAIL decode-first rule not found in the task"); } else console.log("ok   the dry run runs the rule itself: decodeIdentityFix on the VIN decoded as carIdentity decodes it (no stored-model fallback)");
// the exact count (Oct 20 2026): the dry run uses the rule's own prefilter (otherModelsNamed), never the stored model column,
// and a slice that stops early points nextOffset at the first VIN it did not read, so no VIN is skipped
const okP = /const others = await otherModelsNamed\(v\.make, v\.model, title\)/.test(blk) && !/list\.map\(a => a\.model\)/.test(blk) && /nextOffset: off \+ done/.test(blk);
if (!okP) { bad++; console.log("FAIL the rule's own prefilter and the no-skip offset"); } else console.log("ok   the rule's own prefilter (no stored column) and a no-skip offset");
console.log(bad ? `vinIdentityDryCheck: ${bad} failed` : "vinIdentityDryCheck: 4 passed, 0 failed");
process.exit(bad ? 1 : 0);
