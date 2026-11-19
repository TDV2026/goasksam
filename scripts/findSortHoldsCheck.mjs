// clock: real-ok the live rows end relative to the real now in this process; no calendar date is asserted
// A SORT THE PERSON CHOSE STAYS (Lane B, lane-b-find-sort-holds, Nov 18 2026; order bc85). The live fault: Sam searched "BMW", chose "Furthest below the range", typed "only ones less than 30k miles" (the sort held), then typed "show me ones
// near me": the zip box appeared and the menu flipped to "Closest to me" before any zip, and his sort was lost. CAUSE: three places wrote the sort for a request that never asked for one: (1) the chat's own tool call (the "sort" parameter the
// written answer fills, "nearest" for "near me") replaced the held sort in lib/live/samChat.js toolSearchLive, (2) runTurn's "near me with a zip" road set sort "nearest" on every such request, (3) the state the search saved kept the sort it
// asked for even when the read could not honour it (Closest to me with no place), so the next draw and the address showed it. FIX: one reader of a sort said in words (sortWordsIn) and one rule (heldSortFor) every road ends in.
// CLASS (the rule, every Find road: typed words with and without the model, chat, rerun, show more, the car bar token, a partial car, the distance pills, Change zip): a chosen sort stays through every filter (miles, price, colour, year, near me,
// the pills, Change zip); near me and the pills narrow and put the distance on each card, they do not re-sort; the sort becomes Closest to me only on a tap or in words; with no sort ever chosen near me may order by distance and the menu says so;
// near me with no zip changes nothing while the zip box shows. Driven through the live turn (runTurn, the model stubbed at the network) and the page's filters request (runFilters).
//   node scripts/findSortHoldsCheck.mjs [repo root]      (a tree without the fix fails: run it on origin/main)      --mutants breaks one rule at a time in a copy
import fs from "node:fs"; import path from "node:path"; import { spawnSync } from "node:child_process"; import { fileURLToPath, pathToFileURL } from "node:url";
const args = process.argv.slice(2), here = path.dirname(fileURLToPath(import.meta.url)), root = path.resolve(args.find(a => !a.startsWith("--")) || path.join(here, ".."));
if (args.includes("--mutants")) process.exit(mutants());
process.chdir(root);
process.env.SUPABASE_URL = "https://fake.supabase.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "k"; process.env.LAUNCH_STAGE = "2"; process.env.OLDCARSDATA_API_KEY = "unused"; process.env.ANTHROPIC_API_KEY = "unused";
let pass = 0, fail = 0; const fails = []; const ok = (n, c, d) => { if (c) pass++; else { fail++; fails.push(n + (d !== undefined ? " " + JSON.stringify(d).slice(0, 260) : "")); } };
const NOW = Date.now(), DAY = 864e5;
const PLACES = [["Chicago, IL", 31000], ["Naperville, IL", 52000], ["Los Angeles, CA", 12000], ["Seattle, WA", 74000], ["Austin, TX", 41000], ["Boston, MA", 18000], ["Miami, FL", 90000], ["Denver, CO", 27000]];
const COLOURS = ["Red", "Black", "White", "Blue"];
const rows = Array.from({ length: 24 }, (_, i) => { const [loc, mi] = PLACES[i % 8], year = 1988 + (i % 9) * 3; return { id: 200 + i, source: i % 3 ? "bringatrailer" : "carsandbids", source_listing_id: "s" + i, url: "https://auction.test/l/" + i, listing_title: `${year} BMW M3`, make: "BMW", model: "M3", year, vin_norm: null, mileage: mi + i * 100, body: "Coupe", transmission: "6-Speed Manual", description: null, exterior_color: COLOURS[i % 4], location: loc, country: "US", currency: "USD", current_bid: 20000 + ((i * 7919) % 30) * 1000, current_bid_usd: 20000 + ((i * 7919) % 30) * 1000, end_time: new Date(NOW + DAY * (1 + ((i * 5) % 11))).toISOString(), photo_url: "https://img.example/" + i + ".jpg", last_seen_at: new Date(NOW).toISOString(), first_seen_at: new Date(NOW - DAY * (1 + (i % 7))).toISOString() }; });
const MODEL = { params: null, calls: 0 };   // what the written answer's tool call carries this turn (the stub of the network)
const sse = events => events.map(e => "event: " + e.type + "\ndata: " + JSON.stringify(e) + "\n\n").join("");
globalThis.fetch = async (url, init) => {
  const u = String(url);
  if (/api\.anthropic\.com/.test(u)) {
    MODEL.calls++; const body = JSON.parse(String(init && init.body || "{}")), afterTool = JSON.stringify(body.messages || []).includes("tool_result");
    const ev = afterTool && MODEL.params !== null || MODEL.params === null
      ? [{ type: "message_start", message: { usage: { input_tokens: 1 } } }, { type: "content_block_start", index: 0, content_block: { type: "text" } }, { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Here they are." } }, { type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 1 } }, { type: "message_stop" }]
      : [{ type: "message_start", message: { usage: { input_tokens: 1 } } }, { type: "content_block_start", index: 0, content_block: { type: "tool_use", id: "t1", name: "search_live" } }, { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: JSON.stringify(MODEL.params) } }, { type: "message_delta", delta: { stop_reason: "tool_use" }, usage: { output_tokens: 1 } }, { type: "message_stop" }];
    return new Response(sse(ev), { status: 200, headers: { "content-type": "text/event-stream" } });
  }
  const p = new URL(u).pathname; return new Response(p.endsWith("/live_listings") ? JSON.stringify(rows) : "[]", { status: 200 });
};
const imp = f => import(pathToFileURL(path.join(root, f)).href);
const SM = await imp("lib/live/samChat.js");
const env = { supabaseUrl: "https://fake.supabase.test", supabaseKey: "k" };
const turn = async (text, state, params) => { MODEL.params = params === undefined ? null : params; MODEL.calls = 0; return await SM.runTurn({ env, apiKey: "k", model: "m", messages: [{ role: "user", content: text }], state, deadlineMs: 12000 }); };
const sortOf = r => r && r.state && r.state.filters ? r.state.filters.sort || null : null;
const menuOf = r => r && r.meta ? r.meta.sort : undefined;
const SORTS = ["lowest_bid", "highest_bid", "newest", "lowest_miles", "below_range"];   // below_range cannot be ordered in this offline world (no market rank), so for it the HELD sort in the state is what is asserted

// the rule itself (one function every road ends in)
ok("heldSortFor and sortWordsIn are exported", typeof SM.heldSortFor === "function" && typeof SM.sortWordsIn === "function");
if (typeof SM.heldSortFor === "function") {
  const h = SM.heldSortFor;
  ok("a held sort beats the chat's own parameter (the live fault: held below_range, the chat sent nearest)", h({ asked: null, held: "below_range", given: "nearest", nearMe: true }) === "below_range");
  ok("a sort said in words beats the held one", h({ asked: "nearest", held: "below_range", given: null, nearMe: false }) === "nearest");
  ok("no sort chosen and near me asked: nearest stands (the menu then says so)", h({ asked: null, held: null, given: "nearest", nearMe: true }) === "nearest");
  ok("no sort chosen and the chat sent nearest with nobody asking for distance: not the person's sort", h({ asked: null, held: null, given: "nearest", nearMe: false }) === null);
  ok("a tap or a first search's own sort stands when nothing is held", h({ asked: null, held: null, given: "lowest_bid", nearMe: false }) === "lowest_bid");
}
if (typeof SM.sortWordsIn === "function") {
  for (const [t, k] of [["closest first", "nearest"], ["sort by distance", "nearest"], ["show me the closest first", "nearest"], ["cheapest first", "lowest_bid"], ["newest first", "newest"], ["fewest miles first", "lowest_miles"], ["furthest below the range", "below_range"]]) ok(`words that ask a sort: "${t}" is ${k}`, SM.sortWordsIn(t) === k, SM.sortWordsIn(t));
  for (const t of ["show me ones near me", "only ones less than 30k miles", "within 100 miles", "red ones", "under $40k", "1995 or newer cars"]) ok(`words that are a filter ask no sort: "${t}"`, SM.sortWordsIn(t) === null, SM.sortWordsIn(t));
}

// the live road, each chosen sort held through each filter in turn (typed words through the model, the chat's tool call carrying its own sort parameter, the worst case: nearest)
const FILTERS = [["miles", "show me only ones less than 30k miles", { miles_max: 30000 }], ["price", "only ones under $40k", { budget_max: 40000 }], ["colour", "only the red ones", { colour: "red" }], ["year", "show me 1995 or newer", { year_min: 1995 }]];
for (const S of SORTS) {
  let st = { filters: { make: "BMW", sort: S } };
  for (const [name, words, extra] of FILTERS) {
    for (const [how, given] of [["the chat echoes the sort", S], ["the chat sends no sort", undefined], ["the chat sends nearest", "nearest"]]) {
      const r = await turn(words, st, { make: "BMW", ...extra, ...(given ? { sort: given } : {}) });
      ok(`${S}: held through ${name} (${how}): the saved sort is still ${S}`, sortOf(r) === S, [sortOf(r), r.outcome && r.outcome.kind]);
      if (S !== "below_range") ok(`${S}: held through ${name} (${how}): the menu says ${S}`, menuOf(r) === S, menuOf(r));
    }
  }
  // near me with a zip: narrows and gives each card its distance, never re-sorts; the chat's own nearest never moves it
  const stz = { filters: { make: "BMW", sort: S }, zip: "60601" };
  const nz = await turn("show me ones near me", stz, { make: "BMW", sort: "nearest" });
  ok(`${S}: near me with a zip keeps the sort (state)`, sortOf(nz) === S, sortOf(nz));
  if (S !== "below_range") ok(`${S}: near me with a zip keeps the sort (menu)`, menuOf(nz) === S, menuOf(nz));
  ok(`${S}: near me with a zip puts the distance on the cards`, (nz.cards || []).length > 0 && (nz.cards || []).some(c => Number.isFinite(Number(c.distance))), (nz.cards || []).slice(0, 1).map(c => Object.keys(c).filter(k => /dist/i.test(k))));
  // near me with no zip: the zip box, nothing about the sort changes, cancelling leaves everything as it was
  const ask = await turn("show me ones near me", { filters: { make: "BMW", sort: S } }, { make: "BMW", sort: "nearest" });
  ok(`${S}: near me with no zip asks for the zip and keeps the filters and the sort in the state`, ask.outcome && ask.outcome.zipAsk === true && sortOf(ask) === S && ask.state.filters.make === "BMW", [ask.outcome && ask.outcome.kind, sortOf(ask)]);
  ok(`${S}: the zip ask draws no new menu (no meta) and keeps the cards the page has`, ask.meta === null && ask.keep === true, [ask.meta && ask.meta.sort, ask.keep]);
  // the page's filters request (rerun, show more, the car bar token, a partial car, the distance pills, Change zip): the sort rides in the filters and holds
  for (const [name, f, o] of [["rerun", { make: "BMW", sort: S }, {}], ["show more", { make: "BMW", sort: S }, { offset: 12, batchOnly: true }], ["the car bar token (a car with the sort in its address)", { make: "BMW", model: "M3", sort: S }, {}], ["a partial car", { make: "BMW", sort: S, year_min: 1990, year_max: 1999 }, {}], ["a distance pill", { make: "BMW", sort: S }, { zip: "60601", radius: 100 }], ["Change zip", { make: "BMW", sort: S }, { zip: "10001", radius: 500 }], ["a mileage filter", { make: "BMW", sort: S, miles_max: 30000 }, {}], ["a price filter", { make: "BMW", sort: S, budget_max: 40000 }, {}]]) {
    const r = await SM.runFilters(env, f, o);
    ok(`${S}: the page's ${name} request keeps the sort (state)`, sortOf(r) === S, sortOf(r));
    if (S !== "below_range" && !o.batchOnly) ok(`${S}: the page's ${name} request keeps the sort (menu)`, menuOf(r) === S, menuOf(r));
  }
  // a sort asked for in words changes it
  const asked = await turn("sort by distance", { filters: { make: "BMW", sort: S }, zip: "60601" }, { make: "BMW", sort: S });
  ok(`${S}: "sort by distance" with a zip is the person asking for it: Closest to me`, sortOf(asked) === "nearest" && menuOf(asked) === "nearest", [sortOf(asked), menuOf(asked)]);
  const askedNo = await turn("closest first", { filters: { make: "BMW", sort: S } }, { make: "BMW", sort: "nearest" });
  ok(`${S}: "closest first" with no zip asks for the zip first and changes nothing yet`, askedNo.outcome && askedNo.outcome.zipAsk === true && sortOf(askedNo) === S, [askedNo.outcome && askedNo.outcome.kind, sortOf(askedNo)]);
}
// no sort ever chosen: a near me request may order by distance, and the menu says so; a filter request never makes a sort up
{ const r = await turn("show me ones near me", { filters: { make: "BMW" }, zip: "60601" }, { make: "BMW", sort: "nearest" });
  ok("no sort chosen, near me with a zip: ordered by distance and the menu says Closest to me", sortOf(r) === "nearest" && menuOf(r) === "nearest", [sortOf(r), menuOf(r)]);
  const m = await turn("show me only ones less than 30k miles", { filters: { make: "BMW" } }, { make: "BMW", miles_max: 30000, sort: "nearest" });
  ok("no sort chosen, a mileage filter the chat tagged with nearest: no sort is made up (the menu stays the default)", sortOf(m) === null && menuOf(m) !== "nearest", [sortOf(m), menuOf(m)]);
  const t = await SM.runFilters(env, { make: "BMW", sort: "nearest" }, { zip: "60601" });
  ok("a tap on Closest to me (the page's filters request with the zip) orders by distance", sortOf(t) === "nearest" && menuOf(t) === "nearest", [sortOf(t), menuOf(t)]);
  const nt = await SM.runFilters(env, { make: "BMW", sort: "nearest" }, {});
  ok("Closest to me with no place is not kept as the person's sort (the read cannot honour it, the menu says what it did)", sortOf(nt) === null && menuOf(nt) !== "nearest", [sortOf(nt), menuOf(nt)]); }

console.log(`findSortHoldsCheck: ${pass} pass, ${fail} FAIL` + (fail ? "\n" + fails.map(f => "  FAIL " + f).join("\n") : ""));
process.exit(fail ? 1 : 0);

function mutants() {
  const SRC = root, COPY = fs.mkdtempSync(path.join(path.dirname(SRC), "goasksam-b-sortmut-"));
  spawnSync("sh", ["-c", `cd "${SRC}" && for d in lib api public data scripts package.json; do cp -R "$d" "${COPY}/" 2>/dev/null; done; ln -s "${SRC}/node_modules" "${COPY}/node_modules"`]);
  const rd = f => fs.readFileSync(path.join(COPY, f), "utf8"), wr = (f, s) => fs.writeFileSync(path.join(COPY, f), s);
  const F = "lib/live/samChat.js";
  const MUT = [
    ["the chat's own sort parameter moves a held sort again", s => s.replace("  if (asked) return asked;\n  if (held) return held;", "  if (asked) return asked;")],
    ["a held sort is dropped when the person did not ask", s => s.replace("  if (held) return held;\n", "")],
    ["the chat's nearest with nobody asking for distance is kept", s => s.replace("if (given === \"nearest\" && !nearMe) return null;", "")],
    ["near me with a zip sets Closest to me whatever was chosen", s => s.replace("...(prevFilters.sort ? {} : { sort: \"nearest\" })", "sort: \"nearest\"")],
    ["words that ask for distance are not read", s => s.replace("const asked = sortWordsIn(ctx.lastUser) ||", "const asked = null ||")],
    ["the state keeps a Closest to me the read could not honour", s => s.replace("!(k === \"sort\" && val === \"nearest\" && sortKey !== \"nearest\")", "true")],
    ["near me with no zip rewrites the saved filters", s => s.replace("state: { ...(state || {}), filters: prevFilters }", "state: { ...(state || {}), filters: { ...prevFilters, sort: \"nearest\" } }")],
    ["the hold ignores a sort said in words (nothing can change it)", s => s.replace("if (asked) return asked;\n", "")]
  ];
  let bad = 0;
  for (const [name, fn] of MUT) {
    const orig = rd(F), next = fn(orig);
    if (next === orig) { console.log("STALE MUTANT (no change): " + name); bad++; continue; }
    wr(F, next);
    const r = spawnSync("node", [path.join(COPY, "scripts/findSortHoldsCheck.mjs"), COPY], { encoding: "utf8", timeout: 600000 });
    wr(F, orig);
    const killed = r.status !== 0; console.log((killed ? "killed   " : "SURVIVED ") + name); if (!killed) bad++;
  }
  fs.rmSync(COPY, { recursive: true, force: true });
  console.log(bad ? `${bad} mutant(s) survived or stale` : `all ${MUT.length} mutants killed`);
  return bad ? 1 : 0;
}
