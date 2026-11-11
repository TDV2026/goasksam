// clock: real-ok seat cookie expiry is built from the real now in the same process, so the hour of the day changes nothing
// SEAT ACCESS (Lane C, Nov 4 2026; job: lane-c-desk-seats). A Hagerty seat reaches the Desk through a signed gas_seat cookie that /api/deskSeat sets after resolveCaller confirms an active seat.
//   node scripts/seatAccessCheck.mjs      offline: the real handlers (api/deskSeat.js, api/desk.js, api/crewPage.js) run against a stand-in for Supabase's REST and auth endpoints.
// COVERS: active seat in; removed seat out on the very next call; a seat cannot run crew (analyst) actions; no cookie, a forged, an expired, a crew-cookie-as-seat and a seat-cookie-as-crew all get the platform's own 404;
// a pending (never signed in) seat gets no cookie; the crew path is unchanged; the Desk page opens for a seat in Valuations mode and for nobody else. hiddenCrewCheck covers the byte-for-byte 404.
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), ".."); process.chdir(ROOT);
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
process.env.CURTAIN_CREW_CODE = "fixture-crew-code"; process.env.LAUNCH_STAGE = "2";
process.env.SUPABASE_URL = "https://stub.supabase.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "svc"; process.env.SUPABASE_ANON_KEY = "anon"; delete process.env.SUPABASE_JWT_SECRET; delete process.env.CURTAIN_SEALED;
const imp = f => import(pathToFileURL(path.join(ROOT, f)).href);
// ---- the stand-in database: desk_seats rows, and a token -> account map
const SEATS = [
  { id: 11, org_id: "hagerty", role: "member", subject: "user-A", active: true },
  { id: 12, org_id: "hagerty", role: "member", subject: "pending:new@hagerty.test", active: true },
  { id: 1, org_id: "sam", role: "owner", subject: "crew", active: true }
];
const jwt = n => Buffer.from(JSON.stringify({ alg: "none" })).toString("base64url") + "." + Buffer.from(JSON.stringify({ sub: n })).toString("base64url") + ".x";   // an unknown alg: verified by the (stubbed) auth endpoint
const tA = jwt("user-A"), tB = jwt("user-B"), tNew = jwt("user-N");
const TOKENS = { [tA]: { id: "user-A", email: "a@hagerty.test" }, [tB]: { id: "user-B", email: "b@nobody.test" }, [tNew]: { id: "user-N", email: "new@hagerty.test" } };
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, opts = {}) => {
  const u = new URL(String(url)), json = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "content-type": "application/json" } });
  if (u.pathname === "/auth/v1/user") { const t = TOKENS[String((opts.headers || {}).Authorization || "").replace(/^Bearer\s+/, "")]; return t ? json(t) : json({}, 401); }
  if (u.pathname === "/rest/v1/desk_seats" && (opts.method || "GET") === "GET") {
    const q = u.searchParams, eq = k => { const v = q.get(k); return v && v.startsWith("eq.") ? decodeURIComponent(v.slice(3)) : null; };
    let rows = SEATS.slice();
    if (eq("id")) rows = rows.filter(r => String(r.id) === eq("id"));
    if (eq("subject")) rows = rows.filter(r => r.subject === eq("subject"));
    if (eq("active")) rows = rows.filter(r => String(r.active) === eq("active"));
    return json(rows.map(r => ({ id: r.id, org_id: r.org_id, role: r.role, subject: r.subject })));
  }
  if ((opts.method || "GET") === "PATCH") return json([]);
  return json([]);   // every other table (sheets, settings, the ceilings ledger) is empty
};
const call = async (file, { method = "POST", url = "/", cookie, headers = {}, body = {}, accept = "text/html" } = {}) => {
  const m = await imp(file), res = { h: {}, code: 200, body: undefined, setHeader(k, v) { this.h[k.toLowerCase()] = v; return this; }, getHeader(k) { return this.h[k.toLowerCase()]; }, removeHeader(k) { delete this.h[k.toLowerCase()]; },
    status(c) { this.code = c; return this; }, json(b) { this.body = b; this.h["content-type"] = "application/json"; return this; }, send(b) { this.body = b; return this; }, end() { return this; } };
  const u = new URL("https://goasksam.com" + url);
  const req = { url, method, query: Object.fromEntries(u.searchParams), body, headers: { host: "goasksam.com", "user-agent": "Mozilla/5.0", accept, "x-vercel-id": "sfo1::t-1-abcdef", ...(cookie ? { cookie } : {}), ...headers } };
  await m.default(req, res); return res;
};
const is404 = r => r.code === 404 && r.h["x-vercel-error"] === "NOT_FOUND" && !r.h["set-cookie"];
const { mintCrewCookieValue } = await imp("lib/_crew.js"), { mintSeatCookieValue, parseSeatCookieValue, SEAT_MAX_AGE_S } = await imp("lib/desk/seatCookie.js");
const crew = "gas_crew=" + mintCrewCookieValue();

