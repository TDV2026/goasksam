// THE HOUSE TIER'S BOX IS THE ENGINE'S (Sam, Oct 29 2026, one engine). The Market Check thin (house) tier classified each receipt's gearbox in the browser from its title and transmission text
// (gearboxLabel: Manual, Manual (conversion), E-gear by a model-name list), decided whether the pool split on it (htGearboxSplit) and built the observed-pattern line from the receipts' prices
// (gearboxPatternLine). Cause: the receipts carried only the raw transmission text. The engine now says it: each receipt gearboxKind and gearboxWord (houseGearboxOf, from the one table lib/modelRules.js
// GEARBOX_WORDS), the thin answer gearboxSplit and gearboxPatternLine. Pages: Market Check's thin tier (the only reader; Sell and Find draw the shared card, which never classified a box).
//   1. the engine: houseGearboxOf over the cases the page used to handle;
//   2. the page prints the engine's fields: sentinel words on the receipts, the flag and the line, titles that say the opposite;
//   3. static: no gearbox classifier left in public/js/onebox.js.
//   node scripts/houseGearboxCheck.mjs
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import puppeteer from "puppeteer-core";
process.env.LAUNCH_STAGE = "2"; process.env.SUPABASE_URL = "https://example.supabase.co"; process.env.SUPABASE_SERVICE_ROLE_KEY = "x";
const ROOT = path.resolve(new URL("..", import.meta.url).pathname); process.chdir(ROOT);
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
globalThis.fetch = async () => { throw new Error("no network in this check"); };
const E = await import("../lib/onebox.js");
// 1. the engine
ok(typeof E.houseGearboxOf === "function", "engine: houseGearboxOf exists");
const G = (make, model, year, transmission, title = "") => typeof E.houseGearboxOf === "function" ? E.houseGearboxOf({ make, model, year, transmission }, title) : {};
const cases = [
  [G("Lamborghini", "Murcielago", 2005, "6-Speed Manual"), { gearboxKind: "manual", gearboxWord: "Manual" }, "a factory manual"],
  [G("Lamborghini", "Murcielago", 2005, "6-Speed Manual", "2005 Murcielago manual conversion"), { gearboxKind: "manual_conversion", gearboxWord: "Manual (conversion)" }, "a manual conversion is never a factory manual"],
  [G("Lamborghini", "Murcielago", 2005, "Automatic"), { gearboxKind: "auto", gearboxWord: "E-Gear" }, "a Murcielago's automated box, the table's word"],
  [G("Porsche", "911", 2012, "PDK"), { gearboxKind: "auto", gearboxWord: "PDK" }, "the receipt's own word when it names the box"],
  [G("Ford", "Mustang", 1969, "Automatic"), { gearboxKind: "auto", gearboxWord: "Automatic" }, "a plain automatic"],
  [G("Ford", "Mustang", 1969, ""), { gearboxKind: null, gearboxWord: null }, "a receipt that states nothing"],
];
for (const [got, want, what] of cases) ok(got.gearboxKind === want.gearboxKind && got.gearboxWord === want.gearboxWord, `engine: ${what} (${JSON.stringify(got)})`);
// 2. the page
const thinBase = JSON.parse(fs.readFileSync("scripts/fixtures/answer-diablo.json", "utf8"));
const mk = (i, word, title, tr) => ({ ...thinBase.thin.receipts[0], id: "r" + i, date: "2026-0" + (1 + (i % 8)) + "-10", hammer: 100000 + i * 5000, mileage: 9000 + i * 100, title, transmission: tr, gearboxKind: "auto", gearboxWord: word });
const receipts = [mk(1, "SENTINEL BOX ONE", "2001 Lamborghini Diablo manual 5-speed", "5-Speed Manual"), mk(2, "SENTINEL BOX TWO", "2001 Lamborghini Diablo VT", "Automatic"), mk(3, "SENTINEL BOX ONE", "2001 Lamborghini Diablo", "Manual"), mk(4, "SENTINEL BOX TWO", "2001 Lamborghini Diablo", null)];
const withEng = { ...thinBase, thin: { ...thinBase.thin, receipts, gearboxSplit: true, gearboxPatternLine: "SENTINEL PATTERN LINE." } };
const without = { ...thinBase, thin: { ...thinBase.thin, receipts: receipts.map(r => ({ ...r, gearboxWord: null, gearboxKind: null })), gearboxSplit: false, gearboxPatternLine: null } };
const { default: h } = await import(pathToFileURL(path.join(ROOT, "api/marketCheck.js")).href);
const html = await new Promise(r => { const res = { setHeader() {}, getHeader() {}, status() { return res; }, send(x) { r(String(x)); return res; }, end(x) { r(String(x || "")); return res; } }; h({ method: "GET", url: "/market-check", query: {}, headers: { host: "goasksam.com", cookie: "" }, socket: {} }, res); });
const CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
if (!fs.existsSync(CHROME)) console.log("SKIP page in Chrome: no Chrome at " + CHROME);
else {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
  const open = async payload => { const p = await b.newPage(); await p.setViewport({ width: 1440, height: 900 }); await p.setRequestInterception(true);
    p.on("request", r => { const u = new URL(r.url());
      if (u.host === "goasksam.com" && r.isNavigationRequest()) return r.respond({ status: 200, contentType: "text/html", body: html });
      const loc = /^\/obx\.[^/]+\/onebox\.js$/.test(u.pathname) ? "public/js/onebox.js" : (/^\/js(?:\.[^/]+)?\/([\w.-]+\.js)$/.exec(u.pathname) ? "public/js/" + /^\/js(?:\.[^/]+)?\/([\w.-]+\.js)$/.exec(u.pathname)[1] : null);
      if (u.host === "goasksam.com" && loc && fs.existsSync(loc)) return r.respond({ status: 200, contentType: "application/javascript", body: fs.readFileSync(loc, "utf8") });
      if (u.host === "goasksam.com" && u.pathname === "/api/sellerDecision") return r.respond({ status: 200, contentType: "application/json", body: JSON.stringify({ ...payload, status: "one_box" }) });
      if (u.host === "goasksam.com" && /^\/api\//.test(u.pathname)) return r.respond({ status: 200, contentType: "application/json", body: "{}" });
      if (u.host !== "goasksam.com") return r.respond({ status: 204, body: "" }); r.continue(); });
    await p.goto("https://goasksam.com/market-check", { waitUntil: "networkidle2" }).catch(() => {});
    await p.type("#ob-input", "2001 Lamborghini Diablo SE"); await p.keyboard.press("Enter"); await new Promise(r => setTimeout(r, 1800));
    return p; };
  { const p = await open(withEng), t = await p.evaluate(() => document.body.innerText.replace(/\s+/g, " "));
    ok(/SENTINEL PATTERN LINE\./.test(t), "page: the engine's gearboxPatternLine prints");
    ok(!/\bManual\b[^.]{0,40}\bE-gear/i.test(t.replace(/SENTINEL[^.]*\./g, "")), "page: no box word built from a title or a transmission text");
    await p.close(); }
  { const p = await open(without), t = await p.evaluate(() => document.body.innerText.replace(/\s+/g, " "));
    ok(!/SENTINEL|The manuals here sold|E-gear|Manual \(conversion\)/.test(t), "page: with no engine fields the receipts show no box and no pattern line, whatever their titles say");
    await p.close(); }
  await b.close();
}
// 3. static
const src = fs.readFileSync("public/js/onebox.js", "utf8").replace(/^\s*\/\/.*$/gm, "");
for (const [re, what] of [[/function gearboxLabel|gearboxLabel\(/, "a gearbox classifier"], [/EGEAR_MODELS|murci/i, "a model list for the automated box"], [/R4C_MANUAL|R4C_AUTO/, "a transmission regex"], [/function gearboxPatternLine|GEARBOX_PATTERN_MIN/, "the pattern line built from prices"], [/The manuals here sold/, "the pattern sentence written on the page"]]) ok(!re.test(src), `public/js/onebox.js: no ${what}`);
ok(/htGearboxSplit && rc\.gearboxWord\) segs\.push\(rc\.gearboxWord\)/.test(src) && /htGearboxSplit = !!ht\.gearboxSplit/.test(src) && /d\.thin\.gearboxPatternLine/.test(src), "public/js/onebox.js: the receipt row, the split flag and the pattern line read the engine's gearboxWord, gearboxSplit and gearboxPatternLine");
console.log(`houseGearboxCheck: ${pass} pass, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
