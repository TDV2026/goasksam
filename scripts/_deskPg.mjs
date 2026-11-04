// A throwaway local Postgres for the Desk storage checks (Lane S, Nov 4 2026). It runs the REAL DDL files in docs/ against a scratch
// cluster that imitates the parts of Supabase the DDL leans on: the roles anon / authenticated / service_role, auth.uid(), the storage
// schema (buckets, objects with RLS on, foldername) and Supabase's default grants (every new public table is granted to all three
// roles, which is exactly why the standing rule revokes them). Nothing here touches the network or a real database.
// If no Postgres binaries are installed, available() is false and a check must say SKIP loudly (never count it as a pass).
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";

function findBin(name) {
  for (const dir of ["/opt/homebrew/opt/postgresql@17/bin", "/opt/homebrew/opt/postgresql@16/bin", "/opt/homebrew/bin", "/usr/local/bin", "/usr/lib/postgresql/17/bin", "/usr/lib/postgresql/16/bin", "/usr/lib/postgresql/15/bin", "/usr/lib/postgresql/14/bin", ...String(process.env.PATH || "").split(":")]) {
    const p = path.join(dir, name); if (dir && fs.existsSync(p)) return p;
  }
  return null;
}
export function available() { return !!(findBin("initdb") && findBin("pg_ctl") && findBin("psql")); }

const freePort = () => new Promise((res, rej) => { const s = net.createServer(); s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => res(p)); }); s.on("error", rej); });

export const STUBS = `
create schema auth; create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create schema storage;
create table storage.buckets (id text primary key, name text, public boolean default false);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id), name text, owner uuid);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language plpgsql as $$ declare _parts text[]; begin select string_to_array(name, '/') into _parts; return _parts[1:array_length(_parts, 1) - 1]; end $$;
grant usage on schema auth, storage to anon, authenticated, service_role;
grant all on all tables in schema storage to anon, authenticated, service_role;
grant execute on all functions in schema storage to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;
`;

export async function startCluster(baseDir = os.tmpdir()) {
  const initdb = findBin("initdb"), pgctl = findBin("pg_ctl");
  const dir = fs.mkdtempSync(path.join(baseDir, "deskpg-"));
  const data = path.join(dir, "data"), port = await freePort();
  execFileSync(initdb, ["-D", data, "-A", "trust", "-U", "postgres", "--no-sync"], { stdio: "ignore" });
  execFileSync(pgctl, ["-D", data, "-o", `-p ${port} -c listen_addresses=127.0.0.1 -c fsync=off -c unix_socket_directories=`, "-l", path.join(dir, "log"), "-w", "start"], { stdio: "ignore" });
  const psqlBin = findBin("psql");
  const run = (db, sql, { role = null, sub = null, timeout = 30000 } = {}) => {
    const pre = (role ? `set role ${role};\n` : "") + (sub ? `select set_config('request.jwt.claim.sub','${sub}',false) \\gset\n` : "");
    const r = spawnSync(psqlBin, ["-X", "-q", "-h", "127.0.0.1", "-p", String(port), "-U", "postgres", "-d", db, "-At", "-v", "ON_ERROR_STOP=1", "-F", "|"], { input: pre + sql, encoding: "utf8", timeout });
    return { ok: r.status === 0, out: String(r.stdout || "").trim(), err: String(r.stderr || "").trim() };
  };
  { const r = run("postgres", "create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;"); if (!r.ok) throw new Error("roles: " + r.err); }
  const cluster = {
    dir, port,
    // A fresh database with the Supabase stand-ins applied.
    newDb(name) { run("postgres", `create database ${name};`); const r = run(name, STUBS); if (!r.ok) throw new Error("stubs: " + r.err); return name; },
    run,
    stop() { try { execFileSync(pgctl, ["-D", data, "-m", "immediate", "-w", "stop"], { stdio: "ignore" }); } catch { /* already stopped */ } try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ } }
  };
  process.on("exit", () => cluster.stop());
  return cluster;
}
