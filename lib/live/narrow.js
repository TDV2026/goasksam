// Buy's one narrowing question (Lane C, Oct 2026). Results first, always; then ONE short question above the cards
// with counted chips, chosen by THE QUESTION RULE below. Every chip count comes from the SAME set
// the header counts (the search's own matches, this moment), bucketed with the SAME tests the search's
// filters apply, so a chip's count is the header count after the tap.
//
// Which question: THE QUESTION RULE (askRule). Cars that do not say are no bucket's ("N don't say").
//
// GENERATIONS ARE THE ENGINE'S (Sam, Oct 2026): the era buckets are One Box's own generation_choice
// answer for the model (lib/onebox.js runOneBox, the same "which generation?" and the same answers
// Market Check gives), never a second generation table. A year two generations both claim (the 1989
// 911) is a year the listing alone can't settle, so that car doesn't say. Models with no
// generation_choice fall back to decade bands.
import { oneEngineAnswer } from "../onebox.js";
import { hasWord } from "./search.js";

const squash = s => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
const OPEN = ["cabriolet", "convertible", "roadster", "spyder", "spider", "speedster"];
const BODY_LABEL = { coupe: "Coupe", cabriolet: "Cabriolet", convertible: "Convertible", targa: "Targa", roadster: "Roadster", spyder: "Spyder", spider: "Spider", speedster: "Speedster", sedan: "Sedan", wagon: "Wagon", hatchback: "Hatchback", "shooting brake": "Shooting brake", pickup: "Pickup", suv: "SUV" };
const k$ = n => "$" + (n >= 1e6 ? (Math.round(n / 1e5) / 10) + "m" : Math.round(n / 1000) + "k");
const mi = n => Math.round(n).toLocaleString("en-US");
const cap = s => String(s || "").replace(/^\w/, c => c.toUpperCase());

// ---------------------------------------------------------------- soft words (never dropped)
// Each maps to a sort and, where it helps, the first question. Words listings can't answer are named
// once and a question follows.
export const SOFT = { cheap: { sort: "lowest_bid", first: "budget" }, cheapest: { sort: "lowest_bid", first: "budget" }, "low miles": { sort: "lowest_miles", first: "mileage" }, "high miles": { sort: "highest_miles", first: "mileage" }, fast: { ask: "fast" }, rare: { ask: "rare" }, nice: { ask: "nice" }, best: { ask: "best" } };
const SOFT_RE = /\b(cheapest|cheap|inexpensive|affordable|budget|low[- ]?(?:miles?|mileage)|high[- ]?(?:miles?|mileage)|fast|quick|rare|nice|best)\b/i;
const SOFT_ALIAS = { inexpensive: "cheap", affordable: "cheap", budget: "cheap", quick: "fast" };
// Words a listing never states. Named in one line, never silently ignored.
const UNMAPPED_RE = /\b(reliable|clean|cool|perfect|pretty|beautiful|gorgeous|unique|interesting|comfortable|practical|original|honest|solid|special|great|good|mint|pristine|investment)\b/i;
export function softOf(text) {
  const m = SOFT_RE.exec(String(text || "")); if (!m) return null;
  let w = m[1].toLowerCase().replace(/-/g, " ");
  if (/^low/.test(w)) w = "low miles"; else if (/^high/.test(w)) w = "high miles";
  w = SOFT_ALIAS[w] || w;
  return SOFT[w] ? w : null;
}
export function unmappedOf(text) { const m = UNMAPPED_RE.exec(String(text || "")); return m ? m[1].toLowerCase() : null; }

// ---------------------------------------------------------------- the engine's generations
const genCache = new Map();
// One Box's generation_choice for the bare model (no year, no trim): its options, as year ranges.
export async function engineGenerations(env, v) {
  const model = v && (v.parentModel || v.model); if (!v || !v.make || !model) return null;
  const key = squash(v.make) + "|" + squash(model), hit = genCache.get(key);
  if (hit && Date.now() - hit.at < 6 * 3600e3) return hit.gens;
  let gens = null, timedOut = false;
  try {
    // Never holds a search up: past 3s the question falls back to decades this once (not cached).
    const d = await Promise.race([oneEngineAnswer({ make: v.make, model, raw: `${v.make} ${model}` }, null, `${v.make} ${model}`, { supabaseUrl: env.supabaseUrl, supabaseKey: env.supabaseKey, asked: 0 }, null).then(r => r.raw), new Promise(r => setTimeout(() => { timedOut = true; r(null); }, 3000))]);
    if (d && d.tier === "generation_choice" && Array.isArray(d.generationOptions)) {
      gens = d.generationOptions.map(o => { const m = /^(.*?)\s*\((\d{4})-(\d{4})\)\s*$/.exec(String(o.label || "")); return m ? { code: m[1].trim(), from: +m[2], to: +m[3] } : null; }).filter(Boolean);
      if (gens.length < 2) gens = null;
    }
  } catch (e) { gens = null; }
  if (!timedOut) genCache.set(key, { gens, at: Date.now() });
  return gens;
}

