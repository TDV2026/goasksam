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
process.exit(fail ? 1 : 0);
