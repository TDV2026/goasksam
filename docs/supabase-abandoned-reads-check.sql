-- READ-ONLY diagnostic for Sam (Oct 25 2026). No DDL, no writes: it only reads pg_stat_activity. Run it in the Supabase SQL editor, again and again,
-- WHILE Lane B's sweep or golden run is going (Lane B says in lane-notes when each heavy step starts and stops, and runs nothing at the same time
-- as the fill).
--
-- The engine aborts every database read from its side after 8 seconds (lib/_supabase.js SUPABASE_FETCH_MS). If the database cancels an abandoned
-- query, nothing should still be ACTIVE long after that; if it does not, abandoned reads keep using CPU and these rows show them.
--
-- A row here means: a client query that has been running more than 15 seconds, so more than the 8 second abort plus a margin.
--   * query_80 starting "SELECT ... FROM sales_archive" while a sweep is running = an abandoned (or just very slow) pool read still running.
--   * age keeps growing across your repeated runs = it is not being cancelled.
--   * No rows across the whole sweep = abandoned reads are cancelled, or the reads finish before 15 seconds either way.
--   * Do NOT run the fill (or vacuum, or the Block 3 full scan) at the same time: those would show up here too, and they are not abandoned reads.
select
  pid,
  state,
  now() - query_start                                            as age,
  now() - state_change                                           as in_this_state,
  wait_event_type,
  wait_event,
  left(regexp_replace(query, '\s+', ' ', 'g'), 80)               as query_80
from pg_stat_activity
where datname = current_database()
  and backend_type = 'client backend'
  and pid <> pg_backend_pid()
  and state = 'active'
  and now() - query_start > interval '15 seconds'
order by query_start;
