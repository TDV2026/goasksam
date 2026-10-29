// ARRIVAL CHECK (Lane D, Oct 29 2026): the Daily Vroom launch email links to https://goasksam.com/?via=beehiiv. This proves that link is read
// as the visitor's source on every path that reads the address, and that the Launch tab shows the launch-day steps per source.
// Offline: no network, no site, no database.
import fs from "fs";
import vm from "vm";
import * as priv from "../lib/track/privacy.js";
const { pickUtm } = priv, UTM_READ = priv.UTM_READ || [];
import { helperJs } from "../api/track.js";
import { trackFromBrowser, setTrackSink, trackDrain } from "../lib/track/log.js";
import { PAGE_VIEW_JS } from "../lib/appShell.js";
import { build } from "../lib/admin/launch.js";

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };

// 1. the whitelist reads via as the source, never over a real utm_source, and only a plain word
ok(pickUtm("?via=beehiiv").utm_source === "beehiiv", "pickUtm: ?via=beehiiv is the source");
ok(pickUtm("?via=Beehiiv&x=1").utm_source === "beehiiv", "pickUtm: via is lower-cased, other parameters ignored");
ok(pickUtm("?utm_source=newsletter&via=beehiiv").utm_source === "newsletter", "pickUtm: a utm_source wins over via");
ok(pickUtm({ via: "beehiiv" }).utm_source === "beehiiv", "pickUtm: an object form too (what the browser sends)");
ok(pickUtm("?via=a b<script>").utm_source === null, "pickUtm: a via with odd characters is dropped");
ok(UTM_READ.includes("via"), "the browser reads via");

// 2. the browser helper, run for real on /?via=beehiiv, sends it, and the stored row carries it
const sent = [];
const sandbox = {
  location: { pathname: "/", search: "?via=beehiiv" }, document: { referrer: "", documentElement: { dataset: {} }, visibilityState: "visible" },
  navigator: {}, crypto: { randomUUID: () => "11111111-1111-4111-8111-111111111111" }, console, Blob: class { constructor(p) { this.t = p.join(""); } },
  addEventListener() {}, setTimeout, clearTimeout, URLSearchParams, Date, Math, JSON, Object, Array, Promise,
  fetch: async (u, o) => { if (String(u).includes("consent")) return { ok: true, json: async () => ({ consent: "not_required" }) }; sent.push(JSON.parse(o.body)); return { ok: true }; },
};
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(helperJs(), sandbox);
await new Promise(r => setTimeout(r, 900));
ok(sent.length > 0 && sent[0].page && sent[0].page.utm && sent[0].page.utm.via === "beehiiv", "helper on /?via=beehiiv sends via with the page view");
const rows = [];
setTrackSink(r => rows.push(r));
const res = { _h: {}, setHeader(k, v) { this._h[k] = v; }, getHeader(k) { return this._h[k]; } };
trackFromBrowser({ headers: { "user-agent": "Mozilla/5.0 (iPhone) Safari", cookie: "" } }, res, sent[0].events, sent[0].page);
await trackDrain();
setTrackSink(null);
const pvRow = rows.find(r => r.name === "page_view");
ok(pvRow && pvRow.utm_source === "beehiiv", "the stored page_view row has utm_source beehiiv");

// 3. the older first-touch script (lib/appShell.js) reads it too
{
  const box = { location: { search: "?via=beehiiv" }, document: { referrer: "" }, URLSearchParams };
  vm.createContext(box);
  const fn = PAGE_VIEW_JS.match(/function gasFirstTouch\(\)\{[\s\S]*?\n\}/)[0];
  const t = vm.runInContext("(" + fn.replace("function gasFirstTouch", "function") + ")()", box);
  ok(t && t.utm_source === "beehiiv", "gasFirstTouch on /?via=beehiiv gives utm_source beehiiv");
}

