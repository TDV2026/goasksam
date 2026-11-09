// DESK VALUATIONS: every action behind the Valuations mode of /desk (called from lib/desk/handler.js as sheet_*). The page asks and prints; every rule is here.
import { SECTIONS, CHECKLIST, CHECK_STATES, REASONS, DEFAULT_THRESHOLD, coverOf } from "./sheetShape.js";
import { readSheet } from "./sheetRead.js";
import { evaluateDecision, analystLine } from "./decisionRules.js";
import { storeFor, accessOf, summaryOf } from "./sheetStore.js";
import { supabaseSelect } from "../_supabase.js";
import { crypto as _c } from "./sheetCrypto.js";
import { mintSheetUrls } from "./storage.js";
import { reasonLine } from "../reasonWords.js";
import { newCase, ensureCase, excludeSale, recordOpen } from "./caseModel.js";
import * as W from "./caseWorkflow.js";
import { reportState } from "./reportState.js";
import { caseView } from "./caseView.js";
import { carLabel } from "./intake/carName.js";
import { TIER_LADDER, UNTIERED_LADDER, sanitizeMark, markStatement, markNote, tierStatement } from "../conditionTier.js";
// Signed urls are minted for the response or the PDF only, on a copy, with the signer the caller's org allows. The stored sheet never carries one.
const minted = (ctx, org, sheet) => mintSheetUrls(ctx.env, org, sheet, ctx.signUrl ? { sign: ctx.signUrl } : {});

export const DEFAULT_ORG = { id: "sam", name: "Sam", logo: null, threshold: DEFAULT_THRESHOLD, venueChoice: false, standardMessage: "Thank you for sending your car. The valuation report is attached.", monthlyExportCap: 200, sendingAddress: null };
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

// The old sheet fields, made from a finalized version row. figures.assessment is the range and the figure the analyst stood behind; figures.reserve is the reserve. Nothing is computed: each value is one the row holds.
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
  const access = accessOf(sheet, ctx.seat), set = await orgSettings(ctx);
  const priors = await priorsOf(store, org, sheet), earlier = (await store.list(org)).filter(s => s.id !== sheet.id && sheet.vin && s.vin === sheet.vin).map(s => ({ ...summaryOf(s, ctx.nowMs), decision: s.final ? { mode: s.final.decision.mode, reserve: s.final.decision.reserve, low: s.final.decision.low, high: s.final.decision.high } : null }));
  const evaluation = sheet.read ? evaluateDecision({ read: sheet.read, draft: sheet.state.decision, org: set, priors, analystFigure: sheet.state.analystFigure }) : null;
  const meterMed = sheet.read && sheet.read.market && sheet.read.market.meter ? sheet.read.market.meter.median : null, analyst = sheet.read ? { figure: sheet.state.analystFigure || null, median: meterMed, line: analystLine(meterMed, sheet.state.analystFigure) } : null;
  return { ok: true, sheet: publicSheet(sheet), access, read: sheet.read, evaluation, thisCar: earlier, org: { name: set.name, logo: set.logo, threshold: set.threshold, venueChoice: !!set.venueChoice, standardMessage: set.standardMessage }, sections: SECTIONS, ladder: { tiers: Object.keys(TIER_LADDER).map(k => ({ tier: Number(k), name: TIER_LADDER[k].name, line: TIER_LADDER[k].line })), untiered: UNTIERED_LADDER }, markLine: sheet.read && sheet.state.tier ? tierStatement(engineTierOf(sheet.read), sheet.state.tier, (sheet.final ? sheet.final.mark : sheet.state.mark) && (sheet.final ? sheet.final.mark : sheet.state.mark).mark) : null, analyst, cover: coverOf(sheet.submission, sheet.state), checklist: CHECKLIST, checkStates: CHECK_STATES, reasons: REASONS };
}
export function publicSheet(s) { const { read, ...rest } = s; return { ...rest, exports: (s.exports || []).length }; }


