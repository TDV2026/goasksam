// LIVE: this script calls production (goasksam.com). Run it only in a gap the lanes name, with the protection-bypass
// header (Lane F's rule), a busy-lane check before every page load. Refuses without --live.
// BUY STAGE 1f (Sam's block that replaces every earlier one, Oct 21 2026), Lane E's behaviour and data checks, read only:
//  (1) the question panel: pale green, no "S" mark and no "Sam" label, Sam's line "Choose one, or tell Sam how else to narrow
//      your search below.", the engine's chips with counts in order, "Any ..." last, then the engine's "N don't say ..." line;
//  (2) "Show them too →" is an underlined text link with an arrow, not a pill or button;
//  (3) the dark platform and time label on every live card's photo; no star, heart or save icon;
//  (4) what links where, by clicking: the photo and View auction open the auction; the title, the metadata line and every
//      chip open nothing; Sold before / Listed before open the history popup with data; Market Check opens the drawer;
//  (5) the tags: outlined at rest, pale green fill and a pointer on hover and on keyboard focus;
//  (6) the fold at 1440 by 900: the first row's Sam range fully in view without scrolling; no gap between a one-line
//      title and the mileage line;
//  (7) "Sign in" and the Sort control never overlap, at 1440, 1024, 768 and 390;
//  (8) one left rail (#gas-rail): the same computed look on Buy, Market Check, Sell and Tasks (signed out; signed in needs
//      a real session this script does not hold, and it says so);
//  (9) every card keeps its photo and its actions; and the composer ruling: no free text input besides #q (numeric zip
//      boxes inside the engine's question are allowed).
// Every FAIL prints the text it saw and the time.
//   CREW=... PROBE_KEY=... VERCEL_AUTOMATION_BYPASS_SECRET=... OPEN_LOCKS_SCRIPT=... MAIN_CHECKOUT=... OWN_LANE=E node scripts/buy1fLive.mjs --live
import puppeteer from "puppeteer-core";
import { execSync } from "node:child_process";
if (!process.argv.includes("--live")) { console.log("buy1fLive: LIVE script (production). Pass --live, in a named gap only."); process.exit(2); }
const BASE = "https://goasksam.com", HOST = "goasksam.com", CREW = process.env.CREW, KEY = process.env.PROBE_KEY, BYP = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
const SUB = "Choose one, or tell Sam how else to narrow your search below.";
const RED = "/buy?q=red+Porsche&make=Porsche&colour=red";
const now = () => new Date().toISOString().slice(11, 19) + "Z";
const busy = () => { if (!process.env.OPEN_LOCKS_SCRIPT || !process.env.MAIN_CHECKOUT) return ""; try { return execSync(`git -C "${process.env.MAIN_CHECKOUT}" fetch -q origin main && git -C "${process.env.MAIN_CHECKOUT}" show origin/main:docs/lane-notes.md | node "${process.env.OPEN_LOCKS_SCRIPT}"`, { encoding: "utf8", env: process.env }).trim(); } catch { return ""; } };
const guard = () => { for (let i = 0; i < 120; i++) { const b = busy(); if (!b) return; console.log(`  (waiting ${now()}: ${b.slice(0, 60)})`); execSync("sleep 15"); } throw new Error("a lane stayed busy 30 minutes"); };
let fails = 0, pages = 0; const fail = (w, m) => { fails++; console.log(`  FAIL ${w} at ${now()}: ${m}`); };
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", args: ["--no-sandbox"] });
const open = async (url, width, height = 900) => {
  guard(); pages++;
  const p = await browser.newPage(); await p.setViewport({ width, height, isMobile: width < 600 });
  await p.setRequestInterception(true);
  p.on("request", r => { let own = false; try { own = new URL(r.url()).host === HOST; } catch {} r.continue(own ? { headers: { ...r.headers(), ...(KEY ? { "x-ops-key": KEY, "x-launch-stage-test": "2" } : {}), ...(BYP ? { "x-vercel-protection-bypass": BYP } : {}) } } : undefined); });
  if (CREW) await p.setCookie({ name: "gas_crew", value: CREW, domain: HOST, path: "/" });
  p._asks = null; p.on("response", async res => { try { if (/\/api\/buySearch$/.test(new URL(res.url()).pathname)) { const j = await res.json(); const a = j && ((j.searchMeta && j.searchMeta.asks) || (j.meta && j.meta.asks)); if (Array.isArray(a) && a.length) p._asks = a; } } catch {} });
  await p.goto(BASE + url, { waitUntil: "domcontentloaded", timeout: 60000 });
  return p;
};
const waitCards = async p => { for (let k = 0; k < 60; k++) { const n = await p.evaluate(() => document.querySelectorAll("article.car:not(.skel)").length).catch(() => 0); if (n >= 3) break; await new Promise(r => setTimeout(r, 500)); } await new Promise(r => setTimeout(r, 2000)); };
const lum = c => { const m = /rgba?\((\d+), (\d+), (\d+)(?:, ([\d.]+))?\)/.exec(c || ""); if (!m || (m[4] !== undefined && Number(m[4]) === 0)) return null; return (0.2126 * m[1] + 0.7152 * m[2] + 0.0722 * m[3]) / 255; };
const greenish = c => { const m = /rgba?\((\d+), (\d+), (\d+)/.exec(c || ""); return !!m && Number(m[2]) >= Number(m[1]) && Number(m[2]) >= Number(m[3]) - 4; };
try {
  // ---- the red Porsche page at 1440 by 900: items 1 to 6 and 9
  { const w = "red Porsche, 1440x900"; const p = await open(RED, 1440, 900); await waitCards(p);
    const D = await p.evaluate(SUB => {
      const vis = el => { const r = el.getBoundingClientRect(), cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none"; };
      const panel = document.querySelector(".ask.samq, .ask"); const txt = el => (el ? el.innerText || "" : "").replace(/\s+/g, " ").trim();
      const chips = panel ? [...panel.querySelectorAll("button, .qchip, .achip, .sq-chip")].filter(vis).map(b => txt(b)).filter(Boolean) : [];
      const leaf = re => [...document.querySelectorAll("a, button, span")].find(e => re.test(txt(e)) && vis(e));
      const show = leaf(/^Show them too/);
      const inputs = [...document.querySelectorAll("input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=submit]):not([type=button]), textarea")].filter(vis).filter(i => !(i.name === "zip" && i.getAttribute("inputmode") === "numeric")).map(i => i.id || i.name || "unnamed");
      const cards = [...document.querySelectorAll("article.car:not(.skel)")].filter(vis);
      const first = cards[0], fr = first && first.querySelector(".rung, .rf-range, .sl");
      const gaps = cards.map(c => { const h = c.querySelector("h3"), m = h && h.nextElementSibling; if (!h || !m) return null; const lh = parseFloat(getComputedStyle(h).lineHeight) || 20; const lines = Math.round(h.getBoundingClientRect().height / lh); return { lines, gap: Math.round(m.getBoundingClientRect().top - h.getBoundingClientRect().bottom) }; });
      return {
        panelBg: panel ? getComputedStyle(panel).backgroundColor : null, mark: !!(panel && panel.querySelector(".sq-mark")), who: panel ? [...panel.querySelectorAll("*")].some(e => e.children.length === 0 && txt(e) === "Sam") : false,
        sub: panel ? txt(panel).includes(SUB) : false, chips, panelText: txt(panel).slice(0, 300),
        show: show ? { tag: show.tagName, text: txt(show), deco: getComputedStyle(show).textDecorationLine, bg: getComputedStyle(show).backgroundColor, border: getComputedStyle(show).borderTopWidth, radius: getComputedStyle(show).borderTopLeftRadius } : null,
        inputs, foldBottom: fr ? Math.round(fr.getBoundingClientRect().bottom) : null, foldTop: fr ? Math.round(fr.getBoundingClientRect().top) : null, vh: innerHeight, gaps,
        cards: cards.map(c => ({ sold: c.classList.contains("soldc"), photo: !!c.querySelector(".ph img, .ph, .noimg"), acts: txt(c.querySelector(".acts")), src: c.querySelector(".src") ? { t: txt(c.querySelector(".src")), bg: getComputedStyle(c.querySelector(".src")).backgroundColor } : null, lbid: /LAST BID SEEN/.test(c.innerText), icon: /[★☆♥♡]/.test(c.innerText) || !!c.querySelector('[aria-label*="save" i],[aria-label*="favo" i],[aria-label*="star" i],.star,.heart,.fav,.save') }))
      };
    }, SUB);
    // (1)
    if (!D.panelBg || !greenish(D.panelBg) || (lum(D.panelBg) || 0) < 0.85) fail(w, `the question panel is not pale green (background ${D.panelBg})`);
    if (D.mark) fail(w, "the panel still carries the \"S\" mark");
    if (D.who) fail(w, "the panel still carries a \"Sam\" label");
    if (!D.sub) fail(w, `Sam's line is missing from the panel ("${D.panelText}")`);
    const a = p._asks && p._asks[0];
    if (a && a.chips) {
      const want = [...a.chips.map(c => `${c.label} (${c.n})`), a.any ? `${a.any.label} (${a.any.n})` : null].filter(Boolean), got = D.chips.filter(t => /\(\d+\)$/.test(t));
      if (JSON.stringify(got) !== JSON.stringify(want)) fail(w, `the panel's chips ${JSON.stringify(got)} are not the engine's ${JSON.stringify(want)}`);
      if (a.unstated && !/don't say/i.test(D.panelText)) fail(w, `the engine says ${a.unstated} don't say, and the panel shows no "don't say" line ("${D.panelText}")`);
    } else console.log(`  (the engine asked no question here at ${now()})`);
    // (2)
    if (D.show) { if (!/underline/.test(D.show.deco) || !/→/.test(D.show.text) || (lum(D.show.bg) !== null && lum(D.show.bg) < 0.97) || parseFloat(D.show.border) > 0) fail(w, `"${D.show.text}" is not an underlined text link with an arrow (${D.show.tag}, decoration ${D.show.deco}, background ${D.show.bg}, border ${D.show.border}, radius ${D.show.radius})`); }
    else console.log(`  (no unknown-data row on this search at ${now()})`);
    // (3) and (9)
    D.cards.forEach((c, i) => {
      if (c.icon) fail(w, `card ${i + 1} carries a star, heart or save icon`);
      if (!c.photo) fail(w, `card ${i + 1} has no photo or no-photo slot`);
      if (!c.sold && !(/View auction/.test(c.acts) && /Market Check/.test(c.acts))) fail(w, `card ${i + 1}'s actions read "${c.acts}"`);
      if (!c.sold && (!c.src || !/ · /.test(c.src.t) || (lum(c.src.bg) ?? 1) > 0.35)) fail(w, `card ${i + 1}'s platform and time label is not dark (${JSON.stringify(c.src)})`);
      if (!c.sold && !c.lbid) fail(w, `card ${i + 1} has no LAST BID SEEN strip`);
    });
    // (6)
    if (D.foldBottom == null) fail(w, "no Sam range on the first card");
    else if (D.foldBottom > D.vh) fail(w, `the first row's Sam range ends at ${D.foldBottom}px, below the 900px fold`);
    D.gaps.forEach((g, i) => { if (g && g.lines === 1 && g.gap > 8) fail(w, `card ${i + 1}: a ${g.gap}px gap under a one-line title`); });
    // composer ruling
    if (D.inputs.length !== 1 || D.inputs[0] !== "q") fail(w, `free text inputs besides the composer: ${JSON.stringify(D.inputs)}`);
    // (4) what links where, by clicking: record navigations and window.open calls
    const clickTest = async (sel, label) => p.evaluate(async (sel) => {
      const el = document.querySelector(sel); if (!el) return { none: true };
      const before = location.href; let opened = null; const o = window.open; window.open = (u) => { opened = u; return null; };
      let navigated = false; const onClick = e => { const a = e.target.closest("a[href]"); if (a && !e.defaultPrevented) { navigated = a.getAttribute("href"); e.preventDefault(); } }; document.addEventListener("click", onClick, true);
      el.click(); await new Promise(r => setTimeout(r, 600)); document.removeEventListener("click", onClick, true); window.open = o;
      const pop = [...document.querySelectorAll("[role=dialog], dialog, .hp-full, .dpanel, .md-full")].find(d => d.getBoundingClientRect().height > 0);
      return { navigated, opened, moved: location.href !== before, pop: pop ? (pop.innerText || "").replace(/\s+/g, " ").slice(0, 160) : null };
    }, sel);
    for (const [sel, label] of [["article.car:not(.soldc) h3", "the title"], ["article.car:not(.soldc) .meta", "the metadata line"], ["article.car:not(.soldc) .chips .chip, article.car:not(.soldc) .tagline span", "a chip"]]) {
      const r = await clickTest(sel); if (r.none) continue;
      if (r.navigated || r.opened || r.moved) fail(w, `${label} opens something (${r.navigated || r.opened || "the page moved"})`);
    }
    for (const [sel, label] of [["article.car:not(.soldc) .ph", "the photo"], ["article.car:not(.soldc) .vauc", "View auction"]]) {
      const r = await clickTest(sel); if (r.none) { fail(w, `no ${label} to click`); continue; }
      if (!(r.navigated || r.opened)) fail(w, `${label} opens nothing`);
    }
    // the tags: click opens the popup with data; outlined at rest; hover and focus fill pale green with a pointer
    const tagSel = await p.evaluate(() => { const t = [...document.querySelectorAll("article.car button, article.car a, article.car span")].find(x => /^(Sold before|Listed before)$/.test((x.innerText || "").trim())); if (!t) return null; t.setAttribute("data-e-tag", "1"); return "[data-e-tag]"; });
    if (tagSel) {
      const rest = await p.$eval(tagSel, t => { const cs = getComputedStyle(t); return { bg: cs.backgroundColor, border: cs.borderTopWidth + " " + cs.borderTopStyle, cursor: cs.cursor }; });
      await p.hover(tagSel); await new Promise(r => setTimeout(r, 300)); const hov = await p.$eval(tagSel, t => ({ bg: getComputedStyle(t).backgroundColor, cursor: getComputedStyle(t).cursor }));
      await p.mouse.move(5, 5); await p.$eval(tagSel, t => t.focus()); await p.keyboard.press("Shift"); await new Promise(r => setTimeout(r, 300)); const foc = await p.$eval(tagSel, t => ({ bg: getComputedStyle(t).backgroundColor, focused: document.activeElement === t }));
      if (/^0px|none/.test(rest.border) || ((lum(rest.bg) ?? 1) < 0.9)) fail(w, `the tag is not outlined at rest (${JSON.stringify(rest)})`);
      if (hov.cursor !== "pointer" || !greenish(hov.bg) || hov.bg === rest.bg) fail(w, `the tag's hover is not a pale green fill with a pointer (${JSON.stringify(hov)})`);
      if (!foc.focused || !greenish(foc.bg) || foc.bg === rest.bg) fail(w, `the tag's keyboard focus is not the pale green fill (${JSON.stringify(foc)})`);
      const r = await clickTest(tagSel);
      if (!r.pop || !/\$\d/.test(r.pop)) fail(w, `Sold before / Listed before opened no popup with data (${JSON.stringify(r)})`);
      await p.keyboard.press("Escape");
    } else console.log(`  (no Sold before / Listed before tag on this search at ${now()})`);
    { const r = await clickTest("article.car:not(.soldc) .acts button, article.car:not(.soldc) .acts .lk"); if (r.none) fail(w, "no Market Check action to click"); else if (!r.pop) fail(w, `Market Check opened no drawer (${JSON.stringify(r)})`); }
    console.log(`${w}: panel ${D.panelBg}, chips ${JSON.stringify(D.chips)}, fold: the first Sam range ${D.foldTop} to ${D.foldBottom}px of ${D.vh}`);
    await p.close(); }
  // ---- (7) Sign in vs the Sort control, four widths
  for (const width of [1440, 1024, 768, 390]) { const w = `Sign in vs Sort at ${width}`; const p = await open(RED, width, 900); await waitCards(p);
    const r = await p.evaluate(() => { const box = el => { if (!el) return null; const b = el.getBoundingClientRect(); return b.width && b.height ? { l: b.left, r: b.right, t: b.top, b: b.bottom } : null; };
      const sign = [...document.querySelectorAll("a, button")].find(e => /^Sign in$/i.test((e.innerText || "").trim()) && e.getBoundingClientRect().height > 0);
      const sort = document.querySelector(".ssort, select[name=sort], [data-sort]"); return { sign: box(sign), sort: box(sort) }; });
    if (r.sign && r.sort) { const o = !(r.sign.r <= r.sort.l || r.sort.r <= r.sign.l || r.sign.b <= r.sort.t || r.sort.b <= r.sign.t); if (o) fail(w, `Sign in ${JSON.stringify(r.sign)} overlaps the Sort control ${JSON.stringify(r.sort)}`); }
    else console.log(`  (${w}: Sign in ${r.sign ? "shown" : "not shown"}, Sort ${r.sort ? "shown" : "not shown"})`);
    await p.close(); }
  // ---- (8) one left rail, signed out, four pages
  { const looks = {};
    for (const [name, url] of [["Buy", "/buy"], ["Market Check", "/market-check"], ["Sell", "/sell"], ["Tasks", "/tasks"]]) { const p = await open(url, 1440, 900); await new Promise(r => setTimeout(r, 2500));
      looks[name] = await p.evaluate(() => { const r = document.querySelector("#gas-rail"); if (!r) return null; const cs = getComputedStyle(r), items = [...r.querySelectorAll("a")].slice(0, 6); const ics = items[0] ? getComputedStyle(items[0]) : null;
        return { bg: cs.backgroundColor, width: Math.round(r.getBoundingClientRect().width), pad: cs.padding, font: ics && ics.font, itemGap: items.length > 1 ? Math.round(items[1].getBoundingClientRect().top - items[0].getBoundingClientRect().top) : null }; });
      await p.close(); }
    const ref = JSON.stringify(looks.Buy);
    for (const [n, l] of Object.entries(looks)) { if (!l) fail("one left rail", `${n} has no #gas-rail`); else if (JSON.stringify(l) !== ref) fail("one left rail", `${n}'s rail ${JSON.stringify(l)} differs from Buy's ${ref}`); }
    console.log(`one left rail (signed out): ${JSON.stringify(looks)}. Signed in: NOT CHECKED, this script holds no signed-in session.`); }
} finally { await browser.close(); }
console.log(fails ? `buy1fLive: ${pages} pages, ${fails} FAIL` : `buy1fLive: ${pages} pages, all pass`);
process.exit(fails ? 1 : 0);
