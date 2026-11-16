// THE HAGERTY MARKETPLACE "TELL US ABOUT YOUR VEHICLE" FORM, READ FROM A FORWARDED EMAIL (Lane D, Nov 11 2026). The forwarded email carries each answer as a label and then its value (the value on the label's line after a colon, or on the next line); the free text answers run to the next label.
// Pure: text in, answers out; nothing is computed except reading the words (a yes or no, a number, a unit). Returns null when the email is not this form (a plain email, a social media lead), so every other lead parses as it did. Every answer is the SELLER's words; none is verified here.
import { classifyVin } from "./parse.js";

// label -> key, longest first. Labels are matched at the start of a line, ignoring case, a trailing question mark and a colon.
// THE LABEL TABLE, WITH EVERY NAME A LABEL GOES BY (Lane D, Nov 15 2026; Lane C's forwarded lead with a plain label per line produced "Needs the car", no VIN and no seller: the parser knew only the form's own wording). One entry per answer, each with the words a forwarded email may use for it; a line is an answer when it starts with one of them, any case, with the value after a colon or on the next line. A label that is a prefix of another comes AFTER it. LABEL_WORDS below is the list printed for Sam.
export const LABEL_TABLE = [
  ["reserve", ["Would you like to request a reserve"]],
  ["flaws", ["Tell us about any known flaws and imperfections", "Known flaws and imperfections", "Known flaws", "Issues"]],
  ["upgrades", ["Describe what has been replaced or upgraded", "What has been replaced or upgraded", "Modifications", "Upgrades"]],
  ["special", ["What makes your car special"]],
  ["mileageOriginal", ["Do you believe the mileage is original"]],
  ["forSaleElsewhere", ["Is this vehicle for sale anywhere else"]],
  ["titleOwn", ["Is the vehicle titled in your name", "Is this vehicle titled in your name", "Is the title in your name", "Title in your name", "Vehicle titled in your name"]],
  ["titleStatus", ["Title status"]],
  ["vinOrChassis", ["VIN or chassis number", "VIN or chassis", "VIN", "Chassis number", "Chassis no", "Chassis"]],
  ["odometerUnit", ["Odometer unit", "Odometer reading unit", "Unit of measure", "Unit of measurement"]],
  ["odometer", ["Odometer reading", "Odometer", "Mileage", "Miles"]],
  ["subModel", ["Sub-model", "Submodel", "Trim"]],
  ["model", ["Model"]],
  ["make", ["Make"]],
  ["year", ["Vehicle year", "Year"]],
  ["transmission", ["Transmission", "Gearbox"]],
  ["interiorColour", ["Interior colour", "Interior color"]],
  ["exteriorColour", ["Exterior colour", "Exterior color", "Colour", "Color"]],
  ["body", ["Body style", "Body"]],
  ["city", ["City", "Location"]],
  ["state", ["State"]],
  ["zip", ["Zip code", "Zip", "Postal code"]],
  ["asking", ["Asking price", "Expected price", "Asking", "Price"]],
  ["description", ["Describe your car", "Tell us about the car", "Description"]],
  ["documentation", ["Documentation", "Documents", "Records"]],
  ["sellerEmail", ["Seller e-mail", "Seller email", "E-mail address", "Email address", "E-mail", "Email"]],
  ["sellerPhone", ["Seller phone", "Phone number", "Telephone", "Phone", "Mobile"]],
  ["sellerName", ["Seller name", "Your name", "Seller", "Name"]]   // the seller's contact lines: each ends the answer before it and lands on seller.name, seller.email and seller.phone
];
const reOf = words => new RegExp("^(?:" + words.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/-/g, "-?").replace(/ /g, "\\s+").replace(/e-\?mail/gi, "e-?mail").replace(/colour/gi, "colou?r").replace(/color/gi, "colou?r")).join("|") + ")\\b", "i");
const LABELS = LABEL_TABLE.map(([key, words]) => [key, key === "model" ? /^model\b(?!\s*year)/i : reOf(words)]);
export const LABEL_WORDS = Object.fromEntries(LABEL_TABLE);
// THE ONE-LINE SHAPE (Nov 13 2026): some mail clients flatten the form to a single line ("Year: 1972 Make: Datsun Model: 240Z ... Seller phone: 555 0100"). A line that carries TWO OR MORE "label:" tokens is cut before each token, so the lines below read it exactly as the one-per-line form. A line with one token, or none, is never cut.
const SHORT_L = "year|make|model|sub-?\\s?model|city|state|zip(?:\\s*code)?|postal code|odometer reading|odometer (?:unit|reading unit)|unit of (?:measure|measurement)|vin or chassis number|title status|seller (?:name|e-?mail|phone)", LONG_L = "would you like to request a reserve|do you believe the mileage is original|is this vehicle for sale anywhere else|is the vehicle titled in your name|is this vehicle titled in your name|is the title in your name|what makes your car special|tell us about any known flaws and imperfections|describe what has been replaced or upgraded";
const INLINE = new RegExp(`(?<![\\w-])(?:${SHORT_L})\\s*[?:]|(?<![\\w-])(?:${LONG_L})(?:,\\s*if anything)?\\s*[?:.]`, "gi");   // a short label needs its colon; a long label is unmistakable and takes a question mark, a colon or a full stop
export const splitInline = line => { const at = [...String(line).matchAll(INLINE)].map(m => m.index).filter(i => i > 0); if (!at.length) return [line]; const cuts = [0, ...at, line.length]; return cuts.slice(0, -1).map((c, i) => line.slice(c, cuts[i + 1]).trim()).filter(Boolean); };   // EVERY LABEL IS A BOUNDARY WHEREVER IT SITS IN THE LINE (Nov 13 2026, Sam's resend: "Not sure Seller name: Jason Orange" ran the reserve answer into the next label)
// THE LABEL'S OWN TAIL belongs to the label, never to the answer: a question mark, a colon, a full stop, a dash, and ", if anything." (Nov 13 2026)
const TAIL = /^\s*(?:,\s*if anything\b)?\s*[?:.!\-]*\s*/i;
const FREE = new Set(["special", "flaws", "upgrades", "description", "documentation"]);
const STOP = /^(?:--\s*$|-{3,}|_{3,}|from:|sent:|to:|subject:|on .{3,80} wrote:)/i;
const yn = v => { const t = String(v || "").trim().toLowerCase(); return /^y(es)?\b/.test(t) ? true : /^n(o)?\b/.test(t) ? false : null; };
const KM_TO_MI = 0.621371;