// ---------------------------------------------------------------- buckets
// A car's year exactly as the search's year filter reads it.
const yearOf = x => Number(x.r.year) || Number((/\b(19\d{2}|20[0-3]\d)\b/.exec(String(x.r.listing_title || "")) || [])[1]) || null;
const bidOf = x => (x.facts.priceUsd && x.facts.priceState !== "suspect" && x.facts.priceState !== "unconverted") ? x.facts.priceUsd : null;
const milesOf = x => (x.facts.milesUnitUnknown ? null : (x.facts.miles || null));

// Contiguous units into at most 3 groups (when there are more than 4): the most even split (the least
// spread between the groups' counts). Units keep their order (eras stay in sequence).
function partition(units) {
  if (units.length <= 4) return units.map(u => [u]);
  let best = null;
  for (let i = 1; i < units.length - 1; i++) for (let j = i + 1; j < units.length; j++) {
    const g = [units.slice(0, i), units.slice(i, j), units.slice(j)], n = g.map(x => x.reduce((k, u) => k + u.n, 0));
    if (n.some(c => !c)) continue;
    if (g.some(x => x.length > 1 && x.some(u => u.members))) continue;   // the air-cooled era stays on its own
    const max = Math.max(...n), mean = n.reduce((a, b) => a + b, 0) / 3, vr = n.reduce((a, c) => a + (c - mean) ** 2, 0);
    if (!best || vr < best.vr || (vr === best.vr && max < best.max)) best = { g, max, vr };
  }
  return best ? best.g : units.map(u => [u]);
}
// "996", "996 and 997", "C1 to C3"; ordinal generations ("first", "second") read by their years.
const ORDINAL = /^(first|second|third|fourth|fifth|sixth|seventh|eighth)$/i;
function eraLabel(units, v) {
  if (units.length === 1 && units[0].members) return `Air-cooled, to ${units[0].to}`;
  if (units.some(u => ORDINAL.test(u.code))) return units.length === 1 ? `${cap(units[0].code)}, ${units[0].from} to ${units[0].to}` : `${units[0].from} to ${units[units.length - 1].to}`;
  if (units.length === 1) return units[0].code;
  if (units.length === 2) return `${units[0].code} and ${units[1].code}`;
  return `${units[0].code} to ${units[units.length - 1].code}`;
}
// The engine's generations as year buckets. Each group's years run from its first generation's start to
// its last one's end; a year two groups both claim is left to neither (that car doesn't say).
function eraBuckets(xs, gens, v, within) {
  let list = gens.slice().sort((a, b) => a.from - b.from);
  if (within && within.length) list = list.filter(g => within.includes(g.code));
  if (list.length < 2) return null;
  // The air-cooled 911s (to 1998) are one era to a buyer: one unit at the top level, split only once chosen.
  if (!(within && within.length) && /^porsche$/i.test(v.make) && squash(v.parentModel || v.model) === "911") {
    const air = list.filter(g => g.to <= 1998);
    if (air.length > 1) list = [{ code: "Air-cooled", from: air[0].from, to: air[air.length - 1].to, members: air.map(g => g.code) }, ...list.filter(g => g.to > 1998)];
  }
  const units = list.map(g => ({ ...g, n: xs.filter(x => { const y = yearOf(x); return y && y >= g.from && y <= g.to; }).length })).filter(u => u.n > 0);
  if (units.length < 2) return null;
  const groups = partition(units).map(us => ({ units: us, from: us[0].from, to: us[us.length - 1].to }));
  // Trim the years two neighbouring groups both claim.
  for (let i = 0; i + 1 < groups.length; i++) { const a = groups[i], b = groups[i + 1]; if (a.to >= b.from) { const lo = b.from, hi = a.to; a.to = lo - 1; b.from = hi + 1; } }
  const fine = groups.every(g => g.units.length === 1 && !g.units[0].members);
  return groups.filter(g => g.from <= g.to).map(g => ({
    label: eraLabel(g.units, v), test: x => { const y = yearOf(x); return !!y && y >= g.from && y <= g.to; },
    patch: { year_min: g.from, year_max: g.to, era: g.units.flatMap(u => u.members || [u.code]).join(",") }, fine
  }));
}
function decadeBuckets(xs) {
  const by = new Map(); for (const x of xs) { const y = yearOf(x); if (y) { const d = Math.floor(y / 10) * 10; by.set(d, (by.get(d) || 0) + 1); } }
  const units = [...by.entries()].sort((a, b) => a[0] - b[0]).map(([d, n]) => ({ code: d + "s", from: d, to: d + 9, n }));
  if (units.length < 2) return null;
  return partition(units).map(us => ({ label: us.length === 1 ? us[0].code : us.length === 2 ? `${us[0].code} and ${us[1].code}` : `${us[0].code} to ${us[us.length - 1].code}`, test: x => { const y = yearOf(x); return !!y && y >= us[0].from && y <= us[us.length - 1].to; }, patch: { year_min: us[0].from, year_max: us[us.length - 1].to } }));
}
function bodyBuckets(xs) {
  const by = new Map(); for (const x of xs) { const b = x.facts.body; if (b) { const k = OPEN.includes(b) ? "open" : b; if (!by.has(k)) by.set(k, new Map()); by.get(k).set(b, (by.get(k).get(b) || 0) + 1); } }
  return [...by.entries()].sort((a, b) => [...b[1].values()].reduce((x, y) => x + y, 0) - [...a[1].values()].reduce((x, y) => x + y, 0)).map(([k, words]) => {
    const word = [...words.entries()].sort((a, b) => b[1] - a[1])[0][0];
    // The search's body test: an open car matches any open body word.
    return { label: BODY_LABEL[word] || cap(word), test: x => !!x.facts.body && (k === "open" ? OPEN.includes(x.facts.body) : x.facts.body === k), patch: { body: word } };
  });
}
const nice = n => { if (n <= 0) return n; const p = Math.pow(10, Math.floor(Math.log10(n)) - 1); return Math.round(n / p) * p; };
// Three bands around the middle of the live values: below the lower third, the middle, above the upper third.
function bands(xs, valueOf, minKey, maxKey, fmt, unit) {
  const vals = xs.map(valueOf).filter(v => v > 0).sort((a, b) => a - b);
  if (vals.length < 6) return null;
  const a = nice(vals[Math.floor(vals.length / 3)]), b = nice(vals[Math.floor(2 * vals.length / 3)]);
  if (!(a > 0 && b > a)) return null;
  // The search's own tests: a max keeps a value at or under it, a min keeps a value at or over it.
  const inB = (v, lo, hi) => v > 0 && !(hi && v > hi) && !(lo && v < lo);
  return [
    { label: `${unit === "bid" ? "Bid under " : "Under "}${fmt(a)}${unit === "miles" ? " miles" : ""}`, test: x => inB(valueOf(x), null, a), patch: { [maxKey]: a } },
    { label: `${unit === "bid" ? "Bid " : ""}${fmt(a)} to ${fmt(b)}${unit === "miles" ? " miles" : ""}`, test: x => inB(valueOf(x), a + 1, b), patch: { [minKey]: a + 1, [maxKey]: b } },
    { label: `${unit === "bid" ? "Bid over " : "Over "}${fmt(b)}${unit === "miles" ? " miles" : ""}`, test: x => inB(valueOf(x), b + 1, null), patch: { [minKey]: b + 1 } }
  ];
}
function gearboxBuckets() {
  return [{ label: "Manual", test: x => x.facts.gearbox === "manual", patch: { gearbox: "manual" } }, { label: "Automatic", test: x => x.facts.gearbox === "auto", patch: { gearbox: "automatic" } }];
}

