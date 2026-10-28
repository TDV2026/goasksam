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
console.log(bad ? `thinLineVoiceCheck: ${bad} failed` : "thinLineVoiceCheck: all passed");
process.exit(bad ? 1 : 0);
