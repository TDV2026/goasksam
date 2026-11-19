// THE warmVin PASS WITH A CURSOR (Lane B, Nov 10 2026). Cause: ops task=warmVin started at VIN 0 on every call and counted a VIN found fresh against its limit, so a loop of calls re-read the same fresh prefix and stalled near 700 of 11,185.
// Now a call takes `after` (the last VIN of the previous call), starts at the VIN after it, and answers with `next` (the cursor for the call after, null when the list is done) and the counts: handled, stored, fresh, other, notReached.
// A VIN already fresh since today's ingest marker (warmVinRow answers "fresh": a row of today's stamp and epoch) is passed over at once and does not count toward the limit; only a VIN that needed work does.
// Pure: the list, the cursor and the warm function come in; nothing here reads the database.
export async function warmVinPass(vins, { after = null, limit = 400, budgetMs = 200000, width = 2, warm, now = () => Date.now() } = {}) {
  const list = Array.isArray(vins) ? vins : [];
  let qi = 0;
  if (after != null && after !== "") { const at = list.indexOf(String(after)); if (at < 0) return { error: "cursor_not_in_list", line: "The cursor VIN is not in the list, so nothing was handled. Start again without &after=.", listed: list.length, handled: 0, stored: 0, fresh: 0, other: 0, notReached: list.length, next: String(after), states: {} }; qi = at + 1; }
  const start = qi, t0 = now(), out = { listed: list.length, handled: 0, asked: 0, stored: 0, fresh: 0, other: 0, notReached: 0, next: null, states: {}, ms: 0 };
  const worker = async () => {
    while (qi < list.length && out.asked < limit) {
      if (now() - t0 > budgetMs) return;
      const v = list[qi++]; let r; try { r = await warm(v); } catch { r = { state: "error" }; }
      out.handled++; out.states[r.state] = (out.states[r.state] || 0) + 1;
      if (r.state === "fresh") out.fresh++; else { out.asked++; if (r.state === "stored") out.stored++; else out.other++; }
    }
  };
  await Promise.all(Array.from({ length: Math.min(3, Math.max(1, width)) }, worker));
  out.notReached = Math.max(0, list.length - qi); out.next = qi >= list.length ? null : qi > 0 ? list[qi - 1] : null; out.ms = now() - t0;
  return out;
}
