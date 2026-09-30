// Proves the OCD hard cap and the ingest guards WITHOUT any real /auctions calls (fetch is mocked).
//   1. callOldCarsData throws "OCD daily hard cap reached" at the limit and makes no further requests.
//   2. ingest --delta ABORTS (exit 1) when heldIds reads null, with ZERO OCD calls.
//   3. ingest --delta trips the per-source page ceiling (exit 1) after exactly N pages.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
let failures = 0;
const check = (name, cond, detail = "") => { console.log(`${cond ? "PASS" : "FAIL"}: ${name}${detail ? ` -- ${detail}` : ""}`); if (!cond) failures++; };

// ---- Test 1: hard cap throws at the limit (in-process; fetch mocked here) ----
async function testCap() {
  let ocdCalls = 0;
  const H = { get: () => null };
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u.includes("oldcarsdata.com")) { ocdCalls++; return { ok: true, status: 200, headers: H, json: async () => ({ data: [], meta: { total_pages: 1 } }), text: async () => "{}" }; }
    return { ok: true, status: 200, headers: H, json: async () => [], text: async () => "[]" };   // supabase seed/record -> empty
  };
  process.env.OCD_DAILY_HARD_CAP = "3";
  process.env.SUPABASE_URL = "https://fake.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "fake";
  const { callOldCarsData, getOcdRunMetered } = await import("../lib/_ocd.js");
  let threw = null, okCalls = 0;
  for (let i = 0; i < 6; i++) {
    try { await callOldCarsData("/auctions", { page: i + 1 }, "fake"); okCalls++; }
    catch (e) { threw = e; break; }
  }
  check("cap: exactly 3 requests succeed before the cap", okCalls === 3, `okCalls=${okCalls}`);
  check("cap: 4th call throws", !!threw);
  check("cap: error is the hard-cap error", !!(threw && threw.ocdHardCap && /hard cap reached/i.test(threw.message)), threw ? threw.message : "no throw");
  check("cap: no OCD request made past the cap", ocdCalls === 3, `real OCD calls=${ocdCalls}`);
  check("cap: run counter matches", getOcdRunMetered() === 3, `runMetered=${getOcdRunMetered()}`);
}

// ---- helper: run ingest.js in a subprocess with the fetch mock ----
function runIngest(env) {
  const r = spawnSync(process.execPath, ["--import", "./test/_ocdMock.mjs", "scripts/ingest.js", "--delta", "--sources=bringatrailer"], {
    cwd: ROOT, encoding: "utf8", timeout: 60000,
    env: { ...process.env, SUPABASE_URL: "https://fake.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "fake", OLDCARSDATA_API_KEY: "fake", OCD_DAILY_HARD_CAP: "2500", ...env }
  });
  const out = (r.stdout || "") + (r.stderr || "");
  const m = out.match(/__MOCK_OCD_CALLS__=(\d+)/);
  return { code: r.status, ocdCalls: m ? Number(m[1]) : null, out };
}

async function main() {
  await testCap();

  console.log("\n-- ingest: null heldIds aborts --");
  const t2 = runIngest({ MOCK_HELD_FAIL: "1", MOCK_OCD_MODE: "blocked" });
  check("null heldIds: non-zero exit", t2.code === 1, `exit=${t2.code}`);
  check("null heldIds: logs an ABORT", /ingest ABORT|could not read held ids/i.test(t2.out));
  check("null heldIds: ZERO OCD calls", t2.ocdCalls === 0, `ocdCalls=${t2.ocdCalls}`);

  console.log("\n-- ingest: page ceiling trips --");
  const t3 = runIngest({ MOCK_HELD_FAIL: "0", MOCK_OCD_MODE: "pages", OCD_DELTA_MAX_PAGES_PER_SOURCE: "3" });
  check("page ceiling: non-zero exit", t3.code === 1, `exit=${t3.code}`);
  check("page ceiling: logs the ceiling abort", /exceeded 3 delta pages/i.test(t3.out));
  check("page ceiling: stopped after exactly 3 OCD pages", t3.ocdCalls === 3, `ocdCalls=${t3.ocdCalls}`);

  console.log(`\n${failures === 0 ? "ALL PASS" : failures + " FAILED"}`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
