// DESK DEMO PRIORITIES (Lane D, Nov 2026; Sam's five). Offline: the real sheet actions, the memory store, the real PDF, the real email composer, the preview's own API.
//   node scripts/deskDemoCheck.mjs [repo root]        (scripts/deskDemoFailsWithout.mjs: each mutant must turn it red)
//  A. NEW VALUATION: a VIN or year make model, miles and photos make the same sheet the inbound email makes. One naming (carLabel), a typed sheet is read and re-read like a VIN sheet, photos are checked.
//  B. THE ORG'S OWN REPORT: name, logo and colour from the org record in the PDF and the email, GoAskSam nowhere in either, the colour frozen at finalise, brand_color validated.
//  C. PROOF OF THE NUMBER: every sale of the same tier pool (date, venue, price, miles, link) on the page and in the PDF, the median marked, the starting figure named as that median, tier line, evidence, mark, reasons, guards.
//  D. MY REPORTS: drafts, finalised and sent with their dates; a finalised one is read only.
//  E. THE PREVIEW carries all of it, on the same page file, and opens sample VINs only.
import fs from "node:fs"; import path from "node:path"; import { fileURLToPath, pathToFileURL } from "node:url";
const ROOT = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
process.chdir(ROOT);
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const imp = f => import(pathToFileURL(path.join(ROOT, f)).href);
const A = await imp("lib/desk/sheetActions.js"), SS = await imp("lib/desk/sheetStore.js"), RP = await imp("lib/desk/reportPdf.js"), PM = await imp("lib/pdf/mini.js"), SD = await imp("lib/desk/send.js"), SR = await imp("lib/sheetRead.js"), OS = await imp("lib/desk/orgSettings.js"), RS = await imp("lib/desk/sheetRead.js"), CT = await imp("lib/conditionTier.js");
const { seed } = await imp("scripts/deskValsRender.mjs");
const page = fs.readFileSync("public/js/deskvals.js", "utf8"), html = fs.readFileSync("lib/crewPages/desk.html", "utf8");
const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(40, 1)]).toString("base64");
const org = "demo-org", store = SS.memoryStore();
const COLOR = "#8b1e2d", LOGO = "data:image/png;base64," + fs.readFileSync("public/icon-192.png").toString("base64");
const ORG = { name: "Hagerty Marketplace", logo: LOGO, color: COLOR, monthlyExportCap: 99, standardMessage: "Thanks." };
const cx = (seat = "ava", over = {}) => ({ now: "2026-11-06T12:00:00.000Z", env: {}, org, seat, store, orgSettings: ORG, send: async p => { await store.markSent(org, p.sheetId, "2026-11-06T12:00:00.000Z", p.to); return { ok: true, subject: "s", payload: p }; }   /* the stand in backend does what send.js does: the Sent state is written beside the locked sheet row, never into it */, ...over });
const run = (a, b, seat, over) => A.handleSheetAction(a, b, cx(seat, over));
const dec = reserve => ({ mode: "reserve", reserve, reasons: [], otherText: "", line: "", guardLines: {}, note: "" });