// 4. the class: every file that reads utm_source from an address also reads via
{
  const bad = [];
  const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? (["node_modules", ".git", "scripts", "docs", "proofs"].includes(e.name) ? [] : walk(d + "/" + e.name)) : [d + "/" + e.name]);
  for (const f of walk(".").filter(f => /\.(js|mjs)$/.test(f))) {
    const s = fs.readFileSync(f, "utf8");
    if (/\.get\(\\?["']utm_source\\?["']\)/.test(s) && !/\bvia\b/.test(s.replace(/\bvia\b\s*(?:the|an|a)\b/g, ""))) bad.push(f);
  }
  ok(bad.length === 0, "every file that reads utm_source from an address also reads via: " + bad.join(", "));
}

// 5. the Launch tab: per first source, the steps after the first search; searches before and after sign-in
{
  const t = m => new Date(Date.UTC(2026, 9, 29, 14, m)).toISOString();
  const pv = (anon, m, extra) => ({ ts: t(m), product: "site", anon_id: anon, session_id: "s" + anon, ref_domain: null, utm_source: null, utm_medium: null, device_class: "mobile", props: {}, ...extra });
  const run = (anon, m, product, at) => ({ ts: t(m), name: "search_run", product, anon_id: anon, session_id: "s" + anon, device_class: "mobile", props: { answer_type: at || "range", query_text: "x", vehicle_key: "porsche|911" } });
  const e = (anon, m, name, props) => ({ ts: t(m), name, product: "site", anon_id: anon, session_id: "s" + anon, device_class: "mobile", props: props || {} });
  const data = {
    pv: [pv("a", 0, { utm_source: "beehiiv" }), pv("b", 1, { utm_source: "beehiiv" }), pv("c", 2, { utm_source: "beehiiv" }), pv("d", 3)],
    ev: [run("a", 5, "market_check"), e("a", 6, "limit_hit", { limit: "device_cars_day" }), e("a", 7, "signin"), run("a", 8, "buy"), e("a", 9, "task_created"), e("a", 10, "standing_arm", { control: "watch_spec", outcome: "added" }),
      run("b", 5, "buy"), e("b", 6, "standing_arm", { control: "task", outcome: "added" }), e("b", 7, "standing_arm", { control: "alert", outcome: "refused" }),
      run("c", 5, "market_check")],
    mc: [], out: [], ocd: [], held: [],
  };
  const D = build(data, { from: t(0), to: t(60), key: "launch" });
  const s = D.sources.find(x => x.source === "utm: beehiiv");
  ok(s && s.visitors === 3 && s.asked === 3 && s.walled === 1 && s.signed_in === 1 && s.task === 1 && s.watch === 1, "Launch tab: beehiiv source shows 3 visitors, 3 asked, 1 limit, 1 signed in, 1 Task, 1 watch (a refused or Task arm is not a watch): " + JSON.stringify(s));
  const mcS = D.searchSplit.find(x => x.product === "market_check"), buyS = D.searchSplit.find(x => x.product === "buy");
  ok(mcS.anonymous === 2 && mcS.signed_in === 0 && buyS.anonymous === 1 && buyS.signed_in === 1, "Launch tab: searches before and after sign-in split by the first signin event: " + JSON.stringify(D.searchSplit));
}

// 6. the exact link in the newsletter: https://goasksam.com/?utm_source=beehiiv&utm_medium=email
{
  const LINK = "https://goasksam.com/?utm_source=beehiiv&utm_medium=email", u = pickUtm(LINK);
  ok(u.utm_source === "beehiiv" && u.utm_medium === "email", "the newsletter link is read as source beehiiv, medium email");
  const t = m => new Date(Date.UTC(2026, 9, 29, 14, m)).toISOString();
  const pv = anon => ({ ts: t(0), product: "site", anon_id: anon, session_id: "s" + anon, ref_domain: null, utm_source: u.utm_source, utm_medium: u.utm_medium, device_class: "desktop", props: {} });
  const ev = (anon, m, name, props) => ({ ts: t(m), name, product: "buy", anon_id: anon, session_id: "s" + anon, device_class: "desktop", props: props || {} });
  const D = build({ pv: [pv("x"), pv("y")], ev: [ev("x", 3, "search_run", { answer_type: "range", query_text: "x", vehicle_key: "a|b" }), ev("y", 3, "search_run", { answer_type: "range", query_text: "y", vehicle_key: "a|b" }), ev("y", 5, "signin")], mc: [], out: [], ocd: [], held: [] }, { from: t(0), to: t(60), key: "launch" });
  const s = D.sources.find(r => r.source === "utm: beehiiv");
  ok(s && s.visitors === 2 && s.asked === 2 && s.signed_in === 1, "Launch tab: 'utm: beehiiv' for a reader who lands and searches and for one who signs in afterwards (2 visitors, 2 asked, 1 signed in)");
  ok(!D.sources.some(r => r.source === "direct"), "neither reader is counted as direct");
}

console.log(`arrivalCheck: ${pass} pass, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
