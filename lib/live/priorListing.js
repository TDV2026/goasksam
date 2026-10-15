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
export function priorWords(apps) {
  return priorSold(apps)
    ? { button: "This car sold before", heading: "This car has sold before" }
    : { button: "This car was listed before", heading: "This car has been listed before" };
}
// Sam's Take under the history. Sold before: "Back after selling in March." (the latest earlier sale's month, with
// its year when that is not this year). Listed before only: "Back for the second time." (counting this listing).
// Either keeps the existing "now with N more miles" when the car's miles are up on its last appearance.
export function priorTake(apps, miles, now) {
  var list = (apps || []).filter(function (a) { return a && a.date; }).slice().sort(function (a, b) { return String(a.date).localeCompare(String(b.date)); });
  if (!list.length) return "";
  var ORD = ["", "first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth"];
  var MON = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  var last = list[list.length - 1], more = miles && last.miles && Number(miles) > Number(last.miles) ? Number(miles) - Number(last.miles) : 0;
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
