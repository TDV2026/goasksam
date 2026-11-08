// THE DESK SHEET READS AS THE WHOLE MARKET (Lane B, Nov 8 2026). Four things, over a fake archive with real photos and a tier on every sale:
//   (1) COMPARABLES: every sale in the picked body and tier pool, each with its own first photo (https), the venue's display name, price, mileage and tier; a tier holding under five shows the WHOLE body pool with each sale's tier tagged. Never three rows.
//   (2) WORDING: the count and the range, not an apology ("N sales of this body since [month]. M in tier T, shown on the full set." / "Range from N sales: $low to $high. Median $X."); no "wider pool", "wider range", "too few" anywhere in the Desk sheet's sentences; the consumer pages' lines are separate table entries and unchanged.
//   (3) LIVE ROWS: with a body picked, only live cars resolved to that body, counted the same.
//   (4) THE RANGE METER: low, p25, median, p75, high of the pool shown, and each sale's price and tier on comparables.
//   node scripts/sheetPoolCheck.mjs [root]      --mutants proves each rule by breaking it in a copy
import fs from "node:fs"; import path from "node:path"; import os from "node:os"; import { fileURLToPath, pathToFileURL } from "node:url"; import { spawnSync } from "node:child_process";
const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2), rootArg = args.find(a => !a.startsWith("--")), ROOT = path.resolve(rootArg || path.join(here, ".."));
if (args.includes("--mutants")) {
  const SR = "lib/sheetRead.js", OB = "lib/onebox.js", RW = "lib/reasonWords.js";
  const muts = [
    [SR, "photo: photoOf(c),", "photo: null,", "(1) a comparable with no photo"],
    [SR, "cardsOf.slice(0, MAX_PROOF_ROWS)", "cardsOf.slice(0, 3)", "(1) the comparables capped at three rows"],
    [SR, "cardsOf.slice(0, MAX_PROOF_ROWS)", "cardsOf.slice(0, 12)", "(1) the comparables capped at twelve rows"],
    [SR, "venue: c.platformName || c.platform ||", "venue: c.platformSlug || c.platform ||", "(1) the venue as a slug, not its display name"],
    [SR, "tier: c.conditionTier != null ? Number(c.conditionTier) : null,", "tier: null,", "(1) a sale with no tier tag"],
    [SR, "const cardsOf = tierOk && !openAsk && poolCards ? poolCards : bodyAll;", "const cardsOf = Array.isArray(a.tierComparables) && a.tierComparables.length ? a.tierComparables : bodyAll;", "(1) a thin tier shows only its own few sales"],
    [OB, "fields.tierBodyComparables = bodyCards;", "", "(1) the engine does not tag the body pool with tiers"],
    [RW, "shown on the full set.`", "shown on the wider pool.`", "(2) the pool line says wider pool"],
    [RW, "text: p => `Range from ${p.sales}", "text: p => `Sorry, the wider range from ${p.sales}", "(2) an apology in the range line"],
    [RW, "text: p => `Tier ${p.tier} holds ${Number(p.m).toLocaleString(\"en-US\")} of ${p.sales} and has no range of its own", "text: p => `Unfortunately only ${p.sales}; tier ${p.tier} holds ${Number(p.m).toLocaleString(\"en-US\")} and has no range of its own", "(2) unfortunately in the starting note"],
    [RW, "text: () => \"Too few sales to show a range.\"", "text: () => \"N sales.\"", "(2) the consumer page's line changed"],
    [SR, "(wantBody ? liveRaw.rows.filter(", "(false ? liveRaw.rows.filter(", "(3) a live car of the wrong body"],
    [SR, "total: wantBody ? liveRows.length : liveRaw.total", "total: liveRaw.total", "(3) the live count includes the wrong body"],
    [SR, "if (input.bodyStyle && !vehicle.bodyStyle)", "if (false)", "(3) the picked body is not applied"],
    [SR, "meter: metaPrices.length && !openAsk ?", "meter: false ?", "(4) no range meter"],
    [SR, "p25: quant(metaPrices, 0.25), median: quant(metaPrices, 0.5), p75: quant(metaPrices, 0.75)", "p25: null, median: quant(metaPrices, 0.5), p75: quant(metaPrices, 0.75)", "(4) the meter has no p25"],
    [SR, "rangeLine: headlineOk", "rangeLine: false && headlineOk", "(2) no range line"]
  ];
  let survivors = 0;
  for (const [file, from, to, want] of muts) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "spc-"));
    spawnSync("rsync", ["-a", "--exclude", ".git", "--exclude", "node_modules", "--exclude", "proofs", ROOT + "/", dir + "/"]); fs.symlinkSync(path.join(ROOT, "node_modules"), path.join(dir, "node_modules"));
    const fp = path.join(dir, file), src = fs.readFileSync(fp, "utf8"), m = src.replace(from, to);
    if (m === src) { console.log(`MUTANT NOT APPLIED  ${want}`); survivors++; fs.rmSync(dir, { recursive: true, force: true }); continue; }
    fs.writeFileSync(fp, m);
    const r = spawnSync(process.execPath, [path.join(dir, "scripts/sheetPoolCheck.mjs"), dir], { encoding: "utf8" }), killed = r.status !== 0;
    console.log(`${killed ? "killed  " : "SURVIVED"}  ${want}`); if (!killed) survivors++;
    fs.rmSync(dir, { recursive: true, force: true });
  }
  console.log(survivors ? `\n${survivors} mutant(s) survived` : "\nall mutants killed"); process.exit(survivors ? 1 : 0);
}
let failed = 0, n = 0; const ok = (name, c, d) => { n++; if (!c) failed++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${d ? "  " + d : ""}`); };
process.chdir(ROOT);
const quiet = console.error; console.error = () => {}; const log = console.log; console.log = (...a) => { if (!/^\{"tag":/.test(String(a[0]))) log(...a); };
const TV = (await import(pathToFileURL(path.join(ROOT, "lib/conditionTier.js")).href)).TIER_VERSION;
const E = await import(pathToFileURL(path.join(ROOT, "lib/onebox.js")).href), S = await import(pathToFileURL(path.join(ROOT, "lib/sheetRead.js")).href), RW = await import(pathToFileURL(path.join(ROOT, "lib/reasonWords.js")).href);
// the archive: 120 sales of a 2003 Porsche 911, each with its own photo, a platform, a tier (tier 1 holds 3 sales: thin; tiers 2 to 4 are deep; every seventh is untiered)
const rows = Array.from({ length: 120 }, (_, i) => {
  const year = 2002 + (i % 3), raw = { id: "ocd_" + i, title: year + " Porsche 911 Carrera", featured_image_url: "https://img.example/sale-" + i + ".jpg", mileage: String(20000 + i * 900), body_style: "Coupe", modifications: null, currency: "USD", transmission: "Manual (6-Speed)", exterior_color: "Red", title_status: "Clean", url: "https://bat.example/s" + i, source_url: "https://src.example/s" + i, country_code: "US", auction_end_precision: "day" };
  return { id: "p-" + String(i).padStart(5, "0"), source_id: raw.id, sale_price: 30000 + i * 700, sale_date: new Date(Date.now() - (6 + i) * 864e5).toISOString().slice(0, 10), platform: "Bring a Trailer", listing_title: raw.title, year, make: "Porsche", model: "911", vin_norm: null, stated_mileage: null, project_flag: null, desc_facts: null, has_reserve: false, raw_record: raw, vehicle_type: "car" };
});
const tierOf = id => { const k = Number(id.split("-")[1]); return k % 7 === 0 ? null : (k < 6 && k % 2 ? 1 : 2 + (k % 3)); };
const jt = v => v === null || v === undefined ? null : typeof v === "string" ? v : JSON.stringify(v);
const evalItem = (row, item) => { const ci = item.indexOf(":"), hasAlias = ci > 0 && item[ci + 1] !== ":", alias = hasAlias ? item.slice(0, ci) : null, expr = hasAlias ? item.slice(ci + 1) : item; if (expr.startsWith("raw_record->>")) return [alias || expr.slice(13), jt(row.raw_record[expr.slice(13)])]; const col = expr.replace(/::text$/, ""); return [alias || col, col in row ? row[col] : null]; };
globalThis.fetch = async url => {
  const u = new URL(String(url)), sel = u.searchParams.get("select") || "";
  if (!u.pathname.endsWith("/sales_archive")) return new Response("[]", { status: 200 });
  if (/condition_tier/.test(sel)) { const ids = (u.searchParams.get("id") || "").replace(/^in\.\(|\)$/g, "").split(",").filter(Boolean); return new Response(JSON.stringify(ids.map(id => ({ id, condition_tier: tierOf(id), condition_version: TV }))), { status: 200 }); }
  if (u.searchParams.get("id")) return new Response("[]", { status: 200 });
  if (/^model$/.test(sel)) return new Response(JSON.stringify([{ model: "911" }]), { status: 200 });
  return new Response(JSON.stringify(rows.map(r => Object.fromEntries(sel.split(",").map(it => evalItem(r, it))))), { status: 200 });
};
const env = { supabaseUrl: "https://fake.example", supabaseKey: "k", poolColumns: false, asked: 0, noStageLog: true };
const liveCars = [["2003 Porsche 911 Carrera Coupe", 1], ["2002 Porsche 911 Carrera Cabriolet", 2], ["2004 Porsche 911 Carrera 4S Coupe", 3], ["2001 Porsche 911 Carrera", 4], ["2003 Porsche 911 Targa", 5]].map(([t, id]) => ({ id, listing_title: t, year: Number(t.slice(0, 4)), make: "Porsche", model: "911", current_bid_usd: 40000 + id, end_time: new Date(Date.now() + id * 36e5).toISOString(), source: "bringatrailer", platform: "Bring a Trailer", url: "https://l.example/" + id }));
const deps = { resolveVehicle: async text => { const m = /^(\d{4}) (\S+) (.+)$/.exec(text); return { status: "valid", vehicle: { year: Number(m[1]), make: m[2], model: m[3] } }; }, decodeVin: async () => null, archiveMatch: async () => null, vinPlan: null, vinOverlay: null, liveFor: async () => ({ rows: liveCars, total: liveCars.length }), carTier: null };
const read = async (extra = {}) => S.sheetRead(env, { year: 2003, make: "Porsche", model: "911", mileage: "", ...extra }, deps);
const direct = (await E.oneEngineAnswer({ year: 2003, make: "Porsche", model: "911" }, null, "2003 Porsche 911", env, null)).raw, poolN = (direct.rawPool || []).filter(r => Number(r._usd ?? r._allin ?? r._hammer) > 0).length;
const URL_OK = u => /^https:\/\/img\.example\/sale-\d+\.jpg$/.test(String(u));
{ // (1) a deep tier: every sale of that tier
  const sh = await read({ tier: 3 }), c = sh && sh.market.comparables;
  ok("(1) a deep tier: the read exists and the engine read its tier pool", sh && sh.condition.sameTierCount >= 5, JSON.stringify(sh && sh.condition.sameTierCount));
  ok("(1) every sale of the tier pool is a comparable (more than three), all in that tier", c.length === sh.condition.sameTierCount && c.length > 3 && c.every(x => x.tier === 3), c.length + " of " + sh.condition.sameTierCount);
  ok("(1) each comparable carries its own first photo (https), the venue's display name, a price and a mileage", c.every(x => URL_OK(x.photo) && x.venue === "Bring a Trailer" && x.price > 0 && x.mileage > 0), JSON.stringify(c[0]));
  ok("(1) each photo is that sale's own (no two sales share one)", new Set(c.map(x => x.photo)).size === c.length);
}
{ // (1) a thin tier: the whole body pool, each sale tagged
  const sh = await read({ tier: 1 }), c = sh.market.comparables;
  ok("(1) tier 1 holds under five: the read has no starting figure", sh.condition.tooFew && sh.market.startingFigure === null && sh.condition.sameTierCount < 5, JSON.stringify(sh.condition.sameTierCount));
  ok("(1) the WHOLE body pool is shown, every sale the engine read, never three", c.length === poolN && c.length > 12, c.length + " of " + poolN);
  ok("(1) each sale carries its tier (1 to 4, or none), a photo, the venue's name and a price", c.every(x => (x.tier === null || [1, 2, 3, 4].includes(x.tier)) && URL_OK(x.photo) && x.venue === "Bring a Trailer" && x.price > 0) && c.some(x => x.tier === 1) && c.some(x => x.tier === 3), JSON.stringify([...new Set(c.map(x => x.tier))]));
  ok("(1) the sales tagged tier 1 are the tier's own count", c.filter(x => x.tier === 1).length === sh.condition.sameTierCount);
  ok("(2) the pool line states the count and the tier: N sales of this body since [month]. M in tier 1, shown on the full set.", new RegExp("^" + poolN + " sales of this body since [A-Z][a-z]+ \\d{4}\\. " + sh.condition.sameTierCount + " in tier 1, shown on the full set\\.$").test(sh.condition.tooFewLine) && sh.market.poolLine === sh.condition.tooFewLine && sh.market.startingNote === sh.condition.tooFewLine, sh.condition.tooFewLine);
}
{ // no tier chosen: the whole pool too
  const sh = await read({}), c = sh.market.comparables;
  ok("(1) no tier chosen: the whole body pool, tiers tagged", c.length === poolN && c.some(x => x.tier != null) && c.every(x => URL_OK(x.photo)), c.length + " of " + poolN);
}
{ // (2) the range line and (4) the meter
  const sh = await read({ tier: 3 }), m = sh.market, f = x => x.toLocaleString("en-US");
  ok("(2) Range from N sales: $low to $high. Median $X. with the engine's own figures", m.rangeLine === "Range from " + poolN + " sales: $" + f(m.low) + " to $" + f(m.high) + ". Median $" + f(m.median) + ".", m.rangeLine);
  const mt = m.meter;
  ok("(4) the meter carries low, p25, median, p75 and high, in order, and the count of the sales it draws", mt && ["low", "p25", "median", "p75", "high"].every(k => Number.isFinite(mt[k])) && mt.low <= mt.p25 && mt.p25 <= mt.median && mt.median <= mt.p75 && mt.p75 <= mt.high && mt.count === m.comparables.length, JSON.stringify(mt));
  ok("(4) a tier read draws the tier's sales (scope tier); every dot has a price and a tier", mt.scope === "tier" && mt.tier === 3 && m.comparables.every(x => x.price > 0 && x.tier === 3));
  const thin = await read({ tier: 1 }); ok("(4) a thin tier draws the body pool (scope body)", thin.market.meter && thin.market.meter.scope === "body" && thin.market.meter.count === poolN, JSON.stringify(thin.market.meter));
}
{ // (3) live rows
  const none = await read({}), coupe = await read({ bodyStyle: "coupe" });
  ok("(3) no body picked: every live car", none.market.liveTotal === 5, JSON.stringify([none.market.live.length, none.market.liveTotal]));
  ok("(3) body Coupe: only the live cars resolved to Coupe, listed and counted", coupe.market.liveTotal === 2 && coupe.market.live.length === 2 && coupe.market.live.every(l => /Coupe/.test(l.title)) && !coupe.market.live.some(l => /Cabriolet|Targa/.test(l.title)), JSON.stringify(coupe.market.live.map(l => l.title)));
  ok("(3) a live car whose body is not stated is not a Coupe", !coupe.market.live.some(l => l.title === "2001 Porsche 911 Carrera"));
}
{ // (2) the wording
  const strings = []; for (const t of [1, 2, 3, 4]) { const sh = await read({ tier: t }); strings.push(sh.market.startingNote, sh.market.poolLine, sh.market.rangeLine, sh.condition.tooFewLine, sh.condition.untieredLine); }
  const APOL = /\b(wider|too few|not enough|unable|sorry|unfortunately|apolog|cannot|could not|regret|no starting figure|insufficient)\b/i;
  ok("(2) no apologetic or hedging word in any Desk sentence the read carries", strings.filter(Boolean).every(s => !APOL.test(s)), strings.filter(s => s && APOL.test(s)).join(" | "));
  const desk = Object.entries(RW.REASON_TABLE || {}).filter(([k]) => /^desk\./.test(k)).map(([k, e]) => [k, e.text({ n: 12, m: 3, tier: 2, since: "March 2026", low: 1000, high: 2000, median: 1500, date: "x" })]);
  ok("(2) the Desk's reason lines exist, and none of them apologises", desk.length >= 8 && desk.every(([, t]) => !APOL.test(t)), desk.filter(([, t]) => APOL.test(t)).map(([k]) => k).join(" ") + " found " + desk.length);
  const files = ["lib/sheetRead.js", "lib/desk/sheetShape.js", "lib/desk/reportPdf.js", "lib/desk/decisionRules.js", "public/js/deskvals.js", "lib/conditionTier.js"], bad = files.filter(f => /\b(wider (pool|range)|Wider range|Too few sales in this condition)\b/.test(fs.readFileSync(f, "utf8").replace(/\/\/[^\n]*/g, "")));
  ok("(2) no Desk file types wider pool, wider range or Too few sales in this condition", bad.length === 0, bad.join(", "));
  ok("(2) the consumer pages' lines are unchanged (separate entries)", RW.reasonLine("thin.few_sales") === "Too few sales to show a range." && /^Too few sales near/.test(RW.reasonLine("mileage.note", { miles: 40000, n: 12 })), RW.reasonLine("thin.few_sales"));
}
console.log = log; console.error = quiet;
console.log("\nsheetPoolCheck: " + (n - failed) + " pass, " + failed + " FAIL"); process.exit(failed ? 1 : 0);
