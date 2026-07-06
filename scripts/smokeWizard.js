// Wizard-level production smoke tests: runs the real index.html wizard logic
// in Node with a stubbed DOM against the LIVE APIs. Asserts the global
// invariants inside clarification sub-states, where they once silently failed:
// off-script input must reach the chat layer from any state, and repeated
// failed input must never produce the same message twice.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BASE = process.env.SMOKE_BASE_URL || "https://goasksam.vercel.app";
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const html = fs.readFileSync(path.join(repoRoot, "index.html"), "utf8");
const script = html.match(/<script>([\s\S]*)<\/script>/)[1];

const elemStub = () => new Proxy(function () {}, {
  get: (t, p) => {
    if (p === "style") return {};
    if (p === "classList") return { add() {}, remove() {}, toggle() {} };
    if (["value", "innerHTML", "textContent", "id", "className"].includes(p)) return "";
    if (["scrollTop", "scrollHeight", "offsetHeight", "clientHeight"].includes(p)) return 0;
    if (p === Symbol.toPrimitive) return () => "";
    return typeof t[p] !== "undefined" ? t[p] : elemStub();
  },
  set: () => true,
  apply: () => elemStub()
});
const documentStub = {
  getElementById: () => elemStub(), createElement: () => elemStub(),
  querySelector: () => elemStub(), querySelectorAll: () => [],
  addEventListener() {}, body: elemStub(), documentElement: elemStub(), head: elemStub()
};
const windowStub = {
  addEventListener() {}, location: { search: "", hostname: "smoke", href: "" },
  matchMedia: () => ({ matches: false, addEventListener() {} }), innerWidth: 1200, scrollTo() {}
};
const prodFetch = (url, opts) => fetch(String(url).startsWith("http") ? url : `${BASE}${url}`, opts);

const prelude = `const __samLog=[];\n`;
const patched = script.replace(
  /function addMsg\(/,
  "function addMsg(...__a){__samLog.push(__a);return __addMsgReal(...__a)}\nfunction __addMsgReal("
);
const exportTail = `;globalThis.__t={handleSellStep,sellState,addMsgLog:__samLog,SELL_SYS,SELL_STEP_QUESTIONS};`;
const fn = new Function("document", "window", "fetch", "localStorage", "navigator", "location", "MutationObserver", "IntersectionObserver", "requestAnimationFrame", prelude + patched + exportTail);
fn(documentStub, windowStub, prodFetch, { getItem: () => null, setItem() {}, removeItem() {} }, { userAgent: "smoke", clipboard: {} }, { search: "", hostname: "smoke", href: "", pathname: "/" }, class { observe() {} disconnect() {} }, class { observe() {} disconnect() {} }, cb => cb && cb(0));

const { handleSellStep, sellState, addMsgLog } = globalThis.__t;
const samMessages = () => addMsgLog.filter(a => a[0] === "sam").map(a => String(a[1]));
const lastSam = () => samMessages().at(-1) || null;
let failures = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  [wizard] ${name}${ok ? "" : "  ->  " + detail}`);
  if (!ok) failures++;
};

function resetToStep1() {
  sellState.active = true; sellState.step = 1;
  sellState.carName = null; sellState.carRaw = null;
  sellState.pendingVehicleIdentity = null; sellState.vehicleIdentityValidated = false;
  sellState.lastVehicleAsk = null; sellState.vehicleClarifyRepeats = 0;
  sellState.notSureRepeats = 0; sellState.involvement = null;
  addMsgLog.length = 0;
}

// 1. Step-1 invariants (regression guard)
resetToStep1();
check("step 1: off-script input routes to chat", (await handleSellStep("after i give you this what will happen")) === false);
resetToStep1();
await handleSellStep("2018 911 Carrera GTS");
check("step 1: make inference advances wizard", sellState.step === 11 && /Porsche/.test(sellState.carName || ""), `step=${sellState.step} car=${sellState.carName}`);

// 2. Enter a clarification sub-state, then assert the invariants INSIDE it.
resetToStep1();
await handleSellStep("2018 porsche something weird xyzzy");
check("sub-state: clarification opened", sellState.step === 17 && !!sellState.pendingVehicleIdentity, `step=${sellState.step}`);

const inSubState = sellState.step === 17;
if (inSubState) {
  // Off-script question from inside the sub-state must route to chat.
  const routed = await handleSellStep("how long will this take");
  check("sub-state: question routes to chat layer", routed === false, "handled=" + routed);
  const routed2 = await handleSellStep("but you never told me how long");
  check("sub-state: conversational follow-up routes to chat too", routed2 === false, "handled=" + routed2);

  // Repeated failed input must escalate with different wording every time.
  const before = samMessages().length;
  await handleSellStep("2018 porsche fnord blorp");
  await handleSellStep("2018 porsche fnord blorp");
  await handleSellStep("2018 porsche fnord blorp");
  const asks = samMessages().slice(before);
  const consecutiveRepeat = asks.some((msg, i) => i > 0 && msg === asks[i - 1]);
  check("sub-state: repeated failure never repeats the same message", asks.length >= 3 && !consecutiveRepeat, JSON.stringify(asks));

  // Repeated "not sure" escalates and finally proceeds broad instead of looping.
  const beforeNs = samMessages().length;
  await handleSellStep("not sure");
  await handleSellStep("not sure");
  await handleSellStep("not sure");
  const nsAsks = samMessages().slice(beforeNs);
  const nsRepeat = nsAsks.some((msg, i) => i > 0 && msg === nsAsks[i - 1]);
  check("sub-state: repeated 'not sure' escalates without repeating", nsAsks.length >= 3 && !nsRepeat, JSON.stringify(nsAsks));
  check("sub-state: third 'not sure' proceeds at make level", sellState.step === 11, `step=${sellState.step} last="${lastSam()}"`);
}

console.log(`\n${failures === 0 ? "WIZARD ALL PASS" : failures + " FAILURE(S)"}`);
process.exit(failures === 0 ? 0 : 1);
