// Buy's one narrowing question (Lane C, Oct 2026). Results first, always; when the set has more than 12
// cars, ONE short question above the cards with counted chips. Every chip count comes from the SAME set
// the header counts (the search's own matches, this moment), bucketed with the SAME tests the search's
// filters apply, so a chip's count is the header count after the tap.
//
// Which question: the dimension that splits the set most evenly and is known for most cars, in this
// preference: generation or era, body style, budget (bands from the live bids), gearbox, mileage. A
// dimension qualifies only with at least two buckets of at least two cars, and never when the search
// already fixes it. Cars that do not say are no bucket's ("N don't say").
//
// GENERATIONS ARE THE ENGINE'S (Sam, Oct 2026): the era buckets are One Box's own generation_choice
// answer for the model (lib/onebox.js runOneBox, the same "which generation?" and the same answers
// Market Check gives), never a second generation table. A year two generations both claim (the 1989
// 911) is a year the listing alone can't settle, so that car doesn't say. Models with no
// generation_choice fall back to decade bands.
import { runOneBox } from "../onebox.js";
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
    const d = await Promise.race([runOneBox({ make: v.make, model, raw: `${v.make} ${model}` }, null, `${v.make} ${model}`, { supabaseUrl: env.supabaseUrl, supabaseKey: env.supabaseKey, asked: 0 }, null), new Promise(r => setTimeout(() => { timedOut = true; r(null); }, 3000))]);
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

const ANY = { era: "Any era", generation: "Any generation", body: "Any body style", budget: "Any budget", gearbox: "Either", mileage: "Any miles" };
const DONT = { era: "don't say which generation", generation: "don't say which generation", body: "don't say their body style", budget: "don't show a bid", gearbox: "don't say their gearbox", mileage: "don't say their miles" };
function question(dim, c, total, fine, byYear) {
  const q = dim === "era" ? (fine ? (c.chips.length === 2 ? `${c.chips[0].label} or ${c.chips[1].label}, or both?` : "Which generation?") : "Which era?")
    : dim === "body" ? "Which body style?" : dim === "budget" ? "Rough budget?" : dim === "gearbox" ? "Manual or automatic?" : "How many miles?";
  const any = dim === "era" && fine && c.chips.length === 2 ? "Both" : ANY[fine && dim === "era" ? "generation" : dim];
  return { dim, q, chips: c.chips, any: { label: any, n: total }, unstated: c.unstated, unstatedWhat: byYear ? "don't say their year" : DONT[dim], known: c.known };
}

// The narrowing questions for this set, best first (the page shows one; "Any ..." moves to the next).
// p: the search's filters; v: the resolved car; gens: the engine's generations (or null); soft: a soft word.
export function askFor(xs, { p = {}, v = null, gens = null, soft = null } = {}) {
  if (!xs || xs.length <= 12 || p.include_unstated) return [];
  const eraCodes = p.era ? String(p.era).split(",").filter(Boolean) : null;
  const fixed = {
    era: (!!(p.year_min || p.year_max) && !(eraCodes && eraCodes.length > 1)) || !!(v && (v.genCode || v.year)) || !!(p.generation && !String(p.generation).includes("|")),
    body: !!p.body, budget: !!(p.budget_max || p.bid_min || p.bid_max), gearbox: !!p.gearbox, mileage: !!(p.miles_max || p.miles_min)
  };
  const cands = [];
  if (!fixed.era) {
    const eb = gens ? eraBuckets(xs, gens, v, eraCodes) : (eraCodes ? null : decadeBuckets(xs));
    const c = counted(xs, eb); if (qualifies(c)) cands.push(question("era", c, xs.length, !!(eb && eb[0] && eb[0].fine), !gens));
  }
  if (!fixed.body) { const c = counted(xs, bodyBuckets(xs)); if (qualifies(c)) cands.push(question("body", c, xs.length)); }
  if (!fixed.budget) { const c = counted(xs, bands(xs, bidOf, "bid_min", "bid_max", k$, "bid")); if (qualifies(c)) cands.push(question("budget", c, xs.length)); }
  if (!fixed.gearbox) { const c = counted(xs, gearboxBuckets()); if (qualifies(c)) cands.push(question("gearbox", c, xs.length)); }
  if (!fixed.mileage) { const c = counted(xs, bands(xs, milesOf, "miles_min", "miles_max", mi, "miles")); if (qualifies(c)) cands.push(question("mileage", c, xs.length)); }
  // Evenness: the share of the known cars outside the largest bucket. A dimension known for at least
  // half the set and with no bucket over 75% of the known cars is a good split; the first such in the
  // preference order wins, otherwise the best known-share times evenness.
  const score = q => { const big = Math.max(...q.chips.map(c => c.n)); q.share = q.known / xs.length; q.even = q.known ? 1 - big / q.known : 0; return q.share * q.even; };
  cands.forEach(score);
  const good = q => q.share >= 0.5 && q.even >= 0.25;
  const pref = soft && SOFT[soft] && SOFT[soft].first;
  const order = cands.slice().sort((a, b) => (pref ? (b.dim === pref) - (a.dim === pref) : 0) || (good(b) - good(a)) || (good(a) && good(b) ? 0 : score(b) - score(a)));
  return order.map(q => ({ dim: q.dim, q: q.q, chips: q.chips.map(({ label, n, patch }) => ({ label, n, patch })), any: q.any, unstated: q.unstated, unstatedWhat: q.unstatedWhat, why: { known: q.known, share: Math.round(q.share * 100), even: Math.round(q.even * 100) } }));
}

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
