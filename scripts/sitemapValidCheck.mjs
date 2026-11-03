// sitemapValidCheck (Lane E, Nov 3 2026, lane-e-sitemapread). Search Console fetched https://goasksam.com/sitemap.xml and said "Sitemap could not be
// read", type Unknown, 0 pages. CAUSE: the root index listed /sitemap-vins.xml, which is itself a sitemap index, and the protocol does not let an index
// name another index (Google reads none of it). Two empty placeholder files were also listed (sitemap-specs, sitemap-hubs), one with a comment inside it
// and a content type without a charset. CLASS: any sitemap response that is not (a) Content-Type application/xml; charset=utf-8, (b) starting with the XML
// declaration as its very first bytes (no BOM, no comment, no whitespace), (c) well formed and valid against the sitemaps.org schema, (d) a urlset or an
// index of urlsets only (no index inside an index), (e) holding only absolute https://goasksam.com locations, each once, (f) under 50,000 entries and 50 MB
// uncompressed, (g) listed in the index only when it has URLs. Applied to EVERY sitemap the site serves, each rendered by its own handler.
//
//   node scripts/sitemapValidCheck.mjs          offline: every handler rendered in process over a fixture archive (3 VIN files, hubs, motorcycles, other)
//   node scripts/sitemapValidCheck.mjs --live   ALSO reads goasksam.com (the Vercel automation bypass from $VERCEL_AUTOMATION_BYPASS_SECRET or the Keychain)
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { spawnSync, execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const LIVE = process.argv.includes("--live");
const SITE = "https://goasksam.com";
const CT = "application/xml; charset=utf-8";
const DECL = '<?xml version="1.0" encoding="UTF-8"?>';
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const HAVE_XMLLINT = spawnSync("xmllint", ["--version"]).status !== null && spawnSync("xmllint", ["--version"]).error === undefined;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "smvalid-"));
const xmllint = (args, buf) => { const f = path.join(tmp, "f" + Math.random().toString(36).slice(2) + ".xml"); fs.writeFileSync(f, buf); const r = spawnSync("xmllint", ["--noout", "--nonet", ...args, f], { encoding: "utf8" }); return { ok: r.status === 0, msg: (r.stderr || "").split("\n").filter(Boolean).slice(0, 2).join(" ") }; };

