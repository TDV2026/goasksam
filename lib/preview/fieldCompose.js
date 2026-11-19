// HOW THE CREW PREVIEWS JOIN THE ENGINE'S LIVE FIELD AND ITS FALLBACK (Lane E, Nov 8 2026). The live field (findExamples, tasksDemo, watchingDemo) exists only between pulls, so Lane B also keeps a fallback reader for each (a recent completed sale, a recent ended car).
// The rule is the engine's own order, `live ?? fallback`: the fallback is read ONLY when the live field is null (Find: fewer than three live cars), and nothing here picks, words or computes a thing; it only puts the two engine answers where the page looks for them.
//   findField(live, fb)    -> { cars: [...live items], fallback: [...fallback items] }   (the page fills the row to three, live first)
//   cardField(live, fb)    -> the live field, else { fallback: <the reader's answer> } (a reader that already answers { fallback: {...} } is passed on as it came)
export const liveCount = live => Array.isArray(live) ? live.length : (live && Array.isArray(live.cars) ? live.cars.length : 0);
export const needFindFallback = live => liveCount(live) < 3;
export function findField(live, fb) {
  const cars = Array.isArray(live) ? live : (live && Array.isArray(live.cars) ? live.cars : []);
  const fallback = Array.isArray(fb) ? fb : (fb && Array.isArray(fb.fallback) ? fb.fallback : (live && !Array.isArray(live) && Array.isArray(live.fallback) ? live.fallback : []));
  return cars.length || fallback.length ? { cars, fallback } : null;
}
export function cardField(live, fb) {
  if (live != null) return live;
  if (fb == null || typeof fb !== "object") return null;
  return fb.fallback && typeof fb.fallback === "object" ? fb : { fallback: fb };
}

// WHAT A VISITOR GETS ON FIND (Lane E, Nov 11 2026; the flip's rollback: Find showed a visitor no cars). The crew preview draws the engine's CARD (findExamplesField builds it per request, crew only). A visitor is served the STORED daily pick (findExamples: the live cars, findExamplesFallback: the completed
// sales), which carries the same facts as plain fields (title, platform, link, photo, end, the venue and timing lines, the intelligence row, the sold price and date words). This puts each field where the page's card reads it. A move, nothing more: no word, number or choice is made here, and a field that is missing stays missing (the page drops a card that lacks one).
export const publicFindField = (live, sales) => {
  const cars = (Array.isArray(live) ? live : []).map(it => ({ card: { id: it.url, title: it.title, source: it.platform, url: it.url, photo_url: it.photo, end_time: it.endsAt }, intelligence: it.intelligence, venue: it.venue, timing: it.timing, findUrl: it.findUrl }));
  const fallback = (Array.isArray(sales) ? sales : []).map(it => ({ card: { id: it.url, title: it.title, source: it.platform, url: it.url, photo_url: it.photo, end_time: it.soldAt, sold: { price: it.priceLabel, when: it.dateLine } }, findUrl: it.findUrl }));
  return findField(cars, fallback);
};
