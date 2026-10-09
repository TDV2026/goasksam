// Cross-product engine check (Oct 2026, Lane B). Read-only, zero writes, zero OldCarsData spend
// (archive-only). Proves Buy, Sell, Market Check and Tasks read the SAME shared-archive pool for
// the same car, by calling the exact server-side functions each product calls - not a second,
// hand-rolled implementation of any of them.
//
// NAMING NOTE: Sam's instruction named this file scripts/engineCheck.js, but that path already
// held a different, still-live tool (Oct 6, "Sweep batch 1 followup") - a Puppeteer harness that
// checks One Box vs /sell vs Desk agreement on resolvedCar/tier/halo-exclusion against the
// deployed site, with its own Shelby Cobra/halo-family regression rows. That file is untouched.
// This one lives at scripts/crossProductCheck.js instead.
//
//   node scripts/crossProductCheck.js                 run the built-in 20-spec list, print the table
//   node scripts/crossProductCheck.js --specs="a|b"    run a custom pipe-separated spec list
//   node scripts/crossProductCheck.js --json           machine-readable output (for the ops task)
//
// Exit code 1 on any MISMATCH row (CI/nightly-friendly); 0 when every spec matches across lanes.
//
// THE FOUR LANES, each calling the real product's own function (not a copy):
//   Market Check - lib/onebox.js runOneBox(), the One Box engine every Market Check search runs.
//   Buy          - lib/live/search.js familyMarket() -> listingMarket() -> walkLadder()/coreOf(),
//                  the SAME empty-state market read api/buySearch.js calls when a search has no
//                  live matches right now (the common case for a fixed, non-live spec).
//   Sell         - lib/platformPick.js fetchOnlinePool(), the shared archive pool
//                  buildSharedAnalysis() (the SELL_PICK_SHARED cutover, Oct 2026) aggregates from.
//   Tasks        - lib/tasks/tasks.js imports runSearch() from lib/live/samChat.js for LIVE-listing
//                  matching (a different kind of pool - cars for sale RIGHT NOW, not sold comps),
//                  and itself carries no separate sold-comps read. When a Tasks search has no live
//                  match (the common case here too), Buy's own empty-state falls back to the SAME
//                  familyMarket() this script already calls for the Buy lane - so "Tasks' match
//                  pool" is tested as that same shared fallback, which is what a Tasks notification
//                  would show for context. This is documented, not hidden: if Tasks ever grows its
//                  own sold-comps read, point this lane at it instead.
//
// ABROAD RULE: isAbroadRow() (lib/live/search.js) is the ONE exported function Buy, Tasks and
// Market Check's live panel all import for hiding non-US live listings - verified here by import
// grep (a single shared function has no per-product value to diverge on) plus one live
// liveForFamily() call per spec, reported as a data point (total live matches found vs abroad-
// hidden), not a MATCH/MISMATCH field (there is only one implementation to call).

import { resolveVehicle } from "../lib/vehicle.js";
import { findGeneration } from "../lib/generations.js";
import { runOneBox } from "../lib/onebox.js";
import { familyMarket, liveForFamily, emptyFilters } from "../lib/live/search.js";
import { fetchOnlinePool } from "../lib/platformPick.js";
import { hammerUsd } from "../lib/_houseComps.js";
import { supabaseEnv } from "../lib/_supabase.js";

export const DEFAULT_SPECS = [
  "2008 Porsche 911 Carrera", "2009 Porsche 911 Carrera S Coupe", "1995 Porsche 993 Carrera",
  "1967 Ford Mustang Fastback", "1990 Chevrolet Corvette ZR-1", "1969 Chevrolet Camaro Z28",
  "2016 Ford Mustang Shelby GT350", "2006 Mercedes-Benz CLK DTM", "1990 Lamborghini Countach",
  "2000 Porsche Boxster S", "2012 BMW M3 Competition Coupe", "2022 BMW M3 Competition",
  "1973 Porsche 911 Carrera RS", "1989 Porsche 911 Speedster", "2024 Porsche 911 GT3",
  "2019 Porsche 911 Turbo S", "1965 Shelby Cobra", "1970 Datsun 240Z", "1991 Acura NSX",
  "2005 Ford GT"
];

