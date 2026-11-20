// THE FOR SALE TEST WORLD (Lane S, Nov 18 2026; rebuilt Nov 19 2026). Lane D's world is Lane D's: the fake PostgREST, the vendor stand-in, the archive of 1987 Porsche 911s and 2009 BMW M3s, the model stand-in and the handler caller all live in
// scripts/forSaleCheck.mjs, and Lane D changes them with the engine. This file keeps no copy of any of it. It READS forSaleCheck.mjs from the tree under test, takes the world's span (from the imports to the `everyWrite` line), runs that span
// as a module, and then does what the engine's own jobs do, through the live handlers: ONE pull (the load, mode=pull) and the prepare job (mode=prepare: the resolver, then the engine's read of every car, then the earlier record by VIN) until nothing is
// left to resolve or read. serve.js serves resolved rows only, so a page check over this world sees what a visitor would see after the job ran, whatever Lane D's serving rule is today.
//   CAUSE of the 13 reds (Lane C held lane-s-forsale-2 at 724d285f): the world was a frozen copy of Lane D's from before the prepare job; serve.js now serves only resolved rows and the copy resolved none, so every dealer read 0.
//   CLASS: any check of mine that stands on another lane's test world. scripts/forSaleWorldCheck.mjs asserts this file keeps no copy (no vendor stand-in, no fake table of its own), that the span is found, and that after the boot every servable row is
//   resolved and read and the engine serves it; it fails on the frozen copy (git show 724d285f:scripts/_forSaleWorld.mjs) and passes here.
// Importing this file boots the world. It prints nothing.
import fs from "node:fs"; import os from "node:os"; import path from "node:path"; import { fileURLToPath, pathToFileURL } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.resolve(here, "..");
const src = fs.readFileSync(path.join(here, "forSaleCheck.mjs"), "utf8"), start = src.indexOf('import fs from "node:fs"'), everyAt = src.indexOf("const everyWrite =");
if (start < 0 || everyAt < 0) throw new Error("scripts/forSaleCheck.mjs no longer has the world span (its imports to the `everyWrite` line): the world cannot be taken from it");
let span = src.slice(start, src.indexOf("\n", everyAt) + 1);
// the span is Lane D's, unchanged, except where it reads the command line (no arguments here) and where it finds itself (it lives in scripts/; this module runs it from the temp folder)
const FIND_ROOT = 'const args = process.argv.slice(2), here = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.resolve(args.find(a => !a.startsWith("--")) || path.join(here, ".."));';
if (!span.includes(FIND_ROOT)) throw new Error("scripts/forSaleCheck.mjs: the line that finds its root changed; the world cannot be taken from it until this file follows");
span = span.replace(FIND_ROOT, `const args = [], here = ${JSON.stringify(here)}, ROOT = ${JSON.stringify(ROOT)};`).replace('if (args.includes("--mutants")) process.exit(await mutants());\n', "");
span += '\nexport { call, find, json, chatDone, BUY, MC, PULL, PROBE, SERVE, TABLE, CREW, CT, W, world, LOGS, ago, vin, SP, HAVE, LIVE, liveRow };\n';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fsworld-")), file = path.join(dir, "world.mjs");
fs.writeFileSync(file, span);
const M = await import(pathToFileURL(file).href);
try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
// THE BOOT: the engine's own jobs through the live handlers: the load, then prepare until nothing is left to resolve or read (one run's budget is bounded, so the job runs again, as the schedule would)
const probeH = { "x-ops-key": M.PROBE };
export const BOOT = { pull: null, polls: null, prepare: [] };
if (M.HAVE) {
  // the first pull is the LOAD of every source; the second is the polls (a change poll and a stale poll each): serve.js serves a source only while its load is done and both polls are current, so a world with the load alone serves nothing
  BOOT.pull = M.json(await M.call(M.PULL, "/api/pullForSale?mode=pull", { crew: false, headers: probeH }));
  BOOT.polls = M.json(await M.call(M.PULL, "/api/pullForSale?mode=pull", { crew: false, headers: probeH }));
  for (let i = 0; i < 8; i++) {   // until a run makes no progress (a listing the resolver cannot place stays counted as left, and is not served)
    const o = M.json(await M.call(M.PULL, "/api/pullForSale?mode=prepare&budgetMs=240000", { crew: false, headers: probeH })) || {}; BOOT.prepare.push(o);
    if (o.skipped || !(o.resolved > 0 || o.reads > 0 || o.histories > 0)) break;
  }
  M.SERVE.forSaleReset();
}
export const { call, find, json, chatDone, BUY, MC, PULL, PROBE, SERVE, TABLE, CREW, CT, W, world, LOGS, ago, vin, SP, HAVE, LIVE, liveRow } = M;
export { ROOT, pathToFileURL, probeH };
