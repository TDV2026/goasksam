// factPriceCheck (Lane B, Nov 17 2026, lane-b-factmine; order bc85): the price read of the value driver mining, on fixtures (a deterministic fake market, no network). SOLD LISTINGS ONLY.
//  1 A PLANTED EFFECT is found (about +10 percent) and CONFIRMED: both halves, split by a hash of the listing id, agree.
//  2 A PLANTED EFFECT IN ONE HALF ONLY is reported, and reported as NOT confirmed.
//  3 A topic on fewer than 30 listings, or absent from fewer than 30, is not reported (counted as skipped).
//  4 THE CONTROLS: a topic that only travels with low mileage, or only with long listings, has no effect once the mileage band and the listing length are held, and is not confirmed.
//  5 A second half that agrees in direction but is under half the size, or points the other way, does not confirm.
//  6 End to end through the real task body (runFactPrice): attempts are ignored (sold only) and the wording is observational (sold for), never adds or is worth.
//   node scripts/factPriceCheck.mjs [repo root]      --mutants breaks one rule at a time (each must fail)
import fs from "node:fs"; import path from "node:path"; import { spawnSync } from "node:child_process"; import { fileURLToPath, pathToFileURL } from "node:url";
const args = process.argv.slice(2), here = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.resolve(args.find(a => !a.startsWith("--")) || path.join(here, ".."));
if (args.includes("--mutants")) process.exit(mutants());
process.chdir(ROOT);
const imp = f => import(pathToFileURL(path.join(ROOT, f)).href);
const FP = await imp("lib/factPrice.js");
let pass = 0, fail = 0; const fails = []; const ok = (n, c, d) => { if (c) pass++; else { fail++; fails.push(n + (d !== undefined ? " " + JSON.stringify(d).slice(0, 260) : "")); } };

// ---- a deterministic market: 480 sold e46 M3 listings in 2 sources x 2 sale years x 2 mileage bands x 2 lengths, 30 listings in each stratum ----------
let seed = 7; const rnd = () => (seed = (seed * 48271) % 2147483647) / 2147483647;
const BASE = { "bat|2025|low|short": 40000, "bat|2025|low|long": 44000, "bat|2025|high|short": 30000, "bat|2025|high|long": 33000, "bat|2026|low|short": 42000, "bat|2026|low|long": 46000, "bat|2026|high|short": 31000, "bat|2026|high|long": 34000,
  "cab|2025|low|short": 39000, "cab|2025|low|long": 43000, "cab|2025|high|short": 29000, "cab|2025|high|long": 32000, "cab|2026|low|short": 41000, "cab|2026|low|long": 45000, "cab|2026|high|short": 30500, "cab|2026|high|long": 33500 };
const market = (topicsFor, priceFor) => {
  const L = []; let n = 0;
  for (const [k, base] of Object.entries(BASE)) for (let i = 0; i < 30; i++) {
    const [s, y, m, len] = k.split("|"), id = `${s === "bat" ? "bringatrailer" : "carsandbids"}:L${n++}`;
    const l = { id, source: s === "bat" ? "bringatrailer" : "carsandbids", saleYear: y, year: 2003, mileage: m === "low" ? 15000 + i * 300 : 70000 + i * 300, title: "2003 BMW M3 Coupe", transmission: "6-speed manual", length: len === "short" ? 1500 + i : 5000 + i, topics: new Set(), base };
    l.topics = topicsFor(l, i); l.price = Math.round(priceFor(l, i) * (1 + (rnd() - 0.5) * 0.04)); L.push(l);
  }
  return L;
};
const T = (r, listings, topic) => (r.reported || []).find(x => x.topic === topic);
const has = (set, t) => set.has(t);
const topicsA = (l, i) => { const s = new Set(); if (i % 5 < 2) s.add("service records"); if (i % 2 === 0) s.add("original wheels"); return s; };   // service records on 40 percent of every stratum

