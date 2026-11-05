// clock: real-ok the crew cookie's own expiry is built from the real now (lib/_crew.js); every other time in this check is the fixed NOW below
// FEATURED HISTORY, CREW ONLY, NOT LIVE (Lane B, Nov 2026). The Homepage feature's one object (lib/live/featuredHistory.js) must (1) be built only from a car that passes EVERY eligibility rule, (2) stay put while its auction is live, replace itself
// when the auction ends, return null when a refresh fails and never serve a stale pick, and (3) be reachable ONLY through the crew gate: no public route, page, feed, sitemap or cache key may return it.
// CLASS: each rule below has a fixture that breaks only that rule and must be rejected with that rule's reason; the gate has a runtime proof (no cookie = null / 404) and a static scan of every file that can answer a visitor.
// Offline: a fake database and a fake history read. `node scripts/featuredHistoryCheck.mjs [repo root]`; `--mutants` copies the repo, breaks ONE rule at a time and proves the named assertion fails without it.
import fs from "node:fs"; import path from "node:path"; import os from "node:os"; import { spawnSync } from "node:child_process"; import { fileURLToPath, pathToFileURL } from "node:url";
const args = process.argv.slice(2), MUT = args.includes("--mutants"), here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(args.find(a => !a.startsWith("--")) || path.join(here, ".."));
if (MUT) { const r = runMutants(); process.exit(r); }
process.chdir(root);
process.env.CURTAIN_CREW_CODE = "featured-check-secret"; process.env.SUPABASE_URL = "https://fake.supabase.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "k";
let pass = 0, fail = 0; const ok = (name, c, d) => { if (c) pass++; else { fail++; console.log("FAIL " + name + (d ? "  " + d : "")); } };
const F = await import(pathToFileURL(path.join(root, "lib/live/featuredHistory.js")).href);
const { mintCrewCookieValue } = await import(pathToFileURL(path.join(root, "lib/_crew.js")).href);
const NOW = Date.parse("2026-11-05T12:00:00Z"), HOUR = 3600000, DAY = 24 * HOUR;
const VIN = "WP0AB29988S783456";
const live = (o = {}) => ({ id: "L1", source: "bringatrailer", url: "https://bringatrailer.com/listing/2008-porsche-911-1/", listing_title: "2008 Porsche 911 Carrera", year: 2008, make: "Porsche", model: "911", vin_norm: VIN, mileage: 34000, mileage_unit: "miles", end_time: new Date(NOW + 2 * DAY).toISOString(), photo_url: "https://img.example.com/cur-1.jpg", status: "live", ...o });
const sale = (o = {}) => ({ kind: "sale", date: "2022-05-14", house: "Bring a Trailer", url: "https://bringatrailer.com/listing/2008-porsche-911-0/", mileage: 30000, priceUsd: 61000, image: "https://img.example.com/prev-0.jpg", year: 2008, make: "Porsche", model: "911", vinNorm: VIN, ...o });
const attempt = (o = {}) => ({ kind: "attempt", date: "2021-03-02", house: "Cars & Bids", url: "https://carsandbids.com/auctions/abc/", mileage: 29000, bidUsd: 52000, status: "not_sold", image: "https://img.example.com/prev-a.jpg", year: 2008, make: "Porsche", model: "911", vinNorm: VIN, ...o });
const ev = (l, apps, extra = {}) => F.evaluateCandidate(l, apps, { nowMs: NOW, ...extra });
const why = (l, apps, extra) => { const r = ev(l, apps, extra); return r.ok ? "OK" : r.reason; };

