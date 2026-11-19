// clock: real-ok no date is read
// THE OLD CONVERSE ENDPOINT IS RETIRED (Lane B, Nov 11 2026). The page's no-model search is action rerun with the typed words (the written answer's own search); the old action "converse" (api/buySearch.js converseOut) had no caller left on the page.
// CLASS: no file the product runs or checks calls it, and the endpoint answers nothing. (1) no source file (api, lib, public, js, scripts, vercel.json, the nightly workflow copy) posts action "converse", plain or inside the page's escaped client string;
// (2) api/buySearch.js has no converse branch and exports no converseOut; (3) a request for it gets a refusal, not a search; (4) the page's client never names the action.
//   node scripts/converseRetiredCheck.mjs [repo root]   (a tree before the retirement fails); --mutants puts one caller back at a time.
import fs from "node:fs"; import path from "node:path"; import { spawnSync } from "node:child_process"; import { fileURLToPath, pathToFileURL } from "node:url";
const args = process.argv.slice(2), here = path.dirname(fileURLToPath(import.meta.url)), root = path.resolve(args.find(a => !a.startsWith("--")) || path.join(here, ".."));
if (args.includes("--mutants")) process.exit(mutants());
let pass = 0, fail = 0; const ok = (n, c, d) => { if (c) pass++; else { fail++; console.log("FAIL " + n + (d !== undefined ? " " + JSON.stringify(d) : "")); } };
const SKIP = new Set(["node_modules", ".git", "proofs", "docs", ".vercel"]), CALL = /action\s*:\s*\\?["']converse\\?["']|action\s*===?\s*\\?["']converse\\?["']|["']action["']\s*:\s*["']converse["']/;
const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => SKIP.has(e.name) ? [] : e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
const files = ["api", "lib", "public", "js", "scripts", "vercel.json"].filter(x => fs.existsSync(path.join(root, x))).flatMap(x => fs.statSync(path.join(root, x)).isDirectory() ? walk(path.join(root, x)) : [path.join(root, x)]).filter(f => /\.(js|mjs|html|json|yml|yaml)$/.test(f) && !/converseRetiredCheck\.mjs$/.test(f) && !/geo-us\.json$/.test(f));
const callers = files.filter(f => CALL.test(fs.readFileSync(f, "utf8"))).map(f => path.relative(root, f));
ok("(1) no file posts or branches on action converse", callers.length === 0, callers);
const bs = fs.readFileSync(path.join(root, "api/buySearch.js"), "utf8");
ok("(2) api/buySearch.js has no converse branch and no converseOut", !/converseOut/.test(bs) && !/b\.action === "converse"/.test(bs));
const buy = fs.readFileSync(path.join(root, "api/buy.js"), "utf8");
ok("(4) the page's client never names the action", !/converse/.test(buy.slice(buy.indexOf("const CLIENT = "))), "converse" );
// (3) the handler refuses it
process.chdir(root);
process.env.SUPABASE_URL = "https://fake.supabase.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "k"; process.env.LAUNCH_STAGE = "2"; process.env.OLDCARSDATA_API_KEY = "unused"; process.env.ANTHROPIC_API_KEY = "unused";
globalThis.fetch = async () => new Response("[]", { status: 200 });
{ const h = (await import(pathToFileURL(path.join(root, "api/buySearch.js")).href)).default; const res = { code: 0, body: null, headers: {}, status(c) { res.code = c; return res; }, json(b) { res.body = b; return res; }, send(b) { res.body = b; return res; }, end() { return res; }, setHeader() {}, getHeader() {}, removeHeader() {} };
  await Promise.race([h({ method: "POST", headers: {}, query: {}, body: { action: "converse", state: { messages: ["Porsche 911"] } }, url: "/api/buySearch" }, res), new Promise(r => setTimeout(r, 8000))]).catch(() => {});
  ok("(3) a request for the retired action gets a refusal, never a search answer", res.code >= 400 || (res.body && !res.body.type && !res.body.cards && !res.body.groups), { code: res.code, keys: res.body && Object.keys(res.body) }); }
console.log(`converseRetiredCheck: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
function mutants() {
  const me = fileURLToPath(import.meta.url), R = root;
  const M = [
    ["a script posts the action again", "scripts/buyTimes.mjs", s => s.replace('{ action: "parse", text: "" }', '{ action: "converse", state: { messages: [] } }')],
    ["the page's client calls it again", "api/buy.js", s => s.replace("return chatAsk({ __words: last });", 'return fetch("/api/buySearch", { body: JSON.stringify({ action: \\"converse\\" }) });')],
    ["the server branch is back", "api/buySearch.js", s => s.replace("const searching =", 'if (b.action === "converse") return res.status(200).json({ type: "results", cards: [] });\n    const searching =')],
    ["converseOut is exported again", "api/buySearch.js", s => s + "\nexport async function converseOut() { return null; }\n"],
    ["a check posts it again", "scripts/findAlwaysCardsCheck.mjs", s => s + '\nconst x = { action: "converse" };\n']
  ];
  let survived = 0;
  for (const [name, file, fn] of M) {
    const tmp = fs.mkdtempSync(path.join(fs.realpathSync("/tmp"), "cr-")); try {
      spawnSync("cp", ["-R", ...fs.readdirSync(R).filter(x => x !== "node_modules" && x !== ".git").map(x => path.join(R, x)), tmp]); fs.symlinkSync(path.join(R, "node_modules"), path.join(tmp, "node_modules"));
      const f = path.join(tmp, file), before = fs.readFileSync(f, "utf8"), after = fn(before); if (before === after) { console.log("SKIP (no change) " + name); survived++; continue; }
      fs.writeFileSync(f, after); const r = spawnSync(process.execPath, [me, tmp], { encoding: "utf8" }), killed = r.status !== 0; console.log((killed ? "killed   " : "SURVIVED ") + name); if (!killed) survived++;
    } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  }
  console.log(survived ? `${survived} mutant(s) survived` : "all mutants killed"); return survived ? 1 : 0;
}
