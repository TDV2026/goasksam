// THE RAIL, MEASURED ON SCREEN (Lane E, Nov 11 2026). The Find results rail (New search, Recent searches, and signed in Saved searches and Before it ends) was in the page's HTML but not on the screen for a visitor: a stray "$1" had replaced the shell's grid wrapper, so the rail fell back to the old drawer rules (full width, dark bar, no column).
// A check that found the element in the DOM passed. This reads the RENDERED box: visible, inside the viewport, in the shell's column and not over the results column; on a phone (860px and under) the rail is the Your searches button instead. Used by goLiveSignedInCheck (local) and goLiveLiveCheck (live).
export const PHONE_MAX = 860;
export async function probeRail(pg) {
  return pg.evaluate(() => {
    const vis = e => { if (!e) return false; const r = e.getBoundingClientRect(), c = getComputedStyle(e); return r.width > 0 && r.height > 0 && c.visibility !== "hidden" && c.display !== "none"; };
    const box = e => { if (!e) return null; const r = e.getBoundingClientRect(); return { l: Math.round(r.left), r: Math.round(r.right), t: Math.round(r.top), b: Math.round(r.bottom), w: Math.round(r.width), h: Math.round(r.height) }; };
    const rail = document.querySelector("aside.rail"), main = document.querySelector("#gas-main") || document.querySelector("main") || document.querySelector(".main"), nw = rail && rail.querySelector(".new"), mv = document.querySelector("[data-mvisits]");
    const heads = rail ? [...rail.querySelectorAll(".rh")].filter(vis).map(e => e.textContent.trim()) : [], links = rail ? [...rail.querySelectorAll("a.srch")].filter(vis) : [];
    const cs = e => { const c = getComputedStyle(e); return c.fontFamily + "|" + c.fontSize + "|" + c.textDecorationLine + "|" + c.color; };
    const kids = rail ? [...rail.querySelectorAll("*")].filter(vis).map(box) : [], rb = box(rail);
    const html = document.body.innerHTML.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, "");
    return { h1: [...document.querySelectorAll("h1")].filter(vis).length + [...document.querySelectorAll("h1")].filter(e => !vis(e)).length, vw: innerWidth, scrollW: document.documentElement.scrollWidth, rail: rb, railVisible: vis(rail), main: box(main), newBar: box(nw), heads, linkStyles: [...new Set(links.map(cs))], linkCount: links.length, mvisits: vis(mv), mvisBox: vis(mv) ? box(mv) : null, newLinkBox: (() => { const n = document.querySelector(".shead-new"); return vis(n) ? box(n) : null; })(),
      clipped: rb ? kids.filter(k => k.l < rb.l - 1 || k.r > rb.r + 1 || k.l < 0).length : 0, stray: /\$[1-9&](?=<)/.test(html) || /(^|\n)\$[1-9]\s*(\n|$)/.test(document.body.innerText) };
  });
}
// the problems, as sentences ([] = on screen as designed). signedIn: Saved searches and Before it ends are expected when the page was given them.
export function railProblems(p, { signedIn = false, expectSaved = false, expectAlerts = false, expectRecent = false } = {}) {
  const out = [];
  if (p.stray) out.push("a stray replacement marker ($1) is in the page");
  if (p.h1 !== 1) out.push(`the page has ${p.h1} h1 (one expected: the results pages get theirs from the query)`);
  if (p.scrollW > p.vw + 1) out.push(`the page scrolls sideways (${p.scrollW} wide in ${p.vw})`);
  if (p.vw <= 860 && p.mvisBox && p.newLinkBox) { const a = p.mvisBox, c = p.newLinkBox; if (a.l < c.r && c.l < a.r && a.t < c.b && c.t < a.b) out.push("the Your searches button overlaps the page's New search link"); }
  if (p.vw > 860) {
    if (!p.rail || !p.railVisible) { out.push("the rail is not on screen"); return out; }
    if (p.rail.w < 150 || p.rail.w > 320) out.push(`the rail is ${p.rail.w}px wide, not the shell's column (150 to 320)`);
    if (p.rail.l < 0 || p.rail.r > p.vw) out.push(`the rail is outside the screen (${p.rail.l} to ${p.rail.r} of ${p.vw})`);
    if (p.rail.t > 400) out.push(`the rail starts ${p.rail.t}px down the page`);
    if (p.main && p.main.l < p.rail.r - 1) out.push(`the rail (to ${p.rail.r}) overlaps the results column (from ${p.main.l})`);
    if (p.newBar && p.newBar.w > p.vw * 0.5) out.push(`the New search bar is ${p.newBar.w}px wide, the phone layout, not the desktop rail`);
    if (p.clipped) out.push(`${p.clipped} rail element(s) are clipped at the rail's edge or the screen's`);
    if (expectRecent && !p.heads.some(h => /recent searches/i.test(h))) out.push("Recent searches is not in the rail");
    if (signedIn && expectSaved && !p.heads.some(h => /saved searches/i.test(h))) out.push("signed in, Saved searches is not in the rail");
    if (signedIn && expectAlerts && !p.heads.some(h => /before it ends/i.test(h))) out.push("signed in, Before it ends is not in the rail");
    { const order = p.heads.map(h => /recent/i.test(h) ? 0 : /saved/i.test(h) ? 1 : /before/i.test(h) ? 2 : 9).filter(x => x < 9); if (order.some((x, i) => i && order[i - 1] > x)) out.push("the rail's sections are not in the order Recent searches, Saved searches, Before it ends (" + p.heads.join(", ") + ")"); }
    if (p.linkStyles.length > 1) out.push(`the rail's links are not in one style (${p.linkStyles.length} styles)`);
    if (p.linkStyles.some(s => /underline/.test(s))) out.push("the rail's links are underlined, the old raw link style");
  }
  return out;
}