// (1) the baseline is eligible and has the agreed shape
{ const r = ev(live(), [sale()]);
  ok("(1) a live car with a VIN, a photo, and a complete verified earlier sale is eligible", r.ok, JSON.stringify(r));
  const f = r.featured || {};
  ok("(1) the agreed shape: kind, headline, current, previous, take, selectedAt, checkedAt, findUrl, and no other key", JSON.stringify(Object.keys(f).sort()) === JSON.stringify(["checkedAt", "current", "findUrl", "headline", "kind", "mileageDelta", "previous", "selectedAt", "take"]), Object.keys(f).join(","));
  ok("(1) current is title, platform, url, photo, live true, endsAt, mileage", JSON.stringify(Object.keys(f.current || {}).sort()) === JSON.stringify(["endsAt", "live", "mileage", "photo", "platform", "title", "url"]) && f.current.live === true && f.current.title === "2008 Porsche 911");
  ok("(1) previous is date (month and year), platform, mileage, price, photo, url", JSON.stringify(Object.keys(f.previous || {}).sort()) === JSON.stringify(["date", "mileage", "photo", "platform", "price", "url"]) && f.previous.date === "May 2022" && f.previous.price === 61000);
  ok("(1) the headline for a sold car is the agreed sentence", f.headline === "This car has sold before. Would you have known?" && f.kind === "sold");
  ok("(1) the take is the existing priorTake line, with the reliable mileage difference", f.take === "Back after selling in May 2022, now with 4,000 more miles." && f.mileageDelta === 4000, f.take);
  ok("(1) no dash in any printed word", !/[\u2013\u2014]/.test(JSON.stringify(f)));
  ok("(1) no valuation, condition or speculation word in the headline or take", !/worth|value|valuation|estimate|undervalued|bargain|mint|pristine|rare|likely|probably|maybe/i.test(f.headline + " " + f.take)); }

// (2) every eligibility rule rejects, by its own reason
{ const R = (name, l, apps, reason, extra) => ok(`(2) ${name} is rejected (${reason})`, why(l, apps, extra) === reason, why(l, apps, extra));
  R("a VIN that does not match the earlier record", live(), [sale({ vinNorm: "WP0AB29988S700000" })], "vin_mismatch");
  R("an earlier record that names no VIN, matched only by year and model", live(), [sale({ vinNorm: undefined })], "vin_mismatch");
  R("a live listing with no VIN (year, model and colour alone never match)", live({ vin_norm: null }), [sale({ vinNorm: undefined, color: "Black" })], "no_vin");
  R("an earlier record of a different year under the same VIN text", live(), [sale({ year: 2007 })], "vin_mismatch");
  R("a short chassis number that agrees on nothing else", live({ vin_norm: "123456", model: "911" }), [sale({ vinNorm: "123456", model: "912" })], "vin_mismatch");
  R("an earlier record with no photo", live(), [sale({ image: null })], "no_earlier_photo");
  R("an earlier photo that is a placeholder", live(), [sale({ image: "https://img.example.com/placeholder.jpg" })], "no_earlier_photo");
  R("an earlier photo that answers 404", live(), [sale()], "no_earlier_photo", { urlStatus: { "https://img.example.com/prev-0.jpg": 404 } });
  R("an earlier record with no evidence link", live(), [sale({ url: null })], "no_evidence_link");
  R("an earlier evidence link that answers 404", live(), [sale()], "no_evidence_link", { urlStatus: { "https://bringatrailer.com/listing/2008-porsche-911-0/": 404 } });
  R("an earlier record that is the live listing itself", live(), [sale({ url: "https://bringatrailer.com/listing/2008-porsche-911-1/" })], "no_earlier");
  R("an earlier record dated today or later", live(), [sale({ date: "2026-11-05" })], "no_earlier");
  R("no earlier record at all", live(), [], "no_earlier");
  R("an auction that has ended (end time past)", live({ end_time: new Date(NOW - HOUR).toISOString() }), [sale()], "not_live");
  R("an auction marked ended_sold with a future end time", live({ status: "ended_sold" }), [sale()], "not_live");
  R("an auction with no end time", live({ end_time: null }), [sale()], "not_live");
  R("a live listing with no photo", live({ photo_url: null }), [sale()], "no_current_photo");
  R("a live listing whose photo is a logo", live({ photo_url: "https://img.example.com/logo.png" }), [sale()], "no_current_photo");
  R("a sold record with no mileage", live(), [sale({ mileage: null })], "incomplete");
  R("a sold record with no platform", live(), [sale({ house: "" })], "incomplete");
  R("a 'sale' with no price (a sale never invents a price)", live(), [sale({ priceUsd: null })], "incomplete");
  R("an earlier record with no date", live(), [sale({ date: null })], "no_earlier"); }

