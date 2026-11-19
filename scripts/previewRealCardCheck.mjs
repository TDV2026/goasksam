// THE PREVIEW CARDS COME FROM THE ENGINE, NOT FROM THE PAGE (Lane E, Nov 8 2026; rewritten Nov 9 2026 for the final entry pages). CAUSE: the Find examples and the Tasks cards on the previews were drawn by the preview's own text and markup, so they could never match what the engine knows.
// CLASS: any card or email on any preview page. A preview shows an engine object or a real template's output and types nothing of the car. This check proves (1) no preview source holds a hand drawn card and the Tasks page calls the real email templates, (2) the Find row's gates
// (an engine card or nothing; live cars first, then the fallback sales up to three, never empty when the engine sent any; a card with no id, title, https link or photo, an ended auction or a sale in the live slot is refused; the card's link is a Find address or the plain Find search of its own title),
// (3) the row's own words are the field's and the page's source types no car, platform or price, and (4) mutants. THE ROW'S LOOK (the final entry design: photo, title, venue and timing, one slim intelligence row; the footer rule of the old mockup, 80px under the cards, is retired because the shell
// now pins the footer to the bottom of a short page) is held by scripts/entryFinalCheck.mjs. Offline.
import fs from "node:fs";
import path from "node:path";
const ROOT = path.resolve(new URL("..", import.meta.url).pathname); process.chdir(ROOT);
process.env.LAUNCH_STAGE = "2";
let pass = 0, fail = 0; const out = []; const ok = (c, m) => { if (c) pass++; else { fail++; out.push("FAIL " + m); } };
const PP = await import(ROOT + "/lib/preview/previewPages.js"), EX = await import(ROOT + "/scripts/findExamplesFixture.mjs");
const opt = { now: EX.NOW, allowData: true };
const strip = h => h.replace(/<style[\s\S]*?<\/style>/g, "").replace(/<script[\s\S]*?<\/script>/g, "");
// ---------- 1 no preview source draws a card or an email of its own ----------
const OWN = /class="(?:[^"]*\s)?(?:fx-card|fx-photo|fx-ct|fx-t|fx-m|fx-b|fx-sb|sf-photo|sf-bid|sf-req|sf-ct|sf-meta|sf-st|sf-prev|sf-pl|sf-pm|sf-pp)(?:\s[^"]*)?"/;
const ownMarkup = html => OWN.test(strip(html)) || /\bfx-card\b|\bsf-photo\b/.test(html.replace(/<script[\s\S]*?<\/script>/g, ""));
const tSrc = fs.readFileSync("lib/preview/tasksPreview.js", "utf8"), pSrc = fs.readFileSync("lib/preview/previewPages.js", "utf8");
ok(!/class="(?:fx-card|fx-photo|fx-ct|sf-photo|sf-bid|sf-req|sf-ct|sf-prev)"/.test(pSrc + tSrc), "1 no preview source holds the old hand drawn card markup");
ok(/taskEmailBody\(/.test(tSrc) && /composeDigest\(/.test(tSrc) && !/GASTASK|compactCard|lookingItem/.test(tSrc), "1 the Tasks page calls the real email templates (taskEmailBody, composeDigest) and none of the old hand drawn pieces");
const ROWX = EX.examplesFixture(), FIND = PP.findHtml({ examples: ROWX, ...opt });
ok(!ownMarkup(FIND), "1 the served Find page carries no hand drawn card");
// the row types nothing of the car: no car, platform or price word is written in the page's own code
{ const code = pSrc.replace(/\/\/.*$/gm, "").slice(pSrc.indexOf("const INTEL_KINDS"), pSrc.indexOf("// ---- Find\n")); ok(code.length > 200 && !/Porsche|Ferrari|Camaro|Bring a Trailer|Sotheby|\$\d/.test(code), "3 the Find row's code types no car, platform or price"); }
// ---------- 2 gates ----------
const cards = h => (strip(h).match(/data-find-examples="(\d)"/) || [])[1] | 0;
ok(cards(PP.findHtml({ examples: null, ...opt })) === 0 && cards(PP.findHtml({ examples: [], ...opt })) === 0, "2 Find: the engine sent nothing, no section");
ok(cards(FIND) === 3 && cards(PP.findHtml({ examples: EX.examplesFixture().slice(0, 2), ...opt })) === 2 && cards(PP.findHtml({ examples: EX.examplesFixture().concat(EX.examplesFixture()), ...opt })) === 3, "2 Find: three cards from three, two from two, never more than three");
const FILL = n => PP.findHtml({ examples: { cars: EX.examplesFixture().slice(0, n), fallback: EX.fallbackFixture() }, ...opt });
ok(cards(FILL(0)) === 3 && /data-fallback="3"/.test(FILL(0)) && cards(FILL(1)) === 3 && /data-fallback="2"/.test(FILL(1)) && cards(FILL(3)) === 3 && !/data-fallback/.test(FILL(3)), "2 Find: the row never goes empty (live cars first, then the fallback sales up to three)");
{ const f = EX.fallbackFixture(); const bad = [{ ...f[0].card, sold: null }, { ...f[0].card, sold: { price: "$1", when: "" } }, { ...f[0].card, sold: { price: "a bargain", when: "x" } }].map(c => ({ card: c }));
  ok(bad.every(b => cards(PP.findHtml({ examples: { cars: [], fallback: [b] }, ...opt })) === 0), "2 Find: a fallback sale with no price or date words, or a made up price, is refused"); }
{ const old = [{ title: "1991 Porsche 911 Carrera 2", platform: "Bring a Trailer", url: "https://a.test/1", photo: "https://a.test/p.jpg", live: true, endsAt: new Date(EX.NOW + 3600e3).toISOString(), findUrl: "/find?q=a" }];
  ok(cards(PP.findHtml({ examples: old, ...opt })) === 0, "2 Find: an item with no engine card (the old hand drawn shape) is not drawn");
  const c = EX.examplesFixture()[0].card, bad = [{ ...c, id: null }, { ...c, title: "" }, { ...c, url: "http://a.test" }, { ...c, photo_url: "http://a.test/p.jpg" }, { ...c, end_time: new Date(EX.NOW - 3600e3).toISOString() }, { ...c, sold: { price: "$1,000", when: "May 2024" } }].map(x => ({ card: x }));
  ok(bad.every(b => cards(PP.findHtml({ examples: [b], ...opt })) === 0), "2 Find: a card with no id, no title, a non https link or photo, an ended auction, or a sale in the live slot is refused");
  const u = x => (PP.findHtml({ examples: [{ card: c, findUrl: x }], ...opt }).match(/class="lc-main" href="([^"]*)"/) || [])[1], own = "/find?q=" + encodeURIComponent(c.title).replace(/&/g, "&amp;");
  ok(u("/find?q=a") === "/find?q=a" && u("https://evil.test") === own && u("//evil.test") === own && u(undefined) === own, "2 Find: a card's link is a Find address the engine named, else the plain Find search of its own title (never another site)"); }
// ---------- 3 the row's words are the field's ----------
{ const t = strip(FIND); ok(ROWX.every(x => t.includes(x.card.title.replace(/&/g, "&amp;")) && t.includes(x.card.source.replace(/&/g, "&amp;"))), "3 every card prints its engine card's own title and platform"); }
// ---------- 4 mutants ----------
ok(ownMarkup(FIND.replace('<div class="fx-grid" id="fx-grid">', '<div class="fx-grid" id="fx-grid"><a class="fx-card" href="/find"><span class="fx-photo"></span></a>')), "4 mutant: a Find page that draws its own card markup is caught");
ok(!(/taskEmailBody\(/.test(tSrc.replace(/taskEmailBody\(/g, "ownEmail(")) && /composeDigest\(/.test(tSrc)), "4 mutant: a Tasks page that no longer calls the real email template is caught");
{ const mut = pSrc.replace(".slice(0, 3 - live.length)", ".slice(0, 0)"); ok(mut !== pSrc, "4 mutant: a page that no longer fills the row from the fallback applies (the fill assertion above would fail)"); }
{ const typed = pSrc.replace(/\/\/.*$/gm, "").replace("const INTEL_KINDS", 'const T = "Bring a Trailer"; const INTEL_KINDS'); const code = typed.slice(typed.indexOf("const T = "), typed.indexOf("// ---- Find\n")); ok(/Bring a Trailer/.test(code), "4 mutant: a platform typed in the row's code is caught by the source scan"); }
out.forEach(l => console.log(l)); console.log(`previewRealCardCheck: ${pass} pass, ${fail} FAIL`); process.exit(fail ? 1 : 0);
