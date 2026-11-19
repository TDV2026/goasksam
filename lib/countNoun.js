// The one place a count and its noun are joined (Oct 27 2026). A line that builds "One sales" or "1 cars" is a bug of one class:
// the count word was built and the noun was typed in the plural. Every line that joins a count to sale, car, listing, quarter,
// set aside or odd sale goes through this: count in, correct noun out, zero reads "No sales" (never "0 sales").
//   countNoun(n, "sale")                      -> "one sale" | "two sales" | "11 sales" | "no sales"
//   countNoun(n, "sale", { cap: true })       -> "One sale" | "No sales"
//   countNoun(n, "sale", { words: false })    -> "1 sale" | "8 sales"
//   countNoun(n, "sale", { num: "eight" })    -> the caller's own number text (kept when a surface has its own word table)
//   countNoun(n, "sale", { many: "sales" })   -> an irregular plural is passed in
// The function is self-contained on purpose: public/js/onebox.js carries a twin named obCount and scripts/countNounCheck.mjs fails
// if the two ever differ, so the server and the page cannot disagree.
export function countNoun(n, one, o) {
  o = o || {};
  var k = Math.round(Number(n)), many = o.many || one + "s", W = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"], out;
  if (!(k >= 1)) out = "no " + many;
  else {
    var num = o.num != null ? String(o.num) : (o.words === false || k > 10 ? k.toLocaleString("en-US") : W[k]);
    out = num + " " + (k === 1 ? one : many);
  }
  return o.cap ? out.charAt(0).toUpperCase() + out.slice(1) : out;
}
