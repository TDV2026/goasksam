// /preview/desk (Lane E, Nov 5 2026): the REDESIGNED Desk as a crew-only preview, beside the live /desk, which stays as it is until Sam approves this.
// It is the live page's own markup and its own scripts (lib/crewPages/desk.html, public/js/desk.js, public/js/deskvals.js), restyled by a stylesheet and given a top bar. Nothing is
// re-implemented: the fixtures below are answered by the REAL sheet actions (lib/desk/sheetActions.js) over a memory store, so the page prints what the server sent and computes nothing.
// The Analyst answer is a real Desk answer recorded from the engine on Nov 5 2026 (receipts cut to 25 rows; every count and figure as given).
// Nothing here is saved, sent or read from a customer: the Send button hands the report to a stand-in that says so, and the preview carries a quiet "sample data" note.
import fs from "node:fs";
import path from "node:path";
import { DESK_PREVIEW_CSS } from "./deskPreviewCss.js";
import { handleSheetAction, emptyState } from "../desk/sheetActions.js";
import { memoryStore, supabaseStore } from "../desk/sheetStore.js";
import crypto from "node:crypto";
import { readSheet } from "../desk/sheetRead.js";
import { ensureCase } from "../desk/caseModel.js";
import { DEMO_VIN, DEMO_MILES } from "../desk/demoCar.js";
import { reasonLine } from "../reasonWords.js";
import { previewFetchImage } from "./previewImage.js";
import { demoCaseRecord, DEMO_ID, DEMO_PHOTOS, SAMPLE_CASES, sampleCaseRecord } from "./deskV3Fixture.js";
import { recordedRead } from "./recordedRead.js";

export const PREVIEW_ORG = { id: "hagerty", name: "Hagerty Marketplace", logo: null };   // logo: the org's logo URL from org settings; the bar prints it when set
export const PREVIEW_SEAT = "Expert 1";
export const API_PATH = "/preview/desk/api";

let storeP = null;
export const resetPreviewStore = () => { storeP = null; };   // the screenshot script starts each screen from the seeded sheets
// THE PREVIEW READS THE REAL ENGINE FOR EVERY CASE (Lane D, Nov 11 2026). With the archive reachable (the crew door on the deployed site) every case, the demonstration car included, is read by the engine's own sheet read. With no archive (an offline run) the engine's recorded answer
// answers the question that was recorded and nothing else (lib/preview/recordedRead.js), and any other question goes to the sheet read, which says it cannot read it. No sample sales are typed here.
// the number of reads the preview's door has been asked for (a check reads it: a switch of period or condition must not add to it)
export const previewReads = { n: 0 };
export const previewReadSheet = async (env, input) => { previewReads.n++; return ((!env || !env.supabaseUrl) && (await recordedRead(input))) || readSheet(env, input); };
const ctxOf = (store, env = {}, seat = PREVIEW_SEAT) => ({ env, org: PREVIEW_ORG.id, seat, store, orgSettings: { name: PREVIEW_ORG.name, logo: PREVIEW_ORG.logo, sendingAddress: "hagerty@desk.goasksam.com" }, fetchImage: previewFetchImage(), readSheet: previewReadSheet,
  send: async p => ({ ok: true, subject: reasonLine("report.title_final", { number: p.reportNumber }), messageId: "preview", sentAt: new Date().toISOString() }) });   // the stand-in: a preview sends nothing
// a sample sheet is never older than this UTC day: today's queue lists only today's sheets, so a sheet aged from the clock would drop out of the queue just after midnight
const dayStart = () => { const n = new Date(Date.now()); return Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()); };
const seedTime = minutes => { const t = Date.now() - minutes * 60000, floor = dayStart() + 60000; return t < floor ? floor : t; };
const newSheet = (o) => ({ id: o.id, owner_seat: o.seat || PREVIEW_SEAT, forwarded_by: o.seat || PREVIEW_SEAT, vin: o.vin || null, car_label: o.label || null, status: o.status || "New", created_at: new Date(seedTime(o.minutesAgo || 12)).toISOString(), opened_at: null,
  submission: { consignor: o.consignor || null, mileage: o.mileage || null, photos: o.photos || [], documents: o.documents || [] }, state: emptyState(), read: null, events: [] });

