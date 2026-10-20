// thinLineVoiceCheck (Lane B, Oct 20 2026, Sam's company-voice batch, group B): the engine's thin-card lines end "These are the sales
// on record." and say no "we" or "our". Offline.
globalThis.fetch = async () => { throw new Error("network blocked in check"); };
const { THIN_LINES } = await import("../lib/onebox.js");
let bad = 0;
const ok = (c, m) => { if (c) console.log("ok   " + m); else { bad++; console.log("FAIL " + m); } };
for (const [k, line] of Object.entries(THIN_LINES)) {
  ok(/These are the sales on record\.$/.test(line), `${k} ends "These are the sales on record."`);
  ok(!/\b(we|our|us)\b/i.test(line), `${k} says no "we", "our" or "us"`);
}
console.log(bad ? `thinLineVoiceCheck: ${bad} failed` : "thinLineVoiceCheck: all passed");
process.exit(bad ? 1 : 0);
