// ORG SETTINGS CHECK for the Desk (Lane S, Nov 4 2026). Spec: an org can set venue choice on or off, threshold (default 15%), branding, sending
// address and standard message, reserve or range allowed; "nothing else in v1". Three seats for the Hagerty org, each their own login, through the
// crew and seat gates; the Desk stays out of nav and sitemap.
// Proves:
//   1. Defaults: threshold 15, venue choice OFF, reserve-or-range "either", automatic sending OFF, no sending address, not ready to send.
//   2. The org-editable list is EXACTLY the spec list; the operator-only fields (seat limit, licence dates) are refused from an org and accepted from the operator.
//   3. Validation: threshold range, booleans, enum, header injection through a name or address (CR/LF), free-mail sending addresses, a logo outside the org's own brand folder,
//      unknown fields. Nothing invalid is stored.
//   4. A sending address is usable ONLY after the provider says its domain is verified, for THAT domain; changing the domain resets verification; a mismatched provider
//      answer never verifies; no provider key = no verification.
//   5. Seats: the signed crew is the operator; a signed-in account with an active seat is that seat in its ONE org; no seat / inactive seat / another org's seat is nobody;
//      an invited seat binds only for its own email; the seat limit (3 for Hagerty) holds in code AND in the database; a seat cannot act in another org.
//   6. The endpoint answers a stranger the disguised 404 and sets no CORS header; /desk and the admin endpoint are in no nav, sitemap or robots file.
// Every item is then re-run against a MUTANT with the protection removed; each must fail.
//   node scripts/orgSettingsCheck.mjs     exit 1 on any failure; the database part says SKIP (never a pass) with no local Postgres.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ROOT, readDdl, build, available, stop, U } from "./_deskDb.mjs";
import { installFake } from "./_deskFakes.mjs";

const SCRATCH = process.env.DESK_CHECK_TMP || undefined;
const LIB = path.join(ROOT, "lib/desk");
let seq = 0;
async function loadMut(file, transform) {
  if (!transform) return import(pathToFileURL(path.join(LIB, file)).href + "?real");
  const tmp = path.join(LIB, `__mut${++seq}_${file}`);
  fs.writeFileSync(tmp, transform(fs.readFileSync(path.join(LIB, file), "utf8")));
  try { return await import(pathToFileURL(tmp).href); } finally { fs.rmSync(tmp, { force: true }); }
}
const env = { supabaseUrl: "https://x.supabase.test", supabaseKey: "svc" };

