// Production smoke tests. Asserts on response CONTENT, not just routing or
// status codes: a chat layer that returns filler instead of an answer fails.
//
// Usage: npm run smoke:prod   (optionally SMOKE_BASE_URL=https://... to override)

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { findForbidden } from "./forbiddenPatterns.js";
const BASE = process.env.SMOKE_BASE_URL || "https://goasksam.vercel.app";
// Vercel "Protection Bypass for Automation" secret. Production may run with Attack Challenge Mode
// (or bot challenge) active, which a browser solves transparently but a raw fetch cannot - the edge
// returns HTTP 429 with `x-vercel-mitigated: challenge`. CI must carry the bypass secret (set it in
// the Vercel project: Settings -> Deployment Protection -> Protection Bypass for Automation, then add
// it as the VERCEL_AUTOMATION_BYPASS_SECRET GitHub Actions secret + local env). Real users need none.
const BYPASS = process.env.VERCEL_AUTOMATION_BYPASS_SECRET || process.env.VERCEL_PROTECTION_BYPASS || "";
// The entry system prompt lives in js/chat-core.js since the index.html split.
const __chatCore = fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "js", "chat-core.js"), "utf8");
const ENTRY_SYS = __chatCore.match(/const SYS=`([\s\S]*?)`;\n/)[1];
const __wizardJs = fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "js", "wizard.js"), "utf8");
let failures = 0;

function check(name, ok, detail) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  ->  " + detail}`);
  if (!ok) failures++;
}

async function post(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(BYPASS ? { "x-vercel-protection-bypass": BYPASS, "x-vercel-set-bypass-cookie": "samesitenone" } : {})
    },
    body: JSON.stringify(body)
  });
  return { status: res.status, body: await res.json().catch(() => ({})), mitigated: res.headers.get("x-vercel-mitigated") };
}

// Preflight: one real call. If the edge is challenging us (429 + x-vercel-mitigated: challenge),
// fail with ONE clear cause + remediation instead of 39 undefined-body cascade failures. This is a
// harness/edge problem, never a claim that production is down - real browser users are unaffected.
async function preflight() {
  const r = await post("/api/vehicleIdentity", { text: "2019 BMW M3" });
  if (r.status === 429 || r.mitigated === "challenge") {
    console.error(`\nSMOKE ABORTED: the edge is blocking automated requests to ${BASE}.`);
    console.error(`  HTTP ${r.status}${r.mitigated ? `, x-vercel-mitigated: ${r.mitigated}` : ""} (Vercel Attack Challenge Mode / bot challenge).`);
    console.error(`  This blocks the raw-fetch harness, NOT real browser users (they solve the challenge transparently).`);
    console.error(BYPASS
      ? `  A bypass secret IS set but was rejected - regenerate it in Vercel (Settings -> Deployment Protection -> Protection Bypass for Automation) and update VERCEL_AUTOMATION_BYPASS_SECRET.`
      : `  Fix: set VERCEL_AUTOMATION_BYPASS_SECRET (Vercel Settings -> Deployment Protection -> Protection Bypass for Automation) as a GitHub Actions secret + local env.`);
    process.exit(2);
  }
}

