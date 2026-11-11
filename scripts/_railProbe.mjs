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
