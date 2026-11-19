-- Sam Desk Valuations: the org's own report colour (Lane D, Nov 2026).
-- The PDF and the Send email use the org's logo (desk_org_settings.logo_path, already there) and this one colour, never GoAskSam's. A hex like #8b1e2d. Null = the Desk's default green.
-- Idempotent. Run once in the Supabase SQL editor.
alter table desk_org_settings add column if not exists brand_color text;
alter table desk_org_settings drop constraint if exists desk_org_settings_brand_color_hex;
alter table desk_org_settings add constraint desk_org_settings_brand_color_hex check (brand_color is null or brand_color ~ '^#[0-9a-fA-F]{6}$');

-- The table stays locked down exactly as docs/supabase-desk-storage.sql left it (restated so this file is complete on its own):
alter table desk_org_settings enable row level security;
revoke all on desk_org_settings from anon, authenticated;

-- WHAT TO SET FOR HAGERTY (Sam):
--  1. Upload the logo (PNG or JPG, not SVG: the PDF cannot draw SVG) to the Storage bucket desk-hagerty at  hagerty/brand/logo.png
--  2. update desk_org_settings set logo_path = 'hagerty/brand/logo.png', brand_color = '#REPLACE_WITH_HAGERTY_HEX' where org_id = 'hagerty';
