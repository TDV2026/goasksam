// VIN DECODE STORE (Lane B, Oct 20 2026; Lane F's index-time design for the decode-first identity rule, for Sam with the flip).
// The decode-first rule (api/_historyData.js decodeIdentityFix) needs a VIN's decoded make and model. A page request must NEVER
// call vPIC, so the decodes are made at INDEX TIME by the nightly caches job (scripts/buildVinRolloutCache.js, after its own
// write) and stored in ONE row of the existing vin_rollout_cache table (key "vin_decode_model"; no new table, no new SQL).
// carIdentity reads that row once per instance. Only the rule's candidates are decoded: a 17-character VIN whose newest title
// names ANOTHER known model of its make (lib/vehicle.js otherModelsNamed), which is about 1.7 percent of titled VINs.
//
// Stored is vPIC's RAW Make and Model (not a resolver re-read: over offsets 18,000 to 19,999 the resolver's VIN path turned 151
// decodes into no change, while vPIC's own model named the car). Pacing, so a free public service is never hammered: vPIC's
// batch endpoint (POST DecodeVINValuesBatch, up to 50 VINs a call), ONE call at a time, at least 2 seconds apart, at most 40
// calls (2,000 VINs) a night, the cursor in the same row so the next night resumes where this one stopped, and a stop on any
// HTTP error (429, 5xx). The step is behind VIN_DECODE_NIGHTLY (OFF): with it off the nightly job is unchanged.
import { supabaseEnv, supabaseSelect, supabaseInsert } from "./_supabase.js";
import { resolveVehicle, sanitizeResolvedVehicle, otherModelsNamed } from "./vehicle.js";

export const VIN_DECODE_NIGHTLY = false;
export const DECODE_KEY = "vin_decode_model";
const VPIC_BATCH = "https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVINValuesBatch/";
const isVin17 = v => /^[A-HJ-NPR-Z0-9]{17}$/.test(String(v || ""));

// ---- read side (carIdentity): the stored row, read once per instance (refreshed hourly), never a vPIC call ----
let mem = null, memAt = 0;
export async function readStoredDecodes(env = supabaseEnv()) {
  if (mem && Date.now() - memAt < 3600e3) return mem;
  try {
    const rows = env ? await supabaseSelect(env, `vin_rollout_cache?key=eq.${DECODE_KEY}&select=data&limit=1`) : null;
    const data = rows && rows[0] && rows[0].data;
    mem = data && data.decodes && typeof data.decodes === "object" ? data.decodes : {};
  } catch { mem = mem || {}; }
  memAt = Date.now();
  return mem;
}
export async function storedDecodeFor(vin) {
  if (!isVin17(vin)) return null;
  const all = await readStoredDecodes();
  const d = all[vin];
  return d && d.model ? { make: d.make || null, model: d.model } : null;
}
export function _resetDecodeMemForTest(decodes) { mem = decodes; memAt = Date.now(); }

