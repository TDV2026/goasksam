# Launch runbook: Wednesday night to Thursday Oct 29

One page for Sam. THERE IS NO FIXED OPENING TIME: the site opens when the gates below are green, and Sam decides at 5:30 AM Thursday whether 7:00 AM holds. Until Sam sets the time, the holding page says "GoAskSam is opening soon" and prints no time and no countdown. Written offline from docs/lane-notes.md (origin/main 48c8f680) and the repo. No secrets here. All times are Pacific. A step marked **SAM** is Sam's own click. Lane jobs have no time estimates; only scheduled events have clock times. The older staged-send, rollback-table and freeze text moved unchanged to docs/launch-runbook-reference.md.

Standing rule for every fix tonight and tomorrow: pages and emails compute nothing. Every number and sentence comes from oneEngineAnswer. A fix that makes a page work out its own figure is rejected.

## The gates (SAM, read on your phone; all six must be green before the site opens)

- [ ] Zero wrong-model results (Lane B)
- [ ] Typed and VIN answers identical for the same car (Lane B)
- [ ] No blank cards on Find, Market Check, Sell or Tasks (Lane B and Lane D)
- [ ] Golden rows explained, every one (Lane B)
- [ ] Article test cars clean (Lane B)
- [ ] Page visuals fixed (Lane C)

Each lane posts GATE GREEN or GATE RED with a reason in docs/lane-notes.md. One red means the site stays closed; nothing else in this page changes.

## Wednesday Oct 28, evening

1. **Last pushes.** Lane C is the only lane that pushes. Left to land: ENGINE READY 6 (f25d5377, plus 222025f0), stamp stays e99-20261028-trimfix, a code push with no warm. Anything else after it needs Sam's word. After the final push Lane C confirms a NEW deployment is Ready and reads the live stamp (if none appeared, push one empty commit). Lane C posts PUSHED and LOCK RELEASED. No push after that line.
2. **Launch warm, run 1, starts 5:05 PM at the earliest** (00:05Z, the first minutes of the launch UTC day) and only after the last push. Lane C posts WARM START, then WARM DONE with `task=warmDay&day=2026-10-29`. The line must show marketCheck.offDay 0 and the result of `scripts/epochMatchCheck.mjs --live` (zero mismatches). Question-first specs (a trim or body question as the first answer) store no row by design; they are not misses. Nobody reads production between WARM START and WARM DONE. Lane B starts the golden table only after WARM DONE.
3. **Mac stays awake. SAM plugs it in and leaves it be.** The Thursday warm is armed inside Lane C's terminal session only (one-shot 5da7459d, 4:52 AM). If that session ends or the Mac sleeps, the job is gone. Plug the Mac in, leave Lane C's terminal open, and Lane C runs `caffeinate -dims` in its own shell (stop it after 8:00 AM Thursday). Do not close the lid. Lane C runs the `caffeinate` in its own shell and checks CronList at WARM DONE and posts that the 4:52 AM job is listed; if it is not, Lane C re-arms it then.
4. **Nightly stays disabled. SAM.** GitHub, Actions, "Nightly ingest and warm", Disable workflow, and keep it disabled. Why: its ingest is scheduled for 12:11 AM (GitHub may start it 5 to 7 hours late) and bumps the sales epoch, which turns every stored Market Check row stale just before launch.
5. **Possible supervised manual ingest (only if Sam wants fresher sales in; skip otherwise).** It must finish before 4:52 AM so the Thursday warm re-warms behind it. SAM: Actions, Nightly, Enable workflow, Run workflow with blank inputs (the normal delta; scheduled-only jobs do not run on a manual run, but the caches job does). Lane B watches the run and posts its end. Ingest bumps the epoch and deletes stored rows for every make and model it touched, so those cars go cold until the 4:52 AM pass. **SAM disables the workflow again IMMEDIATELY after the manual run ends, not later and not "before midnight".** GitHub starts scheduled runs 5 to 7 hours late, so an enabled Nightly can fire at any hour of the night, long after 12:11 AM, and would bump the epoch behind the warm. Lane C then posts that the epoch moved, and the 4:52 AM pass runs the full union warm.
6. **Launch eve flips in Vercel. SAM.** Two orderings matter. (a) Rotating the Vercel bypass secret stales every lane's Keychain copy (item goasksam-bypass) and the warm scripts use it, so rotate it only AFTER the 4:52 AM pass is checked (step 8), then update the Keychain item and tell Lane C. (b) Environment changes take effect only on a NEW deployment, and ANY redeploy carries every saved value, including the time-setting redeploy in step 9. So Sam edits the flip values below at step 10, immediately before the opening deployment, never earlier. There is no fixed opening time: the site opens when the gates are green and the 4:52 AM check is clean, so it never opens on a cold warm.
   - Delete CURTAIN_SEALED (or set 0). Opening the site is this change plus the deployment.
   - SELL_NEXT_ON = 1 (the new Sell for everyone; the old Sell door redirects while it is on).
   - LAUNCH_STAGE = 2 (Market Check, Tasks and Buy). For business and /business open with LAUNCH_STAGE = 2 (Oct 30 2026); set LAUNCH_BUSINESS = 0 only to hold /business back, and leave PARTNER_DEMO_CODE unset (checklist items 2 and 4).
   - Crew code: rotate again on launch eve (set only in Vercel and the Keychain; enter it in the crew box at goasksam.com/api/crew, never in a link). This ends every crew cookie; lanes refresh theirs with usageDashboard task=crewcookie. Do it with the bypass rotation, after step 8.
   - Nightly stays disabled (step 4).
   - Work through the section "LAUNCH EVE CHECKLIST FOR SAM" (items LAUNCH EVE 1 to 13) at the end of docs/lane-notes.md alongside this step. It is Lane S's checklist, kept by Lane F; Lane C commits it in its next batch. It also covers items this page does not (budget alerts, the spend cap, Turnstile, the firewall publish, DNS and the Beehiiv segment, deleting USAGE_DASHBOARD_KEY). On ordering, checklist items 6 and 7 (the bypass secret, the crew and tester codes) are SUPERSEDED by this page (Sam's ruling): the checklist rotates after its one redeploy, but here the rotations happen after the 4:52 AM check and before the opening deployment, so the single opening redeploy carries the flips and the new secrets together. Any lane that needs crew access after the rotation gets the new code from SAM, who enters it in the crew box at goasksam.com/api/crew; the code is never sent in chat, a note or a link.

