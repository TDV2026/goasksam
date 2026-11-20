// FOR SALE: WHAT FIND'S ANSWER CARRIES (Lane D, lane-d-forsale, Nov 2026). The two groups beside the live auctions, dealers and classifieds, each with its count, and the four counts for the pills.
// Everything here is the engine's: the rules (lib/forsale/rules.js), the match (the SAME searchLive an auction goes through, run over these rows), the words (the finished read stored by the scheduled prepare job). A page prints it and computes nothing.
// A request reads only our own table (for_sale_listings): no vendor call, no engine run, no sales read. An asking price is said only as an asking price and is read by nothing that builds a sold range, pool or count.
import { searchLive, parseQueryResolved, emptyFilters } from "../live/search.js";
import { decodeCar, carWords } from "../carToken.js";
import { ENGINE_VERSION } from "../onebox.js";
import { reasonLine } from "../reasonWords.js";
import { supabaseSelectAll } from "../_supabase.js";
import { forSaleActive } from "./gate.js";
import { heldBack, onePerCar, liveShape, typeWord } from "./rules.js";
import { loadStates, liveSources } from "./sync.js";

export const MEMO_MS = 120000;       // one read of the table per instance per two minutes: a Find request reads memory, not the database
export const CARDS_SHOWN = 24;       // cards a group carries; the group's own count says how many match
let memo = { at: 0, key: "", rows: null, flight: null };
export function forSaleReset() { memo = { at: 0, key: "", rows: null, flight: null }; }

async function countOf(env, query) {
  try {
    const r = await fetch(`${env.supabaseUrl}/rest/v1/for_sale_listings?${query}&select=id`, { method: "HEAD", headers: { apikey: env.supabaseKey, Authorization: `Bearer ${env.supabaseKey}`, Prefer: "count=exact", Range: "0-0" } });
    const m = /\/(\d+)$/.exec(r.headers.get("content-range") || ""); return m ? Number(m[1]) : null;
  } catch { return null; }
}

// The servable listings: stored rows that pass every rule (heldBack), one per car. Reads the table once per MEMO_MS.
// A row's own last_seen is not a freshness test (presence rechecks do not reach us): the stale poll hides what the vendor has not seen for 24 hours, and a source whose change poll or stale poll has not finished within the lapse window
// (data/forsaleBudget.json sync.lapse_hours, 30) is not served at all. The state of the sync unreadable: nothing is served.
export async function servableRows(env, now = Date.now()) {
  const key = String(env.supabaseUrl || "") + "|" + ENGINE_VERSION;
  if (memo.rows && memo.key === key && now - memo.at < MEMO_MS) return memo.rows;
  if (memo.flight && memo.key === key) return memo.flight;
  memo.key = key;
  memo.flight = (async () => {
    const states = await loadStates(env);
    if (states == null) throw new Error("for_sale sync state unreadable");
    const ctx = { live: liveSources(states, now) };
    const all = await supabaseSelectAll(env, `for_sale_listings?gone=eq.false&resolve_state=eq.resolved&select=*&order=id.asc`);
    if (all == null) throw new Error("for_sale_listings unreadable");
    const why = {}; const ok = [];
    for (const r of all) { const h = heldBack(r, now, ENGINE_VERSION, ctx); if (h) why[h] = (why[h] || 0) + 1; else ok.push(r); }
    const [unresolved, unreadyCar] = await Promise.all([countOf(env, "gone=eq.false&resolve_state=eq.unresolved"), countOf(env, "gone=eq.false&resolve_state=is.null")]);
    const one = onePerCar(ok);
    const rows = one.rows.slice().sort((a, b) => (Date.parse(b.last_seen) || 0) - (Date.parse(a.last_seen) || 0) || a.id - b.id);
    rows.inventory = { servable: rows.length, twins: one.droppedAsTwin, held_back: why, unresolved, resolve_pending: unreadyCar, sources_live: [...ctx.live].sort() };
    memo = { at: now, key, rows, flight: null };
    return rows;
  })().catch(e => { memo.flight = null; throw e; });
  return memo.flight;
}

const usd = n => "$" + Math.round(Number(n)).toLocaleString("en-US");
const hostOf = u => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return null; } };

// ONE CARD, in finished words. x: a match from searchLive over liveShape rows (x.r._fs is the stored row).
export function cardOf(x) {
  const row = x.r._fs, car = row.car || {}, price = Number(row.asking_price_usd);
  const asking = reasonLine("forsale.asking", { price });
  return {
    id: "fs-" + row.id, kind: row.source_type, typeWord: typeWord(row.source_type),
    name: car.name || row.title,
    asking: price, askingLine: asking.replace(/\.$/, ""),
    miles: Number(row.mileage) > 0 ? Number(row.mileage) : null, milesLine: Number(row.mileage) > 0 ? Math.round(Number(row.mileage)).toLocaleString("en-US") + " miles" : null,
    location: row.location || null, url: row.url || null, host: hostOf(row.url), image: row.image_url || null,
    read: asking + " " + (row.read && row.read.sold_line || ""),
    readKind: row.read ? row.read.kind : null,
    historyLine: row.history && row.history.none === false && row.history.line ? row.history.line : null,
    car: { year: car.year || row.year || null, make: car.make || row.make || null, model: car.model || row.model || null, trim: car.trim || null, generation: car.generation || null },
    source: row.source
  };
}

