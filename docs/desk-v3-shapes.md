# Desk v3 shapes (Lane D, Nov 8 2026)

Served by the actions case_new and case_get (lib/desk/sheetActions.js) through lib/desk/caseView.js. The page draws these and computes nothing.

## Added for Lane E (adopted exactly as guessed)
- case.stage: one of new, review, ready, final. The stored status (new, in_review, ready, finalized) maps one to one (STAGE_OF in lib/desk/caseModel.js). Both ride on the case; draw stage.
- case.handling.lines: an array of {label, value}, both strings, in this order: Reports finalized today, Median handling time, Cases needing more from the seller, Reports revised after finalizing. Values are worded on the server ("3", "15 min", "25%", "none yet"). Org wide only, no per analyst figure.
- case.queue: {new, review, ready, final}, the rail group counts for the org, from the server.

## The case record (stored in desk_sheets.sheet.case)
Keys: org, lead_ref, seller {name,email}, submitted_at, opened_at, finalized_at, handling_seconds, status, fields, asked [], photos {items[{id,name,addedAt}], coverId, reportIds[]}, documents [{id,name,kind,status: outstanding|received}], needs_review [{id,label,material,state: open|done|waived,reason}], condition {suggested,selected}, assessment {figure,low,high,explanation}, reserve {figure,rationale,seller_agreed}, factors [], exclusions [{saleId,scope: market_calc|report,reason,at}], audit [{at,by,what,field,from,to,source}], version.
fields has one entry for each of vin, year, make, model, trim, body, transmission, generation, mileage, colour, accident_history, service_history. Each is {value, source, verified, candidates[{value,source}]}. source is one of seller, vin_decoded, records, analyst_verified, missing, conflicting. Mileage is fields.mileage and nowhere else.
Added by Stage 2 (see the Stage 2 section): case.desk (Lane B's sheet.desk block stored as read: key, readAt, evidence, original, comparables, outside, quarters, live, condition, factors, excluded), case.selectedComparables [saleId], and readiness on the case_edit answer.

## Stage 2 actions (crew only, a seat is refused as before)
- case_edit { id, op, baseVersion? } returns { ok, id, version, recalled, case, readiness: { ready, blockers: [{key, why}] } }. ops: field {field,value} (a correction: audit line, verification reset), verify {field}, assessment {patch:{figure,low,high,explanation}}, reserve {patch:{figure,rationale,seller_agreed}}, comparables {ids}, condition {selected:{tier,name}}, exclude {saleId,scope: market_calc|report,reason}, need {id,state: open|done|waived,reason}. A second tab is refused whole (stale), as with sheet saves.
- case_finalize { id } returns { ok, version, row, case } or a refusal with blockers. The row is written once to desk_case_versions (docs/supabase-desk-case-versions.sql, to be run by Sam) and never edited.
- case_version { id, version? } returns the finalized version row (latest when none named) and the list of versions. This is the hand off; the Desk sends nothing.
- The engine is re-called only when the case's recall key moves: mileage, transmission, body, generation, the condition tier, or a market_calc exclusion. Blocker keys: vehicle, need:<id>, assessment, assessment_range, explanation, reserve, reserve_range, rationale, photo, comparable.
- Needs review ids generated from source states: mileage_unconfirmed (material), accident_unclear (material), vin_mismatch (material), service_documents (not material).

## The demonstration case (1999 Porsche 911 Carrera, lead HM-24117), as case_get serves it
```json
{
 "org": "sam",
 "lead_ref": "HM-24117",
 "seller": {
  "name": "Hal Moreau",
  "email": "hal@example.com"
 },
 "submitted_at": "2026-11-07T18:20:00.000Z",
 "opened_at": null,
 "finalized_at": null,
 "handling_seconds": null,
 "status": "new",
 "fields": {
  "vin": {
   "value": "WP0AA2990XS620481",
   "source": "seller",
   "verified": false,
   "candidates": [
    {
     "value": "WP0AA2990XS620481",
     "source": "seller"
    }
   ]
  },
  "year": {
   "value": 1999,
   "source": "seller",
   "verified": false,
   "candidates": [
    {
     "value": 1999,
     "source": "seller"
    }
   ]
  },
  "make": {
   "value": "Porsche",
   "source": "seller",
   "verified": false,
   "candidates": [
    {
     "value": "Porsche",
     "source": "seller"
    }
   ]
  },
  "model": {
   "value": "911",
   "source": "seller",
   "verified": false,
   "candidates": [
    {
     "value": "911",
     "source": "seller"
    }
   ]
  },
  "trim": {
   "value": "Carrera",
   "source": "seller",
   "verified": false,
   "candidates": [
    {
     "value": "Carrera",
     "source": "seller"
    }
   ]
  },
  "body": {
   "value": "Coupe",
   "source": "seller",
   "verified": false,
   "candidates": [
    {
     "value": "Coupe",
     "source": "seller"
    }
   ]
  },
  "transmission": {
   "value": "Manual",
   "source": "seller",
   "verified": false,
   "candidates": [
    {
     "value": "Manual",
     "source": "seller"
    }
   ]
  },
  "generation": {
   "value": "996",
   "source": "vin_decoded",
   "verified": false,
   "candidates": [
    {
     "value": "996",
     "source": "vin_decoded"
    }
   ]
  },
  "mileage": {
   "value": 61200,
   "source": "seller",
   "verified": false,
   "candidates": [
    {
     "value": 61200,
     "source": "seller"
    }
   ]
  },
  "colour": {
   "value": "Arctic Silver",
   "source": "seller",
   "verified": false,
   "candidates": [
    {
     "value": "Arctic Silver",
     "source": "seller"
    }
   ]
  },
  "accident_history": {
   "value": null,
   "source": "missing",
   "verified": false,
   "candidates": []
  },
  "service_history": {
   "value": "Seller reports the IMS bearing was replaced",
   "source": "seller",
   "verified": false,
   "candidates": [
    {
     "value": "Seller reports the IMS bearing was replaced",
     "source": "seller"
    }
   ]
  }
 },
 "asked": [
  "accident_history"
 ],
 "photos": {
  "items": [
   {
    "id": "ph_front",
    "name": "front.jpg",
    "addedAt": "2026-11-08T09:00:00.000Z"
   },
   {
    "id": "ph_rear",
    "name": "rear.jpg",
    "addedAt": "2026-11-08T09:00:00.000Z"
   }
  ],
  "coverId": "ph_front",
  "reportIds": [
   "ph_front",
   "ph_rear"
  ]
 },
 "documents": [
  {
   "id": "doc_ims",
   "name": "IMS invoice",
   "kind": "service",
   "status": "outstanding"
  }
 ],
 "needs_review": [
  {
   "id": "mileage_unconfirmed",
   "label": "Mileage not confirmed",
   "material": true,
   "state": "open",
   "reason": ""
  },
  {
   "id": "service_documents",
   "label": "No service documents yet",
   "material": false,
   "state": "open",
   "reason": ""
  }
 ],
 "condition": {
  "suggested": null,
  "selected": null
 },
 "assessment": {
  "figure": null,
  "low": null,
  "high": null,
  "explanation": ""
 },
 "reserve": {
  "figure": null,
  "rationale": "",
  "seller_agreed": false
 },
 "factors": [],
 "exclusions": [],
 "audit": [],
 "version": 1,
 "stage": "new",
 "queue": {
  "new": 1,
  "review": 0,
  "ready": 0,
  "final": 0
 },
 "handling": {
  "lines": [
   {
    "label": "Reports finalized today",
    "value": "0"
   },
   {
    "label": "Median handling time",
    "value": "none yet"
   },
   {
    "label": "Cases needing more from the seller",
    "value": "100%"
   },
   {
    "label": "Reports revised after finalizing",
    "value": "0"
   }
  ]
 }
}
```

## Stage 3: the report's wording (lib/desk/reportState.js)
reportState(case) returns the one object the workspace and the PDF print; every sentence is a lib/reasonWords.js line (ids report.*, desk.no_prior_vin), picked from the case's state. A sentence the case cannot support is null (or an empty list), never a softer claim. Keys: identification{vin,year,make,model,trim,body,transmission,generation,colour}, rangeLine, reserveLine, explanation and rationale (the analyst's own words), populationLine and insufficientLine (the engine's), typicalLine, reservePosition (below|inside|above|null) and reservePositionLine (the SAME comparison as case_edit's reservePosition), sellerLine (only when seller_agreed is true), mileageLine (verified | as stated by the seller | not confirmed), imsLine (seller reported with invoices outstanding until a service document is received, then documented; null when the case never speaks of IMS), conditionLine (one line per rung, for the tier the analyst selected), limitations[] (open items, and waived items with their reason), nextSteps[] (the invoices step drops once documents are received), noteLines[] (the one no prior auction record sentence, only for a read VIN with no earlier appearance). case_finalize stores this object as the version row's wording.

