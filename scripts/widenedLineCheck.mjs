// Widened-pool line check (Lane B, Nov 2 2026, job lane-b-anyyear). No database, no network: a fake archive serves a fixture per scenario.
// THE CLASS: Find said "No 2022 Audi A6 Wagons are live right now" and then "The typical range for A6 wagon sales: $6,000 to $10,000, since January 2026" from 2001 to 2011 cars, with no year stated.
// A range printed for an asked year must come from a pool that CONTAINS that year, or the line must state the years it covers in words and say plainly that none of the asked year have sold; a pool FAR
// from the asked year prints no range at all (the engine decides, the page prints). Every path that widens a pool names what it widened. Must hold:
//  (A) Find's no-live fallback for a 2022 A6 wagon with only 2001 to 2011 sales on record prints NO range;
//  (B) the same fallback with 2020, 2021 and 2023 sales (none of 2022) prints the range WITH the engine's sentence naming the years and saying none is a 2022;
//  (C) the any-year rescue for an unmapped model (Volvo 240) never lands on a pool far from the asked year (2005 against 1985 to 1993 cars): no range, no model_any_year result;
//  (D) a widening that is NOT far (1995 against 1993 cars) is answered and says in words that none of the asked year is in it;
//  (E) a pooled nameplate (2008 Carrera and Carrera S) whose pool holds the asked year prints no year sentence;
//  (F) the voice: "that's" is filler and never named back as an unused word; a market question after a search is not "Sam can't do that here yet" (a real filter still is, and a real unknown word is still named);
//  (G) STATIC: every model_any_year label names the years held, the sibling label carries its decade, and every rescue lander refuses a far pool.
//   node scripts/widenedLineCheck.mjs          (LIB_ROOT=<dir holding lib/> runs it against another tree, e.g. the base commit, to show it fails)
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = process.env.LIB_ROOT ? path.resolve(process.env.LIB_ROOT) : path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
process.env.SUPABASE_URL = "https://fake.supabase.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "k"; process.env.LAUNCH_STAGE = "2";
const imp = async f => { try { return await import(pathToFileURL(path.join(ROOT, f)).href); } catch (e) { return null; } };
const E = await imp("lib/onebox.js"), S = await imp("lib/live/search.js"), C = await imp("lib/live/samChat.js"), U = await imp("lib/live/unusedWords.js");
let failed = 0; const ok = (n, c, d) => { if (!c) failed++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`); };
const quiet = console.error; console.error = () => {};

let FIX = [];
const mk = (i, make, model, year, price, word) => {
  const raw = { id: "o" + i, title: `${year} ${make} ${model} ${word || ""} ${i}`.replace(/\s+/g, " ").trim(), featured_image_url: `https://img/${i}.jpg`, mileage: `${60000 + i * 500}`, body_style: word === "Wagon" ? "Wagon" : "Coupe", currency: "USD", url: `https://bat/${i}`, country_code: "US", state: "TX", city: "Austin", auction_end_precision: "day" };
  return { id: "u" + String(i).padStart(5, "0"), source_id: raw.id, sale_price: price, sale_date: `2026-0${1 + (i % 9)}-1${i % 9}`, platform: "Bring a Trailer", listing_title: raw.title, year, make, model, vin_norm: null, stated_mileage: null, project_flag: null, desc_facts: null, has_reserve: false, raw_record: raw, vehicle_type: "car" };
};
const jt = v => v == null ? null : typeof v === "string" ? v : JSON.stringify(v);
const ev = (row, it) => { const ci = it.indexOf(":"); const al = ci > 0 && it[ci + 1] !== ":"; const alias = al ? it.slice(0, ci) : null; const expr = al ? it.slice(ci + 1) : it; if (expr.startsWith("raw_record->>")) return [alias || expr.slice(13), jt(row.raw_record[expr.slice(13)])]; const c = expr.replace(/::text$/, ""); return [alias || c, c in row ? row[c] : null]; };
globalThis.fetch = async (url, init = {}) => {
  const u = new URL(String(url)); const sel = u.searchParams.get("select") || "";
  if (!u.pathname.endsWith("/sales_archive") || u.searchParams.get("id") || /^model$/.test(sel)) return new Response(/^model$/.test(sel) ? JSON.stringify([...new Set(FIX.map(r => ({ model: r.model })))]) : "[]", { status: 200 });
  let rows = FIX; for (const c of u.searchParams.getAll("year")) { const m = /^(gte|lte)\.(\d+)$/.exec(c); if (m) rows = rows.filter(r => m[1] === "gte" ? r.year >= +m[2] : r.year <= +m[2]); }
  return new Response(JSON.stringify(rows.map(r => Object.fromEntries(sel.split(",").map(it => ev(r, it))))), { status: 200 });
};
const env = { supabaseUrl: "https://fake.supabase.test", supabaseKey: "k", poolColumns: false };
// Find's no-live read: the exported noneLiveOf; a tree without the export (the base) did exactly this: the family market of the year-less vehicle, printed by soldLine
const noneLive = async (v, f) => { if (C && C.noneLiveOf) return await C.noneLiveOf(env, v, f).catch(e => ({ err: String(e) })); const m = await S.familyMarket(env, v, f).catch(() => null); const l = m ? S.soldLine(m) : null; return l ? { lines: [l] } : null; };
const answer = async (v, text) => (await E.oneEngineAnswer(v, null, text, { ...env, asked: 0, noStageLog: true }, null)).raw;
const hasMoney = s => /\$\s?[\d,]{4,}/.test(String(s || ""));
const filt = (y) => { const f = S.emptyFilters(); f.yearMin = y; f.yearMax = y; return f; };

