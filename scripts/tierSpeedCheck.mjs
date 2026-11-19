// CONDITION TIER JOB, FAST ENOUGH TO FINISH (Lane B, Nov 5 2026, Condition tier run #2: 100 rows in a minute, 3 slow batches, stopped). No database, no network (a fake PostgREST).
// CAUSE: rows were read in id order (a random uuid), so a batch of 100 held about 100 models; only 8 model reads were allowed per batch, so each batch wrote the few rows whose model it had just read and
// the rest waited; the slow judgement then summed the row read, the model reads and the write and compared the TOTAL with 3 s. Affects every model in the untiered archive and every nightly run.
//   (1) rows are taken model by model: every model is read once, the writes are full batches, far fewer database requests than the id-order job on the same sales
//   (2) the tiers are IDENTICAL to the id-order job's on >= 2000 sales, and a stopped-and-resumed run gives the same answer as an uninterrupted one
//   (3) slowness is the DATABASE's: a batch full of useful work whose every request is fast is not slow; a slow row read, model read or write is; one request over the hard ceiling stops at once; a failed read throws
//   (4) priority: the Desk's models, then the most searched, then the rest; a run stopped early leaves the priority pools complete
//   node scripts/tierSpeedCheck.mjs [repo root]      --mutants proves each rule by breaking the job in a copy
import fs from "node:fs"; import path from "node:path"; import os from "node:os"; import { fileURLToPath, pathToFileURL } from "node:url"; import { spawnSync } from "node:child_process";
import { poolRows, poolParam } from "./fixtures/poolFake.mjs";
const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2), rootArg = args.find(a => !a.startsWith("--"));
const ROOT = path.resolve(rootArg || path.join(here, ".."));
if (args.includes("--mutants")) {
  const J = "scripts/assignConditionTier.mjs";
  const muts = [
    ["slowness judged on the TOTAL again (rows read + model reads + write)", J, s => s.replace("const dbMax = Math.max(dbReadMax, dbBandMax, writeMs), isSlow = dbMax > slow;", "const dbMax = dbReadMs + dbBandMs + writeMs, isSlow = dbMax > slow;"), /\(3\) a batch of useful work/],
    ["a really slow database is not noticed (slow never true)", J, s => s.replace("isSlow = dbMax > slow;", "isSlow = false;"), /\(3\) a slow (row read|write)/],
    ["a request over the hard ceiling does not stop the run", J, s => s.replace("const hard = dbMax > hardMs;", "const hard = false;"), /\(3\) one request over the hard ceiling/],
    ["a model's quartiles are read again every batch", J, s => s.replace("if (!bandMemo.has(k)) {", "if (true) {"), /\(1\) every model is read once|\(1\) and still reads/],
    ["models are no longer taken together (the rest is read in id order)", J, s => s.split('"model,id")').join('"id")'), /\(1\) both finish|\(1\) with 600|\(2\)/],
    ["the priority models are not taken first", J, s => s.replace("for (const u of priority) { if (stopped) break; await drain(", "for (const u of []) { if (stopped) break; await drain("), /\(4\) the priority models/],
    ["a failed model read is treated as no band", J, s => s.replace("if (got.failed) { deferredThisPass += list.length;", "if (false) { deferredThisPass += list.length;"), /\(3\) a failed model read/],
    ["a model's quartiles are dropped before its sales are tiered", J, s => s.replace("bandFailsInARow = 0; bandMemo.set(k, got.bands);\n      }\n      acc.push(...list);", "bandFailsInARow = 0; bandMemo.set(k, null);\n      }\n      acc.push(...list);"), /\(2\) the same tier/]
  ];
  let survivors = 0;
  for (const [name, file, f, want] of muts) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tspeed-"));
    spawnSync("rsync", ["-a", "--exclude", ".git", "--exclude", "node_modules", "--exclude", "proofs", ROOT + "/", dir + "/"]);
    fs.symlinkSync(path.join(ROOT, "node_modules"), path.join(dir, "node_modules"));
    const fp = path.join(dir, file), src = fs.readFileSync(fp, "utf8"), m = f(src);
    if (m === src) { console.log(`MUTANT NOT APPLIED  ${name}`); survivors++; fs.rmSync(dir, { recursive: true, force: true }); continue; }
    fs.writeFileSync(fp, m);
    const r = spawnSync(process.execPath, [path.join(dir, "scripts/tierSpeedCheck.mjs"), dir], { encoding: "utf8" });
    const out = (r.stdout || "") + (r.stderr || ""), killed = r.status !== 0 && out.split("\n").some(l => /^FAIL/.test(l) && want.test(l));
    console.log(`${killed ? "killed  " : "SURVIVED"}  ${name}`); if (!killed) { survivors++; console.log(out.split("\n").filter(l => /^FAIL|rror/.test(l)).slice(0, 3).join("\n")); }
    fs.rmSync(dir, { recursive: true, force: true });
  }
  console.log(survivors ? `\n${survivors} mutant(s) survived` : "\nall mutants killed"); process.exit(survivors ? 1 : 0);
}
let failed = 0; const ok = (n, c, d) => { if (!c) failed++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`); };
const imp = f => import(pathToFileURL(path.join(ROOT, f)).href);
const T = await imp("lib/conditionTier.js"), NEW = await imp("scripts/assignConditionTier.mjs"), OLD = await imp("scripts/fixtures/tierJobBefore.mjs"), P = await imp("lib/tierPriority.js");

// a deterministic sample of sales: ids are shuffled like uuids, models are spread over the ids, texts vary the signals the rules read
let seed = 12345; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
const WORDS = ["", "One owner, service records, no accidents.", "Restored in 2019.", "Project car, needs work.", "Original paint, matching numbers, garaged.", "Modified suspension and wheels.", "Salvage title, accident history.", "Complete service history, books and tools.", "Numbers matching, never restored."];
function makeRows(n, models) {
  const rows = Array.from({ length: n }, (_, i) => { const m = Math.floor(rnd() * models); return { id: "", year: 1960 + (i % 60), make: "Make" + (m % 17), model: "Model" + m, listing_title: (i % 9 === 0 ? "Project " : "") + (1960 + (i % 60)) + " Make" + (m % 17) + " Model" + m, description: WORDS[Math.floor(rnd() * WORDS.length)], mileage_text: rnd() < 0.85 ? String(1000 + Math.floor(rnd() * 150000)) : null, stated_mileage: null, title_status: rnd() < 0.2 ? "Salvage" : "Clean", modifications: null, project_flag: rnd() < 0.05 ? true : null, condition_version: null }; });
  const hex = x => x.toString(16).padStart(12, "0");
  const ids = rows.map((_, i) => i).sort(() => rnd() - 0.5);
  rows.forEach((r, i) => { r.id = "00000000-0000-4000-8000-" + hex(ids[i] + 1); });
  return rows;
}
function world(rows, opts = {}) {
  const w = { rows: rows.map(r => ({ ...r })), st: { now: 0, rpc: 0, bands: 0, rowReads: 0, readMs: 100, bandMs: 100, rpcMs: 100, failRead: false, failRpcAt: 0, bandOver: null, maxPayload: 0, firstWrites: [] }, ...opts };
  const f = async (url, init = {}) => {
    const u = new URL(String(url)), st = w.st;
    if (u.pathname.endsWith("/rpc/set_condition_tiers")) {
      st.rpc++; const p = JSON.parse(init.body).p; st.maxPayload = Math.max(st.maxPayload, p.length); if (st.firstWrites.length < 400) st.firstWrites.push(...p.map(x => x.id));
      if (st.failRpcAt && st.rpc === st.failRpcAt) throw new Error("socket hang up");
      for (const x of p) { const r = w.rows.find(q => q.id === x.id); r.condition_version = x.version; r.condition_tier = x.tier; r.condition_evidence = x.evidence; }
      st.now += st.rpcMs; return new Response(String(p.length), { status: 200 });
    }
    if (u.pathname.endsWith("/sales_archive")) {
      const sp = u.searchParams, sel = sp.get("select") || "";
      if (sel === "mileage_text") { st.bands++; st.now += st.bandMs; return new Response(JSON.stringify(poolRows(w.rows, sp).map(r => ({ mileage_text: r.mileage_text }))), { status: 200 }); }
      st.rowReads++; st.now += st.readMs; if (st.failRead) return new Response("boom", { status: 500 });
      const gt = (sp.get("id") || "gt.").replace("gt.", ""), lim = Number(sp.get("limit") || 500), cv = sp.get("condition_version") || "", ord = sp.get("order") || "id";
      const col = (k, r) => { const c = sp.get(k); if (!c) return true; if (c.startsWith("eq.")) return r[k] === c.slice(3); if (c.startsWith("gt.")) return String(r[k]) > c.slice(3); if (c.startsWith("ilike.")) return String(r[k] || "").toLowerCase() === c.slice(6).toLowerCase(); if (c === "not.is.null") return r[k] != null; return true; };
      let todo = w.rows.filter(r => r.id > gt && col("make", r) && col("model", r) && (sp.has("or") ? (r.make == null || r.model == null) && r.condition_version == null : /is\.null/.test(cv) ? r.condition_version == null : /neq\./.test(cv) ? r.condition_version != null && r.condition_version !== T.TIER_VERSION : true));
      todo = todo.sort((x, y) => ord === "id" ? (x.id < y.id ? -1 : 1) : /^model/.test(ord) ? String(x.model).localeCompare(String(y.model)) || (x.id < y.id ? -1 : 1) : String(x.make).localeCompare(String(y.make)) || String(x.model).localeCompare(String(y.model)) || (x.id < y.id ? -1 : 1)).slice(0, lim);
      return new Response(JSON.stringify(todo.map(({ condition_tier: _t, condition_evidence: _e, ...r }) => r)), { status: 200 });
    }
    return new Response("[]", { status: 200 });
  };
  w.f = f; globalThis.fetch = f; return w;
}
const env = { supabaseUrl: "https://fake.example", supabaseKey: "k" };
const run = (J, w, o = {}) => { globalThis.fetch = o.fetchImpl || w.f; return J.runJob({ env, log: () => {}, sleep: async () => {}, now: () => w.st.now, fetchImpl: w.f, pause: 0, ...o }); };

// (1) model by model: each model read once, every sale tiered where the id-order job leaves sales waiting, writes are full batches
const base = makeRows(2400, 120);
{
  const a = world(base), b = world(base);
  const oo = await run(OLD, a, { batch: 100, bandReads: 20 }), nn = await run(NEW, b, { batch: 100, bandReads: 20 });
  const models = new Set(base.map(r => r.model)).size;
  ok("(1) both finish every sale when a model holds ~20 sales", oo.done === 2400 && nn.done === 2400, `old ${oo.done}, new ${nn.done}`);
  ok("(1) every model is read once", b.st.bands === models, `${b.st.bands} model reads for ${models} models`);
  ok("(1) the writes are full batches", b.st.rpc <= Math.ceil(2400 / 100) * 1.25 && b.st.maxPayload === 100, `${b.st.rpc} writes of up to ${b.st.maxPayload}`);
  const many = makeRows(2400, 600), a2 = world(many), b2 = world(many);
  const o2 = await run(OLD, a2, { batch: 100, bandReads: 8 }), n2 = await run(NEW, b2, { batch: 100, bandReads: 8 });
  ok("(1) with 600 models (4 sales each) the new job tiers every sale in one run where the id-order job leaves sales waiting on a model read", n2.done === 2400 && o2.done < 2400, `old ${o2.done}, new ${n2.done}`);
  ok("(1) and still reads each model once", b2.st.bands === new Set(many.map(r => r.model)).size, `${b2.st.bands} model reads`);
}
// (2) identical tiers, identical evidence; resumed = uninterrupted
{
  const a = world(base), b = world(base);
  await run(OLD, a, { batch: 100, bandReads: 8 }); await run(NEW, b, { batch: 100, bandReads: 8 });
  const mapOf = w => new Map(w.rows.map(r => [r.id, JSON.stringify([r.condition_version, r.condition_tier ?? null, r.condition_evidence])]));
  const ma = mapOf(a), mb = mapOf(b); let diff = 0; for (const [id, v] of ma) if (mb.get(id) !== v) diff++;
  ok(`(2) the same tier and the same evidence for all ${base.length} sales as the id-order job`, diff === 0 && base.length >= 2000, `${diff} differ`);
  const tiers = [0, 0, 0, 0, 0]; for (const r of b.rows) tiers[r.condition_tier == null ? 4 : r.condition_tier - 1]++;
  ok("(2) the sample spans every tier and untiered (it is a real test)", tiers.every(x => x > 0), tiers.join("/"));
  const c = world(base); let o1 = await run(NEW, c, { batch: 100, max: 700, bandReads: 8 }); const o2 = await run(NEW, c, { batch: 100, bandReads: 8 });
  ok("(2) a run stopped at --max and resumed gives the same answer as an uninterrupted one", o1.stopped === "max" && o1.done === 700 && o2.done === 1700 && JSON.stringify([...mapOf(c)]) === JSON.stringify([...mb]), `${o1.done} then ${o2.done}`);
  const d = world(base); d.st.failRpcAt = 6; let threw = null; try { await run(NEW, d, { batch: 100, bandReads: 8 }); } catch (e) { threw = e; }
  const wrote = d.rows.filter(r => r.condition_version).length; const o3 = await run(NEW, d, { batch: 100, bandReads: 8 });
  ok("(2) a write that fails stops loudly, and the rerun finishes with the same answer", !!threw && wrote === d.rows.filter(r => r.condition_version).length - o3.done && JSON.stringify([...mapOf(d)]) === JSON.stringify([...mb]), `wrote ${wrote} then ${o3.done}`);
}
// (3) slowness is the database's
{
  const w = world(base); w.st.readMs = 100; w.st.bandMs = 300; w.st.rpcMs = 300;   // every request fast; a batch of 8 model reads + a row read per model + a write is several seconds
  const o = await run(NEW, w, { batch: 100, bandReads: 8, slow: 1000, strikes: 3 });
  ok("(3) a batch of useful work whose every request is fast is not slow (it runs to the end)", o.stopped === null && o.done === 2400, `stopped ${o.stopped}, done ${o.done}`);
  const r = world(base); r.st.readMs = 4000;
  const or = await run(NEW, r, { batch: 100, bandReads: 8, slow: 2500, strikes: 3 });
  ok("(3) a slow row read stops the run after the strikes (resumable)", or.stopped === "slow" && or.done < 2400, `stopped ${or.stopped}, done ${or.done}`);
  const m = world(base); m.st.bandMs = 4000;
  const om = await run(NEW, m, { batch: 100, bandReads: 8, slow: 2500, strikes: 3 });
  ok("(3) a slow model read stops the run", om.stopped === "slow" && om.done < 2400, `stopped ${om.stopped}, done ${om.done}`);
  const x = world(base); x.st.rpcMs = 4000;
  const ox = await run(NEW, x, { batch: 100, bandReads: 8, slow: 2500, strikes: 3 });
  ok("(3) a slow write stops the run", ox.stopped === "slow" && ox.done < 2400, `stopped ${ox.stopped}, done ${ox.done}`);
  const h = world(base); h.st.readMs = 20000;
  const oh = await run(NEW, h, { batch: 100, bandReads: 8, slow: 2500, strikes: 99, hardMs: 15000 });
  ok("(3) one request over the hard ceiling stops the run at once", oh.stopped === "slow" && oh.flushes <= 1, `flushes ${oh.flushes}, done ${oh.done}`);
  const f = world(base); f.st.failRead = true; let t = null; try { await run(NEW, f, { batch: 100 }); } catch (e) { t = e; }
  ok("(3) a failed read throws (fails closed): nothing written, no quiet 'finished'", !!t && f.st.rpc === 0, t ? t.message.slice(0, 80) : "no throw");
  const fm = world(base); const orig = fm.f; let bad = base[0].model; globalThis.fetch = fm.f = async (url, init) => { const u = new URL(String(url)); if ((u.searchParams.get("select") === "mileage_text") && poolParam(u.searchParams) === "eq." + bad || u.searchParams.get("model_family") === "eq." + bad) return new Response("boom", { status: 500 }); return orig(url, init); };
  let tm = null; try { await run(NEW, fm, { batch: 100, bandReads: 8, fetchImpl: fm.f }); } catch (e) { tm = e; }
  ok("(3) a failed model read is not 'no band': its sales are not stamped and the run says so", !!tm && fm.rows.filter(r => r.model === bad).every(r => !r.condition_version), tm ? tm.message.slice(0, 70) : "no throw");
}
// (4) priority
{
  const rows = makeRows(2400, 120), w = world(rows);
  const first = ["Model7", "Model33", "Model90"].map(model => ({ make: rows.find(r => r.model === model).make, model }));
  const want = new Set(rows.filter(r => first.some(f => f.model === r.model)).map(r => r.id));
  const o = await run(NEW, w, { batch: 100, bandReads: 8, max: want.size, priority: first });
  const done = w.rows.filter(r => r.condition_version);
  ok("(4) the priority models are taken first: stopped early, they are complete and nothing else is touched", o.stopped === "max" && done.length === want.size && done.every(r => want.has(r.id)), `done ${done.length} of ${want.size}`);
  const lower = world(rows); const fl = first.map(f => ({ make: f.make.toUpperCase(), model: f.model.toLowerCase() }));
  await run(NEW, lower, { batch: 100, bandReads: 8, max: want.size, priority: fl });
  ok("(4) a model is matched without case (the archive's spelling may differ)", lower.rows.filter(r => r.condition_version).length === want.size);
  const none = world(rows); await run(NEW, none, { batch: 100, bandReads: 8, priority: [{ make: "Nobody", model: "Nothing" }] });
  ok("(4) a priority model with nothing untiered costs one empty read and the rest still finishes", none.rows.every(r => r.condition_version));
  const ord = P.orderUnits([{ make: "A", model: "x" }, { make: "B", model: "y" }], [{ make: "b", model: "Y" }, { make: "C", model: "z" }]);
  ok("(4) Desk models first, then the searched ones, each model once", ord.map(u => u.make + u.model).join() === "Ax,By,Cz", ord.map(u => u.make + u.model).join());
  ok("(4) the Desk list names the Hagerty comparison's makes", P.DESK_UNITS.some(u => u.make === "Porsche" && u.model === "911") && P.DESK_UNITS.some(u => u.make === "Ferrari") && P.DESK_UNITS.length >= 60);
  const s = await P.searchedUnits(env, { select: async () => null });
  ok("(4) an unreadable search ranking is soft: no searched units, the Desk and the rest still run", s.read === false && s.units.length === 0);
}
console.log(failed ? `\ntierSpeedCheck: ${failed} FAILED` : "\ntierSpeedCheck: all passed");
process.exit(failed ? 1 : 0);
