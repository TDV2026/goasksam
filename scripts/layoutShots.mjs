// Renders each preference-path layout into a standalone, styled HTML page so
// the three layouts can be viewed (the "screenshots"). Reuses the real render
// path with a captured decision; wraps the result in the live styles.css.
import fs from "node:fs";
const OUT = process.env.OUT || "/private/tmp/claude-501/-Users-davidzysblat-Documents-GitHub-goasksam/ca33290f-26cb-4830-84de-21c1500cd74a/scratchpad";
const DEC = JSON.parse(fs.readFileSync("scripts/fixtures/decision-1973-carrera-rs.json", "utf8"));

const noop = () => {};
function mkEl() {
  const el = { id: "", className: "", _html: "", style: {}, textContent: "", value: "", disabled: false, children: [],
    classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
    set innerHTML(v) { this._html = v; }, get innerHTML() { return this._html; },
    appendChild(c) { this.children.push(c); return c; }, removeChild: noop, remove: noop, append: noop,
    setAttribute: noop, addEventListener: noop, scrollIntoView: noop, focus: noop, querySelector: () => mkEl(), querySelectorAll: () => [] };
  return el;
}
const msgs = mkEl(); msgs.id = "msgs"; const btn = mkEl(); btn.id = "btn"; const byId = { msgs, btn };
globalThis.window = globalThis;
globalThis.document = { getElementById: id => byId[id] || mkEl(), querySelector: () => mkEl(), querySelectorAll: () => [], createElement: mkEl, addEventListener: noop, body: mkEl() };
try { Object.defineProperty(globalThis, "navigator", { value: { language: "en-US" }, configurable: true }); } catch {}
globalThis.location = { hostname: "localhost", protocol: "file:" };
globalThis.localStorage = { getItem: () => null, setItem: noop, removeItem: noop };
globalThis.setInterval = () => 0; globalThis.clearInterval = noop; globalThis.setTimeout = () => 0;

const html = fs.readFileSync("index.html", "utf8");
const files = [...html.matchAll(/<script src="(js\/[^"]+)"><\/script>/g)].map(m => m[1]);
(0, eval)(files.map(f => fs.readFileSync(f, "utf8")).join("\n") + "\nglobalThis.showSellRecommendation=showSellRecommendation;globalThis.sellState=sellState;");

const css = fs.readFileSync("styles.css", "utf8");
const V = { make: "Porsche", model: "911", year: 1973, trim: "Carrera RS" };
const LABEL = { powerseller: "Step 8 = Yes, PowerSeller", diy: "Step 8 = No, handle it myself", unsure: "Step 8 = Not sure" };

for (const pref of ["powerseller", "diy", "unsure"]) {
  msgs.children.length = 0;
  globalThis.fetch = async () => ({ ok: true, json: async () => DEC });
  Object.assign(sellState, { carName: "1973 Porsche 911 Carrera RS", resolvedVehicle: V, vehicleIdentityValidated: true,
    region: "US", state: "CA", sellerPreference: pref,
    involvement: pref === "diy" ? "I'll manage it myself" : pref === "powerseller" ? "Want someone to handle everything" : "Not sure",
    price: "", timeline: "", mileage: "", condition: "", records: "", title: "", notes: "" });
  await showSellRecommendation();
  const body = msgs.children.map(c => c.innerHTML).join("\n");
  const page = `<style>${css}</style>
  <div style="max-width:760px;margin:0 auto;padding:24px">
    <div style="font:600 13px/1.4 system-ui;letter-spacing:.04em;text-transform:uppercase;color:#8a7a55;margin-bottom:14px">${LABEL[pref]} · 1973 Porsche 911 Carrera RS · US</div>
    <div id="msgs" class="chat">${body}</div>
  </div>`;
  const path = `${OUT}/layout-${pref}.html`;
  fs.writeFileSync(path, page);
  console.log(path);
}
