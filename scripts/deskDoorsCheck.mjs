// DESK DOORS CHECK (Lane S, Nov 5 2026). The class: ONE person can hold more than one door (the signed crew cookie AND an active seat, as Sam does: zysblat@hotmail.com is crew and Hagerty
// Expert 1), and every endpoint must pick the right door and never show a caller another org's data. Runs the REAL api/desk.js, api/deskSeat.js and lib/desk/* in-process against a fake PostgREST
// (fetch stubbed), no network. It proves:
//   1. crew only                       -> the operator view: org "sam", NO Hagerty or other org data, unless the explicit switch is used.
//   2. crew + the explicit switch      -> exactly that ONE seat's org queue (Hagerty, Expert 1), Valuations actions only, no operator powers; the switch is logged; the footer fields are sent.
//   3. a seat of org A (cookie)        -> only org A; it cannot open org B's sheet; it cannot use the switch; a forged switch cookie without the crew cookie is the disguised 404.
//   4. the switch names a deactivated or crew seat, or a seat that does not exist -> ignored (the plain crew view), never another org.
//   5. a crew + seat person signing in -> /api/deskSeat still mints the seat cookie (it used to answer 404: crew-first hid the seat).
//   6. deskSend and deskIntake (callerSeat) -> follow the switch: the crew acts as the crew seat of "sam", and as Expert 1 of hagerty while viewing as.
// Each rule runs against MUTANTS (the code with one protection removed); every mutant must fail.
//   node scripts/deskDoorsCheck.mjs
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ROOT } from "./_deskDb.mjs";

process.env.SUPABASE_URL = "https://fake.supabase.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "svc"; process.env.CURTAIN_CREW_CODE = "doors-check-secret"; process.env.SUPABASE_ANON_KEY = "anon";
const TOK = who => "eyJhbGciOiJub25lIn0.e30." + who;   // a three-part token of an unknown alg: the local check defers to GoTrue, which the fake answers
const U_HAG = "11111111-aaaa-4aaa-8aaa-111111111111", U_ACME = "22222222-bbbb-4bbb-8bbb-222222222222";
const SEATS = [
  { id: 1, org_id: "sam", subject: "crew", email: null, display_name: null, role: "owner", active: true },
  { id: 2, org_id: "hagerty", subject: U_HAG, email: "zysblat@hotmail.com", display_name: "Expert 1", role: "admin", active: true },
  { id: 3, org_id: "hagerty", subject: "pending:sam@thedailyvroom.com", email: "sam@thedailyvroom.com", display_name: "Expert 2", role: "member", active: true },
  { id: 4, org_id: "acme", subject: U_ACME, email: "a@acme.test", display_name: "Acme One", role: "member", active: true },
  { id: 5, org_id: "hagerty", subject: "33333333-cccc-4ccc-8ccc-333333333333", email: "gone@x.test", display_name: "Gone", role: "member", active: false }
];
const sheetOf = (id, org, seat, label) => ({ id, owner_seat: String(seat), forwarded_by: String(seat), vin: null, car_label: label, status: "New", created_at: new Date().toISOString(), opened_at: null, submission: { photos: [], documents: [] }, state: {}, read: null, events: [] });
const SHEETS = { hagerty: [sheetOf("06a7e400-b810-4f78-a414-db159e4c5382", "hagerty", 2, "Hagerty car")], sam: [sheetOf("s_sam1", "sam", "crew", "Sam car")], acme: [sheetOf("s_acme1", "acme", 4, "Acme car")] };
const ORGS = { hagerty: "Hagerty Marketplace", sam: "Sam", acme: "Acme" };

