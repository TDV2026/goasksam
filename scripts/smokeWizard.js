// Wizard-level production smoke tests: runs the real index.html wizard logic
// in Node with a stubbed DOM against the LIVE APIs. Asserts the global
// invariants inside clarification sub-states, where they once silently failed:
// off-script input must reach the chat layer from any state, and repeated
// failed input must never produce the same message twice.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { findForbidden } from "./forbiddenPatterns.js";
import { labelIsProvablyCar, resolveVehicle } from "../lib/vehicle.js";
import { CURATED_GENERATIONS } from "../lib/generations.js";
import { PRODUCTION_RULES } from "../lib/vehicleData.js";

const BASE = process.env.SMOKE_BASE_URL || "https://goasksam.vercel.app";
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// The frontend script lives in js/ modules loaded by index.html in order;
// concatenating them in that order reproduces the exact browser script.
const html = fs.readFileSync(path.join(repoRoot, "index.html"), "utf8");
const moduleFiles = [...html.matchAll(/<script src="(js\/[^"]+)"><\/script>/g)].map(m => m[1]);
if (!moduleFiles.length) throw new Error("no js module script tags found in index.html");
const script = moduleFiles.map(file => fs.readFileSync(path.join(repoRoot, file), "utf8")).join("\n");

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
const exportTail = `;globalThis.__t={handleSellStep,sellState,addMsgLog:__samLog,SELL_SYS,SELL_STEP_QUESTIONS,remainingWizardQuestions,localPreRoute,askNextSellQuestion,showSellRecommendation,handleSellRecommendationFollowup,editCarName};`;
const fn = new Function("document", "window", "fetch", "localStorage", "navigator", "location", "MutationObserver", "IntersectionObserver", "requestAnimationFrame", prelude + patched + exportTail);
fn(documentStub, windowStub, prodFetch, { getItem: () => null, setItem() {}, removeItem() {} }, { userAgent: "smoke", clipboard: {} }, { search: "", hostname: "smoke", href: "", pathname: "/" }, class { observe() {} disconnect() {} }, class { observe() {} disconnect() {} }, cb => cb && cb(0));

