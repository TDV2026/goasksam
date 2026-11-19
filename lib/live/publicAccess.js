// PUBLIC EXAMPLES, THE ONE FLAG (Lane B, Nov 10 2026). The entry page examples (Find's three cars with intelligence, the Market Check card, result and sales, the Sell card and cars, the Homepage featured history, the Tasks email example)
// were readable only with the signed crew cookie. PUBLIC_EXAMPLES=1 makes the same readers answer a public request, and only that: a public request READS THE STORED DAILY PICK. It never builds one, never calls the engine, never calls OldCarsData and
// never writes; the build stays on the cron (api/pullLive.js, lib/live/publicExamples.js) and the crew rebuild task. A missing or stale pick answers null and the section hides. Default OFF (unset or anything but "1") until Lane C flips it at go live.
// Each reader keeps its own kill switch (FIND_EXAMPLES, TASKS_DEMO, FEATURED_HISTORY, CREW_MC_EXAMPLES, CREW_SELL_EXAMPLE and the older MC_EXAMPLE_SALES, SELL_EXAMPLE_FIELD): a switch at "0" answers null to everyone, crew included.
import { isCrewRequest } from "../_crew.js";
export const publicExamplesOn = () => process.env.PUBLIC_EXAMPLES === "1";
// true when the request has no crew cookie and the flag is on: the stored pick is read, nothing is built
export const isPublicRead = req => publicExamplesOn() && !isCrewRequest(req);
// the gate every example reader opens with: the crew cookie, or the flag
export const mayRead = req => isCrewRequest(req) || publicExamplesOn();
