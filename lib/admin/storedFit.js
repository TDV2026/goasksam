// STORED FIT (Lane D, Nov 1 2026): for a list of car texts, what the engine's STORED answer says, read only. No compute, no write, no OldCarsData: resolve the text the way a visit does, build the stored row's key,
// read the row (and the stored question row when there is no answer row). The answer is the engine's own stored oneEngineAnswer output; nothing is worked out here.
//   range     a stored result with a range            thin      a stored thin result (the sales, no range)
//   nothing   the engine stored "not tracked" (it answered, and the answer is no sales)
//   refusal   the engine stored a refusal (it will not show figures for this car)
//   question  the engine asks a question first (a stored question row)
//   no_row    NOTHING IS STORED: this says nothing about what the engine would answer (never counted as "nothing")
//   unresolved the text does not resolve to one car
export const FITS = ["range", "thin", "nothing", "refusal", "question", "no_row", "unresolved"];
export function fitOfRaw(raw) {
  const t = String(raw && raw.tier || "");
  if (t === "result") return "range";
  if (t === "thin") return "thin";
  if (t === "not_tracked") return "nothing";
  if (t === "refusal") return "refusal";
  return "no_row";   // an unknown or partial stored shape is not an answer
}
export async function storedFitOf(texts, d) {
  const rows = [];
  for (const q of texts) {
    const row = { q, fit: "unresolved", tier: null, stale: null };
    try {
      const v = await d.resolve(q);
      if (v) {
        const key = d.keyFor(v, await d.generationOf(v)), w = await d.readAnswer(key);
        if (w && w.raw) { row.fit = fitOfRaw(w.raw); row.tier = w.raw.tier || null; row.stale = !!w.stale; }
        else { const qr = await d.readQuestion(d.questionKey(key, q)); if (qr && qr.raw) { row.fit = "question"; row.tier = "question"; row.stale = !!qr.stale; } else { row.fit = "no_row"; row.why = (w && w.reason) || "no_row"; } }
      }
    } catch { row.fit = "unresolved"; }
    rows.push(row);
  }
  const counts = Object.fromEntries(FITS.map(f => [f, 0])); for (const r of rows) counts[r.fit]++;
  return { counts, rows };
}
