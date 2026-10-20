// AMAZON DEMO REVISION 3, STAGE R3-A (Sam, Oct 20 2026, items 1 and 2): ONE current car across the four tabs, and the
// decoded name and VIN under every box. Any entry (the top box, tab a's box, tab b's box) sets the car, rewrites the
// address without a reload, and every tab link and box carries it; the name line is drawn from the answer's own
// car field {name, vin, from} and from nothing else. Tab b's label reads "VIN or year, make and model". No network.
//   node scripts/amazonCarStateCheck.mjs     exit 1 on any failure.
import { amazonPageHtml } from "../api/_amazonDemo.js";
import { carOf, DUMMY } from "../api/partnerDemo.js";
import { AMAZON_DEMO_CARS } from "../api/_amazonDemoCars.js";
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const VIN = "1G1YY12S035102964";
for (const v of ["a", "b", "c", "d"]) for (const car of [VIN, "3", AMAZON_DEMO_CARS[1], "1995 BMW M3"]) {
  const h = amazonPageHtml(v, car, { carOf, listing: DUMMY }), tag = `${v} ${car}`;
  const html = h.replace(/<script>[\s\S]*<\/script>/, "");
  const links = [...html.matchAll(/<a href="([^"]+)" data-view="([abcd])"/g)];
  const want = car === "3" ? AMAZON_DEMO_CARS[3] : car;
  ok(links.length === 4 && links.every(([, href, k]) => href === `?p=amazon&amp;view=${k}&amp;car=${encodeURIComponent(want)}`), `${tag}: all four tab links carry the one current car`);
  ok(new RegExp(`id="car-in" name="car" value="${want.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`).test(html), `${tag}: the top box holds the current car`);
  ok(/id="a-q"[^>]*value="/.test(html) && /id="b-vin"[^>]*value="/.test(html), `${tag}: tab a's box and tab b's box hold it too`);
  ok((html.match(/data-carname hidden/g) || []).length === 3, `${tag}: a name line under the top box, tab a's box and tab b's box`);
  ok(/<label for="b-vin">VIN or year, make and model<\/label>/.test(html), `${tag}: tab b's label`);
}
{ const h = amazonPageHtml("a", "", { carOf, listing: DUMMY });
  ok(/<a href="\?p=amazon&amp;view=c" data-view="c"/.test(h) && /id="car-in" name="car" value=""/.test(h), "no car entered: the links and the box stay plain (the first demo car by default)"); }
const h = amazonPageHtml("c", VIN, { carOf, listing: DUMMY }), js = h.slice(h.indexOf("<script>") + 8, h.lastIndexOf("</script>"));
ok(/function setCar\(t\)\{/.test(js) && /history\.replaceState\(null, "", "\?p=amazon&view=" \+ VIEW \+ "&car=" \+ enc\)/.test(js), "an entry rewrites the address without a reload (replaceState)");
ok(!/location\.(reload|assign|replace|href\s*=)/.test(js), "the script never reloads or navigates");
ok(/querySelectorAll\("\.tabs a\[data-view\]"\)[\s\S]*setAttribute\("href"/.test(js) && /\["car-in", "a-q", "b-vin"\]\.forEach/.test(js), "every tab link and every box is rewritten with the car");
ok(/function nameLine\(a\)\{ var k = a && a\.car; return k && k\.name \? String\(k\.name\) \+ \(k\.vin \? " \\u00b7 VIN " \+ String\(k\.vin\) : ""\) : ""; \}/.test(js), "the name and VIN line is drawn from the answer's own car field and nothing else");
ok(/function drawA\(a\)\{[^}]*setName\(a\)/.test(js.replace(/\n/g, " ")) || /function drawA\(a\)\{\s*var out = \$\("a-out"\); if \(!out\) return;\s*setName\(a\);/.test(js), "tab a draws the name line");
ok(/function drawB\(a\)\{\s*var out = \$\("b-out"\); if \(!out\) return;\s*setName\(a\);/.test(js) && /function drawC\(a\)\{\s*var ok = a && a\.ok !== false;\s*setName\(a\);/.test(js), "tabs b and c draw the name line");
ok(/if \(VIEW === "d"\) nameD\(\);/.test(js) && /read\(\{ q: CAR \}, setName\)/.test(js), "tab d names the car too (a demo car from its stored answer, a typed one from one read)");
ok(/document\.addEventListener\("submit", function\(e\)\{\s*if \(!e\.target\.closest \|\| !e\.target\.closest\("#car-form"\)\) return;/.test(js) && /startC\(true\)/.test(js), "the top box sets the car in the page on every tab");
ok(/q = setCar\(q\) \|\| q;/.test(js) && (js.match(/q = setCar\(q\) \|\| q;/g) || []).length === 2, "tab a's and tab b's boxes set the car before they read");
ok(/var GEN = 0;[\s\S]*if \(g === GEN\) draw\(a\)/.test(js), "a late answer for an earlier car is never drawn");
ok(!/[–—]/.test(h), "no dashes");
console.log(`amazonCarStateCheck: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
