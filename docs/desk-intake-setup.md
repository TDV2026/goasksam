# Desk intake and Send: setup (Lane D, Nov 4 2026)

Code is on branch lane-d-desk-intake, on top of Lane S's `lane-s-desk-storage` (seats, settings, storage). Nothing receives or sends until these steps are done. Secrets are not pullable, so Sam does the dashboard and SQL steps.

1. SQL, in order: `docs/supabase-desk-org.sql`, `docs/supabase-desk-storage.sql` (Lane S), then `docs/supabase-desk-intake.sql`. The last one only ADDS to Lane S's tables (queue-row columns, a hash on photos and documents, a unique index so a sheet has one sent row, `desk_orgs.inbound_local`) and creates the locked-down `desk_intake_log`.
2. The org needs `desk_org_settings.licence_ends_on` set (Lane S's retention trigger refuses to create a sheet for an org without it), `desk_orgs.inbound_local` (for Hagerty: `hagerty`), its seats (Lane S's seat admin, with each expert's real email), and its bucket `desk-<org>` (Lane S: `storage.ensure`).
3. Inbound domain. In Resend, Domains, add `desk.goasksam.com` for RECEIVING, and add the MX record Resend lists at the DNS host. The sending domain `mail.goasksam.com` is untouched.
4. Webhook. In Resend, Webhooks, add `https://goasksam.com/api/deskInbound` for the event `email.received`. Copy its signing secret (`whsec_...`) into Vercel as `DESK_INBOUND_WEBHOOK_SECRET`. `RESEND_API_KEY` (already set) is used to read the received email and to send. Optional: `DESK_INBOUND_DOMAIN` (default `desk.goasksam.com`).
5. Sending. Lane S registers the org's own sending domain with Resend and keeps its status in `desk_org_settings` (`domain.start`, `domain.check`). Send is refused until `sendingReady` (the address is on a domain Resend reports as verified). Automatic sending stays off (`auto_send` false) unless the org turns it on.
6. Deploy by push to main as usual. The endpoints are `/api/deskInbound` (provider only, signed), `/api/deskSend` and `/api/deskIntake` (seats and the operator only; limited, see `desk_send` and `desk_intake` in `lib/_ceilings.js`).

Dependencies added: `sharp` (resize, upright), `heic-convert` (HEIC to JPEG; sharp's prebuilt binary cannot read HEVC), `mailparser` (a forward sent as an attached email).
