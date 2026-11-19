# Desk V3 dry run: a lead becomes a case, the analyst decides, the report is made from the case

For Sam to run on the preview once Lane E's pages are live (/preview/desk and /preview/desk/case/:id, crew only, nothing public). Everything below is crew only until you say go. The page computes nothing: every figure and every sentence you see comes from the case record and the engine's answer; where a step says "must equal", compare the two. The demonstration case is the 1999 Porsche 911 Carrera, lead HM-24117.

## V3 0. Before you start (once)

1. Run docs/supabase-desk-case-versions.sql in the Supabase SQL editor. It makes two tables, desk_case_versions (one row per finalized version, never edited) and desk_case_exports (one row per PDF export or send). Until it is run the preview works in memory but nothing is saved.
2. The org row (desk_orgs.settings) carries the report's settings: paper ("letter" by default, "a4" for A4), contactAddress, contactPhone, contactEmail (page 4 prints those that are set), and the logo and colour from docs/supabase-desk-brand-color.sql. The report names the org and never an analyst.
3. Sign in as crew and open /preview/desk. Open View as, pick the Hagerty expert seat.

## V3 1. The case

1. Open HM-24117. The header names the car, the lead reference and the stage (new, review, ready or final). The rail group counts come from the server.
2. To start from nothing instead, make a case by hand with no lead data. Every field reads Missing and nothing is asked twice: a field the Desk asked the seller for is never asked again.

## V3 2. The Vehicle tab

1. Each fact shows where it came from: seller, VIN decoded, records, analyst verified, missing or conflicting. Mileage appears in one place and reads "61,400 miles" as the case words it.
2. Correct the mileage. Check: an audit line is written, its verification resets, "Mileage is not confirmed" opens as a material item, and the market evidence is read again by the engine (Market evidence shows the new reading). Verify it again and the item closes.
3. Change the transmission or the body: the engine reads again. Change the generation: an audit line only, no new reading (the engine works it out from the year). Change a note, a photo or the reserve: no new reading.
4. Photos: Add photos works at any time, the first photo is the cover, Make cover moves it, and the Report box picks the photos that print. There is no remove.
5. Documents: mark the IMS invoice received. Check: the IMS sentence changes from "reported by the seller, and the invoices are outstanding" to "documented by the service invoices received", the "Send the service invoices" step goes, and the "No service documents received" item closes.

## V3 3. Needs review

1. The items are made from the case, never typed: Mileage is not confirmed, Accident history is unclear, The VIN and the other details do not agree (a conflict between sources), and No service documents received.
2. Only the first three block finalizing. Waive one: it asks for a reason, and the reason prints on the report as a limitation. A waived item stays waived while its cause stands.

## V3 4. Market evidence

1. The engine's reading is shown twice: the original (nothing excluded) and the current set. The stale sentence appears when the newest sale is old. With fewer than three sales the engine gives no figure and says why; nothing is invented.
2. Exclude a comparable. A reason is required, and there are three scopes. Market calc leaves the sale out of every market figure (median, quartiles, quarters, factors) and the original stays as it was. Report comps leaves it out of the four comparables on the report only. Note only changes nothing: the reason and scope go in the audit trail and on that comparable, which stays listed.
3. Check: the figures move only for Market calc, the comparables list moves only for Report comps, and an excluded sale is greyed in place, never removed.

## V3 5. The decision

1. Set the assessment (a figure and a range) and the reserve. They are independent: changing one never changes the other.
2. The assessment line reads "The assessment is $500 above the market reference of $37,024", and the reserve line reads "The reserve sits inside the typical range of $34,583 to $37,860" (or below, or above). Move the reserve across the lower and upper quartile and watch the word change; exactly at either quartile reads inside.
3. Tick Seller has agreed this reserve: the sentence "The seller has agreed to this reserve" appears on the report. Untick it and it goes.
4. Write the explanation and the reserve rationale. They print in your words.

## V3 6. Readiness and finalizing

