// THE REAL CARDS ON THE PREVIEWS (Lane E, Nov 8 2026, Sam: "the cards must BE the real cards"). A preview never draws a card of its own. Two components, both lifted from the live source by name, so a change to the live card is a change to the preview card:
//   FIND CARD      lib/findCardKit.js: Find's own client card(l) (api/buy.js), the same function the live Find results and the Tasks dashboard draw. It is fed an ENGINE CARD l (the object /api/buySearch returns for one listing; lib/tasks/fullCards.js builds it), nothing else.
//   TASK CARD      the dashboard's compactCard(t) and the watching row lookingItem(r), lifted by name from the dashboard client of /preview/tasks/mine (lib/preview/tasksApp.js TASKS_APP_JS), fed an engine Task row and an engine watching row.
// Nothing here words a figure or picks a car. The page hands the engine's objects to the component and prints what it prints. The pause and stop controls are shown disabled (a demo is not a live Task).
import { TASKS_APP_JS } from "./tasksApp.js";
import { LIVE_APP_CSS } from "./tasksAppFork.js";

export const TASK_KIT_NAMES = ["esc", "status", "compactCard", "lookingItem"];
function declarations(src) {
  const L = src.split("\n"), decl = [];
  L.forEach((l, i) => { const m = /^  function (\w+)\(/.exec(l); if (m) decl.push({ name: m[1], line: i }); });
  decl.forEach((d, k) => { let end = (decl[k + 1] ? decl[k + 1].line : L.length) - 1; while (end > d.line && /^\s*(\/\/|$)/.test(L[end])) end--; d.text = L.slice(d.line, end + 1).join("\n"); });
  return decl;
}
export function buildTaskKitSource(src = TASKS_APP_JS) {
  const by = new Map(); for (const d of declarations(src)) if (!by.has(d.name)) by.set(d.name, d);
  const missing = TASK_KIT_NAMES.filter(n => !by.has(n));
  if (missing.length) throw new Error("realCards: the dashboard client no longer declares " + missing.join(", ") + " (update TASK_KIT_NAMES)");
  return { code: TASK_KIT_NAMES.map(n => by.get(n).text).join("\n"), names: TASK_KIT_NAMES.slice() };
}
// window.GASTASK.card(t) is compactCard(t) with the controls disabled; window.GASTASK.watching(r) is lookingItem(r) in its list, Stop disabled. The closure state the dashboard keeps (open card, starting Tasks) is empty here.
export function taskKitJs() {
  const { code } = buildTaskKitSource();
  return "(function(){\n  var starting = {}, openId = null;\n" + code + "\n"
    + "  var off = function(h){ return String(h).replace(/<button /g, '<button disabled aria-disabled=\"true\" data-demo=\"1\" '); };\n"
    + "  window.GASTASK = { card: function(t){ return off(compactCard(t)); }, watching: function(r){ return '<ul class=\"lkdemo\">' + off(lookingItem(r)) + '</ul>'; } };\n})();";
}
// the live app's red and orange states are drawn in the brand forest on the previews (Sam: one accent), as /preview/tasks/mine does
export const TASK_CARD_CSS = LIVE_APP_CSS.split("\n").filter(l => !/^\.go\{/.test(l)).join("\n").replace(/#D7262C|#9b2c2c/gi, "#0B3126").replace(/rgba\(178,\s*34,\s*34,/g, "rgba(11,49,38,");
