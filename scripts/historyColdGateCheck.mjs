// clock: real-ok the fake archive answers after a few hundred real milliseconds so that the reads overlap
// THE HISTORY PAGES CANNOT STARVE SELL (Lane B, lane-b-read-resilience, Nov 18 2026; order bc85 item 6). Crawlers read /history VIN and hub pages cold in bulk (199 of the last 200 page views were /history, one VIN each) and each cold page runs a full engine
// read of the archive: 42 of the 50 failed archive reads on Nov 18 17:29 to 18:16 PT were History pages. CLASS: every History door that computes cold (a hub page and a VIN page) takes a slot from one gate; with HISTORY_COLD_SLOTS in flight a further page is
// the reading placeholder (cold.timedOut, cold.gated) and starts no read; a stored answer needs no slot; a slot is released when the read has ended; Sell, Market Check and Find are never behind the gate.
//   node scripts/historyColdGateCheck.mjs [repo root]      (a tree without the gate fails: run it on origin/main)      --mutants breaks one rule in a copy
import fs from "node:fs"; import path from "node:path"; import { spawnSync } from "node:child_process"; import { fileURLToPath, pathToFileURL } from "node:url";
const args = process.argv.slice(2), here = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.resolve(args.find(a => !a.startsWith("--")) || path.join(here, ".."));
if (args.includes("--mutants")) process.exit(mutants());
process.chdir(ROOT);

let pass = 0, fail = 0; const fails = []; const ok = (n, c, d) => { if (c) pass++; else { fail++; fails.push(n + (d !== undefined ? " " + JSON.stringify(d).slice(0, 240) : "")); } };
console.error = () => {};
const mk = (i, over = {}) => {
  const raw = { id: "ocd" + i, title: `${1999 + (i % 5)} Porsche 911 Carrera ${i}`, featured_image_url: `https://img.example/${i}.jpg`, mileage: `${20000 + i * 37}`, body_style: "Coupe",
    modifications: null, currency: "USD", transmission: "Manual (6-Speed)", exterior_color: "Black", title_status: "Clean", url: `https://bat.example/${i}`, source_url: `https://src.example/${i}`,
    city: "Austin", state: "TX", country_code: "US", auction_end_precision: "day", ...over };
  return { id: "uuid-" + String(i).padStart(5, "0"), source_id: raw.id, sale_price: 30000 + (i % 40) * 700, sale_date: new Date(Date.now() - (5 + i) * 864e5).toISOString().slice(0, 10), platform: "Bring a Trailer",
    listing_title: raw.title, year: 1999 + (i % 5), make: "Porsche", model: "911", vin_norm: null, stated_mileage: null, project_flag: null, desc_facts: null, has_reserve: false, raw_record: raw,
    vehicle_type: "car" };
};
const FIX = Array.from({ length: 60 }, (_, i) => mk(i));
const BIG = Array.from({ length: 1100 }, (_, i) => mk(i));   // two pages

