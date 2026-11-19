// Wolseley-style ruling (Sam, Oct 25 2026): a known archive marque with a model the archive does not hold asks which model, says no sales of
// that model were found, and offers the make's most-sold models as chips; it never reads the whole make's sales as the answer. Own process
// (the resolver caches its make list per process). Fake database, no network.
//   node scripts/archiveModelCheck.mjs
import { resolveVehicle } from "../lib/vehicle.js";
let failed = 0; const ok = (n, c, d) => { if (!c) failed++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`); };
// WOLSELEY-STYLE (a known archive marque, a model the archive does not hold): which model, with the make's most-sold models as chips
{
  const realFetch = globalThis.fetch;
  const rows = [...Array(30).fill({ model: "Hornet" }), ...Array(12).fill({ model: "6/80" }), ...Array(5).fill({ model: "1500" }).slice(0, 0), { model: "Unknown" }];
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u.includes("fake.supabase.test/rest/v1/sales_archive")) return new Response(JSON.stringify(rows), { status: 200 });
    if (u.includes("fake.supabase.test")) return new Response("[]", { status: 200 });
    throw new Error("offline");
  };
  const r = await resolveVehicle("1961 Wolseley 1500", { supabaseUrl: "https://fake.supabase.test", supabaseKey: "k" });
  const c = (r && r.clarification) || {};
  ok("a Wolseley model the archive does not hold asks which model", r.status === "needs_clarification" && /Which model is the 1961 Wolseley\?/.test(c.question || ""), c.question);
  ok("it says no sales of that model were found", /No sales of a 1961 Wolseley 1500 were found\./.test(c.question || ""), c.question);
  ok("the chips are the make's most-sold models", (c.chips || []).includes("Hornet"), JSON.stringify(c.chips));
  ok("it carries the make and no model", r.vehicle && r.vehicle.make === "Wolseley" && !r.vehicle.model);
  globalThis.fetch = realFetch;
}
process.exit(failed ? 1 : 0);