const { handleSellStep, sellState, addMsgLog, SELL_SYS, remainingWizardQuestions, localPreRoute , askNextSellQuestion, showSellRecommendation, handleSellRecommendationFollowup, editCarName } = globalThis.__t;
const samMessages = () => addMsgLog.filter(a => a[0] === "sam").map(a => String(a[1]));
const artifactsDir = path.join(repoRoot, "smoke-artifacts");
fs.mkdirSync(artifactsDir, { recursive: true });
function saveArtifact(name, text) {
  fs.writeFileSync(path.join(artifactsDir, `${name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.txt`), text);
}
// Slug-to-display map for verifying rendered platform claims against the
// decision's own route objects.
function platformNameMapSmoke(slug) {
  const key = String(slug || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const map = { bringatrailer: "Bring a Trailer", bat: "Bring a Trailer", carsandbids: "Cars & Bids", pcarmarket: "PCarMarket", hagerty: "Hagerty Marketplace", hemmings: "Hemmings", carandclassic: "Car & Classic", collectingcars: "Collecting Cars" };
  return map[key] || String(slug || "");
}
// Guardrails applied to every journey: forbidden-pattern registry (A),
// field-contamination check on the car label (D), repetition guard (E).
function guardRender(name, text) {
  const raw = String(text);
  const clean = raw.replace(/<span class="num">([^<]*)<\/span>/g,"$1").replace(/<[^>]+>/g, "\n");
  saveArtifact(name, clean);
  const hits = findForbidden(clean);
  check(`[registry] ${name}: no forbidden patterns`, hits.length === 0, hits.join(" | "));
  // The referral disclosure is fixed per-card legal boilerplate, not Sam's
  // prose: two cards legitimately carry it twice.
  const sentences = clean.split(/(?<=[.!?])\s+|\n/).map(x => x.trim()).filter(x => x.length > 30 && !/^</.test(x) && !/GoAskSam may receive a referral fee/.test(x));
  const dupes = sentences.filter((x, i) => sentences.indexOf(x) !== i);
  check(`[repetition] ${name}: no sentence renders twice`, dupes.length === 0, JSON.stringify([...new Set(dupes)].slice(0, 2)));
  // Design Phase 1 guards (raw HTML):
  if (/sell-rec-card/.test(raw)) {
    check(`[design] ${name}: at most one verdict plate`, (raw.match(/verdict-plate/g) || []).length <= 1, `plates=${(raw.match(/verdict-plate/g) || []).length}`);
    // Option shape (locked, updated): at most two platform cards (pick +
    // one alternative) and at most one partner surface.
    const platformCards = (raw.match(/class="sell-rec-card[ "]/g) || []).length;
    const partnerSurfaces = (raw.match(/class="power-seller-(feature|mini)[ "]/g) || []).length;
    check(`[design] ${name}: at most two platform cards and one partner surface`, platformCards <= 2 && partnerSurfaces <= 1, `platform=${platformCards} partner=${partnerSurfaces}`);
    // Plate target matches the prose pick (locked): handled-lead prose
    // ("...the platform pick is right below") crowns the PowerSeller; the
    // DIY ordering ("The platform pick above...") crowns the platform.
    const plateName = (raw.match(/vp-name">([^<]*)</) || [])[1] || "";
    const callName = (raw.replace(/<[^>]+>/g, " ").match(/(\S+) is who I'd call/) || [])[1] || "";
    if (plateName && callName) {
      if (/the platform pick is right below/.test(raw)) {
        check(`[design] ${name}: handled lead crowns the PowerSeller plate`, plateName.includes(callName), `plate="${plateName}" call="${callName}"`);
      }
      if (/platform pick above is the place to start/.test(raw)) {
        check(`[design] ${name}: DIY lead crowns the platform plate`, !plateName.includes(callName), `plate="${plateName}" call="${callName}"`);
      }
    }
    check(`[design] ${name}: no width overrides on cards`, !/sell-rec-card[^>]*style="[^"]*width/.test(raw), "inline width found");
    check(`[design] ${name}: no img logos in cards`, !/<img/i.test(raw), (raw.match(/<img[^>]*/i) || [""])[0].slice(0, 100));
    // The share claim is bullet 1 with the earned-green class (the standalone
    // evidence band is deleted from platform cards). Biconditional: a
    // validated-claim li always carries the share claim, and a share claim
    // never renders without the class.
    check(`[design] ${name}: no evidence band on platform cards`, !/evidence-band/.test(raw), "band still renders");
    const flatLi = h => String(h).replace(/<span class="num">([^<]*)<\/span>/g, "$1").replace(/&#\d+;/g, "'").replace(/<[^>]+>/g, " ");
    const liMatches = [...raw.matchAll(/<li(?: class="([^"]*)")?>([\s\S]*?)<\/li>/g)];
    const greenClaim = b => /% of [^%]*closed on/.test(b) || /% higher on [^%]* than on other platforms/.test(b);
    const validatedLis = liMatches.filter(m => /validated-claim/.test(m[1] || "")).map(m => flatLi(m[2]));
    check(`[design] ${name}: green bullet only with a Tier 1 or Tier 2 claim`, validatedLis.every(greenClaim), (validatedLis.find(b => !greenClaim(b)) || "").slice(0, 140));
    const plainLis = liMatches.filter(m => !/validated-claim/.test(m[1] || "")).map(m => flatLi(m[2]));
    check(`[design] ${name}: Tier 1/2 claims always carry the green class`, plainLis.every(b => !greenClaim(b)), (plainLis.find(greenClaim) || "").slice(0, 140));
    // Tier 1 gates: 5+ sold both sides, rounded gap 10%+, % only (no dollars,
    // no "median"), verified against the decision's own proof object.
    const tier1 = clean.match(/sales have (?:historically )?closed around (\d+)% higher on ([^\n]+?) than on other platforms/);
    if (tier1) {
      const norm1 = v => String(v || "").toLowerCase().replace(/&amp;|&/g, "and").replace(/[^a-z0-9]/g, "");
      const routes1 = (sellState.sellDecision?.decision?.routeFit?.routes || []).filter(r => r.marketEvidence);
      const claimed1 = routes1.find(r => norm1(tier1[2]).includes(norm1(r.platform)) || norm1(platformNameMapSmoke(r.platform)) === norm1(tier1[2].trim()));
      const proof = claimed1?.marketEvidence?.pricePremium || null;
      check(`[design] ${name}: Tier 1 gates hold (5+ both sides, 10%+ gap)`, !!proof && proof.platformSales >= 5 && proof.othersSales >= 5 && proof.percent >= 10 && Number(tier1[1]) === proof.percent, `claim="${tier1[0].slice(0, 100)}" proof=${JSON.stringify(proof)}`);
      const tier1Li = validatedLis.find(b => /% higher on/.test(b)) || "";
      check(`[design] ${name}: Tier 1 is percent-only, no dollars or median`, !/\$|median/i.test(tier1Li), tier1Li.slice(0, 120));
    }
    check(`[design] ${name}: voice class never inside buttons or bullets`, !/<(button|li)[^>]*class="[^"]*voice/.test(raw), "voice in button/li");
    // Plate window label is specific and verifiable: never "Historical";
    // "Since YYYY" must name the evidence's earliest boundary; "Past N days"
    // must be a window some claim actually used.
    const plateM = clean.match(/Data: (?:([^\n]{2,40}?) · )?(Past \d+ days|Since \d{4}|All-time|[^\n]*)/);
    const plateSegment = plateM ? plateM[1] : null;
    const plateData = plateM ? plateM[2] : null;
    const plateNameC = ((raw.match(/vp-name">([^<]*)</) || [])[1] || "").replace(/&amp;/g, "&");
    const PLATFORM_NAMES = ["Bring a Trailer", "Cars & Bids", "PCarMarket", "Hemmings", "Hagerty Marketplace", "Car & Classic", "Collecting Cars"];
    // GATE 4 (segment scope transparency): rendered segment claims and the
    // plate's segment prefix must trace to shipped segment proof objects.
    const segRoutes = (sellState.sellDecision?.decision?.routeFit?.routes || []).filter(r => r.marketEvidence && (r.marketEvidence.pricePremium?.scope === "segment" || r.marketEvidence.segmentVolume));
    const segLabels = [...new Set(segRoutes.flatMap(r => [r.marketEvidence.pricePremium?.segmentLabel, r.marketEvidence.segmentVolume?.segmentLabel].filter(Boolean)))];
    if (/sport-compact/i.test(clean)) {
      check(`[design] ${name}: segment claims carry a shipped segment proof`, segLabels.length > 0, `labels=${JSON.stringify(segLabels)}`);
    }
    if (plateSegment) {
      check(`[design] ${name}: plate segment prefix matches a shipped proof label`, segLabels.some(l => plateSegment.trim().toLowerCase() === l.toLowerCase()), `prefix="${plateSegment}" labels=${JSON.stringify(segLabels)}`);
    }
    if (plateData) {
      check(`[design] ${name}: plate window never says Historical`, !/historical/i.test(plateData), `label="${plateData}"`);
      const ev = sellState.sellDecision?.evidence || {};
      const claimWindows = [ev.windowDays, ...((sellState.sellDecision?.decision?.routeFit?.routes || []).map(r => r.marketEvidence?.pricePremium?.windowDays))].filter(Number.isFinite);
      const sinceM = plateData.match(/^Since (\d{4})$/);
      const pastM = plateData.match(/^Past (\d+) days$/);
      const boundaryYears = [String(ev.earliestSaleDate || "").slice(0, 4),
        ...((sellState.sellDecision?.decision?.routeFit?.routes || []).map(r => String(r.marketEvidence?.pricePremium?.earliestSaleDate || "").slice(0, 4)))].filter(y => /^\d{4}$/.test(y));
      if (sinceM) check(`[design] ${name}: Since-year matches a verifiable evidence boundary`, boundaryYears.includes(sinceM[1]), `label="${plateData}" boundaries=${JSON.stringify(boundaryYears)}`);
      else if (pastM) check(`[design] ${name}: Past-days window was actually used`, claimWindows.includes(Number(pastM[1])), `label="${plateData}" windows=${JSON.stringify(claimWindows)}`);
      else check(`[design] ${name}: plate window is a recognized form`, plateData === "All-time", `label="${plateData}"`);
      // Old-data transparency (locked): a Since/All-time plate on a platform
      // card explains the lookback and carries NO count claims (percentages
      // only); recent plates carry no lookback line.
      if (plateNameC && PLATFORM_NAMES.includes(plateNameC) && /^(Since \d{4}|All-time)$/.test(plateData || "")) {
        check(`[design] ${name}: old-data card explains the lookback`, /We went back to \d{4} to get enough comparable|We analyzed [^\n]* across everything we've tracked/.test(clean.replace(/&#\d+;/g, "'")), (clean.match(/[^\n]*went back[^\n]*/) || ["missing"])[0].slice(0, 140));
        const countClaim = liMatches.map(m => flatLi(m[2])).find(t => /^\s*\d[\d,]* [^%\n]{0,60}have sold on/i.test(t));
        check(`[design] ${name}: old-data card carries no count claims`, !countClaim, (countClaim || "").slice(0, 120));
      }
      if (plateNameC && PLATFORM_NAMES.includes(plateNameC) && /^Past \d+ days$/.test(plateData || "")) {
        check(`[design] ${name}: recent card has no lookback line`, !/We went back to \d{4}|across everything we've tracked to build/.test(clean), (clean.match(/[^\n]*went back[^\n]*/) || [""])[0].slice(0, 120));
      }
      // Plate window == bullet 1 window: when bullet 1 names a finite span
      // in its own text, the plate must name the same one.
      const bullet1Window = (liMatches.length ? flatLi(liMatches[0][2]) : "").match(/over the past (\d+) days/);
      if (bullet1Window && pastM) {
        check(`[design] ${name}: plate window equals bullet 1 window`, Number(bullet1Window[1]) === Number(pastM[1]), `bullet1=${bullet1Window[1]}d plate=${pastM[1]}d`);
      }
      // Chat opener names the same window the platform plate displays
      // (skipped in handled mode, where the plate is the partner's career).
      const opener = clean.match(/I looked at [^\n]*?(over the past (\d+) days|since (\d{4})|across everything)/);
      if (opener && !/the platform pick is right below/.test(clean)) {
        const openerMatchesPlate = (pastM && Number(opener[2]) === Number(pastM[1])) || (sinceM && opener[3] === sinceM[1]) || (plateData === "All-time" && /across everything/.test(opener[1]));
        check(`[design] ${name}: chat opener window equals the plate window`, openerMatchesPlate, `opener="${opener[1]}" plate="${plateData}"`);
      }
    }
    // Alternative cards must name the searched model, never generic
    // platform language ("this platform", "this category").
    const altSegment = (raw.split(/Also strong here/)[1] || "").split(/sell-rec-footer/)[0];
    if (altSegment && sellState.resolvedVehicle?.model) {
      const flatAlt = altSegment.replace(/<span class="num">([^<]*)<\/span>/g, "$1").replace(/&amp;/g, "&").replace(/<[^>]+>/g, " ").toLowerCase();
      // The car may be named by model, trim, or the label vocabulary the
      // cards use ("BMW 335i", "Carrera") -- any specific token counts.
      const rv = sellState.resolvedVehicle;
      const carTokens = [rv.model, rv.trim, String(sellState.carName || "").replace(/\b(19|20)\d{2}\b/, "").trim()]
        .filter(Boolean).flatMap(v => String(v).toLowerCase().split(/\s+/)).filter(t => t.length > 2 && !/^(the|and)$/.test(t));
      check(`[design] ${name}: alternative card names the car`, carTokens.some(t => flatAlt.includes(t)), `tokens=${JSON.stringify([...new Set(carTokens)])} alt="${flatAlt.replace(/\s+/g, " ").slice(0, 140)}"`);
      check(`[design] ${name}: alternative card avoids generic platform language`, !/this platform|this category/i.test(flatAlt), (flatAlt.match(/[^.]*this (platform|category)[^.]*/i) || [""])[0].slice(0, 120));
    }
    // Alt tier-(a) window claim always names the landed evidence window
    // (the span its count is measured in, same vocabulary as the plate).
    const altTierA = clean.match(/(Most|Second-most) [^\n]+ sales (over the past (\d+) days|since (\d{4})|across everything)/);
    if (altTierA) {
      const evA = sellState.sellDecision?.evidence || {};
      const okA = altTierA[3] ? Number(altTierA[3]) === Number(evA.windowDays)
        : altTierA[4] ? String(evA.earliestSaleDate || "").startsWith(altTierA[4])
        : Number(evA.windowDays) >= 3650;
      check(`[design] ${name}: alt window claim matches the evidence window`, okA, `claim="${altTierA[0].slice(0, 90)}" windowDays=${evA.windowDays} earliest=${evA.earliestSaleDate}`);
    }
    // Alt speed line only with curated-fast policy data favoring the alternative.
    if (/If speed matters, /.test(clean)) {
      const routesS = sellState.sellDecision?.decision?.routeFit?.routes || [];
      const pickS = routesS[0];
      const altFast = routesS.slice(1).some(r => ["fast", "medium_fast"].includes(r.speedToList));
      check(`[design] ${name}: alt speed line gated on curated speed data`, altFast && !["fast", "medium_fast"].includes(pickS?.speedToList), `pick=${pickS?.speedToList} alts=${JSON.stringify(routesS.slice(1).map(r => [r.platform, r.speedToList]))}`);
    }
    // Speed-routing coherence: the speed voice line renders only when the
    // routing genuinely swapped for speed.
    if (/If speed is your priority, /.test(clean)) {
      check(`[design] ${name}: speed voice only with speed routing`, sellState.routingReason === "speed", `routingReason=${sellState.routingReason}`);
    }
    // Tier 1.5 gates: 5+ sold both sides, 2% <= |gap| < 10%, from the
    // decision's own proof objects.
    if (/Price is negligible between /.test(clean)) {
      const routesN = (sellState.sellDecision?.decision?.routeFit?.routes || []).filter(r => r.marketEvidence?.pricePremium);
      const proofN = routesN.map(r => r.marketEvidence.pricePremium).find(p => p.platformSales >= 5 && p.othersSales >= 5 && Math.abs(p.percent) >= 2 && Math.abs(p.percent) < 10);
      check(`[design] ${name}: Tier 1.5 gates hold (5+ both sides, 2-10% gap)`, !!proofN, `proofs=${JSON.stringify(routesN.map(r => [r.platform, r.marketEvidence.pricePremium]))}`);
    }
    // Plate pick and bullets agree: a platform plate's name must appear in
    // the claim bullets (every bullet-1 tier names the pick).
    if (plateNameC && PLATFORM_NAMES.includes(plateNameC)) {
      const liText = liMatches.map(m => flatLi(m[2]).replace(/&amp;/g, "&")).join("\n");
      check(`[design] ${name}: plate pick matches the bullets pick`, liText.includes(plateNameC) || !liText.trim(), `plate="${plateNameC}"`);
    }
    // All-time day-advantage lines must say "historically" (locked wording).
    const dayLines = clean.split("\n").filter(l => /above other days/i.test(l));
    check(`[design] ${name}: all-time day lines say historically`, dayLines.every(l => /historically/i.test(l)), dayLines.find(l => !/historically/i.test(l)) || "");
    // Tier B ("More X sales have closed on P than any other platform we
    // track") renders only when leadership is verifiably true in the
    // decision's own evidence set, and never in green.
    const tierB = clean.match(/More [^\n]* sales have closed on ([^\n]+?) than any other platform we track/);
    if (tierB) {
      const norm = v => String(v || "").toLowerCase().replace(/&amp;|&/g, "and").replace(/[^a-z0-9]/g, "");
      const routes = (sellState.sellDecision?.decision?.routeFit?.routes || []).filter(r => r.marketEvidence);
      const claimed = routes.find(r => norm(tierB[1]).includes(norm(r.platform)) || norm(tierB[1]).includes(norm(r.label)) || norm(platformNameMapSmoke(r.platform)) === norm(tierB[1]));
      const otherMax = Math.max(0, ...routes.filter(r => r !== claimed).map(r => Number(r.marketEvidence.evidenceSales || 0)));
      check(`[design] ${name}: Tier B leadership is verifiably true`, !!claimed && Number(claimed.marketEvidence.evidenceSales || 0) > otherMax, `claim="${tierB[0].slice(0, 90)}" counts=${JSON.stringify(routes.map(r => [r.platform, r.marketEvidence.evidenceSales]))}`);
      check(`[design] ${name}: Tier B never renders green`, !new RegExp(`validated-claim[^>]*>[^<]*than any other platform we track`).test(raw.replace(/<span class="num">([^<]*)<\/span>/g, "$1")), "tier B carries the green class");
    }
    // Standalone stats in the green bullet must carry .num.
    const liResidue = liMatches.filter(m => /validated-claim/.test(m[1] || ""))
      .map(m => m[2].replace(/<span class="num">[^<]*<\/span>/g, "").replace(/&#\d+;/g, "'").replace(/<[^>]+>/g, " "));
    const badResidue = liResidue.find(x => /(\d+%|\$\s?\d|(?<![\w-])\d{2,}(?![\w-]))/.test(x));
    check(`[design] ${name}: stats in the share-claim bullet carry .num`, !badResidue, (badResidue || "").slice(0, 140));
  }
}
const cssForVisual = fs.readFileSync(path.join(repoRoot, "styles.css"), "utf8");
function saveVisual(name, rawHTML) {
  const page = `<!doctype html><html><head><meta charset="utf-8"><link href="https://fonts.googleapis.com/css2?family=Source+Serif+4:wght@600&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet"><link href="https://api.fontshare.com/v2/css?f[]=switzer@400,500,600&display=swap" rel="stylesheet"><style>${cssForVisual}</style></head><body style="padding:24px;max-width:760px"><div id="msgs">${rawHTML}</div></body></html>`;
  fs.mkdirSync(path.join(repoRoot, "outputs"), { recursive: true });
  fs.writeFileSync(path.join(repoRoot, "outputs", `${name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.html`), page);
}
function guardCarLabel(name) {
  const label = String(sellState.carName || "");
  if (sellState.vehicleIdentityValidated && sellState.resolvedVehicle?.canonicalLabel) {
    check(`[render gate] ${name}: label IS the canonical resolution`, label === sellState.resolvedVehicle.canonicalLabel, `label="${label}" canonical="${sellState.resolvedVehicle.canonicalLabel}"`);
    check(`[render gate] ${name}: label provably a car`, labelIsProvablyCar(label, sellState.resolvedVehicle), `label="${label}"`);
  }
  const contaminated = /\b(us|usa|uk|europe|australia|middle east|california|texas|florida|new york)\b/i.test(label)
    || /\$|\b\d{2,3}k\b|\bmiles?\b|\basap\b|\bfast\b/i.test(label)
    || /half restored|fully restored|barn find|needs work|project\b|\bmint\b|\brough\b/i.test(label);
  check(`[contamination] ${name}: car label carries no foreign-field tokens`, !contaminated, `car="${label}"`);
}
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
  sellState.vehicleDetailSkipped = false; sellState.demandRepeats = 0;
  sellState.mileage = null; sellState.resolvedVehicle = null; sellState.trimAskAttempts = 0;
  sellState.region = null; sellState.state = null; sellState.condition = null; sellState.records = null;
  sellState.title = null; sellState.price = null; sellState.timeline = null; sellState.notes = null;
  sellState.returnToConfirm = false;
  sellState.priceGapContextGathered = false; sellState.awaitingPriceGapContext = false; sellState.priceContextNote = null;
  sellState.lastMissingAsk = null; sellState.editReturnStep = null; sellState.editPrevVehicle = null;
  addMsgLog.length = 0;
}

// 0. Generation-map audit invariant (locked): a narrow generation map may
// never masquerade as a production span. Every mapped model whose map is
// under 20 years wide and covers under half of real production, or whose
// real production extends past the map's +/-2 tolerance, MUST have a
// curated production rule. Reality table maintained with the audit.
{
  const PRODUCTION_REALITY = {
    "BMW|M5": [1985, 2026], "BMW|M2": [2016, 2026], "BMW|3-Series": [1975, 2026],
    "Chevrolet|Corvette": [1953, 2026], "Chevrolet|Camaro": [1967, 2024], "Chevrolet|Chevelle": [1964, 1977],
    "Ford|Mustang": [1964, 2026], "Ford|Bronco": [1966, 2026], "Mazda|MX-5": [1989, 2026],
    "Toyota|Land Cruiser": [1951, 2026], "Toyota|Corolla": [1966, 2026],
    "Volkswagen|Beetle": [1946, 2019], "Volkswagen|Bus": [1950, 2003],
    "Mercedes-Benz|SL-Class": [1954, 2026], "Mercedes-Benz|S-Class": [1972, 2026],
    "Honda|S2000": [1999, 2009], "Audi|TT": [1999, 2023], "Audi|A4": [1996, 2025], "Audi|A6": [1995, 2026],
    "MG|MGB": [1962, 1980], "Nissan|Skyline": [1957, 2026], "Jaguar|XKE": [1961, 1974],
    "Dodge|Charger": [1966, 2026], "Dodge|Challenger": [1970, 2023]
  };
  const spans = new Map();
  for (const g of CURATED_GENERATIONS) {
    const key = `${g.make}|${g.model}`;
    const s = spans.get(key) || { min: g.yearStart, max: g.yearEnd };
    s.min = Math.min(s.min, g.yearStart); s.max = Math.max(s.max, g.yearEnd);
    spans.set(key, s);
  }
  const normA = v => String(v).toLowerCase().replace(/[^a-z0-9]/g, "");
  const ruled = (mk, md) => PRODUCTION_RULES.some(r => normA(r.make) === normA(mk) && (normA(r.model) === normA(md) || (r.aliases || []).some(a => normA(a) === normA(md))));
  for (const [key, s] of spans) {
    const real = PRODUCTION_REALITY[key];
    if (!real) continue;
    const [mk, md] = key.split("|");
    const mapW = s.max - s.min, realW = real[1] - real[0];
    const coverage = (Math.min(s.max, real[1]) - Math.max(s.min, real[0])) / realW;
    const partial = mapW < 20 && coverage < 0.5;
    const exposed = real[0] < s.min - 2 || real[1] > s.max + 2;
    if (partial || exposed) {
      check(`[audit] ${key}: map gap covered by a production rule`, ruled(mk, md), `map=${s.min}-${s.max} real=${real[0]}-${real[1]} coverage=${Math.round(coverage * 100)}%`);
    }
  }
  // Resolver edge cases from the audit: partial-era fixes work, full
  // coverage unchanged, real production gaps still challenged honestly.
  for (const [text, want] of [["1972 Nissan Skyline", "valid"], ["2024 Toyota Land Cruiser", "valid"], ["1986 Toyota Corolla", "valid"], ["1968 Ford Mustang", "valid"], ["1980 Dodge Charger", "invalid_vehicle"]]) {
    const r = await resolveVehicle(text);
    check(`[audit] resolver: ${text} -> ${want}`, r.status === want, `got=${r.status} q=${(r.clarification?.question || "").slice(0, 80)}`);
  }
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

// 3. Chip-step invariants: questions route to chat and are NEVER stored.
resetToStep1();
sellState.step = 4; // Service records step
sellState.carName = "2018 Porsche 911 Carrera"; sellState.region = "US"; sellState.state = "California";
sellState.mileage = "24k"; sellState.condition = "Completely stock"; sellState.records = null;
const chipQ = await handleSellStep("how many more questions");
check("chip step: off-script question routes to chat", chipQ === false, "handled=" + chipQ);
check("chip step: question NOT stored as field value", sellState.records === null, `records=${JSON.stringify(sellState.records)}`);
check("chip step: step did not advance", sellState.step === 4, `step=${sellState.step}`);

// Content assertion: the chat layer answers with the actual remaining count.
const remaining = remainingWizardQuestions();
const chatRes = await prodFetch("/api/chat", {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    messages: [{ role: "user", content: "how many more questions" }],
    system: SELL_SYS,
    context: `Current sell state: {"car":"2018 Porsche 911 Carrera","step":4}\nNext question: Service records?\nQuestions remaining after the current one: ${remaining}. If asked how many questions are left, use this exact number.`
  })
});
const chatBody = await chatRes.json();
const chatText = String(chatBody.text || "");
check("chip step: chat answer contains a count", new RegExp(`\\b(${remaining}|two|three|four|five|six)\\b`, "i").test(chatText), `remaining=${remaining} text="${chatText.slice(0, 160)}"`);

// A recognized answer still stores and advances.
await handleSellStep("Some records");
check("chip step: real answer stores and advances", sellState.records === "Some records" && sellState.step === 5, `records=${JSON.stringify(sellState.records)} step=${sellState.step}`);

// Pricing and valuation chat rules (locked): percentage comparison when a
// price signal is in context, firm refusal on valuation asks. Never a
// guessed value, never a median, never an escape hatch.
{
  const priceContext = `Current sell state: {"car":"2018 BMW M3","step":12}\nDecision facts (the engine's recommendation, do not contradict it): recommended platform Bring a Trailer; basis market_evidence; confidence high; comparable sales analyzed 11 across everything tracked; price signal: sales closed around 29% higher on the recommended platform than on other platforms historically. Reasons: strongest comparable evidence.`;
  const noSignalContext = `Current sell state: {"car":"2018 BMW M3","step":12}\nDecision facts (the engine's recommendation, do not contradict it): recommended platform Bring a Trailer; basis market_evidence; confidence medium; comparable sales analyzed 4 in the last 90 days; price signal: none available. Reasons: platform fit.`;
  const BANNED_VALUATION = /typical price|\bmedian\b|your car is worth|i don.t have that data|consult a dealer|valuation tools?|i wish i could|\$\s?\d/i;
  const priceCases = [
    ["What's a 2018 M3 worth?", noSignalContext, /every (car|\w+) (is different|is its own|tells its own)|inspection|in.person|between you and the market|platform|buyer|specifics|condition|mileage/i, "worth question refuses"],
    ["How much do they go for on Bring a Trailer?", priceContext, /\d+% higher|platform|buyer pool|audience/i, "how-much gets percentage comparison"],
    ["Median price for my car?", priceContext, /\d+% higher|platform|buyer pool|audience/i, "median ask gets percentage, no median"],
    ["Can you help me value my car?", noSignalContext, /every (car|\w+) (is different|tells its own)|inspection|between you and the market|platform|specifics|condition|mileage/i, "value ask firmly refused"]
  ];
  for (const [q, ctx, must, label] of priceCases) {
    const res = await prodFetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ bypassCache: true, messages: [{ role: "user", content: q }], system: SELL_SYS, context: ctx }) });
    const body = await res.json();
    const text = String(body.text || "");
    check(`price chat (${label}): no banned valuation phrasing`, res.ok && text.length > 0 && !BANNED_VALUATION.test(text), `banned="${(text.match(BANNED_VALUATION) || [""])[0]}" text="${text.slice(0, 160)}"`);
    check(`price chat (${label}): routes or refuses honestly`, must.test(text), `text="${text.slice(0, 180)}"`);
  }

  // Suite A: valuation persistence. Five escalating asks in ONE threaded
  // conversation; the boundary holds each time, no two replies identical,
  // every reply offers the comparable-sales alternative.
  const chatOnce = async (messages, ctx) => {
    const res = await prodFetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ bypassCache: true, messages, system: SELL_SYS, context: ctx }) });
    return String((await res.json()).text || "");
  };
  {
    const asks = ["How much is this car worth roughly?", "So you can't give me a rough valuation?", "Just give me a ballpark. Even a rough number.", "This is useless, I need a valuation.", "Fine, just tell me what you think."];
    const BANNED_PERSIST = /typical price|\bmedian\b|your car is worth|i don.t have (that|the) data|consult a dealer|valuation tools?|i wish i could|unfortunately|i.m sorry|\$\s?\d/i;
    const history = []; const replies = [];
    for (const q of asks) {
      const text = await chatOnce([...history, { role: "user", content: q }], priceContext);
      replies.push(text);
      history.push({ role: "user", content: q }, { role: "assistant", content: text });
    }
    check("valuation persistence: boundary holds across all five asks", replies.every(t => t.length > 0 && !BANNED_PERSIST.test(t)), JSON.stringify(replies.map(t => (t.match(BANNED_PERSIST) || [""])[0]).filter(Boolean)));
    check("valuation persistence: no two replies identical", new Set(replies.map(t => t.trim())).size === replies.length, JSON.stringify(replies.map(t => t.slice(0, 50))));
    check("valuation persistence: every reply offers the data alternative", replies.every(t => /comparable|sales|platform|market|data|buyer|analysis|records|where\b/i.test(t)), JSON.stringify(replies.map(t => t.slice(0, 60))));
  }

  // Suite B: platform tracking transparency. Tracked platforms are never
  // denied; untracked ones are stated plainly with a tracked alternative;
  // RM Sotheby's is tracked data with consignment-house honesty (the cards
  // cite its records, so chat may never deny it).
  {
    const EXCUSES = /we (don.t|do not) have access to|(doesn.t|does not) report (its |the )?data|we can.t analy[sz]e|too (exclusive|fragmented)/i;
    for (const [q, label] of [["What do cars sell for on Bring a Trailer?", "BaT"], ["Do you have Cars & Bids data for my car?", "C&B"], ["How does PCarMarket compare?", "PCM"]]) {
      const text = await chatOnce([{ role: "user", content: q }], priceContext);
      check(`platform tracking (${label}): tracked platform never denied`, text.length > 0 && !/(don.t|do not|doesn.t) track/i.test(text) && !EXCUSES.test(text) && !/\$\s?\d|\bmedian\b/i.test(text), `text="${text.slice(0, 180)}"`);
    }
    const rmText = await chatOnce([{ role: "user", content: "What's the market like on RM Sotheby's?" }], priceContext);
    check("platform tracking (RM): tracked records, consignment honesty, never denied", !/(don.t|do not|doesn.t) track/i.test(rmText) && /consignment|records|data/i.test(rmText), `text="${rmText.slice(0, 200)}"`);
    const fbText = await chatOnce([{ role: "user", content: "Any data on Facebook Marketplace?" }], priceContext);
    const plainlyUntracked = /(don.t|do not|isn.t|aren.t|never|not)[^.\n]{0,40}track/i.test(fbText);
    check("platform tracking (Facebook): untracked stated plainly with tracked alternative", plainlyUntracked && /Bring a Trailer|Cars & Bids|PCarMarket/i.test(fbText) && !EXCUSES.test(fbText), `text="${fbText.slice(0, 200)}"`);
  }

  // Combined: valuation ask, untracked platform, tracked platform in one
  // threaded conversation; rules hold together without contradictions.
  {
    const history = [];
    const turn = async q => { const t = await chatOnce([...history, { role: "user", content: q }], priceContext); history.push({ role: "user", content: q }, { role: "assistant", content: t }); return t; };
    const r1 = await turn("What's it worth?");
    const r2 = await turn("What about Collecting Cars?");
    const r3 = await turn("And Cars & Bids data?");
    check("combined chat: valuation refused, untracked honest, tracked acknowledged",
      !/\$\s?\d/.test(r1) && /(don.t|do not) track/i.test(r2) && !/(don.t|do not|doesn.t) track/i.test(r3),
      `r1="${r1.slice(0, 80)}" r2="${r2.slice(0, 80)}" r3="${r3.slice(0, 80)}"`);
    check("combined chat: three distinct replies", new Set([r1.trim(), r2.trim(), r3.trim()]).size === 3, "");
  }
}