## Lane E's three fields (Stage 4 block)
- case_edit ops for photos, so the Vehicle tab stops using the old sheet actions: photo_add { name, data: base64 } (the same checks as sheet_photo_add, one shared function; the photo lands on the case, appended, and on the sheet's submission), cover { photoId } (must be a photo of the case; logged), report_photos { ids } (the report selection; the cover always stays in). None of them re-calls the engine. A seat is refused as before.
- On the case from case_get, case_new and case_edit: assessment.differenceLine (the assessment against the market reference, which is the engine's median: "The assessment is $500 above the market reference of $37,024." / below / "at the market reference of"), reserve.positionLine (the below, inside or above sentence reportState builds, the same string) and reserve.position (below|inside|above), vehicle.mileageLine (the mileage in words through countNoun: "61,400 miles", "1 mile"). Each is null, never blank text, when the case has no figure, no evidence or no mileage. The workspace and the PDF print one line because both read reportState.

## Exclusion scopes (case_edit op exclude { saleId, scope, reason })
The three scopes are the engine's own names: market_calc (the sale leaves the market figures), report_comps (the sale leaves the report's comparables list), note_only (neither: the reason and scope go in the audit trail and ride on that comparable as comparable.exclusion { scope, reason, at }; the comparable stays listed and nothing is recomputed). A reason is required. market_calc and report_comps re-call the engine; note_only never does. An earlier draft of the case called the report scope "report", which the engine reads as note_only; it is now report_comps.

## Stage 4: the four page report (lib/desk/reportPdfV3.js)
sheet_pdf and sheet_send build it for any sheet that has a case (sheet_pdf with draft:true gives the DRAFT preview, no report number, not stored); sheets with no case still use the old ten part report. Page 1: the seller's cover photo (the case's cover; a typographic cover when there is none, never a placeholder), identification, the likely selling price range and the recommended reserve, the short explanation. Page 2: the dot strip of every completed sale the engine lists, with the median, the assessed range and the reserve marked; strengths and considerations; the condition box. Page 3: up to four selected comparables with photo, price, miles, venue, date, why sentence and a clickable link (https only); a sale with no photo is a text card. Page 4: the shown quarters, live listings (bid, ask, not sold), next steps, the note, contact and version. Every page: org, report number, date, version, "Page n of 4". The org's logo and brand colour come from the org row. A section with nothing to say is not printed. reportState gained strip, strengths, considerations, conditionBasis, comparables, quarterLines, liveLines, liveLinks.