1. The ready check lists what is missing: the vehicle identified, no open material item, the assessment inside the engine's low to high or an explanation of at least 60 characters, the reserve at or below the upper quartile or an explanation of at least 60 characters, an explanation and a rationale, at least one photo, and at least one comparable selected. Each blocker alone stops finalizing. A missing colour, trim, extra photo or document never does.
2. Press Preview report: a four page PDF with a DRAFT watermark and no report number. Check page by page:
   - Page 1: the cover photo you chose (a typographic cover if there is none, never a placeholder), the car, the likely selling price range and the recommended reserve, your explanation.
   - Page 2: every completed sale as a dot with the median, your assessed range and the reserve marked; strengths and considerations; the condition box.
   - Page 3: up to four comparables with photo, price, miles, venue, date, a sentence on why, and a link that opens the listing; a sale with no photo is a text card.
   - Page 4: the quarterly medians that are shown, the live listings as bid, ask or not sold, the next steps, the note, the contact block and the version.
   - Every page: "Prepared by" the org, the page number out of 4, and the margins safe for printing. No analyst name anywhere.
3. Finalize. Check: version 1 is locked, the status reads Finalised, a report number is given, and the PDF has no watermark. The same figures and sentences are in the version row.
4. Export the PDF and send it with the existing Send panel. Check: the sheet row is not changed (exports and the send are recorded beside it), and the sheet reads Sent with its date.

## V3 7. A change after finalizing

1. Change anything on the finalized case. Check: a new sheet opens as version 2, which corrects the first. Version 1, its report and its PDF are untouched. Finalize version 2 and it gets its own report number.
2. The rail counts the pair as one case.

## V3 8. Handling time

1. Open the operations block (the rail) or /api/usageDashboard?view=desk with the crew key. It shows, per organisation: reports finalized today, median handling time, the share of cases that needed more from the seller, and reports revised after finalizing. There is no per analyst figure anywhere.
2. Handling time runs from your first opening of the case to finalizing; a revision counts from its own opening.

## V3 9. What must never happen

1. A sentence on the report that the case does not support (the IMS line "documented" while invoices are outstanding, "seller has agreed" while unticked, "verified" mileage that is not).
2. A figure on the page or the PDF that is not the engine's or yours.
3. A change to version 1 after it is finalized.
4. An analyst name on the report.

# Hagerty Desk dry run: the expert flow, click by click

For Sam to test from. The page text below is what the code prints (public/js/deskvals.js, lib/desk). Where a figure appears, it must equal what the engine read; the page computes nothing. Use your own mailbox and your own address for Send. Touch no real customer sheet.

