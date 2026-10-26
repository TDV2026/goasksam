// OUTBOUND LINK TAGS (Sam, Oct 26 2026), offline: every outbound auction or listing link on Find, Tasks, the Tasks emails, Market Check and Sell goes through ONE helper
// (lib/outboundUtm.js) and carries utm_source=goasksam, utm_medium=referral and utm_campaign=<surface>; a link that already has a utm is unchanged; query and fragment are kept;
// mailto, our own pages, other sites and http are untouched; nothing about the person is in any tag; no listing link keeps noreferrer. The pages run the helper in a real browser.
//   node scripts/outboundUtmCheck.mjs
import fs from "node:fs";
import puppeteer from "puppeteer-core";
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
process.env.LAUNCH_STAGE = "2";
const { tagOutbound, OUTBOUND_JS } = await import("../lib/outboundUtm.js"), { PRIOR_SALE_HOSTS } = await import("../lib/_email.js");
// the helper
const T = (u, c = "find") => tagOutbound(u, c);
ok(T("https://bringatrailer.com/listing/1995-porsche-911/") === "https://bringatrailer.com/listing/1995-porsche-911/?utm_source=goasksam&utm_medium=referral&utm_campaign=find", "a Bring a Trailer listing gets the three tags and nothing else");
ok(T("https://carsandbids.com/auctions/abc/x?foo=1&bar=2#bids", "tasks_email") === "https://carsandbids.com/auctions/abc/x?foo=1&bar=2&utm_source=goasksam&utm_medium=referral&utm_campaign=tasks_email#bids", "existing query parameters and the fragment are kept");
for (const u of ["https://bringatrailer.com/x?utm_source=other", "https://bringatrailer.com/x?a=1&UTM_MEDIUM=email", "https://carsandbids.com/x?utm_campaign=z#f"]) ok(T(u) === u, "a link that already has a utm is unchanged: " + u);
for (const u of ["http://bringatrailer.com/x", "https://example.com/x", "mailto:feedback@goasksam.com", "/market-check?car=x", "https://goasksam.com/find", "https://thedailyvroom.com/", "javascript:void(0)", "", "not a url", "https://user:pw@bringatrailer.com/x", "https://bringatrailer.com.evil.example/x"]) ok(T(u) === u, "left alone: " + JSON.stringify(u));
for (const h of PRIOR_SALE_HOSTS) ok(/utm_source=goasksam/.test(T("https://" + h + "/a")) && /utm_source=goasksam/.test(T("https://www." + h + "/a")), "tagged: " + h + " and www." + h);
ok(PRIOR_SALE_HOSTS.length === 19 && /var HOSTS = \[([^\]]*)\]/.exec(tagOutbound.toString()) && JSON.parse("[" + /var HOSTS = \[([^\]]*)\]/.exec(tagOutbound.toString())[1] + "]").join() === PRIOR_SALE_HOSTS.join(), "the helper's host list is the 19 sources of lib/_email.js PRIOR_SALE_HOSTS, in the same order");
const tagged = T("https://bringatrailer.com/x"); const q = new URL(tagged).searchParams;
ok([...q.keys()].join() === "utm_source,utm_medium,utm_campaign" && !/@|account|session|user|email|visitor/i.test(tagged.replace("goasksam", "")), "the only tags are the three fixed ones: nothing about the person");
ok(T("https://bringatrailer.com/x", "find; drop table") === "https://bringatrailer.com/x?utm_source=goasksam&utm_medium=referral&utm_campaign=finddroptable", "a campaign is only letters, digits and underscore");
// the pages carry it, with their own surface
const pages = { find: ["api/buy.js", "find"], tasks: ["api/tasksPage.js", "tasks"], marketcheck: ["api/marketCheck.js", "market_check"], sell: ["api/sellPage.js", "sell"], sellnext: ["api/sellNext.js", "sell"] };
for (const [n, [f, c]] of Object.entries(pages)) { const s = fs.readFileSync(f, "utf8"); ok(s.includes("OUTBOUND_JS") && s.includes(`gasOutboundInstall("${c}")`), `${n}: the page installs the helper for the ${c} surface`); }
// the Tasks emails go through the helper
const ec = fs.readFileSync("lib/tasks/emailCards.js", "utf8"), ba = fs.readFileSync("lib/live/buyAlerts.js", "utf8"), tk = fs.readFileSync("lib/tasks/tasks.js", "utf8");
ok(/url: l\.url \? tagOutbound\(l\.url, "tasks_email"\)/.test(ec) && /url: tagOutbound\(row\.url, "tasks_email"\)/.test(ba) && /tagOutbound\(c\.url \|\| r\.url, "tasks_email"\)/.test(tk), "the Tasks email cards, the before-it-ends email and the digest blocks tag their listing link through the helper");
{ await import("../lib/tasks/tasks.js"); const { emailCardHtml, emailCardText } = await import("../lib/tasks/emailCards.js");
  const now = Date.now(), row = { id: 1, title: "2011 BMW 1M", make: "BMW", url: "https://bringatrailer.com/listing/x/", source: "Bring a Trailer", photo_url: "https://i.test/a.jpg", end_time: new Date(now + 5.3 * 3600e3).toISOString(), current_bid_usd: 52000, bid_at: new Date(now - 1200e3).toISOString(), miles: 34000, location: "Alpharetta, GA", country: "US", chips: ["Manual", "Alpine White"], mc_url: "/market-check?vin=WBSUR9C58BC123456", market: { kind: "range", low: 55000, high: 78000, count: 24, query: "2011 BMW 1M", basisLine: "Based on 24 sales, the latest in October 2026." }, sam_lines: [{ kind: "range", rung: [], placing: "below the range", text: "x" }], timeline: [{ date: "2024-03-12", result: "sold", price: 61000, miles: 29000, house: "Bring a Trailer" }], seen_before: { n: 1 }, history_url: "/vin/ABC" };
  let html = "", text = ""; try { html = emailCardHtml(row); text = emailCardText(row); } catch (e) { html = "ERR " + e.message; }
  const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map(m => m[1].replace(/&amp;/g, "&")).filter(h => /bringatrailer/.test(h));
  ok(hrefs.length >= 1 && hrefs.every(h => /utm_source=goasksam&utm_medium=referral&utm_campaign=tasks_email/.test(h)) && /View auction: https:\/\/bringatrailer\.com\/listing\/x\/\?utm_source=goasksam&utm_medium=referral&utm_campaign=tasks_email/.test(text), "a built Task email card: the photo and View auction links and the text part carry the three tags (" + hrefs.length + " links)"); }
