// THE SITE PAGES' FRAME (Lane E, Nov 9 2026; Sam: the approved header, no left rail, the approved footer, one centered column at the homepage's content width). In Chrome, for every site page at 1440, 1024 and 390: the header and the footer match the
// homepage's (position, size, type, colours) within 1px, there is no rail element, the content column is the homepage's content width, the type is the homepage's (heading serif and green, body sans, links underlined), and there is no sideways scroll or clipped text.
// Mutants: a rail added, a column narrower than the homepage's, a header restyled, a footer taller, a sideways overflow: each fails.   node scripts/sitePagesShellCheck.mjs
import { SITE_KEYS, previewOf, homeOf, SP, launch, openHtml, tally } from "./sitePagesHarness.mjs";
const { ok, done } = tally(), b = await launch();
const MEASURE = () => { const R = s => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(), c = getComputedStyle(e); return { x: Math.round(r.left * 10) / 10, y: Math.round(r.top * 10) / 10, w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10, font: c.fontSize + "/" + c.fontFamily.split(",")[0] + "/" + c.fontWeight, bg: c.backgroundColor, col: c.color }; };
  const col = document.querySelector("main .wrap") || document.querySelector(".sitecol"), cr = col ? col.getBoundingClientRect() : null, cs = col ? getComputedStyle(col) : null;
  const h1 = document.querySelector("main h1, main h2"), a = document.querySelector("main p a, main li a"), p = document.querySelector("main p");
  return { header: R(".gh"), wm: R(".gh .wm"), tabs: R(".gh .tabs"), acct: R(".gh .tabs .acct"), footer: R("footer.ft"), ftNav: R("footer.ft nav"), rails: document.querySelectorAll(".rail, #gas-rail, aside").length,
    col: cr ? { x: Math.round(cr.left * 10) / 10, w: Math.round(cr.width * 10) / 10, pl: cs.paddingLeft, pr: cs.paddingRight } : null, hs: document.documentElement.scrollWidth > innerWidth + 1,
    h1: h1 ? { font: getComputedStyle(h1).fontFamily.split(",")[0], color: getComputedStyle(h1).color } : null, p: p ? { font: getComputedStyle(p).fontFamily.split(",")[0], size: getComputedStyle(p).fontSize } : null, a: a ? { dec: getComputedStyle(a).textDecorationLine, color: getComputedStyle(a).color } : null,
    clipped: [...document.querySelectorAll("main *")].filter(e => e.scrollWidth > e.clientWidth + 2 && getComputedStyle(e).overflowX !== "visible" && getComputedStyle(e).overflowX !== "auto" && getComputedStyle(e).overflowX !== "scroll" && e.clientWidth > 4 && e.textContent.trim().length > 0 && getComputedStyle(e).position !== "absolute").length /* a visually hidden field (a honeypot) is hidden on purpose, not clipped text */ };
};
const near = (a, c) => a != null && c != null && Math.abs(a - c) <= 1;
const boxSame = (A, B, dims = ["x", "y", "w", "h"]) => A && B && dims.every(q => near(A[q], B[q])) && A.font === B.font && A.bg === B.bg && A.col === B.col;
async function measure(html, w) { const p = await openHtml(b, html, w); const m = await p.evaluate(MEASURE); await p.close(); return m; }
function problems(P, H, w) { const bad = [];
  for (const k of ["header", "wm", "tabs", "acct", "footer", "ftNav"]) if (!boxSame(P[k], H[k], k === "footer" || k === "ftNav" ? ["x", "w", "h"] : undefined))   /* the footer sits at the bottom of the page, so its top differs with the page's height */ bad.push(`the ${k} differs from the homepage's`);
  if (P.rails) bad.push(`${P.rails} rail element(s) present`); if (!P.col || !near(P.col.w, H.col.w) || !near(P.col.x, H.col.x) || P.col.pl !== H.col.pl || P.col.pr !== H.col.pr) bad.push(`the content column is ${P.col && P.col.w}px at x ${P.col && P.col.x}, the homepage's is ${H.col.w}px at x ${H.col.x}`);
  if (P.hs) bad.push("sideways scroll"); if (P.clipped) bad.push(P.clipped + " clipped element(s)");
  if (!P.h1 || !/Newsreader|Georgia|serif/i.test(P.h1.font) || P.h1.color !== "rgb(11, 49, 38)") bad.push("the heading is not the homepage's serif and green"); if (!P.p || /Newsreader|Georgia/i.test(P.p.font)) bad.push("the body text is not the homepage's sans"); if (P.a && !/underline/.test(P.a.dec)) bad.push("links are not underlined like the homepage's");
  return bad; }
const HOME = {}; for (const w of [1440, 1024, 390]) HOME[w] = await measure(await homeOf(), w);
const PAGE = {}; for (const k of SITE_KEYS) PAGE[k] = await previewOf(k);
for (const w of [1440, 1024, 390]) for (const k of SITE_KEYS) { const P = await measure(PAGE[k], w), bad = problems(P, HOME[w], w); ok(!bad.length, `/${SP.SITE[k].live.slice(1)} @${w}: the approved header and footer match the homepage's within 1px, no rail, the column is the homepage's content width, the type is the homepage's${bad.length ? ": " + bad.join("; ") : ""}`); }
// ---------- mutants ----------
const A = PAGE.about, mutant = async (name, html, w = 1440) => { const bad = problems(await measure(html, w), HOME[w], w); ok(html !== A && bad.length > 0, `mutant caught: ${name} (${bad[0] || "NOT CAUGHT"})`); };
await mutant("a left rail added", A.replace('<main class="sitepage">', '<aside class="rail" aria-label="Site">x</aside><main class="sitepage">'));
await mutant("a column narrower than the homepage's", A.replace("</style>", ".sitecol{max-width:760px!important;margin:0 auto}</style>"));
await mutant("a restyled header", A.replace("</style>", ".gh{background:#fff!important}</style>"));
await mutant("a taller footer", A.replace("</style>", ".ft .wrap{min-height:200px!important}</style>"));
await mutant("a sideways overflow", A.replace("</style>", ".sitecol{min-width:2400px!important}</style>"));
await mutant("the page's own heading type back", A.replace("</style>", ".sitecol h1,.sitecol h2{font-family:Arial,sans-serif!important;color:#c00!important}</style>"));
await b.close(); done("sitePagesShellCheck");