const round = n => (Number.isFinite(n) ? Math.round(n) : null);

// Normalizes any lane's "last three" into {date, title, price} for comparison - dates are what
// matters (the same physical sale should land on the same day regardless of which lane found it).
function normRecent(list, shape) {
  return (list || []).slice(0, 3).map(c => {
    if (shape === "cards") return { date: (c.date || "").slice(0, 10), title: c.title || null, price: Number.isFinite(c.price) ? round(c.price) : null };
    if (shape === "pool") return { date: String(c.auction_end_date || "").slice(0, 10), title: String(c.rtitle || c.raw_title || "").trim() || null, price: round(c._usd) };
    return { date: null, title: null, price: null };
  });
}
function datesOf(recent) { return (recent || []).map(r => r.date).filter(Boolean); }

// ---- Lane 1: Market Check (runOneBox direct) ----
async function marketCheckLane(vehicle, generation, searchText, env) {
  const d = await runOneBox(vehicle, generation, searchText, env, null);
  if (!d || !d.tier) return { ok: false, reason: "no tier" };
  const tier = d.tier;
  if (!/^(result|thin|class_era|refusal)$/.test(tier)) return { ok: false, reason: `tier=${tier} (a question, not an answer - spec needs a year/trim to disambiguate)` };
  const label = [d.resolvedCar?.genCode, d.resolvedCar?.model, d.resolvedCar?.trim].filter(Boolean).join(" ") || vehicle.model || null;
  // Mirror lib/live/search.js marketOf() exactly: a "range" low/high exists ONLY when
  // d.tier === "result" && Array.isArray(d.cluster) (8+ solid sales, rule 24's cluster gate).
  // d.span is the full outlier-inclusive min-max, a DIFFERENT statistic Buy/Tasks never surface
  // as low/high - comparing span against Buy's cluster-sourced low/high is apples-to-oranges and
  // was producing false MISMATCH rows. Below the cluster gate, report no range (count-only), same
  // as marketOf()'s own fallback.
  const hasCluster = d.tier === "result" && Array.isArray(d.cluster);
  const low = hasCluster ? d.cluster[0] : null;
  const high = hasCluster ? d.cluster[1] : null;
  const count = d.poolN ?? (d.thin ? d.thin.n : null) ?? (Array.isArray(d.cards) ? d.cards.length : null);
  const cards = Array.isArray(d.cards) ? d.cards : [];
  const latest = cards.map(c => (c.date || "").slice(0, 10)).filter(Boolean).sort().at(-1) || null;
  const recent = normRecent(Array.isArray(d.recent3) ? d.recent3 : cards, "cards");
  const span = Array.isArray(d.span) ? [round(d.span[0]), round(d.span[1])] : null;
  return { ok: true, tier, label, low, high, count, latest, recent, span };
}

// ---- Lane 2 & 4: Buy / Tasks (familyMarket -> listingMarket -> walkLadder, the real empty-state read) ----
async function buyLane(env, v, f) {
  const m = await familyMarket(env, v, f);
  if (!m) return { ok: false, reason: "no market read (listingMarket returned null)" };
  if (m.kind === "pending") return { ok: false, reason: "pending (spec_market_cache miss, engine call in flight)" };
  const label = m.short || m.family || null;
  const low = m.kind === "range" ? m.low : (m.span ? m.span[0] : null);
  const high = m.kind === "range" ? m.high : (m.span ? m.span[1] : null);
  const count = m.count ?? null;
  const recent = normRecent(m.recent, "cards");
  const latest = datesOf(recent).sort().at(-1) || null;
  return { ok: true, kind: m.kind, label, low, high, count, latest, recent };
}

