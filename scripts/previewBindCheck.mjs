// previewBindCheck (Lane B, Oct 20 2026, the C63 W205 preview Sam asked to see before deciding): offline, no network. A proposed
// generation entry (rangepreview bind=) binds the typed C63 to its body's years ONLY inside the preview call's async context;
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
const bind = parsePreviewBind("Mercedes-Benz|C63|w204:2008-2015,w205:2016-2021");
ok(bind && bind.length === 2 && bind[1].code === "w205" && bind[1].yearStart === 2016 && bind[1].yearEnd === 2021, "the bind parses to two entries");
for (const badBind of ["", "C63|w205:2016-2021", "Mercedes-Benz|C63|w205:2021-2016", "Mercedes-Benz|C63|w205:16-21", "Mercedes-Benz|C63|w205 2016-2021"]) ok(parsePreviewBind(badBind) === null, `a malformed bind is refused (${JSON.stringify(badBind)})`);

const today17 = await spec("2017 Mercedes-Benz C63 AMG");
ok(today17.yearMin === 2015 && today17.yearMax === 2019 && !today17.genCode, `today the 2017 C63 reads the calendar window 2015 to 2019 (${today17.yearMin}-${today17.yearMax})`);
const in17 = await previewGenerations.run(bind, () => spec("2017 Mercedes-Benz C63 AMG"));
ok(in17.yearMin === 2016 && in17.yearMax === 2021 && in17.genCode === "w205", `inside the preview the 2017 C63 binds W205 2016 to 2021 (${in17.yearMin}-${in17.yearMax} ${in17.genCode})`);
const in16 = await previewGenerations.run(bind, () => spec("2016 Mercedes-Benz C63 AMG"));
ok(in16.genCode === "w205" && in16.yearMin === 2016, "inside the preview a 2016 C63 binds W205");
const in13 = await previewGenerations.run(bind, () => spec("2013 Mercedes-Benz C63 AMG"));
ok(in13.genCode === "w204" && in13.yearMin === 2008 && in13.yearMax === 2015, "inside the preview a 2013 C63 binds W204 2008 to 2015");
const inC300 = await previewGenerations.run(bind, () => spec("2017 Mercedes-Benz C300"));
const todayC300 = await spec("2017 Mercedes-Benz C300");
ok(inC300.yearMin === todayC300.yearMin && inC300.yearMax === todayC300.yearMax && inC300.genCode === todayC300.genCode, "a C300 is not moved by a C63 entry");

// a call running at the same time outside the preview never sees the entry
let outside = null;
await previewGenerations.run(bind, async () => {
  const p = new Promise(r => setTimeout(async () => r(await previewGenerations.exit(() => spec("2017 Mercedes-Benz C63 AMG"))), 0));
  outside = await p;
});
ok(outside && outside.yearMin === 2015 && !outside.genCode, "a concurrent read outside the preview context is unchanged");
const after17 = await spec("2017 Mercedes-Benz C63 AMG");
ok(after17.yearMin === 2015 && after17.yearMax === 2019 && !after17.genCode, "after the preview, today's spec is unchanged");
ok(generationsForModel("Mercedes-Benz", "C63").length === 0, "outside a preview the curated list holds no C63 entry");
const spec911 = await spec("1995 Porsche 911 Carrera");
const in911 = await previewGenerations.run(bind, () => spec("1995 Porsche 911 Carrera"));
ok(spec911.genCode === in911.genCode && spec911.yearMin === in911.yearMin, "an unrelated curated model is unchanged inside the preview");
console.log(bad ? `previewBindCheck: ${bad} failed` : "previewBindCheck: all passed");
process.exit(bad ? 1 : 0);
