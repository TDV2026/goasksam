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

const cases = [
  { q: "so u think a peorsweller is better than a platofrm", must: [/power\s?seller|consignor|handle|handled|hands-?off|run it for you/i, /platform|bring a trailer|yourself|run it/i], label: "powerseller-vs-platform (typos)" },
  { q: "whats a powrseller do exactly", must: [/photos|listing|buyer|paperwork|handles|manages|runs the/i], label: "what does a powerseller do (typo)" },
  { q: "shud i juss use teh platfrom insted", must: [/platform|bring a trailer|yourself|run it|either/i], label: "should I just use the platform (typos)" },
  { q: "is bidz betta than bringatrailer for this", must: [/bring a trailer|cars ?& ?bids|audience|comparable|platform/i], label: "cars&bids vs BaT (typos)" }
];

let failures = 0;
for (const c of cases) {
  let text = "";
  try {
    const res = await fetch(`${BASE}/api/chat`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [{ role: "user", content: c.q }], system: SELL_SYS, context, bypassCache: true })
    });
    const data = await res.json();
    text = data.text || `(status ${res.status} ${data.error || ""})`;
  } catch (e) { text = `(fetch error ${e.message})`; }
  const ok = c.must.every(re => re.test(text));
  console.log(`${ok ? "PASS" : "FAIL"}  D3: ${c.label}`);
  if (!ok) { console.log(`      Q: ${c.q}`); console.log(`      A: ${text.slice(0, 240)}`); failures++; }
}
console.log(failures ? `\n${failures} FAILURE(S)` : "\nCHAT-D3 ALL PASS");
process.exit(failures ? 1 : 0);