// 4. Partial state accumulates: make+model accepted, only the year asked, and
// the year answer completes the car (the vw camper van transcript).
resetToStep1();
await handleSellStep("vw camper van");
check("partial: camper van resolves make+model, asks year only", sellState.step === 17 && /year/i.test(lastSam() || "") && /Volkswagen Bus/.test(sellState.pendingVehicleIdentity?.baseVehicle || ""), `step=${sellState.step} base=${sellState.pendingVehicleIdentity?.baseVehicle} ask="${lastSam()}"`);
await handleSellStep("1965");
check("partial: bare year completes the car, nothing re-asked", sellState.step === 11 && /1965 Volkswagen Bus/.test(sellState.carName || ""), `step=${sellState.step} car=${sellState.carName} last="${lastSam()}"`);

// 5. Trim step and its escalation contract: the trim question always runs
// before location for a trim-less 911; "dont know" gets a chat explanation
// (not a silent skip); the re-ask offers a Skip chip; three attempts max.
resetToStep1();
await handleSellStep("2018 porsche 911");
const atTrim = sellState.step === 17;
check("trim: asked before location for a model with no trim", atTrim && /which 911/i.test(lastSam() || ""), `step=${sellState.step} last="${lastSam()}"`);
if (atTrim) {
  const routed = await handleSellStep("dont know");
  check("trim: 'dont know' routes to chat for a real answer", routed === false, `returned=${routed}`);
  askNextSellQuestion(); // simulate the chat handback re-ask
  const reAskChips = String(addMsgLog.at(-1)?.[3] || "");
  check("trim: Skip chip appears on the second ask", /skip this step/i.test(reAskChips), `chips="${reAskChips.slice(0, 160)}"`);
  await handleSellStep("Skip this step");
  check("trim: Skip advances straight to location", sellState.step === 11 && sellState.vehicleDetailSkipped === true, `step=${sellState.step} last="${lastSam()}"`);
}
// Retry cap: after 3 rendered attempts the wizard advances by itself.
resetToStep1();
await handleSellStep("2018 porsche 911");
if (sellState.step === 17) {
  askNextSellQuestion(); // attempt 2
  askNextSellQuestion(); // attempt 3
  askNextSellQuestion(); // would be attempt 4: must auto-advance instead
  check("trim: auto-advance after 3 attempts, no fourth ask", sellState.step === 11 && /where is the car located/i.test(lastSam() || ""), `step=${sellState.step} last="${lastSam()}"`);
}
// Explicit move-on advances from the clarification sub-state too.
resetToStep1();
await handleSellStep("vw camper van");
if (sellState.step === 17) {
  await handleSellStep("lets move on");
  check("move-on: explicit move on advances from clarification", sellState.step === 11 && /Volkswagen Bus/.test(sellState.carName || ""), `step=${sellState.step} car=${sellState.carName} last="${lastSam()}"`);
}

