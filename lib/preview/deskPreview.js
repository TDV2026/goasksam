// /preview/desk (Lane E, Nov 5 2026): the REDESIGNED Desk as a crew-only preview, beside the live /desk, which stays as it is until Sam approves this.
// It is the live page's own markup and its own scripts (lib/crewPages/desk.html, public/js/desk.js, public/js/deskvals.js), restyled by a stylesheet and given a top bar. Nothing is
// re-implemented: the fixtures below are answered by the REAL sheet actions (lib/desk/sheetActions.js) over a memory store, so the page prints what the server sent and computes nothing.
// The Analyst answer is a real Desk answer recorded from the engine on Nov 5 2026 (receipts cut to 25 rows; every count and figure as given).
// Nothing here is saved, sent or read from a customer: the Send button hands the report to a stand-in that says so, and the preview carries a quiet "sample data" note.
import fs from "node:fs";
import path from "node:path";
import { DESK_PREVIEW_CSS } from "./deskPreviewCss.js";
import { handleSheetAction, emptyState } from "../desk/sheetActions.js";
import { memoryStore } from "../desk/sheetStore.js";
import { readSheet } from "../desk/sheetRead.js";
import { FIXTURE_VINS } from "../desk/sheetShape.js";
import { ensureCase } from "../desk/caseModel.js";
import { demoCaseRecord, DEMO_ID, DEMO_PHOTOS, demoRead } from "./deskV3Fixture.js";

export const PREVIEW_ORG = { id: "hagerty", name: "Hagerty Marketplace", logo: null };   // logo: the org's logo URL from org settings; the bar prints it when set
export const PREVIEW_SEAT = "Expert 1";
export const API_PATH = "/preview/desk/api";