## Thursday Oct 29

7. **4:52 AM, warm pass, run 2** (Lane C, the armed job). It runs the held-specs retry and the full union re-warm, then warmDay for 2026-10-29 and `epochMatchCheck --live`, before and after. Lane C posts WARM DONE with the numbers. How to read it:
   - **Done:** offDay 0, epoch mismatch 0, named list 19 of 19, held 0. Proceed.
   - **Held:** specs whose read failed wait an hour before a retry. Lane C lists them by title. A short list is acceptable only if Sam says so; each reads cold and slower for its first visitor.
   - **Missed:** any epoch mismatch, offDay above 0, or the job not firing. Lane C runs the pass by hand at once and posts the result. Nothing in step 9 or 10 starts until WARM DONE is clean or Sam accepts the held list.
8. **After the check: bypass and crew secrets (step 6a). SAM** rotates, updates the Keychain, tells Lane C. Lane C confirms a live script still gets through.
9. **5:30 AM, SAM decides whether 7:00 AM holds.** Read the gates (checklist above). All six green and the 4:52 AM pass clean: set the opening time. Vercel, Settings, Environment Variables, add `LAUNCH_AT` = `2026-10-29T07:00:00-07:00` for Production, Save. This is also the step that sets the time back to 7:00 AM after any change. The -07:00 is Pacific Daylight Time (it stays right all of Oct 29; keep the offset when you type a different clock time). Then Deployments, the latest one, Redeploy. Do NOT touch CURTAIN_SEALED, SELL_NEXT_ON or LAUNCH_STAGE yet. Lane C reads the holding page through the keyed preview and posts that it shows "Opening Thursday, October 29, 2026, 7:00 AM Pacific Time" with the countdown. Any gate red: leave `LAUNCH_AT` empty; the holding page keeps saying "GoAskSam is opening soon" with no time. A value that is empty or is not a date with an offset counts as not set. To move the time, change the value and redeploy. To take the time off, delete `LAUNCH_AT` and redeploy. A reader who left the holding page open is sent through to the site 15 to 25 seconds after the opening deployment is live (a tab that was hidden goes at once when it is shown again). "Opening now" shows only after a set time has passed and never while no time is set.
10. **Opening deployment. SAM** first makes the step 6 flips (delete CURTAIN_SEALED, SELL_NEXT_ON = 1, LAUNCH_STAGE = 2). Then Lane C redeploys so they take effect, confirms the deployment is Ready and the live stamp is still e99-20261028-trimfix. Lane C checks from a private window: Home, Find, Market Check, Sell (the new one), Tasks all open, no holding page, no 5xx, no console error (scripts/pushCheck.mjs). Lane C posts LOOK DONE (Lane C, time) first. Lane B then runs one read on a named car through the bypass header to confirm it answers from its stored row.
11. **Email send. SAM.** At 7:00 AM if the site is open by then, otherwise when Lane C's LOOK DONE is posted. Send the Beehiiv email. Before it: Lane C's LOOK DONE is posted and the Task email switch reads `on` (`GET /api/tasks?emailswitch=status`, header x-ops-key, key from the Keychain). If the site is broken before the send: Instant Rollback (below) and hold the email.

