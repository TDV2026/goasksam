// FOR SALE: THE READ IS MADE READY AHEAD OF TIME (Lane D, lane-d-forsale, Nov 2026). api/pullForSale.js?mode=prepare, a scheduled job, never a visitor's request.
// A card never triggers an engine run: this job gives every stored listing (1) the engine's resolved car (the same resolver Find's own cards use, specOf), (2) the engine's read of that car (the same
// listingMarket call a Find card makes, cold compute allowed HERE and stored in spec_market_cache like every other spec), and (3) the car's earlier record by VIN (seenBefore). All three are stored on the row.
// A request then only reads the row. A listing whose read is not ready is not served (read_pending, counted) until the next run makes it ready; it never waits, never computes.
import { specOf, listingFacts, listingMarket, seenBefore, soldLine, specQuery } from "../live/search.js";
import { ENGINE_VERSION } from "../onebox.js";
import { reasonLine } from "../reasonWords.js";
import { liveShape, FRESH_MS, isFullVin } from "./rules.js";

const hdr = env => ({ apikey: env.supabaseKey, Authorization: `Bearer ${env.supabaseKey}`, "Content-Type": "application/json" });
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export const READ_MAX_AGE_MS = 12 * 3600e3;   // a read older than this is made again (the engine's stored answer behind it is refreshed by its own rules)

