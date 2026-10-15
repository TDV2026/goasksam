// Buy's card and its one question (Oct 14 2026, Lane C, Sam's brief). No network, nothing written, nothing sent.
//   1. THE QUESTION RULE (lib/live/narrow.js askRule) on three fixtures: a make with several models asks the model; a
//      997 Carrera set asks what removes the most cars on average; an E46 M3 set asks the body (the gearbox is skipped:
//      one answer holds over three quarters). A specific search asks nothing; mileage and distance chips are cumulative
//      with their counts; the zip question ranks last.
//   2. Spec chips (api/buySearch.js specChips): each only when the listing states it, a missing field left out.
//   3. Both Sam lines (api/buySearch.js samLines): the range line with the bid judged, then the car's own sale; no
//      history, the range line only; no judgement on the sibling rung or an ended car.
//   4. "Have Sam keep looking": the Task drafted from a Buy seed carries the page's filters (lib/tasks/tasks.js buyJob).
//   5. The page draws all of it, and its new copy keeps the copy rules.
//   node scripts/buyCardAskCheck.mjs      Run by scripts/prePush.mjs.
process.env.SUPABASE_URL = "http://127.0.0.1:9"; process.env.SUPABASE_SERVICE_ROLE_KEY = "fixture-only";
import fs from "node:fs";
const { askRule, mileageAsk, distanceAsk, removalOf, ASK_SKIP_SHARE, ASK_STOP_SHARE } = await import("../lib/live/narrow.js");
const { specChips, colourChip, samLines, bidPlacing } = await import("../api/buySearch.js");
const T = await import("../lib/tasks/tasks.js");

let fails = 0, passes = 0;
const ok = (c, what) => { if (c) passes++; else { fails++; console.log("FAIL  " + what); } };
let id = 0;
const car = (o = {}) => ({ r: { id: ++id, year: o.year || 2008, listing_title: o.title || "car" }, facts: { body: o.body || null, gearbox: o.gearbox || null, miles: o.miles || null } });
const many = (n, o) => Array.from({ length: n }, () => car(o));

