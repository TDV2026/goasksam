// Production smoke tests. Asserts on response CONTENT, not just routing or
// status codes: a chat layer that returns filler instead of an answer fails.
//
// Usage: npm run smoke:prod   (optionally SMOKE_BASE_URL=https://... to override)

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const BASE = process.env.SMOKE_BASE_URL || "https://goasksam.vercel.app";
// The entry system prompt lives in js/chat-core.js since the index.html split.
const __chatCore = fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "js", "chat-core.js"), "utf8");
const ENTRY_SYS = __chatCore.match(/const SYS=`([\s\S]*?)`;\n/)[1];
let failures = 0;

function check(name, ok, detail) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  ->  " + detail}`);
  if (!ok) failures++;
}

async function post(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

// Mirrors the wizard's SELL_SYS shape closely enough to test the chat layer
// the way the frontend uses it.
const WIZARD_SYSTEM = `You are Sam, helping someone sell their car on GoAskSam. Warm, direct, knowledgeable about the collector car market.
The user is in the middle of a sell flow and has asked a question. Answer it warmly and specifically, then bring them back to the next question naturally. The current sell state and next question are provided separately.
Key facts:
- Fees: GoAskSam holds NO platform fee data. Never state platform fees, commissions, percentages, or caps as fact. If asked what howS or any consignor charges: we do not hold his fee terms; per howS his structure is usually flexible, and the specifics are discussed directly with him if the seller requests an introduction.
- Timing: the question flow takes under a minute, and the market analysis itself runs in seconds once the questions are done. Nothing here is a long process.
- Privacy and leads: seller details are used only to build the recommendation. If the seller chooses to proceed, their details go to one single chosen destination, never blasted to multiple partners, never sold.
Style: never use em dashes or en dashes anywhere in your replies. Use commas or periods instead.
Never say you are AI. You are Sam. End on your answer; the wizard re-asks its own question after you.`;

async function chatCase(name, question, contentPattern, forbidPattern) {
  const { status, body } = await post("/api/chat", {
    messages: [{ role: "user", content: question }],
    system: WIZARD_SYSTEM,
    context: 'Current sell state: {"car":null,"step":1}\nNext question: What are we selling today?'
  });
  const text = String(body.text || "");
  check(`${name}: HTTP 200 with text`, status === 200 && text.length > 20, `status=${status} error=${body.error || "none"} text="${text.slice(0, 80)}"`);
  check(`${name}: content answers the question`, contentPattern.test(text), `text="${text.slice(0, 200)}"`);
  check(`${name}: not a filler line`, !/let me know how you'd like to proceed/i.test(text), `text="${text.slice(0, 120)}"`);
  check(`${name}: no em or en dashes in generated copy`, !/—|–/.test(text), `text="${text.slice(0, 200)}"`);
  check(`${name}: no raw markdown in output`, !/\*\*/.test(text), `text="${text.slice(0, 200)}"`);
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
  const legit = await post("/api/chat", { messages: [{ role: "user", content: "is this site legit" }], system: ENTRY_SYS });
  const t1 = String(legit.body.text || "");
  check("entry: legit answer is grounded", legit.status === 200 && /auction sale records|where (to|should you) sell|seller/i.test(t1), `text="${t1.slice(0, 200)}"`);
  check("entry: no live-listing or demo claims", !/live listing|demo (set|version)|10 (live )?listings|pull up|what('| i)s live|tracks live|browse/i.test(t1), `text="${t1.slice(0, 250)}"`);
  const tdv = await post("/api/chat", { messages: [{ role: "user", content: "is it part of the daily vroom yes or no" }], system: ENTRY_SYS });
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
  const thinExactYear = rung1 && !rung1.met;
  check("generations: real run returns a decision", real.status === 200 && real.body.status === "decision_ready", `status=${real.status} ${real.body.status}`);
  check("generations: thin exact year lands on the generation rung",
    !thinExactYear || ladder?.landed?.key === "generation_trim",
    `rung1 sales=${rung1?.sales} landed=${ladder?.landed?.key} (${ladder?.landed?.label})`);
  check("generations: landed evidence names the generation when used",
    !thinExactYear || /991\.2-generation/.test(ladder?.landed?.label || ""),
    ladder?.landed?.label);
}

await identityCase("identity: e46 m3 cold entry", "e46 m3", "needs_clarification", /BMW M3/i);
await identityCase("identity: mustang vert never trims Vert", "1990 mustang vert", "valid", /^((?!Vert).)*$/s);
await identityCase("identity: non-car input", "after i give you this what will happen", "needs_clarification", /year, make and model/i);

console.log(`\n${failures === 0 ? "ALL PASS" : failures + " FAILURE(S)"} in ${Math.round((Date.now() - startedAt) / 1000)}s`);
process.exit(failures === 0 ? 0 : 1);
