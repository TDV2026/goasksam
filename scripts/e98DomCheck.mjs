// The DOM rules of the number rule, shared by underlineCheck.mjs (fixtures) and e98LiveCheck.mjs (production): read the COMPUTED styles of every answer card on a page.
export const inPage = () => {
  const out = { under: [], small: [], tiny: [], text: [], lines: [], bigLinks: [], contradict: [], keep: [], sale: [], classes: [], specs: [], panels: [], strip: null, pillsInCard: [], slots: [], chipWrap: [], findBad: [], footers: [], slotRows: 0, counts: null, sales: null, ranges: [], yearNo: null, chartText: [], linkPos: [], metaBad: [], single: null, gaps: 0, bidWords: [] };
  const vis = e => { const r = e.getBoundingClientRect(), s = getComputedStyle(e); return r.width > 2 && r.height > 2 && s.visibility !== "hidden" && s.display !== "none"; };
  const cards = [...document.querySelectorAll(".sfc-card, .car .sl")];
  const underlined = e => { for (let n = e; n && n !== document.body; n = n.parentElement) { if (/underline/.test(getComputedStyle(n).textDecorationLine || "")) return true; } return false; };
  const inAnchor = e => !!e.closest("a[href]");
  for (const card of cards) {
    out.text.push(card.innerText);
    const walker = document.createTreeWalker(card, NodeFilter.SHOW_TEXT);
    for (let t; (t = walker.nextNode());) {
      if (!/\$\s?\d/.test(t.nodeValue)) continue;
      const e = t.parentElement; if (!e || !vis(e) || e.closest(".sfc-sr")) continue;
      if (underlined(e) || inAnchor(e)) out.under.push(t.nodeValue.trim().slice(0, 60) + (inAnchor(e) ? " [in a link]" : " [underlined]"));
      if (/\$[\d,]+\s*(?:to)\s*\$[\d,]+/.test(t.nodeValue) && parseFloat(getComputedStyle(e).fontSize) < 20 && !e.closest(".fx-sales, .md-opts, .fx-near, .fx-count, .sfc-small")) out.tiny.push(t.nodeValue.trim().slice(0, 60) + " @" + getComputedStyle(e).fontSize);
    }
    // the small lines under the figures: a visible text block under 15px that is not a label (uppercase), a count under a block, a pill, the footer, the spec, a sale line or a button
    let n = 0;
    for (const e of card.querySelectorAll("p, div")) {
      if (!vis(e) || e.closest(".sfc-footer, .sfc-pill, .sfc-block, .acts, .fx-sales, button, .sfc-rows, .sfc-narrow") || e.querySelector("p, div, button")) continue;
      const s = getComputedStyle(e);
      if (s.textTransform === "uppercase" || e.classList.contains("fx-spec") || e.classList.contains("who") || /^SAM$/i.test(e.innerText.trim())) continue;
      if (parseFloat(s.fontSize) < 15 && e.innerText.trim()) n++;
    }
    out.lines.push(n);
  }
  // a link in a Find card that is larger than body text AND underlined (the old "See the bid on {platform}" heading above the car's name): the card's one link to the auction is the View auction button
  for (const a of document.querySelectorAll("article.car a[href]")) if (vis(a) && parseFloat(getComputedStyle(a).fontSize) > 16.5 && underlined(a)) out.bigLinks.push(a.innerText.trim().slice(0, 50) + " @" + getComputedStyle(a).fontSize);
  // a header line that says there is nothing while cards are drawn below it; and the "Have Sam keep looking" button's colour (never red: it reads as a delete button), against View auction's own green
  const drawn = document.querySelectorAll("article.car:not(.skel)").length, bodyText = document.body.innerText;
  out.drawn = drawn; out.hasNothingLine = /No live matches right now|Nothing live fits yet|Nothing live right now/.test(bodyText);
  if (drawn > 0 && out.hasNothingLine) out.contradict.push((bodyText.match(/No live matches right now|Nothing live fits yet|Nothing live right now/) || [""])[0] + " over " + drawn + " cards");
  const rgb = c => (/rgba?\((\d+), (\d+), (\d+)/.exec(c) || []).slice(1, 4).map(Number), v = document.querySelector("a.vauc");
  for (const b of document.querySelectorAll(".kl-btn, .gas-kl-btn")) if (vis(b)) { const c = rgb(getComputedStyle(b).backgroundColor), g = v ? rgb(getComputedStyle(v).backgroundColor) : null; out.keep.push({ bg: c.join(","), red: c[0] > c[1] + 60 && c[0] > c[2] + 60, sameAsView: g ? c.join() === g.join() : null }); }
  // one visual weight for the sale lines: every sale line in a Find card is the same size, weight and family, none underlined (the underline itself is caught above); the spec chips row is read for the chips-unaffected rule
  for (const s of document.querySelectorAll("article.car .fx-sale")) if (vis(s)) { const cs = getComputedStyle(s); out.sale.push(cs.fontSize + "|" + cs.fontWeight + "|" + cs.fontFamily.split(",")[0]); }
  for (const s of document.querySelectorAll("article.car .specs .spec")) if (vis(s)) out.specs.push(s.innerText.trim() + (/underline/.test(getComputedStyle(s).textDecorationLine) ? " [underlined]" : ""));
  out.classes = [...new Set([...document.querySelectorAll("article.car *")].flatMap(e => [...e.classList]))];
  // THE NARROW STRIP AND THE CHART PANEL (e98 narrow strip). A pill or the mileage box inside the answer card; the strip's place and heading; every chart panel's heading, kind and, for dots, any line that is not a gridline.
  for (const e of document.querySelectorAll(".sfc-card .sfc-pill, .sfc-card .sfc-chip, .sfc-card .sfc-narrow, .sfc-card #ob-miles, .sfc-card .hero-miles")) if (vis(e)) out.pillsInCard.push((e.className || e.id || e.tagName) + "");
  const strip = document.querySelector(".narrow-strip"), card0 = document.querySelector(".sfc-card");
  if (strip) { const sr = strip.getBoundingClientRect(), cr = card0 ? card0.getBoundingClientRect() : null; out.strip = { labels: [...strip.querySelectorAll(".sfc-label")].map(e => e.innerText.trim()), pills: strip.querySelectorAll(".sfc-pill").length, miles: !!strip.querySelector("#ob-miles"), below: cr ? sr.top >= cr.bottom - 1 && sr.top - cr.bottom < 90 : null, gap: cr ? Math.round(sr.top - cr.bottom) : null }; }
  for (const pn of document.querySelectorAll(".hero-chart")) { const svg = pn.querySelector("svg.hc-svg");
    out.panels.push({ kind: pn.getAttribute("data-chart"), heading: (pn.querySelector("h2") || {}).innerText || "", scope: (pn.querySelector(".hc-scope") || {}).innerText || "", note: (pn.querySelector(".hc-note") || {}).innerText || "",
      paths: svg ? svg.querySelectorAll("polyline, path, polygon").length : 0, loose: svg ? [...svg.querySelectorAll("line")].filter(l => !l.classList.contains("hc-grid") && !l.closest(".hc-candle")).length : 0, flat: svg ? [...svg.querySelectorAll("line.hc-grid")].every(l => l.getAttribute("y1") === l.getAttribute("y2")) : true, circles: svg ? svg.querySelectorAll("circle.hc-dot").length : 0 }); }
  // THE FIND CARD'S SLOTS (Sam, Oct 28 2026): cards in the same row have identical slot tops (source line, title, answer, small line, buttons) within 1px; the chip row is one row; no sale line, no "pick one", no second range, no near-miles or band line; the Sam box is the spec, the answer and ONE small line.
  const rowsOf = {}; for (const c of document.querySelectorAll(".cgrid > article.car")) if (vis(c)) (rowsOf[Math.round(c.getBoundingClientRect().top)] = rowsOf[Math.round(c.getBoundingClientRect().top)] || []).push(c);
  const SLOTS = { source: ".tx > .src", title: ".tx > .trow", answer: ".tx > .sl > .fx-ans", small: ".tx > .sl > .fx-count", buttons: ".tx > .acts" };
  for (const row of Object.values(rowsOf)) { if (row.length < 2) continue; out.slotRows++;
    for (const [k, sel] of Object.entries(SLOTS)) { const tops = row.map(c => { const e = c.querySelector(sel); return e ? Math.round(e.getBoundingClientRect().top * 10) / 10 : null; }).filter(v => v !== null); if (tops.length > 1 && Math.max(...tops) - Math.min(...tops) > 1) out.slots.push(k + " tops " + tops.join("/")); } }
  for (const p of document.querySelectorAll("article.car .specs")) { const ch = [...p.querySelectorAll(".spec")].filter(vis); if (ch.length && (new Set(ch.map(e => Math.round(e.getBoundingClientRect().top))).size > 1 || p.scrollWidth > p.clientWidth + 1)) out.chipWrap.push(ch.map(e => e.innerText).join(" | ")); }
  for (const c of document.querySelectorAll("article.car")) { const sl = c.querySelector(".sl"); if (!sl) continue; const txt = sl.innerText.replace(/\s+/g, " "), kids = [...sl.children].filter(e => !e.classList.contains("who") && !e.classList.contains("reading") && !e.classList.contains("nt"));
    if (sl.querySelector(".fx-sale, .fx-sales, .fx-near, .fx-lab, .same")) out.findBad.push("sale line, near line, option label or exact-car line in the Sam box");
    if (/pick one|Pick one/i.test(txt)) out.findBad.push('a "pick one" line');
    if ((txt.match(/\$[\d,]+ to \$[\d,]+/g) || []).length > 1) out.findBad.push("a second range: " + txt.slice(0, 80));
    if (/Near [\d,]+ miles|miles near|near [\d,]+ miles/i.test(txt)) out.findBad.push("a near-miles or mileage band line: " + txt.slice(0, 80));
    if (kids.length && (kids.length > 3 || !kids.every(e => /fx-spec|fx-ans|fx-count/.test(e.className)))) out.findBad.push("the Sam box is not spec, answer, one small line: " + kids.map(e => e.className).join(",")); }
  // the Market Check card's footer
  for (const f of document.querySelectorAll(".sfc-footer-left")) out.footers.push(f.innerText.replace(/\s+/g, " ").trim());
  // COUNTS AND SALES (Sam's review, Oct 28 2026). Every number on a Market Check screen is read here and compared by judge: a pill never exceeds the headline count; a split's blocks add up to the footer count; "for all N" is the headline count;
  // the hero, the footer, "All N comparable sales" and the table agree; each of the three sales behind the answer sits inside a shown range; every listed sale belongs to the page's car; no row has a year the page says there are no sales of.
  const W = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 }, N = s => { const k = String(s).toLowerCase(); return k in W ? W[k] : Number(k.replace(/,/g, "")); }, firstN = (s, re) => { const m = re.exec(s || ""); return m ? N(m[1]) : null; }, hero = document.querySelector(".hero-scope");
  if (hero) {
    out.counts = { hero: firstN(hero.innerText, /(\d[\d,]*|one|two|three|four|five|six|seven|eight|nine|ten) sales?/i), footer: firstN((document.querySelector(".sfc-footer-left") || {}).innerText, /(\d[\d,]*|one|two|three|four|five|six|seven|eight|nine|ten) sales?/i), allH: firstN([...document.querySelectorAll("h2")].map(e => e.innerText).find(x => /^All \d/.test(x)), /^All (\d[\d,]*)/),
      rows: document.querySelectorAll(".allsales-table tbody tr").length, pills: [...document.querySelectorAll(".narrow-strip .sfc-pn")].map(e => N(e.innerText)), pillNames: [...document.querySelectorAll(".narrow-strip .sfc-pill")].map(e => (e.firstElementChild || e).innerText.replace(/\s+/g, " ").trim()), blocks: [...document.querySelectorAll(".sfc-card .sfc-block .sfc-count")].map(e => firstN(e.innerText, /(\d[\d,]*)/)),
      forAll: firstN((document.querySelector(".hero-miles") || {}).innerText, /for all (\d[\d,]*|one|two|three|four|five|six|seven|eight|nine|ten)/i) };
    const rg = txt => [...String(txt).matchAll(/\$([\d,]+) to \$([\d,]+)/g)].map(m => [N(m[1]), N(m[2])]);
    out.ranges = rg([...document.querySelectorAll(".sfc-card .sfc-range")].map(e => e.innerText).join(" "));
    out.sales = { trio: [...document.querySelectorAll(".salescard")].map(e => ({ price: N(((e.querySelector(".salescard-price") || {}).innerText || "").replace(/[^\d]/g, "")), title: (e.querySelector(".salescard-title") || {}).innerText || "" })),
      rows: [...document.querySelectorAll(".allsales-table tbody tr")].map(r => ({ title: (r.children[1] || {}).innerText || "", price: N(((r.lastElementChild || {}).innerText || "").replace(/[^\d]/g, "")) })) };
    const yn = /No (\d{4}) sales/.exec(document.querySelector(".sfc-card") ? document.querySelector(".sfc-card").innerText : ""); out.yearNo = yn ? yn[1] : null;
  }
  out.gaps = document.querySelectorAll(".hero-chart .hc-gap").length;
  for (const pn of document.querySelectorAll(".hero-chart")) out.chartText.push(pn.innerText.replace(/\s+/g, " ").trim());
  for (const card of document.querySelectorAll(".sfc-card")) { const l = card.querySelector(".sfc-footer-left"), k = [...card.querySelectorAll(".sfc-footer-link")].find(a => /How Sam decides/.test(a.innerText)); if (l && k && vis(k)) { const lr = l.getBoundingClientRect(), kr = k.getBoundingClientRect(); out.linkPos.push(Math.abs(kr.left - lr.left) <= 1 && kr.top >= lr.bottom - 1 ? "ok" : "left " + Math.round(kr.left - lr.left) + " top " + Math.round(kr.top - lr.bottom)); } }
  for (const c of document.querySelectorAll("article.car")) { const m = c.querySelector(".tx > .meta"); if (!m) out.metaBad.push("no meta slot"); else { if (/not listed|not stated|unknown/i.test(m.innerText)) out.metaBad.push(m.innerText.trim().slice(0, 60)); if (m.getBoundingClientRect().height < 14) out.metaBad.push("meta slot has no height"); } }
  out.bidWords = []; for (const c of document.querySelectorAll("article.car")) { const mv = c.querySelector(".mlab .mv"), r = c.querySelector(".sl .fx-range"), w = c.querySelector(".sl .fx-count"); if (!mv || !r || !w) continue; const bid = N(mv.innerText.replace(/[^\d]/g, "")), rr = /\$([\d,]+) to \$([\d,]+)/.exec(r.innerText), word = /The bid is (below|within|inside|above)/.exec(w.innerText); if (rr && word) out.bidWords.push({ bid, lo: N(rr[1]), hi: N(rr[2]), word: word[1] }); }
  { const g = document.querySelector(".cgrid"), cs = [...document.querySelectorAll(".cgrid > article.car")].filter(vis); if (g && cs.length === 1) out.single = { w: Math.round(cs[0].getBoundingClientRect().width), g: Math.round(g.getBoundingClientRect().width), vw: innerWidth }; }
  out.cards = cards.length;
  out.figure = [...document.querySelectorAll(".sfc-range, .fx-range")].filter(e => vis(e) && !e.closest(".sfc-sr") && parseFloat(getComputedStyle(e).fontSize) >= 20).length;
  return out;
};

