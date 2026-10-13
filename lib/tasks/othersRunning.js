// Does the person have another running Task? (Oct 2026, Lane C.) Read by the pages around a Pause or Stop from a Task
// email (api/watch.js for looking Tasks, api/tasks.js for search Tasks), so "Your other Tasks keep running." shows only
// when it is true. Running: a looking Task (watches) neither stopped nor paused, or a search Task running or waiting on
// the person (lib/tasks/tasks.js ACTIVE). The Task being acted on is left out. null when either read fails, and the
// page then claims neither.
import { supabaseSelect } from "../_supabase.js";

export async function othersRunning(env, { userId, watchId = null, taskId = null } = {}, select = supabaseSelect) {
  if (!userId || !/^[0-9a-f-]{36}$/i.test(String(userId))) return null;
  const [ws, ts] = await Promise.all([
    select(env, `watches?user_id=eq.${userId}&stopped_at=is.null${watchId ? `&id=neq.${watchId}` : ""}&select=*&limit=100`),
    select(env, `tasks?user_id=eq.${userId}&state=in.(running,needs_you)&summary=not.is.null${taskId ? `&id=neq.${taskId}` : ""}&select=id&limit=1`),
  ]);
  if (!Array.isArray(ws) || !Array.isArray(ts)) return null;
  return ws.some(r => !r.paused_at) || ts.length > 0;
}

// The second line on those pages: true, false, or nothing at all when the read failed.
export function othersLine(others) {
  return others === true ? "<p>Your other Tasks keep running.</p>" : others === false ? "<p>Nothing else is running.</p>" : "";
}
