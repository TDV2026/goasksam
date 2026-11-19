// DESK INTAKE: THE CAR'S PLAIN NAME (Lane D, Nov 5 2026). The VIN decode (NHTSA vPIC) names some cars with the maker's internal code instead of the
// model: a 2002 BMW M3 convertible (WBSBR93422EX21856) comes back as Model "M3Ci" ("Ci" is BMW's coupe/convertible suffix), a Porsche 911 comes back with
// trim "C2S", a Honda S2000 with trim "Base". An analyst must read the plain model and the body name ("2002 BMW M3 Convertible"). Pure; no network.
// The class: any decoded model or trim that is a code, and the body that the decoder reports in its own words ("Convertible/Cabriolet", "Cpe", "Sdn").
// It never invents: a code it does not know is left as the decoder gave it, and a body it cannot name is left off.

// BMW M cars carry a body suffix on the model: M3Ci (coupe/convertible), M3i, M3is, M5i, M6i ... The M model itself is the name.
const BMW_M_SUFFIX = /^(M[2-8])(Cic|Cis|Ci|is|ic|Ti|i|d)$/i;
// Porsche 911 trim codes the decoder uses -> the name the cars are sold under
const PORSCHE_TRIM_CODES = { C2: "Carrera", C4: "Carrera 4", C2S: "Carrera S", C4S: "Carrera 4S", TT: "Turbo", "TT S": "Turbo S", TTS: "Turbo S", GT3RS: "GT3 RS", GT2RS: "GT2 RS", T: "Targa", "C4 CAB": "Carrera 4 Cabriolet" };
// a trim that says nothing
const FILLER_TRIM = /^(base|base model|standard|std|not applicable|n\/a|unknown|none|null|0|-)$/i;
// body words as they arrive (vPIC BodyClass, short codes in titles) -> the one body name shown
const BODY_WORDS = [
  [/convertible|cabrio(let)?|\bcabrio\b|\bconv\b|\bdrophead\b|soft ?top/i, "Convertible"],
  [/roadster|\brdstr\b|\brds\b/i, "Roadster"],
  [/spy?der|spider/i, "Spyder"],
  [/targa/i, "Targa"],
  [/coupe|coupé|\bcpe\b|fastback/i, "Coupe"],
  [/sedan|saloon|\bsdn\b/i, "Sedan"],
  [/wagon|estate|\bwgn\b|touring/i, "Wagon"],
  [/hatchback|liftback|notchback|\bhbk\b/i, "Hatchback"]
];
export function bodyName(...texts) {
  const t = texts.filter(Boolean).join(" ");
  for (const [re, name] of BODY_WORDS) if (re.test(t)) return name;
  return null;
}
const hasBodyWord = s => BODY_WORDS.some(([re]) => re.test(String(s || "")));

// the decoder shouts the make ("HONDA", "MERCEDES-BENZ"); initialisms stay as they are
const INITIALISMS = new Set(["BMW", "GMC", "MG", "AC", "TVR", "AMC", "DKW", "NSU", "KTM"]);
export const prettyMake = m => { const t = String(m || "").trim(); return t && t === t.toUpperCase() ? t.split(/(?<=[\s-])/).map(w => { const k = w.trim().replace(/-$/, ""); return INITIALISMS.has(k) ? w : w.charAt(0) + w.slice(1).toLowerCase(); }).join("") : t; };

// { year, make, model, trim, body } as the decoder gave it -> the same, with a plain model, a real trim and one body name
export function plainCar(c) {
  if (!c) return c;
  let model = String(c.model || "").trim(), trim = c.trim == null ? null : String(c.trim).trim() || null;
  const make = prettyMake(c.make);
  let body = bodyName(c.body, c.bodyStyle);
  const m = model.match(BMW_M_SUFFIX);
  if (m && /^bmw$/i.test(make)) model = m[1].toUpperCase();   // the suffix does not say coupe or convertible; the decoder's body class does
  if (trim && FILLER_TRIM.test(trim)) trim = null;
  if (trim && /^porsche$/i.test(make)) { const k = trim.toUpperCase().replace(/\s+/g, " "); if (PORSCHE_TRIM_CODES[k]) trim = PORSCHE_TRIM_CODES[k]; }
  // a body word sitting in the trim or model is the body: it is not shown twice
  if (trim && !body && hasBodyWord(trim)) body = bodyName(trim);
  return { ...c, make, model, trim, body, bodyStyle: body ? body.toLowerCase() : c.bodyStyle || null };
}

// "2002 BMW M3 Convertible": year, make, model, trim, then the body unless the model or trim already says it
export function carLabel(c) {
  if (!c) return null;
  const p = plainCar(c);
  const parts = [p.year, p.make, p.model, p.trim].filter(Boolean).map(String);
  const rest = parts.slice(2).join(" ");
  const body = p.body && !new RegExp(`\\b${p.body}\\b`, "i").test(rest) && !(p.body === "Convertible" && /cabrio/i.test(rest)) ? p.body : null;
  return [...parts, body].filter(Boolean).join(" ");
}
