# Desk v3 shapes (Lane D, Nov 8 2026)

Served by the actions case_new and case_get (lib/desk/sheetActions.js) through lib/desk/caseView.js. The page draws these and computes nothing.

## Added for Lane E (adopted exactly as guessed)
- case.stage: one of new, review, ready, final. The stored status (new, in_review, ready, finalized) maps one to one (STAGE_OF in lib/desk/caseModel.js). Both ride on the case; draw stage.
- case.handling.lines: an array of {label, value}, both strings, in this order: Reports finalized today, Median handling time, Cases needing more from the seller, Reports revised after finalizing. Values are worded on the server ("3", "15 min", "25%", "none yet"). Org wide only, no per analyst figure.
- case.queue: {new, review, ready, final}, the rail group counts for the org, from the server.

## The case record (stored in desk_sheets.sheet.case)
Keys: org, lead_ref, seller {name,email}, submitted_at, opened_at, finalized_at, handling_seconds, status, fields, asked [], photos {items[{id,name,addedAt}], coverId, reportIds[]}, documents [{id,name,kind,status: outstanding|received}], needs_review [{id,label,material,state: open|done|waived,reason}], condition {suggested,selected}, assessment {figure,low,high,explanation}, reserve {figure,rationale,seller_agreed}, factors [], exclusions [{saleId,scope: market_calc|report,reason,at}], audit [{at,by,what,field,from,to,source}], version.
fields has one entry for each of vin, year, make, model, trim, body, transmission, generation, mileage, colour, accident_history, service_history. Each is {value, source, verified, candidates[{value,source}]}. source is one of seller, vin_decoded, records, analyst_verified, missing, conflicting. Mileage is fields.mileage and nowhere else.
Not yet on the case (Stage 2 adds them; Lane B's shapes are still wanted): desk.original, desk.evidence, selected comparables, readiness.

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