// THE HEADER, AS DRAWN (Sam, Nov 11 2026): the BETA pill was pale type on a pale fill on every results page and fine on the landings, because a results page carries the live page's own stylesheet and an old .beta rule showed through. The header is one design on every route: the computed style of each header element, read on a landing and on its results page, must be the same.
export const HEADER_SELECTORS = ["header.gh", ".gh .wrap", ".gh .wm", ".gh .wm b", ".gh .beta", ".gh .tabs", ".gh .tabs a:not([aria-current]):not(.acct)", ".gh .tabs a[aria-current]", ".gh a.acct"];
const HEADER_PROPS = ["color", "backgroundColor", "backgroundImage", "fontFamily", "fontSize", "fontWeight", "lineHeight", "letterSpacing", "textTransform", "textDecorationLine", "borderTopColor", "borderTopWidth", "borderTopStyle", "borderBottomWidth", "borderRadius", "paddingTop", "paddingRight", "paddingBottom", "paddingLeft", "height", "display", "opacity", "boxShadow"];
export async function probeHeader(pg) {
  return pg.evaluate((sels, props) => Object.fromEntries(sels.map(s => { const e = document.querySelector(s); if (!e) return [s, null]; const c = getComputedStyle(e), r = e.getBoundingClientRect(); return [s, { ...Object.fromEntries(props.map(k => [k, c[k]])), _w: Math.round(r.width) }]; })), HEADER_SELECTORS, HEADER_PROPS);
}
// text widths and auto margins follow the web font's load, so only computed style is compared
export function headerDiffs(landing, results) {
  const out = [];
  for (const s of HEADER_SELECTORS) { const a = landing[s], b = results[s]; if (!a && !b) continue; if (!a || !b) { out.push(`${s} is on ${a ? "the landing" : "the results page"} only`); continue; }
    const d = Object.keys(a).filter(k => k !== "_w" && a[k] !== b[k]).map(k => `${k}: ${a[k]} on the landing, ${b[k]} on the results page`); if (d.length) out.push(`${s}: ${d.join("; ")}`); }
  return out;
}

