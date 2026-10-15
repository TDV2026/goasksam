// SET-ASIDE SALES (Sam, Oct 15 2026): shown, labelled with the engine's own reason, never blended, never judged against
// the range, in the sold Task email, Buy's "This car has sold before" popup and an ended car's card. Pure: no network.
//   node scripts/setAsideCheck.mjs     exit 1 on any failure.
import fs from "node:fs";
import { setAsideWords, setAsideSentence, setAsideLabel, asideMatch } from "../lib/tasks/setAside.js";
import { messageFor } from "../lib/live/watches.js";
let passes = 0, fails = 0;
const ok = (c, m) => { if (c) passes++; else { fails++; console.log("FAIL " + m); } };

ok(setAsideSentence("modified") === "This one was set aside as modified, so it does not sit in the range.", "the sentence Sam wrote, for modified");
ok(setAsideWords("replica") === "a replica" && setAsideWords("odd sale") === "an odd sale" && setAsideWords("professional restoration") === "a professional restoration" && setAsideWords("project") === "a project car" && setAsideWords("variant") === "a different variant", "every engine reason reads in plain words");
ok(setAsideWords("Carrera four-cam") === "a Carrera four-cam" && setAsideSentence("modified", false) === "This one was set aside as modified." && setAsideWords("restomod") === "a restomod" && setAsideSentence("") === "This one was set aside, so it does not sit in the range." && setAsideLabel("modified") === "Set aside as modified", "a new reason word still reads; no reason, no invented one");
const rows = [{ url: "https://bringatrailer.com/listing/1987-porsche-911-12/", vinNorm: "WP0AB0912HS120001", date: "2026-03-02", price: 61000, reason: "modified" }];
ok(asideMatch(rows, { url: "http://www.bringatrailer.com/listing/1987-porsche-911-12" }) === rows[0], "the same listing URL is the same sale");
ok(asideMatch(rows, { vin: "WP0AB0912HS120001", date: "2026-03-04", price: 61000 }) === rows[0] && asideMatch(rows, { vin: "WP0AB0912HS120001", date: "2026-03-20", price: 61000 }) === null, "the same car at the same price within three days, never a later sale");
ok(asideMatch(null, { url: "x" }) === null && asideMatch([], { url: "x" }) === null, "no engine rows, nothing labelled");

// The sold Task email: a set-aside sale says why and has no inside/above/below line, even with a band beside it.
const w = { kind: "spec", label: "3.2 Carrera Targas", id: "00000000-0000-4000-8000-000000000001", spec: {} };
const one = messageFor(w, [{ kind: "sale", setAside: "modified", band: [50000, 70000], date: "2026-10-10", price: 61000, house: "Bring a Trailer", url: "https://bringatrailer.com/x", title: "1987 Porsche 911 Carrera Targa" }], { first: false, now: new Date("2026-10-15T12:00:00Z") });
ok(one.text.includes("This one was set aside as modified, so it does not sit in the range.") && !/(inside|above|below) the range|of recent sales/.test(one.text), "a set-aside sale in the email: the reason, never a placing");
const two = messageFor(w, [{ kind: "sale", band: [50000, 70000], date: "2026-10-11", price: 61000, house: "Bring a Trailer", url: "https://bringatrailer.com/a", title: "1987 Porsche 911 Carrera Targa" }, { kind: "sale", setAside: "replica", date: "2026-10-10", price: 90000, house: "Cars & Bids", url: "https://carsandbids.com/b", title: "1987 Porsche 911 Carrera Targa" }], { first: false, now: new Date("2026-10-15T12:00:00Z") });
ok(/That is inside the range of recent sales\./.test(two.text) && two.text.includes("This one was set aside as a replica, so it does not sit in the range."), "beside a set-aside sale, an in-range sale is still placed");
const thin = messageFor(w, [{ kind: "sale", setAside: "professional restoration", hasRange: false, date: "2026-10-10", price: 120000, house: "Bring a Trailer", url: "https://bringatrailer.com/c", title: "1987 Porsche 911 Carrera Targa" }], { first: false, now: new Date("2026-10-15T12:00:00Z") });
ok(thin.text.includes("This one was set aside as a professional restoration.") && !/sit in the range|of recent sales/.test(thin.text), "a thin answer (no range): the reason only, never the range");
ok(!/\b(worth|value|valuation|estimate|appraisal|median|percentile|alert|pricing)\b/i.test(one.text + two.text), "no banned word in either email");

// Every file that places a sale: a set-aside sale is checked first and never placed.
const src = f => fs.readFileSync(new URL("../" + f, import.meta.url), "utf8");
ok(/if \(e\.setAside != null\) return setAsideSentence\(e\.setAside, e\.hasRange !== false\);/.test(src("lib/live/watches.js")) && /setAsideRows \|\| \[\]\)\.filter\(isNew\)/.test(src("lib/live/watches.js")), "the email reads the engine's set-aside rows and words them");
ok(/if \(hit\) \{ out\.setAside = String\(hit\.reason \|\| ""\); out\.asideLine = setAsideSentence\(hit\.reason\); \}\s*else \{/.test(src("lib/live/buyAlerts.js")), "an ended car whose sale was set aside is never placed");
ok(/a\.set_aside_label = setAsideLabel\(hit\.reason\)/.test(src("api/buySearch.js")) && /a\.set_aside_label \? '<span class=\\"hp-aside\\">'/.test(src("api/buy.js")) && /if \(r && r\.asideLine\) return r\.asideLine;/.test(src("api/buy.js")), "the popup labels a set-aside sale; the ended card says why");

console.log(`setAsideCheck: ${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
