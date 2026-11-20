// THE VIN INDEX TABLE ("Every {car} by VIN", Lane S, Nov 18 2026). Cause of the fault: the table had no widths of its own (auto layout, an unstyled
// .r class on the headings, the shared .stack phone rule printing labels in front of cells), so "Appearances" and "Last result" ran into each
// other and the count ran into the result; no row said which car it was (hubVins read neither the model nor the body style, and an attempt
// had no year); and the VIN column took what was left. It affects every page that api/history.js hubPage serves: every make, every model,
// every year hub (one template, one table). The VIN page has no data table (a timeline). Every other <table> in the repo is a crew
// dashboard, an admin page or an email layout (named in the registry below, swept, not changed).
// This check runs the LIVE handler (api/history.js, default export) over a fake archive and drives Chrome at 390, 768, 1280 and 1440.
//   node scripts/vinIndexPageCheck.mjs [--shots] [--mutants]     exit 1 on any failure.
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SHOTS = process.argv.includes("--shots"), MUT = process.argv.includes("--mutants");
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

if (MUT) {
  const muts = JSON.parse(fs.readFileSync(path.join(ROOT, "scripts/fixtures/vinIndexMutants.json"), "utf8"));
  const { spawnSync } = await import("node:child_process");
  let missed = 0;
  for (const m of muts) {
    const saved = [];
    try {
      for (const e of m.edits) { const f = path.join(ROOT, e.file); const t = fs.readFileSync(f, "utf8"); if (t.split(e.from).length !== 2) throw new Error("target not exactly once: " + e.from.slice(0, 50)); saved.push([f, t]); fs.writeFileSync(f, t.replace(e.from, () => e.to)); }
      const r = spawnSync("node", [path.join(ROOT, "scripts/vinIndexPageCheck.mjs")], { encoding: "utf8", cwd: ROOT, timeout: 240000 });
      const caught = r.status !== 0;
      console.log((caught ? "caught   " : "MISSED   ") + m.name); if (!caught) missed++;
    } catch (e) { console.log("MISSED   " + m.name + " (" + e.message + ")"); missed++; }
    finally { for (const [f, t] of saved.reverse()) fs.writeFileSync(f, t); }
  }
  console.log(missed ? `vinIndexPageCheck mutants: ${missed} not caught` : `vinIndexPageCheck mutants: all ${muts.length} caught`);
  process.exit(missed ? 1 : 0);
}

