// CONDITION TIER ASSIGNMENT AND THE NIGHTLY JOB (Lane B, Nov 2026, Desk Valuations spec item 1). No database, no network. Must hold:
//  (1) fixtures across every evidence line: the tier and the stored evidence lines are what the signals say (mileage against the model's bands, owners, service records, accident,
//      restoration, modification, title); each line names its code and points; no photo is read;
//  (2) too little to tier is Untiered (null) and says so; a hard negative (branded title, project) is tier 4 whatever else is said;
//  (3) the same listing always gets the same tier (pure), and every evidence line is past tense, dated by the listing, never the car today (rule 26);
//  (4) THE JOB: it walks rows not at the current version in id order, writes each batch through set_condition_tiers, pauses between batches, doubles the pause on a slow batch,
//      is resumable (a second run touches nothing), and writes tiers that equal assignTier's;
//  (5) the SQL file carries the columns, the function, RLS on, revokes and the service_role grant; the workflow file is workflow_dispatch with batches and a pause.
//   node scripts/tierAssignCheck.mjs [repo root]        (a tree without the job fails it)
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
const ROOT = path.resolve(process.argv[2] || path.join(path.dirname(new URL(import.meta.url).pathname), ".."));
let failed = 0; const ok = (n, c, d) => { if (!c) failed++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`); };
const T = await import(pathToFileURL(path.join(ROOT, "lib/conditionTier.js")).href).catch(() => null);
const J = await import(pathToFileURL(path.join(ROOT, "scripts/assignConditionTier.mjs")).href).catch(() => null);
ok("lib/conditionTier.js exists", !!T);
ok("scripts/assignConditionTier.mjs (the nightly job) exists", !!J);
if (!T || !J) { console.log(`\n${failed} FAILED`); process.exit(1); }

const bands = { n: 400, q25: 21000, q75: 64000 };
const codes = a => a.evidence.map(e => e.code);
const has = (a, c) => codes(a).includes(c);
const car = over => ({ listing_title: "1999 Porsche 911 Carrera", description: "", mileage_text: "40,000", title_status: null, modifications: null, project_flag: null, ...over });
// (1) each signal
let a;
a = T.assignTier(car({ mileage_text: "12,400" }), bands); ok("(1) mileage at or under the model's lower quartile: +1, with the quartile in the line", has(a, "mileage_low") && /12,400 miles/.test(a.evidence[0].line) && /21,000/.test(a.evidence[0].line) && a.evidence[0].points === 1);
a = T.assignTier(car({ mileage_text: "92,000" }), bands); ok("(1) mileage at or over the upper quartile: -1", has(a, "mileage_high") && a.evidence[0].points === -1);
a = T.assignTier(car({ mileage_text: "40,000" }), bands); ok("(1) mileage between the quartiles: observed, 0", has(a, "mileage_mid") && a.evidence[0].points === 0);
a = T.assignTier(car({ mileage_text: "12,400" }), null); ok("(1) no model band to read against: mileage is not observed", !codes(a).some(c => /^mileage/.test(c)));
a = T.assignTier(car({ description: "A one-owner car." }), bands); ok("(1) one owner +1", has(a, "owners_one"));
a = T.assignTier(car({ description: "Sold by its second owner." }), bands); ok("(1) two owners 0", has(a, "owners_two"));
a = T.assignTier(car({ description: "The car has had four previous owners." }), bands); ok("(1) three or more owners -1", has(a, "owners_many"));
a = T.assignTier(car({ description: "Comes with a binder of service records and receipts." }), bands); ok("(1) service records +1", has(a, "service"));
a = T.assignTier(car({ description: "No accidents and a clean Carfax." }), bands); ok("(1) no accidents +1", has(a, "accident_none"));
a = T.assignTier(car({ description: "Rear damage from an insurance claim in 2014." }), bands); ok("(1) an accident or damage mentioned -1", has(a, "accident"));
a = T.assignTier(car({ description: "Original paint and numbers matching." }), bands); ok("(1) original paint +1", has(a, "original"));
a = T.assignTier(car({ description: "Restored in 2019 and repainted." }), bands); ok("(1) a restoration is shown and not scored (0)", has(a, "restored") && a.evidence.find(e => e.code === "restored").points === 0);
a = T.assignTier(car({ modifications: "aftermarket exhaust, coilovers" }), bands); ok("(1) a modifications field -1", has(a, "modified"));
a = T.assignTier(car({ description: "Fitted with an aftermarket turbo kit." }), bands); ok("(1) modified words in the text -1", has(a, "modified"));
a = T.assignTier(car({ description: "Completely stock and unmodified." }), bands); ok("(1) unmodified +1", has(a, "stock"));
a = T.assignTier(car({ title_status: "Clean" }), bands); ok("(1) a clean title +1", has(a, "title_clean"));
// (2) tiers
a = T.assignTier(car({ mileage_text: "9,800", description: "One owner, complete service records, no accidents, original paint, unmodified.", title_status: "Clean" }), bands);
ok("(2) low miles, one owner, records, no accidents, original, stock, clean title: tier 1", a.tier === 1 && a.score >= 4, `tier ${a.tier}, score ${a.score}`);
a = T.assignTier(car({ mileage_text: "30,000", description: "Service records included.", title_status: "Clean" }), bands); ok("(2) records and a clean title at middle miles: tier 2", a.tier === 2, `tier ${a.tier}, score ${a.score}`);
a = T.assignTier(car({ mileage_text: "40,000", description: "Restored in 2019.", title_status: "Clean" }), bands); ok("(2) a restoration and a clean title at middle miles: tier 3", a.tier === 3, `tier ${a.tier}, score ${a.score}`);
a = T.assignTier(car({ mileage_text: "98,000", description: "Rear damage from an insurance claim.", title_status: "Clean" }), bands); ok("(2) high miles and damage: tier 4", a.tier === 4, `tier ${a.tier}, score ${a.score}`);
a = T.assignTier(car({ mileage_text: "9,800", description: "One owner, service records, no accidents.", title_status: "Salvage" }), bands); ok("(2) a salvage title is tier 4 whatever else is said", a.tier === 4 && has(a, "title_branded"));
a = T.assignTier(car({ mileage_text: "9,800", description: "A project that needs restoration.", title_status: "Clean" }), bands); ok("(2) a project is tier 4", a.tier === 4 && has(a, "project"));
a = T.assignTier(car({ mileage_text: null, description: "Nice car." }), null); ok("(2) too little to tier is Untiered (null), and says so", a.tier === null && a.untiered === true);
a = T.assignTier(car({ mileage_text: "30,000", title_status: "Clean" }), bands); ok("(2) fewer than three signals observed is Untiered", a.tier === null, `observed ${a.observed}`);
a = T.assignTier(car({ mileage_text: null, description: null, listing_title: null }), null); ok("(2) an empty listing never throws and is Untiered", a.tier === null);
// (3) pure and past tense
const r1 = car({ mileage_text: "12,400", description: "One owner, service records, no accidents.", title_status: "Clean" });
ok("(3) the same listing gets the same tier and lines", JSON.stringify(T.assignTier(r1, bands)) === JSON.stringify(T.assignTier({ ...r1 }, bands)));
const all = T.assignTier(car({ mileage_text: "12,400", description: "One owner, service records, no accidents, original paint.", title_status: "Clean", modifications: "x" }), bands);
ok("(3) every line is a statement about the listing (Listed / The listing), never present tense about the car", all.evidence.length >= 5 && all.evidence.every(e => /^(Listed with|The listing)/.test(e.line)));
ok("(3) the version is stored with the tier", all.version === T.TIER_VERSION && /^ct1-/.test(T.TIER_VERSION));
ok("(3) the model bands are the quartiles of the listed miles, and need 20 odometers", T.modelMileBands(Array.from({ length: 100 }, (_, i) => (i + 1) * 1000)).q25 === 25750 && T.modelMileBands([1000, 2000]) === null);
// (4) the job, against a fake PostgREST
const mkRow = i => ({ id: "00000000-0000-4000-8000-" + String(i).padStart(12, "0"), year: 1999, make: "Porsche", model: "911", listing_title: "1999 Porsche 911", description: i % 3 === 0 ? "One owner, service records, no accidents." : i % 3 === 1 ? "Restored in 2019." : "", mileage_text: String(5000 + (i % 40) * 2000), stated_mileage: null, title_status: "Clean", modifications: null, project_flag: null, condition_version: null });
const ROWS = Array.from({ length: 1250 }, (_, i) => mkRow(i + 1));
const written = new Map(), calls = []; let slowAfter = -1, nowT = 0;
globalThis.fetch = async (url, init = {}) => {
  const u = new URL(String(url));
  if (u.pathname.endsWith("/rpc/set_condition_tiers")) { const p = JSON.parse(init.body).p; calls.push({ rpc: p.length }); for (const x of p) { written.set(x.id, x); const r = ROWS.find(q => q.id === x.id); r.condition_version = x.version; } return new Response(String(p.length), { status: 200 }); }
  if (u.pathname.endsWith("/sales_archive")) {
    const sel = u.searchParams.get("select") || "";
    if (sel === "mileage_text") return new Response(JSON.stringify(ROWS.map(r => ({ mileage_text: r.mileage_text })).concat(ROWS.map(r => ({ mileage_text: r.mileage_text })))), { status: 200 });
    const gt = (u.searchParams.get("id") || "").replace("gt.", ""), lim = Number(u.searchParams.get("limit") || 500);
    const todo = ROWS.filter(r => r.id > gt && r.condition_version !== J_VERSION).slice(0, lim); calls.push({ read: todo.length }); nowT += calls.length > slowAfter && slowAfter >= 0 ? 9000 : 100;
    return new Response(JSON.stringify(todo), { status: 200 });
  }
  return new Response("[]", { status: 200 });
};
const J_VERSION = T.TIER_VERSION, env = { supabaseUrl: "https://fake.example", supabaseKey: "k" }, pauses = [];
const run = opts => J.runJob({ env, log: () => {}, sleep: async ms => { pauses.push(ms); }, now: () => nowT, ...opts });
const out1 = await run({ batch: 500, pause: 1500, slow: 4000 });
ok("(4) the job assigns every row once, in batches of the size asked (500, 500, 250)", out1.done === 1250 && calls.filter(c => c.rpc).map(c => c.rpc).join() === "500,500,250", calls.filter(c => c.rpc).map(c => c.rpc).join());
ok("(4) it pauses between batches (never after the last)", pauses.length === 2 && pauses.every(p => p >= 1500), JSON.stringify(pauses));
ok("(4) the tiers written equal assignTier's on the same row and the model's bands", ROWS.slice(0, 60).every(r => { const w = written.get(r.id); const b = T.modelMileBands(ROWS.map(x => x.mileage_text).concat(ROWS.map(x => x.mileage_text))); const e = T.assignTier(r, b); return w && w.tier === e.tier && w.version === T.TIER_VERSION && JSON.stringify(w.evidence) === JSON.stringify(e.evidence); }));
ok("(4) tiers 1 to 4 and Untiered are all written (the fixtures cover the spread)", new Set([...written.values()].map(x => x.tier)).size >= 3);
const before = calls.filter(c => c.rpc).length; const out2 = await run({ batch: 500 });
ok("(4) resumable: a second run finds nothing to do and writes nothing", out2.done === 0 && calls.filter(c => c.rpc).length === before);
// slow batches double the pause
for (const r of ROWS) r.condition_version = null; calls.length = 0; pauses.length = 0; slowAfter = 0; nowT = 0;
await run({ batch: 250, pause: 1000, slow: 4000 });
ok("(4) CPU watched: a slow batch doubles the pause (capped), so the pause grows while the database is slow", pauses.length >= 3 && pauses[1] > pauses[0] && pauses[2] > pauses[1], JSON.stringify(pauses));
// (5) sql and workflow files
const sql = fs.readFileSync(path.join(ROOT, "docs/supabase-condition-tier.sql"), "utf8").replace(/--[^\n]*/g, "");
ok("(5) the SQL adds the tier, evidence, version and time columns", /add column if not exists condition_tier/.test(sql) && /condition_evidence jsonb/.test(sql) && /condition_version/.test(sql) && /condition_at/.test(sql));
ok("(5) the SQL ships the lock: RLS on, revoke from anon and authenticated, execute revoked and granted to service_role only", /enable row level security/.test(sql) && /revoke all on sales_archive from anon, authenticated/.test(sql) && /revoke execute on function set_condition_tiers\(jsonb\) from public, anon, authenticated/.test(sql) && /grant execute on function set_condition_tiers\(jsonb\) to service_role/.test(sql));
const yml = fs.readFileSync(path.join(ROOT, "docs/condition-tier-workflow.yml"), "utf8");
ok("(5) the workflow is workflow_dispatch (and the nightly schedule), batches with a pause, secrets from Actions", /workflow_dispatch:/.test(yml) && /schedule:/.test(yml) && /--pause=/.test(yml) && /--batch=/.test(yml) && /secrets\.SUPABASE_SERVICE_ROLE_KEY/.test(yml));
console.log(failed ? `\n${failed} FAILED` : "\nall passed");
process.exit(failed ? 1 : 0);