// 1. THE DOOR: /api/deskSeat
let r = await call("api/deskSeat.js", { headers: {} }); ok(is404(r), "deskSeat with no bearer is the platform 404");
r = await call("api/deskSeat.js", { headers: { authorization: "Bearer " + tB } }); ok(is404(r), "deskSeat for an account with no seat is the platform 404");
r = await call("api/deskSeat.js", { headers: { authorization: "Bearer " + tNew } }); ok(r.code === 200, "deskSeat for a pending seat whose email signs in binds it, as resolveCaller does, and gives the cookie (" + r.code + ")"); SEATS.find(s => s.id === 12).subject = "pending:new@hagerty.test";
r = await call("api/deskSeat.js", { method: "GET", headers: { authorization: "Bearer " + tA } }); ok(is404(r), "deskSeat answers a GET with the platform 404");
r = await call("api/deskSeat.js", { cookie: crew }); ok(is404(r), "deskSeat for the crew (no seat) is the platform 404");
r = await call("api/deskSeat.js", { headers: { authorization: "Bearer " + tA } });
ok(r.code === 200 && r.body && r.body.ok === true, "an active seat's account gets 200");
const sc = String(r.h["set-cookie"] || ""), m = /gas_seat=(s1\.[^;]+)/.exec(sc);
ok(!!m && /HttpOnly/i.test(sc) && /Secure/i.test(sc) && /SameSite=Lax/i.test(sc) && new RegExp("Max-Age=" + SEAT_MAX_AGE_S).test(sc), "the cookie is signed s1.*, HttpOnly, Secure, SameSite=Lax, 30 days");
const seat = m ? "gas_seat=" + m[1] : "gas_seat=missing";
ok(parseSeatCookieValue(m && m[1]) && parseSeatCookieValue(m[1]).seatId === 11, "the cookie names seat 11");

// 2. A SEAT IN: Valuations (sheet_) actions work
r = await call("api/desk.js", { cookie: seat, body: { action: "sheet_queue", view: "queue" } });
ok(r.code === 200 && r.body && r.body.ok !== false, "an active seat runs sheet_queue (" + r.code + ")");
ok(r.body && r.body.seat === "11" && r.body.org !== undefined, "the sheet context is the seat's own: seat 11");

// 3. A SEAT CANNOT RUN CREW ACTIONS
for (const act of ["run", "interpret", "save_view", "list_views", "rerun_view", "delete_view", "map", "evidence"]) { r = await call("api/desk.js", { cookie: seat, body: { desk: true, action: act } }); ok(r.code === 403 && r.body && r.body.ok === false, `a seat cannot run the crew action "${act}" (${r.code})`); }
r = await call("api/desk.js", { cookie: seat, body: { archiveDiag: "dupScan" } }); ok(r.code === 403, "a seat cannot start the archive scan (" + r.code + ")");
r = await call("api/desk.js", { cookie: seat, body: {} }); ok(r.code === 403, "a seat with no action gets 403");
r = await call("api/desk.js", { cookie: seat, body: { action: "sheet_queue", archiveDiag: "dupScan" } }); ok(r.code === 403, "a sheet_ action carrying the archive scan flag is refused");

