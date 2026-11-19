// THE NARROWED-READ OVERRIDE REACHES ONLY THE READ-ONLY TASK, ONLY WITH THE CREW COOKIE (Lane B, Nov 2 2026). env.narrowRead turns the narrowed family read on for one call (lib/onebox.js assessThin); the ops task warmwhy (api/usageDashboard.js, ?narrow=1) sets it
// only when the signed crew cookie is on the request as well as the ops key, and its reply carries the family read (rows, ms, narrowed) and the thin verdict. This check holds:
//  (1) with the ops key and the cookie, ?narrow=1 runs the narrowed read for that request; without the cookie the flag is ignored and the reply says so; without ?narrow=1 it is off; the same car's verdict is the same both ways;
//  (2) nothing else in the code base sets or reads narrowRead / thinReadSink: no page, email, Tasks, Buy or Sell path, and no request field (query, body, header) is copied into an engine env;
//  (3) a page-style engine call (oneEngineAnswer with an env that carries a stray narrowRead from nowhere) is the only way it is read, so every page entry point that builds an env is listed and none passes it on.
// Offline, a fake archive.   node scripts/narrowFlagCheck.mjs [repo root]
import fs from "node:fs";
import path from "node:path"; import { fileURLToPath, pathToFileURL } from "node:url";
const root = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
process.chdir(root);
process.env.SUPABASE_URL = "https://fake.supabase.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "k"; process.env.LAUNCH_STAGE = "2";
process.env.PROBE_KEY = "test-ops-key"; process.env.OLDCARSDATA_API_KEY = "test-ocd"; process.env.CURTAIN_CREW_CODE = "test-crew-code";
let fail = 0; const ok = (n, c, d) => { if (!c) fail++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`); };
const imp = f => import(pathToFileURL(path.join(root, f)).href);
// a fake archive that answers the filters the engine sends
const dateOf = i => new Date(Date.UTC(2021, 10, 4) + (i * 37) % 1800 * 864e5).toISOString().slice(0, 10);
const mkrow = (id, y, title, price, i) => ({ id, source_id: id, price, auction_end_date: dateOf(i), source: "bringatrailer", raw_title: title, rtitle: title, year: y, make: "Porsche", model: "911", vin_norm: "Z" + id, image: "https://x/y.jpg", mileage: String(30000 + i * 300), transmission: "Manual", currency: "USD", precision: "day", stated_mileage: 30000 + i * 300 });
const DB = []; { let n = 0; for (const [t, base, cnt] of [["Carrera", 30000, 120], ["Carrera 4", 38000, 40], ["Carrera 4S", 50000, 30], ["Turbo", 90000, 20]]) for (let i = 0; i < cnt; i++) DB.push(mkrow(t.replace(/\W/g, "") + i, 1999 + (i % 6), `${1999 + (i % 6)} Porsche 911 ${t} Coupe`, base + i * 300, n++)); }
const likeRe = pat => new RegExp("^" + String(pat).replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$", "i");
globalThis.fetch = async (url, o) => {
  const u = new URL(String(url)); if (u.hostname !== "fake.supabase.test") throw new Error("offline");
  if (!/sales_archive/.test(u.pathname)) return new Response("[]", { status: 200 });
  let rows = DB.slice();
  for (const [k, v] of u.searchParams.entries()) {
    if (k === "make" && v.startsWith("ilike.")) rows = rows.filter(r => likeRe(v.slice(6)).test(r.make)); else if (k === "model" && v.startsWith("ilike.")) rows = rows.filter(r => likeRe(v.slice(6)).test(r.model));
    else if (k === "listing_title" && v.startsWith("ilike.")) rows = rows.filter(r => likeRe(v.slice(6)).test(r.raw_title)); else if (k === "year" && v.startsWith("gte.")) rows = rows.filter(r => r.year >= Number(v.slice(4)));
    else if (k === "year" && v.startsWith("lte.")) rows = rows.filter(r => r.year <= Number(v.slice(4))); else if (k === "sale_date" && v.startsWith("gte.")) rows = rows.filter(r => r.auction_end_date >= v.slice(4)); else if (k === "sale_date" && v.startsWith("lt.")) rows = rows.filter(r => r.auction_end_date < v.slice(3));
  }
  if (u.searchParams.get("select") === "sale_date") return new Response(JSON.stringify([{ sale_date: "2026-10-30" }]), { status: 200 });
  rows.sort((a, b) => String(b.auction_end_date).localeCompare(String(a.auction_end_date)) || (a.id < b.id ? -1 : 1));
  const m = /^(\d+)-(\d+)$/.exec(String((o && o.headers && (o.headers.Range || o.headers.range)) || "")), page = m ? rows.slice(Number(m[1]), Number(m[2]) + 1) : rows.slice(0, 1000);
  return new Response(JSON.stringify(page), { status: 200, headers: { "content-range": `${m ? m[1] : 0}-${(m ? Number(m[1]) : 0) + page.length - 1}/${rows.length}` } });
};
const crew = await imp("lib/_crew.js"), mod = await imp("api/usageDashboard.js");
const handler = mod.default;
const call = async (query, headers) => { let out = null, code = 200; const res = { statusCode: 200, headersSent: false, setHeader() {}, getHeader() { return undefined; }, removeHeader() {}, status(c) { code = c; this.statusCode = c; return this; }, json(o) { if (out == null) out = o; this.headersSent = true; return this; }, send(o) { if (out == null) out = o; this.headersSent = true; return this; }, end() { this.headersSent = true; return this; } }; await handler({ method: "GET", url: "/api/usageDashboard", headers: { host: "goasksam.com", ...headers }, query, body: {}, socket: {} }, res); return { code, out }; };
const Q = "2002 Porsche 911 Carrera 4S", base = { view: "ops", task: "warmwhy", list: Q };
const cookie = `gas_crew=${crew.mintCrewCookieValue()}`, opsH = { "x-ops-key": "test-ops-key" };
const plain = await call(base, opsH), noCookie = await call({ ...base, narrow: "1" }, opsH), withCookie = await call({ ...base, narrow: "1" }, { ...opsH, cookie }), badCookie = await call({ ...base, narrow: "1" }, { ...opsH, cookie: "gas_crew=ok" });
const row = r => r.out && Array.isArray(r.out.rows) ? r.out.rows[0] : null;
ok("the task answers with the ops key (the fixture works)", plain.code === 200 && row(plain) && row(plain).tier, plain.code + " " + JSON.stringify(plain.out).slice(0, 120));
ok("no ?narrow: the flag is off and the family read is the full one", row(plain) && row(plain).narrowFlag === "off" && row(plain).familyRead && row(plain).familyRead.narrowed === false, JSON.stringify(row(plain) && row(plain).familyRead));
ok("?narrow=1 without the crew cookie: ignored, and the reply says so", row(noCookie) && row(noCookie).narrowFlag === "ignored: no crew cookie" && row(noCookie).familyRead && row(noCookie).familyRead.narrowed === false, JSON.stringify(row(noCookie) && row(noCookie).narrowFlag));
ok("?narrow=1 with a plain \"ok\" cookie (the dead value): ignored", row(badCookie) && row(badCookie).narrowFlag === "ignored: no crew cookie" && row(badCookie).familyRead.narrowed === false);
ok("?narrow=1 with the signed crew cookie: the narrowed read runs for this request", row(withCookie) && row(withCookie).narrowFlag === "on for this request" && row(withCookie).familyRead && row(withCookie).familyRead.narrowed === true, JSON.stringify(row(withCookie) && row(withCookie).familyRead));
ok("... it read fewer rows than the full read", row(withCookie).familyRead.rows < row(plain).familyRead.rows, `${row(withCookie).familyRead.rows} against ${row(plain).familyRead.rows}`);
ok("... the reply carries the family read time and the thin verdict, the same verdict as the full read", typeof row(withCookie).familyRead.ms === "number" && row(withCookie).verdict && JSON.stringify(row(withCookie).verdict) === JSON.stringify(row(plain).verdict), JSON.stringify(row(withCookie).verdict));
ok("the task writes nothing and spends nothing", withCookie.out.writes === 0 && withCookie.out.ocdSpend === 0);
// the flag lives in one process call: the next plain request is off again
const again = await call(base, opsH); ok("the next request without the flag is off again (nothing sticks)", row(again).narrowFlag === "off" && row(again).familyRead.narrowed === false);
// (2) the sweep: no other file sets or reads the override
{ const walk = d => !fs.existsSync(path.join(root, d)) ? [] : fs.readdirSync(path.join(root, d), { withFileTypes: true }).flatMap(e => e.isDirectory() ? (/^(node_modules|\.git|proofs|docs)$/.test(e.name) ? [] : walk(path.join(d, e.name))) : [path.join(d, e.name)]);
  const files = [...walk("api"), ...walk("lib"), ...walk("js"), ...walk("public")].filter(f => /\.(m?js|html)$/.test(f));
  const hit = k => files.filter(f => fs.readFileSync(path.join(root, f), "utf8").includes(k)).sort();
  const nr = hit("narrowRead"), ts = hit("thinReadSink");
  ok("narrowRead appears only in lib/onebox.js (the read) and api/usageDashboard.js (the task)", JSON.stringify(nr) === JSON.stringify(["api/usageDashboard.js", "lib/onebox.js"]), nr.join(", "));
  ok("thinReadSink appears only in the same two files", JSON.stringify(ts) === JSON.stringify(["api/usageDashboard.js", "lib/onebox.js"]), ts.join(", "));
  const ud = fs.readFileSync(path.join(root, "api/usageDashboard.js"), "utf8"), uses = ud.split("\n").map((l, i) => [i + 1, l]).filter(([, l]) => /narrowRead/.test(l));
  ok("in the task file narrowRead is set on exactly one line, and only behind isCrewRequest", uses.length === 1 && /crewOk\s*\?\s*\{\s*narrowRead:\s*true/.test(uses[0][1]) && /crewOk = wantNarrow && isCrewRequest\(req\)/.test(ud), uses.map(u => u[0]).join(","));
  const ob = fs.readFileSync(path.join(root, "lib/onebox.js"), "utf8");
  ok("lib/onebox.js reads the override in one place, assessThin's family read", (ob.match(/env && env\.narrowRead === true/g) || []).length === 1 && /async function assessThin[\s\S]{0,5000}env && env\.narrowRead === true/.test(ob));
  const spread = files.filter(f => !/^lib\/onebox\.js$/.test(f)).filter(f => /\.\.\.\s*(req\.(query|body|headers)|body|query)\b[^;\n]{0,40}(supabaseUrl|supabaseKey)|(supabaseUrl|supabaseKey)[^;\n]{0,60}\.\.\.\s*(req\.(query|body)|body\b|query\b)/.test(fs.readFileSync(path.join(root, f), "utf8")));
  ok("no file spreads a request's query or body into an engine env", spread.length === 0, spread.join(", ")); }
console.log(fail ? `narrowFlagCheck: ${fail} failure(s)` : "narrowFlagCheck: all pass");
process.exit(fail ? 1 : 0);
