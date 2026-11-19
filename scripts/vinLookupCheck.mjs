// VIN / CHASSIS LOOKUP CHECK (Lane B, Stage 3, Oct 23 2026): no network. (1) looksLikeChassisId is ONE shape test: pre-1981 numbers (all digits, 9 or more,
// or letters and digits) are identifiers, a year, a price, a ZIP and a car name are not. (2) findVinArchiveMatch matches a chassis by EXACT string (separators
// ignored), finds a car that only ever went unsold, and names the body from the listing TITLE (a Targa whose stored body says Coupe stays a Targa).
import { looksLikeChassisId, findVinArchiveMatch } from "../lib/_flags.js";
let failed = 0; const ok = (c, m) => { if (!c) failed++; console.log((c ? "ok   " : "FAIL ") + m); };
for (const t of ["11304412010836", "113.044.12.010836", "WP0CA2995SS340422", "WP0BA29983S635608", "1E 31588", "1E31588", "AR1495"]) ok(looksLikeChassisId(t), `"${t}" is an identifier`);
for (const t of ["1969", "1969 camaro", "porsche 996 carrera", "30000", "90210", "911", "1966 ford mustang", "red porsche 911", "123456"]) ok(!looksLikeChassisId(t), `"${t}" is not an identifier`);
const seen = [];
globalThis.fetch = async url => {
  const u = String(url); seen.push(u);
  if (u.includes("/sales_archive?")) {
    const want = decodeURIComponent((/vin_norm=eq\.([^&]+)/.exec(u) || [])[1] || "");
    if (want === "WP0BA29983S635608") return new Response(JSON.stringify([{ id: "a1", vin: "WP0BA29983S635608", make: "Porsche", model: "996", year: 2003, platform: "bringatrailer", sale_date: "2026-10-22", sale_price: 26250, mileage: 61000, listing_title: "2003 Porsche 911 Carrera Targa 6-Speed", raw_record: { body_style: "Coupe", title: "2003 Porsche 911 Carrera Targa 6-Speed", url: "https://x/y" } }]), { status: 200 });
    return new Response("[]", { status: 200 });
  }
  if (u.includes("/auction_attempts?")) {
    const want = decodeURIComponent((/chassis_vin_norm=eq\.([^&]+)/.exec(u) || [])[1] || "");
    if (want === "11304412010836") return new Response(JSON.stringify([{ source_slug: "bringatrailer", attempt_date: "2026-10-21", high_bid: 68000, auction_status: "reserve_not_met", make: "Mercedes-Benz", model: "SL-Class", year: 1969, raw_record: { title: "1969 Mercedes-Benz 280SL", url: "https://x/z" } }]), { status: 200 });
    return new Response("[]", { status: 200 });
  }
  return new Response("[]", { status: 200 });
};
const env = { supabaseUrl: "http://fake", supabaseKey: "k" };
const targa = await findVinArchiveMatch(env, { vin: "WP0BA29983S635608" });
ok(targa && targa.bodyStyle === "targa", `a Targa whose stored body says Coupe is named a Targa (bodyStyle ${targa && targa.bodyStyle})`);
seen.length = 0;
const merc = await findVinArchiveMatch(env, { vin: "113.044.12.010836" });
ok(merc && /280SL/i.test(merc.displayName || merc.model || ""), `the 14 digit chassis is found by its unsold auction record (${merc && (merc.displayName || merc.model)})`);
ok(seen.some(u => /vin_norm=eq\.11304412010836/.test(u)) && seen.some(u => /chassis_vin_norm=eq\.11304412010836/.test(u)), "the lookup is the exact normalized string on both tables, no decoding, no prefix search");
ok(!seen.some(u => /ilike|like\./.test(u)), "no pattern match is used");
const none = await findVinArchiveMatch(env, { vin: "99999999999999" });
ok(none === null, "an unknown number returns null (the page then says so plainly)");
console.log(failed ? `vinLookupCheck: ${failed} FAILED.` : "vinLookupCheck: all passed.");
process.exit(failed ? 1 : 0);
