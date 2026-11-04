// previewCopyCheck (Lane E, Nov 4 2026): the copy and palette rules for the crew previews /preview/home and /preview/find (lib/preview/previewPages.js), read from the page
// the real crew handler serves. THE CLASS: any preview page (the list is read from api/crewPage.js) that prints a typed figure, a dash, an orange or red accent, a first person
// Sam, a spaced wordmark, a competitor or venue name, AI as a selling word, a live bid, or The Daily Vroom outside the footer. The check also proves itself: each rule is run
// against a copy of the page with that one violation injected, and must flag it (that is the "fails without the fix" evidence; the mockup's own wording trips most of them).
process.env.CURTAIN_CREW_CODE = "fixture-crew-code"; process.env.LAUNCH_STAGE = "2";
import fs from "node:fs";
const { PAGES } = await import("../api/crewPage.js");
const { PLACEHOLDERS } = await import("../lib/startPlaceholders.js");
const { copy } = await import("../lib/copy.js");
const { rulesOf } = await import("../lib/preview/previewPages.js");
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const names = Object.keys(PAGES).filter(k => k.startsWith("preview-"));
ok(names.length >= 2, `the crew previews are found in api/crewPage.js (${names.join(", ")})`);

const decode = t => t.replace(/&middot;/g, "·").replace(/&rarr;/g, "→").replace(/&#39;/g, "'").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"');
const bodyOf = html => html.replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<style[\s\S]*?<\/style>/g, " ");
const textOf = html => decode(bodyOf(html).replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ");
const attrsOf = html => [...bodyOf(html).matchAll(/\b(?:placeholder|aria-label|title|alt)="([^"]*)"/g)].map(m => decode(m[1])).join(" | ");
const cssOf = html => [...html.matchAll(/<style>([\s\S]*?)<\/style>/g)].map(m => m[1]).filter(c => !/@font-face/.test(c) || /--brand/.test(c)).join("\n");
// the words that are approved elsewhere and so may carry what the strict rules would otherwise flag (digits, "bid"): the engine's own example searches and the approved rules
const rules = rulesOf();
const APPROVED = [...PLACEHOLDERS.home.examples, ...PLACEHOLDERS.find.examples, rules.lead, ...rules.rules.flatMap(r => [r.h, r.b]), copy("home.START_TITLE"), copy("find.START_SUB"), copy("find.START_TITLE")];
const stripApproved = t => APPROVED.reduce((a, w) => a.split(w).join(" "), t);

function hue(hex) { const n = hex.replace("#", ""), f = n.length === 3 ? n.split("").map(c => c + c).join("") : n; const r = parseInt(f.slice(0, 2), 16) / 255, g = parseInt(f.slice(2, 4), 16) / 255, b = parseInt(f.slice(4, 6), 16) / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; if (!d) return { h: 0, s: 0 }; const h = mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; return { h: h * 60, s: d }; }
const AUDIT = {
  dash: html => { const t = textOf(html) + " " + attrsOf(html); const m = t.match(/[–—]|\w-\w|\s-\s/); return m ? "a dash in the copy: " + JSON.stringify(m[0]) : null; },
  palette: html => { const bad = []; for (const m of cssOf(html).matchAll(/#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g)) { const { h, s } = hue(m[0]); if (s > 0.3 && (h < 50 || h > 335)) bad.push(m[0]); } for (const m of cssOf(html).matchAll(/rgba?\((\d+),\s*(\d+),\s*(\d+)/g)) { const hx = "#" + [1, 2, 3].map(i => Number(m[i]).toString(16).padStart(2, "0")).join(""); const { h, s } = hue(hx); if (s > 0.3 && (h < 50 || h > 335)) bad.push(m[0]); } return bad.length ? "orange or red in the CSS: " + [...new Set(bad)].join(" ") : null; },
  wordmark: html => { const t = textOf(html); return /Go\s+Ask\s+Sam|GO\s*ASK\s*SAM|G\s*O\s+A\s*S\s*K|G o A s k S a m/.test(t) || /Go Ask Sam/i.test(t.replace(/Go ask Sam/g, "")) ? "the wordmark is spaced or recased" : (/GoAskSam/.test(t) ? null : "the GoAskSam wordmark is missing"); },
  firstPerson: html => { const t = stripApproved(textOf(html)) + " " + attrsOf(html); const m = t.match(/\b(I|I'm|I'll|I've|me|my|mine|we|we're|our|us)\b/); return m ? "first person: " + m[0] : (/\bby Sam\b|Sam's face|—\s*Sam|Sam here|Hi, I/i.test(t) ? "a byline or a face" : (/<img[^>]*(avatar|portrait|face|headshot)/i.test(html) ? "a face image" : null)); },
  names: html => { const t = textOf(html) + " " + attrsOf(html); const m = t.match(/Hagerty|Bonhams|Broad Arrow|Gooding|Bring a Trailer|Cars (?:&|and) Bids|PCarMarket|Mecum|Sotheby|Barrett|Hemmings|Collecting Cars|ChatGPT|OpenAI|\bBaT\b|\bRM\b/i); return m ? "a venue or competitor name: " + m[0] : null; },
  ai: html => { const t = textOf(html) + " " + attrsOf(html); const m = t.match(/\bAI\b|artificial intelligence|\bgenerated\b|\bsmart\b|machine learning|powered by/i); return m ? "AI as a selling word: " + m[0] : null; },
  figures: html => { const body = bodyOf(html).replace(/<div class="n">\d<\/div>/g, " "), t = stripApproved(decode(body.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ")) + " " + stripApproved(attrsOf(html)); const m = t.match(/[$£€]\s?\d|\d[\d,.]*\s?(?:miles|mi\b|sales|sources|platforms|houses|%|k\b)|\b\d{2,}\b|\b\d\b/); return m ? "a typed figure outside the approved lines: " + JSON.stringify(m[0]) : null; },
  liveBid: html => { const t = stripApproved(textOf(html)); const m = t.match(/\bbids?\b|hours? left|live now|last bid|now live|ends in|reserve not met|no reserve/i); return m ? "a live bid or auction state: " + m[0] : null; },
  vroom: html => { const b = bodyOf(html), i = b.search(/<footer\b/), outside = i < 0 ? b : b.slice(0, i) + b.slice(b.indexOf("</footer>") + 9); return /Daily Vroom|dailyvroom/i.test(textOf(outside) + outside.replace(/<[^>]*(?:href)="[^"]*"/g, m => m)) ? "The Daily Vroom outside the footer" : (/Daily Vroom/.test(textOf(b)) ? null : "The Daily Vroom is missing from the footer"); },
  rulesVerbatim: html => { const t = textOf(html); const miss = rules.rules.filter(r => !t.includes(r.h) || !t.includes(r.b)); return /How Sam decides/.test(t) && !miss.length && t.includes(rules.lead) ? null : "an approved How Sam decides line changed or is missing"; }
};
const ONLY_HOME = ["rulesVerbatim"];
for (const n of names) {
  const html = PAGES[n].render();
  for (const [k, f] of Object.entries(AUDIT)) { if (ONLY_HOME.includes(k) && n !== "preview-home") continue; const why = f(html); ok(!why, `${n}: ${k}${why ? " (" + why + ")" : ""}`); }
}
// ---- structure
{
  const home = PAGES["preview-home"].render(), find = PAGES["preview-find"].render(), t = textOf(home);
  ok(!/<aside|id="gas-rail"/.test(home), "home: no rail");
  ok((home.match(/<form class="box"/g) || []).length === 1 && />Go ask Sam</.test(home.replace(/<svg[\s\S]*?<\/svg>/g, "")), "home: one Find search box, and Go ask Sam is its call to action");
  ok(/class="hero"/.test(home) && /--brand:#123F33/.test(home), "home: a full width hero in the site's dark green");
  ok(["Find", "Market Check", "Sell"].every(w => new RegExp('<h2>' + w + '</h2>').test(home)) && (home.match(/<div class="way">/g) || []).length === 3 && (home.match(/<div class="way">[\s\S]*?<a class="btn/g) || []).length === 3, "home: three ways in (Find, Market Check, Sell), each with one line and a button");
  ok(/class="ex"/.test(home) && /placeholder/i.test(t) && !/<img[^>]*class="ex/.test(home), "home: the example block is a labelled placeholder until the engine field lands");
  ok(/<aside class="rail"/.test(find) && /Tasks/.test(textOf(find)) && /rail-head/.test(find) && PLACEHOLDERS.find.examples.every(e => textOf(find).includes(e)), "find: the rail (searches, Tasks) is filled from the engine's approved searches when the visitor has no history");
  ok(!/Recent searches/.test(textOf(find).replace(/Recent searches/, (m, i) => i < 0 ? m : m)) || /Searches to try/.test(textOf(find)), "find: a visitor with no history is not shown a Recent searches heading");
  ok(/noindex/.test(home) && /noindex/.test(find), "both previews are noindex");
  const src = fs.readFileSync("lib/preview/previewPages.js", "utf8");
  ok(!/\bfetch\(|supabase|oneEngineAnswer\(|Math\.random|Date\.now|new Date/.test(src.replace(/\/\/.*$/gm, "")), "the preview pages compute nothing: no fetch, no database, no date, no random in the page code");
}
// ---- THE CHECK PROVES ITSELF: one violation at a time, each must be caught (these are the things the mockups did)
{
  const home = PAGES["preview-home"].render();
  const inject = (from, to) => home.replace(from, to);
  const cases = [
    ["dash", "Find your next car. Check real sales. See where to sell.", "Find your next car — check real sales. See where to sell."],
    ["dash", "Find your next car. Check real sales.", "Find your next car. Check real-sales."],
    ["palette", ".btn{display:inline-flex", ".btn{background:#E8542B;display:inline-flex"],
    ["palette", ".hero{position:relative;", ".hero{border-color:rgb(220,60,40);position:relative;"],
    ["wordmark", '<a class="wm" href="/">GoAskSam</a><span class="tag">', '<a class="wm" href="/">GO ASK SAM</a><span class="tag">'],
    ["firstPerson", "Search live auctions in your own words.", "Sam found it for me and I think it is good."],
    ["names", "One car, its earlier finished sales, side by side.", "This BMW M3 sold at Bonhams and Broad Arrow."],
    ["ai", "Search live auctions in your own words.", "AI powered search for cars."],
    ["figures", "Earlier sale, from the engine", "2023 sale $72,800"],
    ["figures", "Search live auctions in your own words.", "Search 19 sources in your own words."],
    ["liveBid", "Earlier sale, from the engine", "Now on the auction with a bid of the day"],
    ["vroom", '<div class="eb">Example, placeholder</div>', '<div class="eb">Example from The Daily Vroom</div>'],
    ["rulesVerbatim", "A sale is a sale.", "A sale is a sale, mostly."]
  ];
  for (const [k, from, to] of cases) { const m = inject(from, to); ok(m !== home, `self-test: the injected text for ${k} is in the page ("${from.slice(0, 30)}")`); ok(!!AUDIT[k](m), `self-test: ${k} flags "${to.slice(0, 50)}"`); }
}
console.log(`previewCopyCheck: ${pass} pass, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
