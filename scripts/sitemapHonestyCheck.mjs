// SITEMAP HONESTY (Lane F wrote it as a scratch check, Nov 8 2026; Lane B adopted it into the repo). Rule 7 of docs/search-rules.md: every URL a sitemap lists answers 200, is indexable and is its own canonical. CAUSE it guards: a sitemap built from one cached read while the page
// applies its own live gate (about 900 of 4,545 listed hubs answered 404 or noindex on Nov 8). It samples EVERY file of the live index (pages, hubs, VIN files, motorcycles, other), not one hub, and fails on any listed URL that is not 200, indexable and self-canonical.
//   node scripts/sitemapHonestyCheck.mjs [--per-file=N] [--files=sitemap-vins-hubs.xml,...] [--list=file.txt] [--base=https://goasksam.com] [--gate-required]
//   VERCEL_AUTOMATION_BYPASS_SECRET (or BYP) only passes the edge challenge for the check's own requests. Read only; one request at a time, 200 ms apart.
// --gate-required: SKIP (exit 0) when the live hub file was built before the hub gate existed (no X-Sitemap-Gate: verified header): the check then judges a list nobody has rebuilt yet. prePush uses it so the push that ships the gate is not blocked by the list it replaces.
import fs from "fs";
const UA = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)", B = process.env.VERCEL_AUTOMATION_BYPASS_SECRET || process.env.BYP;
const arg = (n, d) => ((process.argv.find(a => a.startsWith("--" + n + "=")) || "").split("=").slice(1).join("=")) || d;
const per = Number(arg("per-file", "8")), listArg = arg("list", ""), BASE = arg("base", "https://goasksam.com"), only = arg("files", "");
const H = { "user-agent": UA, ...(B ? { "x-vercel-protection-bypass": B } : {}) };
if (!B && !listArg && !process.argv.includes("--no-bypass")) { console.log("SKIP  no VERCEL_AUTOMATION_BYPASS_SECRET (or BYP): the edge challenge would answer 429 for every page"); process.exit(0); }
const allFiles = ["sitemap-pages.xml", "sitemap-vins-hubs.xml", "sitemap-motorcycles.xml", "sitemap-other.xml"];
const sample = (a, n) => Array.from({ length: Math.min(n, a.length) }, (_, i) => a[Math.floor((i + 0.37) * a.length / Math.min(n, a.length))]);
const get = async (u, o = {}) => { for (let k = 0; k < 2; k++) { try { return await fetch(u, { headers: H, ...o }); } catch (e) { if (k) throw e; await new Promise(r => setTimeout(r, 1500)); } } };
let urls = [];
if (listArg) urls = fs.readFileSync(listArg, "utf8").split("\n").filter(Boolean).map(u => ({ f: "list", u }));
else {
  const idx = await get(BASE + "/sitemap-index.xml"); const it = await idx.text();
  const listed = [...it.matchAll(/<loc>([^<]+)/g)].map(m => m[1].replace(/^https?:\/\/[^/]+\//, ""));
  const files = (only ? only.split(",") : listed.length ? listed : allFiles);
  if (process.argv.includes("--gate-required")) { const hr = await get(BASE + "/sitemap-vins-hubs.xml"); if ((hr.headers.get("x-sitemap-gate") || "") !== "verified") { console.log("SKIP  the live hub file was built before the hub gate (no X-Sitemap-Gate: verified); the nightly rollout writes the first gated list"); process.exit(0); } }
  for (const f of files) { const r = await get(BASE + "/" + f), t = await r.text(); const l = [...t.matchAll(/<loc>([^<]+)/g)].map(m => m[1]); for (const u of sample(l, per)) urls.push({ f, u }); }
}
const bad = {}; let n = 0;
for (const { f, u } of urls) {
  const r = await get(u, { redirect: "manual" }), h = await r.text(); n++;
  const why = [];
  if (r.status !== 200) why.push("status " + r.status);
  if (/noindex/i.test(r.headers.get("x-robots-tag") || "") || /<meta[^>]+name=["']robots["'][^>]*noindex/i.test(h)) why.push("noindex");
  const c = (h.match(/<link[^>]+rel=["']canonical["'][^>]*href=["']([^"']+)/i) || [])[1];
  if (r.status === 200 && c !== u) why.push("canonical " + c);
  if (why.length) (bad[f] = bad[f] || []).push(u.replace(/^https?:\/\/[^/]+/, "") + " -> " + why.join(", "));
  await new Promise(r => setTimeout(r, 200));
}
const total = Object.values(bad).reduce((s, a) => s + a.length, 0);
for (const [f, a] of Object.entries(bad)) console.log(`FAIL ${f}: ${a.length}\n  ` + a.slice(0, 5).join("\n  "));
console.log(`${total ? "FAIL" : "PASS"}  sitemapHonestyCheck: ${n} URLs checked, ${total} not 200, indexable and self-canonical`);
process.exit(total ? 1 : 0);