// ---- 1. the rule
{ // A make with several models: the model question, counted chips, "Any BMW (28)".
  const xs = many(28, {});
  const models = [{ label: "M3", n: 8, patch: { model: "M3" } }, { label: "M4", n: 5, patch: { model: "M4" } }, { label: "M5", n: 4, patch: { model: "M5" } }, { label: "Z4", n: 3, patch: { model: "Z4" } }];
  const a = askRule(xs, { p: { make: "BMW", colour: "red" }, v: { make: "BMW", model: null }, models });
  ok(a[0] && a[0].dim === "model" && a[0].q === "Which model?" && a[0].any.label === "Any BMW" && a[0].any.n === 28 && a[0].chips.map(c => `${c.label} (${c.n})`).join(" · ") === "M3 (8) · M4 (5) · M5 (4) · Z4 (3)", `red BMW: the model question (got ${JSON.stringify(a[0] && { dim: a[0].dim, q: a[0].q, chips: a[0].chips })})`);
}
{ // 997 Carrera: body 12/6/2, gearbox 9/9 with two unstated. Removal: body 10.8, gearbox 11 (each answer also removes the
  // two that don't say), so the gearbox is asked first and the body after it.
  const xs = [...many(6, { body: "coupe", gearbox: "manual" }), ...many(5, { body: "coupe", gearbox: "auto" }), car({ body: "coupe" }),
    ...many(3, { body: "cabriolet", gearbox: "manual" }), ...many(3, { body: "cabriolet", gearbox: "auto" }), car({ body: "targa", gearbox: "auto" }), car({ body: "targa" })];
  const a = askRule(xs, { p: { make: "Porsche", model: "911", generation: "997", trim: "Carrera" }, v: { make: "Porsche", model: "911", genCode: "997", trim: "Carrera" } });
  ok(a.map(q => q.dim).join(",") === "gearbox,body", `997 Carrera: gearbox, then body (got ${a.map(q => q.dim + ":" + q.why.removes).join(",")})`);
  ok(a[0] && a[0].why.removes === 11 && a[1] && a[1].why.removes === 10.8, "997 Carrera: removal by the rule's own arithmetic");
  ok(a[0] && a[0].unstated === 2 && /gearbox/.test(a[0].unstatedWhat || ""), "the cars that don't say are counted, never put in a chip");
}
{ // E46 M3: body 9/7; gearbox 13 manual of 16 (81%, over three quarters: skipped).
  const xs = [...many(8, { body: "coupe", gearbox: "manual" }), car({ body: "coupe", gearbox: "auto" }), ...many(5, { body: "convertible", gearbox: "manual" }), ...many(2, { body: "convertible", gearbox: "auto" })];
  const a = askRule(xs, { p: { make: "BMW", model: "M3", generation: "E46" }, v: { make: "BMW", model: "M3", genCode: "E46" } });
  ok(a[0] && a[0].dim === "body" && !a.some(q => q.dim === "gearbox"), `E46 M3: the body, the gearbox skipped (got ${a.map(q => q.dim).join(",")})`);
  ok(13 / 16 > ASK_SKIP_SHARE, "the gearbox's largest answer is over the skip share");
}
{ // A specific search asks nothing: everything named, few cars.
  const xs = many(2, { body: "sedan", gearbox: "manual", miles: 30000 });
  ok(askRule(xs, { p: { make: "BMW", model: "M3", year_min: 2018, year_max: 2018, colour: "red", gearbox: "manual", miles_max: 50000 }, v: { make: "BMW", model: "M3", year: 2018 } }).length === 0, "2018 red BMW M3 manual under 50,000 miles: no question");
  // Many cars that all agree: nothing removes a quarter, no question.
  ok(askRule(many(20, { body: "coupe", gearbox: "manual", miles: 30000 }), { p: { make: "Porsche", model: "911" }, v: { make: "Porsche", model: "911", genCode: "997" } }).length === 0, "a set that doesn't split: no question");
  // An attribute the search fixes is never asked.
  const xs2 = [...many(6, { body: "coupe" }), ...many(6, { body: "cabriolet" })];
  ok(!askRule(xs2, { p: { make: "Porsche", model: "911", body: "coupe" }, v: { make: "Porsche", model: "911" } }).some(q => q.dim === "body"), "a body the search names is never asked");
  // Same words, same question.
  const r1 = JSON.stringify(askRule(xs2, { p: {}, v: { make: "Porsche", model: "911" } })), r2 = JSON.stringify(askRule(xs2, { p: {}, v: { make: "Porsche", model: "911" } }));
  ok(r1 === r2, "the rule is deterministic");
}
{ // Mileage: cumulative chips with counts, "Any mileage".
  const xs = [...many(6, { miles: 12000 }), ...many(8, { miles: 40000 }), ...many(14, { miles: 90000 })];
  const m = mileageAsk(xs);
  ok(m && m.chips.map(c => `${c.label} (${c.n})`).join(" · ") === "Under 25,000 (6) · Under 50,000 (14)", `mileage chips (got ${m && m.chips.map(c => c.label + " " + c.n).join(", ")})`);
  const a = askRule(xs, { p: { make: "Porsche", model: "911" }, v: { make: "Porsche", model: "911", genCode: "997" } });
  ok(a[0] && a[0].dim === "mileage" && a[0].any.label === "Any mileage" && a[0].any.n === 28, "mileage asked with Any mileage (28)");
}
{ // Distance with a zip: "Within 100 miles (3) · 250 miles (9) · 500 miles (15) · Anywhere (28)".
  const dist = [...Array(3).fill(50), ...Array(6).fill(200), ...Array(6).fill(400), ...Array(13).fill(1500)];
  const d = distanceAsk(dist);
  ok(d && d.chips.map(c => `${c.label} (${c.n})`).join(" · ") === "Within 100 miles (3) · 250 miles (9) · 500 miles (15)", `distance chips (got ${d && d.chips.map(c => c.label + " " + c.n)})`);
  const a = askRule(many(28, {}), { p: { make: "Porsche" }, v: { make: "Porsche", model: "911" }, distance: { zip: "46552", dist } });
  ok(a[0] && a[0].dim === "distance" && a[0].any.label === "Anywhere" && a[0].chips[0].patch.location === "46552" && a[0].chips[0].patch.radius_miles === 100, "distance chips carry the zip and the radius");
  // No zip yet: the zip question, ranked after every car question.
  const xs = [...many(10, { body: "coupe" }), ...many(10, { body: "cabriolet" })];
  const b = askRule(xs, { p: { make: "Porsche", model: "911" }, v: { make: "Porsche", model: "911", genCode: "997" }, distance: { estimate: 15, maxShare: 0.4 } });
  ok(b.map(q => q.dim).join(",") === "body,distance" && b[1].zipAsk && /Enter a zip or choose Anywhere/.test(b[1].q), `the zip question comes last (got ${b.map(q => q.dim)})`);
  ok(Math.abs(removalOf({ chips: [{ n: 10 }, { n: 10 }] }, 20) - 10) < 1e-9 && ASK_STOP_SHARE === 0.25, "removal arithmetic and the stop share");
  // Cumulative: the cars past the last chip are reached only by Any (removes nothing). Live Oct 14: 12 997 Carreras, six
  // under 50,000 miles, six over: mileage removes 3, the body (7 coupes, 5 cabriolets) 5.8, so the body is asked.
  ok(Math.abs(removalOf({ chips: [{ n: 6 }], bands: [6, 6], cumulative: true }, 12) - 3) < 1e-9, "a cumulative chip's removal counts the cars past it at zero");
  const live997 = [...many(4, { body: "coupe", gearbox: "manual", miles: 30000 }), ...many(3, { body: "coupe", gearbox: "manual", miles: 80000 }), ...many(3, { body: "cabriolet", gearbox: "manual", miles: 90000 }), car({ body: "cabriolet", gearbox: "auto", miles: 20000 }), car({ body: "cabriolet", gearbox: "auto", miles: 40000 })];
  const q997 = askRule(live997, { p: { make: "Porsche", model: "911", generation: "997", trim: "Carrera" }, v: { make: "Porsche", model: "911", genCode: "997", trim: "Carrera" } });
  ok(q997[0] && q997[0].dim === "body" && !q997.some(q => q.dim === "gearbox"), `the live 997 Carrera split asks the body, the gearbox skipped at 10 of 12 (got ${q997.map(q => q.dim + ":" + q.why.removes)})`);
}