// Count each bucket over the set; a car no bucket takes doesn't say.
function counted(xs, buckets) {
  if (!buckets) return null;
  const chips = buckets.map(b => ({ label: b.label, n: xs.filter(b.test).length, patch: b.patch })).filter(c => c.n > 0);
  const taken = xs.filter(x => buckets.some(b => b.test(x))).length;
  return { chips, unstated: xs.length - taken, known: taken };
}
function qualifies(c) { return c && c.chips.filter(ch => ch.n >= 2).length >= 2; }

// ---------------------------------------------------------------- THE QUESTION RULE
// THE QUESTION RULE (Sam, Oct 14 2026): Buy shows the broad result at once, then asks ONE question above the cards,
// chosen by this rule in code (never a model call), so the same words always give the same question:
//   1. For each attribute the live cars carry (model when the make has several, generation, body, gearbox, a mileage
//      band, distance from a zip), count how the shown cars split, each chip counted the way the search's own filter
//      reads it (a chip's count is the header count after the tap).
//   2. Skip an attribute where one answer already holds more than three quarters of the cars (ASK_SKIP_SHARE).
//   3. Ask about the attribute whose answer would remove the most cars on average: for each answer, the cars it would
//      remove (the shown total less its count; a car that doesn't say is removed by every answer), averaged with each
//      answer weighted by its own count (the more cars an answer holds, the likelier a buyer picks it). For mileage and
//      distance, a car past the last chip is reached only by "Any", an answer that removes nothing (removalOf).
//   4. Stop when no attribute would remove at least a quarter of the cars (ASK_STOP_SHARE), and never below
//      ASK_MIN_CARS cars (a handful already sits on one screen). An attribute the search already fixes is never asked.
// Ties go to the order above. The page shows the first; an "Any" chip moves to the next qualifying one.
export const ASK_SKIP_SHARE = 0.75, ASK_STOP_SHARE = 0.25, ASK_MIN_CARS = 4;
const MILE_STEPS = [10000, 25000, 50000, 75000, 100000, 150000];
export const DIST_STEPS = [100, 250, 500];
const ORDER = ["model", "generation", "body", "gearbox", "mileage", "distance"];
const HIERARCHY = ["model", "generation", "body"];
// HOW MANY CARS GET WHICH KIND OF QUESTION (Sam's brief item 4; Lane F's decision Oct 19 2026): 0 to 2 cars none (the
// engine's widenings instead), 3 to 8 a quiet "Want to narrow it?" line with a few options, 9 to 24 a light refinement
// (the options as suggestions, no panel), 25 and over the one question panel.
export function narrowMode(n) { n = Number(n) || 0; return n <= 2 ? "none" : n <= 8 ? "quiet" : n <= 24 ? "light" : "question"; }
// Mileage as cumulative chips ("Under 25,000 (6) · Under 50,000 (14)"): the steps that keep between two cars and three
// quarters of the set, one per count, at most three. bands: the disjoint split the skip test reads.
export function mileageAsk(xs) {
  const vals = xs.map(milesOf).filter(v => v > 0), N = xs.length;
  if (vals.length < 2) return null;
  const chips = [];
  for (const t of MILE_STEPS) {
    const n = vals.filter(v => v <= t).length;
    if (n < 2 || n > ASK_SKIP_SHARE * N || (chips.length && chips[chips.length - 1].n === n)) continue;
    chips.push({ label: `Under ${mi(t)}`, n, patch: { miles_max: t } });
  }
  const pick = chips.slice(0, 3);
  if (!pick.length) return null;
  const cuts = pick.map(c => c.patch.miles_max), bands = [];
  let lo = 0; for (const t of cuts) { bands.push(vals.filter(v => v > lo && v <= t).length); lo = t; }
  bands.push(vals.filter(v => v > lo).length);
  return { chips: pick, bands, cumulative: true };
}
// Distance from the buyer's zip: cumulative chips by the cars' own city and state (lib/live/geo.js listingCoord).
// dist: each shown car's miles from the zip (null when its listing has no usable place).
export function distanceAsk(dist) {
  const N = dist.length, known = dist.filter(d => d != null);
  if (known.length < 2) return null;
  const chips = [];
  for (const r of DIST_STEPS) { const n = known.filter(d => d <= r).length; if (n >= 1 && n < N && !(chips.length && chips[chips.length - 1].n === n)) chips.push({ label: chips.length ? `${mi(r)} miles` : `Within ${mi(r)} miles`, n, patch: { radius_miles: r } }); }
  if (!chips.length) return null;
  const bands = []; let lo = -1; for (const c of chips) { bands.push(known.filter(d => d > lo && d <= c.patch.radius_miles).length); lo = c.patch.radius_miles; }
  bands.push(known.filter(d => d > lo).length);
  return { chips, bands, cumulative: true };
}
// The cars an answer removes, on average (rule 3), each answer weighted by its share of the cars that say. Cumulative
// chips (mileage, distance): a car's answer is the first chip that takes it in (its band), and a car past the last chip
// is reached only by "Any", which removes nothing, so that band counts at zero.
export function removalOf(c, N) {
  const ch = (c.chips || []).filter(x => x.n > 0);
  if (c.cumulative && Array.isArray(c.bands) && c.bands.length === ch.length + 1) {
    const tot = c.bands.reduce((a, x) => a + x, 0);
    return tot ? ch.reduce((a, x, i) => a + (c.bands[i] / tot) * (N - x.n), 0) : 0;
  }
  const tot = ch.reduce((a, x) => a + x.n, 0);
  return tot ? ch.reduce((a, x) => a + (x.n / tot) * (N - x.n), 0) : 0;
}
const QWORDS = { model: "Which model?", body: "Which body style?", gearbox: "Manual or automatic?", mileage: "How many miles?", distance: "How far would you travel?" };
// The questions for this set, best first ([] when the rule asks nothing).
// p: the search's filters; v: the resolved car; gens: the engine's generations (or null);
// models: the model chips for a make-only search, each counted by the search itself ([{label, n, patch}]);
// distance: { dist: [miles or null per car], zip } when the buyer gave a zip; { estimate } (the removal a zip would
// bring, read from the cars' own places) when not, which asks for the zip.
export function askRule(xs, { p = {}, v = null, gens = null, models = null, distance = null } = {}) {
  const N = xs ? xs.length : 0;
  if (N < ASK_MIN_CARS || p.include_unstated) return [];
  const eraCodes = p.era ? String(p.era).split(",").filter(Boolean) : null;
  const eraFixed = (!!(p.year_min || p.year_max) && !(eraCodes && eraCodes.length > 1)) || !!(v && (v.genCode || v.year)) || !!(p.generation && !String(p.generation).includes("|"));
  const make = v && v.make ? v.make : (p.make || "");
  const cands = [];
  const add = (dim, c, extra = {}) => { if (!c || !c.chips || !c.chips.length) return; cands.push({ dim, chips: c.chips, bands: c.bands || c.chips.map(x => x.n), cumulative: !!c.cumulative, ...extra }); };
  if (models && models.length >= 2 && !p.model && !(v && v.model)) add("model", { chips: models.filter(m => m.n > 0) }, { any: `Any ${make || "car"}` });
  if (!eraFixed && v && v.model && gens) {
    const eb = eraBuckets(xs, gens, v, eraCodes), c = counted(xs, eb);
    if (c) add("generation", c, { fine: !!(eb && eb[0] && eb[0].fine) });
  }
  if (!p.body) { const c = counted(xs, bodyBuckets(xs)); if (c) add("body", c); }
  if (!p.gearbox) { const c = counted(xs, gearboxBuckets()); if (c) add("gearbox", c); }
  if (!(p.miles_max || p.miles_min)) add("mileage", mileageAsk(xs));
  if (distance && !p.radius_miles && !p.anywhere && !p.min_distance_miles) {
    if (distance.dist) { const d = distanceAsk(distance.dist); if (d) { d.chips = d.chips.map(c => ({ ...c, patch: { location: distance.zip, ...c.patch } })); add("distance", d); } }
    else if (distance.estimate != null) cands.push({ dim: "distance", zipAsk: true, chips: [], bands: [], removal: distance.estimate, maxShare: distance.maxShare || 0 });
  }
  const out = [];
  for (const c of cands) {
    if (!c.zipAsk) {
      const disjoint = c.chips.filter(x => x.n > 0).length;
      if (!c.cumulative && disjoint < 2) continue;
      c.maxShare = Math.max(...c.bands) / N;
      c.removal = removalOf(c, N);
    }
    if (c.maxShare > ASK_SKIP_SHARE) continue;          // rule 2
    if (c.removal < ASK_STOP_SHARE * N) continue;       // rule 4
    out.push(c);
  }
  // The zip question ranks last: what distance removes depends on where the buyer is, so it is asked once the car
  // questions are done (its removal, read from the cars' own places, still has to clear rules 2 and 4).
  // THE HIERARCHY FIRST (Sam's Buy Stage 1c item 2, Oct 20 2026): model, then generation within a model, then body, ahead
  // of cars removed; the other questions (gearbox, mileage) follow by cars removed; the zip question last.
  const rank = c => { const i = HIERARCHY.indexOf(c.dim); return i < 0 ? HIERARCHY.length : i; };
  out.sort((a, b) => (!!a.zipAsk - !!b.zipAsk) || (rank(a) - rank(b)) || (b.removal - a.removal) || (ORDER.indexOf(a.dim) - ORDER.indexOf(b.dim)));
  return out.map(c => {
    const q = c.zipAsk ? "Keep it near you? Enter a zip or choose Anywhere."
      : c.dim === "generation" ? (c.fine ? (c.chips.length === 2 ? `${c.chips[0].label} or ${c.chips[1].label}?` : "Which generation?") : "Which era?") : QWORDS[c.dim];
    const anyLabel = c.any || { generation: "Any generation", body: "Any body style", gearbox: "Any gearbox", mileage: "Any mileage", distance: "Anywhere" }[c.dim];
    const known = c.cumulative || c.zipAsk ? null : c.chips.reduce((a, x) => a + x.n, 0);
    return { dim: c.dim, q, zipAsk: !!c.zipAsk, chips: c.chips.map(({ label, n, patch }) => ({ label, n, patch })), any: { label: anyLabel, n: N },
      unstated: known != null && known < N ? N - known : 0, unstatedWhat: known != null && known < N ? DONT_SAY[c.dim] : null,
      why: { cars: N, removes: Math.round(c.removal * 10) / 10, largestShare: Math.round(c.maxShare * 100) } };
  });
}
const DONT_SAY = { model: "are other models", generation: "don't say which generation", body: "don't say their body style", gearbox: "don't say their gearbox" };

