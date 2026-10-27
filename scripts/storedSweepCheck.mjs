// e95: the read-only ops task storedsweep runs the engine's checks over stored answers. Offline: a fake database with stored answers (a clean one, a pool
// whose count is not its sales, another car's sales under the car, a noise word in the stored trim, bodies priced apart); the task must find each and nothing else,
// and must write nothing.   node scripts/storedSweepCheck.mjs [repo root]
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
const root = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
process.env.PROBE_KEY = "k"; process.env.OLDCARSDATA_API_KEY = "x"; process.env.SUPABASE_URL = "https://fake.supabase.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "s";
const ENGV = (await import(pathToFileURL(path.join(root, "lib/onebox.js")).href)).ENGINE_VERSION;
let failed = 0; const ok = (n, c, d) => { if (!c) failed++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`); };
const sale = (i, title, price, model, body) => ({ id: "id" + i, raw_title: title, rtitle: title, title, make: "Acme", model, year: 1990, _usd: price, auction_end_date: "2026-0" + (1 + (i % 9)) + "-10", body_style: body });
const pool = (n, make, model, titleFn, base, body) => Array.from({ length: n }, (_, i) => sale(i, titleFn(i), base + i * 500, model, body));
const card = r => ({ id: r.id, title: r.title, make: r.make, model: r.model, price: r._usd });
const answer = (rows, extra = {}) => ({ tier: "result", poolN: rows.length, rawPool: rows, cards: rows.slice(1, 5).map(card), cluster: [rows[1]._usd, rows[rows.length - 2]._usd], resolvedCar: { make: "Acme", model: "Zephyr", year: 1990 }, qualifyingTotal: rows.length, ...extra });
const clean = answer(pool(10, "Acme", "Zephyr", i => "1990 Acme Zephyr " + i, 20000));
const badCount = answer(pool(10, "Acme", "Zephyr", i => "1990 Acme Zephyr " + i, 20000), { poolN: 13 });
const wrongCar = answer(pool(10, "Acme", "Zephyr", i => "1990 Acme Sprinter " + i, 20000));
const noiseTrim = answer(pool(10, "Acme", "Zephyr", i => "1990 Acme Zephyr " + i, 20000), { resolvedCar: { make: "Acme", model: "Zephyr", year: 1990, trim: "13k-Kilometer" } });
const cp = pool(8, "Acme", "Zephyr", i => "1990 Acme Zephyr Coupe " + i, 20000, "Coupe"), cv = pool(8, "Acme", "Zephyr", i => "1990 Acme Zephyr Convertible " + (i + 8), 70000, "Convertible");
const apart = answer([...cp, ...cv].map((r, i) => ({ ...r, id: "p" + i })), { bodyOptions: [{ value: "coupe", label: "Coupe", n: 8, inPool: 8, own: { n: 8, low: 20500, high: 22000, median: 21500, windowMonths: 12 } }, { value: "convertible", label: "Convertible", n: 8, inPool: 8, own: { n: 8, low: 70500, high: 72000, median: 71500, windowMonths: 12 } }] });
const stored = { "MCWARM:clean": clean, "MCWARM:badcount": badCount, "MCWARM:wrongcar": wrongCar, "MCWARM:noisetrim": noiseTrim, "MCWARM:apart": apart, "MCWARM:refusal": { tier: "refusal" } };
let writes = 0;
globalThis.fetch = async (url, init) => {
  const u = new URL(String(url)); if (init && init.method && init.method !== "GET") writes++;
  if (u.pathname.endsWith("/spec_market_cache")) { const keys = Object.keys(stored).sort(); const after = (u.searchParams.get("spec_key") || "") === "like.MCWARM:*" ? "" : (u.searchParams.getAll("spec_key").find(v => v.startsWith("gt.")) || "").slice(3);
    return new Response(JSON.stringify(keys.filter(k => k > after).map(k => ({ spec_key: k, ev: ENGV, raw: stored[k] }))), { status: 200 }); }
  return new Response("[]", { status: 200 });
};
const H = await import(pathToFileURL(path.join(root, "api/usageDashboard.js")).href);
const run = async () => { let body = null, code = 0; const res = { status(c) { code = c; return this; }, json(b) { body = b; return this; }, setHeader() {}, send(b) { body = b; return this; }, end() { return this; } };
  await H.default({ method: "GET", query: { view: "ops", task: "storedsweep" }, headers: { "x-ops-key": "k" }, body: null }, res); return { code, body }; };
const { code, body } = await run();
ok("the task answers", code === 200 && body && body.task === "storedsweep", `HTTP ${code}`);
ok("it reads every stored row and writes nothing", body && body.rows === 6 && body.writes === 0 && writes === 0, `rows ${body && body.rows}, writes ${writes}`);
ok("a count that is not the pool is found, and only that one", body && body.setViolations === 1 && body.first.setViolations[0].key === "badcount", JSON.stringify(body && body.first.setViolations));
ok("another car's sales under the car are found", body && body.wrongModel >= 1 && body.first.wrongModel.some(x => x.key === "wrongcar"), JSON.stringify(body && body.first.wrongModel));
ok("a noise word in a stored trim is found", body && body.noiseTrim === 1 && body.first.noiseTrim[0].key === "noisetrim", JSON.stringify(body && body.first.noiseTrim));
ok("bodies priced apart are counted as apart; the others alike", body && body.pooled.apart === 1 && body.pooled.alike === 4 && body.first.apart[0].key === "apart", JSON.stringify(body && body.pooled));
console.log(failed ? `storedSweepCheck: ${failed} FAIL` : "storedSweepCheck: all PASS");
process.exit(failed ? 1 : 0);