// ---- write side (nightly): candidates from the VIN index, decoded in paced batches, cursor kept ----
export function parseBatch(json) {
  const out = {};
  for (const r of (json && Array.isArray(json.Results) ? json.Results : [])) {
    const vin = String(r.VIN || "").toUpperCase();
    if (!isVin17(vin)) continue;
    out[vin] = { make: String(r.Make || "").trim() || null, model: String(r.Model || "").trim() || null, year: Number(r.ModelYear) || null, err: String(r.ErrorCode || "").trim() || null };
  }
  return out;
}
// THE PACED DECODE (pure but for fetchImpl and sleep, scripts/vinDecodeStoreCheck.mjs): vPIC's batch endpoint, ONE call at a time,
// delayMs apart, at most maxBatches calls of batchSize VINs; any HTTP error or network failure stops it at once (the decodes so far
// are kept).
export async function decodeInBatches(todo, { maxBatches = 40, batchSize = 50, delayMs = 2000, fetchImpl = fetch, sleep = ms => new Promise(r => setTimeout(r, ms)) } = {}) {
  const out = { decodes: {}, decoded: 0, failed: 0, batches: 0, stoppedOn: null };
  for (let i = 0; i < todo.length && out.batches < maxBatches; i += batchSize) {
    if (out.batches > 0) await sleep(delayMs);
    const part = todo.slice(i, i + batchSize);
    out.batches++;
    let res;
    try { res = await fetchImpl(VPIC_BATCH, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: `format=json&data=${encodeURIComponent(part.join(";"))}`, signal: AbortSignal.timeout(30000) }); }
    catch (e) { out.stoppedOn = "vPIC unreachable"; out.failed += part.length; break; }
    if (!res || !res.ok) { out.stoppedOn = `vPIC HTTP ${res ? res.status : "no response"}`; out.failed += part.length; break; }
    const got = parseBatch(await res.json().catch(() => null));
    for (const vin of part) { if (got[vin]) { out.decodes[vin] = got[vin]; out.decoded++; } else out.failed++; }
  }
  return out;
}
// dryRun (Lane F, Oct 20 2026): the same scan and the same paced batch decodes, NOTHING written; every candidate is returned with
// its title, the resolved car and vPIC's raw decode (items), so the rule's name for each can be listed for Sam before any flip.
// startCursor overrides the stored cursor (a dry run pages through the index by its own cursor).
export async function runNightlyDecode(env, { maxBatches = 40, batchSize = 50, delayMs = 2000, scanBudgetMs = 10 * 60e3, fetchImpl = fetch, log = console.log, sleep = ms => new Promise(r => setTimeout(r, ms)), dryRun = false, startCursor = null } = {}) {
  const counts = { scanned: 0, candidates: 0, decoded: 0, failed: 0, batches: 0, stoppedOn: null };
  const rows = await supabaseSelect(env, `vin_rollout_cache?key=eq.${DECODE_KEY}&select=data&limit=1`);
  if (rows == null) { log("vin decode: the store row could not be read; nothing done"); return { ...counts, stoppedOn: "store unreadable" }; }
  const prev = (rows[0] && rows[0].data) || {};
  const decodes = { ...(prev.decodes || {}) };
  let cursor = startCursor != null ? String(startCursor) : (prev.cursor || "");
  const items = [];
  const want = maxBatches * batchSize, todo = [];
  const t0 = Date.now();
  // scan the index from the cursor, 500 VINs a page, for the rule's candidates not yet decoded
  scan: while (todo.length < want && Date.now() - t0 < scanBudgetMs) {
    const page = await supabaseSelect(env, `vin_summary?select=vin_norm&vehicle_type=eq.car${cursor ? `&vin_norm=gt.${encodeURIComponent(cursor)}` : ""}&order=vin_norm.asc&limit=500`);
    if (page == null) { counts.stoppedOn = "index page unreadable"; break; }
    if (!page.length) { cursor = ""; break; }   // the end of the index: the next night starts again at the top
    const vins = page.map(r => r.vin_norm).filter(isVin17).filter(v => !decodes[v]);
    const newest = new Map();
    for (let i = 0; i < vins.length; i += 150) {
      const part = vins.slice(i, i + 150);
      const apps = await supabaseSelect(env, `vin_index?select=vin_norm,listing_title,appearance_date&vin_norm=in.(${part.map(encodeURIComponent).join(",")})&order=appearance_date.desc`);
      for (const a of apps || []) if (a.listing_title && !newest.has(a.vin_norm)) newest.set(a.vin_norm, a.listing_title);
    }
    for (const r of page) {
      cursor = r.vin_norm; counts.scanned++;
      const title = newest.get(r.vin_norm);
      if (!title) continue;
      let v = null;
      try { const x = await resolveVehicle(title, {}); v = x && x.vehicle ? (sanitizeResolvedVehicle(x.vehicle) || x.vehicle) : null; } catch { v = null; }
      if (!v || !v.make || !v.model) continue;
      const others = await otherModelsNamed(v.make, v.model, title);
      if (others && others.length) { todo.push(r.vin_norm); items.push({ vin: r.vin_norm, title, v: { make: v.make, model: v.model, trim: v.trim || null, year: v.year || null }, others }); counts.candidates++; if (todo.length >= want) break scan; }
    }
  }
  // decode in paced batches; any HTTP error stops the night (the cursor and the decodes so far are kept)
  const got = await decodeInBatches(todo, { maxBatches, batchSize, delayMs, fetchImpl, sleep });
  Object.assign(decodes, got.decodes);
  counts.decoded = got.decoded; counts.failed = got.failed; counts.batches = got.batches; counts.stoppedOn = counts.stoppedOn || got.stoppedOn;
  for (const it of items) if (got.decodes[it.vin]) it.decoded = got.decodes[it.vin];
  if (dryRun) return { ...counts, cursor, items, dryRun: true };
  const data = { decodes, cursor, lastRun: { at: new Date().toISOString(), ...counts } };
  const w = await supabaseInsert("vin_rollout_cache", [{ key: DECODE_KEY, data, computed_at: new Date().toISOString() }], env.supabaseUrl, env.supabaseKey, "resolution=merge-duplicates,return=minimal", "?on_conflict=key");
  if (w && w.error) { log("vin decode: store write failed: " + JSON.stringify(w.error).slice(0, 200)); return { ...counts, stoppedOn: counts.stoppedOn || "store write failed" }; }
  log(`vin decode: scanned ${counts.scanned}, candidates ${counts.candidates}, decoded ${counts.decoded}, failed ${counts.failed}, batches ${counts.batches}${counts.stoppedOn ? ", stopped on " + counts.stoppedOn : ""}; ${Object.keys(decodes).length} stored; next cursor ${cursor || "(top)"}`);
  return counts;
}
