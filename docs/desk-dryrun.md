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

1. **The car.** Year, make, model, trim, body, VIN, mileage (marked "from the submission"), gearbox and colour if known. Buttons: "Confirm the car" (then a "Confirmed" chip). Check: the car is named correctly, mileage matches the email, both photos are in the section 4 photo grid.
2. **This exact car.** "Every auction appearance of this VIN." Either the earlier sales with venue, date and price, or the engine's line that there is none.
3. **The market.** "Median and quartiles of the sales, from the engine." Window, sales count, median, typical range, newest sale, splits, live listings, comparables newest first.
4. **Condition.** (Starting figure and proof below.) Four tier buttons with counts: Tier 1 Concours, 2 Excellent, 3 Good, 4 Fair. Below them "Untiered: N stay in the wider pool." Then the ladder, one line each (Concours: the best example anywhere, show quality; Excellent: near new, a careful restoration or an exceptional original; Good: a sound driver with wear a buyer would expect; Fair: runs and drives, visible wear or needs; Untiered: not enough evidence to place it). With a tier picked: the count in that condition and the evidence lines the engine counted for this car. A car typed in words (or a VIN with no sale in the archive) has no listing to read, so the sheet and the PDF print the one line "No listing for this car yet; the tier is the analyst's call" in its place; a car whose listing yielded no signals says the engine counted none. Then the photos from the submission (tick the ones for the report, set the hero) and any documents.
5. **What we cannot see.** Six items: Title status, Service records, Ownership history, Modifications (Stock, Period, Modified, Restomod), Accident or repair history, Provenance. Mark each Seen, Not seen or Not supplied. A free line is optional. No numbers here.
6. **Decision.** "A reserve or a range. The engine never gives one: you do." Reserve or range, reasons, the line of reasoning, the guards, the note to the seller.
7. **Finalise.** "Locks the sheet, stamps it, builds the report."

If the car's model has no tiers yet from the overnight run, the tier buttons show no counts and the starting figure says "Condition tiers are not assigned to these sales yet." Say so in your notes and use a 911 or Corvette sheet for the rest.

**A pool that splits (body, gearbox, edition, year):** when the engine finds the sales split into options priced apart (a 2008 911 with coupes at one price and cabriolets at another), it shows no one range, and neither does the sheet. Under "The market" and again at the top of "Condition" the sheet asks "Which body style is it?" with one button per option, the engine's own count and the span it counted (for example "Coupe 10 sales"). If the VIN's decoded body is one of the options it is already picked and says "Preselected from the VIN"; pick the other if it is wrong. You can pick a tier before the body: the sheet then says why there is no figure ("These sales split into options priced apart, so pick one to see its range. Pick the body style and the tier pool is read for it.") and never "Pick a condition tier" once one is picked. Pick the body and the tier pool is read for that body only. Finalise stays off, and Section 7 says "Pick the body style.", until it is picked. The option counts can add up to more than the headline count because each option is counted over its own time span; the sheet says so under the split table.

**Proof of the number (section 3, with a tier picked):** under the market figures the page says what the pool is, for example "Excellent (tier 2) holds 18 sales. 7 of them sit in the mileage band of 15,000 to 45,000 miles around the car's 30,000 miles, and the starting figure is the median of those 7. The other 11 are listed outside the band." The table lists **every** sale of the same tier (date, venue, price, real miles, tier, "In band" or "Outside", a link that opens the sale), one body only. The starting figure is the median of the sales marked In band; the sale marked **Median** (or the two marked **Middle**, for an even pool) is where it sits. Sales marked Outside are listed for reference and are not in the median. The same table, with the same marks, is in the PDF's Comparables part, over as many pages as it needs.

Check in section 4 after clicking a tier: "the same tier pool" count; the **starting figure** (section 3 and the Decision part) must equal the median of that same tier pool, and the note under the figures is the proof line described above (the tier's sales, how many sit in the mileage band, the median of those). With fewer than five sales it shows no figure and says "Too few sales in this condition. The wider pool is shown."

## 2a. My reports

The left rail has **Today's queue**, **My reports** and **Company**. My reports lists only this seat's sheets in three groups: **Drafts** (with the date made), **Finalised** (with the date finalised) and **Sent** (with the date sent). Click any to open it; the tabs keep each open sheet where you left it, so you can go back and forth. A finalised or sent sheet opens read only ("Finalised: the sheet is locked.").

## 3. Analyst actions: tier, plus, reserve, reload

1. Click Tier 2. The comparables follow it.
2. Under the ladder, click **Plus**. A reason box appears. Type "Cleaner than the tier median car." The sheet prints **Engine: tier 2. Analyst: 2 plus** and your reason. Check: the tier, the pool count and the starting figure did not move when you set the plus. With plus set, the page lists the sales of the upper half of the same tier pool (a minus lists the lower half). No new figure is made.
3. In section 6 click **Reserve** and type a reserve.
4. Wait a second (saves run after a short pause), then reload the page (browser reload). Open the sheet again.
5. Check everything persisted: tier 2, plus 2 and your reason, the reserve, the confirmed chip, ticked photos.
6. Now click Tier 3. Check: the plus is gone (a mark belongs to one tier) and the line "Engine: tier ..." disappears.
7. Click Tier 2 again and set plus again for the next steps.
8. Section 6, reserve outside the market range: the page asks for reasons (Documentation, Modifications or non original parts, Condition better or worse than the tier on close inspection, Provenance or history, Recent market movement not yet in the sales, Other) and a typed line of reasoning. Tick one and type one. Guards (a figure far from a prior valuation of this VIN by your organisation, or far from the starting figure) never block; each asks for a typed line.
9. Section 7 lists anything still missing in plain sentences (for example "Enter the reserve."). The Finalise button works only when the list is empty.

## 4. Finalise

0. Before you lock the sheet, press **Preview the report (draft)** in section 7. A PDF downloads with DRAFT across every page and in the footer, no report number, and it says it is not a report. It is not stored as an export and is not counted against the monthly export limit, so press it as often as you like. It shows the sheet as it stands now: with the reserve or range not set it says "Not set yet". Only the owner of the sheet (or a seat that can edit it) can make one.

1. Click **Finalise**. The section becomes "The sheet is locked." with "Finalised on <date>. Report DV-2026-NNNN." The status chip reads Finalised.
2. Try to edit: click another tier, or type in the reserve. Expect the tier buttons and the reserve to be disabled, and the sheet to say "Finalised: the sheet is locked." If you can force a save anyway, expect a refusal in plain words and no change.
3. Click **Download the PDF**. It opens. Check: your organisation's name and logo on the cover and its own colour on the figure and the marks (set from the org record, `brand_color`), no GoAskSam name anywhere in the report or the file properties, the ten parts in order, the figures equal the sheet's, the ladder lines under Condition, **Engine: tier 2. Analyst: 2 plus** and your reason, the note to the seller on its own page if you wrote one, no expert's personal name anywhere, a footer with page numbers.
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
