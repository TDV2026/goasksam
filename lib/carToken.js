// THE CAR TOKEN (Lane B, Nov 17 2026): one resolved car travels between Find, Market Check, Sell, the Tasks composer and the VIN page with no second resolve.
// encodeCar(resolved) returns a short, url safe, versioned token; decodeCar(token) returns the same object, or null. The object is what the resolver already produces for a car (lib/vehicle.js sanitizeResolvedVehicle) plus the two words a tool may hold beside it
// (transmission, generation); nothing is computed here, nothing is invented. Format: "v1." + base64url(deflateRaw(JSON of short keys)) + "." + 8 characters of checksum. A token that is not v1, was cut, edited or built from anything else decodes to null: never a wrong car.
// The checksum guards against a mangled or hand-edited link, it is not a secret: anyone can make a token for a car they name (that is what a link is). A decoded object is validated field by field (types, lengths, the VIN shape), so a crafted token can only name a car.
import zlib from "node:zlib";
import crypto from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";
import { isCrewRequest } from "./_crew.js";
import { statedMiles } from "./placeholderMiles.js";   // a filler mileage (999,999, 0, 11111) is no stated mileage: no page, title or car line prints it (Lane B, Nov 20 2026)
export const TOKEN_VERSION = "v1";
export const CAR_FIELDS = [   // [field, short key, type]; the field list of the contract (docs/lane-notes.md)
  ["raw", "r", "s"], ["year", "y", "n"], ["make", "mk", "s"], ["model", "md", "s"], ["trim", "t", "s"], ["coachbuilder", "cb", "s"], ["yearRange", "yr", "range"], ["color", "c", "s"], ["mileage", "mi", "n"],
  ["bodyStyle", "b", "s"], ["marketSpec", "ms", "s"], ["marketSpecLabel", "ml", "s"], ["marketSpecShort", "mh", "s"], ["wheelbase", "wb", "s"], ["trimNumber", "tn", "s"], ["edition", "ed", "s"], ["variant", "va", "s"], ["series", "se", "s"],
  ["modifications", "mo", "list"], ["vin", "v", "vin"], ["chassis", "ch", "s"], ["confidence", "cf", "conf"], ["unverified", "uv", "bool"], ["canonicalLabel", "cl", "s"], ["transmission", "tx", "s"], ["generation", "g", "s"]
];
const BY_FIELD = new Map(CAR_FIELDS.map(f => [f[0], f])), BY_KEY = new Map(CAR_FIELDS.map(f => [f[1], f]));
const MAX_TOKEN = 3000, MAX_JSON = 6000, MAX_STR = 400;
const b64u = buf => Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64u = s => Buffer.from(String(s).replace(/-/g, "+").replace(/_/g, "/"), "base64");
const sum = payload => b64u(crypto.createHash("sha256").update(`${TOKEN_VERSION}.${payload}`).digest()).slice(0, 8);
const valid = (type, v) => {
  if (v === null) return true;
  switch (type) {
    case "s": return typeof v === "string" && v.length <= MAX_STR;
    case "n": return typeof v === "number" && Number.isFinite(v) && v >= 0 && v < 1e9;
    case "bool": return v === true;
    case "conf": return v === "high" || v === "medium" || v === "low";
    case "vin": return typeof v === "string" && /^[A-HJ-NPR-Z0-9]{17}$/.test(v);
    case "list": return Array.isArray(v) && v.length <= 6 && v.every(x => typeof x === "string" && x.length <= MAX_STR);
    case "range": return !!v && typeof v === "object" && !Array.isArray(v) && Object.keys(v).sort().join() === "end,start" && Number.isFinite(v.start) && Number.isFinite(v.end);
    default: return false;
  }
};
export function encodeCar(resolved) {
  if (!resolved || typeof resolved !== "object" || Array.isArray(resolved)) return null;
  const out = {};
  for (const [field, key, type] of CAR_FIELDS) { let v = resolved[field]; if (v === undefined) continue; if (field === "yearRange" && v && typeof v === "object" && !Array.isArray(v) && Number.isFinite(v.start) && Number.isFinite(v.end)) v = { start: v.start, end: v.end }; if (!valid(type, v)) return null; out[key] = v; }
  // A PARTIAL CAR (Sam's rule, Nov 17 2026): a make and whichever of year, year range and mileage were given, and NO model (a model that is empty or null is left out, never invented). A car with no make has no token.
  if (out.md === null || out.md === "") delete out.md;
  if (typeof out.mk !== "string" || !out.mk || (out.md !== undefined && (typeof out.md !== "string" || !out.md))) return null;
  if (out.md === undefined) for (const k of ["t", "cb", "b", "ms", "ml", "mh", "wb", "tn", "ed", "va", "se", "g", "cl"]) if (out[k] != null && out[k] !== "") return null;   // a partial car carries no trim, body, edition, variant or generation: those belong to a model
  const payload = b64u(zlib.deflateRawSync(Buffer.from(JSON.stringify(out), "utf8"), { level: 9 }));
  return `${TOKEN_VERSION}.${payload}.${sum(payload)}`;
}
export function decodeCar(token) {
  try {
    if (typeof token !== "string" || token.length > MAX_TOKEN) return null;
    const parts = token.split("."); if (parts.length !== 3 || parts[0] !== TOKEN_VERSION || !/^[A-Za-z0-9_-]+$/.test(parts[1]) || parts[2] !== sum(parts[1])) return null;
    const json = zlib.inflateRawSync(unb64u(parts[1]), { maxOutputLength: MAX_JSON }).toString("utf8"), o = JSON.parse(json);
    if (!o || typeof o !== "object" || Array.isArray(o)) return null;
    const car = {};
    for (const [key, v] of Object.entries(o)) { const f = BY_KEY.get(key); if (!f || !valid(f[2], v)) return null; car[f[0]] = v; }
    if (typeof car.make !== "string" || !car.make) return null;
    if (car.model !== undefined && (typeof car.model !== "string" || !car.model)) return null;   // a partial car has no model at all (never an empty one)
    return car;
  } catch { return null; }
}
// a partial car: a make with no model (decodeCar returns it as { make, year?, yearRange?, mileage?, raw? }); nothing in it names a model
export const isPartialCar = car => !!(car && typeof car === "object" && typeof car.make === "string" && car.make && !car.model);
// the partial car a resolver vehicle holds: a make and no model; only what was given (year, year range, mileage, the typed words), never a model. null for a full car or for no make.
export function partialOf(v) {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null; const make = typeof v.make === "string" ? v.make.trim() : ""; if (!make || (typeof v.model === "string" && v.model.trim())) return null;
  const y = Number(v.year), r = v.yearRange, out = { make };
  if (typeof v.raw === "string" && v.raw.trim()) out.raw = v.raw.trim().slice(0, 200);
  if (Number.isFinite(y) && y >= 1885 && y <= 2100) out.year = y; else if (r && Number.isFinite(Number(r.start)) && Number.isFinite(Number(r.end))) out.yearRange = { start: Number(r.start), end: Number(r.end) };
  if (statedMiles(v.mileage)) out.mileage = statedMiles(v.mileage);
  return out;
}
// the years of a partial car in words: "2009", "1960s" (a whole decade), "1960 to 1965", or ""
export function yearsWords(car) {
  if (!car) return ""; if (Number(car.year) > 0) return String(car.year);
  const r = car.yearRange; if (r && Number.isFinite(r.start) && Number.isFinite(r.end)) return r.start % 10 === 0 && r.end === r.start + 9 ? `${r.start}s` : r.start === r.end ? String(r.start) : `${r.start} to ${r.end}`;
  return "";
}
// the token of a request: ?car=<token> in the query or "car" in a JSON body when it is a token string; null when absent or not decodable (the tool then behaves as it does today)
// THE PARTIAL CAR IS PUBLIC (Sam's word, Nov 17 2026, after the crew only push d222b276; Lane C): a car with a make and no model (a token, the model choice, the bar for "2009 BMW") is served to the crew. PARTIAL_CAR_PUBLIC is the one switch, beside CAR_BAR_PUBLIC in lib/carBar.js
// (re-exported there); off, a visitor's request reads a partial token as no token and the typed "2009 BMW" takes the road it took before (the title read, no model choice, no partial car in any answer).
export const PARTIAL_CAR_PUBLIC = true;
export const partialCarOk = req => PARTIAL_CAR_PUBLIC || !!(req && req.headers && isCrewRequest(req) === true);
// the engine has no request: a handler runs its work inside withPartialCar(req, fn), and the engine asks partialCarActive() before it stamps or serves a partial car. Outside a handler (a warm job, a script) nothing is active: a partial car is never stamped.
const PARTIAL_CTX = new AsyncLocalStorage();
export const withPartialCar = (req, fn) => PARTIAL_CTX.run(partialCarOk(req), fn);
export const partialCarActive = () => PARTIAL_CAR_PUBLIC || PARTIAL_CTX.getStore() === true;
export function carFromRequest(req) {
  const q = req && req.query && typeof req.query.car === "string" ? req.query.car : null, b = req && req.body && typeof req.body === "object" && typeof req.body.car === "string" ? req.body.car : null;
  const t = q || b, c = t ? decodeCar(t) : null; return c && isPartialCar(c) && !partialCarOk(req) ? null : c;
}

