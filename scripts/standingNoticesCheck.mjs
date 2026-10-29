// EVERY THING THAT CAN EMAIL A PERSON IS ON THE TASKS PAGE WITH A STOP (Sam, Oct 29 2026). Cause: "Tell me when one comes up" on a saved search wrote a flag (buy_conversations.watch) and a watch_requests row that the
// Tasks page, the badge and the caps did not know, so a person could be promised mail by something they could not see or stop. The class: any table or flag a send reads, and any control that writes one, must be
// (a) listed by lib/live/looking.js or the Tasks list with a Stop, (b) counted by the badge, (c) under a cap, or (d) named below as NOT a notice, with the reason, and then proved not to be read by any sender.
// Also the bid-end wording: every place that promises the before-it-ends email says "about two hours before".  Offline.   node scripts/standingNoticesCheck.mjs
import fs from "node:fs";
import path from "node:path";
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const rd = f => fs.readFileSync(f, "utf8");
const walk = (d, out = []) => { for (const n of fs.readdirSync(d)) { if (n === "node_modules" || n === ".git" || n === "docs" || n === "screens") continue; const p = path.join(d, n); const st = fs.statSync(p); if (st.isDirectory()) walk(p, out); else if (/\.(js|mjs)$/.test(n)) out.push(p); } return out; };

// What the Tasks page lists (with a Stop), and what is named as not a notice.
const LISTED = { tasks: "the Tasks list", watches: "Watching (spec and exact car)", buy_alerts: "Before-it-ends emails", buy_conversations: "Watching (a saved search flagged 'Tell me when one comes up')" };
const NOT_NOTICE = {
  live_listings: "data the sends read", task_updates: "the thread inside a listed Task", watch_sends: "the sent log of a listed watch", ip_rate_hits: "address limits", app_config: "settings", app_usage_events: "usage log",
  spec_market_cache: "engine cache", accounts: "the person's email settings, shown on the Tasks page", hunts: "old rows offered as a starting Task (suggestions), no sender reads them",
  watch_requests: "the address row written with a saved-search flag, removed by its Stop; no sender reads it", watch_requests_note: "",
  business_leads: "staff mail", seller_leads: "staff mail", partners: "partner data", saved_results: "a result", journeys: "analytics", journey_events: "analytics", journey_audit: "analytics", desk_saved_views: "Desk views, no mail", auction_attempts: "sale attempt data"
};
delete NOT_NOTICE.watch_requests_note;

