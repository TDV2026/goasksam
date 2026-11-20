// A CARD WHOSE READ HAS NOT LANDED STILL SHOWS (Lane D, lane-d-placeholder-miles, Nov 19 2026; crew only, FORSALE_PUBLIC stays off). Before this a dealer or classified listing with no stored read was held back (read_pending), so the crew's count of cars for sale on
// "1987 Porsche 911" stayed at the cars the job had read so far (a catch up of 20,334 read groups). Now the card shows with its asking line and the Sam box reads "Sam's read is on its way." - no range, no number - and the box fills when the engine's read is stored.
// The read here is the engine's real output (the real listingMarket over a real archive of sales, scripts/_mustangWorld.mjs), stored by the prepare job's own readOf.
//   node scripts/forSaleHoldingCheck.mjs [repo root]
import path from "path"; import { fileURLToPath, pathToFileURL } from "url";
const root = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
let failed = 0; const ok = (n, c, d) => { if (!c) failed++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`); };
const imp = f => import(pathToFileURL(path.join(root, f)).href);
const { world } = await imp("scripts/_mustangWorld.mjs");
const { P, readFor, quiet } = await world(root); const unquiet = quiet();
const E = await imp("lib/onebox.js"), SV = await imp("lib/forsale/serve.js"), R = await imp("lib/forsale/rules.js");
const real = await readFor(45000); unquiet();   // the engine's real read of a 1965 Mustang with 45,000 miles
const stored = { ...real.read, engine_version: E.ENGINE_VERSION };
const row = extra => ({ id: 5, source: "streetside", source_type: "dealer", title: "1965 Ford Mustang", year: 1965, make: "Ford", model: "Mustang", asking_price_usd: 30000, mileage: 45000, location: "Greenland, NH", url: "https://x/1", image_url: null, last_seen: new Date().toISOString(), gone: false, hidden: false, status: "active", resolve_state: "resolved", car_key: "k", car: { key: "k", name: "1965 Ford Mustang", year: 1965, make: "Ford", model: "Mustang" }, read: null, history: null, ...extra });
const card = r => SV.cardOf({ r: { _fs: r } });
ok("the engine's real read is a range or the engine's own line, stored with this engine version", !!real.read && !!real.read.sold_line && real.read.engine_version, JSON.stringify(real.read && real.read.sold_line));
const landed = card(row({ read: stored })), none = card(row({ read: null })), old = card(row({ read: { ...stored, engine_version: "e1-old" } })), bare = card(row({ read: undefined }));
ok("the read has landed: the box holds the engine's own words and the asking line", landed.read === "Asking $30,000. " + real.read.sold_line && landed.readKind === real.read.kind, landed.read);
for (const [name, c] of [["no stored read", none], ["a stored read of another engine version", old], ["no read field at all", bare]]) {
  ok(`${name}: the card shows the asking line and the holding line`, c.read === "Asking $30,000. Sam's read is on its way." && c.readKind === "pending" && c.askingLine === "Asking $30,000", c.read);
  ok(`${name}: no range and no number in the Sam box (only the asking price)`, !/\bsold for\b/i.test(c.read) && c.read.replace("Asking $30,000.", "").replace(/\d/g, "").length === c.read.replace("Asking $30,000.", "").length, c.read);
}
ok("a read of another engine version never shows its numbers while it is held", !(real.read.low > 0) || !new RegExp(String(real.read.low).replace(/\B(?=(\d{3})+(?!\d))/g, ",")).test(old.read));
const held = r => R.heldBack(r, Date.now(), E.ENGINE_VERSION, null);
ok("the rules do not hold a resolved listing back for a read that has not landed (it is served)", held(row({ read: null })) === null && held(row({ read: { ...stored, engine_version: "e1-old" } })) === null && held(row({ read: stored })) === null);
ok("the rules still hold back what must not show: unresolved, no price, gone, stale", held(row({ resolve_state: "unresolved", car: null })) === "unresolved" && held(row({ asking_price_usd: 0 })) === "no_price" && held(row({ gone: true })) === "gone" && held(row({ hidden: true })) === "stale");
const RW = await imp("lib/reasonWords.js");
ok("the holding line is the engine's reason table's (pages compute nothing)", RW.REASON_TABLE["forsale.holding"] && RW.REASON_TABLE["forsale.holding"].text() === "Sam's read is on its way.");
console.log(failed ? `\n${failed} FAILED` : "\nall pass"); process.exit(failed ? 1 : 0);
