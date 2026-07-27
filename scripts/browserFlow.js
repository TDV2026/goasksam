// Browser-flow harness: drives the deployed frontend through the SAME entry
// points the browser binds (send() on the input, quick()/handleChip for chips),
// with REAL fetches to production. This is the path unit calls to handleSellStep
// bypass. Usage: node scripts/browserFlow.js
import fs from "node:fs";

const BASE = process.env.FLOW_BASE || "https://goasksam.vercel.app";

// ---- DOM stub: persistent elements keyed by id, real .value/.disabled ----
const els = {};
function mkEl(id) {
  const listeners = {};
  const el = {
    id, value: "", disabled: false, textContent: "", innerHTML: "",
    style: {}, className: "", scrollTop: 0, scrollHeight: 0,
    dataset: {},
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    appendChild() { return el; }, removeChild() {}, remove() {},
    setAttribute() {}, getAttribute() { return null; }, focus() {}, blur() {},
    scrollIntoView() {}, insertAdjacentHTML() {},
    addEventListener(ev, fn) { (listeners[ev] || (listeners[ev] = [])).push(fn); },
    querySelector() { return mkEl("q"); }, querySelectorAll() { return []; },
    closest() { return null; }, __listeners: listeners
  };
  return el;
}
function getEl(id) { return els[id] || (els[id] = mkEl(id)); }

const SAM = []; // captured Sam messages: {text, chips}
globalThis.window = globalThis;
globalThis.document = {
  getElementById: getEl,
  querySelector: () => mkEl("q"),
  querySelectorAll: () => [],
  createElement: () => mkEl("new"),
  addEventListener() {}, body: mkEl("body"),
  documentElement: mkEl("html")
};
try { Object.defineProperty(globalThis, "navigator", { value: { language: "en-US" }, configurable: true }); } catch {}
globalThis.location = { hostname: new URL(BASE).hostname, protocol: "https:", href: BASE };
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };

// Keep REAL timers (undici's fetch needs them). The app's 800ms
// setTimeout(askNextSellQuestion) fires during a short real wait after each send.
const wait = (ms) => new Promise(r => globalThis.setTimeout(r, ms));

// Real fetch to production, rewriting apiPath("/api/..") -> BASE.
const realFetch = globalThis.fetch;
globalThis.fetch = (url, opts) => {
  const u = String(url).startsWith("http") ? url : BASE + (String(url).startsWith("/") ? url : "/" + url);
  return realFetch(u, opts);
};

// ---- load concatenated frontend, patch addMsg to capture ----
const html = fs.readFileSync("index.html", "utf8");
const files = [...html.matchAll(/<script src="(js\/[^"]+)"><\/script>/g)].map(m => m[1]);
let script = files.map(f => fs.readFileSync(f, "utf8")).join("\n");

// Capture Sam messages by wrapping addMsg after load.
const bootstrap = `
globalThis.__SAM = SAM;
globalThis.sellState = sellState;
globalThis.send = send;
const __origAddMsg = addMsg;
addMsg = function(role, text, htmlArg, chipsStr) {
  if (role === "sam") SAM.push({ text: String(text || ""), chips: String(chipsStr || "") });
  try { return __origAddMsg(role, text, htmlArg, chipsStr); } catch (e) { return; }
};
// showTyping/hideTyping touch the DOM only; keep them but harmless.
`;

globalThis.SAM = SAM;
(0, eval)(script + "\n" + bootstrap);

// ---- driver helpers ----
function lastSam() { return SAM[SAM.length - 1]; }
async function type(text) {
  getEl("inp").value = text;
  await send();          // the real browser entry point
  await wait(1200);      // let the 800ms askNextSellQuestion chain fire
  const s = lastSam();
  console.log(`  > "${text}"`);
  console.log(`    Sam: ${JSON.stringify((s?.text || "").slice(0, 140))}`);
  if (s?.chips && /chip/.test(s.chips)) {
    const chips = [...s.chips.matchAll(/handleChip\('([^']+)'\)/g)].map(m => m[1]);
    if (chips.length) console.log(`    chips: [${chips.join(", ")}]`);
  }
  console.log(`    state: active=${sellState.active} step=${sellState.step} car=${JSON.stringify(sellState.carName)} skipped=${sellState.vehicleDetailSkipped}`);
  return s;
}

(async () => {
  console.log(`=== FAILURE A repro through send() against ${BASE} ===`);
  await type("Porsche 911 Carrera GTS");
  await type("Not sure");        // year chip
  // Walk whatever the wizard asks. Feed generic answers via the real path.
  // Correct chip labels per SELL_STEP_QUESTIONS so we actually reach the summary.
  const answers = ["US", "California", "Under 30k", "Completely stock", "Full history", "Clean title", "165", "No rush, right result only", "Skip"];
  for (const a of answers) {
    if (sellState.step === 16 || sellState.step === 10 || !sellState.active) break;
    await type(a);
  }
  // Photo step (10) has no text input; skip it via its button, then wait for
  // the 600ms afterPhoto -> showConfirmation chain.
  if (sellState.step === 10 && typeof skipPhoto === "function") { try { skipPhoto(); await wait(900); } catch {} }
  console.log("\n  -- reached summary? clicking 'Looks good' --");
  const beforeLooksGood = SAM.length; // marker: messages after this are post-summary
  await type("Looks good");
  await wait(6000); // let the real sellerDecision call resolve
  console.log("\n  -- now typing 'move on' (A3 probe) --");
  await type("move on");

  console.log("\n=== SUMMARY ===");
  const postSummary = SAM.slice(beforeLooksGood).map(s => s.text).join(" || ");
  const allText = SAM.map(s => s.text).join(" || ");
  console.log("POST-SUMMARY year re-ask present?   ", /what year|year is it/i.test(postSummary), "  (entry year-ask is legit, only post-summary matters)");
  console.log("'move on' escape-hatch copy present?", /say 'move on'|say move on/i.test(allText));
  console.log("parsed as Daihatsu / new car?       ", /daihatsu|a Move\b/i.test(postSummary) || /move|daihatsu/i.test(String(sellState.carName || "")));
  console.log("final car label:                    ", JSON.stringify(sellState.carName), "final step:", sellState.step);
})();
