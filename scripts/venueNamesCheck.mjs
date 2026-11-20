// A SOURCE KEY NEVER REACHES A PAGE (Lane S, Nov 19 2026; live fault: the Find card for the duPont Live Senna printed "dupontregistrylive" in its badge).
// CAUSE: houseName() (api/_historyData.js) passed any key it did not know straight through, and dupontregistrylive was not in its list. Five other maps held partial copies of their own (lib/onebox.js, lib/_email.js,
// lib/desk/execute.js, the Find page's client, the for sale card), so a venue had a different name, or none, depending on the page.
// FIX: lib/venueNames.js is the one map (all 20 vendor auction sources, the dealer and classified sources of data/forsaleSources.json); every page and email reads it; a key nobody named gives "" (left out), never the key.
// OTHER PAGES AND CARS THE CAUSE TOUCHES: every Find card badge and the See it on line, the Sold before line, Tasks and the Tasks email, the sale tiles and the sale modal, the VIN history line and its Live row, the What's new
// venue lines, the sell page's venue words, the Desk's venue columns, the lead email's platform line, the for sale cards. All of them take the name from this one function now.
// CLASS: (1) every source the product knows has a name in the one map, each name a real name; (2) no second map of source names exists in lib, api or the page; (3) the engine serves the name on each path (the live card, the
// earlier-sale line, the for sale card, the history line); (4) the real Find page, run in Chrome over the real search handler with a duPont Registry Live car, prints the name and no key anywhere a person can read.
// A tree without the fix fails (run against origin/main); --mutants breaks one rule at a time.
//   node scripts/venueNamesCheck.mjs [repo root]
import fs from "node:fs"; import path from "node:path"; import { spawnSync } from "node:child_process"; import { fileURLToPath, pathToFileURL } from "node:url";
const args = process.argv.slice(2), here = path.dirname(fileURLToPath(import.meta.url)), root = path.resolve(args.find(a => !a.startsWith("--")) || path.join(here, ".."));
if (args.includes("--mutants")) process.exit(mutants());
process.chdir(root);
let pass = 0, fail = 0; const ok = (n, c, d) => { if (c) pass++; else { fail++; console.log("FAIL " + n + (d !== undefined ? " " + JSON.stringify(d) : "")); } };
const imp = async p => { try { return await import(pathToFileURL(path.join(root, p)).href + "?v=" + Math.random()); } catch (e) { return { __error: String(e && e.message || e).slice(0, 120) }; } };
// the sources the product knows: the vendor's 20 auction sources (19 sold-result sources and duPont Registry Live), and the dealer and classified sources of data/forsaleSources.json
const AUCTION = ["bringatrailer", "carsandbids", "hagerty", "pcarmarket", "acc", "gooding", "rmsothebys", "hemmings", "sothebysmotorsport", "mbmarket", "autohunter", "barrettjackson", "mecum", "bonhams", "broadarrow", "carandclassic", "collectingcars", "themarket", "pistonheads", "dupontregistrylive"];
const FS = JSON.parse(fs.readFileSync(path.join(root, "data/forsaleSources.json"), "utf8")).sources, FSKEYS = Object.keys(FS);
const ALL = [...new Set([...AUCTION, ...FSKEYS])];
const V = await imp("lib/venueNames.js");
ok("lib/venueNames.js exists and loads (the one map)", !V.__error && typeof V.venueName === "function", V.__error);
const name = k => (V.venueName ? V.venueName(k) : null);
// 1 every source has a real name
ok("the vendor's auction sources number 20", AUCTION.length === 20 && new Set(AUCTION).size === 20);
ok("the dealer and classified sources number at least 17", FSKEYS.length >= 17, FSKEYS.length);
const missing = ALL.filter(k => !name(k)); ok("every source the product knows has a name in the one map", missing.length === 0, missing);
const bad = ALL.filter(k => { const n = name(k) || ""; return !n || /^[a-z0-9]+$/.test(n) || /[–—]/.test(n) || n.trim() !== n; }); ok("every name is a name, not a key (no all-lowercase run, no dash, no stray space)", bad.length === 0, bad.map(k => [k, name(k)]));
ok("no two sources share a name", new Set(ALL.map(k => (name(k) || "").toLowerCase().replace(/[^a-z0-9]/g, ""))).size === ALL.length);
ok("duPont Registry Live (the live fault) is named", name("dupontregistrylive") === "duPont Registry Live", name("dupontregistrylive"));
ok("a key written with other spelling gives the same name (BaT, Cars & Bids, All Collector Cars)", name("allcollectorcars") === name("acc") && name("Cars & Bids") === "Cars & Bids" && name("BRINGATRAILER") === "Bring a Trailer");
ok("a key nobody named gives nothing to print, never the key", name("zzzvendorsource") === "" && name("") === "" && name(null) === "");
ok("a value that is already a name passes through as it is", name("Bring a Trailer") === "Bring a Trailer" && name("Sotheby's Motorsport") === "Sotheby's Motorsport");
// lib/onebox.js is an ENGINE file: changing it needs the engine stamp bump (Lane B's lane-b-nextbump), so its name map moves in its own commit (branch lane-s-venue-names-onebox) after the Nov 22 launch.
// Until then it keeps its own PLATFORM_NAMES (the engine's answers print the old form for Gooding); this flag is the one place that says so, and the check asserts the pending state is whole (never half-moved).
const ONEBOX_WAITS_FOR_STAMP = true;
// 2 no second map: a file (outside the one map) that holds three or more known keys each paired with a NAME (a capitalised string) is a second map of names. The few that stay are not maps a page prints from, and each says why.
const STAYS = {
  "lib/desk/measures.js": "the stored archive label the Desk's venue filter queries on (platform=eq.<label>), never printed",
  "api/usageDashboard.js": "the ops endpoint's own queries and crew-only ops text, no page",
  "lib/ops/depthProbe.js": "the depth probe's own table (ops, no page)",
  "lib/onebox.js": "OB_NAMED: the four venues a count line names; every other source is counted as others, never named, never a key",
  "public/js/result-copy.js": "the Sell result's own editorial names for the 8 routable platforms; it returns a generic phrase for a key it does not know (never a key)",
  "public/js/onebox.js": "OB_PLAT of the One Box page; a key it does not know is left out (obPlat), never printed",
  "lib/live/marketCheckExamples.js": "short marks keyed by a venue NAME (BaT, C&B), not by a key"
};
{ const KEYRE = new RegExp("(?:^|[^a-z0-9])(?:" + ALL.join("|") + ")\\\\?[\"']?\\s*:\\s*\\\\?[\"'][A-Z][^\"'\\\\]*", "g"); const files = [];
  const walk = d => { for (const e of fs.readdirSync(path.join(root, d), { withFileTypes: true })) { const p = d + "/" + e.name; if (e.isDirectory()) { if (!/node_modules|^\.|proofs|docs|fixtures/.test(e.name)) walk(p); } else if (/\.(js|mjs)$/.test(e.name)) files.push(p); } };
  for (const d of ["lib", "api", "public"]) if (fs.existsSync(path.join(root, d))) walk(d);
  const second = files.filter(p => p !== "lib/venueNames.js" && !STAYS[p] && ((fs.readFileSync(path.join(root, p), "utf8").match(KEYRE) || []).length >= 3));
  ok("no second map of source names in lib, api or the page (the few that stay are listed with their reason)", second.length === 0, second);
  const guards = fs.readFileSync(path.join(root, "public/js/onebox.js"), "utf8"); ok("the One Box page's venue helper leaves out a key it does not know", /\^\[a-z0-9_\.-\]\+\$\/\.test\(String\(s \|\| ""\)\) \? ""/.test(guards)); }