// A photo as the page sends it (base64): checked to be a picture, and resized the way the emailed ones are. ONE place, for the old sheet action and the case's photo_add, so they cannot accept different things.
async function acceptPhoto(body, ctx) {
    let buf; try { buf = Buffer.from(String(body.data || ""), "base64"); } catch { buf = null; }
    if (!buf || !buf.length || buf.length > 4 * 1024 * 1024) return { refuse: "That photo is too large or empty." };
    const isJpg = buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff, isPng = buf[0] === 0x89 && buf.slice(1, 4).toString() === "PNG", isWebp = buf.slice(0, 4).toString() === "RIFF" && buf.slice(8, 12).toString() === "WEBP";
    if (!(isJpg || isPng || isWebp)) return { refuse: "That file is not a photo (JPG, PNG or WebP)." };
    let jpeg = buf, width = null, height = null;
    if (ctx.env && ctx.env.supabaseUrl) { const { resizeUpright } = await import("./intake/images.js"); const r = await resizeUpright(buf, { filename: String(body.name || ""), contentType: isJpg ? "image/jpeg" : isPng ? "image/png" : "image/webp" }); if (!r.ok) return { refuse: "That photo could not be read." }; jpeg = r.jpeg; width = r.width; height = r.height; }
    else if (!isJpg) return { refuse: "This session takes JPG photos only." };
  return { jpeg, width, height };
}
export async function handleSheetAction(action, body, ctx) {
  const org = ctx.org || "sam", seat = ctx.seat || "crew", store = ctx.store || storeFor(ctx.env), now = iso(ctx);
  ctx = { ...ctx, nowMs: ctx.now ? new Date(ctx.now).getTime() : Date.now() };
  const get = async id => store.get(org, String(id || ""));
  const refuse = (why, extra = {}) => ({ ok: false, refused: true, why, ...extra });

  if (action === "sheet_queue") {
    const view_ = body.view === "mine" ? "mine" : body.view === "company" ? "company" : "queue", needle = String(body.q || "").toLowerCase().trim();
    let rows = await store.list(org);
    if (view_ === "mine") rows = rows.filter(s => s.owner_seat === seat);
    if (view_ === "queue") { const today = now.slice(0, 10); rows = rows.filter(s => s.created_at.slice(0, 10) === today || s.status === "New" || s.status === "In progress" || s.status === "Needs the car"); }
    if (needle) rows = rows.filter(s => [s.vin, s.car_label, s.owner_seat, s.status, s.created_at.slice(0, 10), s.final && s.final.reportNumber].filter(Boolean).join(" ").toLowerCase().includes(needle));
    rows.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    return { ok: true, view: view_, rows: rows.map(s => ({ ...summaryOf(s, ctx.nowMs), access: accessOf(s, seat).role })), seat, seatName: ctx.seatName || null, viewAs: ctx.viewAs || null, org: (await orgSettings(ctx)).name };
  }
  if (action === "sheet_new") {   // a VIN or year make model typed at the top
    const text = String(body.text || "").trim().slice(0, 120); if (!text) return refuse("Type a VIN or a year, make and model.");
    const vin = VIN_RE.test(text.toUpperCase()) ? text.toUpperCase() : null;
    const miles = Math.round(Number(String(body.mileage == null ? "" : body.mileage).replace(/[^\d]/g, ""))) || null;
    const read0 = await readSheet(ctx.env, vin ? { vin, mileage: miles } : { text, mileage: miles }), retry0 = isRetry(read0) ? retryOf(read0) : null, read = retry0 ? null : read0;
    const sheet = { id: _c.id(), owner_seat: seat, forwarded_by: seat, vin, typedText: vin ? undefined : text, car_label: read ? (carLabel(read.car.decode) || read.car.label) : text, status: "New", created_at: now, opened_at: null, submission: { typed: true, mileage: miles, consignor: null, photos: [], documents: [], note: null }, state: { ...emptyState(), askedMileage: miles }, read: read || null, events: [{ at: now, seat, what: "created" }] };
    await store.insert(org, sheet); return { ok: true, id: sheet.id, sheet: summaryOf(sheet, ctx.nowMs), ...(retry0 ? { retry: retry0 } : {}) };
  }
  if (action === "case_new") {   // DESK V3: a case by hand, with no lead data at all (every field missing), or with whatever the analyst already knows. Stored inside the sheet record (lib/desk/caseModel.js says why).
    const v = body.vehicle && typeof body.vehicle === "object" ? body.vehicle : {};
    const case0 = newCase({ org, now, vehicle: v, source: "analyst_verified" });
    const sheet = { id: _c.id(), owner_seat: seat, forwarded_by: seat, vin: case0.fields.vin.value, car_label: [v.year, v.make, v.model].filter(Boolean).join(" ") || "Needs the car", status: case0.fields.vin.value || (v.make && v.model) ? "New" : "Needs the car", created_at: now, opened_at: null, submission: { typed: true, mileage: case0.fields.mileage.value, consignor: null, photos: [], documents: [], note: null }, state: emptyState(), read: null, events: [{ at: now, seat, what: "created" }], case: case0 };
    await store.insert(org, sheet); return { ok: true, id: sheet.id, case: caseView(sheet, await store.list(org), now), sheet: summaryOf(sheet, ctx.nowMs) };
  }
  if (action === "case_edit") {   // DESK V3 STAGE 2: one edit to the case. The rules are in lib/desk/caseWorkflow.js; this saves the case under the sheet's version (a second tab is refused whole) and re-calls the engine only when its inputs moved.
    let s0 = await get(body.id); if (!s0) return refuse("No such sheet.");
    // A FINALIZED SHEET IS LOCKED IN THE DATABASE (desk_sheet_immutable), so a later change cannot edit it: it makes the next version as a revision sheet that corrects it (the same road sheet_correct takes), the case at version n plus 1.
    // The finalized sheet, its version row and its report are never touched.
    let revisedFrom = null;
    if ((s0.status === "Finalised" || s0.status === "Sent") && s0.case && s0.case.status === "finalized" && (s0.owner_seat === seat)) {
      const c1 = structuredClone(s0.case); c1.version += 1; c1.status = "in_review"; c1.audit.push({ at: now, by: "desk", what: "reopened as version " + c1.version }); c1.opens = [{ seat: String(seat), at: now }]; c1.handling_seconds = null;   // handling time of a revision is the time on the revision
      const rev = { ...s0, id: _c.id(), status: "In progress", created_at: now, opened_at: now, final: undefined, sent: undefined, exports: [], corrects: s0.id, correctsReport: s0.final && s0.final.reportNumber, version: 0, case: c1, events: [...(s0.events || []), { at: now, seat, what: "revision (version " + c1.version + ") of " + ((s0.final && s0.final.reportNumber) || s0.id) }] };
      delete rev.final; delete rev.sent; await store.insert(org, rev); revisedFrom = s0.id; s0 = rev; body = { ...body, id: rev.id, baseVersion: 0 };
    }
    if (!accessOf(s0, seat).canEdit) return refuse(accessOf(s0, seat).why || "This sheet is read only to you.");
    const op = String(body.op || ""), was = baseOf(body, s0); let c = ensureCase(s0, now), asked = null;
    try {
      if (op === "field") c = W.correctField(c, String(body.field), body.value, { now });
      else if (op === "verify") c = W.verify(c, String(body.field), { now });
      else if (op === "assessment") c = W.setAssessment(c, body.patch, now);
      else if (op === "reserve") c = W.setReserve(c, body.patch, now);
      else if (op === "comparables") c = W.selectComparables(c, body.ids, now);
      else if (op === "condition") c = W.setCondition(c, body.selected, now);
      else if (op === "exclude") c = W.settle(W.syncNeeds(excludeSale(c, { saleId: body.saleId, scope: body.scope, reason: body.reason, now })), now);
      else if (op === "need") c = W.settle(W.setNeed(c, String(body.id), String(body.state), String(body.reason || "")), now);
      else if (op === "ask") { const a = W.askFields(c, Array.isArray(body.fields) ? body.fields.map(String) : [], now); c = a.case; asked = a.fields; }
      else if (op === "cover") c = W.settle(W.setCover(c, String(body.photoId), now), now);
      else if (op === "report_photos") c = W.settle(W.selectPhotos(c, Array.isArray(body.ids) ? body.ids.map(String) : [], now), now);
      else if (op === "photo_add") {
        if ((s0.submission.photos || []).length >= MAX_HAND_PHOTOS) return refuse(`A sheet takes up to ${MAX_HAND_PHOTOS} photos.`);
        const acc = await acceptPhoto(body, ctx); if (acc.refuse) return refuse(acc.refuse);
        const ph = await store.addPhoto(org, s0, { name: String(body.name || "photo").replace(/[\\/\u0000-\u001f]+/g, "_").slice(0, 120), jpeg: acc.jpeg, width: acc.width, height: acc.height, position: (s0.submission.photos || []).length });
        s0 = { ...s0, submission: { ...s0.submission, photos: [...(s0.submission.photos || []), ph] }, state: { ...s0.state, photosSelected: [...(s0.state.photosSelected || []), ph.id] } };
        c = W.settle(W.addCasePhoto(c, ph, now), now);
      }
      else return refuse("Unknown edit.");
    } catch (e) { return refuse(String(e.message || e).slice(0, 200)); }
    const rr = await W.refreshEvidence(c, input => readSheet(ctx.env, input), { caseDate: now.slice(0, 10), now });
    c = W.settle(W.syncNeeds(rr.case), now);
    const fresh = { ...s0, case: c, version: (s0.version || 0) + 1 };
    if (!(await store.putIf(org, fresh, was))) return stale();
    return { ok: true, id: fresh.id, ...(revisedFrom ? { revisedFrom } : {}), version: fresh.version, recalled: rr.recalled, ...(asked ? { asked } : {}), ...(rr.retry ? { retry: rr.retry } : {}), case: caseView(fresh, await store.list(org), now), readiness: W.readinessOf(c), reservePosition: W.reservePosition(c) };
  }
  if (action === "case_finalize") {
    const s0 = await get(body.id); if (!s0) return refuse("No such sheet.");
    if (!accessOf(s0, seat).canEdit) return refuse(accessOf(s0, seat).why || "This sheet is read only to you.");
    const c0 = ensureCase(s0, now), r = W.finalize(c0, { now, wording: reportState(c0), seat }); if (!r.ok) return refuse(r.why, { blockers: r.blockers || [] });
    try { await store.putCaseVersion(org, s0.id, r.row); } catch (e) { return refuse("That version is already written."); }
    // THE OLD FIELDS MIRROR THE VERSION ROW, never the reverse: status Finalised and sheet.final are made from the row just written, so the existing send path and the Finalised status work unchanged. The row is the source.
    const set = await orgSettings(ctx), year = now.slice(0, 4), reportNumber = `DV-${year}-${String(await store.nextReport(org, year)).padStart(4, "0")}`;
    const fresh = { ...s0, ...mirrorOf(r.row, { seat, now, reportNumber, set, read: s0.read }), case: r.case, version: (s0.version || 0) + 1, events: [...(s0.events || []), { at: now, seat, what: "finalised " + reportNumber + " (version " + r.row.version + ")" }] };
    if (!(await store.putIf(org, fresh, baseOf(body, s0)))) return stale();
    return { ok: true, id: fresh.id, version: r.row.version, reportNumber, row: r.row, case: caseView(fresh, await store.list(org), now) };
  }
  if (action === "case_version") {   // the hand off: the finalized version rows, read only. The Desk sends nothing; the existing backend reads these.
    const s0 = await get(body.id); if (!s0) return refuse("No such sheet.");
    // the chain: a revision sheet corrects the sheet before it, so its versions are the whole history of the case
    let all = [], cur = s0, guard = 0; while (cur && guard++ < 50) { all = [...(await store.caseVersions(org, cur.id)), ...all]; cur = cur.corrects ? await get(cur.corrects) : null; }
    all.sort((a, b) => a.version - b.version); const want = body.version ? all.find(v => v.version === Number(body.version)) : all[all.length - 1];
    return want ? { ok: true, id: s0.id, version: want.version, row: want, versions: all.map(v => v.version) } : refuse("No finalized version yet.");
  }
  if (action === "case_get") {
    let s0 = await get(body.id); if (!s0) return refuse("No such sheet.");
    // body.open: the analyst opened the case (the workspace sends it on opening, not on a refresh): the first open of this seat is recorded once, in the case, when the sheet can still be edited
    if (body.open === true && accessOf(s0, seat).canEdit) { const c1 = ensureCase(s0, now), c2 = recordOpen(c1, seat, now); if (c2 !== c1 || !s0.case) { const f = { ...s0, case: c2, opened_at: s0.opened_at || now, version: (s0.version || 0) + 1 }; if (await store.putIf(org, f, s0.version || 0)) s0 = f; } }
    return { ok: true, id: s0.id, case: caseView(s0, await store.list(org), now) };
  }
  if (action === "sheet_photo_add") {   // a photo added by hand to a sheet the expert can edit; the page shrinks it first, the server checks it is a picture and resizes it the way the emailed ones are
    const s0 = await get(body.id); if (!s0) return refuse("No such sheet.");
    if (!accessOf(s0, seat).canEdit) return refuse(accessOf(s0, seat).why || "This sheet is read only to you.");
    if ((s0.submission.photos || []).length >= MAX_HAND_PHOTOS) return refuse(`A sheet takes up to ${MAX_HAND_PHOTOS} photos.`);
    const acc = await acceptPhoto(body, ctx); if (acc.refuse) return refuse(acc.refuse);
    const { jpeg, width, height } = acc;
    const ph = await store.addPhoto(org, s0, { name: String(body.name || "photo").replace(/[\\/\u0000-\u001f]+/g, "_").slice(0, 120), jpeg, width, height, position: (s0.submission.photos || []).length });
    const fresh = await get(body.id); fresh.submission = { ...fresh.submission, photos: [...(fresh.submission.photos || []), ph] }; fresh.state = { ...fresh.state, photosSelected: [...(fresh.state.photosSelected || []), ph.id] }; const was = fresh.version || 0; fresh.version = was + 1;
    if (!(await store.putIf(org, fresh, was))) return stale();
    return view(ctx, store, fresh, org);
  }
  if (action === "sheet_company_find" || action === "sheet_thiscar") {
    const vin = String(body.vin || "").toUpperCase(); const rows = (await store.list(org)).filter(s => vin && s.vin === vin);
    return { ok: true, rows: rows.map(s => ({ ...summaryOf(s, ctx.nowMs), access: accessOf(s, seat).role })) };
  }
  const sheet = await get(body.id);
  if (!sheet) return refuse("No such sheet.");
  const access = accessOf(sheet, seat);
  if (action === "sheet_open") {
    let s = sheet;
    if (access.canPickUp && body.pickUp === true) { s = { ...s, owner_seat: seat, opened_at: now, status: "In progress", events: [...(s.events || []), { at: now, seat, what: "picked up from " + sheet.owner_seat }] }; await store.put(org, s); }
    else if (access.role === "owner" && !s.opened_at && s.status === "New") { s = { ...s, opened_at: now, status: "In progress", events: [...(s.events || []), { at: now, seat, what: "opened" }] }; await store.put(org, s); }
    let retryOpen = null;
    if (!s.read && askOf(s)) { const r = await readSheet(ctx.env, readInput(s)); if (isRetry(r)) retryOpen = retryOf(r); else if (r && accessOf(s, seat).canEdit) { s = { ...s, read: r }; await store.put(org, s); } else if (r) s = { ...s, read: r }; }
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
        const set = await orgSettings(ctx), { buildReportV3 } = await import("./reportPdfV3.js"), rep = await buildReportV3(await minted(ctx, org, sheet), set, { fetchImage: ctx.fetchImage, draft: true });
        return { ok: true, draft: true, filename: rep.filename, reportNumber: null, pdf_b64: Buffer.from(rep.bytes).toString("base64"), parts: rep.parts, pages: rep.pages };
      }
      if (!sheet.read) return refuse("There is no read on this sheet to preview.");
      const set = await orgSettings(ctx), ev0 = evaluateDecision({ read: sheet.read, draft: sheet.state.decision, org: set, priors: await priorsOf(store, org, sheet), analystFigure: sheet.state.analystFigure });
      const draftFinal = { finalisedAt: now, seat, reportNumber: null, decision: sanitizeDecision(sheet.state.decision), mark: sanitizeMark(sheet.state.tier, sheet.state.mark), analystFigure: sheet.state.analystFigure || null, evaluation: ev0, org: { name: set.name, logoPath: set.logoPath || null, logo: set.logoPath ? null : set.logo, color: set.color || null } };
      const { buildReport } = await import("./reportPdf.js");
      const rep = await buildReport(await minted(ctx, org, { ...sheet, final: draftFinal }), set, { fetchImage: ctx.fetchImage, draft: true });
      return { ok: true, draft: true, filename: rep.filename, reportNumber: null, pdf_b64: Buffer.from(rep.bytes).toString("base64"), parts: rep.parts, pages: rep.pages };
    }
    if (!sheet.final) return refuse("Finalise the sheet first.");
    if (access.role !== "owner") return refuse(`Only ${sheet.owner_seat} can ${action === "sheet_pdf" ? "export" : "send"} this sheet.`);
    const set = await orgSettings(ctx), month = now.slice(0, 7);
    if (action === "sheet_pdf" || !sheet.exports || !sheet.exports.length) {
      const used = await store.exportsThisMonth(org, month);
      if (used >= (Number(set.monthlyExportCap) || 200)) return refuse("The monthly export limit for your organisation is reached.");
    }
    const rep = sheet.case ? await (await import("./reportPdfV3.js")).buildReportV3(await minted(ctx, org, sheet), set, { fetchImage: ctx.fetchImage }) : await (await import("./reportPdf.js")).buildReport(await minted(ctx, org, sheet), set, { fetchImage: ctx.fetchImage });
    // AN EXPORT IS A RECORD BESIDE THE SHEET, NOT A CHANGE TO IT. A finalised sheet row is locked in the database (desk_sheet_immutable refuses any change to its sheet), so a case sheet's export is one row in desk_case_exports (insert only); only a sheet with no case still carries its exports inside itself.
    const exp = { at: now, seat, reportNumber: sheet.final.reportNumber, kind: action === "sheet_pdf" ? "pdf" : "send", version: sheet.case ? sheet.case.version : null };
    const withExport = sheet.case ? sheet : { ...sheet, exports: [...(sheet.exports || []), { at: now, seat, reportNumber: sheet.final.reportNumber }] };
    if (sheet.case) { try { await store.addExport(org, sheet.id, exp); } catch { return refuse("The export could not be recorded."); } }
    if (action === "sheet_pdf") { if (!sheet.case) await store.put(org, withExport); return { ok: true, filename: rep.filename, reportNumber: sheet.final.reportNumber, pdf_b64: Buffer.from(rep.bytes).toString("base64"), parts: rep.parts, pages: rep.pages }; }
    const to = String(body.to || "").trim(); if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) return refuse("Enter the address to send to.");
    const { sendReport } = await import("./sendClient.js");
    const message = String(body.message != null ? body.message : set.standardMessage).slice(0, 4000), note = [sheet.final.decision.note || "", markNote(sheet.final.mark) || ""].filter(Boolean).join("\n\n");
    const out = await sendReport(ctx, { sheetId: sheet.id, reportNumber: sheet.final.reportNumber, to, message, note, org: set.name, filename: rep.filename, pdf_b64: Buffer.from(rep.bytes).toString("base64") });
    if (!out || out.ok !== true) return { ok: false, sendFailed: true, why: (out && out.why) || "The send did not go through.", result: out || null };
    const s = { ...withExport, status: "Sent", sent: { at: now, to, message, note, result: out, copy: { subject: out.subject || ("Valuation report " + sheet.final.reportNumber), message, note } }, events: [...(sheet.events || []), { at: now, seat, what: "sent to " + to }] };
    if (sheet.case) return { ok: true, sent: s.sent, ...(await view(ctx, store, s, org)) };   // the send is recorded by the sending backend (desk_sheet_sent) and the export row above; the finalised sheet row is not written
    await store.put(org, s); return { ok: true, sent: s.sent, ...(await view(ctx, store, s, org)) };
  }
  return { ok: false, error: "unknown sheet action" };
}
