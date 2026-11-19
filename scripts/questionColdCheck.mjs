// clock: real-ok every row is dated relative to now; no calendar date is asserted (Lane B, Nov 1 2026)
// A QUESTION-FIRST TEXT IS READ ONCE, THEN FROM ITS STORED QUESTION (Lane B, Nov 1 2026). Worked offline against a fake archive (250 ms a read); no production read was made.
// CAUSE: "1965 Ford Mustang" is a question (which body?). A question stores no ANSWER row, and the question needs the whole pool read before it can be asked (which bodies have 3+ sales, do they price apart), so every read paid the pool read: 6.3 s and 5.7 s live,
// beside a stale answer row from 77 hours earlier that the handler could not use (a refresh of a question stores nothing, so its marker never cleared and every read after 90 s computed live).
// FIX: the question is kept as its own row (MCQ:<spec>|<typed words>, lib/live/search.js), under the same stamp, epoch, 24 hour and 7 day rules as an answer row; the handler reads it beside the answer row, serves it first, stores it when it computes one and refreshes it behind the response.
// A question still stores no answer row. CLASS: every body, generation, trim, model, gearbox and edition question. Fails without the fix.
//   node scripts/questionColdCheck.mjs [repo root]
import fs from "fs";
const EPOCH = "2026-10-28T19:34:12.871Z"; let archiveReads = 0; const STORE = new Map();
const cacheFetch = async (u, init) => {
  if (init && init.method === "POST") { for (const r of JSON.parse(init.body)) STORE.set(r.spec_key, { market: r.market, computed_at: r.computed_at || new Date().toISOString() }); return new Response("", { status: 201 }); }
  if (init && init.method === "DELETE") { STORE.delete((u.searchParams.get("spec_key") || "").replace(/^eq\./, "")); return new Response("", { status: 204 }); }
  const k = (u.searchParams.get("spec_key") || "").replace(/^eq\./, ""), r = STORE.get(k); return new Response(JSON.stringify(r ? [{ market: r.market, computed_at: r.computed_at }] : []), { status: 200 });
};
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
const root = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
const E = await import(pathToFileURL(path.join(root, "lib/onebox.js")).href);
let failed = 0; const ok = (n, c, d) => { if (!c) failed++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`); };
const ev = (row, it) => { const ci = it.indexOf(":"); const alias = ci > 0 && it[ci + 1] !== ":" ? it.slice(0, ci) : null; const expr = alias ? it.slice(ci + 1) : it; if (expr.startsWith("raw_record->>")) { const k = expr.slice(13); const v = row.raw_record[k]; return [alias || k, v == null ? null : String(v)]; } return [alias || expr, row[expr] === undefined ? null : row[expr]]; };
const likeRe = v => new RegExp("^" + String(v).replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$", "i");
let rows = [], n = 0; let MK = "Testmake"; const day = i => new Date(Date.now() - i * 864e5).toISOString().slice(0, 10);
const sale = (model, body, tx, price, ago) => { n++; rows.push({ id: "00000000-0000-4000-8000-" + String(n).padStart(12, "0"), source_id: "pa" + n, sale_price: price, sale_date: day(ago), platform: "Bring a Trailer", source_slug: "bringatrailer", make: MK, model, year: 2001,
  listing_title: `2001 ${MK} ${model} ${body}${tx ? " " + tx : ""}`, vin_norm: "V" + n, stated_mileage: null, project_flag: null, desc_facts: null, has_reserve: null, vehicle_type: "car", sale_price_usd: price,
  raw_record: { featured_image_url: "https://x/i.jpg", mileage: String(30000 + n * 300), body_style: body, modifications: null, title: `2001 ${MK} ${model} ${body}`, currency: "USD", transmission: tx || null, exterior_color: null, title_status: null, url: "https://u/" + n, source_url: null, city: "Austin", state: "TX", country_code: "US", auction_end_precision: null } }); };
const DELAY = 250;
globalThis.fetch = async (url, init) => {
  const u = new URL(String(url));
  if (u.pathname.endsWith("/spec_market_cache")) return cacheFetch(u, init);
  if (u.pathname.endsWith("/app_config")) return new Response(JSON.stringify([{ value: EPOCH }]), { status: 200 });
  await new Promise(r => setTimeout(r, DELAY));
  if (u.pathname.endsWith("/sales_archive")) archiveReads++;
  if (u.pathname.endsWith("/sales_archive")) {
    const sp = u.searchParams, sel = sp.get("select"), sd = sp.getAll("sale_date");
    const ge = sd.filter(v => v.startsWith("gte.")).map(v => v.slice(4)), lt = sd.filter(v => v.startsWith("lt.")).map(v => v.slice(3));
    const ys = sp.getAll("year"), ymin = Number((ys.find(v => v.startsWith("gte.")) || "gte.0").slice(4)), ymax = Number((ys.find(v => v.startsWith("lte.")) || "lte.9999").slice(4));
    const mk = sp.get("make") && likeRe(sp.get("make").replace(/^ilike\./, "")), md = sp.get("model") && likeRe(sp.get("model").replace(/^ilike\./, "")), ti = sp.get("listing_title") && likeRe(sp.get("listing_title").replace(/^ilike\./, ""));
    const keep = rows.filter(r => (!ge.length || r.sale_date >= ge[0]) && (!lt.length || r.sale_date < lt[0]) && r.year >= ymin && r.year <= ymax && (!mk || mk.test(r.make)) && (!md || md.test(r.model)) && (!ti || ti.test(r.listing_title)));
    return new Response(JSON.stringify(keep.map(r => Object.fromEntries(sel.split(",").map(it => ev(r, it))))), { status: 200 });
  }
  if (u.hostname.includes("fake.supabase")) return new Response("[]", { status: 200 });
  throw new Error("offline");
};
const env = { supabaseUrl: "https://fake.supabase.test", supabaseKey: "k", qelig: "compute" };
const S = await import(pathToFileURL(path.join(root, "lib/live/search.js")).href);
const { resolveVehicle } = await import(pathToFileURL(path.join(root, "lib/vehicle.js")).href), { findGeneration } = await import(pathToFileURL(path.join(root, "lib/generations.js")).href);
const mkS = (make, model, title, price, ago, year) => { n++; rows.push({ id: "00000000-0000-4000-8000-" + String(n).padStart(12, "0"), source_id: "pd" + n, sale_price: price, sale_date: day(ago), platform: "Bring a Trailer", source_slug: "bringatrailer", year, make, model, model_family: model, listing_title: title, vin_norm: "V" + n, stated_mileage: null, project_flag: null, desc_facts: null, has_reserve: null, vehicle_type: "car", sale_price_usd: price,
  raw_record: { featured_image_url: "https://x/i.jpg", mileage: String(20000 + n * 100), body_style: null, modifications: null, title, currency: "USD", transmission: null, exterior_color: null, title_status: null, url: "https://u/" + n, source_url: null, city: "Austin", state: "TX", country_code: "US" } }); };
MK = "Ford"; rows = [];
for (const [body, base, n] of [["Coupe", 21000, 8], ["Fastback", 52000, 8], ["Convertible", 38000, 8]]) for (let i = 0; i < n; i++) mkS("Ford", "Mustang", `1965 Ford Mustang ${body}`, base + i * 500, 10 + i * 12, 1965);
for (const r of rows) { r.raw_record.body_style = /Coupe/.test(r.listing_title) ? "Coupe" : /Fastback/.test(r.listing_title) ? "Fastback" : "Convertible"; }
const text = "1965 Ford Mustang", rv = await resolveVehicle(text, {}), v = rv.vehicle || {}, gen = await findGeneration(v, env).catch(() => null), warmKey = S.warmAnswerKeyFor(v, gen, null), ENV = { ...env, qelig: "compute" };
ok("the text is a question-first text (the engine asks which body)", true);
// BEFORE: every read computes the whole pool
const t1 = Date.now(); archiveReads = 0; const first = (await E.oneEngineAnswer(v, gen, text, { ...ENV, asked: 0 }, null)).raw; const cold1 = Date.now() - t1, reads1 = archiveReads;
const t2 = Date.now(); archiveReads = 0; const again = (await E.oneEngineAnswer(v, gen, text, { ...ENV, asked: 0 }, null)).raw; const cold2 = Date.now() - t2, reads2 = archiveReads;
ok(`"${text}" asks a question (${first.tier})`, E.isStorableQuestion ? E.isStorableQuestion(first) : /_choice$/.test(first.tier), first.tier);
console.log(`INFO  without a stored question: first read ${cold1} ms (${reads1} archive reads), second read ${cold2} ms (${reads2} archive reads)`);
ok("without a stored question the second read reads the archive again (the cause)", reads2 > 0);
ok("typed words never store an ANSWER row for a question", ![...STORE.keys()].some(k => k.startsWith("MCWARM:")));
// AFTER: the question is stored as itself, the second read is one stored read
ok("the question row functions exist", typeof S.questionRowKey === "function" && typeof S.writeQuestionRow === "function" && typeof S.readQuestionRow === "function" && typeof E.isStorableQuestion === "function");
if (typeof S.writeQuestionRow === "function" && typeof E.isStorableQuestion === "function") {
  const qKey = S.questionRowKey(warmKey, text);
  ok("the question row has its own key, never an answer key", qKey.startsWith("MCQ:") && !qKey.startsWith("MCWARM:") && S.questionRowKey(warmKey, "1965 ford mustang  ") === qKey && S.questionRowKey(warmKey, "1965 Ford Mustang fastback") !== qKey);
  await S.writeQuestionRow(env, qKey, first);
  archiveReads = 0; const t3 = Date.now(); const got = await S.readQuestionRow(env, qKey); const warm2 = Date.now() - t3;
  ok(`the second read is one stored read: ${warm2} ms against ${cold2} ms, and ${archiveReads} archive reads`, !!got.raw && archiveReads === 0 && warm2 < cold2 / 3 && got.raw.tier === first.tier && JSON.stringify(got.raw.bodyOptions) === JSON.stringify(first.bodyOptions));
  ok("the stored question carries its options, counts and prompt", Array.isArray(got.raw.bodyOptions) && got.raw.bodyOptions.length >= 2 && Array.isArray(got.raw.optionCounts) && typeof got.raw.prompt === "string");
  // the rules of an answer row
  const age = (ms, over = {}) => { STORE.set(qKey, { computed_at: new Date(Date.now() - ms).toISOString(), market: { kind: "question", raw: first, engineVersion: E.ENGINE_VERSION, warmEpoch: EPOCH, ...over } }); return S.readQuestionRow(env, qKey); };
  const H = 3600e3, D = 24 * H;
  let r = await age(2 * H); ok("a question 2 hours old is served fresh", !!r.raw && r.stale === false, r.reason);
  r = await age(30 * H); ok("a question 30 hours old, stamp and epoch matching, is served and marked stale (refreshed behind)", !!r.raw && r.stale === true, r.reason);
  r = await age(6.9 * D); ok("a question 6.9 days old is served and marked stale", !!r.raw && r.stale === true);
  r = await age(7 * D + 60e3); ok("a question 7 days old is not served", r.raw === null, r.reason);
  r = await age(30 * H, { engineVersion: "old" }); ok("another engine stamp is not served", r.raw === null, r.reason);
  r = await age(30 * H, { warmEpoch: "2026-10-01T00:00:00.000Z" }); ok("another sales epoch over 24 hours is not served", r.raw === null, r.reason);
  r = await age(2 * H, { kind: "answer" }); ok("a row that is not a question is not read as one", r.raw === null, r.reason);
  // the class: every question tier is storable, an answer and a document question are not
  const q = tier => ({ tier, bodyOptions: ["a", "b"], generationOptions: ["a", "b"], trimOptions: [{ label: "a" }, { label: "b" }], gearboxOptions: ["a", "b"], variantOptions: ["a", "b"], modelOptions: ["a", "b"] });
  ok("model, generation, body, trim, gearbox and edition questions are storable", ["model_choice", "generation_choice", "body_choice", "trim_choice", "gearbox_choice", "variant_choice"].every(t => E.isStorableQuestion(q(t))));
  ok("an answer, a document-history question and a one-option question are not", !E.isStorableQuestion({ tier: "result", bodyOptions: ["a", "b"] }) && !E.isStorableQuestion(q("dochistory_choice")) && !E.isStorableQuestion({ tier: "body_choice", bodyOptions: ["a"] }));
}
// the handler: reads the question row first, stores a computed question, refreshes a stale one, drops it when the engine stops asking, and shows no stale line on a question
const sd = fs.readFileSync("api/sellerDecision.js", "utf8").replace(/\/\/[^\n]*/g, "");
ok("the handler reads the question row beside the answer row and serves it first", /const qP = \(wantsWarm && !recompute\) \? readQuestionRow/.test(sd) && /const w = q && q\.raw \? null : await obWithin\(warmP\)/.test(sd) && /oneBox = casedChips\(q\.raw\)/.test(sd));
ok("the handler stores a computed question as itself and never as an answer row", /if \(wantsWarm && !poolSeed && raw && isStorableQuestion\(raw\)\) \{ await writeQuestionRow/.test(sd));
ok("a stale question is refreshed behind the response and removed when the engine stops asking", /isStorableQuestion\(fr\)\) await writeQuestionRow/.test(sd) && /staleInfo\.question && fr && !\/_choice\$\/\.test\(String\(fr\.tier \|\| ""\)\)\) await deleteQuestionRow/.test(sd));
ok("a question carries no stale line", /const staleFields = staleInfo && !staleInfo\.question/.test(sd));
console.log(failed ? `questionColdCheck: ${failed} failure(s)` : "questionColdCheck: all pass");
process.exit(failed ? 1 : 0);
