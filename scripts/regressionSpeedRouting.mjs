// Defect A regression (deterministic, no network): unknown spread is never
// treated as negligible spread. Drives the REAL showSellRecommendation() render
// path with a stubbed fetch returning crafted decisions, then reads the composed
// cards off sellState.sellOptions.
//
// Case 1 (unknown spread): no 5+/5+ symmetric proof anywhere. A fast alt exists
//   and the seller wants speed, but the slow EVIDENCE LEADER must hold Card 1
//   (routingReason stays null), state its concentration finding, and carry a
//   speed-tradeoff bullet. Invariant: the pick card never renders fewer
//   evidence-backed findings than the alt card.
// Case 2 (measured Mode B <10%): a 5+/5+ symmetric spread under 10% exists, so
//   the locked speed rule still applies and speed DOES take Card 1.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const html = fs.readFileSync(path.join(repoRoot, "index.html"), "utf8");
const moduleFiles = [...html.matchAll(/<script src="(js\/[^"]+)"><\/script>/g)].map(m => m[1]);
const script = moduleFiles.map(f => fs.readFileSync(path.join(repoRoot, f), "utf8")).join("\n");

const appendedHTML = [];
const elemStub = () => new Proxy(function () {}, {
  get: (t, p) => {
    if (p === "style") return {};
    if (p === "classList") return { add() {}, remove() {}, toggle() {} };
    if (["value", "textContent", "id", "className"].includes(p)) return "";
    if (p === "innerHTML") return t.__html || "";
    if (["scrollTop", "scrollHeight", "offsetHeight", "clientHeight"].includes(p)) return 0;
    if (p === "appendChild") return x => { if (x && x.__html !== undefined) appendedHTML.push(x.__html); return elemStub(); };
    if (p === "scrollIntoView" || p === "remove") return () => elemStub();
    if (p === Symbol.toPrimitive) return () => "";
    return typeof t[p] !== "undefined" ? t[p] : elemStub();
  },
  set: (t, p, v) => { if (p === "innerHTML") t.__html = v; return true; },
  apply: () => elemStub()
});
const documentStub = { getElementById: () => elemStub(), createElement: () => elemStub(), querySelector: () => elemStub(), querySelectorAll: () => [], addEventListener() {}, body: elemStub(), documentElement: elemStub(), head: elemStub() };
const windowStub = { addEventListener() {}, location: { search: "", hostname: "test", href: "" }, matchMedia: () => ({ matches: false, addEventListener() {} }), innerWidth: 1200, scrollTo() {} };

// Injectable synthetic decision; the fetch stub returns whatever is set here.
let NEXT_DECISION = null;
const fetchStub = async (url) => {
  if (String(url).includes("/api/sellerDecision")) return { ok: true, json: async () => NEXT_DECISION };
  return { ok: true, json: async () => ({}) };
};

const exportTail = `;globalThis.__t={showSellRecommendation,sellState,resetSellState:(typeof resetSellFlow==='function'?resetSellFlow:null)};`;
const fn = new Function("document", "window", "fetch", "localStorage", "navigator", "location", "MutationObserver", "IntersectionObserver", "requestAnimationFrame", script + exportTail);
fn(documentStub, windowStub, fetchStub, { getItem: () => null, setItem() {}, removeItem() {} }, { userAgent: "test", clipboard: {} }, { search: "", hostname: "test", href: "", pathname: "/" }, class { observe() {} disconnect() {} }, class { observe() {} disconnect() {} }, cb => cb && cb(0));
const { showSellRecommendation, sellState } = globalThis.__t;