// THE CAR'S WORDS (Lane B, Nov 17 2026), built here beside encodeCar and nowhere else: line is the whole line the car bar prints ("2003 Mercedes-Benz SL-Class SL500 \u00b7 38,400 miles \u00b7 VIN ...4627", the mileage and the VIN only when the car carries them),
// short is the name "Back to your 2003 SL500" uses, label is the car's search words (the tool's own input). Every answer that carries car.token carries car.line and car.short from this function; a page prints them as sent and builds no wording.
const nf = n => Number(n).toLocaleString("en-US");
export function carWords(car) {
  if (!car || typeof car !== "object") return null;
  if (isPartialCar(car)) {   // "2009 BMW", "BMW", "1960s Porsche"; the typed mileage goes with the words as it does for a full car
    const name = [yearsWords(car), car.make].filter(Boolean).join(" "), mi = statedMiles(car.mileage) > 0;
    return { label: mi ? `${name} ${nf(statedMiles(car.mileage))} miles` : name, line: mi ? `${name} \u00b7 ${nf(statedMiles(car.mileage))} miles` : name, short: name };
  }
  const label = String(car.canonicalLabel || [car.year, car.make, car.model, car.trim].filter(x => x != null && x !== "").join(" ")).replace(/\s+/g, " ").trim();
  if (!label) return null;
  const parts = [label]; if (statedMiles(car.mileage)) parts.push(nf(statedMiles(car.mileage)) + " miles"); if (car.vin) parts.push("VIN ..." + String(car.vin).slice(-4));
  // label is the car's search words, the words a tool's address and box carry: the typed mileage goes with them ("... SL500 38,400 miles"), so Sell, Market Check, Find and the Tasks composer opened from the car bar keep it (the address is read again on a reload and by every later call that sends words)
  const words = statedMiles(car.mileage) ? `${label} ${nf(statedMiles(car.mileage))} miles` : label;
  return { label: words, line: parts.join(" \u00b7 "), short: [car.year, car.trim || car.model].filter(Boolean).join(" ") || label };
}
// the token and its words together, for an answer: { token, line, short } from the car as the token holds it (decoded back, so the words are those of the car the token opens), or null
export function carStamp(car) {
  const token = encodeCar(car); if (!token) return null;
  const w = carWords(decodeCar(token)); return w ? { token, line: w.line, short: w.short } : null;
}
