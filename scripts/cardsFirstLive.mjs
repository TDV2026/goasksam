// CARDS FIRST, LIVE (Lane B, lane-b-sell-cards-first, Nov 18 2026; order bc85 Stage 5). Read only, as a VISITOR (no crew cookie), one read at a time, each with its timing. Run it against the deployed site after the push:
//   node scripts/cardsFirstLive.mjs [--site https://goasksam.com]
// a. "1987 BMW 3 Series" read twice: the same cards both times; the 325i and 325is each show their own sale count (never a sibling's; "Too few sales for a range." only under 8).
// b. Sell "Ferrari 330 GT", typed and from the car bar address: the cards before any question; a tap on GT 2+2 opens Sell for that variant (the bar reads "Ferrari 330 GT 2+2"), then the first question.
// c. Sell "1987 Firebird": the cards first; a tap on Trans Am, then the questions.
// d. Sell with the VIN WP0AA29962S621698: no cards, the questions, then the 2002 911 result.
// e. Market Check "1987 Firebird" and "Ferrari 330 GT": the cards, as before.
// The protection bypass is read from the Keychain (goasksam-bypass) or GAS_BYPASS, in process, never printed.
import { execFileSync } from "node:child_process";
import puppeteer from "puppeteer-core";
const SITE = (process.argv.includes("--site") ? process.argv[process.argv.indexOf("--site") + 1] : "https://goasksam.com").replace(/\/$/, "");
const CHROME = process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BYPASS = process.env.GAS_BYPASS || (() => { try { return execFileSync("security", ["find-generic-password", "-s", "goasksam-bypass", "-w"], { encoding: "utf8" }).trim(); } catch { return ""; } })();
let pass = 0, fail = 0;
const check = (name, ok, detail) => { if (ok) { pass++; console.log("PASS  " + name); } else { fail++; console.log("FAIL  " + name + (detail !== undefined ? "  ->  " + String(detail).replace(/\s+/g, " ").slice(0, 300) : "")); } };
const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
const open = async () => { const p = await browser.newPage(); await p.setViewport({ width: 1440, height: 900 }); if (BYPASS) await p.setExtraHTTPHeaders({ "x-vercel-protection-bypass": BYPASS }); return p; };
const textOf = p => p.evaluate(() => document.body.innerText.replace(/\n+/g, " | "));
const until = async (p, fn, ms = 60000) => { const end = Date.now() + ms; while (Date.now() < end) { try { if (await p.evaluate(fn)) return true; } catch { /* moving */ } await new Promise(r => setTimeout(r, 700)); } return false; };
const ROWS = () => { const v = document.getElementById("vrs"); return v ? [...v.querySelectorAll(".vrs-row")].map(a => ({ label: (a.querySelector(".vrs-l") || {}).textContent || "", range: (a.querySelector(".vrs-range") || {}).textContent || "", few: (a.querySelector(".vrs-few") || {}).textContent || "", sales: (a.querySelector(".vrs-sales") || {}).textContent || "", href: a.getAttribute("href") })) : null; };
const QUESTION = () => /Which state is it in/.test(document.body.innerText);
const sameCards = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const num = s => { const m = /(\d[\d,]*)/.exec(s || ""); if (m) return Number(m[1].replace(/,/g, "")); const W = { no: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 }; const w = /^(\w+) sale/.exec(String(s || "").toLowerCase()); return w && W[w[1]] != null ? W[w[1]] : null; };

// a. the BMW, twice
const bmw = [];
for (const k of [1, 2]) { const p = await open(), t0 = Date.now(); await p.goto(SITE + "/market-check", { waitUntil: "networkidle2" }); await p.type("#pq", "1987 BMW 3 Series"); await p.keyboard.press("Enter");
  const ok = await until(p, () => !!document.getElementById("vrs"), 90000), ms = Date.now() - t0, rows = ok ? await p.evaluate(ROWS) : null; bmw.push({ ms, rows }); console.log(`  BMW read ${k}: ${ms} ms, ${rows ? rows.map(r => r.label + " " + r.sales + (r.range ? " " + r.range : " (" + r.few + ")")).join("; ") : "no cards"}`); await p.close(); }
check("a. '1987 BMW 3 Series' first read has the cards", !!bmw[0].rows && bmw[0].rows.length >= 2, bmw[0].ms + " ms");
check("a. ...and the second read has the same cards", sameCards(bmw[0].rows, bmw[1].rows), JSON.stringify([bmw[0].rows, bmw[1].rows]));
{ const r = bmw[1].rows || []; const s325 = r.find(x => x.label === "325i"), s325is = r.find(x => x.label === "325is");
  check("a. the 325i and the 325is each show their own count (not the same sales)", !!s325 && !!s325is && !(num(s325.sales) === num(s325is.sales) && s325.range === s325is.range), JSON.stringify([s325, s325is]));
  check("a. no card says 'Too few sales for a range.' at 8 sales or more", r.every(x => !/Too few/.test(x.few) || num(x.sales) < 8), JSON.stringify(r)); }

