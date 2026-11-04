# Desk intake and Send: setup (Lane D, Nov 4 2026)

Code is on branch lane-d-desk-intake. Nothing receives or sends until these steps are done. Secrets are not pullable, so Sam does the dashboard and SQL steps.

1. SQL. Run `docs/supabase-desk-intake.sql` once in the Supabase SQL editor (after `docs/supabase-desk-org.sql`). It adds the org settings columns, `desk_sheets`, `desk_sheet_files`, `desk_intake_log`, `desk_sent`, and the private bucket `desk-intake`. RLS is on and every grant to anon and authenticated is revoked, in the file.
2. Inbound domain. In Resend, Domains, add `desk.goasksam.com` for RECEIVING, and add the MX record Resend lists at the DNS host. The sending domain `mail.goasksam.com` is untouched.
3. Webhook. In Resend, Webhooks, add `https://goasksam.com/api/deskInbound` for the event `email.received`. Copy its signing secret (`whsec_...`) into Vercel as `DESK_INBOUND_WEBHOOK_SECRET`. `RESEND_API_KEY` (already set) is used to read the received email. Optional: `DESK_INBOUND_DOMAIN` (default `desk.goasksam.com`).
4. The org. For Hagerty: a `desk_orgs` row with `inbound_local = 'hagerty'`, a `desk_seats` row per expert with their real email, and the org's `sending_address`, `sending_name`, `signature`, `standard_message`. `sending_verified` stays false until the org's sending address is verified in its own provider (Lane S owns that step). `auto_send` stays false.
5. Sending key. The org sends through its own Resend account: put that account's API key in Vercel as `DESK_SEND_KEY_<ORG>` (for Hagerty, `DESK_SEND_KEY_HAGERTY`). An org with no key cannot send; it never falls back to another org's key or ours.
6. Deploy by push to main as usual. The endpoints are `/api/deskInbound` (provider only, signed), `/api/deskSend` and `/api/deskIntake` (seats only).

Dependencies added: `sharp` (resize, upright), `heic-convert` (HEIC to JPEG; sharp's prebuilt binary cannot read HEVC), `mailparser` (a forward sent as an attached email).