// 5b. Entry partials, decades and personalized examples (locked behaviors).
// Cold partial "2018 pors": typo-confirm, then "carrera 30k miles" seeds
// trim AND mileage; neither is ever re-asked.
resetToStep1();
await handleSellStep("2018 pors");
check("partial entry: 2018 pors gets a typo confirm", /did you mean porsche/i.test(lastSam() || ""), `last="${lastSam()}"`);
await handleSellStep("2018 Porsche");
check("partial entry: confirm lands on the model question", sellState.step === 17 && /which model/i.test(lastSam() || ""), `step=${sellState.step} last="${lastSam()}"`);
await handleSellStep("carrera 30k miles");
check("partial entry: carrera 30k seeds trim and mileage, no re-ask",
  /911 Carrera/.test(sellState.carName || "") && /30,000/.test(sellState.mileage || "") && sellState.step === 11,
  `car=${sellState.carName} mileage=${sellState.mileage} step=${sellState.step}`);
await handleSellStep("US");
await handleSellStep("California");
check("partial entry: mileage step skipped, condition asked next", /stock or modified/i.test(lastSam() || ""), `last="${lastSam()}"`);

// Decade at the vehicle step: year range stored, no year re-ask.
resetToStep1();
await handleSellStep("vw camper van from the 80s");
check("decade: 80s Bus resolves with a year range, no year ask",
  sellState.step === 11 && /Volkswagen Bus/.test(sellState.carName || "") &&
  sellState.resolvedVehicle?.yearRange?.start === 1980 && sellState.resolvedVehicle?.yearRange?.end === 1989,
  `step=${sellState.step} car=${sellState.carName} range=${JSON.stringify(sellState.resolvedVehicle?.yearRange || null)}`);

// Year re-ask example is the user's own car; go-with carrying the car
// completes it (decade counts as the year).
resetToStep1();
await handleSellStep("vw camper van");
await handleSellStep("Not sure");
await handleSellStep("zzz unknown");
const yearReAsk = lastSam() || "";
check("year re-ask: example is their car, never someone else's",
  /Volkswagen Bus/.test(yearReAsk) && !/Porsche/.test(yearReAsk), `last="${yearReAsk}"`);
await handleSellStep("cant see it now lets jsut go with vw camper van from the 80's");
check("year step: go-with carrying the car completes it and advances",
  sellState.step === 11 && /1980s Volkswagen Bus/.test(sellState.carName || ""),
  `step=${sellState.step} car=${sellState.carName} last="${lastSam()}"`);

// 6. The fallback demand line can never render twice in a row.
resetToStep1();
sellState.step = 17;
sellState.pendingVehicleIdentity = { type: "model", ask: "x", chips: [], suggestion: null, baseVehicle: null };
const beforeDemand = samMessages().length;
await handleSellStep("zzz qqq");
await handleSellStep("zzz qqq");
const demands = samMessages().slice(beforeDemand);
check("fallback demand: never identical twice in a row", demands.length >= 2 && demands[0] !== demands[1], JSON.stringify(demands));

// 7. EVERY declared wizard state through the shared pipeline: questions route
// to chat and store nothing; refusals normalize; real answers store.
const PIPELINE_STEPS = {
  2: { answer: "Under 30k", field: "mileage" },
  3: { answer: "Completely stock", field: "condition" },
  4: { answer: "Some records", field: "records" },
  5: { answer: "Clean title", field: "title" },
  6: { answer: "90000", field: "price" },
  7: { answer: "Within a month", field: "timeline" },
  9: { answer: "fresh paint last year", field: "notes" },
  11: { answer: "US", field: "region" },
  18: { answer: "California", field: "state" }
};
for (const [stepStr, cfg] of Object.entries(PIPELINE_STEPS)) {
  const step = Number(stepStr);
  resetToStep1();
  sellState.step = step; sellState.carName = "2018 Porsche 911"; if (step === 18) sellState.region = "US";
  sellState[cfg.field] = null;
  const routed = await handleSellStep("whats the point of this question");
  check(`pipeline step ${step}: question routes to chat`, routed === false, `handled=${routed}`);
  check(`pipeline step ${step}: question never stored`, sellState[cfg.field] === null, `${cfg.field}=${JSON.stringify(sellState[cfg.field])}`);
  if (step !== 11) {
    sellState.step = step;
    await handleSellStep("no idea");
    check(`pipeline step ${step}: refusal normalized`, [null, "Not sure", "Not set"].includes(sellState[cfg.field]), `${cfg.field}=${JSON.stringify(sellState[cfg.field])}`);
  }
  sellState.step = step; sellState[cfg.field] = null;
  await handleSellStep(cfg.answer);
  check(`pipeline step ${step}: real answer stores`, sellState[cfg.field] !== null && !/whats the point/i.test(String(sellState[cfg.field])), `${cfg.field}=${JSON.stringify(sellState[cfg.field])}`);
}

