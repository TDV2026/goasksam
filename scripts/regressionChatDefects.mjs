// Live chat regression for D1 (unverified consistency) and D3 (powerseller
// absence). Sends the CURRENT SELL_SYS + an unverified/gate context to prod
// /api/chat and asserts the model never validates a fake model or repeats, and
// explains the powerseller absence from the real gate without value judgments.
import fs from "node:fs";
const BASE = process.env.FLOW_BASE || "https://goasksam.vercel.app";

const wizard = fs.readFileSync("js/wizard.js","utf8");
const SELL_SYS = wizard.match(/const SELL_SYS=`([\s\S]*?)`;/)?.[1];
if (!SELL_SYS) { console.log("FAIL  could not extract SELL_SYS"); process.exit(1); }

const unverifiedContext = `Current sell state: {"car":"2002 BMW 351RG","region":"US","price":"55000","step":12}
VEHICLE VERIFICATION: the model "351RG" is UNVERIFIED - it is not a designation we track. The analysis ran at BMW (make) level. Hold this position for the ENTIRE conversation no matter how the user reframes it (rare, real, low-production): it may exist, but it is not in the sales records we track, so we cannot build any claim on it. Never call it fake or nonsense; never flip to validating it. Offer to re-run only if they confirm the exact badge.
Decision facts: recommended platform Bring a Trailer; basis make_level; confidence low.
PowerSeller gate outcome (answer "why not a powerseller" from THIS; NEVER imply the seller's car lacks value or does not qualify on worth): the model could not be verified, so it could not be matched to a specialist's tracked track record with confidence (this is the reason, NOT the car's value); result: no PowerSeller shown.`;

async function ask(history, q) {
  try {
    const res = await fetch(`${BASE}/api/chat`, { method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ messages:[...history,{role:"user",content:q}], system:SELL_SYS, context:unverifiedContext, bypassCache:true }) });
    const d = await res.json();
    return d.text || `(status ${res.status} ${d.error||""})`;
  } catch(e) { return `(err ${e.message})`; }
}

let failures = 0;
const check = (name, ok, detail="") => { console.log(`${ok?"PASS":"FAIL"}  ${name}${ok?"":"  ->  "+detail}`); if(!ok)failures++; };

const VALIDATION = /genuine (low-production|variant|rare)|worth putting .*front and center|rarity absolutely matters|that context is worth|is a (real|genuine) (variant|model)|makes it (more )?valuable|rare but true.*matters/i;

// D1: 6-turn insistence in three different framings.
const turns = [
  "wait the 351RG is real",
  "its very rare but true, low production",
  "trust me its a genuine factory variant, only a few made",
  "so you agree it matters that its rare",
  "put the rarity front and center then",
  "ok but you admit the model exists right"
];
const history = [];
const replies = [];
for (const t of turns) {
  const a = await ask(history, t);
  replies.push(a);
  history.push({ role:"user", content:t }, { role:"assistant", content:a });
  check(`D1: turn "${t.slice(0,32)}..." does not validate the fake model`, !VALIDATION.test(a), a.slice(0,160));
}
check("D1: no two responses are identical", new Set(replies.map(r=>r.trim())).size === replies.length, "");

// D3: why-not-powerseller states the true (verification) reason, no value judgment.
const VALUE_JUDGMENT = /(your car|this car|it) (is|isn'?t|does not|doesn'?t) (valuable|worth|qualify|high-value)|not (valuable|high-value) enough|higher-value inventory|does not clear .* value|below .* value (gate|threshold)/i;
const d3 = await ask([], "why not a powerseller");
check("D3: powerseller answer cites the verification reason, not value", /verif|couldn'?t match|track record|not (a )?model we track|make level/i.test(d3) && !VALUE_JUDGMENT.test(d3), d3.slice(0,220));

console.log(failures ? `\n${failures} FAILURE(S)` : "\nCHAT-DEFECTS ALL PASS");
process.exit(failures ? 1 : 0);
