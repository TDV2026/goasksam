// THE FIND PAGE'S SCRIPT, FILLED THE WAY THE PAGE FILLS IT (Lane S, Nov 20 2026). api/buy.js holds its script (CLIENT) with placeholders (__KEEP_ICON__, __COLD_MISSED__, __LIVE_SITES__ ...) that the page replaces one by one at render time.
// CAUSE of Lane C's hold on lane-s-venue-names: priorListingCheck, offWindowCheck, findWatchCheck and standingControlsCheck each filled the placeholders by hand, a fixed list; a new placeholder (__LIVE_SITES__) was not on any list, so the script they built threw.
// CLASS: any check that builds the page's script. They all call fillBuyClient now: EVERY placeholder in the script is filled (a name given in `over` wins, the known ones have a stub, and any other gets an empty string), so a new placeholder never breaks them, and
// venueNamesCheck fails on a check that fills a placeholder by hand again. The names of the sites are the one map's (lib/venueNames.js), read from the keys api/buy.js holds.
import fs from "node:fs"; import path from "node:path"; import { fileURLToPath } from "node:url";
import { venueName } from "../lib/venueNames.js";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export function buyClientRaw(root = ROOT) {
  const src = fs.readFileSync(path.join(root, "api/buy.js"), "utf8"), m = /^const CLIENT = (".*");$/m.exec(src);
  if (!m) throw new Error("api/buy.js: could not find the const CLIENT line");
  return { src, client: JSON.parse(m[1]) };
}
export function fillBuyClient(client, over = {}, root = ROOT) {
  const src = fs.readFileSync(path.join(root, "api/buy.js"), "utf8"), keys = (/const LIVE_SITE_KEYS = (\[[^\]]*\]);/.exec(src) || [, "[]"])[1];
  const stub = { KEEP_ICON: '""', COLD_MISSED: '"COLD_MISSED"', COLD_READING: '"COLD_READING"', ANY_ANSWER: "function(){ return false; }", LIVE_SITES: JSON.stringify(JSON.parse(keys).map(venueName)), PRIOR: "" };
  let s = String(client);
  s = s.replace("/*__PRIOR__*/", () => (over.PRIOR != null ? over.PRIOR : stub.PRIOR));
  return s.replace(/__([A-Z][A-Z_]*[A-Z])__/g, (all, name) => (over[name] != null ? over[name] : stub[name] != null ? stub[name] : '""'));
}
