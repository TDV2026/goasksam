// thinLineVoiceCheck (Lane B, Oct 20 2026, Sam's company-voice batch, group B): the engine's thin-card lines say no "we" or "our". Offline.
// Oct 28 2026 (e99): the Oct 20 rule that every thin line ends "These are the sales on record." is superseded by the one-sentence reason line table (lib/reasonWords.js, Sam's order);
// a thin line is now exactly its table line.
globalThis.fetch = async () => { throw new Error("network blocked in check"); };
const { THIN_LINES } = await import("../lib/onebox.js");
const { reasonLine, THIN_REASON_ID } = await import("../lib/reasonWords.js");
let bad = 0;
const ok = (c, m) => { if (c) console.log("ok   " + m); else { bad++; console.log("FAIL " + m); } };
for (const [k, line] of Object.entries(THIN_LINES)) {
  ok(line === reasonLine(THIN_REASON_ID[k]), `${k} is its line in the reason table`);
  ok(!/\b(we|our|us)\b/i.test(line), `${k} says no "we", "our" or "us"`);
}
// Oct 29 2026 (Sam, the live BMW M3 Find cards): the thin count reads count first and the scope as English: "Five sales under 50,000 miles, too few for a range." (it was "Five Under 50,000 miles sales").
// Every scope the builder can name: all three mile bands (from the engine's own MILE_BANDS), a year, a gearbox, a body, an edition, and no scope. Through findAnswerOf, the sentence a Find card prints.
{
  const E = await import("../lib/onebox.js");
  const WORD = "(?:One|Two|Three|Four|Five|Six|Seven)";
  const thin = (dimension, label, value, n) => {
    const opts = [{ dimension, label, value, n, low: null, high: null, rangeFloor: true }, { dimension, label: "Other", value: "other", n: 1, low: null, high: null, rangeFloor: true }];
    const d = { tier: "result", optionsState: "split", headlineDimension: dimension, options: opts, refineOptions: [], poolN: n + 1, cluster: null, rawPool: [], windowWords: "since June 2025" };
    const ctx = dimension === "mileage" ? { title: "2011 BMW M3 Convertible", miles: (E.MILE_BANDS.find(b => b.value === value) || {}).miMin + 1000 } : { title: `2011 BMW M3 ${label}`, year: 2011 };
    const fa = E.findAnswerOf(d, ctx); return fa && fa.lines ? fa.lines[0] : null;
  };
  const words = ["", "", "Two", "Three", "Four", "Five", "Six", "Seven"];
  for (const b of E.MILE_BANDS) {
    const n = 5, line = thin("mileage", b.label, b.value, n);
    ok(!!line && new RegExp(`^${WORD} sales (under|over|between) [\\d,]+( and [\\d,]+)? miles, too few for a range\\.$`).test(line), `mile band "${b.label}": count first, the scope in English (${line})`);
    ok(!!line && !new RegExp(b.label).test(line), `mile band "${b.label}": the label is not pasted into the sentence`);
  }
  ok(thin("mileage", "Under 50,000 miles", "lt50", 5) === "Five sales under 50,000 miles, too few for a range.", "Sam's first example, word for word");
  ok(thin("mileage", "50,000 to 100,000 miles", "50to100", 3) === "Three sales between 50,000 and 100,000 miles, too few for a range.", "Sam's second example, word for word");
  for (const [dim, label, value, want] of [["gearbox", "Manual", "manual", "Seven Manual sales, too few for a range."], ["body", "Convertible", "open", "Two Convertible sales, too few for a range."], ["edition", "Competition", "competition", "Four Competition sales, too few for a range."]]) {
    const n = words.indexOf(want.split(" ")[0]); ok(thin(dim, label, value, n) === want, `${dim} scope "${label}": "${want}"`);
  }
  ok(E.fewCountPhrase(5, null) === "Five sales", "no scope: the count and sales");
  ok(E.fewCountPhrase(6, { dimension: "year", label: "2012" }) === "Six sales from 2012", "year scope: count first, from the year");
}
console.log(bad ? `thinLineVoiceCheck: ${bad} failed` : "thinLineVoiceCheck: all passed");
process.exit(bad ? 1 : 0);
