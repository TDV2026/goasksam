// NEVER DOTS (Sam, Oct 28 2026). No answer, fixture or code carries a dots chart type or a per-sale point series. Scans lib, api and public/js for a "dots" chart type and a quarter's sale-price series, the fixtures for a
// dots key or a quarter with prices, and runs the engine: a thin pool is withheld, and a stored answer that still holds quarter prices is served without them. The Desk's own overlay (public/js/desk.js, a crew
// analytics product with its own mode switch) is named in EXEMPT, not scanned; whether it stays is Sam's call.
//   node scripts/chartNoDotsCheck.mjs [repo root]
import path from "path";
import fs from "fs";
import { fileURLToPath, pathToFileURL } from "url";
const root = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
let failed = 0; const ok = (n, c, d) => { if (!c) failed++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`); };
const EXEMPT = new Set(["public/js/desk.js"]);
const walk = (d, out = []) => { const full = path.join(root, d); if (!fs.existsSync(full)) return out; for (const e of fs.readdirSync(full, { withFileTypes: true })) { const p = d + "/" + e.name; if (e.isDirectory()) { if (e.name !== "node_modules") walk(p, out); } else if (/\.(m?js)$/.test(e.name)) out.push(p); } return out; };
const files = [...walk("lib"), ...walk("api"), ...walk("public/js")].filter(f => !EXEMPT.has(f));
const PATTERNS = [[/type:\s*["']dots["']/, 'a chart type "dots"'], [/chart\.dots\b/, "chart.dots"], [/\bdots:\s*(null|\[|rows|dots)/, "a dots series"], [/prices:\s*rows\.map\(/, "a quarter's sale-price series"], [/prices:\s*Array\.isArray\(q\.prices\)/, "a quarter's sale-price series on the card"]];
const hits = [];
for (const f of files) { const lines = fs.readFileSync(path.join(root, f), "utf8").split("\n"); lines.forEach((l, i) => { if (/^\s*(\/\/|\*)/.test(l)) return; for (const [re, why] of PATTERNS) if (re.test(l)) hits.push(`${f}:${i + 1} ${why}`); }); }
ok("no code builds a dots chart or a per-sale series", hits.length === 0, hits.slice(0, 6).join(" | "));
const fx = [];
const fxDir = path.join(root, "scripts/fixtures");
if (fs.existsSync(fxDir)) for (const e of fs.readdirSync(fxDir)) if (e.endsWith(".json")) { const j = JSON.parse(fs.readFileSync(path.join(fxDir, e), "utf8")); const scan = o => { if (Array.isArray(o)) o.forEach(scan); else if (o && typeof o === "object") { if ("dots" in o) fx.push(e + ": dots"); if ("period" in o && "prices" in o) fx.push(e + ": quarter prices"); Object.values(o).forEach(scan); } }; scan(j); }
ok("no fixture carries dots or a quarter's sale prices", fx.length === 0, fx.slice(0, 4).join(" | "));
// the engine
globalThis.fetch = async () => new Response("[]", { status: 200 });
const E = await import(pathToFileURL(path.join(root, "lib/onebox.js")).href);
const day = i => new Date(Date.now() - i * 864e5).toISOString().slice(0, 10);
const thin = { tier: "result", poolN: 4, windowWords: "since June 2026", rawPool: Array.from({ length: 4 }, (_, i) => ({ auction_end_date: day(10 + i * 30), _usd: 30000 + i * 1000 })), trend: { quarters: [{ period: "2026-Q3", low: 1, high: 2, typical: 1, count: 4, thin: true, prices: [30000, 31000, 32000, 33000] }], movement: null } };
const served = E.withReadFields ? E.withReadFields(JSON.parse(JSON.stringify(thin)), "x", {}) : thin;
ok("a thin pool is never a dots chart", !served.chart || served.chart.type !== "dots");
ok("a stored answer that holds quarter sale prices is served without them", !(served.trend && served.trend.quarters || []).some(q => "prices" in q), JSON.stringify(served.trend && served.trend.quarters));
ok("the served chart holds no per-sale field", !served.chart || !/"(dots|prices|price|date)"/.test(JSON.stringify(served.chart)), served.chart ? JSON.stringify(Object.keys(served.chart)) : "");
const mapped = E.mapEngineAnswer ? E.mapEngineAnswer({ ...thin, tier: "result" }, 1) : {};
ok("the card's trend quarters carry no sale prices", !(mapped.trendQuarters || []).some(q => q && "prices" in q && q.prices));
process.exit(failed ? 1 : 0);
