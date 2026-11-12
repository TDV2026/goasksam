// DESK V4: WHAT WE TOOK INTO ACCOUNT (Lane D, Nov 12 2026; Sam's second run). case.considered is an ordered list of { id, key, title, text, edited } that the seller report prints under "What we took into account", as written. THE ENGINE'S ITEMS ARE THE START
// (desk.considered, lib/deskV3.js, and every waived needs-attention item as its limit line); the analyst owns the list after that: each can be edited or removed, and the analyst can add one. An item the analyst did not edit follows its source (the engine's line moves
// with the read, a waived item leaves when its cause is gone); an edited item keeps the analyst's words; a removed item is never put back. Nothing here is a figure: the words are the engine's lines, the table's lines or the analyst's.
import { reasonLine } from "../reasonWords.js";
import { logAudit } from "./caseModel.js";
export const MAX_CONSIDERED = 12, MAX_TITLE = 80, MAX_TEXT = 300;
const clone = x => structuredClone(x), iso = n => n || new Date().toISOString();
const clean = (t, n) => String(t == null ? "" : t).replace(/[\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, n);
// the sources the engine and the case give, in the order the report always printed them: the engine's items, then the waived limits
export function sourcesOf(c) {
  const d = c.desk || {};
  return [...(d.considered || []).map(x => ({ key: "e:" + x.key, title: x.title, text: x.line })),
    ...(c.needs_review || []).filter(n => n.state === "waived").map(n => ({ key: "w:" + n.id, title: n.label, text: reasonLine("report.limit_waived", { label: n.label, reason: n.reason }) }))].filter(x => x.text && x.key);
}
const nextId = c => { const used = new Set((c.considered || []).map(s => s.id)); let n = 1; while (used.has("cn" + n)) n++; return "cn" + n; };
export function syncConsidered(c0) {
  const c = clone(c0); c.considered = Array.isArray(c.considered) ? c.considered : []; c.consideredRemoved = Array.isArray(c.consideredRemoved) ? c.consideredRemoved : [];
  const src = sourcesOf(c), by = new Map(src.map(s => [s.key, s]));
  c.considered = c.considered.filter(i => !i.key || i.edited || by.has(i.key));   // a source that is gone takes its unedited item with it
  for (const i of c.considered) if (i.key && !i.edited && by.has(i.key)) { const s = by.get(i.key); i.title = s.title; i.text = s.text; }
  const have = new Set(c.considered.map(i => i.key).filter(Boolean));
  for (const s of src) if (!have.has(s.key) && !c.consideredRemoved.includes(s.key) && c.considered.length < MAX_CONSIDERED) c.considered.push({ id: nextId(c), key: s.key, title: s.title, text: s.text, edited: false });
  return c;
}
const find = (c, id) => { const i = c.considered.findIndex(s => s.id === String(id)); if (i < 0) throw new Error("no such item"); return i; };
export function editConsidered(c0, id, { title, text } = {}, now) {
  const c = syncConsidered(c0), i = find(c, id), it = c.considered[i], t = text === undefined ? it.text : clean(text, MAX_TEXT), h = title === undefined ? it.title : clean(title, MAX_TITLE);
  if (!t) throw new Error("an item needs words, or remove it");
  if (t === it.text && h === it.title) return c;
  c.considered[i] = { ...it, title: h, text: t, edited: true }; logAudit(c, { at: iso(now), by: "analyst", what: "considered item edited", field: "considered", to: it.id }); return c;
}
export function removeConsidered(c0, id, now) {
  const c = syncConsidered(c0), i = find(c, id), [gone] = c.considered.splice(i, 1);
  if (gone.key && !c.consideredRemoved.includes(gone.key)) c.consideredRemoved.push(gone.key);
  logAudit(c, { at: iso(now), by: "analyst", what: "considered item removed", field: "considered", to: gone.id }); return c;
}
export function addConsidered(c0, { title, text } = {}, now) {
  const c = syncConsidered(c0), t = clean(text, MAX_TEXT), h = clean(title, MAX_TITLE); if (!t) throw new Error("an item needs words");
  if (c.considered.length >= MAX_CONSIDERED) throw new Error("a report takes up to " + MAX_CONSIDERED + " items here");
  const it = { id: nextId(c), key: null, title: h || reasonLine("report.considered_untitled"), text: t, edited: true }; c.considered.push(it);
  logAudit(c, { at: iso(now), by: "analyst", what: "considered item added", field: "considered", to: it.id }); return c;
}
// what the report prints: the list as it stands
export const printedConsidered = c => syncConsidered(c).considered.map(i => ({ title: i.title, text: i.text }));