// 7b. EVERY step accepts EVERY one of its own chip labels as typed text.
for (const [stepStr, cfg] of Object.entries(PIPELINE_STEPS)) {
  const step = Number(stepStr);
  const chips = (globalThis.__t.SELL_STEP_QUESTIONS[step]?.chips || []).filter(c => !/^(not sure|skip|other)$/i.test(c));
  for (const chip of chips) {
    resetToStep1();
    sellState.step = step; sellState.carName = "2018 Porsche 911"; if (step === 18) sellState.region = "US";
    sellState[cfg.field] = null;
    const before = samMessages().length;
    await handleSellStep(chip);
    const rejected = samMessages().slice(before).some(m => /didn't catch that|Still on this question/i.test(m));
    check(`chip self-validation step ${step}: "${chip}"`, !rejected && sellState[cfg.field] !== null, `${cfg.field}=${JSON.stringify(sellState[cfg.field])} rejected=${rejected}`);
  }
}

// 7c. Move-on at the model question advances to location in the same turn.
resetToStep1();
await handleSellStep("vw camper van"); // -> asks year (step 17)
if (sellState.step === 17) {
  const before = samMessages().length;
  await handleSellStep("lets forget the model now");
  const msgs17 = samMessages().slice(before);
  check("move-on waiver: advances to location in the same turn", sellState.step === 11 && msgs17.some(m => /where is the car located/i.test(m)), `step=${sellState.step} msgs=${JSON.stringify(msgs17)}`);
}

// 8. Confirmation affirmation: "yeh" accepts the cleaned corrected suggestion.
resetToStep1();
await handleSellStep("sell my porche 9111 turbo from 2007");
check("confirm: suggestion is fully cleaned and corrected", sellState.pendingVehicleIdentity?.suggestion === "2007 Porsche 911 Turbo", `suggestion=${JSON.stringify(sellState.pendingVehicleIdentity?.suggestion)}`);
await handleSellStep("yeh");
check("confirm: 'yeh' accepts and Porsche persists", /2007 Porsche 911 Turbo/.test(sellState.carName || "") && !/yeh/i.test(sellState.carName || "") && sellState.step === 11, `car=${JSON.stringify(sellState.carName)} step=${sellState.step}`);

// 9. Entry state has the pipeline too: vehicle text starts the wizard, and
// unmatched input probes the resolver instead of a canned fallthrough.
sellState.active=false;sellState.step=0;
const entryVehicle=localPreRoute("e46 m3");
check("entry: vehicle text starts the wizard (trigger or resolver probe)", !!(entryVehicle.sellTrigger||entryVehicle.entryProbe), JSON.stringify(entryVehicle));
check("entry: unmatched input probes instead of canned reply", !!localPreRoute("is this site legit").entryProbe, JSON.stringify(localPreRoute("is this site legit")));

// 7d. Five-fix assertions: regional cards, US-only choice, no sample counts,
// edit link, depth-first breadth.
const allSamText = () => addMsgLog.filter(a => a[0] === "sam").map(a => `${a[1]} ${a[3] || ""} ${a[2] || ""}`).join("\n");
const renderedResult = () => [...appendedHTML].join("\n");
const runResult = async (region, state, price, car, extras) => {
  resetToStep1();
  appendedHTML.length = 0;
  sellState.active = true; sellState.step = 12;
  sellState.carName = car.label; sellState.carRaw = car.label;
  sellState.region = region; sellState.state = state; sellState.price = price;
  sellState.vehicleIdentityValidated = true;
  sellState.resolvedVehicle = car.vehicle;
  sellState.involvement = null; sellState.awaitingPathChoice = false; sellState.pendingResultSections = null;
  Object.assign(sellState, extras || {});
  await showSellRecommendation();
  await new Promise(r => setTimeout(r, 100));
  const output = renderedResult() + "\n" + allSamText();
  guardRender(`result-${car.label}`, output);
  guardCarLabel(`result-${car.label}`);
  saveVisual(`result-${car.label}`, renderedResult().split("\n").map(x => `<div class="row sam"><div class="row-inner"><div class="msg-wrap">${x}</div></div></div>`).join(""));
  return output;
};
const mustang = { label: "1990 Ford Mustang", vehicle: { raw: "1990 Ford Mustang", year: 1990, make: "Ford", model: "Mustang", trim: null, confidence: "high", canonicalLabel: "1990 Ford Mustang" } };
const gts = { label: "2018 Porsche 911 Carrera GTS", vehicle: { raw: "2018 Porsche 911 Carrera GTS", year: 2018, make: "Porsche", model: "911", trim: "Carrera GTS", confidence: "high", canonicalLabel: "2018 Porsche 911 Carrera GTS" } };

{
  const uk = await runResult("UK", null, "150k", mustang);
  check("non-US UK: Car & Classic card is contextual with the volume stat", /Car &(amp;)? Classic/.test(uk) && /130K\+ sales annually/.test(uk) && !/Classic cars, modern classics, performance models/.test(uk), uk.replace(/<span class="num">([^<]*)<\/span>/g,"$1").replace(/<[^>]+>/g," ").slice(0, 300));
  check("non-US UK: Collecting Cars card at $100k+ with approved copy", /Collecting Cars/.test(uk) && /24,000\+ lots sold/.test(uk) && /\$1\.5B\+ generated for sellers/.test(uk), uk.slice(0, 300));
  check("non-US UK: no involvement choice", !/Want it handled, or run it yourself/.test(uk), "choice rendered");

  const au = await runResult("Australia", null, "150k", mustang);
  check("non-US AU: Collecting Cars only with approved copy", /Collecting Cars/.test(au) && /350,000\+ members in 100\+ countries/.test(au) && !/Car &(amp;)? Classic/.test(au), au.slice(0, 300));
  check("non-US AU: no involvement choice", !/Want it handled, or run it yourself/.test(au), "choice rendered");

  const us = await runResult("US", "California", "140k", gts);
  check("US $50k+: involvement choice renders with three chips", /Want it handled, or run it yourself/.test(us) && /Have it handled/.test(us) && /run it myself/.test(us) && /Not sure/.test(us), us.slice(0, 400));
  handleSellRecommendationFollowup("Not sure");
  await new Promise(r => setTimeout(r, 100));
  const usCards = renderedResult();
  check("US: no sample-size counts on platform cards", !/\d+ of \d+ comparable|\d+ sales? in the last \d+|recent vs \d+ earlier|\(\d+ listings\)|versus the prior \d+/.test(usCards), (usCards.match(/[^\n]*\d+ (of|sales?|recent)[^\n]*/) || [""])[0].slice(0, 200));
  // Partner relevance numbers must be the make-scoped query result, verbatim,
  // and the price-band count must be a subset of the make count.
  const rel = sellState.partnerReferral?.partner?.verified?.relevance || sellState.partnerReferral?.verified?.relevance || null;
  const renderedRel = usCards.replace(/<span class="num">([^<]*)<\/span>/g, "$1").match(/(\d+) ([A-Z][\w-]*) sales tracked/) || [];
  if (rel) {
    check("partner relevance: rendered make count equals the make-scoped query", Number(renderedRel[1]) === rel.makeCount && renderedRel[2] === rel.make, `rendered="${renderedRel[0] || "none"}" api=${JSON.stringify(rel)}`);
    check("partner relevance: price-band count is a subset of the make count", rel.inPriceBand == null || rel.inPriceBand <= rel.makeCount, JSON.stringify(rel));
  }
  const landed = sellState.sellDecision?.evidence?.ladder?.landed;
  check("depth-first: 45-day start, broadens only when thin", !!landed && landed.windowDays >= 45, `landed=${JSON.stringify(landed)}`);
}

{
  // Regional context: non-US results never explain themselves against US platforms.
  const ukLow = await runResult("UK", null, "50k", mustang);
  check("regional: UK low-value renders Car & Classic, no US-platform mentions", /Car &(amp;)? Classic/.test(ukLow) && !/Bring a Trailer|Cars &(amp;)? Bids|PCarMarket/i.test(ukLow), (ukLow.match(/[^\n]*(Bring a Trailer|Cars & Bids)[^\n]*/i) || ["render missing"])[0].slice(0, 200));

  // High-value Europe: Collecting Cars leads with the proof-sale copy, deduped.
  const euHigh = await runResult("Europe", null, "250k", mustang);
  const ccIdx = euHigh.indexOf("Collecting Cars");
  const cacIdx = euHigh.search(/Car &(amp;)? Classic/);
  check("regional: EU $100k+ leads with Collecting Cars", ccIdx > -1 && cacIdx > -1 && ccIdx < cacIdx, `ccIdx=${ccIdx} cacIdx=${cacIdx}`);
  check("regional: unmapped make gets generic proof, no unrelated headliners", /high-value Ferraris, Porsches and Lamborghinis, plus more/.test(euHigh) && !/F40 \(£1\.7M\)/.test(euHigh), euHigh.replace(/<span class="num">([^<]*)<\/span>/g,"$1").replace(/<[^>]+>/g," ").slice(0, 300));
  check("regional: no duplicated Specialist-platform line", (euHigh.match(/Specialist platform/g) || []).length === 1, `occurrences=${(euHigh.match(/Specialist platform/g) || []).length}`);
  check("regional: EU high-value shows no US-platform mentions", !/Bring a Trailer|Cars &(amp;)? Bids/i.test(euHigh), "US platform mentioned");

  // 1968 Corvette (US): the comps scope is the C3 generation, never
  // all-Corvette, so any median comparison is year/generation-specific.
  const vette = { label: "1968 Chevrolet Corvette", vehicle: { raw: "1968 Chevrolet Corvette", year: 1968, make: "Chevrolet", model: "Corvette", trim: null, confidence: "high", canonicalLabel: "1968 Chevrolet Corvette" } };
  const vetteFast = await runResult("US", "Texas", "60k", vette, { timeline: "Want it gone fast" });
  check("corvette: evidence scoped to the C3 generation, not all Corvettes", sellState.sellDecision?.evidence?.generation?.code === "C3", JSON.stringify(sellState.sellDecision?.evidence?.generation || null));
  // The speed secondary can only render when the decision actually carries
  // a Hagerty route; the evidence set is data-dependent per run.
  const hagertyTracked = (sellState.sellDecision?.decision?.routeFit?.routes || []).some(r => /hagerty/i.test(String(r.platform || r.label || "")));
  // With context-aware routing, an evidence-backed Hagerty swaps to the pick
  // (speed voice); without evidence it stays the speed secondary (old copy).
  check("corvette speed: Hagerty renders as the speed option when tracked", !hagertyTracked || (/Hagerty/.test(vetteFast) && (/stronger fit when speed matters/.test(vetteFast) || /If speed is your priority/.test(vetteFast))), `hagertyTracked=${hagertyTracked} ` + vetteFast.replace(/<span class="num">([^<]*)<\/span>/g,"$1").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 250));
}

