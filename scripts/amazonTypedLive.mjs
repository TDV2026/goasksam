// LIVE: this script calls production (goasksam.com). Run it only in a gap the lanes name, with the protection-bypass
// header (Lane F's rule). Refuses without --live.
// THE AMAZON DEMO'S TYPED MATRIX, LIVE (Sam, Oct 20 2026: "ensure that we can still type in any vin and any YMM"; Lane E).
// Each typed input on the three tabs, in a real browser, one page at a time, behind the demo gate (signed crew cookie
// from the Keychain, never printed): tab a's box (#a-q, Check), tab b's VIN box (#b-vin, Look up), tab c's car bar
// (?car=). For each: exactly the expected case is visible, the output area is never blank, no error text, no "Sample
// asking price" (typed cars carry none), and every dollar figure on the module is one the partner answer itself carries
// (its range, its sales, its set-aside rows, its history): no invented price. Zero OldCarsData.
//   CREW=... PROBE_KEY=... VERCEL_AUTOMATION_BYPASS_SECRET=... node scripts/amazonTypedLive.mjs --live [--only 0,3] [--views a,b,c]
import puppeteer from "puppeteer-core";
if (!process.argv.includes("--live")) { console.log("amazonTypedLive: LIVE script (production). Pass --live, in a named gap only."); process.exit(2); }
const arg = n => { const i = process.argv.indexOf("--" + n); return i < 0 ? null : process.argv[i + 1]; };
const BASE = "https://goasksam.com", HOST = "goasksam.com", CREW = process.env.CREW, BYP = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
if (!CREW) { console.log("amazonTypedLive: CREW (the signed crew cookie value) is required."); process.exit(2); }
const UNREAD = "We couldn't read that VIN", OUTSCOPE = "Market Check covers enthusiast and specialty cars in this pilot.";
// [typed, expectation, note]
const M = [
  ["WBSBF932XSEH00621", "answer", "a real 1995 M3 VIN"],
  ["WDDXJ8FB2FA010198", "out", "decodes as a 2015 S550 coupe, out of scope"],
  ["WBSBF932XSEH006", "unread", "a garbage VIN (15 characters)"],
  ["1GGCS1443X8600001", "any", "a decodable VIN with a valid check digit and no record (case b if no sales)"],
  ["1995 BMW M3", "answer", "in scope, sales"],
  ["1967 Toyota 2000GT", "answer", "a typed car with a thin answer"],
  ["2018 Toyota Camry", "out", "out of scope"],
  ["1971 Mercedes 280SE", "question", "ambiguous: the engine asks"],
  ["Porsche 911", "question", "ambiguous: the engine asks"],
  ["2017 Mercedes-Benz C63 AMG", "answer", "a typed car the engine may refuse a range for"],
  ["WBSBF932XSEH0062Z", "unread", "the real M3 VIN mistyped (check digit fails, no record)"],
  ["WDB2032651F417934", "history", "a RECORDED VIN whose check digit fails: the exact car with its history"],
];
const only = arg("only") ? arg("only").split(",").map(Number) : M.map((_, i) => i), views = (arg("views") || "a,b,c").split(",");
const usd = n => "$" + Math.round(Number(n)).toLocaleString("en-US");
const CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", protocolTimeout: 600000, args: ["--no-sandbox"] });
let fails = 0, rows = 0; const fail = (w, m) => { fails++; console.log(`  FAIL ${w}: ${m}`); };
const allowedUsd = a => { const s = new Set(); const add = n => { if (Number(n) > 0) s.add(usd(n)); };
  if (a && a.range) { add(a.range.low); add(a.range.high); }
  for (const r of [...((a && a.sales) || []), ...((a && a.asideRows) || [])]) { add(r.price); add(r.allIn); add(r.hammer); }
  for (const h of (a && a.history) || []) { add(h.price); add(h.highBid); }
  const html = String((a && (a.card || a.cardWithRows)) || "") + String((a && a.quarter) || ""); for (const m of html.matchAll(/\$[\d,]+/g)) s.add(m[0]);
  for (const t of (a && a.trend) || []) { add(t.low); add(t.high); }
  return s; };