export async function jsFindings(t = {}) {
  const fails = [], os = await loadMut("orgSettings.js", t.orgSettings), dom = await loadMut("domain.js", t.domain), seats = await loadMut("seats.js", t.seats);
  const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) fails.push(`${m}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`); };
  const bad = (patch, m, opts) => { const v = os.validateSettingsPatch("hagerty", patch, opts); if (v.ok) fails.push(`accepted: ${m}`); };
  const good = (patch, m, opts) => { const v = os.validateSettingsPatch("hagerty", patch, opts); if (!v.ok) fails.push(`refused: ${m} (${v.errors.join("; ")})`); return v.clean; };

  // 1. defaults
  const d = os.effectiveSettings(null);
  eq([d.threshold_pct, d.venue_choice, d.reserve_or_range, d.auto_send, d.sending_address, os.sendingReady(d)], [15, false, "either", false, null, false], "defaults");
  // 2. the editable list
  eq([...os.EDITABLE_FIELDS].sort(), ["auto_send", "logo_path", "reserve_or_range", "sending_address", "sending_name", "signature", "standard_message", "threshold_pct", "venue_choice"], "org-editable fields are exactly the spec list");
  for (const f of ["seat_limit", "licence_starts_on", "licence_ends_on", "sending_domain_status", "sending_domain", "sending_domain_provider_id", "org_id"]) bad({ [f]: f.includes("licence") ? "2030-01-01" : f === "seat_limit" ? 9 : "verified" }, `an org may set ${f}`);
  good({ seat_limit: 3, licence_ends_on: "2027-10-31" }, "the operator sets seat limit and licence end", { operator: true });
  bad({ licence_ends_on: null }, "the licence end cannot be cleared", { operator: true });
  bad({ licence_ends_on: "2027-02-30" }, "an impossible licence date", { operator: true });
  bad({ seat_limit: 0 }, "seat limit 0", { operator: true });
  // 3. validation
  for (const v of [0, 0.4, 100.5, -5, "abc", NaN, Infinity, null, "", {}]) bad({ threshold_pct: v }, `threshold ${JSON.stringify(v)}`);
  eq(good({ threshold_pct: 20 }, "threshold 20").threshold_pct, 20, "threshold 20"); eq(good({ threshold_pct: "12.5" }, "threshold '12.5'").threshold_pct, 12.5, "threshold string");
  bad({ venue_choice: "yes" }, "venue_choice 'yes'"); bad({ auto_send: 1 }, "auto_send 1"); good({ venue_choice: true, auto_send: false }, "booleans");
  bad({ reserve_or_range: "both" }, "reserve_or_range 'both'"); for (const v of ["reserve", "range", "either"]) good({ reserve_or_range: v }, `reserve_or_range ${v}`);
  bad({ sending_address: "marketplace@hagerty.com\r\nBcc: x@evil.test" }, "CRLF in the sending address"); bad({ sending_name: "Hagerty\nBcc: x@evil.test" }, "newline in the sending name");
  bad({ sending_address: "someone@gmail.com" }, "a free-mail sending address"); bad({ sending_address: "not-an-address" }, "a malformed address");
  eq(good({ sending_address: "Marketplace@Hagerty.com" }, "a company address").sending_address, "marketplace@hagerty.com", "address is lower-cased");
  bad({ logo_path: "sam/brand/logo.png" }, "another org's logo"); bad({ logo_path: "hagerty/brand/../../sam/x.png" }, "a traversal logo"); bad({ logo_path: "hagerty/brand/logo.exe" }, "a non-image logo");
  good({ logo_path: "hagerty/brand/logo.png" }, "the org's own logo");
  bad({ signature: "x\u0000y" }, "a control character in the signature"); good({ signature: "Hagerty Marketplace\nvaluations team" }, "a signature with a newline");
  bad({ is_admin: true }, "an unknown field"); bad("threshold_pct", "a non-object patch");
  eq(os.validateSettingsPatch("Bad Org!", { threshold_pct: 20 }).ok, false, "a bad org id");

  // 3b/4. storing, and the sending address rules, against the in-memory store
  const state = { fail: {}, tables: { desk_org_settings: [{ org_id: "hagerty", sending_address: "marketplace@hagerty.com", sending_domain: "hagerty.com", sending_domain_status: "verified", sending_domain_provider_id: "dom_1", threshold_pct: 15, venue_choice: false, reserve_or_range: "either", auto_send: false, seat_limit: 3, licence_ends_on: "2027-10-31" }] } };
  let undo = installFake(state);
  try {
    let r = await os.putOrgSettings(env, { org: "hagerty", patch: { seat_limit: 99, threshold_pct: 20 }, operator: false, seatId: 1 });
    eq([r.ok, state.tables.desk_org_settings[0].seat_limit, state.tables.desk_org_settings[0].threshold_pct], [false, 3, 15], "an org cannot change its seat limit, and nothing else in the patch is stored either");
    r = await os.putOrgSettings(env, { org: "hagerty", patch: { threshold_pct: 20, venue_choice: true }, seatId: 1 });
    eq([r.ok, state.tables.desk_org_settings[0].threshold_pct, state.tables.desk_org_settings[0].venue_choice], [true, 20, true], "a valid patch is stored");
    eq(state.tables.desk_org_settings[0].sending_domain_status, "verified", "an unrelated change keeps the domain verified");
    r = await os.putOrgSettings(env, { org: "hagerty", patch: { sending_address: "valuations@hagerty.com" }, seatId: 1 });
    eq(state.tables.desk_org_settings[0].sending_domain_status, "verified", "a new address on the SAME verified domain stays verified");
    r = await os.putOrgSettings(env, { org: "hagerty", patch: { sending_address: "marketplace@hagertymarketplace.com" }, seatId: 1 });
    eq([state.tables.desk_org_settings[0].sending_domain, state.tables.desk_org_settings[0].sending_domain_status, state.tables.desk_org_settings[0].sending_domain_provider_id], ["hagertymarketplace.com", "unverified", null], "a new DOMAIN resets verification");
    eq(os.sendingReady(await os.getOrgSettings(env, "hagerty")), false, "an unverified new domain is not ready to send");
  } finally { undo(); }
  eq(os.sendingReady({ sending_address: "a@x.com", sending_domain: "x.com", sending_domain_status: "pending" }), false, "pending is not ready");
  eq(os.sendingReady({ sending_address: "a@x.com", sending_domain: "x.com", sending_domain_status: "verified" }), true, "verified on the same domain is ready");
  eq(os.sendingReady({ sending_address: "a@other.com", sending_domain: "x.com", sending_domain_status: "verified" }), false, "verified for another domain is not ready");

  // 4b. the provider
  const provider = (answers) => async (url, init = {}) => {
    const u = String(url), m = (init.method || "GET").toUpperCase();
    const reply = (b, status = 200) => new Response(JSON.stringify(b), { status });
    if (u.endsWith("/domains") && m === "POST") return reply(answers.create || { id: "dom_9", name: "hagertymarketplace.com", status: "not_started", records: [{ type: "TXT", name: "x", value: "y" }] });
    if (u.endsWith("/verify")) return reply({});
    return reply(answers.get || { id: "dom_9", name: "hagertymarketplace.com", status: "verified", records: [] });
  };
  const mkState = () => ({ fail: {}, tables: { desk_org_settings: [{ org_id: "hagerty", sending_address: "marketplace@hagertymarketplace.com", sending_domain: "hagertymarketplace.com", sending_domain_status: "unverified" }] } });
  let st = mkState(); undo = installFake(st);
  try {
    let r = await dom.startDomainVerification(env, "hagerty", { apiKey: "k", fetchFn: provider({}) });
    eq([r.ok, r.status, st.tables.desk_org_settings[0].sending_domain_provider_id], [true, "pending", "dom_9"], "start: pending, provider id kept");
    r = await dom.checkDomainVerification(env, "hagerty", { apiKey: "k", fetchFn: provider({ get: { id: "dom_9", name: "hagertymarketplace.com", status: "pending" } }) });
    eq(st.tables.desk_org_settings[0].sending_domain_status, "pending", "the provider says pending: stays pending");
    r = await dom.checkDomainVerification(env, "hagerty", { apiKey: "k", fetchFn: provider({ get: { id: "dom_9", name: "someoneelse.com", status: "verified" } }) });
    eq([r.ok, st.tables.desk_org_settings[0].sending_domain_status], [false, "pending"], "a provider answer for another domain never verifies");
    r = await dom.checkDomainVerification(env, "hagerty", { apiKey: "k", fetchFn: provider({}) });
    eq([r.ok, st.tables.desk_org_settings[0].sending_domain_status, !!st.tables.desk_org_settings[0].sending_domain_verified_at], [true, "verified", true], "the provider says verified: verified, time stamped");
    r = await dom.startDomainVerification(env, "hagerty", { apiKey: "", fetchFn: provider({}) });
    eq(r.ok, false, "no provider key: no verification");
  } finally { undo(); }

  // 5. seats and the caller gate
  const seatRows = () => [
    { id: 1, org_id: "hagerty", subject: "u-admin", role: "admin", active: true, email: "admin@hagerty.com" },
    { id: 2, org_id: "hagerty", subject: "u-member", role: "member", active: true, email: "m@hagerty.com" },
    { id: 3, org_id: "sam", subject: "u-sam", role: "member", active: true, email: "s@sam.com" },
    { id: 4, org_id: "hagerty", subject: "u-gone", role: "member", active: false, email: "gone@hagerty.com" },
    { id: 5, org_id: "hagerty", subject: "pending:new@hagerty.com", role: "member", active: true, email: "new@hagerty.com" }
  ];
  st = { fail: {}, tables: { desk_seats: seatRows(), desk_org_settings: [{ org_id: "hagerty", seat_limit: 3 }, { org_id: "sam", seat_limit: 5 }] } }; undo = installFake(st);
  try {
    const who = { "Bearer t-admin": { userId: "u-admin", email: "admin@hagerty.com" }, "Bearer t-sam": { userId: "u-sam", email: "s@sam.com" }, "Bearer t-gone": { userId: "u-gone", email: "gone@hagerty.com" }, "Bearer t-none": { userId: "u-none", email: "none@x.com" }, "Bearer t-new": { userId: "u-new", email: "new@hagerty.com" }, "Bearer t-fake": { userId: "u-fake", email: "attacker@evil.test" } };
    const validate = async h => who[h] || null, req = h => ({ headers: h ? { authorization: h } : {} });
    const rc = (h, isCrew = false) => seats.resolveCaller(req(h), { env, validate, isCrew: () => isCrew });
    let c = await rc(null, true); eq([c.kind, c.operator, c.org], ["crew", true, "sam"], "the signed crew is the operator");
    c = await rc("Bearer t-admin"); eq([c.kind, c.org, c.role, c.operator], ["seat", "hagerty", "admin", false], "an active seat is that seat in its org");
    eq(await rc("Bearer t-none"), null, "a signed-in account with no seat is nobody"); eq(await rc("Bearer t-gone"), null, "an inactive seat is nobody");
    eq(await rc("Bearer bogus"), null, "an invalid token is nobody"); eq(await rc(null), null, "no credentials is nobody");
    c = await rc("Bearer t-new"); eq([c && c.org, st.tables.desk_seats.find(s => s.id === 5).subject], ["hagerty", "u-new"], "an invited seat binds to the account with the invited email");
    eq(await rc("Bearer t-fake"), null, "an account with a different email cannot take the invite");
    const adminC = await rc("Bearer t-admin"), memberC = { kind: "seat", operator: false, org: "hagerty", role: "member", seatId: 2 }, samC = await rc("Bearer t-sam"), crewC = await rc(null, true);
    eq([seats.canActOnOrg(adminC, "hagerty"), seats.canActOnOrg(adminC, "sam"), seats.canActOnOrg(samC, "hagerty"), seats.canActOnOrg(crewC, "hagerty"), seats.canActOnOrg(null, "hagerty")], [true, false, false, true, false], "a seat acts only in its own org; the operator anywhere");
    eq([seats.canAdminOrg(adminC, "hagerty"), seats.canAdminOrg(memberC, "hagerty"), seats.canAdminOrg(adminC, "sam")], [true, false, false], "only an admin administers, only in its own org");
    // hagerty has 4 rows active=true (admin, member, pending bound, gone is inactive): admin, member, new = 3 active
    let a = await seats.addSeat(env, adminC, "hagerty", { email: "x@hagerty.com" });
    eq([a.ok, a.status], [false, 409], "the 4th seat of a 3-seat org is refused");
    a = await seats.deactivateSeat(env, adminC, "hagerty", 2); eq(a.ok, true, "an admin removes a seat");
    a = await seats.addSeat(env, adminC, "hagerty", { email: "x@hagerty.com" }); eq(a.ok, true, "...which frees the seat");
    a = await seats.addSeat(env, memberC, "hagerty", { email: "y@hagerty.com" }); eq([a.ok, a.status], [false, 403], "a member cannot add a seat");
    a = await seats.addSeat(env, adminC, "sam", { email: "y@sam.com" }); eq([a.ok, a.status], [false, 403], "a hagerty admin cannot add a seat to another org");
    a = await seats.addSeat(env, crewC, "sam", { email: "y@sam.com" }); eq(a.ok, true, "the operator adds a seat anywhere");
    a = await seats.addSeat(env, crewC, "sam", { email: "nope" }); eq(a.ok, false, "a bad email is refused");
    a = await seats.addSeat(env, crewC, "sam", { email: "z@sam.com", role: "owner" }); eq(a.ok, false, "an owner seat cannot be granted here");
    a = await seats.deactivateSeat(env, adminC, "hagerty", 1); eq(a.ok, false, "an admin cannot remove their own seat");
    a = await seats.deactivateSeat(env, adminC, "sam", 3); eq([a.ok, st.tables.desk_seats.find(s => s.id === 3).active], [false, true], "a hagerty admin cannot remove a sam seat");
    a = await seats.listSeats(env, memberC, "sam"); eq(a.ok, false, "a seat cannot list another org's seats");
  } finally { undo(); }

  // 6. the endpoint and the nav
  process.env.CURTAIN_CREW_CODE = "check-code";
  const handler = (await import(pathToFileURL(path.join(ROOT, "api/deskOrg.js")).href + "?c" + (++seq))).default;
  const mkRes = () => { const r = { headers: {}, code: 0, body: null, setHeader(k, v) { r.headers[k.toLowerCase()] = v; }, removeHeader(k) { delete r.headers[k.toLowerCase()]; }, status(c) { r.code = c; return r; }, json(b) { r.body = b; return r; }, send(b) { r.body = b; return r; }, end() { return r; } }; return r; };
  process.env.SUPABASE_URL = env.supabaseUrl; process.env.SUPABASE_SERVICE_ROLE_KEY = env.supabaseKey;
  let res = mkRes(); await handler({ method: "POST", headers: { origin: "https://goasksam.com" }, body: { action: "settings.get" } }, res);
  eq([res.code, "access-control-allow-origin" in res.headers, typeof res.body === "string"], [404, false, true], "a stranger gets the disguised 404 with no CORS header");
  res = mkRes(); await handler({ method: "GET", headers: {} }, res); eq(res.code, 404, "a stranger gets the same 404 on GET");
  const crew = (await import(pathToFileURL(path.join(ROOT, "lib/_crew.js")).href)).mintCrewCookieValue();
  const cst = { fail: {}, tables: { desk_org_settings: [{ org_id: "sam", threshold_pct: 15 }] } }; undo = installFake(cst);
  try {
    res = mkRes(); await handler({ method: "POST", headers: { cookie: `gas_crew=${crew}`, origin: "https://goasksam.com" }, body: { action: "settings.get" } }, res);
    eq([res.code, res.body && res.body.ok, res.body && res.body.settings && res.body.settings.threshold_pct], [200, true, 15], "the crew reads its org's settings");
    res = mkRes(); await handler({ method: "POST", headers: { cookie: `gas_crew=${crew}` }, body: { action: "settings.put", org: "sam", patch: { threshold_pct: 5000 } } }, res);
    eq(res.code, 400, "the endpoint refuses an invalid setting");
    res = mkRes(); await handler({ method: "POST", headers: { cookie: `gas_crew=${crew}` }, body: { action: "org.purge", org: "sam", confirm: "wrong" } }, res);
    eq(res.code, 400, "an org purge needs the org id repeated");
  } finally { undo(); }
  const grepAll = (files, re) => files.filter(f => fs.existsSync(path.join(ROOT, f)) && re.test(fs.readFileSync(path.join(ROOT, f), "utf8")));
  const pubFiles = fs.readdirSync(path.join(ROOT, "public")).filter(f => /sitemap.*\.xml$|^robots\.txt$/.test(f)).map(f => "public/" + f);
  eq(grepAll(["lib/appShell.js", "lib/authBar.js", "api/sitemapPages.js", "api/_chrome.js", ...pubFiles], /["'>\/](?:desk|deskOrg)(?:["'<?#\s]|$)|goasksam\.com\/desk|\/api\/deskOrg/), [], "/desk and the admin endpoint are in no nav, sitemap or robots file");
  const vj = fs.readFileSync(path.join(ROOT, "vercel.json"), "utf8");
  eq(/"source":\s*"\/desk"[^}]*"has"/.test(vj), true, "the /desk route is served only to a request carrying a cookie");
  return fails;
}

export async function dbFindings(files) {
  const fails = [], { c, db, errors } = await build(files, { baseDir: SCRATCH });
  if (errors.length) return errors.map(e => "apply: " + e);
  const q = sql => c.run(db, sql), eq = (a, b, m) => { if (a !== b) fails.push(`${m}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`); };
  eq(q(`select threshold_pct::text || '|' || venue_choice || '|' || reserve_or_range || '|' || auto_send || '|' || seat_limit from desk_org_settings where org_id='hagerty'`).out, "15.00|false|either|false|3", "database defaults: threshold 15, venue off, either, auto-send off, 3 seats");
  // hagerty seeded with two ACTIVE seats (+1 inactive): a third fits, a fourth does not
  if (!q(`insert into desk_seats (org_id, subject, role) values ('hagerty','pending:third@h.test','member')`).ok) fails.push("the third hagerty seat was refused");
  if (q(`insert into desk_seats (org_id, subject, role) values ('hagerty','pending:fourth@h.test','member')`).ok) fails.push("a fourth hagerty seat was accepted (limit 3)");
  if (q(`update desk_seats set active = true where subject = '${U.D}'`).ok) fails.push("reactivating a seat past the limit was accepted");
  if (q(`update desk_seats set org_id = 'hagerty' where subject = '${U.B}'`).ok) fails.push("moving a seat into a full org was accepted");
  if (!q(`update desk_seats set active = false where subject = '${U.A2}'`).ok || !q(`update desk_seats set active = true where subject = '${U.D}'`).ok) fails.push("freeing a seat did not free the slot");
  for (const [bad, why] of [[`threshold_pct = 0`, "threshold 0"], [`threshold_pct = 150`, "threshold 150"], [`reserve_or_range = 'both'`, "reserve_or_range both"], [`sending_domain_status = 'verified', sending_domain = null`, "verified with no domain"], [`sending_address = 'a@other.com', sending_domain = 'hagerty.com'`, "address on another domain than the verified one"], [`seat_limit = 0`, "seat limit 0"]])
    if (q(`update desk_org_settings set ${bad} where org_id = 'hagerty'`).ok) fails.push(`the database accepted ${why}`);
  return fails;
}

const rep = (s, from, to) => { if (!s.includes(from)) throw new Error("mutant did not apply: " + from.slice(0, 60)); return s.replace(from, () => to); };
export const JS_MUTANTS = [
  ["default threshold is 10", { orgSettings: s => rep(s, "DEFAULT_THRESHOLD_PCT = 15", "DEFAULT_THRESHOLD_PCT = 10") }],
  ["venue choice defaults on", { orgSettings: s => rep(s, "venue_choice: false, reserve_or_range: \"either\", auto_send: false,\n  sending_domain", "venue_choice: true, reserve_or_range: \"either\", auto_send: false,\n  sending_domain") }],
  ["an org may set its licence end", { orgSettings: s => rep(s, "\"reserve_or_range\", \"auto_send\"]);", "\"reserve_or_range\", \"auto_send\", \"licence_ends_on\", \"seat_limit\"]);") }],
  ["header injection allowed", { orgSettings: s => rep(s, "const hasCtl = (s, allowNl) =>", "const hasCtl = (s, allowNl) => false && ") }],
  ["free-mail sending address allowed", { orgSettings: s => rep(s, "else if (FREE_MAIL.includes(domainOf(v.trim())))", "else if (false)") }],
  ["threshold unbounded", { orgSettings: s => rep(s, "n < 0.5 || n > 100", "false") }],
  ["another org's logo allowed", { orgSettings: s => rep(s, "!v.startsWith(org + \"/brand/\") || ", "") }],
  ["unverified domain is ready to send", { orgSettings: s => rep(s, "e.sending_domain_status === \"verified\" && ", "") }],
  ["a new domain keeps the old verification", { orgSettings: s => rep(s, "if (d !== (cur.sending_domain || null))", "if (false)") }],
  ["pending counts as verified", { domain: s => rep(s, "  return \"pending\";   // not_started", "  return \"verified\";   // not_started") }],
  ["a provider answer for another domain verifies", { domain: s => rep(s, "if (String(j.name || \"\").toLowerCase() !== String(s.sending_domain).toLowerCase())", "if (false)") }],
  ["a seat acts in any org", { seats: s => rep(s, "caller.kind === \"seat\" && caller.org === org", "caller.kind === \"seat\"") }],
  ["no seat limit in code", { seats: s => rep(s, "if (n >= limit)", "if (false)") }],
  ["an inactive seat can sign in", { seats: s => rep(s, "&active=eq.true&limit=2`);\n  if (!Array.isArray(rows)) return null;", "&limit=2`);\n  if (!Array.isArray(rows)) return null;") }],
  ["any account takes any invite", { seats: s => rep(s, "supabaseSelect(env, `desk_seats?select=id,org_id,role,subject&subject=eq.${encodeURIComponent(pendingSubject(who.email))}", "supabaseSelect(env, `desk_seats?select=id,org_id,role,subject&subject=like.pending:*") }]
];
const sqlRep = (f, from, to) => ({ ...f, "supabase-desk-storage.sql": rep(f["supabase-desk-storage.sql"], from, to) });
export const DB_MUTANTS = [
  ["no seat limit in the database", f => sqlRep(f, "create trigger desk_seat_limit before insert or update of active, org_id on desk_seats for each row execute function desk_seat_limit_guard();", "")],
  ["database threshold unbounded", f => sqlRep(f, "check (threshold_pct >= 0.5 and threshold_pct <= 100)", "check (true)")],
  ["database default threshold is 10", f => sqlRep(f, "threshold_pct                numeric(5,2) not null default 15", "threshold_pct                numeric(5,2) not null default 10")],
  ["verified needs no domain", f => sqlRep(f, "check (sending_domain_status <> 'verified' or sending_domain is not null)", "check (true)")]
];

export async function main() {
  let pass = 0, fail = 0; const bad = m => { fail++; console.log("FAIL " + m); }, ok = () => { pass++; };
  const js = await jsFindings(); js.length ? js.forEach(bad) : ok();
  for (const [name, m] of JS_MUTANTS) {
    let f; try { f = await jsFindings(m); } catch (e) { f = ["threw: " + e.message]; }
    if (f.length) { ok(); if (process.env.VERBOSE) console.log(`  caught "${name}": ${f[0].slice(0, 120)}`); } else bad(`mutant "${name}" was NOT caught`);
  }
  if (!available()) { console.log("SKIP orgSettingsCheck database part: no local Postgres. NOT a pass of the database part."); console.log(`orgSettingsCheck: ${pass} passed, ${fail} failed, database part SKIPPED`); return fail ? 1 : 0; }
  const real = readDdl(), db = await dbFindings(real); db.length ? db.forEach(bad) : ok();
  for (const [name, m] of DB_MUTANTS) {
    let files; try { files = m(real); } catch (e) { bad(`mutant "${name}": ${e.message}`); continue; }
    const f = await dbFindings(files);
    if (f.length && /^apply:/.test(f[0])) { bad(`mutant "${name}" did not even apply (${f[0].slice(0, 100)})`); continue; }
    if (f.length) { ok(); if (process.env.VERBOSE) console.log(`  caught "${name}": ${f[0].slice(0, 120)}`); } else bad(`mutant "${name}" was NOT caught`);
  }
  console.log(`orgSettingsCheck: ${pass} passed, ${fail} failed (${JS_MUTANTS.length} code mutants + ${DB_MUTANTS.length} database mutants, each must be caught)`);
  return fail ? 1 : 0;
}
if (import.meta.url === pathToFileURL(process.argv[1]).href) { const code = await main(); stop(); process.exit(code); }
