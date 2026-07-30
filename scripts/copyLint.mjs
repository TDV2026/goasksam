// Phase 1d: copy lint as a test. Exports lintText(text) and runs it over the
// rendered output of every card type and intro line. Rules: banned phrases,
// filler patterns, en/em dashes, the weekday scope-word rule, the sell-through
// ban, and the weekday sample gate (no weekday claim below 15 backing comps).
import fs from "node:fs";

// ---- the lint (also importable by the browser-flow suite) ----
export const LINT_RULES = [
  { id: "sell-through", re: /sell-?through|%\s*sold\b/i, msg: "sell-through / % sold is banned (sold-only data)" },
  { id: "value-opinion", re: /\bhigher end\b|\bprice point\b/i, msg: "no value opinion on the user's price" },
  { id: "filler", re: /\ba car like this\b|remains viable|not the clearest|clearest first choice|\bstrong option\b|\breal signal\b|one of the stronger platforms|worth a look if|still worth (a look|considering)/i, msg: "filler phrase with no evidence" },
  { id: "em-dash", re: /—/, msg: "em dash in user-facing copy" },
  { id: "en-dash", re: /–/, msg: "en dash in user-facing copy" },
  { id: "removed-house", re: /\bSotheby|\bGooding/i, msg: "RM Sotheby's / Gooding removed from user-facing copy" },
  { id: "reserve-causation", re: /\bcaused\b|because of the reserve|the reserve helped|will get you|you'?ll earn|\bboosts\b|increases your price/i, msg: "reserve causation/outcome claim (correlation only; allowed verb is 'averaged')" },
  { id: "volume-headline", re: /\bwhere most\b|most [^\n]{0,40} sales have closed|\bmoves most\b/i, msg: "volume language in a headline (state the delta or similarity finding instead)" },
  { id: "limited-caveat-old", re: /limited sales, running|so i ran this at|running at (the )?(model|make|generation|segment) level/i, msg: "banned uninformative caveat; cascade the rung ladder and state the finding (new floor: 'Analysis ran at X level')" },
  { id: "auction-cycle", re: /\bquicker cycle\b|\bauction cycle\b/i, msg: "speed is TIME TO LIST, not auction length; 'quicker cycle' / 'quicker auction cycle' are banned. Use 'generally gets your listing live faster'" },
  { id: "specialization-hype", re: /best place|the home of|you'?ll do better|home for these|\bbetter (results|money) (there|here)\b/i, msg: "specialization is an observation of share, never a promise or 'best place' / 'home of' hype" },
  { id: "sales-count", re: /\b\d{1,3}\s+(?:comparable\s+|recent\s+)?(?:comps?|comparables?|records?|results?|listings?|sales?)\b/i, msg: "sample-size count (sales/comps/records/results/listings) is banned in every Sam surface; use qualitative confidence only (Fix 1/5)" },
];
// A weekday claim must name its scope (car/generation/make) AND the window.
export function lintWeekday(line) {
  if (!/closed strongest on [A-Z]/i.test(line)) return null;
  const hasScope = /(as a whole|[A-Za-z0-9-]+s have closed strongest|-generation )/i.test(line);
  const hasWindow = /over the past 180 days/i.test(line);
  if (!hasScope) return "weekday claim without a scope word";
  if (!hasWindow) return "weekday claim without its 180-day window";
  return null;
}
export function lintText(text) {
  const out = [];
  const t = String(text || "");
  for (const r of LINT_RULES) { const m = t.match(r.re); if (m) out.push(`${r.id}: "${m[0]}" (${r.msg})`); }
  for (const line of t.split(/\n|(?<=\.)\s+/)) { const w = lintWeekday(line); if (w) out.push(`weekday-scope: "${line.trim().slice(0,80)}" (${w})`); }
  return out;
}

// ---- run the lint over composer output + intro lines ----
const noop = () => {};
const elem = () => new Proxy(function(){}, { get:(t,p)=>{ if(p==="style")return{}; if(p==="classList")return{add:noop,remove:noop,toggle:noop,contains:()=>false}; if(["value","textContent","id","className","innerHTML"].includes(p))return""; if(["appendChild","setAttribute","addEventListener","remove","append","scrollIntoView","focus"].includes(p))return noop; if(p==="querySelector")return()=>elem(); if(p==="querySelectorAll")return()=>[]; return elem(); }, apply:()=>elem() });
globalThis.window = globalThis;
globalThis.document = { getElementById:()=>elem(), querySelector:()=>elem(), querySelectorAll:()=>[], createElement:()=>elem(), addEventListener:noop, body:elem() };
try { Object.defineProperty(globalThis,"navigator",{value:{language:"en-US"},configurable:true}); } catch {}
globalThis.location = { hostname:"localhost", protocol:"file:" };
globalThis.localStorage = { getItem:()=>null, setItem:noop };
globalThis.fetch = async () => ({ ok:true, json:async()=>({}) });
const html = fs.readFileSync("index.html","utf8");
const files = [...html.matchAll(/<script src="(js\/[^"]+)"><\/script>/g)].map(m=>m[1]);
const script = files.map(f=>fs.readFileSync(f,"utf8")).join("\n");
(0, eval)(script + "\nglobalThis.sellState=sellState;globalThis.composeCard=composeCard;globalThis.powerSellerIntroLine=powerSellerIntroLine;globalThis.powerSellerServiceLine=powerSellerServiceLine;globalThis.vehicleAcceptPrefix=vehicleAcceptPrefix;globalThis.SYS=SYS;globalThis.SELL_SYS=SELL_SYS;globalThis.platformDisplayName=platformDisplayName;globalThis.HERO_SUPPORTING=HERO_SUPPORTING;globalThis.PLACEHOLDER_EXAMPLES=PLACEHOLDER_EXAMPLES;globalThis.LEARN_HOW=LEARN_HOW;globalThis.LEARN_PLATFORMS=LEARN_PLATFORMS;globalThis.HP_REASSURANCE=HP_REASSURANCE;");

let failures = 0;
const check = (name, ok, detail="") => { console.log(`${ok?"PASS":"FAIL"}  ${name}${ok?"":"  ->  "+detail}`); if(!ok)failures++; };
sellState.sellDecision = { evidence:{ ladder:{ landed:{ key:"exact_year_model" } } } };
const cardText = c => [c.headline&&c.headline.text, ...(c.bullets||[]).map(b=>b.text)].filter(Boolean).join("\n");

// Every card type through the composer.
const V = { make:"Chevrolet", model:"Camaro", year:1967 };
const scenarios = {
  "Mode A + model weekday (n=18)": composeCard(V, { label:"bringatrailer", platform:"bringatrailer", marketEvidence:{ evidenceSales:8, pricePremium:{gateType:"symmetric",percent:16,windowDays:90,scope:"model"}, dayAdvantage:{weekday:"Friday",liftPercent:16,scope:"model",window:180,sample:18} } }, { isPick:true, landedScope:"model" }),
  "Mode B speed": composeCard({make:"BMW",model:"M3",year:2018}, { label:"bringatrailer", platform:"bringatrailer", speedToList:"fast", marketEvidence:{ evidenceSales:9, pricePremium:{gateType:"symmetric",percent:5,windowDays:90,scope:"model"} } }, { isPick:true, sellerWantsSpeed:true, routingReason:"speed", landedScope:"model" }),
  "Honest": composeCard({make:"Porsche",model:"911",year:1995}, { label:"pcarmarket", platform:"pcarmarket", marketEvidence:{ evidenceSales:2 } }, { isPick:true, landedScope:"model" }),
  "Unverified": composeCard({make:"BMW",model:"351RG",year:2002,unverified:true}, { label:"bringatrailer", platform:"bringatrailer", marketEvidence:{ evidenceSales:5, pricePremium:{gateType:"symmetric",percent:40,windowDays:45,scope:"model"}, dayAdvantage:{weekday:"Tuesday",liftPercent:12,scope:"make",window:180,sample:30} } }, { isPick:true, landedScope:"make" }),
  "Make weekday alt": composeCard({make:"Porsche",model:"911",year:2019}, { label:"carsandbids", platform:"carsandbids", marketEvidence:{ evidenceSales:1, dayAdvantage:{weekday:"Tuesday",liftPercent:17,scope:"make",window:180,sample:50} } }, { isPick:false, landedScope:"model" }),
  "PowerSeller": composeCard(V, {}, { powerSeller:true }),
};
for (const [name, c] of Object.entries(scenarios)) {
  const v = lintText(cardText(c));
  check(`1d lint: card "${name}" is clean`, v.length === 0, v.join(" ; "));
}
// Intro lines.
sellState.carName = "2019 Porsche 911 Carrera"; sellState.resolvedVehicle = { make:"Porsche", model:"911", year:2019 };
for (const [name, fn] of [["powerSellerIntroLine", powerSellerIntroLine], ["powerSellerServiceLine", powerSellerServiceLine], ["vehicleAcceptPrefix", vehicleAcceptPrefix]]) {
  const v = lintText(fn());
  check(`1d lint: intro "${name}" is clean`, v.length === 0, v.join(" ; "));
}

// Weekday sample gate: a dayAdvantage below 15 comps produces NO weekday line.
const lowSample = composeCard(V, { label:"bringatrailer", platform:"bringatrailer", marketEvidence:{ evidenceSales:8, pricePremium:{gateType:"symmetric",percent:16,windowDays:90,scope:"model"}, dayAdvantage:{weekday:"Friday",liftPercent:62,scope:"model",window:180,sample:8} } }, { isPick:true, landedScope:"model" });
check("1d lint: weekday claim below the 15-comp gate does not render", !/closed strongest on/i.test(cardText(lowSample)), cardText(lowSample));

// Prompts are instructions (they legitimately name banned words to forbid them),
// so they are checked only for removed-house names and dashes, not the
// causation/filler rules that govern rendered card output.
const lintPrompt = t => lintText(t).filter(v => /removed-house|dash/.test(v));
check("1d lint: 'what is GoAskSam' answer (SYS) names no removed houses + lists the new set",
  lintPrompt(SYS).length === 0 && /Bring a Trailer, Cars & Bids, Hagerty, PCarMarket and Car & Classic/.test(SYS) && /more online platforms being added/.test(SYS),
  lintPrompt(SYS).join(" ; ") || "list/added-clause missing");
check("1d lint: sell-flow prompt (SELL_SYS) names no removed houses", lintPrompt(SELL_SYS).length === 0, lintPrompt(SELL_SYS).join(" ; "));
check("1d lint: the stronger-non-routable callout never renders a removed house name",
  lintText(`One thing to know up front: ${platformDisplayName("rmsothebys")} actually shows the strongest comparable results, and ${platformDisplayName("gooding")} too.`).length === 0,
  `${platformDisplayName("rmsothebys")} / ${platformDisplayName("gooding")}`);

// Headline honesty: a delta-winning pick states the delta, never volume. A
// concentration (others<5) headline states the honest situation, not "where most".
const domCard = composeCard({make:"Porsche",model:"911",year:1995}, { label:"bringatrailer", platform:"bringatrailer", marketEvidence:{ evidenceSales:32, pricePremium:{type:"market_dominance",gateType:"asymmetric",percent:null,marketShare:84,windowDays:90,scope:"generation",generationCode:"993",platformSales:32,othersSales:3} } }, { isPick:true, landedScope:"generation" });
check("1d lint: concentration headline (others<5) uses no volume language", lintText(domCard.headline.text).length === 0 && /concentrated on|too few on other platforms/i.test(domCard.headline.text), domCard.headline.text);
const deltaCard = composeCard({make:"Porsche",model:"911",year:1995}, { label:"bringatrailer", platform:"bringatrailer", marketEvidence:{ evidenceSales:32, pricePremium:{type:"premium",gateType:"symmetric",percent:35,windowDays:90,scope:"generation",generationCode:"993",platformSales:32,othersSales:6} } }, { isPick:true, landedScope:"generation" });
check("1d lint: delta-winning headline states the delta, not volume", /has closed .* around 35% higher than the other platforms we track over the past 90 days/i.test(deltaCard.headline.text) && lintText(deltaCard.headline.text).length === 0, deltaCard.headline.text);
check("1d lint: detects volume language in a headline", lintText("Bring a Trailer is where most 911 sales have closed over the past 90 days.").some(v=>/volume-headline/.test(v)));

// RUNG LADDER CASCADE: below the 5+/5+ delta gate, the headline states the
// finding at whichever rung the analysis landed on, scope labeled, never the
// banned "limited sales, running at model level".
sellState.sellDecision = { evidence:{ ladder:{ landed:{ key:"generation_model", generationCode:"f80" } } } };
const rung2 = composeCard({make:"BMW",model:"M3",year:2018}, { label:"hagerty", platform:"hagerty", speedToList:"medium_fast", marketEvidence:{ evidenceSales:6, pricePremium:null } }, { isPick:true, isVolumeLeader:true, sellerWantsSpeed:true, landedScope:"generation", landedGenerationCode:"f80" });
check("1d lint: rung-2 (generation) headline names the generation + 'strongest', clean",
  /F80-generation BMW M3s strongest among recent sales/.test(rung2.headline.text) && lintText(rung2.headline.text).length === 0, rung2.headline.text);
const rung4 = composeCard({make:"Chevrolet",model:"Chevelle",year:1966}, { label:"hagerty", platform:"hagerty", marketEvidence:{ evidenceSales:7, pricePremium:null } }, { isPick:true, isVolumeLeader:true, landedScope:"make" });
check("1d lint: rung-4 (make) headline leads with the make + caveats the exact model, clean",
  /Among recent Chevrolet sales, .+ leads\. Limited recent data for this exact model\./.test(rung4.headline.text) && lintText(rung4.headline.text).length === 0, rung4.headline.text);
const thinCascade = composeCard({make:"Porsche",model:"911",year:1995}, { label:"pcarmarket", platform:"pcarmarket", marketEvidence:{ evidenceSales:2, pricePremium:null } }, { isPick:true, isVolumeLeader:true, landedScope:"model" });
check("1d lint: thin-data floor names the rung with the new wording, no banned phrase",
  /Recent sales for the Porsche 911 are limited\. Analysis ran at model level\./.test(thinCascade.headline.text) && lintText(thinCascade.headline.text).length === 0, thinCascade.headline.text);
const speedNonLeader = composeCard({make:"BMW",model:"M3",year:2018}, { label:"carsandbids", platform:"carsandbids", speedToList:"fast", marketEvidence:{ evidenceSales:1, pricePremium:null } }, { isPick:true, isVolumeLeader:false, sellerWantsSpeed:true, landedScope:"generation", landedGenerationCode:"f80" });
check("1d lint: speed-routed non-leader falls to the honest floor, never a false 'strongest'",
  /Recent sales for the BMW M3 are limited\. Analysis ran at generation level\./.test(speedNonLeader.headline.text) && !/strongest among recent sales/.test(speedNonLeader.headline.text) && lintText(speedNonLeader.headline.text).length === 0, speedNonLeader.headline.text);
check("1d lint: detects the banned 'running at model level' caveat", lintText("Recent sales are limited, running at model level.").some(v=>/limited-caveat-old/.test(v)));
sellState.sellDecision = { evidence:{ ladder:{ landed:{ key:"exact_year_model" } } } };

// STAGE 1 (ranking branch 4): an unknown-spread speed-preference pick states the
// speed reason (TIME TO LIST) and MUST carry the depth-honesty bullet naming the
// depth leader. Listing-speed wording only; "auction cycle" is banned.
const branch4 = composeCard({ make:"Chevrolet", model:"Camaro", year:1967 }, { label:"hagerty", platform:"hagerty", speedToList:"medium_fast", marketEvidence:{ evidenceSales:4, pricePremium:null, dayAdvantage:{weekday:"Thursday",liftPercent:20,scope:"model",window:180,sample:20} } }, { isPick:true, routingReason:"speed_unknown", sellerWantsSpeed:true, depthLeaderName:"Bring a Trailer", landedScope:"model" });
const b4text = [branch4.headline.text, ...branch4.bullets.map(b=>b.text)].join("\n");
check("1d lint: branch-4 pick headline states the speed reason (time to list), clean",
  /You said speed matters\. Hagerty Marketplace generally gets your listing live faster and has closed recent 1967 Camaros sales\./.test(branch4.headline.text) && lintText(branch4.headline.text).length === 0, branch4.headline.text);
check("1d lint: branch-4 pick renders the REQUIRED depth-honesty bullet naming the depth leader",
  /Bring a Trailer holds most of the recent 1967 Camaros sales we track\. If market depth matters more than timing, start there instead\./.test(b4text), b4text);
check("1d lint: branch-4 card carries no banned 'auction cycle' wording and is clean", !/auction cycle/i.test(b4text) && lintText(b4text).length === 0, b4text);
check("1d lint: detects the banned 'quicker auction cycle' phrase", lintText("Hagerty runs the quicker auction cycle.").some(v=>/auction-cycle/.test(v)));
check("1d lint: detects the banned 'quicker cycle' phrase", lintText("Hagerty runs a quicker cycle.").some(v=>/auction-cycle/.test(v)));
const listingSpeedCard = composeCard({ make:"BMW", model:"M3", year:2018 }, { label:"carsandbids", platform:"carsandbids", speedToList:"fast", marketEvidence:{ evidenceSales:5, pricePremium:{gateType:"symmetric",percent:14,windowDays:90,scope:"model"} } }, { isPick:false, sellerWantsSpeed:true, landedScope:"model" });
check("1d lint: speed bullet uses time-to-list wording, not auction cycle",
  /generally gets your listing live faster/i.test([listingSpeedCard.headline&&listingSpeedCard.headline.text, ...listingSpeedCard.bullets.map(b=>b.text)].join(" ")),
  JSON.stringify(listingSpeedCard.bullets.map(b=>b.text)));

// STAGE 2 (specialization share): the computed bullet states a scope label, the
// word "share", and the 180-day window; observation only, no hype/promise.
const SPEC_CELL={platform:"bringatrailer",scope:"model",scope_key:"model|chevrolet|camaro",scope_label:"Camaros",rung:"model",platform_count:8,lift_rounded:7,window:180,data_month:"2026-07"};
const specBulletCard=composeCard({ make:"Chevrolet", model:"Camaro", year:1967 }, { label:"bringatrailer", platform:"bringatrailer", marketEvidence:{ evidenceSales:8, pricePremium:null, specializationCell:SPEC_CELL } }, { isPick:false, landedScope:"model" });
const specBullet=(specBulletCard.bullets.find(b=>/specialization/.test(b.provenance||""))||{}).text||"";
check("1d lint: specialization bullet states scope label + 'share' + 180-day window, clean",
  /Camaros make up around 7 times larger a share of Bring a Trailer's sales than of the rest of the market we track over the past 180 days\./.test(specBullet) && /\bshare\b/.test(specBullet) && /over the past 180 days/.test(specBullet) && lintText(specBullet).length===0, specBullet);
check("1d lint: specialization REPLACES the generic audience line for that platform",
  !specBulletCard.bullets.some(b=>/built a strong audience/i.test(b.text)) && !!specBullet,
  JSON.stringify(specBulletCard.bullets.map(b=>b.text)));
const specPickCard=composeCard({ make:"Chevrolet", model:"Camaro", year:1967 }, { label:"bringatrailer", platform:"bringatrailer", marketEvidence:{ evidenceSales:8, pricePremium:null, specializationCell:SPEC_CELL } }, { isPick:true, routingReason:"specialist", landedScope:"model" });
check("1d lint: branch-5 specialist headline states the specialization reason, clean",
  /Bring a Trailer specializes in Camaros: they make up around 7 times larger a share of its sales than of the rest of the market we track over the past 180 days\./.test(specPickCard.headline.text) && lintText(specPickCard.headline.text).length===0, specPickCard.headline.text);
check("1d lint: detects specialization hype ('best place' / 'the home of')", lintText("Bring a Trailer is the best place for Camaros.").some(v=>/specialization-hype/.test(v)) && lintText("Cars & Bids is the home of these cars.").some(v=>/specialization-hype/.test(v)));
check("1d lint: no specialization bullet when no cell exists", (()=>{const c=composeCard({ make:"Chevrolet", model:"Camaro", year:1967 }, { label:"bringatrailer", platform:"bringatrailer", marketEvidence:{ evidenceSales:8, pricePremium:null } }, { isPick:false, landedScope:"model" });return !c.bullets.some(b=>/times larger a share/.test(b.text));})(), "no cell must render no specialization");

// Reserve context (Phase 1.5): renders on Card 1 only, last, correlation only.
const reserveDelta = { label:"bringatrailer", platform:"bringatrailer", marketEvidence:{ evidenceSales:12, pricePremium:{gateType:"symmetric",percent:16,windowDays:90,scope:"model"}, dayAdvantage:{weekday:"Friday",liftPercent:16,scope:"model",window:180,sample:20}, reserveContext:{platform:"Bring a Trailer",make:"Chevrolet",band_key:"$50k to $100k",avg_with_reserve:65144,avg_no_reserve:60000,delta_dollars:5144,delta_pct:8.6,n_with:14,n_without:22,data_month:"2026-06"} } };
const pickR = composeCard(V, reserveDelta, { isPick:true, landedScope:"model" });
const altR = composeCard(V, reserveDelta, { isPick:false, landedScope:"model" });
const reserveLine = (pickR.bullets.find(b=>/reserve/i.test(b.text))||{}).text || "";
check("1d lint: reserve bullet renders on the pick card, clean", reserveLine && lintText(reserveLine).length === 0, lintText(reserveLine).join(" ; ") || reserveLine);
check("1d lint: reserve bullet uses the exact locked delta wording", /In June, Bring a Trailer auctions with reserves in your price band averaged \$5,144 higher than those without\. You'll need to decide: is a reserve right for your car's condition and positioning\?/.test(reserveLine), reserveLine);
check("1d lint: reserve bullet contains 'decide' and the month name", /\bdecide\b/.test(reserveLine) && /\bJune\b/.test(reserveLine), reserveLine);
check("1d lint: reserve bullet is the LAST bullet on the pick card", pickR.bullets.length>0 && /reserve/i.test(pickR.bullets[pickR.bullets.length-1].text), JSON.stringify(pickR.bullets.map(b=>b.text.slice(0,30))));
check("1d lint: reserve renders on the alt card too when a cell exists (as the LAST bullet)", altR.bullets.length>0 && /is a reserve right for your car/i.test(altR.bullets[altR.bullets.length-1].text), JSON.stringify(altR.bullets.map(b=>b.text)));
const reserveSim = { label:"bringatrailer", platform:"bringatrailer", marketEvidence:{ evidenceSales:12, pricePremium:{gateType:"symmetric",percent:16,windowDays:90,scope:"model"}, reserveContext:{platform:"Bring a Trailer",make:"Chevrolet",band_key:"$50k to $100k",avg_with_reserve:60500,avg_no_reserve:60000,delta_dollars:500,delta_pct:0.8,n_with:14,n_without:22,data_month:"2026-06"} } };
const simLine = (composeCard(V, reserveSim, { isPick:true, landedScope:"model" }).bullets.find(b=>/reserve/i.test(b.text))||{}).text || "";
check("1d lint: similarity case (|delta|<3%) renders the similar-money wording", /averaged similar money with or without a reserve/.test(simLine) && /\bdecide\b/.test(simLine), simLine);
check("1d lint: PowerSeller card carries no reserve copy", !/reserve/i.test(cardText(composeCard(V, {}, { powerSeller:true }))));
check("1d lint: detects a reserve causation claim", lintText("the reserve boosts your price and will get you more").some(v=>/reserve-causation/.test(v)));

// The lint itself catches known-bad copy.
check("1d lint: detects a sell-through claim", lintText("84% sell-through for modern Porsches").length > 0);
check("1d lint: detects an em dash", lintText("this — that").some(v=>/em dash/.test(v)));
check("1d lint: detects a weekday without scope", lintText("Prices closed strongest on Fridays over the past 180 days").some(v=>/weekday-scope/.test(v)));
check("1d lint: detects a removed house name", lintText("records from RM Sotheby's and Gooding").some(v=>/removed-house/.test(v)));

// ---- Homepage copy ----
// The dash exemption is REMOVED: the global no-dash rule now has zero exceptions.
// The hero supporting line is the approved dash-free copy and is linted like the
// rest of the homepage copy.
check("homepage: hero supporting line is the approved dash-free copy",
  HERO_SUPPORTING === "I'll recommend where I'd sell your car and show you exactly why.", JSON.stringify(HERO_SUPPORTING));
// ALL homepage copy, hero supporting line INCLUDED: no dashes, standard lint clean.
const homepageCopy = [
  HERO_SUPPORTING,
  HP_REASSURANCE,
  ...PLACEHOLDER_EXAMPLES,
  LEARN_HOW.title, ...LEARN_HOW.sections.flatMap(s => [s.h, s.body]),
  LEARN_PLATFORMS.title, LEARN_PLATFORMS.intro, LEARN_PLATFORMS.outro, ...LEARN_PLATFORMS.platforms.flatMap(p => [p.name, p.body])
].join("\n");
check("homepage: no en/em dashes in ANY homepage copy (zero exceptions, hero line included)", !/[–—]/.test(homepageCopy), (homepageCopy.match(/[^\n]*[–—][^\n]*/) || [""])[0]);
check("homepage: all non-hero homepage copy passes standard lint", lintText(homepageCopy).length === 0, lintText(homepageCopy).join(" ; "));
check("homepage: Selling Platforms names no removed auction houses", !/\bSotheby|\bGooding/i.test(homepageCopy), "removed house named");
check("homepage: placeholder examples are real cars (year + make)", PLACEHOLDER_EXAMPLES.every(e => /^\d{4}\s+[A-Z]/.test(e)), JSON.stringify(PLACEHOLDER_EXAMPLES));
// Dashboard card lines (from the committed lib/dailyPulse.json): observation only.
const pulseJson = JSON.parse(fs.readFileSync("lib/dailyPulse.json", "utf8"));
const pulseLines = pulseJson.cards.map(c => c.line).join("\n");
check("homepage: dashboard card lines observation only, no dashes, no advice verbs",
  !/[–—]/.test(pulseLines) && !/\b(buy|sell|list|should|recommend|consider)\b/i.test(pulseLines) && lintText(pulseLines).length === 0, pulseLines);

console.log(failures ? `\n${failures} FAILURE(S)` : "\n1D-LINT ALL PASS");
process.exit(failures ? 1 : 0);
