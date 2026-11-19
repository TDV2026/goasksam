// mcVinLiveCheck (Lane E, Nov 11 2026): THE MARKET CHECK VIN ANSWER, WHEN THE CAR IS AT AUCTION NOW.
// CAUSE: Lane B's identity answer carries vinLiveMatch.listing (title, venue, url, photo, endsAt, endsLine, mileage, currentBidUsd, location) for a VIN that is in the live pool and has no recorded sale (api/vehicleIdentity.js, lib/vinLiveMatch.js); public/js/onebox.js read the answer, ran the market read and showed nothing of the listing, so the page said "No recorded sale for this VIN" about a car that is for sale right now.
// AFFECTS: Market Check results for a VIN, the live page and (it is the same script) the new design's results page; the decode-question screen of a VIN the listing could not name (the card sits above that question too). Find's cards and the Sell pages do not read this field.
// THE RULE: the listing is printed as the engine sent it, a card ABOVE the market read, with "View this auction"; each part prints only when the field carries it; no field, no card. The page words and decides nothing (the time left is the engine's endsLine).
// Offline, in Chrome, from the recorded 1995 911 market answer (scripts/fixtures/mcSell) with an identity answer made here.   node scripts/mcVinLiveCheck.mjs [--mutants]
import fs from "node:fs"; import path from "node:path"; import { execFileSync } from "node:child_process"; import { fileURLToPath } from "node:url";
const HERE = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.join(HERE, "..");
if (process.argv.includes("--mutants")) {
  const F = "public/js/onebox.js";
  const MUT = [
    ["the listing card not printed", 'head = vinLiveCardHtml(vinLive) + head;', "head = head;"],
    ["the listing card printed below the market read's first note", 'head = vinLiveCardHtml(vinLive) + head;', "head = head + vinLiveCardHtml(vinLive);"],
    ["View this auction dropped", '<a class="vlc-v" data-view-auction href="', '<a class="vlc-v" data-x href="" hidden data-h="'],
    ["a current bid printed when the field carries none", "if (isFinite(bid) && bid > 0) facts.push", "if (true) facts.push"],
    ["a mileage printed when the field carries none", "if (isFinite(mi) && mi > 0) facts.push", "if (true) facts.push"],
    ["the engine's time left line replaced by the page's own words", "[l.venue, l.endsLine]", '[l.venue, "Ends soon"]'],
    ["a card for a listing with no link", 'typeof l.url === "string" && /^https:\\/\\//.test(l.url) ? l : null;', "l;"]
  ];
  let bad = 0;
  for (const [name, from, to] of MUT) { const f = path.join(ROOT, F), orig = fs.readFileSync(f, "utf8"); if (!orig.includes(from)) { console.log("MUTANT NOT APPLICABLE: " + name); bad++; continue; } let code = 0;
    try { fs.writeFileSync(f, orig.replace(from, () => to)); try { execFileSync("node", [fileURLToPath(import.meta.url)], { stdio: "pipe" }); } catch (e) { code = e.status || 1; } } finally { fs.writeFileSync(f, orig); }
    console.log((code ? "caught   " : "MISSED   ") + "without " + name); if (!code) bad++; }
  console.log(bad ? "mcVinLiveCheck mutants: " + bad + " not caught" : "mcVinLiveCheck mutants: all " + MUT.length + " caught"); process.exit(bad ? 1 : 0);
}
const { open, launch, loadFixtures, CHROME } = await import("./mcSellHarness.mjs");
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
if (!fs.existsSync(CHROME)) { console.log("mcVinLiveCheck: SKIP no Chrome at " + CHROME); process.exit(0); }
const VIN = "WP0AF2A92GS187171", base = loadFixtures("mc-1995-porsche-911");
const LISTING = { title: "2016 Porsche 911 GT3 RS", venue: "Sotheby's Motorsport", url: "https://auction.test/lot/gt3rs", photo: "https://img.test/gt3rs.jpg", endsAt: new Date(Date.now() + 30 * 3600e3).toISOString(), endsLine: "Ends tomorrow", mileage: 6000, currentBidUsd: 180000, location: "Zuffenhausen, DE" };
const identity = listing => ({ status: 200, contentType: "application/json", body: JSON.stringify({ status: "valid", vehicle: { vin: VIN, year: 1995, make: "Porsche", model: "911", bodyStyle: "coupe" }, clarification: null, corrections: [{ type: "vin_live_match", to: "1995 Porsche 911" }], ...(listing ? { vinLiveMatch: { displayName: "1995 Porsche 911", listing } } : {}) }) });
const b = await launch();
async function probe(listing, width = 1440) {
  const fx = { ...base, [`POST /api/vehicleIdentity {"text":"${VIN}"}`]: identity(listing) };
  const p = await open(b, "/market-check?vin=" + VIN, { width, fixtures: fx, settle: 3500, images: "stub" });
  const r = await p.evaluate(() => { const c = document.querySelector("[data-vin-live]"); if (!c) return { card: false }; const txt = c.innerText.replace(/\s+/g, " "), note = document.querySelector(".vinnosale"), ans = document.querySelector('[data-stage="answer"], .anscard'), top = e => e ? e.getBoundingClientRect().top + scrollY : null, v = c.querySelector("[data-view-auction]"), img = c.querySelector("img"), h3 = c.querySelector("h3");
    return { card: true, txt, h3: h3 && h3.textContent, view: v && { text: v.textContent.trim(), href: v.getAttribute("href"), target: v.getAttribute("target") }, img: img && img.getAttribute("src"), above: (!note || top(c) < top(note)) && (!ans || top(c) < top(ans)), hasNote: !!note, hasAnswer: !!ans, vw: innerWidth, scrollW: document.documentElement.scrollWidth, cw: c.getBoundingClientRect().width }; });
  r.err = p._err.slice(); await p.close(); return r;
}
for (const w of [1440, 390]) {
  const r = await probe(LISTING, w);
  ok(r.card, `@${w}: the listing card is printed for a VIN at auction now`); if (!r.card) continue;
  ok(r.h3 === LISTING.title, `@${w}: the title is as sent (${r.h3})`);
  ok(r.txt.includes(LISTING.venue + " · " + LISTING.endsLine), `@${w}: the venue and the engine's time left line are printed together as sent (${r.txt.slice(0, 120)})`);
  ok(/6,000 miles/.test(r.txt) && /Current bid \$180,000/.test(r.txt) && r.txt.includes(LISTING.location), `@${w}: the mileage, the current bid and the location are printed as sent`);
  ok(!!r.view && r.view.text === "View this auction" && r.view.href === LISTING.url && r.view.target === "_blank", `@${w}: "View this auction" is a link to the listing (${JSON.stringify(r.view)})`);
  ok(r.img === LISTING.photo, `@${w}: the photo is the listing's (${r.img})`);
  ok(r.above && r.hasNote && r.hasAnswer, `@${w}: the card is above the market read (note ${r.hasNote}, answer ${r.hasAnswer}, above ${r.above})`);
  ok(r.scrollW <= r.vw + 1 && r.cw <= r.vw, `@${w}: the card fits the screen (${r.cw} in ${r.vw}, page ${r.scrollW})`);
  ok(r.err.length === 0, `@${w}: no page errors (${r.err.join("; ")})`);
}
{ const r = await probe({ title: LISTING.title, url: LISTING.url });   // only a title and a link: nothing else is carried
  ok(r.card && !/miles|Current bid|Ends|Zuffenhausen|Sotheby/.test(r.txt) && r.img == null && r.view && r.view.href === LISTING.url, `a listing that carries only a title and a link prints only those (${r.txt})`); }
{ const r = await probe({ ...LISTING, mileage: null, currentBidUsd: null, location: null, photo: null, endsLine: null }); ok(r.card && !/miles|Current bid|Zuffenhausen|Ends/.test(r.txt) && r.img == null && r.txt.includes(LISTING.venue), `a listing without mileage, bid, location, photo or time left prints none of them (${r.txt})`); }
{ const r = await probe({ ...LISTING, url: null }); ok(!r.card, "a listing with no link prints no card"); }
{ const r = await probe(null); ok(!r.card, "an answer with no vinLiveMatch prints no card"); }
await b.close();
console.log(`mcVinLiveCheck: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
