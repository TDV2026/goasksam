// WHAT'S NEW (Lane E, Oct 31 2026, Sam's order): /whats-new, the plain log of what changed, newest first, read from data/whatsNew.json and nothing else computed.
// The page renders with 0, 1 and 12 entries at 1440 and 390 and must hold its shape: the heading and intro, a date heading per day with a rule above every group but the first, one sentence per entry with a green dot in the margin, the thanks in small grey,
// the foot with Tell Sam linking to Feedback, one column of about 640px, no sideways scroll. The entry words (the seeded file and every fixture) carry no source count, limit, "most", "AI", "fixed", "bug", "no longer", "instead of", dash, or check or lane name.
// The rail's lower group (and so the footer and the phone menu, one function) links What's new between About and Feedback on every page that draws the rail. The page is in the sitemap and indexed. No network.
//   node scripts/whatsNewCheck.mjs     exit 1 on any failure.
import fs from "node:fs";
import { copyData as COPY_DATA } from "../lib/copy.js";
const C = COPY_DATA(), rxEsc = x => String(x).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");   // the page words come from data/copy.json: one edit changes the page and this check together
import path from "node:path";
import puppeteer from "puppeteer-core";
import { pathToFileURL } from "node:url";
process.env.LAUNCH_STAGE = "2";
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const imp = f => import(pathToFileURL(path.join(ROOT, f)).href);
const call = async (mod, url, query = {}) => { const h = (await imp("api/" + mod + ".js").catch(() => ({}))).default; if (typeof h !== "function") return ""; return await new Promise(resolve => { const res = { setHeader() {}, getHeader() {}, status() { return res; }, send(b) { resolve(String(b)); return res; }, end(b) { resolve(String(b || "")); return res; }, json(o) { resolve(JSON.stringify(o)); return res; }, redirect() { resolve(""); return res; } };
  Promise.resolve(h({ method: "GET", url, query, headers: { host: "goasksam.com", cookie: "" }, socket: {} }, res)).catch(() => resolve("")); setTimeout(() => resolve(""), 20000); }); };

// THE WORDS: nothing a reader should not see in a changelog line
const BAD = [[/\b\d+\s+(sources?|venues?|houses|auction houses|platforms)\b/i, "a source count"], [/\blimit/i, "a limit"], [/\bmost\b/i, "most"], [/\bAI\b/, "AI"], [/\bfixed\b/i, "fixed"], [/\bbugs?\b/i, "bug"], [/\bno longer\b/i, "no longer"], [/\binstead of\b/i, "instead of"], [/[–—]/, "a dash"], [/\b[A-Za-z0-9]+Check\b/, "a check name"], [/\blane [a-g]\b/i, "a lane name"]];
const wordsOk = (t, tag) => { for (const [re, what] of BAD) ok(!re.test(t), `${tag}: no ${what} in ${JSON.stringify(t.slice(0, 80))}`); };

let mod = null, page = "";
try { mod = await imp("api/whatsNew.js"); page = await call("whatsNew", "/whats-new"); } catch (e) { mod = null; }
ok(mod && typeof mod.whatsNewPageHtml === "function" && page.length > 500, "the page exists (api/whatsNew.js answers /whats-new)");
const lib = await imp("lib/whatsNew.js").catch(() => null);
ok(!!lib, "lib/whatsNew.js reads the data file");
const file = (() => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, "data/whatsNew.json"), "utf8")); } catch { return null; } })();
ok(Array.isArray(file) && file.length >= 6, "data/whatsNew.json holds the seeded entries (" + (file ? file.length : "missing") + ")");
for (const e of file || []) { ok(/^\d{4}-\d{2}-\d{2}$/.test(e.date) && typeof e.text === "string" && e.text.length > 10 && /[.!?]$/.test(e.text), `seed entry is a dated sentence: ${JSON.stringify(e).slice(0, 70)}`); wordsOk(e.text + " " + (e.thanks || ""), "seed entry"); }
ok(!/data\/whatsNew|whatsNew\.json/.test(page), "the page never prints its data path");

// FIXTURES: 0, 1 and 12 entries over several days, dates out of order in the file
const mk = (n, d, extra) => ({ date: d, text: "Sam now reads sale number " + n + " for cars like the one you asked about.", ...(extra || {}) });
const TWELVE = [mk(1, "2026-10-28"), mk(2, "2026-10-31", { thanks: "Thanks Rick and Owen." }), mk(3, "2026-10-30"), mk(4, "2026-10-31"), mk(5, "2026-10-29"), mk(6, "2026-10-30"), mk(7, "2026-10-27"), mk(8, "2026-10-28"), mk(9, "2026-10-31"), mk(10, "2026-10-26"), mk(11, "2026-10-30"), mk(12, "2026-10-25")];
const CASES = [["0 entries", []], ["1 entry", [mk(1, "2026-10-31", { thanks: "Thanks Rick and Owen." })]], ["12 entries", TWELVE]];
for (const [, list] of CASES) for (const e of list) wordsOk(e.text + " " + (e.thanks || ""), "fixture entry");

