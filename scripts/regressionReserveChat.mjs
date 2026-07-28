// Phase 1.5 live chat test: reserves are answered observationally (correlation
// only) from the context, and honestly (no generalizing) when no cell exists.
import fs from "node:fs";
const BASE = process.env.FLOW_BASE || "https://goasksam.vercel.app";
const SELL_SYS = fs.readFileSync("js/wizard.js","utf8").match(/const SELL_SYS=`([\s\S]*?)`;/)[1];

const withCell = `Current sell state: {"car":"1967 Chevrolet Camaro","region":"US","price":"70000","step":12}
Decision facts (the engine's recommendation): recommended platform Bring a Trailer; basis exact_year_model; confidence medium.
Evidence by platform (only cite these numbers): Bring a Trailer: 12 comps.
Reserve context (observational only, NEVER say a reserve caused/boosts/earns anything; only that sales "averaged" a figure, and the choice is the seller's): in June, Bring a Trailer auctions in the $50k to $100k band averaged $5,144 higher with a reserve than without (n=14 with, 22 without). If asked about reserves and no cell exists for this exact make and band, say we don't have enough recent reserve data for this combination to say, and do not generalize from other makes or bands.`;

const noCell = `Current sell state: {"car":"1990 Mazda Miata","region":"US","price":"18000","step":12}
Decision facts (the engine's recommendation): recommended platform Bring a Trailer; basis exact_year_model; confidence medium.
Evidence by platform (only cite these numbers): Bring a Trailer: 9 comps.`;

async function ask(context, q) {
  const r = await fetch(`${BASE}/api/chat`, { method:"POST", headers:{"Content-Type":"application/json"},
    body: JSON.stringify({ messages:[{role:"user",content:q}], system:SELL_SYS, context, bypassCache:true }) });
  return (await r.json()).text || "";
}

let failures = 0;
const check = (name, ok, detail="") => { console.log(`${ok?"PASS":"FAIL"}  ${name}${ok?"":"  ->  "+detail}`); if(!ok)failures++; };
const CAUSATION = /\bcaused\b|because of the reserve|the reserve helped|will get you|you'?ll earn|\bboosts\b|increases your price/i;

const a1 = await ask(withCell, "should I use a reserve?");
check("reserve chat: observational answer, no causation", /averaged|reserve/i.test(a1) && !CAUSATION.test(a1) && /decide|up to you|your (call|choice)|depends/i.test(a1), a1.slice(0,240));
check("reserve chat: cites the observed figure/direction, not an outcome promise", /(5,?144|higher|with a reserve)/i.test(a1) && !/\byou will (get|earn|make)\b/i.test(a1), a1.slice(0,220));

const a2 = await ask(noCell, "should I put a reserve on it?");
check("reserve chat (no cell): honest no-data, no generalizing", /(don'?t|do not) have enough (recent )?reserve data|not enough .*reserve data/i.test(a2) && !CAUSATION.test(a2), a2.slice(0,240));

console.log(failures ? `\n${failures} FAILURE(S)` : "\nRESERVE-CHAT ALL PASS");
process.exit(failures ? 1 : 0);
