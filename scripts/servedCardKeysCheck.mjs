// SERVED CARD FIELDS (Lane B, Nov 5 2026; Lane E's id on the Buy card answer). THE CLASS: the sale rows a card answer hands to a page (lib/live/search.js cardAnswerOf for Find and Buy, lib/sell/sellFacts.js cardAnswerOf for Sell) carry a short whitelist of keys, never the engine's diagnostic row.
// Must hold on every mapper that slims the engine's cards:
//  (1) every served key is on the whitelist: id (the sale's archive key, a UUID, already served on Market Check's own cards), price, date, mi, rangeLabel, title, image, venue, url, gearbox;
//  (2) no key can carry a person, a place or a vehicle number: vin, vinNorm, seller, owner, name, email, phone, city, state, address, ip, user; none of them survives a card that has them all;
//  (3) size: one served card stays under 900 bytes for a realistic sale, and its id is at most 64 characters and a plain string (a UUID), so a page can match options[i].saleIds to its sales and nothing else.
//   node scripts/servedCardKeysCheck.mjs [repo root]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
let failed = 0; const ok = (n, c, d) => { if (!c) failed++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`); }, okMain = ok;
const ALLOWED = new Set(["id", "price", "date", "mi", "rangeLabel", "title", "image", "venue", "url", "gearbox"]);
const FORBIDDEN = /^(vin|vinNorm|vin_norm|seller|sellerName|owner|name|email|phone|city|state|address|ip|user|userId|source_id|raw_title|rtitle)$/i;
const SENSITIVE = { id: "7b37ba2e-ef5f-4067-bfa9-00193d7b1e7f", price: 225000, date: "2026-08-13", mi: 12000, milesHidden: false, rangeLabel: null, title: "1937 Delahaye 135 Cabriolet", image: "https://img.example/1.jpg", platformName: "Bring a Trailer", url: "https://example.com/1", gearboxWord: "manual",
  vin: "VF123", vinNorm: "VF123", vin_norm: "VF123", seller: "someone", sellerName: "Someone", owner: "Owner", name: "Name", email: "a@b.c", phone: "555", city: "Austin", state: "TX", address: "1 Main", ip: "1.2.3.4", user: "u", userId: "u1", source_id: "s", raw_title: "raw", rtitle: "raw" };
// the object literal a mapper builds, read from the source: the text from "c => ({" to its matching "})"
const mapperOf = (src, from) => { const i = src.indexOf("d.cards.map(", from); if (i < 0) return null; const j = src.indexOf("({", i); let depth = 0, k = j + 1; for (; k < src.length; k++) { if (src[k] === "{") depth++; else if (src[k] === "}") { depth--; if (depth === 0) break; } } return src.slice(j, k + 2); };
const judge = (name, literal, ok = okMain) => {
  let out = null; try { out = new Function("c", "return " + literal)(SENSITIVE); } catch (e) { ok(`${name}: the mapper can be read`, false, String(e.message)); return; }
  const keys = Object.keys(out);
  ok(`${name}: every served key is on the whitelist`, keys.every(k => ALLOWED.has(k)), JSON.stringify(keys.filter(k => !ALLOWED.has(k))));
  ok(`${name}: no person, place or vehicle-number key survives a card that has them all`, !keys.some(k => FORBIDDEN.test(k)) && !JSON.stringify(out).match(/VF123|someone|a@b\.c|Austin|1\.2\.3\.4/i), JSON.stringify(keys.filter(k => FORBIDDEN.test(k))));
  ok(`${name}: one served card is under 900 bytes`, JSON.stringify(out).length < 900, String(JSON.stringify(out).length));
  if ("id" in out) ok(`${name}: the id is a plain string of 64 characters or fewer (a UUID)`, typeof out.id === "string" && out.id.length <= 64 && /^[0-9a-f-]{36}$/i.test(out.id), String(out.id));
};
for (const f of ["lib/live/search.js", "lib/sell/sellFacts.js"]) {
  const src = fs.readFileSync(path.join(root, f), "utf8"), at = src.indexOf("function cardAnswerOf");
  ok(`${f}: cardAnswerOf is there`, at >= 0);
  if (at < 0) continue;
  const lit = mapperOf(src, at); ok(`${f}: cardAnswerOf slims the engine's cards with a mapper`, !!lit);
  if (lit) judge(f, lit);
}
// the negative controls: a mapper that serves a vehicle number, a place or a whole row FAILS the same judge
{ let caught = 0; const quiet = (n, c) => { if (!c) caught++; };   // the controls are meant to fail the judge; they are counted, not printed
  judge("control: adds vinNorm and city", "({ id: c.id, price: c.price, vinNorm: c.vinNorm, city: c.city })", quiet);
  judge("control: spreads the whole row", "({ ...c })", quiet);
  ok("the judge catches a mapper that serves a vehicle number, a place or the whole row", caught >= 4, `${caught} failures caught`); }
console.log(failed ? `servedCardKeysCheck: ${failed} FAIL` : "servedCardKeysCheck: PASS");
process.exit(failed ? 1 : 0);
