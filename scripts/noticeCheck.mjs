// clock: real-ok no calendar date is asserted
// A NUMBER PHRASE THE RESOLVER SET ASIDE IS NEVER REPORTED AS UNUSED (Lane B, lane-b-notice, Nov 17 2026, Lane C's live read: Market Check "2003 Mercedes-Benz SL500 38,400 miles" printed
// "Sam didn't use '2003+mercedes-benz+sl500+38' or '400+miles' in this search."). CAUSE: the page read ?q= with decodeURIComponent, which keeps a plus as a plus; unusedWordsOf split on spaces and commas only;
// the resolver's number phrases read a plus as part of a word ("62,000+km" read as 62,000 MILES, "under+60k" as a 60,000 mileage); and the address the page wrote itself (car=<slug>) turned "38,400" into "38-400",
// read back as a mileage of 400,000. CLASS: the engine's one notice function takes the number phrases out through the same function the resolver uses; the typed words survive the address whole.
// SURFACES: Market Check (the answer's unusedLine: lib/live/unusedWords.js unusedFieldsFor, api/sellerDecision.js), Find / Buy and the Tasks composer (lib/live/search.js parseQueryResolved), Sell (the read of the
// seller's words and unusedFieldsFor), the Sell chat (lib/live/samChat.js reads unusedWordsOf); the Market Check page's address reader and writer (public/js/onebox.js) are run as shipped.
// For every form of resolverMileageCheck, spelled four ways (spaces, plus signs, the old slug, the page's own address round trip): no notice names any part of the number phrase, and a truly unused word is still reported.
//   node scripts/noticeCheck.mjs [repo root]     --mutants breaks one rule at a time (each must fail)
import fs from "node:fs"; import path from "node:path"; import { spawnSync } from "node:child_process"; import { fileURLToPath, pathToFileURL } from "node:url";
const args = process.argv.slice(2), here = path.dirname(fileURLToPath(import.meta.url)), root = path.resolve(args.find(a => !a.startsWith("--")) || path.join(here, ".."));
if (args.includes("--mutants")) process.exit(mutants());
process.chdir(root);
delete process.env.SUPABASE_URL; delete process.env.SUPABASE_SERVICE_ROLE_KEY;
const imp = f => import(pathToFileURL(path.join(root, f)).href);
let pass = 0, fail = 0; const fails = []; const ok = (n, c, d) => { if (c) pass++; else { fail++; fails.push(n + (d !== undefined ? " " + JSON.stringify(d) : "")); } };
const { resolveVehicle } = await imp("lib/vehicle.js");
const UW = await imp("lib/live/unusedWords.js"), T = await imp("lib/tools/_shared.js"), S = await imp("lib/live/search.js"), SF = await imp("lib/sell/sellFacts.js");
// the Market Check page's own address functions, as shipped
const page = fs.readFileSync(path.join(root, "public/js/onebox.js"), "utf8");
const fnSrc = name => { const i = page.indexOf("function " + name + "("); if (i < 0) return null; let d = 0, j = page.indexOf("{", i); for (let k = j; k < page.length; k++) { if (page[k] === "{") d++; else if (page[k] === "}" && --d === 0) return page.slice(i, k + 1); } return null; };
// a tree without the fix has no mcQFromSearch: its page read ?q= with decodeURIComponent and ?car= with hyphens turned to spaces
const deslug = new Function(fnSrc("deslugifyQuery") + "; return deslugifyQuery;")(), qFrom = fnSrc("mcQFromSearch") ? new Function(fnSrc("mcQFromSearch") + "; return mcQFromSearch;")() : (search => { const m = /[?&]q=([^&]*)/.exec(search || ""); return m ? decodeURIComponent(m[1]) : null; });
const written = /else if \(lastQuery\) p\.set\("car", ([^)]*\)?)\);/.exec(page);   // what mcCurrentParams writes for car=
const writeCar = words => { const p = new URLSearchParams(); if (/slugifyQuery/.test(written && written[1])) p.set("car", String(words).toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")); else p.set("car", String(words).trim()); return "?" + p.toString(); };
const NAME = { "2003 Mercedes-Benz SL500": "slclass|sl500", "1999 Porsche Boxster": "boxster|", "2001 BMW M3": "m3|" };
const FORMS = [
  ["2003 Mercedes-Benz SL500 38,400 miles", 38400], ["2003 Mercedes-Benz SL500 38400 mi", 38400], ["2003 Mercedes-Benz SL500 38.4k", 38400], ["2003 Mercedes-Benz SL500 38k miles", 38000], ["2003 Mercedes-Benz SL500 38,400", 38400],
  ["2003 Mercedes-Benz SL500 62,000 km", null], ["2003 Mercedes-Benz SL500 $18,000", null], ["2003 Mercedes-Benz SL500 under 60k", null], ["2003 Mercedes-Benz SL500 38,400 miles $18,000", 38400],
  ["2003 Mercedes-Benz SL500 $18,400", null], ["2003 Mercedes-Benz SL500 around 18,400", null], ["1999 Porsche Boxster budget $45,911", null], ["1999 Porsche Boxster under 45,911", null], ["1999 Porsche Boxster 45,911 miles", 45911],
  ["1999 Porsche Boxster 45,911", 45911], ["2001 BMW M3 62,328 miles", 62328], ["2001 BMW M3 62,328", 62328], ["2001 BMW M3 $62,328", null], ["2003 Mercedes-Benz SL500 $400", null], ["2003 Mercedes-Benz SL500 up to $45k", null]
];
const nameOf = t => Object.keys(NAME).find(k => t.startsWith(k));
const plus = t => t.replace(/ /g, "+");
const spellings = t => [
  ["spaces", t],
  ["plus signs (?q=)", qFrom("?q=" + plus(t).replace(/,/g, ",").replace(/\$/g, "$"))],
  ["the address round trip (?car=)", deslug(new URLSearchParams(writeCar(t)).get("car"))],
  ["the plus string handed to the engine", plus(t)]
];
// a piece of the set aside phrase: any digit, a plus, a dollar sign, a unit word, a bare k
const isPhrasePart = w => /[\d+$]/.test(w) || /^(?:miles?|mi|km|kms|k|under|over|around|budget|up|to)$/i.test(w);
const surfaces = async t => {
  const out = []; const aM = await T.resolveSpec(t); out.push(["Market Check", aM.vehicle, UW.unusedFieldsFor(t, aM.vehicle, {})]);
  const aF = await S.parseQueryResolved(t, {}); out.push(["Find / Buy / Tasks composer", aF.vehicle, { unusedWords: aF.unusedWords, unusedLine: aF.unusedLine }]);
  const aS = await SF.resolveSellCar(t, {}); const sv = aS && aS.car && aS.car.v; out.push(["Sell", sv, UW.unusedFieldsFor(t, sv, {})]);
  const rr = await resolveVehicle(t, {}); const u = UW.unusedWordsOf(t, rr.vehicle, rr.corrections); out.push(["Sell chat (samChat reads unusedWordsOf)", rr.vehicle, u.unused.length ? { unusedWords: u.unused, unusedLine: u.line } : {}]);
  return out;
};
for (const [form, mileage] of FORMS) {
  const car = nameOf(form), want = NAME[car];
  for (const [how, t] of spellings(form)) {
    ok(`address: "${form}" survives ${how} with its words whole`, how === "spaces" || how.startsWith("the plus") || t === form, { got: t });
    for (const [surface, v, f] of await surfaces(t)) {
      const unused = (f && f.unusedWords) || [];
      ok(`${surface}, ${how}: "${form}" names no part of its number phrase as unused`, !unused.some(isPhrasePart), unused);
      ok(`${surface}, ${how}: "${form}" has no notice line at all`, !(f && f.unusedLine) && !unused.length, f);
      ok(`${surface}, ${how}: "${form}" keeps the car ${want}`, `${String(v && v.model).toLowerCase().replace(/[^a-z0-9]/g, "")}|${String(v && v.trim || "").toLowerCase().replace(/[^a-z0-9]/g, "")}` === want, { model: v && v.model, trim: v && v.trim });
      if (surface === "Market Check") ok(`${surface}, ${how}: "${form}" reads the mileage ${mileage}`, mileage == null ? v.mileage == null : Number(v.mileage) === mileage, { mileage: v && v.mileage });
    }
  }
  // a truly unused word is still reported, on every surface and spelling
  const t2 = form + " sunroof";
  for (const [how, t] of spellings(t2)) for (const [surface, , f] of await surfaces(t)) ok(`${surface}, ${how}: "${t2}" still reports the word 'sunroof' and only that`, JSON.stringify((f && f.unusedWords) || []) === '["sunroof"]' && /'sunroof'/.test((f && f.unusedLine) || ""), f);
}
// a distance phrase is a place search, never a mileage and never unused: spaces and plus signs alike
for (const t of ["2003 Mercedes-Benz SL500 within 300 miles of Chicago", "2003+Mercedes-Benz+SL500+within+300+miles+of+Chicago"]) { const r = await resolveVehicle(t, {}); const u = UW.unusedWordsOf(t, r.vehicle, r.corrections, ["Chicago"]); ok(`a distance phrase names nothing unused: "${t}"`, !u.unused.length, u.unused); }
// the address: typed words with a comma, a plus, a dollar sign, k and km are written whole and read back the same
for (const t of ["2003 Mercedes-Benz SL500 38,400 miles", "2003 Mercedes-Benz SL500 $18,000", "2003 Mercedes-Benz SL500 38.4k", "2003 Mercedes-Benz SL500 62,000 km", "1969 Camaro SS+ 350", "2003 Mercedes-Benz SL500 gt-r"])
  ok(`address: "${t}" is written whole and read back whole`, deslug(new URLSearchParams(writeCar(t)).get("car")) === t, { got: deslug(new URLSearchParams(writeCar(t)).get("car")), wrote: writeCar(t) });
ok("address: an old link (a bare slug) is still read: 2003-mercedes-benz-sl500", deslug("2003-mercedes-benz-sl500") === "2003 mercedes benz sl500");
ok("address: an old link with a mileage reads 38,400 and not 400,000", deslug("2003-mercedes-benz-sl500-38-400-miles") === "2003 mercedes benz sl500 38,400 miles", { got: deslug("2003-mercedes-benz-sl500-38-400-miles") });
ok("address: ?q= reads a plus as a space and %2B as a plus", qFrom("?q=a+b%2Bc,d") === "a b+c,d", { got: qFrom("?q=a+b%2Bc,d") });
{ const old = await resolveVehicle(deslug("2003-mercedes-benz-sl500-38-400-miles"), {}); ok("address: the old link's mileage reaches the car as 38400", Number(old.vehicle.mileage) === 38400, { mileage: old.vehicle.mileage }); }
// the engine's notice and the page: the page prints the engine's line, nothing is worded or computed there
ok("the page prints d.unusedLine and words nothing itself", /d && d\.unusedLine \? '<p class="unused-line" role="note">' \+ esc\(d\.unusedLine\)/.test(page) && !/["`']Sam didn.t use/.test(page));
// the resolver: a plus is a space for the number phrases
{ const NP = await imp("lib/numberPhrases.js");
  const a = NP.setAsideNumbers("2003+Mercedes-Benz+SL500+62,000+km"), b = NP.setAsideNumbers("2003+Mercedes-Benz+SL500+under+60k"), c = NP.setAsideNumbers("2003+Mercedes-Benz+SL500+38,400+miles");
  ok("numberPhrases: 62,000+km is kilometres, not miles", a.km === 62000 && a.mileage == null, a); ok("numberPhrases: under+60k is a price, not a mileage", b.mileage == null && /60k/.test(b.price || ""), b); ok("numberPhrases: 38,400+miles is a mileage of 38400", c.mileage === 38400 && !/\d|\+/.test(c.text.replace(/2003|500/g, "")), c); }
// STORED ANSWERS KEYED BY TYPED WORDS: a row written before this fix is never read again (nothing is deleted). Stored questions: lib/live/search.js questionRowKey; stored extractions: api/vehicleIdentity.js (narration_cache key).
{
  const crypto = await import("node:crypto"), SE = await imp("lib/live/search.js"), E = await imp("lib/onebox.js");
  const STORE = new Map(), EPOCH = "2026-10-28T19:34:12.871Z";
  globalThis.fetch = async (url, init) => {
    const u = new URL(String(url));
    if (u.pathname.endsWith("/app_config")) return new Response(JSON.stringify([{ value: EPOCH }]), { status: 200 });
    if (u.pathname.endsWith("/spec_market_cache")) {
      const k = (u.searchParams.get("spec_key") || "").replace(/^eq\./, "");
      if (init && init.method === "POST") { for (const r of JSON.parse(init.body)) STORE.set(r.spec_key, { market: r.market, computed_at: r.computed_at }); return new Response("", { status: 201 }); }
      const r = STORE.get(k); return new Response(JSON.stringify(r ? [{ market: r.market, computed_at: r.computed_at }] : []), { status: 200 });
    }
    return new Response("[]", { status: 200 });
  };
  const env = { supabaseUrl: "https://fake.supabase.test", supabaseKey: "k" };
  const WARM = "MCWARM:fake|spec", TEXT = "2003 Mercedes-Benz SL500 38,400 miles";
  const oldKey = "MCQ:" + WARM.replace(/^MCWARM:/, "") + "|" + crypto.createHash("sha1").update(TEXT.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()).digest("hex").slice(0, 16);   // the key as it was written before this fix
  const question = { tier: "trim_choice", poolN: 40, trimOptions: [{ label: "Carrera", value: "carrera", n: 30 }, { label: "Turbo", value: "turbo", n: 10 }] };
  STORE.set(oldKey, { market: { kind: "question", raw: question, engineVersion: E.ENGINE_VERSION, warmEpoch: EPOCH, warmedAt: new Date().toISOString() }, computed_at: new Date().toISOString() });
  const control = await SE.readQuestionRow(env, oldKey);
  ok("stored question: the pre-fix row is a good row (read under its own key it is served), so only the key keeps it unread", !!control.raw && control.raw.tier === "trim_choice", control.reason);
  const nk = SE.questionRowKey(WARM, TEXT);
  ok("stored question: the key now carries a version and differs from the pre-fix key", nk !== oldKey && /\|n\d+:[0-9a-f]{16}$/.test(nk) && nk.startsWith("MCQ:"), nk);
  const fresh = await SE.readQuestionRow(env, nk);
  ok("stored question: a row written before this fix is never read again", !fresh.raw, fresh.reason);
  ok("stored question: the old row is still there (nothing is deleted)", STORE.has(oldKey));
  await SE.writeQuestionRow(env, nk, question); const back = await SE.readQuestionRow(env, nk);
  ok("stored question: a row written now is read back", !!back.raw && back.raw.tier === "trim_choice", back.reason);
  ok("stored question: the same typed words (spacing and case aside) still reach the same key", SE.questionRowKey(WARM, "  2003 mercedes-benz SL500 38,400 MILES ") === nk);
  const vi = fs.readFileSync(path.join(root, "api/vehicleIdentity.js"), "utf8");
  ok("stored extraction: the narration_cache key carries EXTRACT_KEY_VERSION and the old 'vehx|' key is gone", /const EXTRACT_KEY_VERSION = "vehx\d+";/.test(vi) && /update\(`\$\{EXTRACT_KEY_VERSION\}\|\$\{EXTRACT_MODEL\}\|\$\{text\}`\)/.test(vi) && !/update\(`vehx\|/.test(vi));
  const ver = /const EXTRACT_KEY_VERSION = "(vehx\d+)"/.exec(vi);
  ok("stored extraction: the version is not the pre-fix word 'vehx'", !!ver && ver[1] !== "vehx");
}
{ const ud = fs.readFileSync(path.join(root, "api/usageDashboard.js"), "utf8"), i = ud.indexOf('if (task === "keyedrows")'), body = i < 0 ? "" : ud.slice(i, ud.indexOf("\n  }\n", i));
  ok("ops task keyedrows exists, reads only (no POST, PATCH, DELETE, no OldCarsData) and counts both stored kinds", i >= 0 && !/method:\s*"(POST|PATCH|DELETE|PUT)"|supabaseInsert|supabasePatch|fetchOCD|ocdFetch/.test(body) && /MCQ%3A/.test(body) && /narration_cache/.test(body) && /writes: 0/.test(body)); }
for (const f of fails.slice(0, +(process.env.SHOW || 40))) console.log("FAIL " + f);
if (fails.length > 40) console.log(`... and ${fails.length - 40} more`);
console.log(`noticeCheck: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
function mutants() {
  const me = fileURLToPath(import.meta.url), R = path.resolve(args.find(a => !a.startsWith("--")) || path.join(path.dirname(me), ".."));
  const M = [
    ["the notice does not set number phrases aside", "lib/live/unusedWords.js", s => s.replace("(a => (a.changed ? a.text : String(raw || \"\").replace(/\\+/g, \" \")))(setAsideNumbers(String(raw || \"\")))", "String(raw || \"\")")],
    ["the notice sets number phrases aside but a plus still joins words", "lib/live/unusedWords.js", s => s.replace("(a => (a.changed ? a.text : String(raw || \"\").replace(/\\+/g, \" \")))(setAsideNumbers(String(raw || \"\")))", "(a => (a.changed ? a.text.replace(/ /g, \"+\") : String(raw || \"\")))(setAsideNumbers(String(raw || \"\")))")],
    ["the resolver reads a plus as part of a word", "lib/numberPhrases.js", s => s.replace("const spaced = original.replace(/\\+/g, \" \");", "const spaced = original;")],
    ["the page reads ?q= with decodeURIComponent only", "public/js/onebox.js", s => s.replace("decodeURIComponent(m[1].replace(/\\+/g, \" \"))", "decodeURIComponent(m[1])")],
    ["the page writes ?car= as a slug again", "public/js/onebox.js", s => s.replace("else if (lastQuery) p.set(\"car\", String(lastQuery).trim());", "else if (lastQuery) p.set(\"car\", slugifyQuery(lastQuery));")],
    ["an old slug loses its mileage comma", "public/js/onebox.js", s => s.replace("\"$1$2,$3\")", "\"$1$2-$3\")")],
    ["the stored question key is not versioned", "lib/live/search.js", s => s.replace("\"|\" + QUESTION_KEY_VERSION + \":\" + textTag(text)", "\"|\" + textTag(text)")],
    ["the stored extraction key is not versioned", "api/vehicleIdentity.js", s => s.replace("update(`${EXTRACT_KEY_VERSION}|${EXTRACT_MODEL}|${text}`)", "update(`vehx|${EXTRACT_MODEL}|${text}`)")],
    ["the notice swallows every word", "lib/live/unusedWords.js", s => s.replace("return { unused: out, line: unusedWordsLine(out) };", "return { unused: [], line: null };")],
    ["the notice reports nothing once a number phrase was set aside", "lib/live/unusedWords.js", s => s.replace("return { unused: out, line: unusedWordsLine(out) };", "if (setAsideNumbers(String(raw || \"\")).changed) return { unused: [], line: null };\n    return { unused: out, line: unusedWordsLine(out) };")]
  ];
  let survived = 0;
  for (const [name, file, fn] of M) {
    const tmp = fs.mkdtempSync(path.join(fs.realpathSync("/tmp"), "nc-"));
    try {
      for (const d of ["lib", "api", "data", "public", "package.json"]) spawnSync("cp", ["-R", path.join(R, d), tmp]);
      fs.symlinkSync(path.join(R, "node_modules"), path.join(tmp, "node_modules"));
      const f = path.join(tmp, file), before = fs.readFileSync(f, "utf8"), after = fn(before); if (before === after) { console.log("SKIP (no change) " + name); survived++; continue; }
      fs.writeFileSync(f, after);
      const r = spawnSync(process.execPath, [me, tmp], { encoding: "utf8" }), killed = r.status !== 0; console.log((killed ? "killed   " : "SURVIVED ") + name); if (!killed) survived++;
    } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  }
  console.log(survived ? `${survived} mutant(s) survived` : "all mutants killed"); return survived ? 1 : 0;
}
