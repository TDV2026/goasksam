// DESK VALUATIONS: every action behind the Valuations mode of /desk (called from lib/desk/handler.js as sheet_*). The page asks and prints; every rule is here.
import { SECTIONS, CHECKLIST, CHECK_STATES, REASONS, DEFAULT_THRESHOLD } from "./sheetShape.js";
import { readSheet } from "./sheetRead.js";
import { evaluateDecision } from "./decisionRules.js";
import { storeFor, accessOf, summaryOf } from "./sheetStore.js";
import { supabaseSelect } from "../_supabase.js";
import { crypto as _c } from "./sheetCrypto.js";
import { mintSheetUrls } from "./storage.js";
// Signed urls are minted for the response or the PDF only, on a copy, with the signer the caller's org allows. The stored sheet never carries one.
const minted = (ctx, org, sheet) => mintSheetUrls(ctx.env, org, sheet, ctx.signUrl ? { sign: ctx.signUrl } : {});

export const DEFAULT_ORG = { id: "sam", name: "Sam", logo: null, threshold: DEFAULT_THRESHOLD, venueChoice: false, standardMessage: "Thank you for sending your car. The valuation report is attached.", monthlyExportCap: 200, sendingAddress: null };
export async function orgSettings(ctx) {
  const base = { ...DEFAULT_ORG, id: ctx.org || "sam", ...(ctx.orgSettings || {}) };
  if (ctx.orgSettings || !ctx.env || !ctx.env.supabaseUrl) return base;
  try { const r = await supabaseSelect(ctx.env, `desk_orgs?id=eq.${encodeURIComponent(base.id)}&select=name,settings&limit=1`); if (r && r[0]) return { ...base, name: r[0].name || base.name, ...(r[0].settings || {}) }; } catch {}
  return base;
}
const VIN_RE = /^[A-HJ-NPR-Z0-9]{17}$/;
const iso = ctx => (ctx.now ? new Date(ctx.now) : new Date()).toISOString();
const sanitizeChecklist = c => { const out = {}; for (const it of CHECKLIST) { const v = c && c[it.key]; if (v) out[it.key] = { state: CHECK_STATES.includes(v.state) ? v.state : null, choice: it.choices && it.choices.includes(v.choice) ? v.choice : null, line: String(v.line || "").slice(0, 300) }; } return out; };
const sanitizeDecision = d => ({ mode: d && (d.mode === "reserve" || d.mode === "range") ? d.mode : null, reserve: d && d.reserve != null ? String(d.reserve).slice(0, 12) : "", low: d && d.low != null ? String(d.low).slice(0, 12) : "", high: d && d.high != null ? String(d.high).slice(0, 12) : "", reasons: ((d && d.reasons) || []).filter(k => REASONS.some(r => r.key === k)), otherText: String((d && d.otherText) || "").slice(0, 300), line: String((d && d.line) || "").slice(0, 600), guardLines: { prior: String((d && d.guardLines && d.guardLines.prior) || "").slice(0, 400), start: String((d && d.guardLines && d.guardLines.start) || "").slice(0, 400) }, note: String((d && d.note) || "").slice(0, 2000) });
export const emptyState = () => ({ tier: null, askedMileage: null, confirmed: false, corrections: {}, checklist: {}, decision: sanitizeDecision({}), photosSelected: [], heroId: null, pinned: null });

