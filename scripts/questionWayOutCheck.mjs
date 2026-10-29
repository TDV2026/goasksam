// EVERY QUESTION THE ENGINE RETURNS HAS A WAY OUT, AND THE WAY OUT REACHES THE NORMAL ENGINE PATH (Lane B, Oct 29 2026).
// CAUSE: the questions that name WHICH car (Which model, Which generation, Which body, Which trim) drew only the engine's buttons. The resolver's model ask says "or type the exact model" in its words, the engine's own model_choice
// does not, and the page drops "Not sure" from the chips; a person whose 1995 Honda or 1969 Chevrolet was not in the buttons had no button to say so (the search box sits above the question with the old text in it, with no pointer to it).
// FIX: the engine returns `wayOut` with the question (lib/questionWayOut.js): { id, kind, label, placeholder, prefill, mode: "search" }. The page renders `label` as the last button; a tap puts the cursor in the normal search box with
// `prefill` ("1995 Honda ") in it; what is typed goes through the same search as any typed text. The facts-about-one-car questions (gearbox, competition, documented history) keep the engine's own skip.
// Class: every question kind the engine returns; table-driven from the engine's own tier names, so a new *_choice tier with no way out fails here.
//   node scripts/questionWayOutCheck.mjs [repo root]
import fs from "node:fs";
import path from "node:path"; import { fileURLToPath, pathToFileURL } from "node:url";
const root = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
process.chdir(root);
process.env.SUPABASE_URL = "https://fake.supabase.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "k"; process.env.LAUNCH_STAGE = "2";
let fail = 0; const ok = (n, c, d) => { if (!c) fail++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`); };
const TAX = { honda: ["Accord", "Civic", "Prelude"], chevrolet: ["Camaro", "Corvette", "Chevelle"] };
const S = { honda: [[1995, "Accord", 20], [1995, "Civic", 25], [1995, "Prelude", 10]], chevrolet: [[1969, "Camaro", 60], [1969, "Corvette", 80], [1969, "Chevelle", 40]] };
globalThis.fetch = async (url) => {
  const u = new URL(String(url)), p = u.pathname;
  if (u.hostname.includes("nhtsa")) return new Response(JSON.stringify({ Results: [] }), { status: 200 });
  if (p.endsWith("/taxonomy_makes")) return new Response(JSON.stringify(["Honda", "Chevrolet"].map(name => ({ name }))), { status: 200 });
  if (p.endsWith("/taxonomy_models")) { const mk = (u.searchParams.get("make_slug") || "").replace(/^eq\./, ""); return new Response(JSON.stringify((TAX[mk] || []).map(name => ({ name, year_ranges: null }))), { status: 200 }); }
  if (p.endsWith("/sales_archive")) { const mk = (u.searchParams.get("make") || "").replace(/^ilike\./, "").toLowerCase(); const ys = u.searchParams.getAll("year"), lo = Number((ys.find(v => v.startsWith("gte.")) || "gte.0").slice(4)), hi = Number((ys.find(v => v.startsWith("lte.")) || "lte.9999").slice(4));
    return new Response(JSON.stringify((S[mk] || []).filter(([y]) => y >= lo && y <= hi).flatMap(([year, model, n]) => Array.from({ length: n }, () => ({ year, model, model_family: model })))), { status: 200 }); }
  if (u.hostname.includes("fake.supabase")) return new Response("[]", { status: 200 });
  throw new Error("offline");
};
const W = await import(pathToFileURL(path.join(root, "lib/questionWayOut.js")).href).catch(() => null);
const O = await import(pathToFileURL(path.join(root, "lib/onebox.js")).href), V = await import(pathToFileURL(path.join(root, "lib/vehicle.js")).href);
ok("lib/questionWayOut.js exists", !!W);
// 1. the two cars Sam named: the engine's Which model question has a way out that opens the search with the year and make in it
for (const [year, make, typed, model] of [[1995, "Honda", "Accord", "Accord"], [1969, "Chevrolet", "Camaro", "Camaro"]]) {
  const mc = await O.runOneBoxModelChoice({ year, make }, { supabaseUrl: "https://fake.supabase.test", supabaseKey: "k" });
  const w = mc && mc.wayOut;
  ok(`${year} ${make}: the Which model question returns a way out`, !!w && w.id === "type_it" && w.kind === "model" && w.label === "Another model" && w.mode === "search", JSON.stringify(w));
  ok(`${year} ${make}: its prefill is "${year} ${make} " and nothing else`, !!w && w.prefill === `${year} ${make} `, w && JSON.stringify(w.prefill));
  ok(`${year} ${make}: the way out is not one of the model buttons`, !!mc && !(mc.modelOptions || []).includes(w && w.label));
  // 3. it reaches the normal engine path: the typed text after the prefill is resolved by the same resolver as any search
  const hit = await V.resolveVehicle((w ? w.prefill : "") + typed, {}), miss = await V.resolveVehicle((w ? w.prefill : "") + "Fooble", {});
  ok(`${year} ${make}: "${typed}" typed after the prefill resolves like any typed search`, hit.status === "valid" && hit.vehicle && hit.vehicle.model === model, `${hit.status} ${hit.vehicle && hit.vehicle.model}`);
  ok(`${year} ${make}: a model the engine cannot match takes the normal path (the typed words go on to the engine, which answers with its own no-match line; no figures come from the page)`, (miss.status === "valid" && miss.vehicle && /fooble/i.test(String(miss.vehicle.model))) || miss.status === "needs_clarification", `${miss.status} ${miss.vehicle && miss.vehicle.model}`);
}
// 2. every question kind
const car = { year: 1995, make: "Honda", model: "Accord", nameModel: "Accord", trim: "EX" };
for (const [tier, kind, prefill] of [["model_choice", "model", "1995 Honda "], ["generation_choice", "generation", "Honda Accord "], ["body_choice", "body", "1995 Honda Accord EX "], ["trim_choice", "trim", "1995 Honda Accord "]]) {
  const d = W ? W.applyWayOut({ tier, resolvedCar: car }, null) : null;
  ok(`${tier}: the question carries a way out (${kind})`, !!d && !!d.wayOut && d.wayOut.kind === kind && d.wayOut.prefill === prefill, d && d.wayOut && JSON.stringify(d.wayOut.prefill));
  ok(`${tier}: the way out holds a label, a placeholder and a prefill and no matching logic`, !!d && !!d.wayOut && JSON.stringify(Object.keys(d.wayOut).sort()) === JSON.stringify(["id", "kind", "label", "mode", "placeholder", "prefill"]));
}
// the mapped identity question carries it too (what a page reads for generation, body and model)
{ const m = O.mapEngineAnswer({ tier: "generation_choice", generationOptions: [{ label: "993", query: "1995 Porsche 911 993" }], resolvedCar: { year: null, make: "Porsche", model: "911", nameModel: "911" } }, 1);
  ok("generation_choice: the mapped identityQuestion carries the way out", !!(m && m.identityQuestion && m.identityQuestion.wayOut && m.identityQuestion.wayOut.kind === "generation"), m && m.identityQuestion && JSON.stringify(m.identityQuestion.wayOut)); }
// 4. nothing is left without one: every *_choice tier the engine names is either a way out kind or a fact about one car with the engine's own skip
{ const src = fs.readFileSync("lib/onebox.js", "utf8"), tiers = [...new Set([...src.matchAll(/\btier: "([a-z]+_choice)"/g)].map(m => m[1]))];
  ok(`the engine's question tiers are known (${tiers.join(", ")})`, tiers.length >= 5);
  for (const t of tiers) ok(`${t}: has a way out or the engine's skip`, !!W && (!!W.WAY_OUT_TIER[t] || W.SKIP_TIERS.includes(t)));
  ok("the skip tiers do carry the engine's skip label", /skipLabel: "Just show what sold"/.test(src)); }
// 5. the resolver's own Which model ask (status needs_clarification) carries it too, in the response
{ const sd = fs.readFileSync("api/sellerDecision.js", "utf8"); ok("sellerDecision attaches wayOut to a Which model clarification", /wayOutFor\("model", resolution\.vehicle\)/.test(sd)); }
console.log(fail ? `questionWayOutCheck: ${fail} failure(s)` : "questionWayOutCheck: all pass");
process.exit(fail ? 1 : 0);
