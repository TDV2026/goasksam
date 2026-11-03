// sitemapRouteCheck: a crawler that tries /sitemap.xml by habit must reach the real sitemap index, never a stale
// hand-kept page list. Class: any static sitemap*.xml in public/ that lists pages (it would bypass the stage-aware
// list in api/sitemapPages.js and show a crawler a different site than robots.txt names). No network.
import fs from "node:fs"; import path from "node:path";
const ROOT = process.cwd(); let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const vj = JSON.parse(fs.readFileSync(path.join(ROOT, "vercel.json"), "utf8"));
const robots = fs.readFileSync(path.join(ROOT, "public/robots.txt"), "utf8");
const idxUrl = (robots.match(/^Sitemap:\s*(\S+)/im) || [])[1] || "";
ok(/\/sitemap-index\.xml$/.test(idxUrl), "robots.txt names the sitemap index (" + idxUrl + ")");
const rw = (vj.rewrites || []).find(r => r.source === "/sitemap.xml"), rw2 = (vj.rewrites || []).find(r => r.source === "/sitemap-index.xml");
ok(rw && rw.destination === "/api/history?sitemap=root" && rw2 && rw2.destination === rw.destination, "/sitemap.xml and /sitemap-index.xml are both rewritten to the one generated index (/api/history?sitemap=root)");
ok(!fs.existsSync(path.join(ROOT, "public/sitemap-index.xml")), "no static public/sitemap-index.xml (a static file beats the rewrite, and a hand-kept index can list an index)");
// A static file in public/ beats a rewrite, so no static sitemap.xml may exist, and no static file may list pages itself.
ok(!fs.existsSync(path.join(ROOT, "public/sitemap.xml")), "no static public/sitemap.xml (it would shadow the rewrite)");
for (const f of fs.readdirSync(path.join(ROOT, "public")).filter(n => /^sitemap.*\.xml$/.test(n))) {
  const x = fs.readFileSync(path.join(ROOT, "public", f), "utf8");
  ok(!/<urlset[\s>]/.test(x), "public/" + f + " is not a hand-kept page list");
}
// The children the generated index names are checked, rendered, in scripts/sitemapValidCheck.mjs.
console.log(`sitemapRouteCheck: ${pass} pass, ${fail} FAIL`); process.exit(fail ? 1 : 0);
