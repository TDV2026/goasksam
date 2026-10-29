// The Searches and Users tabs (Lane D, Oct 26 2026, dashboard round 2). READ ONLY, admin only (api/admin.js gates both).
// They read analytics_events and accounts, list what happened, and return plain rows. They write nothing and compute no
// product answer: every outcome shown was put in the event by the engine's own result (search_run.answer_type).
//
// The raw text is the scrubbed query_text already stored (emails, phone numbers and VINs removed at write time). The person
// is the account email when the visitor was signed in, else the pseudonymous anon id. This is the one place an email is shown,
// and only to an ADMIN_EMAILS account or the server credential.
const enc = encodeURIComponent;
const PRODUCTS = ["buy", "market_check", "sell"];
const OUTCOME = { range: ["range"], thin: ["not_enough_data"], nothing: ["zero_result"], error: ["failed"], asked_back: ["identity_question"] };
const OUTCOME_LABEL = { range: "range", not_enough_data: "thin", zero_result: "nothing", failed: "error", identity_question: "asked back" };
export const SEARCH_ROWS_MAX = 5000;
const SINCE = "2026-10-01T00:00:00Z";   // the analytics layer's first day; Users reads from here

// A bounded paged read: up to cap rows, a short page ends it. A failed page throws (the tab shows an error, never an empty table).
export async function readCapped(env, path, cap, pageSize = 1000) {
  const out = [];
  for (let off = 0; off < cap; off += pageSize) {
    const want = Math.min(pageSize, cap - off);
    const r = await fetch(`${env.supabaseUrl}/rest/v1/${path}`, { headers: { apikey: env.supabaseKey, Authorization: `Bearer ${env.supabaseKey}`, "Range-Unit": "items", Range: `${off}-${off + want - 1}` } });
    if (!r.ok) throw new Error("read failed");
    const page = await r.json();
    if (!Array.isArray(page)) throw new Error("read failed");
    out.push(...page);
    if (page.length < want) break;
  }
  return out;
}

