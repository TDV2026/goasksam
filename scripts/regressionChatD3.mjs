// D3 regression: the follow-up chat must answer the question actually asked,
// tolerate typos, and (for powerseller-vs-platform) name BOTH sides. Runs against
// prod /api/chat with the current SELL_SYS extracted from the frontend.
import fs from "node:fs";

const BASE = process.env.FLOW_BASE || "https://goasksam.vercel.app";

// Pull SELL_SYS out of wizard.js without executing the whole frontend.
const wizard = fs.readFileSync("js/wizard.js", "utf8");
const m = wizard.match(/const SELL_SYS=`([\s\S]*?)`;/);
if (!m) { console.log("FAIL  could not extract SELL_SYS"); process.exit(1); }
const SELL_SYS = m[1];

const context = `Current sell state: {"car":"Porsche 911","region":"US","step":12}
Decision facts (the engine's recommendation, do not contradict it): recommended platform Bring a Trailer; basis model_family; confidence medium; comparable sales analyzed 14 in the last 180 days; price signal: sales closed around 12% higher on the recommended platform than on other platforms over the past 180 days. Reasons: Bring a Trailer has the strongest enthusiast audience for this car.`;

// Part 4: a "compare the tradeoffs" request must bind to the TWO RENDERED
// platform destinations and never reframe as PowerSeller-vs-DIY or claim both
// paths end at the same platform. Two different two-platform contexts.
const compareCtx = (pick, alt, altPlatformName) => `Current sell state: {"car":"2006 Ford Focus","region":"US","step":12}
Decision facts (the engine's recommendation, do not contradict it): recommended platform ${pick}; basis model_family; confidence medium; comparable sales analyzed 12 in the last 180 days; price signal: sales closed around 20% higher on the recommended platform than on other platforms over the past 180 days. Reasons: ${pick} has the deepest recent market for this car.
Evidence by platform (only cite these numbers): ${pick}: 12 comps, about 20% vs other platforms (any_year scope); ${alt}: 8 comps.
Cards shown to the seller with their exact bullet text:
${pick} [Sam's pick]: ${pick} has closed Focus across all model years around 20% higher than the other platforms we track over the past 180 days.
${alt} [Also strong here]: Recent Focus sales across all model years have concentrated on ${alt} over the past 90 days.
Rendered destinations (what the seller is looking at): PICK ${pick}, ALT ${alt}. A "compare the options / compare the tradeoffs / which should I pick" request means comparing THESE TWO PLATFORMS. Compare them on four axes ONLY: price outcome, time to list, audience fit, and how much sales data backs each (use the evidence-by-platform numbers above). They are two DIFFERENT platforms: NEVER say both paths lead to the same platform, NEVER reframe this as PowerSeller-vs-doing-it-yourself, and NEVER contradict either card's stated finding. The pick stays the recommendation; the comparison explains it, it does not reopen it.`;

const cases = [
  { q: "so u think a peorsweller is better than a platofrm", must: [/power\s?seller|consignor|handle|handled|hands-?off|run it for you/i, /platform|bring a trailer|yourself|run it/i], label: "powerseller-vs-platform (typos)" },
  { q: "whats a powrseller do exactly", must: [/photos|listing|buyer|paperwork|handles|manages|runs the/i], label: "what does a powerseller do (typo)" },
  { q: "shud i juss use teh platfrom insted", must: [/platform|bring a trailer|yourself|run it|either/i], label: "should I just use the platform (typos)" },
  { q: "is bidz betta than bringatrailer for this", must: [/bring a trailer|cars ?& ?bids|audience|comparable|platform/i], label: "cars&bids vs BaT (typos)" },
  { q: "compare the tradeoffs", ctx: compareCtx("Bring a Trailer", "Cars & Bids"),
    must: [/bring a trailer/i, /cars ?& ?bids/i],
    mustNot: [/both .{0,30}(end|lead|land|go)\b[\s\S]{0,30}(bring a trailer|same platform)/i, /power\s?seller/i],
    label: "compare tradeoffs binds to the two rendered platforms (BaT vs C&B)" },
  { q: "compare the tradeoffs", ctx: compareCtx("Bring a Trailer", "PCarMarket"),
    must: [/bring a trailer/i, /pcarmarket|pcar/i],
    mustNot: [/both .{0,30}(end|lead|land|go)\b[\s\S]{0,30}(bring a trailer|same platform)/i, /power\s?seller/i],
    label: "compare tradeoffs binds to the two rendered platforms (BaT vs PCarMarket)" }
];

let failures = 0;
for (const c of cases) {
  let text = "";
  try {
    const res = await fetch(`${BASE}/api/chat`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [{ role: "user", content: c.q }], system: SELL_SYS, context: c.ctx || context, bypassCache: true })
    });
    const data = await res.json();
    text = data.text || `(status ${res.status} ${data.error || ""})`;
  } catch (e) { text = `(fetch error ${e.message})`; }
  const ok = c.must.every(re => re.test(text)) && (c.mustNot || []).every(re => !re.test(text));
  console.log(`${ok ? "PASS" : "FAIL"}  D3: ${c.label}`);
  if (!ok) { console.log(`      Q: ${c.q}`); console.log(`      A: ${text.slice(0, 300)}`); failures++; }
}
console.log(failures ? `\n${failures} FAILURE(S)` : "\nCHAT-D3 ALL PASS");
process.exit(failures ? 1 : 0);
