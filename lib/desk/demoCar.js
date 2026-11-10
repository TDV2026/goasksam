// The demonstration car of desk v3 (Lane D, Nov 10 2026): a real sale in sales_archive, read once with the ops task deskcars (year 1999, Porsche, Carrera). The VIN, the listing address and the photo are the archive's own; nothing here is typed from memory.
// The photo is the listing's own picture and passed lib/live/photoRule.js choosePhoto when it was read. Mileage, date and price are that listing's snapshot (sold 2026-11-04 at 72,000 miles); the case's own mileage is the seller's report and is a separate field.
export const DEMO_CAR = Object.freeze({
  vin: "WP0AA2995XS626785",
  title: "22-Years-Owned 1999 Porsche 911 Carrera Coupe 6-Speed",
  platform: "Bring a Trailer",
  soldOn: "2026-11-04",
  listingUrl: "https://bringatrailer.com/listing/1999-porsche-911-carrera-coupe-233/",
  photoUrl: "https://bringatrailer.com/wp-content/uploads/2026/10/IV5A3301-scaled-7d66e0703cdeca63ce9ee0c6750fde5a.jpg?w=940",
  miles: 72000,
  archiveId: "3fba8455-b133-49d6-9de9-fa9327ba2e8c"
});
// The photos of the demonstration car: the first six pictures of the car's own listing, each read with the photo rule (lib/live/photoRule.js: a HEAD, 200, an image, at most 600 KB, 940 pixels wide) on Nov 10 2026 for this one car only. The first is the cover. Every record carries the listing it came from.
export const DEMO_PHOTO_LIST = Object.freeze([
  { id: "ph_1", name: "listing-1.jpg", url: "https://bringatrailer.com/wp-content/uploads/2026/10/IV5A3301-scaled-7d66e0703cdeca63ce9ee0c6750fde5a.jpg?w=940", bytes: 86595 },
  { id: "ph_2", name: "listing-2.jpg", url: "https://bringatrailer.com/wp-content/uploads/2026/10/IV5A3183-scaled-43321ceb98d12a591b398cfbfd9c25ef.jpg?w=940", bytes: 103638 },
  { id: "ph_3", name: "listing-3.jpg", url: "https://bringatrailer.com/wp-content/uploads/2026/10/IV5A3182-scaled-fc6b197da8997d5eb7283a378c4508de.jpg?w=940", bytes: 107387 },
  { id: "ph_4", name: "listing-4.jpg", url: "https://bringatrailer.com/wp-content/uploads/2026/10/IV5A3179-scaled-d12ee49dcc43c94dede97a92f043b73a.jpg?w=940", bytes: 100042 },
  { id: "ph_5", name: "listing-5.jpg", url: "https://bringatrailer.com/wp-content/uploads/2026/10/IV5A3176-scaled-b873cd3b0470de944142ae8a079d3183.jpg?w=940", bytes: 93798 },
  { id: "ph_6", name: "listing-6.jpg", url: "https://bringatrailer.com/wp-content/uploads/2026/10/IV5A3247-scaled-bbf91ac936ce733b1b6f648d3c3eac11.jpg?w=940", bytes: 96837 }
].map(p => Object.freeze({ ...p, from: DEMO_CAR.listingUrl, credit: "Photo from the Bring a Trailer listing of this car, " + DEMO_CAR.listingUrl })));
export const DEMO_VIN = DEMO_CAR.vin, DEMO_MILES = DEMO_CAR.miles;
// The live rung read of the 996 at the case's 72,000 miles (manual coupe, Lane D, Nov 10 2026, ops task deskrungs). Recorded here so a check can hold the walkthrough to the live archive; the page computes nothing from it.
export const DEMO_RUNGS = Object.freeze({ readOn: "2026-11-10", miles: 72000, any: { count: 39, q1: 27460, median: 32500, q3: 38300 }, excellent: { count: 5, q1: 36500, median: 38600, q3: 40500 }, good: { count: 6, q1: 30138, median: 35748, q3: 36749 }, fairCount: 3 });
