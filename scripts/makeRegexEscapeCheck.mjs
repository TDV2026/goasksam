// makeRegexEscapeCheck (Lane B, Oct 21 2026, Lane S's CodeQL triage of lib/vehicle.js, the make-before-number test): offline, no
// network. The inline escape the fix replaced closed its character class early and never matched anything, so a make reached
// the pattern raw. The fix uses escapeRegExp. PROOF THAT NOTHING MOVES: for every make the curated data names, the pattern
// string the fix builds is the SAME string as before unless the make holds a pattern character; and a make with one (A.C.,
// a make in brackets) now resolves without a thrown SyntaxError and matches itself literally.
globalThis.fetch = async () => { throw new Error("blocked"); };
delete process.env.SUPABASE_URL; delete process.env.SUPABASE_SERVICE_ROLE_KEY;
const vd = await import("../lib/vehicleData.js");
const { resolveVehicle } = await import("../lib/vehicle.js");
let bad = 0;
const ok = (c, m) => { console.log((c ? "ok   " : "FAIL ") + m); if (!c) bad++; };
const OLD = s => String(s).replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&");          // the replaced inline escape, verbatim
const NEW = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");             // escapeRegExp (lib/vehicle.js)
const makes = new Set();
const add = x => { if (typeof x === "string" && x.trim()) makes.add(x.trim()); };
for (const a of vd.MAKE_ALIASES || []) { add(a.make); add(a.canonical); add(a.to); }
for (const a of vd.PREWAR_MAKE_ALIASES || []) { add(a.make); add(a.canonical); add(a.to); }
for (const m of [...(vd.EXTRA_MAKES || []), ...(vd.PREWAR_MAKES || [])]) add(typeof m === "string" ? m : (m && m.make));
for (const r of vd.MODEL_OWNERSHIP || []) add(r.make);
for (const k of Object.keys(vd.CURATED_MODELS || {})) add(k);
for (const k of Object.keys(vd.SINGLE_MODEL_MAKES || {})) add(k);
const META = /[.*+?^${}()|[\]\\]/;
const plain = [...makes].filter(m => !META.test(m)), withMeta = [...makes].filter(m => META.test(m));
ok(makes.size > 50, `the curated data names ${makes.size} makes`);
ok(plain.every(m => OLD(m) === NEW(m)), `for the ${plain.length} makes with no pattern character the pattern string is unchanged`);
ok(["1972", "2002", "'67", "1969-70"].every(y => OLD(y) === NEW(y) || META.test(y)), "a year token's pattern is unchanged");
console.log(`     makes with a pattern character (the only ones the fix changes): ${withMeta.join(", ") || "none"}`);
ok(OLD("A.C.") === "A.C." && NEW("A.C.") === "A\\.C\\.", "the old escape left A.C. raw; escapeRegExp escapes it");
ok(new RegExp(NEW("A.C."), "i").test("1965 A.C. Cobra") && !new RegExp(NEW("A.C."), "i").test("1965 AxCx Cobra"), "escaped, A.C. matches itself literally and never a look-alike (AxCx); the raw pattern matched AxCx");
ok(new RegExp(OLD("A.C."), "i").test("1965 AxCx Cobra"), "(the raw pattern did match the look-alike: the bug)");
let threw = null;
try { new RegExp("\\b" + NEW("Make (1)") + "\\b", "i"); } catch (e) { threw = e; }
ok(!threw, "a make with a bracket compiles (the raw one would throw a SyntaxError)");
for (const t of ["1965 A.C. Cobra", "1972 BMW 2002", "BMW 2002", "2002 BMW M3", "Porsche 356 1959"]) {
  let r = null, err = null; try { r = await resolveVehicle(t, {}); } catch (e) { err = e; }
  ok(!err && r && r.status, `"${t}" resolves without a throw (${err ? err.message : r.status})`);
}
console.log(bad ? `makeRegexEscapeCheck: ${bad} failed` : "makeRegexEscapeCheck: all passed");
process.exit(bad ? 1 : 0);
