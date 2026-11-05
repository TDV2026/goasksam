// A FIXTURE FOR THE CHECKS AND THE SCREENSHOTS ONLY (Lane E, Nov 5 2026). It stands in for Lane B's engine field featuredHistory so the layout and the gate can be exercised; it is imported by scripts only, never by anything the site serves, and its photos are generated stand-ins (data images),
// not photographs of a car. The served preview calls homeHtml() with nothing, so the section stays hidden until the engine's own field is read. Nothing here is a real car, price or date.
const pic = (label, a, b) => "data:image/svg+xml;base64," + Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="900" height="600" viewBox="0 0 900 600"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="900" height="600" fill="url(#g)"/><text x="40" y="560" font-family="Georgia,serif" font-size="34" fill="#fff" fill-opacity=".8">${label}</text></svg>`).toString("base64");
export const NOW = Date.parse("2026-11-05T12:00:00Z");
export const soldFixture = () => ({
  kind: "sold", headline: "This car has sold before. Would you have known?",
  current: { title: "2008 Porsche 911 Turbo", platform: "Sample Platform", url: "https://example.test/live/1", photo: pic("Sample photo, current auction", "#2c4a63", "#8aa3b8"), live: true, endsAt: "2026-11-08T18:00:00Z", mileage: 29000 },
  previous: { date: "May 2022", platform: "Sample Platform", mileage: 25000, price: 116000, photo: pic("Sample photo, earlier auction", "#3b3a36", "#9a9486"), url: "https://example.test/sold/1", historyUrl: "/vin/WP0AB29988S783456" },
  mileageWords: "4,000 more miles", take: "Back after selling in May 2022, now with 4,000 more miles.", selectedAt: "2026-11-05T09:00:00Z", checkedAt: "2026-11-05T11:30:00Z", findUrl: "/buy?q=2008%20Porsche%20911%20Turbo"
});
export const listedFixture = () => { const f = soldFixture(); f.kind = "listed"; f.headline = "This car has been listed before. Would you have known?"; f.previous = { ...f.previous, price: undefined, date: "March 2023" }; delete f.previous.price; delete f.mileageWords; f.take = "Listed in March 2023 with no confirmed sale, and back at auction now."; return f; };
// a car whose name carries no trim (the engine falls back to year, make and model, never an invented trim) and a car with no mileage line (mileageWords absent)
export const noTrimFixture = () => { const f = soldFixture(); f.current.title = "2008 Porsche 911"; f.findUrl = "/buy?q=2008%20Porsche%20911"; return f; };
export const noMileageWordsFixture = () => { const f = soldFixture(); delete f.mileageWords; f.take = "Back at auction after selling in May 2022."; return f; };
