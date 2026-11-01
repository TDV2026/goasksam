// A STORED HIT ANSWERS BEFORE ITS SHARE SNAPSHOT IS WRITTEN, AND THE LINK NEVER POINTS AT NOTHING (Lane B, Oct 31 2026; Sam's go-ahead, conditional on the stage timings).
// CAUSE: api/sellerDecision.js awaited persistSavedResult (an insert of the whole answer into saved_results) before responding to EVERY result, stored or fresh; on a stored hit it is the largest part of the read.
// WHO ELSE: every stored Market Check, Find card and Tasks read that goes through the One Box branch with a result and no refine; fresh computes keep the awaited write (they are slow anyway and the id is real at once).
// FIX: on a stored hit the id is made first (lib/shareId.js, time-ordered), the response carries it, the insert runs under waitUntil (once more if it fails); /o/<id> waits up to 6 s for a row while the id is under a minute old.
// If the runtime has no waitUntil the write stays awaited, so a link never goes out with no write coming. This check fails without the fix.
//   node scripts/snapshotAfterResponseCheck.mjs [repo root]
import fs from "node:fs";
import path from "node:path"; import { fileURLToPath, pathToFileURL } from "node:url";
const root = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
process.chdir(root);
let fail = 0; const ok = (n, c, d) => { if (!c) fail++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`); };
const sd = fs.readFileSync("api/sellerDecision.js", "utf8"), pc = fs.readFileSync("api/publicConfig.js", "utf8");
const strip = t => t.replace(/\/\/[^\n]*/g, "");
const i = sd.indexOf("let snapshotId = null;"), blk = strip(sd.slice(i, sd.indexOf("snapshotId: snapshotId || undefined", i)));
// 1. a stored hit does not await the insert before it responds
const wuPart = /warmHit \? requestWaitUntil\(\) : null/.test(blk);
ok("a stored hit takes a waitUntil and writes under it", wuPart && /if \(wu\) \{/.test(blk) && /wu\(\(async/.test(blk));
const ifBranch = blk.slice(blk.indexOf("if (wu) {"), blk.indexOf("} else snapshotId"));
ok("inside the stored-hit branch the insert is awaited only inside the waitUntil job, never before the response", wuPart && ifBranch.length > 20 && !/snapshotId = await persistSavedResult/.test(ifBranch) && /snapshotId = sid/.test(ifBranch));
ok("without waitUntil the write is still awaited (a link never goes out with no write coming)", /else snapshotId = await persistSavedResult\(null, snap, supabaseUrl, supabaseKey\)/.test(blk));
ok("the id in the response is the id the insert writes", /persistSavedResult\(null, snap, supabaseUrl, supabaseKey, sid\)/.test(blk) && /snapshotId = sid/.test(blk));
ok("a failed insert is tried once more", (blk.match(/persistSavedResult\(null, snap, supabaseUrl, supabaseKey, sid\)/g) || []).length === 2);
// 2. the link waits for the row
const sh = strip(pc.slice(pc.indexOf("async function handleOneboxShare")));
ok("/o/<id> reads again for a row that is not there yet, only for a fresh share id", /for \(let tries = 0; tries < \d+; tries\+\+\)/.test(sh) && /isFreshShareId\(id\)/.test(sh) && /setTimeout\(r, 400\)/.test(sh));
ok("the default page is shown only after the waiting is over", sh.indexOf("setTimeout(r, 400)") > 0 && sh.indexOf("setTimeout(r, 400)") < sh.indexOf("payload.obShare !== true"));
// 3. the id: made, recognised while fresh, never for a made-up or old id
const S = await import(pathToFileURL(path.join(root, "lib/shareId.js")).href).catch(() => null);
ok("lib/shareId.js exists", !!S);
if (S) {
  const now = Date.now(), id = S.timedShareId(now);
  ok("a made id is a uuid shape the database accepts", /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id), id);
  ok("a fresh id is waited for", S.isFreshShareId(id, now + 1000));
  ok("an id older than a minute is not", !S.isFreshShareId(id, now + 61000));
  ok("a random uuid (made up) is not waited for", !S.isFreshShareId("3f2b8c1e-5a4d-4e6f-9a7b-1c2d3e4f5a6b", now) && !S.isFreshShareId("abc", now));
  ok("an id from the future is not waited for", !S.isFreshShareId(S.timedShareId(now + 3600e3), now));
}
console.log(fail ? `snapshotAfterResponseCheck: ${fail} failure(s)` : "snapshotAfterResponseCheck: all pass");
process.exit(fail ? 1 : 0);
