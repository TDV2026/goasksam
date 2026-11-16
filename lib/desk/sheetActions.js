// DESK VALUATIONS: every action behind the Valuations mode of /desk (called from lib/desk/handler.js as sheet_*). The page asks and prints; every rule is here.
import { docFileOf, docExtOf, MAX_DOC_BYTES, JSON_DOC_BYTES, MAX_PHOTO_UPLOAD, photoExtOf } from "./docTypes.js";
import { titleOfSheet } from "./title.js";
import { SECTIONS, CHECKLIST, CHECK_STATES, REASONS, DEFAULT_THRESHOLD, coverOf } from "./sheetShape.js";
import { readSheet } from "./sheetRead.js";
import { evaluateDecision, analystLine } from "./decisionRules.js";
import { storeFor, accessOf, summaryOf, isDeskOwner } from "./sheetStore.js";
import { supabaseSelect } from "../_supabase.js";
import { crypto as _c } from "./sheetCrypto.js";
import nodeCrypto from "node:crypto";
import { mintSheetUrls, UUID_RE } from "./storage.js";
import { reasonLine } from "../reasonWords.js";
import { vinStep, decodedOf, vinRefusal, vinWarning, isChassis } from "./vinStep.js";
import { ownView } from "./ownCar.js";
import { liveFill } from "./liveFill.js";
import { coverIdOf } from "./coverPhoto.js";
import * as CS from "./caseSend.js";
import { longDate } from "./reportState.js";
import { seatViewOf, namesOnView, nameOf, cleanName } from "./seatName.js";
import { newCase, ensureCase, migrateSellerWords, editSellerWords, excludeSale, restoreSale, recordOpen, recordActive, logAudit, DOC_KINDS } from "./caseModel.js";
import * as W from "./caseWorkflow.js";
import { reportState } from "./reportState.js";
import { caseView, queueCounts, workingStageOf } from "./caseView.js";
import { carLabel } from "./intake/carName.js";
import { TIER_LADDER, UNTIERED_LADDER, sanitizeMark, markStatement, markNote, tierStatement } from "../conditionTier.js";
// Signed urls are minted for the response or the PDF only, on a copy, with the signer the caller's org allows. The stored sheet never carries one.
// EVERY ACTION THAT READS THE DESK ANSWER READS IT AT THE CURRENT SHAPE (Lane C's live run on the Ferrari, Nov 15 2026: all four conditions gave balanced $541,000, because the stored answer predated DESK_SHAPE 6, had no byCondition, and only case_get open:true re-read a stale shape). The re-read is the one open uses (W.refreshShape: same engine, same inputs, one read); it is made in memory for the action in hand, which stores the case itself or, for a draft, writes nothing. A failed read leaves the case as it was and the caller decides what a missing field means.
export const SHAPE_OPS = ["condition_set", "condition", "reserve_use", "report_rungs_set"];
const shapeCurrent = async (ctx, c, now) => { if (!c || !W.needsReread(c)) return c; try { const bf = await W.refreshShape(c, input => (ctx.readSheet || readSheet)(ctx.env, input), { caseDate: String(now).slice(0, 10), now }); if (bf.filled) { const nc = W.settle(W.syncNeeds(bf.case), now); return W.needsReread(nc) ? { ...nc, shapeRead: W.CURRENT_SHAPE } : nc; } return bf.answered ? { ...c, shapeRead: W.CURRENT_SHAPE } : c; } catch { return c; } };   // the answer came and is no newer than the stored: the case is stamped (stored by the action), so the next action reads nothing
// THE CAR'S OWN PHOTOS FOR A REPORT (Nov 15 2026): read through the storage client with the service key, for this org, never by an address. A check gives ctx.readPhoto.
const photoReader = (ctx, org) => ctx.readPhoto || (ctx.env && ctx.env.supabaseUrl ? async path => (await import("./storage.js")).readObject(ctx.env, org, path, 25 * 1024 * 1024) : null);
export const DOC_URL_SECONDS = 600;   // a document's view address lives ten minutes
const minted = (ctx, org, sheet) => mintSheetUrls(ctx.env, org, sheet, ctx.signUrl ? { sign: ctx.signUrl } : {});

export const DEFAULT_ORG = { id: "sam", name: "Sam", logo: null, threshold: DEFAULT_THRESHOLD, venueChoice: false, standardMessage: "Thank you for sending your car. The market report is attached.", monthlyExportCap: 200, sendingAddress: null, paper: "letter", contactAddress: null, contactPhone: null, contactEmail: null };
export async function orgSettings(ctx) {
  const base = { ...DEFAULT_ORG, id: ctx.org || "sam", ...(ctx.orgSettings || {}) };
  if (ctx.orgSettings || !ctx.env || !ctx.env.supabaseUrl) return base;
  let out = base;
  try { const r = await supabaseSelect(ctx.env, `desk_orgs?id=eq.${encodeURIComponent(base.id)}&select=name,settings&limit=1`); if (r && r[0]) out = { ...base, name: r[0].name || base.name, ...(r[0].settings || {}) }; } catch {}
  // THE ORG'S OWN BRANDING (Lane D, Nov 2026): the logo object and the colour the org set in desk_org_settings. The logo is signed fresh for each report (a stored link would expire); the path and colour are what a finalised sheet freezes.
  try {
    const r = await supabaseSelect(ctx.env, `desk_org_settings?org_id=eq.${encodeURIComponent(out.id)}&select=logo_path,brand_color&limit=1`);
    if (r && r[0]) {
      if (r[0].brand_color) out = { ...out, color: r[0].brand_color };
      if (r[0].logo_path) { out = { ...out, logoPath: r[0].logo_path }; try { const { signedUrl } = await import("./storage.js"); const u = await (ctx.signUrl ? ctx.signUrl(ctx.env, out.id, r[0].logo_path, 3600) : signedUrl(ctx.env, out.id, r[0].logo_path)); if (u) out = { ...out, logo: u }; } catch {} }
    }
  } catch {}
  return out;
}
const VIN_RE = /^[A-HJ-NPR-Z0-9]{17}$/;
const iso = ctx => (ctx.now ? new Date(ctx.now) : new Date()).toISOString();
const sanitizeChecklist = c => { const out = {}; for (const it of CHECKLIST) { const v = c && c[it.key]; if (v) out[it.key] = { state: CHECK_STATES.includes(v.state) ? v.state : null, choice: it.choices && it.choices.includes(v.choice) ? v.choice : null, line: String(v.line || "").slice(0, 300) }; } return out; };
const sanitizeDecision = d => ({ mode: d && (d.mode === "reserve" || d.mode === "range") ? d.mode : null, reserve: d && d.reserve != null ? String(d.reserve).slice(0, 12) : "", low: d && d.low != null ? String(d.low).slice(0, 12) : "", high: d && d.high != null ? String(d.high).slice(0, 12) : "", reasons: ((d && d.reasons) || []).filter(k => REASONS.some(r => r.key === k)), otherText: String((d && d.otherText) || "").slice(0, 300), line: String((d && d.line) || "").slice(0, 600), guardLines: { prior: String((d && d.guardLines && d.guardLines.prior) || "").slice(0, 400), start: String((d && d.guardLines && d.guardLines.start) || "").slice(0, 400) }, note: String((d && d.note) || "").slice(0, 2000) });

// The old sheet fields, made from a finalized version row. figures.assessment is the range and the figure the analyst stood behind (kept for the older sheet; the V4 report does not print the range); figures.reserve is the reserve. Nothing is computed: each value is one the row holds.
export function mirrorOf(row, { seat, now, reportNumber, set, read }) {
  const a = row.figures.assessment, r = row.figures.reserve, str = v => (v == null ? "" : String(v));
  return {
    status: "Finalised",
    read: { ...(read || {}), frozen: true, v3: true, version: row.version, desk: { evidence: row.evidence, original: row.original } },
    final: { finalisedAt: row.finalized_at || now, seat, reportNumber, v3Version: row.version, decision: sanitizeDecision({ mode: "reserve", reserve: str(r.figure), low: str(a.low), high: str(a.high), reasons: [], otherText: "" }), mark: null, analystFigure: a.figure || null, evaluation: { canFinalise: true, v3: true }, org: { name: set.name, logoPath: set.logoPath || null, logo: set.logoPath ? null : set.logo, color: set.color || null } }
  };
}
// TWO TABS (Lane D, Nov 2026): a sheet carries a version. A save or a finalise names the version the page read; a different version means another tab (or seat) wrote first, and the write is refused whole, nothing is overwritten.
export const MAX_HAND_PHOTOS = 20;
export const STALE_LINE = "This sheet changed in another tab. Reload to see the latest.";
// THE NAMED ACTIONS the Desk page sends (order 2318): each is one case_edit op, saved, audited and answered the same way. The preview door lets exactly these through (lib/preview/deskPreview.js).
export const NAMED_OPS = { condition_set: "condition_set", reserve_use: "reserve_use", report_rungs_set: "report_rungs_set", considered_edit: "considered_edit", seller_said: "need_said", proceed_without: "need_proceed", mark_verified: "need_verify", doc_remove: "doc_remove", doc_kind: "doc_kind", comparable_exclude: "exclude" };
const READ_OPS = ["field", "window", "condition", "condition_set", "exclude", "restore"];   // the case_edit ops that move an input of the engine's read
const stale = () => ({ ok: false, refused: true, stale: true, why: STALE_LINE });
const baseOf = (body, sheet) => (body.baseVersion == null ? (sheet.version || 0) : Number(body.baseVersion) || 0);
export const emptyState = () => ({ tier: null, picks: [], mark: null, askedMileage: null, confirmed: false, corrections: {}, checklist: {}, decision: sanitizeDecision({}), photosSelected: [], heroId: null, pinned: null, analystFigure: null });
const engineTierOf = read => (read && read.condition && [1, 2, 3, 4].includes(Number(read.condition.engineTier)) ? Number(read.condition.engineTier) : null);
// THE ANALYST'S PLUS OR MINUS IS THE MARKER'S SIDE OF THE ENGINE MEDIAN (Nov 8 2026): the figure the analyst set against the median of the meter the sheet shows, kept in step whenever the meter changes (a tier or body click moves the median, never the figure). A mark set by hand with no figure is left as it was.
export function syncMark(s) {
  const st = s.state, med = Number(s.read && s.read.market && s.read.market.meter && s.read.market.meter.median), f = Number(st.analystFigure);
  if (f > 0 && med > 0) { const dir = f > med ? "plus" : f < med ? "minus" : null; st.mark = dir && st.tier ? sanitizeMark(st.tier, { mark: dir, reason: (st.mark && st.mark.reason) || "", engineTier: engineTierOf(s.read) }) : null; }
  else if (st.mark) st.mark = sanitizeMark(st.tier, { ...st.mark, engineTier: engineTierOf(s.read) });
}

// What the engine is asked for a sheet: its VIN, or the words the expert typed (year make model). One place, so a typed sheet is read, re-read and opened exactly like a VIN sheet.
const askOf = (s, extra = {}) => s.vin ? { vin: s.vin, ...extra } : (s.typedText ? { text: s.typedText, ...extra } : null);
// Everything the engine is asked for a sheet, in one place: the car, the miles, the tier and the options the expert picked from a split pool.
const readInput = s => ({ ...askOf(s), mileage: s.state.askedMileage || s.submission.mileage, tier: s.state.tier, picks: Array.isArray(s.state.picks) ? s.state.picks : [] });
const sanitizePicks = ps => (Array.isArray(ps) ? ps : []).filter(p => p && ["body", "gearbox", "edition", "year"].includes(p.dimension) && p.value != null && String(p.value).length <= 40).slice(0, 4).map(p => ({ dimension: p.dimension, value: String(p.value) }));
async function priorsOf(store, org, sheet) {
  if (!sheet.vin) return [];
  return (await store.list(org)).filter(s => s.id !== sheet.id && s.vin === sheet.vin && s.final && s.final.finalisedAt).map(s => ({ reportNumber: s.final.reportNumber, mode: s.final.decision.mode, reserve: Number(s.final.decision.reserve) || null, low: Number(s.final.decision.low) || null, high: Number(s.final.decision.high) || null, finalisedAt: s.final.finalisedAt }));
}
// A RETRY ANSWER IS NOT A READ (Lane E, Nov 5 2026): readSheet() answers { retry: true, retryAfterMs, line } while the engine is still reading. It is never stored as the sheet's read, never replaces a read the sheet already has, and the page gets the engine's line and the wait to ask again.
export const isRetry = r => !!r && typeof r === "object" && r.retry === true;
// No wait and no words of the Desk's own: the wait is the engine's retryAfterMs (null when the engine sent none, and the page then sets no timer) and the line is the engine's, or the engine's own still-reading line.
export const retryOf = r => ({ retry: true, retryAfterMs: Number(r.retryAfterMs) > 0 ? Number(r.retryAfterMs) : null, line: typeof r.line === "string" && r.line ? r.line : reasonLine("cold.still") });
async function view(ctx, store, stored, org) {
  const sheet = await minted(ctx, org, stored);
  const access = accessOf(sheet, ctx.seat, isDeskOwner(ctx)), set = await orgSettings(ctx);
  const priors = await priorsOf(store, org, sheet), earlier = (await store.list(org)).filter(s => s.id !== sheet.id && sheet.vin && s.vin === sheet.vin).map(s => ({ ...summaryOf(s, ctx.nowMs), decision: s.final ? { mode: s.final.decision.mode, reserve: s.final.decision.reserve, low: s.final.decision.low, high: s.final.decision.high } : null }));
  const evaluation = sheet.read ? evaluateDecision({ read: sheet.read, draft: sheet.state.decision, org: set, priors, analystFigure: sheet.state.analystFigure }) : null;
  const meterMed = sheet.read && sheet.read.market && sheet.read.market.meter ? sheet.read.market.meter.median : null, analyst = sheet.read ? { figure: sheet.state.analystFigure || null, median: meterMed, line: analystLine(meterMed, sheet.state.analystFigure) } : null;
  return { ok: true, sheet: publicSheet(sheet, (await store.exportsOf(org, sheet.id)).length), access, read: sheet.read, evaluation, thisCar: earlier, org: { name: set.name, logo: set.logo, threshold: set.threshold, venueChoice: !!set.venueChoice, standardMessage: set.standardMessage }, sections: SECTIONS, ladder: { tiers: Object.keys(TIER_LADDER).map(k => ({ tier: Number(k), name: TIER_LADDER[k].name, line: TIER_LADDER[k].line })), untiered: UNTIERED_LADDER }, markLine: sheet.read && sheet.state.tier ? tierStatement(engineTierOf(sheet.read), sheet.state.tier, (sheet.final ? sheet.final.mark : sheet.state.mark) && (sheet.final ? sheet.final.mark : sheet.state.mark).mark) : null, analyst, cover: coverOf(sheet.submission, sheet.state), checklist: CHECKLIST, checkStates: CHECK_STATES, reasons: REASONS };
}
export function publicSheet(s, recorded = 0) { const { read, ...rest } = s; return { ...rest, exports: (s.exports || []).length + recorded }; }


