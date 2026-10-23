// A Task's cars as FIND'S OWN CARDS (Sam, Oct 23 2026). A task update stores a thin card per car (title, bid, place, miles). To show the
// car the way Find shows it, this reads the listing's row again and builds the card with Find's own engine step (api/buySearch.js
// enrichFast: the same fields Find's /api/buySearch cards carry: photo, source and time label, last bid with its time, tags, the engine's
// range line and panel read, the history behind Sold before / Listed before). Nothing is computed here and nothing is invented: a car
// whose row cannot be read keeps its thin line. The task page draws the result with the Find card kit (lib/findCardKit.js); the task
// email draws the same data in its own table layout (lib/tasks/emailCards.js).
import { supabaseSelect } from "../_supabase.js";
import { listingFacts } from "../live/search.js";
import { enrichFast } from "../../api/buySearch.js";

export const FULL_CAP = 24;            // cars read per request, newest updates first
const WAIT_MS = 9000;                  // the whole step is bounded: a slow read leaves the thin line, never a blank page

export async function fullCardsFor(env, cards, deps = {}) {
  const select = deps.select || supabaseSelect, enrich = deps.enrich || enrichFast, facts = deps.facts || listingFacts;
  const list = (cards || []).filter(c => c && Number.isFinite(Number(c.id)));
  if (!list.length) return [];
  const ids = [...new Set(list.map(c => Number(c.id)))];
  const rows = await select(env, `live_listings?id=in.(${ids.join(",")})&select=*`).catch(() => null);
  const by = new Map((rows || []).map(r => [Number(r.id), r]));
  const work = list.map(async c => {
    const r = by.get(Number(c.id)); if (!r) return null;
    try { return await enrich(env, { r, facts: facts(r), distance: c.distance_miles != null ? Number(c.distance_miles) : null, gen: null, unknown: [] }); } catch { return null; }
  });
  const all = Promise.all(work);
  return await Promise.race([all, new Promise(res => setTimeout(() => res(list.map(() => null)), WAIT_MS))]);
}

// Attach to a task list's updates, in place: u.data.full = [card or null, ...] in the order of u.data.cards, for the newest FULL_CAP cars.
export async function attachFullCards(env, tasks, deps) {
  const ups = [];
  for (const t of tasks || []) for (const u of t.updates || []) if (u && u.role === "sam" && u.data && Array.isArray(u.data.cards) && u.data.cards.length) ups.push(u);
  ups.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  let left = FULL_CAP; const picks = [];
  for (const u of ups) { if (left <= 0) break; const take = u.data.cards.slice(0, left); picks.push([u, take]); left -= take.length; }
  const flat = picks.flatMap(([, take]) => take);
  const full = await fullCardsFor(env, flat, deps);
  let i = 0;
  for (const [u, take] of picks) { u.data.full = take.map(() => full[i++] || null); }
}

// The engine's own one-line count for an update that lists cars (the model-written paragraph above the cards is gone).
export function updateLine(u) {
  const d = (u && u.data) || {}, n = Number(d.total) > 0 ? Number(d.total) : (d.cards || []).length;
  if (!n) return "";
  return d.opening ? (n === 1 ? "1 live car matches." : `${n} live cars match.`) : (n === 1 ? "1 new car matches." : `${n} new cars match.`);
}
