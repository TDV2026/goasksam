# Launch runbook (Beta, newsletter audience)

Kept by Lane F. One page. No secrets here: values live in Vercel, Resend, Beehiiv and Supabase, never in this file. "Not decided" means Sam has not ruled. Gate state: docs/launch-checklist.md.

## (a) Staged send

1. Before the first send, every YES row in checklist table A is closed.
2. First send: the most engaged segment only. Segment definition and size: not decided. Beehiiv holds the segment; Lane F does not read it.
3. Watch period: from the first send until the checks below are clean. Length: not decided.
4. Widen to the rest only when Sam says so after reading the list below. If any item fails, hold the send and fix or roll back first (section b).

Check before widening (each with where to look):
- Refusals: run refusalCheck on the deployed site (scripts/refusalCheck.mjs, ten to thirty cars); a refusal kind on a car a reader typed is a fail. Source for reader cars: Lane B's obdiag read of sellerDecision outcomes. Sam's bar: every car returns a range or an honest thin card.
- Errors: Vercel logs for 5xx on /api/sellerDecision, /api/buySearch, /api/tasks, /api/sellNext; browser console errors on Home, Find, Market Check, Sell, Tasks (scripts/pushCheck.mjs). Zero 5xx is the bar.
- Speed: Market Check cold read and Buy first card (scripts/buyTimes.mjs, the perf cars in prePush). Bars: the prePush budgets (8 s and 18 s on the perf cars). Stored-row reads are expected fast; cold computes are the risk.
- Deliverability: Resend dashboard for bounces and complaints on sign-in codes and car emails; Beehiiv for bounces, unsubscribes and spam complaints; one real sign-in code received at a Hotmail and a Gmail address and not in spam.
- Feedback inbox: feedback@goasksam.com read by Sam; any report of a wrong number, a missing sale or a dead end is a stop until Lane B has looked.
- Spend: Supabase compute and egress, OldCarsData credits, Anthropic credit and usage, Vercel usage. Budget alerts and the Anthropic auto-reload: not decided (checklist rows).

## (b) Rollback

