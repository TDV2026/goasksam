-- Read-only. Paste in the Supabase SQL editor AFTER docs/supabase-desk-storage.sql. Every row should say ok = true.
-- Changes nothing. Send Sam's result back to Lane S.

-- 1. Every desk_ table: RLS on, and no grant left to anon or authenticated.
select c.relname as object,
       c.relrowsecurity as rls_on,
       has_table_privilege('anon', c.oid, 'select,insert,update,delete')          as anon_any,
       has_table_privilege('authenticated', c.oid, 'select,insert,update,delete') as authenticated_any,
       (c.relrowsecurity and not has_table_privilege('anon', c.oid, 'select,insert,update,delete')
                         and not has_table_privilege('authenticated', c.oid, 'select,insert,update,delete')) as ok
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' and c.relname like 'desk\_%'
order by c.relname;

-- 2. Every desk- bucket is private.
select id, public, (not public) as ok from storage.buckets where id like 'desk-%' order by id;

-- 3. The storage policy exists and is read-only; no write policy on storage.objects mentions desk-.
select policyname, cmd, roles, (cmd = 'SELECT') as ok
from pg_policies where schemaname = 'storage' and tablename = 'objects' and (policyname like 'desk\_%' or qual like '%desk-%' or with_check like '%desk-%');

-- 4. No Desk function is callable by anon or authenticated through the API (desk_private.seat_orgs is the one
--    deliberate exception, and it is in a schema the API does not expose).
select p.oid::regprocedure as fn,
       has_function_privilege('anon', p.oid, 'execute') as anon_exec,
       has_function_privilege('authenticated', p.oid, 'execute') as authenticated_exec
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where (n.nspname = 'public' and p.proname like 'desk\_%') or (n.nspname = 'desk_private')
order by 1;

-- 5. The licence end is set for every org that will hold sheets (a sheet insert fails until it is).
select org_id, licence_starts_on, licence_ends_on, (licence_ends_on is not null) as ok from desk_org_settings order by org_id;
