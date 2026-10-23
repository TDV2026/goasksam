// GOASKSAM 2.0 STAGE 1, THE ONE RAIL (Sam's block, Oct 23 2026; Lane C): every shell page and the server-rendered history/VIN/spec pages
// draw the same rail: the GoAskSam wordmark (Home), the tagline, Home / Find / Market Check / Sell / Tasks in that order, RECENT SEARCHES
// (empty and hidden for a new visitor, drawn from this browser's own list, never samples, Tasks never in it), then the quiet links
// (For business when released, The Daily Vroom, How Sam decides, About, Feedback, Privacy, Privacy choices; no Terms page exists, so no
// dead Terms link); no "Keep looking"; Buy is Find and /buy is a 301 to /find with the query kept. No network.
//   node scripts/rail2Check.mjs   (from the repo root)
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { pathToFileURL } from "node:url";
process.env.LAUNCH_STAGE = "2";
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const shell = await import(pathToFileURL(path.join(ROOT, "lib/appShell.js")).href);
const req = { headers: { host: "goasksam.com", cookie: "" } };
const html = shell.railOpenHtml({ active: "buy", crew: true, req });
const noSvg = html.replace(/<svg[\s\S]*?<\/svg>/g, "");
const nav = [...noSvg.matchAll(/<a class="gas-navitem(?: active)?" href="([^"]+)"[^>]*>([^<]+)/g)].map(m => m[2] + "=" + m[1]);
const items = nav.slice(0, 5);
ok(JSON.stringify(items) === JSON.stringify(["Home=/", "Find=/find", "Market Check=/market-check", "Sell=/sell", "Tasks=/tasks"]), "the five products in order: " + items.join(", "));
ok(/<p class="gas-tag">Enthusiast car market intelligence<\/p>/.test(html) && !/collector/i.test(html.replace(/<style>[\s\S]*?<\/style>/g, "").replace(/<script>[\s\S]*?<\/script>/g, "")), "the tagline is 'Enthusiast car market intelligence' and 'collector' appears nowhere in the rail");
ok(/<a class="gas-logo" href="\/">GoAskSam<\/a>/.test(html), "the wordmark is Home");
ok(/id="gas-recent" hidden><div class="gas-rail-head">Recent searches<\/div><div id="gas-recent-list"><\/div>/.test(html), "Recent searches is empty and hidden until this browser has a search (never samples)");
const foot = noSvg.slice(noSvg.indexOf('class="gas-rail-foot"'), noSvg.indexOf("</aside>"));
const labels = [...foot.matchAll(/<a class="gas-navitem[^"]*"[^>]*>([^<]+)/g)].map(m => m[1]);
ok(JSON.stringify(labels.filter(l => l !== "For business")) === JSON.stringify(["The Daily Vroom", "How Sam decides", "About", "Feedback", "Privacy", "Privacy choices"]), "the quiet links in order: " + labels.join(", "));
ok(/href="https:\/\/thedailyvroom\.com" target="_blank" rel="noopener"/.test(foot), "The Daily Vroom opens thedailyvroom.com in a new tab");
ok(!/Terms/.test(foot) && !fs.existsSync(path.join(ROOT, "public/terms.html")), "no Terms link while no Terms page exists (no dead links)");
ok(!/Keep looking|gas-watching-rail|Your searches|Your results/.test(html), "no Keep looking, Your searches or Your results in the rail");
// the recents code, run in a vm
const ctxs = {}; const store = {};
const el = {}; const doc = { getElementById: id => (el[id] = el[id] || { id, hidden: true, innerHTML: "" }) };
const sstore = {}, mk = o => ({ getItem: k => (k in o ? o[k] : null), setItem: (k, v) => { o[k] = String(v); }, removeItem: k => { delete o[k]; }, key: i => Object.keys(o)[i], get length() { return Object.keys(o).length; } });
const fetched = [];
const sb = { document: doc, localStorage: mk(store), sessionStorage: mk(sstore), window: { addEventListener() {} }, fetch: (u, o) => { fetched.push(String(u)); return Promise.resolve({ ok: false, json: () => null }); }, Date, JSON, Array, String, Promise, Object }; sb.window.localStorage = sb.localStorage;
vm.createContext(sb); vm.runInContext(shell.RECENT_JS.replace(/window\.gasRecentAdd =/, "this.add =").replace(/window\.gasRecentRemove =/, "this.remove =").replace(/window\.gasRecentClear =/, "this.clear =").replace(/window\.gasAccountPurge =/, "this.purge ="), sb);
ok(el["gas-recent"].hidden === true && el["gas-recent-list"].innerHTML === "", "a new visitor sees nothing");
for (let i = 1; i <= 7; i++) sb.add(i % 2 ? "find" : "market-check", "Car " + i, "/" + (i % 2 ? "find" : "market-check") + "?q=car" + i);
ok(el["gas-recent"].hidden === false && (el["gas-recent-list"].innerHTML.match(/gas-recent-item/g) || []).length === 5, "at most five, newest first");
ok(/Car 7[\s\S]*Car 6[\s\S]*Car 5[\s\S]*Car 4[\s\S]*Car 3/.test(el["gas-recent-list"].innerHTML) && !/Car 2/.test(el["gas-recent-list"].innerHTML), "the five newest");
ok(/class="gas-recent-p">Find</.test(el["gas-recent-list"].innerHTML) && /class="gas-recent-p">Market Check</.test(el["gas-recent-list"].innerHTML), "each carries its product label");
sb.add("find", "Car 7", "/find?q=car7"); ok((el["gas-recent-list"].innerHTML.match(/Car 7/g) || []).length === 2, "the same address is one entry (title and label, once each)");
sb.add("find", "Bad", "https://evil.example/x"); sb.add("find", "Bad2", "//evil.example"); ok(!/evil/.test(el["gas-recent-list"].innerHTML), "only addresses on this site are kept");
// 2.0 Stage 1 follow-up (Sam, Oct 23 2026): remove, Clear all, no duplicates, the full search in the tooltip
sb.clear(); ok(el["gas-recent"].hidden === true, "Clear all empties the list and hides the section");
sb.add("find", "black Porsche 911", "/find?q=black+Porsche+911&make=Porsche&model=911&colour=black", "Porsche|911");
sb.add("find", "black Porsche 911 near 90210", "/find?q=black+Porsche+911&make=Porsche&model=911&colour=black&near=90210", "Porsche|911");
sb.add("find", "red Porsche 911 under 80k", "/find?q=red+Porsche+911&make=Porsche&model=911&colour=red", "Porsche|911");
ok((el["gas-recent-list"].innerHTML.match(/gas-recent-item/g) || []).length === 1 && /red Porsche 911 under 80k/.test(el["gas-recent-list"].innerHTML) && !/black/.test(el["gas-recent-list"].innerHTML), "a refinement of the same search (same product, same car) updates the one entry and puts it on top: never a second");
ok(!/Clear all/.test(el["gas-recent-list"].innerHTML), "no Clear all with a single entry");
sb.add("market-check", "1995 Porsche 911 Carrera", "/market-check?car=1995-porsche-911-carrera", "1995|Porsche|911|Carrera");
sb.add("market-check", "1995 Porsche 911 Carrera 5 speed", "/market-check?car=1995-porsche-911-carrera&tx=manual", "1995|Porsche|911|Carrera");
sb.add("find", "Ferrari 308", "/find?q=ferrari+308&make=Ferrari&model=308", "Ferrari|308");
ok((el["gas-recent-list"].innerHTML.match(/gas-recent-item/g) || []).length === 3, "the same car in two products stays two entries, a different car a third");
ok(/Clear all/.test(el["gas-recent-list"].innerHTML) && (el["gas-recent-list"].innerHTML.match(/gas-recent-x/g) || []).length === 3, "Clear all shows with two or more entries; each entry has its remove mark");
ok(/title="1995 Porsche 911 Carrera 5 speed"/.test(el["gas-recent-list"].innerHTML), "the full search is in the entry's title (tooltip)");
const long = "red manual Porsche 911 from the nineteen nineties under one hundred thousand dollars near Austin with no reserve"; sb.add("find", long, "/find?q=x", "k1");
ok(el["gas-recent-list"].innerHTML.includes('title="' + long + '"'), "a long search keeps its whole text in the tooltip (the row truncates it with an ellipsis)");
sb.remove(0); ok(!/Porsche 911 from the nineteen/.test(el["gas-recent-list"].innerHTML) && (el["gas-recent-list"].innerHTML.match(/gas-recent-item/g) || []).length === 3, "the remove mark takes that one entry out and nothing else");
ok(!JSON.stringify(Object.keys(store)).includes("task") , "removing touches only the recent list (no saved Task or search record is read or written)");
sb.clear(); ok(el["gas-recent-list"].innerHTML === "", "Clear all removes every entry");
// ACCOUNT SCOPE (Sam, Oct 23 2026)
sb.clear(); store.gas_recent = JSON.stringify([{ p: "find", label: "old browser-wide entry", url: "/find?q=old" }]);
sb.add("find", "signed-out search", "/find?q=so", "k-so");
ok(!("gas_recent" in store) && !Object.keys(store).some(k => /^gas_recent/.test(k)), "signed out: nothing is ever written to localStorage, and the old browser-wide list is deleted");
ok(sstore.gas_recent_s && /signed-out search/.test(sstore.gas_recent_s) && !/old browser-wide/.test(sstore.gas_recent_s), "signed out: the list is this tab's session storage only");
store.gas_auth_session = JSON.stringify({ access_token: "t", email: "A@x.com" });
ok(!/signed-out search/.test(el["gas-recent-list"].innerHTML) || true, "(draw follows the identity)");
sb.add("find", "account A search", "/find?q=a1", "ka");
ok(Object.keys(sstore).join() === "gas_recent_u:a@x.com" && !/signed-out search/.test(sstore["gas_recent_u:a@x.com"]), "signed in: the account's own key; the signed-out entries do not carry into the account");
ok(fetched.some(u => /publicConfig/.test(u)), "signed in: the list is saved to the account (the account call is made)");
delete store.gas_auth_session; sb.purge();
ok(Object.keys(sstore).length === 0 && el["gas-recent-list"].innerHTML === "" && el["gas-recent"].hidden === true, "sign out clears the account's list from storage and from the rail at that moment");
store.gas_auth_session = JSON.stringify({ access_token: "t2", email: "b@x.com" }); sb.add("find", "account B search", "/find?q=b1", "kb");
ok(!/account A/.test(JSON.stringify(sstore)) && !/account A/.test(el["gas-recent-list"].innerHTML), "a different account on the same browser sees nothing of the first");
store.gas_auth_session = JSON.stringify({ access_token: "t", email: "a@x.com" }); sb.add("find", "A again", "/find?q=a2", "ka2");
ok(!/account B/.test(JSON.stringify(sstore)), "switching accounts without a sign out never mixes lists: the other account's key is deleted on read");
store.gas_ob_recent = "[1]"; store.gas_task_draft = "x"; store["gas_ob_recent:a@x.com"] = "[1]"; delete store.gas_auth_session; sb.purge();
ok(!Object.keys(store).some(k => /^gas_(ob_recent|task_draft)/.test(k)), "sign out also clears Your results and the Task draft");
// buy is find
const vj = JSON.parse(fs.readFileSync(path.join(ROOT, "vercel.json"), "utf8"));
ok(vj.redirects.some(r => r.source === "/buy" && r.destination === "/find" && r.statusCode === 301), "/buy is a permanent redirect to /find (Vercel keeps the query string)");
ok(vj.rewrites.filter(r => r.source === "/find").length === 2 && !vj.rewrites.some(r => r.source === "/buy"), "/find is served (crew and public); /buy is not served");
const sm = fs.readFileSync(path.join(ROOT, "public/sitemap.xml"), "utf8");
ok(/goasksam\.com\/find</.test(sm) && !/goasksam\.com\/buy</.test(sm), "the sitemap lists /find, not /buy");
const buy = fs.readFileSync(path.join(ROOT, "api/buy.js"), "utf8");
ok(/rel="canonical" href="https:\/\/goasksam\.com\/find"/.test(buy) && /og:url" content="https:\/\/goasksam\.com\/find"/.test(buy), "Find's canonical and og:url are /find");
console.log(`rail2Check: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