// ---- 2. spec chips
{
  const full = specChips({ listing_title: "42k-Mile 1997 Porsche 911 Carrera Targa", vin_norm: "WP0DA299XVS385140", description: "This Targa is finished in Black over Cashmere Beige leather. It is offered with a clean Carfax report and a clean Indiana title." }, { colour: "black", gearboxLabel: "Manual" });
  ok(full.join(" | ") === "Manual | Black over Cashmere Beige | Clean title | VIN WP0DA2…5140", `all four chips (got ${full.join(" | ")})`);
  ok(specChips({ listing_title: "2004 BMW M3 Coupe" }, {}).length === 0, "nothing stated: no chips");
  ok(specChips({ listing_title: "1987 Porsche 911", vin_norm: "9117100123" }, { colour: "red" }).join("|") === "Red", "a chassis number is not a VIN chip; the paint alone when no interior is stated");
  ok(!specChips({ listing_title: "x", description: "It has never had a salvage title." }, {}).some(c => /title/i.test(c)), "a title status stated only in the negative is left out");
  ok(specChips({ listing_title: "x", description: "Offered on a rebuilt Texas title." }, {}).join() === "Rebuilt title", "a branded title shows as stated");
  ok(!specChips({ listing_title: "x", description: "finished in Silver over Tan." }, {}).some(c => / over /.test(c)), "no interior noun: the interior is not guessed");
}

// ---- 3. both Sam lines
{
  const now = Date.parse("2026-10-14T12:00:00Z");
  const base = { market: { kind: "range", low: 62000, high: 84000, rungLines: [], soldLine: "The middle half of 993 Carrera Targa sales landed at $62,000 to $84,000 in the last twelve months." }, current_bid_usd: 36000, end_time: "2026-10-16T18:00:00Z", timeline: [{ date: "2023-06-20", result: "sold", price: 79500, url: "https://bringatrailer.com/listing/x" }] };
  const two = samLines(base, now);
  ok(two.length === 2 && two[0].text === "The middle half of 993 Carrera Targa sales landed at $62,000 to $84,000 in the last twelve months. The bid is below the range." && two[1].text === "This exact car sold for $79,500 in June 2023.", `history: both lines in order (got ${JSON.stringify(two.map(x => x.text))})`);
  ok(samLines({ ...base, timeline: [] }, now).length === 1, "no history: the range line only");
  ok(bidPlacing({ ...base, current_bid_usd: 70000 }, now) === "inside the range" && bidPlacing({ ...base, current_bid_usd: 90000 }, now) === "above the range", "the bid judged by the engine's placingFor");
  ok(!/The bid is/.test(samLines({ ...base, market: { ...base.market, rung: "sibling" } }, now)[0].text), "no judgement against a sibling's range");
  ok(!/The bid is/.test(samLines({ ...base, end_time: "2026-10-01T00:00:00Z" }, now)[0].text), "no judgement once the auction has ended");
  ok(!/The bid is/.test(samLines({ ...base, bid_unknown: true }, now)[0].text), "no judgement on a bid not in dollars");
  ok(samLines({ ...base, timeline: [{ date: "2024-03-02", result: "not_sold", price: 61000 }] }, now)[1].text === "This exact car was bid to $61,000 in March 2024 and didn’t sell.", "an unsold appearance reads as such");
}

