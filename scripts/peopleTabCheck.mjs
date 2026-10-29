// PEOPLE TAB CHECK (Lane D, Oct 29 2026). The admin "People" tab: who did what, per person. Offline, on a fake store.
//   1. THE GATE, for the class: every part api/admin.js answers (read from its own source) gives the plain 404 with no token and with a bad token,
//      so a part added later without the gate fails here, not only People.
//   2. The list: signed-in people by email, anonymous visitors by id, first source, device, searches, Tasks, watches; filter by source; newest first.
//   3. The drill-in: searches in order with the exact typed words, the page and the result shape; Tasks and watches.
//   4. Read only, nothing new tracked, not on the public sitemap.
import fs from "fs";
import * as admin from "../api/admin.js";
import { peoplePanel, personDrill, groupPeople } from "../lib/admin/people.js";

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const resObj = () => ({ c: 0, b: null, h: {}, setHeader(k, v) { this.h[k] = v; }, status(c) { this.c = c; return this; }, send(b) { this.b = b; return this; }, json(b) { this.b = b; return this; }, end() { return this; } });
process.env.ADMIN_EMAILS = "sam@example.com";

// ---- 1. the gate, every part
const src = fs.readFileSync(new URL("../api/admin.js", import.meta.url), "utf8");
const parts = [...new Set([...src.matchAll(/b\.part === "([a-z_]+)"/g)].map(m => m[1]))].filter(p => p !== "refresh");
ok(parts.includes("people") && parts.includes("person") && parts.length >= 12, "the check reads the parts from api/admin.js, People among them: " + parts.join(","));
for (const part of parts) {
  for (const hdr of [{}, { authorization: "Bearer not-a-real-token" }, { authorization: "Bearer a.b.c" }]) {
    const r = resObj(); await admin.default({ method: "POST", query: {}, headers: { host: "goasksam.com", ...hdr }, body: { part, who: "signed_in", person: "x" } }, r);
    ok(r.c === 404, `/admin part ${part}: the plain 404 without an admin sign-in (${Object.keys(hdr).length ? "bad token" : "no token"})`);
  }
}

// ---- 2 and 3. on a fake store
const U1 = "11111111-1111-4111-8111-111111111111", U2 = "22222222-2222-4222-8222-222222222222", UA = "33333333-3333-4333-8333-333333333333";
const t = m => new Date(Date.UTC(2026, 9, 29, 14, m)).toISOString();
const E = (m, name, who, extra) => ({ ts: t(m), name, anon_id: null, user_id: null, device_class: "mobile", ref_domain: null, utm_source: null, text: null, control: null, outcome: null, ...who, ...extra });
const EVENTS = [
  E(0, "page_view", { anon_id: "ANON-A-aaaaaaaaaa", user_id: U1 }, { utm_source: "beehiiv" }),
  E(1, "search_run", { anon_id: "ANON-A-aaaaaaaaaa", user_id: U1 }, { text: "1987 porsche 911 carrera", product: "market_check", answer_type: "range" }),
  E(2, "search_run", { anon_id: "ANON-A-aaaaaaaaaa" }, { text: "ferrari 308 gts", product: "buy", answer_type: "zero_result" }),   // after sign-in: no account on the row
  E(3, "standing_arm", { anon_id: "ANON-A-aaaaaaaaaa", user_id: U1 }, { control: "watch_spec", outcome: "added" }),
  E(4, "standing_arm", { anon_id: "ANON-A-aaaaaaaaaa", user_id: U1 }, { control: "alert", outcome: "refused" }),
  E(5, "task_created", { anon_id: "ANON-A-aaaaaaaaaa", user_id: U1 }, {}),
  E(0, "page_view", { anon_id: "ANON-B-bbbbbbbbbb", user_id: U2 }, { ref_domain: "google.com", device_class: "desktop" }),
  E(1, "search_run", { anon_id: "ANON-B-bbbbbbbbbb", user_id: U2 }, { text: "bronco", product: "sell", answer_type: "identity_question" }),
  E(0, "page_view", { anon_id: "ANON-C-cccccccccc" }, { utm_source: "beehiiv" }),
  E(1, "search_run", { anon_id: "ANON-C-cccccccccc" }, { text: "miata", product: "buy", answer_type: "range" }),
  E(0, "page_view", { anon_id: "ANON-D-dddddddddd" }, { device_class: "desktop" }),
  E(0, "page_view", { anon_id: "ANON-E-eeeeeeeeee", user_id: UA }, {}),
];
const ACCOUNTS = [{ user_id: U1, email: "ann@example.com" }, { user_id: U2, email: "bo@example.com" }, { user_id: UA, email: "sam@example.com" }];
const calls = [];
globalThis.fetch = async (url, opt) => {
  const u = decodeURIComponent(String(url)); calls.push({ u, m: (opt && opt.method) || "GET" });
  const j = b => ({ ok: true, json: async () => b });
  if (u.includes("/accounts?")) return j(ACCOUNTS.filter(a => u.includes(a.user_id)));
  if (u.includes("analytics_events?user_id=eq.")) { const id = u.match(/user_id=eq\.([0-9a-f-]+)/)[1]; return j(EVENTS.filter(e => e.user_id === id).map(e => ({ ...e, product: e.product, car: null, answer_type: e.answer_type }))); }
  if (u.includes("analytics_events?anon_id=in.(")) { const ids = u.match(/anon_id=in\.\(([^)]*)\)/)[1].split(","); return j(EVENTS.filter(e => ids.includes(e.anon_id) && !e.user_id)); }
  if (u.includes("analytics_events?anon_id=eq.")) { const id = u.match(/anon_id=eq\.([^&]+)/)[1]; return j(EVENTS.filter(e => e.anon_id === id)); }
  if (u.includes("analytics_events?name=in.(")) return j(EVENTS);
  return j([]);
};
const env = { supabaseUrl: "https://x.test", supabaseKey: "k" };
const adminEmail = e => e === "sam@example.com";