// no listing link keeps noreferrer
for (const f of ["public/js/onebox.js", "public/js/chat-core.js", "public/js/result-copy.js", "public/js/result.js", "api/buy.js", "lib/sell/sellClient.js", "lib/sell/sellMcClient.js", "api/tasksPage.js"]) ok(!/noreferrer/.test(fs.readFileSync(f, "utf8")), f + ": no noreferrer on a listing link");
// the helper in a real browser: tags as drawn, tags later insertions, drops noreferrer, leaves the rest
const b = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", args: ["--no-sandbox"] });
const p = await b.newPage();
await p.setContent(`<body><a id=a href="https://bringatrailer.com/listing/x/" rel="noopener noreferrer" target="_blank">x</a><a id=b href="https://carsandbids.com/a?z=1#k" rel="noopener">y</a><a id=c href="https://example.com/z">z</a><a id=d href="/find">w</a><a id=e href="https://bringatrailer.com/q?utm_source=zz">v</a><a id=f href="mailto:a@b.co">m</a><div id=box></div></body>`);
await p.addScriptTag({ content: OUTBOUND_JS + ';gasOutboundInstall("find")' });
await p.evaluate(() => { const d = document.createElement("div"); d.innerHTML = '<a id=g href="https://www.rmsothebys.com/en/x" rel="noopener noreferrer">late</a>'; document.getElementById("box").appendChild(d); });
await new Promise(r => setTimeout(r, 200));
const h = await p.evaluate(() => Object.fromEntries([..."abcdefg"].map(k => [k, { href: document.getElementById(k).getAttribute("href"), rel: document.getElementById(k).getAttribute("rel") }])));
ok(/utm_campaign=find/.test(h.a.href) && h.a.rel === "noopener", "browser: a drawn listing link is tagged and noreferrer is dropped (" + h.a.rel + ")");
ok(/\?z=1&utm_source=goasksam&utm_medium=referral&utm_campaign=find#k$/.test(h.b.href), "browser: query and fragment kept");
ok(h.c.href === "https://example.com/z" && h.d.href === "/find" && h.f.href === "mailto:a@b.co" && h.e.href === "https://bringatrailer.com/q?utm_source=zz", "browser: other sites, our own pages, mailto and an existing utm are untouched");
ok(/rmsothebys\.com\/en\/x\?utm_source=goasksam/.test(h.g.href) && h.g.rel === "noopener", "browser: a link drawn later (a card that loads after) is tagged too");
await b.close();
console.log(`outboundUtmCheck: ${pass} pass, ${fail} fail`); process.exit(fail ? 1 : 0);
