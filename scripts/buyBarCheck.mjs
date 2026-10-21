// BUY STAGE 1d ITEM 7, THE FOLLOW-UP BAR (Sam, Oct 20 2026), with Stage 1e item 1 (no suggestion bubbles): Sam's placeholder; a stronger bar with an obvious send button, in the
// page's footer so it stays at the bottom of every width and state. The mic is untouched (Sam decides). No network.
//   node scripts/buyBarCheck.mjs     exit 1 on any failure.
import fs from "node:fs";
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const buy = fs.readFileSync(new URL("../api/buy.js", import.meta.url), "utf8");
const client = JSON.parse(/^const CLIENT = (".*");$/m.exec(buy)[1]), css = JSON.parse(/^const BUY_CARD_CSS = (".*");$/m.exec(buy)[1]);
// BUY STAGE 1e ITEM 1 (Sam, Oct 21 2026): the suggestion bubbles are gone; drawSuggest draws nothing and removes a left row.
const i = client.indexOf("function drawSuggest("), d = client.slice(i, client.indexOf("\n  function ", i + 1));
ok(i > 0 && !/sgc|data-send|insertBefore/.test(d) && /if \(sg\) sg\.remove\(\);/.test(d), "no suggestion bubbles above the bar (nothing drawn, a left row removed)");
ok(!/class="rchip sgc"/.test(client), "no suggestion chip markup anywhere on the page");
ok(/PH_FOLLOW_WIDE = "Tell Sam what to change, like only manuals or near 90210"/.test(client), "Sam's placeholder");
const b = css.slice(css.indexOf("BUY STAGE 1d ITEM 7"));
ok(/\.composer \.search\{border:1\.5px solid rgba\(21,32,26,\.28\);padding:6px 6px 6px 22px/.test(b) && /\.composer \.sendbtn\{width:44px;height:44px;opacity:\.7\}/.test(b), "a stronger bar and an obvious send button");
ok(/<div class="composer"><div class="col">/.test(buy), "the bar is the page's footer (stays at the bottom)");
// THE MIC STAYS (Sam, Oct 20 2026: "yes microphone works"): both buttons and their script, exactly as before.
const landing = fs.readFileSync(new URL("../lib/live/buyLanding.js", import.meta.url), "utf8");
ok(/<button type="button" class="mic" id="mic" aria-label="Speak instead of typing" aria-pressed="false">/.test(buy), "the composer's mic button is in the bar");
ok(/<button type="button" class="lk-mic" id="hmic" aria-label="Speak instead of typing" aria-pressed="false">/.test(landing), "the header box's mic button is there");
ok(/\[\["mic", "q"\], \["hmic", "hq"\]\]\.forEach/.test(client) && /var SR = window\.SpeechRecognition \|\| window\.webkitSpeechRecognition/.test(client) && /if \(!SR \|\| !mic \|\| !input\) \{ if \(mic\) mic\.hidden = true; return; \}/.test(client), "their script: shown only where speech recognition exists, the words land in the box");
console.log(`buyBarCheck: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