// (3) listed is never sold; an asking price or a high bid is never a sale price
{ const l = ev(live(), [attempt()]);
  ok("(3) an earlier unsold auction is a LISTED car with the listed headline", l.ok && l.featured.kind === "listed" && l.featured.headline === "This car has been listed before. Would you have known?", JSON.stringify(l));
  ok("(3) a listed car carries no price at all (the rejected high bid is not printed as one)", l.ok && !("price" in l.featured.previous) && !/sold|selling|sale/i.test(l.featured.take), JSON.stringify(l.featured && l.featured.previous));
  const wd = ev(live(), [attempt({ status: "withdrawn", bidUsd: null })]);
  ok("(3) a withdrawn listing is listed, never sold", wd.ok && wd.featured.kind === "listed");
  const priced = ev(live(), [attempt({ priceUsd: 49000 })]);
  ok("(3) an attempt that carries a price field is still not a sale and prints no price", priced.ok && priced.featured.kind === "listed" && !("price" in priced.featured.previous));
  const both = ev(live(), [sale({ image: null }), attempt()]);
  ok("(3) when the sale cannot be shown (no photo), the car is listed and its take does not say it sold", both.ok && both.featured.kind === "listed" && !/selling|sold/i.test(both.featured.take), JSON.stringify(both.featured && [both.featured.kind, both.featured.take]));
  const pick = F.chooseBest([ev(live({ id: "A" }), [attempt()]), ev(live({ id: "B" }), [sale()])].filter(x => x.ok));
  ok("(3) a confirmed sale is preferred over a listing", pick && pick.listingId === "B"); }

// (4) mileage difference only when both readings are reliable
{ ok("(4) kilometres on the live listing: no difference, and the take does not say more miles", (() => { const r = ev(live({ mileage_unit: "km" }), [sale()]); return r.ok && !("mileageDelta" in r.featured) && !/more miles/.test(r.featured.take); })());
  ok("(4) fewer miles now than at the earlier record: no difference", (() => { const r = ev(live({ mileage: 20000 }), [sale()]); return r.ok && !("mileageDelta" in r.featured) && !/more miles/.test(r.featured.take); })());
  ok("(4) no current mileage: no difference", (() => { const r = ev(live({ mileage: null }), [sale()]); return r.ok && !("mileageDelta" in r.featured); })()); }

// (5) the choice: easy history first, never the biggest price gap
{ const a = ev(live({ id: "A", end_time: new Date(NOW + 1 * DAY).toISOString() }), [sale({ priceUsd: 900000 })]);
  const b = ev(live({ id: "B", end_time: new Date(NOW + 3 * DAY).toISOString() }), [sale({ priceUsd: 30000 }), sale({ date: "2019-01-01", url: "https://bringatrailer.com/listing/z/", image: "https://img.example.com/z.jpg" })]);
  const c = ev(live({ id: "C", end_time: new Date(NOW + 3 * DAY).toISOString() }), [sale({ priceUsd: 31000 })]);
  ok("(5) with two sold cars the one with the fewest earlier appearances wins, then the longest time left, whatever the price", F.chooseBest([a, b, c]).listingId === "C");
  ok("(5) the choice does not read the price", F.chooseBest([a, c]).listingId === "C" && F.chooseBest([c, a]).listingId === "C"); }