export function parseHagertyForm(text) {
  const lines = String(text || "").replace(/\r/g, "").replace(/\[[^\]\n]{1,160}\.(?:png|jpe?g|heic|webp|gif|pdf)\]/gi, "")   /* an attachment marker the mail client leaves in the body ("[Screenshot 1.png]") is not an answer */.split("\n").map(l => l.replace(/^[\s>]+/, "").replace(/\*+/g, "").trim()).flatMap(splitInline);
  const got = {}; let cur = null, started = false;
  for (const line of lines) {
    if (started && STOP.test(line) && !LABELS.some(([, re]) => re.test(line))) { if (/^(?:from:|sent:|on .{3,80} wrote:|--)/i.test(line)) break; }
    let hit = null; for (const [key, re] of LABELS) { const m = re.exec(line); if (m) { hit = { key, rest: line.slice(m[0].length).replace(TAIL, "") }; break; } }
    if (hit) { cur = hit.key; if (!(cur in got)) got[cur] = []; if (hit.rest) got[cur].push(hit.rest); started = true; continue; }
    if (!cur) continue;
    if (!line) { if (!FREE.has(cur) && got[cur].length) cur = null; continue; }
    if (FREE.has(cur) || !got[cur].length) got[cur].push(line); else cur = null;
  }
  const keys = Object.keys(got).filter(k => !k.startsWith("_") && got[k].length);
  // A FORM IS RECOGNISED by what it asks: five answers one of which is the form's own kind (a free text answer, a sub-model, an odometer, the reserve questions), or a plain label-per-line lead with five answers one of which names the car (a VIN or chassis, a year, a make or a model), or three answers of which two name the car. Every other email parses as it did.
  const CAR = ["vinOrChassis", "year", "make", "model"], carKeys = keys.filter(k => CAR.includes(k)).length;
  if (!((keys.length >= 5 && (carKeys >= 1 || keys.some(k => ["special", "upgrades", "flaws", "subModel", "odometer", "reserve", "mileageOriginal", "forSaleElsewhere"].includes(k)))) || (keys.length >= 3 && carKeys >= 2))) return null;
  const NOTHING = /^(?:n\/?a|none|not given|not provided|unknown|tbc|tbd|nil|-+|\?+)$/i;
  const one = k => (got[k] && got[k][0] && !NOTHING.test(String(got[k][0]).trim()) ? String(got[k][0]).trim() : null), many = k => (got[k] && got[k].length ? got[k].join("\n").trim() : null);
  // the odometer: a number and a unit, the unit on the value or on its own line (kilometres are named kilometres, never taken for miles)
  const od = one("odometer"), digits = od ? Number(String(od).replace(/[^\d.]/g, "")) : NaN, unitWord = `${one("odometerUnit") || ""} ${od || ""}`, unit = /\bkm\b|kilomet/i.test(unitWord) ? "km" : "miles";
  const odometer = Number.isFinite(digits) && digits > 0 ? { value: Math.round(digits), unit, miles: unit === "km" ? Math.round(digits * KM_TO_MI) : Math.round(digits) } : null;
  // VIN or chassis number: a string that passes the VIN structure is a VIN, any other is the chassis number as typed
  const vc = one("vinOrChassis"), vinWord = vc ? (/(?<![A-Z0-9])[A-HJ-NPR-Z0-9]{17}(?![A-Z0-9])/.exec(vc.toUpperCase().replace(/[\s-]+/g, "")) || [vc.toUpperCase().replace(/[^A-Z0-9]/g, "")])[0] : "", isVin = vinWord.length === 17 && classifyVin(vinWord).state !== "rejected";
  const rv = one("reserve"), reserve = rv ? (/not sure|unsure|maybe|don'?t know/i.test(rv) ? "not_sure" : /^y/i.test(rv) ? "yes" : /^n/i.test(rv) ? "no" : null) : null;
  const upgrades = many("upgrades");
  const yr = one("year") ? /\b(19\d{2}|20[0-3]\d)\b/.exec(one("year")) : null, ask = one("asking") ? /(\d[\d,]*(?:\.\d+)?)\s*(k\b)?/i.exec(one("asking").replace(/\s+/g, " ")) : null, askN = ask ? Math.round(Number(ask[1].replace(/,/g, "")) * (ask[2] ? 1000 : 1)) : null;
  return {
    year: yr ? Number(yr[1]) : null, make: one("make"), model: one("model"), subModel: one("subModel"),
    odometer, vin: isVin ? vinWord : null, chassis: vc && !isVin ? vc : null, hasVinLine: !!vc,   // a VIN or chassis line always names the car: the 17 characters that pass the VIN structure are the VIN, any other string is the chassis as typed
    transmission: one("transmission"), body: one("body"), exteriorColour: one("exteriorColour"), interiorColour: one("interiorColour"),
    asking: Number.isFinite(askN) && askN >= 1000 && askN <= 20000000 ? askN : null, description: many("description"), documentation: many("documentation"),
    mileageOriginal: yn(one("mileageOriginal")), forSaleElsewhere: yn(one("forSaleElsewhere")), titleInOwnName: yn(one("titleOwn")), titleStatus: one("titleStatus"),
    city: one("city"), state: one("state"), zip: one("zip"),
    seller: { name: one("sellerName"), email: one("sellerEmail"), phone: one("sellerPhone") },
    reserve, special: many("special"), flaws: many("flaws"), upgrades,
    modified: upgrades && /\S/.test(upgrades) ? true : null,
    carWords: [one("year"), one("make"), one("model"), one("subModel")].filter(Boolean).join(" ") || null
  };
}
