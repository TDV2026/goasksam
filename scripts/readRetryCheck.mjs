// clock: real-ok the failure window is a few hundred milliseconds of the real clock around the retry pause
// A FAILED ARCHIVE READ IS RETRIED ONCE AFTER A SHORT PAUSE (Lane B, lane-b-read-resilience, Nov 18 2026; order bc85 item 2). On Nov 18 the archive pool read failed one read at a time (48 of 50 failures in the Vercel log had no other failure within two seconds)
// and the engine retried only a dropped connection, so a statement timeout or an unclassified error became "This one could not be read yet." on Sell. CLASS: every kind of failed read (timeout 57014, a 500 with another code, a 503 blip), on every road
// that reads the pool (a car, the same car as a visitor of Sell, Market Check and Find; the History pages and other bulk callers are rationed), and the rule that no answer is built on a failed read stays: a second failure is the still-reading answer, never a result.
//   node scripts/readRetryCheck.mjs [repo root]      (a tree without the fix fails: run it on origin/main)       --mutants breaks one rule in a copy
import fs from "node:fs"; import path from "node:path"; import { spawnSync } from "node:child_process"; import { fileURLToPath, pathToFileURL } from "node:url";
const args = process.argv.slice(2), here = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.resolve(args.find(a => !a.startsWith("--")) || path.join(here, ".."));
if (args.includes("--mutants")) process.exit(mutants());
process.chdir(ROOT);
const E = await import(pathToFileURL(path.join(ROOT, "lib/onebox.js")).href);
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
const state = { src: FIX, failUntil: 0, failStatus: 500, failBody: { code: "57014", message: "canceling statement due to statement timeout" }, reads: [], fails: 0 };
globalThis.fetch = async (url, init = {}) => {
  const u = new URL(String(url)); const sel = u.searchParams.get("select") || "";
  const fail = () => { state.fails++; return new Response(JSON.stringify(state.failBody), { status: state.failStatus }); };
  if (u.pathname.endsWith("/sales_archive")) {
    if (Date.now() < state.failUntil) return fail();
    const idf = u.searchParams.get("id");
    if (idf && /description/.test(sel)) { state.reads.push("desc"); if (state.failDesc) return fail(); return new Response(JSON.stringify(state.src.filter(r => idf.includes(r.id)).map(r => ({ id: r.id, d: "" }))), { status: 200 }); }
    if (idf && /known_flaws/.test(sel)) { state.reads.push("flaws"); if (state.failFlaws) return fail(); return new Response(JSON.stringify(state.src.filter(r => idf.includes(r.id)).map(r => ({ id: r.id, flaws: null, svc: null }))), { status: 200 }); }
    if (/^model$/.test(sel)) return new Response(JSON.stringify([{ model: "911" }, { model: "Cayman" }, { model: "Boxster" }]), { status: 200 });
    const byTitle = u.searchParams.get("listing_title") && !u.searchParams.get("model");
    const byModel = !!u.searchParams.get("model");
    if (!byTitle && !byModel) return new Response("[]", { status: 200 });
    if (byTitle && state.failTitleLeg) { state.reads.push("title-fail"); return fail(); }
    const m = /^(\d+)-(\d+)$/.exec((init.headers || {}).Range || "");
    const from = m ? Number(m[1]) : 0, to = m ? Number(m[2]) : 999;
    if (state.failPage2 && from >= 1000) { state.reads.push("page2-fail"); return fail(); }
    const rows = state.src.slice(from, to + 1).map(r => Object.fromEntries(sel.split(",").map(it => evalItem(r, it))));
    state.reads.push(byTitle ? "title" : "model");
    return new Response(JSON.stringify(rows), { status: from + rows.length < state.src.length ? 206 : 200 });
  }
  return new Response("[]", { status: 200 });
};
const env = { supabaseUrl: "https://fake.example", supabaseKey: "k", poolColumns: false };
const car = { year: 2001, make: "Porsche", model: "911", raw: "2001 Porsche 911", trim: "" };
const answer = async () => (await E.oneEngineAnswer(car, null, car.raw, { ...env, asked: 0, noStageLog: true }, null)).raw;
let RR = null; try { RR = await import(pathToFileURL(path.join(ROOT, "lib/_readRetry.js")).href); } catch { /* a tree without the module */ }
const KINDS = [["a statement timeout (57014)", 500, { code: "57014", message: "canceling statement due to statement timeout" }], ["a 500 with another code", 500, { code: "XX000", message: "internal" }], ["a 503 (a dropped connection)", 503, { message: "unavailable" }]];
const runAs = async (caller, fn) => { try { const C = await import(pathToFileURL(path.join(ROOT, "lib/_caller.js")).href); return await C.runAsCaller(caller, fn); } catch { return await fn(); } };
for (const [name, status, bodyJ] of KINDS) {
  RR && RR.resetRetryState();
  Object.assign(state, { src: FIX, failStatus: status, failBody: bodyJ, fails: 0, failUntil: Date.now() + 250 });
  const t0 = Date.now(); const d = await runAs("sell", answer);
  ok(`${name}: a read that fails once and then answers is retried and the answer is served (a visitor of Sell)`, d && /^(result|thin)$/.test(String(d.tier)), { tier: d && d.tier, fails: state.fails, ms: Date.now() - t0 });
  ok(`${name}: the retry waited a pause, it was not instant`, state.fails > 0 && Date.now() - t0 >= 380, Date.now() - t0);
  RR && RR.resetRetryState();
  Object.assign(state, { fails: 0, failUntil: Date.now() + 60000 });
  const d2 = await runAs("sell", answer);
  ok(`${name}: a read that fails twice is the still-reading answer, never a result built on the failure`, d2 && d2.tier === "unavailable" && d2.stillReading === true && d2.readFailed === true, d2 && d2.tier);
  ok(`${name}: it was retried ONCE (the failed attempts are two passes of the same reads, not three)`, state.fails > 0 && state.fails <= 40, state.fails);
}
// the History pages (caller "site") do not repeat a timeout: the same failed read is the still-reading answer at once, and a blip is still retried
{ RR && RR.resetRetryState(); Object.assign(state, { failStatus: 500, failBody: KINDS[0][2], fails: 0, failUntil: Date.now() + 250 });
  const d = await runAs("site", answer);
  ok("a crawler's History page does not repeat a statement timeout (the Sell visitor must not queue behind it)", d && d.tier === "unavailable", d && d.tier);
  RR && RR.resetRetryState(); Object.assign(state, { failStatus: 503, failBody: KINDS[2][2], fails: 0, failUntil: Date.now() + 250 });
  const d2 = await runAs("site", answer);
  ok("a History page still retries a dropped connection", d2 && /^(result|thin)$/.test(String(d2.tier)), d2 && d2.tier); }
