// HOW THE CREW PREVIEWS JOIN THE ENGINE'S LIVE FIELD AND ITS FALLBACK (Lane E, Nov 8 2026). The live field (findExamples, tasksDemo, watchingDemo) exists only between pulls, so Lane B also keeps a fallback reader for each (a recent completed sale, a recent ended car).
// The rule is the engine's own order, `live ?? fallback`: the fallback is read ONLY when the live field is null (Find: fewer than three live cars), and nothing here picks, words or computes a thing; it only puts the two engine answers where the page looks for them.
//   findField(live, fb)    -> { cars: [...live items], fallback: [...fallback items] }   (the page fills the row to three, live first)
//   cardField(live, fb)    -> the live field, else { fallback: <the reader's answer> } (a reader that already answers { fallback: {...} } is passed on as it came)
export const liveCount = live => Array.isArray(live) ? live.length : (live && Array.isArray(live.cars) ? live.cars.length : 0);
export const needFindFallback = live => liveCount(live) < 3;
export function findField(live, fb) {
  const cars = Array.isArray(live) ? live : (live && Array.isArray(live.cars) ? live.cars : []);
  const fallback = Array.isArray(fb) ? fb : (fb && Array.isArray(fb.fallback) ? fb.fallback : []);
  return cars.length || fallback.length ? { cars, fallback } : null;
}
export function cardField(live, fb) {
  if (live != null) return live;
  if (fb == null || typeof fb !== "object") return null;
  return fb.fallback && typeof fb.fallback === "object" ? fb : { fallback: fb };
}
