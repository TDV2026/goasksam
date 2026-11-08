// ONE GATE FOR "IS THIS HUB LIVE" (Lane B, Nov 8 2026; Lane F's sitemap audit: about 900 of the 4,545 hub URLs in the sitemap answered 404 or noindex because the file was built from the nightly cached list with a COPY of the page's rule).
// RULE: the hub page and the sitemap's hub file both ask hubGate (api/history.js), so a hub is listed only when its page answers 200 and indexable; the VIN files list only VINs a verified hub links (sitemapView). CLASS: every hub, not one: for a spread of hub shapes the
// page's real response (status, robots) must equal the gate's verdict and the file's membership, in both directions; and the file is built from the gate's output, never from the pre-gate list.
//   node scripts/hubOneGateCheck.mjs [root]      --mutants proves each rule by breaking it in a copy
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
if (process.argv.includes("--mutants")) {
  const { spawnSync } = await import("node:child_process"), fsm = await import("node:fs"), osm = await import("node:os");
  const R = path.resolve(process.argv.find((x, i) => i > 1 && !x.startsWith("--")) || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
  const muts = [
    ["api/history.js", "if (g.status === 200 && g.index) { verified.push(k);", "if (g.status === 200) { verified.push(k);", "the file lists a hub that is 200 but noindex"],
    ["api/history.js", "  const hubIndex = gate.index;   // decided by hubGate, above", "  const hubIndex = true;", "the page decides indexable by itself again"],
    ["api/history.js", "  okHubs = gated.verified;", "  okHubs = okHubs;", "the file keeps the pre-gate list"],
    ["api/history.js", "else if (!list.some(g => g.apps.some(a => a.image))) reason = \"no_photo\";", "", "the gate forgets that a hub with no photo is noindex"],
    ["api/history.js", "return { ...r, vins: r.vins.filter(u => linked.has(u.vin)), motos: [], others: [], uncapped: full };", "return { ...r, uncapped: full };", "the VIN files are not capped to linked VINs"],
    ["api/history.js", "if (!list.length) return { status: 404, index: false, reason: \"no_rows\", hub, list };", "if (!list.length) return { status: 200, index: true, reason: null, hub, list, id: {}, salesN: 0 };", "an empty hub is listed"]
  ];
  let survivors = 0;
  for (const [file, from, to, want] of muts) {
    const dir = fsm.mkdtempSync(path.join(osm.tmpdir(), "hubgate-"));
    spawnSync("rsync", ["-a", "--exclude", ".git", "--exclude", "node_modules", "--exclude", "proofs", R + "/", dir + "/"]);
    fsm.symlinkSync(path.join(R, "node_modules"), path.join(dir, "node_modules"));
    const fp = path.join(dir, file), src = fsm.readFileSync(fp, "utf8"), m = src.replace(from, to);
    if (m === src) { console.log(`MUTANT NOT APPLIED  ${want}`); survivors++; fsm.rmSync(dir, { recursive: true, force: true }); continue; }
    fsm.writeFileSync(fp, m);
    const r = spawnSync(process.execPath, [path.join(dir, "scripts/hubOneGateCheck.mjs"), dir], { encoding: "utf8", timeout: 120000 });
    const killed = r.status !== 0 && /^FAIL/m.test((r.stdout || "") + (r.stderr || ""));
    console.log(`${killed ? "killed  " : "SURVIVED"}  ${want}`); if (!killed) survivors++;
    fsm.rmSync(dir, { recursive: true, force: true });
  }
  console.log(survivors ? `\n${survivors} mutant(s) survived` : "\nall mutants killed"); process.exit(survivors ? 1 : 0);
}
const ROOT = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
process.env.LAUNCH_STAGE = "2"; process.env.SUPABASE_URL = "https://fake.supabase.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "k";
const fs = await import("node:fs");
let failed = 0; const ok = (n, c, d) => { if (!c) failed++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`); };
// the archive: hubs of every shape the audit found
const day = i => new Date(Date.now() - i * 864e5).toISOString().slice(0, 10);
const row = (n, year, title, img) => ({ vin_norm: "VIN" + String(n).padStart(10, "0"), year, sale_date: day(10 + n), sale_price: 50000 + n * 100, sale_price_usd: 50000 + n * 100, platform: "bringatrailer", listing_title: title, mileage: 30000, img: img ? "https://img.test/" + n + ".jpg" : null, url: "https://bat.test/" + n, url2: null, currency: "USD" });
const ARCH = [];
for (let i = 1; i <= 12; i++) ARCH.push(row(i, 2003 + (i % 3), `${2003 + (i % 3)} Porsche 911 Carrera`, true));
for (let i = 1; i <= 6; i++) ARCH.push(row(100 + i, 1949, `1949 MG Midget TC Roadster`, false));   // rows, no photo anywhere: noindex
for (let i = 1; i <= 3; i++) ARCH.push(row(200 + i, 1967, `1967 Porsche 912 Coupe`, true));
const likeRe = pat => new RegExp(decodeURIComponent(pat).replace(/^ilike\./, "").replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*"), "i");
globalThis.fetch = async (url, opt) => {
  const u = new URL(String(url)), p = u.pathname;
  if (p.endsWith("/sales_archive")) {
    const t = u.searchParams.get("listing_title"), y = u.searchParams.get("year");
    const keep = ARCH.filter(r => (!t || likeRe(t).test(r.listing_title)) && (!y || r.year === Number(y.replace("eq.", ""))));
    if ((u.searchParams.get("select") || "").includes("img:")) return new Response(JSON.stringify(keep), { status: 200 });
    return new Response(JSON.stringify([]), { status: 200 });
  }
  if (p.endsWith("/vin_rollout_cache")) return new Response(JSON.stringify(globalThis.__ROLL ? [{ data: globalThis.__ROLL, computed_at: new Date().toISOString() }] : []), { status: 200 });
  return new Response("[]", { status: 200 });
};
const H = await import(pathToFileURL(path.join(ROOT, "api/history.js")).href);
const mkRes = () => { const r = { code: 200, headers: {}, body: "" }; r.setHeader = (k, v) => { r.headers[k.toLowerCase()] = v; return r; }; r.status = c => { r.code = c; return r; }; r.send = b => { r.body = String(b == null ? "" : b); return r; }; r.end = b => { r.body = String(b || ""); return r; }; r.json = o => { r.body = JSON.stringify(o); return r; }; return r; };
const getPage = async slug => { const res = mkRes(); await H.default({ method: "GET", query: { slug }, headers: { "user-agent": "Googlebot", "x-forwarded-for": "203.0.113.9" }, url: "/history/" + slug }, res); return res; };
const indexable = r => r.code === 200 && !/noindex/i.test(r.headers["x-robots-tag"] || "") && !/<meta[^>]+name="robots"[^>]*noindex/i.test(r.body);
const SLUGS = ["porsche-911", "ford-grand-torino", "mg-midget-tc-roadster", "1967-porsche-912", "ford-shelby-gt500", "volkswagen-mk6-gti"];
if (typeof H.hubGate !== "function" || typeof H.gateHubs !== "function" || typeof H.sitemapView !== "function") ok("api/history.js exports hubGate, gateHubs and sitemapView", false);
else {
  // 1. the page and the gate say the same thing, for every shape
  const verdicts = {};
  for (const s of SLUGS) {
    const pg = await getPage(s), g = await H.hubGate({ supabaseUrl: "https://fake.supabase.test", supabaseKey: "k" }, s);
    verdicts[s] = { page: pg.code, pageIndexable: indexable(pg), gate: g.status, gateIndex: !!g.index, reason: g.reason };
    ok(`${s}: the page answers ${pg.code}${indexable(pg) ? " indexable" : ""}; the gate says ${g.status}${g.index ? " indexable" : ""} (${g.reason || "listed"})`, pg.code === g.status && indexable(pg) === (g.status === 200 && !!g.index));
  }
  ok("the fixture covers every shape: one indexable hub, a 404, a no-photo noindex, a year hub, an alias 301", verdicts["porsche-911"].gateIndex && verdicts["ford-grand-torino"].gate === 404 && verdicts["mg-midget-tc-roadster"].gate === 200 && !verdicts["mg-midget-tc-roadster"].gateIndex && verdicts["1967-porsche-912"].reason === "year_hub" && verdicts["ford-shelby-gt500"].gate === 301);
  // 2. the file is built from the gate (the very loop the nightly rollout runs)
  const env = { supabaseUrl: "https://fake.supabase.test", supabaseKey: "k" };
  const G = await H.gateHubs(env, SLUGS, () => 1, 30000);
  ok("the hub file lists exactly the hubs whose page is 200 and indexable", JSON.stringify(G.verified) === JSON.stringify(SLUGS.filter(s => verdicts[s].page === 200 && verdicts[s].pageIndexable)) && G.verified.length === 1, JSON.stringify(G.verified));
  ok("every refused hub is counted by why (404, noindex with its reason, alias)", G.counts.no_rows === 2 && G.counts.noindex === 2 && G.counts.alias === 1 && G.counts.unreached === 0 && G.reasons.no_photo === 1 && G.reasons.year_hub === 1, JSON.stringify({ c: G.counts, r: G.reasons }));
  ok("the VINs linked are the listed hub's own rows (no VIN of a refused hub)", G.linked.size === 12 && [...G.linked].every(v => ARCH.slice(0, 12).some(r => r.vin_norm === v)), String(G.linked.size));
  const none = await H.gateHubs(env, SLUGS, () => 1, 0);
  ok("a budget of 0 lists nothing (an unasked hub is never listed)", none.verified.length === 0 && none.counts.unreached === SLUGS.length);
  // 3. the VIN files are capped to linked VINs; motorcycles and other wait
  const r0 = { vins: [{ vin: "A" }, { vin: "B" }, { vin: "C" }], motos: [{ vin: "M" }], others: [{ vin: "O" }], hubs: ["porsche-911"], hubsVerified: true, linkedVins: ["A", "C"] };
  const v = H.sitemapView(r0);
  ok("the VIN files list only VINs a verified hub links; motorcycles and other list none yet", v.vins.map(x => x.vin).join() === "A,C" && v.motos.length === 0 && v.others.length === 0 && v.uncapped.vins === 3);
  ok("a cache row from before the gate (no linkedVins) is served as it was", H.sitemapView({ ...r0, linkedVins: undefined }).vins.length === 3);
  process.env.SITEMAP_LINKED_ONLY = "0"; ok("SITEMAP_LINKED_ONLY=0 lists everything again", H.sitemapView(r0).vins.length === 3); delete process.env.SITEMAP_LINKED_ONLY;
  // 4. the sitemap endpoints, end to end, on a cache row
  globalThis.__ROLL = { ...r0, counts: {}, fallback: [], merged: [], hubLast: {}, hubPhotos: {}, vins: [{ vin: "A", loc: "/x/A", lastmod: "2026-11-01" }, { vin: "B", loc: "/x/B" }, { vin: "C", loc: "/x/C" }] };
  const hubsXml = mkRes(); await H.default({ method: "GET", query: { sitemap: "hubs" }, headers: { "x-forwarded-for": "203.0.113.9" } }, hubsXml);
  ok("sitemap-vins-hubs.xml lists the verified hub and says the file was built by the gate", /history\/porsche-911</.test(hubsXml.body) && hubsXml.headers["x-sitemap-gate"] === "verified", hubsXml.headers["x-sitemap-gate"]);
  const mo = mkRes(); await H.default({ method: "GET", query: { sitemap: "motorcycles" }, headers: { "x-forwarded-for": "203.0.113.9" } }, mo);
  ok("sitemap-motorcycles.xml lists nothing yet", !/<loc>/.test(mo.body));
}
// 5. the build uses the gate's output, the page uses the gate
{
  const src = fs.readFileSync(path.join(ROOT, "api/history.js"), "utf8");
  ok("rollout() writes the gate's verified hubs, not the pre-gate list", /okHubs = gated\.verified;/.test(src) && /ROLL = \{ counts, hubs: okHubs\.sort\(\), hubsVerified: true, linkedVins:/.test(src));
  ok("the hub page asks hubGate and takes its index verdict", /await hubGate\(env, slug, \{ timing: hubVinsTiming \}\)/.test(src) && /const hubIndex = gate\.index;/.test(src));
  ok("the nightly job gives the gate its own budget", /hubGateBudgetMs: HUB_GATE_BUDGET_MS/.test(fs.readFileSync(path.join(ROOT, "scripts/buildVinRolloutCache.js"), "utf8")));
}
console.log(failed ? `\nhubOneGateCheck: ${failed} FAIL` : "\nhubOneGateCheck: PASS"); process.exit(failed ? 1 : 0);