// ---------------------------------------------------------------- the soft-word questions
// "fast", "rare", "nice", "best": the word stays in the label and Sam asks what it means, chips drawn
// from the set. null when the set can't answer it (the page then says so in one line).
const PERF = ["GT2", "GT3", "GT4", "Turbo", "GTS", "RS", "AMG", "Black Series", "Z06", "ZR1", "ZR-1", "ZL1", "Z28", "Z/28", "SS", "SRT", "Hellcat", "Demon", "GT500", "GT350", "Boss 302", "Cobra", "Type R", "STI", "Nismo", "Competition", "CSL", "M3", "M5", "SVJ", "Superveloce", "Speciale", "Scuderia", "V12", "Supercharged", "Hemi"];
// The search's own title-word test (lib/live/search.js hasWord), so a chip's count is its tap's.
export const hasTest = (x, token) => hasWord(x.r.listing_title, token);
export function softAsk(xs, { soft, p = {}, v = null, gens = null } = {}) {
  if (!soft || !SOFT[soft] || !SOFT[soft].ask || !xs || xs.length <= 12) return null;
  const total = xs.length;
  if (soft === "fast") {
    // Performance badges present in the set; no two chips share a car (so each chip's count is its tap's).
    const sets = PERF.filter(t => !(v && v.trim && squash(v.trim) === squash(t))).map(t => ({ t, ids: new Set(xs.filter(x => hasTest(x, t)).map(x => x.r.id)) })).filter(s => s.ids.size >= 1).sort((a, b) => b.ids.size - a.ids.size);
    const picked = [];
    for (const s of sets) { if (picked.length >= 4) break; if (picked.every(q => ![...s.ids].some(id => q.ids.has(id)))) picked.push(s); }
    if (picked.length < 2) return null;
    return { dim: "fast", q: "Which kind of fast?", chips: picked.map(s => ({ label: s.t, n: s.ids.size, patch: { has: s.t } })), any: { label: "Any of them", n: total }, unstated: 0 };
  }
  if (soft === "best") {
    // "Best" by what the listings show: the order, not a verdict. Sort chips, no counts.
    return { dim: "best", q: "Best by what?", chips: [{ label: "Fewest miles", patch: { sort: "lowest_miles" } }, { label: "Newest listed", patch: { sort: "newest" } }, { label: "Lowest bid", patch: { sort: "lowest_bid" } }], any: null, unstated: 0, sortOnly: true };
  }
  // rare / nice: buckets from the set itself.
  const pool = [];
  const add = (dim, list) => { const c = counted(xs, list); if (c) for (const ch of c.chips) pool.push({ dim, ...ch }); };
  if (soft === "rare") {
    if (!p.gearbox) add("gearbox", gearboxBuckets());
    if (!p.body) add("body", bodyBuckets(xs));
    if (gens && !(p.year_min || p.year_max)) add("era", eraBuckets(xs, gens, v, null));
    const rare = pool.filter(ch => ch.n >= 1 && ch.n / total <= 0.2).sort((a, b) => a.n - b.n);
    const out = []; for (const ch of rare) if (out.length < 3 && !out.some(o => o.dim === ch.dim)) out.push(ch);
    if (out.length < 2) return null;
    return { dim: "rare", q: "Rare in which way?", chips: out.map(({ label, n, patch }) => ({ label, n, patch })), any: { label: "Any of them", n: total }, unstated: 0 };
  }
  if (soft === "nice") {
    const out = [];
    const mb = !p.miles_max && bands(xs, milesOf, "miles_min", "miles_max", mi, "miles"); if (mb) { const c = counted(xs, [mb[0]]); if (c && c.chips[0] && c.chips[0].n >= 2) out.push(c.chips[0]); }
    if (!p.gearbox) { const c = counted(xs, [gearboxBuckets()[0]]); if (c && c.chips[0] && c.chips[0].n >= 2 && c.chips[0].n < total) out.push(c.chips[0]); }
    const yb = !(p.year_min || p.year_max) && (gens ? eraBuckets(xs, gens, v, null) : decadeBuckets(xs)); if (yb && yb.length) { const c = counted(xs, [yb[yb.length - 1]]); if (c && c.chips[0] && c.chips[0].n >= 2) out.push({ ...c.chips[0], label: "Newest, " + c.chips[0].label }); }
    if (out.length < 2) return null;
    return { dim: "nice", q: "Nice in which way?", chips: out, any: { label: "Any of them", n: total }, unstated: 0 };
  }
  return null;
}