// ---- the fake archive
process.env.SUPABASE_URL = "https://db.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "k";
const V = { a: "WBSKG9C50DE000001", b: "WBSPM9C52AE000002", c: "WBS3R9C57HK000003", d: "WBSKG9C5XDE000004", e: "WBSKG9C51DE0000051234", f: "WBSKG9C59DE000006", g: "WBSKG9C55DE000007", h: "SCFEBBCF4EGL00008" };
const T = "BMW M3 listing";
const S = (vin, o) => ({ vin_norm: vin, year: 2013, model: "M3", model_family: "M3", body: "Coupe", sale_date: "2025-03-11", sale_price: 55500, sale_price_usd: 55500, platform: "bringatrailer", listing_title: "2013 BMW M3 Coupe", mileage: 21000, img: "https://img.test/a.jpg", url: "https://bringatrailer.com/listing/a", url2: null, currency: "USD", ...o });
const sales = [
  S(V.a, {}),
  S(V.b, { year: 2009, model_family: "M3", body: "Sedan", sale_date: "2025-02-02", sale_price: 31000, sale_price_usd: 31000, platform: "carsandbids", mileage: 61000, listing_title: "2009 BMW M3 Sedan", img: null }),
  S(V.c, { year: 2017, model_family: "M3", body: null, sale_date: "2025-01-20", sale_price: 1234567, sale_price_usd: 1234567, platform: "rmsothebys", mileage: 4800, listing_title: "2017 BMW M3 CS" }),
  S(V.e, { year: null, model: null, model_family: null, body: null, sale_date: "2024-12-01", sale_price: 20000, sale_price_usd: 20000, platform: "hagerty", mileage: null, listing_title: "BMW M3 unnamed", img: null }),
  S(V.f, { model: "M3 Coupe", model_family: null, body: "Coupe", sale_date: "2024-11-05", listing_title: "2013 BMW M3 Coupe", mileage: 33100 }),
];
// the longest car line and the biggest price the page has to hold: a long model and body name, a seven figure price with its fee
sales.push(S(V.h, { year: 1955, model: "300 SL Gullwing Coupe Alloy Body", model_family: "Mercedes-Benz 300 SL Gullwing Coupe Alloy Body", body: "Convertible", sale_date: "2025-05-05", sale_price: 1234567, sale_price_usd: 1234567, platform: "bringatrailer", mileage: 123456, listing_title: "1955 Mercedes-Benz 300 SL", img: null }));
for (let i = 0; i < 12; i++) sales.push(S(V.g, { sale_date: `2023-${String(i + 1).padStart(2, "0")}-15`, sale_price: 40000 + i * 500, sale_price_usd: 40000 + i * 500, mileage: 50000 + i, img: null }));
const A = (vin, o) => ({ chassis_vin_norm: vin, year: 2013, model: "M3", body: "Convertible", attempt_date: "2024-05-01", high_bid: 48000, high_bid_usd: 48000, source_slug: "bringatrailer", title: "2013 BMW M3 Convertible", img: null, url: "https://bringatrailer.com/listing/d", url2: null, mileage: "18200", currency: "USD", ...o });
const atts = [
  A(V.a, { attempt_date: "2024-06-01", year: 2012, model: "Other", body: "Wagon" }),
  A(V.f, { year: 2012, model: "Other", body: "Wagon", attempt_date: "2025-08-01" }),
  A(V.d, {}),
  A(V.e, { year: null, model: null, body: null, attempt_date: "2024-04-01", high_bid: null, high_bid_usd: null, mileage: null, title: "BMW M3 no bid" }),
];
const asked = [];
globalThis.fetch = async (u) => {
  u = String(u); const m = /^https:\/\/db\.test\/rest\/v1\/([a-z_]+)\?(.*)$/.exec(u);
  const J = (b) => ({ ok: true, status: 200, headers: { get: () => "application/json" }, json: async () => b, text: async () => JSON.stringify(b) });
  if (!m) { if (/^https:\/\/img\.test/.test(u)) return { ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(0), headers: { get: () => "image/png" } }; return { ok: false, status: 404, headers: { get: () => "" }, json: async () => ({}), text: async () => "" }; }
  asked.push(u);
  const yr = /[?&]year=eq\.(\d+)/.exec(u);
  if (m[1] === "sales_archive") { if (!/listing_title=ilike/.test(u)) return J([]); return J(sales.filter(r => !yr || String(r.year) === yr[1])); }
  if (m[1] === "auction_attempts") { if (!/raw_record->>title=ilike/.test(u)) return J([]); return J(atts.filter(r => !yr || String(r.year) === yr[1])); }
  return J([]);
};
const { hubVins } = await import("../api/_historyData.js");
const handler = (await import("../api/history.js")).default;
const env = { supabaseUrl: "https://db.test", supabaseKey: "k" };

