// clock: real-ok no calendar date is asserted
// THE CAR TOKEN (Lane B, Nov 17 2026, lib/carToken.js): one resolved car travels between Find, Market Check, Sell, the Tasks composer and the VIN page with no second resolve.
// CAUSE this guards: a user types the same car into Find, then Market Check, then Sell, and each tool resolves it again (a second and third read of the same words, and a chance that the three disagree).
// CLASS: every tool's entry point reads ?car=<token> (or body.car as a token string); a token that decodes IS the car (the resolver is asked zero times), a missing or bad token is today's path (the resolver runs); the engine's answer carries car.token so no page encodes anything.
//   node scripts/carTokenCheck.mjs [root]   (a tree without the fix fails: run it against origin/main); --mutants breaks one rule at a time.
import fs from "node:fs"; import os from "node:os"; import path from "node:path"; import { spawnSync } from "node:child_process"; import { fileURLToPath, pathToFileURL } from "node:url";
const args = process.argv.slice(2), here = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.resolve(args.find(a => !a.startsWith("--")) || path.join(here, ".."));
if (args.includes("--mutants")) {
  const CT = "lib/carToken.js", muts = [
    [CT, "parts[2] !== sum(parts[1])", "false", "a tampered token still decodes (the checksum is not read)"],
    [CT, "parts[0] !== TOKEN_VERSION ||", "", "a token of another version decodes"],
    [CT, "if (!f || !valid(f[2], v)) return null; car[f[0]] = v;", "if (!f) return null; car[f[0]] = v;", "a field of the wrong type decodes (a crafted vin or year)"],
    [CT, "if (typeof car.make !== \"string\" || !car.make || typeof car.model !== \"string\" || !car.model) return null;\n    return car;", "return car;", "a token with no make and model decodes to a car"],
    [CT, "out[key] = v; }", "out[key] = v === null ? undefined : v; }", "a null field is lost on the way (not the same object)"],
    ["lib/live/search.js", "if (env && env.car && env.car.make && env.car.model) { const pq = parseQuery(raw);", "if (false) { const pq = parseQuery(raw);", "Find resolves again although the request carries the car"],
    ["lib/live/search.js", "if (env && env.car && env.car.make && env.car.model) return { ...env.car };", "", "Find's one-resolver path ignores the token"],
    ["api/sellerDecision.js", "sanitizeResolvedVehicle(tokenCar || car.vehicle)", "sanitizeResolvedVehicle(car.vehicle)", "Market Check and Sell ignore the token"],
    ["lib/vinAsTyped.js", "const r = deps && deps.car ? { status: \"valid\", vehicle: deps.car } :", "const r =", "the VIN page resolves again although it carries the car"],
    ["api/buySearch.js", "car: carFromRequest(req) }", "car: null }", "Find never reads ?car="],
    ["api/tasks.js", "car: carFromRequest(req) }", "car: null }", "the Tasks composer never reads ?car="],
    ["lib/onebox.js", "const withCarToken = (res, vehicle, env) => {", "const withCarToken = (res, vehicle, env) => { return res;", "the answer carries no car.token"],
    ["lib/carToken.js", "const t = q || b;", "const t = b;", "?car= in the query is not read"]
  ];
  let survivors = 0;
  for (const [file, from, to, want] of muts) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ctc-"));
    spawnSync("rsync", ["-a", "--exclude", ".git", "--exclude", "node_modules", "--exclude", "proofs", ROOT + "/", dir + "/"]); fs.symlinkSync(path.join(ROOT, "node_modules"), path.join(dir, "node_modules"));
    const fp = path.join(dir, file), src = fs.readFileSync(fp, "utf8"), m = src.replace(from, to);
    if (m === src) { console.log(`MUTANT NOT APPLIED  ${want}`); survivors++; fs.rmSync(dir, { recursive: true, force: true }); continue; }
    fs.writeFileSync(fp, m);
    const r = spawnSync(process.execPath, [path.join(dir, "scripts/carTokenCheck.mjs"), dir], { encoding: "utf8" }), killed = r.status !== 0;
    console.log(`${killed ? "killed  " : "SURVIVED"}  ${want}`); if (!killed) survivors++;
    fs.rmSync(dir, { recursive: true, force: true });
  }
  console.log(survivors ? `\n${survivors} mutant(s) survived` : "\nall mutants killed"); process.exit(survivors ? 1 : 0);
}
process.chdir(ROOT);
process.env.SUPABASE_URL = "https://fake.supabase.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "k"; process.env.SUPABASE_ANON_KEY = "k"; process.env.LAUNCH_STAGE = "2"; process.env.OLDCARSDATA_API_KEY = "unused"; process.env.ANTHROPIC_API_KEY = "unused"; process.env.PROBE_KEY = "probe-check";
const imp = f => import(pathToFileURL(path.join(ROOT, f)).href);
let pass = 0, fail = 0; const ok = (n, c, d) => { if (c) pass++; else { fail++; console.log("FAIL " + n + (d !== undefined ? " :: " + JSON.stringify(d) : "")); } };
const CT = await imp("lib/carToken.js"), V = await imp("lib/vehicle.js"), san = V.sanitizeResolvedVehicle;
const defined = o => Object.keys(o).filter(k => o[k] !== undefined).sort().map(k => [k, o[k]]), same = (a, b) => JSON.stringify(defined(a)) === JSON.stringify(defined(b));
// 1. THE TOKEN: 20 fixture cars, encode then decode is identity
const F = [
  { raw: "2003 Mercedes-Benz SL500", year: 2003, make: "Mercedes-Benz", model: "SL-Class", trim: "SL500", mileage: 38400, bodyStyle: "Convertible", vin: "WDBSK75F83F044627", confidence: "high" },
  { raw: "1965 Ford Mustang", year: 1965, make: "Ford", model: "Mustang", mileage: null },
  { raw: "1999 Porsche 911 Carrera", year: 1999, make: "Porsche", model: "911", trim: "Carrera", bodyStyle: "coupe", mileage: 61200, confidence: "high" },
  { raw: "1961 Chevrolet Corvette", year: 1961, make: "Chevrolet", model: "Corvette", chassis: "10867S109963", mileage: 10450, bodyStyle: "convertible", confidence: "medium" },
  { raw: "1957 Chevrolet Bel Air", year: 1957, make: "Chevrolet", model: "Bel Air", chassis: "VC57A123456" },
  { raw: "1961 Jaguar E-Type Series 1", year: 1961, make: "Jaguar", model: "E-Type", edition: "Series 1", chassis: "875123" },
  { raw: "2002 Lexus SC430 62,000 km", year: 2002, make: "Lexus", model: "SC430", mileage: 38500, vin: "JTHFN48Y820012041" },
  { raw: "2005 Honda S2000 89,000 km", year: 2005, make: "Honda", model: "S2000", mileage: 55300 },
  { raw: "2011 Land Cruiser 200 series", year: 2011, make: "Toyota", model: "Land Cruiser", series: "200", variant: "LWB", wheelbase: "LWB" },
  { raw: "1969 Chevrolet Camaro Z/28", year: 1969, make: "Chevrolet", model: "Camaro", trim: "Z/28", modifications: ["headers", "exhaust"] },
  { raw: "1995 BMW M3 E36", year: 1995, make: "BMW", model: "M3", trim: "M3", color: "black", unverified: true },
  { raw: "2018 Ferrari 488 GTB", year: 2018, make: "Ferrari", model: "488", trim: "GTB", trimNumber: "488" },
  { raw: "1989 Mercedes-Benz 560SL", year: 1989, make: "Mercedes-Benz", model: "SL-Class", trim: "560SL", marketSpec: "us", marketSpecLabel: "US spec", marketSpecShort: "US" },
  { raw: "1972 Datsun 240Z", year: 1972, make: "Datsun", model: "240Z", mileage: 74000 },
  { raw: "1957 Chevrolet Corvette Hagerty", year: 1957, make: "Chevrolet", model: "Corvette", yearRange: { start: 1956, end: 1957 } },
  { raw: "2003 Rolls-Royce Phantom by Mulliner", year: 2003, make: "Rolls-Royce", model: "Phantom", coachbuilder: "Mulliner" },
  { raw: "1932 Ford Model B", year: 1932, make: "Ford", model: "Model B" },
  { raw: "1971 Porsche 911T", year: 1971, make: "Porsche", model: "911", trim: "911T", mileage: 0 },
  { raw: "1967 Shelby GT350 Mustang", year: 1967, make: "Ford", model: "Mustang", trim: "GT350", mileage: 43210 },
  { raw: "1994 Toyota Supra manual", year: 1994, make: "Toyota", model: "Supra", mileage: 51000 }
].map(x => san(x));
{ F[0].transmission = "Automatic"; F[0].generation = "R230"; F[2].transmission = "Manual"; F[3].transmission = "Manual"; F[9].generation = "first"; F[19].transmission = "Manual";
  ok("20 fixture cars built by the resolver's own sanitizer", F.length === 20 && F.every(x => x && x.make && x.model));
  const bad = []; for (const [i, car] of F.entries()) { const t = CT.encodeCar(car), d = t ? CT.decodeCar(t) : null; if (!t || !d || !same(d, car) || !/^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{8}$/.test(t) || t.length > 700) bad.push(i + ":" + (t ? t.length : "null")); }
  ok("encode then decode is identity for all 20 cars (chassis cars, no mileage, km stated, transmission, generation, variant), each token url safe and short", bad.length === 0, bad.join(" "));
  const t0 = CT.encodeCar(F[0]); ok("the same car makes the same token (a link is stable)", CT.encodeCar({ ...F[0] }) === t0); }
