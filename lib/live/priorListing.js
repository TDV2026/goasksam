// PRIOR LISTINGS, ONE WORDING (Sam, Oct 15 2026): the same car's earlier appearances (VIN matched, from
// api/_historyData.js vinAppearances, the history hub's data) decide whether a card says the car SOLD before or
// was only LISTED before. "Sold" is said only when a record says it sold (result "sold"); a reserve not met, a
// withdrawal or an unknown result counts as not sold. The rows keep each listing's own outcome, so the heading and
// the rows never disagree.
// Self-contained on purpose (no imports, no outer names): the Buy client gets these exact functions written into
// its script (api/buy.js, __PRIOR__), and the server side (the Buy landing example) imports them, so one rule
// serves every surface. apps: the car's earlier appearances, each { date: "YYYY-MM-DD", result, miles }.
export function priorSold(apps) {
  return (apps || []).some(function (a) { return !!a && a.result === "sold"; });
}
// The card's button is an action that opens the earlier appearances (Sam, Oct 15 2026: it must not restate a fact the
// Sam note above it already gives): "See its earlier sale" when one sold ("sales" for more than one), else "See its
// earlier listing" ("listings"), so it never names a sale that did not happen. The popup heading states the fact.
export function priorWords(apps) {
  var list = (apps || []).filter(function (a) { return !!a; }), sold = list.filter(function (a) { return a.result === "sold"; }).length;
  return sold
    ? { button: sold > 1 ? "See its earlier sales" : "See its earlier sale", heading: "This car has sold before" }
    : { button: list.length > 1 ? "See its earlier listings" : "See its earlier listing", heading: "This car has been listed before" };
}
// Sam's Take under the history. Sold before: "Back after selling in March." (the latest earlier sale's month, with
// its year when that is not this year). Listed before only: "Back for the second time." (counting this listing).
// Either keeps the existing "now with N more miles" when the car's miles are up on its last appearance.
// A mileage nobody stated (lib/placeholderMiles.js statedMiles, the one rule; written out INSIDE this function because the Buy page gets this function's text and nothing else: scripts/forSalePlaceholderMilesCheck.mjs proves the copy agrees with it on every whole number to 600,000).   (This note is outside the function on purpose: the function's text is written into the page, comments included.)
export function priorTake(apps, miles, now) {
  function stated(v) {
    var n = typeof v === "number" ? v : Number(String(v == null ? "" : v).replace(/[^\d.\-]/g, ""));
    if (!isFinite(n) || n <= 1 || n > 500000) return null;
    var r = Math.round(n), t = String(r);
    if (t.length >= 4 && /^(\d)\1+$/.test(t)) return null;
    if ([1234, 2345, 3456, 4567, 5678, 6789, 4321, 5432, 6543, 7654, 8765, 9876, 12345, 123456, 1234567, 12345678, 54321, 654321, 7654321].indexOf(r) >= 0) return null;
    return r;
  }
  var list = (apps || []).filter(function (a) { return a && a.date; }).slice().sort(function (a, b) { return String(a.date).localeCompare(String(b.date)); });
  if (!list.length) return "";
  var ORD = ["", "first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth"];
  var MON = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  var last = list[list.length - 1], more = stated(miles) && stated(last.miles) && stated(miles) > stated(last.miles) ? stated(miles) - stated(last.miles) : 0;
  var tail = more ? ", now with " + String(Math.round(more)).replace(/\B(?=(\d{3})+(?!\d))/g, ",") + " more miles" : "";
  var sold = list.filter(function (a) { return a.result === "sold"; });
  if (sold.length) {
    var p = String(sold[sold.length - 1].date).split("-"), y = Number(p[0]), m = MON[Number(p[1]) - 1];
    if (!m) return "";
    var thisYear = (now ? new Date(now) : new Date()).getFullYear();
    return "Back after selling in " + m + (y && y !== thisYear ? " " + y : "") + tail + ".";
  }
  var times = list.length + 1;
  return ORD[times] ? "Back for the " + ORD[times] + " time" + tail + "." : "";
}