function installFetch(events) {
  globalThis.fetch = async (url, init = {}) => {
    const u = new URL(String(url)), p = u.pathname.replace("/rest/v1/", ""), q = u.searchParams, method = (init.method || "GET").toUpperCase();
    const json = (b, status = 200) => new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });
    if (u.pathname === "/auth/v1/user") { const t = String((init.headers && (init.headers.Authorization || init.headers.authorization)) || "").replace(/^Bearer\s+/i, ""); return t === TOK("hag") ? json({ id: U_HAG, email: "zysblat@hotmail.com" }) : t === TOK("acme") ? json({ id: U_ACME, email: "a@acme.test" }) : json({}, 401); }
    if (p === "app_usage_events") { if (method === "POST") events.push(JSON.parse(init.body)); return json([], 201); }
    if (p.startsWith("desk_seats")) {
      let rows = SEATS.slice(); const eq = k => { const v = q.get(k); return v && v.startsWith("eq.") ? v.slice(3) : null; };
      if (eq("id") != null) rows = rows.filter(r => String(r.id) === eq("id")); if (eq("subject") != null) rows = rows.filter(r => r.subject === eq("subject")); if (eq("org_id") != null) rows = rows.filter(r => r.org_id === eq("org_id")); if (eq("active") === "true") rows = rows.filter(r => r.active);
      return json(rows);
    }
    if (p.startsWith("desk_sheets")) { const org = (q.get("org_id") || "").replace("eq.", ""), id = (q.get("id") || "").replace("eq.", ""); return json((SHEETS[org] || []).filter(s => !id || s.id === id).map(s => ({ sheet: s }))); }
    if (p.startsWith("desk_orgs")) { const id = (q.get("id") || "").replace("eq.", ""); return json(ORGS[id] ? [{ name: ORGS[id], settings: {} }] : []); }
    return json([]);
  };
}
const { mintCrewCookieValue } = await import("../lib/_crew.js");
const { mintSeatCookieValue } = await import("../lib/desk/seatCookie.js");
const { mintViewAsValue } = await import("../lib/desk/viewAs.js");
const crewCookie = "gas_crew=" + mintCrewCookieValue();
const reqOf = (cookie, body = {}, headers = {}) => ({ method: "POST", headers: { cookie: cookie || "", ...headers }, body, query: {} });
function resOf() { const r = { code: 0, body: null, headers: {}, status(c) { r.code = c; return r; }, json(b) { r.body = b; return r; }, send(b) { r.body = b; return r; }, end() { return r; }, setHeader(k, v) { r.headers[k.toLowerCase()] = v; }, getHeader(k) { return r.headers[k.toLowerCase()]; }, removeHeader(k) { delete r.headers[k.toLowerCase()]; } }; return r; }

let useq = 0;
// Load api/desk.js, api/deskSeat.js and the lib files they use from copies with a source transform applied (mutants); the copies sit beside the originals so relative imports resolve.
async function load(mut = {}) {
  const mine = [], put = (dir, name, src) => { const f = path.join(ROOT, dir, name); fs.writeFileSync(f, src); mine.push(f); return pathToFileURL(f).href; };
  const rd = f => fs.readFileSync(path.join(ROOT, f), "utf8");
  try {
    const n = ++useq, tag = `__doors${n}_`;
    const viewAsU = put("lib/desk", `${tag}viewAs.js`, mut.viewAs ? mut.viewAs(rd("lib/desk/viewAs.js")) : rd("lib/desk/viewAs.js"));
    const swap = (src, from, to) => src.split(from).join(to);
    const doorSrc = swap(mut.door ? mut.door(rd("lib/desk/door.js")) : rd("lib/desk/door.js"), '"./viewAs.js"', `"./${tag}viewAs.js"`);
    const doorU = put("lib/desk", `${tag}door.js`, doorSrc);
    const seatsSrc = swap(mut.seats ? mut.seats(rd("lib/desk/seats.js")) : rd("lib/desk/seats.js"), '"./viewAs.js"', `"./${tag}viewAs.js"`);
    const seatsU = put("lib/desk", `${tag}seats.js`, seatsSrc);
    let desk = swap(swap(rd("api/desk.js"), '"../lib/desk/door.js"', `"../lib/desk/${tag}door.js"`), '"../lib/desk/viewAs.js"', `"../lib/desk/${tag}viewAs.js"`); if (mut.api) desk = mut.api(desk);
    const deskU = put("api", `${tag}desk.js`, desk);
    let seat = swap(swap(rd("api/deskSeat.js"), '"../lib/desk/seats.js"', `"../lib/desk/${tag}seats.js"`), '"../lib/desk/seatCookie.js"', '"../lib/desk/seatCookie.js"'); if (mut.deskSeat) seat = mut.deskSeat(seat);
    const seatU = put("api", `${tag}deskSeat.js`, seat);
    const callerSrc = swap(rd("lib/desk/intake/caller.js"), '"../seats.js"', `"../${tag}seats.js"`);
    const callerU = put("lib/desk/intake", `${tag}caller.js`, callerSrc);
    return { viewAs: await import(viewAsU), desk: (await import(deskU)).default, deskSeat: (await import(seatU)).default, callerSeat: (await import(callerU)).callerSeat };
  } finally { for (const f of mine) fs.rmSync(f, { force: true }); }
}