let failures = 0;
const check = (name, ok, detail = "") => { console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  ->  " + detail}`); if (!ok) failures++; };

// A route the frontend accepts as evidence-backed and worth showing.
function route(platform, label, speedToList, evidenceSales, median, pricePremium, dayAdvantage) {
  return {
    platform, label, speedToList, routable: true, hasMarketEvidence: true,
    routeFitFacts: [], speedToList,
    marketEvidence: { evidenceSales, medianSalePrice: median, pricePremium: pricePremium || null, dayAdvantage: dayAdvantage || null, topThreeSales: 3 }
  };
}
function decision(routes) {
  return {
    status: "ok",
    vehicle: { make: "Chevrolet", model: "Camaro", year: 1967 },
    evidence: { ladder: { landed: { key: "exact_year_model", generationCode: null, thresholdMet: true } } },
    analysis: { sellerActivity: {} },
    decision: { evidenceBasis: "market_data", recommendedPath: routes[0].platform, partnerReferral: {}, limitations: [], tradeoffs: [], routeFit: { pick: routes[0].platform, routes } }
  };
}
async function render(routes, extras) {
  appendedHTML.length = 0;
  Object.assign(sellState, {
    active: true, step: 12, carName: "1967 Chevrolet Camaro", carRaw: "1967 Chevrolet Camaro",
    region: "US", state: "California", price: "40k", vehicleIdentityValidated: true,
    resolvedVehicle: { make: "Chevrolet", model: "Camaro", year: 1967, trim: "SS" },
    involvement: null, awaitingPathChoice: false, pendingResultSections: null,
    timeline: "Want it gone fast", routingReason: null, sellDecision: null, noEvidenceFallback: null
  }, extras || {});
  NEXT_DECISION = decision(routes);
  await showSellRecommendation();
  await new Promise(r => setTimeout(r, 60));
}
const cardText = c => c && c.composed ? [c.composed.headline && c.composed.headline.text, ...(c.composed.bullets || []).map(b => b.text)].filter(Boolean).join("\n") : "";
// Evidence-backed findings: a headline that is a real market finding (not the
// thin "are limited. Analysis ran at X" floor) plus weekday/audience/premium bullets.
function findingCount(c) {
  if (!c || !c.composed) return 0;
  const h = c.composed.headline;
  const headlineFinding = h && !/are limited\. Analysis ran at/i.test(h.text) ? 1 : 0;
  const bulletFindings = (c.composed.bullets || []).filter(b => /dayAdvantage|platformFitCopy|pricePremium/.test(b.provenance || "")).length;
  return headlineFinding + bulletFindings;
}

// ---- Branch 4: unknown spread + speed pref + fast platform clears the floor ----
{
  const bat = route("bringatrailer", "Bring a Trailer", "slower", 18, 70000,
    { type: "market_dominance", gateType: "asymmetric", marketShare: 82, percent: null, windowDays: 180, platformSales: 18, othersSales: 4, scope: "model" },
    { weekday: "Thursday", liftPercent: 62, scope: "model", window: 180, sample: 18 });
  const hagerty = route("hagerty", "Hagerty Marketplace", "medium_fast", 4, 66000, null, null);
  await render([bat, hagerty]);
  const cards = (sellState.sellOptions || []).filter(o => !o.powerSeller);
  const pick = cards[0], alt = cards[1];
  check("Branch 4: unknown spread + speed + fast platform >= 3 comps ranks the fast platform first (routingReason=speed_unknown)", sellState.routingReason === "speed_unknown", `reason=${sellState.routingReason}`);
  check("Branch 4: the faster-to-list platform (Hagerty) leads Card 1", /Hagerty/.test(pick && pick.name || ""), `pick=${pick && pick.name}`);
  check("Branch 4: pick headline states the speed reason (time to list)", /You said speed matters\. Hagerty Marketplace typically gets cars listed sooner and has closed recent 1967 Camaros sales\./.test(cardText(pick)), cardText(pick).slice(0, 240));
  check("Branch 4 INVARIANT: preference-led pick MUST carry the depth-honesty bullet naming the depth leader", /Bring a Trailer holds most of the recent 1967 Camaros sales we track\. If market depth matters more than timing, start there instead\./.test(cardText(pick)), cardText(pick).slice(0, 320));
  check("Branch 4: no banned auction-cycle wording anywhere on the pick", !/auction cycle/i.test(cardText(pick)), cardText(pick).slice(0, 240));
  check("Branch 4: alt is the depth leader (Bring a Trailer) with its concentration finding", /Bring a Trailer/.test(alt && alt.name || "") && /concentrated on Bring a Trailer/i.test(cardText(alt)), cardText(alt).slice(0, 200));
}

// ---- Branch 4 floor fails: fast platform below 3 comps -> branch 5 (depth) ----
{
  const bat = route("bringatrailer", "Bring a Trailer", "slower", 18, 70000,
    { type: "market_dominance", gateType: "asymmetric", marketShare: 82, percent: null, windowDays: 180, platformSales: 18, othersSales: 4, scope: "model" },
    { weekday: "Thursday", liftPercent: 62, scope: "model", window: 180, sample: 18 });
  const hagerty = route("hagerty", "Hagerty Marketplace", "medium_fast", 1, 66000, null, null);
  await render([bat, hagerty]);
  const cards = (sellState.sellOptions || []).filter(o => !o.powerSeller);
  const pick = cards[0];
  check("Branch 4 floor: a fast platform with < 3 relevant comps never leads; falls through to depth (routingReason null)", sellState.routingReason === null, `reason=${sellState.routingReason}`);
  check("Branch 4 floor: the depth leader (Bring a Trailer) holds Card 1, not the thin fast platform", /Bring a Trailer/.test(pick && pick.name || "") && /concentrated on Bring a Trailer/i.test(cardText(pick)), `pick=${pick && pick.name}`);
}

// ---- Mode A control: measured >=10% price winner + gone fast -> price wins ----
{
  const bat = route("bringatrailer", "Bring a Trailer", "slower", 8, 78000,
    { type: "premium", gateType: "symmetric", percent: 20, windowDays: 90, platformSales: 8, othersSales: 7, scope: "model" }, null);
  const hagerty = route("hagerty", "Hagerty Marketplace", "medium_fast", 7, 62000,
    { type: "premium", gateType: "symmetric", percent: -18, windowDays: 90, platformSales: 7, othersSales: 8, scope: "model" }, null);
  await render([bat, hagerty]);
  const cards = (sellState.sellOptions || []).filter(o => !o.powerSeller);
  const pick = cards[0];
  check("Mode A control: a measured >= 10% price winner leads even with a stated speed preference", /Bring a Trailer/.test(pick && pick.name || "") && /around 20% higher/i.test(cardText(pick)), `pick=${pick && pick.name} reason=${sellState.routingReason}`);
}

// ---- Mode B control: measured < 10% + speed still swaps to the faster platform ----
{
  const bat = route("bringatrailer", "Bring a Trailer", "slower", 8, 70000,
    { type: "premium", gateType: "symmetric", percent: 5, windowDays: 90, platformSales: 8, othersSales: 7, scope: "model" }, null);
  const hagerty = route("hagerty", "Hagerty Marketplace", "medium_fast", 7, 68000,
    { type: "premium", gateType: "symmetric", percent: -5, windowDays: 90, platformSales: 7, othersSales: 8, scope: "model" }, null);
  await render([bat, hagerty]);
  const cards = (sellState.sellOptions || []).filter(o => !o.powerSeller);
  const pick = cards[0];
  check("Mode B control: a measured < 10% spread still lets speed take Card 1 (routingReason=speed)", sellState.routingReason === "speed", `reason=${sellState.routingReason}`);
  check("Mode B control: the faster platform (Hagerty) leads Card 1 with listing-speed wording, no auction cycle", /Hagerty/.test(pick && pick.name || "") && !/auction cycle/i.test(cardText(pick)), cardText(pick).slice(0, 240));
}

console.log(failures ? `\n${failures} FAILURE(S)` : "\nSPEED-ROUTING ALL PASS");
process.exit(failures ? 1 : 0);