const SEEN = /[A-Z][a-z]+ \d{4}$/;
const b = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new" });
if (mod) for (const [name, list] of CASES) for (const width of [1440, 390]) {
  const tag = `${name} at ${width}`, html = mod.whatsNewPageHtml({ headers: { host: "goasksam.com", cookie: "" } }, list);
  const p = await b.newPage(); await p.setViewport({ width, height: 900 });
  await p.setRequestInterception(true); p.on("request", r => /fonts\.(googleapis|gstatic)\.com/.test(r.url()) ? r.continue() : r.abort());
  await p.setContent(html, { waitUntil: "domcontentloaded" }).catch(() => {});
  const m = await p.evaluate(() => {
    const q = s => document.querySelector(s), all = s => Array.from(document.querySelectorAll(s)), cs = (e, ps) => getComputedStyle(e, ps);
    const col = q(".wn-col"), foot = q(".wn-foot a"), groups = all(".wn-group");
    return {
      h1: q("h1") && q("h1").innerText, h1font: q("h1") && cs(q("h1")).fontFamily, intro: q(".wn-intro") && q(".wn-intro").innerText, introColor: q(".wn-intro") && cs(q(".wn-intro")).color,
      colW: col && Math.round(col.getBoundingClientRect().width), colMax: col && cs(col).maxWidth, scrollW: document.documentElement.scrollWidth, innerW: window.innerWidth,
      groups: groups.map(g => ({ date: g.querySelector(".wn-date").innerText, caps: cs(g.querySelector(".wn-date")).fontVariantCaps, dateColor: cs(g.querySelector(".wn-date")).color, rule: cs(g).borderTopWidth, ruleStyle: cs(g).borderTopStyle,
        entries: Array.from(g.querySelectorAll(".wn-e")).map(e => ({ text: e.innerText.replace(/\s+/g, " "), font: cs(e).fontFamily, size: cs(e).fontSize, mb: cs(e).marginBottom, lh: cs(e).lineHeight, dot: { w: cs(e, "::before").width, bg: cs(e, "::before").backgroundColor, left: cs(e, "::before").left, content: cs(e, "::before").content }, th: e.querySelector(".wn-th") ? { text: e.querySelector(".wn-th").innerText, size: cs(e.querySelector(".wn-th")).fontSize, color: cs(e.querySelector(".wn-th")).color } : null, tags: e.querySelectorAll("img,ul,li,button,a").length })) })),
      footText: q(".wn-foot") && q(".wn-foot").innerText, footHref: foot && foot.getAttribute("href"), footLink: foot && foot.innerText,
      bg: cs(document.body).backgroundColor, title: document.title, robots: (q('meta[name=robots]') || {}).content, canon: (q('link[rel=canonical]') || {}).href, railLinks: all("#gas-rail .gas-navitem").map(a => a.innerText.trim() + "|" + a.getAttribute("href"))
    };
  });
  ok(m.h1 === "What's new" && /serif|Newsreader|Georgia/.test(m.h1font), `${tag}: the heading is "What's new" in the house serif (${m.h1} / ${m.h1font})`);
  ok(m.intro === C.whatsNew.INTRO, `${tag}: the intro line (${m.intro})`);
  ok(m.introColor === "rgb(94, 107, 99)", `${tag}: the intro is in the quiet grey (${m.introColor})`);
  ok(m.colW <= 640 + 1 && (width > 700 ? m.colMax === "640px" : m.colW <= width), `${tag}: one column, about 640px wide at most (${m.colW}px, max ${m.colMax})`);
  ok(m.scrollW <= m.innerW + 1, `${tag}: no sideways scroll (${m.scrollW} against ${m.innerW})`);
  { const c = (/\d+/g, m.bg.match(/\d+/g) || []).map(Number); ok(c.length >= 3 && c[0] >= 240 && c[1] >= 236 && c[2] >= 226 && c[0] > c[2] + 6, `${tag}: the cream page, the shell's own (${m.bg})`); }
  const days = [...new Set(list.map(e => e.date))].sort().reverse();
  ok(m.groups.length === days.length, `${tag}: one group per day, ${days.length} (${m.groups.length})`);
  ok(m.groups.every(g => SEEN.test(g.date.replace(/^\d{1,2} /, "").replace(/\s+/g, " ")) || /^\d{1,2} [A-Za-z]+ \d{4}$/.test(g.date.replace(/\s+/g, " "))) && m.groups.every(g => g.caps === "all-small-caps" && g.dateColor === "rgb(94, 107, 99)"), `${tag}: each group has its date in small grey caps (${m.groups.map(g => g.date).join(", ")})`);
  const heads = days.map(d => { const [y, mo, da] = d.split("-"); return Number(da) + " " + ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][Number(mo) - 1] + " " + y; });
  ok(JSON.stringify(m.groups.map(g => g.date.replace(/\s+/g, " "))) === JSON.stringify(heads), `${tag}: newest day first (${m.groups.map(g => g.date).join(" | ")})`);
  ok(m.groups.every((g, i) => i === 0 ? g.rule === "0px" : (g.rule === "1px" && g.ruleStyle === "solid")), `${tag}: a thin rule above every group but the first`);
  const ents = m.groups.flatMap(g => g.entries);
  ok(ents.length === list.length, `${tag}: every entry is on the page (${ents.length} of ${list.length})`);
  ok(ents.every(e => /serif|Newsreader|Georgia/.test(e.font) && parseFloat(e.size) >= 17), `${tag}: each entry in the serif body size`);
  ok(ents.every(e => e.dot.w === "6px" && e.dot.bg === "rgb(30, 77, 56)" && e.dot.content !== "none" && parseFloat(e.dot.left) < 0), `${tag}: each entry has a small deep green dot in the left margin`);
  ok(m.groups.every(g => g.entries.slice(0, -1).every(e => Math.abs(parseFloat(e.mb) / parseFloat(e.size) - 1.5) < 0.05)), `${tag}: a line and a half of air between entries`);
  ok(ents.every(e => e.tags === 0), `${tag}: no tags, bullets, buttons, links or images inside an entry`);
  const th = ents.filter(e => e.th);
  ok(th.length === list.filter(e => e.thanks).length && th.every(e => parseFloat(e.th.size) < parseFloat(e.size) && e.th.color === "rgb(94, 107, 99)" && e.text.endsWith(e.th.text)), `${tag}: a thanks line ends its sentence in small quiet grey`);
  for (const e of list) ok(ents.some(x => x.text.startsWith(e.text)), `${tag}: the entry text is printed as the file holds it (${e.text.slice(0, 30)})`);
  ok(m.footText === C.whatsNew.FOOT_BEFORE + C.whatsNew.FOOT_LINK + C.whatsNew.FOOT_AFTER && m.footHref === "/feedback" && m.footLink === C.whatsNew.FOOT_LINK, `${tag}: the foot, Tell Sam linking to Feedback (${m.footText} ${m.footHref})`);
  ok(m.robots === "index, follow" && m.canon === "https://goasksam.com/whats-new" && /What's new/.test(m.title), `${tag}: indexed, canonical, titled (${m.title})`);
  const nav = m.railLinks.map(x => x.split("|")[0]);
  ok(nav.indexOf("What's new") > 0 && nav.indexOf("What's new") === nav.indexOf("About") + 1 && nav[nav.indexOf("What's new") + 1] === "Feedback", `${tag}: the rail lists What's new between About and Feedback (${nav.join(", ")})`);
  await p.close();
}
await b.close();