// EDITS HOLD (Lane D, Nov 11 2026; Lane F's run: after a condition, a reserve drag, two comparables and a note, Preview printed the unedited case and a reload lost the edits). CAUSE: the preview kept its cases in a memory store, one per function instance, and seeded it afresh on every cold start, so a second instance, or a restart, showed the seeded case and the edits were gone.
// Sam's decision: on the deployed site the preview uses the PRODUCTION Desk store (desk_sheets.sheet.case, written on every edit and read back from there) under the Hagerty org. The sample cases are put there once by the ops task deskpreviewseed (seedPreviewStore), never at a render or a deploy. The memory store stays for offline runs only.
// OTHER PAGES: every page of the preview that lists or opens a case (the rail, the case workspace, the report preview and its PDF, the send dialog) reads the store the door gives it, so they all follow. A check may give the door its own backing store (usePreviewBacking) to stand for the database.
let backing = null;
export const usePreviewBacking = s => { backing = s || null; storeP = null; };
export const previewSeatOf = env => (backing || (env && env.supabaseUrl && env.supabaseKey) ? String((env && env.previewSeat) || process.env.DESK_PREVIEW_SEAT || "crew") : PREVIEW_SEAT);
// a stored sheet's id is a uuid: the preview's own ids (pv_hm and the like) map to fixed ones, the same on every run, so the seeding is idempotent
export const previewUuid = id => { const h = crypto.createHash("sha1").update("goasksam-desk-preview:" + id).digest("hex"); return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`; };
async function realEnv() { try { const { historyEnv } = await import("../../api/_historyData.js"); const e = historyEnv() || {}; return e.supabaseUrl && e.supabaseKey ? e : null; } catch { return null; } }
// THE SAMPLE CASES, put into a store once: the demonstration case and the engine-read samples (the rail). Idempotent: a store that already holds the demonstration case is left as it is. realIds gives the sheets their fixed uuids (the production table's id is a uuid).
export async function seedPreviewStore(store, { realIds = false, seat = PREVIEW_SEAT } = {}) {
  const idOf = id => (realIds ? previewUuid(id) : id), cx = () => ctxOf(store, {}, seat), seeded = [];
  if (await store.get(PREVIEW_ORG.id, idOf(DEMO_ID))) return { seeded: false, ids: [] };
    // THE SAMPLE CASES OF THE RAIL are cars the engine read (lib/preview/deskV3Fixture.js SAMPLE_CASES: an open case, a thin pool, a finalized case), each stored with its case; no sale, price or drawn photo is typed here.
    for (const o of SAMPLE_CASES) {
      const c = await sampleCaseRecord(o, new Date().toISOString()), f = o.fields;
      await store.insert(PREVIEW_ORG.id, { ...newSheet({ seat, id: idOf(o.id), vin: c.fields.vin.value, label: [f.year, f.make, f.model].filter(Boolean).join(" ") || c.desk.titleLine, mileage: f.mileage, photos: o.photos ? DEMO_PHOTOS : [], consignor: { name: "A Seller", email: "seller@example.com" }, minutesAgo: o.minutesAgo, status: o.state === "thin" ? "In progress" : "New" }), case: c, demo: true, version: 1 }); seeded.push(idOf(o.id));
    }
    { const fin = SAMPLE_CASES.find(o => o.state === "finalized"), ed = op => handleSheetAction("case_edit", { id: idOf(fin.id), ...op }, cx());
      const g = (await handleSheetAction("case_get", { id: idOf(fin.id) }, cx())).case; await ed({ op: "comparables", ids: g.desk.comparables.filter(x => x.url).slice(0, 2).map(x => x.id) });
      for (const n of (await handleSheetAction("case_get", { id: idOf(fin.id) }, cx())).case.needs_review.filter(n => n.state === "open")) await ed({ op: "need", item: n.id, state: "waived", reason: "Waived for the sample case" });
      const done = await handleSheetAction("case_finalize", { id: idOf(fin.id) }, cx()); if (!done.ok) throw new Error("the finalized sample case could not be finalized: " + (done.why || "") ); }
    // THE DEMONSTRATION CASES ARE REAL STORED SHEETS WITH A CASE, made here at the crew door's first read (not when a page renders), so case_get, case_edit and case_pdf work on every sheet the rail lists. HM-24117 is Lane D's caseDemo; the other sheets get the case their own fields build (ensureCase). All are marked demo.
    await store.insert(PREVIEW_ORG.id, { id: idOf(DEMO_ID), owner_seat: seat, forwarded_by: seat, vin: DEMO_VIN, car_label: "1999 Porsche 911 Carrera", status: "In progress", created_at: new Date(seedTime(18 * 60)).toISOString(), opened_at: null, version: 0,
      submission: { consignor: { name: "Hal Moreau", email: "hal@example.com" }, mileage: DEMO_MILES, photos: DEMO_PHOTOS, documents: [] }, state: { heroId: null, photosSelected: DEMO_PHOTOS.map(p => p.id) }, read: null, events: [], case: await demoCaseRecord(new Date().toISOString()), demo: true });
    for (const row of await store.list(PREVIEW_ORG.id)) {
      if (row.case) continue; const at = new Date().toISOString();
      if (!(await store.putIf(PREVIEW_ORG.id, { ...row, case: ensureCase(row, at), demo: true, version: (row.version || 0) + 1 }, row.version || 0))) throw new Error("the preview could not store the case of " + row.id);
    }
    seeded.push(idOf(DEMO_ID));
  return { seeded: true, ids: seeded };
}
// THE DEMONSTRATION CASE BACK TO ANY CONDITION (Lane C's run: it sat on Good): one ordinary case_edit on pv_hm, the case taking the engine's stored no-condition view. Nothing else on the case is touched. realIds as in seedPreviewStore.
export async function resetPreviewDemo(store, { realIds = false, seat = PREVIEW_SEAT } = {}) {
  const id = realIds ? previewUuid(DEMO_ID) : DEMO_ID, r = await handleSheetAction("case_edit", { id, op: "condition", selected: null }, ctxOf(store, {}, seat));
  return { ok: r.ok === true, id, why: r.ok ? null : r.why || null };
}
export function previewStore() {
  if (storeP) return storeP;
  storeP = (async () => {
    if (backing) return backing;
    const env = await realEnv(); if (env) { const s = supabaseStore(env); s.persistent = true; return s; }   // the production Desk store: no seeding here
    const store = memoryStore(); store.reset();   // the memory store keeps its sheets and finalized versions in the module: a preview starts from nothing, so a second start in one process (a check that resets the preview) does not meet the first start's finalized version
    await seedPreviewStore(store);
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
    if (action === "sheet_new") return { ok: false, why: "This preview makes cases with New case, and the engine reads them. The older sample sheets with typed sales are gone." };   // the older sheet road read typed fixture sales for a fixture VIN: no typed sale is made in the preview store
    // a case made by hand or edited here asks the real engine (the archive read, crew only behind the door); with no archive reachable (an offline run) the env is empty and the registered engine or the fixtures answer
    let env = {}; if (/^case_/.test(action)) { try { const { historyEnv } = await import("../../api/_historyData.js"); env = historyEnv() || {}; } catch { env = {}; } }
    return await handleSheetAction(action, body, ctxOf(store, env, previewSeatOf(env))).catch(e => ({ ok: false, why: String(e && e.message || e) }));
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