// THE GROUPS FOR ONE SEARCH. match(rows): the SAME search Find ran over the auctions, given these rows instead (searchLive for a car, searchAll for a search with no make); auctions: the auction match count Find already has.
// null when the switch is off for this request (a visitor's answer carries nothing of this).
// opts.more = { group: "dealers" | "classifieds", offset }: SHOW MORE for one group, by the same road the auctions use (buySearch action "more"): the SAME search, the SAME rules and the SAME order, the next batch of that group after the `offset` cars
// the page already draws. Only the asked group carries cards; the counts are the same four. Every group says how many it holds (count), how many are drawn after this answer (shown), how many are left (remaining) and how many the next ask returns (nextN, never a number of the page's own).
export async function forSaleFor(env, match, auctions, opts = {}) {
  if (!forSaleActive()) return null;
  const now = opts.now || Date.now();
  let rows;
  try { rows = await servableRows(env, now); } catch (e) { console.error("forSale:", e && e.message); return null; }   // an unreadable table serves no for-sale group; the auctions are untouched
  const live = rows.map(r => liveShape(r, true));
  const sr = await match(live);
  const mine = (sr.rows || []).filter(x => x && x.r && x.r._fs);
  const more = opts.more && (opts.more.group === "dealers" || opts.more.group === "classifieds") ? { group: opts.more.group, offset: Math.max(0, Math.min(100000, Math.floor(Number(opts.more.offset) || 0))) } : null;
  const mk = (type, name) => {
    const list = mine.filter(x => x.r._fs.source_type === type), from = more && more.group === name ? more.offset : 0;
    const batch = more && more.group !== name ? [] : list.slice(from, from + CARDS_SHOWN), shown = more && more.group !== name ? 0 : Math.min(list.length, from + batch.length);
    return { count: list.length, shown, remaining: Math.max(0, list.length - shown), nextN: Math.min(CARDS_SHOWN, Math.max(0, list.length - shown)), offset: from, cards: batch.map(cardOf) };
  };
  const dealers = mk("dealer", "dealers"), classifieds = mk("classified", "classifieds"), a = Math.max(0, Number(auctions) || 0);
  const dflt = opts.default === "dealers" || opts.default === "classifieds" || opts.default === "all" || opts.default === "auctions" ? opts.default : "auctions";   // the group the words asked for (lib/live/search.js pill words); no word: auctions
  return { default: dflt, counts: { all: a + dealers.count + classifieds.count, auctions: a, dealers: dealers.count, classifieds: classifieds.count }, dealers, classifieds, ...(more ? { more: more.group } : {}), inventory: more ? null : rows.inventory || null };
}

// MARKET CHECK'S ONE LINE: "20 for sale now: 3 at auction, 12 at dealers, 5 classifieds" for the car (the counts of Find's own search for that car), or null when there are none or the switch is off.
export function forSaleCountLine(counts) {
  if (!counts) return null;
  const a = counts.auctions || 0, d = counts.dealers || 0, c = counts.classifieds || 0, n = a + d + c;
  if (!(n > 0)) return null;
  const parts = `${a} at auction, ${d} at ${d === 1 ? "a dealer" : "dealers"}, ${c} ${c === 1 ? "classified" : "classifieds"}`;
  return reasonLine("forsale.count", { n, parts });
}

// MARKET CHECK'S ONE SERVED LINE (crew, behind FORSALE_PUBLIC), under the range: the counts of FIND'S OWN SEARCH for this car (the same car, read the same way: parseQueryResolved on the car's own token, then searchLive for the
// auctions and forSaleFor for the dealers and classifieds), as the engine's words and the address of Find for that car. An answer with no served car, or none for sale, is returned as it came. Never throws.
export async function withForSaleLine(env, answer) {
  try {
    if (!forSaleActive() || !answer || typeof answer !== "object" || !answer.car || !answer.car.token || !/^(result|thin)$/.test(String(answer.tier || ""))) return answer;
    const car = decodeCar(answer.car.token), w = car && carWords(car); if (!w || !car.model) return answer;
    const fenv = { supabaseUrl: env.supabaseUrl, supabaseKey: env.supabaseKey, car };
    const parsed = await parseQueryResolved(w.label, fenv), v = parsed.vehicle; if (!v || !v.make) return answer;
    const f = parsed.filters || emptyFilters();
    // THE YEARS COME FROM THE ANSWER HANDED IN (its own poolYears, else the typed year, the window Find uses when no sales read stands behind it): this line never runs a market read of its own, so it can
    // never fill the shared spec market cache or run the engine a second time for the car (a Sell answer for a family car was followed by a second read of it, and its variants' reads came back changed).
    const py = Array.isArray(answer.poolYears) && answer.poolYears.length === 2 && answer.poolYears.every(n => Number(n) > 0) ? answer.poolYears.map(Number) : null;
    const yw = py ? { yearMin: py[0], yearMax: py[1], basis: "answer" } : Number(v.year) ? { yearMin: Number(v.year), yearMax: Number(v.year), basis: "typed year" } : null;
    const so = yw ? { yearWindow: yw } : {};
    const auc = await searchLive(env, v, f, parsed.text, so);
    const g = await forSaleFor(env, rowsIn => searchLive(env, v, f, parsed.text, { ...so, rows: rowsIn }), (auc.rows || []).length);
    const line = g && forSaleCountLine(g.counts);
    if (!line) return answer;
    return { ...answer, forSaleLine: line, forSaleCounts: g.counts, forSaleLink: "/find?car=" + encodeURIComponent(answer.car.token) };
  } catch (e) { console.error("forSaleLine:", e && e.message); return answer; }
}