export async function findings(mut = {}) {
  const fails = [], events = []; installFetch(events);
  const m = await load(mut), call = async (cookie, body, headers) => { const rs = resOf(); await m.desk(reqOf(cookie, body, headers), rs); return rs; };
  const ids = rs => (rs.body && rs.body.rows || []).map(r => r.id).sort().join(",");
  const HAG = "06a7e400-b810-4f78-a414-db159e4c5382", viewAs2 = "; gas_viewas=" + mintViewAsValue(2), seat4 = "gas_seat=" + mintSeatCookieValue(4), seat2 = "gas_seat=" + mintSeatCookieValue(2);
  // 1. crew only: the operator view, no org data
  { const r = await call(crewCookie, { action: "sheet_queue", view: "queue" }); if (ids(r) !== "s_sam1" || r.body.org !== "Sam" || r.body.viewAs) fails.push(`crew only: expected Sam's queue only, got "${ids(r)}" for org ${r.body && r.body.org}`); }
  // 2. crew + the explicit switch: that seat's org queue only; seat fields for the footer; Valuations only; logged
  { const r = await call(crewCookie + viewAs2, { action: "sheet_queue", view: "queue" });
    if (ids(r) !== HAG) fails.push(`crew viewing as Expert 1: expected the Hagerty queue "${HAG}", got "${ids(r)}"`);
    else if (r.body.org !== "Hagerty Marketplace" || r.body.seatName !== "Expert 1" || !r.body.viewAs || r.body.viewAs.org !== "hagerty") fails.push(`crew viewing as: footer fields wrong (${JSON.stringify({ org: r.body.org, seatName: r.body.seatName, viewAs: r.body.viewAs })})`);
    const op = await call(crewCookie + viewAs2, { action: "run", question: "x" }); if (op.code !== 403) fails.push(`crew viewing as a seat ran a non-sheet action (status ${op.code})`);
    const own = await call(crewCookie + viewAs2, { action: "sheet_open", id: "s_sam1" }); if (own.body && own.body.ok) fails.push("crew viewing as Hagerty opened a Sam sheet");
    const open = await call(crewCookie + viewAs2, { action: "sheet_open", id: HAG }); if (!(open.body && open.body.ok)) fails.push("crew viewing as Expert 1 could not open the Hagerty sheet");
    if (!events.some(e => e.event_type === "desk_view_as" && e.metadata && e.metadata.what === "action")) fails.push("an action taken while viewing as was not logged"); }
  // the switch endpoints: crew only, logged, sets the cookie
  { events.length = 0; const l = await call(crewCookie, { action: "viewas_list" }); if (!(l.body && l.body.ok && l.body.seats.map(s => s.seatId).join() === "2,3,4")) fails.push(`viewas_list should offer the active seats except the crew seat (2,3,4), got ${JSON.stringify(l.body && l.body.seats && l.body.seats.map(s => s.seatId))}`);
    const s = await call(crewCookie, { action: "viewas_set", seatId: 2 }); if (!/gas_viewas=v1\./.test(String(s.headers["set-cookie"] || "")) || !events.some(e => e.metadata && /^on:hagerty:2/.test(e.metadata.what))) fails.push("viewas_set did not set the cookie and log the switch");
    for (const bad of [5, 1, 99]) { const x = await call(crewCookie, { action: "viewas_set", seatId: bad }); if (!x.body || x.body.ok !== false || x.headers["set-cookie"]) fails.push(`viewas_set accepted seat ${bad} (deactivated, crew or missing)`); }
    const c = await call(crewCookie + viewAs2, { action: "viewas_clear" }); if (!/gas_viewas=;/.test(String(c.headers["set-cookie"] || "")) || !events.some(e => e.metadata && e.metadata.what === "off")) fails.push("viewas_clear did not clear and log"); }
  // 3. a seat of org A sees only org A; cannot use the switch; a forged switch with no crew cookie is the disguised 404
  { const r = await call(seat4, { action: "sheet_queue", view: "queue" }); if (ids(r) !== "s_acme1") fails.push(`an Acme seat saw "${ids(r)}" (expected only Acme's sheet)`);
    const x = await call(seat4, { action: "sheet_open", id: HAG }); if (x.body && x.body.ok) fails.push("an Acme seat opened a Hagerty sheet");
    const v = await call(seat4, { action: "viewas_set", seatId: 2 }); if (v.headers["set-cookie"] && /gas_viewas/.test(String(v.headers["set-cookie"]))) fails.push("a seat was able to use the View as switch");
    const f = await call(seat4 + viewAs2, { action: "sheet_queue", view: "queue" }); if (ids(f) !== "s_acme1") fails.push(`a seat carrying a forged switch cookie saw "${ids(f)}"`);
    const n = await call("gas_viewas=" + mintViewAsValue(2), { action: "sheet_queue", view: "queue" }); if (n.code !== 404) fails.push(`a switch cookie with no crew cookie and no seat was not the disguised 404 (status ${n.code})`);
    const own = await call(seat2, { action: "sheet_queue", view: "queue" }); if (ids(own) !== HAG || own.body.viewAs) fails.push(`the Hagerty seat's own cookie did not show its own queue (${ids(own)})`); }
  // 3b. defence in depth: the switch module itself refuses a request without the crew cookie, whoever calls it
  { const env = { supabaseUrl: process.env.SUPABASE_URL, supabaseKey: "svc" }; const v = await m.viewAs.resolveViewAs({ headers: { cookie: seat4 + viewAs2 } }, { env }); if (v) fails.push("resolveViewAs honoured a switch cookie on a request with no crew cookie"); }
  // 4. the switch naming a deactivated, crew or missing seat is the plain crew view; an invited (pending) seat can be viewed
  { const r = await call(crewCookie + "; gas_viewas=" + mintViewAsValue(3), { action: "sheet_queue", view: "queue" }); if (!r.body || !r.body.viewAs || r.body.viewAs.org !== "hagerty") fails.push("viewing as an invited (pending) Hagerty seat did not open the Hagerty view"); }
  for (const bad of [5, 1, 99]) { const r = await call(crewCookie + "; gas_viewas=" + mintViewAsValue(bad), { action: "sheet_queue", view: "queue" }); if (ids(r) !== "s_sam1" || r.body.viewAs) fails.push(`a switch naming seat ${bad} was honoured (queue "${ids(r)}")`); }
  // 5. a crew + seat person signing in still gets the seat cookie; a stranger does not
  { const rs = resOf(); await m.deskSeat({ method: "POST", headers: { cookie: crewCookie, authorization: "Bearer " + TOK("hag") }, body: {}, query: {} }, rs); if (rs.code !== 200 || !/gas_seat=s1\./.test(String(rs.headers["set-cookie"] || ""))) fails.push(`a crew + seat person got no seat cookie at sign in (status ${rs.code})`);
    const r2 = resOf(); await m.deskSeat({ method: "POST", headers: { cookie: "", authorization: "Bearer " + TOK("nobody") }, body: {}, query: {} }, r2); if (r2.code !== 404) fails.push("a stranger signing in was not the disguised 404"); }
  // 6. deskSend and deskIntake resolve the caller through callerSeat: crew = the crew seat of sam; crew viewing as = Expert 1 of hagerty
  { const store = { orgById: async id => ({ id }), seatsOf: async org => SEATS.filter(s => s.org_id === org) }, env = { supabaseUrl: process.env.SUPABASE_URL, supabaseKey: "svc" };
    const a = await m.callerSeat({ headers: { cookie: crewCookie } }, env, store); if (!a || a.org.id !== "sam" || a.seat.id !== 1) fails.push(`callerSeat for the crew: expected sam / crew seat 1, got ${a && a.org.id}/${a && a.seat.id}`);
    const b = await m.callerSeat({ headers: { cookie: crewCookie + viewAs2 } }, env, store); if (!b || b.org.id !== "hagerty" || b.seat.id !== 2) fails.push(`callerSeat for the crew viewing as Expert 1: expected hagerty / seat 2, got ${b && b.org.id}/${b && b.seat.id}`); }
  return fails;
}

