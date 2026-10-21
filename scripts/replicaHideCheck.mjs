// replicaHideCheck (Lane B, Oct 21 2026, Sam's Buy 1f replica decision: "hide replicas in Buy, matching the engine pools; a search that
// names the replica itself still finds it"): offline, no network; Buy's real search path (searchLive) over injected live rows.
// ONE fence: lib/live/specialFlag.js specialFlag + liveTrust specialAsked (the live side's shared replica test, which holds the
// engine's replica words); the builder-only title ("Beck 550 Spyder") is added there as a named replica builder.
globalThis.fetch = async () => { throw new Error("blocked"); };
delete process.env.SUPABASE_URL; delete process.env.SUPABASE_SERVICE_ROLE_KEY;
const { searchLive, parseQueryResolved } = await import("../lib/live/search.js");
const { specialFlag } = await import("../lib/live/specialFlag.js");
let bad = 0;
const ok = (c, m) => { console.log((c ? "ok   " : "FAIL ") + m); if (!c) bad++; };
const NOW = Date.now();
const row = (id, title, make, model, year) => ({ id, listing_title: title, make, model, year, end_time: new Date(NOW + 3 * 86400e3).toISOString(), current_bid_usd: 90000, price_usd: 90000, status: "live", source: "bringatrailer", photo_url: "x", mileage: 20000, vin_norm: "V" + id });
const ROWS = [
  row(1, "Beck 550 Spyder", "Porsche", "550 Spyder", 1955), row(2, "1955 Porsche 550 Spyder", "Porsche", "550 Spyder", 1955),
  row(3, "2019 Porsche 911 Carrera S", "Porsche", "911", 2019), row(4, "1973 Porsche 911 T", "Porsche", "911", 1973),
  row(5, "1958 Porsche 356 Speedster Replica", "Porsche", "356", 1958), row(6, "Jeff Beck's 1932 Ford Roadster", "Ford", "Model B", 1932),
  row(7, "1965 Shelby Cobra Recreation", "Shelby", "Cobra", 1965), row(8, "2005 Porsche Cayenne S", "Porsche", "Cayenne", 2005)
];
async function run(q) {
  const p = await parseQueryResolved(q, {});
  const { rows } = await searchLive({}, p.vehicle, p.filters, p.text, { rows: ROWS });
  return rows.map(x => x.r.id);
}
const porsche = await run("Porsche");
ok(!porsche.includes(1), `"Porsche" shows no Beck 550 Spyder card (${porsche.join(",")})`);
ok(!porsche.includes(5), "a replica by word (356 Speedster Replica) stays hidden as before");
ok(porsche.includes(2) && porsche.includes(3) && porsche.includes(4) && porsche.includes(8), "the real Porsches (550 Spyder, 911s, Cayenne) are all shown");
const beck = await run("Beck 550 Spyder");
ok(beck.includes(1), `"Beck 550 Spyder" finds the Beck car (${beck.join(",")})`);
ok(beck[0] === 1, "and the Beck car comes FIRST (offline the resolver reads Porsche 550 Spyder as the make alone, so the rest of the Porsches follow, as for a typed Porsche 550 Spyder)");
const real = await run("Porsche 550 Spyder");
ok(real.includes(2) && !real.includes(1), `a typed Porsche 550 Spyder finds the real one and not the replica (${real.join(",")})`);
ok(specialFlag("Beck 550 Spyder", "Porsche") === "Beck replica", "the one fence names it");
ok(specialFlag("Jeff Beck's 1932 Ford Roadster", "Ford") === null && specialFlag("Ex-Jeff Beck 1932 Ford", "Ford") === null, "the owner's name is never a replica builder");
ok(specialFlag("2019 Porsche 911 Carrera S", "Porsche") === null && specialFlag("1955 Porsche 550 Spyder", "Porsche") === null, "a real Porsche carries no flag");
console.log(bad ? `replicaHideCheck: ${bad} failed` : "replicaHideCheck: all passed");
process.exit(bad ? 1 : 0);
