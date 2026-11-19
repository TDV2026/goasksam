// THE WORDS LEDGER (Lane D, Nov 12 2026; Sam's live run: a case printed a sentence the table no longer says, because the engine stored the SENTENCE on the case when it read).
// RULE: a sentence is never read back from a stored case. What is stored with the case is the ledger of how each sentence was made: its table id and the figures it was made from (and, for the small phrase helpers, the helper and its arguments). When a case is served, each recorded sentence is made again from those figures with the table's current words (lib/desk/serveWords.js), and the stored text is replaced by it. The stored figures and decisions are never changed.
// How it records: lib/reasonWords.js tells this module each sentence it makes (reasonLine and the phrase helpers); a recording is per request (AsyncLocalStorage), so two reads in one process never mix. With no recording open, noting costs nothing.
// Server side only (node:async_hooks).
import { AsyncLocalStorage } from "node:async_hooks";
const als = new AsyncLocalStorage();
export const note = entry => { const s = als.getStore(); if (s) s.push(entry); };
export async function recordWords(fn) { const store = []; const result = await als.run(store, fn); return { result, refs: store }; }
export function recordSync(fn) { const store = []; const result = als.run(store, fn); return { result, refs: store }; }
const MAXW = 6000;
const strings = (v, out) => { if (typeof v === "string") out.push(v); else if (Array.isArray(v)) for (const x of v) strings(x, out); else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) if (k !== "words") strings(x, out); return out; };
// The ledger worth keeping: the recorded sentences whose text is in the desk (nothing else is stored), once each, in the order they were made.
export function compactWords(refs, desk, existing = []) {
  const all = [...(Array.isArray(existing) ? existing : []), ...(refs || []).map(r => (r.id ? { t: r.t, id: r.id, p: safe(r.p) } : { t: r.t, fn: r.fn, a: safe(r.a) }))];
  const seen = new Set(), text = strings(desk, []).join("\n"), out = [];
  for (const w of all) { if (!w || typeof w.t !== "string" || w.t.length < 3) continue; const k = w.t + "\u0001" + (w.id || w.fn) + JSON.stringify(w.p !== undefined ? w.p : w.a); if (seen.has(k)) continue; seen.add(k); if (text.includes(w.t)) out.push(w); }
  return out.slice(-MAXW);
}
const safe = v => { try { return JSON.parse(JSON.stringify(v === undefined ? null : v)); } catch { return null; } };