const jt = v => v === null || v === undefined ? null : typeof v === "string" ? v : JSON.stringify(v);
const evalItem = (row, item) => {
  const ci = item.indexOf(":"); const hasAlias = ci > 0 && item[ci + 1] !== ":";
  const alias = hasAlias ? item.slice(0, ci) : null; const expr = hasAlias ? item.slice(ci + 1) : item;
  if (expr.startsWith("raw_record->>")) return [alias || expr.slice(13), jt(row.raw_record[expr.slice(13)])];
  const col = expr.replace(/::text$/, "");
  return [alias || col, col in row ? row[col] : null];
};
const state = { src: FIX, delay: 0, reads: 0 };
globalThis.fetch = async (url, init = {}) => {
  const u = new URL(String(url)); const sel = u.searchParams.get("select") || "";
  if (u.pathname.endsWith("/sales_archive")) {
    state.reads++; if (state.delay) await new Promise(r => setTimeout(r, state.delay));
    const idf = u.searchParams.get("id");
    if (idf && /description/.test(sel)) { return new Response(JSON.stringify(state.src.filter(r => idf.includes(r.id)).map(r => ({ id: r.id, d: "" }))), { status: 200 }); }
    if (idf && /known_flaws/.test(sel)) { return new Response(JSON.stringify(state.src.filter(r => idf.includes(r.id)).map(r => ({ id: r.id, flaws: null, svc: null }))), { status: 200 }); }
    if (/^model$/.test(sel)) return new Response(JSON.stringify([{ model: "911" }, { model: "Cayman" }, { model: "Boxster" }]), { status: 200 });
    const byTitle = u.searchParams.get("listing_title") && !u.searchParams.get("model");
    const byModel = !!u.searchParams.get("model");
    if (!byTitle && !byModel) return new Response("[]", { status: 200 });
        const m = /^(\d+)-(\d+)$/.exec((init.headers || {}).Range || "");
    const from = m ? Number(m[1]) : 0, to = m ? Number(m[2]) : 999;
        const rows = state.src.slice(from, to + 1).map(r => Object.fromEntries(sel.split(",").map(it => evalItem(r, it))));
    return new Response(JSON.stringify(rows), { status: from + rows.length < state.src.length ? 206 : 200 });
  }
  return new Response("[]", { status: 200 });
};
const imp = f => import(pathToFileURL(path.join(ROOT, f)).href);
const E = await imp("lib/onebox.js"), HD = await imp("api/_historyData.js");
let GATE = null; try { GATE = await imp("lib/_coldGate.js"); } catch { /* a tree without the gate */ }
const env = { supabaseUrl: "https://fake.example", supabaseKey: "k", poolColumns: false };
const id = { year: 2001, make: "Porsche", family: "911", vehicle: { year: 2001, make: "Porsche", model: "911", raw: "2001 Porsche 911" } };
ok("lib/_coldGate.js exists", !!GATE);
const hub = async () => { const cold = {}; const d = await HD.oneBoxFor(env, id, null, { cold }); return { d, cold }; };
const vin = async n => { const cold = {}; const d = await HD.oneBoxFor(env, id, { price: 30000, date: "2026-01-01", vin: "WP0AA29962S62" + String(1000 + n) }, { vin: "WP0AA29962S62" + String(1000 + n), cold }); return { d, cold }; };
if (process.env.GT_DEBUG) { const d0 = (await E.oneEngineAnswer({ year: 2001, make: "Porsche", model: "911", raw: "2001 Porsche 911", trim: "" }, null, "2001 Porsche 911", { ...env, asked: 0, noStageLog: true }, null)).raw; console.log("DBG0", d0.tier); }
// six hub pages at once, a slow archive, two slots
state.delay = 350; GATE && GATE.resetColdGate(); process.env.HISTORY_COLD_SLOTS = "2";
{ const rs = await Promise.all(Array.from({ length: 6 }, hub)); const gated = rs.filter(r => r.cold.gated).length, served = rs.filter(r => r.d && r.d.tier).length;
  ok("six cold hub pages at once with two slots: four are the reading placeholder (gated, timedOut), two are read", gated === 4 && rs.filter(r => r.cold.gated).every(r => r.cold.timedOut === true && r.d === null), { gated, served });
  ok("the two that held a slot were answered", served === 2, served); }
await new Promise(r => setTimeout(r, 200));
ok("every slot is released when the reads have ended", GATE && GATE.coldState("history").inflight === 0, GATE && GATE.coldState("history"));
{ const r = await hub(); ok("the next page after the others finished is read again (no leak)", !r.cold.gated && r.d && r.d.tier, r.cold); }
// a gated page starts no archive read
{ GATE && GATE.resetColdGate(); state.reads = 0; const held = [GATE && GATE.acquireCold("history"), GATE && GATE.acquireCold("history")]; const r = await hub();
  ok("with every slot taken a page is gated and starts no archive read", r.cold.gated === true && state.reads === 0, { cold: r.cold, reads: state.reads }); held.forEach(f => f && f()); }
// the VIN door takes a slot too
{ GATE && GATE.resetColdGate(); const rs = await Promise.all(Array.from({ length: 5 }, (_, i) => vin(i))); const gated = rs.filter(r => r.cold.gated).length;
  ok("five cold VIN pages at once with two slots: three are gated (the VIN door is behind the same gate)", gated === 3, { gated, sources: rs.map(r => r.cold.source) });
  for (let i = 0; i < 80 && GATE && GATE.coldState("history").inflight > 0; i++) await new Promise(r => setTimeout(r, 250)); ok("the VIN slots are released", GATE && GATE.coldState("history").inflight === 0, GATE && GATE.coldState("history")); }
