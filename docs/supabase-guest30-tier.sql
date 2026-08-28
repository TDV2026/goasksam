-- Guest tier (Aug 2026): a shareable ?guest=<CODE> link grants a signed-in account a
-- FIXED LIFETIME allowance of 30 total searches (not daily), fully attributed and visible
-- in Journey Explorer / the funnel like a real subscriber.
--
-- This row is the tier's config. daily_searches is set to 30 purely as a backstop: the
-- real cap is the LIFETIME 30, enforced in the app layer (computeSearchGate counts the
-- account's all-time search_events and walls at 30). monthly_searches stays null (no
-- monthly cap). Run once in the Supabase SQL editor.
--
-- Also set the GUEST_CODE env var in Vercel (the secret you put in the link,
-- e.g. https://goasksam.com/api/crew?guest=<CODE> ).

insert into rate_limits (tier, daily_searches, monthly_searches)
values ('guest30', 30, null)
on conflict (tier) do update
  set daily_searches = excluded.daily_searches,
      monthly_searches = excluded.monthly_searches;

notify pgrst, 'reload schema';
