// clock: real-ok the live rows end relative to the real now in this process; no calendar date is asserted
// FIND SAYS IT ONCE (Lane S, Nov 19 2026; live "Land Rover Range Rover 1990 to 1999"). The header said "No Range Rovers from 1990 to 1999 are live right now, and none from 1989 or 2000 either.", under it a display line said
// "The sales for this one are being read.", under that a card said "Nothing live right now." beside the keep looking button and "Sam will email you when a matching car goes live." under it: three statements for one state, two the same
// and one about something else.
// CAUSES: (1) the none-live section printed the engine's still-reading line as a plain result paragraph, in the result's display type (24 px serif), above the keep card, so a note about PAST sales read as an answer about live cars; the
// line itself ("The sales for this one are being read.") also named no past sales. (2) the keep looking card's heading and both its sentences were written by the page ("Nothing live right now.", "Sam can keep looking for a ...",
// "Sam will email you when a matching car goes live."), so with nothing live the page said "nothing live" a second time and the email promise twice.
// FIX: the engine serves the two lines (reasonWords cold.past_reading "Past sales for this car are still being read.", keep.none "Sam will email you when one goes live." as meta.keepLine); the page prints the first once, in the past
// sales section's small type, and fills the section when the read lands; the keep card's heading is the second and the card repeats nothing.
// OTHER PAGES AND CARS THE CAUSE TOUCHES: every Find search with no live car (a year or a span of years, a color, a model with no cars, near me with nothing in the distance, the nearest-years case), every Find card whose past
// sales are still being read (card.market.line, the same engine line), and the Tasks cards (the same stillReadingMarket). The sweep below runs all of them through the real search handler and the real page.
// CLASS: on every Find state, the visible text says each thing once: at most one sentence that says nothing is live; at most one "being read" line, never in display type and never above the results; the keep card's words are the
// engine's keepLine and nothing else; no visible sentence is printed twice. A tree without the fix fails (run against origin/main); --mutants breaks one rule at a time.
//   node scripts/findOneVoiceCheck.mjs [repo root]
import fs from "node:fs"; import path from "node:path"; import { spawnSync } from "node:child_process"; import { fileURLToPath, pathToFileURL } from "node:url";
const args = process.argv.slice(2), here = path.dirname(fileURLToPath(import.meta.url)), root = path.resolve(args.find(a => !a.startsWith("--")) || path.join(here, ".."));
if (args.includes("--mutants")) process.exit(mutants());
process.chdir(root);
let pass = 0, fail = 0; const ok = (n, c, d) => { if (c) pass++; else { fail++; console.log("FAIL " + n + (d !== undefined ? " " + JSON.stringify(d) : "")); } };
const NOW = Date.now();
const mk = (i, make, model, year, title, body = "coupe") => ({ id: 700 + i, source: i % 3 ? "bringatrailer" : "carsandbids", source_listing_id: "o" + i, url: "https://auction.test/o/" + i, listing_title: title, make, model, year, vin_norm: null, mileage: 40000 + i * 100, current_bid: 30000 + i * 500, end_time: new Date(NOW + (i + 1) * 432e5).toISOString(), status: "active", body_style: body, transmission: "Manual", color: "Red", state: "IL", first_seen_at: new Date(NOW - 864e5).toISOString(), last_seen_at: new Date(NOW).toISOString(), location: "Chicago, IL", images: ["https://x/y.jpg"] });
const rows = [mk(1, "Porsche", "911", 1987, "1987 Porsche 911 Carrera Coupe"), mk(2, "Porsche", "911", 1995, "1995 Porsche 911 Carrera Cabriolet", "cabriolet"), mk(3, "Porsche", "911", 2003, "2003 Porsche 911 Carrera 4S"), mk(4, "Ford", "Mustang", 1966, "1966 Ford Mustang Fastback"), mk(5, "BMW", "3 Series", 1988, "1988 BMW 325i Convertible 5-Speed", "convertible")];
const { startFind } = await import(pathToFileURL(path.join(root, "scripts/_findStates.mjs")).href);
const { reasonLine } = await import(pathToFileURL(path.join(root, "lib/reasonWords.js")).href);
const search = await import(pathToFileURL(path.join(root, "lib/live/search.js")).href);
const f = await startFind(root, rows);
const NOTHING_LIVE = /\b(?:no [^.]{0,90} (?:are|is) live|nothing live|no live matches|no live (?:cars|ones))/i, READING = /being read/i, norm = s => String(s).replace(/\s+/g, " ").trim().toLowerCase();
// Sam'S WORDS (the brief, Nov 19 2026), and they must be the table's: a tree without the lines in reasonWords fails here, not by a crash
const KEEP = "Sam will email you when one goes live.", PAST = "Past sales for this car are still being read.";
const tbl = id => { try { return reasonLine(id); } catch { return null; } };
ok("reasonWords carries keep.none and cold.past_reading as Sam wrote them", tbl("keep.none") === KEEP && tbl("cold.past_reading") === PAST, [tbl("keep.none"), tbl("cold.past_reading")]);
// the lines of the result, in page order, with where each sits and its type size (scripts/_findStates.mjs)
const judge = (tag, o, { none = false, cold = false } = {}) => {
  const L = o.lines.filter(l => !/^(New search)$/.test(l.t) && !/ ×$/.test(l.t) && l.tag !== "button" && l.tag !== "label" && !/^See all|^Show them|^Any /.test(l.t));
  const said = L.filter(l => NOTHING_LIVE.test(l.t)), reading = L.filter(l => READING.test(l.t)), keep = L.filter(l => /keepl/.test(l.sec));
  ok(`${tag}: at most one sentence says nothing is live`, said.length <= 1, said.map(l => l.t));
  { const P = L.filter(l => !/grp/.test(l.sec));   // the page's own lines; each card is its own state and may carry the same engine line as its neighbour
    ok(`${tag}: no visible sentence is printed twice`, new Set(P.map(l => norm(l.t))).size === P.length, P.map(l => l.t).filter((t, i, a) => a.findIndex(x => norm(x) === norm(t)) !== i)); }
  ok(`${tag}: a "being read" line is never display type (over 16 px) and never a result paragraph outside a past sales section or a card`, reading.every(l => l.px <= 16 && (/nonel/.test(l.sec) || /grp/.test(l.sec))), reading.map(l => [l.t, l.px, l.sec]));
  ok(`${tag}: a "being read" line says it is about past sales`, reading.every(l => norm(l.t) === norm(PAST)), reading.map(l => l.t));
  if (none) {
    ok(`${tag}: a past sales section, when there is one, carries its reading line small and once`, L.filter(l => /nonel/.test(l.sec)).length <= 1 || !cold, L.filter(l => /nonel/.test(l.sec)).map(l => [l.t, l.px]));
    if (cold && L.some(l => /nonel/.test(l.sec))) ok(`${tag}: the past sales line is small`, L.filter(l => /nonel/.test(l.sec)).every(l => l.px <= 16), L.filter(l => /nonel/.test(l.sec)).map(l => [l.t, l.px]));
    const heads = keep.filter(l => l.tag === "h3");
    ok(`${tag}: the keep card's heading is the engine's one line`, heads.length === 1 && heads[0].t === KEEP, heads.map(l => l.t));
    ok(`${tag}: the keep card says nothing else in words (the eyebrow and the button only)`, keep.filter(l => l.tag === "p" && !/KEEP LOOKING/i.test(l.t)).length === 0, keep.map(l => l.t));
    ok(`${tag}: the keep card does not repeat the header's sentence`, keep.every(l => !NOTHING_LIVE.test(l.t)), keep.map(l => l.t));
  }
  ok(`${tag}: the reading line never stands above the header or the keep card as a display line`, !L.some((l, i) => READING.test(l.t) && l.px > 16), L.filter(l => READING.test(l.t)).map(l => l.px));
};
// 1 none live, the car's past sales still being read (the live fault)
const rr = await f.run("Land Rover Range Rover 1990 to 1999", { wait: 5000 }); judge("none live, Range Rover 1990 to 1999 (read pending)", rr, { none: true, cold: true });
ok("the live fault: the three lines are one header line, one small reading line and a keep card headed by the engine's line", rr.lines.filter(l => NOTHING_LIVE.test(l.t)).length === 1 && rr.lines.filter(l => READING.test(l.t)).length === 1);
// 2 to 5: the other none-live states
judge("none live, a year (2011 BMW M3)", await f.run("2011 BMW M3", { wait: 5000 }), { none: true, cold: true });
judge("none live, the nearest years (1999 Porsche 911)", await f.run("1999 Porsche 911", { wait: 5000 }), { none: true, cold: true });
judge("none live, a color with an offer (red Porsche 911)", await f.run("red Porsche 911", { wait: 5000 }), { none: true, cold: true });
judge("none live, near me with nothing in the distance", await f.run("Porsche 911 near me", { wait: 5000, extra: "&near=90001" }), { none: true });
// 6 the past sales read lands: the section fills in, the reading line goes, nothing stacks
{ let n = 0; const o = await f.run("Land Rover Range Rover 1990 to 1999", { wait: 9000, tweak: j => { if (j.meta && j.meta.noneLive) { n++; if (n > 1) { j.meta.noneLive = { lines: ["Range Rover sales: fixture line one", "Fixture count line"], count: 12 }; } else j.meta.noneLive.retryAfterMs = 1500; } } });
  ok("the read lands: the section fills in the engine's lines and the reading line is gone", n > 1 && !o.lines.some(l => READING.test(l.t)) && o.lines.some(l => /fixture line one/.test(l.t)), o.lines.map(l => l.t));
  judge("none live, the read landed", o, { none: true }); }