// ---- the rules, applied to one response. kind: "index" (a sitemapindex) or "urlset"; listed: the file is named in the index.
export function problems(name, { status, contentType, body, listed }) {
  const out = [];
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(String(body), "utf8");
  const text = buf.toString("utf8");
  if (status !== 200) out.push(`status ${status}, not 200`);
  if (contentType !== CT) out.push(`Content-Type is "${contentType}", not "${CT}"`);
  if (!text.startsWith(DECL)) out.push(`does not start with ${DECL} as its first bytes (starts ${JSON.stringify(text.slice(0, 30))})`);
  const root = /^<\?xml[^>]*\?>\s*(?:<!--[\s\S]*?-->\s*)*<(urlset|sitemapindex)\b[^>]*xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9"/.exec(text);
  if (!root) { out.push("no urlset or sitemapindex root in the sitemaps.org 0.9 namespace"); return out; }
  if (/<!--/.test(text.slice(0, text.indexOf("<" + root[1])))) out.push("a comment sits before the root element");
  const kind = root[1] === "sitemapindex" ? "index" : "urlset";
  if (HAVE_XMLLINT) {
    const w = xmllint([], buf); if (!w.ok) out.push("not well formed: " + w.msg);
    else { const v = xmllint(["--schema", path.join(ROOT, "scripts/fixtures", kind === "index" ? "siteindex.xsd" : "sitemap.xsd")], buf); if (!v.ok) out.push("fails the sitemaps.org schema: " + v.msg); }
  }
  const locs = [...text.matchAll(/<loc>([^<]*)<\/loc>/g)].map(m => m[1].replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'"));
  const bad = locs.filter(l => !/^https:\/\/goasksam\.com\/\S*$/.test(l));
  if (bad.length) out.push(`${bad.length} location(s) are not absolute https://goasksam.com URLs, first: ${bad[0]}`);
  if (new Set(locs).size !== locs.length) out.push("a location is listed twice");
  if (locs.length > 50000) out.push(`${locs.length} entries, over 50,000`);
  if (buf.length > 50 * 1024 * 1024) out.push(`${buf.length} bytes, over 50 MB uncompressed`);
  if (kind === "index") {
    const nested = locs.filter(l => /\/sitemap-vins\.xml$/.test(l) || /\/sitemap(-index)?\.xml$/.test(l));
    if (nested.length) out.push("an index lists another index: " + nested.join(", "));
    if (/<url>/.test(text)) out.push("an index holds <url> entries");
  } else if (/<sitemap>/.test(text)) out.push("a urlset holds <sitemap> entries");
  if (listed && locs.length === 0) out.push("it is listed in the index but holds no URLs");
  const lm = [...text.matchAll(/<lastmod>([^<]*)<\/lastmod>/g)].map(m => m[1]);
  const badLm = lm.filter(d => !/^\d{4}-\d{2}-\d{2}(T[\d:.]+(Z|[+-]\d{2}:\d{2}))?$/.test(d));
  if (badLm.length) out.push(`lastmod not a W3C date: ${badLm[0]}`);
  return out;
}
export const reportOf = (name, input) => { const p = problems(name, input); ok(p.length === 0, `${name}: ${p.join("; ")}`); return p; };

// ---- offline: each sitemap rendered by its own handler
process.env.LAUNCH_STAGE = "2"; process.env.SELL_NEXT_ON = "1";
process.env.SUPABASE_URL = "https://fixture.supabase.invalid"; process.env.SUPABASE_SERVICE_ROLE_KEY = "fixture"; process.env.SUPABASE_ANON_KEY = "fixture";
const mkVin = (i, d) => ({ kind: "car", vin: "V" + String(i).padStart(7, "0"), loc: `${SITE}/history/2000-fixture-car/V${String(i).padStart(7, "0")}`, lastmod: d, photos: ["https://img.invalid/a.jpg"] });
const FIX = { counts: {}, hubs: ["fixture-car", "fixture-other-car"], hubPhotos: {}, hubLast: { "fixture-car": "2026-10-30" }, vins: Array.from({ length: 2300 }, (_, i) => mkVin(i, i % 2 ? "2026-11-01" : "2026-10-20")),
  motos: [{ kind: "motorcycle", vin: "M1", loc: `${SITE}/history/1970-fixture-bike/M1`, lastmod: "2026-09-01", photos: [] }], others: [{ kind: "other", vin: "O1", loc: `${SITE}/history/1970-fixture-tractor/O1`, lastmod: "2026-09-02", photos: [] }], fallback: [], merged: [] };
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, opts) => {
  const u = String(url);
  const j = body => ({ ok: true, status: 200, headers: new Map(), json: async () => body, text: async () => JSON.stringify(body) });
  if (/vin_rollout_cache/.test(u)) return j([{ data: FIX, computed_at: "2026-11-03T00:00:00Z" }]);
  if (/app_config\?key=eq\.history_photo_dead/.test(u)) return j([{ value: { vins: [], hubs: [] } }]);
  return j([]);
};
async function render(mod, url) {
  const m = await import("../" + mod);
  const res = { h: {}, code: 200, body: "", setHeader(k, v) { this.h[k.toLowerCase()] = v; return this; }, getHeader(k) { return this.h[k.toLowerCase()]; }, status(c) { this.code = c; return this; }, send(b) { this.body = String(b); return this; }, json(b) { this.body = JSON.stringify(b); return this; }, end(b) { if (b) this.body = String(b); return this; } };
  const u = new URL(SITE + url);
  const req = { url, method: "GET", query: Object.fromEntries(u.searchParams), headers: { "user-agent": "Googlebot", host: "goasksam.com" } };
  await Promise.race([m.default(req, res), new Promise((_, r) => setTimeout(() => r(new Error("timed out")), 20000))]);
  return { status: res.code, contentType: res.h["content-type"], body: res.body };
}
const vj = JSON.parse(fs.readFileSync(path.join(ROOT, "vercel.json"), "utf8"));
// what each public sitemap address is served by: the rewrite in vercel.json, or a static file in public/
const rw = p => (vj.rewrites || []).find(r => new RegExp("^" + r.source + "$").test(p));
const servedBy = p => { const r = rw(p); if (r) return { dest: r.destination.replace(/\$1/, (new RegExp("^" + r.source + "$").exec(p) || [])[1] || "") }; if (fs.existsSync(path.join(ROOT, "public", p))) return { file: path.join(ROOT, "public", p) }; return null; };
async function fetchLocal(p) {
  const s = servedBy(p); if (!s) return null;
  if (s.file) return { status: 200, contentType: p.endsWith(".xml") ? "application/xml" : "text/plain", body: fs.readFileSync(s.file), static: true };
  const stat = path.join(ROOT, "public", s.dest.split("?")[0]);
  if (!s.dest.startsWith("/api/") && fs.existsSync(stat)) return { status: 200, contentType: "application/xml", body: fs.readFileSync(stat), static: true };
  const d = s.dest.split("?"); const mod = d[0].replace(/^\//, "") + ".js";
  return render(mod, d[0] + (d[1] ? "?" + d[1] : ""));
}
const rootRes = await fetchLocal("/sitemap.xml");
ok(!!rootRes, "/sitemap.xml is served (a rewrite or a file)");
const rootInfo = rootRes ? { ...rootRes, listed: false } : null;
if (rootRes) reportOf("/sitemap.xml", rootInfo);
ok(!fs.existsSync(path.join(ROOT, "public/sitemap.xml")) && !fs.existsSync(path.join(ROOT, "public/sitemap-index.xml")), "no static sitemap index shadows the generated one");
const robots = fs.readFileSync(path.join(ROOT, "public/robots.txt"), "utf8");
const named = (/^Sitemap:\s*(\S+)/m.exec(robots) || [])[1] || "";
const namedRes = named.startsWith(SITE) ? await fetchLocal(new URL(named).pathname) : null;
ok(!!namedRes && rootRes && namedRes.body === rootRes.body, `robots.txt names a sitemap that serves the same index as /sitemap.xml (${named})`);
const kids = rootRes ? [...rootRes.body.toString().matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => new URL(m[1]).pathname) : [];
ok(kids.length >= 4, `the index lists its files (${kids.length})`);
ok(kids.some(k => /sitemap-vins-1\.xml$/.test(k)) && kids.some(k => /sitemap-vins-3\.xml$/.test(k)), "the index lists every VIN page file (the fixture has 3)");
let total = 0;
for (const k of kids) {
  const r = await fetchLocal(k); ok(!!r, `${k}: served`); if (!r) continue;
  const p = reportOf(k, { ...r, listed: true });
  const n = (r.body.toString().match(/<loc>/g) || []).length; total += n;
}
// the files that are served but not listed (empty placeholders) must still be valid
for (const k of ["/sitemap-specs.xml"]) { const r = await fetchLocal(k); if (r) reportOf(k + " (served, not listed)", { ...r, listed: false }); ok(!kids.includes(k) || (r && /<loc>/.test(r.body.toString())), `${k} is listed only when it holds URLs`); }
// every sitemap file in public/ and every sitemap rewrite is covered above or by the list: none may be a comment-first or placeholder file
for (const f of fs.readdirSync(path.join(ROOT, "public")).filter(n => /^sitemap.*\.xml$/.test(n))) ok(false, `public/${f} is a static sitemap (the declaration, content type and listing rules cannot be held on a static file)`);
// the check itself must catch each defect: a fixture of every way a sitemap goes wrong
{
  const good = `${DECL}<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${SITE}/a</loc><lastmod>2026-11-01</lastmod></url></urlset>`;
  const bads = [
    ["comment before the root", `${DECL}\n<!-- hi -->\n` + good.slice(DECL.length)],
    ["no declaration", good.slice(DECL.length)],
    ["leading whitespace", "\n" + good],
    ["wrong content type", good, { contentType: "application/xml" }],
    ["relative loc", good.replace(`${SITE}/a`, "/a")],
    ["http loc", good.replace(`${SITE}/a`, "http://goasksam.com/a")],
    ["other host", good.replace(`${SITE}/a`, "https://example.com/a")],
    ["index inside an index", `${DECL}<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><sitemap><loc>${SITE}/sitemap-vins.xml</loc></sitemap></sitemapindex>`],
    ["listed but empty", `${DECL}<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>`, { listed: true }],
    ["not well formed", good.replace("</url>", "")],
    ["bad lastmod", good.replace("2026-11-01", "Nov 1")]
  ];
  for (const [n, body, extra] of bads) ok(problems(n, { status: 200, contentType: CT, body, listed: false, ...(extra || {}) }).length > 0, `the check catches: ${n}`);
  ok(problems("good", { status: 200, contentType: CT, body: good }).length === 0, "the check passes a good sitemap");
}
console.log(`  offline: ${kids.length} files listed, ${total} URLs in the fixture`);

// ---- live
if (LIVE) {
  globalThis.fetch = realFetch;
  let byp = process.env.VERCEL_AUTOMATION_BYPASS_SECRET || "";
  if (!byp) { try { byp = execSync("security find-generic-password -s goasksam-bypass -w", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch { /* none */ } }
  const get = async p => { const r = await fetch(SITE + p, { headers: { "user-agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)", "x-vercel-protection-bypass": byp, "accept-encoding": "gzip, br" } }); const raw = Buffer.from(await r.arrayBuffer()); return { status: r.status, contentType: r.headers.get("content-type"), encoding: r.headers.get("content-encoding"), body: raw }; };
  // node's fetch already decodes gzip and br, so body is the decoded XML
  const live = {}; const idx = await get("/sitemap.xml"); live["/sitemap.xml"] = idx; reportOf("live /sitemap.xml", { ...idx, listed: false });
  const lk = [...idx.body.toString().matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => new URL(m[1]).pathname);
  ok(lk.length >= 4, `live: the index lists its files (${lk.length})`);
  let liveTotal = 0;
  for (const k of lk) { const r = await get(k); reportOf("live " + k, { ...r, listed: true }); liveTotal += (r.body.toString().match(/<loc>/g) || []).length; }
  const specs = await get("/sitemap-specs.xml"); reportOf("live /sitemap-specs.xml (served, not listed)", { ...specs, listed: false });
  ok(!lk.includes("/sitemap-specs.xml") && !lk.includes("/sitemap-hubs.xml"), "live: the empty placeholders are not listed");
  console.log(`  live: ${lk.length} files listed, ${liveTotal} URLs`);
}
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`sitemapValidCheck${LIVE ? " (live)" : ""}: ${pass} pass, ${fail} FAIL${HAVE_XMLLINT ? "" : " (xmllint not found: schema and well-formedness not run)"}`); process.exit(fail ? 1 : 0);
