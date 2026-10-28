// e98: an identity missing make or model, or (a listing's identity) year, is never answered: tier refusal, reason not_a_car, nothing stored.
//   node scripts/notACarCheck.mjs [repo root]
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
const root = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
const E = await import(pathToFileURL(path.join(root, "lib/onebox.js")).href);
let failed = 0; const ok = (n, c, d) => { if (!c) failed++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`); };
globalThis.fetch = async () => new Response("[]", { status: 200 });
const env = { supabaseUrl: "https://fake.supabase.test", supabaseKey: "k" };
const ask = v => E.oneEngineAnswer(v, null, "x", env, null).catch(e => ({ threw: e.message }));
const refused = a => a && a.raw && a.raw.tier === "refusal" && a.raw.refusal && a.raw.refusal.reason === "not_a_car";
const full = { make: "Porsche", model: "911", trim: "", year: 1987, bodyStyle: null };
// the class: every identity missing any of the three, as a listing reads it (requireYear set by specOf)
for (const miss of ["year", "make", "model"]) {
  const v = { ...full, requireYear: true, [miss]: miss === "year" ? null : "" };
  const a = await ask(v);
  ok(`listing identity with no ${miss}: refused not_a_car`, refused(a), JSON.stringify(a && a.raw && a.raw.refusal));
  ok(`no ${miss}: no range, count or cards`, a && a.raw && !a.raw.cluster && !(a.raw.cards || []).length && a.raw.poolN === 0);
}
ok("Speedline lot (no year, make or model)", refused(await ask({ make: "", model: "", trim: "Speedline", year: null, requireYear: true })));
ok("null vehicle refused", refused(await ask(null)));
// make or model missing is refused even for a typed query
ok("typed query with no model refused", refused(await ask({ make: "Porsche", model: "", trim: "", year: 1987 })));
// a typed nameplate with no year (all years) still answers; a full listing identity is not refused
ok("typed nameplate, no year: not refused", !refused(await ask({ make: "Porsche", model: "911", trim: "", year: null })));
ok("full listing identity: not refused", !refused(await ask({ ...full, requireYear: true })));
process.exit(failed ? 1 : 0);