// Mirrors the wizard's SELL_SYS shape closely enough to test the chat layer
// the way the frontend uses it.
const WIZARD_SYSTEM = `You are Sam, helping someone sell their car on GoAskSam. Warm, direct, knowledgeable about the collector car market.
The user is in the middle of a sell flow and has asked a question. Answer it warmly and specifically, then bring them back to the next question naturally. The current sell state and next question are provided separately.
Key facts:
- Fees: GoAskSam holds NO platform fee data. Never state platform fees, commissions, percentages, or caps as fact. If asked what howS or any consignor charges: we do not hold his fee terms; per howS his structure is usually flexible, and the specifics are discussed directly with him if the seller requests an introduction.
- Timing: the question flow takes under a minute, and the market analysis itself runs in seconds once the questions are done. Nothing here is a long process.
- Privacy and leads: seller details are used only to build the recommendation. If the seller chooses to proceed, their details go to one single chosen destination, never blasted to multiple partners, never sold.
Never use comps to tell the seller their asking price is wrong. Comps are data points, not truth. The seller knows their car better than we do.
NEVER state a comparable-sales count below 10; describe thin evidence qualitatively. Referral fees DO exist: if asked, say we may receive a referral fee but every recommendation is driven by the sales data, never by any paid relationship. Never deny the fee. No consignment-flagging service exists; never offer to flag or forward details for one. For sub-gate PowerSeller pushback: first ask explains the value gate; second ask says no PowerSeller is the right fit for this car and it tracks; persisting gets the beta note with news@thedailyvroom.com.
Speed picks are owned, never apologized for: when the recommendation followed the seller's fast timeline over a small median gap, say the median difference is small, the seller's timeline is the deciding factor, and the picked platform closes faster. Never frame speed as a tradeoff or a consolation.
Recommendations are final. No hedging, no escape hatches: never "if it does not pan out", never "we can revisit", never "feel free to come back", never "if you change your mind". All explanations max 3 sentences: lead with the fact (data, signal, fit), ground the decision, close. No fourth sentence. Never offer alternatives unless asked.
- Untracked-platform honesty: if the user suggests a platform that fits the car type but we hold no sales data for it (Hemmings, Car & Classic, Collecting Cars), acknowledge the suggestion as a valid fit for that kind of car, say plainly that we don't track sales data there yet so the call is based on what the data shows on the tracked platforms, and restate the recommendation. Never claim the chosen platform is objectively better when the real reason is a data gap. The whole answer is three sentences or fewer, like: "Hemmings would be a good fit for this truck type, that's their market. But we don't track Hemmings sales data yet. Bring a Trailer is my call based on what I can see." Never announce honesty ("I want to be straight with you"), just be direct.
Style: never use em dashes or en dashes anywhere in your replies. Use commas or periods instead.
Never say you are AI. You are Sam. End on your answer; the wizard re-asks its own question after you.`;