## After the site opens: what each lane watches and the one line it posts

Post 15 minutes and 60 minutes after the opening deployment is live (7:15 AM and 8:00 AM if it opened at 7:00 AM), and at once on anything red. Line format: `WATCH (Lane X, time): ...`. No ENGINE_VERSION bump during the watch (it makes every stored answer cold). Fixes only. Max three heavy reads at once; no reads while a push lock is open; lane reads use the bypass header and do not forward a visitor address.

| Lane | Watches | Its one line |
|---|---|---|
| B | Refusals on cars readers typed (obdiag), cold-read speed, golden spot checks | `WATCH (Lane B, time): refusals N, slowest cold read Ns, cards checked N, wrong N` |
| C | Deployment state, Vercel logs for 5xx, console errors on the five pages | `WATCH (Lane C, time): deployment Ready, 5xx N, console errors N` |
| D | Sign-in codes (Hotmail and Gmail), Task sends and bounces in Resend, Tasks page | `WATCH (Lane D, time): codes ok or late, task emails sent N, bounces N` |
| E | Only when assigned | none unless assigned |
| F | Reads the lines above and writes Sam a digest of five lines or fewer | `DIGEST (Lane F, time): green, or what needs Sam` |
| Sam | feedback@ inbox, Beehiiv stats, Supabase compute, OldCarsData and Anthropic spend, the /admin Launch tab | decides hold, roll back or go on |

## If something breaks

- **A page breaks (5xx, blank, holding page shows).** Lane C owns it. Roll back first, fix later: Vercel, Deployments, the last healthy Ready one, Promote to Production (Instant Rollback), then LOOK DONE. Rollback reverts code only, not stored answers or sent emails. To close the site instead: CURTAIN_SEALED=1 and a redeploy. Sam's word starts any rollback.
- **A card is wrong (a number, a missing sale, a wrong title).** Lane B owns it and works the class, not the example: (1) state the cause; (2) name every other car and page it touches (Find, Market Check, Sell, Tasks, emails); (3) sweep those cars; (4) add a check that covers the class and show it fails without the fix and passes with it. Product rule 1 wins: a number that cannot be backed by records comes off. A fix that changes stored answers needs a stamp bump and a warm, so Lane B asks Sam first. Lane C pushes after FULL prePush alone.
- **The site slows.** Lane B stops all its heavy reads and reads cold-read time; Sam reads the Supabase compute graph. Lane D pauses Task email load with the kill switch (`emailswitch=off`; takes 5 seconds, no deploy; skipped emails are not sent later; sign-in codes unaffected). Lane C checks Vercel function times. If it does not recover, Sam decides: roll back, or seal with CURTAIN_SEALED=1 and a redeploy.

Search check: no public page touched.
