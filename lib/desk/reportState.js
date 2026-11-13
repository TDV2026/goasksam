// DESK V3 STAGE 3: THE REPORT'S WORDING, FROM THE CASE (Lane D, Nov 8 2026). Every sentence the report prints about the case is built here, from the case record and the engine's answer stored on it (case.desk, case.record), and
// every sentence is a lib/reasonWords.js line: this file picks the line from the case's state and hands it the case's own values. It computes no figure (the range, quartiles and median are the engine's; the reserve and
// assessment are the analyst's) and it types no sentence. A sentence the case cannot support is not built at all: its field is null, never a softer claim. The workspace and the PDF both read this one object.
import { lastSoldLine } from "./ownWords.js";
import { lastSaleOf } from "./ownCar.js";
import { isServiceInvoice, kindOfDoc } from "./caseModel.js";
import { IMS_WORDS, printedSteps } from "./nextSteps.js";
import { printedConsidered } from "./considered.js";
import { reasonLine } from "../reasonWords.js";
import { spoken } from "./reserveModeLines.js";
import { TIER_LADDER } from "../conditionTier.js";
import { countNoun } from "../countNoun.js";
import { reservePosition, reserveCheckOf, reportReserveModeOf, windowOf } from "./caseWorkflow.js";
import { drawMeter } from "../tierMeter.js";
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const monthYear = d => { const m = /^(\d{4})-(\d{2})/.exec(String(d || "")); return m ? `${MONTHS[Number(m[2]) - 1]} ${m[1]}` : null; };
const SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const shortDate = d => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d || "")); return m ? `${Number(m[3])} ${SHORT[Number(m[2]) - 1]} ${m[1]}` : null; };
export const longDate = d => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d || "")); return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}` : null; };


const sellerReached = (c, ck) => reasonLine("report.reserve_reached_sold", { months: windowOf(c), of: ck.of }) + " " + reasonLine("report.reserve_reached", { of: ck.of, reached: ck.reached, fig: ck.reserve });   // the seller's two sentences, from the engine's two counts and the figure
export function reportState(c0) {
  const c = spoken(c0);   // the reserve mode's sentences are made now from its stored figures, never read back from the case
  const ev = c.desk && c.desk.evidence ? c.desk.evidence : null, f = k => c.fields[k], out = {};
  // identification as the case holds it (values, not sentences); a missing field is null and the page prints nothing for it
  out.identification = Object.fromEntries(["vin", "year", "make", "model", "trim", "body", "transmission", "generation", "colour"].map(k => [k, f(k).value]));
  // the two figures
  const a = c.assessment, r = c.reserve;
  out.rangeLine = a.low != null && a.high != null ? reasonLine("report.range", { low: a.low, high: a.high }) : null;
  out.reserveLine = r.figure != null ? reasonLine("report.reserve", { figure: r.figure }) : null;
  // the assessment against the market reference (the engine's median): one line, printed by the workspace and the report alike. The difference is the analyst's figure minus the engine's median, to the dollar; the engine's figure is never changed.
  out.differenceLine = a.figure != null && ev && !ev.insufficient && ev.median != null ? (a.figure === ev.median ? reasonLine("report.assess_same", { reference: ev.median }) : reasonLine(a.figure > ev.median ? "report.assess_above" : "report.assess_below", { diff: Math.abs(a.figure - ev.median), reference: ev.median })) : null;
  // THE MARKET REFERENCE AS ONE LINE (the workspace's; the report prints no market figure beside the assessment): the engine's middle half, the sales it holds and the date its evidence runs to, with the stale sentence when the engine flags it.
  out.marketLine = ev && !ev.insufficient && ev.q1 != null && ev.q3 != null ? [reasonLine("report.market_line", { low: ev.q1, high: ev.q3, sales: countNoun(ev.count, "sale", { words: false }), date: shortDate(ev.asOf) }), ev.stale && ev.stale.flag ? ev.stale.sentence : null].filter(Boolean).join(" ") : (ev && ev.insufficient ? ev.sentence || null : null);
  // WHERE THE CAR SITS, IN WORDS (the report): the assessment against the median of the sales, and the reserve against their middle half. Words only: the report never prints the market reference as a figure beside the assessment.
  out.sitsLine = a.figure != null && ev && !ev.insufficient && ev.median != null ? reasonLine(a.figure === ev.median ? "report.sits_same" : a.figure > ev.median ? "report.sits_above" : "report.sits_below", { sales: countNoun(ev.count, "sale", { words: false }) }) : null;
  out.explanation = String(a.explanation || "").trim() || null;   // the analyst's own words
  out.rationale = String(r.rationale || "").trim() || null;
  // the engine's evidence, in the engine's own sentence
  out.populationLine = ev && ev.population ? ev.population.sentence || null : null;
  out.insufficientLine = ev && ev.insufficient ? ev.sentence || null : null;
  out.typicalLine = ev && !ev.insufficient && ev.q1 != null && ev.q3 != null ? reasonLine("report.typical", { q1: ev.q1, q3: ev.q3, median: ev.median, sales: countNoun(ev.count, "sale", { words: false }) }) : null;
  // the reserve against the typical range: the SAME comparison the workspace uses (caseWorkflow.reservePosition)
  const pos = reservePosition(c), ck = reserveCheckOf(c);
  out.reservePosition = pos;
  out.reservePlaceLine = pos && ev ? reasonLine("report.reserve_place_" + pos, { sales: countNoun(ev.count, "sale", { words: false }) }) : null;
  out.reservePositionLine = ck && ck.positionLine ? ck.positionLine : null;   // the engine's own sentence for this reserve
  // THE SELLER'S WORDS (Sam, Nov 12 2026: the report printed the analyst's short line "29 of 39 sales reached this figure"): the same two counts the engine gave, in the seller's sentence from the table. The analyst's panel keeps the engine's short line.
  out.reachedLine = ck && ck.of ? sellerReached(c, ck) : ck && ck.reachedLine ? ck.reachedLine : null;
  out.reachedShortLine = ck && ck.reachedLine ? ck.reachedLine : null;   // the engine's own short line for the analyst's panel (the seller's two sentences are the report's); one source, so the panel and the PDF never swap
  // the seller's agreement appears only when it is true
  out.sellerLine = r.seller_agreed === true ? reasonLine("report.seller_agreed") : null;
  // mileage: verified, as stated by the seller, or not confirmed; nothing when there is none
  const m = f("mileage");
  out.mileageWords = m.value == null ? null : countNoun(m.value, "mile", { words: false });   // "61,400 miles", the one place the mileage is put in words
  out.mileageLine = m.value == null ? null : m.verified ? reasonLine("report.mileage_verified", { miles: out.mileageWords }) : m.source === "seller" ? reasonLine("report.mileage_stated", { miles: out.mileageWords }) : reasonLine("report.mileage_unconfirmed", { miles: out.mileageWords });
  // IMS: only a car whose case speaks of IMS work (the seller's service history, or a service document named for it) gets a line; the engine's factor says what the market did, never what this car had done. Seller reported with the invoices outstanding until a service document is received, then documented.
  const speaks = IMS_WORDS.test(String(f("service_history").value || "")) || c.documents.some(d => kindOfDoc(d) === "invoice" && IMS_WORDS.test(d.name));
  const received = c.documents.some(isServiceInvoice);
  out.imsLine = !speaks ? null : received ? reasonLine("report.ims_documented") : reasonLine("report.ims_reported");
  // condition: one line per rung of the ladder, for the tier the analyst selected; the engine's suggestion is not the report's condition
  const t = c.condition && c.condition.selected && Number(c.condition.selected.tier);
  out.conditionLine = TIER_LADDER[t] ? reasonLine("report.condition", { name: TIER_LADDER[t].name, tier: t, line: TIER_LADDER[t].line }) : null;
  // limitations: every item still open, and every waived item with its reason; a done item is not a limitation
  out.limitations = c.needs_review.filter(n => n.state === "open" || n.state === "waived").map(n => n.state === "open" ? reasonLine("report.limit_open", { label: n.label }) : reasonLine("report.limit_waived", { label: n.label, reason: n.reason }));
  // next steps: the invoices step goes when the service documents are received
  // the steps are the case's own list (lib/desk/nextSteps.js), printed as written; a case that has none prints the one plain line
  const steps = printedSteps(c);
  out.nextSteps = steps.length ? steps : [reasonLine("report.next_none")];
  // the note on page 4: the one sentence when the VIN has no earlier auction record, and only when a VIN was read and the engine found none
  // THE CAR'S OWN LAST SALE, page two (Nov 13 2026): one line made now from the stored figures, when the VIN has sold before
  out.ownSaleLine = lastSoldLine(lastSaleOf(c.vehicle && c.vehicle.ownHistory));
  out.noteLines = f("vin").value && c.record && c.record.appearances === 0 ? [reasonLine("desk.no_prior_vin")] : [];
  // A FACT THE ANALYST PROCEEDED WITHOUT IS SAID TO BE UNVERIFIED IN THE REPORT (Sam, Nov 12 2026): when the item for the accident history, the service documents or the mileage is waived and the fact is still not verified, the seller's report says so in a plain line.
  { const waived = id => (c.needs_review || []).some(n => n.id === id && n.state === "waived");
    if (waived("accident_unclear") && !f("accident_history").verified) out.noteLines.push(reasonLine("report.accident_unverified"));
    if (waived("service_documents") && !c.documents.some(isServiceInvoice)) out.noteLines.push(reasonLine("report.service_unverified"));
    if (waived("mileage_unconfirmed") && !f("mileage").verified) out.noteLines.push(reasonLine("report.mileage_unverified")); }
  // THE REST OF THE REPORT'S DATA (page 2 to 4). Every figure is the engine's, the analyst's or a sale's own price; positions on the strip are drawing positions of those prices.
  const d = c.desk || {}, listed = Array.isArray(d.comparables) ? d.comparables : [];
  // page 2: every completed sale the engine lists in the population as a dot, the engine's median, the assessed range and the reserve marked on the same axis
  if (ev && !ev.insufficient && ev.median != null) {
    const sales = listed.filter(x => x.inPopulation !== false && x.price > 0), extras = [a.low, a.high, r.figure].filter(v => v != null && v > 0);
    const m = drawMeter({ scope: "body", low: ev.low, p25: ev.q1, median: ev.median, p75: ev.q3, high: ev.high, count: ev.count }, [...sales.map(x => ({ price: x.price, date: x.soldDate, venue: x.platform, title: x.title })), ...extras.map(v => ({ price: v }))]);
    const pct = v => v == null ? null : Math.round(((v - m.axisMin) / (m.axisMax - m.axisMin)) * 1000) / 10;
    out.strip = { axisMin: m.axisMin, axisMax: m.axisMax, dots: m.dots.slice(0, sales.length).map(x => ({ price: x.price, pct: x.pct })), lowPct: m.lowPct, q1Pct: m.p25Pct, medianPct: m.medianPct, q3Pct: m.p75Pct, highPct: m.highPct, assessLowPct: pct(a.low), assessHighPct: pct(a.high), reservePct: pct(r.figure), median: ev.median, reserve: r.figure, assessLow: a.low, assessHigh: a.high };
  } else out.strip = null;
  // strengths: what the case has verified or documented. Considerations: what it has not, what the engine says is not isolated, and what is outstanding. Each is a line already built above or the engine's own sentence.
  const verifiedFactors = (d.factors || []).filter(x => x.effectSentence && (x.verification === "verified" || x.verification === "documented"));
  out.strengths = [m.verified ? out.mileageLine : null, received && speaks ? out.imsLine : null, out.sellerLine, ...verifiedFactors.map(x => x.effectSentence)].filter(Boolean);
  out.considerations = [!m.verified ? out.mileageLine : null, !received && speaks ? out.imsLine : null, ...out.limitations, ...(d.outside || []).map(x => x.sentence), ...(d.factors || []).filter(x => !x.effectSentence && x.basis).map(x => x.basis)].filter(Boolean);
  out.conditionBasis = d.condition && d.condition.basis ? d.condition.basis : null;
  // page 3: the selected comparables the engine still lists, up to four, with the lines the card prints
  const sel = new Set((c.selectedComparables || []).map(String));
  out.comparables = listed.filter(x => sel.has(String(x.id))).slice(0, 4).map(x => ({ id: x.id, title: x.title, price: x.price, milesWords: x.miles == null ? null : countNoun(x.miles, "mile", { words: false }), venue: x.platform, date: x.soldDate, dateWords: longDate(x.soldDate), why: x.why || null, url: x.url || null, photo: x.photo || null }));
  // page 4: the quarters the engine shows, and the live listings with what each is
  out.quarterLines = (d.quarters || []).filter(q => q.shown && q.median != null).map(q => reasonLine("report.quarter", { label: q.label, median: q.median, sales: countNoun(q.count, "sale", { words: false }) }));
  out.liveLines = (d.live || []).map(x => reasonLine(x.type === "bid" ? "report.live_bid" : x.type === "ask" ? "report.live_ask" : "report.live_nosale", { figure: x.figure, platform: x.platform, title: x.title, ends: longDate(x.ends) }));
  out.liveLinks = (d.live || []).map(x => x.url || null);
  // THE WIREFRAME'S LAYOUT DATA (Nov 9 2026). Each line is a reasonWords line from the case's own state; a part the case cannot support is null or empty, and the PDF prints nothing for it.
  const per = ev && ev.period ? ev.period : null, fromTo = per ? { from: monthYear(per.from), to: monthYear(per.to) } : null;
  out.header = [c.lead_ref, longDate(c.finalized_at || c.submitted_at)].filter(Boolean);
  out.eyebrow = [f("generation").value, f("body").value, f("transmission").value, out.mileageWords, f("colour").value].filter(Boolean);
  out.priceBasis = ev && !ev.insufficient && fromTo && fromTo.from ? [reasonLine("report.price_basis", { sales: countNoun(ev.count, "comparable sale", { words: false }), from: fromTo.from, to: fromTo.to })] : [];
  out.reserveNote = r.figure != null ? [reasonLine("report.reserve_disclaimer"), out.rationale].filter(Boolean) : [];
  const svc = c.documents.some(x => kindOfDoc(x) === "invoice");
  out.lead = [out.explanation, svc ? reasonLine(received ? "report.invoices_on_file" : "report.invoices_wanted") : null].filter(Boolean);
  if (out.strip) {
    out.strip.labels = { range: a.low != null && a.high != null ? reasonLine("report.strip_range", { low: a.low, high: a.high }) : null, low: reasonLine("report.strip_low", { figure: ev.low }), high: reasonLine("report.strip_high", { figure: ev.high }), median: reasonLine("report.strip_median_words", { sales: countNoun(ev.count, "sale", { words: false }) }), reserve: r.figure != null ? reasonLine("report.strip_reserve", { figure: r.figure }) : null };
    out.strip.lowFigure = ev.low; out.strip.highFigure = ev.high;
    out.strip.caption = [reasonLine("report.dot_each"), reasonLine("report.strip_caption_words"), out.sitsLine, out.reservePlaceLine].filter(Boolean);
  }
  out.supportItems = [m.verified ? { title: reasonLine("report.title_mileage"), text: out.mileageLine } : null, received && speaks ? { title: reasonLine("report.title_ims"), text: out.imsLine } : null, out.sellerLine ? { title: reasonLine("report.title_seller"), text: out.sellerLine } : null, ...verifiedFactors.map(x => ({ title: x.title, text: x.effectSentence }))].filter(Boolean);
  out.considerItems = [!m.verified ? out.mileageLine : null, !received && speaks ? out.imsLine : null, ...out.limitations, ...(d.outside || []).map(x => x.sentence)].filter(Boolean);
  out.headings = { valuation: reasonLine("report.h_valuation"), reserve: reasonLine("report.h_reserve"), supports: reasonLine("report.h_supports"), consider: reasonLine("report.h_consider") };
  out.conditionBox = TIER_LADDER[t] ? { name: TIER_LADDER[t].name, text: reasonLine("report.condition_box", { name: TIER_LADDER[t].name, line: TIER_LADDER[t].line }), note: reasonLine("report.condition_note") } : null;
  const cmps = out.comparables;
  out.compsHeading = reasonLine("report.comps_heading", { sales: countNoun(cmps.length, "recent sale", { cap: true }) });
  out.compsFoot = ev && !ev.insufficient && fromTo && fromTo.from ? [reasonLine("report.comps_foot", { sales: countNoun(ev.count, "completed sale", { words: false }), from: fromTo.from, to: fromTo.to }), reasonLine("report.prices_final")] : [];
  out.noPhotoLine = reasonLine("report.no_photo"); out.viewListing = reasonLine("report.view_listing");
  for (const x of cmps) { x.monthYear = monthYear(x.date); const lx = listed.find(y => String(y.id) === String(x.id)); x.titleMiles = [x.title, x.milesWords].filter(Boolean).join(", "); void lx; }
  const qs = (d.quarters || []).filter(q => q.label);
  out.quarterBars = qs.map(q => ({ label: q.label, shown: !!(q.shown && q.median != null), median: q.shown ? q.median : null, count: q.count }));
  out.quarterCaption = qs.length ? [reasonLine("report.quarter_caption"), ...qs.filter(q => !(q.shown && q.median != null)).map(q => reasonLine("report.quarter_gap", { label: q.label })), ev && ev.asOf ? reasonLine("report.evidence_to", { date: longDate(ev.asOf) }) : null].filter(Boolean) : [];
  out.liveRows = (d.live || []).map(x => ({ left: reasonLine("report.live_title", { title: x.title, platform: x.platform }), right: reasonLine(x.type === "bid" ? "report.live_bid_fig" : x.type === "ask" ? "report.live_ask_fig" : "report.live_nosale_fig", { figure: x.figure }), url: x.url || null }));
  out.liveCaption = out.liveRows.length ? reasonLine("report.live_caption") : null;
  out.pleaseNote = ev && ev.asOf ? [reasonLine("report.note_basis", { date: longDate(ev.asOf), photos: c.photos.items.length > 0, stated: m.value != null && !m.verified && m.source === "seller" }), reasonLine("report.note_disclaimer"), ...out.noteLines] : [...out.noteLines];
  out.reference = c.lead_ref || null;
  // DESK V4 (Lane D, Nov 10 2026): THE SELLER REPORT, to docs/desk-mockups/desk-v4.html "Report rules". One figure (the recommended reserve) with the engine's own count of sales that reached it; three tiles; the why the analyst wrote; the dots with the reserve marked; the engine's supports and considered items; the closest sales; the engine's evidence note; the next steps; a trend only when every quarter has enough sales. The assessment range is not in this report. Every sentence is a reasonWords line or the engine's own; nothing is computed here.
  const noRes = reportReserveModeOf(c).mode === "no_reserve", above = pos === "above", asked = r.sellerRequested === true, qAll = (d.quarters || []).filter(q => q.label);
  const tierName = TIER_LADDER[t] ? TIER_LADDER[t].name : null, cnote = String(r.conditionNote || "").trim() || null;
  out.v4 = {
    title: d.titleLine || [f("year").value, f("make").value, f("model").value, f("trim").value].filter(Boolean).join(" ") || null,
    specLine: d.specLine || null,
    preparedFor: c.seller && c.seller.name ? reasonLine("v4.prepared_for", { name: c.seller.name }) : null,
    head: { cover: reasonLine("v4.head_cover"), why: reasonLine("v4.head_why"), sales: reasonLine("v4.head_sales"), next: reasonLine("v4.head_next") },
    label: reasonLine(above && asked ? "v4.label_requested" : "v4.label_reserve"), figure: r.figure,
    // NO RESERVE (Lane D, Nov 11 2026): when the analyst has set the report to recommend no reserve, the cover prints the headline and the engine's own line in place of the figure; the figure stays on page 2 as the expected result; the seller's own answer (Yes, No, Not sure) is printed beside it
    noReserve: noRes ? { headline: reasonLine("v4.no_reserve_headline"), line: d.reserveMode && d.reserveMode.line || null, preference: r.sellerPreference ? reasonLine("case.reserve.seller_preference", { answer: r.sellerPreference }) : null } : null,
    expected: noRes && r.figure != null ? { line: reasonLine("v4.expected_result", { figure: r.figure }) } : null,
    reachedLine: ck && ck.of ? sellerReached(c, ck) : ck && ck.reachedLine ? ck.reachedLine : null,
    note: above && ev && !ev.insufficient && ev.q1 != null ? reasonLine("v4.above", { q1: ev.q1, q3: ev.q3 }) : r.figure != null ? reasonLine("v4.what_reserve") : null,
    tiles: [
      ev && !ev.insufficient && ev.typicalLine ? { value: ev.typicalLine, label: reasonLine("v4.tile_typical", { sales: countNoun(ev.count, "sale", { words: false }) }) } : null,
      tierName ? { value: reasonLine("v4.tile_condition", { name: tierName }), label: cnote || reasonLine("v4.tile_condition_default") } : ev && !ev.insufficient ? { value: reasonLine("desk4.all_conditions_name"), label: reasonLine("v4.tile_all_conditions") } : null,
      m.value != null ? { value: out.mileageWords, label: reasonLine(m.verified ? "v4.tile_miles_verified" : m.source === "seller" ? "v4.tile_miles_stated" : "v4.tile_miles_unconfirmed") } : null
    ].filter(Boolean),
    why: String(r.why || "").trim() || null,
    strip: out.strip ? { ...out.strip, assessLowPct: null, assessHighPct: null, labels: { ...out.strip.labels, range: null }, caption: [reasonLine("report.dot_each"), reasonLine("report.strip_caption_words"), out.reservePositionLine].filter(Boolean) } : null,
    ownSaleLine: out.ownSaleLine || null,
    stripHeading: ev && !ev.insufficient ? reasonLine("v4.h_strip", { sales: countNoun(ev.count, "real sale", { words: false }) }) : null,
    supports: (d.supports || []).map(x => ({ title: x.title, text: x.line })).filter(x => x.text),
    considered: printedConsidered(c),   // the case's own list (lib/desk/considered.js): the engine's items and the waived limits are its start, the analyst's edits are kept
    headings: { supports: reasonLine("v4.h_supports"), considered: reasonLine("v4.h_considered"), about: reasonLine("v4.h_about"), trend: reasonLine("v4.h_trend"), note: reasonLine("v4.h_note") },
    photoIds: (c.photos.reportIds || []).slice(0, 4), photosCaption: reasonLine("v4.photos_caption"),
    compsHeading: reasonLine("v4.comps_heading", { sales: countNoun(cmps.length, "recent sale", { cap: true }) }),
    aboutLine: ev && !ev.insufficient && ev.noteLine ? ev.noteLine : null,
    trend: qAll.length >= 2 && qAll.every(q => q.shown && q.median != null) ? { bars: qAll.map(q => ({ label: q.label, median: q.median, count: q.count })), caption: reasonLine("v4.trend_caption") } : null,
    nextSteps: out.nextSteps, pleaseNote: out.pleaseNote, reference: out.reference
  };
  return out;
}