try {
  for (const i of only) for (const v of views) {
    rows++; const [q, want, note] = M[i], where = `"${q}" tab ${v}`;
    const pg = await browser.newPage(); await pg.setViewport({ width: 1440, height: 1000 });
    if (BYP) await pg.setExtraHTTPHeaders({ "x-vercel-protection-bypass": BYP });
    await pg.setCookie({ name: "gas_crew", value: CREW, domain: HOST, path: "/" });
    const answers = []; let errs = 0;
    pg.on("response", async res => { try { if (/\/api\/partnerAnswer$/.test(new URL(res.url()).pathname) && res.request().method() === "POST") { if (res.status() >= 500) errs++; answers.push(await res.json().catch(() => null)); } } catch {} });
    const url = v === "c" ? `${BASE}/preview?p=amazon&view=c&car=${encodeURIComponent(q)}` : `${BASE}/preview?p=amazon&view=${v}`;
    const resp = await pg.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => null);
    if (!resp || resp.status() !== 200) { fail(where, `page answered ${resp ? resp.status() : 0}`); await pg.close(); continue; }
    await new Promise(r => setTimeout(r, 1500));
    const n0 = answers.length;
    if (v === "a" || v === "b") {
      const box = v === "a" ? "#a-q" : "#b-vin", go = v === "a" ? "[data-a-go]" : "[data-b-go]";
      await pg.$eval(box, el => { el.value = ""; }).catch(() => {}); await pg.type(box, q).catch(e => fail(where, "no input box " + box)); await pg.click(go).catch(e => fail(where, "no button " + go));
    } else await pg.evaluate(() => { const b = document.querySelector("[data-mc-toggle]"); if (b) b.click(); }).catch(() => {});
    for (let k = 0; k < 60 && answers.length <= (v === "c" ? 0 : n0) ; k++) await new Promise(r => setTimeout(r, 500));
    await new Promise(r => setTimeout(r, 2500));
    const a = answers[answers.length - 1] || null;
    const out = await pg.evaluate(v => { const el = document.querySelector(v === "a" ? "#a-out" : v === "b" ? "#b-out" : "main") || document.body; return { text: el.innerText || "", page: document.body.innerText || "", sample: /Sample asking price/.test(document.body.innerText) }; }, v);
    const T = out.text.replace(/\s+/g, " ").trim();
    console.log(`${where} (${note}): answer ${a ? (a.answerType || a.error) : "none"}${a && a.range ? " " + usd(a.range.low) + " to " + usd(a.range.high) : ""}${a && a.history ? ", history " + a.history.length : ""}; shows "${T.slice(0, 150)}"`);
    if (!T) fail(where, "blank output");
    if (errs || /something went wrong|error|undefined|NaN|\[object/i.test(T)) fail(where, "error text or a 5xx");
    if (want === "unread" && !T.includes(UNREAD)) fail(where, "not the unreadable line");
    if (want !== "unread" && T.includes(UNREAD)) fail(where, "the unreadable line on a readable input");
    if (want === "out" && !T.includes(OUTSCOPE)) fail(where, "not the out-of-scope line");
    if (want !== "out" && T.includes(OUTSCOPE)) fail(where, "the out-of-scope line on an in-scope car");
    if (want === "question" && !(a && a.answerType === "identity_question" && a.question && (a.question.options || []).length)) fail(where, "no engine question with options");
    if (want === "history" && !(a && Array.isArray(a.history) && a.history.length)) fail(where, "no history for the recorded VIN");
    if (/for this VIN/.test(T) && !/^[A-HJ-NPR-Z0-9]{17}$/.test(q)) fail(where, "a VIN line for typed words");
    if (out.sample) fail(where, "a Sample asking price on a typed car");
    const ok = allowedUsd(a), seen = [...new Set((T.match(/\$[\d,]+/g) || []))], stray = seen.filter(x => !ok.has(x));
    if (stray.length) fail(where, `dollar figures the answer does not carry: ${stray.join(", ")}`);
    await pg.close();
  }
} finally { await browser.close(); }
console.log(fails ? `amazonTypedLive: ${rows} pages, ${fails} FAIL` : `amazonTypedLive: ${rows} pages, all pass`);
process.exit(fails ? 1 : 0);
