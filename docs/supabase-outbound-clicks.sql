-- Outbound click log (Part 6). One row per outbound submission-button interaction:
-- when a seller clicks "Send my details to {platform}" and either continues to the
-- platform's own submission page (outcome=continued) or dismisses the modal
-- (outcome=abandoned). Written best-effort by api/out.js; read via api/outboundClicks.js
-- (keyed). No PII: session_id is an opaque random client token, never an email.
--
-- Run once in the Supabase SQL editor (secrets are not pullable from Vercel, so
-- Sam runs this manually). Everything degrades silently until it exists: api/out.js
-- still 302s, and the read path shows "table not found yet".

create table if not exists outbound_clicks (
  id               uuid primary key default gen_random_uuid(),
  created_at       timestamptz not null default now(),
  search_id        text,               -- opaque per-analysis id from the frontend
  session_id       text,               -- opaque per-browser id (localStorage), never PII
  platform         text not null,      -- destination slug (bringatrailer, carsandbids, ...)
  card             text,               -- 'pick' | 'alt' (which card the button was on)
  year             integer,
  make             text,
  model            text,
  trim             text,
  location         text,               -- seller state or region
  landed_rung      text,               -- evidence ladder rung the analysis landed on
  reason           text,               -- routing reason (speed / speed_unknown / specialist / ...)
  seller_preference text,              -- diy | powerseller | unsure
  outcome          text                -- 'continued' | 'abandoned'
);

create index if not exists outbound_clicks_created_at_idx on outbound_clicks (created_at desc);
create index if not exists outbound_clicks_platform_idx on outbound_clicks (platform);
