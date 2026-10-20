// w111Check (Lane B, Oct 20 2026, the 1971 280SE 3.5 Cabriolet): the W111 280SE 3.5 resolves as its own model (Lane F's default
// naming for Sam), in every spelling the archive and a seller use, with its body; a plain 280SE stays S-Class (the 2.8 cars wait for
// their own pool evidence); the model rule carries its own W111 generation and reads both title spellings. Offline: the resolver
// with every network call blocked, and the model rule's guard on sample rows.
globalThis.fetch = async () => { throw new Error("network blocked in check"); };
delete process.env.SUPABASE_URL; delete process.env.SUPABASE_SERVICE_ROLE_KEY; delete process.env.OLDCARSDATA_API_KEY;
const { resolveVehicle } = await import("../lib/vehicle.js");
const { rule5PoolGuard } = await import("../lib/onebox.js");
let bad = 0;
const ok = (c, m) => { if (c) console.log("ok   " + m); else { bad++; console.log("FAIL " + m); } };
const res = async t => { try { const r = await resolveVehicle(t, {}); return r && r.vehicle ? r.vehicle : null; } catch (e) { return { error: String(e && e.message || e) }; } };
for (const [t, body] of [["1971 Mercedes-Benz 280SE 3.5 Cabriolet", "cabriolet"], ["1971 Mercedes-Benz 280 SE 3.5 Cabriolet", "cabriolet"], ["1970 Mercedes 280SE 3.5 Coupe", "coupe"], ["1971 Mercedes-Benz 280SE 3.5", null]]) {
  const v = await res(t);
  ok(v && v.model === "280SE 3.5" && (!body || String(v.bodyStyle || "").toLowerCase() === body), `"${t}" reads ${v && JSON.stringify({ model: v.model, trim: v.trim, bodyStyle: v.bodyStyle })}`);
}
const s = await res("1971 Mercedes-Benz 280SE");
ok(s && s.model !== "280SE 3.5", `a plain 280SE stays as today (${s && JSON.stringify({ model: s.model, trim: s.trim })})`);
const row = (t, y) => ({ id: t + y, raw_title: t, title: t, year: y });
const g = rule5PoolGuard([row("1971 Mercedes-Benz 280SE 3.5 Cabriolet", 1971), row("1970 Mercedes-Benz 280 SE 3.5 Coupe", 1970), row("1969 Mercedes-Benz 280SE 3.5 Coupe", 1969)], { make: "Mercedes-Benz", model: "280SE 3.5", year: 1971 });
ok(g.applied && g.kept.length === 3, `the W111 generation keeps 1969 to 1971 in both spellings (kept ${g.kept.length} of 3)`);
console.log(bad ? `w111Check: ${bad} failed` : "w111Check: all passed");
process.exit(bad ? 1 : 0);