// THE FORM STYLE ON THE NEW DESIGN (Sam, Nov 11 2026: the For business walkthrough form drew with no field borders, no field backgrounds and an unstyled button, because the page's form rules read tokens the shell had taken out). probeForms reads every VISIBLE field and button of the page as the browser computed it; formProblems judges them against the Find search box (the reference). The class: a field with no edge or fill of its own and no boxed container, a button with neither fill nor border, a field in another typeface than the search box; on the site pages (.sitecol, where the shell's form style applies) the field's size, ink, edge and fill, and the button's fill and ink, are the search box's and its Go button's exactly.
export async function probeForms(pg) {
  return pg.evaluate(() => {
    const vis = e => { const b = e.getBoundingClientRect(), cs = getComputedStyle(e); return b.width > 2 && b.height > 2 && cs.visibility !== "hidden" && cs.display !== "none" && b.right > 0 && b.left < innerWidth; };
    const st = e => { const c = getComputedStyle(e); return { bw: parseFloat(c.borderTopWidth) || 0, bs: c.borderTopStyle, bc: c.borderTopColor, bg: c.backgroundColor, radius: c.borderTopLeftRadius, ff: c.fontFamily, fs: c.fontSize, color: c.color, deco: c.textDecorationLine }; };
    const clear = bg => /^rgba\(\s*\d+,\s*\d+,\s*\d+,\s*0\s*\)$/.test(bg) || bg === "transparent";
    const boxed = s => s.bw >= 1 && s.bs !== "none" && !clear(s.bc) || !clear(s.bg);
    const out = [];
    for (const e of document.querySelectorAll("input, textarea, select, button, a[class*=btn], a[role=button]")) {
      if (!vis(e)) continue; const tag = e.tagName.toLowerCase(), type = (e.getAttribute("type") || "").toLowerCase();
      if (["hidden", "checkbox", "radio", "file", "range", "color"].includes(type)) continue;
      const isBtn = tag === "button" || tag === "a" || ["submit", "button"].includes(type), label = (e.innerText || e.value || "").trim();
      if (isBtn && label.length < 3) continue;   // an icon button (the mic, the arrow) is part of its box
      if (isBtn && !(e.closest("form") || e.closest(".sitecol") || e.closest("#auth-modal"))) continue;   // a button that is not a form's (the page's own links, tabs, chips) is judged by its page
      let anc = false; for (let a = e.parentElement, n = 0; a && n < 4; a = a.parentElement, n++) { if (boxed(st(a)) && st(a).bw >= 1) { anc = true; break; } }
      out.push({ tag, type, id: e.id || e.name || String(e.className).slice(0, 24), btn: isBtn, label: label.slice(0, 30), own: st(e), anc, site: !!e.closest(".sitecol") });
    }
    return out;
  });
}
export async function probeFormReference(pg) {
  return pg.evaluate(() => {
    const st = e => { const c = getComputedStyle(e); return { bw: parseFloat(c.borderTopWidth) || 0, bc: c.borderTopColor, bg: c.backgroundColor, radius: c.borderTopLeftRadius, ff: c.fontFamily, fs: c.fontSize, color: c.color }; };
    const i = document.querySelector("form.sb input, form.sb textarea"), box = i && i.closest("form.sb"), go = box && box.querySelector("button[type=submit], button.go, #go");
    return i && box && go ? { field: st(i), box: st(box), go: st(go) } : null;
  });
}
export function formProblems(controls, ref, where) {
  const bad = [], clear = bg => /^rgba\(\s*\d+,\s*\d+,\s*\d+,\s*0\s*\)$/.test(bg) || bg === "transparent";
  const boxed = s => (s.bw >= 1 && s.bs !== "none" && !clear(s.bc)) || !clear(s.bg);
  if (!ref) return [`${where}: the Find search box (the reference) was not found`];
  for (const f of controls) {
    const n = `${where}: ${f.tag}${f.id ? "#" + f.id : ""}${f.label ? ` "${f.label}"` : ""}`;
    if (!f.btn) {
      if (!boxed(f.own) && !f.anc) bad.push(`${n} has no edge and no fill and no box around it`);
      if (f.own.ff !== ref.field.ff) bad.push(`${n} is not in the search box's typeface (${f.own.ff.slice(0, 30)})`);
      if (f.site && boxed(f.own)) { if (f.own.color !== ref.field.color) bad.push(`${n}: ink ${f.own.color} is not the search box's ${ref.field.color}`); if (parseFloat(ref.field.fs) >= 16 ? f.own.fs !== ref.field.fs : parseFloat(f.own.fs) < 16) bad.push(`${n}: size ${f.own.fs} is not the search box's ${ref.field.fs} (on a phone, never under 16px, so the browser does not zoom)`); if (f.own.bc !== ref.box.bc || f.own.bg !== ref.box.bg) bad.push(`${n}: edge ${f.own.bc} / fill ${f.own.bg} are not the search box's (${ref.box.bc} / ${ref.box.bg})`); }
    } else {
      if (!boxed(f.own) && !f.anc) bad.push(`${n} has neither a fill nor an edge (an unstyled button)`);
      if (f.own.ff !== ref.field.ff) bad.push(`${n} is not in the search box's typeface (${f.own.ff.slice(0, 30)})`);
      if (f.own.deco && f.own.deco !== "none") bad.push(`${n} is underlined like a link (${f.own.deco})`);
      { const lum = c => { const m = String(c).match(/[\d.]+/g); if (!m) return 0; const v = m.slice(0, 3).map(x => { x /= 255; return x <= .03928 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4; }); return .2126 * v[0] + .7152 * v[1] + .0722 * v[2]; }, a = lum(f.own.bg), b = lum(f.own.color), r = (Math.max(a, b) + .05) / (Math.min(a, b) + .05); if (!clear(f.own.bg) && r < 4.5) bad.push(`${n}: its type ${f.own.color} on its fill ${f.own.bg} is unreadable (contrast ${r.toFixed(1)}, not the 4.5 a button needs)`); }
      if (f.site && (f.own.bg !== ref.go.bg || f.own.color !== ref.go.color)) bad.push(`${n}: fill ${f.own.bg} / ink ${f.own.color} are not the search box's Go button's (${ref.go.bg} / ${ref.go.color})`);
    }
  }
  return bad;
}