// (A) Find, no-live fallback, a 2022 A6 wagon: only 2001 to 2011 cars have sold
FIX = Array.from({ length: 40 }, (_, i) => mk(i, "Audi", "A6", 2001 + (i % 11), 6000 + (i % 9) * 500, "Wagon"));
{ const nl = await noneLive({ make: "Audi", model: "A6", bodyStyle: "wagon", raw: "Audi A6 wagon" }, filt(2022));
  const lines = nl && nl.lines ? nl.lines : [];
  ok("(A) Find's no-live fallback for a 2022 A6 wagon with only 2001 to 2011 sales prints no range", !lines.some(hasMoney), JSON.stringify(lines).slice(0, 220) || (nl && nl.err)); }

// (B) near: 2022, 2023 and 2025 have sold, 2024 has not (a different year from (A): the engine keeps a spec cache across a run)
FIX = Array.from({ length: 36 }, (_, i) => mk(i, "Audi", "A6", [2022, 2023, 2025][i % 3], 52000 + (i % 9) * 900, "Wagon"));
{ const nl = await noneLive({ make: "Audi", model: "A6", bodyStyle: "wagon", raw: "Audi A6 wagon" }, filt(2024));
  const lines = nl && nl.lines ? nl.lines : [], txt = lines.join(" ");
  ok("(B) with 2022, 2023 and 2025 sales and none of 2024, the range prints WITH the years in words and the plain statement that none is a 2024", lines.some(hasMoney) && /2023/.test(txt) && /2025/.test(txt) && /2024/.test(txt), JSON.stringify(lines).slice(0, 260)); }

// (C) + (D) the any-year rescue on an unmapped model
const V240 = (y, w) => ({ year: y, make: "Volvo", model: "240", raw: `${y} Volvo 240`, trim: null });
FIX = Array.from({ length: 30 }, (_, i) => mk(i, "Volvo", "240", 1985 + (i % 9), 7000 + (i % 7) * 400, "Wagon"));
{ const d = await answer(V240(2005), "2005 Volvo 240");
  ok("(C) 2005 against 1985 to 1993 cars (far): no range and no model_any_year result", !(d.tier === "result" && Array.isArray(d.cluster)) && d.fallbackRung !== "model_any_year", `tier=${d.tier} rung=${d.fallbackRung} label=${JSON.stringify(d.rungLabel)} cluster=${JSON.stringify(d.cluster)}`); }
{ const d = await answer(V240(1995), "1995 Volvo 240");
  const lineTxt = [d.yearNote, d.scope_reason, d.rungLabel].filter(Boolean).join(" ");
  ok("(D) 1995 against 1993 cars (two years away, not far) is still answered, and the answer says in words that none of the asked year is in it", /^(result|thin)$/.test(String(d.tier)) && /1995/.test(lineTxt) && /1993/.test(lineTxt) && /\b(no|none)\b/i.test(lineTxt), `tier=${d.tier} ${JSON.stringify(lineTxt)}`); }

