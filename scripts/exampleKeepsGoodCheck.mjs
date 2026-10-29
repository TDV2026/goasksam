// e100: a landing example build that does not qualify never overwrites the stored example with nothing.
// Cause (run 127, Oct 28): the nightly builders store(env, null) after a failed fresh build, writing a row with a null market and a fresh time; the page then reads that row as "no example" for 24 hours and never tries its own rebuild.
// Affects: the Market Check landing example, the Sam Desk worked example, the Buy landing example (the Sell example already stores only when it qualifies).
//   node scripts/exampleKeepsGoodCheck.mjs [repo root]
import path from "node:path"; import { fileURLToPath, pathToFileURL } from "node:url";
const root = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
process.chdir(root);
process.env.SUPABASE_URL = "https://fake.supabase.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "k"; process.env.LAUNCH_STAGE = "2";
let fail = 0; const ok = (n, c, d) => { if (!c) fail++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`); };
const writes = [];
globalThis.fetch = async (url, init) => {
  const u = String(url);
  if (init && /POST|PATCH|PUT/.test(String(init.method || ""))) { writes.push({ url: u, body: String(init.body || "") }); return new Response(null, { status: 204 }); }
  if (u.includes("fake.supabase")) return new Response("[]", { status: 200 });
  throw new Error("offline");
};
const imp = f => import(pathToFileURL(path.join(root, f)).href);
const env = { supabaseUrl: "https://fake.supabase.test", supabaseKey: "k" };
const nullWrite = () => writes.filter(w => /spec_market_cache/.test(w.url) && /"market":null/.test(w.body));
for (const [name, run] of [
  ["Market Check landing example", async () => (await imp("lib/live/marketCheckExample.js")).marketCheckExample(0, { fresh: true })],
  ["Sam Desk worked example", async () => (await imp("lib/live/deskExample.js")).deskExample(0, { fresh: true })],
  ["Buy landing example", async () => (await imp("lib/live/buyExample.js")).exampleBand(env, 0, { fresh: true })],
]) {
  writes.length = 0; let r; try { r = await run(); } catch (e) { r = "threw " + e.message; }
  ok(`${name}: a build that did not qualify (${r === null || r === undefined ? "none" : typeof r === "string" ? r : "built"}) writes no null row`, nullWrite().length === 0, nullWrite().map(w => w.body.slice(0, 80)).join(" | "));
}
process.exit(fail ? 1 : 0);
