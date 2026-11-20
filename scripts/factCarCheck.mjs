// factCarCheck (Lane D, Nov 20 2026, lane-d-factcar): task=factcar (lib/factCar.js) on a fake database holding rows with every kind of text a listing can carry. No network.
//  1 THE ANSWER: n listings of the run chosen by most statements; year, stated mileage, sale date, source, and each statement's eight fields; run=fm4 like=fm5 returns the same listings' fm4 statements; the same listing has the same hash in both.
//  2 NO LISTING TEXT: the database rows carry a VIN, a title, a URL, a seller, a description, a quote and span numbers in every column a careless select could pick up; none of it appears anywhere in the answer, and the answer's keys are exactly the lists.
//  3 THE TOPIC: a topic the miner wrote with a VIN, a link, an address or a long number in it comes back scrubbed and short.
//  4 THE SELECTS: the sales read names its columns (no *, no title, vin, url, seller, description, raw_record).
//   node scripts/factCarCheck.mjs [repo root]      --mutants breaks one rule at a time in a copy (each must fail)
import fs from "node:fs"; import path from "node:path"; import os from "node:os"; import { spawnSync } from "node:child_process"; import { fileURLToPath, pathToFileURL } from "node:url";
const args = process.argv.slice(2), here = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.resolve(args.find(a => !a.startsWith("--")) || path.join(here, ".."));
if (args.includes("--mutants")) process.exit(mutants());
process.chdir(ROOT);
const FC = await import(pathToFileURL(path.join(ROOT, "lib/factCar.js")).href);
let pass = 0, fail = 0; const fails = []; const ok = (n, c, d) => { if (c) pass++; else { fail++; fails.push(n + (d !== undefined ? " " + JSON.stringify(d).slice(0, 240) : "")); } };
const VIN = "WP0AB29974S650123", URL1 = "https://example.com/listing/secret-car", SELLER = "sellerhandle_77", TITLE = "2004 Porsche 911 Carrera " + VIN, DESC = "DESCRIPTIONTEXT the owner says it is perfect", QUOTE = "QUOTETEXT replaced the IMS bearing";
const SECRETS = [VIN, URL1, SELLER, "DESCRIPTIONTEXT", "QUOTETEXT", "secret-car", "sellerhandle"];
const runs = [["a1", 9], ["b2", 7], ["c3", 4], ["d4", 2], ["e5", 1]].map(([id, n]) => ({ listing_id: "bringatrailer:" + id, source: "bringatrailer", family: "p996_carrera", miner_version: "fm5", status: "done", sold_or_attempt: "sold", items_found: n }));
const mentions = []; const mk = (v, id, i, o = {}) => ({ listing_id: "bringatrailer:" + id, family: "p996_carrera", miner_version: v, topic: "ims bearing replaced", statement_type: "work_done", polarity: "positive", stated_year: 2021, stated_miles: 61000, proof_mentioned: true, unmatched: false, span_start: 10, span_end: 40, quote: QUOTE, vin: VIN, ...o });
for (const [id, n] of [["a1", 9], ["b2", 7], ["c3", 4]]) for (let i = 0; i < n; i++) mentions.push(mk("fm5", id, i, i === 0 && id === "a1" ? { topic: "bearing, VIN " + VIN + " see " + URL1 + " mail " + SELLER + "@x.com 123456789 call" } : {}));
for (const [id, n] of [["a1", 3], ["b2", 2]]) for (let i = 0; i < n; i++) mentions.push(mk("fm4", id, i, { topic: "older words" }));
const sales = ["a1", "b2", "c3", "d4", "e5"].map((id, i) => ({ source_id: id, source_slug: "bringatrailer", sale_date: "2026-03-0" + (i + 1), year: 2002 + i, mileage: 40000 + i, stated_mileage: null, listing_title: TITLE, vin: VIN, url: URL1, seller_username: SELLER, description: DESC, raw_record: { title: TITLE, seller: SELLER } }));
const selects = [];
const sel = async qs => {
  selects.push(qs);
  const eq = k => (new RegExp("[?&]" + k + "=eq\\.([^&]*)").exec(qs) || [0, null])[1], lim = Number((/limit=(\d+)/.exec(qs) || [0, 1000])[1]);
  if (qs.startsWith("listing_mining_runs?")) return runs.filter(r => r.miner_version === eq("miner_version") && r.status === "done" && r.family === eq("family")).sort((a, b) => b.items_found - a.items_found || (a.listing_id < b.listing_id ? -1 : 1)).slice(0, lim).map(r => ({ ...r }));
  if (qs.startsWith("listing_mentions?")) { const ids = decodeURIComponent((/listing_id=in\.([^&]*)/.exec(qs) || [0, ""])[1]).replace(/[()"]/g, "").split(","); return mentions.filter(m => m.miner_version === eq("miner_version") && ids.includes(m.listing_id)).map(m => ({ ...m })); }
  if (qs.startsWith("topic_map?")) return [{ raw_topic: "ims bearing replaced", kind: "work_done", canonical_topic: "IMS bearing", span: "x" }];
  if (qs.startsWith("sales_archive?")) { const ids = decodeURIComponent((/source_id=in\.([^&]*)/.exec(qs) || [0, ""])[1]).replace(/[()"]/g, "").split(","); return sales.filter(s => ids.includes(s.source_id)).map(s => ({ ...s })); }
  return [];
};
const KEY = "test-secret-key";
const ask = async q => FC.runFactCar({ family: "p996_carrera", ...q }, { select: sel }, KEY);
const keysOf = o => Object.keys(o).sort().join();
const walk = (v, f) => { if (v && typeof v === "object") for (const x of Object.values(v)) walk(x, f); else f(v); };
const all = o => { const out = []; walk(o, v => out.push(String(v))); return out.join("\n"); };

const a = await ask({ run: "fm5", n: 3 });
ok("1 answers", a.ok && a.body.count === 3, a);
ok("1 most statements first", a.ok && a.body.listings.map(l => l.statements.length).join() === "9,7,4", a.ok && a.body.listings.map(l => l.statements.length));
const L0 = a.ok ? a.body.listings[0] : {};
ok("1 listing fields are exactly the list", a.ok && a.body.listings.every(l => keysOf(l) === [...FC.LISTING_FIELDS].sort().join()), L0 && Object.keys(L0));
ok("1 statement fields are exactly the list", a.ok && a.body.listings.every(l => l.statements.every(s => keysOf(s) === [...FC.STATEMENT_FIELDS].sort().join())), L0.statements && L0.statements[0] && Object.keys(L0.statements[0]));
ok("1 year mileage date source", L0.year === 2002 && L0.stated_mileage === 40000 && L0.sale_date === "2026-03-01" && L0.source === "bringatrailer", L0);
ok("1 statement values", L0.statements && L0.statements[1] && L0.statements[1].kind === "work_done" && L0.statements[1].stated_year === 2021 && L0.statements[1].stated_miles === 61000 && L0.statements[1].proof_mentioned === true && L0.statements[1].unmatched === false, L0.statements && L0.statements[1]);
const b = await ask({ run: "fm4", like: "fm5", n: 3 });
ok("1 fm4 for the same listings", b.ok && b.body.listings.length === 3 && b.body.listings.map(l => l.statements.length).join() === "3,2,0", b.ok && b.body.listings.map(l => l.statements.length));
ok("1 the same listing has the same hash in both runs", a.ok && b.ok && a.body.listings.map(l => l.listing).join() === b.body.listings.map(l => l.listing).join());
ok("1 the hash is opaque", /^[0-9a-f]{16}$/.test(L0.listing || "") && !/a1/.test(L0.listing), L0.listing);
ok("1 a different key gives a different hash", (await FC.runFactCar({ family: "p996_carrera", run: "fm5", n: 1 }, { select: sel }, "other")).body.listings[0].listing !== L0.listing);
ok("1 refuses a bad call", !(await ask({ run: "fm5; drop", n: 3 })).ok && !(await ask({ run: "fm5", n: 99 })).ok && !(await FC.runFactCar({ family: "x", run: "fm5" }, { select: sel }, KEY)).ok);
ok("1 no key no answer", !(await FC.runFactCar({ family: "p996_carrera", run: "fm5" }, { select: sel }, "")).ok);

// 2 no listing text anywhere in either answer
for (const [nm, r] of [["fm5", a], ["fm4", b]]) { const text = r.ok ? all(r.body) : ""; for (const s of SECRETS) ok("2 " + nm + " answer holds no " + s.slice(0, 8), r.ok && !text.includes(s)); }
ok("2 no span numbers", a.ok && !JSON.stringify(a.body).includes("span_"));
// 3 the topic
const t0 = L0.statements && L0.statements[0] ? L0.statements[0].topic : "";
ok("3 scrubbed topic", !/WP0|https|@|123456789|sellerhandle/.test(t0) && t0.length <= FC.TOPIC_MAX && /bearing/.test(t0), t0);
ok("3 scrubTopic cuts length", FC.scrubTopic("x ".repeat(200)).length <= FC.TOPIC_MAX);
// 4 the selects
const sa = selects.filter(s => s.startsWith("sales_archive?"));
ok("4 the sales read names its columns", sa.length > 0 && sa.every(s => !/select=\*/.test(s) && !/listing_title|vin|url|seller|description|raw_record|title/.test(decodeURIComponent((/select=([^&]*)/.exec(s) || [0, ""])[1]))), sa[0]);
ok("4 the statements read names its columns", selects.filter(s => s.startsWith("listing_mentions?")).every(s => !/select=\*/.test(s) && !/span_|quote|vin/.test((/select=([^&]*)/.exec(s) || [0, ""])[1])));
console.log(`factCarCheck: ${pass} passed, ${fail} failed`); if (fail) for (const f of fails) console.log("  FAIL " + f); process.exit(fail ? 1 : 0);

function mutants() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "factcar-")), cp = path.join(tmp, "r");
  spawnSync("rsync", ["-a", "--exclude", "node_modules", "--exclude", ".git", ROOT + "/", cp + "/"]); try { fs.symlinkSync(path.join(ROOT, "node_modules"), path.join(cp, "node_modules")); } catch {}
  const f = path.join(cp, "lib/factCar.js"), orig = fs.readFileSync(f, "utf8"); let bad = 0;
  const M = [
    ["the topic is not scrubbed", s => s.replace("export function scrubTopic(t) {", "export function scrubTopic(t) { return String(t);")],
    ["the sales read also picks the title and VIN", s => s.replace("select=source_id,sale_date,year,mileage,stated_mileage&", "select=source_id,sale_date,year,mileage,stated_mileage,listing_title,vin&")],
    ["a statement keeps every stored field", s => s.replace("export const statementOf = (m, kindOfTopic) => ({", "export const statementOf = (m, kindOfTopic) => ({ ...m,")],
    ["the listing id is shown as is", s => s.replace("listing: hashOf(r.listing_id, secret)", "listing: r.listing_id")],
    ["the statements read selects everything", s => s.replace("listing_mentions?select=listing_id,topic,statement_type,polarity,stated_year,stated_miles,proof_mentioned,unmatched&", "listing_mentions?select=*&")],
    ["the listing carries its title", s => s.replace("year: num(f.year),", "year: num(f.year), title: f.listing_title,")]
  ];
  for (const [name, fn] of M) { fs.writeFileSync(f, fn(orig)); const r = spawnSync("node", [path.join(cp, "scripts/factCarCheck.mjs"), cp], { encoding: "utf8" }); const caught = r.status !== 0; if (!caught) bad++; console.log((caught ? "caught   " : "SURVIVED ") + name); }
  fs.writeFileSync(f, orig); return bad ? 1 : 0;
}
