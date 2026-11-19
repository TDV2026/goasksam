// NUMBER PHRASES ARE SET ASIDE BEFORE THE CAR IS READ (Lane B, lane-b-mileage-model, Nov 16 2026).
// "2003 Mercedes-Benz SL500 38,400" came out as a Mercedes "400" and "1999 Porsche Boxster 45,911 miles" as a Porsche 911: normalize() turns the comma into a space, so the
// tail of a grouped number is a word, and the model readers scan the typed text before the mileage is taken out. One rule, read at the entry of the shared resolver
// (lib/vehicle.js resolveVehicle): a mileage phrase (38,400 miles, 38400 mi, 38.4k, 38k miles, 62,000 km), a price phrase ($18,000, under 60k) and a grouped number
// (38,400) leave the text BEFORE any make or model reader sees it. A fragment of a grouped number is never a model. The mileage is returned and put back on the car as mileage.
// A bare number with no unit, no comma group, no $ and no k ("500", "911", "2002") is NEVER touched: it is a model the person typed, and a typed model beats a bare number.
const NUM = String.raw`(?:\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)`;
const EDGE = String.raw`(?<![A-Za-z0-9.,$])`;
const MILE_UNIT = String.raw`(?:miles?|mi|mileage)`;
const KM_UNIT = String.raw`(?:kms?|kilomet(?:er|re)s?)`;
const END = String.raw`(?![A-Za-z0-9])`;
// a price: a dollar sign, or a price cue before a number carrying a k, a comma group or five digits ("under 60k", "around 18,000"; "under 500" is left alone: it may be a model)
const CUE = String.raw`(?:under|over|below|above|up to|upto|max(?:imum)?|budget(?: of)?|less than|more than|around|about|at most|at least|no more than)`;
// the cue word before a dollar price ("budget $45,911", "up to $45k") is part of the price phrase (lane-b-notice: it was left behind and named "unused")
const PRICE_DOLLAR = new RegExp(String.raw`(?:\b${CUE}\s+)?\$\s*\d[\d,]*(?:\.\d+)?\s*(?:k|m)?${END}`, "gi");
const PRICE_CUE = new RegExp(String.raw`\b${CUE}\s+(?:\d{1,3}(?:\.\d+)?\s*k|\d{1,3}(?:,\d{3})+|\d{5,})${END}`, "gi");
const MILEAGE_UNIT_RE = new RegExp(String.raw`${EDGE}(${NUM})\s*(k)?[\s-]*(?:(${MILE_UNIT})|(${KM_UNIT}))${END}`, "gi");
// "38.4k", "38k": a k after one or two digits (or a decimal). Three digits plus K is a model (the Mercedes 540K, 500K, 380K), never a mileage.
const BARE_K_RE = new RegExp(String.raw`${EDGE}(\d{1,2}(?:\.\d+)?|\d{1,3}\.\d+)k${END}`, "gi");
const GROUPED_RE = new RegExp(String.raw`${EDGE}(\d{1,3}(?:,\d{3})+)(?![A-Za-z0-9,]|\.\d)`, "g");
const toNum = s => Number(String(s).replace(/,/g, ""));

// returns { text, mileage, km, price, changed }: the words without the number phrases, the mileage in miles (null when none or when it was typed in km), the km typed, the price phrase typed
export function setAsideNumbers(input) {
  const original = String(input == null ? "" : input);
  // A PLUS IS A SPACE (lane-b-notice, Nov 17 2026): an address writes the spaces of typed words as plus signs ("38,400+miles", "under+60k", "62,000+km"); every phrase below is read on the words with spaces
  const spaced = original.replace(/\+/g, " ");
  let text = spaced, mileage = null, km = null, price = null;
  try {
    // prices first, so "under 60k" and "$18,000" are not read as a mileage
    text = text.replace(PRICE_DOLLAR, m => { if (price == null) price = m.trim(); return " "; });
    text = text.replace(PRICE_CUE, m => { if (price == null) price = m.trim(); return " "; });
    // a number with its unit: miles (32k miles, 38,400 miles, 8500 mi, 45 miles) or kilometres (62,000 km)
    text = text.replace(MILEAGE_UNIT_RE, (m, num, k, mi, kmu) => {
      let n = toNum(num); if (!Number.isFinite(n)) return m;
      if (k) n *= 1000;
      if (kmu) { if (km == null) km = n < 1000 && !k ? n * 1000 : Math.round(n); return " "; }
      if (n < 1000 && !k) n *= 1000;   // "45 miles" is 45,000: the bare-small-number-means-thousands rule the resolver has always had
      if (mileage == null) mileage = Math.round(n);
      return " ";
    });
    text = text.replace(BARE_K_RE, (m, num) => { const n = Math.round(toNum(num) * 1000); if (mileage == null && price == null && Number.isFinite(n)) mileage = n; return " "; });
    // a grouped number with nothing after it ("SL500 38,400"): never a model; the mileage when nothing else gave one
    text = text.replace(GROUPED_RE, (m, num) => { const n = toNum(num); if (mileage == null && price == null && Number.isFinite(n) && n >= 1000) mileage = n; return " "; });
  } catch { return { text: original, mileage: null, km: null, price: null, changed: false }; }
  text = text.replace(/\s+/g, " ").replace(/\s+([,;.])/g, "$1").trim();
  // nothing but number phrases typed: the words stay as typed (the resolver has its own answer for them)
  if (text === spaced.replace(/\s+/g, " ").trim() || !/[A-Za-z]{2,}|\d/.test(text)) return { text: original, mileage: null, km: null, price: null, changed: false };
  return { text, mileage, km, price, changed: true };
}
