// One Box golden-set regression guard. Drives the real gated /onebox page for ~20 inputs that
// cover every result state, captures the RENDERED text, and diffs it against a stored snapshot
// (scripts/onebox-golden.json). Dollar/mileage/year figures are masked to $N / Nk / YYYY so the
// nightly data drift never trips it - only a TEMPLATE or STATE change does. Run:
//   node scripts/oneboxGolden.mjs              # check against the snapshot (non-zero exit on diff)
//   node scripts/oneboxGolden.mjs --update     # rewrite the snapshot (explicit, reviewed change)
//   node scripts/oneboxGolden.mjs https://<preview-url>   # target a specific deploy
import puppeteer from "puppeteer-core";
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const UPDATE = args.includes("--update");
const BASE = (args.find(a => a.startsWith("http")) || "https://goasksam.com").replace(/\/$/, "");
const SNAP = path.join(process.cwd(), "scripts", "onebox-golden.json");
const CHROME = [process.env.CHROME_PATH, "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome", "/usr/bin/chromium-browser"].filter(Boolean).find(p => fs.existsSync(p));
if (!CHROME) { console.error("No Chrome found. Set CHROME_PATH."); process.exit(2); }

// state coverage: matched dense/modified/thin/two-sale, unmatched dense/thin, varied + thin
// refusal, generation choice, and the M / AMG / RS badge families.
const INPUTS = [
  "WBSAK0301LAE33492", "ZHWBC8AH7ALA03815", "194371S119431", "HDK4316006", "WBS4Y9C55KAG67564",
  "JTHMPAAY3TA113218", "997 Carrera S coupe", "718 Cayman S coupe", "Lotus Esprit", "Maserati Merak",
  "991 GT3 RS", "2016 Chevrolet Corvette Z06 coupe", "2013 Ford Mustang Shelby GT500 coupe",
  "911", "Corvette", "Mustang", "2019 BMW M4 Competition coupe", "2016 Mercedes-Benz C63 AMG coupe",
  "2018 Audi RS5 coupe", "458 Speciale coupe"
];

// Mask volatile numbers so only template/state text is compared.
const mask = s => String(s || "")
  .replace(/\$[\d,]+/g, "$N")
  .replace(/\b\d[\d,]*(?:\.\d+)?k\b/gi, "Nk")
  .replace(/\b\d[\d,]*\s?mi\b/gi, "N mi")
  .replace(/\b(?:19|20)\d{2}\b/g, "YYYY")
  .replace(/\s+/g, " ").trim();

async function capture(page, input) {
  await page.waitForSelector("#ob-input", { timeout: 15000 });
  await page.type("#ob-input", input);
  await page.click("#ob-go");
  await page.waitForFunction(() => { const r = document.getElementById("ob"); return r && (r.querySelector(".samtake") || r.querySelector(".refusal") || r.querySelector(".chips") || /trouble reading the market/i.test(r.textContent || "")); }, { timeout: 35000 }).catch(() => {});
  await new Promise(r => setTimeout(r, 1300));
  return page.evaluate(() => {
    const g = s => { const e = document.querySelector(s); return e ? e.textContent.replace(/\s+/g, " ").trim() : null; };
    const all = s => [...document.querySelectorAll(s)].map(e => e.textContent.replace(/\s+/g, " ").trim());
    let state = "unknown";
    if (document.querySelector(".samtake")) state = document.querySelector(".exact") ? "matched_result" : "unmatched_result";
    else if (document.querySelector(".refusal")) state = document.querySelector(".refusal .ans") ? "varied_refusal" : "thin_refusal";
    else if (document.querySelector(".chips .chip[data-genquery]")) state = "generation_choice";
    else if (document.querySelector(".chips")) state = "choice";
    else if (/trouble reading the market/i.test(document.getElementById("ob").textContent || "")) state = "error";
    return {
      state,
      exact: g(".exact h2"), cfg: g(".exact .cfg"), disc: g(".exact .disc summary"),
      ladder: g(".samtake .ladder"), s1: g(".samtake .s1"), s2: g(".samtake .s2"), s3: g(".samtake .s3"), s4: g(".samtake .s4"), meta: g(".samtake .meta"),
      earned: g(".earned .q"), chips: all(".earned .qchip"),
      platforms: all(".plat-strip .plat-pill"), platNote: g(".plat-note"),
      refusalAns: g(".refusal .ans"), refusalReason: all(".refusal .sam p"), wayfwd: all(".wayfwd .chip"),
      genPrompt: g(".sam p"), genChips: all(".chips .chip"),
      cards: document.querySelectorAll("a.rcard, .receipts .rcard").length > 0
    };
  });
}

const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
const results = {};
try {
  const host = new URL(BASE).hostname;
  for (const input of INPUTS) {
    const page = await browser.newPage();
    await page.setCookie({ name: "gas_crew", value: "ok", domain: host, path: "/" });
    await page.goto(BASE + "/onebox", { waitUntil: "networkidle2" });
    const raw = await capture(page, input);
    // mask volatile fields
    const masked = {};
    for (const k of Object.keys(raw)) {
      if (Array.isArray(raw[k])) masked[k] = raw[k].map(mask);
      else if (typeof raw[k] === "string") masked[k] = mask(raw[k]);
      else masked[k] = raw[k];
    }
    results[input] = masked;
    await page.close();
  }
} finally { await browser.close(); }

if (UPDATE) {
  fs.writeFileSync(SNAP, JSON.stringify(results, null, 2) + "\n");
  console.log(`Wrote ${Object.keys(results).length} golden snapshots to ${SNAP}`);
  process.exit(0);
}

const golden = fs.existsSync(SNAP) ? JSON.parse(fs.readFileSync(SNAP, "utf8")) : {};
let diffs = 0;
for (const input of INPUTS) {
  const a = JSON.stringify(golden[input] || null), b = JSON.stringify(results[input] || null);
  if (a !== b) {
    diffs++;
    console.log(`\nCHANGED: ${input}`);
    console.log("  before:", a);
    console.log("  after: ", b);
  } else {
    console.log(`ok  ${input}  [${results[input].state}]`);
  }
}
if (diffs) { console.error(`\n${diffs} golden snapshot(s) changed. Review, then re-run with --update if intended.`); process.exit(1); }
console.log(`\nAll ${INPUTS.length} golden snapshots match.`);
