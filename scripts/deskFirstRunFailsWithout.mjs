// Each mutation undoes ONE fix from Sam's first run of Desk V4 (Nov 11 2026) on a scratch copy of the tree; the check named beside it must go red on every one (and the real tree is green: run the checks plainly).
//   node scripts/deskFirstRunFailsWithout.mjs [only-a-number-to-run-one]
import fs from "node:fs"; import path from "node:path"; import os from "node:os"; import { execFileSync } from "node:child_process"; import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
const CW = "lib/desk/caseWorkflow.js", DV = "lib/deskV3.js", OB = "lib/onebox.js";
const rep = (a, b) => s => s.replace(a, b);
const MUT = [
  // 1. a switch of period or condition must not read
  ["the engine's read carries no views, so every switch reads again", "deskViewsCheck", OB, rep("if (cfg.views === true) {", "if (false) {")],
  ["a period switch does not take the stored view", "deskViewsCheck", CW, rep("return settle(adoptView(c, now), now); }\n// A SWITCH", "return settle(c, now); }\n// A SWITCH")],
  ["a condition switch does not take the stored view", "deskViewsCheck", CW, rep("selected.name || \"\") } : null }; return settle(adoptView(c, now), now); }", "selected.name || \"\") } : null }; return settle(c, now); }")],
  ["the views are built with every condition read as all conditions", "deskViewsCheck", OB, rep("const useT = t && !noData ? t : null,", "const useT = null,")],
  ["the views are built at the chosen period only", "deskViewsCheck", OB, rep("windowMonths: m }), env);", "windowMonths: 12 }), env);")],
  ["the reserve check after a switch is the old one", "deskViewsCheck", CW, rep("c.desk = setReserveCheck(c.desk, () => (fig != null ? engineReserveCheck(c.desk.sales, c.desk.evidence, fig, want.months) : null));", "")],
  ["on the page, a condition click reads the engine again", "deskV4FlowCheck", CW, rep("selected.name || \"\") } : null }; return settle(adoptView(c, now), now); }", "selected.name || \"\") } : null }; return settle(c, now); }")],
  // 2. one answer, one count
  ["the case's own condition line counts the car's sales of that condition with no mileage cut", "reportConsistencyCheck", DV, rep("months, when, desk.tier || desk.rungPools ? {", "months, when, false ? {")],
  // 5. every refusal of a new case says why
  ["a market read that throws reaches the page with no reason", "deskTypedCasesCheck", "lib/desk/sheetActions.js", rep('} catch (e) { return refuse(reasonLine("case.new.refuse.read_failed", { detail: String(e && e.message || e).slice(0, 80) })); }', '} catch (e) { throw e; }')],
  ["a VIN that does not decode says nothing about why", "deskTypedCasesCheck", "lib/desk/sheetActions.js", rep('? reasonLine("case.new.refuse.vin_not_decoded") : "The read is not', '? "no reason" : "The read is not')],
  ["a photo over 4 MB is refused in words of the code's own", "deskTypedCasesCheck", "lib/desk/sheetActions.js", rep('{ refuse: reasonLine("case.photo.refuse.size") }', '{ refuse: "too big" }')],
  ["the handler lets an action's error through", "deskTypedCasesCheck", "lib/desk/handler.js", rep('catch (e) { const { reasonLine }', 'catch (e) { throw e; const { reasonLine }')],
  // lane F 2. one answer per rung
  ["a rung button counts the car's sales of that condition with no mileage cut", "reportConsistencyCheck", DV, rep("byTier: desk.rungPools ? Object.fromEntries", "byTier: false ? Object.fromEntries")],
  // lane F 3. where the record starts
  ["a window that reaches past the first sale on record says nothing", "reportConsistencyCheck", DV, rep("firstOn && firstOn > cutoffOf(caseDate, m) ?", "false ?")],
  // lane F 1. edits hold across sessions
  ["the preview keeps its cases in memory per instance and seeds them afresh (the store behind the door is ignored)", "deskPersistCheck", "lib/preview/deskPreview.js", rep("    if (backing) return backing;\n", "")],
  ["the preview's edits are written to a store and the PDF is built from the seeded case", "deskPersistCheck", "lib/desk/sheetActions.js", rep("if (action === \"case_pdf\")", "if (action === \"case_pdf_x\")")],
  // lane F 5. the list and its count
  ["the button counts the window's sales, not the list", "reportConsistencyCheck", DV, rep("sales, comparablesCount: comparables.length,", "sales, comparablesCount: sales.length,")],
  ["a row says its miles are not stated whenever the car's are missing", "reportConsistencyCheck", DV, rep("if (!(r.miles > 0)) return reasonLine(\"desk3.why_nomiles\", { year });", "if (!(r.miles > 0) || !(sub.miles > 0)) return reasonLine(\"desk3.why_nomiles\", { year });")],
  // lane F 6. one name, one generation
  ["the queue names the car by the label the sheet was made with", "reportConsistencyCheck", "lib/desk/sheetStore.js", rep("car: (s.case && s.case.desk && s.case.desk.titleLine) || s.car_label ||", "car: s.car_label ||")],
  ["the engine's generation is not put on the case", "reportConsistencyCheck", CW, rep('const withGen = gen && g && g.value == null ?', 'const withGen = false ?')],
  // lane F 7. one document state
  ["the documents tile counts every document as on file", "reportConsistencyCheck", "lib/desk/caseView.js", rep('received: allDocs.filter(d => d.status === "received").length,', 'received: allDocs.length,')],
  // lane F 8. the rail lists what the counts count
  ["the rail lists every sheet, including a finalized version a revision replaced", "deskPersistCheck", "lib/preview/deskV3.js", rep("cases = all.filter(c => liveIds.has(c.id) || c.id === id);", "cases = all;")],
  // lane F 9. the Desk's own word
  ["the PDF title says valuation report again", "deskPdfCheck", "lib/desk/reportPdfV3.js", rep('reasonLine("report.title_final", { number: number || "" }).trim()', '`Valuation report ${number || ""}`.trim()')],
  ["the preview's send subject says valuation report again", "deskPdfCheck", "lib/preview/deskPreview.js", rep('subject: reasonLine("report.title_final", { number: p.reportNumber })', 'subject: "Valuation report " + p.reportNumber')],
  // lane F 10. a thin pool names the car
  ["the population words fall back to cars again", "reportConsistencyCheck", "lib/reasonWords.js", rep('(!s.transmission && s.label ? String(s.label) : "cars")', '"cars"')],
  // lane F 11. a new case is read once
  ["a new case reads again to check the reserve it took", "deskTypedCasesCheck", CW, rep("if (fig != null && !(was && was.reserve === fig)) {", "if (false) {")],
  // lane C 3. the Mini's trim and body, and the pickers before a case exists
  ["a blank Trim with a Series that names the model and the trim is read as no trim", "deskTypedCasesCheck", "lib/vehicle.js", rep("cleanVinTrim(r.Trim) || seriesTrim || null", "cleanVinTrim(r.Trim) || null")],
  ["a hatchback names no body", "deskTypedCasesCheck", "lib/vehicle.js", rep('if (/hatchback|liftback/.test(b)) return "hatchback";', "")],
  ["case_pickers looks for a sheet and says no such sheet", "deskTypedCasesCheck", "lib/desk/sheetActions.js", rep('if (action === "case_pickers") {', 'if (action === "case_pickers") { if (!(await get(body.id))) return refuse("No such sheet.");')],
  // lane C 1. one view per rung, stable across reads
  ["the rung the read was made with is cut by the mileage band and the others are not", "deskViewsCheck", DV, rep("byTier: desk.rungPools ? Object.fromEntries", "byTier: false ? Object.fromEntries")],
  // lane C 2. Any condition
  ["the demonstration case's reset puts it on Good", "deskPersistCheck", "lib/preview/deskPreview.js", rep('op: "condition", selected: null }, ctxOf(store, {}, seat));', 'op: "condition", selected: { tier: 3, name: "Good" } }, ctxOf(store, {}, seat));')],
  ["the Any button counts one sale too many", "reportConsistencyCheck", DV, rep("count: n, countLine: countNoun(n, \"sale\", { words: false }) };", "count: n + 1, countLine: countNoun(n + 1, \"sale\", { words: false }) };")],
  ["the page has no Any condition button", "deskV4FlowCheck", "lib/preview/deskV4Client.js", rep("if (any) box.appendChild(", "if (false) box.appendChild(")],
  // no reserve in the report
  ["a thin engine answer lets no reserve be chosen with no why", "reportConsistencyCheck", CW, rep("if (rm.thin === true && !text) return { refuse: \"case.reserve_mode.refuse_thin\" };", "")],
  ["Finalize does not check the no reserve choice", "reportConsistencyCheck", CW, rep("if (rmode.mode === \"no_reserve\" && !rm) add(", "if (false) add(")],
  ["the case view prints no engine line for no reserve", "reportConsistencyCheck", "lib/desk/caseView.js", rep("reasonLine(\"report.reserve_mode_line\", { line: c.desk.reserveMode.line || \"\" })", "null")],
  ["the report keeps the figure off page 2", "deskPdfCheck", "lib/desk/reportState.js", rep("expected: noRes && r.figure != null ?", "expected: false ?")],
  ["the cover still prints the figure under no reserve", "deskPdfCheck", "lib/desk/reportPdfV3.js", rep("if (v.noReserve) {", "if (false) {")],
  ["the seller's answer is not printed beside no reserve", "deskPdfCheck", "lib/desk/reportState.js", rep("preference: r.sellerPreference ? reasonLine(", "preference: false ? reasonLine(")],
  ["the report is no reserve whatever the analyst set", "reportConsistencyCheck", "lib/desk/reportState.js", rep("const noRes = reportReserveModeOf(c).mode === \"no_reserve\",", "const noRes = true,")],
  // 4. a waived item whose cause is gone leaves the list
  ["a waived item stays when the mark that caused it is set", "reportConsistencyCheck", CW, rep('else if (!on && it && it.state === "waived") c.needs_review', 'else if (false) c.needs_review')],
  // 7. a switch with nothing to show says so
  ["a shorter period with the same sales prints no line", "reportConsistencyCheck", DV, rep("e1.count > 0 && e1.count === e2.count ?", "false ?")],
  // 3. the reserve the engine proposes is a round figure
  ["the engine proposes the first quartile as it is", "deskShapesCheck", DV, rep("figure: roundReserve(evidence.q1),", "figure: evidence.q1,")],
  ["the rounding step is $100", "deskShapesCheck", DV, rep("v < 50000 ? 500 : 1000", "v < 50000 ? 100 : 1000")],
  // Lane C's live run (Nov 12 2026)
  ["a closed body's last try drops the body and keeps the open bodies in (a hatchback case lists Convertible sales)", "deskTypedCasesCheck", "lib/sheetRead.js", rep("if (!alt && closed) text = text + OPEN_NOT;", "")],
  ["the short id pv_hm is not the uuid on the production store (404)", "deskPersistCheck", "lib/preview/deskPreview.js", rep("if (await store.get(PREVIEW_ORG.id, t)) return t; const u = previewUuid(t);", "return t; const u = previewUuid(t);")],
  ["the seed re-saves every row of the org with no case, not only its own", "deskPersistCheck", "lib/preview/deskPreview.js", rep("for (const id of mine.slice(1)) {", "for (const id of (await store.list(PREVIEW_ORG.id)).map(r => r.id)) {")],
  ["a failed seed step is not named (the error goes up bare)", "deskPersistCheck", "lib/preview/deskPreview.js", rep("} catch (e) { steps.push({ step: name, ok: false, why: String(e && e.message || e).slice(0, 160) }); return false; }", "} catch (e) { throw e; }")],
  // Sam's second run (Nov 12 2026)
  ["the photo row is written with a source the table's check refuses (typed)", "deskCasePhotosCheck", "lib/desk/sheetStore.js", rep('source: "upload"', 'source: "typed"')],
  ["a case whose photo fails stays in the store without its photos", "deskCasePhotosCheck", "lib/desk/sheetActions.js", rep("try { await store.discard(org, sheet.id); } catch {} return refuse(reasonLine(\"case.new.refuse.photo\"", "return refuse(reasonLine(\"case.new.refuse.photo\"")],
  ["a HEIC photo is not converted on the server (refused as not a photo)", "deskCasePhotosCheck", "lib/desk/sheetActions.js", rep("|| isHeic)) return { refuse", ")) return { refuse")],
  ["the seller report prints the analyst's short line (N of M sales reached this figure)", "deskPdfCheck", "lib/desk/reportState.js", rep("out.reachedLine = ck && ck.of ? sellerReached(c, ck) : ck && ck.reachedLine ? ck.reachedLine : null;", "out.reachedLine = ck && ck.reachedLine ? ck.reachedLine : null;")],
  ["the seller's statement cannot be saved to a fact (Mark verified on an empty field stays refused)", "deskWorkflowCheck", "lib/desk/sheetActions.js", rep('else if (op === "seller_said") {', 'else if (op === "seller_said_off") {')],
  ["a waived accident item prints nothing in the report about the history being unverified", "deskWorkflowCheck", "lib/desk/reportState.js", rep('if (waived("accident_unclear") && !f("accident_history").verified)', 'if (false)')],
  ["a waived mileage item prints nothing about the mileage being unverified", "deskWorkflowCheck", "lib/desk/reportState.js", rep('if (waived("mileage_unconfirmed") && !f("mileage").verified)', 'if (false)')],
  ["the report prints the engine's items, not the case's edited list", "deskWorkflowCheck", "lib/desk/reportState.js", rep("considered: printedConsidered(c),", "considered: (d.considered || []).map(x => ({ title: x.title, text: x.line })),")],
  ["a removed item of the considered list comes back", "deskWorkflowCheck", "lib/desk/considered.js", rep("!c.consideredRemoved.includes(s.key) &&", "")],
  ["a document held only on the sheet's own list does not show in Documents", "deskWorkflowCheck", "lib/desk/caseView.js", rep("allDocs = [...c.documents, ...sub.filter(", "allDocs = [...c.documents, ...[].filter(")],
  ["the Any condition rung keeps its old name", "reportConsistencyCheck", "lib/desk/rungs.js", rep('reasonLine("desk4.all_conditions_name")', '"Any condition"')],
  ["a sent or finalized case can be deleted", "deskWorkflowCheck", "lib/desk/sheetActions.js", s => s.replace(/if \(s0\.status === "Finalised"[^\n]*case\.delete\.refuse\.final"\)\);/, "")],
  ["a restore puts the case at the wrong stage", "deskWorkflowCheck", "lib/desk/caseView.js", rep('sheet && sheet.archived ? "archived" : sheet && sheet.status === "Sent" ? "sent" :', 'sheet && sheet.archived ? "archived" : sheet && sheet.archiveEvents ? "new" : sheet && sheet.status === "Sent" ? "sent" :')],
  ["a saved photo has no size", "deskCasePhotosCheck", "lib/desk/sheetStore.js", rep("url: null, width: width || null, height: height || null, inReport: false }", "url: null, inReport: false }")],
  ["a stored reserve line is served as stored", "deskWorkflowCheck", "lib/desk/reserveModeLines.js", rep("if (!rm || typeof rm !== \"object\" || !rm.withReserve || !rm.noReserve) return rm;", "return rm;")],
  ["the page's own load reads the stored rows without minting addresses", "deskCasePhotosCheck", "lib/preview/deskV3.js", rep("rows = await mintedRows(listed, openId, (await previewEnv()) || {});", "rows = listed;")],
  ["the rail's cover photo is not minted", "deskCasePhotosCheck", "lib/preview/deskV3.js", rep("if (!cover || !cover.path) return s;", "return s;")],
  ["the finalize answer is not minted", "deskCasePhotosCheck", "lib/desk/sheetActions.js", rep("case: caseView(await minted(ctx, org, fresh), await store.list(org), now, seat) };", "case: caseView(fresh, await store.list(org), now, seat) };")],
  ["a sentence is read back from the stored case", "reportConsistencyCheck", "lib/desk/reserveModeLines.js", rep("const d1 = speakDesk(c.desk),", "const d1 = c.desk,")],
  ["a switch of period drops the case's ledger of sentences", "reportConsistencyCheck", "lib/desk/caseWorkflow.js", rep("pool: d.pool, ...(d.words ? { words: d.words } : {}) };", "pool: d.pool };")],
  ["the reserve check's sentences are not recorded in the ledger", "reportConsistencyCheck", "lib/desk/caseWorkflow.js", rep("d.words = compactWords(refs, d, desk.words); return d; };", "d.words = desk.words; return d; };")],
  ["the engine's read stores no ledger", "reportConsistencyCheck", "lib/onebox.js", rep("if (w.length) dk.words = w; }", "}")],
  ["the engine's window carries no axis", "reportConsistencyCheck", "lib/deskV3.js", rep("...(e.insufficient ? { axisMin: null, axisMax: null, axisTicks: [] } : axisOf(e.low, e.high, [e.q1, e.q3, e.median])),", "")],
  ["a case read before the axis existed is served without one", "reportConsistencyCheck", "lib/desk/caseView.js", rep("w && !Array.isArray(w.axisTicks) ? {", "false ? {")],
  ["the panel's reached line is the report's sentence", "reportConsistencyCheck", "lib/desk/caseView.js", rep("reachedLine: rs.reachedShortLine,", "reachedLine: rs.reachedLine,")],
  ["the page's own load serves the stored original email address (none is signed)", "deskV4IntakeQueueCheck", "lib/preview/deskV3.js", rep("rows = await mintedRows(listed, openId, (await previewEnv()) || {});", "rows = listed;")],
  ["desk.evidence carries no axis of its own", "reportConsistencyCheck", "lib/deskV3.js", rep("axisMin: byWindow[String(months)].axisMin, axisMax: byWindow[String(months)].axisMax, axisTicks: byWindow[String(months)].axisTicks, ", "")],
  ["an archived case loses its documents", "deskWorkflowCheck", "lib/desk/caseView.js", rep("documents: allDocs.map(d =>", "documents: (sheet.archived ? [] : allDocs).map(d =>")],
  // THE CAR'S OWN HISTORY (Nov 13 2026)
  ["the car's own history is dropped (a case carries no vehicle.ownHistory)", "deskTypedCasesCheck", CW, rep("if (sheet.own) c.vehicle =", "if (false) c.vehicle =")],
  ["the fields are prefilled from the decode when the car has a last sale of its own", "deskTypedCasesCheck", CW, rep("fillFromDecode(fillFromLastSale(c0, rd.own, now, { fromForm }), rd.car", "fillFromDecode(c0, rd.car")],
  ["the forwarded lead takes the decode over the car's own last listing", "intakeToCaseCheck", CW, rep("fillFromDecode(fillFromLastSale(c0, rd.own, now, { fromForm }), rd.car", "fillFromDecode(c0, rd.car")],
  ["the report's page two has no line for the car's own last sale", "deskPdfCheck", "lib/desk/reportState.js", rep("ownSaleLine: out.ownSaleLine || null,", "ownSaleLine: null,")],
  ["the report state has no line for the car's own last sale", "deskTypedCasesCheck", "lib/desk/reportState.js", rep("out.ownSaleLine = lastSoldLine(lastSaleOf(c.vehicle && c.vehicle.ownHistory));", "out.ownSaleLine = null;")],
  ["the reserve why does not start from the own-sale line", "deskTypedCasesCheck", DV, rep("if (ownLine) out.unshift(ownLine);", "")],
  ["a listing that is live now is not carried on the case", "deskTypedCasesCheck", CW, rep("vinLiveMatch: sheet.own.vinLiveMatch || null }", "vinLiveMatch: null }")],
  ["the New case form's decode ignores the car's own sale", "deskTypedCasesCheck", "lib/desk/sheetActions.js", rep("decoded = decodedOf(step);   // the one VIN", "decoded = decodedOf({ facts: step.facts });   // the one VIN")],
  ["the car's own listing overwrites what the seller wrote", "deskTypedCasesCheck", "lib/desk/caseModel.js", rep("if (f0.value != null && f0.source !== \"vin_decoded\" &&", "if (false &&")],
  ["a wrong check digit carries no warning", "deskTypedCasesCheck", "lib/desk/vinStep.js", rep("&& !vinCheckDigitOk(v) ? reasonLine(\"case.decode.warn_check\") : null;", "&& false ? reasonLine(\"case.decode.warn_check\") : null;")],
  ["a near-VIN is refused with the generic reason, not its length", "deskTypedCasesCheck", "lib/desk/vinStep.js", rep("v.length >= 11 ? reasonLine(\"case.decode.refuse_length\", { n: v.length })", "false ? reasonLine(\"case.decode.refuse_length\", { n: v.length })")],
  ["a case with no sale of its own still prints an own block", "deskTypedCasesCheck", "lib/desk/ownCar.js", rep("ownBlock: rows.length ? {", "ownBlock: !!rows ? {")],
  // THE LISTING'S WORDS ARE NOT THE CAR'S FACTS, AND A FAILED LOOKUP IS NOT "NO RECORD" (Nov 13 2026)
  ["the prefill takes the archive's title words as the trim", "deskTypedCasesCheck", "lib/desk/ownCar.js", rep("trim: r.trim || null, body:", "trim: r.trim || archive.trim || null, body:")],
  ["the prefill takes the archive's gearbox column as it stands", "deskTypedCasesCheck", "lib/desk/ownCar.js", rep("transmission: cleanGearbox(archive.transmission),", "transmission: archive.transmission || null,")],
  ["the prefill takes the archive's colour text as it stands", "deskTypedCasesCheck", "lib/desk/ownCar.js", rep("colour: cleanColour(archive.colour),", "colour: archive.colour || null,")],
  ["the prefill takes the archive's body text as it stands", "deskTypedCasesCheck", "lib/desk/ownCar.js", rep("body: cleanBody(r.bodyStyle) || cleanBody(archive.bodyStyle),", "body: r.bodyStyle || archive.bodyStyle || null,")],
  ["the resolver's trim is accepted though it is not the listing's words", "deskTypedCasesCheck", "lib/desk/ownCar.js", rep("if (t && t.trim && norm(t.trim).split(\" \").every(x => have.has(x))) return t;", "if (t && t.trim) return t;")],
  ["the case's decode takes the archive's body text as it stands", "deskTypedCasesCheck", "lib/sheetRead.js", rep("cleanBody(archive && archive.bodyStyle) || null", "(archive && archive.bodyStyle) || null")],
  ["a lookup that failed is not asked again", "deskTypedCasesCheck", "lib/desk/ownCar.js", rep("if (!a && st.failed) {", "if (false) {")],
  ["a lookup that failed is remembered as no record", "deskTypedCasesCheck", "lib/sheetRead.js", rep("if (!deps && !archiveFailed && (archive || facts || liveMatch))", "if (!deps && (archive || facts || liveMatch))")],
  ["the match never says its lookup failed", "deskTypedCasesCheck", "lib/_flags.js", rep("if (status) status.failed = true; return null; }", "return null; }")],
  ["the form's decode takes the archive without asking again", "deskTypedCasesCheck", "lib/desk/vinStep.js", rep("const [{ archive }, liveMatch, facts] = await Promise.all([\n    archiveLookup(", "const [{ archive }, liveMatch, facts] = await Promise.all([\n    ((m, e, v) => m(e, { vin: v }).then(a => ({ archive: a })).catch(() => ({ archive: null })))(")],
  ["the prefill resolves the archive's chassis code as the model", "deskTypedCasesCheck", "lib/desk/ownCar.js", rep("model = f ? f.model : nameplateOf(archive.make, archive.model);", "model = archive.model;")],
  ["the prefill ignores the decode's model for the nameplate", "deskTypedCasesCheck", "lib/desk/ownCar.js", rep("model = f ? f.model : nameplateOf(archive.make, archive.model);", "model = nameplateOf(archive.make, archive.model); void f;")],
  ["a chassis code is not read as the 911", "deskTypedCasesCheck", "lib/desk/ownCar.js", rep("PORSCHE_911_CODES.includes(norm(model)) ? \"911\" : model;", "false ? \"911\" : model;")],
  ["the two phrasings of the car's own listing are asked one after the other", "deskTypedCasesCheck", "lib/desk/ownCar.js", rep("const [withWords, bare] = await Promise.all([words ? ask(base + \" \" + words) : null, ask(base)]);", "const withWords = words ? await ask(base + \" \" + words) : null, bare = await ask(base);")],
  ["the VIN step asks its three reads one after the other", "deskTypedCasesCheck", "lib/desk/vinStep.js", rep("    (ctx.liveMatch || (async", "    await (ctx.liveMatch || (async")],
  ["the read resolves the car's own listing after the plan, on every read", "deskTypedCasesCheck", "lib/sheetRead.js", rep("[plan, ownVeh] = await Promise.all([planP, ownP]);", "plan = await planP; ownVeh = await ownP;")],
  // THE WINDOWS, THE START, THE LIVE LINE, THE CLAIM AND THE CHASSIS (Nov 13 2026)
  ["the 3 month window is not offered", "deskViewsCheck", "lib/deskV3.js", rep("export const WINDOWS = [3, 6, 12, 24]", "export const WINDOWS = [6, 12, 24]")],
  ["24 months is offered whatever the record reaches back", "deskViewsCheck", "lib/deskV3.js", rep("WINDOWS.filter(m => m !== 24 || reachesPast12(matching, caseDate))", "WINDOWS.filter(m => true)")],
  ["24 months is offered to a record that begins exactly a year back", "deskViewsCheck", "lib/deskV3.js", rep("first < cutoffOf(caseDate, 12)", "first <= cutoffOf(caseDate, 12)")],
  ["a period the record cannot honour is taken", "deskViewsCheck", "lib/desk/caseWorkflow.js", rep("&& !c0.desk.windows.some(w => Number(w.months) === m)) return null;", "&& false) return null;")],
  ["the views are built for every window, honoured or not", "deskViewsCheck", "lib/onebox.js", rep("for (const m of (Array.isArray(desk.windows) && desk.windows.length ? desk.windows.map(w => w.months) : DESK_WINDOWS))", "for (const m of DESK_WINDOWS)")],
  ["the start ignores the chosen condition's rung", "reportConsistencyCheck", "lib/deskV3.js", rep("if (cond && cond.tier) {", "if (false) {")],
  ["a thin rung moves the start (fewer than five sales)", "reportConsistencyCheck", "lib/deskV3.js", rep("if (r && r.band && r.count >= DESK_TIER_MIN) return at(r.band.q1);", "if (r && r.band) return at(r.band.q1);")],
  ["a thin rung's start does not say it stays at all conditions", "reportConsistencyCheck", "lib/deskV3.js", rep("note: reasonLine(\"desk4.reserve_start_few\", { name: cond.name || \"\" }), tooFew: true", "note: null, tooFew: true")],
  ["the live line says above where the bid is below", "reportConsistencyCheck", "lib/reasonWords.js", rep("bid > fig ? \"above\" : bid < fig ? \"below\" : \"at\"", "bid > fig ? \"below\" : bid < fig ? \"above\" : \"at\"")],
  ["the live line is made for a listing that has ended", "reportConsistencyCheck", "lib/desk/caseView.js", rep("liveLine: liveLineOf(ownView(c.vehicle, now).ownLive,", "liveLine: liveLineOf(c.vehicle && c.vehicle.vinLiveMatch ? { listing: c.vehicle.vinLiveMatch.listing } : null,")],
  ["the report reads the live line", "reportConsistencyCheck", "lib/desk/reportState.js", rep("export function reportState(", "const _live = \"case.reserve.live_vs\";\nexport function reportState(")],
  ["no claim on an unopened lead", "deskTypedCasesCheck", "lib/desk/caseView.js", rep("claim: claimOf(sheet, seat),", "claim: null,")],
  ["the owner is offered the claim", "deskTypedCasesCheck", "lib/desk/caseView.js", rep("accessOf(sheet, seat).canPickUp ? { line: reasonLine(\"case.claim.line\")", "true ? { line: reasonLine(\"case.claim.line\")")],
  ["an open does not claim the lead", "deskTypedCasesCheck", "lib/desk/sheetActions.js", rep("if (body.open === true && accessOf(s0, seat).canPickUp) {", "if (false) {")],
  ["the refusal's line is not the claim's", "deskTypedCasesCheck", "lib/desk/sheetStore.js", rep("why: reasonLine(\"case.claim.line\") }", "why: \"Unopened.\" }")],
  ["a chassis is not recognised", "deskTypedCasesCheck", "lib/desk/vinStep.js", rep("return v.length >= 6 && v.length <= 16 && /[A-Z]/.test(v)", "return v.length >= 99 && /[A-Z]/.test(v)")],
  ["a chassis no record holds is refused as a VIN", "deskTypedCasesCheck", "lib/desk/sheetActions.js", rep("return isChassis(vin) ? { ok: true, vin, decoded: {}, chassis: true, ask: reasonLine(\"case.decode.ask_ymm\") } : warning", "return warning")],
  ["the form's pickers refuse a chassis no record holds", "deskTypedCasesCheck", "lib/desk/sheetActions.js", rep("if (isChassis(vin)) return { ok: true, vin, decoded: {}, chassis: true, ask:", "if (false) return { ok: true, vin, decoded: {}, chassis: true, ask:")],
  ["a VIN decode is asked for a chassis", "deskTypedCasesCheck", "lib/desk/vinStep.js", rep("isChassis(vin) ? null : (ctx.decodeVin", "false ? null : (ctx.decodeVin")],
  ["the live match reads a VIN only", "deskTypedCasesCheck", "lib/vinLiveMatch.js", rep("want.length >= 6 && want.length <= 16", "want.length >= 99 && want.length <= 16")],
  // SOLD ON HAGERTY (Nov 14 2026)
  ["the Hagerty count takes every venue's sales", "deskHagertySalesCheck", "lib/deskV3.js", rep("mine = inV.filter(isHagertyRow)", "mine = inV.filter(() => true)")],
  ["the Hagerty median is the all venue median", "deskHagertySalesCheck", "lib/deskV3.js", rep("const prices = mine.map(r => Number(r.price)).sort((a, b) => a - b), median = quant(prices, 0.5),", "const prices = inV.map(r => Number(r.price)).sort((a, b) => a - b), median = quant(prices, 0.5),")],
  ["a view with no Hagerty sale carries the wider window's figures", "deskHagertySalesCheck", "lib/deskV3.js", rep("if (!mine.length) return { ...base, line:", "if (!mine.length) return { ...base, count: 1, line:")],
  ["the report does not carry the Hagerty sentence", "deskHagertySalesCheck", "lib/desk/reportPdfV3.js", rep("if (v.hagertyLine) {", "if (false) {")],
  // PRIOR CASES AND THE CASE LIST (Nov 14 2026)
  ["the same car is matched on the title text, not the model key", "deskPriorCasesCheck", "lib/desk/priorCases.js", rep("return year + \"|\" + norm(make) + \"|\" + norm(fam);", "return norm(titleOf(sheet));")],
  ["the year is not part of the car", "deskPriorCasesCheck", "lib/desk/priorCases.js", rep("return year + \"|\" + norm(make) + \"|\" + norm(fam);", "return norm(make) + \"|\" + norm(fam);")],
  ["a q leaves the archived cases out", "deskPriorCasesCheck", "lib/desk/priorCases.js", rep("withArch = includeArchived === true || words.length > 0;", "withArch = includeArchived === true;")],
  ["the archived cases are left out of the prior cases", "deskPriorCasesCheck", "lib/desk/priorCases.js", rep("(all || []).filter(s => s && s.id !== sheet.id && carKeyOf(s) === key)", "(all || []).filter(s => s && !s.archived && s.id !== sheet.id && carKeyOf(s) === key)")],
  ["a lone number is left for the page to format (the Hagerty median line is dropped)", "deskHagertySalesCheck", "lib/deskV3.js", rep("medianLine: reasonLine(\"desk4.hagerty_median_line\", { median })", "medianLine: null")],
  ["the Hagerty last line is made with no date", "deskHagertySalesCheck", "lib/deskV3.js", rep("date: deskDateShort(last.date) })", "date: last.date })")],
  ["case_list does not match a seller name", "deskPriorCasesCheck", "lib/desk/priorCases.js", rep("s.car_label, aliasOf(s), s.id, sellerNameOf(s), fv(c, \"vin\"), s.vin]", "s.car_label, aliasOf(s), s.id]")],
  ["a prior case's reserve is left as a bare number", "deskPriorCasesCheck", "lib/desk/priorCases.js", rep("reserveLine: reserve != null ? reasonLine(", "reserveLine: reserve != null ? String(reserve) || reasonLine(")],
  ["a prior case's opened line is the stored timestamp", "deskPriorCasesCheck", "lib/desk/priorCases.js", rep("openedLine: /^\\d{4}-\\d{2}-\\d{2}$/.test(day) ? reasonLine(", "openedLine: /^\\d{4}-\\d{2}-\\d{2}$/.test(day) ? String(openedAt) || reasonLine(")],
  ["the sale rows carry no venue slug", "deskHagertySalesCheck", "lib/deskV3.js", rep("platform: r.platform || null, venue: venueSlugOf(r), url: r.url || null", "platform: r.platform || null, url: r.url || null")],
  ["the comparable rows carry no venue slug", "deskHagertySalesCheck", "lib/deskV3.js", s => s.split("platform: o.r.platform || null, venue: venueSlugOf(o.r),").join("platform: o.r.platform || null,")],
  ["the engine counts aloud again when no condition is suggested", "deskNoEngineTalkCheck", "lib/deskV3.js", rep("return { suggested: null, basis: null };", "return { suggested: null, basis: \"No condition is suggested, no signals counted and three are needed.\" };")],
  ["a stored case serves the old counting line", "deskNoEngineTalkCheck", "lib/desk/caseView.js", rep("if (desk && desk.condition && !desk.condition.suggested && desk.condition.basis)", "if (false)")],
  ["the report prints a note with no suggestion", "deskNoEngineTalkCheck", "lib/desk/reportState.js", rep("d.condition && d.condition.suggested && d.condition.basis ? d.condition.basis : null", "d.condition && d.condition.basis ? d.condition.basis : null")],
  ["a suggestion counts its signals aloud again", "deskNoEngineTalkCheck", "lib/reasonWords.js", rep("text: p => `Suggested ${p.name}, from ${p.what}.`", "text: p => `Suggested ${p.name} from ${p.what}, 3 signals counted.`")],
  ["a stored counted note is served as it was stored", "deskNoEngineTalkCheck", "lib/desk/conditionNote.js", rep("&& !OLD_TALK.test(String(c.basis))", "")],
  ["the likely figure is the whole pool's median, not the closest sales'", "deskTypedCasesCheck", "lib/desk/likely.js", s => s.split("b.median").join("desk.evidence.median")],
  ["the likely figure is the whole pool's median, not the closest sales' (page one)", "reportConsistencyCheck", "lib/desk/likely.js", s => s.split("b.median").join("desk.evidence.median")],
  ["the reserve role line shows with fewer than three closest sales", "deskTypedCasesCheck", "lib/desk/likely.js", rep("likely && likely.figure != null ? reasonLine", "likely ? reasonLine")],
  ["the report prints no likely result", "reportConsistencyCheck", "lib/desk/reportState.js", rep("likelyLine: likely.sellerLine,", "likelyLine: null,")],
  ["the report prints the reserve before the likely result", "reportConsistencyCheck", "lib/desk/reportPdfV3.js", s => s.replace("if (v.likelyLine) { y = para(", "if (false) { y = para(").replace("  y = Math.max(y + 62, yr2) + 12;", "  y = Math.max(y + 62, yr2) + 12; if (v.likelyLine) y = para(v.likelyLine, M, y, W - 2 * M, { size: 11 }) + 4;")],
  ["the floor sentence names a figure with no reserve check", "deskTypedCasesCheck", "lib/desk/likely.js", s => s.replace(": null;\n  const list", ": null;\n  const list") && s.replace("reached: ck.reached, of: ck.of }) : null;", "reached: ck.reached, of: ck.of }) : reasonLine(\"case.likely.floor\", { reserve: 0, reached: 0, of: 0 });")],
  ["the strip leaves a cell out", "deskTypedCasesCheck", "lib/deskV3.js", rep("if (ok && e.extremesLine) cells.push(", "if (false) cells.push(")],
  ["the closing line says the count in digits under thirteen", "deskTypedCasesCheck", "lib/reasonWords.js", rep("x >= 0 && x <= 12 ? COUNT_WORDS[x]", "x >= 0 && x <= 5 ? COUNT_WORDS[x]")],
  ["the closing line leaves the latest sale out", "deskTypedCasesCheck", "lib/deskV3.js", rep("return l && l.date && l.price ? sold +", "return false ? sold +")],
  ["the closing line pluralises a single sale", "deskTypedCasesCheck", "lib/reasonWords.js", rep("Math.round(Number(count)) === 1 || !t ? t", "!t ? t")],
  ["a view carries no closing line", "deskTypedCasesCheck", "lib/deskV3.js", rep("closingLine: closingLineOf(e, desk.subjectFacts)", "closingLine: null")],
  ["the likely figure line is left to the page", "deskTypedCasesCheck", "lib/desk/likely.js", rep("figureLine: reasonLine(\"case.likely.figure\", { figure: b.median }),", "figureLine: null,")],
  ["an audit line says the engine again", "deskNoEngineTalkCheck", "lib/reasonWords.js", rep("The assessment was set to the market median of", "The assessment was set to the engine's median of")],
  ["a stored audit entry is served as it was stored", "deskNoEngineTalkCheck", "lib/desk/caseView.js", rep("audit: (c.audit || []).map(plainAudit),", "")],
  ["the audit author is the engine again", "deskNoEngineTalkCheck", "lib/desk/caseModel.js", rep("(b === \"engine\" ? \"market\" : b)", "b")],
  ["an engine line returns in a refusal", "deskNoEngineTalkCheck", "lib/reasonWords.js", rep("There is no reserve from the market for this case yet", "The engine gave no answer on a reserve for this case yet")],
  ["the report prints the engine's short reached line again", "deskStateCheck", "lib/desk/reportState.js", rep("out.reachedLine = ck && ck.of ? sellerReached(c, ck) : ck && ck.reachedLine ? ck.reachedLine : null;", "out.reachedLine = ck && ck.reachedLine ? ck.reachedLine : null;")],
  ["the analyst's short line is lost from the report state", "deskStateCheck", "lib/desk/reportState.js", rep("out.reachedShortLine = ck && ck.reachedLine ? ck.reachedLine : null;", "out.reachedShortLine = null;")],
  ["the seller sentence counts the wrong sales", "deskStateCheck", "lib/desk/reportState.js", rep("reasonLine(\"report.reserve_reached\", { of: ck.of, reached: ck.reached,", "reasonLine(\"report.reserve_reached\", { of: ck.of, reached: ck.of,")],
  ["an older shape is not read again on open", "deskViewsCheck", "lib/desk/caseWorkflow.js", rep("export const staleShape = c => !!(c && c.desk && c.desk.evidence && (Number(c.desk.shape) || 0) < DESK_SHAPE);", "export const staleShape = c => false;")],
  ["the engine's answer carries no shape", "deskViewsCheck", "lib/deskV3.js", rep("return { version: 1, shape: DESK_SHAPE, windows:", "return { version: 1, windows:")],
  ["a case at the current shape is read on every open", "deskViewsCheck", "lib/desk/caseWorkflow.js", rep("export const staleShape = c => !!(c && c.desk && c.desk.evidence && (Number(c.desk.shape) || 0) < DESK_SHAPE);", "export const staleShape = c => !!(c && c.desk && c.desk.evidence);")],
  ["the open path no longer re-reads a stale case", "deskViewsCheck", "lib/desk/sheetActions.js", rep("W.needsReread(s0.case)) { try {", "false) { try {")],
  ["the served view ignores the chosen condition", "deskTypedCasesCheck", "lib/desk/caseWorkflow.js", rep("export const viewOfCase = c => ({ tier: c.condition && c.condition.selected &&", "export const viewOfCase = c => ({ tier: false && c.condition && c.condition.selected &&")],
  ["a different condition is set with no note", "deskTypedCasesCheck", "lib/desk/caseWorkflow.js", rep("if (t !== (sug ? sug.tier : null) && !why) return", "if (false) return")],
  ["a condition change writes no audit entry", "deskTypedCasesCheck", "lib/desk/caseWorkflow.js", rep("logAudit(c, { at: iso(now), by: \"analyst\", what: \"condition set\"", "void ({ at: iso(now), by: \"analyst\", what: \"condition set\"")],
  ["the default view ignores the suggested condition", "deskTypedCasesCheck", "lib/desk/caseWorkflow.js", rep("if (sg && c.desk && hasViews(c.desk) && viewOf(c.desk, viewKey(sg.tier, months))) tier = sg.tier;", "")],
  ["the report prints a rung the analyst did not tick", "reportConsistencyCheck", "lib/desk/reportState.js", rep("{ keys, inUse } = reportRungsOf(c); return !l", "{ inUse } = reportRungsOf(c), keys = [\"safe\", \"balanced\", \"ambitious\", \"noReserve\"]; return !l")],
  ["the reserve figure is not the chosen rung's", "deskTypedCasesCheck", "lib/desk/caseWorkflow.js", rep("const fig = k === \"noReserve\" ? was.figure : rg.figure;", "const fig = was.figure;")],
  ["the role line is back in the served case", "deskTypedCasesCheck", "lib/desk/caseView.js", rep("noReserve: reportReserveModeOf(c).mode === \"no_reserve\",", "roleLine: \"The reserve protects the sale. Bidding decides the price.\", noReserve: reportReserveModeOf(c).mode === \"no_reserve\",")],
  ["the role line is back on the report", "reportConsistencyCheck", "lib/desk/reportState.js", rep("reserveReason: noRes &&", "roleLine: \"The reserve protects the sale. Bidding decides the price.\", reserveReason: noRes &&")],
  ["the three closest are the three lowest prices", "reportConsistencyCheck", "lib/desk/likely.js", rep(".map(x => Number(x.price));", ".map(x => Number(x.price)).sort((x, y) => x - y);")],
  ["the engine default ignores the ladder's recommended rung", "deskTypedCasesCheck", "lib/desk/caseWorkflow.js", rep("start = ladderFigure(c0) != null ? ladderFigure(c0) :", "start = false ? 0 :")],
  ["a rung that is not available can be used", "deskTypedCasesCheck", "lib/desk/caseWorkflow.js", rep("if (!rg || rg.available === false) return { refuse", "if (!rg) return { refuse")],
  ["the in-use rung can be unticked from the report", "deskTypedCasesCheck", "lib/desk/caseWorkflow.js", rep("const keys = RUNG_KEYS.filter(k => k === inUse || (ticked", "const keys = RUNG_KEYS.filter(k => (ticked")],
  ["the pictures are fetched in stages again, not all at once", "deskPdfCheck", "lib/desk/reportPdfV3.js", rep("for (const u of [logo, urlOf(coverId), ...rs.comparables.map(cm => cm.photo), ...rs.v4.photoIds.map(urlOf)]) get(u);", "")],
  ["a picture used twice is fetched twice", "deskPdfCheck", "lib/desk/reportPdfV3.js", rep("if (!imgs.has(url)) imgs.set(url, loadImage(url, fetchImage)); return imgs.get(url);", "return loadImage(url, fetchImage);")],
  ["a fetched picture is not kept", "deskPdfCheck", "lib/desk/imageCache.js", rep("if (b && /^https:\\/\\//.test(String(url || \"\"))) { CACHE.set(url, { b, at: Date.now() });", "if (false) { CACHE.set(url, { b, at: Date.now() });")],
  ["the report drops the analyst's why", "reportConsistencyCheck", "lib/desk/reportPdfV3.js", rep("  if (v.why) {   // the analyst's why, exactly", "  if (false) {   // the analyst's why, exactly")],
  ["the report prints only one of the things we took into account", "reportConsistencyCheck", "lib/desk/reportPdfV3.js", rep("for (const it of v.considered.slice(0, 5)) yb2", "for (const it of v.considered.slice(0, 1)) yb2")],
  ["a screen field labelled Printed in the report has no print check", "reportConsistencyCheck", "lib/preview/deskV4.js", rep("<label for=\"why\"><span>Printed in the report</span>", "<label for=\"why\"><span>Printed in the report</span></label><label for=\"extra\"><span>Printed in the report</span>")],
  ["the report cuts the things we took into account to five", "reportConsistencyCheck", "lib/desk/reportPdfV3.js", rep("for (const it of v.considered) yb2 = item(", "for (const it of v.considered.slice(0, 5)) yb2 = item(")],
  ["the report cuts a next step at four lines", "reportConsistencyCheck", "lib/desk/reportPdfV3.js", rep("{ size: 13, lh: 18, max: 12 }", "{ size: 13, lh: 18, max: 2 }")],
  ["the served reserve figure line is not the chosen rung's", "deskTypedCasesCheck", "lib/desk/caseView.js", rep("export const reserveFigureLine = c => { const f = reserveOf(c).figure;", "export const reserveFigureLine = c => { const f = null;")],
  ["an answer that carries the case lacks case.reserveChoice", "deskTypedCasesCheck", "lib/desk/caseView.js", rep("condition: conditionOut(c), reserveChoice: reserveChoiceOf(c),", "condition: conditionOut(c),")],
  ["the report's type floor is gone", "deskPdfCheck", "lib/desk/reportPdfV3.js", rep("const MINPT = 9,", "const MINPT = 6,")],
  ["a page that runs out shrinks its text instead of continuing", "deskPdfCheck", "lib/desk/reportPdfV3.js", rep("const room = async (h, title) => { if (y + h > FOOT - 8) await cont(title); };", "const room = async () => {};")],
  ["the footers say page x of 4", "deskPdfCheck", "lib/desk/reportPdfV3.js", rep("right(`Page ${n} of ${total}`,", "right(`Page ${n} of 4`,")],
];
function copyTree(dst) {
  for (const d of ["lib", "scripts", "public", "api", "data", "docs"]) if (fs.existsSync(path.join(ROOT, d))) fs.cpSync(path.join(ROOT, d), path.join(dst, d), { recursive: true, filter: s => !/node_modules|proofs/.test(s) });
  for (const f of ["package.json", "vercel.json"]) if (fs.existsSync(path.join(ROOT, f))) fs.copyFileSync(path.join(ROOT, f), path.join(dst, f));
  fs.symlinkSync(path.join(ROOT, "node_modules"), path.join(dst, "node_modules"));
}
const run = (dir, check) => { try { const o = execFileSync("node", ["scripts/" + check + ".mjs", dir], { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 280000 }); return { red: false, out: o }; } catch (e) { return { red: true, out: String(e.stdout || "") + String(e.stderr || "") }; } };
let bad = 0; const only = process.argv[2] && /^\d+$/.test(process.argv[2]) ? Number(process.argv[2]) : null;
for (const [i, [name, check, file, fn]] of MUT.entries()) {
  if (only != null && only !== i) continue;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fr-")); copyTree(dir);
  const p = path.join(dir, file), before = fs.readFileSync(p, "utf8"), after = fn(before);
  if (after === before) { console.log("FAIL  mutation did not apply: " + name); bad++; fs.rmSync(dir, { recursive: true, force: true }); continue; }
  fs.writeFileSync(p, after); const r = run(dir, check);
  console.log((r.red ? "ok  " : "FAIL") + `  [${i}] without the fix, ${check} goes red: ` + name + (r.red ? "  (" + (r.out.split("\n").find(l => /^FAIL/.test(l)) || r.out.split("\n").filter(Boolean).slice(-1)[0] || "").slice(0, 80) + ")" : ""));
  if (!r.red) bad++;
  fs.rmSync(dir, { recursive: true, force: true });
}
console.log(`deskFirstRunFailsWithout: ${bad ? bad + " PROBLEM" : "every mutation is caught"}`); process.exit(bad ? 1 : 0);
