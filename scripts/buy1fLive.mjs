// LIVE: this script calls production (goasksam.com). Run it only in a gap the lanes name, with the protection-bypass
// header (Lane F's rule), a busy-lane check before every page load. Refuses without --live.
// BUY STAGE 1f, Lane E's behaviour and data checks (Sam, Oct 21 2026), read only, on the deployed /buy page at 1440 and
// 390, for a red Porsche search (the mockup's) and Porsche 911:
//  (1) the composer is the ONLY free text input (Lane F: numeric zip boxes inside the engine's question are allowed),
//      sticky at the bottom, Sam's placeholder, no suggestion chips above it;
//  (2) the Sam question's options and counts equal the engine's own (searchMeta.asks from the page's own search answer),
//      in order, "Any {make}" last;
//  (3) the rigid grid: in every row of cards the image tops and heights, title regions, Sam boxes and action baselines
//      line up (1 px), and NO star, heart or save icon on any card;
//  (4) "Sold before" / "Listed before" tags are outlined (a border, no filled background) and a click opens the history
//      popup with data (a date and a price);
//  (5) "Have Sam keep looking" and "Have Sam keep looking for {search}" come after the results, never inside a card;
//  (6) every card keeps its photo (or its no-photo slot) and its actions (View auction and Market Check);
//  (7) every live card carries the dark source and time label and the "LAST BID SEEN" strip.
// Every FAIL prints the text it saw and the time.
//   CREW=... PROBE_KEY=... VERCEL_AUTOMATION_BYPASS_SECRET=... OPEN_LOCKS_SCRIPT=... MAIN_CHECKOUT=... node scripts/buy1fLive.mjs --live
import puppeteer from "puppeteer-core";
import { execSync } from "node:child_process";
if (!process.argv.includes("--live")) { console.log("buy1fLive: LIVE script (production). Pass --live, in a named gap only."); process.exit(2); }
const BASE = "https://goasksam.com", HOST = "goasksam.com", CREW = process.env.CREW, KEY = process.env.PROBE_KEY, BYP = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
const PLACEHOLDER = "Tell Sam what to change, like under 50,000 miles or near 90210";
const SEARCHES = [{ label: "red Porsche", url: "/buy?q=red+Porsche&make=Porsche&colour=red", make: "Porsche" }, { label: "Porsche 911", url: "/buy?q=Porsche+911&make=Porsche&model=911", make: "Porsche" }];
const now = () => new Date().toISOString().slice(11, 19) + "Z";
const busy = () => { if (!process.env.OPEN_LOCKS_SCRIPT || !process.env.MAIN_CHECKOUT) return ""; try { return execSync(`git -C "${process.env.MAIN_CHECKOUT}" fetch -q origin main && git -C "${process.env.MAIN_CHECKOUT}" show origin/main:docs/lane-notes.md | node "${process.env.OPEN_LOCKS_SCRIPT}"`, { encoding: "utf8" }).trim(); } catch { return ""; } };
const guard = () => { for (let i = 0; i < 120; i++) { const b = busy(); if (!b) return; console.log(`  (waiting ${now()}: ${b.slice(0, 60)})`); execSync("sleep 15"); } throw new Error("a lane stayed busy 30 minutes"); };
let fails = 0, rows = 0; const fail = (w, m) => { fails++; console.log(`  FAIL ${w} at ${now()}: ${m}`); };
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", args: ["--no-sandbox"] });
try {
  for (const S of SEARCHES) for (const width of [1440, 390]) {
    rows++; const w = `${S.label} at ${width}`;
    guard();
    const p = await browser.newPage(); await p.setViewport({ width, height: 1000, isMobile: width < 600 });
    await p.setRequestInterception(true);
    p.on("request", r => { let own = false; try { own = new URL(r.url()).host === HOST; } catch {} r.continue(own ? { headers: { ...r.headers(), ...(KEY ? { "x-ops-key": KEY, "x-launch-stage-test": "2" } : {}), ...(BYP ? { "x-vercel-protection-bypass": BYP } : {}) } } : undefined); });
    if (CREW) await p.setCookie({ name: "gas_crew", value: CREW, domain: HOST, path: "/" });
    let asks = null; p.on("response", async res => { try { if (/\/api\/buySearch$/.test(new URL(res.url()).pathname)) { const j = await res.json(); const a = j && ((j.searchMeta && j.searchMeta.asks) || (j.meta && j.meta.asks)); if (Array.isArray(a)) asks = a; } } catch {} });
    await p.goto(BASE + S.url, { waitUntil: "domcontentloaded", timeout: 60000 });
    for (let k = 0; k < 60; k++) { const n = await p.evaluate(() => document.querySelectorAll("article.car:not(.skel)").length).catch(() => 0); if (n >= 3) break; await new Promise(r => setTimeout(r, 500)); }
    await new Promise(r => setTimeout(r, 2500));
    const D = await p.evaluate(() => {
      const vis = el => { const r = el.getBoundingClientRect(), cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none"; };
      const inputs = [...document.querySelectorAll("input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=submit]):not([type=button]), textarea")].filter(vis).filter(i => !(i.name === "zip" && i.getAttribute("inputmode") === "numeric" && i.closest(".ask, .narrowq, .ask-zip")))   /* Lane F: zip answer boxes inside the engine question are allowed */.map(i => ({ id: i.id, ph: i.getAttribute("placeholder") || "", pos: getComputedStyle(i.closest("form, .composer, .search") || i).position, bottom: Math.round(window.innerHeight - i.getBoundingClientRect().bottom) }));
      const comp = document.querySelector("#q"), compBox = comp && (comp.closest(".search, .composer, form") || comp.parentElement);
      const chipsAbove = compBox ? [...compBox.parentElement.children].filter(el => el !== compBox && el.getBoundingClientRect().bottom <= compBox.getBoundingClientRect().top + 2 && el.getBoundingClientRect().bottom > compBox.getBoundingClientRect().top - 120 && vis(el) && el.querySelector("button, .chip, .qchip, .sq-chip")).map(el => (el.innerText || "").replace(/\s+/g, " ").slice(0, 80)) : [];
      const cards = [...document.querySelectorAll("article.car:not(.skel)")].filter(vis);
      const box = el => { if (!el) return null; const r = el.getBoundingClientRect(); return { top: Math.round(r.top + scrollY), h: Math.round(r.height), bottom: Math.round(r.bottom + scrollY) }; };
      const C = cards.map(c => ({
        sold: c.classList.contains("soldc"), photo: !!c.querySelector(".ph img, .ph, .noimg, .ph-empty"), img: box(c.querySelector(".ph")), title: box(c.querySelector("h3")), sam: box(c.querySelector(".rung, .sl")), acts: box(c.querySelector(".acts")), top: Math.round(c.getBoundingClientRect().top + scrollY),
        actText: (c.querySelector(".acts") ? c.querySelector(".acts").innerText : "").replace(/\s+/g, " "), src: (c.querySelector(".src") || {}).innerText || "", srcBg: c.querySelector(".src") ? getComputedStyle(c.querySelector(".src")).backgroundColor : "", lbid: /LAST BID SEEN/.test(c.innerText),
        icon: /[★☆♥♡]/.test(c.innerText) || !!c.querySelector('[aria-label*="save" i], [aria-label*="favo" i], [aria-label*="star" i], .star, .heart, .fav, .save'),
        tags: [...c.querySelectorAll("button, a, span")].filter(t => /^(Sold before|Listed before)$/.test((t.innerText || "").trim())).map(t => { const cs = getComputedStyle(t); return { text: t.innerText.trim(), bg: cs.backgroundColor, border: cs.borderTopWidth + " " + cs.borderTopStyle + " " + cs.borderTopColor }; }),
        title2: c.querySelector("h3") ? Math.round(c.querySelector("h3").getBoundingClientRect().height / parseFloat(getComputedStyle(c.querySelector("h3")).lineHeight || 20)) : null
      }));
      const kl = [...document.querySelectorAll("*")].filter(el => el.children.length === 0 && /Have Sam keep looking/.test(el.textContent || "")).map(el => ({ text: el.textContent.trim().slice(0, 90), inCard: !!el.closest("article.car"), afterLast: cards.length ? !!(cards[cards.length - 1].compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) : null }));
      const q = document.querySelector(".narrowq, .ask, .sq"); const qChips = q ? [...q.querySelectorAll("button, .qchip, .sq-chip, .achip")].filter(vis).map(b => (b.innerText || "").replace(/\s+/g, " ").trim()) : [];
      return { inputs, chipsAbove, C, kl, qText: q ? (q.innerText || "").replace(/\s+/g, " ").slice(0, 200) : null, qChips, compPh: comp ? comp.getAttribute("placeholder") : null };
    });
    console.log(`${w}: ${D.C.length} cards, ${D.inputs.length} text input(s), question "${D.qText}"`);
    // (1) the composer
    if (D.inputs.length !== 1) fail(w, `${D.inputs.length} visible text inputs: ${JSON.stringify(D.inputs.map(i => i.id || i.ph.slice(0, 30)))}`);
    if (D.compPh !== PLACEHOLDER) fail(w, `the composer's placeholder is "${D.compPh}"`);
    if (D.inputs[0] && !/sticky|fixed/.test(D.inputs[0].pos)) fail(w, `the composer is not sticky (position ${D.inputs[0].pos})`);
    if (D.chipsAbove.length) fail(w, `suggestion chips above the composer: ${JSON.stringify(D.chipsAbove)}`);
    // (2) the Sam question's options and counts equal the engine's
    const a = asks && asks[0];
    if (a && a.chips) {
      const want = [...a.chips.map(c => `${c.label} (${c.n})`), a.any ? `${a.any.label} (${a.any.n})` : null].filter(Boolean);
      const got = D.qChips.filter(t => /\(\d+\)$/.test(t));
      if (JSON.stringify(got) !== JSON.stringify(want)) fail(w, `the question's chips ${JSON.stringify(got)} are not the engine's ${JSON.stringify(want)}`);
      if (a.any && !new RegExp("^Any ").test(a.any.label)) fail(w, `the last chip is "${a.any.label}"`);
    } else console.log(`  (no engine question on this search at ${now()})`);
    // (3) the rigid grid, by row (cards with the same top)
    const byRow = new Map(); for (const c of D.C) { const k = c.top; if (!byRow.has(k)) byRow.set(k, []); byRow.get(k).push(c); }
    for (const [top, cs] of byRow) { if (cs.length < 2) continue;
      const spread = f => { const v = cs.map(f).filter(x => x != null); return v.length ? Math.max(...v) - Math.min(...v) : 0; };
      const d = { "image top": spread(c => c.img && c.img.top), "image height": spread(c => c.img && c.img.h), "title top": spread(c => c.title && c.title.top), "Sam box top": spread(c => c.sam && c.sam.top), "Sam box height": spread(c => c.sam && c.sam.h), "action baseline": spread(c => c.acts && c.acts.bottom) };
      for (const [k, v] of Object.entries(d)) if (v > 1) fail(w, `row at y=${top}: ${k} differs by ${v}px across ${cs.length} cards`); }
    for (const [i, c] of D.C.entries()) {
      if (c.icon) fail(w, `card ${i + 1} carries a star, heart or save icon`);
      if (c.title2 && c.title2 > 2) fail(w, `card ${i + 1}'s title runs ${c.title2} lines`);
      // (6) photo and actions
      if (!c.photo) fail(w, `card ${i + 1} has no photo or no-photo slot`);
      if (!c.sold && !(/View auction/.test(c.actText) && /Market Check/.test(c.actText))) fail(w, `card ${i + 1}'s actions read "${c.actText}"`);
      // (7) the dark source and time label and the LAST BID SEEN strip on every live card
      if (!c.sold && !(c.src && / · /.test(c.src))) fail(w, `card ${i + 1}'s source and time label reads "${c.src}"`);
      if (!c.sold && !c.lbid) fail(w, `card ${i + 1} has no LAST BID SEEN strip`);
      // (4) tags outlined, never filled
      for (const t of c.tags) { const filled = t.bg && !/rgba\(0, 0, 0, 0\)|transparent/.test(t.bg) && !/^rgb\(2[3-5]\d, 2[3-5]\d, 2[1-5]\d\)$/.test(t.bg); if (filled || /^0px|none/.test(t.border)) fail(w, `card ${i + 1}'s "${t.text}" tag: background ${t.bg}, border ${t.border}`); }
    }
    // (4) a tag opens the popup with data
    const opened = await p.evaluate(async () => { const t = [...document.querySelectorAll("article.car button, article.car a, article.car span")].find(x => /^(Sold before|Listed before)$/.test((x.innerText || "").trim())); if (!t) return null; t.click(); await new Promise(r => setTimeout(r, 1500)); const pop = [...document.querySelectorAll("[role=dialog], .hp-full, .hp-b, .pop, dialog")].find(e => e.getBoundingClientRect().height > 0); return pop ? (pop.innerText || "").replace(/\s+/g, " ").slice(0, 200) : ""; });
    if (opened === "") fail(w, "a Sold before / Listed before tag opened no popup");
    else if (opened && !(/\$\d/.test(opened) && /(19|20)\d\d|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec/.test(opened))) fail(w, `the history popup shows no sale data: "${opened}"`);
    // (5) keep looking: after the results, never on a card
    if (!D.kl.length) fail(w, "no \"Have Sam keep looking\" after the results");
    for (const k of D.kl) { if (k.inCard) fail(w, `"${k.text}" is inside a card`); if (k.afterLast === false) fail(w, `"${k.text}" comes before the last card`); }
    if (!D.kl.some(k => /^Have Sam keep looking for .+/.test(k.text))) fail(w, `no "Have Sam keep looking for {search}" button (${JSON.stringify(D.kl.map(k => k.text))})`);
    await p.close();
  }
} finally { await browser.close(); }
console.log(fails ? `buy1fLive: ${rows} pages, ${fails} FAIL` : `buy1fLive: ${rows} pages, all pass`);
process.exit(fails ? 1 : 0);
