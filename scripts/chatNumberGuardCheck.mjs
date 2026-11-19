// The number check of the legacy chat (api/chat.js; Oct 25 2026): a reply with an invented number is cut, a reply with only supplied numbers passes.
// Unit checks on lib/live/numberGuard.js, then the real handler with a fake model and no database.   node scripts/chatNumberGuardCheck.mjs
import { groundReplyNumbers, numTok, normNum } from "../lib/live/numberGuard.js";
import { guardReply } from "../lib/live/chatCore.js";
let failed = 0; const ok = (n, c, d) => { if (!c) failed++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`); };
const facts = "Decision facts (Sam's pick: Bring a Trailer). 14 sales in the last 24 months, $41,000 to $58,500. The latest sale was in March 2026.";
const user = "I have a 1966 Mustang with 62,000 miles";
const supplied = facts + "\n" + user;
let g = groundReplyNumbers("There were 14 sales, from $41,000 to $58,500. Your 1966 Mustang has 62,000 miles listed.", supplied);
ok("a reply with only supplied numbers passes untouched", g.dropped.length === 0 && /14 sales/.test(g.text));
g = groundReplyNumbers("There were 14 sales. A car like yours sold for $73,250 last week.", supplied);
ok("a sentence with an invented number is cut", g.dropped.length === 1 && !/73,250/.test(g.text) && /14 sales/.test(g.text), JSON.stringify(g.bad));
g = groundReplyNumbers("Most sell for around $90,000.", supplied);
ok("when nothing is left the text is empty (the caller says its plain line)", g.text === "" && g.dropped.length === 1);
ok("the shared definition still drives the other chats' guard", guardReply("It sold for $12,345.", [{ tool: "t", input: {}, result: { price: 41000 } }], "").some(r => /numbers not in/.test(r)));
ok("and passes a supplied number there", !guardReply("It sold for $41,000.", [{ tool: "t", input: {}, result: { price: 41000 } }], "").some(r => /numbers not in/.test(r)));

// the real handler, a fake model, no database
process.env.ANTHROPIC_API_KEY = "test-key-not-real"; delete process.env.SUPABASE_URL; delete process.env.SUPABASE_SERVICE_ROLE_KEY; delete process.env.SUPABASE_ANON_KEY;
let modelText = "";
globalThis.fetch = async (url) => String(url).includes("api.anthropic.com") ? new Response(JSON.stringify({ content: [{ type: "text", text: modelText }], usage: { input_tokens: 10, output_tokens: 10 } }), { status: 200 }) : new Response("[]", { status: 200 });
const { default: handler } = await import("../api/chat.js");
const call = async (text, context, userMsg) => {
  modelText = text; let out = null;
  const res = { statusCode: 200, headers: {}, setHeader() {}, getHeader() {}, status(c) { this.statusCode = c; return this; }, json(b) { out = b; return this; }, end() { return this; } };
  await handler({ method: "POST", headers: { host: "goasksam.com", origin: "https://goasksam.com" }, body: { mode: "assist", messages: [{ role: "user", content: userMsg }], context, bypassCache: false }, socket: {}, query: {} }, res);
  return out;
};
const bad = await call("Cars like that sold for $73,250 recently. Tell Sam the year, make and model.", facts, user);
ok("handler: an invented number never reaches the page", bad && typeof bad.text === "string" && !/73,250/.test(bad.text) && bad.text.length > 0, JSON.stringify(bad && bad.text));
const good = await call("There were 14 sales from $41,000 to $58,500.", facts, user);
ok("handler: supplied numbers pass", good && /14 sales from \$41,000 to \$58,500/.test(good.text || ""), JSON.stringify(good && (good.text || good.error)));
const none = await call("Cars like that go for about $90,000.", "", "what is a mustang?");
ok("handler: with nothing supplied the plain line replaces it", none && /Sam only states numbers/.test(none.text || ""), JSON.stringify(none && (none.text || none.error)));
process.exit(failed ? 1 : 0);
