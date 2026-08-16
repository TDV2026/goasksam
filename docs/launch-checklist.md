# Launch-day checklist

## Secret rotation
- [ ] `USAGE_DASHBOARD_KEY` — rotate before launch. **NOTE (Aug 2026): this key now
  gates the internal admin surface in `api/usageDashboard.js`, which has WRITE access
  to sale / revenue / journey data (via the `journey_manual_update` RPC), not just
  read access to analytics. Treat it as a write-capable admin credential: rotate it,
  keep it out of shared docs, and give it only to authorized admins.**
- [ ] `CURTAIN_CREW_CODE`, `CURTAIN_TESTER_CODE`, `TESTER_CODE_EXPIRES` — review/rotate.
- [ ] `OLDCARSDATA_API_KEY`, `ANTHROPIC_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY` — confirm current.

## Curtain removal (single commit)
- [ ] Remove the curtain block + `#curtain` + `.curtain*` CSS + `api/crew.js` + the
  robots.txt `Disallow: /` (keep `Allow: /privacy`).
- [ ] Remove the temporary root -> /sell redirect when a broader homepage ships at root.

## Analytics
- [ ] Run `docs/supabase-journeys-schema.sql` once in Supabase (journeys / journey_events
  / journey_audit + RPCs). Business tracking is forward-only from this point.
