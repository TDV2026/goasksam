// BUY STAGE 1d ITEM 5, THE INLINE MARKET CHECK PANEL (Sam, Oct 20 2026), with STAGE 1e ITEM 4 (Sam, Oct 21 2026): a drawer
// under the card's row with the car's own title (once) and a visible X on top; the engine's headline line once; then the
// sales as an aligned list (fixed-size photo, name, price right-aligned, month and miles under the name), the engine's
// order, 10 then Show more; no range block repeated; the three small sale snippets stay gone; the actions in Sam's order (Open full Market Check, the email toggle,
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
ok(!/sellsForCardHtml/.test(d), "the card's range block is not drawn a second time (no shared card in the drawer)");
const a = d.indexOf("Open full Market Check"), s = d.indexOf("alertSwitchHtml(l)"), w = d.indexOf("watchHtml(l)");
ok(a > 0 && s > a && w > s, "the actions in Sam's order: Open full Market Check, the email toggle, then the watches");
ok(/closeOverlays\(\);\s*if \(open\) return;/.test(o), "one panel open at a time");
ok(/\.mcdrawer \.md-x\{flex:0 0 auto;width:36px;height:36px/.test(css) && /\.mcdrawer\{position:relative;border:1px solid/.test(css), "the X is visible and the drawer is framed");
// Rendered for the 1996 Porsche 911 Turbo (its panel as read live Oct 21 2026: basisLine, 17 rows; 12 here).
const line = from => { const i = client.indexOf(from); if (i < 0) throw new Error("missing " + from); return client.slice(i, client.indexOf("\n", i)) + "\n"; };
const blk = (from, to) => { const i = client.indexOf(from), k = client.indexOf(to, i); if (i < 0 || k < 0) throw new Error("missing " + from); return client.slice(i, k); };
const env = "var REL_MC = true; function esc(s){ return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/\"/g,'&quot;'); } function cnt(n){ return String(n); } function rungHtml(m){ return (m.rungLines || []).join(' '); } function carTitle(l){ return l.name; } function alertSwitchHtml(){ return '<p class=\"sw\">EMAIL</p>'; } function watchHtml(){ return '<p class=\"mw\">WATCH</p>'; }\n" +
  line("  function usd(n){") + line("  function num(n){") + line("  var M = [") + line("  function monthYear(d){") + line("  function mdHeadHtml(l){") + blk("  function sameName(a, b, make){", "  function openDrawer(btn){");
const drawerHtml = new Function(env + "\nreturn drawerHtml;")();
const rows = Array.from({ length: 12 }, (_, k) => ({ price: 300000 - k * 1000, date: `2026-${String(10 - Math.floor(k / 2)).padStart(2, "0")}-1${k % 2}`, mi: 30000 + k, title: k ? "1996 Porsche 911 Turbo" : "1996 Porsche 911 Turbo 6-Speed", image: k === 3 ? null : `https://img.example/${k}.jpg` }));
const l = { id: 1, name: "1996 Porsche 911 Turbo", make: "Porsche", year: 1996, market: { kind: "range", low: 258000, high: 330000, count: 17, rungLines: ["1996 911 Turbo"], query: "1996 porsche 911 turbo" } };
const j = { market: l.market, engineAnswer: { basisLine: "Based on 17 sales, the latest in October 2026.", cards: rows } };
const h = drawerHtml(l, j), tx = h.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
ok((tx.match(/1996 Porsche 911 Turbo 6-Speed|1996 Porsche 911 Turbo|1996 911 Turbo/g) || []).length === 13 && !/1996 911 Turbo/.test(tx), "the car's name once at the top (the same car named again by the rung line is not printed), then each row's own title");
ok((tx.match(/Based on 17 sales, the latest in October 2026\./g) || []).length === 1 && !/\$258,000|\$330,000|Half of these|WHAT THESE SELL FOR/.test(tx), "the engine's headline line once; no range block");
ok((h.match(/<li class="md-row">/g) || []).length === 10 && (h.match(/<li class="md-row" hidden>/g) || []).length === 2 && /<button type="button" class="md-more" data-mdmore>Show more<\/button>/.test(h), "10 sales shown, then Show more (the rest drawn hidden)");
ok(/<li class="md-row"><span class="md-rph"><img src="https:\/\/img\.example\/0\.jpg"[^>]*><\/span><span class="md-rt"><span class="md-rn">1996 Porsche 911 Turbo 6-Speed<\/span><span class="md-rm">October 2026, 30,000 miles at sale<\/span><\/span><span class="md-rp">\$300,000<\/span><\/li>/.test(h), "a row: photo, the car's own title, month and miles under it, the price at the right");
ok(/<span class="md-rph np">No photo<\/span>/.test(h), "a row with no photo keeps a marked fixed-size slot");
ok(h.indexOf("$300,000") < h.indexOf("$299,000") && h.indexOf("$299,000") < h.indexOf("$298,000"), "the engine's order (newest first), unchanged");
ok(h.indexOf("md-rows") < h.indexOf("Open full Market Check") && h.indexOf("EMAIL") > h.indexOf("Open full Market Check") && h.indexOf("WATCH") > h.indexOf("EMAIL"), "then the actions: Open full Market Check, the email toggle, the look-for buttons");
const sm = { ...l.market, rungLines: ["1997 911 Turbo S sales"] }, sib = drawerHtml({ ...l, market: sm }, { ...j, market: sm });
ok(/1997 911 Turbo S sales/.test(sib), "a rung line naming a different car than the title stays");
const thin = drawerHtml({ ...l, market: { kind: "thin", thinLine: "x" } }, { market: { kind: "thin", thinLine: "Not enough sales of this exact car to give a reliable range." }, engineAnswer: { thinLine: "Not enough sales of this exact car to give a reliable range.", cards: [] } });
ok(/Not enough sales of this exact car to give a reliable range\./.test(thin) && !/md-rows/.test(thin), "a thin answer: its own line, no empty list");
const failed = drawerHtml({ ...l, market: { kind: "range", low: 258000, high: 330000, count: 17 } }, null);
ok(/\$258,000 to \$330,000\. The middle half of comparable sales landed here\. Based on 17 sales in the past year\./.test(failed), "a failed read falls back to the card's own line: never blank");
ok(/function withMake\(fam, l\)/.test(client) && /Look for the next sale of ' \+ esc\(withMake\(fam, l\)\)/.test(client), "the look-for button names the car with its make");
const withMake = new Function(line("  function withMake(fam, l){") + "\nreturn withMake;")();
ok(withMake("1996 911 Turbo", { make: "Porsche" }) === "1996 Porsche 911 Turbo" && withMake("1996 Porsche 911 Turbo", { make: "Porsche" }) === "1996 Porsche 911 Turbo" && withMake("911 Turbo", { make: "Porsche" }) === "Porsche 911 Turbo", "'Look for the next sale of 1996 Porsche 911 Turbo' (the make put in once)");
console.log(`buyPanelCheck: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