Branch with the latest Desk changes: lane-d-desk-blockers (a pool that splits asks the body first, the whole tier pool with the mileage band marked and real miles, a draft PDF before finalise, the no-listing line; on top of New valuation, the org's own report, My reports, two tab version, no dashes in Desk copy). The same screens are in the crew-only /preview/desk. The live site runs whatever Lane C has pushed, so note the version you tested.

## 0a. Hagerty's logo and colour (once, by Sam)

The report and the email use the Hagerty org's own name, logo and colour. Until they are set the report shows the name in type and the Desk's green. To set them: run docs/supabase-desk-brand-color.sql in the Supabase SQL editor (adds the `brand_color` column, RLS lines included), upload a PNG or JPG logo (not SVG) to the Storage bucket `desk-hagerty` as `hagerty/brand/logo.png`, then run the one `update desk_org_settings ...` line at the bottom of that file with Hagerty's hex colour.

## 0. Before you start

1. Sign in to goasksam.com as crew. Open /desk.
2. Open "View as" in the footer line of the left rail (a drop down that reads "View as..."). Pick "hagerty · Expert 1". The footer then says who you are looking as and shows the way back ("back to crew"). Every View as is logged (step 6).
3. Write down the time you send the email in step 1.

## 1a. Start a sheet by hand: New valuation

The same sheet the inbound email makes, started from the top bar of the Desk (Valuations mode).

1. In the bar at the top, type a VIN, or a year, make and model ("2008 Porsche 911 Carrera S"), the miles in the **Miles** box, and pick photos with the file box if you have them (up to 20, JPG, PNG or WebP; each is shrunk in your browser and checked and resized on the server).
2. Press **New valuation**. The sheet opens. Check: the car is named the way an emailed one is ("2002 BMW M3 Convertible", never a maker code), the miles are on the sheet, the photos are in section 4, and the read has run (a year, make and model sheet is read from the words; a VIN sheet from the decode).
3. If a photo cannot be added the page says how many were not added; the sheet is still made.
4. The same row then appears under My reports as a Draft.

## 1. Intake: the email

1. From your own mailbox, send an email to hagerty@desk.goasksam.com. Subject: anything. Body: a VIN and a mileage in words, for example "VIN WP0AB29918S745123, 41,000 miles". Attach two photos (JPG or PNG).
2. Use a real VIN for a 911 or a Corvette, so the condition tiers exist (step 2).
3. Wait. The sheet should appear in the left rail under "Today's queue" with status New. Note how long it took from sending.

Should show in the queue row: the car named in plain words (year, make, model, body, for example "2008 Porsche 911 Carrera S Coupe", never a maker code such as "M3Ci"), the VIN, the status New, the time it has been in the queue.

If nothing appears in five minutes: the webhook is the first suspect. Ask Lane D to read the deskInbound log line `deskInbound rejected: reason=...`; the reason names the cause (secret_missing, missing_headers, stale_timestamp, no_matching_signature).

## 2. The sheet: open it

Click the row. The sheet opens in a tab. It has seven sections, numbered down the page.

1. **The car.** Year, make, model, trim, body, VIN, mileage (marked "from the submission"), gearbox and colour if known. Under them the **photo strip**: every photo of the sheet as a thumbnail, the first marked **Cover** (any other has "Make cover"), and **Add photos**, which works at any time while the sheet is open, one photo or several, one after the other ("Adding photo 2 of 3" shows while it works). Buttons: "Confirm the car" (then a "Confirmed" chip). Check: the car is named correctly, mileage matches the email, every photo shows as a picture in the strip. Add one photo, then add a second afterwards: the strip must show 2 and say "2 photos, the first is the cover".
2. **This exact car.** "Every auction appearance of this VIN." Either the earlier sales with venue, date and price, or the engine's line that there is none.
3. **The market.** The **range meter** leads the section and is always there: a horizontal line for the picked body and tier pool, the typical range shaded with Low and High under it, the engine median marked, and every sale dotted on it (the tier's sales in green when the meter shows the body pool). The **analyst marker** sits on the meter and starts at the engine median; drag it to set your figure, and the sheet prints "Engine median $58,500. Analyst figure $61,000 (plus)." The engine's median never moves; yours does. Below it: window, sales count, newest sale, splits, **Live now** (only cars for the body you picked, or none), comparables newest first.
4. **Condition.** Four tier buttons (they light the moment you click, and the sheet says "Reading the market" while the engine answers) with counts: Tier 1 Concours, 2 Excellent, 3 Good, 4 Fair. Below them "Untiered: N stay in the wider pool." Then the ladder, one line each (Concours: the best example anywhere, show quality; Excellent: near new, a careful restoration or an exceptional original; Good: a sound driver with wear a buyer would expect; Fair: runs and drives, visible wear or needs; Untiered: not enough evidence to place it). With a tier picked: the count in that condition and the evidence lines the engine counted for this car. A car typed in words (or a VIN with no sale in the archive) has no listing to read, so the sheet and the PDF print the one line "No listing for this car yet; the tier is the analyst's call" in its place; a car whose listing yielded no signals says the engine counted none. Then the photos from the submission (tick the ones for the report, set the hero) and any documents.
5. **What we cannot see.** Six items: Title status, Service records, Ownership history, Modifications (Stock, Period, Modified, Restomod), Accident or repair history, Provenance. Mark each Seen, Not seen or Not supplied. A free line is optional. No numbers here.
6. **Decision.** "A reserve or a range. The engine never gives one: you do." Reserve or range, reasons, the line of reasoning, the guards, the note to the seller.
7. **Finalise.** "Locks the sheet, stamps it, builds the report."

If the car's model has no tiers yet from the overnight run, the tier buttons show no counts and the sheet says "Condition tiers are not assigned to these sales yet." Say so in your notes and use a 911 or Corvette sheet for the rest.

**A pool that splits (body, gearbox, edition, year):** when the engine finds the sales split into options priced apart (a 2008 911 with coupes at one price and cabriolets at another), it shows no one range, and neither does the sheet. Under "The market" and again at the top of "Condition" the sheet asks "Which body style is it?" with one button per option, the engine's own count and the span it counted (for example "Coupe 10 sales"). If the VIN's decoded body is one of the options it is already picked and says "Preselected from the VIN"; pick the other if it is wrong. You can pick a tier before the body: the sheet then says why there is no figure ("These sales split into options priced apart, so pick one to see its range. Pick the body style and the tier pool is read for it.") and never "Pick a condition tier" once one is picked. Pick the body and the tier pool is read for that body only. Finalise stays off, and Section 7 says "Pick the body style.", until it is picked. The option counts can add up to more than the headline count because each option is counted over its own time span; the sheet says so under the split table.

**Proof of the number (section 3, with a tier picked):** under the meter the page says what the pool is, for example "Excellent (tier 2) holds 18 sales. 7 of them sit in the mileage band of 15,000 to 45,000 miles around the car's 30,000 miles, and the engine median is taken from those 7. The other 11 are listed outside the band." The table lists **every** sale of the same tier (date, venue, price, real mileage, link), those inside the band marked, the sale at the median marked Median (or the two in the middle marked Middle).

Check in section 4 after clicking a tier: the meter, the median and the comparables all change together (a tier used to move the comparables and leave the range where it was). A tier with five or more sales in the band is the meter's pool. A tier with fewer than five shows the body pool on the meter with that tier's sales highlighted (in the table too) and the engine says it in its own words, for example "9 sales of this body since March 2026. 3 in tier 2, shown on the full set."; it never says there is no figure.

## 2a. My reports

The left rail has **Today's queue**, **My reports** and **Company**. My reports lists only this seat's sheets in three groups: **Drafts** (with the date made), **Finalised** (with the date finalised) and **Sent** (with the date sent). Click any to open it; the tabs keep each open sheet where you left it, so you can go back and forth. A finalised or sent sheet opens read only ("Finalised: the sheet is locked.").

## 3. Analyst actions: tier, marker, reserve, reload

1. Click Tier 2. The pill lights at once. The meter and the comparables follow it together.
2. Before any tier is picked, section 4 says "No listing for this car in the record, so the engine suggests no tier. Pick the tier the photos show." After the pick it reads **Engine: no suggestion. Analyst: tier 2.**
3. Drag the marker on the meter above the engine median and let go. The sheet prints **Engine median $X. Analyst figure $Y (plus).** and the tier line becomes **Engine: no suggestion. Analyst: tier 2 plus.** A reason box appears; type "Cleaner than the tier median car." Check: the tier, the pool count and the engine median did not move when you set your figure. Drag below the median for a minus. **Clear** puts it back to not set.
4. In section 6 click **Reserve** and type a reserve. Beside the fields the sheet shows the meter's range, the engine median and your analyst figure. Type the low edge of the meter's range: "Inside the market range". One dollar below: "Outside the market range" and reasons are asked. (The check is against the meter you see, for the body and tier you picked.)
5. The last field in section 6 is **Question for the seller (prints on the report)**. It prints on the Decision page of the report, under your reasoning, as "Question for the seller". Leave it empty and nothing prints.
6. Wait a second (saves run after a short pause), then reload the page (browser reload). Open the sheet again.
7. Check everything persisted: tier 2, your analyst figure and reason, the reserve, the confirmed chip, the photos and the cover.
8. Now click Tier 3. Check: your analyst figure stays, but the engine median moves with the tier, so the line and the plus or minus are worked out again against the new median.
9. Click Tier 2 again for the next steps.
10. Section 6, reserve outside the meter's range: the page asks for reasons (Documentation, Modifications or non original parts, Condition better or worse than the tier on close inspection, Provenance or history, Recent market movement not yet in the sales, Other) and a typed line of reasoning. Tick one and type one. Guards (a figure far from a prior valuation of this VIN by your organisation, or more than 15 percent from your analyst figure, or from the engine median when you set none) ask for a typed line and never block.
11. Section 7 lists anything still missing in plain sentences (for example "Enter the reserve."). The Finalise button works only when the list is empty.

**Speed:** one press opens a sheet (a loading card shows at once; further presses while it loads are ignored). Every pill, tier or body, lights in under a tenth of a second whatever the engine is doing, and the sheet shows "Reading the market" until the answer lands, normally under three seconds.

## 4. Finalise

0. Before you lock the sheet, press **Preview the report (draft)** in section 7. A PDF downloads with DRAFT across every page and in the footer, no report number, and it says it is not a report. It is not stored as an export and is not counted against the monthly export limit, so press it as often as you like. It shows the sheet as it stands now: with the reserve or range not set it says "Not set yet". Only the owner of the sheet (or a seat that can edit it) can make one.

1. Click **Finalise**. The section becomes "The sheet is locked." with "Finalised on <date>. Report DV-2026-NNNN." The status chip reads Finalised.
2. Try to edit: click another tier, or type in the reserve. Expect the tier buttons and the reserve to be disabled, and the sheet to say "Finalised: the sheet is locked." If you can force a save anyway, expect a refusal in plain words and no change.
3. Click **Download the PDF**. It opens. Check: the cover photo on page 1 and the strip of every photo on the car page, the range meter on the market page with your marker, "Engine median ... Analyst figure ...", "Question for the seller" on the Decision page (if you wrote one); your organisation's name and logo on the cover and its own colour on the figure and the marks (set from the org record, `brand_color`), no GoAskSam name anywhere in the report or the file properties, the ten parts in order, the figures equal the sheet's, the ladder lines under Condition, **Engine: no suggestion. Analyst: tier 2 plus.** (or "Engine: tier N" when the engine read a tier from this car's last listing), the meter with your marker, and your reason, the note to the seller on its own page if you wrote one, no expert's personal name anywhere, a footer with page numbers.
4. "Start a correction" makes a new sheet that refers to the old one. Do not press it unless you want to test it.

## 5. Send

1. In section 7 the Send box has **To**, **Message** (pre-filled with the organisation's standard message) and "Attached: DV-2026-NNNN.pdf". Type your own address in To. Click **Send**.
2. Check your inbox: the email arrives from the organisation's verified sending address (not goasksam), with the PDF attached, the message, and under "A note from Hagerty Marketplace" the note and your analyst's mark and reason. The figures in the PDF equal the sheet's.
3. Back on the sheet: a "Sent" box shows "Sent to <your address> on <date>" with a copy of the message and note, and the status chip reads Sent. Pressing Send a second time must not send again.
4. If it says "Sending is not switched on for this organisation yet", the send service or the verified address is not set up; that is a setup gap, not a page bug.

## 6. Seats and the View as log

1. A second expert seat (for example "hagerty · Expert 2"): View as that seat. The queue shows (under "Today's queue" and "Company"). Open the sheet you made: it is read only to that seat, with a banner saying who owns it. A sheet that is New and unopened offers "Pick up this sheet". That seat cannot finalise or send your sheet.
2. A user with no seat: open /desk in a private window signed in as an account that has no seat, or signed out. Expect the same plain 404 page as any unknown address on the site, not a login page and not an error that names the Desk.
3. The View as log: each "View as" and each way back is recorded with the crew person, the seat and the time. It is written to app_usage_events as event desk_view_as (lib/desk/viewAs.js). Ask Lane D to read those rows for your session, or look in the Supabase table editor for event = desk_view_as. Expect a row for the set; whether the way back also writes a row is not stated in the code, so note what you see.

## 7. Two tabs

1. Open the same unfinalised sheet in two browser tabs (use a fresh sheet, not the finalised one).
2. In tab 1 change the reserve to 60000, wait a second. In tab 2 (not reloaded) change the reserve to 70000 and wait.
3. Tab 2 must show: **This sheet changed in another tab. Reload to see the latest.** Reload tab 2: it shows 60000. Nothing was overwritten silently. Type 70000 again in tab 2 and it saves.
4. Also try Finalise from a stale tab: it is refused with the same line.

## 8. Reading every screen

Read each screen from top to bottom as the expert would and note:

- any wording that sounds wrong or promises too much;
- any question or message that does not name the car;
- any dash (an em dash or an en dash). There should be none: scripts/deskDashCheck.mjs fails on one in Desk code, the PDF, the email and the sheet's fixed copy;
- any figure that is not on the sheet read (the page and the email compute nothing).

Send the list to Lane D with the sheet's report number and the time.

## What this document does not cover

Real customer sheets, the webhook by hand, and the live Send to anyone but yourself.