export const judge = (ok, name, r, needs) => {
  ok(r.cards > 0, `${name}: an answer card is on the page`);
  ok(!r.under.length, `${name}: no currency figure is underlined or a link${r.under.length ? " (" + r.under.slice(0, 3).join(" | ") + ")" : ""}`);
  ok(!r.bigLinks.length, `${name}: no link in a Find card is larger than body text and underlined${r.bigLinks.length ? " (" + r.bigLinks.slice(0, 2).join(" | ") + ")" : ""}`);
  ok(new Set(r.sale).size <= 1, `${name}: the sale lines carry one visual weight (${[...new Set(r.sale)].join(" ; ") || "none on the page"})`);
  ok(!r.specs.some(s => /underlined/.test(s)), `${name}: the spec chips row is not underlined`);
  ok(!r.pillsInCard.length, `${name}: no pill and no mileage box inside the answer card${r.pillsInCard.length ? " (" + r.pillsInCard.slice(0, 2).join(", ") + ")" : ""}`);
  if (r.strip) { ok(r.strip.labels.length === 1 && /^narrow by$/i.test(r.strip.labels[0]), `${name}: the strip has one heading NARROW BY (${r.strip.labels.join(" | ")})`); ok(r.strip.below !== false, `${name}: the strip sits directly below the card (${r.strip.gap}px)`); }
  ok(r.panels.every(q => /How this market has moved/.test(q.heading)), `${name}: every chart panel carries the heading "How this market has moved" (${r.panels.map(q => q.kind + ":" + (q.heading ? "heading" : "NO HEADING")).join(", ") || "no panel"})`);
  ok(r.panels.every(q => q.circles === 0 && q.kind !== "dots"), `${name}: NEVER a dot: no per-sale point in any chart panel (${r.panels.map(q => q.circles + " points").join(", ") || "no panel"})`);
  ok(!r.slots.length, `${name}: cards in a row share their slot tops within 1px (${r.slotRows} rows read${r.slots.length ? "; " + r.slots.slice(0, 3).join(" ; ") : ""})`);
  ok(!r.chipWrap.length, `${name}: the chip row is one row and never wraps${r.chipWrap.length ? " (" + r.chipWrap[0] + ")" : ""}`);
  ok(!r.findBad.length, `${name}: a Find card prints no sale line, no pick one line, no second range, no near-miles or band line, and its Sam box is three slots${r.findBad.length ? " (" + r.findBad.slice(0, 2).join(" ; ") + ")" : ""}`);
  ok(r.footers.every(f => /^\d[\d,]* sales,? since [A-Z][a-z]+ \d{4}\. Updated [A-Z][a-z]{2} \d{1,2}, \d{4}\.$/.test(f) && !/Powered by/.test(f)), `${name}: the card footer reads "N sales since Month Year. Updated Oct 28, 2026." with no Powered by (${r.footers.join(" | ") || "no footer"})`);
  if (r.counts) { const c = r.counts, h = c.hero;
    ok(c.pills.every(n => n <= h), `${name}: no pill count exceeds the headline count ${h} (pills ${c.pills.join(", ") || "none"})`);
    ok(new Set(c.pillNames).size === c.pillNames.length, `${name}: no pill appears twice (${c.pillNames.join(" | ") || "no pills"})`);
    if (c.blocks.length) ok(c.blocks.reduce((a, b) => a + b, 0) === c.footer, `${name}: the split's blocks add up to the footer count (${c.blocks.join(" + ")} = ${c.blocks.reduce((a, b) => a + b, 0)}, footer ${c.footer})`);
    if (c.forAll != null) ok(c.forAll === h, `${name}: "for all N" is the headline count (${c.forAll} against ${h})`);
    ok(c.footer === h && (c.allH === null || c.allH === h) && (c.rows === 0 || c.rows === h), `${name}: the headline, the footer, "All N comparable sales" and the table agree (${h} / ${c.footer} / ${c.allH} / ${c.rows} rows)`);
    const inRange = p => r.ranges.length === 0 || r.ranges.some(([lo, hi]) => p >= lo && p <= hi), trio = r.sales ? r.sales.trio : [];
    ok(trio.every(s => inRange(s.price)), `${name}: each sale behind the answer sits inside a shown range (${trio.map(s => "$" + s.price).join(", ") || "none"} against ${r.ranges.map(x => x.join("-")).join(" and ") || "no range"})`);
    const listed = r.sales ? [...trio, ...r.sales.rows] : [];
    if (needs && needs.length) ok(listed.every(s => needs.every(w => s.title.toLowerCase().includes(w.toLowerCase()))), `${name}: every listed sale belongs to the page's car (${needs.join(" ")}): ${listed.filter(s => !needs.every(w => s.title.toLowerCase().includes(w.toLowerCase()))).slice(0, 2).map(s => s.title).join(" | ") || "all of them"}`);
    if (r.yearNo) ok(listed.every(s => !s.title.includes(r.yearNo)), `${name}: no listed sale is from ${r.yearNo} where the page says there are no ${r.yearNo} sales`); }
  ok(r.chartText.every(tx => { const lines = tx.split(/(?<=[.!?])\s+/).map(x => x.trim().toLowerCase()).filter(Boolean); return new Set(lines).size === lines.length && (tx.match(/sales only/gi) || []).length <= 1; }), `${name}: the chart panel says nothing twice ("sales only" at most once)`);
  ok(r.linkPos.every(x => x === "ok"), `${name}: How Sam decides sits in the same place in every card footer, under the footer line and flush left (${r.linkPos.join(", ") || "no footer"})`);
  ok(!r.metaBad.length, `${name}: every Find card keeps its miles-and-place slot, with its height, and never prints a not-listed label${r.metaBad.length ? " (" + r.metaBad[0] + ")" : ""}`);
  ok(r.bidWords.every(b => (b.word === "below" ? b.bid < b.lo : b.word === "above" ? b.bid > b.hi : b.bid >= b.lo && b.bid <= b.hi)), `${name}: each card's bid sentence agrees with its last bid and its range (${r.bidWords.map(b => "$" + b.bid + " " + b.word + " " + b.lo + "-" + b.hi).join("; ") || "none to read"})`);
  if (r.single) ok(r.single.vw < 700 || r.single.w <= r.single.g * 0.5 + 2, `${name}: a single Find card is sized like the others, not full width (${r.single.w}px of ${r.single.g}px)`);
  ok(!r.contradict.length, `${name}: no header line says there is nothing over drawn cards${r.contradict.length ? " (" + r.contradict[0] + ")" : ""}`);
  ok(r.keep.every(k => !k.red && k.sameAsView !== false), `${name}: the Have Sam keep looking button is not red and is View auction's green (${r.keep.map(k => k.bg).join(" | ") || "none on the page"})`);
  ok(!r.tiny.length, `${name}: every range is set large${r.tiny.length ? " (" + r.tiny.slice(0, 2).join(" | ") + ")" : ""}`);
  ok(r.lines.every(n => n <= 2), `${name}: at most two small lines under the figures (${r.lines.join(", ")})`);
  const all = r.text.join(" ");
  ok(!/Sales read on|Sales since then are not in yet|Updating now/.test(all), `${name}: the stale line never prints`);
  ok(!/Latest sale: [A-Z]/.test(all), `${name}: no "Latest sale: Month Year" line`);
};
