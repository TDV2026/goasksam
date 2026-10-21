// BUY STAGE 1e ITEM 2 (Sam, Oct 21 2026): the exact-car history is one small clickable chip at the end of the card's chip
// row ("Sold before" when the Oct 15 rule, lib/live/priorListing.js priorSold, finds a sold appearance; else "Listed
// before"), opening the history popup. History adds no lines to a card, so no row grows because of it. No network.
//   node scripts/buyHistChipCheck.mjs     exit 1 on any failure.
import fs from "node:fs";
import { priorSold } from "../lib/live/priorListing.js";
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const buy = fs.readFileSync(new URL("../api/buy.js", import.meta.url), "utf8");
const c = JSON.parse(/^const CLIENT = (".*");$/m.exec(buy)[1]), css = JSON.parse(/^const BUY_CARD_CSS = (".*");$/m.exec(buy)[1]);
const block = (from, to) => { const a = c.indexOf(from), b = c.indexOf(to, a); if (a < 0 || b < 0) throw new Error("missing " + from); return c.slice(a, b); };
const line = from => { const a = c.indexOf(from); if (a < 0) throw new Error("missing " + from); return c.slice(a, c.indexOf("\n", a)) + "\n"; };
const env = "function esc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/\"/g,'&quot;'); }\nvar HOUSE = {}; var priorSold = " + priorSold.toString() + ";\n" + line("  function sameCar(l){") + line("  function histChipHtml(l){") + line("  function chipsHtml(l){");
const fns = new Function(env + "\nreturn { chipsHtml: chipsHtml };")();
const sold = { id: 7, chips: ["Guards Red over Cashmere Beige", "Clean title", "VIN WP0AC2…5142"], timeline: [{ date: "2026-09-21", result: "sold", price: 306000, miles: 31000 }] };
const listed = { id: 8, chips: ["Red"], timeline: [{ date: "2026-05-02", result: "not_sold", price: 90000 }] };
const seenOnly = { id: 9, chips: [], seen_before: { date: "2025-01-03", result: "sold", priceUsd: 50000 } };
const none = { id: 10, chips: ["Manual", "Red"] };
const h1 = fns.chipsHtml(sold), h2 = fns.chipsHtml(listed), h3 = fns.chipsHtml(seenOnly), h4 = fns.chipsHtml(none);
ok(/<span class="spec">Clean title<\/span><button type="button" class="spec hchip" data-hist="7" aria-expanded="false" aria-haspopup="dialog">Sold before<\/button><\/p>$/.test(h1) && !/VIN/.test(h1), "a car that sold before: 'Sold before' last in the chip row, beside 'Clean title' (the VIN pill stays out)");
ok(/>Listed before<\/button>/.test(h2) && !/Sold before/.test(h2), "only listed before (reserve not met): 'Listed before', never 'Sold before'");
ok(/^<p class="specs"><button type="button" class="spec hchip" data-hist="9"[^>]*>Sold before<\/button><\/p>$/.test(h3), "a card with no other chips gets the row with just the history chip (seen_before also counts)");
ok(!/hchip/.test(h4) && /Manual/.test(h4), "no history: no chip");
ok(!/Sam has seen this exact car before|seenHtml|See its earlier sale/.test(line("  function slInner(l){")), "the Sam area carries no history lines");
ok(/\.car \.specs \.spec\.hchip\{position:relative;z-index:2;cursor:pointer;color:var\(--green\)/.test(css), "styled as clickable, above the card's title link");
ok(/var hb = e\.target\.closest\("\[data-hist\]"\); if \(hb\) \{ e\.preventDefault\(\); return openHist\(hb\); \}/.test(c), "a click opens the history popup");
console.log(`buyHistChipCheck: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