// THE CLASS BEHIND THE FORM DROP (Nov 11 2026): a page rule that reads a custom property the new design does not define (var(--border) with no fallback and no definition anywhere) computes to nothing, so its border, fill or colour silently disappears. probeTokens lists every such token of the page as loaded; a rule that declares the property itself, or gives a fallback, is not counted.
export async function probeTokens(pg) {
  return pg.evaluate(() => {
    const used = new Map(), declared = new Set(), walk = rules => { for (const r of rules) { if (r.cssRules && !r.style) { walk(r.cssRules); continue; } if (!r.style) continue; for (let i = 0; i < r.style.length; i++) { const p = r.style[i]; if (p.startsWith("--")) declared.add(p); }
      let live = true; try { live = !!document.querySelector(r.selectorText); } catch (e) {}   // a rule for an element the page does not have (the old rail's keep looking icon) draws nothing
      const t = r.cssText; if (live) for (const m of t.matchAll(/var\(\s*(--[\w-]+)\s*([,)])/g)) if (m[2] === ")") used.set(m[1], (used.get(m[1]) || 0) + 1); } };
    for (const ss of document.styleSheets) { try { walk(ss.cssRules); } catch (e) {} }
    const root = getComputedStyle(document.documentElement), body = getComputedStyle(document.body);
    return [...used.keys()].filter(k => !declared.has(k) && !root.getPropertyValue(k).trim() && !body.getPropertyValue(k).trim() && !document.querySelector('[style*="' + k + ':"]') && k !== "--n");   // --n is the grid count the Find page's own script sets
  });
}

// THE KEEP LOOKING CARD ON THE HISTORY PAGES (Sam, Nov 11 2026): the eyebrow that repeats the title is not drawn; the button and its line are one column inside the card's own grid, the line under the button, both left aligned in that column and clear of the card's right edge. Returns the problems (a page with no card is one).
export async function keepLookingProblems(pg, where) {
  const r = await pg.evaluate(() => {
    const card = document.querySelector(".gas-keepl"); if (!card) return null; const q = s => { const e = card.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(), cs = getComputedStyle(e); return { l: b.left, t: b.top, r: b.right, b: b.bottom, vis: b.width > 0 && b.height > 0 && cs.display !== "none" && cs.visibility !== "hidden", deco: cs.textDecorationLine, color: cs.color, bg: cs.backgroundColor }; };
    const cb = card.getBoundingClientRect(); return { card: { l: cb.left, t: cb.top, r: cb.right, b: cb.bottom }, eye: q(".gas-kl-eye"), title: q("h3"), col: q(".gas-kl-a"), btn: q(".gas-kl-btn"), cap: q(".gas-kl-a p"), eyeText: (card.querySelector(".gas-kl-eye") || {}).textContent || "", titleText: (card.querySelector("h3") || {}).textContent || "" };
  });
  if (!r) return [`${where}: the page has no Keep looking card`];
  const bad = [], c = r.card;
  if (r.eye && r.eye.vis) bad.push(`${where}: the eyebrow "${r.eyeText}" is drawn above the title "${r.titleText}", which says the same thing`);
  if (!r.title || !r.title.vis) bad.push(`${where}: the card's title is not drawn`);
  if (!r.btn || !r.btn.vis || !r.cap || !r.cap.vis || !r.col) return [...bad, `${where}: the button or its line is missing from the card's action column`];
  const inside = x => x.l >= c.l - 1 && x.r <= c.r + 1 && x.t >= c.t - 1 && x.b <= c.b + 1;
  if (!inside(r.btn) || !inside(r.cap)) bad.push(`${where}: the button or its line sits outside the card (card ${Math.round(c.l)}-${Math.round(c.r)}, button ${Math.round(r.btn.l)}-${Math.round(r.btn.r)}, line ${Math.round(r.cap.l)}-${Math.round(r.cap.r)})`);
  if (c.r - r.col.r < 16) bad.push(`${where}: the action column is hard against the card's right edge (${Math.round(c.r - r.col.r)}px)`);
  if (r.cap.t < r.btn.b - 1) bad.push(`${where}: the line is not under the button`);
  if (Math.abs(r.cap.l - r.btn.l) > 1) bad.push(`${where}: the line and the button are not aligned in one column (line ${Math.round(r.cap.l)}, button ${Math.round(r.btn.l)})`);
  if (r.btn.deco !== "none") bad.push(`${where}: the button is underlined like a link`);
  return bad;
}
