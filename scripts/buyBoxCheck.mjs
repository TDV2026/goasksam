// The Buy box and its voice button (Lane C, Oct 15 2026): the rules that make the mic work on iPhone and the box
// clear after a search, checked in the page's own script. No network. (The behaviour itself was proved in a local
// mock with a fake recognizer: slow start, fast second tap, immediate end, refusal, a start that throws.)
import fs from "node:fs";
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const page = fs.readFileSync(new URL("../api/buy.js", import.meta.url), "utf8");
const client = JSON.parse(/^const CLIENT = (.*);$/m.exec(page)[1]);
const voice = client.slice(client.indexOf("// ---------------- voice in"), client.indexOf("// ---------------- conversation"));
const tapFn = voice.slice(voice.indexOf('mic.addEventListener("click", function(e){'));
const beforeStart = tapFn.slice(0, tapFn.indexOf("r.start()"));
ok(voice.length > 500 && tapFn.length > 200, "the voice block is found");
ok(!/\bawait\b|\.then\(|setTimeout\(|requestAnimationFrame\(/.test(beforeStart), "start() runs directly in the tap: nothing awaited, timed or chained before it");
ok(/if \(state === "starting" \|\| state === "stopping"\) return;/.test(tapFn), "a tap while starting or stopping is ignored");
ok(/try \{ r\.start\(\); \} catch\(err\)\{ idle\(\);/.test(tapFn), "a start that throws puts the button back");
ok(/r\.onerror = function\(ev\)\{[^]*?idle\(\); \};/.test(voice) && /r\.onend = function\(\)\{ if \(rec !== r\) return; idle\(\);/.test(voice), "every error and end puts the button back");
ok(/not-allowed[^]*Microphone blocked\. Please type\./.test(voice), "a refusal says so in plain words");
ok(/if \(heard && !TOUCH\)/.test(voice) && !/onend = function\(\)\{ on = false;[^}]*input\.focus\(\)/.test(voice), "no keyboard pops up after voice on a touch screen");
ok(/guard = setTimeout\(function\(\)\{ if \(rec === r && state !== "idle"\)/.test(voice), "a recognizer that never reports back is let go");
ok(/\.search \.mic,\.lk-mic\{touch-action:manipulation;[^}]*min-width:44px;min-height:44px\}/.test(page), "the mic answers a quick tap (no double-tap zoom) and is at least 44px");
ok(/\.search \.mic\.on\{[^}]*background:var\(--red\)/.test(page), "listening is plain to see");
// the box
ok(/function send\(text\)\{\n\s*text = String\(text \|\| ""\)\.trim\(\); if \(!text\) return;[^\n]*\n[^\n]*\n\s*clearBoxes\(text\);/.test(client), "send clears the box first");
ok(/\[60, 400\]\.forEach/.test(client), "the box is cleared again if the phone's keyboard puts the words back");
const ph = (client.match(/PH_FOLLOW_WIDE = "([^"]+)"/) || [])[1] || "", phn = (client.match(/PH_FOLLOW_NARROW = "([^"]+)"/) || [])[1] || "";
ok(ph === "Follow up, like only manuals" && phn === "Follow up: only manuals?", `the follow-up lines are the ones proved live ("${ph}", phone "${phn}")`);
ok([ph, phn].every(t => !/[–—]/.test(t) && !/\b(I|I'm|I'll|me|my)\b/.test(t)) && phn.length <= 24, "the follow-up lines: no dash, no first person, the phone one short enough for 360");
ok(/var res = log\.querySelector\("\.msg\.results:not\(\[hidden\]\)"\), want = res \? phFollow\(\) : phFirst\(\);/.test(client), "the follow-up line only while a result is on the page");
ok(/PH_NARROW = "Change the search, or ask\."/.test(client) && /matchMedia\("\(max-width: 520px\)"\)/.test(client), "a phone's first-search line is the short one that fits at 360");
// A follow-up keeps its search (Sam, Oct 15 2026): while "only manuals" runs, the header names the search on screen
// with the words, and the follow-up words are never parsed alone into the waiting line.
ok(/searchingBlock\(prevQ && said \? prevQ \+ ", " \+ said : said\)/.test(client) && /if \(!rerun && said && !prevQ\) fetch\(/.test(client), "a follow-up's header keeps the search on screen and its words are not named alone");
// The nearest-years line names the car as the keep looking button does (Sam, Oct 15 2026): run the page's own nearText.
{
  const m = /\n  function nearText\(m, qp\)\{[\s\S]*?\n  \}\n/.exec(client);
  ok(!!m && /esc\(nearText\(m, qp\) \|\| m\.note\)/.test(client), "the header's nearest-years line comes from nearText with the button's name");
  if (m) {
    const nearText = new Function(m[0] + "; return nearText;")();
    ok(nearText({ near: { asked: [2006, 2006], years: [], abroad: 0 } }, "2006 Lexus SC 430s") === "No 2006 Lexus SC 430s are live right now, and none from 2005 or 2007 either.", "no car near the year: the button's name, then the years either side");
    ok(nearText({ near: { asked: [1999, 1999], years: [1998, 2000], abroad: 1 } }, "1999 red Porsche 911s") === "No 1999 red Porsche 911s are live right now in the US. These are the nearest, 1998 and 2000. 1 is live abroad.", "nearest years and a car abroad");
    ok(nearText({ note: "x" }, "a") === "" && nearText({ near: { asked: [2006, 2006], years: [] } }, "") === "", "no fields or no name: the server's own sentence stands");
  }
}
console.log(`buyBoxCheck: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