async function select(env, query) {
  const r = await fetch(`${env.supabaseUrl}/rest/v1/for_sale_listings?${query}`, { headers: hdr(env) });
  if (!r.ok) throw new Error(`for_sale_listings read ${r.status}`);
  return r.json();
}
async function patchRow(env, id, body) {
  const r = await fetch(`${env.supabaseUrl}/rest/v1/for_sale_listings?id=eq.${id}`, { method: "PATCH", headers: { ...hdr(env), Prefer: "return=minimal" }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`for_sale_listings patch ${r.status}`);
}

// THE ENGINE'S READ OF ONE LISTING'S CAR, as stored words (pure of reads): the range the engine's own answer gives, else the engine's honest line. null: the engine has not got it ready.
export function readOf(m, at) {
  if (!m || m.kind === "pending" || m.stillReading === true) return null;
  const fa = m.findAnswer && typeof m.findAnswer === "object" ? m.findAnswer : null;
  const r = fa && fa.range && Number(fa.range.low) > 0 && Number(fa.range.high) > 0 ? { low: Number(fa.range.low), high: Number(fa.range.high) } : (m.kind === "range" && Number(m.low) > 0 && Number(m.high) > 0 ? { low: Number(m.low), high: Number(m.high) } : null);
  if (r) return { kind: "range", low: r.low, high: r.high, sold_line: reasonLine("forsale.range", r), engine_version: ENGINE_VERSION, at };
  let line = null;
  if (m.kind === "refused" && m.refusalLine) line = String(m.refusalLine);
  else if (m.kind === "unmatched" || m.kind === "not_tracked" || m.readFailed) line = reasonLine("find.none");
  else if (fa && Array.isArray(fa.lines) && fa.lines.length) line = fa.lines.join(" ");
  else line = soldLine(m);
  return line ? { kind: "none", low: null, high: null, sold_line: String(line), engine_version: ENGINE_VERSION, at } : null;
}

// THE CAR'S EARLIER RECORD, as the finished line (or none): "This car sold for $36,500 in March 2024." or "This car was bid to $31,000 and did not sell in May 2026."
export function historyOf(seen, at) {
  if (!seen || !seen.date || !(Number(seen.priceUsd) > 0)) return { none: true, at };
  const m = /^(\d{4})-(\d{2})/.exec(String(seen.date)); if (!m) return { none: true, at };
  const when = `${MONTHS[Number(m[2]) - 1]} ${m[1]}`, price = Number(seen.priceUsd);
  const sold = seen.result === "sold";
  return { none: false, result: sold ? "sold" : "unsold", date: String(seen.date).slice(0, 10), price_usd: price, line: reasonLine(sold ? "forsale.sold_for" : "forsale.unsold", { price, when }), at };
}

// opts: { budgetMs, concurrency (engine reads at once, at most 3: the standing limit of heavy reads), resolveBatch, engine: { specOf, listingMarket, seenBefore } (the check's stand-ins), now }
export async function prepareForSale(env, opts = {}) {
  const t0 = Date.now(), now = opts.now ? Number(opts.now) : Date.now(), at = new Date(now).toISOString();
  const budget = Math.min(270000, Number(opts.budgetMs) || 200000), left = () => budget - (Date.now() - t0);
  const eng = { specOf, listingMarket, seenBefore, ...(opts.engine || {}) };
  const width = Math.max(1, Math.min(3, Number(opts.concurrency) || 3));
  const out = { resolved: 0, unresolved: 0, reads: 0, readsNotReady: 0, readsFailed: 0, histories: 0, historyNone: 0, left: { toResolve: 0, toRead: 0 }, ms: 0 };
  const fresh = new Date(now - FRESH_MS).toISOString();
  // 1. THE RESOLVER, for every listing that could be served (not gone, seen within 24 hours): the engine's own car, or "unresolved" (counted, never served)
  const todo = await select(env, `gone=eq.false&last_seen=gte.${encodeURIComponent(fresh)}&or=(resolve_state.is.null,car->>engine_version.neq.${encodeURIComponent(ENGINE_VERSION)})&select=*&order=id.asc&limit=${Number(opts.resolveLimit) || 400}`);
  for (let i = 0; i < todo.length && left() > budget * 0.4; i += 8) {
    await Promise.all(todo.slice(i, i + 8).map(async row => {
      let spec = null;
      try { const lr = liveShape(row, false); spec = await eng.specOf(env, lr, listingFacts(lr)); } catch { spec = undefined; }
      if (spec === undefined) return;   // the resolver did not answer: tried again next run, never marked unresolved on a timeout
      if (!spec || !spec.key) { await patchRow(env, row.id, { resolve_state: "unresolved", car: null, car_key: null, updated_at: at }); out.unresolved++; return; }
      const v = spec.v || {}, car = { name: specQuery(spec, "exact"), make: v.make || null, model: v.parentModel || v.model || null, trim: v.trim || null, year: v.year || row.year || null, generation: spec.generation && (spec.generation.code || spec.generation.label) || null, key: spec.key, engine_version: ENGINE_VERSION, title: row.title, at };
      await patchRow(env, row.id, { resolve_state: "resolved", car, car_key: spec.key, make: car.make || row.make, model: car.model || row.model, updated_at: at }); out.resolved++;
    }));
  }
  out.left.toResolve = Math.max(0, todo.length - out.resolved - out.unresolved);
  // 2. THE READS: every servable resolved listing whose read is missing, from another engine version, or older than READ_MAX_AGE_MS. One car (spec key) at a time, `width` cars at once; the first listing of a car fills the
  //    engine's stored answer (a cold compute is allowed here), the rest of that car's listings read it back.
  const stale = new Date(now - READ_MAX_AGE_MS).toISOString();
  const rows = (await select(env, `gone=eq.false&resolve_state=eq.resolved&last_seen=gte.${encodeURIComponent(fresh)}&asking_price_usd=gt.0&select=*&order=id.asc&limit=${Number(opts.readLimit) || 600}`))
    .filter(r => !(r.read && r.read.engine_version === ENGINE_VERSION && r.read.at >= stale));
  const byKey = new Map(); for (const r of rows) { const k = r.car_key || (r.car && r.car.key); if (!byKey.has(k)) byKey.set(k, []); byKey.get(k).push(r); }
  const keys = [...byKey.keys()]; let next = 0;
  const worker = async () => {
    while (next < keys.length && left() > 8000) {
      const list = byKey.get(keys[next++]);
      for (const row of list) {
        if (left() < 4000) break;
        try {
          const lr = liveShape(row, false), facts = listingFacts(lr);
          const m = await eng.listingMarket(env, lr, facts, { deadlineAt: Date.now() + Math.min(90000, Math.max(5000, left() - 3000)) });
          const read = readOf(m, at);
          if (!read) { out.readsNotReady++; continue; }
          await patchRow(env, row.id, { read, updated_at: at }); out.reads++;
        } catch { out.readsFailed++; }
      }
    }
  };
  await Promise.all(Array.from({ length: width }, worker));
  out.left.toRead = Math.max(0, rows.length - out.reads);
  // 3. THE CAR'S EARLIER RECORD by VIN (a full VIN only: a short chassis number is not looked up across houses by guess)
  const hs = (await select(env, `gone=eq.false&resolve_state=eq.resolved&last_seen=gte.${encodeURIComponent(fresh)}&vin_norm=not.is.null&select=id,vin_norm,history&order=id.asc&limit=${Number(opts.historyLimit) || 300}`))
    .filter(r => isFullVin(r.vin_norm) && !(r.history && r.history.at >= stale));
  for (let i = 0; i < hs.length && left() > 3000; i += 6) {
    await Promise.all(hs.slice(i, i + 6).map(async r => {
      try { const h = historyOf(await eng.seenBefore(env, r.vin_norm), at); await patchRow(env, r.id, { history: h, updated_at: at }); out.histories++; if (h.none) out.historyNone++; } catch { /* tried again next run */ }
    }));
  }
  out.ms = Date.now() - t0;
  return out;
}