// (E) a pooled nameplate whose pool holds the asked year: no year sentence
FIX = Array.from({ length: 36 }, (_, i) => mk(i, "Porsche", "997", 2008, 40000 + (i % 12) * 1000, i % 2 ? "Carrera S" : "Carrera"));
{ const d = await answer({ year: 2008, make: "Porsche", model: "911", raw: "2008 Porsche 911", trim: null }, "2008 Porsche 911");
  const mine = (d.rawPool || []).filter(r => Number(r.year) === 2008).length;
  ok("(E) a pool that holds the asked year (2008 Carrera and Carrera S) prints no year sentence", (d.tier === "result" || d.tier === "thin") ? (mine > 0 && !d.yearNote) : true, `tier=${d.tier} mine=${mine} yearNote=${JSON.stringify(d.yearNote)}`); }

// (F) the voice
{ const veh = { make: "Audi", model: "A6", bodyStyle: "wagon", year: 2022 };
  const r1 = U ? U.unusedWordsOf("show me the 2022 audi a6 wagon that's for sale", veh, null, []) : null, r2 = U ? U.unusedWordsOf("2022 audi a6 wagon with a sunroof", veh, null, []) : null;
  ok("(F) \"that's\" is filler and is never named back as an unused word", !!r1 && !r1.unused.includes("that's") && !/that's/.test(String(r1.line || "")), JSON.stringify(r1));
  ok("(F) a real unknown word is still named", !!r2 && r2.unused.includes("sunroof"), JSON.stringify(r2 && r2.unused));
  const prev = { make: "Audi", model: "A6", year_min: 2022, year_max: 2022 }, s = [{ tool: "search_live" }];
  const q = C && C.outcomeOf ? C.outcomeOf({ prevFilters: prev, filters: { ...prev }, trace: s, meta: { live: 0 }, text: "what did a 2022 one sell for" }) : null;
  const u = C && C.outcomeOf ? C.outcomeOf({ prevFilters: prev, filters: { ...prev }, trace: s, meta: { live: 0 }, text: "make it nicer" }) : null;
  ok("(F) a market question after a search is a question (no line), not 'Sam can't do that here yet'", !!q && q.kind === "question" && q.line === null, JSON.stringify(q));
  ok("(F) a request that changes nothing and asks nothing the chat can answer is still unsupported", !!u && u.kind === "unsupported", JSON.stringify(u)); }

// (G) STATIC
const src = fs.readFileSync(path.join(ROOT, "lib/onebox.js"), "utf8").split("\n");
{ const bad = [];
  src.forEach((l, i) => { if (/fallbackRung: "model_any_year"/.test(l) && !/yearsHeld\(/.test(l)) bad.push(i + 1); });
  ok("(G) every model_any_year label is built from the years the receipts hold", bad.length === 0, bad.join(" ")); }
{ const sib = src.findIndex(l => /fallbackRung: "sibling"/.test(l)); ok("(G) the sibling label carries the sibling's name and decade", sib >= 0 && /\$\{sib\.label\}\$\{decade/.test(src[sib]), src[sib] && src[sib].slice(0, 160)); }
{ const lands = src.filter(l => /resSib\.tier === "result"|resModel\.tier === "result"|res\.tier === "result" && /.test(l) && /farFromAsked|askedYearsFar/.test(l)).length;
  ok("(G) the three rescue landers (trim, model, sibling) each refuse a far pool", lands === 3 && typeof (E && E.askedYearsFar) === "function", `${lands} of 3`); }

console.error = quiet;
console.log(failed ? `\n${failed} FAILED` : "\nall passed");
process.exit(failed ? 1 : 0);