// the ration: at most six retries in ten seconds and two at once per instance
ok("lib/_readRetry.js exists with the plan and the ration", !!RR && typeof RR.retryPlan === "function");
if (RR) {
  RR.resetRetryState(); const now = Date.now(); let granted = 0;
  for (let i = 0; i < 10; i++) { const p = RR.retryPlan(["blip"], { caller: "sell", now: now + i }); if (p.retry) { granted++; RR.startRetry(p, () => new Promise(() => {})); RR.resetRetryState && void 0; } }
  ok("the ration: two retries at once at most (a third waits for a slot)", granted === 2, granted);
  RR.resetRetryState();
  let g2 = 0; for (let i = 0; i < 10; i++) { const p = RR.retryPlan(["blip"], { caller: "sell", now: now + i }); if (p.retry) { g2++; const done = await RR.startRetry(p, async () => {}); done(); } }
  ok("the ration: six retries in a ten second window at most", g2 === RR.RETRY_MAX_PER_WINDOW, g2);
  RR.resetRetryState();
  ok("the ration opens again after the window", RR.retryPlan(["blip"], { caller: "sell", now: now + 99999 }).retry === true);
  ok("a bulk caller's timeout is never repeated, a visitor's is", RR.retryPlan(["timeout"], { caller: "site" }).retry === false && RR.retryPlan(["timeout"], { caller: "sell" }).retry === true);
  ok("an unclassified error is not retried again by the request (the page read already tried it three times)", RR.retryPlan(["error"], { caller: "sell" }).retry === false);
  ok("the pause is between 400 and 900 ms", (() => { const p = RR.retryPlan(["timeout"], { caller: "sell", rnd: () => 0 }), q = RR.retryPlan(["timeout"], { caller: "sell", rnd: () => 0.999 }); return p.pauseMs === 400 && q.pauseMs >= 890 && q.pauseMs <= 900; })());
}
// the failure line names its kind and its caller (the next count of the failures can name the cause)
{ const scope = await import(pathToFileURL(path.join(ROOT, "lib/_readScope.js")).href), lines = []; const prev = console.error; console.error = l => lines.push(String(l));
  await scope.readScoped(async () => { scope.noteReadKind("timeout"); scope.noteReadFailure("pool read"); });
  console.error = prev;
  ok("the failure line keeps its old words and adds the kind and the caller: archive read failed (pool read) [timeout; ...]", lines.some(l => /archive read failed \(pool read\) \[timeout; [a-z]+\]/.test(l)), lines); }