// Sell is never behind the gate: the same engine read of a car, from the Sell caller, while every History slot is taken
{ GATE && GATE.resetColdGate(); const held = [GATE && GATE.acquireCold("history"), GATE && GATE.acquireCold("history")]; state.delay = 0;
  const C = await imp("lib/_caller.js"); const d = await (async () => (await E.oneEngineAnswer({ year: 2001, make: "Porsche", model: "911", raw: "2001 Porsche 911", trim: "" }, null, "2001 Porsche 911", { ...env, asked: 0, noStageLog: true }, null)).raw)();
  ok("Sell's read of a car is answered while every History slot is taken", d && /^(result|thin)$/.test(String(d.tier)), d && { tier: d.tier, why: d.samLine, rf: d.readFailed, st: d.readFailedStage }); held.forEach(f => f && f()); }
ok("the gate's limit is 2 by default, settable, and applies to History only", (() => { if (!GATE) return false; delete process.env.HISTORY_COLD_SLOTS; return GATE.coldLimit("history") === 2 && GATE.coldLimit("sell") > 1000; })());
console.log(`historyColdGateCheck: ${pass} pass, ${fail} FAIL` + (fail ? "\n" + fails.map(f => "  FAIL " + f).join("\n") : ""));
process.exit(fail ? 1 : 0);

function mutants() {
  const SRC = ROOT, COPY = fs.mkdtempSync(path.join(path.dirname(SRC), "goasksam-b-cgmut-"));
  spawnSync("sh", ["-c", `cd "${SRC}" && for d in lib api public data scripts package.json; do cp -R "$d" "${COPY}/" 2>/dev/null; done; ln -s "${SRC}/node_modules" "${COPY}/node_modules"`]);
  const rd = f => fs.readFileSync(path.join(COPY, f), "utf8"), wr = (f, s) => fs.writeFileSync(path.join(COPY, f), s);
  const MUT = [
    ["no limit on cold History reads", "lib/_coldGate.js", s => s.replace("if (s.inflight >= coldLimit(name))", "if (false)")],
    ["the hub door takes no slot", "api/_historyData.js", s => s.replace("const slot = acquireCold(\"history\"); if (!slot) { if (opts && opts.cold) { opts.cold.timedOut = true; opts.cold.gated = true; } return null; }", "const slot = () => {};")],
    ["the VIN door takes no slot", "api/_historyData.js", s => s.replace("const slot = acquireCold(\"history\"); if (!slot) { cold.source = \"gated\"; cold.timedOut = true; cold.gated = true; return null; }", "const slot = () => {};")],
    ["a slot is never released on the hub door", "api/_historyData.js", s => s.replace("if (gate && gate.returned && gate.pending === 0 && gate.release) { const r = gate.release; gate.release = null; r(); }", "")],
    ["a slot is never released on the VIN door", "api/_historyData.js", s => s.replace("const job = exact().finally(() => { slot(); return clearComputing(env, vkey).catch(() => {}); });", "const job = exact().finally(() => clearComputing(env, vkey).catch(() => {}));")],
    ["a gated page still starts its read", "api/_historyData.js", s => s.replace("if (!slot) { if (opts && opts.cold) { opts.cold.timedOut = true; opts.cold.gated = true; } return null; }", "if (!slot) { if (opts && opts.cold) { opts.cold.gated = true; } }")],
    ["the gate limits every caller, Sell too", "lib/_coldGate.js", s => s.replace("return name === \"history\" ? Math.max", "return true ? Math.max")]
  ];
  let bad = 0;
  for (const [name, file, fn] of MUT) {
    const orig = rd(file), next = fn(orig);
    if (next === orig) { console.log("STALE MUTANT (no change): " + name); bad++; continue; }
    wr(file, next);
    const r = spawnSync("node", [path.join(COPY, "scripts/historyColdGateCheck.mjs"), COPY], { encoding: "utf8", timeout: 300000 });
    wr(file, orig);
    const killed = r.status !== 0; console.log((killed ? "killed   " : "SURVIVED ") + name); if (!killed) bad++;
  }
  fs.rmSync(COPY, { recursive: true, force: true });
  console.log(bad ? `${bad} mutant(s) survived or stale` : `all ${MUT.length} mutants killed`);
  return bad ? 1 : 0;
}
