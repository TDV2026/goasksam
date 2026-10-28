// TYPED EQUALS VIN (Oct 28 2026, a go or no-go gate). A VIN page hands the engine the identity stored for the car (year, make, model, trim, generation, body); a visitor who types the car's name hands it
// the resolver's reading of those words. The two must name the same stored answer: the same key, or, when the keys differ, the same tier, count, range and rung. Read only: the stored Market Check rows
// (MCWARM) and the resolver, nothing computed by the visitor path, no address cap spent.
const SAME = ["tier", "poolN", "cluster", "fallbackRung", "rungLabel", "optionsState"];
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
export function vinVehicleOf(id) { return { year: id.year || null, make: id.make || null, model: id.model || id.family || null, trim: id.trim || null, bodyStyle: id.bodyStyle || null, genCode: id.genCode || null }; }
export function typedTextOf(id) { return [id.year, id.make, id.model || id.family, id.trim].filter(Boolean).join(" "); }
export async function compareVinTyped(env, idents, deps) {
  const rows = [];
  for (const id of idents) {
    const row = { text: typedTextOf(id), vin: id.vin || null };
    try {
      const vv = vinVehicleOf(id);
      const r = await deps.resolveVehicle(row.text, {});
      const tv = r && r.vehicle ? (deps.sanitize ? (deps.sanitize(r.vehicle) || r.vehicle) : r.vehicle) : null;
      if (!tv || !tv.make || !tv.model) { rows.push({ ...row, identical: false, why: "typed words do not resolve to a car" }); continue; }
      const [gv, gt] = await Promise.all([deps.findGeneration(vv, env).catch(() => null), deps.findGeneration(tv, env).catch(() => null)]);
      row.vinKey = deps.keyFor(vv, gv); row.typedKey = deps.keyFor(tv, gt); row.sameKey = row.vinKey === row.typedKey;
      if (row.sameKey) { row.identical = true; rows.push(row); continue; }
      const [a, b] = await Promise.all([deps.readAnswer(env, row.vinKey), deps.readAnswer(env, row.typedKey)]);
      row.vinStored = !!a; row.typedStored = !!b;
      const diffs = (a && b) ? SAME.filter(k => !same(a[k], b[k])) : ["no stored answer for " + (a ? "typed" : "VIN") + " key"];
      row.identical = !!(a && b) && diffs.length === 0; row.diff = diffs;
    } catch (e) { row.identical = false; row.why = String(e && e.message || e).slice(0, 120); }
    rows.push(row);
  }
  const bad = rows.filter(r => !r.identical);
  return { checked: rows.length, identical: rows.length - bad.length, differ: bad.length, go: bad.length === 0 && rows.length > 0, differing: bad.slice(0, 10), rows };
}
