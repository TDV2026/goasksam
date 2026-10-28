// The DOM rules of the number rule, shared by underlineCheck.mjs (fixtures) and e98LiveCheck.mjs (production): read the COMPUTED styles of every answer card on a page.
export const inPage = () => {
  const out = { under: [], small: [], tiny: [], text: [], lines: [], bigLinks: [], contradict: [], keep: [] };
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
  out.cards = cards.length;
  out.figure = [...document.querySelectorAll(".sfc-range, .fx-range")].filter(e => vis(e) && !e.closest(".sfc-sr") && parseFloat(getComputedStyle(e).fontSize) >= 20).length;
  return out;
};

export const judge = (ok, name, r) => {
  ok(r.cards > 0, `${name}: an answer card is on the page`);
  ok(!r.under.length, `${name}: no currency figure is underlined or a link${r.under.length ? " (" + r.under.slice(0, 3).join(" | ") + ")" : ""}`);
  ok(!r.bigLinks.length, `${name}: no link in a Find card is larger than body text and underlined${r.bigLinks.length ? " (" + r.bigLinks.slice(0, 2).join(" | ") + ")" : ""}`);
  ok(!r.contradict.length, `${name}: no header line says there is nothing over drawn cards${r.contradict.length ? " (" + r.contradict[0] + ")" : ""}`);
  ok(r.keep.every(k => !k.red && k.sameAsView !== false), `${name}: the Have Sam keep looking button is not red and is View auction's green (${r.keep.map(k => k.bg).join(" | ") || "none on the page"})`);
  ok(!r.tiny.length, `${name}: every range is set large${r.tiny.length ? " (" + r.tiny.slice(0, 2).join(" | ") + ")" : ""}`);
  ok(r.lines.every(n => n <= 2), `${name}: at most two small lines under the figures (${r.lines.join(", ")})`);
  const all = r.text.join(" ");
  ok(!/Sales read on|Sales since then are not in yet|Updating now/.test(all), `${name}: the stale line never prints`);
  ok(!/Latest sale: [A-Z]/.test(all), `${name}: no "Latest sale: Month Year" line`);
};