async function priorsOf(store, org, sheet) {
  if (!sheet.vin) return [];
  return (await store.list(org)).filter(s => s.id !== sheet.id && s.vin === sheet.vin && s.final && s.final.finalisedAt).map(s => ({ reportNumber: s.final.reportNumber, mode: s.final.decision.mode, reserve: Number(s.final.decision.reserve) || null, low: Number(s.final.decision.low) || null, high: Number(s.final.decision.high) || null, finalisedAt: s.final.finalisedAt }));
}
// A RETRY ANSWER IS NOT A READ (Lane E, Nov 5 2026): readSheet() answers { retry: true, retryAfterMs, line } while the engine is still reading. It is never stored as the sheet's read, never replaces a read the sheet already has, and the page gets the engine's line and the wait to ask again.
export const isRetry = r => !!r && typeof r === "object" && r.retry === true;
export const retryOf = r => ({ retry: true, retryAfterMs: Number(r.retryAfterMs) > 0 ? Number(r.retryAfterMs) : 15000, line: typeof r.line === "string" ? r.line : null });
async function view(ctx, store, stored, org) {
  const sheet = await minted(ctx, org, stored);
  const access = accessOf(sheet, ctx.seat), set = await orgSettings(ctx);
  const priors = await priorsOf(store, org, sheet), earlier = (await store.list(org)).filter(s => s.id !== sheet.id && sheet.vin && s.vin === sheet.vin).map(s => ({ ...summaryOf(s, ctx.nowMs), decision: s.final ? { mode: s.final.decision.mode, reserve: s.final.decision.reserve, low: s.final.decision.low, high: s.final.decision.high } : null }));
  const evaluation = sheet.read ? evaluateDecision({ read: sheet.read, draft: sheet.state.decision, org: set, priors }) : null;
  return { ok: true, sheet: publicSheet(sheet), access, read: sheet.read, evaluation, thisCar: earlier, org: { name: set.name, logo: set.logo, threshold: set.threshold, venueChoice: !!set.venueChoice, standardMessage: set.standardMessage }, sections: SECTIONS, checklist: CHECKLIST, checkStates: CHECK_STATES, reasons: REASONS };
}
export function publicSheet(s) { const { read, ...rest } = s; return { ...rest, exports: (s.exports || []).length }; }

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
    const read0 = vin ? await readSheet(ctx.env, { vin, mileage: body.mileage }) : null, retry0 = isRetry(read0) ? retryOf(read0) : null, read = retry0 ? null : read0;
    const sheet = { id: _c.id(), owner_seat: seat, forwarded_by: seat, vin, car_label: read ? read.car.label : text, status: "New", created_at: now, opened_at: null, submission: { typed: true, mileage: Number(body.mileage) || null, consignor: null, photos: [], documents: [], note: null }, state: emptyState(), read: read || null, events: [{ at: now, seat, what: "created" }] };
    await store.insert(org, sheet); return { ok: true, id: sheet.id, sheet: summaryOf(sheet, ctx.nowMs), ...(retry0 ? { retry: retry0 } : {}) };
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
    if (!s.read && s.vin) { const r = await readSheet(ctx.env, { vin: s.vin, mileage: s.state.askedMileage || s.submission.mileage, tier: s.state.tier }); if (isRetry(r)) retryOpen = retryOf(r); else if (r && accessOf(s, seat).canEdit) { s = { ...s, read: r }; await store.put(org, s); } else if (r) s = { ...s, read: r }; }
    return retryOpen ? { ...(await view(ctx, store, s, org)), retry: retryOpen } : view(ctx, store, s, org);
  }
  if (action === "sheet_save") {
    if (!access.canEdit) return refuse(access.why || "This sheet is read only to you.");
    const p = body.patch || {}; let s = { ...sheet, state: { ...sheet.state } }, reread = false;
    if ("tier" in p) { const t = Number(p.tier); s.state.tier = [1, 2, 3, 4].includes(t) ? t : null; reread = true; }
    if ("mileage" in p) { const m = Math.round(Number(String(p.mileage).replace(/[^\d]/g, ""))); s.state.askedMileage = m > 0 ? m : null; reread = true; }
    if ("confirmed" in p) s.state.confirmed = !!p.confirmed;
    if (p.corrections && typeof p.corrections === "object") s.state.corrections = { colour: String(p.corrections.colour || "").slice(0, 60), gearbox: String(p.corrections.gearbox || "").slice(0, 60) };
    if (p.checklist) s.state.checklist = sanitizeChecklist(p.checklist);
    if (p.decision) s.state.decision = sanitizeDecision(p.decision);
    if (Array.isArray(p.photosSelected)) { const ids = new Set((sheet.submission.photos || []).map(x => x.id)); s.state.photosSelected = p.photosSelected.filter(i => ids.has(i)); if (s.state.heroId && !s.state.photosSelected.includes(s.state.heroId)) s.state.heroId = null; }
    if ("heroId" in p) { const ok = (sheet.submission.photos || []).some(x => x.id === p.heroId); s.state.heroId = ok ? p.heroId : null; if (ok && !s.state.photosSelected.includes(p.heroId)) s.state.photosSelected = [...s.state.photosSelected, p.heroId]; }
    if ("pinned" in p) s.state.pinned = p.pinned ? String(p.pinned).slice(0, 400) : null;
    let retrySave = null;
    if (reread && s.vin) { const r = await readSheet(ctx.env, { vin: s.vin, mileage: s.state.askedMileage || s.submission.mileage, tier: s.state.tier }); if (isRetry(r)) retrySave = retryOf(r); else if (r) s.read = r; }
    s.status = "In progress"; s.opened_at = s.opened_at || now; await store.put(org, s);
    return retrySave ? { ...(await view(ctx, store, s, org)), retry: retrySave } : view(ctx, store, s, org);
  }
  if (action === "sheet_finalise") {
    if (!access.canFinalise) return refuse(access.role === "read_only" || access.role === "can_pick_up" ? `Only ${sheet.owner_seat} can finalise this sheet.` : (access.why || "This sheet cannot be finalised."));
    if (!sheet.read) return refuse("There is no read on this sheet to finalise.");
    const set = await orgSettings(ctx), priors = await priorsOf(store, org, sheet), ev = evaluateDecision({ read: sheet.read, draft: sheet.state.decision, org: set, priors });
    if (!ev.canFinalise) return refuse("The sheet cannot be finalised yet. Missing: " + ev.missing.map(m => m.text).join(" "), { missing: ev.missing });
    const year = now.slice(0, 4), n = await store.nextReport(org, year), reportNumber = `DV-${year}-${String(n).padStart(4, "0")}`;
    const s = { ...sheet, status: "Finalised", read: { ...sheet.read, frozen: true }, final: { finalisedAt: now, seat, reportNumber, decision: sanitizeDecision(sheet.state.decision), evaluation: ev, org: { name: set.name, logo: set.logo } }, events: [...(sheet.events || []), { at: now, seat, what: "finalised " + reportNumber }] };
    await store.put(org, s); return view(ctx, store, s, org);
  }
  if (action === "sheet_correct") {   // a finalised sheet is immutable: a correction is a new sheet referencing the old
    if (!sheet.final) return refuse("Only a finalised sheet is corrected: edit this one directly.");
    const s = { ...sheet, id: _c.id(), owner_seat: seat, status: "New", created_at: now, opened_at: null, final: undefined, sent: undefined, exports: [], read: null, state: emptyState(), corrects: sheet.id, correctsReport: sheet.final.reportNumber, events: [{ at: now, seat, what: "correction of " + sheet.final.reportNumber }] };
    delete s.final; delete s.sent; await store.insert(org, s); return { ok: true, id: s.id };
  }
  if (action === "sheet_pdf" || action === "sheet_send") {
    if (!sheet.final) return refuse("Finalise the sheet first.");
    if (access.role !== "owner") return refuse(`Only ${sheet.owner_seat} can ${action === "sheet_pdf" ? "export" : "send"} this sheet.`);
    const set = await orgSettings(ctx), month = now.slice(0, 7);
    if (action === "sheet_pdf" || !sheet.exports || !sheet.exports.length) {
      const used = await store.exportsThisMonth(org, month);
      if (used >= (Number(set.monthlyExportCap) || 200)) return refuse("The monthly export limit for your organisation is reached.");
    }
    const { buildReport } = await import("./reportPdf.js");
    const rep = await buildReport(await minted(ctx, org, sheet), set, { fetchImage: ctx.fetchImage });
    const withExport = { ...sheet, exports: [...(sheet.exports || []), { at: now, seat, reportNumber: sheet.final.reportNumber }] };
    if (action === "sheet_pdf") { await store.put(org, withExport); return { ok: true, filename: rep.filename, reportNumber: sheet.final.reportNumber, pdf_b64: Buffer.from(rep.bytes).toString("base64"), parts: rep.parts, pages: rep.pages }; }
    const to = String(body.to || "").trim(); if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) return refuse("Enter the address to send to.");
    const { sendReport } = await import("./sendClient.js");
    const message = String(body.message != null ? body.message : set.standardMessage).slice(0, 4000), note = sheet.final.decision.note || "";
    const out = await sendReport(ctx, { sheetId: sheet.id, reportNumber: sheet.final.reportNumber, to, message, note, org: set.name, filename: rep.filename, pdf_b64: Buffer.from(rep.bytes).toString("base64") });
    if (!out || out.ok !== true) return { ok: false, sendFailed: true, why: (out && out.why) || "The send did not go through.", result: out || null };
    const s = { ...withExport, status: "Sent", sent: { at: now, to, message, note, result: out, copy: { subject: out.subject || ("Valuation report " + sheet.final.reportNumber), message, note } }, events: [...(sheet.events || []), { at: now, seat, what: "sent to " + to }] };
    await store.put(org, s); return { ok: true, sent: s.sent, ...(await view(ctx, store, s, org)) };
  }
  return { ok: false, error: "unknown sheet action" };
}