// (6) the store: stable, replaces itself at the end, null on a failed refresh, never stale
const fakeDb = () => {
  const db = { cfg: new Map(), live: [live({ id: "L1" }), live({ id: "L2", vin_norm: "WP0AB29988S783457", url: "https://bringatrailer.com/listing/b-1/", end_time: new Date(NOW + 5 * DAY).toISOString(), photo_url: "https://img.example.com/cur-2.jpg" })],
    apps: { [VIN]: [sale()], WP0AB29988S783457: [sale({ vinNorm: "WP0AB29988S783457", url: "https://bringatrailer.com/listing/b-0/", image: "https://img.example.com/prev-b.jpg" }), sale({ vinNorm: "WP0AB29988S783457", date: "2018-02-02", url: "https://bringatrailer.com/listing/b-00/", image: "https://img.example.com/prev-b2.jpg" })] },
    now: NOW, fail: false, selects: 0, calls: [] };
  const d = {
    now: () => db.now,
    select: async (env, q) => { db.selects++; db.calls.push(q); if (db.fail) return null;
      if (q.startsWith("app_config?")) { const k = /key=eq\.([^&]+)/.exec(q)[1]; return db.cfg.has(k) ? [{ value: db.cfg.get(k) }] : []; }
      if (q.startsWith("live_listings?id=eq.")) { const id = decodeURIComponent(/id=eq\.([^&]+)/.exec(q)[1]); const r = db.live.find(x => x.id === id); return r ? [r] : []; }
      if (q.startsWith("live_listings?status=eq.live")) return db.live.filter(r => r.status === "live" && Date.parse(r.end_time) > db.now);
      if (q.startsWith("vin_index?") || q.startsWith("sales_archive?")) { const want = decodeURIComponent(/in\.\((.*)\)&/.exec(q)[1]).replace(/"/g, "").split(","); return want.filter(v => db.apps[v]).map(v => ({ vin_norm: v })); }
      return []; },
    write: async (env, row) => { if (db.fail) throw new Error("write failed"); db.cfg.set(row.key, row.value); },
    clear: async env => { db.cfg.delete(F.STORE_KEY); },
    appearances: async (env, vin) => (db.apps[vin] ? { ok: true, vinNorm: vin, appearances: db.apps[vin] } : { ok: false, appearances: [] }),
    urlStatus: async () => 200 };
  return { db, d };
};
const env = { supabaseUrl: "https://fake.supabase.test", supabaseKey: "k" };
const CREW = "gas_crew=" + mintCrewCookieValue();
{ const { db, d } = fakeDb();
  const r1 = await F.refreshFeaturedHistory(env, d);
  ok("(6) the first refresh selects a car and stores it under the crew key", r1.why === "selected" && db.cfg.has("crew_featured_history") && F.STORE_KEY.startsWith("crew_"), JSON.stringify(r1.why));
  ok("(6) it picks the car with the fewest earlier appearances (L1 has one, L2 has two)", r1.stored && r1.stored.listingId === "L1");
  const ids = []; for (let i = 0; i < 6; i++) { db.now += 5 * 60000; await F.refreshFeaturedHistory(env, d); const got = await F.readFeaturedHistory(env, CREW, d); ids.push(got && got.current.url + "|" + got.selectedAt); }
  ok("(6) STABLE: six refreshes and six loads give the same car and the same selectedAt", ids.every(x => x && x === ids[0]), ids.join(" ; "));
  const g = await F.readFeaturedHistory(env, CREW, d);
  ok("(6) the load carries a newer checkedAt than selectedAt and a findUrl", g && g.checkedAt > g.selectedAt && /^\/buy\?q=/.test(g.findUrl));
  const sel0 = db.selects; await F.readFeaturedHistory(env, CREW, d);
  ok("(6) a load is two keyed reads (the store, the listing) and never the search", db.selects - sel0 === 2 && !db.calls.slice(sel0).some(q => /status=eq\.live|vin_index|sales_archive/.test(q)), String(db.selects - sel0));
  // the auction ends: not served, then replaced
  db.now = Date.parse(db.live[0].end_time) - 60000; await F.refreshFeaturedHistory(env, d);   // checked a minute before the end: fresh, so only the end can stop it
  ok("(6) (control) a minute before the end the pick is still served", (await F.readFeaturedHistory(env, CREW, d)) !== null);
  db.now = Date.parse(db.live[0].end_time) + 60000; db.live[0].status = "ended_sold";
  ok("(6) when the auction ends the pick is no longer served", (await F.readFeaturedHistory(env, CREW, d)) === null);
  const r2 = await F.refreshFeaturedHistory(env, d);
  ok("(6) the next refresh replaces it with the next verified car (L2)", r2.why === "selected" && r2.stored.listingId === "L2", JSON.stringify([r2.why, r2.stored && r2.stored.listingId]));
  const g2 = await F.readFeaturedHistory(env, CREW, d);
  ok("(6) and the load serves the new car", g2 && g2.current.url === "https://bringatrailer.com/listing/b-1/" && g2.kind === "sold");
  // a listing that becomes unavailable BEFORE its end time (withdrawn, pulled, ended early) is not served either
  { const u = fakeDb(); await F.refreshFeaturedHistory(env, u.d); u.db.live[0].status = "ended_unsold";
    ok("(6) a listing that becomes unavailable before its end time is not served", (await F.readFeaturedHistory(env, CREW, u.d)) === null); }
  // a kept pick that stops passing a rule is replaced
  db.live.push(live({ id: "L3", vin_norm: "WP0AB29988S783458", url: "https://bringatrailer.com/listing/c-1/", end_time: new Date(NOW + 9 * DAY).toISOString(), photo_url: "https://img.example.com/cur-3.jpg" }));
  db.apps["WP0AB29988S783458"] = [sale({ vinNorm: "WP0AB29988S783458", url: "https://bringatrailer.com/listing/c-0/", image: "https://img.example.com/prev-c.jpg" })];
  db.apps["WP0AB29988S783457"] = [sale({ vinNorm: "WP0AB29988S783457", image: null })];
  const r3 = await F.refreshFeaturedHistory(env, d);
  ok("(6) a kept pick whose earlier photo is gone fails the rules again and is replaced", r3.why === "selected" && r3.stored.listingId === "L3", JSON.stringify([r3.why, r3.stored && r3.stored.listingId]));
  // stale pick never served
  db.now += F.MAX_CHECK_AGE_MS + 60000;
  ok("(6) a stored pick not re-checked within the limit is never served, even with its auction still live", (await F.readFeaturedHistory(env, CREW, d)) === null);
  // a failed refresh stores nothing
  await F.refreshFeaturedHistory(env, d); ok("(6) (control) a good refresh makes it servable again", (await F.readFeaturedHistory(env, CREW, d)) !== null);
  db.fail = true; const r4 = await F.refreshFeaturedHistory(env, d); db.fail = false;
  ok("(6) a failed refresh returns nothing and keeps nothing stored", r4.stored === null && !db.cfg.has("crew_featured_history") && (await F.readFeaturedHistory(env, CREW, d)) === null, JSON.stringify(r4.why));
  db.fail = true; ok("(6) a failed read at serve time is null, not the stored pick", (await F.readFeaturedHistory(env, CREW, d)) === null); db.fail = false;
  // no eligible car: null, and the search is not repeated every cron run
  const z = fakeDb(); z.db.apps = {}; const r5 = await F.refreshFeaturedHistory(env, z.d);
  ok("(6) no eligible car is null", r5.stored === null && (await F.readFeaturedHistory(env, CREW, z.d)) === null && r5.why === "none_eligible");
  const q0 = z.db.selects; const r6 = await F.refreshFeaturedHistory(env, z.d);
  ok("(6) and the next run inside the sweep interval does not search again", r6.why === "swept_recently" && z.db.selects - q0 === 1, String(z.db.selects - q0)); }

// (7) THE CREW GATE
{ const { db, d } = fakeDb(); await F.refreshFeaturedHistory(env, d);
  ok("(7) with the signed crew cookie the stored pick is served", (await F.readFeaturedHistory(env, CREW, d)) !== null);
  for (const [name, c] of [["no cookie", ""], ["a plain gas_crew=ok", "gas_crew=ok"], ["a forged crew value", "gas_crew=v1.9999999999999.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"], ["a tester cookie", "gas_tester=v1.1.x"], ["an undefined request", undefined]])
    ok(`(7) ${name}: no field, even with a good stored pick`, (await F.readFeaturedHistory(env, c, d)) === null);
  ok("(7) a request object without the cookie is refused too", (await F.readFeaturedHistory(env, { headers: {} }, d)) === null && (await F.readFeaturedHistory(env, { headers: { cookie: CREW } }, d)) !== null);
  const reads0 = db.selects; await F.readFeaturedHistory(env, "", d);
  ok("(7) a refused request does not even read the store", db.selects === reads0);
  ok("(7) the stored key is a crew key", /^crew_/.test(F.STORE_KEY) && [...db.cfg.keys()].every(k => /^crew_/.test(k)), [...db.cfg.keys()].join());
  // the route
  const H = (await import(pathToFileURL(path.join(root, "api/featuredHistory.js")).href)).default;
  const res = () => { const r = { code: 0, body: undefined, headers: {}, statusCode: 200, setHeader(k, v) { r.headers[k] = v; }, status(c) { r.code = c; return r; }, json(b) { r.body = b; return r; }, end(b) { r.code = r.code || r.statusCode; r.ended = true; return r; } }; return r; };
  const a = res(); await H({ headers: {}, query: {} }, a);
  ok("(7) /api/featuredHistory without the cookie is 404 with no body and no field", (a.code === 404 || a.statusCode === 404) && a.body === undefined, JSON.stringify([a.code, a.statusCode, a.body]));
  const b = res(); await H({ headers: { cookie: CREW }, query: {} }, b);
  ok("(7) with the cookie it answers 200 with the field key, private and not cached", b.code === 200 && b.body && "featuredHistory" in b.body && /no-store/.test(b.headers["Cache-Control"] || ""), JSON.stringify([b.code, Object.keys(b.body || {}), b.headers])); }

// (8) NO PUBLIC SURFACE CAN RETURN IT: every file that names the field, the store key or the module is on the short list
{ const ALLOWED = new Set(["lib/live/featuredHistory.js", "api/featuredHistory.js", "api/pullLive.js", "api/crewPage.js", "lib/preview/previewPages.js"]);   // + the crew gated Homepage preview (Lane E, Nov 5 2026): its route and its page, no other
  const NAMES = /featuredHistory|featured_history|FEATURED_HISTORY/;
  const hits = [];
  const walk = (dir) => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { if (e.name === "node_modules" || e.name === ".git" || e.name === ".claude" || e.name === "proofs") continue; const p = path.join(dir, e.name); if (e.isDirectory()) walk(p); else if (/\.(js|mjs|json|html|xml|css|txt|md)$/.test(e.name)) { const rel = path.relative(root, p); if (rel.startsWith("scripts/") || rel.startsWith("docs/")) continue; if (NAMES.test(fs.readFileSync(p, "utf8"))) hits.push(rel); } } };
  for (const top of ["api", "lib", "public", "vercel.json"]) { const p = path.join(root, top); if (!fs.existsSync(p)) continue; if (fs.statSync(p).isDirectory()) walk(p); else if (NAMES.test(fs.readFileSync(p, "utf8"))) hits.push(top); }
  ok("(8) only the module, its crew route, the cron refresh and the crew gated Homepage preview (route and page) name the field, the store key or the module", hits.every(h => ALLOWED.has(h)) && ALLOWED.size === hits.length, hits.join(", "));
  { const cp = fs.readFileSync(path.join(root, "api/crewPage.js"), "utf8"); const g = cp.indexOf("sendDisguisedNotFound(res, req)"), r = cp.indexOf("renderAsync(req)");
    ok("(8) the crew page route answers the platform's 404 before it renders the preview that reads the field", g > 0 && r > g && /isCrewRequest\(req\)/.test(cp.slice(0, r)) && /if \(!p \|\| !\(seat \|\| isCrewRequest\(req\)/.test(cp)); }
  const route = fs.readFileSync(path.join(root, "api/featuredHistory.js"), "utf8");
  ok("(8) the one route checks the crew cookie before it reads anything", /isCrewRequest\(req\)/.test(route) && route.indexOf("isCrewRequest") < route.indexOf("readFeaturedHistory("));
  const lib = fs.readFileSync(path.join(root, "lib/live/featuredHistory.js"), "utf8");
  ok("(8) the reader checks the crew cookie before it reads the store", /!isCrewRequest\(reqOrCookie\)/.test(lib) && lib.indexOf("isCrewRequest(reqOrCookie)") < lib.indexOf("await readStore(env, d);\n  const st = s.value;"));
  const pl = fs.readFileSync(path.join(root, "api/pullLive.js"), "utf8");
  ok("(8) the cron response carries a word about the refresh and never the car", /featuredRefresh/.test(pl) && !/featuredHistory\s*[:,}]/.test(pl.replace(/import\("\.\.\/lib\/live\/featuredHistory\.js"\)/, "")));
  const vj = fs.readFileSync(path.join(root, "vercel.json"), "utf8");
  ok("(8) vercel.json has no rewrite, cron or header for it", !NAMES.test(vj));
  const sm = ["api/sitemapPages.js", "api/specPage.js", "api/publicConfig.js", "api/home.js"].filter(f => fs.existsSync(path.join(root, f)));
  ok("(8) the sitemaps, the public config and the home route do not name it", sm.every(f => !NAMES.test(fs.readFileSync(path.join(root, f), "utf8"))), sm.join()); }
console.log(fail ? `featuredHistoryCheck: ${fail} FAIL, ${pass} pass` : `featuredHistoryCheck: ${pass} pass, 0 FAIL`);
process.exit(fail ? 1 : 0);

// ---- the mutants: break ONE rule in a copy of the repo and prove the named assertion fails without it
function runMutants() {
  const L = "lib/live/featuredHistory.js";
  const M = [
    [L, 'if (!a || a.length < 6 || a !== b) return false;', 'if (!a) return false;', "(2) a VIN that does not match"],
    [L, 'b = vinNorm(rec.vinNorm || rec.vin_norm || rec.vin);', 'b = vinNorm(rec.vinNorm || rec.vin_norm || rec.vin || a);', "(2) an earlier record that names no VIN"],
    [L, 'if (rec.year && live.year && Number(rec.year) !== Number(live.year)) return false;', '', "(2) an earlier record of a different year"],
    [L, 'if (a.length < 17) return !!(rec.model && live.model && squash(rec.model) === squash(live.model) && rec.year && live.year);', '', "(2) a short chassis number"],
    [L, 'if (!genuinePhoto(live.photo_url)) return { ok: false, reason: "no_current_photo" };', '', "(2) a live listing with no photo"],
    [L, 'if (!genuinePhoto(a.image)) return { reject: "no_earlier_photo" };', 'if (false) return { reject: "no_earlier_photo" };', "(2) an earlier record with no photo"],
    [L, 'const photoOk = a => genuinePhoto(a.image)', 'const photoOk = a => true', "(2) an earlier record with no photo"],
    [L, 'if (bad(p.rec.image)) return { ok: false, reason: "no_earlier_photo" };', '', "(2) an earlier photo that answers 404"],
    [L, 'linkOk = a => isHttp(a.url);', 'linkOk = a => true;', "(2) an earlier record with no evidence link"],
    [L, 'if (bad(p.rec.url)) return { ok: false, reason: "no_evidence_link" };', '', "(2) an earlier evidence link that answers 404"],
    [L, 'norm(a.url) !== cur)', 'true)', "(2) an earlier record that is the live listing itself"],
    [L, 'a.date < today && norm', 'a.date && norm', "(2) an earlier record dated today or later"],
    [L, 'export const liveNow = (live, nowMs) => !!live && String(live.status || "") === "live" && Date.parse(live.end_time) > nowMs;', 'export const liveNow = (live, nowMs) => !!live;', "(2) an auction that has ended"],
    [L, 'const sold = a => a.kind === "sale" && num(a.priceUsd) > 0;', 'const sold = a => num(a.priceUsd) > 0 || num(a.bidUsd) > 0;', "(3) an earlier unsold auction is a LISTED car"],
    [L, ['(a.kind !== "sale" || num(a.priceUsd) > 0)', 'usable.find(a => a.kind !== "sale")'], ['true', 'usable.find(a => true)'], "(2) a 'sale' with no price"],
    [L, 'num(a.mileage) > 0 && (a.kind', 'true && (a.kind', "(2) a sold record with no mileage"],
    [L, 'p.kind === "sold" ? { price: Math.round(num(p.rec.priceUsd)) } : {}', '{ price: Math.round(num(p.rec.priceUsd || p.rec.bidUsd)) }', "(3) a listed car carries no price"],
    [L, 'const basis = p.kind === "sold" ?', 'const basis = true ?', "(3) when the sale cannot be shown"],
    [L, '(a.featured.kind === "sold" ? 0 : 1) - (b.featured.kind === "sold" ? 0 : 1) ||', '', "(3) a confirmed sale is preferred"],
    [L, 'a.earlierCount - b.earlierCount ||', 'Number(b.featured.previous.price || 0) - Number(a.featured.previous.price || 0) ||', "(5) with two sold cars"],
    [L, '!/^k/.test(unit) && miles >= prevMiles', 'miles >= prevMiles', "(4) kilometres on the live listing"],
    [L, 'miles >= prevMiles && miles - prevMiles <= 250000', 'true', "(4) fewer miles now"],
    [L, '!(Date.parse(st.checkedAt) > now - MAX_CHECK_AGE_MS) ||', '', "(6) a stored pick not re-checked within the limit"],
    [L, 'if ((await stillLive(env, st.listingId, d)) !== true) return null;', '', "(6) a listing that becomes unavailable before its end time"],
    [L, ['if ((await stillLive(env, st.listingId, d)) !== true) return null;', '!(Date.parse(f.current && f.current.endsAt) > now)'], ['', 'false'], "(6) when the auction ends the pick is no longer served"],
    [L, ['if (alive && Date.parse(st.featured.current.endsAt) > now) {', 'if (again.ok) { const keep'], ['if (true) {', 'if (true) { const keep'], "(6) the next refresh replaces it"],
    [L, 'if (again.ok) { const keep', 'if (true) { const keep', "(6) a kept pick whose earlier photo is gone"],
    [L, 'const drop = async why => { await Promise.resolve(d.clear(env)).catch(() => {}); return { stored: null, why }; };', 'const drop = async why => ({ stored: null, why });', "(6) a failed refresh returns nothing"],
    [L, 'if (st && st.featured && st.listingId) {\n      const alive', 'if (false) {\n      const alive', "(6) STABLE"],
    [L, 'if (process.env.FEATURED_HISTORY === "0" || !isCrewRequest(reqOrCookie)) return null;', 'if (process.env.FEATURED_HISTORY === "0") return null;', "(7) no cookie: no field"],
    [L, 'export const STORE_KEY = "crew_featured_history";', 'export const STORE_KEY = "featured_history";', "(7) the stored key is a crew key"],
    ["api/featuredHistory.js", 'if (!isCrewRequest(req)) { res.statusCode = 404; res.setHeader("Cache-Control", "no-store"); return res.end(); }', '', "(7) /api/featuredHistory without the cookie is 404"],
    ["api/home.js", '\n', '\n// featuredHistory leaked into a public route\n', "(8) only the module, its crew route, the cron refresh and the crew gated Homepage preview"],
    ["vercel.json", '"rewrites": [', '"rewrites": [ { "source": "/featured", "destination": "/api/featuredHistory" },', "(8) vercel.json has no rewrite"]
  ];
  let bad = 0; const results = [];
  for (const [file, from, to, name] of M) {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "fhm-"));
    for (const d of ["lib", "api", "scripts", "public"]) fs.cpSync(path.join(root, d), path.join(tmp, d), { recursive: true, filter: s => !/node_modules/.test(s) });
    for (const f of ["vercel.json", "package.json"]) if (fs.existsSync(path.join(root, f))) fs.copyFileSync(path.join(root, f), path.join(tmp, f));
    fs.symlinkSync(path.join(root, "node_modules"), path.join(tmp, "node_modules"));
    const fp = path.join(tmp, file), src = fs.readFileSync(fp, "utf8");
    const FR = [].concat(from), TO = [].concat(to); if (!FR.every(x => src.includes(x))) { console.log("MUTANT BROKEN (text not found): " + name + " :: " + FR.map(x => x.slice(0, 50)).join(" | ")); bad++; continue; }
    let mut = src; FR.forEach((x, i) => { mut = mut.replace(x, TO[i]); }); fs.writeFileSync(fp, mut);
    const r = spawnSync("node", [path.join(tmp, "scripts/featuredHistoryCheck.mjs"), tmp], { encoding: "utf8", timeout: 120000 });
    const out = (r.stdout || "") + (r.stderr || ""), failedNamed = out.split("\n").some(l => l.startsWith("FAIL") && l.includes(name));
    results.push([name, r.status !== 0, failedNamed]);
    if (!(r.status !== 0 && failedNamed)) { console.log(`MUTANT SURVIVED: ${name} (${file}): exit ${r.status}, named assertion failed: ${failedNamed}`); out.split("\n").filter(l => l.startsWith("FAIL")).slice(0, 4).forEach(l => console.log("   " + l.slice(0, 150))); bad++; }
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  console.log(`featuredHistoryCheck mutants: ${M.length - bad} of ${M.length} killed${bad ? `, ${bad} SURVIVED` : ""}`);
  return bad ? 1 : 0;
}