const rep = (s, from, to) => { if (!s.includes(from)) throw new Error("mutant did not apply: " + from.slice(0, 70)); return s.replace(from, () => to); };
export const MUTANTS = [
  ["the door ignores the View as switch (the crew door always wins)", { door: s => rep(s, "if (crew && env) { seat = await viewAs(req, { env, isCrew }).catch(() => null); viewing = !!seat; }", "") }],
  ["the switch works without the crew cookie", { viewAs: s => rep(s, "if (!env || !isCrew(req)) return null;", "if (!env) return null;") }],
  ["the switch ignores whether the seat is active", { viewAs: s => rep(s, "&id=eq.${p.seatId}&active=eq.true&limit=2`).catch(() => null);\n  if (!Array.isArray(rows) || rows.length !== 1 || !realSeat(rows[0])) return null;\n  return shape", "&id=eq.${p.seatId}&limit=2`).catch(() => null);\n  if (!Array.isArray(rows) || rows.length !== 1 || !realSeat(rows[0])) return null;\n  return shape") }],
  ["the switch accepts the crew seat", { viewAs: s => rep(s, 'const realSeat = s => !!s && !!s.subject && s.subject !== "crew";', "const realSeat = s => !!s;") }],
  ["while viewing, the context keeps the crew's org", { door: s => rep(s, "org: seat ? seat.org : (crew ? \"sam\" : (tester ? \"tester\" : \"public\"))", "org: crew ? \"sam\" : (seat ? seat.org : (tester ? \"tester\" : \"public\"))") }],
  ["while viewing, the context keeps the operator's powers", { door: s => rep(s, "crew: crew && !viewing, tester: tester && !viewing,", "crew, tester,"), api: s => rep(s, "  if (seat) {\n    const lim", "  if (seat && !viewing) {\n    const lim") }],
  ["any caller can use the switch endpoints", { api: s => rep(s, "if (door.realCrew && typeof body0.action", "if (typeof body0.action") }],
  ["the seat cookie is minted crew-first (crew + seat gets a 404)", { deskSeat: s => rep(s, "resolveCaller(req, { env, isCrew: () => false })", "resolveCaller(req, { env })") }],
  ["resolveCaller ignores the switch (deskSend and deskIntake stay on the crew seat)", { seats: s => rep(s, "const v = await viewAs(req, { env, isCrew, ...(select ? { select } : {}) }).catch(() => null);", "const v = null;") }]
];

export async function main() {
  let pass = 0, fail = 0;
  const f = await findings(); if (f.length) { fail += f.length; f.forEach(x => console.log("FAIL " + x)); } else pass++;
  for (const [name, mut] of MUTANTS) {
    let g; try { g = await findings(mut); } catch (e) { fail++; console.log(`FAIL mutant "${name}": ${String(e.message).split("\n")[0]}`); continue; }
    if (g.length) { pass++; if (process.env.VERBOSE) console.log(`  caught "${name}": ${g[0].slice(0, 120)}`); } else { fail++; console.log(`FAIL mutant "${name}" was NOT caught`); }
  }
  console.log(`deskDoorsCheck: ${pass} pass, ${fail} FAIL (${MUTANTS.length} mutants, each must be caught)`);
  return fail ? 1 : 0;
}
if (import.meta.url === `file://${process.argv[1]}`) process.exit(await main());