// 1 planted effect, found and confirmed
{ const L = market(topicsA, l => l.base * (l.topics.has("service records") ? 1.10 : 1)), r = FP.analyse(L, "e46_m3"), t = T(r, L, "service records");
  ok("a planted +10 percent effect is found", !!t && t.effect_pct > 8 && t.effect_pct < 12, t && t.effect_pct);
  ok("and confirmed: both halves agree in direction and size", !!t && t.confirmed === true && t.first_half.effect_pct > 7 && t.second_half.effect_pct > 7, t && [t.first_half, t.second_half]);
  const o = T(r, L, "original wheels"); ok("a topic with no effect is reported with an effect near zero and not confirmed", !!o && Math.abs(o.effect_pct) < 2 && o.confirmed === false, o && [o.effect_pct, o.confirmed]);
  ok("the counts are the listings: 192 with, 288 without", t && t.listings_with === 192 && t.listings_without === 288, t && [t.listings_with, t.listings_without]);
  ok("the wording is observational (sold for) and never adds or is worth", t && /sold for/.test(t.line) && !/\badds?\b|worth|value|premium|better/i.test(JSON.stringify(r)), t && t.line);
}
// 2 a planted effect in one half only
{ const L = market(topicsA, l => l.base * (l.topics.has("service records") && FP.halfOf(l.id) === 0 ? 1.12 : 1)), r = FP.analyse(L, "e46_m3"), t = T(r, L, "service records");
  ok("an effect in one half only is reported, with the half that shows it", !!t && t.first_half.effect_pct > 8 && Math.abs(t.second_half.effect_pct) < 3, t && [t.first_half.effect_pct, t.second_half.effect_pct]);
  ok("and NOT confirmed", !!t && t.confirmed === false, t && t.confirmed);
}
// 3 under 30
{ const few = (l, i) => { const s = new Set(); if (l.id.endsWith("7") && i < 2) s.add("rare thing"); if (i < 14) s.add("nearly everywhere"); return s; };
  const L = market((l, i) => { const s = new Set(); const k = Number(l.id.split("L")[1]); if (k < 20) s.add("rare thing"); if (k >= 20) s.add("nearly everywhere"); if (k >= 0 && k < 460 && k >= 20) s.add("nearly everywhere"); return s; }, l => l.base * (l.topics.has("rare thing") ? 1.2 : 1));
  const r = FP.analyse(L, "e46_m3"); ok("a topic on 20 listings is not reported even with a +20 percent effect", !T(r, L, "rare thing"));
  ok("a topic absent from fewer than 30 listings is not reported", !T(r, L, "nearly everywhere"), T(r, L, "nearly everywhere"));
  ok("the skipped topics are counted", r.skipped_under_threshold >= 2, r.skipped_under_threshold);
  const exact = market((l) => { const k = Number(l.id.split("L")[1]); const s = new Set(); if (k < 30) s.add("thirty"); if (k < 29) s.add("twentynine"); return s; }, l => l.base), re = FP.analyse(exact, "e46_m3");
  ok("30 listings with the topic is reported, 29 is not", !!T(re, exact, "thirty") && !T(re, exact, "twentynine"));
}
// 4 the controls
{ const L = market((l, i) => { const s = new Set(); if (l.mileage < 40000 ? i % 5 !== 0 : i % 15 === 0) s.add("garaged"); return s; }, l => l.base), r = FP.analyse(L, "e46_m3"), t = T(r, L, "garaged");
  const naiveWith = L.filter(l => l.topics.has("garaged")).map(l => l.price).sort((a, b) => a - b), naiveWithout = L.filter(l => !l.topics.has("garaged")).map(l => l.price).sort((a, b) => a - b);
  ok("a topic that travels with low mileage looks high on raw medians", !!t && t.median_with > t.median_without * 1.1, t && [t.median_with, t.median_without]);
  ok("but has no effect inside the mileage band, and is not confirmed", !!t && Math.abs(t.effect_pct) < 2 && t.confirmed === false, t && [t.effect_pct, t.confirmed]);
  // listing length: three clean lengths, the topic travels with the long ones, and price depends on length and mileage only
  const LL = []; { let n = 0; for (const src of ["bringatrailer", "carsandbids"]) for (const y of ["2025", "2026"]) for (const m of ["low", "high"]) for (let li = 0; li < 3; li++) for (let i = 0; i < 20; i++) { const id = `${src}:Z${n++}`, p = [0.10, 0.45, 0.85][li]; const topics = new Set(); if ((i + 1) / 20 <= p) topics.add("long story");
    LL.push({ id, source: src, saleYear: y, year: 2003, mileage: m === "low" ? 20000 + i * 100 : 80000 + i * 100, title: "2003 BMW M3 Coupe", transmission: "6-speed manual", length: [1500, 3000, 5000][li] + i, topics, price: Math.round((30000 + li * 4000 + (m === "low" ? 8000 : 0)) * (1 + (rnd() - 0.5) * 0.02)) }); } }
  const rl = FP.analyse(LL, "e46_m3"), tl = T(rl, LL, "long story");
  ok("a topic that travels with long listings (which sold higher) has no effect inside a listing length band", !!tl && Math.abs(tl.effect_pct) < 2 && tl.confirmed === false, tl && [tl.median_with, tl.median_without, tl.effect_pct]);
}
// 5 the second half agrees in direction only weakly, or the other way
{ const weak = market(topicsA, l => l.base * (l.topics.has("service records") ? (FP.halfOf(l.id) === 0 ? 1.20 : 1.04) : 1)), rw = FP.analyse(weak, "e46_m3"), tw = T(rw, weak, "service records");
  ok("a second half in the same direction but under half the size is not confirmed", !!tw && tw.first_half.effect_pct > 17 && tw.second_half.effect_pct > 2 && tw.second_half.effect_pct < 0.5 * tw.first_half.effect_pct && tw.confirmed === false, tw && [tw.first_half.effect_pct, tw.second_half.effect_pct, tw.confirmed]);
  const opp = market(topicsA, l => l.base * (l.topics.has("service records") ? (FP.halfOf(l.id) === 0 ? 1.12 : 0.88) : 1)), ro = FP.analyse(opp, "e46_m3"), to = T(ro, opp, "service records");
  ok("a second half that points the other way is not confirmed", !!to && to.first_half.effect_pct > 8 && to.second_half.effect_pct < -8 && to.confirmed === false, to && [to.first_half.effect_pct, to.second_half.effect_pct]);
  const half = market(topicsA, l => l.base * (l.topics.has("service records") ? (FP.halfOf(l.id) === 0 ? 1.12 : 1.07) : 1)), rh = FP.analyse(half, "e46_m3"), th = T(rh, half, "service records");
  ok("a second half in the same direction and over half the size confirms", !!th && th.confirmed === true, th && [th.first_half.effect_pct, th.second_half.effect_pct]);
}
// 6 end to end through the task body: sold only
{ const runs = [], mentions = [], sales = new Map(); const L = market(topicsA, l => l.base * (l.topics.has("service records") ? 1.10 : 1));
  for (const l of L) { runs.push({ listing_id: l.id, source: l.source, sold_or_attempt: "sold", characters_read: l.length }); sales.set(l.id, { source_id: l.id.split(":")[1], sale_date: l.saleYear + "-06-01", year: 2003, mileage: String(l.mileage), transmission: l.transmission, listing_title: l.title, sale_price_usd: l.price, sale_price: l.price });
    for (const t of l.topics) mentions.push({ listing_id: l.id, source: l.source, topic: t, statement_type: "claim", polarity: "positive", has_date: false, has_mileage: false }); }
  for (let i = 0; i < 60; i++) { runs.push({ listing_id: `bringatrailer:A${i}`, source: "bringatrailer", sold_or_attempt: "attempt", characters_read: 3000 }); sales.set(`bringatrailer:A${i}`, { source_id: `A${i}`, sale_date: "2025-06-01", year: 2003, mileage: "30000", transmission: "6-speed manual", listing_title: "2003 BMW M3 Coupe", sale_price_usd: 99999, sale_price: 99999 }); mentions.push({ listing_id: `bringatrailer:A${i}`, source: "bringatrailer", topic: "attempt only topic", statement_type: "claim", polarity: "positive", has_date: false, has_mileage: false }); }
  const select = async qs => { const off = Number((/offset=(\d+)/.exec(qs) || [0, 0])[1]), lim = Number((/limit=(\d+)/.exec(qs) || [0, 1000])[1]);
    if (qs.startsWith("listing_mining_runs?")) return runs.slice(off, off + lim); if (qs.startsWith("listing_mentions?")) return mentions.slice(off, off + lim); if (qs.startsWith("topic_map?")) return [].slice(off, off + lim);
    if (qs.startsWith("sales_archive?")) { const m = /source_id=in\.([^&]*)/.exec(qs), src = /source_slug=eq\.([a-z]+)/.exec(qs)[1]; const ids = decodeURIComponent(m[1]).replace(/[()"]/g, "").split(","); return ids.map(i => sales.get(`${src}:${i}`)).filter(Boolean); }
    return []; };
  const r = await FP.runFactPrice({ family: "e46_m3" }, { select }), t = r.ok && r.body.reported.find(x => x.topic === "service records");
  ok("through the task body the planted effect is found and confirmed", r.ok && !!t && t.confirmed === true && t.effect_pct > 8, r.ok ? t && t.effect_pct : r.why);
  ok("attempts are ignored: a topic on 60 attempt listings is not reported, and the listings analysed are the 480 sold", r.ok && !r.body.reported.some(x => x.topic === "attempt only topic") && r.body.listings === 480 && r.body.sold_only === true, r.ok && [r.body.listings]);
  ok("the answer holds counts, medians and effects, no text", r.ok && !/description|seller|quote/i.test(JSON.stringify(r.body)));
  const bad = await FP.runFactPrice({ family: "p996_mezger" }, { select }); ok("a family outside the pilot is refused", bad.ok === false);
  const none = await FP.runFactPrice({ family: "e46_m3" }, { select: async () => null }); ok("missing tables refuse cleanly", none.ok === false && none.status === 409);
}
console.log(fails.slice(0, 40).map(f => "FAIL " + f).join("\n") + (fails.length ? "\n" : "") + `factPriceCheck: ${pass} pass, ${fail} FAIL`);
process.exit(fail ? 1 : 0);

function mutants() {
  const me = fileURLToPath(import.meta.url), R = ROOT;
  const M = [
    ["the second half is not asked to confirm", "lib/factPrice.js", "&& h2.effect != null && Math.abs(h1.effect) >= MIN_EFFECT && Math.sign(h1.effect) === Math.sign(h2.effect) && Math.abs(h2.effect) >= AGREE_FRACTION * Math.abs(h1.effect));", "&& Math.abs(h1.effect) >= MIN_EFFECT);"],
    ["the second half need not be half the size", "lib/factPrice.js", "AGREE_FRACTION = 0.5", "AGREE_FRACTION = 0"],
    ["the second half may point the other way", "lib/factPrice.js", "Math.sign(h1.effect) === Math.sign(h2.effect) && ", ""],
    ["a topic under 30 listings is reported", "lib/factPrice.js", "if (nWith < minL || nWithout < minL) {", "if (false) {"],
    ["the threshold is 29", "lib/factPrice.js", "MIN_LISTINGS = 30", "MIN_LISTINGS = 29"],
    ["the mileage band is not a control", "lib/factPrice.js", "milesBand(l.mileage), variantOf", "\"-\", variantOf"],
    ["the listing length is not a control", "lib/factPrice.js", ", l.length <= t1 ? \"short\" : l.length <= t2 ? \"mid\" : \"long\"].join", ", \"-\"].join"],
    ["the halves are not split by the listing id", "lib/factPrice.js", "export const halfOf = id => parseInt(createHash(\"sha1\").update(String(id)).digest(\"hex\").slice(0, 8), 16) % 2;", "export const halfOf = id => 0;"],
    ["attempts are priced too", "lib/factPrice.js", "loadMined(p.call, deps, { soldOnly: true })", "loadMined(p.call, deps, {})"],
    ["a tiny effect is confirmed as if it were real", "lib/factPrice.js", "MIN_EFFECT = 0.02", "MIN_EFFECT = 0"],
    ["the wording says adds", "lib/factPrice.js", "sold for ${word", "adds ${word"]
  ];
  let survived = 0;
  for (const [name, file, from, to] of M) {
    const tmp = fs.mkdtempSync(path.join(fs.realpathSync("/tmp"), "fp-"));
    try {
      for (const d of ["lib", "api", "data", "package.json"]) spawnSync("cp", ["-R", path.join(R, d), tmp]);
      fs.mkdirSync(path.join(tmp, "scripts")); fs.symlinkSync(path.join(R, "node_modules"), path.join(tmp, "node_modules"));
      const f = path.join(tmp, file), before = fs.readFileSync(f, "utf8"); if (!before.includes(from)) { console.log("SKIP (no match) " + name); survived++; continue; }
      fs.writeFileSync(f, before.replace(from, () => to));
      const r = spawnSync(process.execPath, [me, tmp], { encoding: "utf8", timeout: 240000 }), killed = r.status !== 0; console.log((killed ? "killed   " : "SURVIVED ") + name); if (!killed) survived++;
    } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  }
  console.log(survived ? `${survived} mutant(s) survived` : "all mutants killed"); return survived ? 1 : 0;
}
