// THE CAR TOKEN (Lane B, Nov 17 2026): one resolved car travels between Find, Market Check, Sell, the Tasks composer and the VIN page with no second resolve.
// encodeCar(resolved) returns a short, url safe, versioned token; decodeCar(token) returns the same object, or null. The object is what the resolver already produces for a car (lib/vehicle.js sanitizeResolvedVehicle) plus the two words a tool may hold beside it
// (transmission, generation); nothing is computed here, nothing is invented. Format: "v1." + base64url(deflateRaw(JSON of short keys)) + "." + 8 characters of checksum. A token that is not v1, was cut, edited or built from anything else decodes to null: never a wrong car.
// The checksum guards against a mangled or hand-edited link, it is not a secret: anyone can make a token for a car they name (that is what a link is). A decoded object is validated field by field (types, lengths, the VIN shape), so a crafted token can only name a car.
import zlib from "node:zlib";
import crypto from "node:crypto";
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
  for (const [field, key, type] of CAR_FIELDS) { const v = resolved[field]; if (v === undefined) continue; if (!valid(type, v)) return null; out[key] = v; }
  if (typeof out.mk !== "string" || !out.mk || typeof out.md !== "string" || !out.md) return null;
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
    if (typeof car.make !== "string" || !car.make || typeof car.model !== "string" || !car.model) return null;
    return car;
  } catch { return null; }
}
// the token of a request: ?car=<token> in the query or "car" in a JSON body when it is a token string; null when absent or not decodable (the tool then behaves as it does today)
export function carFromRequest(req) {
  const q = req && req.query && typeof req.query.car === "string" ? req.query.car : null, b = req && req.body && typeof req.body === "object" && typeof req.body.car === "string" ? req.body.car : null;
  const t = q || b; return t ? decodeCar(t) : null;
}

// THE CAR'S WORDS (Lane B, Nov 17 2026), built here beside encodeCar and nowhere else: line is the whole line the car bar prints ("2003 Mercedes-Benz SL-Class SL500 \u00b7 38,400 miles \u00b7 VIN ...4627", the mileage and the VIN only when the car carries them),
// short is the name "Back to your 2003 SL500" uses, label is the car's search words (the tool's own input). Every answer that carries car.token carries car.line and car.short from this function; a page prints them as sent and builds no wording.
const nf = n => Number(n).toLocaleString("en-US");
export function carWords(car) {
  if (!car || typeof car !== "object") return null;
  const label = String(car.canonicalLabel || [car.year, car.make, car.model, car.trim].filter(x => x != null && x !== "").join(" ")).replace(/\s+/g, " ").trim();
  if (!label) return null;
  const parts = [label]; if (Number(car.mileage) > 0) parts.push(nf(car.mileage) + " miles"); if (car.vin) parts.push("VIN ..." + String(car.vin).slice(-4));
  return { label, line: parts.join(" \u00b7 "), short: [car.year, car.trim || car.model].filter(Boolean).join(" ") || label };
}
// the token and its words together, for an answer: { token, line, short } from the car as the token holds it (decoded back, so the words are those of the car the token opens), or null
export function carStamp(car) {
  const token = encodeCar(car); if (!token) return null;
  const w = carWords(decodeCar(token)); return w ? { token, line: w.line, short: w.short } : null;
}
