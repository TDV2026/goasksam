// AMAZON DEMO REVISION 2, STAGE R2-A, page side (Sam, Oct 20 2026; on Lane E's server side, lib/amazonDemoCase.js): the
// page titles the car "Used {year} {make} {model} ..." from the VIN's decode or the answer's identity, never the VIN
// (item 7); Key features come from the VIN's decode only (item 7); every typed VIN or car gets a visible answer, the
// three cases in Sam's words with the car's name (item 8). Runs the page's own functions on fixtures. No network.
//   node scripts/amazonCaseCheck.mjs     exit 1 on any failure.
import { amazonPageHtml } from "../api/_amazonDemo.js";
import { carOf, DUMMY } from "../api/partnerDemo.js";
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const h = amazonPageHtml("c", "1965 Ford Mustang", { carOf, listing: DUMMY }), js = h.slice(h.indexOf("<script>") + 8, h.lastIndexOf("</script>"));
const grab = name => { const i = js.indexOf("function " + name + "("); return js.slice(i, js.indexOf("\n  function ", i + 1)); };
const between = (a, b) => js.slice(js.indexOf(a), js.indexOf(b, js.indexOf(a)));
const env = between("var OUT_OF_SCOPE_LINE", "\n  // ") ;
const SCOPE = JSON.parse(/SCOPE = (\{.*?\}), VIEW/.exec(js)[1]);
const scopeFn = /var amazonInScope = ([\s\S]*?);\n  \/\/ the same scope/.exec(js)[1];
const kfDef = between("var KF = ", "\n  function kfHtml");
const mk = new Function("SCOPE", "var esc = function(x){ return String(x == null ? '' : x).replace(/[&<>\"]/g, function(c){ return ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'})[c]; }); };\nvar amazonInScope = " + scopeFn + ";\n" + env + "\n" + kfDef + "\n" + grab("amazonTitle") + "\n" + grab("kfHtml") + "\n" + grab("caseHtml") + "\n" + grab("wordsCaseHtml") + "\nreturn { amazonTitle: amazonTitle, kfHtml: kfHtml, caseHtml: caseHtml, wordsCaseHtml: wordsCaseHtml };")(SCOPE);
const t = s => String(s || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
// item 7: the title from the VIN's decode, never the VIN
const m3 = { ok: true, answerType: "range", identity: { year: 1995, make: "BMW", model: "M3" }, vinDecode: { year: 1995, make: "BMW", model: "M3", trim: null, body: "Coupe", features: { drivetrain: "Rear Wheel Drive", engine: "6 cylinders, 3.0 L", fuel: "Gasoline", transmission: "Manual, 5-speed" } }, range: { low: 21500, high: 36500 } };
ok(mk.amazonTitle(m3) === "Used 1995 BMW M3 Coupe", `WBSBF932XSEH00621's decode titles it "Used 1995 BMW M3 Coupe" (got "${mk.amazonTitle(m3)}")`);
ok(!/WBSBF932XSEH00621/.test(mk.amazonTitle(m3)) && mk.amazonTitle({ ok: true, identity: null, vinDecode: null }) === null, "never the VIN; no name, no title change");
const kf = t(mk.kfHtml(m3));
ok(/Drivetrain Rear Wheel Drive/.test(kf) && /Engine 6 cylinders, 3\.0 L/.test(kf) && /Fuel type Gasoline/.test(kf) && /Transmission Manual, 5-speed/.test(kf) && !/Seating|Interior|Exterior/.test(kf), "Key features from the decode only, unknown fields left out");
ok(mk.kfHtml({ ok: true, features: { engine: "V8" } }) === "", "nothing from anywhere but the VIN's decode");
// item 8: the three cases, in Sam's words, with the car's name
const un = t(mk.caseHtml({ ok: true, answerType: "vin_unreadable", line: "We couldn't read that VIN. Check it, or type the year, make and model." }));
ok(un === "We couldn't read that VIN. Check it, or type the year, make and model.", "(a) a VIN that cannot be read: Sam's line");
const oos = t(mk.caseHtml({ ok: true, answerType: "range", identity: { year: 2015, make: "Mercedes-Benz", model: "E-Class", variant: "E350" }, range: { low: 1, high: 2 } }));
ok(oos === "Market Check covers enthusiast and specialty cars in this pilot. 2015 Mercedes-Benz E-Class", `(c) outside the pilot scope: Sam's line and the car's name (got "${oos}")`);
const ns = t(mk.caseHtml({ ok: true, answerType: "zero_result", identity: { year: 1999, make: "Porsche", model: "911" }, thin: "No sales of this car yet.", sales: [] }));
ok(ns === "No sales of this car yet. 1999 Porsche 911", `(b) read with no sales: the engine's own line and the car's name (got "${ns}")`);
ok(mk.caseHtml(m3) === "", "an answer draws the card as before, no case line");
ok(t(mk.wordsCaseHtml("2015 Toyota Corolla")) === "Market Check covers enthusiast and specialty cars in this pilot. 2015 Toyota Corolla", "an out-of-scope car known from its words gets the line too, with no read");
ok(/var cs = caseHtml\(a\); if \(cs\) \{ out\.innerHTML = cs; return; \}/.test(grab("drawA")) && /var cs = caseHtml\(a\); if \(cs\) \{ out\.innerHTML = cs; return; \}/.test(grab("drawB")) && /\$\("c-case"\)\.innerHTML = scope \? "" : caseHtml\(a\);/.test(grab("drawC")), "tabs a, b and c all draw the case line");
ok(/<div id="c-case"><div class="case"><p class="case-l">Market Check covers enthusiast and specialty cars in this pilot\.<\/p><p class="case-n">2015 Toyota Corolla<\/p><\/div><\/div>/.test(amazonPageHtml("c", "2015 Toyota Corolla", { carOf, listing: DUMMY })), "tab c, an out-of-scope listing: the line from the first frame, no module, no read");
ok(!/[–—]/.test(js), "no dashes");
console.log(`amazonCaseCheck: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