// 7 cars with a cold past sales read: the engine's own card line, once per card, small, no stack above the cards
{ const o = await f.run("Porsche 911", { wait: 5000, tweak: j => { for (const c of j.cards || []) c.market = search.stillReadingMarket(); } }); judge("results, every card's past sales still being read", o);
  const rl = o.lines.filter(l => READING.test(l.t)); ok("each card's reading line is the engine's, about past sales, once per card", rl.length === 3 && rl.every(l => norm(l.t) === norm(PAST)), rl.map(l => l.t)); }
// 8 cars, the read done; 9 one car; 10 a partial car
judge("results, the read done", await f.run("Porsche 911", { wait: 5000 }));
judge("results, one car", await f.run("1987 Porsche 911 Carrera", { wait: 5000 }));
judge("a make only (BMW)", await f.run("BMW", { wait: 4000 }));
// the engine serves the two lines for every answer with nothing live, and for none with a car
{ const n = await f.run("2011 BMW M3", { wait: 4000 }); ok("the keep card's heading is reasonWords keep.none", n.lines.some(l => l.t === KEEP)); }
await f.close();
console.log(`findOneVoiceCheck: ${pass} pass, ${fail} FAIL`); process.exit(fail ? 1 : 0);

// ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
// MUTANTS: each breaks one rule in a copy of the tree and the check must fail.
function mutants() {
  const copy = fs.mkdtempSync(path.join(process.env.TMPDIR || "/tmp", "fov-")); spawnSync("cp", ["-R", root, copy + "/t"], { stdio: "ignore" }); const T = copy + "/t"; try { fs.symlinkSync(path.join(root, "node_modules"), T + "/node_modules"); } catch {}
  const cases = [
    ["the reading line is a display line again", "api/buy.js", '.msg.sam .nonel p.pend{font:400 14px/1.4', '.msg.sam .nonel p.pend{font:400 24px/1.35'],
    ["the reading line says the old sentence", "lib/live/search.js", 'line: reasonLine("cold.past_reading"), retry: true, retryAfterMs: 2000', 'line: reasonLine("cold.reading"), retry: true, retryAfterMs: 2000'],
    ["the keep card says nothing live again", "api/buy.js", "(kl ? '<h3>' + esc(kl) + '</h3>' : '')", "'<h3>Nothing live right now.</h3>'"],
    ["the keep card repeats the email sentence", "api/buy.js", "esc(qp ? \\\"Have Sam keep looking for \\\" + qp + \\\" →\\\" : \\\"Have Sam keep looking\\\") + '</a></div></section>'", "esc(qp ? \\\"Have Sam keep looking for \\\" + qp + \\\" →\\\" : \\\"Have Sam keep looking\\\") + '</a><p>Sam will email you when a matching car goes live.</p></div></section>'"],
    ["the engine serves no keep line", "lib/live/samChat.js", "if (!matches.length) ctx.searchMeta.keepLine", "if (false) ctx.searchMeta.keepLine"],
    ["the reading line is not small for the section", "api/buy.js", '(nlv.pending ? \' class=\\"pend\\"\' : \\"\\")', '\\"\\"'],
    ["a reading line is left after the read lands", "api/buy.js", "sec.innerHTML = n2.lines.map(function(x){ return '<p>' + esc(x) + '</p>'; }).join('');", "sec.insertAdjacentHTML('beforeend', n2.lines.map(function(x){ return '<p>' + esc(x) + '</p>'; }).join(''));"]
  ];
  let missed = 0;
  for (const [name, file, from, to] of cases) {
    const p = path.join(T, file), src = fs.readFileSync(p, "utf8"); if (!src.includes(from)) { console.log("SKIP (target not in " + file + " exactly once): " + name); missed++; continue; }
    fs.writeFileSync(p, src.replace(from, () => to)); const r = spawnSync("node", [path.join(T, "scripts/findOneVoiceCheck.mjs"), T], { encoding: "utf8", timeout: 240000 }); fs.writeFileSync(p, src);
    const caught = r.status !== 0; console.log((caught ? "caught   " : "MISSED   ") + name); if (!caught) missed++;
  }
  fs.rmSync(copy, { recursive: true, force: true }); console.log(`findOneVoiceCheck mutants: ${missed} not caught`); return missed ? 1 : 0;
}
