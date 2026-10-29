// e100: the options of one group add up to the footer count, or a remainder is shown; no pill appears twice.
// Cause (Lane E's COUNT FAULT, Oct 28): (1) the 2004 M3 split read Manual 33 + SMG 13 = 46 against a footer of 49: sales whose title says neither gearbox belong to no option and nothing said so.
// The engine now counts them (optionsRemainder: n, dimension, line), read when the answer is served. (2) the Defender 110 year pills printed twice: a headline group that stays one range (state alike)
// was also also listed in refineOptions (the chips), so a page printing both lists printed each pill twice. refineOptions now never repeats itself and marks every repeat of an option ofOptions: true; a page prints options as lines and refineOptions as chips.
// Runs the engine on fake archives and then over a list of answers (fixtures here; the ops task optionssweep runs the same function over every stored answer).
//   node scripts/optionsAddUpCheck.mjs [repo root]
import path from "node:path"; import { fileURLToPath, pathToFileURL } from "node:url";
const root = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
process.chdir(root);
let fail = 0; const ok = (n, c, d) => { if (!c) fail++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`); };
const E = await import(pathToFileURL(path.join(root, "lib/onebox.js")).href);
const { optionProblems } = await import(pathToFileURL(path.join(root, "lib/optionProblems.js")).href).catch(() => ({ optionProblems: () => ["lib/optionProblems.js missing"] }));
ok("optionsFieldsOf exists", typeof E.optionsFieldsOf === "function");
const read = d => ({ ...d, ...(E.optionsFieldsOf ? E.optionsFieldsOf(d) : {}) });
// fixtures: the answers as the engine stored them
const M3 = { poolN: 49, headlineDimension: "gearbox", optionsState: "split", options: [{ dimension: "gearbox", label: "Manual", value: "manual", n: 33 }, { dimension: "gearbox", label: "SMG", value: "auto", n: 13 }], refineOptions: [{ dimension: "body", label: "Coupe", value: "coupe", n: 27 }, { dimension: "body", label: "Convertible", value: "convertible", n: 22 }, { dimension: "mileage", label: "Under 50,000 miles", value: "lt50", n: 11 }] };
const DEF = { poolN: 8, headlineDimension: "year", optionsState: "alike", options: [{ dimension: "year", label: "1985", value: "1985", n: 4 }, { dimension: "year", label: "1986", value: "1986", n: 4 }], refineOptions: [{ dimension: "year", label: "1985", value: "1985", n: 4 }, { dimension: "year", label: "1986", value: "1986", n: 4 }, { dimension: "year", label: "1985", value: "1985", n: 4 }, { dimension: "year", label: "1986", value: "1986", n: 4 }] };
const ADDS = { poolN: 27, headlineDimension: "body", optionsState: "alike", options: [{ dimension: "body", label: "Coupe", value: "coupe", n: 15 }, { dimension: "body", label: "Convertible", value: "convertible", n: 12 }], refineOptions: [] };
const raw = (d) => optionProblems(d), after = (d) => optionProblems(read(d));
ok("2004 M3 as stored: options 46 against 49 with no remainder is a problem", raw(M3).length > 0, raw(M3).join(" | "));
ok("2004 M3 as served: the remainder is 3 and says what it is", after(M3).length === 0 && !!read(M3).optionsRemainder && read(M3).optionsRemainder.n === 3 && /3 sales do not say their gearbox/.test(read(M3).optionsRemainder.line), JSON.stringify(read(M3).optionsRemainder));
ok("Defender 110 as stored: the year pills twice is a problem", raw(DEF).length > 0, raw(DEF).join(" | "));
ok("Defender 110 as served: each pill once in a list, repeats marked ofOptions", after(DEF).length === 0 && (read(DEF).refineOptions || []).every(o => o.ofOptions), JSON.stringify(read(DEF).refineOptions));
ok("options that add up carry no remainder", read(ADDS).optionsRemainder === null && after(ADDS).length === 0);
ok("a body or mileage group that adds up is untouched", read(M3).refineOptions.length === 3);
// the 1986 911 (Sam, Oct 28): Targa 11, Cabriolet 11, Coupe 16 = 38 against 35 in the footer; each option read over its own window. Allowed: options that print their own count and since date. Nothing else.
const opt86 = (label, value, n, low, high, words) => ({ dimension: "body", label, value, n, low, high, median: Math.round((low + high) / 2), rangeFloor: false, windowMonths: 20, windowWords: words, ownWindow: true, windowLonger: true, windowNote: `${n} sales, over the last 20 months` });
const S86 = { poolN: 35, windowWords: "since June 2025", headlineDimension: "body", optionsState: "alike", optionsNote: "Option counts use their own time spans, so they can add up to more than the total.",
  options: [opt86("Targa", "targa", 11, 61000, 82000, "since March 2025"), opt86("Cabriolet", "cabriolet", 11, 58000, 79000, "since March 2025"), opt86("Coupe", "coupe", 16, 52000, 74000, "since April 2025")],
  optionLines: ["Targa $61,000 to $82,000, 11 sales", "Cabriolet $58,000 to $79,000, 11 sales", "Coupe $52,000 to $74,000, 16 sales"], refineOptions: [] };
ok("1986 911 as stored: 38 against 35 and no option says its own window is a problem", optionProblems(S86).length > 0, optionProblems(S86).join(" | "));
const s86 = read(S86);
ok("1986 911 as served: each option line carries its own count and since date", s86.optionLines[0] === "Targa $61,000 to $82,000, 11 sales since March 2025" && s86.optionLines[2] === "Coupe $52,000 to $74,000, 16 sales since April 2025", JSON.stringify(s86.optionLines));
ok("1986 911 as served: no problems, no explanation sentence, no per-option window note", optionProblems(s86).length === 0 && s86.optionsNote === null && s86.options.every(o => o.windowNote === null && o.windowDiffers === true), optionProblems(s86).join(" | "));
ok("each option carries its own line as a field", s86.options[0].ownWindowLine === "11 sales since March 2025", String(s86.options[0].ownWindowLine));
const same = { ...S86, options: S86.options.map(o => ({ ...o, windowWords: "since June 2025" })) };
ok("38 against 35 with every option on the footer's own window still fails after serving", optionProblems(read(same)).length > 0, optionProblems(read(same)).join(" | "));
const hidden = { ...s86, optionLines: S86.optionLines };
ok("an option on its own window whose line does not say so fails", optionProblems(hidden).length > 0, optionProblems(hidden).join(" | "));
const adds = { ...S86, poolN: 38 };
ok("options that add up but read over their own window still print it", optionProblems(adds).length > 0 && optionProblems(read(adds)).length === 0);
// the engine itself, on a fake archive: Defender-like years that stay one range
{ const ev = (row, it) => { const ci = it.indexOf(":"); const alias = ci > 0 && it[ci + 1] !== ":" ? it.slice(0, ci) : null; const expr = alias ? it.slice(ci + 1) : it; if (expr.startsWith("raw_record->>")) { const k = expr.slice(13); const v = row.raw_record[k]; return [alias || k, v == null ? null : String(v)]; } return [alias || expr, row[expr] === undefined ? null : row[expr]]; };
  const likeRe = v => new RegExp("^" + String(v).replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$", "i");
  const rows = []; let n = 0;
  const sale = (year, date, price) => { n++; rows.push({ id: "00000000-0000-4000-8000-" + String(n).padStart(12, "0"), source_id: "d" + n, sale_price: price, sale_date: date, platform: "Bring a Trailer", source_slug: "bringatrailer", make: "Land Rover", model: "Defender 110", year, listing_title: `${year} Land Rover Defender 110`, vin_norm: "V" + n, stated_mileage: null, project_flag: null, desc_facts: null, has_reserve: null, vehicle_type: "car", sale_price_usd: price, raw_record: { featured_image_url: "https://x/i.jpg", mileage: "60000", body_style: null, modifications: null, title: `${year} Land Rover Defender 110`, currency: "USD", transmission: null, exterior_color: null, title_status: null, url: "https://u/" + n, source_url: null, city: "Austin", state: "TX", country_code: "US", auction_end_precision: null } }); };
  const day = i => new Date(Date.now() - i * 864e5).toISOString().slice(0, 10); let i = 0;
  for (const [yr, k, base] of [[1984, 4, 41000], [1985, 4, 50000], [1986, 4, 62000]]) for (let j = 0; j < k; j++) sale(yr, day(20 + i++ * 7), base + j * 900);
  globalThis.fetch = async (url) => { const u = new URL(String(url)); if (u.pathname.endsWith("/sales_archive")) { const sp = u.searchParams, sel = sp.get("select"), sd = sp.getAll("sale_date"); const ge = sd.filter(v => v.startsWith("gte.")).map(v => v.slice(4)), lt = sd.filter(v => v.startsWith("lt.")).map(v => v.slice(3)); const ys = sp.getAll("year"), ymin = Number((ys.find(v => v.startsWith("gte.")) || "gte.0").slice(4)), ymax = Number((ys.find(v => v.startsWith("lte.")) || "lte.9999").slice(4)); const mk = sp.get("make") && likeRe(sp.get("make").replace(/^ilike\./, "")), md = sp.get("model") && likeRe(sp.get("model").replace(/^ilike\./, "")), ti = sp.get("listing_title") && likeRe(sp.get("listing_title").replace(/^ilike\./, "")); const keep = rows.filter(r => (!ge.length || r.sale_date >= ge[0]) && (!lt.length || r.sale_date < lt[0]) && r.year >= ymin && r.year <= ymax && (!mk || mk.test(r.make)) && (!md || md.test(r.model)) && (!ti || ti.test(r.listing_title))); return new Response(JSON.stringify(keep.map(r => Object.fromEntries(sel.split(",").map(it => ev(r, it))))), { status: 200 }); } if (u.hostname.includes("fake.supabase")) return new Response("[]", { status: 200 }); throw new Error("offline"); };
  const env = { supabaseUrl: "https://fake.supabase.test", supabaseKey: "k" };
  const a = await E.oneEngineAnswer({ make: "Land Rover", model: "Defender 110", trim: "", year: 1985, bodyStyle: null }, null, "1985 Land Rover Defender 110", env, null);
  const served = E.withReadFields(a.raw, "1985 Land Rover Defender 110", { year: 1985 });
  ok("served through the read fields: no pill twice and the counts add up", optionProblems(served).length === 0, optionProblems(served).join(" | ") + " " + JSON.stringify((served.refineOptions || []).map(o => o.label)));
}

// e101 (Sam, Oct 29 2026, live Find, 2008 BMW M3 Coupe, See the sales): "Based on 10 sales", then "Under 50,000 miles, 5 sales" and "50,000 to 100,000 miles, 3 sales": 8 of 10 and nothing said about the other 2.
// CAUSE: the remainder rule existed for every dimension but (1) its line named only what a sale "does not say" (a gearbox, a body, its miles), which is false for a sale that states its miles and falls in a band too
// small to list (over 100,000 miles), and (2) the Find card's market took the options and their lines from the served fields but not the remainder, so a card never carried it. The remainder is now worked out on
// the footer's own sales (rawPool) for every option kind and its line names what the sales do not say or which band they fall in; the Find card carries it.
{
  const miles = (n, mi, i0) => Array.from({ length: n }, (_, i) => ({ _usd: 30000 + (i0 + i) * 700, mileage: mi + i * 1000, year: 2008, rtitle: "2008 BMW M3 Coupe", auction_end_date: "2026-03-1" + (i % 9) }));
  const M3C = { poolN: 10, headlineDimension: "mileage", optionsState: "split", windowWords: "since November 2025", rawPool: [...miles(5, 20000, 0), ...miles(3, 60000, 5), ...miles(2, 120000, 8)],
    options: [{ dimension: "mileage", label: "Under 50,000 miles", value: "lt50", n: 5, rangeFloor: true }, { dimension: "mileage", label: "50,000 to 100,000 miles", value: "50to100", n: 3, rangeFloor: true }] };
  ok("2008 M3 coupe as stored: 5 + 3 against 10 with no remainder is a problem", raw(M3C).length > 0, raw(M3C).join(" | "));
  const s = read(M3C);
  ok("2008 M3 coupe as served: a remainder of 2 is sent", !!s.optionsRemainder && s.optionsRemainder.n === 2 && s.optionsRemainder.dimension === "mileage", JSON.stringify(s.optionsRemainder));
  ok("... and its line names the band they fall in, not 'do not state their miles'", !!s.optionsRemainder && /^2 sales are over 100,000 miles\.$/.test(s.optionsRemainder.line), s.optionsRemainder && s.optionsRemainder.line);
  ok("... and the answer adds up", after(M3C).length === 0, after(M3C).join(" | "));
  const unstated = { ...M3C, rawPool: [...miles(5, 20000, 0), ...miles(3, 60000, 5), ...miles(2, 0, 8).map(r => ({ ...r, mileage: null }))] };
  const su = read(unstated); ok("two sales with no stated miles: the line says so", su.optionsRemainder && /^2 sales do not state their miles\.$/.test(su.optionsRemainder.line), su.optionsRemainder && su.optionsRemainder.line);
  const mixed = { ...M3C, poolN: 11, rawPool: [...miles(5, 20000, 0), ...miles(3, 60000, 5), ...miles(2, 120000, 8), { _usd: 31000, mileage: null, year: 2008, rtitle: "2008 BMW M3 Coupe", auction_end_date: "2026-03-05" }] };
  const sm = read(mixed); ok("one band and one unstated: both are named", sm.optionsRemainder && /2 sales are over 100,000 miles\./.test(sm.optionsRemainder.line) && /1 sale does not state its miles\./.test(sm.optionsRemainder.line), sm.optionsRemainder && sm.optionsRemainder.line);
  const body = { poolN: 12, headlineDimension: "body", optionsState: "split", windowWords: "since June 2025", rawPool: [...Array.from({ length: 5 }, (_, i) => ({ _usd: 40000 + i, rtitle: "2008 BMW M3 Coupe", year: 2008 })), ...Array.from({ length: 5 }, (_, i) => ({ _usd: 45000 + i, rtitle: "2008 BMW M3 Convertible", year: 2008 })), ...Array.from({ length: 2 }, (_, i) => ({ _usd: 47000 + i, rtitle: "2008 BMW M3 Sedan", year: 2008 }))],
    options: [{ dimension: "body", label: "Coupe", value: "coupe", n: 5 }, { dimension: "body", label: "Convertible", value: "open", n: 5 }] };
  const sb = read(body); ok("body split: two sedans too few to list are named", sb.optionsRemainder && sb.optionsRemainder.n === 2 && /^2 sales are sedans\.$/.test(sb.optionsRemainder.line) && after(body).length === 0, sb.optionsRemainder && sb.optionsRemainder.line);
  const yr = { poolN: 11, headlineDimension: "year", optionsState: "alike", windowWords: "since June 2025", rawPool: [...[2010, 2011, 2012].flatMap((y, k) => Array.from({ length: k === 2 ? 1 : 5 }, (_, i) => ({ _usd: 30000 + i, year: y, rtitle: y + " BMW M3" })))],
    options: [{ dimension: "year", label: "2010", value: "2010", n: 5 }, { dimension: "year", label: "2011", value: "2011", n: 5 }] };
  const sy = read(yr); ok("year split: the sale from another year is named", sy.optionsRemainder && /^1 sale is from 2012\.$/.test(sy.optionsRemainder.line) && after(yr).length === 0, sy.optionsRemainder && sy.optionsRemainder.line);
  const noPool = { ...M3C, rawPool: [] }; const sn = read(noPool);
  ok("no sales to read: the line says they fall outside the options listed, never a gearbox or miles claim", sn.optionsRemainder && sn.optionsRemainder.n === 2 && /outside the mileage bands listed/.test(sn.optionsRemainder.line) && !/do not (say|state)/.test(sn.optionsRemainder.line), sn.optionsRemainder && sn.optionsRemainder.line);
  const gb = read(M3); ok("gearbox keeps its line ('do not say their gearbox')", gb.optionsRemainder && /do not say their gearbox/.test(gb.optionsRemainder.line), gb.optionsRemainder && gb.optionsRemainder.line);
}

// e101 (Sam, Oct 29 2026, decision: the read time version): "Tiptronic: 17 sales since January 2022" reached almost five years back for a price range. CAUSE: an option's own figures take the window ladder
// (12 months if that holds 8 sales, else 24, else 36, else every sale it has up to 60 months), so an option with few recent sales read years of them. An option whose own window reaches back more than 24 months
// now prints "too few for a range" with the count of its sales inside the footer's window and no range or since date. Read time: the stored option keeps its long-window figures; the post-launch job is the stored
// 24 month window with its own warm.
{
  const row = (title, i) => ({ _usd: 30000 + i * 400, rtitle: title, year: 2004, auction_end_date: "2026-03-1" + (i % 9) });
  const TIP = { poolN: 20, headlineDimension: "gearbox", optionsState: "split", windowWords: "since November 2025", windowMonths: 12,
    rawPool: [...Array.from({ length: 13 }, (_, i) => row("2004 BMW M3 6-Speed Manual", i)), ...Array.from({ length: 5 }, (_, i) => row("2004 BMW M3 Tiptronic", 20 + i)), ...Array.from({ length: 2 }, (_, i) => row("2004 BMW M3", 30 + i))],
    options: [{ dimension: "gearbox", label: "Manual", value: "manual", n: 13, low: 30000, high: 38000, median: 33000, rangeFloor: false, windowMonths: 12, windowWords: "since November 2025", ownWindow: false },
      { dimension: "gearbox", label: "Tiptronic", value: "auto", n: 17, low: 24000, high: 31000, median: 27000, rangeFloor: false, windowMonths: 58, windowWords: "since January 2022", ownWindow: true }] };
  ok("Tiptronic as stored: a range over 58 months is a problem", raw(TIP).some(p => /reaches \d+ months back/.test(p)), raw(TIP).join(" | "));
  const t = read(TIP), tip = (t.options || []).find(o => o.label === "Tiptronic");
  ok("served: no range, rangeFloor, the count inside the footer window (5, not 17)", !!tip && tip.rangeFloor === true && tip.low === null && tip.high === null && tip.n === 5 && tip.windowCapped === true, tip && JSON.stringify({ n: tip.n, low: tip.low, rangeFloor: tip.rangeFloor }));
  ok("served: its line is 'Tiptronic, 5 sales, too few for a range' and says no since date", (t.optionLines || []).includes("Tiptronic, 5 sales, too few for a range") && !(t.optionLines || []).join(" ").includes("January 2022"), (t.optionLines || []).join(" | "));
  ok("served: the options add up to the footer with the remainder (13 + 5 + 2 = 20)", !!t.optionsRemainder && t.optionsRemainder.n === 2 && after(TIP).length === 0, JSON.stringify(t.optionsRemainder) + " " + after(TIP).join(" | "));
  const m24 = { ...TIP, options: [TIP.options[0], { ...TIP.options[1], windowMonths: 22, windowWords: "since January 2025", n: 9 }] };
  const t24 = read(m24).options[1]; ok("an option reaching 22 months keeps its range and its own since date", t24.rangeFloor === false && t24.low === 24000 && !t24.windowCapped);
  const matched = { ...TIP, matchedOption: { dimension: "gearbox", value: "auto", label: "Tiptronic", inHeadline: true, n: 17, low: 24000, high: 31000 } };
  const tm = read(matched).matchedOption; ok("the matched option carries the capped count and no range", tm && tm.n === 5 && tm.low === null && tm.high === null && tm.line === "Tiptronic, 5 sales, too few for a range", tm && JSON.stringify(tm));
}

// e101 (Lane B, Oct 29 2026, the 2002 Firebird Trans Am WS6: Manual 8 and Automatic 8 against a footer of 15, one window). CAUSE (from the live read): the footer used 15 of 18 qualifying sales (3 set aside as odd
// sales above the range); each option is figured from its own cohort, so a repeat sale of one car (the pool holds a "158-Mile ... 6-Speed" coupe sold at $67,000 and again at $80,000) or a set-aside sale can sit in an
// option and not in the footer: the options add to 16, and one sale cannot be in two gearboxes. FIX: options on the footer's own window that add up to more than the footer are recounted from the footer's own sales.
{
  const row = (title, i) => ({ _usd: 24000 + i * 700, rtitle: title, year: 2002, auction_end_date: "2026-03-1" + (i % 9) });
  const FB = { poolN: 15, headlineDimension: "gearbox", optionsState: "split", windowWords: "since November 2025", windowMonths: 12,
    rawPool: [...Array.from({ length: 8 }, (_, i) => row("2002 Pontiac Firebird Trans Am WS6 Coupe 6-Speed Manual", i)), ...Array.from({ length: 7 }, (_, i) => row("2002 Pontiac Firebird Trans Am WS6 Coupe Automatic", 20 + i))],
    options: [{ dimension: "gearbox", label: "Manual", value: "manual", n: 8, low: null, high: null, median: 27000, rangeFloor: true, windowMonths: 12, windowWords: "since November 2025", ownWindow: true },
      { dimension: "gearbox", label: "Automatic", value: "auto", n: 8, low: null, high: null, median: 30000, rangeFloor: true, windowMonths: 12, windowWords: "since November 2025", ownWindow: true }] };
  ok("Firebird as stored: 8 + 8 against 15 on one window is a problem", raw(FB).some(p => /options add to 16, footer 15/.test(p)), raw(FB).join(" | "));
  const f = read(FB), fo = f.options || [];
  ok("Firebird as served: the options are recounted from the footer's sales (8 + 7 = 15)", fo.length === 2 && fo[0].n + fo[1].n === 15 && fo.find(o => o.label === "Automatic").n === 7 && after(FB).length === 0, fo.map(o => o.label + " " + o.n).join(", ") + " " + after(FB).join(" | "));
  ok("... and the lines say so", (f.optionLines || []).join(" | ").includes("Automatic, 7 sales"), (f.optionLines || []).join(" | "));
  const THIN36 = { poolN: 20, headlineDimension: "mileage", optionsState: "split", windowWords: "since October 2023", windowMonths: 36,
    rawPool: Array.from({ length: 20 }, (_, i) => ({ _usd: 30000 + i * 300, mileage: i < 10 ? 20000 + i * 1000 : 70000 + i * 1000, rtitle: "2008 BMW M3 Coupe", year: 2008, auction_end_date: "2024-03-1" + (i % 9) })),
    options: [{ dimension: "mileage", label: "Under 50,000 miles", value: "lt50", n: 10, low: 30000, high: 33000, median: 31000, rangeFloor: false, windowMonths: 36, windowWords: "since October 2023", ownWindow: true },
      { dimension: "mileage", label: "50,000 to 100,000 miles", value: "50to100", n: 10, low: 33000, high: 36000, median: 34000, rangeFloor: false, windowMonths: 36, windowWords: "since October 2023", ownWindow: true }] };
  const th = read(THIN36).options; ok("a thin pool read over 36 months: options that share the footer's window keep their range (the cap is for an option's OWN longer window)", th.every(o => !o.windowCapped && o.rangeFloor === false && o.low != null), th.map(o => o.label + " " + o.rangeFloor).join(", "));
}
process.exit(fail ? 1 : 0);