// ---------------------------------------------------------------- the vague search
// No make or model ("a fun weekend car under 50k"): one "What sort of car?" before any cards, with
// chips from what is live in this set, the ones that fit the words first.
const SORTS = [
  { label: "Convertibles", test: x => OPEN.includes(x.facts.body), patch: { body: "convertible" }, fits: /\b(fun|weekend|summer|sun|top[- ]?down|open|toy|sporty|cruis)/i },
  { label: "Coupes", test: x => x.facts.body === "coupe", patch: { body: "coupe" }, fits: /\b(fun|weekend|sporty|sports|fast|track|toy)/i },
  { label: "SUVs", test: x => x.facts.body === "suv", patch: { body: "suv" }, fits: /\b(family|daily|practical|winter|snow|off[- ]?road|adventure|tow)/i },
  { label: "Pickups", test: x => x.facts.body === "pickup", patch: { body: "pickup" }, fits: /\b(truck|pickup|haul|tow|work|off[- ]?road|farm)/i },
  { label: "Wagons", test: x => x.facts.body === "wagon", patch: { body: "wagon" }, fits: /\b(family|wagon|practical|dog|estate|daily)/i },
  { label: "Sedans", test: x => x.facts.body === "sedan", patch: { body: "sedan" }, fits: /\b(daily|family|comfortable|commut|sedan|saloon)/i },
  { label: "Classics, before 1975", test: x => { const y = yearOf(x); return !!y && y < 1975; }, patch: { year_min: 1900, year_max: 1974 }, fits: /\b(classic|old|vintage|antique|weekend|cruis)/i }
];
export function vagueAsk(xs, words) {
  if (!xs || !xs.length) return null;
  const chips = SORTS.map(s => ({ label: s.label, n: xs.filter(s.test).length, patch: s.patch, fit: s.fits.test(String(words || "")) })).filter(c => c.n > 0)
    .sort((a, b) => (b.fit - a.fit) || (b.n - a.n)).slice(0, 5).map(({ label, n, patch }) => ({ label, n, patch }));
  if (chips.length < 2) return null;
  return { dim: "kind", q: "What sort of car?", chips, any: { label: "Show them all", n: xs.length }, unstated: 0, vague: true };
}
