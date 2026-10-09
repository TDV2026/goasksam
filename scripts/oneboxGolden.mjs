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
// Vercel Attack Challenge Mode returns HTTP 429 (x-vercel-mitigated: challenge) to bot-like
// clients. A desktop browser solves the JS challenge transparently, but a headless browser on
// a datacenter IP (the CI runner) can still be challenged, which is what parked this job. When
// the Protection-Bypass-for-Automation secret is present we send it as a header so the CI
// headless run clears the edge deterministically - same mechanism as scripts/smokeProd.js.
const BYPASS = process.env.VERCEL_AUTOMATION_BYPASS_SECRET || process.env.VERCEL_PROTECTION_BYPASS || "";
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
  "2018 Audi RS5 coupe", "458 Speciale coupe", "1966 Ferrari 275 GTB",
  // Intrinsic-AMG guard (Sep 2026): a model whose NAME carries the halo token ("SLS AMG") must
  // not have its own pool emptied by the AMG exclusion. Three cases cover the whole car:
  //  - bare -> pool is real (both bodies present) so it asks the body split (was a false-zero refusal).
  //  - coupe -> the gullwing base pool renders a real spread (was a false refusal via the halo split,
  //    because the coupe has enough online sales to skip thin mode and hit the base-arm bug).
  //  - roadster -> renders a real result (always worked, via thin mode; locked so a fix here cannot
  //    regress it). A regression to either intrinsic-AMG bug flips coupe/bare back to a refusal.
  "2013 Mercedes-Benz SLS AMG",
  "2013 Mercedes-Benz SLS AMG coupe",
  "2013 Mercedes-Benz SLS AMG roadster",
  // GTO generation guard (Sep 2026): "1968 Pontiac GTO" must bind to the 1968-1972 generation and
  // not pool the 1966-1967 prior generation. This entry locks the end-to-end state/template; the
  // year-level assertion (no 1966-67, window 1968-1972) lives in scripts/verifyGtoGen.mjs since the
  // golden masks years. A regression that empties/refuses the pool trips this; the year re-pool
  // trips verifyGtoGen.
  "1968 Pontiac GTO coupe"
];

// Mask volatile numbers so only template/state text is compared.
const mask = s => String(s || "")
  .replace(/\$[\d,]+/g, "$N")
  .replace(/\b\d[\d,]*(?:\.\d+)?k\b/gi, "Nk")
  .replace(/\b\d[\d,]*\s?mi\b/gi, "N mi")
  .replace(/\b(?:19|20)\d{2}\b/g, "YYYY")
  // Month names drift with the data (the freshness line "Latest X sale: October YYYY" rolls each
  // month a newer sale lands), so neutralise them to MON - only a template/state change should trip.
  .replace(/\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\b/gi, "MON")
  .replace(/\s+/g, " ").trim();

