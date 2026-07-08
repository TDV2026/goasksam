// Production smoke tests. Asserts on response CONTENT, not just routing or
// status codes: a chat layer that returns filler instead of an answer fails.
//
// Usage: npm run smoke:prod   (optionally SMOKE_BASE_URL=https://... to override)

const BASE = process.env.SMOKE_BASE_URL || "https://goasksam.vercel.app";
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

await identityCase("identity: 2018 911 Carrera GTS", "2018 911 Carrera GTS", "valid", /2018 Porsche 911 Carrera GTS/);
await identityCase("identity: miata", "miata", "needs_clarification", /Mazda MX-5.*year/i);
await identityCase("identity: 67 corvette", "67 corvette", "valid", /1967 Chevrolet Corvette/);
await identityCase("identity: non-car input", "after i give you this what will happen", "needs_clarification", /year, make and model/i);

console.log(`\n${failures === 0 ? "ALL PASS" : failures + " FAILURE(S)"} in ${Math.round((Date.now() - startedAt) / 1000)}s`);
process.exit(failures === 0 ? 0 : 1);
