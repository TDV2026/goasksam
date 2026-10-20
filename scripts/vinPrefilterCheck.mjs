// vinPrefilterCheck (Lane B, Oct 20 2026, the 16:35 dry run): the decode-first rule's prefilter (lib/vehicle.js otherModelsNamed)
// also looks for the models of every make the title itself names, so a car whose make was read wrong ("1989 Dodge Shelby Dakota"
// as make Shelby, a Wrangler as make Willys) becomes a candidate; and the rule then names it (make from the title, the old make kept
// as the trim). Offline: the resolver's make/model lists are served locally (no network, no database).
delete process.env.SUPABASE_URL; delete process.env.SUPABASE_SERVICE_ROLE_KEY; delete process.env.SUPABASE_ANON_KEY;
process.env.OLDCARSDATA_API_KEY = "local-check";
const MAKES = ["Dodge", "Shelby", "Jeep", "Willys", "Chevrolet", "Ford", "Porsche"];
const MODELS = { dodge: ["Dakota", "Omni", "Lancer", "Charger", "Viper", "Daytona"], shelby: ["Cobra", "GT500"], jeep: ["Wrangler", "Cherokee"], willys: ["Jeep", "Jeepster"], chevrolet: ["Suburban", "Silverado"], ford: ["Mustang", "Transit"], porsche: ["911"] };
globalThis.fetch = async (u) => {
  const url = String(u);
  const json = /\/makes\b/.test(url) ? { data: MAKES } : /\/models\?make=/.test(url) ? { data: (MODELS[decodeURIComponent(url.split("make=")[1] || "").toLowerCase()] || []) } : null;
  if (!json) throw new Error("network blocked in check: " + url.slice(0, 80));
  return { ok: true, status: 200, headers: { get: () => null }, json: async () => json, text: async () => JSON.stringify(json) };
};
const { otherModelsNamed } = await import("../lib/vehicle.js");
const H = await import("../api/_historyData.js");
let bad = 0;
const ok = (c, m) => { if (c) console.log("ok   " + m); else { bad++; console.log("FAIL " + m); } };
const has = (arr, x) => Array.isArray(arr) && arr.map(s => s.toLowerCase()).includes(x.toLowerCase());
const a = await otherModelsNamed("Shelby", "Dodge", "1989 Dodge Shelby Dakota Pickup");
ok(has(a, "Dakota"), `a wrong make (Shelby) still finds Dodge's Dakota in the title (${JSON.stringify(a)})`);
const b = await otherModelsNamed("Willys", "Jeep Sport", "2015 Jeep Wrangler Sport Willys Wheeler Edition");
ok(has(b, "Wrangler"), `a wrong make (Willys) still finds Jeep's Wrangler (${JSON.stringify(b)})`);
const c = await otherModelsNamed("Porsche", "911", "2015 Porsche 911 GT3");
ok(Array.isArray(c) && c.length === 0, `a plain title has no candidate (${JSON.stringify(c)})`);
const d = await otherModelsNamed("Chevrolet", "Silverado", "1990 Chevrolet Suburban 2500 Silverado 454");
ok(has(d, "Suburban"), "the Suburban is still a candidate");
const nm = (v, y) => [y, v.make, H.familyOf(v)].join(" ");
const fx1 = H.decodeIdentityFix({ make: "Shelby", model: "Dodge" }, "1989 Dodge Shelby Dakota Pickup", { make: "DODGE", model: "Dakota" });
ok(fx1 && nm(fx1, 1989) === "1989 Dodge Dakota Shelby", `the rule names it: ${fx1 && nm(fx1, 1989)} (make Dodge, Shelby kept as the trim)`);
const fx2 = H.decodeIdentityFix({ make: "Willys", model: "Jeep Sport" }, "2015 Jeep Wrangler Sport Willys Wheeler Edition", { make: "JEEP", model: "Wrangler" });
ok(fx2 && fx2.make === "Jeep" && fx2.model === "Wrangler", `the Willys Jeep Sport reads Jeep Wrangler: ${fx2 && nm(fx2, 2015)}`);
console.log(bad ? `vinPrefilterCheck: ${bad} failed` : "vinPrefilterCheck: all passed");
process.exit(bad ? 1 : 0);
