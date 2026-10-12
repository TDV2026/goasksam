// offWindowCheck: pure-render fixture proof that Buy's drawer card builder (api/buy.js, CLIENT's
// drawerHtml) renders the SAME off-window wording as Market Check's card builder (js/onebox.js,
// offWindowLabel), for the identical stubbed card. No live endpoint, no vendor request, no key -
// both builders are extracted from their own source files and run offline in a vm sandbox with the
// real shipped code, byte for byte; only the DOM/fetch/storage globals they touch are stubbed out.
//
// Why this exists: a live search that actually produces an off-window card could not be found
// (lane-notes, Job 5), so this proves the RENDERING instead - push a stubbed off-window card
// through each product's real builder and compare the wording. If either product's source changes
// the offWindowLabel/drawerHtml function shape so it can no longer be extracted, this fails loudly
// rather than silently skipping (a renamed function is a regression risk, not a free pass).
//
//   node scripts/offWindowCheck.mjs
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

let fails = 0, n = 0;
function ok(name, cond, detail) {
  n++;
  if (!cond) { fails++; console.log(`FAIL ${name}` + (detail ? `\n   ${detail}` : "")); }
  else console.log(`ok   ${name}`);
}

function sandboxGlobals() {
  const noop = () => {};
  const elStub = { addEventListener: noop, classList: { add: noop, remove: noop, contains: () => false }, style: {}, setAttribute: noop, getAttribute: () => null, querySelector: () => null, querySelectorAll: () => [] };
  const documentStub = {
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: () => ({ ...elStub }),
    addEventListener: noop,
    body: elStub
  };
  const sandbox = {
    window: {},
    document: documentStub,
    location: { hostname: "localhost", protocol: "file:", search: "", pathname: "/" },
    navigator: { userAgent: "node", sendBeacon: () => false },
    localStorage: { getItem: () => null, setItem: noop, removeItem: noop },
    // Never a real network call: no vendor request, no key - a rejected stub, caught by the
    // product code's own .catch() same as a real offline failure would be.
    fetch: () => Promise.reject(new Error("offWindowCheck: fetch is stubbed, no live calls")),
    setInterval: () => 0, clearInterval: noop, setTimeout: () => 0, clearTimeout: noop,
    console
  };
  sandbox.window.GAS_SELL = null;
  sandbox.window.GAS_REL = { mc: true, tasks: true };
  sandbox.window.OBX = undefined;
  sandbox.window.addEventListener = noop;
  sandbox.window.location = sandbox.location;
  return sandbox;
}

// Runs `body` (already unwrapped from its outer IIFE) as a classic script at the sandbox's top
// level, so every top-level `function name(){}` declaration hoists onto the context object and is
// reachable afterward - regardless of whether some later top-level statement (a real product file
// has plenty: initial fetches, boot() calls) throws once stubbed globals run out of road. That is
// why this is wrapped in try/catch and swallows the error: we only need the function declarations,
// not a full successful page boot.
function runAndCapture(body, label) {
  const sandbox = sandboxGlobals();
  const context = vm.createContext(sandbox);
  try {
    vm.runInContext(body, context, { filename: label, timeout: 5000 });
  } catch (e) {
    // Expected: stubbed globals run out partway through a real page's boot sequence. The function
    // declarations we need are hoisted before any statement runs, so they already exist on context.
  }
  return context;
}

function unwrapIife(src, label) {
  // Leading // comment lines and blank lines (a real source file's file-header comment) are
  // allowed before the wrapper; the wrapper itself tolerates the "(function () {" vs "(function(){"
  // whitespace variants both products actually use.
  const stripped = src.replace(/^(\s*\/\/[^\n]*\n)+/, "");
  const m = stripped.match(/^\(function\s*\(\s*\)\s*\{\n([\s\S]*)\n\}\)\(\);?\s*$/);
  if (!m) throw new Error(`${label}: could not find the expected outer (function(){ ... })(); wrapper - source shape changed, fix this script's extraction before trusting it`);
  return m[1];
}

// ---- extract Market Check's builder (js/onebox.js: a real file, offWindowLabel is internal, not
// exported via window.OBX) ----
function loadMarketCheckBuilder() {
  const src = fs.readFileSync(path.join(ROOT, "js/onebox.js"), "utf8");
  const body = unwrapIife(src, "js/onebox.js");
  const context = runAndCapture(body, "js/onebox.js");
  if (typeof context.offWindowLabel !== "function") throw new Error("js/onebox.js: offWindowLabel not found after sandboxed load - function renamed or restructured, update this script");
  return context.offWindowLabel;
}

