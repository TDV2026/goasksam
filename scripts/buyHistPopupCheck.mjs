// BUY STAGE 1e ITEM 3 (Sam, Oct 21 2026): the history popup opens over the page (fixed, centred, above everything, a scrim
// behind it; the X, an outside click or Escape closes it), never inside the card where it was cut off at the card's edge.
// Its rows are the card's own earlier appearances (photo, date, miles, price). Rendered here for the 1996 Porsche 911 Turbo
// in 'red Porsche 911' (its timeline as read live Oct 21 2026: Sep 21 2026, Bring a Trailer, sold $306,000, 31,000 miles,
// with its photo). No network.
//   node scripts/buyHistPopupCheck.mjs     exit 1 on any failure.
import fs from "node:fs";
import { priorSold, priorWords, priorTake } from "../lib/live/priorListing.js";
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const buy = fs.readFileSync(new URL("../api/buy.js", import.meta.url), "utf8");
const c = JSON.parse(/^const CLIENT = (".*");$/m.exec(buy)[1]), css = JSON.parse(/^const BUY_CARD_CSS = (".*");$/m.exec(buy)[1]);
const line = from => { const a = c.indexOf(from); if (a < 0) throw new Error("missing " + from); return c.slice(a, c.indexOf("\n", a)) + "\n"; };
const block = (from, to) => { const a = c.indexOf(from), b = c.indexOf(to, a); if (a < 0 || b < 0) throw new Error("missing " + from); return c.slice(a, b); };
const oh = block("  function openHist(btn){", "  // A group of more than 3");
ok(/pop\.className = "hpop modal"/.test(oh) && /document\.body\.appendChild\(sc\); document\.body\.appendChild\(pop\);/.test(oh) && !/art\.appendChild\(pop\)/.test(oh) && !/matchMedia/.test(oh), "the popup is appended to the page (with its scrim) at every width, never inside the card");
ok(/pop\.setAttribute\("aria-modal", "true"\)/.test(oh) && /x\.focus\(/.test(oh), "a dialog, focus on its X");
ok(/\.hpop\.modal\{position:fixed;left:50%;top:50%;[^}]*transform:translate\(-50%,-50%\);[^}]*z-index:200\}/.test(css) && /\.hscrim\{z-index:199\}/.test(css), "fixed, centred, above everything (the scrim just under it)");
ok(/sc\.setAttribute\("data-hpclose", ""\)/.test(oh) && /if \(e\.target\.closest\("\[data-hpclose\]"\)\) \{ e\.preventDefault\(\); return closeOverlays\(\); \}/.test(c), "a click outside (on the scrim) or on the X closes it");
ok(/document\.addEventListener\("keydown", function\(e\)\{ if \(e\.key === "Escape"\) \{ closeOverlays\(\);/.test(c), "Escape closes it");
// The rows, rendered for the 1996 Turbo.
const env = "var HOUSE = {}, MON3 = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];\nfunction esc(s){ return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/\"/g,'&quot;'); }\n" +
  [priorSold, priorWords, priorTake].map(f => f.toString()).join("\n") + "\n" + line("  function usd(n){") + line("  function num(n){") + line("  function monShort(d){") + line("  function okUrl(u){") + line("  function sameCar(l){") + block("  function histHtml(l){", "  function openHist(btn){");
const histHtml = new Function(env + "\nreturn histHtml;")();
const turbo = { id: 109318, miles: 31200, history_url: "/vin/WP0AC2995TS375142", timeline: [{ date: "2026-09-21", house: "Bring a Trailer", result: "sold", price: 306000, url: "https://bringatrailer.com/listing/1996-porsche-911-turbo-216/", miles: 31000, photo: "https://bringatrailer.com/wp-content/uploads/2026/08/DSC01527-scaled-copy-2026-08-20-m7f-54157.jpg?w=940" }] };
const h = histHtml(turbo), text = h.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
ok(/This car has sold before/.test(text), "the heading states the fact (sold before)");
ok(/Sep 2026/.test(text) && /31,000 miles/.test(text) && /Sold for \$306,000/.test(text) && /<img src="https:\/\/bringatrailer\.com\/wp-content\/uploads\/2026\/08\/DSC01527/.test(h), "the row shows its photo, date, miles and price (never empty)");
ok(/See full history/.test(text), "the full history link stays");
ok((h.match(/class="hp-row"/g) || []).length === 1, "one earlier appearance, one row");
console.log(`buyHistPopupCheck: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