// ---- Lane 3: Sell (fetchOnlinePool, the shared pool buildSharedAnalysis aggregates from) ----
async function sellLane(vehicle, generation, env) {
  const { spec, pool, cluster } = await fetchOnlinePool(vehicle, generation, env);
  if (!spec) return { ok: false, reason: "no spec (vehicle did not resolve to a buildable spec)" };
  if (!pool.length) return { ok: false, reason: "empty pool (genuinely zero online sales on record)" };
  const priced = pool.map(r => ({ ...r, _usd: Number.isFinite(r._usd) ? r._usd : hammerUsd(r) })).filter(r => Number.isFinite(r._usd) && r._usd > 0);
  if (!priced.length) return { ok: false, reason: "pool had rows but none priced" };
  const prices = priced.map(r => r._usd);
  const label = [generation?.code, vehicle.model, spec.trim].filter(Boolean).join(" ") || vehicle.model || null;
  const sorted = priced.slice().sort((a, b) => String(b.auction_end_date || "").localeCompare(String(a.auction_end_date || "")));
  const recent = normRecent(sorted, "pool");
  // fetchOnlinePool now reads runOneBox's own ladder (Oct 2026 "one engine ladder" fix), so it
  // carries the SAME cluster band Market Check/Buy/Tasks use for low/high - prefer it here too, same
  // gate as marketOf() (lib/live/search.js): a real cluster only exists at 8+ solid sales. The
  // unclipped span is still carried (as `span`) for diagnostic context, never compared.
  const span = [round(Math.min(...prices)), round(Math.max(...prices))];
  const hasCluster = Array.isArray(cluster);
  const low = hasCluster ? round(cluster[0]) : null, high = hasCluster ? round(cluster[1]) : null;
  return { ok: true, label, low, high, span, count: priced.length, latest: (sorted[0]?.auction_end_date || "").slice(0, 10) || null, recent };
}

