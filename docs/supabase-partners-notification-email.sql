-- Partner lead-notification email (Aug 2026).
-- Adds the destination address the PowerSeller lead notification is sent to
-- (api/submitSellerLead.js -> lib/_email.js, Resend). feedback@goasksam.com is
-- BCC'd on every send in code; this column is the partner-facing recipient.
-- Nullable: until a partner's real address is set, the notification still lands
-- at feedback@ so no lead is ever lost.
--
-- Run once in the Supabase SQL editor, then set each partner's address, e.g.:
--   update partners set notification_email = 'howard@howsmotorcars.com' where slug = 'hows-motorcars-main-line';
--   update partners set notification_email = 'ingo@genauautowerks.com'   where slug = 'genau-auto-werks';
-- (Use the real addresses you provide.)
--
-- Also set RESEND_API_KEY in Vercel to activate sending. The From address defaults
-- to leads@mail.goasksam.com (the verified Resend sending subdomain; the root
-- goasksam.com is NOT verified and would be rejected). Override with LEAD_EMAIL_FROM
-- only if the sending address changes. Until RESEND_API_KEY is set, sends are skipped
-- cleanly and the lead still writes to seller_leads.

alter table partners add column if not exists notification_email text;

-- Real destination addresses (Master v5), matched to the actual live slugs.
-- Note: Howard's slug is hows-motorcars-main-line (not hows-motorcars).
update partners set notification_email = 'ingo@genauautowerks.com'   where slug = 'genau-auto-werks';
update partners set notification_email = 'hows220@gmail.com'         where slug = 'hows-motorcars-main-line';
update partners set notification_email = 'dan@authenticauctions.com' where slug = 'authentic-auctions';
update partners set notification_email = 'chris@carbinemotors.com'   where slug = 'carbine123';
update partners set notification_email = 'spencer@specwerksltd.com'  where slug = 'specwerks-ltd';

notify pgrst, 'reload schema';
