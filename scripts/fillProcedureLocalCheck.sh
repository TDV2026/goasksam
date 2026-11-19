#!/bin/bash
# Local test of docs/supabase-raw-columns.sql Block 2 (the fill procedure) on a THROWAWAY Postgres cluster built here and removed at the end.
# Never touches production: it starts its own server on a private unix socket with a made-up 50,000-row table. Needs Postgres binaries
# (initdb, pg_ctl, psql) on the PATH or in /opt/homebrew/bin.   bash scripts/fillProcedureLocalCheck.sh
export PATH=/opt/homebrew/bin:$PATH
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
D=$(mktemp -d /tmp/fillchk.XXXXXX); SOCK=/tmp/fcs$$; mkdir -p "$SOCK"
trap 'pg_ctl -D "$D/db" stop >/dev/null 2>&1; rm -rf "$D" "$SOCK"' EXIT
initdb -D "$D/db" -U tester --auth=trust >/dev/null 2>&1 || { echo "SKIP no local Postgres"; exit 0; }
pg_ctl -D "$D/db" -o "-p 54998 -k $SOCK -c listen_addresses=''" -l "$D/log" start >/dev/null 2>&1; sleep 3
P="psql -h $SOCK -p 54998 -U tester postgres -v ON_ERROR_STOP=1 -q -At"
fail=0; ok() { if [ "$2" = "1" ]; then echo "PASS  $1"; else echo "FAIL  $1"; fail=1; fi; }
$P >/dev/null <<'SQL'
create role anon; create role authenticated;
create table public.sales_archive (id uuid primary key default gen_random_uuid(), source_id text, listing_title text, raw_record jsonb,
  body_style text, modifications jsonb, exterior_color text, title_status text, created_at timestamptz default now());
alter table public.sales_archive add column image_url text, add column mileage_text text, add column transmission_text text, add column currency text,
  add column listing_url text, add column source_url text, add column city text, add column state text, add column country_code text, add column end_precision text;
alter table public.sales_archive add column raw_cols_at timestamptz;
insert into public.sales_archive (source_id, listing_title, raw_record, body_style, modifications)
select 's'||g, 't'||g, jsonb_strip_nulls(jsonb_build_object('title','t'||g,'featured_image_url',case when g%7=0 then null else 'u'||g end,
  'mileage',case when g%3=0 then null else (g*10)::text end,'currency','USD','url','h'||g,'city',case when g%4=0 then 'Austin' else null end,
  'body_style',case when g%2=0 then 'Coupe' else null end,'exterior_color','Black',
  'modifications',case g%6 when 0 then '["a","b"]'::jsonb when 1 then '[]'::jsonb when 2 then 'null'::jsonb else null end)),
  case when g%11=0 then 'Preset' else null end, case when g%13=0 then '["Preset"]'::jsonb else null end from generate_series(1,50000) g;
