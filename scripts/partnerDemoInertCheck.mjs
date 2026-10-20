// THE AMAZON AUTOS DEMO IS INERT AND CLEAN (Sam's spec, Oct 20 2026; Lane C). On every tab and for every demo car: no form
// collects anything (the only form is the demo's own car box, a GET to the demo's own gated path); no link leaves the demo
// (the only links are its own tabs); every partner control is a plain button marked data-inert, and the page's script
// stops its default; no VIN printed; no venue names, verdict words, source counts, "our data", "AI" or dashes; noindex;
// the logo served only behind the gate. The eBay page is untouched. No network.
//   node scripts/partnerDemoInertCheck.mjs     exit 1 on any failure.
import fs from "node:fs";
import { amazonPageHtml, AMAZON_PROFILE } from "../api/_amazonDemo.js";
import { carOf, DUMMY } from "../api/partnerDemo.js";
import { DEMO_CARS } from "../api/partnerAnswer.js";
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const VERDICT = /\b(overpriced|underpriced|good deal|great deal|fair price|above market|below market|deal score|price score|bargain)\b/i;
const VENUE = /bring ?a ?trailer|cars ?(&|and) ?bids|pcar ?market|hagerty|gooding|sotheby|bonhams|mecum|barrett|broad ?arrow|hemmings|collecting ?cars|car ?& ?classic|pistonheads|all ?collector|mb ?market|autohunter/i;
for (const view of ["a", "b", "c"]) for (const car of [...DEMO_CARS, "1965 Ford Mustang Fastback"]) {
  const h = amazonPageHtml(view, car, { carOf, listing: DUMMY }), tag = `${view} ${car}`;
  const body = h.replace(/<script>[\s\S]*<\/script>/, "").replace(/<style>[\s\S]*?<\/style>/, "");
  const forms = body.match(/<form\b[^>]*>/g) || [];
  ok(forms.length === 1 && /id="car-form" method="get" action="\/preview"/.test(forms[0]), `${tag}: the only form is the demo's own car box (GET to the gated demo path)`);
  const names = (body.match(/\bname="([^"]+)"/g) || []).map(x => x.slice(6, -1));
  ok(names.every(n => ["p", "view", "car", "robots", "viewport"].includes(n)), `${tag}: no input collects anything but the car box (${names.join(",")})`);
  ok(!/method="post"/i.test(body), `${tag}: nothing posts`);
  const hrefs = (body.match(/\bhref="([^"]*)"/g) || []).map(x => x.slice(6, -1));
  ok(hrefs.every(u => /^\?p=amazon&amp;view=[abc](&amp;car=[^"]*)?$/.test(u)), `${tag}: the only links are the demo's own tabs (${hrefs.filter(u => !/^\?p=amazon/.test(u)).join(" ")})`);
  ok(!/target="_blank"|javascript:/i.test(body), `${tag}: nothing opens elsewhere`);
  const buttons = body.match(/<button\b[^>]*>/g) || [];
  ok(buttons.every(b => /type="button"/.test(b) ? /data-inert|data-mc-toggle|data-hist|data-close|data-a-go|data-b-go|data-qsend/.test(b) : /type="submit"/.test(b)), `${tag}: every partner control is an inert button`);
  const sub = buttons.filter(b => /type="submit"/.test(b)); ok(sub.length === 1, `${tag}: one submit, the car box's Show`);
  ok(!/WP0AC2A9XES183617|\b[A-HJ-NPR-Z0-9]{17}\b/.test(body), `${tag}: no VIN printed`);
  const text = body.replace(/<[^>]+>/g, " ");
  ok(!VERDICT.test(text) && !VENUE.test(text) && !/our data|\bAI\b|[–—]/.test(text), `${tag}: no verdict words, venue names, "our data", "AI" or dashes`);
  ok(/<meta name="robots" content="noindex,nofollow">/.test(h), `${tag}: noindex`);
  ok(/Prepared for Amazon/.test(body) && /src="\/preview\?img=amazon-logo"/.test(body) && /Sample listing/.test(body), `${tag}: the partner header, the logo from the gated demo, Sample listing on the listing frame`);
}
const js = fs.readFileSync(new URL("../api/_amazonDemo.js", import.meta.url), "utf8");
ok(/if \(t\.closest\("\[data-inert\]"\)\) \{ e\.preventDefault\(\); return; \}/.test(js) && /document\.addEventListener\("submit", function\(e\)\{ if \(e\.target\.closest\("\[data-inert\]"\)\) e\.preventDefault\(\); \}\);/.test(js), "the page's script stops every inert control's default");
ok(/fetch\("\/api\/partnerAnswer"/.test(js) && !/fetch\("(?!\/api\/partnerAnswer)/.test(js), "the page reads only the partner answer path");
ok(/var scope = ok && inScope\(a\), p = scope \? samplePrice\(a\) : null;/.test(js) && /\$\("c-mc"\)\.hidden = !scope;/.test(js), "outside the pilot scope: no module and no sample price");
ok(/Sample asking price/.test(js) && /if \(!a \|\| a\.ok === false \|\| a\.question \|\| !a\.range/.test(js), "the sample asking price only inside an engine range, labelled exactly");
ok(/"This car has sold before" : "This car was listed before"/.test(js), "the history popup heading: sold before only when a prior listing sold");
const d = fs.readFileSync(new URL("../api/partnerDemo.js", import.meta.url), "utf8");
ok(/if \(!isCrewRequest\(req\) && !isPartnerRequest\(req\)\) return notFound\(res\);[\s\S]*req\.query\.img === "amazon-logo"[\s\S]*req\.query\.p === "amazon"/.test(d), "the Amazon page and its logo sit behind the same gate (crew cookie or partner cookie)");
const logo = fs.readFileSync(new URL("../api/_amazonLogo.js", import.meta.url), "utf8");
const svg = Buffer.from((/AMAZON_LOGO_SVG_B64 = "([^"]+)"/.exec(logo) || [])[1] || "", "base64").toString("utf8");
ok(/^<\?xml[\s\S]*<svg /.test(svg) && !/<script|href=|xlink/i.test(svg), "the logo is a plain SVG with no script and no external reference");
ok(AMAZON_PROFILE.attribution === "Powered by GoAskSam" && AMAZON_PROFILE.moduleName === "Market Check", "the profile: presentation only");
// Sam's decision 6: on the Amazon profile the page's own lines read without "Sam"; the eBay demo keeps its own words.
ok(/Reading the sales for this one\./.test(js) && /The sales could not be read just now\. Try again in a minute\./.test(js) && !/Sam is reading the sales for this one\.|Sam could not read the sales just now/.test(js), "Amazon: 'Reading the sales for this one.' and 'The sales could not be read just now. Try again in a minute.'");
ok(/a\.line \|\| STILL_LINE/.test(js), "Amazon: the engine's own still-reading line is shown as the engine words it");
ok(/Sam is reading the sales for this one\./.test(d) && /Sam could not read the sales just now\. Try again in a minute\./.test(d) && !/Reading the sales for this one\.(?<!Sam is reading the sales for this one\.)/.test(d.replace(/Sam is reading the sales for this one\./g, "")), "eBay: its own words unchanged");
ok(/ask\(LIST && LIST\.vin && q === CAR \? \{ q: q, vin: LIST\.vin \} : \{ q: q \}\)/.test(js) && /\$\("b-vin"\)\.value = CAR;/.test(js), "tab b: the listing car's VIN goes with the read, never into the page");
ok(/<input id="b-price" disabled placeholder="Set by the dealer"/.test(amazonPageHtml("b", DEMO_CARS[0], { carOf, listing: DUMMY })), "tab b: the asking price is the dealer's, an empty disabled field, no suggested price");
const hb = amazonPageHtml("b", DEMO_CARS[0], { carOf, listing: DUMMY }); ok(hb.indexOf('id="b-out"') < hb.indexOf('id="b-price"'), "tab b: the engine card sits above the asking price field");
ok(/See your trade-in offer/.test(hb) && /Shop these cars/.test(hb), "tab a: the two inert next steps");
// A listing is one car: the Mustang demo listing is a Fastback and reads as one; the engine's question elsewhere has working options.
const hm = amazonPageHtml("c", "1965 Ford Mustang", { carOf, listing: DUMMY });
ok(/<h1>1965 Ford Mustang Fastback<\/h1>/.test(hm) && /var LISTCAR = "1965 Ford Mustang Fastback"/.test(hm) && /\{ q: LISTCAR \|\| CAR \}/.test(js), "tab c: the Mustang sample listing is a Fastback and the engine reads it as one (no body question on a listing)");
ok(/data-qsend="' \+ esc\(JSON\.stringify\(o\.send \|\| \{\}\)\)/.test(js) && /ask\(send\)\.then\(draw\)/.test(js), "the engine's question shows its own options; one asks the engine again with that option's own words");
console.log(`partnerDemoInertCheck: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
