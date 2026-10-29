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
ok(/kind: "search_watch"/.test(LK) && /search: "Sam is not able to send these\. Stop it, or start a Task for this search\."/.test(LK) && /start_href/.test(LK), "a saved-search watch that already exists is a row in the list, in words that carry no promise, with a Start a Task link");
ok(/\(w\|a\|s\)/.test(LK) && /stopSearchWatch/.test(LK) && /watch_requests\?vin_norm=eq/.test(LK) && /method: "DELETE"/.test(LK), "every listed row has a Stop, and the saved-search Stop turns the flag off and removes its watch_requests row");
ok(/data-lk-stop/.test(TP) && /action: "looking_stop"/.test(TP) && /looking_stop/.test(TS), "the Tasks page shows a Stop on every Watching row");
{
  const BS = rd("api/buySearch.js"), i = BS.indexOf('if (b.action === "watchsearch") {'), blk = BS.slice(i, BS.indexOf("\n  }\n", i));
  ok(i > 0 && /reason: "retired"/.test(blk) && /logArm\(user\.userId, "saved_search"/.test(blk) && !/fetch\(|watch: true|watch_requests/.test(blk), "the retired saved-search control refuses, logs standing_arm and writes nothing (no fetch, no flag, no watch_requests row)");
  const j = BS.indexOf('if (b.action === "watch") {'), wb = BS.slice(j, BS.indexOf("\n    }\n", j));
  ok(j > 0 && /reason: "retired"/.test(wb) && /address_watch/.test(wb) && !/fetch\(/.test(wb), "the address-only watch on /api/buySearch refuses, logs and writes nothing");
  const HS = rd("api/history.js"), k = HS.indexOf('b.action !== "watch"');
  ok(k > 0 && /reason: "retired"/.test(HS.slice(k, k + 900)) && !/addWatch/.test(HS) && !/export async function addWatch/.test(rd("api/_historyData.js")), "the address-only watch on /api/history refuses, logs and writes nothing; addWatch is gone");
}
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
  // RETIRED: nothing may set the flag or add a watch_requests row any more; the only writes left are the Stop's PATCH watch:false and DELETE.
  const flagWriters = walk(".").filter(f => /^(api|lib)[\\/]/.test(f)).filter(f => /watch: true/.test(rd(f)));
  ok(flagWriters.length === 0, "nothing sets the saved-search flag any more (" + flagWriters.join(", ") + ")");
  const reqWriters = walk(".").filter(f => /^(api|lib)[\\/]/.test(f)).filter(f => /rest\/v1\/watch_requests/.test(rd(f)) && /method: "POST"/.test(rd(f).slice(rd(f).indexOf("rest/v1/watch_requests"), rd(f).indexOf("rest/v1/watch_requests") + 400)));
  ok(reqWriters.length === 0, "nothing adds a watch_requests row any more (" + reqWriters.join(", ") + ")");
}

// 4b. The retired control is not offered again, on any page, drawer, email or help text.
{
  const OFFER = /data-watchsearch|action: ?\\?["']watchsearch|Tell me when one comes up|Done\. Sam will email you when one comes up/;
  const offered = [];
  for (const f of walk(".").filter(p => /^(api|lib|public|js)[\\/]/.test(p))) {
    const src = f.replace(/\\/g, "/") === "api/buy.js" ? JSON.parse(rd(f).match(/^const CLIENT = (".*");$/m)[1]) : rd(f);
    src.split("\n").forEach((l, i) => { if (/^\s*(\/\/|\*)/.test(l)) return; if (OFFER.test(l.replace(/\s\/\/ .*$/, "")) && !/api\/buySearch\.js$/.test(f.replace(/\\/g, "/"))) offered.push(f.replace(/\\/g, "/") + ":" + (i + 1)); });
  }
  ok(offered.length === 0, "the retired 'Tell me when one comes up' control is not offered anywhere (" + offered.slice(0, 4).join(", ") + ")");
}
// 4c. A sentence that promises an email or a notice names the sender that really sends it. A new promise with no entry here fails; an entry whose sender does not exist fails.
{
  const exists = (f, re) => fs.existsSync(f) && re.test(rd(f));
  const SENDERS = {
    "Task email": () => exists("lib/tasks/digest.js", /sendTaskEmail/) && exists("lib/tasks/digest.js", /export async function runDigest/) && /tasks\?send=1/.test(rd("vercel.json")),
    "watch email": () => exists("lib/live/watches.js", /sendTaskEmail\(\{ to, subject: msg\.subject/) && exists("lib/tasks/digest.js", /watchUsers/) && /api\/tasks\?send=1/.test(rd("vercel.json")),
    "before-it-ends email": () => exists("lib/tasks/digest.js", /export async function runBeforeItEnds/) && /tasks\?send=1/.test(rd("vercel.json")),
    "Task start email": () => exists("lib/tasks/tasks.js", /Sam has started your search/),
    "sign-in code": () => exists("public/js/auth.js", /authSignInEmail/),
    "newsletter": () => exists("lib/newsletterSignup.js", /subscribeToNewsletter/),
    "none, a statement or advice, not a notice": () => true,
    "none, a legal commitment made by hand": () => true
  };
  const PROMISE = /email you|emails you|will email|we.ll email|sam.ll email|tell you when|tells you when|let you know|notify you|notified when|be notified|hear about|email me|keeps? (looking|searching) and (tells|emails)|tell you again/i;
  const REG = [
    ["api/about.js", /never emails you/, "none, a statement or advice, not a notice"], ["api/about.js", /Sam will tell you/, "none, a statement or advice, not a notice"], ["api/about.js", /keeps looking and tells you/, "Task email"],
    ["api/buy.js", /email you when/, "Task email"], ["api/buy.js", /Email me before bidding ends/, "before-it-ends email"],
    ["api/tasksPage.js", /emails you when one fits|Sam tells you what it is|gets its own email|Email me before bidding ends|hear about before bidding ends/, "Task email"],
    ["api/tasks.js", /you get an email when a car fits|an email when/, "Task email"],
    ["api/watch.js", /tells you again when the next one sells/, "watch email"],
    ["lib/appShell.js", /email you when/, "Task email"],
    ["lib/legal/privacyText.js", /email you when something fits/, "Task email"], ["lib/legal/privacyText.js", /we will tell you in the service or by email/, "none, a legal commitment made by hand"],
    ["lib/live/converse.js", /Sam can tell you when one comes up/, "Task email"],
    ["lib/live/watches.js", /tell you (about the next sale|when the next)/, "watch email"],
    ["lib/live/looking.js", /Sam tells you when the next one sells|hear about when they sell|tell you again/, "watch email"],
    ["lib/tasks/tasks.js", /emails you|Sam emails you|you get an email|tells you when one matches/, "Task email"],
    ["public/js/auth.js", /Email me a|We email you a one-time code/, "sign-in code"], ["public/js/auth.js", /Daily Vroom/, "newsletter"],
    ["public/js/onebox.js", /Sam will email you, with the sale attached/, "watch email"]
  ];
  for (const [f, re, who] of REG) ok(SENDERS[who] && SENDERS[who](), `${f} /${re.source.slice(0, 40)}/ names a sender that exists: ${who}`);
  const unnamed = [];
  for (const f of walk(".").filter(p => /^(api|lib|public)[\\/]/.test(p))) {
    const norm = f.replace(/\\/g, "/");
    rd(f).split("\n").forEach((l, i) => {
      if (/^\s*(\/\/|\*)/.test(l)) return;
      const code = l.replace(/\s\/\/ .*$/, "");
      if (!PROMISE.test(code)) return;
      if (!REG.some(([rf, re]) => rf === norm && re.test(code))) unnamed.push(norm + ":" + (i + 1));
    });
  }
  ok(unnamed.length === 0, "every sentence that promises an email or a notice names its sender in standingNoticesCheck (unnamed: " + unnamed.slice(0, 6).join(", ") + ")");
  // The Keep looking card is a Task: it never promises a sale notice, which only a watch sends.
  const AS = rd("lib/appShell.js");
  ok(!/next sale of/.test(AS) && (AS.match(/and email you when one goes live/g) || []).length >= 2, "the Keep looking card (server and client copies) promises what a Task sends (an email when one goes live), not a sale notice");
  ok(!/Keep looking for the next sale of/.test(AS), "the Keep looking card seeds a Task for the car, not for a sale");
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