const internalFilter = crew => (crew ? "" : "&internal=eq.false");
const clean = (s, n) => String(s || "").replace(/[*,()%\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, n);

async function emailsFor(env, ids) {
  const m = new Map();
  const list = [...new Set(ids.filter(x => /^[0-9a-f-]{36}$/i.test(String(x || ""))))];
  for (let i = 0; i < list.length; i += 100) {
    const part = list.slice(i, i + 100);
    const r = await readCapped(env, `accounts?user_id=in.(${part.join(",")})&select=user_id,email`, 200).catch(() => []);
    for (const a of r) if (a.user_id) m.set(a.user_id, a.email || null);
  }
  return m;
}

// First page view per visitor in the window: where they came from (referrer domain, else the campaign tag, else direct).
async function firstSources(env, from, to, crew) {
  const pv = await readCapped(env, `analytics_events?name=eq.page_view&ts=gte.${enc(from)}&ts=lt.${enc(to)}&is_bot=eq.false${internalFilter(crew)}&anon_id=not.is.null&select=anon_id,ref_domain,utm_source&order=ts.asc`, 60000);
  const m = new Map();
  for (const e of pv) if (!m.has(e.anon_id)) m.set(e.anon_id, e.utm_source ? "utm " + e.utm_source : (e.ref_domain || "direct"));
  return m;
}

// WHAT PEOPLE TYPED (Oct 28 2026): the last ASKED_MAX different search texts, each with the car it resolved to and how many times it was asked.
// Every Find, Market Check and Sell search writes a search_run with its scrubbed text whatever it ended in (a range, thin, nothing, an error, a question
// back), so this is every search, not only the unmet ones. NO VISITOR IDENTITY: the read selects the text, the car, the product, the time and the outcome
// and nothing else (no anon id, account, session, device, place or source), so the list cannot carry a person. Counts are over the most recent
// ASKED_READ_MAX searches in the range; the block says so when that cap is reached.
export const ASKED_MAX = 200, ASKED_READ_MAX = 5000;
export function groupAsked(rows, max = ASKED_MAX) {
  const m = new Map();
  for (const r of rows) {   // rows arrive newest first
    const text = String(r.text || "").trim(); if (!text || text === "-") continue;
    const k = r.product + "|" + text.toLowerCase();
    const o = m.get(k) || { product: r.product, text, car: r.car ? String(r.car).replace("|", " ") : "", times: 0, last: r.ts, outcome: OUTCOME_LABEL[r.answer_type] || String(r.answer_type || "") };
    o.times++; if (!o.car && r.car) o.car = String(r.car).replace("|", " ");
    m.set(k, o);
  }
  return [...m.values()].slice(0, max);   // insertion order is newest first
}
export async function askedPanel(env, o) {
  const parts = [`analytics_events?name=eq.search_run&ts=gte.${enc(o.from)}&ts=lt.${enc(o.to)}&is_bot=eq.false${internalFilter(o.crew)}`];
  if (PRODUCTS.includes(o.product)) parts.push(`product=eq.${o.product}`);
  parts.push("select=ts,product,text:props->>query_text,car:props->>vehicle_key,answer_type:props->>answer_type&order=ts.desc");
  const ev = await readCapped(env, parts.join("&"), ASKED_READ_MAX);
  return { rows: groupAsked(ev), searches_read: ev.length, capped: ev.length >= ASKED_READ_MAX, max: ASKED_MAX };
}

// o: { from, to, product, outcome, text, crew, limit }
export async function searchesPanel(env, o) {
  const limit = Math.max(1, Math.min(SEARCH_ROWS_MAX, Number(o.limit) || 300));
  const parts = [`analytics_events?name=eq.search_run&ts=gte.${enc(o.from)}&ts=lt.${enc(o.to)}&is_bot=eq.false${internalFilter(o.crew)}`];
  if (PRODUCTS.includes(o.product)) parts.push(`product=eq.${o.product}`);
  if (OUTCOME[o.outcome]) parts.push(`props->>answer_type=in.(${OUTCOME[o.outcome].join(",")})`);
  const text = clean(o.text, 60);
  if (text) parts.push(`props->>query_text=ilike.*${enc(text)}*`);
  parts.push("select=ts,product,anon_id,user_id,device_class,internal,props&order=ts.desc");
  const ev = await readCapped(env, parts.join("&"), limit);
  const [emails, sources] = await Promise.all([emailsFor(env, ev.map(e => e.user_id)), firstSources(env, o.from, o.to, o.crew).catch(() => new Map())]);
  const rows = ev.map(e => {
    const p = e.props || {};
    return { ts: e.ts, product: e.product, text: p.query_text || "", car: p.vehicle_key ? String(p.vehicle_key).replace("|", " ") : "", outcome: OUTCOME_LABEL[p.answer_type] || String(p.answer_type || ""),
      seconds: p.latency_ms != null ? Math.round(Number(p.latency_ms) / 100) / 10 : null, cache: p.cache || "", state: p.geo_region || p.geo_country || "", device: e.device_class || "",
      source: e.anon_id ? (sources.get(e.anon_id) || "") : "", person: (e.user_id && emails.get(e.user_id)) || e.anon_id || "", signed_in: !!e.user_id, anon: e.anon_id || null, crew: !!e.internal };
  });
  const asked = o.asked === false ? null : await askedPanel(env, o).catch(() => null);
  return { rows, shown: rows.length, capped: ev.length >= limit, limit, from: o.from, to: o.to, asked };
}

// Users: one row per account with what they did. o: { text, crew, adminEmail(email) => bool }
export async function usersPanel(env, o) {
  const accounts = await readCapped(env, "accounts?select=user_id,email,created_at,marketing_consent&order=created_at.desc", 5000);
  const ev = await readCapped(env, `analytics_events?user_id=not.is.null&is_bot=eq.false${internalFilter(o.crew)}&ts=gte.${enc(SINCE)}&name=in.(page_view,search_run,task_created,auction_clickout,live_car_clicked,signin)&select=ts,name,user_id,ref_domain,utm_source,props&order=ts.asc`, 60000);
  const per = new Map();
  for (const e of ev) {
    const u = per.get(e.user_id) || { searches: 0, tasks: 0, clickouts: 0, last: null, source: null, method: null, newsletter: false, n: 0 };
    u.n++;
    if (e.name === "search_run") u.searches++;
    else if (e.name === "task_created") u.tasks++;
    else if (e.name === "auction_clickout" || e.name === "live_car_clicked") u.clickouts++;
    else if (e.name === "page_view" && !u.source) u.source = e.utm_source ? "utm " + e.utm_source : (e.ref_domain || "direct");
    else if (e.name === "signin") { const p = e.props || {}; if (p.method) u.method = p.method; if (p.newsletter === true) u.newsletter = true; }
    u.last = e.ts;
    per.set(e.user_id, u);
  }
  const text = clean(o.text, 60).toLowerCase();
  let list = accounts.filter(a => a.email && (o.crew || !(o.adminEmail && o.adminEmail(a.email))) && (!text || String(a.email).toLowerCase().includes(text)));
  const rows = list.map(a => {
    const u = per.get(a.user_id) || { searches: 0, tasks: 0, clickouts: 0, last: null, source: null, method: null, newsletter: false };
    return { user_id: a.user_id, email: a.email, first_seen: a.created_at, first_source: u.source || "", method: u.method || "", newsletter: !!(a.marketing_consent === true || u.newsletter), searches: u.searches, tasks: u.tasks, clickouts: u.clickouts, last_seen: u.last || a.created_at };
  }).sort((x, y) => (x.last_seen < y.last_seen ? 1 : -1));
  return { rows: rows.slice(0, 1000), total: rows.length, capped: ev.length >= 60000, since: SINCE };
}

// One person's whole journey: every event linked to the account (sign-in links the earlier anonymous visits), oldest first.
export async function userJourney(env, userId) {
  if (!/^[0-9a-f-]{36}$/i.test(String(userId || ""))) return { events: [], anon: "" };
  const [ev, acct] = await Promise.all([
    readCapped(env, `analytics_events?user_id=eq.${userId}&select=ts,product,surface,name,props,region_class,consent,browser_family,device_class,ref_domain,utm_source,utm_medium,utm_campaign,launch_wave,internal,is_bot,user_id,vin&order=ts.asc`, 500),
    readCapped(env, `accounts?user_id=eq.${userId}&select=email`, 1).catch(() => []),
  ]);
  return { anon: (acct[0] && acct[0].email) || "this account", events: ev.map(e => ({ ...e, user_id: "signed in" })) };
}

// ---- PEOPLE (Lane D, Oct 29 2026): one row per person, signed in (by email) or not yet (by visitor id), newest first. READ ONLY, from events already
// stored (page_view, search_run, task_created, standing_arm, signin); no new tracking. The person is the account when any of the visitor's events carries one
// (the sign-in link stamps the earlier anonymous ones), and a later anonymous event from the same browser is folded into that person, not listed twice.
// o: { who: "signed_in" | "anonymous", source, text, crew, adminEmail(email) => bool }
const PEOPLE_EV = "page_view,search_run,task_created,standing_arm,signin";
const isWatch = e => e.name === "standing_arm" && e.control !== "task" && e.outcome !== "refused";
export function groupPeople(ev) {
  const toUser = new Map();
  for (const e of ev) if (e.anon_id && e.user_id && !toUser.has(e.anon_id)) toUser.set(e.anon_id, e.user_id);
  const per = new Map();
  for (const e of ev) {
    const k = e.user_id || (e.anon_id && toUser.get(e.anon_id)) || e.anon_id; if (!k) continue;
    const u = per.get(k) || { key: k, signed_in: !!(e.user_id || toUser.has(e.anon_id)), first: e.ts, last: e.ts, source: null, device: "", searches: 0, tasks: 0, watches: 0, last_search: "" };
    if (e.ts < u.first) u.first = e.ts; if (e.ts > u.last) u.last = e.ts;
    if (!u.device && e.device_class) u.device = e.device_class;
    if (e.name === "page_view" && !u.source) u.source = e.utm_source ? "utm " + e.utm_source : (e.ref_domain || "direct");
    else if (e.name === "search_run") { u.searches++; u.last_search = e.text || u.last_search; }
    else if (e.name === "task_created") u.tasks++;
    else if (isWatch(e)) u.watches++;
    per.set(k, u);
  }
  return per;
}
export async function peoplePanel(env, o) {
  const ev = await readCapped(env, `analytics_events?name=in.(${PEOPLE_EV})&ts=gte.${enc(SINCE)}&is_bot=eq.false${internalFilter(o.crew)}&or=(anon_id.not.is.null,user_id.not.is.null)&select=ts,name,anon_id,user_id,device_class,ref_domain,utm_source,text:props->>query_text,control:props->>control,outcome:props->>outcome&order=ts.asc`, 60000);
  const per = groupPeople(ev);
  const signed = o.who !== "anonymous";
  const emails = await emailsFor(env, [...per.values()].filter(u => u.signed_in).map(u => u.key));
  const text = clean(o.text, 60).toLowerCase(), src = clean(o.source, 40).toLowerCase();
  let list = [...per.values()].filter(u => u.signed_in === signed);
  if (signed) list = list.filter(u => { const em = emails.get(u.key); return em && (o.crew || !(o.adminEmail && o.adminEmail(em))); });
  if (src) list = list.filter(u => String(u.source || "").toLowerCase().includes(src));
  if (text) list = list.filter(u => String(signed ? emails.get(u.key) : u.key).toLowerCase().includes(text));
  const rows = list.map(u => ({ person: signed ? emails.get(u.key) : u.key, id: u.key, signed_in: signed, first_source: u.source || "", device: u.device || "", first_seen: u.first, last_seen: u.last,
    searches: u.searches, tasks: u.tasks, watches: u.watches, last_search: u.last_search || "" })).sort((a, b) => (a.last_seen < b.last_seen ? 1 : -1));
  return { rows: rows.slice(0, 1000), total: rows.length, who: signed ? "signed_in" : "anonymous", capped: ev.length >= 60000, since: SINCE };
}

// One person's searches and actions in order. id: an account id (signed in) or a visitor id.
const PAGE = { buy: "Find", market_check: "Market Check", sell: "Sell" };
export async function personDrill(env, id) {
  const isUser = /^[0-9a-f-]{36}$/i.test(String(id || "")), isAnon = /^[A-Za-z0-9_-]{16,40}$/.test(String(id || ""));
  if (!isUser && !isAnon) return { rows: [], who: "" };
  const sel = "select=ts,name,product,anon_id,device_class,ref_domain,utm_source,text:props->>query_text,car:props->>vehicle_key,answer_type:props->>answer_type,control:props->>control,outcome:props->>outcome,kind:props->>kind&order=ts.asc";
  const names = `name=in.(${PEOPLE_EV})`;
  let ev = await readCapped(env, `analytics_events?${isUser ? `user_id=eq.${id}` : `anon_id=eq.${id}`}&${names}&is_bot=eq.false&${sel}`, 1000);
  if (isUser) {   // the person's later events from the same browsers carry no account; fold them in by visitor id
    const anons = [...new Set(ev.map(e => e.anon_id).filter(Boolean))].slice(0, 10);
    if (anons.length) { const more = await readCapped(env, `analytics_events?anon_id=in.(${anons.join(",")})&user_id=is.null&${names}&is_bot=eq.false&${sel}`, 1000).catch(() => []); ev = ev.concat(more).sort((a, b) => (a.ts < b.ts ? -1 : 1)); }
  }
  const acct = isUser ? await emailsFor(env, [id]) : new Map();
  const first = ev.find(e => e.name === "page_view");
  const rows = [];
  for (const e of ev) {
    if (e.name === "search_run") rows.push({ ts: e.ts, what: "Search", page: PAGE[e.product] || e.product || "", text: e.text || "", car: e.car ? String(e.car).replace("|", " ") : "", result: OUTCOME_LABEL[e.answer_type] || String(e.answer_type || ""), detail: "" });
    else if (e.name === "task_created") rows.push({ ts: e.ts, what: "Task started", page: "", text: "", car: e.car ? String(e.car).replace("|", " ") : "", result: "", detail: e.kind || "" });
    else if (e.name === "standing_arm") rows.push({ ts: e.ts, what: e.control === "task" ? "Task arm" : "Watch", page: "", text: "", car: "", result: e.outcome || "", detail: e.control || "" });
    else if (e.name === "signin") rows.push({ ts: e.ts, what: "Signed in", page: "", text: "", car: "", result: "", detail: "" });
  }
  return { who: isUser ? ((acct.get(id)) || "this account") : id, signed_in: isUser, first_source: first ? (first.utm_source ? "utm " + first.utm_source : (first.ref_domain || "direct")) : "", device: (ev.find(e => e.device_class) || {}).device_class || "", rows };
}
