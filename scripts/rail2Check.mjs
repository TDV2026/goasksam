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
const nav = [...html.matchAll(/<a class="gas-navitem(?: active)?" href="([^"]+)"[^>]*>([^<]+)/g)].map(m => m[2] + "=" + m[1]);
const items = nav.slice(0, 5);
ok(JSON.stringify(items) === JSON.stringify(["Home=/", "Find=/find", "Market Check=/market-check", "Sell=/sell", "Tasks=/tasks"]), "the five products in order: " + items.join(", "));
ok(/<p class="gas-tag">Enthusiast car market intelligence<\/p>/.test(html) && !/collector/i.test(html.replace(/<style>[\s\S]*?<\/style>/g, "").replace(/<script>[\s\S]*?<\/script>/g, "")), "the tagline is 'Enthusiast car market intelligence' and 'collector' appears nowhere in the rail");
ok(/<a class="gas-logo" href="\/">GoAskSam<\/a>/.test(html), "the wordmark is Home");
ok(/id="gas-recent" hidden><div class="gas-rail-head">Recent searches<\/div><div id="gas-recent-list"><\/div>/.test(html), "Recent searches is empty and hidden until this browser has a search (never samples)");
const foot = html.slice(html.indexOf('class="gas-rail-foot"'), html.indexOf("</aside>"));
const labels = [...foot.matchAll(/<a class="gas-navitem[^"]*"[^>]*>([^<]+)/g)].map(m => m[1]);
ok(JSON.stringify(labels.filter(l => l !== "For business")) === JSON.stringify(["The Daily Vroom", "How Sam decides", "About", "Feedback", "Privacy", "Privacy choices"]), "the quiet links in order: " + labels.join(", "));
ok(/href="https:\/\/thedailyvroom\.com" target="_blank" rel="noopener"/.test(foot), "The Daily Vroom opens thedailyvroom.com in a new tab");
ok(!/Terms/.test(foot) && !fs.existsSync(path.join(ROOT, "public/terms.html")), "no Terms link while no Terms page exists (no dead links)");
ok(!/Keep looking|gas-watching-rail|Your searches|Your results/.test(html), "no Keep looking, Your searches or Your results in the rail");
// the recents code, run in a vm
const ctxs = {}; const store = {};
const el = {}; const doc = { getElementById: id => (el[id] = el[id] || { id, hidden: true, innerHTML: "" }) };
const sb = { document: doc, localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } }, window: { addEventListener() {} } }; sb.window.localStorage = sb.localStorage;
vm.createContext(sb); vm.runInContext(shell.RECENT_JS.replace(/window\.gasRecentAdd =/, "this.add =").replace(/window\.addEventListener/g, "window.addEventListener"), sb);
ok(el["gas-recent"].hidden === true && el["gas-recent-list"].innerHTML === "", "a new visitor sees nothing");
for (let i = 1; i <= 7; i++) sb.add(i % 2 ? "find" : "market-check", "Car " + i, "/" + (i % 2 ? "find" : "market-check") + "?q=car" + i);
ok(el["gas-recent"].hidden === false && (el["gas-recent-list"].innerHTML.match(/gas-recent-item/g) || []).length === 5, "at most five, newest first");
ok(/Car 7[\s\S]*Car 6[\s\S]*Car 5[\s\S]*Car 4[\s\S]*Car 3/.test(el["gas-recent-list"].innerHTML) && !/Car 2/.test(el["gas-recent-list"].innerHTML), "the five newest");
ok(/class="gas-recent-p">Find</.test(el["gas-recent-list"].innerHTML) && /class="gas-recent-p">Market Check</.test(el["gas-recent-list"].innerHTML), "each carries its product label");
sb.add("find", "Car 7", "/find?q=car7"); ok((el["gas-recent-list"].innerHTML.match(/Car 7/g) || []).length === 2, "the same address is one entry (title and label, once each)");
sb.add("find", "Bad", "https://evil.example/x"); sb.add("find", "Bad2", "//evil.example"); ok(!/evil/.test(el["gas-recent-list"].innerHTML), "only addresses on this site are kept");
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