// 2. A TAMPERED TOKEN DECODES TO NULL
{ const t = CT.encodeCar(F[0]), [v, p, c] = t.split("."), flip = s => s.slice(0, 5) + (s[5] === "A" ? "B" : "A") + s.slice(6);
  const tamper = { "a payload character changed": `${v}.${flip(p)}.${c}`, "the checksum changed": `${v}.${p}.${flip(c)}`, "cut short": t.slice(0, -3), "extended": t + "x", "another version": `v2.${p}.${c}`, "no version": `${p}.${c}`, "empty": "", "a number": 5, "null": null, "an object": { x: 1 }, "an oversize string": "v1." + "A".repeat(4000) + ".AAAAAAAA", "not base64 at all": "v1.!!!!.AAAAAAAA" };
  for (const [name, tok] of Object.entries(tamper)) ok(`tampered (${name}) decodes to null`, CT.decodeCar(tok) === null);
  // a token built with a valid checksum but a crafted payload still only names a car, or nothing
  const zlib = await import("node:zlib"), crypto = await import("node:crypto"), mk = obj => { const pl = Buffer.from(zlib.deflateRawSync(Buffer.from(JSON.stringify(obj)))).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); const cs = crypto.createHash("sha256").update(`v1.${pl}`).digest("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "").slice(0, 8); return `v1.${pl}.${cs}`; };
  ok("a crafted token with a good checksum: a car is a car", CT.decodeCar(mk({ mk: "Porsche", md: "911", y: 1999 })) !== null);
  ok("a crafted token: an unknown key, a bad vin, a text year, a missing model all decode to null", [{ mk: "A", md: "B", zz: 1 }, { mk: "A", md: "B", v: "123" }, { mk: "A", md: "B", y: "1999" }, { mk: "A" }, { mk: "A", md: "B", mi: -5 }, { mk: "A", md: "B", cf: "certain" }].every(o => CT.decodeCar(mk(o)) === null)); }
// 3. THE ENGINE'S ANSWER CARRIES car.token (oneEngineAnswer's wrapper), and the five entry points
const SL = F[0], TOKEN = CT.encodeCar(SL);
{ const OB = await imp("lib/onebox.js"); ok("the engine builds the token of the car it ran on (carTokenOf), a token that decodes to that car", typeof OB.carTokenOf === "function" && (() => { const d = CT.decodeCar(OB.carTokenOf(SL, { desk: { subject: { transmission: "Automatic" } } })); return d && d.make === "Mercedes-Benz" && d.vin === "WDBSK75F83F044627" && d.mileage === 38400 && d.transmission === "Automatic"; })());
  const ob = fs.readFileSync("lib/onebox.js", "utf8"); ok("oneEngineAnswer puts car.token on every answer it returns", /return withCarToken\(res, vehicle, env\);/.test(ob) && /return withCarToken\(result, vehicle, env\);/.test(ob));
  const SR = fs.readFileSync("lib/sheetRead.js", "utf8"); ok("the Desk read serves car.token", /car: \{ token: \(a\.car && a\.car\.token\) \|\| null,/.test(SR)); }
const realFetch = globalThis.fetch; globalThis.fetch = async () => new Response("[]", { status: 200 });
const calls = async fn => { const b = V.resolverStats.calls; let out, err = null; try { out = await fn(); } catch (e) { err = e; } return { n: V.resolverStats.calls - b, out, err }; };
const isSL = v => !!v && v.make === "Mercedes-Benz" && v.model === "SL-Class" && v.trim === "SL500" && v.vin === "WDBSK75F83F044627";
{ // FIND
  const S = await imp("lib/live/search.js");
  const withTok = await calls(() => S.parseQueryResolved("2003 mercedes sl500", { car: CT.decodeCar(TOKEN) })), without = await calls(() => S.parseQueryResolved("2003 mercedes sl500", {}));
  ok("FIND given the token: runs on the SL500 (VIN, 38,400 miles), the resolver is asked 0 times", isSL(withTok.out && withTok.out.vehicle) && withTok.out.vehicle.mileage === 38400 && withTok.n === 0, JSON.stringify([withTok.n, withTok.err && String(withTok.err).slice(0, 80)]));
  ok("FIND without the token: the resolver runs once", without.n === 1, without.n);
  const rb = await calls(() => S.resolveForBuy("sl500", { car: CT.decodeCar(TOKEN) })); ok("FIND's one-resolver path (resolveForBuy) given the token asks 0 times", isSL(rb.out) && rb.n === 0, rb.n); }
{ // TASKS COMPOSER (emailPreview and the typed filters read the same resolver)
  const T = await imp("lib/tasks/tasks.js");
  const withTok = await calls(() => T.emailPreview({ ...{ supabaseUrl: "https://fake.supabase.test", supabaseKey: "k" }, car: CT.decodeCar(TOKEN) }, "2003 mercedes sl500")), without = await calls(() => T.emailPreview({ supabaseUrl: "https://fake.supabase.test", supabaseKey: "k" }, "2003 mercedes sl500"));
  const f = withTok.out && (withTok.out.filters || withTok.out.job || withTok.out);
  ok("TASKS COMPOSER given the token: the filters are the SL500's, the resolver is asked 0 times", withTok.n === 0 && /sl-?class|sl/i.test(JSON.stringify(f || {})) && /mercedes/i.test(JSON.stringify(f || {})), JSON.stringify([withTok.n, withTok.err && String(withTok.err).slice(0, 100), JSON.stringify(f || {}).slice(0, 120)]));
  ok("TASKS COMPOSER without the token: the resolver runs (emailPreview reads the typed words through it, and the setup question once more: 2)", without.n >= 1, without.n); }
{ // MARKET CHECK and SELL: api/sellerDecision (ladderPreview answers the vehicle the engine would run on, no fetch, no write)
  const H = (await imp("api/sellerDecision.js")).default, run = async (body, query) => { let out = null; const res = { status(c) { this.code = c; return this; }, json(b) { out = b; return this; }, setHeader() {}, end() {}, getHeader() {} }; await H({ method: "POST", headers: { origin: "https://goasksam.com", cookie: "" }, query: query || {}, body, socket: { remoteAddress: "1.1.1.1" } }, res); return out; };
  for (const [name, extra] of [["MARKET CHECK", { oneBox: true }], ["SELL", {}]]) {
    const withTok = await calls(() => run({ ladderPreview: true, ...extra }, { car: TOKEN })), without = await calls(() => run({ ladderPreview: true, search: "2003 Mercedes SL500", ...extra }, {}));
    const v = withTok.out && (withTok.out.vehicle || CT.decodeCar(withTok.out.car && withTok.out.car.token));   // Sell's ladder preview names the vehicle; Market Check's answer carries car.token of the car it ran on
    ok(`${name} given the token (?car=): runs on the SL500, the resolver is asked 0 times`, isSL(v) && withTok.n === 0, JSON.stringify([withTok.n, withTok.err && String(withTok.err).slice(0, 100), withTok.out && (withTok.out.status || withTok.out.error)]));
    ok(`${name} without the token: the resolver runs once`, without.n === 1, JSON.stringify([without.n, without.err && String(without.err).slice(0, 100), without.out && (without.out.status || without.out.error)])); } }
{ // VIN PAGE (the VIN step: vinSearchPlan)
  const VA = await imp("lib/vinAsTyped.js"), fromVin = { year: 2003, make: "Mercedes-Benz", model: "SL-Class", trim: null, bodyStyle: "convertible", vin: "WDBSK75F83F044627" };
  const n = { c: 0 }, deps = extra => ({ resolveVehicle: async () => { n.c++; return { status: "valid", vehicle: { ...SL } }; }, archive: null, live: null, liveMatch: null, ...extra });
  const withTok = await calls(() => VA.vinSearchPlan(fromVin, deps({ car: CT.decodeCar(TOKEN) }))), c1 = n.c; n.c = 0;
  const without = await calls(() => VA.vinSearchPlan(fromVin, deps({}))), c2 = n.c;
  ok("VIN PAGE given the token: the plan's car is the SL500, the resolver is asked 0 times", isSL(withTok.out && withTok.out.vehicle) && c1 === 0, JSON.stringify([c1, withTok.err && String(withTok.err).slice(0, 80)]));
  ok("VIN PAGE without the token: the resolver runs once", c2 === 1, c2);
  const SRd = await imp("lib/sheetRead.js"), c = { n: 0 }, dd = { resolveVehicle: async () => { c.n++; return { status: "valid", vehicle: { ...SL } }; }, decodeVin: async () => ({ readable: true, year: 2003, make: "Mercedes-Benz", model: "SL-Class", trim: null, bodyStyle: "convertible" }), archiveMatch: async () => null, liveMatch: async () => null, vinPlan: VA.vinSearchPlan, carTier: null };
  let plan = null; try { await SRd.sheetRead({ supabaseUrl: "https://fake.supabase.test", supabaseKey: "k" }, { vin: "WDBSK75F83F044627", mileage: 38400, car: TOKEN, desk: { caseDate: "2026-11-14", transmission: "Automatic", label: "x", case: { verification: {} }, exclusions: [], head: async () => ({ status: 200, bytes: 5e4, type: "image/jpeg" }) } }, dd); } catch { }
  ok("the Desk's VIN read given the token: its plan never calls the resolver", c.n === 0, c.n); }
globalThis.fetch = realFetch;
// the Find and Tasks handlers hand the decoded car to their engine through a COPY of env (never the shared one); checked in the source because their handlers need a database to run
{ for (const [name, f] of [["FIND (api/buySearch.js)", "api/buySearch.js"], ["TASKS COMPOSER (api/tasks.js)", "api/tasks.js"]]) { const src = fs.readFileSync(f, "utf8"); ok(`${name} reads ?car= into a per-request copy of env`, /env = env0 \? \{ \.\.\.env0, car: carFromRequest\(req\) \} : env0;/.test(src) && /import \{ carFromRequest \} from "\.\.\/lib\/carToken\.js";/.test(src)); } }
// 4. NO PAGE ENCODES OR DECODES A TOKEN
{ const bad = []; for (const f of ["public/js/onebox.js", "public/js/entry.js", "public/js/result.js", "public/js/wizard.js", "public/js/tasks.js", "public/desk.html"]) { let s = ""; try { s = fs.readFileSync(f, "utf8"); } catch { continue; } if (/encodeCar|decodeCar|deflateRaw|btoa\(.*vehicle/.test(s)) bad.push(f); }
  ok("no page file encodes or decodes a car token (the engine's car.token is printed as sent)", !bad.length, bad.join(" ")); }
console.log(`carTokenCheck: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
