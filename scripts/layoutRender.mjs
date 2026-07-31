// Layout-round verification: drives the REAL showSellRecommendation() render
// for each step-8 preference against a real captured decision, and asserts the
// per-preference layout, the pick-badge rule, the track-record plate, the lane
// claim, and the absence of the double-ask chips. No network (fetch is stubbed
// with a captured prod decision so the render path is byte-identical to prod).
import fs from "node:fs";

const DEC_STRONG = JSON.parse(fs.readFileSync(process.env.DEC_STRONG || "scripts/fixtures/decision-1973-carrera-rs.json", "utf8"));
const DEC_MODERN = JSON.parse(fs.readFileSync(process.env.DEC_MODERN || "scripts/fixtures/decision-2022-gt3.json", "utf8"));

let failures = 0;
const check = (name, ok, detail = "") => { console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  ->  " + String(detail).slice(0, 200)}`); if (!ok) failures++; };

// ---- capturing DOM ----
const noop = () => {};
function mkEl(tag = "div") {
  const el = {
    tag, id: "", className: "", _html: "", style: {}, textContent: "", value: "", disabled: false,
    children: [],
    classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
    set innerHTML(v) { this._html = v; }, get innerHTML() { return this._html; },
    appendChild(c) { this.children.push(c); return c; },
    removeChild: noop, remove: noop, append: noop, setAttribute: noop, addEventListener: noop,
    scrollIntoView: noop, focus: noop, querySelector: () => mkEl(), querySelectorAll: () => []
  };
  return el;
}
const msgs = mkEl("div"); msgs.id = "msgs";
const btn = mkEl("button"); btn.id = "btn";
const byId = { msgs, btn };
globalThis.window = globalThis;
globalThis.document = {
  getElementById: id => byId[id] || mkEl(),
  querySelector: () => mkEl(), querySelectorAll: () => [], createElement: mkEl,
  addEventListener: noop, body: mkEl()
};
try { Object.defineProperty(globalThis, "navigator", { value: { language: "en-US" }, configurable: true }); } catch {}
globalThis.location = { hostname: "localhost", protocol: "file:" };
globalThis.localStorage = { getItem: () => null, setItem: noop, removeItem: noop };
globalThis.setInterval = () => 0; globalThis.clearInterval = noop; globalThis.setTimeout = (fn) => { return 0; };

const html = fs.readFileSync("index.html", "utf8");
const files = [...html.matchAll(/<script src="(js\/[^"]+)"><\/script>/g)].map(m => m[1]);
const script = files.map(f => fs.readFileSync(f, "utf8")).join("\n");
(0, eval)(script + "\nglobalThis.showSellRecommendation=showSellRecommendation;globalThis.sellState=sellState;");

async function render(decision, vehicle, pref) {
  msgs.children.length = 0;
  globalThis.fetch = async () => ({ ok: true, json: async () => decision });
  Object.assign(sellState, {
    carName: `${vehicle.year} ${vehicle.make} ${vehicle.model} ${vehicle.trim || ""}`.trim(),
    resolvedVehicle: vehicle, vehicleIdentityValidated: true, vehicleDetailSkipped: false,
    region: "US", state: "CA", sellerPreference: pref,
    involvement: pref === "diy" ? "I'll manage it myself" : pref === "powerseller" ? "Want someone to handle everything" : "Not sure",
    price: "", timeline: "", mileage: "", condition: "", records: "", title: "", notes: ""
  });
  await showSellRecommendation();
  // The result is the last appended row.
  const last = msgs.children[msgs.children.length - 1];
  return last ? last.innerHTML : "";
}

const V1973 = { make: "Porsche", model: "911", year: 1973, trim: "Carrera RS" };
const V2022 = { make: "Porsche", model: "911", year: 2022, trim: "GT3" };

// index of first occurrence, -1 if absent
const at = (h, s) => h.indexOf(s);

for (const pref of ["powerseller", "diy", "unsure"]) {
  const h = await render(DEC_STRONG, V1973, pref);
  console.log(`\n### preference = ${pref}`);
  const noChips = !/Want it handled, or run it yourself/.test(h) && at(h, "chip") === -1 || !/Want it handled, or run it yourself/.test(h);
  check(`[${pref}] no double-ask chips`, !/Want it handled, or run it yourself/.test(h), "chips present");
  const platePos = at(h, "verdict-plate");
  const trackPos = at(h, "track-record");
  const handledPos = at(h, "Have it handled");
  const platformGridPos = at(h, "sell-rec-grid");
  if (pref === "powerseller") {
    check(`[${pref}] track-record plate present (howS leads)`, trackPos !== -1, h.slice(0, 120));
    check(`[${pref}] PowerSeller 'Have it handled' leads BEFORE the platform grid`, handledPos !== -1 && handledPos < platformGridPos, `handled=${handledPos} grid=${platformGridPos}`);
    check(`[${pref}] platform card NOT marked Sam's pick (no primary market plate on platform)`, !/Sam's pick/.test(h) || trackPos < at(h, "Sam's pick"), "platform took the pick");
  } else {
    check(`[${pref}] platform grid leads BEFORE 'Have it handled'`, platformGridPos !== -1 && (handledPos === -1 || platformGridPos < handledPos), `grid=${platformGridPos} handled=${handledPos}`);
    check(`[${pref}] platform card carries the pick plate (Sam's pick)`, /Sam's pick/.test(h), "no Sam's pick plate on platform");
    check(`[${pref}] no track-record plate above the platform (platform is the pick)`, trackPos === -1 || trackPos > platformGridPos, `track=${trackPos} grid=${platformGridPos}`);
    check(`[${pref}] PowerSeller block still renders below`, handledPos !== -1, "no handled block");
    if (pref === "diy") check(`[diy] PowerSeller block is the quiet variant`, /ps-quiet/.test(h), "not quiet");
    if (pref === "unsure") check(`[unsure] PowerSeller block is prominent (not quiet)`, !/ps-quiet/.test(h), "quiet in unsure");
  }
  check(`[${pref}] air-cooled 1973 RS gets the STRONG lane form`, /squarely in his lane/.test(h), "strong form missing");
  check(`[${pref}] no deleted own-voice value claims`, !/fee earns its keep|my personal preference is generally/.test(h), "value claim present");
}

// Lane weak form: a modern water-cooled Porsche against an air-cooled specialist.
{
  const h = await render(DEC_MODERN, V2022, "powerseller");
  console.log(`\n### lane weak-form (2022 GT3, air-cooled specialist)`);
  check("modern Porsche does NOT get 'squarely in his lane'", !/squarely in his lane/.test(h), "strong form wrongly fired");
  check("modern Porsche gets the weak, data-true form ('core to his tracked record')", /core to his tracked record/.test(h), "weak form missing");
}

console.log(failures ? `\n${failures} FAILURE(S)` : "\nLAYOUT-RENDER ALL PASS");
process.exit(failures ? 1 : 0);