// ---- comparison ----
const pctDiff = (a, b) => (a == null || b == null || a === 0) ? (a !== b) : Math.abs(a - b) / Math.abs(a) > 0.1;
function compareField(name, values) {
  const present = Object.entries(values).filter(([, v]) => v !== undefined && v !== null);
  if (present.length < 2) return { field: name, status: "N/A", detail: "fewer than 2 lanes answered" };
  if (name === "low" || name === "high" || name === "count") {
    const nums = present.map(([, v]) => v);
    const mismatch = nums.some(n => pctDiff(nums[0], n));
    return { field: name, status: mismatch ? "MISMATCH" : "MATCH", detail: present.map(([k, v]) => `${k}=${v}`).join(" ") };
  }
  if (name === "latest") {
    const strs = present.map(([, v]) => v);
    const mismatch = strs.some(s => s !== strs[0]);
    return { field: name, status: mismatch ? "MISMATCH" : "MATCH", detail: present.map(([k, v]) => `${k}=${v}`).join(" ") };
  }
  if (name === "recent") {
    // Market Check's d.recent3 is ascending (oldest of the three first); Buy/Tasks' core.recent is
    // descending (most recent first) - a presentation-order difference, not a different set of
    // sales. Compare the SORTED date set so "same three sales, different order" reads as a match.
    const lists = present.map(([, v]) => datesOf(v).slice().sort().join(","));
    const mismatch = lists.some(s => s !== lists[0]);
    return { field: name, status: mismatch ? "MISMATCH" : "MATCH", detail: present.map(([k, v]) => `${k}=[${datesOf(v).join(",")}]`).join(" ") };
  }
  if (name === "label") {
    // Informational only - wording legitimately differs by product (plural noun, generation code
    // style). Flags a mismatch only when two labels share NO common word at all, which usually
    // means a different generation/trim scope, not just different phrasing.
    // Strip a trailing plural 's' per word (Buy/Tasks say "Countachs", Market Check says "Countach")
    // so a bare plural never reads as a different car.
    const stem = w => (w.length > 3 && w.endsWith("s")) ? w.slice(0, -1) : w;
    const norm = s => new Set(String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").split(" ").filter(Boolean).map(stem));
    const sets = present.map(([, v]) => norm(v));
    const mismatch = sets.some(s => ![...s].some(w => sets[0].has(w)));
    return { field: name, status: mismatch ? "MISMATCH" : "MATCH", detail: present.map(([k, v]) => `${k}="${v}"`).join(" ") };
  }
  return { field: name, status: "N/A", detail: "" };
}

// Best-effort "why" for a mismatching spec, grounded in the actual code paths (not guessed) -
// per Sam's ask: "Print the reason where you can tell". Each reason names the file and function
// on each side so the mismatch can be assigned. Silent when no known pattern explains it.
function diagnoseReasons(row, { marketCheck, buy, sell, tasks }) {
  const out = [];
  const countMismatch = row.compare.find(c => c.field === "count" && c.status === "MISMATCH");
  const lowHighMismatch = row.compare.some(c => (c.field === "low" || c.field === "high") && c.status === "MISMATCH");
  const latestMismatch = row.compare.find(c => c.field === "latest" && c.status === "MISMATCH");

  // Market Check asked a disambiguating question instead of answering (bare nameplate, no
  // trim/generation given) while Buy/Tasks' walkLadder pooled the whole nameplate anyway.
  if (!marketCheck.ok && /tier=generation_choice/.test(marketCheck.reason || "") && (buy.ok || tasks.ok)) {
    out.push("Market Check (lib/onebox.js runOneBox, generation_choice tier) asks a disambiguating " +
      "question for this bare spec; Buy/Tasks (lib/live/search.js familyMarket->walkLadder) has no " +
      "equivalent generation-ambiguity gate and pools the whole nameplate instead of asking.");
  }

  // resolveVehicle (shared by Market Check + Sell) and resolveForBuy (Buy/Tasks' own resolver,
  // called inside specOf/familyMarket) can disagree on the same raw text.
  if ((!buy.ok || !tasks.ok) && (marketCheck.ok || sell.ok)) {
    out.push("resolveForBuy (lib/live/search.js, called from specOf/familyMarket) failed to resolve " +
      "this spec while resolveVehicle (lib/vehicle.js, used directly by Market Check/Sell) did - two " +
      "separate resolver implementations for the same raw text, not a shared one.");
  }

  // Sell diverging on count/latest (rare after the Oct 2026 "one engine ladder" fix - fetchOnlinePool
  // now reads runOneBox's own rawPool, same rung as Market Check/Buy/Tasks): look to the resolver
  // first, since a resolved-car difference is the remaining live cause (e.g. a chassis-code genCode
  // mismatch), not a window difference - fetchOnlinePool no longer runs its own window at all.
  if (sell.ok && (marketCheck.ok || buy.ok) && (countMismatch || latestMismatch)) {
    out.push("Sell (lib/platformPick.js fetchOnlinePool) now reads lib/onebox.js runOneBox's own " +
      "rawPool directly (Oct 2026 one engine ladder fix) - a remaining count/latest mismatch here " +
      "means the RESOLVED CAR differed between calls (a generation/trim binding difference), not a " +
      "window difference. Compare each lane's resolved label/genCode by hand.");
  }

  // low/high mismatch with Sell present and no count/latest explanation already filed: Sell's
  // low/high now prefers runOneBox's own cluster (same gate as marketOf()'s d.cluster check) - a
  // mismatch here with count/latest MATCHING means the pool landed below the 8-sale cluster floor on
  // one lane's read but not another's, or this script's own cluster extraction is stale.
  if (lowHighMismatch && sell.ok && !out.some(r => r.startsWith("Sell"))) {
    out.push("Sell's low/high (lib/platformPick.js, now sourced from runOneBox's own cluster) " +
      "mismatched while count/latest agreed - check whether the landed tier actually carried a " +
      "cluster (8+ solid sales, lib/onebox.js rangeTierForCount) on every lane; a tier below that " +
      "floor has no cluster and should read null on all four, not a guessed span.");
  }

  if (!out.length && (lowHighMismatch || countMismatch)) {
    out.push("No known pattern identified from this run's data alone - worth a by-hand check (pool " +
      "membership itself may differ, not just window/statistic choice).");
  }
  return out;
}

export async function checkOneSpec(q, env) {
  const row = { q };
  const rv = await resolveVehicle(q, {}).catch(e => ({ error: e }));
  const vehicle = rv && rv.vehicle;
  if (!vehicle || !vehicle.make) { row.error = "unresolved: " + (rv && (rv.status || rv.error?.message) || "?"); return row; }
  row.resolved = `${vehicle.year || ""} ${vehicle.make} ${vehicle.model || ""}${vehicle.trim ? " " + vehicle.trim : ""}`.trim();
  const generation = await findGeneration(vehicle, env).catch(() => null);
  const searchText = [vehicle.year, vehicle.make, vehicle.model, vehicle.trim].filter(Boolean).join(" ");
  const f = emptyFilters();
  if (vehicle.bodyStyle) f.bodies = [String(vehicle.bodyStyle).toLowerCase()];

  const [marketCheck, buy, sell] = await Promise.all([
    marketCheckLane(vehicle, generation, searchText, env).catch(e => ({ ok: false, reason: String(e && e.message || e) })),
    buyLane(env, vehicle, f).catch(e => ({ ok: false, reason: String(e && e.message || e) })),
    sellLane(vehicle, generation, env).catch(e => ({ ok: false, reason: String(e && e.message || e) }))
  ]);
  // Tasks: the same empty-state fallback Buy uses (see header note) - a second, independent call
  // (not reusing buy's object) so a future divergence between the two call SITES still shows up.
  const tasks = await buyLane(env, vehicle, f).catch(e => ({ ok: false, reason: String(e && e.message || e) }));

  row.lanes = { marketCheck, buy, sell, tasks };
  const fields = ["label", "low", "high", "count", "latest", "recent"];
  row.compare = fields.map(fld => compareField(fld, {
    marketCheck: marketCheck.ok ? marketCheck[fld] : null,
    buy: buy.ok ? buy[fld] : null,
    sell: sell.ok ? sell[fld] : null,
    tasks: tasks.ok ? tasks[fld] : null
  }));
  row.anyMismatch = row.compare.some(c => c.status === "MISMATCH");
  row.lanesOk = { marketCheck: marketCheck.ok, buy: buy.ok, sell: sell.ok, tasks: tasks.ok };
  row.reasons = diagnoseReasons(row, { vehicle, marketCheck, buy, sell, tasks });

  try {
    const live = await liveForFamily(env, vehicle, generation, f, 50);
    row.abroad = { liveMatches: live.total, note: "isAbroadRow() is the single shared exclusion Buy/Tasks/Market Check's live panel all import" };
  } catch (e) { row.abroad = { error: String(e && e.message || e) }; }

  return row;
}

export async function runEngineCheck(env, specs = DEFAULT_SPECS) {
  const rows = [];
  for (const q of specs) rows.push(await checkOneSpec(q, env));
  const totalMismatches = rows.filter(r => r.anyMismatch).length;
  return { task: "crossproductcheck", total: rows.length, mismatchSpecs: totalMismatches, rows };
}

// ---- CLI ----
function printTable(result) {
  for (const row of result.rows) {
    console.log(`\n=== ${row.q}` + (row.resolved ? `  (resolved: ${row.resolved})` : ""));
    if (row.error) { console.log("  ERROR:", row.error); continue; }
    for (const [name, lane] of Object.entries(row.lanes)) {
      if (!lane.ok) console.log(`  ${name.padEnd(12)} NO READ - ${lane.reason}`);
    }
    for (const c of row.compare) {
      const flag = c.status === "MISMATCH" ? " <<<<" : "";
      console.log(`  ${c.field.padEnd(8)} ${c.status.padEnd(9)} ${c.detail}${flag}`);
    }
    if (row.abroad) console.log(`  abroad   live matches=${row.abroad.liveMatches ?? "?"} (${row.abroad.note || row.abroad.error})`);
    for (const r of (row.reasons || [])) console.log(`  reason:  ${r}`);
  }
  console.log(`\nTOTAL: ${result.mismatchSpecs}/${result.total} specs had at least one field mismatch`);
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const argSpecs = process.argv.find(a => a.startsWith("--specs="));
  const asJson = process.argv.includes("--json");
  const specs = argSpecs ? argSpecs.slice("--specs=".length).split("|").filter(Boolean) : DEFAULT_SPECS;
  const env = supabaseEnv();
  if (!env) { console.error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set."); process.exit(2); }
  const result = await runEngineCheck(env, specs);
  if (asJson) console.log(JSON.stringify(result));
  else printTable(result);
  process.exit(result.mismatchSpecs > 0 ? 1 : 0);
}
