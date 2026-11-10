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
export const DEMO_VIN = DEMO_CAR.vin, DEMO_MILES = DEMO_CAR.miles;
// The live rung read of the 996 at the case's 72,000 miles (manual coupe, Lane D, Nov 10 2026, ops task deskrungs). Recorded here so a check can hold the walkthrough to the live archive; the page computes nothing from it.
export const DEMO_RUNGS = Object.freeze({ readOn: "2026-11-10", miles: 72000, any: { count: 39, q1: 27460, median: 32500, q3: 38300 }, excellent: { count: 5, q1: 36500, median: 38600, q3: 40500 }, good: { count: 6, q1: 30138, median: 35748, q3: 36749 }, fairCount: 3 });