update public.sales_archive set raw_cols_at='2026-10-20', image_url='KEEP' where source_id in ('s1','s2','s3');
SQL
python3 - "$ROOT/docs/supabase-raw-columns.sql" "$D/block2.sql" <<'PY'
import sys
s=open(sys.argv[1]).read()
end="revoke execute on procedure public.fill_sales_archive_raw_columns(int, int) from public, anon, authenticated;"
open(sys.argv[2],'w').write(s[s.index("create table if not exists public.sales_archive_fill_progress"):s.index(end)+len(end)])
PY
$P -f "$D/block2.sql" >/dev/null
# guard
$P -c "call public.fill_sales_archive_raw_columns(0, 1);" 2>&1 | grep -q "must be at least 1" && ok "guard: batch_rows 0 raises" 1 || ok "guard: batch_rows 0 raises" 0
$P -c "call public.fill_sales_archive_raw_columns(5000, 0);" 2>&1 | grep -q "must be at least 1" && ok "guard: max_batches 0 raises" 1 || ok "guard: max_batches 0 raises" 0
[ "$($P -c "select count(*) from public.sales_archive_fill_progress;")" = "0" ] && ok "a refused call writes nothing" 1 || ok "a refused call writes nothing" 0
# one batch of 5000: cursor is the 5000th id in order
$P -c "call public.fill_sales_archive_raw_columns(5000, 1);" >/dev/null 2>&1
[ "$($P -c "with o as (select id, row_number() over (order by id) rn from public.sales_archive) select (select last_id from public.sales_archive_fill_progress)=(select id from o where rn=5000);")" = "t" ] && ok "one batch of 5,000 ends on the 5,000th id" 1 || ok "one batch of 5,000 ends on the 5,000th id" 0
# resume to completion
for i in 1 2 3 4; do $P -c "call public.fill_sales_archive_raw_columns(5000, 3);" >/dev/null 2>&1; done
[ "$($P -c "select finished::text||done_rows from public.sales_archive_fill_progress;")" = "true49997" ] && ok "resume to completion: finished, 49,997 rows (3 pre-marked skipped)" 1 || ok "resume to completion" 0
[ "$($P -c "select count(*) from public.sales_archive where raw_cols_at is null;")" = "0" ] && ok "no row left unmarked" 1 || ok "no row left unmarked" 0
[ "$($P -c "select count(*) from public.sales_archive where source_id not in ('s1','s2','s3') and (image_url is distinct from raw_record->>'featured_image_url' or mileage_text is distinct from raw_record->>'mileage' or currency is distinct from raw_record->>'currency' or listing_url is distinct from raw_record->>'url' or city is distinct from raw_record->>'city' or exterior_color is distinct from raw_record->>'exterior_color');")" = "0" ] && ok "filled values equal the record's" 1 || ok "filled values equal the record's" 0
[ "$($P -c "select count(*) from public.sales_archive where body_style='Preset';")" = "4545" ] && ok "a reused column ingest had written is kept" 1 || ok "a reused column ingest had written is kept" 0
# catch-up
$P -c "insert into public.sales_archive (id, source_id, listing_title, raw_record) values ('00000000-0000-4000-8000-000000000001','n1','x','{\"currency\":\"USD\"}'),('00000000-0000-4000-8000-000000000002','n2','y','{\"currency\":\"GBP\"}');" >/dev/null
X0=$($P -c "select xmin::text from public.sales_archive where source_id='s100';")
$P -c "update public.sales_archive_fill_progress set last_id = null, finished = false where job = 'raw_columns';" -c "call public.fill_sales_archive_raw_columns(5000, 20);" >/dev/null 2>&1
X1=$($P -c "select xmin::text from public.sales_archive where source_id='s100';")
[ "$($P -c "select count(*) from public.sales_archive where raw_cols_at is null;")" = "0" ] && [ "$X0" = "$X1" ] && [ "$($P -c "select finished::text||done_rows from public.sales_archive_fill_progress;")" = "true49999" ] && ok "catch-up marks the 2 late rows, rewrites no filled row" 1 || ok "catch-up marks the 2 late rows, rewrites no filled row" 0
# Block 3 (b): the four slices from the file run, cover every row exactly once, and add up
python3 - "$ROOT/docs/supabase-raw-columns.sql" "$D" <<'PY'
import sys,re
s=open(sys.argv[1]).read()
for n in range(1,5):
    i=s.index(f"-- slice {n}\n"); j=s.index(";\n",s.index("from public.sales_archive\nwhere",i))+2
    open(f"{sys.argv[2]}/slice{n}.sql","w").write(s[i:j])
PY
T=0; for n in 1 2 3 4; do c=$($P -f "$D/slice$n.sql" | cut -d'|' -f1); T=$((T + c)); done
[ "$T" = "50002" ] && ok "Block 3 (b): four slices run and their sampled counts add up to every row (50,002)" 1 || ok "Block 3 (b) slices cover every row once (got $T)" 0
exit $fail
