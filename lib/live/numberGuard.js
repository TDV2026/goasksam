// The number check every chat shares (Sam, Oct 25 2026): a number in a model reply must appear in the facts the model was given (a tool result, or the
// facts text a page sent) or in the person's own words. One definition, used by lib/live/chatCore.js (Find, Sell, Tasks chats: guardReply) and by
// api/chat.js (the entry and legacy Sell wizard chat: groundReplyNumbers). No dependencies, so the small chat endpoint can load it alone.
export const numTok = /(?<![A-Za-z0-9])\$?\d[\d,]*(?:\.\d+)?k?(?![A-Za-z0-9])/gi;
export const normNum = t => { let x = String(t).toLowerCase().replace(/[$,]/g, ""); const k = /k$/.test(x); x = x.replace(/k$/, ""); const n = Number(x); return Number.isFinite(n) ? String(Math.round(k ? n * 1000 : n)) : null; };
export function allowedNumbers(trace, userText) {
  const set = new Set();
  const addText = t => { for (const m of String(t).match(numTok) || []) { const n = normNum(m); if (n) set.add(n); } for (const m of String(t).match(/\d+/g) || []) set.add(String(Number(m))); };
  const walk = (o, key) => { if (o == null) return; if (Array.isArray(o)) return o.forEach(x => walk(x, key)); if (typeof o === "object") return Object.entries(o).forEach(([k, v]) => { if (/^(id|vin|url|link)$/i.test(k)) return; addText(k); walk(v, k); }); if (typeof o === "number") { set.add(String(Math.round(o))); return; } addText(o); };
  for (const t of trace) { walk(t.input); walk(t.result); }
  addText(userText || "");
  return set;
}

// A reply with every sentence that carries a number nobody supplied taken out. supplied: the facts text the page sent plus the person's own words.
// Returns { text, dropped: [sentences], bad: [numbers] }. The engine's answers are not touched: this only reads the model's words.
export function groundReplyNumbers(reply, supplied) {
  const ok = allowedNumbers([{ result: String(supplied || "") }], "");
  const keep = [], dropped = [], bad = new Set();
  for (const sent of String(reply || "").replace(/\s+/g, " ").trim().split(/(?<=[.!?])\s+/)) {
    if (!sent) continue;
    const off = (sent.match(numTok) || []).map(normNum).filter(n => n && !ok.has(n));
    if (off.length) { dropped.push(sent); off.forEach(n => bad.add(n)); } else keep.push(sent);
  }
  return { text: keep.join(" ").trim(), dropped, bad: [...bad] };
}
