// Caller attribution (Lane B, Nov 2 2026, job lane-b-archiveread, step e).
//
// WHY. Supabase Query Performance showed one sales_archive pool query using 27.9% of all database time, and nothing in it says WHO sent it: a visitor's
// Market Check, the nightly warm, an ops task loop and Find all send the identical statement, so pg_stat_statements adds them into one row. Before any
// further change (an index, a cache) we need to know which of them is the load.
//
// HOW. A per-request AsyncLocalStorage tag (the same pattern as the engine's OB_CLOCK and lib/_readScope.js). The HTTP entry points set it (withTracking,
// the ops handler, the warm scripts); lib/_supabase.js reads it. For a read of sales_archive it adds ONE constant-valued alias to the select list
// ("via_warm:id"), which pg_stat_statements keeps as part of the statement text, so Query Performance lists the SAME query once per caller; the alias
// is stripped from the rows before anyone sees them, so no answer, stored row or served field can change. It also sends "User-Agent: goasksam/<caller>"
// on the call, which the Supabase API logs show beside every 57014. An untagged read (no entry point set a caller) is sent byte-for-byte as before and
// is itself the answer to "what is not attributed yet".
import { AsyncLocalStorage } from "node:async_hooks";

const CALLER = new AsyncLocalStorage();
export const CALLERS = ["warm", "ops", "cron", "build", "sell", "find", "tasks", "site", "partner", "visitor"];

export function runAsCaller(tag, fn) {
  const t = String(tag || "").toLowerCase();
  if (!/^[a-z0-9]{2,16}$/.test(t)) return fn();
  if (CALLER.getStore()) return fn();   // the OUTERMOST entry names the work: a partner demo that calls Market Check in-process stays "partner", an ops task stays "ops"
  return CALLER.run({ caller: t }, fn);
}
export function callerNow() {
  const s = CALLER.getStore();
  return s && s.caller ? s.caller : null;
}

// The tag for an HTTP request: a cron call, a warm call and an ops call are named by what they are; everything else by the product its route serves.
export function callerFor(route, req) {
  const ua = String((req && req.headers && (req.headers["user-agent"] || req.headers["User-Agent"])) || "");
  if (/vercel-cron/i.test(ua)) return "cron";
  try { if (req && req.body && typeof req.body === "object" && req.body.warm === true) return "warm"; } catch { /* body not parsed */ }
  const r = String(route || "").toLowerCase();
  if (/usagedashboard|\/admin/.test(r)) return "ops";
  if (/sellerdecision|sellchat|sellnext|\/chat/.test(r)) return "sell";
  if (/buysearch|\/buy|pulllive|refreshspeclivecounts/.test(r)) return "find";
  if (/\/tasks/.test(r)) return "tasks";
  if (/partner/.test(r)) return "partner";
  if (/history|spec|market/.test(r)) return "site";
  return "visitor";
}