// 2b the OLD FORMS (Sam, Nov 19 2026: the house is "Gooding Christie's"; Hagerty and PCarMarket stand). "Gooding & Co", "Gooding & Company" and the PCAR Market spellings are STORED archive labels (sales_archive.platform) that a query filters on; they are never a name a page prints.
// A file outside this list that holds one is a page, email or tile printing the old form; the list says why each stays. The map itself must give the house its new name for the key, the stored label and the old spellings.
const STORED = {
  ...(ONEBOX_WAITS_FOR_STAMP ? { "lib/onebox.js": "PLATFORM_NAMES waits for the engine stamp bump (lane-b-nextbump), moved in its own commit" } : {}),
  "api/sellerDecision.js": "the stored label a house-leaders query filters on and the evidence tables key on (platform=eq.<label>)",
  "api/usageDashboard.js": "ops endpoint queries and crew-only ops text",
  "lib/ops/depthProbe.js": "the depth probe's own table (ops)",
  "lib/desk/coverage.js": "the stored platform labels the coverage table reads",
  "lib/desk/dictionary.js": "the Desk's venue phrases and the stored label each one queries",
  "lib/desk/measures.js": "the stored archive label the Desk's venue filter queries on",
  "lib/specializationShare.js": "generated table keyed by the stored platform label",
  "lib/winConditions.js": "a developer comment", "lib/_ingestHealth.js": "a developer comment", "lib/_houseComps.js": "a developer comment about the stored label",
  "lib/venueNames.js": "the map's own comments",
  "public/js/desk.js": "the Desk chart's colour key, by the stored label (it also carries the new name)"
};
{ const OLD = /Gooding (?:&|&amp;|and) Co(?:mpany)?|PCAR ?Market/, files = [];
  const walk = d => { for (const e of fs.readdirSync(path.join(root, d), { withFileTypes: true })) { const p = d + "/" + e.name; if (e.isDirectory()) { if (!/node_modules|^\.|proofs|docs|fixtures/.test(e.name)) walk(p); } else if (/\.(js|mjs|html)$/.test(e.name)) files.push(p); } };
  for (const d of ["lib", "api", "public"]) if (fs.existsSync(path.join(root, d))) walk(d);
  const old = files.filter(p => !STORED[p] && OLD.test(fs.readFileSync(path.join(root, p), "utf8")));
  ok("no page, email or tile prints an old form of a venue name (Gooding & Co, PCAR Market); the stored labels that stay are listed with their reason", old.length === 0, old);
  const bare = files.filter(p => !STORED[p] && p !== "api/desk.js" && /["']Gooding["']/.test(fs.readFileSync(path.join(root, p), "utf8")));
  ok("no page prints the house as the bare word Gooding (api/desk.js holds one ILIKE token of the archive diagnostic, which is a filter)", bare.length === 0, bare);
  ok("the house is Gooding Christie's for the key, the stored label and the old spellings", ["gooding", "Gooding & Co", "Gooding & Company", "goodingco", "Gooding"].every(x => name(x) === "Gooding Christie's"), ["gooding", "Gooding & Co"].map(name));
  ok("Hagerty and PCarMarket are the names of the map", name("hagerty") === "Hagerty" && name("pcarmarket") === "PCarMarket", [name("hagerty"), name("pcarmarket")]); }
// 2c the STORED LABELS (the archive's platform column: "Gooding & Co", "PCARMarket", "Hagerty Marketplace", "Mecum Auctions") reach pages as the card's platform; each must read as the map's name, and the two example builders that print them must go through the map.
{ const stored = { "Gooding & Co": "gooding", "PCARMarket": "pcarmarket", "PCAR Market": "pcarmarket", "Hagerty Marketplace": "hagerty", "Mecum Auctions": "mecum", "Bring a Trailer": "bringatrailer", "Cars & Bids": "carsandbids", "RM Sotheby's": "rmsothebys", "Barrett-Jackson": "barrettjackson", "Broad Arrow": "broadarrow", "All Collector Cars": "acc", "Sotheby's Motorsport": "sothebysmotorsport", "Car & Classic": "carandclassic" };
  ok("every stored archive label reads as the name of the one map", Object.entries(stored).every(([l, k]) => name(l) === name(k) && name(l) !== ""), Object.entries(stored).filter(([l, k]) => name(l) !== name(k)).map(([l]) => l));
  for (const f of ["lib/live/findExamples.js", "lib/live/marketCheckExamples.js"]) ok(f + ": the card's platform goes through the map, never the stored label as it is", /venueName\(/.test(fs.readFileSync(path.join(root, f), "utf8")) && !/platform: String\((?:rs|r)\.platform(?:Name)?(?: \|\| rs\.platform)?\)\.trim\(\)/.test(fs.readFileSync(path.join(root, f), "utf8")), f);
  // a check that pins a page by a source map that the page no longer holds goes stale on purpose-built removals (Lane C held this branch on two): none may anchor on the removed names
  const stale = fs.readdirSync(path.join(root, "scripts")).filter(f => /Check\.mjs$/.test(f) && f !== "venueNamesCheck.mjs" && /["']\s+var HOUSE = \{["']|PLATFORM_NAMES\b|PLATFORM_LABELS\b/.test(fs.readFileSync(path.join(root, "scripts", f), "utf8")));
  ok("no check anchors on a source map that the one map replaced (var HOUSE = {, PLATFORM_NAMES, PLATFORM_LABELS)", stale.length === 0, stale); }
// 2d THE PAGE'S SCRIPT FILLED (Lane C's second hold: priorListingCheck built the script with a fixed list of placeholders, and the page's new __LIVE_SITES__ was not on it). Every check that builds the page's script uses scripts/_buyClient.mjs, which fills EVERY placeholder;
// api/buy.js must fill every placeholder its script holds; and no check fills one by hand again.
{ const bc = await import(pathToFileURL(path.join(root, "scripts/_buyClient.mjs")).href).catch(e => ({ __error: e.message }));
  const buyTxt = fs.readFileSync(path.join(root, "api/buy.js"), "utf8"), m = /^const CLIENT = (".*");$/m.exec(buyTxt), raw = m ? JSON.parse(m[1]) : "";
  const held = [...new Set([...raw.matchAll(/__([A-Z][A-Z_]*[A-Z])__/g)].map(x => x[1]))], filled = new Set([...buyTxt.matchAll(/\.replace\("(?:\/\*)?__([A-Z][A-Z_]*[A-Z])__/g)].map(x => x[1]));
  ok("api/buy.js fills every placeholder its script holds (" + held.join(", ") + ")", held.length > 0 && held.every(h => filled.has(h)), held.filter(h => !filled.has(h)));
  let parsed = false, left = [];
  try { const out = bc.fillBuyClient(raw, {}, root); left = out.match(/__[A-Z][A-Z_]*[A-Z]__/g) || []; new Function(out); parsed = true; } catch (e) { left = [String(e.message || e)]; }
  ok("the shared builder fills every placeholder and the script parses", !bc.__error && parsed && left.length === 0, bc.__error || left);
  const hand = fs.readdirSync(path.join(root, "scripts")).filter(f => /\.(mjs|js)$/.test(f) && f !== "_buyClient.mjs" && f !== "venueNamesCheck.mjs" && fs.readFileSync(path.join(root, "scripts", f), "utf8").split("\n").some(l => /\.replace\("(?:\/\*)?__(KEEP_ICON|COLD_MISSED|COLD_READING|ANY_ANSWER|LIVE_SITES|PRIOR)__/.test(l) && !/includes\(|\.test\(|^\s*\/\//.test(l)));
  ok("no check fills the page's placeholders by hand (they use scripts/_buyClient.mjs)", hand.length === 0, hand); }
// 3 the engine serves the name on each path
const hd = await imp("api/_historyData.js"), ob = await imp("lib/onebox.js"), srch = await imp("lib/live/search.js"), serve = await imp("lib/forsale/serve.js");
ok("the history line's houseName gives the name for every auction source and never a key", !hd.__error && AUCTION.every(k => hd.houseName(k) === name(k)) && hd.houseName("zzzvendorsource") === "", hd.__error);
{ const src = fs.readFileSync(path.join(root, "lib/onebox.js"), "utf8");
  if (ONEBOX_WAITS_FOR_STAMP) ok("lib/onebox.js is untouched (it waits for the engine stamp bump): still its own PLATFORM_NAMES and no venueNames import", /PLATFORM_NAMES\s*=\s*\{/.test(src) && !/venueNames\.js/.test(src));
  else ok("lib/onebox.js names venues through the one map (platformName is venueName)", /const platformName = s => venueName\(s\)/.test(src) && !/PLATFORM_NAMES\s*=\s*\{/.test(src)); }
{ const src = fs.readFileSync(path.join(root, "lib/_email.js"), "utf8"); ok("the lead email names its platform through the one map", /venueName/.test(src) && !/PLATFORM_LABELS\s*=\s*\{/.test(src)); }
{ const src = fs.readFileSync(path.join(root, "lib/desk/execute.js"), "utf8"); ok("the Desk names its venues through the one map", /venueName/.test(src) && !/PLATFORM_DISPLAY\s*=\s*\{/.test(src)); }
// the earlier-sale line: seenBefore serves house, the page prints it (the page holds no map)
{ process.env.SUPABASE_URL = "https://fake.supabase.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "k"; const realFetch = globalThis.fetch;
  globalThis.fetch = async u => new Response(JSON.stringify(/vin_index/.test(String(u)) ? [{ appearance_date: "2025-03-01", source: "dupontregistrylive", result: "sold", price_usd: 100000, mileage: 9000 }] : []), { status: 200, headers: { "content-type": "application/json" } });
  const sb = srch.seenBefore ? await srch.seenBefore({ supabaseUrl: "https://fake.supabase.test", supabaseKey: "k" }, "ZFF000000000000000").catch(e => ({ error: String(e) })) : null; globalThis.fetch = realFetch;
  ok("the earlier-sale line is served with the venue's name", !!sb && sb.house === "duPont Registry Live", sb); }
{ const mk = s => ({ r: { _fs: { id: 1, source: s, source_type: "dealer", asking_price_usd: 50000, title: "x", url: "https://a.test/x", car: {} } } });
  let cards = null; try { cards = FSKEYS.map(k => serve.cardOf(mk(k))); } catch (e) { cards = null; }
  ok("every for sale card carries its venue's name", !!cards && cards.every((c, i) => c.venue === name(FSKEYS[i])), cards && cards.map(c => c.venue)); }
// the page carries no map of its own
{ const src = fs.readFileSync(path.join(root, "api/buy.js"), "utf8"); ok("the Find page holds no source map and builds no venue from a web address", !/var HOUSE\b/.test(src) && !/HOUSE\[/.test(src) && !/return HOUSE/.test(src)); }
// 4 the real Find page, a duPont Registry Live car
{ const NOW = Date.now(), row = { id: 901, source: "dupontregistrylive", source_listing_id: "s1", url: "https://auction.test/o/senna", listing_title: "1995 Porsche 911 Carrera Coupe", make: "Porsche", model: "911", year: 1995, vin_norm: null, mileage: 1200, current_bid: 900000, end_time: new Date(NOW + 5e7).toISOString(), status: "active", body_style: "coupe", transmission: "Automatic", color: "Orange", state: "FL", first_seen_at: new Date(NOW - 864e5).toISOString(), last_seen_at: new Date(NOW).toISOString(), location: "Miami, FL", images: ["https://x/y.jpg"] };
  const { startFind } = await imp("scripts/_findStates.mjs"); const f = startFind ? await startFind(root, [row, { ...row, id: 902, source: "zzzvendorsource", listing_title: "1996 Porsche 911 Carrera Coupe", source_listing_id: "s2" }]) : null;
  if (!f) ok("the harness loads", false); else {
    const o = await f.run("Porsche 911", { wait: 5500 }); const text = o.text || "";
    ok("the Find card prints the venue's name (duPont Registry Live)", /duPont Registry Live/.test(text), text.slice(0, 300));
    const keys = ALL.filter(k => new RegExp("(^|[^a-z0-9])" + k + "([^a-z0-9]|$)", "i").test(text.replace(/https?:\/\/\S+/g, "")));
    ok("no source key appears anywhere a person can read on the Find page", keys.length === 0, keys);
    ok("a source nobody named is left out, not printed", !/zzzvendorsource/i.test(text));
    await f.close(); } }
console.log(`venueNamesCheck: ${pass} pass, ${fail} FAIL`); process.exit(fail ? 1 : 0);

function mutants() {
  const copy = fs.mkdtempSync(path.join(process.env.TMPDIR || "/tmp", "vnc-")); spawnSync("cp", ["-R", root, copy + "/t"], { stdio: "ignore" }); const T = copy + "/t"; try { fs.rmSync(T + "/node_modules", { force: true }); fs.symlinkSync(path.join(root, "node_modules"), T + "/node_modules"); } catch {}
  const cases = [
    ["the house is still Gooding & Co", "lib/venueNames.js", 'gooding: "Gooding Christie\'s"', 'gooding: "Gooding & Co"'],
    ["a page prints the old form of the house", "lib/sell/sellFollow.js", '["gooding", "Gooding Christie\'s", true]', '["gooding", "Gooding & Co", true]'],
    ["the searching sign holds a site name of its own again", "api/buy.js", "var LIVE_SITES = __LIVE_SITES__;", "var LIVE_SITES = [\\\"PCAR Market\\\"];"],
    ["duPont Registry Live has no name", "lib/venueNames.js", '  dupontregistrylive: "duPont Registry Live",\n', ""],
    ["a key nobody named is printed as it is", "lib/venueNames.js", 'return /^[a-z0-9_.-]+$/.test(raw) ? "" : raw;', "return raw;"],
    ["a dealer has no name", "lib/venueNames.js", 'streetside: "Streetside Classics", ', ""],
    ["the history line has a map of its own again", "api/_historyData.js", "export function houseName(s) { return venueName(s); }", 'const HOUSE = { bringatrailer: "Bring a Trailer", carsandbids: "Cars & Bids", pcarmarket: "PCarMarket" };\nexport function houseName(s) { const k = String(s || "").toLowerCase(); return HOUSE[k] || (s ? String(s) : ""); }'],
    ["the earlier-sale line is not served with a name", "lib/live/search.js", "house: venueName(x.source), historyUrl", "historyUrl"],
    ["the for sale card has no venue", "lib/forsale/serve.js", ", venue: venueName(row.source)", ""],
    ...(ONEBOX_WAITS_FOR_STAMP ? [] : [["the Find page prints the card's key", "lib/onebox.js", "const platformName = s => venueName(s);", "const platformName = s => String(s || \"\");"]]),
    ["the page keeps a source map of its own", "api/buy.js", "  var KEEP_ICON = __KEEP_ICON__;", "  var KEEP_ICON = __KEEP_ICON__; var HOUSE = {bringatrailer:\\\"Bring a Trailer\\\", carsandbids:\\\"Cars & Bids\\\", hagerty:\\\"Hagerty\\\"};"],
    ["the Desk has a map of its own again", "lib/desk/execute.js", "function platformDisplay(slug) { return venueName(slug); }", 'const PLATFORM_DISPLAY = { bringatrailer: "Bring a Trailer" };\nfunction platformDisplay(slug) { return PLATFORM_DISPLAY[slug] || slug; }'],
  ];
  let missed = 0;
  for (const [name, file, from, to] of cases) {
    const p = path.join(T, file), src = fs.readFileSync(p, "utf8"); if (!src.includes(from)) { console.log("SKIP (target not in " + file + " exactly once): " + name); missed++; continue; }
    fs.writeFileSync(p, src.replace(from, () => to)); const r = spawnSync("node", [path.join(T, "scripts/venueNamesCheck.mjs"), T], { encoding: "utf8", timeout: 240000 }); fs.writeFileSync(p, src);
    const caught = r.status !== 0; console.log((caught ? "caught   " : "MISSED   ") + name); if (!caught) missed++;
  }
  fs.rmSync(copy, { recursive: true, force: true }); console.log(`venueNamesCheck mutants: ${missed} not caught`); return missed ? 1 : 0;
}