// ---- 4. the Task from the page's spec
{
  const filters = { make: "Porsche", model: "911", generation: "997", trim: "Carrera", body: "coupe", gearbox: "manual", colour: "black", era: "997", sort: "lowest_bid", location: "46552", radius_miles: 250 };
  const mem = T.memStore(), env = { mem }, U = "aaaaaaaa-0000-4000-8000-0000000000c1";
  const r = await T.draftTurn(env, { userId: U }, { draft: null, text: "997 Carrera coupes", seed: { from: "buy_search", ref: null, filters } });
  const want = { make: "Porsche", model: "911", generation: "997", era: "997", trim: "Carrera", body: "coupe", gearbox: "manual", colour: "black", location: "46552", radius_miles: 250 };
  ok(r.draft && JSON.stringify(r.draft.filters) === JSON.stringify(want) && r.draft.seed.from === "buy_search", `the drafted Task's filters are the page's (got ${JSON.stringify(r.draft && r.draft.filters)})`);
  ok(mem.tasks.length === 0 && /^Sam will look for /.test(r.reply) && /Shall Sam start\?$/.test(r.reply), "drafting writes nothing and reads the job back");
  ok(T.taskRow(want, null).listing_title === "Porsche 997 Carrera coupe", "the Task's market row names the page's car and body");
  const e46 = T.buyJob({ make: "BMW", model: "M3", era: "E46", body: "coupe", year_min: 2001, year_max: 2006 }).filters;
  ok(e46.era === "E46" && !e46.generation && T.taskRow(e46, null).listing_title === "BMW M3 E46 coupe", "the era chip is kept as the page had it (the same search) and names the row");
  ok(T.taskRow(T.buyJob({ make: "Porsche", model: "911", era: "996,997", body: "coupe" }).filters, null).listing_title === "Porsche 911 coupe", "two eras are not one generation");
  ok(T.buyJob({ colour: "red" }) === null, "a page spec without a make is not a job");
}

// ---- 5. the page draws it, and the new copy keeps the rules
{
  const page = fs.readFileSync(new URL("../api/buy.js", import.meta.url), "utf8");
  const client = JSON.parse(/^const CLIENT = (.*);$/m.exec(page)[1]);
  ok(/class="kpill" data-keep data-keepcard/.test(client) && /Have Sam keep looking/.test(client), "the card carries the keep looking pill");
  ok(/chipsHtml\(l\)/.test(client) && /l\.sam_lines/.test(client) && /c\.sam_lines/.test(client) && /j\.sam_lines/.test(client), "the card draws the chips and both lines from every path");
  ok(!/askShown\) >= 2/.test(client), "no two-question cap: the rule decides");
  ok(/border:1\.5px solid var\(--green\)[^}]*background:transparent/.test(page), "the pill is outlined, no fill");
  ok(/\.car \.trow h3\{[^}]*-webkit-line-clamp:unset;overflow:visible/.test(page), "the car name beside the pill is never cut off");
  const copy = ["Which model?", "Which body style?", "Manual or automatic?", "How many miles?", "How far would you travel?", "Keep it near you? Enter a zip or choose Anywhere.", "Any mileage", "Anywhere", "Any body style", "Any gearbox", "Use this zip", "The bid is below the range.", "This exact car sold for", "Have Sam keep looking"];
  const banned = /\b(worth|values?|valuation|estimates?|appraisal|median|percentile|alerts?|your car|I found)\b|[–—]/i;
  ok(copy.every(c => !banned.test(c)), "the new copy has no banned word, no first person, no dash");
}