{
  const d = await peoplePanel(env, { who: "signed_in", adminEmail });
  ok(d.rows.length === 2 && d.rows.every(r => r.signed_in), "signed in: two people, the admin account left out");
  const ann = d.rows.find(r => r.person === "ann@example.com"), bo = d.rows.find(r => r.person === "bo@example.com");
  ok(ann && ann.first_source === "utm beehiiv" && ann.device === "mobile", "Ann: first source utm beehiiv, device mobile");
  ok(ann.searches === 2, "Ann: the search after sign-in (no account on its row) is folded in, 2 searches");
  ok(ann.tasks === 1 && ann.watches === 1, "Ann: one Task, one watch (a refused arm is not a watch)");
  ok(ann.last_search === "ferrari 308 gts", "Ann: last search is the exact typed words");
  ok(bo.first_source === "google.com" && bo.device === "desktop", "Bo: referrer source and desktop");
  ok(d.rows[0].last_seen >= d.rows[1].last_seen, "newest first");
  const f = await peoplePanel(env, { who: "signed_in", source: "beehiiv", adminEmail });
  ok(f.rows.length === 1 && f.rows[0].person === "ann@example.com", "filter by source beehiiv: Ann only");
  const em = await peoplePanel(env, { who: "signed_in", text: "bo@", adminEmail });
  ok(em.rows.length === 1 && em.rows[0].person === "bo@example.com", "filter by email");
  const an = await peoplePanel(env, { who: "anonymous", adminEmail });
  ok(an.rows.length === 2 && an.rows.every(r => !r.signed_in && /^ANON-/.test(r.person)), "anonymous: two visitors, shown as visitor ids, none of the signed-in browsers");
  const anB = await peoplePanel(env, { who: "anonymous", source: "beehiiv", adminEmail });
  ok(anB.rows.length === 1 && anB.rows[0].person === "ANON-C-cccccccccc" && anB.rows[0].searches === 1, "anonymous, source beehiiv: the one visitor with one search");
}
{
  const d = await personDrill(env, U1);
  ok(d.who === "ann@example.com" && d.first_source === "utm beehiiv" && d.device === "mobile", "drill-in: email, first source, device");
  const s = d.rows.filter(r => r.what === "Search");
  ok(s.length === 2 && s[0].text === "1987 porsche 911 carrera" && s[0].page === "Market Check" && s[0].result === "range" && s[1].text === "ferrari 308 gts" && s[1].page === "Find" && s[1].result === "nothing", "drill-in: searches in order, exact words, page, result shape: " + JSON.stringify(s.map(x => [x.text, x.page, x.result])));
  ok(d.rows.some(r => r.what === "Watch" && r.result === "added") && d.rows.some(r => r.what === "Task started"), "drill-in: the watch and the Task");
  const a = await personDrill(env, "ANON-C-cccccccccc");
  ok(a.who === "ANON-C-cccccccccc" && a.rows.length === 1 && a.rows[0].page === "Find", "drill-in for a visitor id");
  ok((await personDrill(env, "'; drop table x")).rows.length === 0, "drill-in: a malformed id reads nothing");
}

// ---- 4. read only, nothing new tracked, not public
{
  ok(calls.length > 0 && calls.every(c => c.m === "GET"), "every read is a GET");
  const ps = fs.readFileSync(new URL("../lib/admin/people.js", import.meta.url), "utf8");
  ok(!/method:\s*"(POST|PATCH|PUT|DELETE)"/.test(ps) && !/track\(|trackSystem|logEvent/.test(ps), "people.js writes nothing and tracks nothing");
  const cat = fs.readFileSync(new URL("../lib/track/catalog.js", import.meta.url), "utf8");
  ok(!/people_|person_/.test(cat), "no new event in the catalog");
  const map = fs.readdirSync(new URL("../api", import.meta.url)).filter(f => /sitemap/i.test(f)).map(f => fs.readFileSync(new URL("../api/" + f, import.meta.url), "utf8")).join("\n") + fs.readFileSync(new URL("../vercel.json", import.meta.url), "utf8").split("\n").filter(l => /sitemap/i.test(l)).join("\n");
  ok(!/\/admin/.test(map), "/admin is not in any sitemap");
}

console.log(`peopleTabCheck: ${pass} pass, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
