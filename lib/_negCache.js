// A memo that never pins a failure (Lane B, Nov 2026, nightly #132 item 4: "Buy/Tasks failed to resolve the 1970 Datsun 240Z while resolveVehicle did").
// A found value is kept as before. A NOT-FOUND (null) is kept only for ttlMs, because it is a statement about one moment: the archive grows, a read times out,
// a resolver fix ships. Before this, specOf and archiveResolveToken stored the null for the life of the process, so one early miss answered every later ask,
// whichever product asked. get(key) returns { hit:false } when absent or when a stored null has expired (and drops it).
export function makeNegCache({ ttlMs = 60000, max = 5000, now = () => Date.now() } = {}) {
  const m = new Map();
  return {
    get(key) {
      const e = m.get(key); if (!e) return { hit: false };
      if (e.value != null) return { hit: true, value: e.value };
      if (now() - e.at < ttlMs) return { hit: true, value: null };
      m.delete(key); return { hit: false };
    },
    set(key, value) { m.set(key, { value: value == null ? null : value, at: now() }); if (m.size > max) m.delete(m.keys().next().value); },
    get size() { return m.size; }
  };
}
// Everything about a resolved vehicle that changes the spec built from it. A memo keyed without this answers a later, better-informed call with an earlier call's spec (or its miss).
export function vehicleFingerprint(v) {
  return v ? JSON.stringify([v.make, v.model, v.parentModel, v.nameModel, v.trim, v.year, v.bodyStyle, v.genCode, v.edition, v.variant, v.wheelbase, v.requireYear || null]) : "";
}
