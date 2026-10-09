// One Box gearbox golden (items 3 & 4 + the >=3-per-side pattern threshold).
// FAILS if the manual-vs-E-gear pattern line appears when either side has fewer than 3 sales
// (the reported bug: a line resting on a single manual, the searched car itself), or if the
// gearbox labels regress to "(6-speed)"/"Automatic" on an E-gear model. Production, crew cookie.
//   node scripts/oneboxGearboxGolden.mjs [https://base]
import puppeteer from "puppeteer-core";
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE = (process.argv.find(a => a.startsWith("http")) || "https://goasksam.com").replace(/\/$/, "");
const b = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
const p = await b.newPage();
await p.setCookie({ name: "gas_crew", value: process.env.GAS_CREW_COOKIE || "", domain: new URL(BASE).hostname, path: "/" });

async function read(query) {
  await p.goto(BASE + "/onebox", { waitUntil: "networkidle2" });
  await p.waitForSelector("#ob-input", { timeout: 15000 });
  await p.click("#ob-input"); await p.type("#ob-input", query);
  await p.click("#ob-go");
  // wait for the intake (chips) or the read to appear, then click through the mileage intake
  try { await p.waitForFunction(() => { const o = document.getElementById("ob"); return o && (/just show me what sold/i.test(o.innerText || "") || /recorded sales ran|SOLD/i.test(o.innerText || "")); }, { timeout: 20000 }); } catch (e) {}
  await p.evaluate(() => { const e = [...document.querySelectorAll("#ob button,#ob .chip,#ob a")].find(x => /just show me what sold/i.test(x.textContent || "")); if (e) e.click(); });
  // wait for the actual read (receipt rows) to render
  try { await p.waitForFunction(() => { const o = document.getElementById("ob"); return o && /recorded sales ran|SOLD/i.test(o.innerText || ""); }, { timeout: 20000 }); } catch (e) {}
  await new Promise(r => setTimeout(r, 1200));
  return p.evaluate(() => (document.getElementById("ob") || {}).innerText || "");
}

let fails = 0; const ck = (n, ok, d = "") => { console.log((ok ? "PASS " : "FAIL ") + n + (ok ? "" : "  -> " + d)); if (!ok) fails++; };

// Murcielago LP640 Coupe: 1 manual ($900k, the 6-Speed) + several E-gears -> the pattern line must
// NOT appear (manual side < 3), and the labels must read E-gear / Manual, never "(6-speed)".
const t = await read("2007 Lamborghini Murcielago LP640 Coupe");
const patternN = (t.match(/manuals here sold/gi) || []).length;
const manualRows = (t.match(/·\s*Manual\b/g) || []).length;
const egearRows = (t.match(/·\s*E-gear\b/gi) || []).length;
console.log(`  observed: manual rows=${manualRows}, E-gear rows=${egearRows}, pattern-line=${patternN}`);
ck("pattern line omitted when a side < 3 sales", !(patternN > 0 && (manualRows < 3 || egearRows < 3)), `pattern shown with manuals=${manualRows} egears=${egearRows}`);
ck("E-gear label present (not '(6-speed)')", /E-gear/i.test(t) && !/\(6-speed\)/i.test(t), t.match(/\(6-speed\)/i) ? "still shows (6-speed)" : "no E-gear label");
ck("factory manual labelled 'Manual'", /·\s*Manual\b/.test(t), "no Manual label");

await b.close();
console.log(`\n${fails ? fails + " FAILURE(S)." : "Gearbox golden passed."}`);
process.exit(fails ? 1 : 0);
