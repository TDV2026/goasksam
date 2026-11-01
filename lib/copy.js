// THE COPY FILE (Lane E, Nov 1 2026): the static public words of the pages (titles, meta descriptions, headings, intros, labels) live in data/copy.json, keyed by page and slot,
// so Sam can change a line in the GitHub editor without a rebuild. Pages call copy("about.TITLE") at render time and escape it as they always did. Words the engine writes (range
// sentences, left-out lines, bid lines, questions, chip labels) are NOT here: they stay with oneEngineAnswer. A missing key throws on purpose: a typo in a key must fail a check,
// never print a blank. A deploy ships the edit.
// A static JSON import, so the file ships with every function that imports this module (no includeFiles entry to forget).
import COPY from "../data/copy.json" with { type: "json" };
export function copyData() { return COPY; }
export function copy(key) {
  const [page, ...rest] = String(key).split(".");
  const v = copyData()[page] && rest.length ? copyData()[page][rest.join(".")] : undefined;
  if (v === undefined) throw new Error("copy: no entry for " + key + " in data/copy.json");
  return v;
}
// Text for an HTML text node: & < > are escaped, quotes and apostrophes stay as typed (the pages always printed them that way).
export function copyText(key) { return String(copy(key)).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
