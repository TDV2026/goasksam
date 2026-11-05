// TOOL RETRY CHECK (Lane B, Nov 2026). The class: a read that did not finish must reach a visitor as "try again", never as a statement about the market.
//   1. Behaviour: with every archive read failing, market_check and where_to_sell answer kind "retry" (retry true, retryAfterMs, the engine's still-reading line), never "refusal" and never a range.
//   2. The summary a tool hands an assistant for a retry is the still-reading line, with no figure, no "too spread out" and no "not enough".
//   3. Class: every file that calls oneEngineAnswer either routes a failed read through retryOf, or names the engine's own retry fields (unavailable, stillReading, readFailed, retry), or is listed below with the reason it is safe.
// Usage: node scripts/toolRetryCheck.mjs [root]  (root = a tree to read the sources from; the behaviour part runs the tree it is in)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(process.argv[2] || path.join(here, ".."));
let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log("FAIL " + m); } else console.log("ok   " + m); };

// 1 + 2. behaviour. Every archive call fails with a 503; resolver calls to the network fail the same way, so the resolver may ask a question: that is a pass for neither, so the spec is a typed car the curated tables resolve offline.
const realFetch = globalThis.fetch;
globalThis.fetch = async () => ({ ok: false, status: 503, text: async () => "unavailable", json: async () => ({ message: "unavailable" }), headers: new Map() });
process.env.ONEBOX_DEADLINE_MS = "3000";
const T = await import(path.join(root, "lib/tools/_shared.js")).catch(e => ({ __err: e }));
ok(typeof T.retryOf === "function" && typeof T.isFailedRead === "function", "lib/tools/_shared.js exports retryOf and isFailedRead" + (T.__err ? " (" + T.__err.message + ")" : ""));
if (T.retryOf) {
  for (const [name, d] of [["null (a thrown read)", null], ["tier unavailable", { tier: "unavailable", stillReading: true, retry: true, retryAfterMs: 15000 }], ["tier read_failed", { tier: "read_failed" }], ["no tier", {}]]) {
    ok(T.isFailedRead(d), "a failed read is recognised: " + name);
    const out = T.retryOf(d, "1965 Ford Mustang");
    ok(out.kind === "retry" && out.retry === true && out.retryAfterMs > 0 && !/spread|enough|between|\$/i.test(out.reason), "retryOf (" + name + ") answers try again with no market claim: " + out.reason);
    ok(!/[–—]/.test(out.reason), "no dash in the line");
  }
  for (const d of [{ tier: "result", cluster: [1, 2] }, { tier: "thin" }, { tier: "refusal" }, { tier: "body_choice" }]) ok(!T.isFailedRead(d), "a real answer is not a failed read: " + d.tier);
  ok(/still being read/.test(T.summarize("market_check", T.retryOf(null, "x"))), "summarize hands a retry on as the still-reading line");
}
const mc = await import(path.join(root, "lib/tools/marketCheck.js")).catch(() => null), ws = await import(path.join(root, "lib/tools/whereToSell.js")).catch(() => null);
const env = { supabaseUrl: "https://example.invalid", supabaseKey: "k" };
for (const [name, fn] of [["market_check", mc && mc.marketCheck], ["where_to_sell", ws && ws.whereToSell]]) {
  if (!fn) { ok(false, name + " loads"); continue; }
  const out = await fn("1969 Chevrolet Camaro", env).catch(e => ({ kind: "threw", e: String(e) }));
  ok(out.kind === "retry" || out.kind === "question", name + " with every archive read failing answers retry (or a question), never a refusal or a range: kind=" + out.kind + (out.kind === "refusal" ? " | " + out.reason : ""));
  ok(out.kind !== "refusal" && !out.soldRangeHammerUsd && !out.platforms, name + " carries no market claim from a failed read");
}
globalThis.fetch = realFetch;

// 4. Sell: an unavailable first read is the still-reading line as retry, never a block that says "too few to compare venues"; the warm never builds a block from it.
{
  const flow = await import(path.join(root, "lib/sell/sellFlow.js")).catch(() => null), blk = await import(path.join(root, "lib/sell/sellBlock.js")).catch(() => null);
  const w = blk && blk.warmSellBlock ? await blk.warmSellBlock({ supabaseUrl: env.supabaseUrl, supabaseKey: env.supabaseKey }, "1969 Chevrolet Camaro", { tier: "unavailable", stillReading: true }, null).catch(e => ({ threw: String(e) })) : null;
  ok(w && w.stored === false && w.why === "failed_read", "warmSellBlock builds nothing from an unavailable answer: " + JSON.stringify(w));
  ok(!!flow && /isFailedRead\(d\)/.test(fs.readFileSync(path.join(root, "lib/sell/sellFlow.js"), "utf8")), "buildResult stops on a failed read before it builds a block (lib/sell/sellFlow.js)");
}
// 5. the history pages: an unavailable answer draws the reading card that asks again, never a blank.
{
  const h = await import(path.join(root, "api/history.js")).catch(() => null);
  const html = h && h.oneBoxBlock ? h.oneBoxBlock({ tier: "unavailable", stillReading: true, retry: true }, {}, "/x", "") : "";
  ok(/id="sam-cold"/.test(html), "api/history.js oneBoxBlock draws the reading card for an unavailable answer (" + html.length + " chars)");
}
// 3. the class. Every caller of oneEngineAnswer outside the engine.
const REVIEWED = {   // file: why a failed read cannot reach a visitor as a data claim or a blank there (each read for this check, Nov 5 2026)
  "lib/live/narrow.js": "a failed or slow read gives no generation question and the search falls back to decades; it prints no claim",
  "lib/sell/sellFacts.js": "its answer reaches a visitor only through buildResult and buildBlock (lib/sell/sellFlow.js, sellBlock.js), which stop on a failed read (part 4 below); its question path takes only choices and builder refusals",
  "api/_historyData.js": "returns the engine's answer to its page callers, which map an unavailable answer: api/history.js oneBoxBlock (part 5 below), api/buySearch.js and api/partnerAnswer.js (stillReading)"
};
const walk = (dir, out = []) => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { if (e.name === "node_modules" || e.name.startsWith(".")) continue; const f = path.join(dir, e.name); if (e.isDirectory()) walk(f, out); else if (/\.(js|mjs)$/.test(e.name)) out.push(f); } return out; };
const callers = [...walk(path.join(root, "lib")), ...walk(path.join(root, "api"))].map(f => path.relative(root, f)).filter(f => f !== "lib/onebox.js" && /\boneEngineAnswer\s*\(/.test(fs.readFileSync(path.join(root, f), "utf8")));
let handled = 0, reviewed = 0;
for (const f of callers) {
  const src = fs.readFileSync(path.join(root, f), "utf8");
  const routes = /\bretryOf\b|\bisFailedRead\b|["']unavailable["']|\bstillReading\b|\breadFailed\b|\bretryAfterMs\b/.test(src);
  if (routes) handled++; else if (REVIEWED[f]) reviewed++;
  ok(routes || !!REVIEWED[f], "caller " + f + (routes ? " routes a failed read" : REVIEWED[f] ? " reviewed: " + REVIEWED[f] : " calls oneEngineAnswer and neither routes a failed read nor is reviewed"));
}
console.log(`callers ${callers.length}: ${handled} route a failed read, ${reviewed} reviewed, ${callers.length - handled - reviewed} unaccounted for`);
console.log(fails ? `FAIL ${fails}` : "PASS");
process.exit(fails ? 1 : 0);
