// LIVE: this script calls production (goasksam.com). Run it only in a gap the lanes name (no PUSH LOCK open), with the protection-bypass header if the
// site asks for one (Lane F's rule). It spends NO model call by default: the Task's setup turn is skipped (the job is passed as a Buy seed, read back in
// code) and the opening update's model turn is stubbed (testDrafts), so what it times is the engine's own work. --with-model leaves the update turn real
// (a few cents of model spend; only with Sam's go).
//   PROBE_KEY="$(security find-generic-password -s goasksam-probe -w)" node scripts/tasksStartTimes.mjs [--base https://goasksam.com] [--with-model] [--searches '[{"label":"..","filters":{..}}]']
// Stages per search (milliseconds):
//   create   the draft read-back + the Task row written + "Started" (what the deferred Start now returns at once)
//   first    the first match run: the live listings read and the matches (what "first" does in the background)
//   cards    Find's full cards for the matched cars, as the page asks for them (action "cards" reads each car's row and engine step)
//   market   each card's market read, as the page asks after the cards (buySearch "enrich", the engine's per-card read)
const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const BASE = arg("--base", "https://goasksam.com"), KEY = process.env.PROBE_KEY, WITH_MODEL = process.argv.includes("--with-model");
if (!KEY) { console.error("PROBE_KEY is required (see the header of this file)"); process.exit(2); }
const SEARCHES = JSON.parse(arg("--searches", JSON.stringify([
  { label: "G-body sedan", filters: { make: "Buick", model: "Regal", year_min: 1978, year_max: 1987 } },
  { label: "a 1995 Land Rover Defender under $100k", filters: { make: "Land Rover", model: "Defender", year_min: 1995, year_max: 1995, budget_max: 100000 } },
  { label: "red manual Porsche 911", filters: { make: "Porsche", model: "911", colour: "red", gearbox: "manual" } }
])));
const H = { "Content-Type": "application/json", "x-probe-key": KEY, "x-test-user": "00000000-0000-4000-8000-0000000000d5" };
const post = async (path, body, headers = H) => { const t0 = Date.now(); const r = await fetch(BASE + path, { method: "POST", headers, body: JSON.stringify(body) }); const j = await r.json().catch(() => ({})); return { ms: Date.now() - t0, status: r.status, j }; };
const rows = [];
for (const s of SEARCHES) {
  // create + first run through the engine's own scenario (in-memory store: nothing is written to the tasks table)
  const seed = { from: "buy_search", ref: null, filters: s.filters };
  const a = await post("/api/tasks", { action: "test_scenario", steps: [{ say: s.label, new: true, seed }] });
  const b = await post("/api/tasks", { action: "test_scenario", steps: [{ say: s.label, new: true, seed }, { control: "start", testDrafts: WITH_MODEL ? null : [] }] });
  const stepMs = b.j.steps ? b.j.steps.map(x => x.ms) : [];
  const create = stepMs[0] != null ? stepMs[0] : null, first = stepMs[1] != null ? stepMs[1] : null;
  const ids = ((b.j.updates || []).filter(u => u.listing_ids).flatMap(u => u.listing_ids) || []).slice(0, 6);
  const m = ids.length ? await post("/api/buySearch", { action: "enrich", ids }, { "Content-Type": "application/json" }) : { ms: null };
  rows.push({ search: s.label, create_ms: create, first_run_ms: first, cars_matched: ids.length, per_card_market_read_ms: m.ms, scenario_total_ms: b.ms, scenario_draft_only_ms: a.ms, started: b.j.steps && b.j.steps[1] && b.j.steps[1].out && b.j.steps[1].out.state });
}
console.table(rows);
console.log("create = draft read-back; first_run = Start including the opening update with the model turn " + (WITH_MODEL ? "REAL" : "stubbed (no model spend)") + "; per_card_market_read = one enrich call for up to six cars.");
