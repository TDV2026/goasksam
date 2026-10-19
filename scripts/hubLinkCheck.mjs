// A CAR PAGE LINKS ONLY TO HUBS THAT EXIST (Lane C, Oct 19 2026, from Lane E's scan: 25 hubs linked from car pages
// answered 404, most of them Mercedes "-Class" families whose titles say "SL500", never "SL-Class"). titleInHub reads a
// record into a hub exactly as hubVins does (its words in order, any case; the hub's year; no parts or memorabilia lot);
// hubHasRows asks the archive for a few rows the same way; the car page tries the family's hub, then the archive's own
// family name, and links neither when both are empty (an unreadable archive keeps the link). No network (fetch stubbed).
//   node scripts/hubLinkCheck.mjs     exit 1 on any failure.
import fs from "node:fs";
import { parseHubSlug, hubTokens, titleInHub, hubHasRows } from "../api/_historyData.js";
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const H = s => parseHubSlug(s);
ok(hubTokens(H("mercedes-benz-sl-class")).join() === "mercedes,sl,class" && hubTokens(H("mercedes-benz-amg-gt")).join() === "amg,gt" && hubTokens(H("1987-porsche-911")).join() === "porsche,911", "the hub's words are hubVins's own");
ok(!titleInHub(H("mercedes-benz-sl-class"), "2003 Mercedes-Benz SL500 Roadster", 2003), "an SL500 title is not in the SL-Class hub (the 404 cause)");
ok(titleInHub(H("2003-mercedes-benz-sl500"), "2003 Mercedes-Benz SL500 Roadster", 2003) && titleInHub(H("mercedes-benz-sl500"), "2003 mercedes-benz sl500", 2003), "it is in the SL500 hub, any case, with or without the year");
ok(!titleInHub(H("2003-mercedes-benz-sl500"), "2003 Mercedes-Benz SL500 Roadster", 2004), "a year hub needs the record's year");
ok(titleInHub(H("porsche-911"), "1987 Porsche 911 Carrera (a.b) [x]", 1987) && !titleInHub(H("porsche-911"), "1987 Porsche 928", 1987), "words in order; symbols in a title are literal");
ok(!titleInHub(H("porsche-911"), "Porsche 911 factory brochure", null) && !titleInHub(H("porsche-911"), "", 1987), "a memorabilia lot or an empty title is in no hub");
// hubHasRows, on stubbed archive answers.
let answer = { sales: [], atts: [] }, asked = [];
globalThis.fetch = async u => { u = String(u); asked.push(u); const t = /sales_archive/.test(u) ? answer.sales : answer.atts; return t == null ? { ok: false, status: 500, text: async () => "" } : { ok: true, status: 200, text: async () => JSON.stringify(t) }; };
const env = { supabaseUrl: "https://db.test", supabaseKey: "k" };
ok(await hubHasRows(env, H("mercedes-benz-sl-class")) === false, "no rows: the hub is empty");
ok(/sales_archive\?listing_title=ilike\.\*mercedes\*sl\*class\*&vin_norm=not\.is\.null/.test(asked.join(" ")) && /auction_attempts\?raw_record->>title=ilike\./.test(asked.join(" ")) && asked.every(u => /limit=20/.test(u)), "it reads both tables with hubVins's pattern, a few rows");
asked = []; await hubHasRows(env, H("2003-mercedes-benz-sl500")); ok(asked.every(u => /\?year=eq\.2003&/.test(u)), "a year hub reads that year only");
answer = { sales: [{ vin_norm: "WDBSK75F23F012345", listing_title: "2003 Mercedes-Benz SL500", mileage: 40000 }], atts: [] };
ok(await hubHasRows(env, H("2003-mercedes-benz-sl500")) === true, "a car on it: the hub exists");
answer = { sales: [{ vin_norm: "ABC", listing_title: "2003 Mercedes-Benz SL500", mileage: 1 }], atts: [{ chassis_vin_norm: "WDB1234567", title: "Mercedes-Benz SL500 sales brochure", mileage: null }] };
ok(await hubHasRows(env, H("2003-mercedes-benz-sl500")) === false, "a short VIN or a brochure lot alone: empty, as hubVins reads it");
answer = { sales: null, atts: null };
ok(await hubHasRows(env, H("2003-mercedes-benz-sl500")) === null, "unreadable: null (the link stays)");
// The car page.
const h = fs.readFileSync(new URL("../api/history.js", import.meta.url), "utf8");
ok(/if \(appearances\.some\(a => titleInHub\(hub, a\.title, a\.year\)\)\) return s;\n\s*const has = await hubHasRows\(env, hub\);\n\s*return has === false \? null : s;/.test(h), "the car's own records answer first; the archive only when none is in the hub; unreadable keeps the link");
ok(/const fams = \[id\.family, id\.familyKey\]/.test(h) && /for \(const f of fams\) \{ const s = await hubLink\(year, f\); if \(s\) return/.test(h), "the family's hub first, then the archive's family name");
ok(/\$\{modelHubL \? `<a href="\$\{esc\(modelHubL\.href\)\}">All \$\{esc\(id\.make \+ " " \+ modelHubL\.family\)\} auction results<\/a>` : ""\}/.test(h) && /\$\{yearHubL \? `<a href="\$\{esc\(yearHubL\.href\)\}">Every \$\{esc\(id\.year \+ " " \+ id\.make \+ " " \+ yearHubL\.family\)\} by VIN<\/a>` : ""\}/.test(h), "each link only when its hub exists, named by the family it links");
ok(!/const modelHub = /.test(h) && !/const hubHref = /.test(h), "no unconditional hub link is left");
console.log(`hubLinkCheck: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