// Cold-runner paint budget. Two known slow tails render a FALSE "unknown" under a tight wait on
// a cold, shared CI runner even though the car renders a full result everywhere else: (1) a VIN /
// pre-1981 chassis input (contiguous 10-17 alnum) takes the TWO-HOP identity path
// (decode/chassis-match -> archive exact-sale anchor -> pool), ~24s locally and more on CI (the
// 194371S119431 1971 Corvette flake); (2) a muscle-car input triggers the bounded description
// second-fetch (the 2013 Shelby GT500 flake). Give VINs a generous ceiling and raise the base
// well clear of both tails; still finite so a genuine hang eventually surfaces.
const isVinLike = input => /^[A-Z0-9]{10,17}$/i.test(String(input).replace(/\s+/g, ""));
async function capture(page, input) {
  await page.waitForSelector("#ob-input", { timeout: 15000 });
  await page.type("#ob-input", input);
  await page.click("#ob-go");
  const paintTimeout = isVinLike(input) ? 90000 : 60000;
  await page.waitForFunction(() => { const r = document.getElementById("ob"); return r && (r.querySelector(".livetake") || r.querySelector(".samtake") || r.querySelector(".refusal") || r.querySelector(".chips") || /trouble reading the market/i.test(r.textContent || "")); }, { timeout: paintTimeout }).catch(() => {});
  await new Promise(r => setTimeout(r, 1300));
  return page.evaluate(() => {
    const ob = document.getElementById("ob") || document.body;
    const g = s => { const e = document.querySelector(s); return e ? e.textContent.replace(/\s+/g, " ").trim() : null; };
    const all = s => [...document.querySelectorAll(s)].map(e => e.textContent.replace(/\s+/g, " ").trim());
    // STATE (Oct 2026 redesign DOM): a result is the answer card (.anscard.livetake), MATCHED when an
    // exact/VIN hero card (.card.exact) is present. Refusal keeps .refusal (.ans = varied, else thin).
    // Generation choice chips carry data-genquery; any other qscreen/chips = a clarify choice.
    let state = "unknown";
    if (document.querySelector(".livetake")) state = document.querySelector(".card.exact") ? "matched_result" : "unmatched_result";
    else if (document.querySelector(".refusal")) state = document.querySelector(".refusal .ans") ? "varied_refusal" : "thin_refusal";
    else if (document.querySelector(".chip[data-genquery]")) state = "generation_choice";
    else if (document.querySelector(".qscreen .chip, .chips .chip, .qchip")) state = "choice";
    else if (/trouble reading the market/i.test(ob.textContent || "")) state = "error";
    return {
      state,
      carline: g(".carline"),
      // ANSWER CARD (redesign): pool-scope eyebrow, the ONE cluster band ($X to $Y), the landed /
      // no-band lead, the older-outside count line, freshness, and Sam's Take (cluster tier only).
      eyebrow: g(".anscard .eyebrow"), band: g(".range.band"), lead: g(".anscard .lead"),
      older: g(".ans-line.older"), fresh: g(".fresh"),
      samTake: g(".anscard .take p"), takeCount: document.querySelectorAll(".anscard .take p").length,
      contradiction: g(".contradiction"),
      // engine-gated note lines
      mifallback: g(".mifallback"), varynote: g(".varynote"), splitlines: all(".splitline"),
      // RECENT COMPARABLE SALES: section head + scope, the hero (closest / this car), the side cards.
      secHead: g(".sec-head h2"), scope: g(".sec-head .scope"),
      heroPill: g(".cards5 .hero .pill"), heroTitle: g(".cards5 .hero .ctitle"), heroWhy: g(".cards5 .hero .cwhy"),
      sidePills: all(".cards5 .stack .card .pill"),
      // exact (VIN) hero fields
      exactTitle: g(".card.exact .ctitle"), exactMeta: g(".card.exact .cmeta"), histlink: g(".card.exact .histlink"),
      // shown-separately card count
      sepCards: document.querySelectorAll(".grid3 .card").length,
      // earned / reconfirm question (one ask)
      earnedQ: g(".qcard.earned .q"), earnedChips: all(".qcard.earned .qchip"),
      // platforms (see-all panel)
      platforms: all(".plat-strip .plat-pill"), platNote: g(".plat-note"),
      // refusal
      refusalAns: g(".refusal .ans"), refusalReason: all(".refusal .sam .body p"), wayfwd: all(".wayfwd .chip"),
      // thin badge-twin sibling pointer
      sibling: g(".widen p"),
      // generation / clarify choice (qscreen)
      genPrompt: g(".qscreen .qtext"), choiceEyebrow: g(".qscreen .eyebrow"), genChips: all(".qscreen .chip"),
      // EVERY sale card on the page (hero + sides + shown-separately + thin/class receipts). This is the
      // count that read 0 when the old .cm / .cards3 selectors went stale against the redesign.
      cards: document.querySelectorAll(".card").length
    };
  });
}

const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
const results = {};
try {
  const host = new URL(BASE).hostname;
  for (const input of INPUTS) {
    const page = await browser.newPage();
    if (BYPASS) await page.setExtraHTTPHeaders({ "x-vercel-protection-bypass": BYPASS, "x-vercel-set-bypass-cookie": "samesitenone" });
    await page.setCookie({ name: "gas_crew", value: process.env.GAS_CREW_COOKIE || "", domain: host, path: "/" });
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