// ---------- A. new valuation
const asked = [];
const mkRead = (label, decode) => ({ version: 1, readAt: "2026-11-06T00:00:00Z", frozen: false, car: { vin: decode.vin || null, label, decode: { source: decode.vin ? "vin" : "typed", ...decode }, mileage: null }, exact: { appearances: [], none: "No prior auction record for this VIN." }, market: { window: { months: 12, stated: "the last 12 months", fallback: false }, count: 0, median: null, p25: null, p75: null, newest: null, splits: [], live: [], startingFigure: null, startingNote: "x", comparables: [], wider: null }, condition: { tiers: [1, 2, 3, 4].map(t => ({ tier: t, label: CT.TIER_NAMES[t], count: 0 })), untiered: 0, selected: null, sameTierCount: null, tooFew: false, tooFewLine: null }, coverage: { footer: "f", methodology: "m" } });
RS.useSheetEngine(async (env, input) => { asked.push(input); return input.vin ? mkRead("2002 BMW M3Ci", { year: 2002, make: "BMW", model: "M3Ci", trim: null, body: "Convertible", vin: input.vin }) : mkRead("2008 Porsche 911 Carrera S", { year: 2008, make: "Porsche", model: "911", trim: "Carrera S", body: "Coupe" }); });
const vinSheet = await run("sheet_new", { text: "WBSBR93422EX21856", mileage: "96,702" });
const vs = await store.get(org, vinSheet.id);
ok(vinSheet.ok && vs.car_label === "2002 BMW M3 Convertible", "a VIN sheet is named the way the inbound email names it: " + vs.car_label);
ok(vs.submission.mileage === 96702 && vs.state.askedMileage === 96702, "the mileage typed at the top is on the sheet: " + vs.submission.mileage);
ok(asked[0] && asked[0].vin === "WBSBR93422EX21856" && asked[0].mileage === 96702, "the engine is asked for the VIN and the miles");
const typed = await run("sheet_new", { text: "2008 Porsche 911 Carrera S", mileage: "41000" });
const ts = await store.get(org, typed.id);
ok(typed.ok && ts.read && ts.car_label === "2008 Porsche 911 Carrera S Coupe" && !ts.vin && ts.typedText === "2008 Porsche 911 Carrera S", "a year make model sheet is read and named too: " + ts.car_label);
ok(asked[1] && asked[1].text === "2008 Porsche 911 Carrera S", "the engine is asked for the typed words");
asked.length = 0; await run("sheet_open", { id: typed.id }); await run("sheet_save", { id: typed.id, patch: { tier: 2 } });
ok(asked.some(a => a.text === "2008 Porsche 911 Carrera S" && a.tier === 2), "a tier click on a typed sheet asks the engine again for the same words");
{ const none = await run("sheet_new", { text: "" }); ok(none.refused, "an empty New valuation is refused"); }
// photos
{ const r = await run("sheet_photo_add", { id: typed.id, name: "front.jpg", data: JPG }); const s = await store.get(org, typed.id);
  ok(r.ok && s.submission.photos.length === 1 && s.submission.photos[0].name === "front.jpg", "a photo is added to a sheet by hand");
  const bad = await run("sheet_photo_add", { id: typed.id, name: "x.jpg", data: Buffer.from("not a photo at all").toString("base64") }); ok(bad.refused && /not a photo/.test(bad.why), "a file that is not a picture is refused: " + bad.why);
  const big = await run("sheet_photo_add", { id: typed.id, name: "x.jpg", data: Buffer.alloc(5 * 1024 * 1024, 1).toString("base64") }); ok(big.refused, "a photo over 4 MB is refused");
  const other = await run("sheet_photo_add", { id: typed.id, name: "y.jpg", data: JPG }, "ben"); ok(other.refused, "another seat cannot add a photo to this sheet: " + other.why);
  let last; for (let i = 0; i < A.MAX_HAND_PHOTOS + 2; i++) last = await run("sheet_photo_add", { id: typed.id, name: "p" + i + ".jpg", data: JPG });
  ok(last.refused && (await store.get(org, typed.id)).submission.photos.length === A.MAX_HAND_PHOTOS, "a sheet takes no more than " + A.MAX_HAND_PHOTOS + " photos"); }
ok(/id="vnewm"/.test(html) && /id="vnewf"/.test(html) && /New valuation/.test(html), "the Desk has the New valuation form with miles and photos");
ok(/sheet_new[\s\S]{0,200}mileage/.test(page) && /sheet_photo_add/.test(page), "the page sends the miles and each photo");

