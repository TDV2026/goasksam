#!/usr/bin/env node
// searchCheckBrowser.mjs (Oct 2026, checks-that-can-actually-run job): a real-browser rebuild of
// scripts/searchCheck.js's own rule set (docs/search-rules.md: title/h1/lead/canonical/noindex),
// for the one case searchCheck.js itself cannot clear on its own: Vercel's Bot Protection answers a
// plain-fetch request with a JS challenge (x-vercel-mitigated: challenge) that only a real browser
// can complete. searchCheck.js already has a proper fix for THIS (VERCEL_AUTOMATION_BYPASS_SECRET,
// the official Vercel header a server-side script can send) - when that secret is set (the nightly
// workflow already passes it), searchCheck.js should pass cleanly on its own. This script exists for
// the case that secret is absent or unverifiable (a local run, a sandbox, a session with no access
// to GitHub's configured secrets) - the SAME signed-out five-page test already proved a real browser
// is never challenged, so this reuses that path instead of asking for a bypass of any kind.
//
// Same page list and same rules as searchCheck.js (title present + not duplicated, h1 present, a
// lead sentence or /sell's "Updated [date]" exception, a canonical link, no noindex-page-in-sitemap).
// Does NOT write to app_usage_events (that stays searchCheck.js's job when it can run); this is a
// verification tool, read-only against the live DOM.
//
//   node scripts/searchCheckBrowser.mjs [--base=https://goasksam.com] [--chrome=/path/to/chrome]
import puppeteer from "puppeteer-core";

const arg = (k, d) => { const a = process.argv.find(x => x.startsWith(`--${k}=`)); return a ? a.split("=")[1] : d; };
const BASE = (arg("base", process.env.SEARCH_BASE || "https://goasksam.com")).replace(/\/$/, "");
const CHROME = arg("chrome", process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome");

async function loadDoc(page, url) {
  const resp = await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 }).catch(() => null);
  if (!resp) return { ok: false, status: 0, finalUrl: url };
  const status = resp.status(), finalUrl = page.url();
  const parsed = await page.evaluate(() => {
    const strip = s => String(s || "").replace(/\s+/g, " ").trim();
    const title = strip(document.title);
    const h1 = strip(document.querySelector("h1") ? document.querySelector("h1").textContent : "");
    const canonical = !!document.querySelector('link[rel="canonical"]');
    const robots = document.querySelector('meta[name="robots"]');
    const noindex = !!(robots && /noindex/i.test(robots.getAttribute("content") || ""));
    let lead = strip(document.querySelector("[data-lead-sentence]") ? document.querySelector("[data-lead-sentence]").textContent : "");
    if (!lead) { for (const p of document.querySelectorAll("p")) { const t = strip(p.textContent); if (t.length >= 30) { lead = t; break; } } }
    const bodyText = strip(document.body ? document.body.innerText : "");
    const updatedLine = /\bUpdated\s+[A-Z][a-z]+\s+\d{1,2},\s+\d{4}\b/.test(bodyText);
    return { title, h1, canonical, noindex, lead, updatedLine };
  });
  return { ok: status < 400, status, finalUrl, ...parsed };
}

async function sitemapUrls(page) {
  const set = new Set();
  for (const sm of ["sitemap-pages.xml", "sitemap-specs.xml", "sitemap-hubs.xml"]) {
    try {
      const resp = await page.goto(`${BASE}/${sm}`, { waitUntil: "networkidle2", timeout: 20000 });
      if (resp && resp.ok()) {
        const body = await resp.text();
        for (const m of body.matchAll(/<loc>([^<]+)<\/loc>/gi)) set.add(m[1].trim().replace(/\/$/, ""));
      }
    } catch { /* best-effort, same as searchCheck.js */ }
  }
  return set;
}

async function main() {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
  const page = await b.newPage();
  try {
    const inSitemap = await sitemapUrls(page);
    const pick = (re, fallback) => [...inSitemap].find(u => re.test(u)) || fallback;
    const specUrl = pick(/\/cars\/[^/]+\/[^/]+\/[^/]+/, `${BASE}/cars/porsche/911/993/carrera/coupe-manual`);
    const hubUrl = pick(/\/cars\/[^/]+\/[^/]+$/, `${BASE}/cars/porsche/911`);
    const urls = [`${BASE}/`, `${BASE}/buy`, `${BASE}/sell`, `${BASE}/mcp`, `${BASE}/market-check`, `${BASE}/tasks`, `${BASE}/how-sam-decides`, hubUrl, specUrl];
    const results = [];
    const seenFinal = new Set();
    for (const u of urls) {
      const ctx = await b.createBrowserContext();
      const p = await ctx.newPage();
      const r = await loadDoc(p, u);
      await ctx.close();
      const fin = (r.finalUrl || u).replace(/\/$/, "");
      if (seenFinal.has(fin)) continue;
      seenFinal.add(fin);
      results.push({ url: u, ...r });
    }

    const byTitle = new Map();
    for (const r of results) if (r.title) byTitle.set(r.title, (byTitle.get(r.title) || 0) + 1);

    const failures = [];
    for (const r of results) {
      const where = r.url.replace(BASE, "");
      if (!r.ok) { failures.push(`${where}: HTTP ${r.status}`); continue; }
      if (!r.title) failures.push(`${where}: missing <title>`);
      else if (byTitle.get(r.title) > 1) failures.push(`${where}: duplicate <title> ("${r.title}")`);
      if (!r.h1) failures.push(`${where}: missing <h1>`);
      const isSell = (r.finalUrl || r.url).replace(/\/$/, "").endsWith("/sell");
      if (!r.lead && !(isSell && r.updatedLine)) failures.push(`${where}: no lead sentence${isSell ? ' (or an "Updated [date]" line for /sell)' : ""}`);
      if (!r.canonical) failures.push(`${where}: no <link rel=canonical>`);
      if (r.noindex && inSitemap.has((r.finalUrl || r.url).replace(/\/$/, ""))) failures.push(`${where}: noindex page is present in a sitemap`);
    }

    const pass = failures.length === 0;
    console.log(`searchCheckBrowser: ${results.length} pages, ${pass ? "PASS" : failures.length + " FAILURE(S)"}`);
    for (const r of results) console.log(`  ${r.ok ? "ok " : "ERR"} ${r.url.replace(BASE, "")}  title=${r.title ? "y" : "n"} h1=${r.h1 ? "y" : "n"} lead=${r.lead ? "y" : "n"}${r.updatedLine ? " updated=y" : ""} canon=${r.canonical ? "y" : "n"}${r.noindex ? " noindex" : ""}`);
    if (!pass) { console.log("FAILURES:"); for (const f of failures) console.log(`  - ${f}`); }
    process.exitCode = pass ? 0 : 1;
  } finally {
    await b.close();
  }
}

main().catch(e => { console.error("searchCheckBrowser crashed:", e); process.exit(1); });