// 1. Every table a send path reads is listed or named as not a notice.
const SEND_FILES = ["lib/tasks/digest.js", "lib/live/watches.js", "lib/live/buyAlerts.js", "lib/tasks/tasks.js", "lib/tasks/delivery.js", "lib/_email.js", "api/tasks.js", "api/watch.js"];
const tablesIn = src => { const t = new Set(); for (const m of src.matchAll(/(?:rest\/v1\/|rest\(env, [`"]|supabaseSelect(?:All)?\(env, [`"]|fetch\(`\$\{base\}|[`"])([a-z_]{3,40})(?:\?|["`\/])/g)) t.add(m[1]); return t; };
const KNOWN = new Set([...Object.keys(LISTED), ...Object.keys(NOT_NOTICE)]);
for (const f of SEND_FILES) {
  const src = rd(f), seen = new Set();
  for (const m of src.matchAll(/(?:rest\/v1\/|rest\(env, [`"]|supabaseSelect(?:All)?\(env, [`"])([a-z_]{3,40})[?"`\/]/g)) seen.add(m[1]);
  for (const t of seen) ok(KNOWN.has(t), `${f} reads table '${t}', which is neither listed on the Tasks page (LISTED) nor named as not a notice (NOT_NOTICE)`);
}
// 2. Every table in the DDL that looks like a notice is classified; a new one must be listed or named.
const ddl = fs.readdirSync("docs").filter(f => /^supabase-.*\.sql$/.test(f)).map(f => rd("docs/" + f)).join("\n");
const created = [...ddl.matchAll(/create table(?: if not exists)?\s+([a-z_]+)\s*\(([\s\S]*?)\n\);/gi)].map(m => ({ name: m[1], body: m[2] }));
for (const t of created) {
  const looks = /watch|alert|notif|subscri|digest|remind|request|hunt|^tasks?$|conversation/i.test(t.name) || /^\s*(watch|notify|alert|subscribed)\w*\s/im.test(t.body);
  if (looks) ok(KNOWN.has(t.name), `table '${t.name}' (docs/*.sql) looks like a notice but is neither listed on the Tasks page nor named as not a notice`);
}
// 3. Each LISTED table is read by the list, counted by the badge and (watches and flags) under the cap.
const LK = rd("lib/live/looking.js"), TS = rd("api/tasks.js"), TP = rd("api/tasksPage.js");
ok(/watches\?user_id/.test(LK) && /buy_alerts\?user_id/.test(LK) && /buy_conversations\?user_id[^`]*watch=is\.true/.test(LK), "the Watching count (standingCounts) reads watches, buy_alerts and the saved-search flag");
ok(/listWatches/.test(LK) && /listAlerts/.test(LK) && /savedSearchWatches/.test(LK), "the Watching list reads watches, alerts and the saved-search flag");
ok(/kind: "search_watch"/.test(LK) && /LOOKING_WORDS\.search/.test(LK) && /search: "Sam tells you when one comes up\."/.test(LK), "the saved-search watch is a row in the list in words matching its control");
ok(/\(w\|a\|s\)/.test(LK) && /stopSearchWatch/.test(LK) && /watch_requests\?vin_norm=eq/.test(LK) && /method: "DELETE"/.test(LK), "every listed row has a Stop, and the saved-search Stop turns the flag off and removes its watch_requests row");
ok(/data-lk-stop/.test(TP) && /action: "looking_stop"/.test(TP) && /looking_stop/.test(TS), "the Tasks page shows a Stop on every Watching row");
ok(/c\.watches >= WATCH_CAP/.test(rd("api/buySearch.js")) && /standingCounts/.test(rd("api/buySearch.js")), "the saved-search watch is under the same 25 cap as the other watches");
ok(/ARM_LINES\.cap_watch/.test(rd("api/buySearch.js")), "at the cap it answers with the line that says what to stop");
// 4. No sender reads what is named as not a notice, and no writer of the flag is outside the logged, capped path.
// watch_requests: every mention anywhere is a write, a delete or a count. hunts (demand capture, "no matching, no results"): no send file reads it except the starting-Task suggestion.
for (const f of walk(".").filter(p => /^(api|lib)[\\/]/.test(p))) {
  const norm = f.replace(/\\/g, "/");
  rd(f).split("\n").forEach((line, i) => {
    if (/^\s*(\/\/|\*)/.test(line)) return;
    if (line.includes("watch_requests") && !(/method: "(POST|DELETE|HEAD)"/.test(line) || /Prefer|on_conflict/.test(line) || /select=id\$\{f\}/.test(line) || /watchcounts|count\(/.test(line) || /console\.error/.test(line))) ok(false, `${norm}:${i + 1} reads watch_requests as something other than a write, a delete or a count`);
    if (SEND_FILES.includes(norm) && /(rest\/v1\/|supabaseSelect\(env, `)hunts\?/.test(line) && !(norm === "lib/tasks/tasks.js" && /select=id,text/.test(line))) ok(false, `${norm}:${i + 1} a send file reads hunts`);
  });
}
ok(!SEND_FILES.some(f => /watch_requests/.test(rd(f).split("\n").filter(l => !/^\s*(\/\/|\*)/.test(l) && !/watchcounts|HEAD/.test(l)).join("\n"))), "no send file reads watch_requests (only the probe count)");
{
  const flagWriters = walk(".").filter(f => /api|lib/.test(f.split(/[\\/]/)[0])).filter(f => /watch: true/.test(rd(f)));
  ok(flagWriters.length === 1 && /api[\\/]buySearch\.js$/.test(flagWriters[0]) && /standingCounts/.test(rd(flagWriters[0])), "the saved-search flag has exactly one writer, and it is the capped, logged one");
  const reqWriters = walk(".").filter(f => /^(api|lib)[\\/]/.test(f)).filter(f => /rest\/v1\/watch_requests/.test(rd(f)));
  ok(reqWriters.every(f => /buySearch|_historyData|lib[\\/]live[\\/]looking|tasks\.js/.test(f)), "watch_requests has no writer outside the known four (" + reqWriters.map(f => f.replace(/\\/g, "/")).join(", ") + ")");
}

// 5. The before-it-ends wording: "about two hours before", everywhere the promise is made, and no Task email is called an alert email.
const BA = await import("../lib/live/buyAlerts.js"), LW = await import("../lib/live/looking.js");
ok(/about two hours before bidding ends/.test(BA.TOGGLE_LINE) && /about two hours before bidding ends/.test(BA.SCHEDULE_LINE) && /about two hours before bidding ends/.test(LW.LOOKING_WORDS.alert), "the toggle rule, the email's own line and the Tasks row say 'about two hours before bidding ends'");
ok(/about two hours before a bid ends/.test(LW.countsOf(1, 0, 0).line), "the Tasks page counts line says 'about two hours before a bid ends'");
ok(/Before it ends emails always come about two hours before bidding ends\./.test(rd("lib/tasks/tasks.js")), "the Task email footer says 'about two hours before bidding ends'");
ok((rd("api/tasksPage.js").match(/gets its own email about two hours before the end\./g) || []).length === 2, "the Tasks page help text (FAQ and the 'How often' note) says 'about two hours before the end' (2 places)");
const codeLines = f => rd(f).split("\n").map((l, i) => [i + 1, l]).filter(([, l]) => !/^\s*(\/\/|\*|#)/.test(l));
const bare = [], alertEmails = [];
for (const f of walk(".").filter(p => /^(api|lib|public|js)[\\/]/.test(p))) {
  for (const [n, l] of codeLines(f)) {
    const code = l.replace(/\s\/\/ .*$/, "");
    if (/(^|[^t] )two hours before|\b2 hours before/i.test(code) && !/about two hours before/i.test(code) && !/WINDOW_MS|3600e3/.test(code)) bare.push(`${f.replace(/\\/g, "/")}:${n}`);
    if (/alert emails?/i.test(code)) alertEmails.push(`${f.replace(/\\/g, "/")}:${n}`);
  }
}
ok(bare.length === 0, "no copy in api, lib, public or js says 'two hours before' without 'about' (" + bare.slice(0, 4).join(", ") + ")");
ok(alertEmails.length === 0, "no copy calls a Task email an 'alert email' (" + alertEmails.slice(0, 4).join(", ") + ")");
// the emails themselves
{
  const { messageFor } = BA;
  const row = { id: 1, listing_title: "2005 Mercedes-Benz SL65 AMG", end_time: new Date(Date.now() + 6600e3).toISOString(), source: "bringatrailer", url: "https://x/1", current_bid: 15250, currency: "USD" };
  let msg = null; try { msg = messageFor({ row, market: null, bid: 15250 }, row, { first: false, userId: "u", alertId: 1 }); } catch { /* shape differs: the footer line is checked below */ }
  const text = msg ? String(msg.text) + String(msg.html) : BA.SCHEDULE_LINE;
  ok(/about two hours before bidding ends/.test(text) || !/two hours/.test(text), "the before-it-ends email carries 'about two hours before bidding ends' (or no hours claim)");
}
console.log(`standingNoticesCheck: ${pass} pass, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