// A photo as the page sends it (base64): checked to be a picture, and resized the way the emailed ones are. ONE place, for the old sheet action and the case's photo_add, so they cannot accept different things.
// A PHOTO THE ANALYST ADDS, ANY OF JPG, PNG, WebP OR HEIC, IS CONVERTED HERE TO AN UPRIGHT JPEG (Lane D, Nov 12 2026; Sam's second run: a PNG or an iPhone HEIC was refused, or it needed the browser to convert). The type is read from the bytes, never from the name. Conversion is the intake's own (lib/desk/intake/images.js resizeUpright), with or without a database, so a check and the live site accept the same files.
// THE BYTES OF A PHOTO, WHEREVER THEY CAME FROM: the type is told by the first bytes (never the name), the picture is made upright and resized the way the emailed ones are. The JSON road (a small photo in a request) and the direct road (a stored file read back) both end here, so they accept the same files.
async function acceptPhotoBytes(buf, name, max) {
  if (!buf || !buf.length || buf.length > max) return { refuse: reasonLine("case.photo.refuse.size") };
  const { resizeUpright, isHeicBytes } = await import("./intake/images.js");
  const isJpg = buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff, isPng = buf[0] === 0x89 && buf.slice(1, 4).toString() === "PNG", isWebp = buf.slice(0, 4).toString() === "RIFF" && buf.slice(8, 12).toString() === "WEBP", isHeic = isHeicBytes(buf);
  if (!(isJpg || isPng || isWebp || isHeic)) return { refuse: reasonLine("case.photo.refuse.type") };
  const r = await resizeUpright(buf, { filename: String(name || ""), contentType: isJpg ? "image/jpeg" : isPng ? "image/png" : isWebp ? "image/webp" : "image/heic" });
  if (!r.ok) return { refuse: reasonLine("case.photo.refuse.unreadable") };
  return { jpeg: r.jpeg, width: r.width, height: r.height, hash: photoHashOf(buf) };
}
// THE SAME BYTES ARE NEVER ON A CASE TWICE (Sam, Nov 16 2026): the content hash (sha256 of the file as it arrived, the same hash the intake keeps for an emailed attachment) is on every photo; a photo whose hash is already on the case, or on its sheet, is not added again and the answer says "already on the case".
export const photoHashOf = buf => nodeCrypto.createHash("sha256").update(buf).digest("hex");
const hasPhotoHash = (sheet, c, hash) => !!hash && (((c && c.photos && c.photos.items) || []).some(p => p.hash === hash) || ((sheet && sheet.submission && sheet.submission.photos) || []).some(p => p.hash === hash));
// a photo in a JSON body is for a small file only (the platform stops a request at 4.5 MB): over the cut it is refused with the reason, and the page sends it by the direct route
async function acceptPhoto(body, ctx) {
  let buf; try { buf = Buffer.from(String(body.data || ""), "base64"); } catch { buf = null; }
  if (buf && buf.length > JSON_DOC_BYTES) return { refuse: reasonLine("case.photo.refuse.route") };
  return acceptPhotoBytes(buf, body.name, JSON_DOC_BYTES);
}
// EVERY ACTION BY THE ORG OWNER OR THE CREW ON A CASE ANOTHER SEAT HOLDS IS WRITTEN ON THE CASE, NAMING WHO (Sam, Nov 16 2026). The reads below change nothing and write nothing; every other action that came back ok adds one audit entry: who acted (the seat's name, else its label, else "crew"), whose case it is, and what was done.
const OWNER_READS = new Set(["sheet_queue", "case_get", "case_list", "case_pickers", "case_decode", "case_pdf", "case_send_preview", "case_version", "doc_url", "seat_name", "case_active", "sheet_company_find", "sheet_thiscar", "sheet_open"]);
export async function handleSheetAction(action, body, ctx) {
  const priv = isDeskOwner(ctx), idIn = body && body.id != null ? String(body.id) : null;
  if (!priv || !idIn || OWNER_READS.has(action) || body.draft === true) return handleSheetActionInner(action, body, ctx);
  const org = ctx.org || "sam", seat = ctx.seat || "crew", store = ctx.store || storeFor(ctx.env), before = await store.get(org, idIn).catch(() => null);
  const out = await handleSheetActionInner(action, body, ctx);
  if (!before || !out || out.ok !== true || before.owner_seat === seat || !before.case) return out;
  const named = NAMED_OPS[action] ? "case_edit" : action;
  for (let n = 0; n < 3; n++) {
    const s1 = await store.get(org, idIn).catch(() => null); if (!s1 || !s1.case || !s1.case.audit) return out;
    const c = structuredClone(s1.case), now = ctx.now ? new Date(ctx.now).toISOString() : new Date().toISOString();
    logAudit(c, { at: now, by: String(seat), what: "owner acted", name: String(ctx.seatName || (seat === "crew" ? "Crew" : "Seat " + seat)), from: String(s1.owner_seat), to: named === "case_edit" && body.op ? "edit:" + String(body.op) : named });
    if (await store.putIf(org, { ...s1, case: c, version: (s1.version || 0) + 1 }, s1.version || 0)) break;
  }
  return out;
}
async function handleSheetActionInner(action, body, ctx) {
  const priv = isDeskOwner(ctx);
  if (NAMED_OPS[action]) { body = action === "comparable_exclude" ? { ...body, op: "exclude", saleId: body.item, scope: body.scope || "report_comps", viaComparable: true } : { ...body, op: NAMED_OPS[action] }; action = "case_edit"; }   // order 2318: the condition and reserve decisions are named actions; each is one case_edit op, saved and audited the same way
  const org = ctx.org || "sam", seat = ctx.seat || "crew", store = ctx.store || storeFor(ctx.env), now = iso(ctx);
  ctx = { ...ctx, nowMs: ctx.now ? new Date(ctx.now).getTime() : Date.now() };
  const get = async id => store.get(org, String(id || ""));
  const refuse = (why, extra = {}) => ({ ok: false, refused: true, why, ...extra });
  const namesOf = async () => (store.seatNames ? await store.seatNames(org).catch(() => ({})) : {}), own = { label: String(seat), name: ctx.seatName || null };   // the seats' display names (lib/desk/seatName.js)
  const seatOut = async () => seatViewOf(seat, await namesOf(), own);
  const caseViewOf = async sh => namesOnView(await caseViewRaw(sh), await namesOf(), own);
  const caseViewRaw = async sh => caseView(await liveFill(ctx, await minted(ctx, org, sh)), await store.list(org), now, seat, sh.final || sh.status === "Sent" ? await store.exportsOf(org, sh.id) : []);   // the view the page draws: the stored pictures carry their signed addresses

  if (action === "sheet_queue") {
    const view_ = body.view === "mine" ? "mine" : body.view === "company" ? "company" : body.view === "archived" ? "archived" : "queue", needle = String(body.q || "").toLowerCase().trim();
    let rows = await store.list(org);
    rows = view_ === "archived" ? rows.filter(s => s.archived) : rows.filter(s => !s.archived);   // an archived case is out of every working group
    if (view_ === "mine") rows = rows.filter(s => s.owner_seat === seat);
    if (view_ === "queue") { const today = now.slice(0, 10); rows = rows.filter(s => s.created_at.slice(0, 10) === today || s.status === "New" || s.status === "In progress" || s.status === "Needs the car"); }
    if (needle) rows = rows.filter(s => [s.vin, s.car_label, s.owner_seat, s.status, s.created_at.slice(0, 10), s.final && s.final.reportNumber].filter(Boolean).join(" ").toLowerCase().includes(needle));
    rows.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    return { ok: true, view: view_, rows: rows.map(s => ({ ...summaryOf(s, ctx.nowMs), access: accessOf(s, seat, priv).role })), seat, seatName: ctx.seatName || null, viewAs: ctx.viewAs || null, org: (await orgSettings(ctx)).name };
  }
  if (action === "sheet_new") {   // a VIN or year make model typed at the top
    const text = String(body.text || "").trim().slice(0, 120); if (!text) return refuse("Type a VIN or a year, make and model.");
    const vin = VIN_RE.test(text.toUpperCase()) ? text.toUpperCase() : null;
    const miles = Math.round(Number(String(body.mileage == null ? "" : body.mileage).replace(/[^\d]/g, ""))) || null;
    const read0 = await readSheet(ctx.env, vin ? { vin, mileage: miles } : { text, mileage: miles }), retry0 = isRetry(read0) ? retryOf(read0) : null, read = retry0 ? null : read0;
    const sheet = { id: _c.id(), owner_seat: seat, forwarded_by: seat, vin, typedText: vin ? undefined : text, car_label: read ? (carLabel(read.car.decode) || read.car.label) : text, status: "New", created_at: now, opened_at: null, submission: { typed: true, mileage: miles, consignor: null, photos: [], documents: [], note: null }, state: { ...emptyState(), askedMileage: miles }, read: read || null, events: [{ at: now, seat, what: "created" }] };
    await store.insert(org, sheet); return { ok: true, id: sheet.id, sheet: summaryOf(sheet, ctx.nowMs), ...(retry0 ? { retry: retry0 } : {}) };
  }
  if (action === "case_decode") {   // A VIN TYPED INTO THE NEW CASE FORM (Lane D, Nov 11 2026): the engine's own VIN decode, so the page fills Year, Make, Model, Body, Trim and Gearbox as decoded and unverified. No archive read, no case made. ctx.decodeVin is injected by a check.
    const vin = String(body.vin || "").toUpperCase().replace(/[^A-Z0-9]/g, ""), bad = vinRefusal(vin); if (bad) return refuse(bad);
    const step = await vinStep(ctx, vin), decoded = decodedOf(step);   // the one VIN identity step: the car's own last listing, then the decode (lib/desk/vinStep.js)
    const warning = vinWarning(vin);
    if (!(decoded.make && decoded.model && decoded.year)) return isChassis(vin) ? { ok: true, vin, decoded: {}, chassis: true, ask: reasonLine("case.decode.ask_ymm") } : warning ? { ok: true, vin, decoded: {}, warning } : refuse(reasonLine("case.decode.refuse"));
    return { ok: true, vin, decoded, ...(isChassis(vin) ? { chassis: true } : {}), ...(warning ? { warning } : {}), ...(step.own ? { vehicle: ownView({ ownHistory: step.own.history, vinLiveMatch: step.own.vinLiveMatch }, now) } : {}) };
  }
  if (action === "case_pickers") {   // THE NEW CASE FORM'S PICKERS (Lane D, Nov 11 2026; Lane C's run: it was refused "No such sheet" because the case does not exist yet): answered from the VIN's decode alone, no case and no market read. Each picker lists what the decode named, selected; a field the decode does not name has an empty list.
    const vin = String(body.vin || "").toUpperCase().replace(/[^A-Z0-9]/g, ""); let decoded = {};
    if (vin) { const bad = vinRefusal(vin); if (bad) return refuse(bad); const step = await vinStep(ctx, vin); decoded = decodedOf(step);
      if (!(decoded.make && decoded.model && decoded.year)) { if (isChassis(vin)) return { ok: true, vin, decoded: {}, chassis: true, ask: reasonLine("case.decode.ask_ymm"), body: [], trim: [], transmission: [], pickers: { body: [], trim: [], transmission: [] } }; const w0 = vinWarning(vin); if (w0) return { ok: true, vin, decoded: {}, warning: w0, body: [], trim: [], transmission: [], pickers: { body: [], trim: [], transmission: [] } }; return refuse(reasonLine("case.decode.refuse")); } }
    const list = k => (decoded[k] ? [{ value: decoded[k].value, label: String(decoded[k].value).replace(/^./, c => c.toUpperCase()), selected: true }] : []);
    const pk = { body: list("body"), trim: list("trim"), transmission: list("transmission") };
    return { ok: true, vin: vin || null, decoded, ...(vin && vinWarning(vin) ? { warning: vinWarning(vin) } : {}), ...pk, pickers: pk };   // the lists are at the top (the form reads them there) and under pickers
  }
  if (action === "case_new") try {   // DESK V3: a case from the new case form (or by hand). Every field the form sends is the seller's (source seller). ONE engine call: the car is read, the decode fills what the seller left blank, the market reference is stored on the case, and the answer is the full case view, so the page needs no second read.
    const v0 = body.vehicle && typeof body.vehicle === "object" ? body.vehicle : {}, pick = (...ks) => { for (const k of ks) if (body[k] != null && String(body[k]).trim() !== "") return body[k]; return undefined; };
    const text = String(pick("text", "query", "car") || "").trim().slice(0, 120), vinIn = VIN_RE.test(text.toUpperCase()) ? text.toUpperCase() : (pick("vin") ? String(pick("vin")).toUpperCase() : (v0.vin || null));
    const form = { ...v0, ...(vinIn ? { vin: vinIn } : {}), ...Object.fromEntries([["mileage", pick("mileage", "miles")], ["transmission", pick("transmission")], ["body", pick("body", "bodyStyle")], ["colour", pick("colour", "color")], ["year", pick("year")], ["make", pick("make")], ["model", pick("model")]].filter(([, x]) => x !== undefined)) };
    const sellerIn = { name: pick("seller_name", "sellerName") || (body.seller && body.seller.name) || null, asking_price: pick("asking_price", "askingPrice", "asking"), notes: pick("seller_notes", "sellerNotes", "notes") };
    let c = newCase({ org, now, vehicle: form, source: Object.keys(v0).length && !text ? "analyst_verified" : "seller", seller: sellerIn.name || sellerIn.asking_price || sellerIn.notes ? sellerIn : null });
    if (vinIn && !VIN_RE.test(String(vinIn))) return refuse(reasonLine("case.new.refuse.vin_format"));
    const askable = c.fields.vin.value || (c.fields.year.value && c.fields.make.value && c.fields.model.value) || text;
    let retry = null, recalled = false;
    if (askable) {
      const o = await W.openCaseRead(c, input => (ctx.readSheet || readSheet)(ctx.env, input), { caseDate: now.slice(0, 10), now, text, fromForm: !!vinIn }), rd = o.read;   // the one road a forwarded lead takes too
      if (isRetry(rd)) { retry = retryOf(rd); c = o.case; }   // the case keeps no answer and carries the marker that says the read did not complete (Retry offered)
      else if (rd) { c = o.case; recalled = o.recalled; }
      else retry = { retry: true, retryAfterMs: null, line: c.fields.vin.value && !(c.fields.year.value && c.fields.make.value && c.fields.model.value) ? reasonLine("case.new.refuse.vin_not_decoded") : "The read is not available for this car yet." };   // a VIN the engine could not decode keeps the case (the analyst can name the car) and says why
    }
    c = W.syncNeeds(c);   // a new case stays at stage new (it is a lead nobody has worked yet); the open items it starts with are listed
    const sheet = { id: _c.id(), owner_seat: seat, forwarded_by: seat, vin: c.fields.vin.value, car_label: [c.fields.year.value, c.fields.make.value, c.fields.model.value].filter(Boolean).join(" ") || text || "Needs the car", status: c.fields.vin.value || (c.fields.make.value && c.fields.model.value) ? "New" : "Needs the car", created_at: now, opened_at: null, typedText: c.fields.vin.value ? undefined : (text || undefined), submission: { typed: true, mileage: c.fields.mileage.value, consignor: c.seller ? { name: c.seller.name, email: null } : null, photos: [], documents: [], note: c.seller && c.seller.notes || null }, state: emptyState(), read: null, events: [{ at: now, seat, what: "created" }], case: c };
    // THE PHOTOS ARE PART OF THE CASE WRITE (Lane D, Nov 12 2026; Sam's second run: a photo row was refused by the database and the case stayed, without its photos). Every photo is checked and converted BEFORE anything is stored; the case is stored, then each photo; if any step fails the case is taken out again and nothing is left, and the answer says so.
    // A NEW CASE TAKES NO PHOTO BYTES (Lane C's live run, Nov 15 2026: three screenshots in one create passed the platform's 4.5 MB and the request was dropped with no reason). The case is made first; each photo is added to it by the direct route (photo_upload_start, the PUT, photo_upload_commit). A create that carries photos is refused with the reason.
    if (Array.isArray(body.photos) && body.photos.length) return refuse(reasonLine("case.new.refuse.photos_route"));
    const given = [], accepted = [];
    try { await store.insert(org, sheet); } catch (e) { return refuse(reasonLine("case.new.refuse.not_saved", { detail: String(e && e.message || e).slice(0, 80) })); }
    if (accepted.length) {
      try {
        let sh = { ...sheet, submission: { ...sheet.submission, photos: [] }, state: { ...(sheet.state || {}), photosSelected: [] } }, cc = sheet.case;
        for (const [i, a] of accepted.entries()) { const ph = await store.addPhoto(org, sh, { name: a.name, jpeg: a.jpeg, width: a.width, height: a.height, position: i }); sh = { ...sh, submission: { ...sh.submission, photos: [...sh.submission.photos, ph] }, state: { ...sh.state, photosSelected: [...sh.state.photosSelected, ph.id] } }; cc = W.addCasePhoto(cc, ph, now); }
        sheet.submission = sh.submission; sheet.state = sh.state; sheet.case = W.settle(W.syncNeeds(cc), now);
        await store.put(org, sheet);
      } catch (e) { try { await store.discard(org, sheet.id); } catch {} return refuse(reasonLine("case.new.refuse.photo", { n: 0, why: String(e && e.message || e).slice(0, 100) })); }
    }
    return { ok: true, id: sheet.id, recalled, ...(retry ? { retry } : {}), case: await caseViewOf(sheet), sheet: summaryOf(sheet, ctx.nowMs) };
  } catch (e) { return refuse(reasonLine("case.new.refuse.read_failed", { detail: String(e && e.message || e).slice(0, 80) })); }
  if (action === "case_discard") {   // a case the page just made and could not finish (a photo refused): the owner takes it out again, only while it is untouched (a new case, never finalized)
    const s0 = await get(body.id); if (!s0) return { ok: true, id: String(body.id || ""), gone: true };
    if (accessOf(s0, seat, priv).role !== "owner" || !["New", "Needs the car"].includes(s0.status) || (s0.version || 0) > (Number(body.maxVersion) || 1)) return refuse(reasonLine("case.new.refuse.discard"));
    try { await store.discard(org, s0.id); } catch (e) { return refuse(String(e && e.message || e).slice(0, 160)); }
    return { ok: true, id: s0.id, gone: true };
  }
  // THE QUEUE OPS (Lane D, Nov 12 2026): case_archive, case_restore, case_delete. Archive and restore write an event beside the sheet (docs/supabase-desk-archive.sql, the sheet is locked once finalized) and keep everything; delete goes through the Desk's logged delete path and never touches a finalized, a sent or a seeded sample case.
  if (action === "case_archive" || action === "case_restore" || action === "case_delete") {
    const s0 = await get(body.id); if (!s0) return refuse(reasonLine("case.archive.refuse.no_case"));
    if (accessOf(s0, seat, priv).role !== "owner") return refuse(reasonLine("case.archive.refuse.owner"));
    const by = String(ctx.seatName || seat), day = now.slice(0, 10);
    const queueOf = async () => queueCounts(await store.list(org), now);
    if (action === "case_delete") {
      if (s0.demo === true || /^pv_/.test(String(s0.id))) return refuse(reasonLine("case.delete.refuse.sample"));
      if (s0.status === "Finalised" || s0.status === "Sent" || s0.final || (s0.case && s0.case.status === "finalized")) return refuse(reasonLine("case.delete.refuse.final"));
      try { await store.discard(org, s0.id, "crew:case_delete:" + by); } catch (e) { return refuse(String(e && e.message || e).slice(0, 160)); }
      return { ok: true, id: s0.id, gone: true, handlingLine: reasonLine("case.handling.deleted", { by, date: longDate(day) || "" }), queue: await queueOf() };
    }
    if (action === "case_archive") {
      if (s0.archived) return refuse(reasonLine("case.archive.refuse.already"));
      const from = workingStageOf(ensureCase(s0, now), s0);
      try { await store.addArchiveEvent(org, s0.id, { kind: "archive", at: now, by, from }); } catch (e) { return refuse(reasonLine("case.archive.refuse.not_ready")); }
    } else {
      if (!s0.archived) return refuse(reasonLine("case.archive.refuse.not_archived"));
      try { await store.addArchiveEvent(org, s0.id, { kind: "restore", at: now, by, from: s0.archived.from }); } catch (e) { return refuse(reasonLine("case.archive.refuse.not_ready")); }
    }
    const fresh = await get(s0.id);
    return { ok: true, id: fresh.id, case: await caseViewOf(fresh), queue: await queueOf() };
  }
  if (action === "case_reread_email") {   // RE-READ THE EMAIL (Lane D, Nov 13 2026): the stored first email read again with today's parser; only the empty places of the case are filled (lib/desk/intake/reread.js). ctx.fetchObject and ctx.mailDeps are injected by a check.
    const s0 = await get(body.id); if (!s0 || !s0.case || !s0.case.fields) return refuse(reasonLine("case.reread.refuse_no_case"));
    if (s0.archived) return refuse(reasonLine("case.archive.refuse.archived_edit"));
    if (s0.case.status === "finalized" || s0.status === "Finalised" || s0.status === "Sent") return refuse(reasonLine("case.reread.refuse_finalized"));
    if (!accessOf(s0, seat, priv).canEdit) return refuse(accessOf(s0, seat, priv).why || "This sheet is read only to you.");
    if (s0.case.origin !== "forwarded") return refuse(reasonLine("case.reread.refuse_origin"));
    // EVERY EXIT OF THE RE-READ IS WRITTEN ON THE CASE (Nov 16 2026; Lane C's trace on lead 17e2a09b: the re-read wrote nothing and nothing said why): an audit entry says what happened, whatever the outcome (a stored email missing or unreadable, no changes, the parser found no car, the engine read taken or failed). It does the whole job: it fills the empty places, and when the car is identified (a VIN, a chassis, or the year, make and model) and the case has no market answer it takes the engine read the way a fresh intake does, so the title, the market view, the ladder and the own history are there.
    const note = (c, key, args) => { const c1 = structuredClone(c); logAudit(c1, { at: now, by: "intake", what: reasonLine("case.reread.audit." + key, args || {}), field: "email", to: key }); return c1; };
    const save = async (c, extra = {}) => { const next = { ...s0, case: c, version: (s0.version || 0) + 1 }; return (await store.putIf(org, next, s0.version || 0)) ? next : null; };   // a read of the email is the system's, not the analyst's: the case stays where it was (New stays New)
    const se = s0.submission && s0.submission.sourceEmail;
    if (!(se && se.path)) { await save(note(s0.case, "no_email")); return refuse(reasonLine("case.reread.refuse_no_email")); }
    const raw = await (ctx.fetchObject ? ctx.fetchObject(org, se.path) : (await import("./storage.js")).downloadObject(ctx.env, org, se.path)).catch(() => null);
    const md = ctx.mailDeps || await (async () => { const [veh, run] = await Promise.all([import("../vehicle.js"), import("./intake/run.js")]); let simpleParser = null; try { simpleParser = (await import("mailparser")).simpleParser; } catch { /* no parser */ } return { simpleParser, resolveVehicle: veh.resolveVehicle, decodeVin: run.decodeVinPublic }; })();
    const out = await (await import("./intake/reread.js")).rereadEmail({ sheet: s0, raw, deps: md, orgId: org, at: now, internal: ctx.internalEmails || [] });
    if (!out.ok) { await save(note(s0.case, raw ? "unreadable" : "no_email")); return refuse(reasonLine(raw ? "case.reread.refuse_unreadable" : "case.reread.refuse_no_email")); }
    let c = out.n ? out.case : s0.case, engine = null, changed = out.n > 0;
    const f = k => c.fields[k] && c.fields[k].value, chassis = (c.lead && c.lead.facts && c.lead.facts.chassis && c.lead.facts.chassis.value) || null, askable = !!(f("vin") || (f("year") && f("make") && f("model"))), identified = askable || !!chassis;
    if (!identified) { c = note(c, "no_car"); changed = true; }
    else if (!askable) { c = note(c, "no_words"); changed = true; }
    else if (!c.desk || W.needsRecall(c)) {
      const o = await W.openCaseRead(c, input => (ctx.readSheet || readSheet)(ctx.env, input), { caseDate: now.slice(0, 10), now, fromForm: true });
      if (o.recalled) { c = W.settle(W.syncNeeds(o.case), now); c = note(c, "engine_read"); engine = "read"; changed = true; }
      else { c = note(c, "engine_failed"); engine = "failed"; changed = true; }
    }
    else if (!out.n) { c = note(c, "none"); changed = true; }
    if (!changed) { c = note(c, "none"); }
    const fresh = await save(c); if (!fresh) return stale();
    return out.n || engine === "read" ? { ok: true, filled: out.n, keys: out.filled, engine, line: reasonLine("case.reread.done", { n: out.n }), case: await caseViewOf(fresh) } : { ok: true, filled: 0, engine, line: reasonLine(engine === "failed" ? "case.reread.engine_failed" : !identified ? "case.reread.no_car" : "case.reread.nothing"), case: await caseViewOf(fresh) };
  }
  // RETRY THE MARKET READ (Lane D, Nov 16 2026; the 2006 911 whose stored answer was partial): case_reread_market { id } reads the market again for the case and stores the answer only when it is complete; a partial, failed or retry read changes nothing (the earlier good answer stays) and says "The market read did not complete. Retry." The same road as a fresh intake takes (openCaseRead).
  if (action === "case_reread_market") {
    const s0 = await get(body.id); if (!s0 || !s0.case || !s0.case.fields) return refuse(reasonLine("case.reread.refuse_no_case"));
    if (s0.archived) return refuse(reasonLine("case.archive.refuse.archived_edit"));
    if (s0.case.status === "finalized" || s0.status === "Finalised" || s0.status === "Sent") return refuse(reasonLine("case.reread.refuse_finalized"));
    if (!accessOf(s0, seat, priv).canEdit) return refuse(accessOf(s0, seat, priv).why || "This sheet is read only to you.");
    const c0 = ensureCase(s0, now), f = k => c0.fields[k] && c0.fields[k].value; if (!(f("vin") || (f("year") && f("make") && f("model")))) return refuse(reasonLine("case.read.refuse_no_car"));
    const o = await W.openCaseRead(c0, input => (ctx.readSheet || readSheet)(ctx.env, input), { caseDate: now.slice(0, 10), now, fromForm: c0.origin === "forwarded" });
    const stamp = (c, key) => { const k = structuredClone(c); logAudit(k, { at: now, by: "desk", what: reasonLine(key), field: "market", to: key }); return k; };
    if (!o.recalled) { const keep = stamp(s0.case.readRetry ? s0.case : W.markReadRetry(s0.case, now, (o.read && o.read.why) || "retry"), "case.read.audit.retry_failed"); const failed = { ...s0, case: keep, version: (s0.version || 0) + 1 }; if (!(await store.putIf(org, failed, s0.version || 0))) return stale(); return { ok: false, refused: true, why: reasonLine("case.read.incomplete"), retry: { retry: true, line: reasonLine("case.read.incomplete") }, case: await caseViewOf(failed) }; }
    const next = { ...s0, case: stamp(W.settle(W.syncNeeds(o.case), now), "case.read.audit.retry_taken"), version: (s0.version || 0) + 1 };
    if (!(await store.putIf(org, next, s0.version || 0))) return stale();
    return { ok: true, case: await caseViewOf(next) };
  }
  if (action === "case_edit") {   // DESK V3 STAGE 2: one edit to the case. The rules are in lib/desk/caseWorkflow.js; this saves the case under the sheet's version (a second tab is refused whole) and re-calls the engine only when its inputs moved.
    let s0 = await get(body.id); if (!s0) return refuse("No such sheet.");
    // A FINALIZED SHEET IS LOCKED IN THE DATABASE (desk_sheet_immutable), so a later change cannot edit it: it makes the next version as a revision sheet that corrects it (the same road sheet_correct takes), the case at version n plus 1.
    // The finalized sheet, its version row and its report are never touched.
    let revisedFrom = null;
    if ((s0.status === "Finalised" || s0.status === "Sent") && s0.case && s0.case.status === "finalized" && (s0.owner_seat === seat || priv)) {
      const c1 = structuredClone(s0.case); c1.version += 1; c1.status = "in_review"; logAudit(c1, { at: now, by: "desk", what: "reopened as version " + c1.version }); c1.opens = [{ seat: String(seat), at: now }]; c1.handling_seconds = null;   // handling time of a revision is the time on the revision
      const rev = { ...s0, id: _c.id(), status: "In progress", created_at: now, opened_at: now, final: undefined, sent: undefined, exports: [], corrects: s0.id, correctsReport: s0.final && s0.final.reportNumber, version: 0, case: c1, events: [...(s0.events || []), { at: now, seat, what: "revision (version " + c1.version + ") of " + ((s0.final && s0.final.reportNumber) || s0.id) }] };
      delete rev.final; delete rev.sent; await store.insert(org, rev); revisedFrom = s0.id; s0 = rev; body = { ...body, id: rev.id, baseVersion: 0 };
    }
    if (s0.archived) return refuse(reasonLine("case.archive.refuse.archived_edit"));
    if (!accessOf(s0, seat, priv).canEdit) return refuse(accessOf(s0, seat, priv).why || "This sheet is read only to you.");
    const op = String(body.op || ""), was = baseOf(body, s0); let c = ensureCase(s0, now), asked = null;
    if (SHAPE_OPS.includes(op) && !((op === "condition_set" && (body.condition == null || body.condition === "" || Number(body.condition) === 0)) || (op === "condition" && !(body.selected && body.selected.tier)))) c = await shapeCurrent(ctx, c, now);   // the answer this edit reads is at the current shape; going back to no condition (Any condition) reads nothing, ever
    if (op === "condition_set" && Number(body.condition) > 0 && c.desk && c.desk.reserveLadder && Array.isArray(c.desk.reserveLadder.rungs) && !c.desk.reserveLadder.byCondition) return refuse(reasonLine("case.condition.refuse_shape"));   // never a silent fall back to the recommended rung: the condition is not set on an answer with no rung for it
    try {
      if (op === "field") c = W.correctField(c, String(body.field), body.value, { now });
      else if (op === "verify") {   // Mark verified on an empty field used to answer "nothing to verify" on every case that had not been told yet: give it a value to record first (the analyst's entry), or say what to do
        const fk = String(body.field); if (c.fields[fk] && c.fields[fk].value == null) { if (body.value == null || String(body.value).trim() === "") return refuse(reasonLine("case.need.verify_empty", { label: fk === "accident_history" ? "the accident history" : "this field" })); c = W.correctField(c, fk, body.value, { now }); }
        c = W.verify(c, fk, { now });
      }
      else if (op === "seller_said") { const fk = String(body.field || ""); if (!W.SAID_FIELDS.includes(fk)) return refuse(reasonLine("case.need.said_field")); if (!String(body.text == null ? "" : body.text).trim()) return refuse(reasonLine("case.need.said_empty")); const was = c.fields[fk].value; c = W.sellerSaid(c, fk, body.text, now); if (fk === "mileage" && c.fields.mileage.value === was && was == null) return refuse(reasonLine("case.need.said_mileage")); }   // the seller's statement for a fact the case lacks, saved as the seller's, unverified; Mark verified then works
      else if (op === "need_said" || op === "need_proceed" || op === "need_verify") {   // the three attention buttons, each { item, words }: the words are what the seller said, why we proceed, or what was checked
        const o5 = op === "need_said" ? W.needSays(c, body.item, body.words, now) : op === "need_proceed" ? W.needProceeds(c, body.item, now) : W.needVerifies(c, body.item, body.words, now); if (o5.refuse) return refuse(reasonLine(o5.refuse)); c = o5.case; }
      else if (op === "assessment") c = W.setAssessment(c, body.patch, now);
      else if (op === "reserve") c = W.setReserve(c, body.patch, now);
      else if (op === "restore") { const r = restoreSale(c, { saleId: body.saleId, now }); if (!r) return refuse("That sale is not excluded (saleId)."); c = W.settle(W.syncNeeds(r), now); }
      else if (op === "window") { const w = W.setWindow(c, body.months, now); if (!w) return refuse("The period is 3, 6, 12 or 24 months (months), and 24 only when the sales on record reach back more than a year."); c = w; }
      else if (op === "comparables") c = W.selectComparables(c, body.ids, now);
      else if (op === "condition") c = W.setCondition(c, body.selected, now);
      else if (op === "seller_words") { const o4 = editSellerWords(c, body.field, body.text, now); if (o4.refuse) return refuse(reasonLine(o4.refuse)); c = o4.case; }
      else if (op === "reserve_use") { const o3 = W.reserveUse(c, body.key, now, body.figure); if (o3.refuse) return refuse(o3.name ? reasonLine(o3.refuse, { name: o3.name }) : reasonLine(o3.refuse)); c = o3.case; }
      else if (op === "report_rungs_set") { const o4 = W.reportRungsSet(c, body.keys, now); if (o4.refuse) return refuse(reasonLine(o4.refuse)); c = o4.case; }
      else if (op === "condition_set") { const o2 = W.setConditionChoice(c, body.condition, body.note, now); if (o2.refuse) return refuse(reasonLine(o2.refuse)); c = o2.case; }
      else if (op === "exclude") {
        if (body.viaComparable) {   // comparable_exclude { id, item, reason } (order 2318 item 3): a sale is left out of the report with a reason, kept on the case, printed nowhere
          if (!String(body.saleId == null ? "" : body.saleId).trim()) return refuse(reasonLine("case.exclude.refuse_item"));
          if (!String(body.reason == null ? "" : body.reason).trim()) return refuse(reasonLine("case.exclude.refuse_reason"));
          if (!((c.desk && c.desk.comparables) || []).some(x => String(x.id) === String(body.saleId))) return refuse(reasonLine("case.exclude.refuse_none"));
        }
        c = W.settle(W.syncNeeds(excludeSale(c, { saleId: body.saleId, scope: body.scope, reason: body.reason, now })), now);
      }
      // THE ITEM IS NAMED BY ITS KEY, in body.item. body.id is the sheet and no op may use it for anything else: the page's edit() sets it to the open sheet, so a need key sent as id arrived as the sheet id and every needs attention action answered "no such item" (Lane D, Nov 10 2026).
      else if (op === "need") { const key = String(body.item || ""); if (!key) return refuse("Say which item (item)."); const rule = W.NEED_RULES.find(x => x.id === key); if (String(body.state) === "done" && rule && c.needs_review.some(n => n.id === key) && rule.applies(c)) return refuse(reasonLine("case.need.close_how." + (["mileage_unconfirmed", "accident_unclear", "service_documents"].includes(key) ? key : "other")));   // done while the cause stands would reopen at once: say how to close it instead of appearing to do nothing
        c = W.settle(W.setNeed(c, key, String(body.state), String(body.reason || "")), now); }
      else if (op === "report_reserve_mode") { const o = W.setReportReserveMode(c, body.mode === undefined ? null : body.mode, body.why, now); if (o.refuse) return refuse(reasonLine(o.refuse)); c = o.case; }
      else if (op === "ask") { const a = W.askFields(c, Array.isArray(body.fields) ? body.fields.map(String) : [], now); c = a.case; asked = a.fields; }
      else if (op === "cover") c = W.settle(W.setCover(c, String(body.photoId), now), now);
      else if (op === "report_photos") { const all = body.ids === "all" || body.all === true; c = W.settle(W.selectPhotos(c, all ? c.photos.items.map(p => p.id) : Array.isArray(body.ids) ? body.ids.map(String) : [], now), now); }   // Select all sends every id, or all: true; an id the case does not hold is ignored, never an error
      else if (op === "considered_edit") c = W.settle(W.editCasedItem(c, String(body.item || ""), { label: body.label, title: body.title, text: body.text, inReport: body.inReport }, now), now);   // WHAT WE TOOK INTO ACCOUNT: the engine's items are the start, the analyst edits, removes and adds (lib/desk/considered.js)
      else if (op === "considered_remove") c = W.settle(W.removeCasedItem(c, String(body.item || ""), now), now);
      else if (op === "considered_add") c = W.settle(W.addCasedItem(c, { title: body.label !== undefined ? body.label : body.title, text: body.text }, now), now);
      else if (op === "step_edit") c = W.editNextStep(c, String(body.step || ""), body.text, now);   // steps are named by body.step; id is the sheet
      else if (op === "step_remove") c = W.removeNextStep(c, String(body.step || ""), now);
      else if (op === "step_add") c = W.addNextStep(c, body.text, now);
      else if (op === "step_order") c = W.orderNextSteps(c, body.order, now);
      else if (op === "doc_add") {
        const kind = String(body.kind || ""), title = String(body.title || "").replace(/[\u0000-\u001f]+/g, " ").trim().slice(0, 120);
        if (!DOC_KINDS.includes(kind)) return refuse("Say what kind of document it is: " + DOC_KINDS.join(", ") + ".");
        if (!title) return refuse("Give the document a title.");
        let buf; try { buf = Buffer.from(String(body.data || ""), "base64"); } catch { buf = null; }
        if (!buf || !buf.length || buf.length > MAX_DOC_BYTES) return refuse(reasonLine("case.doc.size"));
        const ft = docFileOf(buf, body.name || ""); if (!ft) return refuse(reasonLine("case.doc.type"));
        if ((c.documents || []).length >= 40) return refuse("A case takes up to 40 documents.");
        const filename = String(body.name || title).replace(/[\\/\u0000-\u001f]+/g, "_").slice(0, 120), contentType = ft.contentType;
        let stored; try { stored = await store.addDocument(org, s0, { name: filename, contentType, buf }); } catch (e) { return refuse(String(e.message || e).slice(0, 160)); }
        c = W.settle(W.addCaseDocument(c, { id: stored.id, name: filename, kind, title, bytes: buf.length, contentType, storedAs: stored.path || null }, now), now);
        s0 = { ...s0, submission: { ...s0.submission, documents: [...(s0.submission.documents || []).filter(d => String(d.id) !== String(stored.id)), { id: stored.id, name: filename, kind, title, bytes: buf.length, contentType, path: stored.path || null }] } };   // the sheet's own list too, so the older strip and the old report see it: one document, listed once
      }
      else if (op === "doc_upload_start") {   // THE LARGE-DOCUMENT ROUTE, step one: the kind, title, name and size are checked here and an upload address for one file is returned; the bytes go straight to the org's bucket (same bucket and naming as every document), never through this function
        const kind = String(body.kind || ""), title = String(body.title || "").replace(/[\u0000-\u001f]+/g, " ").trim().slice(0, 120), size = Number(body.size), ext = docExtOf(body.name);
        if (!DOC_KINDS.includes(kind)) return refuse("Say what kind of document it is: " + DOC_KINDS.join(", ") + ".");
        if (!title) return refuse("Give the document a title.");
        if (!ext) return refuse(reasonLine("case.doc.type"));
        if (!Number.isFinite(size) || size < 1 || size > MAX_DOC_BYTES) return refuse(reasonLine("case.doc.size"));
        if ((c.documents || []).length >= 40) return refuse("A case takes up to 40 documents.");
        const uid = _c.id(); let up; try { up = await store.uploadStart(org, s0, { id: uid, ext }); } catch (e) { return refuse(reasonLine("case.doc.upload_busy")); }
        return { ok: true, upload: { id: uid, url: up.url, method: up.method, ext, maxBytes: MAX_DOC_BYTES } };   // nothing is saved on the case yet: the case changes only when the file has arrived and been read (doc_upload_commit)
      }
      else if (op === "doc_upload_commit") {   // step two: the file has been sent to the address; read its size and first bytes, tell its type by them, and only then file it on the case. Anything that is not what it said is removed, never listed.
        const uid = String(body.upload || ""), kind = String(body.kind || ""), title = String(body.title || "").replace(/[\u0000-\u001f]+/g, " ").trim().slice(0, 120), ext = docExtOf(body.name);
        if (!UUID_RE.test(uid) || !ext || !DOC_KINDS.includes(kind) || !title) return refuse(reasonLine("case.doc.not_arrived"));
        if ((c.documents || []).some(d => String(d.id) === uid)) return refuse(reasonLine("case.doc.not_arrived"));   // one upload is one document: a second commit of the same upload is refused and the file already filed is left alone
        const got = await store.uploadHead(org, s0, { id: uid, ext }).catch(() => null); if (!got) return refuse(reasonLine("case.doc.not_arrived"));
        const ft = got.bytes >= 1 && got.bytes <= MAX_DOC_BYTES ? docFileOf(got.head, body.name || "") : null;
        if (!ft) { await store.uploadAbort(org, s0, { id: uid, ext }).catch(() => {}); return refuse(got.bytes >= 1 && got.bytes <= MAX_DOC_BYTES ? reasonLine("case.doc.type") : reasonLine("case.doc.size")); }
        const filename = String(body.name || title).replace(/[\\/\u0000-\u001f]+/g, "_").slice(0, 120);
        let stored; try { stored = await store.uploadCommit(org, s0, { id: uid, ext, name: filename, contentType: ft.contentType, bytes: got.bytes }); } catch (e) { await store.uploadAbort(org, s0, { id: uid, ext }).catch(() => {}); return refuse(String(e.message || e).slice(0, 160)); }
        c = W.settle(W.addCaseDocument(c, { id: stored.id, name: filename, kind, title, bytes: got.bytes, contentType: ft.contentType, storedAs: stored.path || null }, now), now);
        s0 = { ...s0, submission: { ...s0.submission, documents: [...(s0.submission.documents || []).filter(d => String(d.id) !== String(stored.id)), { id: stored.id, name: filename, kind, title, bytes: got.bytes, contentType: ft.contentType, path: stored.path || null }] } };
      }
      else if (op === "doc_kind") {   // the kind of a document the case or the sheet holds, corrected by the analyst
        const id = String(body.item || ""), kind = String(body.kind || ""), onCase = (c.documents || []).some(d => String(d.id) === id), onSheet = ((s0.submission && s0.submission.documents) || []).some(d => String(d.id) === id);
        if (!id || !(onCase || onSheet)) return refuse(reasonLine("case.doc.no_item")); if (!DOC_KINDS.includes(kind)) return refuse(reasonLine("case.doc.kind_bad", { kinds: DOC_KINDS.join(", ") }));
        c = W.setDocumentKind(c, id, kind, now); s0 = { ...s0, submission: { ...s0.submission, documents: ((s0.submission && s0.submission.documents) || []).map(d => (String(d.id) === id ? { ...d, kind } : d)) } };
      }
      else if (op === "doc_remove") {   // a document taken off the case (and off the sheet's own list), its stored file deleted first. Its need reopens when it was the service invoice.
        const id = String(body.item || ""); const onCase = (c.documents || []).some(d => String(d.id) === id), onSheet = ((s0.submission && s0.submission.documents) || []).some(d => String(d.id) === id);
        if (!id || !(onCase || onSheet)) return refuse(reasonLine("case.doc.no_item"));
        // THE FILE GOES WITH THE DOCUMENT (Nov 15 2026): the stored object and its row are deleted and the object proved gone BEFORE the case drops the document or success is reported; a failure leaves the document where it was
        { const dd = (c.documents || []).find(d => String(d.id) === id) || ((s0.submission && s0.submission.documents) || []).find(d => String(d.id) === id), path = dd && (dd.storedAs || dd.path) || null;
          if (store.removeDocument) { let r; try { r = await store.removeDocument(org, s0, { id, path }); } catch (e) { r = { ok: false }; } if (!r || r.ok !== true) return refuse(reasonLine("case.doc.remove_failed")); } }
        c = W.settle(W.removeCaseDocument(c, id, now), now); s0 = { ...s0, submission: { ...s0.submission, documents: (s0.submission.documents || []).filter(d => String(d.id) !== id) } };
      }
      else if (op === "photo_upload_start") {   // THE DIRECT PHOTO ROUTE, step one: the name and size are checked here and an upload address for one photo is returned; the bytes go straight to the org's bucket, never through this function
        const size = Number(body.size), ext = photoExtOf(body.name);
        if (!ext) return refuse(reasonLine("case.photo.refuse.type"));
        if (!Number.isFinite(size) || size < 1 || size > MAX_PHOTO_UPLOAD) return refuse(reasonLine("case.photo.refuse.size_upload"));
        if ((s0.submission.photos || []).length >= MAX_HAND_PHOTOS) return refuse(`A sheet takes up to ${MAX_HAND_PHOTOS} photos.`);
        const uid = _c.id(); let up; try { up = await store.uploadStart(org, s0, { id: uid, ext, kind: "in" }); } catch (e) { return refuse(reasonLine("case.doc.upload_busy")); }
        return { ok: true, upload: { id: uid, url: up.url, method: up.method, ext, maxBytes: MAX_PHOTO_UPLOAD } };
      }
      else if (op === "photo_upload_commit") {   // step two: the file has been sent; its type is told by its first bytes, it is read back, made upright and resized, filed on the case as a photo, and the raw upload removed. Anything that is not a photo is removed, never listed.
        const uid = String(body.upload || ""), ext = photoExtOf(body.name);
        if (!UUID_RE.test(uid) || !ext) return refuse(reasonLine("case.photo.not_arrived"));
        if ((s0.submission.photos || []).length >= MAX_HAND_PHOTOS) { await store.uploadAbort(org, s0, { id: uid, ext, kind: "in" }).catch(() => {}); return refuse(`A sheet takes up to ${MAX_HAND_PHOTOS} photos.`); }
        const got = await store.uploadHead(org, s0, { id: uid, ext, kind: "in" }).catch(() => null); if (!got) return refuse(reasonLine("case.photo.not_arrived"));
        const gone = async why => { await store.uploadAbort(org, s0, { id: uid, ext, kind: "in" }).catch(() => {}); return refuse(why); };
        if (!(got.bytes >= 1 && got.bytes <= MAX_PHOTO_UPLOAD)) return gone(reasonLine("case.photo.refuse.size_upload"));
        const raw = await store.uploadRead(org, s0, { id: uid, ext, kind: "in", max: MAX_PHOTO_UPLOAD }).catch(() => null); if (!raw) return gone(reasonLine("case.photo.not_arrived"));
        const acc = await acceptPhotoBytes(raw, body.name, MAX_PHOTO_UPLOAD); if (acc.refuse) return gone(acc.refuse);
        if (hasPhotoHash(s0, c, photoHashOf(raw))) { await store.uploadAbort(org, s0, { id: uid, ext, kind: "in" }).catch(() => {}); return { ok: true, duplicate: true, line: reasonLine("case.photo.duplicate"), case: await caseViewOf(s0) }; }
        let ph; try { ph = await store.addPhoto(org, s0, { hash: photoHashOf(raw), name: String(body.name || "photo").replace(/[\\/\u0000-\u001f]+/g, "_").slice(0, 120), jpeg: acc.jpeg, width: acc.width, height: acc.height, position: (s0.submission.photos || []).length }); } catch (e) { return gone(String(e && e.message || e).slice(0, 160)); }
        await store.uploadAbort(org, s0, { id: uid, ext, kind: "in" }).catch(() => {});   // the raw upload is not kept: the case holds the upright photo
        s0 = { ...s0, submission: { ...s0.submission, photos: [...(s0.submission.photos || []), ph] }, state: { ...s0.state, photosSelected: [...(s0.state.photosSelected || []), ph.id] } };
        c = W.settle(W.addCasePhoto(c, ph, now), now);
      }
      else if (op === "photo_remove") {   // a photo taken off the case: its stored files and row are deleted and proved gone BEFORE the case drops it, as for a document; a failure leaves the photo where it was
        const id = String(body.photoId || body.item || ""), onSheet = (s0.submission.photos || []).find(p => String(p.id) === id), onCase = (c.photos.items || []).some(p => p.id === id);
        if (!id || !(onSheet || onCase)) return refuse(reasonLine("case.photo.no_item"));
        if (store.removePhoto) { let r; try { r = await store.removePhoto(org, s0, { id }); } catch (e) { r = { ok: false }; } if (!r || r.ok !== true) return refuse(reasonLine("case.photo.remove_failed")); }
        c = W.settle(W.removeCasePhoto(c, id, now), now); s0 = { ...s0, submission: { ...s0.submission, photos: (s0.submission.photos || []).filter(p => String(p.id) !== id) }, state: { ...s0.state, photosSelected: (s0.state.photosSelected || []).filter(x => String(x) !== id) } };
      }
      else if (op === "photo_add") {
        if ((s0.submission.photos || []).length >= MAX_HAND_PHOTOS) return refuse(`A sheet takes up to ${MAX_HAND_PHOTOS} photos.`);
        const acc = await acceptPhoto(body, ctx); if (acc.refuse) return refuse(acc.refuse);
        if (hasPhotoHash(s0, c, acc.hash)) return { ok: true, duplicate: true, line: reasonLine("case.photo.duplicate"), case: await caseViewOf(s0) };
        const ph = await store.addPhoto(org, s0, { hash: acc.hash, name: String(body.name || "photo").replace(/[\\/\u0000-\u001f]+/g, "_").slice(0, 120), jpeg: acc.jpeg, width: acc.width, height: acc.height, position: (s0.submission.photos || []).length });
        s0 = { ...s0, submission: { ...s0.submission, photos: [...(s0.submission.photos || []), ph] }, state: { ...s0.state, photosSelected: [...(s0.state.photosSelected || []), ph.id] } };
        c = W.settle(W.addCasePhoto(c, ph, now), now);
      }
      else return refuse("Unknown edit.");
    } catch (e) { return refuse(String(e.message || e).slice(0, 200)); }
    const rr = await W.refreshEvidence(c, input => (ctx.readSheet || readSheet)(ctx.env, input), { caseDate: now.slice(0, 10), now });
    // AN EDIT THAT CHANGES WHAT THE SALES ARE READ FOR (the period, the condition, a field the engine reads, a sale set aside) with no read made leaves the figures on the earlier read under the new setting: nothing is saved and the line says so (Lane D, Nov 11 2026; the archive could not answer, as on a preview with no archive)
    if (READ_OPS.includes(op) && s0.case && s0.case.desk && !rr.recalled && (!rr.retry || rr.retry.why) && W.needsRecall(rr.case)) return refuse(reasonLine("desk4.edit_unread"));   // a partial answer is not an answer: the edit that needed the read is refused, never saved over the earlier figures
    c = W.settle(W.syncNeeds(rr.case), now);
    const fresh = { ...s0, case: c, version: (s0.version || 0) + 1 };
    if (!(await store.putIf(org, fresh, was))) return stale();
    // THE ROW A TICK OR AN EXCLUSION TOUCHED comes back with its state beside the whole list, so a page can redraw one row and keep the others (the list is never cut down to the touched rows). A sale the engine itself dropped (report_comps) comes back as gone, with its exclusion.
    const view = await caseViewOf(fresh), picked = new Set((fresh.case.selectedComparables || []).map(String));
    const touched = op === "comparables" ? new Set([...(Array.isArray(body.ids) ? body.ids : []), ...(s0.case && s0.case.selectedComparables || [])].map(String)) : op === "exclude" || op === "restore" ? new Set([String(body.saleId)]) : null;
    const rows = touched ? [...touched].map(id => { const x = ((view.desk && view.desk.comparables) || []).find(k => String(k.id) === id); return x ? { ...x, inReport: picked.has(id) } : { id, gone: true, inReport: false, ...(fresh.case.exclusions.find(e => e.saleId === id) ? { exclusion: fresh.case.exclusions.find(e => e.saleId === id) } : {}) }; }) : null;
    return { ok: true, id: fresh.id, ...(revisedFrom ? { revisedFrom } : {}), version: fresh.version, recalled: rr.recalled, ...(asked ? { asked } : {}), ...(rr.retry ? { retry: rr.retry } : {}), ...(rows ? { rows } : {}), case: view, readiness: W.readinessOf(c), reservePosition: W.reservePosition(c), reserveFigureLine: view.reserve.figureLine, reserveChoice: view.reserveChoice, reserveCheck: W.reserveCheckOf(c), reserveStart: c.desk && c.desk.reserveStart ? c.desk.reserveStart : null };
  }
  if (action === "case_send_preview" || action === "case_send") {   // DESK V4: SEND TO SELLER. The rules are in lib/desk/caseSend.js; the sending is lib/desk/send.js (the older Desk's own), through ctx.sendCase when a check injects a stand-in (a check never sends)
    const preview = action === "case_send_preview", s0 = await get(body.id); if (!s0) return refuse(reasonLine("send.refuse.no_case"));
    if (accessOf(s0, seat, priv).role !== "owner") return refuse(reasonLine("send.refuse.owner"));
    const why = CS.sendRefusal({ s0, all: await store.list(org), preview, version: body.version }); if (why) return refuse(reasonLine(why.id));
    const c = s0.case, set = await orgSettings(ctx), sd = await CS.sendingOf(ctx, org, set), earlier = (await store.exportsOf(org, s0.id)).filter(e => e.kind === "send" && e.version === c.version);
    const car = titleOfSheet(s0);   // the one title function: the email subject reads it too
    const subject = String(body.subject != null && !preview ? body.subject : reasonLine("send.subject", { org: set.name, car })).slice(0, 200), message = String(body.message != null && !preview ? body.message : (set.standardMessage || reasonLine("send.message_default"))).slice(0, 4000);
    const rep = await (await import("./reportBuild.js")).buildSellerReport(await minted(ctx, org, s0), set, { fetchImage: ctx.fetchImage, readPhoto: photoReader(ctx, org) }), sentTo = earlier.map(e => ({ to: e.detail && e.detail.to || null, at: e.at, version: e.version }));
    if (preview) { const to = CS.sellerEmailOf(s0); return { ok: true, id: s0.id, version: c.version, to, toLine: to ? reasonLine("send.to_line", { to }) : reasonLine("send.to_none"), confirm: { to, subject }, subject, message, attachmentName: rep.filename, from: sd.from, fromName: sd.fromName, sendingReady: !!sd.ready, alreadySent: sentTo }; }
    const to = String(body.to || "").trim(); if (!CS.EMAIL.test(to)) return refuse(reasonLine("send.refuse.address"));
    // THE RECIPIENT IS CONFIRMED BEFORE THE REAL SEND (order 2318 item 5): the send carries confirm { to, subject }, the very address and subject the preview showed; missing or different, nothing is sent. The export record keeps who confirmed.
    { const cf = body.confirm; if (!cf || typeof cf !== "object") return refuse(reasonLine("send.refuse.confirm_missing")); if (String(cf.to || "").trim().toLowerCase() !== to.toLowerCase() || String(cf.subject || "") !== subject) return refuse(reasonLine("send.refuse.confirm_mismatch")); }
    if (earlier.length && body.again !== true) { const e = earlier[earlier.length - 1]; return refuse(reasonLine("send.refuse.already", { to: (e.detail && e.detail.to) || "", date: longDate(String(e.at).slice(0, 10)) || "" }), { alreadySent: sentTo }); }
    if (!sd.ready) return refuse(reasonLine("send.refuse.not_ready"));
    if (!earlier.length && (await store.exportsOf(org, s0.id)).length === 0 && (await store.exportsThisMonth(org, now.slice(0, 7))) >= (Number(set.monthlyExportCap) || 200)) return refuse(reasonLine("send.refuse.cap"));
    const out = await (ctx.sendCase || CS.defaultSendCase)({ ctx, org, seat, sheet: s0, to, subject, message, pdf: { name: rep.filename, bytes: Buffer.from(rep.bytes) }, again: !!earlier.length, version: c.version, now });
    if (!out || out.ok !== true) return refuse((out && out.why) || reasonLine("send.refuse.failed"), { sendFailed: true });
    try { await store.addExport(org, s0.id, { at: now, seat, reportNumber: s0.final.reportNumber, kind: "send", version: c.version, detail: { to, subject, confirmedBy: String(seat), confirmedTo: to, ...(earlier.length ? { again: true } : {}) } }); } catch { return { ok: true, sent: { to, at: now, version: c.version, subject }, warning: "export_not_recorded" }; }
    if (store.markSent && !earlier.length) await store.markSent(org, s0.id, now, to);
    const fresh = { ...s0, ...(earlier.length ? {} : { status: "Sent" }) };
    return { ok: true, sent: { to, at: now, version: c.version, subject }, case: await caseViewOf(fresh), exports: earlier.length + 1 };
  }
  if (action === "case_finalize") {
    const s0 = await get(body.id); if (!s0) return refuse("No such sheet.");
    if (!accessOf(s0, seat, priv).canEdit) return refuse(accessOf(s0, seat, priv).why || "This sheet is read only to you.");
    const c0 = await shapeCurrent(ctx, ensureCase(s0, now), now), r = W.finalize(c0, { now, wording: reportState(c0), seat }); if (!r.ok) return refuse(r.why, { blockers: r.blockers || [] });
    try { await store.putCaseVersion(org, s0.id, r.row); } catch (e) { return refuse("That version is already written."); }
    // THE OLD FIELDS MIRROR THE VERSION ROW, never the reverse: status Finalised and sheet.final are made from the row just written, so the existing send path and the Finalised status work unchanged. The row is the source.
    const set = await orgSettings(ctx), year = now.slice(0, 4), reportNumber = `DV-${year}-${String(await store.nextReport(org, year)).padStart(4, "0")}`;
    const fresh = { ...s0, ...mirrorOf(r.row, { seat, now, reportNumber, set, read: s0.read }), case: r.case, version: (s0.version || 0) + 1, events: [...(s0.events || []), { at: now, seat, what: "finalised " + reportNumber + " (version " + r.row.version + ")" }] };
    if (!(await store.putIf(org, fresh, baseOf(body, s0)))) return stale();
    return { ok: true, id: fresh.id, version: r.row.version, reportNumber, row: r.row, case: caseView(await minted(ctx, org, fresh), await store.list(org), now, seat) };
  }
  if (action === "case_pdf") {   // DESK V3 PREVIEW PANE. draft true: the four page report for the case AS IT STANDS, DRAFT watermarked, no report number, nothing stored (no export record, no sheet write). draft false: the PDF of the finalized version.
    const s0 = await get(body.id); if (!s0) return refuse("No such sheet.");
    if (!s0.case && body.draft !== true) return refuse("This sheet has no case.");
    const acc0 = accessOf(s0, seat, priv); if (!acc0.canView) return refuse(acc0.why || "This sheet is not open to you.");
    const set = await orgSettings(ctx), { buildSellerReport } = await import("./reportBuild.js");
    if (body.draft === true) {
      const asCase = s0.case ? { ...s0, case: await shapeCurrent(ctx, s0.case, now) } : { ...s0, case: ensureCase(s0, now) };   // a sheet made before V3 has no stored case; its draft is built from the case its own fields make, and nothing is written
      const rep = await buildSellerReport(await minted(ctx, org, asCase), set, { fetchImage: ctx.fetchImage, readPhoto: photoReader(ctx, org), draft: true }, body.reportVersion);
      return { ok: true, draft: true, filename: rep.filename, reportNumber: null, version: asCase.case.version, pdf_b64: Buffer.from(rep.bytes).toString("base64"), parts: rep.parts, pages: rep.pages };
    }
    // the finalized version: this sheet if it is finalized, else the latest finalized sheet it corrects (a revision in progress has none of its own yet)
    let fin = s0, guard = 0; while (fin && !fin.final && fin.corrects && guard++ < 50) fin = await get(fin.corrects);
    if (!fin || !fin.final || !fin.case) return refuse("There is no finalized version yet.");
    if (accessOf(fin, seat, priv).role !== "owner") return refuse(`Only ${fin.owner_seat} can export this report.`);
    const used = await store.exportsThisMonth(org, now.slice(0, 7)); if (used >= (Number(set.monthlyExportCap) || 200)) return refuse(reasonLine("send.refuse.cap"));
    const rep = await buildSellerReport(await minted(ctx, org, fin), set, { fetchImage: ctx.fetchImage, readPhoto: photoReader(ctx, org) });
    try { await store.addExport(org, fin.id, { at: now, seat, reportNumber: fin.final.reportNumber, kind: "pdf", version: fin.case.version, detail: null }); } catch { return refuse("The export could not be recorded."); }
    return { ok: true, draft: false, filename: rep.filename, reportNumber: fin.final.reportNumber, version: fin.case.version, pdf_b64: Buffer.from(rep.bytes).toString("base64"), parts: rep.parts, pages: rep.pages };
  }
  if (action === "case_version") {   // the hand off: the finalized version rows, read only. The Desk sends nothing; the existing backend reads these.
    const s0 = await get(body.id); if (!s0) return refuse("No such sheet.");
    // the chain: a revision sheet corrects the sheet before it, so its versions are the whole history of the case
    let all = [], cur = s0, guard = 0; while (cur && guard++ < 50) { all = [...(await store.caseVersions(org, cur.id)), ...all]; cur = cur.corrects ? await get(cur.corrects) : null; }
    all.sort((a, b) => a.version - b.version); const want = body.version ? all.find(v => v.version === Number(body.version)) : all[all.length - 1];
    return want ? { ok: true, id: s0.id, version: want.version, row: want, versions: all.map(v => v.version) } : refuse("No finalized version yet.");
  }
  // SEAT NAME (Lane S's top bar): seat_name { name } sets the calling seat's OWN display name. One audit event beside the seat (desk_seat_events); the answer is the seat as every list serves it, { id, displayName, initials }.
  if (action === "seat_name") {
    if (ctx.viewAs) return refuse(reasonLine("case.seat.refuse_viewas"));
    const c = cleanName(body.name); if (c.refuse) return refuse(reasonLine(c.refuse));
    const names = await namesOf(), from = nameOf(seat, names, own);
    try { if (!store.setSeatName) throw new Error("no store"); await store.setSeatName(org, seat, { name: c.name, from, by: String(seat), at: now }); } catch (e) { return refuse(reasonLine("case.seat.refuse_unsaved")); }
    return { ok: true, seat: seatViewOf(seat, { ...names, [String(seat)]: c.name }, own) };
  }
  // ACTIVE TIME (Lane S's desk2): case_active { id, seconds } arrives in 30 second batches while a case is open; the seconds are added to the case's activeSeconds (and to the calling seat's). Whole seconds, 1 to 120; not recorded on a case the caller cannot work on, on a finished or archived case, or while the crew views as a seat.
  if (action === "case_active") {
    const n = Number(body.seconds); if (!Number.isInteger(n) || n < 1 || n > 120) return refuse(reasonLine("case.active.refuse_seconds"));
    const s0 = await get(body.id); if (!s0 || !s0.case) return refuse(reasonLine("case.archive.refuse.no_case"));
    if (ctx.viewAs) return { ok: true, id: s0.id, recorded: false, activeSeconds: Number(s0.case.activeSeconds) || 0 };
    const acc = accessOf(s0, seat, priv), done = s0.case.status === "finalized" || ["Finalised", "Sent"].includes(s0.status);
    if (acc.role === "none" || acc.role === "read_only" || s0.archived || done) return refuse(reasonLine("case.active.refuse_closed"));
    const c2 = recordActive(s0.case, seat, n), f = { ...s0, case: c2, version: (s0.version || 0) + 1 };
    if (!(await store.putIf(org, f, s0.version || 0))) return stale();
    return { ok: true, id: s0.id, recorded: true, activeSeconds: c2.activeSeconds };
  }
  // CLAIM (Lane S's desk2): case_claim { id } gives the case to the caller and starts handling time. It is the lifecycle's assigned move and the first open in one step; case_get open:true is unchanged.
  if (action === "case_claim") {
    let s0 = await get(body.id); if (!s0) return refuse(reasonLine("case.archive.refuse.no_case"));
    const acc = accessOf(s0, seat, priv), by = String(seat);
    if (acc.role === "read_only") return refuse(reasonLine("case.life.refuse.claim_taken"));
    if (acc.role === "none" || s0.archived) return refuse(reasonLine("case.life.refuse.claim_closed"));
    const { statusOfSheet } = await import("./lifecycle.js"), cur = statusOfSheet(s0);
    if (["sent", "converted", "closed"].includes(cur)) return refuse(reasonLine("case.life.refuse.claim_closed"));
    if (acc.role === "can_pick_up") { const f = { ...s0, owner_seat: seat, opened_at: now, status: "In progress", version: (s0.version || 0) + 1, events: [...(s0.events || []), { at: now, seat, what: "picked up from " + s0.owner_seat }] }; if (!(await store.putIf(org, f, s0.version || 0))) return stale(); s0 = await get(s0.id); }
    const c1 = ensureCase(s0, now), c2 = recordOpen(c1, seat, now);
    if (c2 !== c1 || !s0.case) { const f = { ...s0, case: c2, opened_at: s0.opened_at || now, version: (s0.version || 0) + 1 }; if (!(await store.putIf(org, f, s0.version || 0))) return stale(); }
    const { lifecycleView } = await import("./lifecycle.js"), lv = lifecycleView(s0, now), already = lv.assignedTo === by && (s0.lifeEvents || []).some(e => e.kind === "status" && e.to === by);
    if (!already) { try { await store.addLifeEvent(org, s0.id, { kind: "status", status: cur === "waiting" ? "waiting" : "assigned", to: by, note: cur === "waiting" ? lv.waitingReason : null, at: now, by }); } catch (e) { return refuse(reasonLine("case.life.refuse.not_ready")); } }   // a case that is waiting stays waiting and names who has it; any other becomes assigned (a case already in review or ready keeps that status and names who has it)
    return { ok: true, id: s0.id, case: await caseViewOf(await get(s0.id)) };
  }
  // THE LIFECYCLE (redesign order 2318 item 1): case_status { id, status, note, to } and case_outcome { id, outcome, note }. The rules are in lib/desk/lifecycle.js; each move is one event written beside the sheet (it is locked once finalized), and the status is read from the case's facts and its events.
  if (action === "case_status" || action === "case_outcome") {
    const s0 = await get(body.id); if (!s0) return refuse(reasonLine("case.archive.refuse.no_case"));
    const role = accessOf(s0, seat, priv).role; if (role !== "owner" && !(action === "case_status" && role === "can_pick_up" && String(body.status) === "assigned")) return refuse(reasonLine("case.life.refuse.owner"));
    const { planStatus, planOutcome } = await import("./lifecycle.js"), plan = action === "case_status" ? planStatus(s0, { status: body.status, note: body.note, to: body.to, seat: String(seat) }) : planOutcome(s0, { outcome: body.outcome, note: body.note });
    if (plan.refuse) return refuse(reasonLine(plan.refuse, plan.p || {}));
    try { await store.addLifeEvent(org, s0.id, { ...plan.event, at: now, by: String(seat) }); } catch (e) { return refuse(reasonLine("case.life.refuse.not_ready")); }
    return { ok: true, id: s0.id, case: await caseViewOf(await get(s0.id)) };
  }
  // A DOCUMENT'S VIEW ADDRESS (Sam's read of the live screen, Nov 15 2026): doc_url { id, item } answers a signed address for ONE document of the case, good for 10 minutes. The document must be on the case or on its sheet, with a stored file in this org's folder for this sheet; anything else is refused, and an address is never served for another org's file.
  if (action === "doc_url") {
    const s0 = await get(body.id); if (!s0) return refuse(reasonLine("case.archive.refuse.no_case"));
    const item = String(body.item || ""), d = ((s0.submission && s0.submission.documents) || []).find(x => String(x.id) === item) || ((s0.case && s0.case.documents) || []).find(x => String(x.id) === item);
    if (!item || !d) return refuse(reasonLine("case.doc.no_item"));
    const path = d.path || d.storedAs || null, { signedUrl, seatMayRead } = await import("./storage.js"), mine = path && seatMayRead(org, path) && String(path).startsWith(`${org}/${s0.id}/`);
    if (!mine) return refuse(reasonLine("case.doc.no_file"));
    let url = null; try { url = await (ctx.signUrl ? ctx.signUrl(ctx.env, org, path, DOC_URL_SECONDS) : signedUrl(ctx.env, org, path, DOC_URL_SECONDS)); } catch { url = null; }
    return url ? { ok: true, id: s0.id, item, name: d.name || d.title || "document", url, expiresIn: DOC_URL_SECONDS } : refuse(reasonLine("case.doc.no_file"));
  }
  if (action === "case_list") {   // the cases of the org by a typed word: year, make, model or alias; a q includes the archived, marked (Nov 14 2026); status narrows by lifecycle status (one, or a list)
    const { listCases } = await import("./priorCases.js"), { statusFilter } = await import("./lifecycle.js"), sf = statusFilter(body.status); if (!sf) return refuse(reasonLine("case.life.refuse.filter"));
    const everyone = await store.list(org), withCover = await Promise.all(everyone.map(async sh => { const ph = (sh.submission && sh.submission.photos) || []; if (!ph.some(p => p && p.path)) return sh; const cid = coverIdOf(sh.case, ph), cover = ph.find(p => String(p.id) === cid) || ph[0]; if (!cover || !cover.path) return sh; const m = await minted(ctx, org, { ...sh, submission: { photos: [cover] } }); return { ...sh, submission: { ...sh.submission, photos: ph.map(p => (p === cover ? m.submission.photos[0] : p)) } }; }));   // the queue card shows the cover photo: its address is minted for the cover only
    const out = listCases(withCover, { q: body.q, includeArchived: body.includeArchived === true, status: sf.set, mine: body.mine === true || body.assignedTo === "me", seatLabel: seat, now });
    const nm = await namesOf(); out.rows = out.rows.map(r => ({ ...r, analyst: nameOf(r.analyst, nm, own), assignedTo: nameOf(r.assignedTo, nm, own) }));
    return { ok: true, ...out, q: String(body.q || ""), seat: await seatOut() };
  }
  if (action === "case_get") {
    let s0 = await get(body.id); if (!s0) return refuse("No such sheet.");
    // body.open: the analyst opened the case (the workspace sends it on opening, not on a refresh): the first open of this seat is recorded once, in the case, when the sheet can still be edited
    if (body.open === true && accessOf(s0, seat, priv).canPickUp) { const f = { ...s0, owner_seat: seat, opened_at: now, status: "In progress", version: (s0.version || 0) + 1, events: [...(s0.events || []), { at: now, seat, what: "picked up from " + s0.owner_seat }] }; if (await store.putIf(org, f, s0.version || 0)) s0 = f; }   // THE CLAIM (Nov 13 2026): an open of an unopened lead makes it the viewer's; the case view carried the claim until now
    if (body.open === true && accessOf(s0, seat, priv).canEdit) { const c1 = ensureCase(s0, now), c2 = recordOpen(c1, seat, now); if (c2 !== c1 || !s0.case) { const f = { ...s0, case: c2, opened_at: s0.opened_at || now, version: (s0.version || 0) + 1 }; if (await store.putIf(org, f, s0.version || 0)) s0 = f; } }
    // THE SELLER'S WORDS LEAVE THE DOCUMENTS LIST ON THE NEXT OPEN (Nov 16 2026): a forwarded case stored with its text answers as document rows has them moved to case.sellerWords and saved
    if (body.open === true && accessOf(s0, seat, priv).canEdit && s0.case && s0.case.fields && (s0.case.documents || []).some(d => d && d.sellerWords === true)) { const f = { ...s0, case: migrateSellerWords(s0.case), version: (s0.version || 0) + 1 }; if (await store.putIf(org, f, s0.version || 0)) s0 = f; }
    // A CASE AT AN OLDER SHAPE OF THE ENGINE'S ANSWER (or without its 3 month view) GAINS THE NEW FIELDS ON OPEN (Nov 14 2026, lib/desk/caseWorkflow.js staleShape): one read through the same road as an edit, stored; a failure costs nothing, the case is served as it was.
    if (body.open === true && accessOf(s0, seat, priv).canEdit && s0.case && W.needsReread(s0.case)) { try { const bf = await W.refreshShape(s0.case, input => (ctx.readSheet || readSheet)(ctx.env, input), { caseDate: now.slice(0, 10), now }); if (bf.filled) { const f = { ...s0, case: W.settle(W.syncNeeds(bf.case), now), version: (s0.version || 0) + 1 }; if (await store.putIf(org, f, s0.version || 0)) s0 = f; } } catch { /* served as stored */ } }
    // THE ENQUIRY (redesign order 2318 item 2): the stored email's text is read once and kept on the sheet (submission.enquiry), so every later answer carries it; a sheet that is locked is read for this answer only
    { const se = s0.submission && s0.submission.sourceEmail;
      if (se && se.path && !s0.submission.enquiry && ((ctx.fetchObject || ctx.env) || ctx.mailDeps)) {
        const raw = await (ctx.fetchObject ? ctx.fetchObject(org, se.path) : (await import("./storage.js")).downloadObject(ctx.env, org, se.path)).catch(() => null);
        const parser = ctx.mailDeps ? ctx.mailDeps.simpleParser : await import("mailparser").then(m => m.simpleParser, () => null), enq = await (await import("./enquiry.js")).readEnquiry(raw, parser);
        if (enq) { const f = { ...s0, submission: { ...s0.submission, enquiry: enq }, version: (s0.version || 0) + 1 }; if (accessOf(s0, seat, priv).canEdit && await store.putIf(org, f, s0.version || 0)) s0 = await get(s0.id); else s0 = f; }
      } }
    return { ok: true, id: s0.id, case: await caseViewOf(s0), seat: await seatOut() };
  }
  if (action === "sheet_photo_add") {   // a photo added by hand to a sheet the expert can edit; the page shrinks it first, the server checks it is a picture and resizes it the way the emailed ones are
    const s0 = await get(body.id); if (!s0) return refuse("No such sheet.");
    if (!accessOf(s0, seat, priv).canEdit) return refuse(accessOf(s0, seat, priv).why || "This sheet is read only to you.");
    if ((s0.submission.photos || []).length >= MAX_HAND_PHOTOS) return refuse(`A sheet takes up to ${MAX_HAND_PHOTOS} photos.`);
    const acc = await acceptPhoto(body, ctx); if (acc.refuse) return refuse(acc.refuse);
    const { jpeg, width, height } = acc;
    if (hasPhotoHash(s0, s0.case, acc.hash)) return { ...(await view(ctx, store, s0, org)), duplicate: true, line: reasonLine("case.photo.duplicate") };
    const ph = await store.addPhoto(org, s0, { hash: acc.hash, name: String(body.name || "photo").replace(/[\\/\u0000-\u001f]+/g, "_").slice(0, 120), jpeg, width, height, position: (s0.submission.photos || []).length });
    const fresh = await get(body.id); fresh.submission = { ...fresh.submission, photos: [...(fresh.submission.photos || []), ph] }; fresh.state = { ...fresh.state, photosSelected: [...(fresh.state.photosSelected || []), ph.id] }; const was = fresh.version || 0; fresh.version = was + 1;
    if (!(await store.putIf(org, fresh, was))) return stale();
    return view(ctx, store, fresh, org);
  }
  if (action === "sheet_company_find" || action === "sheet_thiscar") {
    const vin = String(body.vin || "").toUpperCase(); const rows = (await store.list(org)).filter(s => vin && s.vin === vin);
    return { ok: true, rows: rows.map(s => ({ ...summaryOf(s, ctx.nowMs), access: accessOf(s, seat, priv).role })) };
  }
  const sheet = await get(body.id);
  if (!sheet) return refuse("No such sheet.");
  const access = accessOf(sheet, seat, priv);
  if (action === "sheet_open") {
    let s = sheet;
    if (access.canPickUp && body.pickUp === true) { s = { ...s, owner_seat: seat, opened_at: now, status: "In progress", events: [...(s.events || []), { at: now, seat, what: "picked up from " + sheet.owner_seat }] }; await store.put(org, s); }
    else if (access.role === "owner" && !s.opened_at && s.status === "New") { s = { ...s, opened_at: now, status: "In progress", events: [...(s.events || []), { at: now, seat, what: "opened" }] }; await store.put(org, s); }
    let retryOpen = null;
    if (!s.read && askOf(s)) { const r = await readSheet(ctx.env, readInput(s)); if (isRetry(r)) retryOpen = retryOf(r); else if (r && accessOf(s, seat, priv).canEdit) { s = { ...s, read: r }; await store.put(org, s); } else if (r) s = { ...s, read: r }; }
    return retryOpen ? { ...(await view(ctx, store, s, org)), retry: retryOpen } : view(ctx, store, s, org);
  }
  if (action === "sheet_save") {
    if (!access.canEdit) return refuse(access.why || "This sheet is read only to you.");
    const base0 = baseOf(body, sheet); if (base0 !== (sheet.version || 0)) return stale();
    const p = body.patch || {}; let s = { ...sheet, state: { ...sheet.state } }, reread = false;
    if ("tier" in p) { const t = Number(p.tier); const nt = [1, 2, 3, 4].includes(t) ? t : null; if (nt !== s.state.tier) s.state.mark = null; s.state.tier = nt; reread = true; }   // a mark belongs to one tier: a new tier clears it
    // THE ANALYST'S PLUS OR MINUS: saved with the sheet, never an input to the read (reread stays as it was). An Untiered car (no tier on the sheet) takes none.
    if ("mark" in p) {
      if (p.mark && p.mark.mark && !s.state.tier) return refuse("An Untiered car takes no plus or minus. Pick a tier first.");
      s.state.mark = p.mark && p.mark.mark ? sanitizeMark(s.state.tier, p.mark) : null;
    }
    // THE OPTION PICKED FROM A SPLIT POOL (body, gearbox, edition, year): the engine checks it against its own options at read time; a pick the engine does not offer is dropped there. Re-read.
    if ("picks" in p) { s.state.picks = sanitizePicks(p.picks); reread = true; }
    if ("mileage" in p) { const m = Math.round(Number(String(p.mileage).replace(/[^\d]/g, ""))); s.state.askedMileage = m > 0 ? m : null; reread = true; }
    if ("confirmed" in p) s.state.confirmed = !!p.confirmed;
    if (p.corrections && typeof p.corrections === "object") s.state.corrections = { colour: String(p.corrections.colour || "").slice(0, 60), gearbox: String(p.corrections.gearbox || "").slice(0, 60) };
    if (p.checklist) s.state.checklist = sanitizeChecklist(p.checklist);
    if (p.decision) s.state.decision = sanitizeDecision(p.decision);
    if (Array.isArray(p.photosSelected)) { const ids = new Set((sheet.submission.photos || []).map(x => x.id)); s.state.photosSelected = p.photosSelected.filter(i => ids.has(i)); if (s.state.heroId && !s.state.photosSelected.includes(s.state.heroId)) s.state.heroId = null; }
    if ("heroId" in p) { const ok = (sheet.submission.photos || []).some(x => x.id === p.heroId); s.state.heroId = ok ? p.heroId : null; if (ok && !s.state.photosSelected.includes(p.heroId)) s.state.photosSelected = [...s.state.photosSelected, p.heroId]; }
    if ("analystFigure" in p) { const f = Math.round(Number(String(p.analystFigure == null ? "" : p.analystFigure).replace(/[^\d.]/g, ""))); s.state.analystFigure = f > 0 && f < 1e9 ? f : null; }
    if ("pinned" in p) s.state.pinned = p.pinned ? String(p.pinned).slice(0, 400) : null;
    let retrySave = null;
    if (reread && askOf(s)) { const r = await readSheet(ctx.env, readInput(s)); if (isRetry(r)) retrySave = retryOf(r); else if (r) s.read = r; else retrySave = { retry: true, retryAfterMs: null, line: "The read could not be refreshed for this change, so the figures shown are the earlier read. Try the change again." }; }   // a read that failed is said, never left looking like the answer to the click
    syncMark(s);
    s.status = "In progress"; s.opened_at = s.opened_at || now; s.version = (sheet.version || 0) + 1;
    if (!(await store.putIf(org, s, base0))) return stale();
    return retrySave ? { ...(await view(ctx, store, s, org)), retry: retrySave } : view(ctx, store, s, org);
  }
  if (action === "sheet_finalise") {
    if (!access.canFinalise) return refuse(access.role === "read_only" || access.role === "can_pick_up" ? `Only ${sheet.owner_seat} can finalise this sheet.` : (access.why || "This sheet cannot be finalised."));
    if (!sheet.read) return refuse("There is no read on this sheet to finalise.");
    const baseF = baseOf(body, sheet); if (baseF !== (sheet.version || 0)) return stale();
    const set = await orgSettings(ctx), priors = await priorsOf(store, org, sheet), ev = evaluateDecision({ read: sheet.read, draft: sheet.state.decision, org: set, priors, analystFigure: sheet.state.analystFigure });
    if (!ev.canFinalise) return refuse("The sheet cannot be finalised yet. Missing: " + ev.missing.map(m => m.text).join(" "), { missing: ev.missing });
    const year = now.slice(0, 4), n = await store.nextReport(org, year), reportNumber = `DV-${year}-${String(n).padStart(4, "0")}`;
    const s = { ...sheet, status: "Finalised", read: { ...sheet.read, frozen: true }, final: { finalisedAt: now, seat, reportNumber, decision: sanitizeDecision(sheet.state.decision), mark: sanitizeMark(sheet.state.tier, sheet.state.mark), analystFigure: sheet.state.analystFigure || null, evaluation: ev, org: { name: set.name, logoPath: set.logoPath || null, logo: set.logoPath ? null : set.logo, color: set.color || null } }, events: [...(sheet.events || []), { at: now, seat, what: "finalised " + reportNumber }] };
    s.version = (sheet.version || 0) + 1;
    if (!(await store.putIf(org, s, baseF))) return stale();
    return view(ctx, store, s, org);
  }
  if (action === "sheet_correct") {   // a finalised sheet is immutable: a correction is a new sheet referencing the old
    if (!sheet.final) return refuse("Only a finalised sheet is corrected: edit this one directly.");
    const s = { ...sheet, id: _c.id(), owner_seat: seat, status: "New", created_at: now, opened_at: null, final: undefined, sent: undefined, exports: [], read: null, state: emptyState(), corrects: sheet.id, correctsReport: sheet.final.reportNumber, events: [{ at: now, seat, what: "correction of " + sheet.final.reportNumber }] };
    delete s.final; delete s.sent; await store.insert(org, s); return { ok: true, id: s.id };
  }
  if (action === "sheet_pdf" || action === "sheet_send") {
    // A DRAFT PDF (Lane D, Nov 2026): the report as it would read now, watermarked DRAFT, so the expert sees it before locking the sheet. It has no report number, is not stored on the sheet and is not counted against the monthly export cap.
    if (action === "sheet_pdf" && body.draft === true && !sheet.final) {
      if (!access.canEdit) return refuse(access.why || "This sheet is read only to you.");
      if (sheet.case) {   // DESK V3: the four page report from the case, DRAFT watermarked; a preview, not stored and not counted
        const set = await orgSettings(ctx), { buildSellerReport } = await import("./reportBuild.js"), rep = await buildSellerReport(await minted(ctx, org, sheet), set, { fetchImage: ctx.fetchImage, readPhoto: photoReader(ctx, org), draft: true }, body.reportVersion);
        return { ok: true, draft: true, filename: rep.filename, reportNumber: null, pdf_b64: Buffer.from(rep.bytes).toString("base64"), parts: rep.parts, pages: rep.pages };
      }
      if (!sheet.read) return refuse("There is no read on this sheet to preview.");
      const set = await orgSettings(ctx), ev0 = evaluateDecision({ read: sheet.read, draft: sheet.state.decision, org: set, priors: await priorsOf(store, org, sheet), analystFigure: sheet.state.analystFigure });
      const draftFinal = { finalisedAt: now, seat, reportNumber: null, decision: sanitizeDecision(sheet.state.decision), mark: sanitizeMark(sheet.state.tier, sheet.state.mark), analystFigure: sheet.state.analystFigure || null, evaluation: ev0, org: { name: set.name, logoPath: set.logoPath || null, logo: set.logoPath ? null : set.logo, color: set.color || null } };
      const { buildReport } = await import("./reportPdf.js");
      const rep = await buildReport(await minted(ctx, org, { ...sheet, final: draftFinal }), set, { fetchImage: ctx.fetchImage, readPhoto: photoReader(ctx, org), draft: true });
      return { ok: true, draft: true, filename: rep.filename, reportNumber: null, pdf_b64: Buffer.from(rep.bytes).toString("base64"), parts: rep.parts, pages: rep.pages };
    }
    if (!sheet.final) return refuse("Finalise the sheet first.");
    if (access.role !== "owner") return refuse(`Only ${sheet.owner_seat} can ${action === "sheet_pdf" ? "export" : "send"} this sheet.`);
    const set = await orgSettings(ctx), month = now.slice(0, 7);
    const priorExports = (sheet.exports || []).length + (await store.exportsOf(org, sheet.id)).length;   // the records beside the sheet, and any a pre table sheet carries inside itself
    if (action === "sheet_pdf" || !priorExports) {
      const used = await store.exportsThisMonth(org, month);
      if (used >= (Number(set.monthlyExportCap) || 200)) return refuse(reasonLine("send.refuse.cap"));
    }
    const rep = sheet.case ? await (await import("./reportBuild.js")).buildSellerReport(await minted(ctx, org, sheet), set, { fetchImage: ctx.fetchImage, readPhoto: photoReader(ctx, org) }) : await (await import("./reportPdf.js")).buildReport(await minted(ctx, org, sheet), set, { fetchImage: ctx.fetchImage, readPhoto: photoReader(ctx, org) });
    // AN EXPORT, AND THE SEND, ARE RECORDS BESIDE THE SHEET, NOT CHANGES TO IT. A finalised or sent sheet row is locked in the database (desk_sheet_immutable refuses any change to its sheet), so for EVERY finalised sheet, V3 case or not, an
    // export is one row in desk_case_exports (insert only) and the Sent state is the database's own column (written by the sending backend, send.js); the sheet's own JSON is never written here and reads overlay the column (sheetStore).
    const exp = { at: now, seat, reportNumber: sheet.final.reportNumber, kind: action === "sheet_pdf" ? "pdf" : "send", version: sheet.case ? sheet.case.version : null };
    const record = async detail => { try { await store.addExport(org, sheet.id, { ...exp, detail: detail || null }); return true; } catch { return false; } };
    if (action === "sheet_pdf") { if (!(await record())) return refuse("The export could not be recorded."); return { ok: true, filename: rep.filename, reportNumber: sheet.final.reportNumber, pdf_b64: Buffer.from(rep.bytes).toString("base64"), parts: rep.parts, pages: rep.pages }; }
    const to = String(body.to || "").trim(); if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) return refuse("Enter the address to send to.");
    const { sendReport } = await import("./sendClient.js");
    const message = String(body.message != null ? body.message : set.standardMessage).slice(0, 4000), note = [sheet.final.decision.note || "", markNote(sheet.final.mark) || ""].filter(Boolean).join("\n\n");
    const out = await sendReport(ctx, { sheetId: sheet.id, reportNumber: sheet.final.reportNumber, to, message, note, org: set.name, filename: rep.filename, pdf_b64: Buffer.from(rep.bytes).toString("base64") });
    if (!out || out.ok !== true) return { ok: false, sendFailed: true, why: (out && out.why) || "The send did not go through.", result: out || null };
    const sentAs = { at: now, to, message, note, result: out, copy: { subject: out.subject || reasonLine("report.title_final", { number: sheet.final.reportNumber }), message, note } };
    await record({ to, subject: sentAs.copy.subject });   // the send went out: its record is written; a send that failed above wrote none
    const s = { ...sheet, status: "Sent", sent: sentAs, events: [...(sheet.events || []), { at: now, seat, what: "sent to " + to }] };   // what the page is shown now; not stored in the sheet row
    return { ok: true, sent: s.sent, ...(await view(ctx, store, s, org)) };
  }
  return { ok: false, error: "unknown sheet action" };
}