// ---- the data (no browser): the car on each row, straight from the columns
{
  const list = await hubVins(env, { year: null, makeSlug: "bmw", modelSlug: "m3" });
  const by = Object.fromEntries(list.map(g => [g.vin, { apps: [], car: null, ...g, car: g.car === undefined ? null : g.car }]));
  const cr = v => (by[v] && by[v].car) || {};
  ok(by[V.a] && JSON.stringify(by[V.a].car) === JSON.stringify({ year: 2013, model: "M3", modelFamily: "M3", body: "Coupe" }), "a sale's car: year, model, model_family, body, from the columns");
  ok(by[V.a].apps.some(x => x.kind === "attempt") && cr(V.a).body === "Coupe" && cr(V.a).year === 2013, "a VIN with a sale and an attempt takes the car from the sale, not the attempt (attempt said 2012 Wagon)");
  ok(by[V.f] && by[V.f].last.kind === "attempt" && cr(V.f).year === 2013 && cr(V.f).body === "Coupe", "a newer attempt (2012 Wagon) does not take the car line from the older sale");
  ok(by[V.d] && by[V.d].car && by[V.d].car.year === 2013 && by[V.d].car.model === "M3" && by[V.d].car.body === "Convertible" && by[V.d].car.modelFamily === null, "an attempt-only VIN takes the year, model and body from the attempt's own columns");
  ok(by[V.e] && by[V.e].car == null && by[V.e].apps.length === 2, "no year and no name on any row: no car (the page shows the VIN alone)");
  ok(by[V.c].car && by[V.c].car.body === null && by[V.c].car.year === 2017, "a missing body style stays null, never guessed");
  const sel = asked.join(" ");
  ok(/sales_archive\?[^ ]*select=[^ ]*model_family/.test(sel) && /sales_archive\?[^ ]*select=[^ ]*body:raw_record->>body_style/.test(sel) && /auction_attempts\?[^ ]*select=[^ ]*year,model,body:raw_record->>body_style/.test(sel), "the hub reads the same columns the VIN page reads");
  const src = fs.readFileSync(path.join(ROOT, "api/_historyData.js"), "utf8"), i = src.indexOf("function carCols"), blk = src.slice(i, src.indexOf("export async function hubVins"));
  ok(i > 0 && !/listing_title|title|vin|match\(|test\(|replace\(/i.test(blk.replace(/\bvin\b/g, "")), "the car comes from columns only: nothing in carCols reads a title or a VIN");
}

// ---- the page through the live handler, in Chrome
const puppeteer = createRequire(path.join(ROOT, "package.json"))("puppeteer-core");
async function get(slug) {
  let body = "", status = 200; const hdr = {};
  const res = { setHeader: (k, v) => { hdr[k.toLowerCase()] = v; }, getHeader: k => hdr[k.toLowerCase()], status(c) { status = c; return res; }, send(b) { body = String(b); return res; }, end(b) { if (b) body = String(b); return res; }, json(b) { body = JSON.stringify(b); return res; }, writeHead(c) { status = c; return res; }, write(b) { body += b; }, headersSent: false };
  const req = { method: "GET", url: "/history/" + slug, query: { slug }, headers: { host: "goasksam.com" } };
  await handler(req, res);
  return { status, body };
}
const pages = { all: await get("bmw-m3"), y2013: await get("2013-bmw-m3") };
ok(pages.all.status === 200 && /<table class="vix">/.test(pages.all.body), "the all-years index serves the new table through the live handler (status " + pages.all.status + ")");
ok(pages.y2013.status === 200 && /<table class="vix">/.test(pages.y2013.body), "a year index serves it too");
const NAMES = { all: "all", y2013: "2013" };

const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
async function open(slug, w) {
  const pg = await browser.newPage(); await pg.setViewport({ width: w, height: 900 });
  await pg.setRequestInterception(true);
  pg.on("request", r => { const u = r.url(); if (r.resourceType() === "document" && u.startsWith("http://t.test/")) return r.respond({ status: 200, contentType: "text/html; charset=utf-8", body: pages[slug].body.replace("<head>", '<head><base href="https://goasksam.com/">') }); if (r.resourceType() === "image") return r.respond({ status: 200, contentType: "image/png", body: PNG }); return r.respond({ status: 204, body: "" }); });
  await pg.goto("http://t.test/" + slug, { waitUntil: "domcontentloaded" });
  return pg;
}
const MEASURE = () => {
  const R = e => { const b = e.getBoundingClientRect(); return { l: b.left, r: b.right, t: b.top, b: b.bottom }; };
  // the rect of what a cell actually prints (its text and its children), not the cell box
  const inner = e => { const rg = document.createRange(); rg.selectNodeContents(e); const rs = [...rg.getClientRects()].filter(x => x.width > 0 && x.height > 0); if (!rs.length) return null; return { l: Math.min(...rs.map(x => x.left)), r: Math.max(...rs.map(x => x.right)), t: Math.min(...rs.map(x => x.top)), b: Math.max(...rs.map(x => x.bottom)) }; };
  const tbl = document.querySelector("table.vix"); if (!tbl) return { none: true };
  const heads = [...tbl.querySelectorAll("thead th")].map(h => ({ txt: h.textContent.trim(), shown: getComputedStyle(h).display !== "none" && h.getBoundingClientRect().width > 0, box: R(h), ink: inner(h) }));
  const rows = [...tbl.querySelectorAll("tbody tr")].map(tr => {
    const cells = [...tr.children].map(td => ({ cls: td.className.replace(/\bpad\b/, "").trim(), txt: td.textContent.trim(), box: R(td), ink: inner(td), over: td.scrollWidth > td.clientWidth + 1, ta: getComputedStyle(td).textAlign, fv: getComputedStyle(td).fontVariantNumeric }));
    const car = tr.querySelector(".c-car"); const vn = tr.querySelector("a.vn");
    return { cells, cl: (car.querySelector(".cl") || {}).textContent || "", vin: vn.textContent, href: vn.getAttribute("href"), vnSize: parseFloat(getComputedStyle(vn).fontSize), clSize: car.querySelector(".cl") ? parseFloat(getComputedStyle(car.querySelector(".cl")).fontSize) : null, vnTop: R(vn).t, clBot: car.querySelector(".cl") ? R(car.querySelector(".cl")).b : null, fee: (tr.querySelector(".fee") || {}).textContent || null, feeBelow: tr.querySelector(".fee") ? tr.querySelector(".fee").getBoundingClientRect().top >= tr.querySelector(".pr").getBoundingClientRect().bottom - 1 : null, layout: getComputedStyle(tbl).tableLayout, feeSize: tr.querySelector(".fee") ? parseFloat(getComputedStyle(tr.querySelector(".fee")).fontSize) : null, prSize: tr.querySelector(".pr") ? parseFloat(getComputedStyle(tr.querySelector(".pr")).fontSize) : null, res: tr.querySelector(".c-res").textContent.trim() };
  });
  const clip = [...document.querySelectorAll("main *")].filter(e => e.scrollWidth > e.clientWidth + 2 && ["hidden", "clip"].includes(getComputedStyle(e).overflowX) && e.clientWidth > 4 && e.textContent.trim().length > 0 && getComputedStyle(e).position !== "absolute").map(e => e.tagName + "." + e.className + ":" + e.textContent.trim().slice(0, 30));
  return { clip, heads, rows, sw: document.documentElement.scrollWidth, iw: window.innerWidth, h1: (document.querySelector("h1") || {}).textContent, title: document.title, links: [...tbl.querySelectorAll("a")].map(a => a.getAttribute("href")) };
};
const clear = (a, b, gap = 8) => !a || !b || a.r + gap <= b.l || b.r + gap <= a.l || a.b <= b.t || b.b <= a.t;   // no horizontal touch unless they sit on different lines
const apart = (a, b, gap = 8) => !a || !b || a.r + gap <= b.l || a.b <= b.t;   // a ends left of b by the gap, or above it
const first = {};
for (const stress of [false, true]) for (const slug of ["all", "y2013"]) for (const w of [1440, 1280, 1024, 768, 390]) {
  if (stress && slug !== "all") continue;
  const pg = await open(slug, w); if (stress) await pg.addStyleTag({ content: "table.vix th{font-size:15px !important;letter-spacing:.14em !important}table.vix td{font-size:17px !important}" });   // the page is wrapped by shells with their own heading type: wider type must not clip either
  const m = await pg.evaluate(MEASURE); const tag = `${NAMES[slug]} @${w}${stress ? " wide type" : ""}: `;
  if (m.none) { ok(false, tag + "no table"); if (SHOTS && slug === "all" && [1440, 390].includes(w)) { const f = path.join(ROOT, "docs/demo-run", `vin-index-${process.env.SHOT_TAG || "after"}-${w === 390 ? "phone-390" : "desktop-1440"}.png`); fs.mkdirSync(path.dirname(f), { recursive: true }); await pg.evaluate(() => { const t = document.querySelector("table"); if (t) t.scrollIntoView(); }); await pg.screenshot({ path: f }); } await pg.close(); continue; }
  ok(m.clip.length === 0, tag + `nothing is clipped (the page's own rule: no element hides content wider than itself): ${m.clip.join(" | ")}`);
  ok(m.sw <= m.iw, tag + `no sideways scroll (${m.sw} > ${m.iw})`);
  if (w >= 768) {
    const H = m.heads.filter(h => h.shown && h.txt !== "Photo"); ok(H.map(h => h.txt).join("|") === "Car|Seen|Last result|Date|Miles", tag + "the headings are Car, Seen, Last result, Date, Miles (" + H.map(h => h.txt).join("|") + ")");
    for (const h of H) ok(!h.ink || h.ink.r <= h.box.r + 1, tag + `the heading "${h.txt}" fits inside its own column`);
    for (let i = 0; i + 1 < H.length; i++) ok(apart(H[i].ink, H[i + 1].ink), tag + `headings "${H[i].txt}" and "${H[i + 1].txt}" do not touch (8px apart)`);
    ok(!m.heads.some(h => /Appearances/.test(h.txt)), tag + "the heading is Seen, not Appearances");
  }
  for (const r of m.rows) {
    const c = Object.fromEntries(r.cells.map(x => [x.cls.split(" ").find(k => /^c-/.test(k)), x]));
    ok(!r.cells.some(x => x.over), tag + `${r.vin}: no cell overflows its own box`);
    if (w >= 768) {
      const order = ["c-ph", "c-car", "c-seen", "c-res", "c-date", "c-mi"];
      for (let i = 0; i + 1 < order.length; i++) ok(apart(c[order[i]].ink, c[order[i + 1]].ink), tag + `${r.vin}: ${order[i]} and ${order[i + 1]} do not touch`);
      ok(c["c-seen"].ta === "right" && c["c-mi"].ta === "right", tag + `${r.vin}: Seen and Miles are right aligned`);
    }
    ok(/^\d+$/.test(c["c-seen"].txt.replace(/^Seen\s*/, "")), tag + `${r.vin}: the count is its own cell, just the number (${c["c-seen"].txt})`);
    ok(/tabular-nums/.test(c["c-seen"].fv) && /tabular-nums/.test(c["c-mi"].fv) && /tabular-nums/.test(c["c-res"].fv), tag + `${r.vin}: tabular figures`);
    ok(r.vnSize <= 15 && (r.clSize == null || r.clSize > r.vnSize), tag + `${r.vin}: the VIN is small type beneath/after the car line`);
    ok(!/[–—]/.test(r.cells.map(x => x.txt).join(" ")), tag + `${r.vin}: no dashes in the row`);
    if (r.fee) ok(r.feeBelow === true, tag + `${r.vin}: the fee sits on its own line below the price`);
    if (w >= 768) ok(r.layout === "fixed", tag + `${r.vin}: the table lays out by its column widths`);
    if (w === 1280 && r.fee) ok(r.feeSize < r.prSize || r.feeSize <= 13, tag + `${r.vin}: the fee is a quieter second line`);
  }
  if (w === 390) {
    for (const r of m.rows) {
      const c = Object.fromEntries(r.cells.map(x => [x.cls.split(" ").find(k => /^c-/.test(k)), x]));
      ok(Math.abs(c["c-ph"].box.t - c["c-car"].box.t) < 4, tag + `${r.vin}: photo and car share the first line`);
      ok(c["c-res"].box.t >= c["c-car"].box.b - 1 && c["c-res"].box.t >= c["c-ph"].box.b - 1, tag + `${r.vin}: the result is on the second line`);
      ok(c["c-date"].box.t >= c["c-res"].box.b - 1 && Math.abs(c["c-date"].box.t - c["c-mi"].box.t) < 4, tag + `${r.vin}: date and miles share the third line`);
      ok(clear(c["c-date"].ink, c["c-mi"].ink) && clear(c["c-car"].ink, c["c-seen"].ink), tag + `${r.vin}: nothing touches on the phone`);
    }
  }
  if (w === 1440 && !stress) {
    first[slug] = m;
    const byV = Object.fromEntries(m.rows.map(r => [r.vin, r]));
    if (slug === "all") {
      ok(byV[V.a] && byV[V.a].cl === "2013 M3 Coupe", "all: the car line reads '2013 M3 Coupe' (" + (byV[V.a] || {}).cl + ")");
      ok(byV[V.b] && byV[V.b].cl === "2009 M3 Sedan", "all: '2009 M3 Sedan' (" + (byV[V.b] || {}).cl + ")");
      ok(byV[V.c] && byV[V.c].cl === "2017 M3", "all: a car with no body style reads '2017 M3', nothing added (" + (byV[V.c] || {}).cl + ")");
      ok(byV[V.d] && byV[V.d].cl === "2013 M3 Convertible", "all: an unsold car's line comes from the attempt's own columns (" + (byV[V.d] || {}).cl + ")");
      ok(byV[V.f] && byV[V.f].cl === "2013 M3 Coupe", "all: the body is not said twice when the model already says it (" + (byV[V.f] || {}).cl + ")");
      ok(byV[V.e] && byV[V.e].cl === "" && byV[V.e].vnTop < 1e9, "all: a row with no year or name shows the VIN alone as its first line");
      ok(byV[V.g] && /^12$/.test(byV[V.g].cells[2].txt), "all: the count is a plain number, 12");
      ok(/^Sold \$55,500$/.test(byV[V.a].res.replace(/\s*\$58,275 with buyer.s fee/, "")) && /\$58,275 with buyer/.test(byV[V.a].res), "all: result is the outcome word first, then the price, the fee after it");
      ok(byV[V.d] && /^Not sold/.test(byV[V.d].res) && /\$48,000/.test(byV[V.d].res), "all: an unsold result leads with 'Not sold' then the bid");
      ok(byV[V.c] && /^Sold \$1,234,567$/.test(byV[V.c].res) && byV[V.c].fee == null, "all: no fee line where the house's fee is not known");
      const hrefs = m.rows.map(r => r.href);
      ok(hrefs.every(h => /^\/history\/[a-z0-9-]+\/[A-Z0-9]+$|^\/vin\/[A-Z0-9]+$/.test(h)) && hrefs.length === m.rows.length, "all: every VIN link is a car page address: " + hrefs.slice(0, 2).join(", "));
      ok(m.h1 === "BMW M3 auction results" && /BMW M3/.test(m.title), "all: heading and title unchanged (" + m.h1 + " | " + m.title + ")");
      ok(m.rows.length === 8, "all: eight cars listed (" + m.rows.length + ")");
      ok(byV[V.h] && byV[V.h].cl === "1955 Mercedes-Benz 300 SL Gullwing Coupe Alloy Body Convertible" && /\$1,234,567/.test(byV[V.h].res) && /\$1,242,067 with buyer/.test(byV[V.h].res), "all: the longest car line and a seven figure price with its fee print whole (" + (byV[V.h] || {}).cl + " | " + (byV[V.h] || {}).res + ")");
    } else {
      ok(m.rows.every(r => /^2013 /.test(r.cl)), "2013: every row's car line names its own year");
      ok(m.h1 === "2013 BMW M3 auction results", "2013: heading unchanged (" + m.h1 + ")");
    }
  }
  if (SHOTS && !stress && ((slug === "all") && [1440, 390].includes(w))) { fs.mkdirSync(path.join(ROOT, "docs/demo-run"), { recursive: true }); const f = path.join(ROOT, "docs/demo-run", `vin-index-${process.env.SHOT_TAG || "after"}-${w === 390 ? "phone-390" : "desktop-1440"}.png`); await pg.evaluate(() => document.querySelector("table.vix").scrollIntoView()); await pg.screenshot({ path: f }); }
  await pg.close();
}
// the links are the same as before the change: one per car, to the same address each car had (built from the hub slug and the car's year)
if (first.all && first.y2013) { const hrefs = first.all.rows.map(r => r.href).sort(); ok(new Set(hrefs).size === hrefs.length && first.y2013.rows.every(r => /^\/history\/2013-bmw-m3\/[A-Z0-9]+$/.test(r.href)), "a year index links each car to /history/{year-make-model}/{VIN}"); }
await browser.close();

// ---- the class sweep: every <table> in the repo is either this one or on this list
{
  const files = []; const walk = d => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { if (["node_modules", ".git", "docs", "scripts", "proofs"].includes(e.name)) continue; const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (/\.(js|mjs)$/.test(e.name)) files.push(p); } };
  walk(path.join(ROOT, "api")); walk(path.join(ROOT, "lib"));
  const REG = { "api/history.js": "CHANGED: the VIN index (every make, model and year hub, one template)", "api/admin.js": "swept: crew admin tables, noindex, not a public index", "api/usageDashboard.js": "swept: keyed ops dashboards, not public", "lib/_email.js": "swept: email layout tables, no data columns", "lib/tasks/emailCardLayout.js": "swept: email card layout", "lib/tasks/carMailPreview.js": "swept: crew-only email preview", "lib/preview/deskV3.js": "swept: crew-only desk preview, not a public index" };
  const hit = files.filter(f => /<table\b/.test(fs.readFileSync(f, "utf8"))).map(f => path.relative(ROOT, f));
  const stray = hit.filter(f => !REG[f]);
  ok(stray.length === 0, "every file that draws a <table> is named in the sweep registry (not named: " + stray.join(", ") + ")");
  const h = fs.readFileSync(path.join(ROOT, "api/history.js"), "utf8");
  ok(!/<table class="stack">/.test(h) && (h.match(/<table/g) || []).length === 1 && /<table class="vix">/.test(h), "history.js draws one table, and it is the index (the VIN page has none)");
  ok(/table\.vix\{[^}]*tabular-nums/.test(h), "the table asks for tabular figures itself, not only through the shared td rule");
  ok(!/<th[^>]*>Appearances|data-l="Appearances"/.test(h), "no 'Appearances' heading is left in history.js");
}
console.log(`vinIndexPageCheck: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