console.log(`readRetryCheck: ${pass} pass, ${fail} FAIL` + (fail ? "\n" + fails.map(f => "  FAIL " + f).join("\n") : ""));
process.exit(fail ? 1 : 0);

function mutants() {
  const SRC = ROOT, COPY = fs.mkdtempSync(path.join(path.dirname(SRC), "goasksam-b-rrmut-"));
  spawnSync("sh", ["-c", `cd "${SRC}" && for d in lib api public data scripts package.json; do cp -R "$d" "${COPY}/" 2>/dev/null; done; ln -s "${SRC}/node_modules" "${COPY}/node_modules"`]);
  const rd = f => fs.readFileSync(path.join(COPY, f), "utf8"), wr = (f, s) => fs.writeFileSync(path.join(COPY, f), s);
  const MUT = [
    ["no retry at all", "lib/_readRetry.js", s => s.replace("return { retry: true, pauseMs, why:", "return { retry: false, pauseMs, why:")],
    ["a timeout is never retried (the old rule)", "lib/_readRetry.js", s => s.replace("if (BULK_CALLERS.has(String(caller || \"\")) && ks.some(k => k === \"timeout\"))", "if (ks.some(k => k === \"timeout\"))")],
    ["a bulk caller's timeout is retried", "lib/_readRetry.js", s => s.replace("if (BULK_CALLERS.has(String(caller || \"\")) && ks.some(k => k === \"timeout\")) return { retry: false, pauseMs: 0, why: \"a bulk caller's timeout is not repeated\" };", "")],
    ["no ration per window", "lib/_readRetry.js", s => s.replace("if (state.stamps.length >= RETRY_MAX_PER_WINDOW)", "if (false)")],
    ["no concurrent limit", "lib/_readRetry.js", s => s.replace("if (state.inflight >= RETRY_MAX_CONCURRENT)", "if (false)")],
    ["no pause before the retry", "lib/_readRetry.js", s => s.replace("RETRY_PAUSE_MS = [400, 900]", "RETRY_PAUSE_MS = [0, 0]")],
    ["the engine does not ask the planner", "lib/onebox.js", s => s.replace("const plan = deadlineAt - Date.now() > 4000 && !(callerSignal && callerSignal.aborted) ? retryPlan(runKinds) : { retry: false };", "const plan = { retry: false };")],
    ["a failed retry is served as the answer", "lib/onebox.js", s => s.replace("if (failed(d)) d = { tier: \"unavailable\", stillReading: true, readFailed: true, samLine: reasonLine(\"cold.still\"), retry: true, retryAfterMs: 15000, resolvedCar: d && d.resolvedCar || null };", "")],
    ["the failure line drops its kind", "lib/_readScope.js", s => s.replace("[${kind}; ${callerNow() || \"untagged\"}]", "")]
  ];
  let bad = 0;
  for (const [name, file, fn] of MUT) {
    const orig = rd(file), next = fn(orig);
    if (next === orig) { console.log("STALE MUTANT (no change): " + name); bad++; continue; }
    wr(file, next);
    const r = spawnSync("node", [path.join(COPY, "scripts/readRetryCheck.mjs"), COPY], { encoding: "utf8", timeout: 300000 });
    wr(file, orig);
    const killed = r.status !== 0; console.log((killed ? "killed   " : "SURVIVED ") + name); if (!killed) bad++;
  }
  fs.rmSync(COPY, { recursive: true, force: true });
  console.log(bad ? `${bad} mutant(s) survived or stale` : `all ${MUT.length} mutants killed`);
  return bad ? 1 : 0;
}