// ---- 6. Sam's review, Oct 14 2026: chip words, one count, the bid with its time, no repeated car name
{
  ok(colourChip({ listing_title: "2008 Porsche 911 GT2 Black over a Black" }, { colour: "black" }) === "Black over Black", "a stray article leaves the colour chip, the listing's capitals stay");
  ok(colourChip({ listing_title: "1989 Porsche 911 Carrera Guards Red over black" }, { colour: "red" }) === "Guards Red over black" && colourChip({ listing_title: "x", description: "This car is finished in the Silver Gray Metallic over Imola Red leather." }, { colour: "silver" }) === "Silver Gray Metallic over Imola Red", "every word as the listing wrote it");
  ok(colourChip({ listing_title: "x", description: "It is finished in guards red over black leather." }, { colour: "red" }) === "Guards red over black", "the chip's first letter is a capital");
  ok(colourChip({ listing_title: "2005 Porsche 911", description: "This car is finished in Dark Olive Metallic over Sand Beige full leather upholstery." }, { colour: "green" }) === "Dark Olive Metallic over Sand Beige" && colourChip({ listing_title: "2006 BMW M3 Titanium Silver over Black Nappa" }, { colour: "silver" }) === "Titanium Silver over Black", "an interior ends at its last colour word");
  ok(colourChip({ listing_title: "1999 Porsche 911 Carrera" }, { colour: "Silver" }) === "Silver" && colourChip({ listing_title: "x" }, {}) === null, "one colour as stated; none stated, no chip");
  const page = fs.readFileSync(new URL("../api/buy.js", import.meta.url), "utf8");
  const client = JSON.parse(/^const CLIENT = (.*);$/m.exec(page)[1]);
  const fnSrc = name => { const i = client.indexOf("function " + name + "("); let d = 0, j = client.indexOf("{", i); for (let k = j; k < client.length; k++) { if (client[k] === "{") d++; else if (client[k] === "}" && !--d) return client.slice(i, k + 1); } return ""; };
  const lib = new Function(`var TZ = "America/Los_Angeles"; ${/var BODY_WORDS = [^;]*;/.exec(client)[0]} ${["timePT", "sameDay", "bidAt", "bidText", "carWords", "rungShown"].map(fnSrc).join("\n")}; function carTitle(l){ return l.title; } return { bidText, rungShown };`)();
  const t = Date.now() - 3 * 3600e3, want = new Date(t).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Los_Angeles" }).replace(" AM", "am").replace(" PM", "pm");
  const recent = lib.bidText("$66,666", Date.now() - 5 * 60e3);
  ok(/^Last bid we saw \$66,666 at \d{1,2}:\d\d[ap]m PT( on \w+day)?$/.test(recent), `a fresh bid reads with its time (got ${recent})`);
  ok(lib.bidText("$66,666", t).startsWith("Last bid we saw $66,666 at " + want + " PT"), "an older bid reads with its own time in Pacific time");
  ok(lib.bidText("$1", NaN) === "Bid $1", "a bid with no time reads Bid $X, a $1 bid as stored");
  ok(/k === "untimed" \? esc\("Bid " \+ amt\)/.test(client) && /!amt \? \(l\.bid_unknown \? "" : esc\("No bids yet"\)\)/.test(client), "No bids yet only with no bid record");
  // The card as the server builds it (cardOf), so the make the comparison drops is the one the page really has.
  const { cardOf } = await import("../api/buySearch.js");
  const card = cardOf({ r: { id: 1, make: "Porsche", listing_title: "2014 Porsche 911 Carrera S Coupe", source: "carsandbids" }, facts: {}, gen: null, unknown: [] });
  ok(card.make === "Porsche", "the card carries its make for the comparison");
  ok(lib.rungShown(card, ["2014 911 Carrera S Coupe"]).length === 0, "the car name under SAM is dropped when it is the card's own car");
  ok(lib.rungShown({ make: "Porsche", title: "2008 Porsche 911 GT2 Coupe" }, ["2008 911 GT2"]).length === 0, "a line that differs only by the make or a body style word is a repeat (GT2)");
  ok(lib.rungShown({ make: "Porsche", title: "1997 Porsche 911 Carrera Targa" }, ["911 Carrera, 1994 to 1997"]).length === 1 && lib.rungShown(card, ["Closest: 911 Carrera 4S"]).length === 1 && lib.rungShown({ make: "Porsche", title: "2011 Porsche Boxster Spyder" }, ["2011 Boxster"]).length === 1, "a different car compared keeps its line");
  ok(/askHtml\(a, d\.meta \|\| \{\}, qp\) \+ more/.test(client) && !/right \+ "<\/div><\/div><\/div>" \+ unstatedHtml/.test(client), "the question comes before the don't say and either generation lines");
  ok(/enrichThen\(first, function\(\)\{ if \(done\) redrawCards\(block, first, false\); else go\(\); \}\)/.test(client) && /function redrawCards\(block, list, onlyHidden\)/.test(client), "a market that comes back after the 12 seconds fills the cards already on screen");
}