Rollback switches, cheapest first. Vercel applies an environment variable change only to a NEW deployment, so every launch-stage and other env switch (LAUNCH_STAGE, CURTAIN_SEALED, LAUNCH_BUSINESS and the rest in the table) NEEDS A REDEPLOY (Sam's ruling, Oct 24 2026; the comment at the top of lib/_launchStage.js is corrected to say so). Two things do NOT need a deploy: the Task email kill switch (an app_config row read at send time, steps below) and Vercel Instant Rollback (promote the previous deployment).

| Switch | Where | What it hides | Redeploy |
|---|---|---|---|
| LAUNCH_STAGE (0, 1, 2) | Vercel env | 0: every gated product for the public (Sell only). 1: Market Check and Tasks. 2: adds Buy. Crew always sees all. | Yes |
| CURTAIN_SEALED=1 | Vercel env | Non-crew calls to the engine endpoints (sellerDecision, vehicleIdentity), whatever the stage | Yes |
| LAUNCH_BUSINESS | Vercel env | /business and the For business link | Yes |
| SELL_NEXT_ON | Vercel env | The new Sell (api/sellNext.js, api/sellChat.js). Unset or not 1: the old Sell stays public. | Yes |
| SIGNUP_TURNSTILE | Vercel env | The Turnstile check at sign-up (needs both keys set) | Yes |
| PARTNER_DEMO_CODE | Vercel env | Unset: /partner-demo is not reachable by code | Yes |
| vin_input_enabled | Supabase app_config row (0 or 1) | The typed-VIN path, crew and test sessions | No (read at request time) |
| PALETTE_BAR_ON, RANGE_RULES.trimFirst | Code constants (lib/appShell.js, lib/onebox.js) | The crew palette bar; the trim-first question (LIVE today, approved by Sam) | Yes, by a push through Lane C |
| task_emails_enabled (the Task email kill switch) | Supabase app_config row (see the steps under the table) | Every Task email: match, daily, before it ends, watch event, sold notice, the start email and test sends. Sign-in codes are untouched (Supabase sends those). | No (read at send time, held 5 seconds) |

Task email kill switch, exactly how to flip it (Lane C, Oct 24 2026; code: lib/_email.js sendTaskEmail, one choke point for every Task email):
1. Stop every Task email, either way (both write the one app_config row task_emails_enabled):
   - Supabase SQL editor: `insert into app_config (key, value) values ('task_emails_enabled', '"0"') on conflict (key) do update set value = '"0"';`
   - or the keyed read-and-write call (the probe key is in Sam's Keychain, never pasted here): GET https://goasksam.com/api/tasks?emailswitch=off with the header x-ops-key. It answers `task_emails: OFF`.
2. Check it: GET https://goasksam.com/api/tasks?emailswitch=status (same header) answers `OFF` or `on`.
3. Send again: the same call with emailswitch=on, or in SQL set the value to '"1"' (deleting the row also means on).
4. It takes effect within 5 seconds, no deploy. While it is OFF each email that comes due is SKIPPED and recorded as done by its sender, so it is NOT sent later when the switch goes back on; Tasks keep running and in-app updates still show.
5. If the switch cannot be read (Supabase down), emails still go (fail open, logged as "task email switch unreadable"), because the senders need the same database anyway.
6. Not affected: sign-in codes, the internal Sam Desk request notice, partner lead notices, Beehiiv.

Promote previous deployment (whole-site rollback, no code change):
1. Vercel dashboard, project goasksam, Deployments.
2. Open the last deployment that was Ready and healthy before the bad one (Lane C names it in the PUSHED line of lane-notes).
3. Use Promote to Production (Instant Rollback). Production moves to that build at once.
4. Vercel stops auto-assigning new pushes to the production domain after a rollback until a deployment is promoted again; read the banner before the next push.
5. A rollback reverts code only. It does not undo database writes, stored engine answers (written by an ENGINE_VERSION stamp) or emails already sent. Lane B decides whether stored answers need a warm.
6. Lane C looks at the live site after the promote and posts a look-done line.

## (c) Freeze rule after the send

- From the first send until Sam lifts the freeze: fixes only. A fix is a revert, a security fix, a wrong number or range (product rule 1), or a dead end a reader hit.
- Lane C is the only lane that pushes, batched, FULL prePush alone. No pushes in the busiest hours after an email goes out. The window is set from Beehiiv open and click data; its length: not decided.
- No ENGINE_VERSION bump during the watch period: a bump makes every stored answer recompute cold, which slows Buy and Market Check.
- No env changes other than the switches in section b. No DNS changes unless Sam asks.
- A rollback by promote or env switch is always allowed and needs only Sam's word.

## (d) Who watches what

| Who | Watches |
|---|---|
| Sam | Beehiiv sends and segments; feedback@ inbox; Resend, Anthropic, Vercel and Supabase billing and alerts; the decision to widen or roll back |
| Lane C | Deploys, promote-previous, env redeploys, the look after every push; the only pusher |
| Lane B | Refusals, golden table, engine reads, speed of the engine; says when stored answers need a warm |
| Lane D | Task sends, sign-in codes, the Tasks page, Resend send logs |
| Lane E | Sweeps and speed audits only when assigned |
| Lane F | One digest to Sam when something needs him or something landed (five lines or fewer); enforces the freeze; keeps this file and the checklist |

Search check: no public page touched.

## (e) Sealing the site behind the crew code, and opening it (Lane C, Oct 25 2026)

What the switch does. `CURTAIN_SEALED=1` seals the site for everyone who is not crew, a tester or a server job: Home, Find, Market Check, Sell, Tasks, For business, the spec, history and shared-result pages all answer ONE holding page ("Something big is coming", the launch date and time in Pacific time, a live countdown). The answer is HTTP 503 with Retry-After (closed for now, keep what you have), never a redirect, a 404 or a noindex. The data endpoints refuse strangers too (sellerDecision and vehicleIdentity answer 403 "Not open yet."). Left open on purpose: How Sam decides, About, Privacy, PowerSellers, robots.txt, the sitemaps, the crew link, sign-in codes and the Task email one-tap links (Stop all, Pause, Unsubscribe). The one launch moment is one line in lib/launchTime.js (Thursday 29 October 2026, 7:00 AM Pacific). At zero the page keeps the headline and drops the timer; it does NOT open the site.

Seal, one step at a time (CURTAIN_SEALED=1 is already set in Vercel Production; it takes effect at the NEXT deployment, so the next push seals the site):
1. Rotate the crew code. Sam makes the new CURTAIN_CREW_CODE himself (long and random), sets it in Vercel Production, and stores it only in Vercel and his own Keychain. Never in chat, a file or a log. WHAT THIS CHANGES: every crew cookie made from the old code stops working at the deployment (crew devices, every lane's scripts that carry the cookie, the signed value stored in the Keychain item goasksam-crew). Crew people open the crew box (goasksam.com/api/crew, the "Crew" link at the foot of the holding page) and enter the new code once. The code goes in the box, which posts it as a form body, so it never sits in an address, a history entry or a request log. Testers (their own code, CURTAIN_TESTER_CODE), the partner demo and the keyed ops calls (probe key) are NOT affected.
2. Redeploy (or let the next push deploy): the code change and both variables take effect together. Confirm a deployment exists and is Ready (see "After every final push" below).
3. Check from a private window (signed out, no crew link): goasksam.com, /find, /market-check, /sell, /tasks each show the holding page with the countdown; About, Privacy and How Sam decides still open.
4. Check as crew: open goasksam.com/api/crew in a normal window and enter the new code in the box; the site opens at Find as usual. Then delete the old goasksam.com/api/crew entry from the browser history. Lanes refresh their cookie from the keyed ops call (usageDashboard task=crewcookie) and replace the Keychain value.
5. Roll back in one line: Vercel Instant Rollback (Deployments, the previous Ready deployment, Promote to Production) or unset CURTAIN_SEALED and redeploy.

What still works while sealed (checked in code and in-process): Task checks and Task emails (the cron calls /api/tasks?run and ?send carry the cron secret and are not pages), the Supabase sign-in code email and the sign-up hook (/api/signup), keyed ops reads and the golden and sweep calls (the probe key passes every page seal and both engine seals), the crew box (/api/crew), robots.txt and every sitemap (the sitemap routes are exempt), the one-tap Stop, Pause and Unsubscribe links in Task emails (/api/task-link), the partner demo (its own code). Blocked for a stranger: every product page and the engine endpoints sellerDecision and vehicleIdentity. There is no Resend webhook in the product.

After every final push (Sam's rule, Oct 25 2026): the push of 3ca84ab3 at 07:39Z never produced a Vercel deployment (no record at all, not even a cancelled one; the next push built the whole difference). The cause cannot be read from here: it is either the GitHub to Vercel webhook not firing or a Vercel-side skip; Sam can see it in GitHub, Settings, Webhooks (recent deliveries) and the Vercel project's Git settings. So launch day never depends on one push: (a) after the final push run `vercel ls` or open Deployments and confirm a NEW deployment exists and is Ready within a few minutes; (b) read the live engine stamp or the page; (c) if no deployment appeared, push one more commit that changes nothing (`git commit --allow-empty -m "redeploy"` then push): the ignore rule compares with the last DEPLOYED commit, so it builds the whole difference; or press Redeploy on the last Ready deployment in the dashboard (that redeploys the OLD code, so use it only for an environment change).

Open the site on launch day: delete `CURTAIN_SEALED` (or set it to `0`), set LAUNCH_STAGE to 2 and LAUNCH_BUSINESS to 1 if they are not already, redeploy, then check from a private window.

Roll back the seal in one line: Vercel Instant Rollback (Deployments, the previous Ready deployment, Promote to Production) or unset CURTAIN_SEALED and redeploy.

What keeps working while sealed: running Tasks for existing accounts keep searching and emailing (they run on server schedules, not through the pages); Task and sign-in emails send as before; links in a Task email that open a page (Open the Task, a car's Market Check) show the holding page to a non-crew reader, while Stop all, Pause and Unsubscribe still work.