const photo = (label, a, b) => "data:image/svg+xml;base64," + Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="480" height="320" viewBox="0 0 480 320"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="480" height="320" fill="url(#g)"/><text x="24" y="296" font-family="Georgia,serif" font-size="20" fill="#ffffff" fill-opacity=".85">${label}</text></svg>`).toString("base64");
const PHOTOS = [{ id: "p1", name: "Front three quarter", url: photo("Front three quarter", "#2c4a63", "#6d8aa3") }, { id: "p2", name: "Interior", url: photo("Interior", "#3b3a36", "#8a8578") }];

let storeP = null;
export const resetPreviewStore = () => { storeP = null; };   // the screenshot script starts each screen from the seeded sheets
const ctxOf = store => ({ env: {}, org: PREVIEW_ORG.id, seat: PREVIEW_SEAT, store, orgSettings: { name: PREVIEW_ORG.name, logo: PREVIEW_ORG.logo, sendingAddress: "hagerty@desk.goasksam.com" }, fetchImage: async () => null, readSheet: async (env, input) => (await demoRead(input)) || readSheet(env, input),
  send: async p => ({ ok: true, subject: "Valuation report " + p.reportNumber, messageId: "preview", sentAt: new Date().toISOString() }) });   // the stand-in: a preview sends nothing
// a sample sheet is never older than this UTC day: today's queue lists only today's sheets, so a sheet aged from the clock would drop out of the queue just after midnight
const dayStart = () => { const n = new Date(Date.now()); return Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()); };
const seedTime = minutes => { const t = Date.now() - minutes * 60000, floor = dayStart() + 60000; return t < floor ? floor : t; };
const newSheet = (o) => ({ id: o.id, owner_seat: PREVIEW_SEAT, forwarded_by: PREVIEW_SEAT, vin: o.vin || null, car_label: o.label || null, status: o.status || "New", created_at: new Date(seedTime(o.minutesAgo || 12)).toISOString(), opened_at: null,
  submission: { consignor: o.consignor || null, mileage: o.mileage || null, photos: o.photos || [], documents: o.documents || [] }, state: emptyState(), read: null, events: [] });

// Four sheets: the M3 (a starting figure and a thin tier), a sheet already at a thin pool, a finalised one (made by the real finalise), and one the engine cannot read yet.
export function previewStore() {
  if (storeP) return storeP;
  storeP = (async () => {
    const store = memoryStore(), cx = () => ctxOf(store);
    await store.insert(PREVIEW_ORG.id, newSheet({ id: "pv_m3", vin: "WBSBR93422EX21856", label: "2002 BMW M3 Convertible", mileage: 96702, photos: PHOTOS, consignor: { name: "A Seller", email: "zysblat@hotmail.com" }, minutesAgo: 6, documents: [{ name: "Service history 2016 to 2025.pdf", url: "https://example.test/doc/1" }] }));
    await store.insert(PREVIEW_ORG.id, newSheet({ id: "pv_thin", vin: "WP0CA29974S650321", label: "2007 Porsche 911 Turbo", mileage: 41200, photos: PHOTOS.slice(0, 1), consignor: { name: "A Seller", email: "seller@example.com" }, minutesAgo: 35 }));
    await handleSheetAction("sheet_save", { id: "pv_thin", patch: { tier: 2 } }, cx());
    await store.insert(PREVIEW_ORG.id, newSheet({ id: "pv_fin", vin: "WP0AB29918S745123", label: "2008 Porsche 911 Carrera S", mileage: 33500, photos: PHOTOS, consignor: { name: "A Seller", email: "seller@example.com" }, minutesAgo: 190 }));
    await handleSheetAction("sheet_save", { id: "pv_fin", patch: { tier: 2, confirmed: true, photosSelected: ["p1", "p2"], heroId: "p1", checklist: { }, decision: { mode: "range", reserve: "", low: "67000", high: "70000", reasons: [], otherText: "", line: "", guardLines: {}, note: "Thank you for sending the car. The range reflects its low mileage and the records you supplied." } } }, cx());
    await handleSheetAction("sheet_finalise", { id: "pv_fin" }, cx());
    await store.insert(PREVIEW_ORG.id, newSheet({ id: "pv_none", vin: "1HGCM82633A004352", label: "2003 Honda Accord", status: "New", minutesAgo: 70 }));
    // THE DEMONSTRATION CASES ARE REAL STORED SHEETS WITH A CASE, made here at the crew door's first read (not when a page renders), so case_get, case_edit and case_pdf work on every sheet the rail lists. HM-24117 is Lane D's caseDemo; the other sheets get the case their own fields build (ensureCase). All are marked demo.
    await store.insert(PREVIEW_ORG.id, { id: DEMO_ID, owner_seat: PREVIEW_SEAT, forwarded_by: PREVIEW_SEAT, vin: "WP0AA2990XS620481", car_label: "1999 Porsche 911 Carrera", status: "In progress", created_at: new Date(seedTime(18 * 60)).toISOString(), opened_at: null, version: 0,
      submission: { consignor: { name: "Hal Moreau", email: "hal@example.com" }, mileage: 61200, photos: DEMO_PHOTOS, documents: [] }, state: { heroId: null, photosSelected: DEMO_PHOTOS.map(p => p.id) }, read: null, events: [], case: await demoCaseRecord(new Date().toISOString()), demo: true });
    for (const row of await store.list(PREVIEW_ORG.id)) {
      if (row.case) continue; const at = new Date().toISOString();
      if (!(await store.putIf(PREVIEW_ORG.id, { ...row, case: ensureCase(row, at), demo: true, version: (row.version || 0) + 1 }, row.version || 0))) throw new Error("the preview could not store the case of " + row.id);
    }
    return store;
  })();
  return storeP;
}
const ANALYST = (() => { try { return JSON.parse(fs.readFileSync(path.join(process.cwd(), "lib/preview/deskAnalystFixture.json"), "utf8")); } catch { return null; } })();

// The preview's own API: sheet actions go to the real handler; the Analyst asks answer with the recorded answer; nothing else is reachable.
export async function previewDeskApi(body) {
  const action = String((body && body.action) || "");
  if (/^(sheet|case)_/.test(action)) {
    const store = await previewStore();
    if (action === "sheet_new" && !FIXTURE_VINS[String(body.text || "").trim().toUpperCase()]) return { ok: false, why: "This preview reads its sample VINs only: " + Object.keys(FIXTURE_VINS).join(", ") + "." };
    return await handleSheetAction(action, body, ctxOf(store)).catch(e => ({ ok: false, why: String(e && e.message || e) }));
  }
  if ((action === "interpret" || action === "run") && ANALYST) return ANALYST;
  if (action === "list_views") return { ok: true, views: [] };
  return { ok: false, why: "This preview answers its sample screens only." };
}

// The page: the live Desk file, with its redirect gate taken out, the new stylesheet after the old, a top bar, and the API pointed at the preview's own door.
export function renderDeskPreview() {
  let html = fs.readFileSync(path.join(process.cwd(), "lib/crewPages", "desk.html"), "utf8");
  html = html.replace(/<script>\s*\(function\(\)\{try\{[\s\S]*?<\/script>/, "");
  html = html.replace(/<!--[\s\S]*?-->/g, "");                // the live file's notes to its authors are not part of a page a person is shown
  html = html.replace(/#a4571f/gi, "#0B3126");                  // the live Desk's one orange (--clay); the preview has one accent, the brand forest
  const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const bar = `<header class="topbar" id="topbar" data-preview-desk="1"><div class="tb-l"><span class="tb-mark">GoAskSam</span><span class="tb-beta">Beta</span></div><div class="tb-r">${PREVIEW_ORG.logo ? `<img class="tb-logo" src="${esc(PREVIEW_ORG.logo)}" alt="">` : ""}<span class="tb-org" id="tbOrg">${esc(PREVIEW_ORG.name)}</span><span class="tb-sep"></span><span class="tb-seat" id="tbSeat">${esc(PREVIEW_SEAT)}</span></div></header>`;
  const shim = `<script>window.__DESK_PREVIEW__=1;try{if(!sessionStorage.getItem("desk_mode"))sessionStorage.setItem("desk_mode","vals");}catch(e){}(function(){var f=window.fetch;window.fetch=function(u,o){if(typeof u==="string"&&/\\/api\\/desk$/.test(u))u="${API_PATH}";return f.call(this,u,o);};})();</script>`;
  html = html.replace("</head>", `<meta name="robots" content="noindex, nofollow"><style id="redesign">${DESK_PREVIEW_CSS}</style></head>`)
    .replace("<body>", `<body class="pv">${bar}`)
    .replace('<script src="/dsk.', shim + '<script src="/dsk.');
  html = html.replace("<title>Sam Desk</title>", "<title>Desk preview | GoAskSam</title>");
  html = html.replace('<div class="chrome">', '<div class="chrome"><div class="pvnote">Preview with sample data. Nothing is saved or sent.</div>');
  return html;
}
