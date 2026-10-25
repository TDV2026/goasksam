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

Rollback switches, cheapest first. Vercel applies an environment variable change only to a NEW deployment, so every env switch needs a redeploy. The comment at the top of lib/_launchStage.js says no redeploy is needed; treat that comment as wrong until Lane C proves otherwise on a test change.

| Switch | Where | What it hides | Redeploy |
|---|---|---|---|
| LAUNCH_STAGE (0, 1, 2) | Vercel env | 0: every gated product for the public (Sell only). 1: Market Check and Tasks. 2: adds Buy. Crew always sees all. | Yes |
| CURTAIN_SEALED=1 | Vercel env | Non-crew calls to the engine endpoints (sellerDecision, vehicleIdentity), whatever the stage | Yes |
| LAUNCH_BUSINESS | Vercel env | /business and the For business link | Yes |
| SELL_NEXT_ON | Vercel env | The new Sell (api/sellNext.js, api/sellChat.js). Unset or not 1: the old Sell stays public. | Yes |
| SIGNUP_TURNSTILE | Vercel env | The Turnstile check at sign-up (needs both keys set) | Yes |
| PARTNER_DEMO_CODE | Vercel env | Unset: /partner-demo is not reachable by code | Yes |
| vin_input_enabled | Supabase app_config row (0 or 1) | The typed-VIN path, crew and test sessions | No (read at request time) |
| PALETTE_BAR_ON, RANGE_RULES.trimFirst | Code constants (lib/appShell.js, lib/onebox.js) | The crew palette bar; the trim-first question | Yes, by a push through Lane C |
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
