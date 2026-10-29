// "SEE THE SALES" AND THE SALE MODAL ON FIND (Sam, Oct 29 2026). Cause: the card's text button said "Market Check" (and "Sold prices" where Market Check is not released), a different word from what it does (it opens the card's
// inline panel of sales), and a sale line in the panel was a plain row that went nowhere, while "Sold before" opened a modal. One label on every card, "See the sales" (open) and "Hide the sales" (shut); every sale line in the panel opens
// the Sold before modal's own shape (photo, date, venue, miles, gearbox, price, link to the original listing). The panel keeps "Open full Market Check". Pages: every Find card (the grid, the rows, Tasks' cars, the history of a
// search), because Tasks lifts Find's card code (lib/findCardKit.js). The class: no sale on a Find card sends the visitor to Market Check for that sale.
//   node scripts/findSalesButtonCheck.mjs
import fs from "node:fs";
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const s = fs.readFileSync("api/buy.js", "utf8"), i = s.indexOf("const CLIENT = ") + "const CLIENT = ".length, C = JSON.parse(s.slice(i, s.indexOf('";\n', i) + 1));
const CODE = C.replace(/^\s*\/\/.*$/gm, "");   // the script without its comment lines: the words below are tested in the code, not in a note about the old words
const block = (from, to) => { const a = C.indexOf(from), b = C.indexOf(to, a); if (a < 0 || b < 0) throw new Error("missing " + from); return C.slice(a, b); };
const esc = x => String(x == null ? "" : x).replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
const usd = n => "$" + Math.round(Number(n)).toLocaleString("en-US"), num = n => Math.round(Number(n)).toLocaleString("en-US");
const monShort = d => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d || "")); return m ? ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][Number(m[2]) - 1] + " " + Number(m[3]) + ", " + m[1] : ""; };
const okUrl = u => /^https?:\/\//.test(String(u || ""));
const modal = new Function("esc", "usd", "num", "monShort", "okUrl", block("  function saleModalHtml(r){", "  function closeSale(){") + "\nreturn saleModalHtml;")(esc, usd, num, monShort, okUrl);
const monthYear = d => { const m = /^(\d{4})-(\d{2})/.exec(String(d || "")); return m ? ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][Number(m[2]) - 1] + " " + m[1] : ""; };
const row = new Function("esc", "usd", "num", "monthYear", block("  function mdRowHtml(r, k){", "  function drawerHtml(l, j){") + "\nreturn mdRowHtml;")(esc, usd, num, monthYear);
const sale = { title: "2010 Porsche 911 Carrera Cabriolet", price: 81500, date: "2026-07-01", mi: 27000, image: "https://img.test/a.jpg", venue: "Bring a Trailer", url: "https://bringatrailer.com/listing/x/", gearbox: "Manual" };
const m1 = modal(sale);
ok(/Jul 1, 2026/.test(m1) && /Bring a Trailer/.test(m1) && /27,000 miles/.test(m1) && />Manual</.test(m1) && /\$81,500/.test(m1) && /img.test\/a.jpg/.test(m1), "the modal shows photo, date, venue, miles, gearbox and price from the sale");
ok(/href="https:\/\/bringatrailer.com\/listing\/x\/"[^>]*>View the original listing/.test(m1) && !/market-check/i.test(m1), "the modal links to the original listing, never to Market Check");
ok(/class="hp-h"/.test(m1) && /class="hp-row"/.test(m1) && /data-salex/.test(m1), "it is the Sold before modal's own shape (hp-h, hp-row), closed by its own X");
ok(!/miles/.test(modal({ ...sale, mi: null })) && !/Manual/.test(modal({ ...sale, gearbox: null })) && !/View the original/.test(modal({ ...sale, url: "javascript:x" })), "a field the engine did not send is left off, and a non-web link is never a link");
const r1 = row(sale, 3);
ok(/<button type="button" class="md-rowb" data-sale="3"/.test(r1) && !/<a /.test(r1), "a sale line in the panel is a button that opens the modal (its index in the engine's list), not a link");
// the label, everywhere
ok(/"See the sales"/.test(C) && /"Hide the sales"/.test(C) && /class="act" data-mc="/.test(C), "the card's button is See the sales (Hide the sales when open)");
const act = block("<button type=\"button\" class=\"act\" data-mc=", "</div></div></article>");
ok(!/Market Check|Sold prices/.test(act), "the card's button carries no other label (no 'Market Check', no 'Sold prices')");
ok(/b\.textContent = open \? "Hide the sales" : "See the sales"/.test(CODE) && !/Close Market Check/.test(CODE), "open and shut, the same two words");
ok(/Open full Market Check ↗/.test(C), "the panel keeps its Open full Market Check button");
ok(/closest\("\[data-sale\]"\)/.test(C) && /closest\("\[data-salex\]"\)/.test(C) && /querySelector\("\[data-sale-modal\]"\)\) \{ closeSale\(\)/.test(C), "a sale line opens the modal, the X or the scrim or Escape closes only the modal (the panel stays)");
// the engine's fields reach the panel
const sr = fs.readFileSync("lib/live/search.js", "utf8"), on = fs.readFileSync("lib/onebox.js", "utf8");
ok(/venue: c\.platformName \|\| null, url: c\.url \|\| null, gearbox: c\.gearboxWord \|\| null/.test(sr), "the panel's sales carry the venue, the link and the gearbox word from the engine's cards");
ok(/gearboxWord: houseGearboxOf\(r,/.test(on), "the engine's sale cards carry gearboxWord");
// the class: nothing on a Find card sends a SALE to Market Check
// the Find card prints no sale line (ENGINE READY 10): the sales are in See the sales, and a sale line in that panel is a button that opens the modal, never a link to Market Check
const panelRow = block("  function mdRowHtml(", "  function drawerHtml(");
ok(!/saleLineText|data-fxsale="/.test(CODE), "the card's old sale-line builder is gone");
ok(!/<a /.test(panelRow) && !/market-check/.test(panelRow) && /data-sale="/.test(panelRow) && /<button type="button" class="md-rowb"/.test(panelRow), "a sale line in the panel is a button that opens the modal, never a link to Market Check");
console.log(`findSalesButtonCheck: ${pass} pass, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