// ---- extract Buy's builder (api/buy.js: CLIENT is a quoted string literal, one line, with a
// __KEEP_ICON__ placeholder substituted at request time - mirrored here with a harmless stub) ----
function loadBuyBuilder() {
  const src = fs.readFileSync(path.join(ROOT, "api/buy.js"), "utf8");
  const m = src.match(/const CLIENT = "((?:\\.|[^"\\])*)";/);
  if (!m) throw new Error("api/buy.js: could not find `const CLIENT = \"...\";` - update this script's extraction");
  const code = JSON.parse(`"${m[1]}"`).replace("__KEEP_ICON__", '""');
  const body = unwrapIife(code, "api/buy.js CLIENT");
  const context = runAndCapture(body, "api/buy.js CLIENT");
  if (typeof context.drawerHtml !== "function") throw new Error("api/buy.js: drawerHtml not found after sandboxed load - function renamed or restructured, update this script");
  return context.drawerHtml;
}

function stripTags(html) { return String(html || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(); }

console.log("\n== off-window wording: Market Check (js/onebox.js) vs Buy (api/buy.js) ==");

let offWindowLabel, drawerHtml;
try {
  offWindowLabel = loadMarketCheckBuilder();
  ok("js/onebox.js offWindowLabel extracted", true);
} catch (e) {
  ok("js/onebox.js offWindowLabel extracted", false, e.message);
}
try {
  drawerHtml = loadBuyBuilder();
  ok("api/buy.js drawerHtml extracted", true);
} catch (e) {
  ok("api/buy.js drawerHtml extracted", false, e.message);
}

if (offWindowLabel && drawerHtml) {
  const SEARCHED_YEAR = 1988;
  const OFF_YEAR = 1985;

  // Market Check side: offWindowLabel(c, d) - c is the card, d.resolvedCar.year is the searched year.
  const mcCard = { offWindow: true, year: OFF_YEAR };
  const mcD = { resolvedCar: { year: SEARCHED_YEAR } };
  const mcHtml = offWindowLabel(mcCard, mcD);
  const mcText = stripTags(mcHtml);
  ok("Market Check renders the off-window note for a flagged card", mcText.length > 0, `got: ${JSON.stringify(mcHtml)}`);

  // Buy side: drawerHtml(l, j) - l.year is the searched (listing's own) year; j.representative.closest
  // etc. feed the three sale cards shown in the drawer.
  const buyCard = { offWindow: true, year: OFF_YEAR, date: "2025-06-01", mi: 50000, price: 42000, url: "https://example.invalid/x", platform: "Bring a Trailer" };
  const buyListing = { id: "stub-1", year: SEARCHED_YEAR, market: { kind: "range", low: 40000, high: 50000, count: 12, window: "the past year" } };
  const buyJ = { representative: { closest: buyCard, high: null, low: null } };
  const buyHtml = drawerHtml(buyListing, buyJ);
  const buyText = stripTags(buyHtml);
  const buyHasNote = /a few years from the/i.test(buyText);
  ok("Buy renders the off-window note for a flagged card", buyHasNote, `got: ${JSON.stringify(buyText)}`);

  // The actual wording comparison: both must state the SAME pattern - "A <off year> car, a few
  // years from the <searched year> searched." - not merely "both non-empty".
  const expected = `A ${OFF_YEAR} car, a few years from the ${SEARCHED_YEAR} searched.`;
  ok("Market Check wording matches the expected pattern", mcText.includes(expected), `want substring: ${JSON.stringify(expected)}\n   got: ${JSON.stringify(mcText)}`);
  ok("Buy wording matches the expected pattern", buyText.includes(expected), `want substring: ${JSON.stringify(expected)}\n   got: ${JSON.stringify(buyText)}`);

  // Negative case: a card with offWindow not true must never show the note (on either builder).
  const mcCardClean = { offWindow: false, year: OFF_YEAR };
  const mcCleanText = stripTags(offWindowLabel(mcCardClean, mcD));
  ok("Market Check shows nothing when offWindow is not true", mcCleanText === "", `got: ${JSON.stringify(mcCleanText)}`);

  const buyCardClean = { ...buyCard, offWindow: false };
  const buyCleanText = stripTags(drawerHtml(buyListing, { representative: { closest: buyCardClean, high: null, low: null } }));
  ok("Buy shows no off-window note when offWindow is not true", !/a few years from the/i.test(buyCleanText), `got: ${JSON.stringify(buyCleanText)}`);
} else {
  console.log("SKIPPED the wording comparison - one or both builders could not be extracted (see FAILs above)");
}

console.log(`\n${n - fails}/${n} checks passed.`);
process.exit(fails ? 1 : 0);
