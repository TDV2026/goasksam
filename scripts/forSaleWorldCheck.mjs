// clock: real-ok the world's rows are stamped relative to the real now in this process; no calendar date is asserted
// THE FOR SALE WORLD TRACKS THE ENGINE (Lane S, Nov 19 2026). Lane C held lane-s-forsale-2: forSalePageCheck failed 13 of 54 on the merged tree because its test world was a copy of Lane D's from before the prepare job; serve.js now serves only
// resolved rows whose source's polls are current, the copy resolved and polled nothing, and every dealer read 0.
// CLASS: a check of mine that stands on another lane's test world. The world must be the other lane's own, taken from the tree under test, and brought to the state the engine's jobs bring it to (pull, polls, prepare), so the check follows the
// engine's serving rule instead of a sample of it. This check asserts, for scripts/_forSaleWorld.mjs: (1) it keeps no copy of Lane D's world (no vendor stand-in, no fake table, no archive of its own) and reads scripts/forSaleCheck.mjs;
// (2) the boot ran the load, the polls and the prepare job through the live handlers; (3) after the boot the engine's own answer to Find serves dealers and classifieds, and its inventory holds nothing back for a reason the jobs remove
// (resolve_pending, read_pending, sync_lapsed); (4) every row the engine serves carries the resolved car and the read the job stored.
//   node scripts/forSaleWorldCheck.mjs [repo root]    --mutants: the frozen copy (724d285f), a world with no polls, no prepare, or a copy of the vendor stand-in, each in a copy of the tree, each must fail.
import fs from "node:fs"; import path from "node:path"; import { spawnSync } from "node:child_process"; import { fileURLToPath, pathToFileURL } from "node:url";
const args = process.argv.slice(2), here = path.dirname(fileURLToPath(import.meta.url)), root = path.resolve(args.find(a => !a.startsWith("--")) || path.join(here, ".."));
if (args.includes("--mutants")) process.exit(mutants());
const say = x => fs.writeSync(1, x + "\n");   // the world replaces console.log with its own log
let pass = 0, fail = 0; const ok = (n, c, d) => { if (c) pass++; else { fail++; say("FAIL " + n + (d !== undefined ? " " + JSON.stringify(d).slice(0, 300) : "")); } };
const wsrc = fs.readFileSync(path.join(root, "scripts/_forSaleWorld.mjs"), "utf8");
ok("(1) the world reads Lane D's forSaleCheck.mjs from the tree under test", /forSaleCheck\.mjs/.test(wsrc) && /readFileSync\(path\.join\(here, "forSaleCheck\.mjs"\)/.test(wsrc));
ok("(1) the world keeps no copy of Lane D's: no vendor stand-in, no table of its own, no archive of its own", !/DATASET|ZZ-SELLER-MARKER|pageOf\s*=|applyFilter|for_sale_listings|globalThis\.fetch\s*=|const CARS\s*=|class .*Postgrest/.test(wsrc.replace(/^\s*\/\/.*$/gm, "")), wsrc.match(/DATASET|applyFilter|globalThis\.fetch\s*=/g));
let W = null; try { W = await import(pathToFileURL(path.join(root, "scripts/_forSaleWorld.mjs")).href); } catch (e) { ok("the world boots", false, String(e && e.message).slice(0, 200)); }
if (W) {
  ok("(2) the boot ran the load through the live handler", !!(W.BOOT.pull && W.BOOT.pull.ok === true && W.BOOT.pull.wrote > 0), W.BOOT.pull && { ok: W.BOOT.pull.ok, wrote: W.BOOT.pull.wrote });
  ok("(2) the boot ran the polls (a second pull: a change poll and a stale poll for each source)", !!(W.BOOT.polls && W.BOOT.polls.ok === true), W.BOOT.polls);
  ok("(2) the boot ran the prepare job and it resolved and read cars", W.BOOT.prepare.length >= 1 && W.BOOT.prepare.reduce((n, o) => n + (o.resolved || 0), 0) >= 8 && W.BOOT.prepare.reduce((n, o) => n + (o.reads || 0), 0) >= 8, W.BOOT.prepare.map(o => [o.resolved, o.reads]));
  W.SERVE.forSaleReset(); const P = W.json(await W.find({ q: "1987 Porsche 911" })), FS = P && P.forSale;
  ok("(3) the engine's own answer to Find serves dealers and classifieds over this world", !!FS && FS.counts.dealers >= 6 && FS.counts.classifieds >= 2 && FS.counts.auctions >= 2, FS && FS.counts);
  const held = (FS && FS.inventory && FS.inventory.held_back) || {};
  ok("(3) the engine holds back nothing for a reason the jobs remove (resolve_pending, read_pending, sync_lapsed, not_polled)", !Object.keys(held).some(k => /pending|lapsed|poll/.test(k)), held);
  ok("(3) the engine names the sources it serves", !!(FS && FS.inventory && Array.isArray(FS.inventory.sources_live) && FS.inventory.sources_live.length >= 5), FS && FS.inventory && FS.inventory.sources_live);
  const cards = FS ? [...(FS.dealers.cards || []), ...(FS.classifieds.cards || [])] : [];
  ok("(4) every card the engine serves carries the read the job stored (never empty)", cards.length >= 8 && cards.every(c => typeof c.read === "string" && c.read.length > 5), cards.filter(c => !c.read).length);
  const stored = W.TABLE.filter(r => !r.gone && r.resolve_state === "resolved");
  ok("(4) the rows the engine serves are the ones the job resolved and read", stored.length >= cards.length && stored.every(r => r.car && r.car.key && r.car_key === r.car.key) && stored.filter(r => r.asking_price_usd > 0).every(r => r.read), stored.length);
}
say(`forSaleWorldCheck: ${pass} pass, ${fail} FAIL`); process.exit(fail ? 1 : 0);

function mutants() {
  const copy = fs.mkdtempSync(path.join(process.env.TMPDIR || "/tmp", "fsw-")); spawnSync("cp", ["-R", root, copy + "/t"], { stdio: "ignore" }); const T = copy + "/t"; try { fs.rmSync(T + "/node_modules", { force: true }); fs.symlinkSync(path.join(root, "node_modules"), T + "/node_modules"); } catch {}
  const wp = path.join(T, "scripts/_forSaleWorld.mjs"), good = fs.readFileSync(wp, "utf8");
  const frozen = spawnSync("git", ["-C", root, "show", "724d285f:scripts/_forSaleWorld.mjs"], { encoding: "utf8" }).stdout;
  const cases = [
    ["the frozen copy of Lane D's world from before the prepare job (724d285f)", () => frozen || null],
    ["a world with no polls (the load alone)", () => good.replace('BOOT.polls = M.json(await M.call(M.PULL, "/api/pullForSale?mode=pull", { crew: false, headers: probeH }));', "BOOT.polls = { ok: true };")],
    ["a world with no prepare job", () => good.replace("for (let i = 0; i < 8; i++) {", "for (let i = 0; i < 0; i++) {")],
    ["a world with a vendor stand-in of its own", () => good + "\nconst DATASET = [];\n"],
    ["a world that does not read Lane D's file", () => good.replace('path.join(here, "forSaleCheck.mjs")', 'path.join(here, "forSaleCheck.mjs.copy")').replace("forSaleCheck.mjs\"), \"utf8\")", "x")]
  ];
  let missed = 0;
  for (const [name, make] of cases) {
    const w = make(); if (!w || w === good) { console.log("SKIP (no mutation made): " + name); missed++; continue; }
    fs.writeFileSync(wp, w); const r = spawnSync("node", [path.join(T, "scripts/forSaleWorldCheck.mjs"), T], { encoding: "utf8", timeout: 240000 }); fs.writeFileSync(wp, good);
    const caught = r.status !== 0; console.log((caught ? "caught   " : "MISSED   ") + name); if (!caught) missed++;
  }
  fs.rmSync(copy, { recursive: true, force: true }); console.log(`forSaleWorldCheck mutants: ${missed} not caught`); return missed ? 1 : 0;
}
