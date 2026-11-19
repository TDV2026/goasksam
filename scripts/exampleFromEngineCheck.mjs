// A LANDING EXAMPLE IS THE ENGINE'S ANSWER, NOTHING ELSE (Lane B, Oct 29 2026). Lane C's mcexamplerefresh and deskexample stored nothing ("cluster null with 19 cards", "only 1 generation cleared the floor")
// while the engine answered the same cars (the 2008 997 Carrera S 21 sales; the Desk 997 31, 991 12, 992 13).
// CAUSE: both builders call the one engine (api/_historyData.js oneBoxFor -> oneEngineAnswer) but then apply rules of their own to its answer: the Market Check builder needed a pooled cluster and 5 cards,
// the Desk builder needed a pooled cluster and 5 cards per generation. Since e96 the engine answers a split or apart car with no pooled cluster (the options as lines), so the builders rejected exactly the
// answers the engine gave, and (e100) kept the last good row, which did not exist. The same pooled-cluster rule sat in oneBoxFor's stored-answer read, so every hub for a split car recomputed live.
// This check holds every builder to the engine's answer: for an alike, a split and an apart answer, what a builder stores equals the engine's own fields (count, cluster or null, state, lines, window, cards),
// a split answer is stored (not null), and no builder file carries a cluster or sales rule of its own.
//   node scripts/exampleFromEngineCheck.mjs [repo root]
import fs from "node:fs";
import path from "node:path"; import { fileURLToPath, pathToFileURL } from "node:url";
const root = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
process.chdir(root);
process.env.SUPABASE_URL = "https://fake.supabase.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "k"; process.env.LAUNCH_STAGE = "2";
let fail = 0; const ok = (n, c, d) => { if (!c) fail++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`); };
const rd = f => fs.readFileSync(path.join(root, f), "utf8");
const imp = f => import(pathToFileURL(path.join(root, f)).href);
const alike = JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures/m3Answer.json"), "utf8"));
const lines = ["Coupe $61,000 to $82,000, 11 sales", "Cabriolet $52,000 to $70,000, 8 sales since March 2025"];
const split = { ...alike, optionsState: "split", cluster: null, headlineDimension: "body", headlineLines: lines, optionLines: lines, options: [{ label: "Coupe", n: 11 }, { label: "Cabriolet", n: 8 }], poolN: 19, soldCount: 19 };
const apart = { ...split, optionsState: "apart" };
const withAlike = { ...alike, optionsState: "alike", optionLines: lines };
const mc = await imp("lib/live/marketCheckExample.js"), dk = await imp("lib/live/deskExample.js");
const id = { year: 2008, make: "Porsche", model: "997", genCode: "997" }, gen = { code: "997", text: "2008 Porsche 997" };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
for (const [name, d] of [["alike", withAlike], ["split", split], ["apart", apart]]) {
  const r = typeof mc.reduce === "function" ? mc.reduce(d) : null;
  ok(`Market Check example, ${name}: stored (the engine's answer is a result)`, !!r);
  if (r) {
    ok(`Market Check example, ${name}: cluster is the engine's (${d.cluster ? "a range" : "null"})`, same(r.cluster, d.cluster == null ? null : d.cluster));
    ok(`Market Check example, ${name}: state, count, window and lines are the engine's`, r.optionsState === d.optionsState && r.poolN === d.poolN && r.soldCount === d.soldCount && r.windowWords === d.windowWords && same(r.headlineLines, d.headlineLines) && same(r.optionLines, d.optionLines));
    ok(`Market Check example, ${name}: the sales are the engine's first ${Math.min(40, d.cards.length)}, in order`, r.cards.length === Math.min(40, d.cards.length) && r.cards.every((c, i) => c.price === d.cards[i].price));
  }
  const g = typeof dk.genFromAnswer === "function" ? dk.genFromAnswer(id, gen, d) : null;
  ok(`Desk example generation, ${name}: stored with the engine's count and cluster`, !!g && g.soldCount === d.poolN && same(g.cluster, d.cluster == null ? null : d.cluster));
}
ok("a refusal or a question is not stored as an example", !mc.reduce || (mc.reduce({ ...alike, tier: "refusal" }) === null && mc.reduce({ ...alike, tier: "model_choice" }) === null));
// no builder or page example carries a cluster or sales rule of its own
const strip = s => s.replace(/\/\/[^\n]*/g, "");
for (const f of ["lib/live/marketCheckExample.js", "lib/live/deskExample.js"]) {
  const s = strip(rd(f));
  ok(`${f}: no cluster rule of its own`, !/!\s*d\.cluster|Array\.isArray\(d\.cluster\)|cluster\.length\s*!==/.test(s));
  ok(`${f}: no sales floor of its own`, !/MIN_SALES|cards\.length\s*<\s*\d|\.length\s*<\s*[2-9]\)\s*return null/.test(s.replace(/results\.length < 2/g, "")));
}
ok("oneBoxFor reads a stored split or apart answer instead of recomputing it", !/st\.raw\.tier === "result" && Array\.isArray\(st\.raw\.cluster\)\) return/.test(rd("api/_historyData.js")));
console.log(fail ? `exampleFromEngineCheck: ${fail} failure(s)` : "exampleFromEngineCheck: all pass");
process.exit(fail ? 1 : 0);
