// TRIM-CHOICE DRAWS AS A QUESTION (Lane F, Oct 20 2026; the 1965 Mustang Coupe dead end): Market Check had no branch for
// the engine's tier "trim_choice", so it fell to the generic fallback ("Not enough real ... sales"), a claim the engine
// never made. A fixture trim_choice answer must draw the engine's own prompt and its own chips, each re-asking with
// that option's refine, and never the fallback. No network.
//   node scripts/trimChoiceDrawCheck.mjs     exit 1 on any failure.
import fs from "node:fs";
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const src = fs.readFileSync(new URL("../public/js/onebox.js", import.meta.url), "utf8");
const fnBody = name => { const i = src.indexOf("function " + name + "("); if (i < 0) return ""; const j = src.indexOf("\n  function ", i + 1); return src.slice(i, j < 0 ? undefined : j); };
const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const draw = new Function("esc", "lint", "carLabel", fnBody("idqScreenHtml") + "\n" + fnBody("trimChoiceTakeoverHtml") + "\nreturn trimChoiceTakeoverHtml;")(esc, s => s, c => [c.year, c.make, c.model].filter(Boolean).join(" "));
// The engine's own shape (lib/onebox.js, the TRIM QUESTION FIRST branch), as the Mustang Coupe answered it.
const d = { tier: "trim_choice", askIndex: 1, resolvedCar: { year: 1965, make: "Ford", model: "Mustang" }, prompt: "These sold as 3Speed and 4Speed, and they price differently. Which one is it?",
  trimOptions: [{ value: "3speed", label: "3Speed", n: 5 }, { value: "4speed", label: "4Speed", n: 4 }, { value: "other", label: "Other trims", n: 2, notTrims: ["3speed", "4speed"] }],
  trimChips: ["3Speed (five)", "4Speed (four)", "Other trims (two)"], optionCounts: [5, 4, 2] };
const h = draw(d), text = h.replace(/<[^>]+>/g, " ").replace(/&#8594;/g, "→").replace(/\s+/g, " ");
ok(text.includes(d.prompt), "the engine's own prompt is drawn");
ok(d.trimChips.every(c => text.includes(c)), "every engine chip is drawn in the engine's own words, with its count");
ok((h.match(/data-trimopt="/g) || []).length === 3 && /data-trimopt="3speed"/.test(h) && /data-trimopt="other" data-trimnot="3speed,4speed"/.test(h), "each chip carries that option's refine (Other trims with the trims it leaves out)");
ok(!/Not enough real|nothing here is made up|honest read/i.test(text), "never the fallback's claim");
ok(/1965 Ford Mustang/.test(text), "the car's own name heads the question");
const words = text.replace(d.prompt, "").replace(/1965 Ford Mustang/, "").replace(/Market Check/, "");
ok(d.trimChips.reduce((t, c) => t.replace(c, ""), words).replace(/[→\s]/g, "") === "", "no wording of the page's own beyond the eyebrow, the car name, the prompt and the chips");
// The dispatch: trim_choice is answered as a question before the result path (so the fallback is never reached).
const disp = src.indexOf('if (d.tier === "trim_choice" && Array.isArray(d.trimOptions) && d.trimOptions.length) { if (d.askIndex) obAsked = d.askIndex; renderTrimChoice(d); return; }');
const fin = src.indexOf("var finish = function () { mcPushUrl();");
ok(disp > 0 && fin > disp, "the answer dispatch draws trim_choice as a question before the result path");
ok(/querySelectorAll\("\[data-trimopt\]"\)/.test(src) && /var part = \{ trim: key, label: label \}; if \(not\) part\.notTrims = not;\s*runPool\(lastQuery, obLastVehicle, mergeRefine\(part\)\);/.test(src), "a chip re-asks the engine with that option's trim refine");
console.log(`trimChoiceDrawCheck: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