async function chatCase(name, question, contentPattern, forbidPattern) {
  const { status, body } = await post("/api/chat", {
    messages: [{ role: "user", content: question }],
    system: WIZARD_SYSTEM,
    context: 'Current sell state: {"car":null,"step":1}\nNext question: What are we selling today?',
    bypassCache: true
  });
  const text = String(body.text || "");
  check(`${name}: HTTP 200 with text`, status === 200 && text.length > 20, `status=${status} error=${body.error || "none"} text="${text.slice(0, 80)}"`);
  check(`${name}: content answers the question`, contentPattern.test(text), `text="${text.slice(0, 200)}"`);
  check(`${name}: not a filler line`, !/let me know how you'd like to proceed/i.test(text), `text="${text.slice(0, 120)}"`);
  check(`${name}: no em or en dashes in generated copy`, !/—|–/.test(text), `text="${text.slice(0, 200)}"`);
  check(`${name}: no raw markdown in output`, !/\*\*/.test(text), `text="${text.slice(0, 200)}"`);
  const registryHits = findForbidden(text);
  check(`${name}: registry clean`, registryHits.length === 0, registryHits.join(" | "));
  if (forbidPattern) check(`${name}: no fabricated specifics`, !forbidPattern.test(text), `text="${text.slice(0, 250)}"`);
}

async function identityCase(name, input, expectedStatus, expectPattern) {
  const { status, body } = await post("/api/vehicleIdentity", { text: input });
  const label = body.vehicle?.canonicalLabel || [body.vehicle?.year, body.vehicle?.make, body.vehicle?.model].filter(Boolean).join(" ");
  const haystack = `${label} ${body.clarification?.question || ""}`;
  check(`${name}: status ${expectedStatus}`, status === 200 && body.status === expectedStatus, `http=${status} status=${body.status}`);
  if (expectPattern) check(`${name}: resolution content`, expectPattern.test(haystack), haystack.slice(0, 160));
}

const startedAt = Date.now();
console.log(`Smoke tests against ${BASE}\n`);
await preflight();

await chatCase(
  "chat: how long will this take",
  "how long will this take",
  /second|minute|quick|fast|under a|moment|won't take|right away|less than/i
);
await chatCase(
  "chat: do you share my details",
  "do you share my details with anyone",
  /single|one (chosen )?(destination|partner|place)|never (blast|sold|share|sell)|only|won't (be )?(shared|sold)|don't (share|sell)/i
);

await chatCase(
  "chat: how much does hows charge",
  "how much does hows charge",
  /discuss|directly|with him|introduction|his fee|flexible/i,
  // Numeric fee claims only: "4.5%", "$4,500 cap". The bare word "percentage"
  // is legitimate when describing fee types per the partner.
  /\d+(\.\d+)?\s*(%|percent)|\$\s*\d/i
);

// Post-result grounding: chat must not contradict the engine's recommendation.
{
  const { status, body } = await post("/api/chat", {
    bypassCache: true,
    messages: [{ role: "user", content: "how would you run it mr expert" }],
    system: WIZARD_SYSTEM + `\nGrounding rules (locked):\n- Never contradict the engine's platform recommendation. When decision facts are provided in the context, they are the answer to "where should I sell": explain and support that recommendation, never name a different platform as where you'd start.\n- No platform-mechanics claims stated as fact (auction formats, durations, audiences), including details you believe you know like how many days an auction runs. No invented market commentary (state-level demand, buyer pools at price points).`,
    context: 'Current sell state: {"car":"2018 Porsche 911 Carrera GTS","step":16}\nDecision facts (the engine\'s recommendation, do not contradict it): recommended platform Bring a Trailer; basis market_evidence; confidence high; comparable sales analyzed 5 in the last 180 days; median on the recommended platform $135,000.'
  });
  const text = String(body.text || "");
  check("chat grounding: HTTP 200 with text", status === 200 && text.length > 20, `status=${status}`);
  check("chat grounding: supports the recommended platform", /bring a trailer/i.test(text), `text="${text.slice(0, 200)}"`);
  check("chat grounding: never redirects to a different platform", !/(cars\s*(&|and)\s*bids|pcarmarket|hagerty|hemmings)[^.!?]{0,80}(where i('|)d (start|list|sell)|is where|start there|go with|instead)/i.test(text), `text="${text.slice(0, 300)}"`);
  check("chat grounding: no invented auction-format facts", !/\b(7|seven|five|ten|\d+)[\s-]*day(s)?\b[^.!?]{0,30}(auction|format|run)|auctions? run (for )?(a )?(7|seven|five|ten|\d+)/i.test(text), `text="${text.slice(0, 300)}"`);
}

await identityCase("identity: 2018 911 Carrera GTS", "2018 911 Carrera GTS", "valid", /2018 Porsche 911 Carrera GTS/);
await identityCase("identity: miata", "miata", "needs_clarification", /Mazda MX-5.*year/i);
await identityCase("identity: 67 corvette", "67 corvette", "valid", /1967 Chevrolet Corvette/);
// Entry chat grounding: real production SYS prompt, content assertions.
{
  const legit = await post("/api/chat", { bypassCache: true, messages: [{ role: "user", content: "is this site legit" }], system: ENTRY_SYS });
  const t1 = String(legit.body.text || "");
  check("entry: legit answer is grounded", legit.status === 200 && /auction (sale )?records|sale (data|records)|real auction|where (to|should you) sell|seller/i.test(t1), `text="${t1.slice(0, 200)}"`);
  check("entry: no live-listing or demo claims", !/live listing|demo (set|version)|10 (live )?listings|pull up|what('| i)s live|tracks live|browse/i.test(t1), `text="${t1.slice(0, 250)}"`);
  const tdv = await post("/api/chat", { bypassCache: true, messages: [{ role: "user", content: "is it part of the daily vroom yes or no" }], system: ENTRY_SYS });
  const t2 = String(tdv.body.text || "");
  check("entry: daily vroom affirmative", /\byes\b/i.test(t2) && !/don'?t know|no information|not sure (if|whether)/i.test(t2), `text="${t2.slice(0, 200)}"`);
}

// Generation-aware ladder (Phase 4). Structure cases use ladderPreview: zero
// metered fetches, zero writes.
{
  const gts = year => post("/api/sellerDecision", {
    ladderPreview: true,
    car: { vehicle: { raw: `${year} Porsche 911 GTS`, year, make: "Porsche", model: "911", trim: "Carrera GTS", confidence: "high" } }
  });
  const [y16, y17] = await Promise.all([gts(2016), gts(2017)]);
  check("generations: 2016 911 GTS maps to 991.1", y16.body.generation?.code === "991.1", JSON.stringify(y16.body.generation));
  check("generations: 2017 911 GTS maps to 991.2", y17.body.generation?.code === "991.2", JSON.stringify(y17.body.generation));
  check("generations: 991.1 and 991.2 comp windows are disjoint",
    y16.body.generation && y17.body.generation && y16.body.generation.yearEnd < y17.body.generation.yearStart,
    `991.1 ends ${y16.body.generation?.yearEnd}, 991.2 starts ${y17.body.generation?.yearStart}`);
  const rung2of = body => (body.ladder || []).find(r => r.rung === 2);
  check("generations: generation rung names its generation",
    /991\.1-generation/.test(rung2of(y16.body)?.label || "") && /991\.2-generation/.test(rung2of(y17.body)?.label || ""),
    `${rung2of(y16.body)?.label} | ${rung2of(y17.body)?.label}`);

  const alfa = await post("/api/sellerDecision", {
    ladderPreview: true,
    car: { vehicle: { raw: "1974 Alfa Romeo Spider", year: 1974, make: "Alfa Romeo", model: "Spider", trim: null, confidence: "high" } }
  });
  check("generations: unmapped model has no mapping", alfa.body.generation === null, JSON.stringify(alfa.body.generation));
  check("generations: unmapped model ladders exactly as production (calendar +/- 2)",
    (alfa.body.ladder || []).some(r => r.key === "near_years_model" && r.label === "Spider sales 1972 to 1976" && r.maxYearGap === 2),
    JSON.stringify((alfa.body.ladder || []).map(r => r.label)));

  // One real run: a mapped model with a thin exact year must land on the
  // generation rung, never skip past it. Costs a few metered requests until
  // the market-fetch cache table is applied; a cache hit costs zero.
  const real = await post("/api/sellerDecision", {
    car: { vehicle: { raw: "2017 Porsche 911 GTS", year: 2017, make: "Porsche", model: "911", trim: "Carrera GTS", confidence: "high" }, region: "US", state: "California" }
  });
  const ladder = real.body.evidence?.ladder;
  const rung1 = (ladder?.rungs || []).find(r => r.rung === 1);
  const rung2 = (ladder?.rungs || []).find(r => r.rung === 2); // generation_trim for a mapped year
  const thinExactYear = rung1 && !rung1.met;
  check("generations: real run returns a decision", real.status === 200 && real.body.status === "decision_ready", `status=${real.status} ${real.body.status}`);
  // The invariant is rung-primary, window-secondary: a thin exact year must WIDEN WITHIN
  // the generation before the cross-generation pool, i.e. never SKIP a MET generation rung.
  // If the generation rung is itself thin (not met in the recency windows), widening on to
  // any_year_trim is correct, not a regression - so the check only bites when rung2 is met.
  check("generations: thin exact year never skips a met generation rung",
    !thinExactYear || !rung2 || !rung2.met || ladder?.landed?.key === "generation_trim",
    `rung1.met=${rung1?.met} rung2(gen).met=${rung2?.met} landed=${ladder?.landed?.key} (${ladder?.landed?.label})`);
  // Whenever the run DOES land on the generation rung, the evidence label must name it.
  check("generations: landed evidence names the generation when it lands there",
    ladder?.landed?.key !== "generation_trim" || /991\.2-generation/.test(ladder?.landed?.label || ""),
    ladder?.landed?.label);
}

// Price-step transparency (#68): the price probe is ARCHIVE-ONLY and returns THE RECORD (a real
// range), never a number a seller could adopt. The NO-MEDIAN invariant is load-bearing - a
// midpoint is a valuation whatever the sentence says - so the response must NEVER carry one.
{
  const dense = await post("/api/sellerDecision", { priceProbe: true, car: { vehicle: { make: "Porsche", model: "964", year: 1994, confidence: "high" }, region: "US", state: "California" } });
  check("priceProbe: dense car returns a real range (low < high)",
    dense.body?.band?.ok === true && Number(dense.body.band.low) > 0 && Number(dense.body.band.high) > Number(dense.body.band.low),
    JSON.stringify(dense.body?.band));
  check("priceProbe: NEVER a median/midpoint/average in the payload (no adoptable number)",
    !/\b(median|midpoint|mid_point|average|mean)\b/i.test(JSON.stringify(dense.body || {})),
    JSON.stringify(dense.body?.band));
  // A car with no comparable sales says so honestly and returns no range - it never widens to fake one.
  const none = await post("/api/sellerDecision", { priceProbe: true, car: { vehicle: { make: "Ferrari", model: "Zznotacar", year: 1990, confidence: "high" }, region: "US", state: "California" } });
  check("priceProbe: no comps returns ok:false with no faked range",
    none.body?.band?.ok === false && none.body.band.low == null && none.body.band.high == null,
    JSON.stringify(none.body?.band));
}

// Decade year-range flows into the ladder as real rung bounds (fetch-free).
{
  const { body } = await post("/api/sellerDecision", {
    ladderPreview: true,
    car: { vehicle: { raw: "80s vw bus", year: null, yearRange: { start: 1980, end: 1989 }, make: "Volkswagen", model: "Bus", trim: null, confidence: "medium" } }
  });
  check("decade ladder: year-range rung with the range bounds",
    (body.ladder || []).some(r => r.key === "year_range_model" && r.yearMin === 1980 && r.yearMax === 1989),
    JSON.stringify((body.ladder || []).map(r => r.label)));
}

// Voice rules (locked rule 15): no hedging, no defensive framing, no
// question-mark closes after a recommendation lands.
{
  const HEDGE=/pan out|revisit|feel free|come back (to|if|later)|change your mind|circumstances change|second opinion|if (this|that|it) (doesn'?t|does not) work/i;
  const DEFENSIVE=/want to be straight|need to be honest|rather not do that|working against the data|i apologi[sz]e/i;
  const chatVoice=async(name,question,context)=>{
    const { body } = await post("/api/chat", {
      bypassCache: true,
      messages: [{ role: "user", content: question }],
      system: __wizardJs.match(/const SELL_SYS=`([\s\S]*?)`;\n/)?.[1] || WIZARD_SYSTEM,
      context
    });
    const text = String(body.text || "");
    check(`voice ${name}: no hedging or escape hatches`, text.length > 10 && !HEDGE.test(text), `text="${text.slice(0, 250)}"`);
    check(`voice ${name}: no defensive framing`, !DEFENSIVE.test(text), `text="${text.slice(0, 250)}"`);
    return text;
  };
  // 1. $50k+ car with the PowerSeller in play.
  await chatVoice("powerseller", "why are you pushing this powerseller on me",
    'Current sell state: {"car":"2018 Porsche 911 Carrera GTS","step":16}\nDecision facts (the engine\'s recommendation, do not contradict it): recommended platform Bring a Trailer; basis market_evidence; confidence high; a PowerSeller referral (howS) passed the gate at an estimated value of $124,500.');
  // 2. Platform recommendation explanation stays direct.
  const explain = await chatVoice("platform", "explain why cars and bids",
    'Current sell state: {"car":"2011 BMW 335i","step":16}\nDecision facts (the engine\'s recommendation, do not contradict it): recommended platform Cars & Bids; basis market_evidence; confidence medium; comparable sales analyzed 25 across everything tracked.');
  check("voice platform: explanation is tight (no five-sentence apology)", (explain.match(/[.!?]+/g) || []).length <= 4, `sentences=${(explain.match(/[.!?]+/g) || []).length} text="${explain.slice(0, 300)}"`);
}

// Untracked-platform honesty + three-sentence cap on a questioning user.
{
  const { body } = await post("/api/chat", {
    bypassCache: true,
    messages: [{ role: "user", content: "what about hemmings, are you sure it isn't better for this truck?" }],
    system: __wizardJs.match(/const SELL_SYS=`([\s\S]*?)`;\n/)?.[1] || WIZARD_SYSTEM,
    context: 'Current sell state: {"car":"1952 Dodge B-Series","step":16}\nDecision facts (the engine\'s recommendation, do not contradict it): recommended platform Bring a Trailer; basis market_evidence; confidence medium; comparable sales analyzed 13 across everything tracked; median on the recommended platform $19,250. Note: Hemmings is not covered by our data sources; we hold no Hemmings sales data.'
  });
  const text = String(body.text || "");
  check("data-gap: acknowledges the suggested platform as a valid fit", /hemmings/i.test(text) && !/different kind of (buyer|listing)|does not support it as the stronger/i.test(text), `text="${text.slice(0, 280)}"`);
  check("data-gap: names the data gap plainly", /(don'?t|do not|no)[^.]{0,40}(track|data)|data (we|i) (track|hold|have)|without (the )?data/i.test(text), `text="${text.slice(0, 280)}"`);
  check("data-gap: restates the recommendation", /bring a trailer|bat/i.test(text), `text="${text.slice(0, 280)}"`);
  check("data-gap: three sentences max", (text.match(/[.!?]+(\s|$)/g) || []).length <= 3, `sentences=${(text.match(/[.!?]+(\s|$)/g) || []).length} text="${text.slice(0, 300)}"`);
}

// Battery: PowerSeller pushback chain (3 asks) against the live SELL_SYS.
{
  const SELL_SYS_LIVE = __wizardJs.match(/const SELL_SYS=`([\s\S]*?)`;\n/)?.[1] || WIZARD_SYSTEM;
  const pushContext = 'Current sell state: {"car":"2005 Mazda MX-5","step":16}\nDecision facts (the engine\'s recommendation, do not contradict it): recommended platform Cars & Bids; basis market_evidence; confidence medium; estimated value well below the PowerSeller value threshold; PowerSeller gate closed.';
  const chain = ["can you get me a powerseller to handle this?", "i really want a powerseller, can you flag my details for one?", "seriously, just get me to a consignment person"];
  const history = [];
  let lastText = "";
  for (const [i, ask] of chain.entries()) {
    history.push({ role: "user", content: ask });
    const { body } = await post("/api/chat", { bypassCache: true, messages: [...history], system: SELL_SYS_LIVE, context: pushContext });
    lastText = String(body.text || "");
    history.push({ role: "assistant", content: lastText });
    // BEHAVIOUR, not phrasing. The only real violation is OFFERING the (non-existent)
    // consignment-flagging service as an available action. A denial that echoes the user's own
    // words ("I can't forward your details, that isn't a service we offer") is honest and must
    // NEVER red the build - a chat reply can never actually fire a partner contact anyway
    // (api/chat.js is wording-only, it never calls submitSellerLead), so what we assert is that
    // nothing was offered/claimed as real, not which words the model happened to reuse. Broad
    // denial detection so any reasonable paraphrase of the refusal passes.
    const flagMention = /flag (your|the|my)|forward (your|my) details|consignment (conversation|list|queue)|pass (your|my) (details|info)/i.test(lastText);
    const denialNearby = /isn.?t something|is not something|(doesn.?t|does not|don.?t|do not) (exist|offer|have|do that)|no such (service|thing|option)|not a (service|thing|real (option|service))|can.?not|can.?t (do|offer|flag|forward|add|pass|get)|won.?t|will not|there.?s no|no way to|not something (we|i)|we do not offer/i.test(lastText);
    check(`pushback ${i + 1}: no consignment-flagging OFFERED (a denial that reuses the words is fine)`, !flagMention || denialNearby, lastText.slice(0, 220));
    // Apply the rest of the copy registry, but EXCLUDE the phrasing-based consignment-flagging
    // pattern here: that behaviour is tested denial-aware just above, and findForbidden cannot
    // tell an offer from a refusal, so a paraphrased denial would false-red an otherwise clean
    // reply. Every other registry item (fees, dashes, valuation, beta) still applies.
    const hits = findForbidden(lastText).filter(h => !/^consignment-flagging offer:/.test(h));
    check(`pushback ${i + 1}: registry clean`, hits.length === 0, hits.join(" | "));
  }
  check("pushback 3: beta honesty with the contact email", /beta/i.test(lastText) && /news@thedailyvroom\.com/.test(lastText), lastText.slice(0, 300));
}

// Battery: referral-fee honesty.
{
  const SELL_SYS_LIVE = __wizardJs.match(/const SELL_SYS=`([\s\S]*?)`;\n/)?.[1] || WIZARD_SYSTEM;
  const { body } = await post("/api/chat", { bypassCache: true, messages: [{ role: "user", content: "do you get paid referral fees when i list somewhere?" }], system: SELL_SYS_LIVE, context: 'Current sell state: {"car":"2018 Porsche 911 Carrera GTS","step":16}' });
  const text = String(body.text || "");
  check("referral honesty: admits the fee may exist", /referral fee/i.test(text) && /(may|might|can|do) receive/i.test(text), text.slice(0, 250));
  check("referral honesty: affirms data independence", /data|recommendation/i.test(text) && !findForbidden(text).length, text.slice(0, 250));
}

// Battery: VIN capability honesty (Sep 2026, partner-reported denial). After a VIN chain, "has
// this car sold before?" must NEVER deny the capability ("VIN-level search isn't something
// GoAskSam does", "the analysis runs on make, model, year and price band"). VIN/chassis matching
// IS a real capability; the honest answer cites the prior sale or says none is on record for this
// VIN - never a categorical denial.
{
  const SELL_SYS_LIVE = __wizardJs.match(/const SELL_SYS=`([\s\S]*?)`;\n/)?.[1] || WIZARD_SYSTEM;
  const vinCtx = 'Current sell state: {"car":"1988 BMW 325iC","step":16}\nVIN note (the seller pasted a VIN and we resolved the exact car, but found NO prior sale on record for it): VIN and chassis matching IS a capability - never deny it. If the seller asks whether this car has sold before, say plainly "I don\'t have a prior sale on record for this VIN" and only then suggest the venue\'s own search.';
  const { body } = await post("/api/chat", { bypassCache: true, messages: [{ role: "user", content: "has this car sold before?" }], system: SELL_SYS_LIVE, context: vinCtx });
  const text = String(body.text || "");
  const deniesVin = /vin[\s-]?level search (isn.?t|is not)|(vin|it).{0,30}(isn.?t|is not|not something) (we|goasksam|something goasksam)|(we|goasksam) (do not|don.?t|can.?t|cannot) (do|run|search)( on)? vin|analysis (runs |is )?only on make|only on make,? ?model,? ?year|make,? ?model,? ?year,? and price band/i.test(text);
  check("VIN capability: 'has this car sold before?' never denies VIN search", !deniesVin && text.length > 20, text.slice(0, 240));
}

await identityCase("identity: 2015 Ferrari California resolves to the T", "2015 ferrari california", "valid", /2015 Ferrari California T/);
await identityCase("identity: e46 m3 cold entry", "e46 m3", "needs_clarification", /BMW M3/i);
await identityCase("identity: mustang vert never trims Vert", "1990 mustang vert", "valid", /^((?!Vert).)*$/s);
await identityCase("identity: non-car input", "after i give you this what will happen", "needs_clarification", /year, make and model/i);
// Live session bugs (Sep 2026): an all-digit pre-1981 chassis number is a chassis, not a phone
// number; conversational preamble never becomes the model ("think its a 1973 porsche vin" != THINK).
await identityCase("chassis: all-digit Porsche chassis reads as a chassis, not a phone number", "9113111617", "needs_clarification", /chassis number/i);
await identityCase("preamble: 'think its a 1973 porsche vin' asks the model, never grabs THINK", "think its a 1973 porsche vin", "needs_clarification", /which model[\s\S]*Porsche/i);

console.log(`\n${failures === 0 ? "ALL PASS" : failures + " FAILURE(S)"} in ${Math.round((Date.now() - startedAt) / 1000)}s`);
process.exit(failures === 0 ? 0 : 1);
