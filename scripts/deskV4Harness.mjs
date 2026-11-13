// Desk V4 checks harness (Lane S, Nov 10 2026): the V4 page as the crew door serves it, opened in Chrome, with the page's POSTs answered by the REAL in-process Desk reader (previewDeskApi), not a stub.
import { launch, imp, tally, ROOT, V3 } from "./deskV3Harness.mjs";
export { launch, imp, tally, ROOT, V3 };
const V4 = await imp("lib/preview/deskV4.js"), PV = await imp("lib/preview/deskPreview.js");
export { V4, PV };
export async function openLive(b, { w = 1440, h = 900, id = V3.DEMO_ID, mutate = null, dark = false, stub = null, intercept = null, delay = 0 } = {}) {
  let html = await V4.renderDeskV4({ query: { case: id } }); if (mutate) html = mutate(html);
  const p = await b.newPage(); await p.setViewport({ width: w, height: h }); await p.setRequestInterception(true); p._posts = []; p._err = [];
  p.on("request", async r => { const u = new URL(r.url());
    if (u.host === "goasksam.com" && r.method() === "POST" && u.pathname === "/preview/desk/api") { let bd = {}; try { bd = JSON.parse(r.postData() || "{}"); } catch {} p._posts.push(bd); let out; if (delay && bd.action === "case_edit") await new Promise(z => setTimeout(z, delay)); const own = intercept ? await intercept(bd) : undefined; if (own !== undefined) out = own; else if (bd.action === "case_decode") out = { ok: false, refused: true, why: "A check never decodes a VIN over the network." }; else if (/send/i.test(String(bd.action))) { p._sendCalls = (p._sendCalls || 0) + 1; out = stub ? await stub(bd) : { ok: false, why: "no stub: a check never sends" }; } else out = await PV.previewDeskApi(bd); return r.respond({ status: 200, contentType: "application/json", body: JSON.stringify(out) }); }   // NEVER a real send: any send action is answered by the check's own stub and never reaches the reader
    if (u.host === "goasksam.com" && r.isNavigationRequest()) return r.respond({ status: 200, contentType: "text/html", body: html });
    return r.respond({ status: 204, body: "" }); });
  p.on("pageerror", e => p._err.push(String(e).slice(0, 200)));
  // A person clicks the tab before using what is on it: click, focus and type open the right panel's tab first when the target sits in a hidden tab (Needs attention, Reserve or no reserve, Report).
  const openTab = sel => p.evaluate(q => { const e = document.querySelector(q), t = e && e.closest("[data-tabpanel]"); if (t && t.hidden && window.__v4tab) window.__v4tab(t.getAttribute("data-tabpanel")); }, sel);
  for (const m of ["click", "focus", "type", "hover"]) { const o = p[m].bind(p); p[m] = async (sel, ...r) => { if (typeof sel === "string") await openTab(sel); return o(sel, ...r); }; }
  if (dark) await p.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "dark" }]);
  await p.goto("https://goasksam.com/preview/desk/case/" + id, { waitUntil: "domcontentloaded" }); await new Promise(r => setTimeout(r, 400)); return p;
}
// the demonstration case's comparables are the engine's recorded sales (ids from the engine, never typed): the ones with a listing address, in the engine's order
export const compIds = async (id = V3.DEMO_ID) => (await PV.previewDeskApi({ action: "case_get", id })).case.desk.comparables.filter(c => c.url).map(c => String(c.id));
export const idle = async (p, ms = 500) => { await new Promise(r => setTimeout(r, ms)); };

// A finalized demonstration case through the REAL actions (no stub): two comparables, mileage verified, the other items waived with reasons, then case_finalize.
export async function finalizeDemo(id = V3.DEMO_ID) {
  const e = (op, x) => PV.previewDeskApi({ action: "case_edit", id, op, ...x });
  const CI = await compIds(id); await e("comparables", { ids: [CI[0], CI[3]] }); await e("verify", { field: "mileage" });
  await e("need", { item: "accident_unclear", state: "waived", reason: "Seller states none and holds no records" }); await e("need", { item: "service_documents", state: "waived", reason: "Invoice will follow after the listing" });
  return PV.previewDeskApi({ action: "case_finalize", id });
}

// INTAKE FIXTURES (Stage 2): real stored sheets, read through the real case view. pv_fwd is a forwarded lead with a seller supplied VIN and mileage and an original email; pv_nocar is a forwarded lead whose car was not identified;
// the typed case is made by hand through case_new (no lead reference, so it is NOT a forwarded lead).
export async function seedIntake() {
  await V3.deskModel({ query: {} }).catch(() => {});
  const store = await PV.previewStore(), { ensureCase } = await imp("lib/desk/caseModel.js"), { DEMO_VIN } = await imp("lib/desk/demoCar.js"), at = new Date(Date.now() - 3600e3).toISOString();
  // origin is Lane D's field: "forwarded" (intake), "typed" (the Desk's own form), null. lead_ref is NOT the marker (a typed case can carry one; a forwarded case may not).
  const mk = (id, vin, label, status, { origin = "forwarded", leadRef, ask = null, url = true } = {}) => { const sheet = { id, owner_seat: PV.PREVIEW_SEAT, forwarded_by: PV.PREVIEW_SEAT, vin, car_label: label, status, created_at: at, opened_at: null, version: 0, submission: { consignor: { name: "Pat Lee", email: "pat@example.com", ...(ask ? { asking_price: ask } : {}) }, mileage: vin ? 61200 : null, photos: [], documents: [], sourceEmail: { path: "hagerty/" + id + "/mail/original.eml", ext: ".eml", } }, state: { heroId: null, photosSelected: [] }, read: null, events: [] };
    const c = ensureCase(sheet, at); c.origin = origin; if (leadRef !== undefined) c.lead_ref = leadRef; sheet.case = c; return sheet; };
  PV.usePreviewSigner(async (e, o, path) => { const id = String(path).split("/")[1]; return id === "pv_fwdnoref" ? null : "https://example.test/mail/" + id + ".eml"; });   // the page model signs the stored path when it serves (the stored sheet holds no address): the harness's signer gives the fixture's address, and none for the lead with no signed address
  await store.insert(PV.PREVIEW_ORG.id, mk("pv_fwd", DEMO_VIN, "2004 Porsche 911 Carrera 4S", "New", { ask: 58000 }));
  await store.insert(PV.PREVIEW_ORG.id, mk("pv_nocar", null, "Needs the car", "Needs the car"));
  await store.insert(PV.PREVIEW_ORG.id, mk("pv_nocar2", null, "Needs the car", "Needs the car"));
  await store.insert(PV.PREVIEW_ORG.id, mk("pv_typedlead", DEMO_VIN, "2001 Porsche 911 Carrera", "New", { origin: "typed", leadRef: "LEAD-TYPED-1" }));   // a typed case that carries a lead reference: NOT a forwarded lead
  await store.insert(PV.PREVIEW_ORG.id, mk("pv_fwdnoref", DEMO_VIN, "2002 Porsche 911 Carrera", "New", { origin: "forwarded", leadRef: null, url: false }));   // a forwarded case with no lead reference and no signed address: still a forwarded lead, with no email link
  const t = await PV.previewDeskApi({ action: "case_new", text: "1999 Porsche 911", seller_name: "Sam Typed" });
  return { fwd: "pv_fwd", nocar: "pv_nocar", nocar2: "pv_nocar2", typedlead: "pv_typedlead", fwdnoref: "pv_fwdnoref", vin: DEMO_VIN, typed: t.id, typedOk: !!t.ok };
}