// 4. THE PAGE: Valuations for a seat, nothing for anyone else
r = await call("api/crewPage.js", { method: "GET", url: "/api/crewPage?page=desk", cookie: seat });
ok(is404(r), "the old Desk page is retired (Nov 11 2026): a seat's /desk is the platform 404, the seat's API door below still works (scripts/deskRetiredCheck.mjs holds the page)");
r = await call("api/crewPage.js", { method: "GET", url: "/api/crewPage?page=onebox-preview", cookie: seat }); ok(is404(r), "a seat cookie opens no other crew page");
r = await call("api/crewPage.js", { method: "GET", url: "/api/crewPage?page=desk", cookie: crew }); ok(r.code === 302 && r.h.location === "/preview/desk", "the crew are sent from /desk to the Desk V4 preview");

// 5. NOBODY ELSE: no cookie, forged, expired, wrong kind
const forged = seat.replace(/\.[A-Za-z0-9_-]{43}$/, "." + "A".repeat(43)), expired = "gas_seat=" + mintSeatCookieValue(11, Date.now() - (SEAT_MAX_AGE_S + 60) * 1000);
const crewAsSeat = "gas_seat=" + crew.slice("gas_crew=".length), seatAsCrew = "gas_crew=" + seat.slice("gas_seat=".length);
const pending = "gas_seat=" + mintSeatCookieValue(12), crewSeatRow = "gas_seat=" + mintSeatCookieValue(1), unknownSeat = "gas_seat=" + mintSeatCookieValue(999);
for (const [name, c] of [["no cookie", undefined], ["a forged signature", forged], ["an expired cookie", expired], ["the crew cookie in the seat slot", crewAsSeat], ["the seat cookie in the crew slot", seatAsCrew], ["a pending seat's cookie", pending], ["the crew seat row's cookie", crewSeatRow], ["a seat that does not exist", unknownSeat]]) {
  r = await call("api/desk.js", { cookie: c, body: { action: "sheet_queue" } }); ok(is404(r), `/api/desk with ${name} is the platform 404 (${r.code})`);
  r = await call("api/crewPage.js", { method: "GET", url: "/api/crewPage?page=desk", cookie: c }); ok(is404(r), `/desk page with ${name} is the platform 404 (${r.code})`);
}

// 6. REMOVED: out on the next call, no new cookie, same cookie dead
SEATS.find(s => s.id === 11).active = false;
r = await call("api/desk.js", { cookie: seat, body: { action: "sheet_queue" } }); ok(is404(r), "a removed seat is out on the very next /api/desk call (" + r.code + ")");
r = await call("api/crewPage.js", { method: "GET", url: "/api/crewPage?page=desk", cookie: seat }); ok(is404(r), "a removed seat's Desk page is the platform 404");
r = await call("api/deskSeat.js", { headers: { authorization: "Bearer " + tA } }); ok(is404(r), "a removed seat is given no new cookie");
SEATS.find(s => s.id === 11).active = true;
r = await call("api/desk.js", { cookie: seat, body: { action: "sheet_queue" } }); ok(r.code === 200, "restoring the seat restores the same cookie (the seat row, not the cookie, decides)");

// 7. THE CREW PATH keeps working
r = await call("api/desk.js", { cookie: crew, body: { action: "sheet_queue", view: "queue" } }); ok(r.code === 200 && r.body && r.body.seat === "crew", "the crew runs sheet_queue as the crew seat");
r = await call("api/desk.js", { cookie: crew, body: { action: "list_views", desk: true } }); ok(r.code !== 403 && r.code !== 404, "the crew still reaches the analyst actions (" + r.code + ")");

// 8. WIRING: the router, the sign-in call and the Valuations landing
const fs = await import("node:fs"), vj = JSON.parse(fs.readFileSync("vercel.json", "utf8"));
ok(!(vj.rewrites || []).some(x => /^\/desk/.test(x.source) && (x.has || []).some(h => h.key === "gas_seat")), "vercel.json no longer routes /desk for a gas_seat cookie");
ok(!(vj.rewrites || []).some(x => x.source === "/desk" && !(x.has || []).length), "no rewrite sends /desk to anyone without a cookie");
const auth = fs.readFileSync("public/js/auth.js", "utf8"); ok(/\/api\/deskSeat/.test(auth) && /authDeskDoor\(s\.access_token\)/.test(auth), "the sign-in script calls the seat door after a session is written");

globalThis.fetch = realFetch;
console.log(`seatAccessCheck: ${pass} pass, ${fail} FAIL`); process.exit(fail ? 1 : 0);
