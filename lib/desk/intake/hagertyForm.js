// THE HAGERTY MARKETPLACE "TELL US ABOUT YOUR VEHICLE" FORM, READ FROM A FORWARDED EMAIL (Lane D, Nov 11 2026). The forwarded email carries each answer as a label and then its value (the value on the label's line after a colon, or on the next line); the free text answers run to the next label.
// Pure: text in, answers out; nothing is computed except reading the words (a yes or no, a number, a unit). Returns null when the email is not this form (a plain email, a social media lead), so every other lead parses as it did. Every answer is the SELLER's words; none is verified here.
import { classifyVin } from "./parse.js";

// label -> key, longest first. Labels are matched at the start of a line, ignoring case, a trailing question mark and a colon.
const LABELS = [
  ["reserve", /^would you like to request a reserve\b/i],
  ["flaws", /^tell us about any known flaws and imperfections\b/i],
  ["upgrades", /^describe what has been replaced or upgraded\b/i],
  ["special", /^what makes your car special\b/i],
  ["mileageOriginal", /^do you believe the mileage is original\b/i],
  ["forSaleElsewhere", /^is this vehicle for sale anywhere else\b/i],
  ["titleOwn", /^(?:is the |is this |was the )?(?:vehicle |car )?titled in your name\b|^is the title in your name\b|^(?:is the )?title in your name\b/i],
  ["titleStatus", /^title status\b/i],
  ["vinOrChassis", /^vin or chassis number\b/i],
  ["odometerUnit", /^odometer (?:unit|reading unit)\b|^unit of (?:measure|measurement)\b/i],
  ["odometer", /^odometer reading\b/i],
  ["subModel", /^sub-?\s?model\b/i],
  ["model", /^model\b(?!\s*year)/i],
  ["make", /^make\b/i],
  ["year", /^year\b/i],
  ["city", /^city\b/i],
  ["state", /^state\b/i],
  ["zip", /^zip(?:\s*code)?\b|^postal code\b/i]
];
const FREE = new Set(["special", "flaws", "upgrades"]);
const STOP = /^(?:--\s*$|-{3,}|_{3,}|from:|sent:|to:|subject:|on .{3,80} wrote:)/i;
const yn = v => { const t = String(v || "").trim().toLowerCase(); return /^y(es)?\b/.test(t) ? true : /^n(o)?\b/.test(t) ? false : null; };
const KM_TO_MI = 0.621371;

export function parseHagertyForm(text) {
  const lines = String(text || "").replace(/\r/g, "").split("\n").map(l => l.replace(/^[\s>]+/, "").replace(/\*+/g, "").trim());
  const got = {}; let cur = null, started = false;
  for (const line of lines) {
    if (started && STOP.test(line) && !LABELS.some(([, re]) => re.test(line))) { if (/^(?:from:|sent:|on .{3,80} wrote:|--)/i.test(line)) break; }
    let hit = null; for (const [key, re] of LABELS) { const m = re.exec(line); if (m) { hit = { key, rest: line.slice(m[0].length).replace(/^\s*[?:\-]*\s*/, "") }; break; } }
    if (hit) { cur = hit.key; if (!(cur in got)) got[cur] = []; if (hit.rest) got[cur].push(hit.rest); started = true; continue; }
    if (!cur) continue;
    if (!line) { if (!FREE.has(cur) && got[cur].length) cur = null; continue; }
    if (FREE.has(cur) || !got[cur].length) got[cur].push(line); else cur = null;
  }
  const keys = Object.keys(got).filter(k => got[k].length);
  if (keys.length < 5 || !keys.some(k => ["special", "upgrades", "flaws", "subModel", "odometer", "reserve", "mileageOriginal", "forSaleElsewhere"].includes(k))) return null;
  const one = k => (got[k] && got[k][0] ? String(got[k][0]).trim() : null), many = k => (got[k] && got[k].length ? got[k].join("\n").trim() : null);
  // the odometer: a number and a unit, the unit on the value or on its own line (kilometres are named kilometres, never taken for miles)
  const od = one("odometer"), digits = od ? Number(String(od).replace(/[^\d.]/g, "")) : NaN, unitWord = `${one("odometerUnit") || ""} ${od || ""}`, unit = /\bkm\b|kilomet/i.test(unitWord) ? "km" : "miles";
  const odometer = Number.isFinite(digits) && digits > 0 ? { value: Math.round(digits), unit, miles: unit === "km" ? Math.round(digits * KM_TO_MI) : Math.round(digits) } : null;
  // VIN or chassis number: a string that passes the VIN structure is a VIN, any other is the chassis number as typed
  const vc = one("vinOrChassis"), vinWord = vc ? vc.toUpperCase().replace(/[^A-Z0-9]/g, "") : "", isVin = vinWord.length === 17 && classifyVin(vinWord).state !== "rejected";
  const rv = one("reserve"), reserve = rv ? (/not sure|unsure|maybe|don'?t know/i.test(rv) ? "not_sure" : /^y/i.test(rv) ? "yes" : /^n/i.test(rv) ? "no" : null) : null;
  const upgrades = many("upgrades");
  return {
    year: one("year") && /^\d{4}$/.test(one("year")) ? Number(one("year")) : null, make: one("make"), model: one("model"), subModel: one("subModel"),
    odometer, vin: isVin ? vinWord : null, chassis: vc && !isVin ? vc : null,
    mileageOriginal: yn(one("mileageOriginal")), forSaleElsewhere: yn(one("forSaleElsewhere")), titleInOwnName: yn(one("titleOwn")), titleStatus: one("titleStatus"),
    city: one("city"), state: one("state"), zip: one("zip"),
    reserve, special: many("special"), flaws: many("flaws"), upgrades,
    modified: upgrades && /\S/.test(upgrades) ? true : null,
    carWords: [one("year"), one("make"), one("model"), one("subModel")].filter(Boolean).join(" ") || null
  };
}