// ---------- B. the org's own report
const sh = await seed(store, { seat: "ava", org }); await run("sheet_open", { id: sh.id });
const BIG = Array.from({ length: 31 }, (_, i) => ({ date: `2026-10-${String(30 - i % 28).padStart(2, "0")}`, venue: i % 2 ? "Bring a Trailer" : "Cars & Bids", price: 60000 + i * 1000, mileage: 20000 + i * 500, tier: 2, url: `https://example.test/sale/${i + 1}`, title: "x", half: null, mid: null }));
const prices = BIG.map(c => c.price).sort((a, b) => a - b), medianPrice = prices[15];
BIG[15].mid = "median"; const medianRow = BIG.find(c => c.price === medianPrice); medianRow.mid = "median"; BIG.forEach(c => { if (c !== medianRow) c.mid = null; });
{ const s = await store.get(org, sh.id); s.read.market.comparables = BIG; s.read.market.startingFigure = medianPrice; s.read.market.meter = { scope: "tier", tier: 2, count: 31, low: medianPrice - 4000, p25: medianPrice - 2000, median: medianPrice, p75: medianPrice + 2000, high: medianPrice + 4000, lowPct: 30, p25Pct: 40, medianPct: 50, p75Pct: 60, highPct: 70, bandWidthPct: 40, axisMin: medianPrice - 10000, axisMax: medianPrice + 10000, step: 500, dots: [] }; s.read.condition = { ...s.read.condition, engineTier: 2, selected: 2, sameTierCount: 31, bandCount: 31, tooFew: false, carEvidence: { tier: 2, lines: [{ code: "service", points: 1, line: "The listing mentioned service records or a service history" }], source: "this car's last sale listing" } }; s.version = (s.version || 0) + 1; await store.put(org, s); }
await run("sheet_save", { id: sh.id, patch: { mark: null } });
{ const s = await store.get(org, sh.id); s.read.market.comparables = BIG; s.read.market.startingFigure = medianPrice; s.state.tier = 2; s.state.mark = { mark: "plus", tier: 2, reason: "Cleaner than the middle car." }; s.state.decision = { ...dec("58000"), reasons: ["condition"], line: "Close inspection showed better paint.", guardLines: { start: "Reserve sits above the starting figure on purpose." } }; await store.put(org, s); }
const f = await run("sheet_finalise", { id: sh.id }); ok(f.ok, "finalised for the proof: " + (f.why || ""));
const fin = await store.get(org, sh.id);
ok(fin.final.org.color === COLOR, "the org's colour is frozen at finalise: " + fin.final.org.color);
const rep = await RP.buildReport(fin, { ...ORG, color: "#0000ff" }, {});
const raw = Buffer.from(rep.bytes).toString("latin1"), text = PM.pdfPages(rep.bytes).map(p => p.join(" | ")).join("\n");
const rg = RP.accentOf(COLOR).map(v => (Math.round(v * 100) / 100).toString()).join(" ");
ok(raw.includes(rg + " rg"), "the PDF figure is in the org's colour (" + rg + "), the frozen one, not a later one");
ok(!/goasksam/i.test(raw) && !/goasksam/i.test(text), "the PDF names GoAskSam nowhere, not in the text and not in the file properties");
ok(/Hagerty Marketplace/.test(text) && /\/Image|\/Subtype \/Image/.test(raw), "the PDF carries the org's name and logo");
{ const mail = SD.composeMessage({ org: { name: "Hagerty Marketplace" }, settings: { brand_color: COLOR, signature: "Ann" }, message: "Hello.", note: "n" });
  ok(mail.html.includes(COLOR) && /Hagerty Marketplace/.test(mail.html) && !/goasksam/i.test(mail.html + mail.text), "the email carries the org's name and colour and names GoAskSam nowhere"); }
ok(OS.validateSettingsPatch("hagerty", { brand_color: "#8B1E2D" }).clean.brand_color === "#8b1e2d" && !OS.validateSettingsPatch("hagerty", { brand_color: "red" }).ok && !OS.validateSettingsPatch("hagerty", { brand_color: "#12345" }).ok && OS.validateSettingsPatch("hagerty", { brand_color: null }).ok, "brand_color takes a hex and nothing else");
ok(RP.accentOf("nonsense").join() === RP.accentOf(null).join(), "no colour, the Desk's green");
{ const realFetch = globalThis.fetch; globalThis.fetch = async u => new Response(JSON.stringify(/desk_org_settings\?/.test(String(u)) ? [{ logo_path: "hagerty/brand/logo.png", brand_color: "#112233" }] : [{ name: "Hagerty Marketplace", settings: {} }]), { status: 200 });
  try { const set = await A.orgSettings({ org: "hagerty", env: { supabaseUrl: "https://db.test", supabaseKey: "k" }, signUrl: async (e, o, p) => "https://signed.test/" + p }); ok(set.color === "#112233" && set.logoPath === "hagerty/brand/logo.png" && set.logo === "https://signed.test/hagerty/brand/logo.png", "the org record's logo (signed fresh) and colour reach the report settings: " + JSON.stringify([set.color, set.logo])); } finally { globalThis.fetch = realFetch; } }
ok(fs.existsSync("docs/supabase-desk-brand-color.sql") && /enable row level security/.test(fs.readFileSync("docs/supabase-desk-brand-color.sql", "utf8")) && /revoke all on desk_org_settings from anon, authenticated/.test(fs.readFileSync("docs/supabase-desk-brand-color.sql", "utf8")), "the brand colour SQL file carries the RLS lines");

