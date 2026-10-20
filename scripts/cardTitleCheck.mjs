// A CARD SHOWS THE RECORD'S OWN TITLE (CLAUDE.md product rule 25; Lane E, Oct 20 2026, Lane F's ask). Offline, no network.
// Every card renderer is fed records whose own titles differ from what the buyer typed ("D50 D350" typed; the records are
// a "1985 Dodge Ramcharger" and a "1987 Dodge Raider"), and each card must show the record's title, never the typed
// words. Covered: the Buy card (api/buy.js CLIENT carTitle, the real function read out of the page code) and its server
// name (api/buySearch.js nameFromSpec, built from the listing's own resolved spec, with no search input); the partner
// answer's sale rows and its card with rows (api/partnerAnswer.js salesOf, cardWithRowsOf, partnerShape: the Amazon and
// eBay demos and Sell's shared card); Market Check's receipt card (public/js/onebox.js receiptCardHtml, the real
// function). A SEEDED VIOLATION (a renderer that prints the typed words) must FAIL the same assertion, so the check bites.
//   node scripts/cardTitleCheck.mjs     exit 1 on any failure
import fs from "node:fs";
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const TYPED = "D50 D350";
const RECS = [{ title: "1985 Dodge Ramcharger 4x4", year: 1985, make: "Dodge", model: "Ramcharger", price: 18500, date: "2026-08-14", mi: 61000 },
  { title: "1987 Dodge Raider", year: 1987, make: "Dodge", model: "Raider", price: 9200, date: "2026-07-02", mi: 88000 }];
// The one assertion: the record's own words are on the card and the typed words are not.
const ownTitle = (out, rec) => { const t = String(out || ""); return t.includes(rec.model) && !t.includes(TYPED); };
// Pull one named function's source out of a file's text (brace matched).
const fnSrc = (s, name) => { const i = s.search(new RegExp("function " + name + "\\s*\\(")); if (i < 0) throw new Error("no function " + name); let k = s.indexOf("{", i), d = 0; for (; k < s.length; k++) { if (s[k] === "{") d++; else if (s[k] === "}" && !--d) break; } return s.slice(i, k + 1); };

// 1. THE BUY CARD: carTitle from the page's own code (a JS string in api/buy.js), and the server's name.
{
  const raw = fs.readFileSync("api/buy.js", "utf8"); const i = raw.indexOf("const CLIENT = \""); const j = raw.indexOf("\";\n", i);
  const client = JSON.parse(raw.slice(i + 15, j + 1));
  const carTitle = new Function(fnSrc(client, "carTitle") + "\nreturn carTitle;")();
  for (const r of RECS) {
    ok(ownTitle(carTitle({ title: r.title, name: null }), r), `Buy card, no server name: "${r.title}" shows its own title`);
    ok(ownTitle(carTitle({ title: r.title, name: `${r.year} ${r.make} ${r.model}` }), r), `Buy card, server name: shows "${r.model}"`);
  }
  const { nameFromSpec } = await import("../api/buySearch.js");
  for (const r of RECS) ok(ownTitle(nameFromSpec({ make: r.make, model: r.model, year: r.year }, r.year), r), `Buy server name from the listing's own spec: "${r.model}"`);
  ok(nameFromSpec.length === 2 && !/query|typed|lastUser|filters/.test(nameFromSpec.toString().split("{")[0]), "nameFromSpec takes the listing's spec and year only, no search input");
}
// 2. THE PARTNER ANSWER (the Amazon and eBay demos, Sell's shared card): the rows and the card with rows.
{
  const { salesOf, cardWithRowsOf, partnerShape } = await import("../api/partnerAnswer.js");
  // A thin answer (no range): the card draws the engine's own sale rows (lib/sellsForCard.js), the shape the demos show.
  const cards = RECS.map(r => ({ title: r.title, year: r.year, make: r.make, model: r.model, price: r.price, date: r.date, mi: r.mi }));
  const d = { status: "one_box", tier: "thin", poolN: 2, thinLine: "Only two have sold, too few for a range.", cards, thin: { totalN: 2, receipts: RECS.map(r => ({ title: r.title, year: r.year, make: r.make, model: r.model, allIn: r.price, date: r.date, mileage: r.mi })) } };
  const rows = salesOf(d);
  for (const r of RECS) ok(rows.some(x => ownTitle(x.name, r)), `partner rows: "${r.model}" is named by its own record`);
  ok(rows.every(x => !String(x.name).includes(TYPED)), "partner rows: no row carries the typed words");
  const html = cardWithRowsOf(d) || "";
  for (const r of RECS) ok(ownTitle(html, r), `card with rows: "${r.model}" on the card, the typed words nowhere`);
  let shaped = null; try { shaped = partnerShape(d, TYPED, 0); } catch (e) { shaped = { error: e.message }; }
  ok(shaped && Array.isArray(shaped.sales) && RECS.every(r => shaped.sales.some(x => ownTitle(x.name, r))), `the partner answer for the typed "${TYPED}" names each sale by its record${shaped && shaped.error ? " (" + shaped.error + ")" : ""}`);
}
// 3. MARKET CHECK'S RECEIPT CARD: the real receiptCardHtml and its helpers from public/js/onebox.js.
{
  const s = fs.readFileSync("public/js/onebox.js", "utf8");
  const src = 'var OB_UTM = "utm_source=goasksam";\n' + ["esc", "usd", "utmUrl", "stripIdsFromTitle", "cleanReceiptTitle", "titleCaseSaleTitle", "receiptCardHtml"].map(n => fnSrc(s, n)).join("\n");
  const receiptCardHtml = new Function(src + "\nreturn receiptCardHtml;")();
  for (const r of RECS) ok(ownTitle(receiptCardHtml({ title: r.title, month: "Aug 2026", price: r.price, image: null, url: "https://example.com/x" }, false), r), `Market Check receipt: "${r.model}" shows its own title`);
}
// 4. THE SEEDED VIOLATION: a renderer that prints the typed words must fail the same assertion.
{
  const bad = r => `<div class="n">${TYPED}</div><p>${r.price}</p>`;
  ok(RECS.every(r => !ownTitle(bad(r), r)), "seeded violation (the typed name on the card) FAILS the own-title assertion, so this check bites");
}
console.log(`cardTitleCheck: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
