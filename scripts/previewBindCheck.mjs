// previewBindCheck (Lane B, Oct 20 2026, the C63 W205 preview Sam asked to see before deciding): offline, no network. A proposed
// generation entry (rangepreview bind=) binds a typed car to its body's years ONLY inside the preview call's async context;
// outside it, and in a call running at the same time, today's spec is unchanged. The bind parser refuses malformed input.
globalThis.fetch = async () => { throw new Error("blocked"); };
delete process.env.SUPABASE_URL; delete process.env.SUPABASE_SERVICE_ROLE_KEY;
const { resolveVehicle, sanitizeResolvedVehicle } = await import("../lib/vehicle.js");
const { previewGenerations, generationsForModel } = await import("../lib/generations.js");
const { buildSpec } = await import("../lib/onebox.js");
const { parsePreviewBind } = await import("../lib/_bodyChanges.js");
let bad = 0;
const ok = (c, m) => { console.log((c ? "ok   " : "FAIL ") + m); if (!c) bad++; };
const spec = async t => { const r = await resolveVehicle(t, {}); const v = sanitizeResolvedVehicle(r.vehicle) || r.vehicle; return buildSpec(v, null, t); };
// the C63 now has its curated entry (Sam, Oct 20 2026), so the mechanism is proved on an uncurated model: the BMW 530i
// (archive model "530I"), with the E39/E60 boundary the body-change sweep found
const bind = parsePreviewBind("BMW|530I|e39:1997-2003,e60:2004-2010");
ok(bind && bind.length === 2 && bind[1].code === "e60" && bind[1].yearStart === 2004 && bind[1].yearEnd === 2010, "the bind parses to two entries");
for (const badBind of ["", "530I|e60:2004-2010", "BMW|530I|e60:2010-2004", "BMW|530I|e60:04-10", "BMW|530I|e60 2004-2010"]) ok(parsePreviewBind(badBind) === null, `a malformed bind is refused (${JSON.stringify(badBind)})`);

const today = await spec("2004 BMW 530i");
ok(today.yearMin === 2002 && today.yearMax === 2006 && !today.genCode, `today a 2004 530i reads the calendar window 2002 to 2006 (${today.yearMin}-${today.yearMax})`);
const inP = await previewGenerations.run(bind, () => spec("2004 BMW 530i"));
ok(inP.yearMin === 2004 && inP.yearMax === 2010 && inP.genCode === "e60", `inside the preview a 2004 530i binds E60 2004 to 2010 (${inP.yearMin}-${inP.yearMax} ${inP.genCode})`);
const in02 = await previewGenerations.run(bind, () => spec("2002 BMW 530i"));
ok(in02.genCode === "e39" && in02.yearMin === 1997 && in02.yearMax === 2003, "inside the preview a 2002 530i binds E39 1997 to 2003");
const in540 = await previewGenerations.run(bind, () => spec("2002 BMW 540i"));
const today540 = await spec("2002 BMW 540i");
ok(in540.yearMin === today540.yearMin && in540.yearMax === today540.yearMax && in540.genCode === today540.genCode, "a 540i is not moved by a 530i entry");
// a preview never changes a CURATED model's binding by accident (the C63 keeps its own W205)
const c63in = await previewGenerations.run(bind, () => spec("2017 Mercedes-Benz C63 AMG"));
ok(c63in.genCode === "w205" && c63in.yearMin === 2016, "the curated C63 keeps its W205 inside an unrelated preview");

// a call running at the same time outside the preview never sees the entry
let outside = null;
await previewGenerations.run(bind, async () => {
  const p = new Promise(r => setTimeout(async () => r(await previewGenerations.exit(() => spec("2004 BMW 530i"))), 0));
  outside = await p;
});
ok(outside && outside.yearMin === 2002 && !outside.genCode, "a concurrent read outside the preview context is unchanged");
const after = await spec("2004 BMW 530i");
ok(after.yearMin === 2002 && after.yearMax === 2006 && !after.genCode, "after the preview, today's spec is unchanged");
ok(generationsForModel("BMW", "530I").length === 0, "outside a preview the curated list holds no 530i entry");
const spec911 = await spec("1995 Porsche 911 Carrera");
const in911 = await previewGenerations.run(bind, () => spec("1995 Porsche 911 Carrera"));
ok(spec911.genCode === in911.genCode && spec911.yearMin === in911.yearMin, "an unrelated curated model is unchanged inside the preview");
console.log(bad ? `previewBindCheck: ${bad} failed` : "previewBindCheck: all passed");
process.exit(bad ? 1 : 0);