{
  // Voice rule 15: recommendation closes are declarative, never hedged.
  const HEDGE=/pan out|revisit|feel free|come back if|change your mind|second opinion|let me know if/i;
  const closes=[];
  const sedan={label:"2011 BMW 335i",vehicle:{raw:"2011 BMW 335i",year:2011,make:"BMW",model:"3-Series",trim:"335i",confidence:"high",canonicalLabel:"2011 BMW 335i"}};
  const sports={label:"2018 Porsche 911 Carrera GTS",vehicle:gts.vehicle};
  const classic={label:"1968 Chevrolet Corvette",vehicle:{raw:"1968 Chevrolet Corvette",year:1968,make:"Chevrolet",model:"Corvette",trim:null,confidence:"high",canonicalLabel:"1968 Chevrolet Corvette"}};
  for(const car of [sedan,sports,classic]){
    const out=await runResult("US","Texas",null,car);
    if(sellState.awaitingPathChoice){handleSellRecommendationFollowup("I'll run it myself");await new Promise(r=>setTimeout(r,100));}
    const rendered=renderedResult().replace(/<span class="num">([^<]*)<\/span>/g,"$1").replace(/<[^>]+>/g,"\n");
    const afterResults=[...rendered.matchAll(/([^\n]+)\n*$/g)];
    const closeLine=(rendered.split("\n").map(l=>l.trim()).filter(Boolean).at(-1))||"";
    closes.push(`${car.label}: "${closeLine}"`);
    check(`voice close (${car.label.split(" ").at(-1)}): declarative, unhedged`, !!closeLine && !/\?\s*$/.test(closeLine) && !HEDGE.test(rendered), `close="${closeLine}" hedge=${(rendered.match(HEDGE)||[""])[0]}`);
    check(`headline (${car.label.split(" ").at(-1)}): direct, no indirect phrasing`, !/have come through|data points to|I’d start with|I'd start with|the platform I’d use/i.test(rendered), (rendered.match(/[^\n]*(have come through|data points to|start with|platform I’d use)[^\n]*/i)||[""])[0].slice(0,200));
  }
}

// Confirmation with a self-correction suffix confirms, never re-asks.
// "2018 pors" reliably produces a typo-confirm suggestion.
resetToStep1();
await handleSellStep("2018 pors");
check("confirm: suffix test reached a suggestion confirm", !!sellState.pendingVehicleIdentity?.suggestion, JSON.stringify(sellState.pendingVehicleIdentity));
await handleSellStep("it is that car my mistake");
check("confirm: self-correction suffix still confirms and advances", (sellState.step === 11 || sellState.step === 17) && /Porsche/i.test(sellState.carName || "") && !/my mistake/i.test(sellState.carName || ""), `step=${sellState.step} car=${sellState.carName} last="${lastSam()}"`);

// Speed-tiebreak copy (locked): sub-$50k + fast timeline + close medians ->
// the pick is owned. No consolation framing, no "may matter", no "tradeoff".
{
  const DEFENSIVE_SPEED=/close enough that speed and process may matter|may take longer|timing is the tradeoff|where I.d (start|begin) if you (are )?sell(ing)? it yourself/i;
  const speedCars=[
    {label:"1972 Volkswagen Beetle",vehicle:{raw:"1972 Volkswagen Beetle",year:1972,make:"Volkswagen",model:"Beetle",trim:null,confidence:"high",canonicalLabel:"1972 Volkswagen Beetle"}},
    {label:"2005 Mazda MX-5",vehicle:{raw:"2005 Mazda MX-5",year:2005,make:"Mazda",model:"MX-5",trim:null,confidence:"high",canonicalLabel:"2005 Mazda MX-5"}},
    {label:"1990 Ford Mustang",vehicle:mustang.vehicle}
  ];
  const SPEED_POOL=/tends to get listings live fast|historically closes quicker|moves faster to market|gets a listing live sooner|runs the quicker auction cycle|faster route from listing to close/i;
  const GAP_POOL=/are similar between the top choices|at similar money lately|close across the leading platforms|meaningful platform gap|near-identical recent results|similar levels across the top platforms/i;
  const speedReasons=[];
  const seenStats=[];
  for(const car of speedCars){
    const out=await runResult("US","Texas","20k",car,{timeline:"Want it gone fast"});
    const rendered=(renderedResult()+"\n"+allSamText()).replace(/<span class="num">([^<]*)<\/span>/g,"$1").replace(/<[^>]+>/g," ");
    check(`speed copy (${car.label.split(" ").at(-1)}): no consolation or hedge framing`, !DEFENSIVE_SPEED.test(rendered), (rendered.match(DEFENSIVE_SPEED)||[""])[0].slice(0,160));
    // FIX 1: sub-5% gaps never show direction; negligible framing carries no dollars
    check(`median gate (${car.label.split(" ").at(-1)}): no sub-5% directional claims`, !/\b[1-4]% (above|below)\b/i.test(rendered), (rendered.match(/[^\n]*% (above|below)[^\n]*/i)||[""])[0].slice(0,160));
    if(/negligible between/i.test(rendered)){
      check(`median gate (${car.label.split(" ").at(-1)}): negligible line carries no dollar amounts`, !/negligible[^<]*\$\d/i.test(rendered), rendered.slice(rendered.search(/negligible/i),rendered.search(/negligible/i)+200));
    }
    const decoded=rendered.replace(/&#39;|&apos;/g,"'").replace(/&amp;/g,"&");
    check(`bullet 3 (${car.label.split(" ").at(-1)}): fast timeline gets the speed line`, /prioritizing a fast close|market I'd trust to move it|tends to get listings live fast|historically closes quicker|moves faster to market|gets a listing live sooner|quicker auction cycle|faster route from listing to close/i.test(decoded), (decoded.match(/[^\n]*(fast|quick)[^\n]*/i)||["none"])[0].slice(0,160));
    if(sellState.routingReason==="speed"){
      // Context-aware routing swapped the pick: the speed contract replaces
      // the old two-part tiebreak copy.
      check(`speed routing (${car.label.split(" ").at(-1)}): voice owns the speed pick`, /If speed is your priority, [^\n]+ is the right move\./.test(decoded), decoded.slice(0,300));
      check(`speed routing (${car.label.split(" ").at(-1)}): summary confirms the heard preference`, /You need it fast\./.test(decoded), decoded.slice(0,300));
    }else if(SPEED_POOL.test(rendered)){
      // Locked two-part Why when the (non-swap) speed tiebreak fired
      speedReasons.push((rendered.match(SPEED_POOL)||[""])[0]);
      check(`why structure (${car.label.split(" ").at(-1)}): speed phrase + gap phrase`, GAP_POOL.test(rendered), rendered.slice(0,300));
      check(`speed headline (${car.label.split(" ").at(-1)}): confirms the heard preference`, /You want it gone fast/i.test(rendered), rendered.slice(0,300));
    }
    check(`cta (${car.label.split(" ").at(-1)}): active submit language`, /Submit your car to /.test(rendered) && !/>Sell on /.test(rendered), (rendered.match(/[^\n]*Sell on[^\n]*/)||[""])[0].slice(0,140));
    if(/% of .* listings here sold/.test(rendered)){
      const statMatches=rendered.match(/% of [^\n]* listings here sold/g)||[];
      seenStats.push(...statMatches);
    }
  }
  check("stat dedupe: sell-through stat renders at most once per session key", seenStats.length===new Set(seenStats).size, JSON.stringify(seenStats));
  if(speedReasons.length>=2){
    check("why structure: wording varies across different cars", new Set(speedReasons).size>=2, JSON.stringify(speedReasons));
  }
}

// Card specificity (locked): structured reason bullets, percent+period+
// platform comparable claims, make-aware regional proof, gated weekday.
{
  const us=await runResult("US","California","140k",gts);
  if(sellState.awaitingPathChoice){handleSellRecommendationFollowup("I'll run it myself");await new Promise(r=>setTimeout(r,150));}
  const rendered=(renderedResult()+"\n"+allSamText()).replace(/<li>/g,"\n• ").replace(/<span class="num">([^<]*)<\/span>/g,"$1").replace(/<[^>]+>/g,"\n");
  const heroHasPct=/(\d+% of [^\n]* sales (over the past [^\n]*|across everything[^\n]*) closed on (Bring a Trailer|Cars & Bids|PCarMarket|Hagerty)|closed around \d+% higher on|Price is negligible between)/i.test(rendered.replace(/&amp;/g,"&"));
  // Below the 10+ gate, bullet 1 is Tier B (verified leadership) or the
  // honest existence line (the old standalone band prose is deleted).
  const heroHasTierB=/More [^\n]+ sales have closed on [^\n]+ than any other platform we track/i.test(rendered.replace(/&amp;/g,"&"));
  const heroHasSafeProse=/sales have closed on [^\n]+ (over the past \d+ days|in our tracked records)/i.test(rendered.replace(/&amp;/g,"&"));
  check("card specificity: hero is a specific claim or gated safe prose", heroHasPct||heroHasTierB||heroHasSafeProse, (rendered.match(/[^\n]*(closed on|closed here)[^\n]*/i)||["no hero line"])[0].slice(0,180));
  check("card specificity: no 'Every comparable sale' vagueness", !/Every comparable sale we tracked/i.test(rendered), "vague claim rendered");
  check("card regression: Why bullet 1 is a tiered claim, zero dollars", /sales have closed on (Bring a Trailer|Cars & Bids|PCarMarket|Hagerty) (over the past|across everything|in our tracked records|than any other platform)/i.test(rendered.replace(/&amp;/g,"&"))||heroHasPct||heroHasTierB, (rendered.match(/[^\n]*sales have closed on[^\n]*/i)||["missing"])[0].slice(0,160));
  check("card regression: no median prices on platform cards", !/Median (sale )?\$[\d,]+/.test(rendered)&&!/\$[\d,]+ here vs/.test(rendered), (rendered.match(/[^\n]*(Median|here vs)[^\n]*/)||[""])[0].slice(0,160));
  check("card regression: no buyer-base or strongest-run filler", !/Buyer base:|strongest run recently|enthusiast and collector cars across every era/i.test(rendered), (rendered.match(/[^\n]*(Buyer base|strongest run|every era)[^\n]*/i)||[""])[0].slice(0,160));
  // Bullet 3 contract: sell-through is qualitative and the speed line only
  // follows a fast timeline (this run has no timeline set).
  check("bullet 3: sell-through never renders as a percentage", !/sell-through for [^\n]*%/.test(rendered), (rendered.match(/[^\n]*sell-through for[^\n]*/i)||[""])[0].slice(0,160));
  check("bullet 3: no speed line without a fast timeline", !/prioritizing a fast close|market I.{0,6}d trust to move it/i.test(rendered), (rendered.match(/[^\n]*(fast close|move it)[^\n]*/i)||[""])[0].slice(0,160));
  // Bullet 1 always names a concrete window, never bare vagueness.
  const bullet1Lines=rendered.split("\n").filter(l=>/sales have closed on/i.test(l)&&!/than any other platform/i.test(l)&&!/% of /.test(l));
  check("bullet 1: every existence line names a real window", bullet1Lines.every(l=>/over the past \d+ days|though none in the past 180 days/i.test(l)), bullet1Lines.map(l=>l.trim().slice(0,120)).join(" | ")||"none");
  // Relevance count can never exceed the make count.
  const rel=(rendered.replace(/&#39;/g,"'").match(/(\d+) \w[\w-]* sales tracked, (\d+) in this car's price range/)||null);
  if(rel)check("relevance: price-band count is make-scoped and sane", Number(rel[2])<=Number(rel[1]), rel[0]);
  check("card specificity: weekday lines only render with a material lift", !/(around|at ~)[1-9]% above other days/.test(rendered), (rendered.match(/[^\n]*above other days[^\n]*/)||[""])[0]);
  // FIX 1 validation gate: any percent claim requires a proven 10+ denominator
  const pctClaim=rendered.replace(/&amp;/g,"&").match(/(\d+)% of [^\n]*closed on/);
  const landedSales=sellState.sellDecision?.evidence?.ladder?.landed?.sales??0;
  if(pctClaim){
    check("claim gate: percent claims carry a proven 10+ denominator", landedSales>=10 && Number(pctClaim[1])<=100, `claim=${pctClaim[0].slice(0,80)} landedSales=${landedSales}`);
  }else{
    check("claim gate: thin data falls back to safe prose, no invented percent", landedSales>=10 || /sales have closed on/i.test(rendered.replace(/&amp;/g,"&")) || !/closed on/.test(rendered), `landedSales=${landedSales}`);
  }

  const huracan={label:"2015 Lamborghini Huracan",vehicle:{raw:"2015 Lamborghini Huracan",year:2015,make:"Lamborghini",model:"Huracan",trim:null,confidence:"high",canonicalLabel:"2015 Lamborghini Huracan"}};
  const eu=await runResult("Europe",null,"250k",huracan);
  check("card specificity: Collecting Cars proof is make-specific for a Lamborghini", /sold many Lamborghini models at premium prices/i.test(eu) && /Huracán and Aventador/i.test(eu) && !/F40/.test(eu), eu.replace(/<span class="num">([^<]*)<\/span>/g,"$1").replace(/<[^>]+>/g," ").slice(0,300));
  check("card specificity: single Specialist-platform mention holds", (eu.match(/Specialist platform/g)||[]).length===1, `count=${(eu.match(/Specialist platform/g)||[]).length}`);
}

// Bullet 3 renders whenever segment data exists, no timeline needed.
{
  const carrera={label:"1987 Porsche 911 Carrera",vehicle:{raw:"1987 Porsche 911 Carrera",year:1987,make:"Porsche",model:"911",trim:"Carrera",confidence:"high",canonicalLabel:"1987 Porsche 911 Carrera"}};
  const out=await runResult("US","California","95k",carrera,{timeline:"No rush, right result only"});
  if(sellState.awaitingPathChoice){handleSellRecommendationFollowup("I'll run it myself");await new Promise(r=>setTimeout(r,150));}
  const rendered=(renderedResult()+"\n"+allSamText()).replace(/<span class="num">([^<]*)<\/span>/g,"$1").replace(/<[^>]+>/g,"\n").replace(/&#39;/g,"'");
  check("bullet 3: renders on no-rush when segment data exists", /(Strong|Consistent) sell-through for classic Porsches in the \$50k to \$150k range/.test(rendered), (rendered.match(/[^\n]*sell-through[^\n]*/i)||["missing"])[0].slice(0,160));
  check("bullet 3: no speed line on a no-rush timeline", !/prioritizing a fast close|market I'd trust to move it/.test(rendered), (rendered.match(/[^\n]*(fast close|move it)[^\n]*/i)||[""])[0]);
  check("carrera: zero price-gap prose despite the 57% gap", !/your asking price|the average for recent/i.test(rendered), (rendered.match(/[^\n]*asking price[^\n]*/i)||[""])[0]);
}

// Context-aware speed routing: a fast timeline flips the pick to the
// curated-fast alternative (evidence-backed only); the routing reason
// drives voice, bullet 3 and the summary. No timeline context: no swap.
{
  const FAST=["fast","medium_fast"];
  const lc={label:"1985 Toyota Land Cruiser",vehicle:{raw:"1985 Toyota Land Cruiser",year:1985,make:"Toyota",model:"Land Cruiser",trim:null,confidence:"high",canonicalLabel:"1985 Toyota Land Cruiser"}};
  const lcFast=await runResult("US","Texas","40k",lc,{timeline:"Want it gone fast"});
  const flatLC=lcFast.replace(/<span class="num">([^<]*)<\/span>/g,"$1").replace(/&amp;/g,"&").replace(/<[^>]+>/g,"\n");
  const routesLC=(sellState.sellDecision?.decision?.routeFit?.routes||[]).filter(r=>r.marketEvidence?.evidenceSales>0);
  const plateLC=((lcFast.match(/vp-name">([^<]*)</)||[])[1]||"").replace(/&amp;/g,"&");
  const pickRouteLC=routesLC.find(r=>plateLC&&plateLC===platformNameMapSmoke(r.platform));
  const fastAltExists=routesLC.some(r=>plateLC!==platformNameMapSmoke(r.platform)&&FAST.includes(r.speedToList));
  check("speed routing: fast-timeline pick is fast, or no fast alternative existed",
    !plateLC||!pickRouteLC||FAST.includes(pickRouteLC.speedToList)||!fastAltExists,
    `plate=${plateLC} pickSpeed=${pickRouteLC?.speedToList} fastAltExists=${fastAltExists} reason=${sellState.routingReason}`);
  check("speed routing: routingReason tag matches the rendered voice",
    (sellState.routingReason==="speed")===/If speed is your priority, [^\n]+ is the right move\./.test(flatLC),
    `reason=${sellState.routingReason}`);
  if(sellState.routingReason==="speed"){
    check("speed swap: bullet 3 is the quicker-cycle line, not segment", /typically runs the quicker auction cycle/.test(flatLC), (flatLC.match(/[^\n]*quicker[^\n]*/)||["missing"])[0]);
    const pickSection=flatLC.split("Why I picked this")[1]?.split("Submit your car")[0]||"";
    check("speed swap: segment bullet suppressed on the pick", !/sell-through for/.test(pickSection), (pickSection.match(/[^\n]*sell-through[^\n]*/)||[""])[0]);
    check("speed swap: summary owns the reason", /You need it fast\. [^\n]+ is your move\./.test(flatLC), (flatLC.match(/[^\n]*your move[^\n]*/)||["missing"])[0]);
  }
  const lcNoRush=await runResult("US","Texas","40k",lc,{timeline:"No rush, right result only"});
  check("no-rush: no speed swap and no speed voice", sellState.routingReason===null&&!/If speed is your priority/.test(lcNoRush), `reason=${sellState.routingReason}`);
}

// Corolla production range + wizard context reset + dual option.
{
  // 1. Modern Corolla resolves clean (range was falsely 1985-1987).
  resetToStep1();
  await handleSellStep("2017 Toyota Corolla");
  check("corolla: 2017 resolves without a year challenge", !/doesn't line up/i.test(lastSam()||"") && /2017 Toyota Corolla/.test(sellState.carName||""), `car=${sellState.carName} last="${(lastSam()||"").slice(0,120)}"`);

  // 2. Context reset: a different make after a year challenge is a NEW car,
  // never a clarification ("Toyota M3" cross-contamination).
  resetToStep1();
  await handleSellStep("1950 Toyota Corolla");
  check("context reset setup: 1950 Corolla gets the year challenge", /wasn't produced in 1950|doesn't line up/i.test(lastSam()||""), (lastSam()||"").slice(0,120));
  await handleSellStep("2018 bmw m3");
  const resetLast=samMessages().slice(-3).join(" ");
  check("context reset: different make starts fresh, no Toyota contamination", /BMW/i.test(sellState.carName||"")&&!/Toyota/i.test(sellState.carName||"")&&!/Toyota M3/i.test(resetLast), `car=${sellState.carName} last="${resetLast.slice(0,160)}"`);

  // 3. Same-make detail stays a clarification (no reset).
  resetToStep1();
  await handleSellStep("1950 Toyota Corolla");
  await handleSellStep("1986");
  check("clarification: same-make year fix merges, no reset", /1986 Toyota Corolla/.test(sellState.carName||""), `car=${sellState.carName}`);

  // 4. Dual option: a second option surface always renders when any
  // alternative exists (platform card, dossier, or partner mention).
  const lcDual=await runResult("US","Texas","40k",{label:"1985 Toyota Land Cruiser",vehicle:{raw:"1985 Toyota Land Cruiser",year:1985,make:"Toyota",model:"Land Cruiser",trim:null,confidence:"high",canonicalLabel:"1985 Toyota Land Cruiser"}});
  const lcCards=(lcDual.match(/sell-rec-card/g)||[]).length+(lcDual.match(/power-seller-(feature|mini)/g)||[]).length;
  check("dual option: Land Cruiser renders a pick plus an alternative", lcCards>=2, `optionSurfaces=${lcCards}`);

  // 5. Gate-closed $50k+ context: the matched partner renders as the
  // secondary mention (suppressed only by a stated DIY preference).
  const m3c={label:"2016 BMW M3 Competition",vehicle:{raw:"2016 BMW M3 Competition",year:2016,make:"BMW",model:"M3",trim:"Competition",confidence:"high",canonicalLabel:"2016 BMW M3 Competition"}};
  const m3Dual=await runResult("US","New York","70k",m3c);
  const referral=sellState.partnerReferral||{};
  if(referral.secondary){
    // $50k+ gate-closed always shows the partner secondary (locked, updated).
    check("partner secondary: $50k+ gate-closed always shows the also-considering card",
      /Also worth considering/.test(m3Dual),
      `miniRendered=${/Also worth considering/.test(m3Dual)}`);
  }else if(referral.eligible){
    check("partner: gate-open dual renders the dossier", /power-seller-feature/.test(m3Dual)||/Want it handled/.test(m3Dual), "dossier missing");
  }
}

// Price-gap prose is deleted (locked): a big ask-vs-comps gap changes
// NOTHING about the render. No note, no ask, no percentage.
{
  const out=await runResult("US","California","20k",gts);
  if(sellState.awaitingPathChoice){handleSellRecommendationFollowup("I'll run it myself");await new Promise(r=>setTimeout(r,150));}
  const released=(renderedResult()+"\n"+allSamText()).replace(/<span class="num">([^<]*)<\/span>/g,"$1").replace(/<[^>]+>/g,"\n");
  check("price gap: results render immediately, no pre-results ask", /Seller Intelligence|Want it handled/i.test(released) && !/what'?s different about yours/i.test(released), released.slice(0,200));
  check("price gap: zero gap prose anywhere", !/your asking price|above the average|below the average|worth knowing/i.test(released), (released.match(/[^\n]*(asking price|the average)[^\n]*/i)||[""])[0].slice(0,180));
}

// Battery: field-contamination entries (locked guard D).
resetToStep1();
await handleSellStep("2020 BMW M3, US");
guardCarLabel("entry-location-contaminated");
check("contamination: location token routed to the region field", sellState.region==="US" && /^2020 BMW M3$/.test(sellState.carName||""), `car=${sellState.carName} region=${sellState.region} step=${sellState.step}`);
check("contamination: location question skipped to the state ask", sellState.step===18||sellState.step===17, `step=${sellState.step} last="${lastSam()}"`);

resetToStep1();
await handleSellStep("m3 around 60k");
if(sellState.step===17)await handleSellStep("2020");
guardCarLabel("entry-price-contaminated");
check("contamination: price token routed to the price field", String(sellState.price||"")==="60k" && !/60k/.test(sellState.carName||""), `car=${sellState.carName} price=${sellState.price}`);

// Battery: real-phrasing fixes.
resetToStep1();
await handleSellStep("wife's lexus lx470 maybe 2004 not sure exact year");
check("hedged entry: resolves to a tentative-year confirm", /2004 Lexus LX 470/i.test(lastSam()||"") && /sound right/i.test(lastSam()||""), `last="${lastSam()}"`);
await handleSellStep("yes");
guardCarLabel("hedged-lexus");
check("hedged entry: confirm advances with the clean car", /Lexus LX 470/i.test(sellState.carName||"") && sellState.step!==1, `car=${sellState.carName} step=${sellState.step}`);

resetToStep1();
await handleSellStep("2016 hellcat");
check("nickname: hellcat asks Challenger vs Charger with chips", /which hellcat/i.test(lastSam()||"") && /Challenger Hellcat/.test(String(addMsgLog.at(-1)?.[3]||"")), `last="${lastSam()}" chips="${String(addMsgLog.at(-1)?.[3]||"").slice(0,120)}"`);
await handleSellStep("Challenger Hellcat");
check("nickname: chip completes the car", /Challenger/i.test(sellState.carName||""), `car=${sellState.carName} step=${sellState.step} last="${lastSam()}"`);

resetToStep1();
await handleSellStep("73 bronco half restored");
guardCarLabel("condition-bronco");
check("condition token: label clean, note captured", /^1973 Ford Bronco$/.test(sellState.carName||"") && /half restored/i.test(sellState.notes||""), `car=${sellState.carName} notes=${sellState.notes}`);
await handleSellStep("US");
await handleSellStep("Texas");
await handleSellStep("60k to 100k");
check("condition token: the condition ask pre-acknowledges", /you mentioned it'?s half restored/i.test(lastSam()||""), `last="${lastSam()}"`);

// Regression battery: today's three exact label failures.
resetToStep1();
await handleSellStep("thinking about selling my dads old porsche 911 maybe 1987 or 88 not sure");
check("regression 1: conversational 911 reads as a 911, never as conversation", /porsche 911|911/i.test(lastSam()||"") && !/thinking|weird|or 88/i.test(lastSam()||""), `last="${lastSam()}"`);
if(/sound right/i.test(lastSam()||""))await handleSellStep("yes");
else if(sellState.step===17)await handleSellStep("Carrera");
guardCarLabel("regression-1-hedged-911");
check("regression 1: label is a clean era-or-year 911", /^(19\d{2}|1980s) Porsche 911/.test(sellState.carName||"") && !/thinking|about|or 88/i.test(sellState.carName||""), `car=${sellState.carName}`);

resetToStep1();
await handleSellStep("2015 lamborghini huracan that weird but smaller 2016 one");
guardCarLabel("regression-2-huracan");
check("regression 2: huracan label sheds the conversation", /^2015 Lamborghini Huracan/.test(sellState.carName||"") && !/weird|smaller|2016/i.test(sellState.carName||""), `car=${sellState.carName}`);

resetToStep1();
await handleSellStep("got a raptor truck been sitting needs some tlc");
check("regression 3: mid-sentence raptor resolves, year asked", /Ford F-150/i.test(lastSam()||"") && /year/i.test(lastSam()||""), `last="${lastSam()}" step=${sellState.step}`);
await handleSellStep("2018");
guardCarLabel("regression-3-raptor");
check("regression 3: raptor survives to the label", /F-150/i.test(sellState.carName||""), `car=${sellState.carName}`);
// year conflict honesty: raptor typed at the model step with an old year held
resetToStep1();
await handleSellStep("1976 ford");
if (sellState.step === 17) {
  await handleSellStep("raptor");
  check("regression 3b: old-year raptor gets the honest conflict, never dropped", /Raptor wasn'?t produced in 1976|F-100 or F-150/i.test(lastSam()||""), `last="${lastSam()}"`);
}

// Battery: multi-trim asks (FIX 2).
resetToStep1();
await handleSellStep("2018 mercedes c63");
check("trim spread: C63 asks C63 vs C63 S", sellState.step===17 && /C63 and C63 S/i.test(lastSam()||""), `step=${sellState.step} last="${lastSam()}"`);
resetToStep1();
await handleSellStep("2020 bmw m3");
check("trim spread: modern M3 asks Base vs Competition", sellState.step===17 && /Base and Competition/i.test(lastSam()||""), `step=${sellState.step} last="${lastSam()}"`);
await handleSellStep("Competition");
check("trim spread: Competition answer advances with the trim", /M3 Competition/i.test(sellState.carName||"") && sellState.step!==17, `car=${sellState.carName} step=${sellState.step}`);

// Edit mid-flow keeps context: re-confirming the same car resumes at the
// step the user was on, never back at vehicle entry.
resetToStep1();
await handleSellStep("2020 bmw m3");
if (sellState.step === 17) await handleSellStep("Competition");
check("edit-resume: M3 lands on the location question", sellState.step === 11, `step=${sellState.step} last="${lastSam()}"`);
editCarName();
await handleSellStep("yes it is that car my bad");
check("edit-resume: same-car confirm with suffix resumes at location", sellState.step === 11 && /where is the car located/i.test(lastSam() || "") && /M3/i.test(sellState.carName || ""), `step=${sellState.step} car=${sellState.carName} last="${lastSam()}"`);
editCarName();
await handleSellStep("my mistake its is this car");
check("edit-resume: prefix suffix + 'is this car' confirms and resumes", sellState.step === 11 && /where is the car located/i.test(lastSam() || "") && /M3/i.test(sellState.carName || "") && !/mistake/i.test(sellState.carName || ""), `step=${sellState.step} car=${sellState.carName} last="${lastSam()}"`);
editCarName();
await handleSellStep("actually different car 1965 jag");
check("edit-resume: different car resolves, model clarification allowed", sellState.step === 17 || sellState.step === 11, `step=${sellState.step} last="${lastSam()}"`);
if (sellState.step === 17) await handleSellStep("e-type");
check("edit-resume: different car resumes at location after clarification", sellState.step === 11 && /where is the car located/i.test(lastSam() || "") && /Jaguar/i.test(sellState.carName || ""), `step=${sellState.step} car=${sellState.carName} last="${lastSam()}"`);

// Edit at every step: clicking returns to vehicle entry keeping answers.
resetToStep1();
await handleSellStep("2018 porsche 911 carrera gts");
check("edit: resolve lands on a post-vehicle question", sellState.step === 11, `step=${sellState.step}`);
await handleSellStep("US");
await handleSellStep("California");
const preEditStep = sellState.step;
editCarName();
check("edit: editCarName returns to vehicle entry", sellState.step === 1, `step=${sellState.step}`);
await handleSellStep("1969 ford mustang");
check("edit: new car keeps answers, resumes at first unanswered", /Mustang/.test(sellState.carName || "") && sellState.region === "US" && sellState.state === "California" && sellState.step === preEditStep, `car=${sellState.carName} region=${sellState.region} state=${sellState.state} step=${sellState.step} (was ${preEditStep})`);

// Phrasing fuzzer (Addendum C): combinatorial real-world entries. Every
// generated entry must either resolve or produce ONE grounded question;
// a make-bearing input may never come back with the car dropped.
{
  const CARS=[
    {token:"porsche 911",make:"Porsche"},{token:"vette",make:"Chevrolet"},{token:"stang",make:"Ford"},
    {token:"lexus lx470",make:"Lexus"},{token:"bmw m3",make:"BMW"},{token:"miata",make:"Mazda"},
    {token:"vw camper van",make:"Volkswagen"},{token:"corvette stingray",make:"Chevrolet"},
    {token:"mercedes sl",make:"Mercedes-Benz"},{token:"landcruiser",make:"Toyota"}
  ];
  const POSSESSIVES=["","my ","wife's ","dad's "];
  const YEARS=["","1972 ","maybe 2004 ","from the 80s "];
  const SUFFIXES=["",", US"," half restored"," around 60k"];
  const cases=[];
  for(const car of CARS)for(const p of POSSESSIVES.slice(0,2))for(const y of YEARS)for(const suffix of SUFFIXES.slice(0,2)){
    cases.push({text:`${p}${y}${car.token}${suffix}`.trim(),make:car.make});
  }
  // sprinkle the harder possessive/hedge/suffix combos on a subset
  for(const car of CARS.slice(0,5)){
    cases.push({text:`wife's ${car.token} maybe 2004 not sure exact year`,make:car.make});
    cases.push({text:`dad's old ${car.token} half restored, US`,make:car.make});
    cases.push({text:`thinking about selling the ${car.token} you know the one`,make:car.make});
    cases.push({text:`${car.token} 1987 or 88 not sure somewhere around there`,make:car.make});
    cases.push({text:`got a ${car.token} been sitting needs some tlc`,make:car.make});
  }
  let fuzzFailures=[];
  const CHUNK=10;
  for(let i=0;i<cases.length;i+=CHUNK){
    await Promise.all(cases.slice(i,i+CHUNK).map(async c=>{
      try{
        const res=await fetch(`${BASE}/api/vehicleIdentity`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text:c.text})});
        const data=await res.json();
        const ok=res.ok
          &&["valid","needs_clarification","invalid_vehicle"].includes(data.status)
          &&(data.status==="valid"
            ?String(data.vehicle?.make||"").toLowerCase()===c.make.toLowerCase()||!!data.vehicle?.make
            :!!(data.clarification?.question))
          &&!(data.status==="needs_clarification"&&!data.vehicle?.make&&!data.vehicle?.model&&!data.fallback);
        if(!ok)fuzzFailures.push(`"${c.text}" -> ${data.status} make=${data.vehicle?.make} q="${(data.clarification?.question||"").slice(0,60)}"`);
        const label=String(data.vehicle?.canonicalLabel||"");
        if(/\b(us|usa)\b|\$|\b\d{2,3}k\b|half restored|barn find/i.test(label))fuzzFailures.push(`contaminated label: "${c.text}" -> "${label}"`);
        if(label&&data.vehicle?.make&&data.vehicle?.model&&!labelIsProvablyCar(label,data.vehicle))fuzzFailures.push(`label fails sanity gate: "${c.text}" -> "${label}"`);
      }catch(err){fuzzFailures.push(`"${c.text}" threw ${err.message.slice(0,50)}`);}
    }));
  }
  check(`fuzzer: ${cases.length} generated entries all resolve or ask one grounded question`, fuzzFailures.length===0, fuzzFailures.slice(0,5).join(" || "));
}

console.log(`\n${failures === 0 ? "WIZARD ALL PASS" : failures + " FAILURE(S)"}`);
process.exit(failures === 0 ? 0 : 1);