// THE RAIL AND THE FOOTER ON EVERY PAGE THAT DRAWS THEM (one function, lib/appShell.js shellFoot): About, What's new, Feedback in that order, the link going to /whats-new
for (const [m2, url] of [["about", "/about"], ["howSamDecides", "/how-sam-decides"], ["feedback", "/feedback"], ["whatsNew", "/whats-new"], ["business", "/business"], ["tasksPage", "/tasks"], ["marketCheck", "/market-check"], ["buy", "/find"]]) {
  const h = await call(m2, url), links = [...h.matchAll(/<a [^>]*class="gas-navitem[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)].map(x => [x[1], x[2].replace(/<[^>]+>/g, "").trim()]);
  const i = links.findIndex(l => l[0] === "/whats-new");
  ok(links.length > 3 && i > 0 && links[i][1] === "What's new" && links[i - 1][0] === "/about" && links[i + 1] && links[i + 1][0] === "/feedback", `${url}: the rail links What's new between About and Feedback (${links.map(l => l[1]).join(", ").slice(0, 120)})`);
}
// the sitemap and the route
const sm = await call("sitemapPages", "/sitemap-pages.xml");
ok(/<loc>https:\/\/goasksam\.com\/whats-new<\/loc>/.test(sm), "the sitemap lists /whats-new");
const vj = JSON.parse(fs.readFileSync(path.join(ROOT, "vercel.json"), "utf8"));
ok((vj.rewrites || []).some(r => r.source === "/whats-new" && r.destination === "/api/whatsNew"), "vercel.json routes /whats-new to the page");
ok(!!(vj.functions && vj.functions["api/whatsNew.js"] && /whatsNew\.json/.test(vj.functions["api/whatsNew.js"].includeFiles || "")), "the deployed function carries data/whatsNew.json");
// a missing file: the heading, the intro and the foot, and it still looks fine (no groups, no gap)
ok(mod && !/<section class="wn-group"/.test(mod.whatsNewPageHtml({ headers: {} }, [])) && new RegExp(rxEsc(C.whatsNew.FOOT_BEFORE.trim())).test(mod.whatsNewPageHtml({ headers: {} }, [])), "with no entries the page is the heading, the intro and the foot");
console.log(`whatsNewCheck: ${pass} pass, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
