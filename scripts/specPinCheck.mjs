// A FAILED SPEC RESOLUTION IS NEVER PINNED (Lane B, Nov 5 2026, nightly #132 item 4: for the 1970 Datsun 240Z "Buy/Tasks failed to resolve this spec while resolveVehicle did").
// Cause (two memos that kept a miss for the life of the process): (a) specOf (lib/live/search.js) stored its result, null included, under a key of title, year, body and gearbox only. A call
// that already HELD a resolved vehicle (familyMarket, Tasks) was answered with whatever an earlier call for the same words had stored, a miss included, and a call with a different
// resolved vehicle got the first one's spec. (b) archiveResolveToken (lib/onebox.js) stored "no clear make" in _tokCache for good, so a phrase the archive could not place at the
// first look (fewer than five titles then) stayed unplaced after the archive grew. Every product that resolves a title through specOf is affected: Buy, Tasks, Find cards, watches, the
// landing example, samChat; every typed phrase that goes through archiveResolveToken (Market Check, Sell, Buy). Fix: lib/_negCache.js (a found value is kept, a miss for one minute / ten
// minutes), the resolved vehicle in specOf's key (vehicleFingerprint).
//   node scripts/specPinCheck.mjs [repo root]    --mutants proves each rule by breaking it in a copy of the tree
import path from "node:path"; import fs from "node:fs"; import os from "node:os"; import { fileURLToPath, pathToFileURL } from "node:url"; import { spawnSync } from "node:child_process";
const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2), rootArg = args.find(a => !a.startsWith("--"));
const root = path.resolve(rootArg || path.join(here, ".."));
if (args.includes("--mutants")) {
  const muts = [
    ["a miss is kept for good again (specOf)", "lib/_negCache.js", s => s.replace("if (now() - e.at < ttlMs) return { hit: true, value: null };", "return { hit: true, value: null };"), /\(1\)|\(2\)/],
    ["the resolved vehicle is out of specOf's key", "lib/live/search.js", s => s.replace(' + "|" + vehicleFingerprint(resolvedVehicle);', ";"), /\(3\)|\(4\)/],
    ["fingerprint ignores the model", "lib/_negCache.js", s => s.replace("[v.make, v.model, v.parentModel", "[v.make, v.parentModel"), /\(4\)/],
    ["a not-found phrase is kept for good (archiveResolveToken)", "lib/onebox.js", s => s.replace("makeNegCache({ ttlMs: 10 * 60000, max: 2000 })", "makeNegCache({ ttlMs: 1e15, max: 2000 })"), /\(5\)/],
    ["a pending lane is worded as a failed resolve", "scripts/crossProductCheck.js", s => s.replace("const pending = failing.filter(([, l]) => /^pending\\b/", "const pending = failing.filter(([, l]) => /^NEVERpending\\b/"), /\(6\)/],
    ["a found value expires too", "lib/_negCache.js", s => s.replace("if (e.value != null) return { hit: true, value: e.value };", ""), /\(1\)/]
  ];
  let survivors = 0;
  for (const [name, file, f, want] of muts) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "specpin-")); 
    spawnSync("rsync", ["-a", "--exclude", ".git", "--exclude", "node_modules", "--exclude", "proofs", root + "/", dir + "/"]);
    fs.symlinkSync(path.join(root, "node_modules"), path.join(dir, "node_modules"));
    const fp = path.join(dir, file), src = fs.readFileSync(fp, "utf8"), m = f(src);
    if (m === src) { console.log(`MUTANT NOT APPLIED  ${name}`); survivors++; continue; }
    fs.writeFileSync(fp, m);
    const r = spawnSync(process.execPath, [path.join(dir, "scripts/specPinCheck.mjs"), dir], { encoding: "utf8" });
    const out = (r.stdout || "") + (r.stderr || ""), killed = r.status !== 0 && out.split("\n").some(l => /^FAIL/.test(l) && want.test(l));
    console.log(`${killed ? "killed  " : "SURVIVED"}  ${name}`); if (!killed) { survivors++; console.log(out.split("\n").filter(l => /^FAIL|rror/.test(l)).slice(0, 3).join("\n")); }
    fs.rmSync(dir, { recursive: true, force: true });
  }
  console.log(survivors ? `\n${survivors} mutant(s) survived` : "\nall mutants killed"); process.exit(survivors ? 1 : 0);
}
process.chdir(root);
process.env.SUPABASE_URL = "https://fake.supabase.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "k";
globalThis.fetch = async () => new Response("[]", { status: 200 });
let failed = 0; const ok = (n, c, d) => { if (!c) failed++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`); };
const imp = f => import(pathToFileURL(path.join(root, f)).href);
const { makeNegCache, vehicleFingerprint } = await imp("lib/_negCache.js");
// (1) the memo: a found value stays, a miss expires
{ let t = 1000; const c = makeNegCache({ ttlMs: 60000, now: () => t });
  c.set("a", { v: 1 }); c.set("b", null);
  t += 59000; const early = c.get("b"), foundEarly = c.get("a");
  t += 2000; const late = c.get("b"), foundLate = c.get("a");
  ok("(1) a miss is answered as a miss inside its minute", early.hit === true && early.value === null);
  ok("(1) a miss is gone after its minute, so it is looked up again", late.hit === false);
  ok("(1) a found value is kept past the minute", foundEarly.hit && foundLate.hit && foundLate.value.v === 1); }
// (2) the memo survives a re-set: a later hit replaces the earlier miss at once
{ let t = 0; const c = makeNegCache({ ttlMs: 60000, now: () => t }); c.set("k", null); c.set("k", { v: 2 });
  ok("(2) a later find replaces an earlier miss for the same key at once", c.get("k").value && c.get("k").value.v === 2); }
// (3) specOf, the real function: a miss for the words must not answer a call that holds a resolved vehicle (the 240Z shape)
const S = await imp("lib/live/search.js");
const row = { listing_title: "1970 Datsun 240Z", year: 1970, make: "Datsun", model: "240Z" };
const rv = { make: "Datsun", model: "240Z", year: 1970 };
const withRv = await S.specOf({}, { ...row, listing_title: "1970 zzqxw 240Z" }, {}, rv);
const miss1 = await S.specOf({}, { ...row, listing_title: "Qqzx Wvv" }, {}, null);
const afterMiss = await S.specOf({}, { ...row, listing_title: "Qqzx Wvv" }, {}, rv);
ok("(3) the same words, first with no resolved vehicle (a miss), then with one: the second is a spec, not the pinned miss", miss1 === null && afterMiss && afterMiss.v && /240/.test(String(afterMiss.v.model)), JSON.stringify({ miss1, got: afterMiss && afterMiss.v && afterMiss.v.model }));
ok("(3) a call that holds a resolved vehicle gets a spec for that vehicle", withRv && withRv.v && /240/.test(String(withRv.v.model)));
// (4) two different resolved vehicles for the same words are two specs
const a = await S.specOf({}, { ...row, listing_title: "Same words here" }, {}, { make: "Datsun", model: "240Z", year: 1970 });
const b = await S.specOf({}, { ...row, listing_title: "Same words here" }, {}, { make: "Datsun", model: "280Z", year: 1975 });
ok("(4) the same words with two resolved vehicles give two specs, never the first one's", a && b && String(a.v.model) !== String(b.v.model), JSON.stringify({ a: a && a.v.model, b: b && b.v.model }));
ok("(4) the fingerprint separates make, model, trim, year and body", new Set([{ make: "A", model: "B" }, { make: "A", model: "C" }, { make: "A", model: "B", trim: "T" }, { make: "A", model: "B", year: 1970 }, { make: "A", model: "B", bodyStyle: "coupe" }].map(vehicleFingerprint)).size === 5);
// (5) archiveResolveToken: a placed phrase is kept, an unplaced one is looked up again after its ten minutes
const O = await imp("lib/onebox.js");
{ let reads = 0, hits = 0;
  globalThis.fetch = async () => { reads++; return new Response(JSON.stringify(hits ? Array.from({ length: 8 }, (_, i) => ({ make: "Foomaker", model: "Bar", listing_title: `${i} Foomaker Bar Wibblewobble` })) : []), { status: 200 }); };
  const env = { supabaseUrl: "https://fake.supabase.test", supabaseKey: "k" };
  const r0 = await O.archiveResolveToken(["Wibblewobble"], env, []); const readsAfterFirst = reads;
  await O.archiveResolveToken(["Wibblewobble"], env, []);
  ok("(5) an unplaced phrase is not looked up twice inside the window", r0 === null && reads === readsAfterFirst, `reads ${reads}`);
  const realNow = Date.now; Date.now = () => realNow() + 11 * 60000; hits = 1;
  let r2; try { r2 = await O.archiveResolveToken(["Wibblewobble"], env, []); } finally { Date.now = realNow; }
  ok("(5) after ten minutes the phrase is looked up again and the archive that grew now places it", r2 && r2.make === "Foomaker", JSON.stringify(r2)); }
// (6) the reason printed for a failing Buy/Tasks lane is the lane's own: a cold stored row is not worded as a failed resolve
{ const X = await imp("scripts/crossProductCheck.js");
  const row = { compare: [] }, okL = { ok: true }, pend = { ok: false, reason: "pending (spec_market_cache miss, engine call in flight)" }, unres = { ok: false, reason: "no spec (vehicle did not resolve to a buildable spec)" };
  const p1 = X.diagnoseReasons(row, { marketCheck: okL, sell: okL, buy: pend, tasks: okL }).join(" ");
  ok("(6) a pending Buy lane is named a cold stored row, not a failed resolve (the 1985 Ferrari 308 GTS Spider reading)", /COLD STORED ROW/.test(p1) && !/did not resolve/.test(p1), p1.slice(0, 120));
  const p2 = X.diagnoseReasons(row, { marketCheck: okL, sell: okL, buy: okL, tasks: unres }).join(" ");
  ok("(6) a lane that really did not resolve keeps the resolver sentence", /did not resolve this spec/.test(p2) && !/COLD STORED ROW/.test(p2));
  const p3 = X.diagnoseReasons(row, { marketCheck: okL, sell: okL, buy: { ok: false, reason: "boom" }, tasks: okL }).join(" ");
  ok("(6) any other failure prints the lane's own reason", /Buy reported: boom/.test(p3)); }
console.log(failed ? `\nspecPinCheck: ${failed} FAILED` : "\nspecPinCheck: all passed");
process.exit(failed ? 1 : 0);