// b. Sell Ferrari 330 GT, typed (the address the page goes to) and from the car bar
for (const [how, url] of [["typed", null], ["car bar", SITE + "/sell?car=Ferrari%20330%20GT"]]) {
  const p = await open(), t0 = Date.now();
  if (url) await p.goto(url, { waitUntil: "networkidle2" }); else { await p.goto(SITE + "/sell", { waitUntil: "networkidle2" }); await p.type("#pq, #ob-input", "Ferrari 330 GT"); await p.keyboard.press("Enter"); }
  const ok = await until(p, () => !!document.getElementById("vrs") || /Which state is it in/.test(document.body.innerText), 90000), ms = Date.now() - t0, rows = await p.evaluate(ROWS).catch(() => null), q = await p.evaluate(QUESTION);
  console.log(`  Sell Ferrari 330 GT (${how}): ${ms} ms, cards ${rows ? rows.map(r => r.label).join(", ") : "none"}, question ${q}`);
  check(`b. Sell 'Ferrari 330 GT' (${how}): the cards before any question`, ok && !!rows && rows.length >= 2 && !q, JSON.stringify(rows) + " q=" + q);
  const gt = (rows || []).find(r => /2\+2/.test(r.label));
  if (gt) { await p.goto(SITE + gt.href, { waitUntil: "networkidle2" }); await until(p, QUESTION, 60000); const bar = await p.evaluate(() => (document.querySelector(".gcb-line") || {}).textContent || ""), q2 = await p.evaluate(QUESTION);
    check(`b. (${how}) a tap on GT 2+2: the bar reads "Ferrari 330 GT 2+2", then the first question`, /Ferrari 330 GT 2\+2/.test(bar) && q2, bar + " q=" + q2); }
  await p.close(); }

// c. Sell 1987 Firebird
{ const p = await open(), t0 = Date.now(); await p.goto(SITE + "/sell?car=1987%20Pontiac%20Firebird", { waitUntil: "networkidle2" }); await until(p, () => !!document.getElementById("vrs") || /Which state is it in/.test(document.body.innerText), 90000);
  const rows = await p.evaluate(ROWS).catch(() => null), q = await p.evaluate(QUESTION); console.log(`  Sell 1987 Firebird: ${Date.now() - t0} ms, cards ${rows ? rows.map(r => r.label).join(", ") : "none"}`);
  check("c. Sell '1987 Firebird': the cards first, no question", !!rows && rows.length >= 2 && !q, JSON.stringify(rows));
  const ta = (rows || []).find(r => /Trans Am/.test(r.label) && !/GTA|Turbo|20th/.test(r.label)); if (ta) { await p.goto(SITE + ta.href, { waitUntil: "networkidle2" }); await until(p, QUESTION, 60000); const bar = await p.evaluate(() => (document.querySelector(".gcb-line") || {}).textContent || ""), q2 = await p.evaluate(QUESTION); check("c. a tap on Trans Am: the bar reads the Trans Am, then the questions", /Trans Am/.test(bar) && q2, bar + " q=" + q2); }
  await p.close(); }

// d. the VIN
{ const p = await open(), t0 = Date.now(); await p.goto(SITE + "/sell", { waitUntil: "networkidle2" }); await p.type("#pq, #ob-input", "WP0AA29962S621698"); await p.keyboard.press("Enter"); await until(p, () => !!document.getElementById("vrs") || /Which state is it in/.test(document.body.innerText), 90000);
  const rows = await p.evaluate(ROWS).catch(() => null), q = await p.evaluate(QUESTION); console.log(`  Sell VIN: ${Date.now() - t0} ms, cards ${rows ? "yes" : "none"}, question ${q}`);
  check("d. Sell with the VIN: no cards, the first question", !rows && q, JSON.stringify(rows) + " q=" + q); await p.close(); }

// e. Market Check, unchanged
for (const car of ["1987 Pontiac Firebird", "Ferrari 330 GT"]) { const p = await open(), t0 = Date.now(); await p.goto(SITE + "/market-check", { waitUntil: "networkidle2" }); await p.type("#pq", car); await p.keyboard.press("Enter"); const ok = await until(p, () => !!document.getElementById("vrs"), 90000), rows = ok ? await p.evaluate(ROWS) : null;
  console.log(`  Market Check ${car}: ${Date.now() - t0} ms, cards ${rows ? rows.map(r => r.label).join(", ") : "none"}`); check(`e. Market Check '${car}': the cards`, !!rows && rows.length >= 2, JSON.stringify(rows)); await p.close(); }

await browser.close();
console.log(`cardsFirstLive ${SITE}: ${pass} pass, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
