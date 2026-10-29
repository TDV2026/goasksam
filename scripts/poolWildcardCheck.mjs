// THE ARCHIVE WILDCARD BRIDGES A SEPARATOR, NOT A SENTENCE (Lane B, Oct 29 2026, Sam's gate: zero wrong-model results).
// CAUSE: the pool read turns a code into an ILIKE pattern with a `*` between its digits and letters (300SL -> *300*SL*) so "300SL", "300 SL" and "300-SL" meet. An ILIKE `*` matches ANY text, so
// "1956 Mercedes-Benz 300c w/Sliding Roof" (a $55,000 Adenauer sedan) was in the 1954 to 1957 300SL pool (range $1.5M to $1.87M, lowest sale $55,000). Nothing after the database read re-checked the code.
// CARS AND PAGES IT TOUCHED: every pool built from a code with a 2+ digit run touching letters (190SL, 230SL, 280SL, S65, C63, E30, Z06, D50, F150...) and, for a bare number, every number that appears inside a longer one
// (a chassis or engine number); every page and email reads the same oneEngineAnswer pool, so Market Check, Find, Buy, Sell and the spec pages all carried it.
// FIX: flexKeep (lib/onebox.js) keeps a database row only when its model or title carries the code with at most one space or hyphen where the wildcard went, and a bare number only as a whole number.
// This check: (1) the real pool fetch over a fake archive that evaluates the ILIKE the way PostgREST does drops the sedan and keeps the 300SL, 300 SL and 300-SL cars; (2) a table of codes, each with a title
// the wildcard matches and the filter must refuse; (3) the filter never refuses a spelling the wildcard exists for; (4) every flexPattern read in the file is followed by flexFilter.
//   node scripts/poolWildcardCheck.mjs [repo root]
import fs from "node:fs";
import path from "node:path"; import { fileURLToPath, pathToFileURL } from "node:url";
const root = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
process.chdir(root);
let fail = 0; const ok = (n, c, d) => { if (!c) fail++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`); };
const E = await import(pathToFileURL(path.join(root, "lib/onebox.js")).href);
// 1. the real fetch over a fake archive
const DAY = 864e5, now = Date.now(), iso = d => new Date(now - d * DAY).toISOString().slice(0, 10);
const mk = (id, year, model, title, price) => ({ id, source_id: id, price, auction_end_date: iso(40 + price % 300), source: "bringatrailer", raw_title: title, year, make: "Mercedes-Benz", model, vin_norm: null, image: "https://img.test/" + id + ".jpg" });
const ROWS = [
  mk("a1", 1955, "300SL", "1955 Mercedes-Benz 300SL Gullwing", 1500000), mk("a2", 1955, "300 SL", "1955 Mercedes-Benz 300 SL Coupe", 1650000), mk("a3", 1957, "300-SL", "1957 Mercedes-Benz 300-SL Roadster", 1450000),
  mk("a4", 1956, "W186/W189 Adenauer", "1956 Mercedes-Benz 300c w/Sliding Roof", 55000),   // the sedan the wildcard let in
  mk("a5", 1956, "190SL", "1956 Mercedes-Benz 190SL", 85000), mk("a6", 1955, "300 S Coupe", "1955 Mercedes-Benz 300 S Cabriolet with a Slim Roof", 285000)
];
const wild = v => new RegExp("^" + decodeURIComponent(v).replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$", "i");
globalThis.fetch = async (url, init) => {
  if (process.env.DBG) console.error("Q", decodeURIComponent(new URL(url).search).replace(/select=[^&]*/, "select=…").slice(0, 300));
  const u = new URL(url); let rows = ROWS;
  if (!u.pathname.endsWith("/sales_archive")) return new Response("[]", { status: 200, headers: { "content-type": "application/json" } });
  for (const [k, v] of u.searchParams) { const m = /^ilike\.(.*)$/.exec(v); if (!m) continue; const re = wild(m[1]); rows = rows.filter(r => re.test(String(k === "model" ? r.model : k === "listing_title" ? r.raw_title : k === "make" ? r.make : ""))); }
  const [from, to] = String((init.headers || {}).Range || "0-999").split("-").map(Number);
  if (process.env.DBG) console.error("rows", rows.length, from, to);
  return new Response(JSON.stringify(rows.slice(from, to + 1).map(r => ({ ...r, sale_date: r.auction_end_date }))), { status: 200, headers: { "content-type": "application/json" } });
};
const env = { supabaseUrl: "http://fake", supabaseKey: "k" };
const got = await E.fetchQualifying({ make: "Mercedes-Benz", model: "300SL", year: 1955, yearMin: 1954, yearMax: 1957, trim: "", excludeVariants: [], subject: "1955 300SL" }, new Date(now - 1826 * DAY).toISOString(), env, {});
const ids = (got || []).map(r => r.id || r.source_id).sort().join(",");
ok("the fake archive's ILIKE does match the sedan (the over-match exists)", wild(encodeURIComponent("*300*SL*")).test("1956 Mercedes-Benz 300c w/Sliding Roof"));
ok("the 300SL pool keeps the 300SL, 300 SL and 300-SL cars", ["a1", "a2", "a3"].every(i => ids.includes(i)), ids);
ok("the 300SL pool does not hold the 300c Adenauer sedan (title carries 300 ... Sliding)", !ids.includes("a4"), ids);
ok("or any other row that merely has the letters later in the title", !ids.includes("a6") && !ids.includes("a5"), ids);
// 2. the class: a code, a title the wildcard matches by accident, and one it must keep
const T = [
  ["300SL", "1956 Mercedes-Benz 300c w/Sliding Roof", "1956 Mercedes-Benz 300 SL Roadster"], ["190SL", "1957 Mercedes-Benz 190 Ponton with Slim Hardtop", "1957 Mercedes-Benz 190-SL"],
  ["230SL", "1965 Mercedes-Benz 230 Sedan Sunroof Slider", "1965 Mercedes-Benz 230SL Pagoda"], ["S65", "Mercedes-Benz S Class 2007 with 65,000 miles", "2007 Mercedes-Benz S 65 AMG"],
  ["C63", "1999 Mercedes-Benz C Class 63,000 miles", "2012 Mercedes-Benz C63 AMG"], ["Z06", "1998 Chevrolet Corvette Z51 with 06 build code", "2002 Chevrolet Corvette Z06"],
  ["D50", "1983 Dodge Ram D100 with 50 gallon tank", "1983 Dodge D-50 Sport"], ["E30", "1999 Mercedes-Benz E320 with 30,000 miles", "1988 BMW E30 325i"],
  ["911", "Chassis no. 4119113 Engine no. 62", "1987 Porsche 911 Carrera"], ["901", "1965 Porsche 356 Chassis no. 1901234", "1965 Porsche 911 901 SWB"]
];
for (const [code, bad, good] of T) {
  const keep = E.flexKeep ? E.flexKeep(code) : null, wide = new RegExp("^.*" + (E.flexPattern ? E.flexPattern(code) : code).replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + ".*$", "i");
  ok(`${code}: refuses "${bad}"`, !!keep && !keep({ model: "x", raw_title: bad }));
  ok(`${code}: keeps "${good}"`, !!keep && keep({ model: "x", raw_title: good }));
  const tail = good.replace(/^\d{4} \S+ /, "");   // the model column alone, with no title
  ok(`${code}: a row whose model column carries the code and whose title does not is kept ("${tail}")`, !!keep && keep({ model: tail, raw_title: "" }));
}
// 3. a code with no wildcard and no number is not filtered at all
ok("a variant letter is bridged (325i pool holds the 325xi, 190SL holds 190 E SL spellings no more than two letters)", !!E.flexKeep && E.flexKeep("325i")({ model: "x", raw_title: "2006 BMW 325xi Sedan" }) && E.flexKeep("325i")({ model: "325xi", raw_title: "" }) && !E.flexKeep("325i")({ model: "x", raw_title: "2006 BMW 3 Series with 25 and a Window" }));
ok("a plain name is left to the database (no filter)", !!E.flexKeep && E.flexKeep("Gullwing") === null && E.flexKeep("") === null);
ok("flexFilter returns null and non-arrays untouched (a failed read stays a failed read)", !!E.flexFilter && E.flexFilter(null, "300SL") === null);
// 4. every flexPattern read is filtered
{ const src = fs.readFileSync("lib/onebox.js", "utf8").split("\n"); const reads = [];
  src.forEach((l, i) => { if (/flexPattern\(/.test(l) && /ilike/.test(l) && !/^\s*(\/\/|export const|const (modelQ|titleQ|rqBase))/.test(l)) reads.push(i + 1); });
  const bare = reads.filter(n => !/flexFilter\(/.test(src.slice(n - 1, n + 1).join(" ")));
  ok(`every direct flexPattern archive read is wrapped in flexFilter (${reads.length} direct reads)`, bare.length === 0, "lines " + bare.join(","));
  const q = src.filter(l => /selAll\((modelQ|titleQ)\(|supabaseSelect\(env, titleQ\(/.test(l));
  ok(`every modelQ/titleQ read is wrapped in flexFilter (${q.length} read lines)`, q.every(l => /flexFilter\(/.test(l) || /\.then\(r => r === null \? r : flexFilter/.test(l) || /^\s*const got = await selAll\(titleQ\(scope\.byTitle\)\)/.test(l)), q.filter(l => !/flexFilter/.test(l)).map(l => l.trim().slice(0, 70)).join(" | ")); }
console.log(fail ? `poolWildcardCheck: ${fail} failure(s)` : "poolWildcardCheck: all pass");
process.exit(fail ? 1 : 0);