// ---- 7. Sam, Oct 15 2026: one retry for pending markets, three lines that read oddly
{
  const page = fs.readFileSync(new URL("../api/buy.js", import.meta.url), "utf8");
  const client = JSON.parse(/^const CLIENT = (.*);$/m.exec(page)[1]);
  const fnSrc = name => { const i = client.indexOf("function " + name + "("); let d = 0, j = client.indexOf("{", i); for (let k = j; k < client.length; k++) { if (client[k] === "{") d++; else if (client[k] === "}" && !--d) return client.slice(i, k + 1); } return ""; };
  const everythingLine = new Function(fnSrc("everythingLine") + "; return everythingLine;")();
  ok(everythingLine({ unstated: 5, unstatedWhat: "colour" }, { colour: "red" }) === "That’s everything that says red right now." && everythingLine({ unstated: 2, unstatedWhat: "body" }, { body: "Coupe" }) === "That’s everything that says coupe right now.", "with unstated cars, everything names the word they lack");
  ok(everythingLine({ unstated: 0 }, { colour: "red" }) === "That’s everything matching your search right now." && /esc\(everythingLine\(m, f\)\)/.test(client), "with none, the line is as before");
  ok(/" more doesn’t say " \+ String\(UNSTATED\[m\.unstatedWhat\] \|\| "every detail"\)\.replace\(\/\^their\\b\/, "its"\)/.test(client) && /replace\(\/\^don't\/, "doesn’t"\)\.replace\(\/\\btheir\\b\/, "its"\)/.test(client), "one car reads its, more read their");
  const bodyWord = (f) => { const w = []; if (f.body) { const bw = String(f.body).toLowerCase(); w.push(f.make || f.model ? bw.charAt(0).toUpperCase() + bw.slice(1) : bw); } return w[0]; };
  ok(/w\.push\(f\.make \|\| f\.model \? bw\.charAt\(0\)\.toUpperCase\(\) \+ bw\.slice\(1\) : bw\)/.test(client) && ["targa", "coupe", "cabriolet", "convertible", "speedster"].every(b => /^[A-Z]/.test(bodyWord({ make: "Porsche", body: b }))) && bodyWord({ body: "coupe" }) === "coupe", "a body word after the car keeps its capital (Targas, Coupes, Cabriolets, Convertibles, Speedsters)");
  ok(/setTimeout\(retry, RETRY_MS\)/.test(client) && /var retry = function\(\)\{ var still = cards\.filter\(isPend\); if \(still\.length\) enrichThen\(still, function\(\)\{ redrawCards\(block, still, false\); \}\); \}/.test(client) && /var RETRY_MS = 15000/.test(client), "a pending market is asked for once more and filled on screen");
  const bs = fs.readFileSync(new URL("../api/buySearch.js", import.meta.url), "utf8");
  ok(/const body = BODY_WORD\[String\(v\.bodyStyle \|\| ""\)\.toLowerCase\(\)\] \|\| "";/.test(bs) && !/v\.bodyStyle \|\| x\.facts\.body/.test(bs), "the card's name carries only the body its market reads, never the feed's body field");
  ok(/var hasMc = !l\.swap && !!\(l\.market && l\.market\.query\)/.test(client), "a card still pending has no Market Check button (a pending market has no query)");
  ok(/headerHtml\(d\.meta \|\| \{\}, q, qp, f \|\| \{\}, !!\(a && !d\._showAll && !a\.vague\)\)/.test(client) && /: n && asking \? ""/.test(client), "a question on screen carries the count; the right-hand line is left out");
}

console.log(`buyCardAskCheck: ${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
