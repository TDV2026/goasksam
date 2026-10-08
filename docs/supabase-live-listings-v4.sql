-- live_listings v4 (Lane C, Oct 2026): the pull keeps what the feed actually says. Run once in the Supabase
-- SQL editor. All columns nullable; the pull, /buy and Tasks work before this runs (the pull drops these
-- fields and keeps the old "USD" default until the columns exist) and pick them up on the next pull after.
--   mileage_unit  'mi' | 'km' | null: the unit the feed (or the listing title) gave; mileage is stored in
--                 miles, converted when this is 'km'. Null = no unit stated (lib/live/liveTrust.js decides).
--   bid_count     the feed's bid count (stats.bids); a $0 current_bid with bid_count > 0 is a bid the feed
--                 did not report, never shown as $0.
--   special_flag  Singer / RUF / RWB / race car / restomod / period tuner / replica / clone / tribute /
--                 recreation / ... from the one shared list (lib/live/specialFlag.js); null = a plain car.
-- currency: from v4 the pull leaves it NULL when the feed does not state one (it used to default to 'USD');
-- dollars-only platforms are still read as dollars (lib/live/liveTrust.js USD_ONLY_SOURCES).
alter table live_listings add column if not exists mileage_unit text;
alter table live_listings add column if not exists bid_count integer;
alter table live_listings add column if not exists special_flag text;
create index if not exists live_listings_special_idx on live_listings (special_flag) where status = 'live' and special_flag is not null;
-- Standing database rule (unchanged for this table, restated so the file and the database match):
alter table live_listings enable row level security;
revoke all on live_listings from anon, authenticated;