// ---------- C. proof of the number
const rows = BIG.length;
ok(BIG.every(c => text.includes(c.url.replace(/^https?:\/\//, "").slice(0, 34))), "every one of the " + rows + " sales is in the PDF with its link (no cut at 24)");
ok(/\| MEDIAN \| example\.test\/sale\/\d+/.test(text) && new RegExp("engine median \\$" + medianPrice.toLocaleString("en-US") + " is taken from the 31 sales", "i").test(text.replace(/\s+/g, " ")), "the PDF marks the median and says the engine median is taken from the pool");
ok(text.includes(CT.TIER_LADDER[2].line) || text.includes(CT.TIER_LADDER[2].line.slice(0, 20)), "the PDF has the tier's ladder line");
ok(/The listing mentioned service records/.test(text), "the PDF has the evidence lines the engine counted");
ok(/Engine: tier 2\. Analyst: tier 2 plus/.test(text) && /Cleaner than the middle car/.test(text), "the PDF has the analyst's mark and reason");
ok(/Close inspection showed better paint/.test(text) && /Reserve sits above the starting figure on purpose/.test(text) && /Condition better or worse/.test(text), "the PDF has the reasons, the reasoning and the guard line");
{ const odd = SR.middleFinder([10, 20, 30].map(price => ({ price })), true), even = SR.middleFinder([10, 20, 30, 40].map(price => ({ price })), true);
  ok([10, 20, 30].map(p => odd({ price: p })).join() === ",median," && [10, 20, 30, 40].map(p => even({ price: p })).join() === ",middle,middle,", "the engine pool's median is marked (odd) or its two middle sales (even)"); ok(SR.middleFinder([{ price: 1 }], false)({ price: 1 }) === null, "no tier pool, no median mark"); }
ok(!/comparables[^;]{0,60}slice\(0, ?12\)/.test(page) && /c\.mid/.test(page) && /esc\(rd\.condition\.proofLine\) \+ " The sale marked Median/.test(page) && /c\.inBand/.test(page), "the page lists the whole pool, marks the median and names the starting figure as that median");
ok(/cardsOf\.slice\(0, MAX_PROOF_ROWS\)/.test(fs.readFileSync("lib/sheetRead.js", "utf8")), "the read carries the whole pool: the tier pool, or the whole body pool when the tier holds under five (never a handful)");
ok(!/<ol class="ladder"/.test(page) && /<ul class="ladder"/.test(page), "the ladder is not numbered past 4: Untiered is not a fifth rung");
ok(/m\.meter && m\.meter\.scope === "tier" && rd\.condition\.proofLine/.test(page), "the proof sentence prints only when the engine gave the pool count (never 'n/a sales')");
ok(SR.MAX_PROOF_ROWS >= 300, "the read carries the whole same tier pool (up to " + SR.MAX_PROOF_ROWS + " sales)");

// ---------- D. my reports
{ const sum = SS.summaryOf(fin, Date.now()); ok(sum.finalisedOn === "2026-11-06" && "sentOn" in sum && sum.date, "the queue row carries its finalised and sent dates from the server: " + sum.finalisedOn);
  const sm = await run("sheet_send", { id: sh.id, to: "me@example.com", message: "Hi" }); const sent = await store.get(org, sh.id); ok(sm.ok && SS.summaryOf(sent).sentOn === "2026-11-06", "a sent sheet shows its sent date");
  const mine = await run("sheet_queue", { view: "mine" }); ok(mine.rows.some(r => r.status === "Sent") && mine.rows.some(r => r.status !== "Sent" && r.status !== "Finalised"), "My reports holds drafts and sent ones");
  const edit = await run("sheet_save", { id: sh.id, patch: { tier: 3 } }); ok(edit.refused && /locked|read only/i.test(edit.why), "a finalised sheet opens read only: " + edit.why);
  ok(/My reports/.test(page) && /reportsHtml\(S\.lists\.mine\)/.test(page) && /"Drafts"/.test(page) && /"Finalised"/.test(page) && /"Sent"/.test(page), "the rail groups My reports as Drafts, Finalised and Sent"); }
RS.useSheetEngine(null);

// ---------- E. the preview
{ const P = await imp("lib/preview/deskPreview.js"), pv = P.renderDeskPreview();
  ok(/id="vnewf"/.test(pv) && /New valuation/.test(pv) && /deskphoto\.js/.test(pv) && /My reports|deskvals\.js/.test(pv), "the preview is the same page file, with the New valuation form and its photo script");
  const bad = await P.previewDeskApi({ action: "sheet_new", text: "2008 Porsche 911 Carrera S" }); ok(bad.ok === false && /sample VINs/.test(bad.why), "the preview reads its sample VINs only: " + bad.why);
  const good = await P.previewDeskApi({ action: "sheet_new", text: "WP0AB29918S745123", mileage: "30000" }); ok(good.ok === true, "the preview opens a sample VIN as a new valuation");
  ok(!/goasksam/i.test(fs.readFileSync("lib/desk/reportPdf.js", "utf8").replace(/\/\/.*$/gm, "")), "the report writer's code names GoAskSam nowhere"); }
ok(/dsk\.20261106a/.test(html) && /dsk\.20261106a/.test(fs.readFileSync("vercel.json", "utf8")), "the page files moved to a new versioned path, so no browser keeps the old ones");
console.log(`deskDemoCheck: ${pass} pass, ${fail} FAIL`); process.exit(fail ? 1 : 0);
