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
const APPROVED = [...PLACEHOLDERS.preview.examples, ...PLACEHOLDERS.home.examples, ...PLACEHOLDERS.find.examples, rules.lead, ...rules.rules.flatMap(r => [r.h, r.b]), copy("home.START_TITLE"), copy("find.START_SUB"), copy("find.START_TITLE")];
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
const part = (html, re) => (html.match(re) || [""])[0];
const HEADER = html => part(html, /<header class="gh">[\s\S]*?<\/header>/).replace(/ aria-current="page"/, "");
const SEARCH = html => part(html, /<form class="sb"[\s\S]*?<\/form>/);
const PILLS = html => part(html, /<div class="pills">[\s\S]*?<\/div>/);
const FOOT = html => part(html, /<footer class="ft">[\s\S]*?<\/footer>/);
const SHARED = {
  header: html => /Beta<\/span>/.test(HEADER(html)) && !/FIND\s*(?:&middot;|·)\s*CHECK|Find, check, sell/i.test(textOf(html)) && [">Find<", ">Market Check<", ">Sell<", ">Tasks<", ">Sign in<"].every(w => HEADER(html).includes(w)) ? null : "the header lacks Beta or one of Find, Market Check, Sell, Tasks, Account, or carries the Find Check Sell tag",
  placeholder: html => SEARCH(html).includes('placeholder="Tell Sam what you&#39;re looking for..."') ? null : "the search placeholder is not exactly: Tell Sam what you're looking for...",
  arrowSubmit: html => /<button class="go" type="submit" aria-label="Go ask Sam"><svg/.test(SEARCH(html)) && !/>\s*Go ask Sam\s*</.test(SEARCH(html).replace(/aria-label="[^"]*"/g, "")) && /id="pq-mic"/.test(SEARCH(html)) ? null : "the submit is not a compact arrow only button with the microphone beside it",
  pills: html => { const l = [...PILLS(html).matchAll(/<a class="pill" href="\/find\?q=([^"]*)">([^<]*)<\/a>/g)].map(m => [decodeURIComponent(m[1]), decode(m[2])]); return l.length === 3 && l.every(([q, t], i) => q === t && t === PLACEHOLDERS.preview.examples[i]) && /Go ask Sam:/.test(PILLS(html)) ? null : "the pills are not the three approved examples, each linking to its own Find search"; },
  footer: html => /The Daily Vroom/.test(FOOT(html)) && ["/about", "/business", "/whats-new", "/feedback", "/terms", "/privacy"].every(h => FOOT(html).includes('href="' + h + '"')) && !/Find, check, sell|Find\. Check\. Sell/i.test(FOOT(html)) ? null : "the footer lost a link or carries the Find Check Sell tagline",
  fonts: html => { const fam = [...cssOf(html).matchAll(/font-family:([^;}]*)/g)].map(m => m[1]); const bad = [...cssOf(html).matchAll(/font:[^;}]*?\b(?:var\(--(?:sans|serif)\)|[A-Za-z"' ,-]+)\s*(?:;|})/g)]; return /Newsreader/.test(cssOf(html)) && /Instrument Sans/.test(cssOf(html)) && !/Inter\b|Arial|Helvetica|Roboto|Playfair|Georgia\s*,\s*serif;/.test(cssOf(html).replace(/--serif:[^;]*;|--sans:[^;]*;/g, "")) ? null : "a font other than the two site families is named in the CSS"; },
  noAbsoluteCentering: html => /translate\(-50%|left:50%/.test(cssOf(html)) ? "the layout is centred by absolute positioning or a transform" : null
};
{
  const home = PAGES["preview-home"].render(), find = PAGES["preview-find"].render(), t = textOf(home);
  for (const [k, f] of Object.entries(SHARED)) for (const [n, h] of [["home", home], ["find", find]]) { const why = f(h); ok(!why, `${n}: shared ${k}${why ? " (" + why + ")" : ""}`); }
  ok(HEADER(home) === HEADER(find), "the header is byte for byte the same on both pages (apart from the active Find mark)");
  ok(SEARCH(home) === SEARCH(find) && SEARCH(home).length > 100, "the search box is byte for byte the same on both pages");
  ok(PILLS(home) === PILLS(find) && PILLS(home).length > 100, "the pills are byte for byte the same on both pages");
  ok(FOOT(home) === FOOT(find) && FOOT(home).length > 100, "the footer is byte for byte the same on both pages");
  ok(/aria-current="page">Find</.test(find) && !/aria-current="page"/.test(home), "Find is the active tab on Find only");
  ok(!/<aside|id="gas-rail"/.test(home), "home: no rail");
  ok((home.match(/<form class="sb"/g) || []).length === 1, "home: one search box");
  ok(/class="hero"/.test(home) && /--forest:#0B3126/.test(home), "home: a full width hero in the deep forest green");
  ok(textOf(home).includes(copy("home.START_TITLE")) && t.includes("Find your next car. See real sales. Discover where to sell."), "home: the approved headline and supporting line");
  ok(["Find", "Market Check", "Sell"].every(w => new RegExp('<h2 class="t-h3">' + w + '</h2>').test(home)) && (home.match(/<a class="way"/g) || []).length === 3 && !/<a class="btn/.test(home), "home: three clickable columns (Find, Market Check, Sell), no feature buttons");
  ok(/class="ex"/.test(home) && /placeholder/i.test(t) && t.includes("Same car. Different auctions. Real selling prices.") && !/<img[^>]*class="ex/.test(home), "home: the real sales block is a labelled placeholder until the engine field lands");
  ok((home.match(/<div class="rule">/g) || []).length === 4 && /<section class="how wrap"/.test(home) && /HOW SAM DECIDES|How Sam decides/i.test(t), "home: How Sam decides is an intro column plus four numbered columns");
  ok(/<aside class="rail"/.test(find) && /Tasks/.test(textOf(find)) && /rail-head/.test(find) && PLACEHOLDERS.preview.examples.every(e => textOf(find).includes(e)), "find: the rail (searches, Tasks) is filled from the engine's approved searches when the visitor has no history");
  ok(/Searches to try/.test(textOf(find)) && !/Recent searches/.test(textOf(find)), "find: a visitor with no history is not shown a Recent searches heading");
  ok(t.includes("Find") && textOf(find).includes("Search live and recent auctions across multiple platforms.") && textOf(find).includes(copy("find.START_TITLE")), "find: title, supporting line and the central headline");
  ok(/class="deco"[^>]*>\s*<div class="car"/.test(find) && !/position:absolute[^}]*\.stage|\.stage[^}]*position:absolute/.test(find), "find: the Porsche sits in its own block after the search, never over it");
  ok(/noindex/.test(home) && /noindex/.test(find), "both previews are noindex");
  const src = fs.readFileSync("lib/preview/previewPages.js", "utf8");
  ok(!/\bfetch\(|supabase|oneEngineAnswer\(|Math\.random|Date\.now|new Date/.test(src.replace(/\/\/.*$/gm, "")), "the preview pages compute nothing: no fetch, no database, no date, no random in the page code");
  ok(PLACEHOLDERS.preview && PLACEHOLDERS.preview.via === "find" && PLACEHOLDERS.preview.examples.length === 3, "the three pills are an entry in the engine's approved example list (placeholderCheck --live runs them)");
}
// ---- THE CHECK PROVES ITSELF: one violation at a time, each must be caught (these are the things the mockups did)
{
  const home = PAGES["preview-home"].render();
  const inject = (from, to) => home.replace(from, to);
  const cases = [
    ["dash", "Find your next car. See real sales.", "Find your next car — see real sales."],
    ["dash", "Find your next car. See real sales.", "Find your next car. See real-sales."],
    ["palette", ".way{display:flex", ".way{background:#E8542B;display:flex"],
    ["palette", ".hero{position:relative;", ".hero{border-color:rgb(220,60,40);position:relative;"],
    ["wordmark", '<b>GoAskSam</b><span class="beta">', '<b>GO ASK SAM</b><span class="beta">'],
    ["firstPerson", "in your own words.", "in your own words. Sam found it for me and I think it is good."],
    ["names", "Same car. Different auctions. Real selling prices.", "This BMW M3 sold at Bonhams and Broad Arrow."],
    ["ai", "in your own words.", "in your own words. AI powered search for cars."],
    ["figures", "Date</span><span>Platform", "2023</span><span>Platform $72,800"],
    ["figures", "in your own words.", "in your own words. Search 19 sources."],
    ["liveBid", "Date</span><span>Platform", "Now live with a bid</span><span>Platform"],
    ["vroom", 'Real example, placeholder', 'Example from The Daily Vroom'],
    ["rulesVerbatim", "A sale is a sale.", "A sale is a sale, mostly."],
    ["dash", "Find your next car.", "Find your next car (and bid) -- now."]
  ];
  for (const [k, from, to] of cases.slice(0, -1)) { const m = inject(from, to); ok(m !== home, `self-test: the injected text for ${k} is in the page ("${from.slice(0, 30)}")`); ok(!!AUDIT[k](m), `self-test: ${k} flags "${to.slice(0, 50)}"`); }
}
// the shared-component rules, each broken once on a copy of the real pages (what the brief found on the earlier previews)
{
  const home = PAGES["preview-home"].render(), find = PAGES["preview-find"].render();
  const sh = [
    ["header", home, '<span class="beta">Beta</span>', ""],
    ["header", home, "<span class=\"beta\">Beta</span>", '<span class="beta">Beta</span><span class="tag">FIND &middot; CHECK &middot; SELL</span>'],
    ["placeholder", find, "Tell Sam what you&#39;re looking for...", "A manual 911 under $40,000"],
    ["arrowSubmit", home, '<button class="go" type="submit" aria-label="Go ask Sam"><svg', '<button class="go" type="submit" aria-label="Go ask Sam">Go ask Sam<svg'],
    ["pills", find, "Manual 911 under $40k</a>", "Classic Range Rover</a>"],
    ["footer", home, "<nav aria-label=\"Footer\">", "<nav aria-label=\"Footer\"><span>Find, check, sell.</span>"],
    ["fonts", home, "--sans:", "--x:Inter,Arial;--sans:"],
    ["noAbsoluteCentering", find, ".stage{", ".stage{left:50%;transform:translate(-50%,0);"]
  ];
  for (const [k, page, from, to] of sh) { const m = page.replace(from, to); ok(m !== page, `self-test: the injected text for shared ${k} is in the page`); ok(!!SHARED[k](m), `self-test: shared ${k} flags "${to.slice(0, 40)}"`); }
  const drift = find.replace("<nav class=\"tabs\"", "<nav data-x=\"1\" class=\"tabs\""); ok(HEADER(drift) !== HEADER(home), "self-test: a header that drifts on one page is told apart from the other page's");
  const sbDrift = find.replace('id="pq-mic"', 'id="pq-mic" data-x="1"'); ok(SEARCH(sbDrift) !== SEARCH(home), "self-test: a search box that drifts on one page is told apart");
}
console.log(`previewCopyCheck: ${pass} pass, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
