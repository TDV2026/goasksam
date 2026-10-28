// sitemapRouteCheck: a crawler that tries /sitemap.xml by habit must reach the real sitemap index, never a stale
// hand-kept page list. Class: any static sitemap*.xml in public/ that lists pages (it would bypass the stage-aware
// list in api/sitemapPages.js and show a crawler a different site than robots.txt names). No network.
import fs from "node:fs"; import path from "node:path";
const ROOT = process.cwd(); let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const vj = JSON.parse(fs.readFileSync(path.join(ROOT, "vercel.json"), "utf8"));
const robots = fs.readFileSync(path.join(ROOT, "public/robots.txt"), "utf8");
const idx = fs.readFileSync(path.join(ROOT, "public/sitemap-index.xml"), "utf8");
const idxUrl = (robots.match(/^Sitemap:\s*(\S+)/im) || [])[1] || "";
ok(/\/sitemap-index\.xml$/.test(idxUrl), "robots.txt names the sitemap index (" + idxUrl + ")");
const rw = (vj.rewrites || []).find(r => r.source === "/sitemap.xml");
ok(rw && rw.destination === "/sitemap-index.xml", "/sitemap.xml is rewritten to /sitemap-index.xml in vercel.json");
// A static file in public/ beats a rewrite, so no static sitemap.xml may exist, and no static file may list pages itself.
ok(!fs.existsSync(path.join(ROOT, "public/sitemap.xml")), "no static public/sitemap.xml (it would shadow the rewrite)");
for (const f of fs.readdirSync(path.join(ROOT, "public")).filter(n => /^sitemap.*\.xml$/.test(n))) {
  const x = fs.readFileSync(path.join(ROOT, "public", f), "utf8");
  ok(!/<urlset[\s>]/.test(x) || f === "sitemap-hubs.xml", "public/" + f + " is not a hand-kept page list");
}
// Every child the index names is served: by a rewrite or by a static file.
for (const m of idx.matchAll(/<loc>https:\/\/goasksam\.com(\/[^<]+)<\/loc>/g)) {
  const p = m[1], served = (vj.rewrites || []).some(r => new RegExp("^" + r.source + "$").test(p)) || fs.existsSync(path.join(ROOT, "public", p));
  ok(served, "index child " + p + " is served");
}
console.log(`sitemapRouteCheck: ${pass} pass, ${fail} FAIL`); process.exit(fail ? 1 : 0);