## Stage 5: handling time
- case.opens [{ seat, at }] (the first open of each analyst, recorded once; the seat stays inside the case) and case.opened_at (the first open of anyone). case_get { id, open: true } records the open (the workspace sends open on opening, not on a refresh); a plain case_get is a read. case_edit op ask { fields } returns { asked: [the fields newly asked] }: a field is asked once.
- case.handling_seconds and the version row's handling_seconds are taken on finalize, from the finalizing analyst's own first open. A revision (version n plus 1) starts its own opens, so its handling time is the time on the revision.
- case.handling.lines (the four operations lines) are made by lib/desk/caseView.js handlingLines; the crew dashboard is GET /api/usageDashboard?view=desk (the same x-ops-key header as every view; format=json for the data): per org, { org, cases, queue, lines }, from that org's own cases, no seat, analyst or owner figure.
- Export records of a case sheet are rows in desk_case_exports (docs/supabase-desk-case-versions.sql), never in the finalised sheet row.

## Report settings (desk_orgs.settings, read by orgSettings)
paper: "letter" (default) or "a4"; contactAddress, contactPhone, contactEmail: the contact block of page 4. The report names no analyst anywhere; "Prepared by" is the org.

## case_pdf (the Preview pane's door)
case_pdf { id, draft } returns { ok, draft, filename, reportNumber, version, pdf_b64, parts, pages }. draft: true is the four page report for the case as it stands, DRAFT watermarked, reportNumber null, nothing stored (no export record, no sheet write), for any sheet that has a case you may view. draft: false (or absent) is the finalized version's PDF: this sheet if it is finalized, else the latest finalized sheet it corrects (a revision in progress has none of its own yet), with its report number and no watermark; it needs the finalizing seat, counts against the monthly cap and records one export beside the sheet; before any version is finalized it is refused. Crew only like every case_* action: api/desk.js lets a seat run sheet_ actions only. EXCLUSION_SCOPES already holds note_only (market_calc, report_comps, note_only), done in e1b0b464.
