// BUY STAGE 1d ITEM 5, THE INLINE MARKET CHECK PANEL (Sam, Oct 20 2026): a drawer under the card's row with the car's own
// title and a visible X on top; the engine's line and its sales newest first (the shared card, unchanged); the three
// small sale snippets under the list are gone; the actions in Sam's order (Open full Market Check, the email toggle,
// the next-sale watch, the exact-car watch). One panel open at a time (closeOverlays first). No network.
//   node scripts/buyPanelCheck.mjs     exit 1 on any failure.
import fs from "node:fs";
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const buy = fs.readFileSync(new URL("../api/buy.js", import.meta.url), "utf8");
const client = JSON.parse(/^const CLIENT = (".*");$/m.exec(buy)[1]), css = JSON.parse(/^const BUY_CARD_CSS = (".*");$/m.exec(buy)[1]);
const code = client.split("\n").filter(l => !/^\s*\/\//.test(l)).join("\n");
const fn = name => { const i = code.indexOf("function " + name + "("); return i < 0 ? "" : code.slice(i, code.indexOf("\n  function ", i + 1)); };
const d = fn("drawerHtml"), o = fn("openDrawer");
ok(/function mdHeadHtml\(l\)\{ return '<p class="md-h"><span class="md-ttl">' \+ esc\(carTitle\(l\)\) \+ '<\/span><button type="button" class="md-x" data-mcclose aria-label="Close Market Check">&times;<\/button><\/p>'; \}/.test(code), "the top row is the car's own title and a visible X");
ok(/var out = \[mdHeadHtml\(l\)\];/.test(d) && /dr\.innerHTML = mdHeadHtml\(l\) \+/.test(o), "the panel and its loading state both start with that row");
ok(!/md-sales|md-sale\b|md-ph/.test(d), "the three small sale snippets are gone");
ok(/<p class="md-ow">A ' \+ ow\.year \+ ' car, a few years from the ' \+ l\.year \+ ' searched\.<\/p>/.test(d), "the off-window note stays, as its own line (parity with Market Check)");
ok(!/What similar cars sold for<\/p>/.test(code), "the old heading is not printed (the aria label may keep it)");
ok(/window\.sellsForCardHtml\(j\.engineAnswer, \{\}\)/.test(d), "the engine's line and its sales come from the shared card, unchanged");
const a = d.indexOf("Open full Market Check"), s = d.indexOf("alertSwitchHtml(l)"), w = d.indexOf("watchHtml(l)");
ok(a > 0 && s > a && w > s, "the actions in Sam's order: Open full Market Check, the email toggle, then the watches");
ok(/closeOverlays\(\);\s*if \(open\) return;/.test(o), "one panel open at a time");
ok(/\.mcdrawer \.md-x\{flex:0 0 auto;width:36px;height:36px/.test(css) && /\.mcdrawer\{position:relative;border:1px solid/.test(css), "the X is visible and the drawer is framed");
console.log(`buyPanelCheck: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
