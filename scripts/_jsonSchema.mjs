// A small JSON Schema (draft-04) validator, enough for Vercel's vercel.json schema (docs/vercel-json-schema.json): type, enum, const, pattern, minLength, maxLength, minimum, maximum (with exclusiveMinimum), minItems, maxItems, uniqueItems, items, additionalItems, minProperties, maxProperties, properties, patternProperties, additionalProperties, required, dependencies, oneOf, anyOf, allOf, not. No $ref (the schema has none). Returns a list of { path, msg }.
const typeOf = v => v === null ? "null" : Array.isArray(v) ? "array" : Number.isInteger(v) ? "integer" : typeof v;
const isType = (v, t) => t === "number" ? typeof v === "number" : t === "integer" ? Number.isInteger(v) : typeOf(v) === t || (t === "array" && Array.isArray(v));
export function validate(schema, value, path = "") {
  const errs = []; const e = m => errs.push({ path: path || "/", msg: m });
  if (schema === true || schema === undefined) return errs; if (schema === false) { e("not allowed"); return errs; }
  if (schema.type) { const ts = Array.isArray(schema.type) ? schema.type : [schema.type]; if (!ts.some(t => isType(value, t))) { e(`must be ${ts.join(" or ")}, is ${typeOf(value)}`); return errs; } }
  if (schema.enum && !schema.enum.some(x => JSON.stringify(x) === JSON.stringify(value))) e(`must be one of ${JSON.stringify(schema.enum).slice(0, 120)}`);
  if ("const" in schema && JSON.stringify(schema.const) !== JSON.stringify(value)) e(`must be ${JSON.stringify(schema.const)}`);
  if (typeof value === "string") {
    if (schema.maxLength !== undefined && value.length > schema.maxLength) e(`is ${value.length} characters, the most Vercel accepts is ${schema.maxLength}`);
    if (schema.minLength !== undefined && value.length < schema.minLength) e(`is ${value.length} characters, the least is ${schema.minLength}`);
    if (schema.pattern) { let re = null; try { re = new RegExp(schema.pattern); } catch {} if (re && !re.test(value)) e(`does not match the pattern ${schema.pattern.slice(0, 80)}`); }
  }
  if (typeof value === "number") {
    if (schema.minimum !== undefined && (schema.exclusiveMinimum === true ? value <= schema.minimum : value < schema.minimum)) e(`is ${value}, the least is ${schema.minimum}${schema.exclusiveMinimum === true ? " (exclusive)" : ""}`);
    if (typeof schema.exclusiveMinimum === "number" && value <= schema.exclusiveMinimum) e(`must be above ${schema.exclusiveMinimum}`);
    if (schema.maximum !== undefined && (schema.exclusiveMaximum === true ? value >= schema.maximum : value > schema.maximum)) e(`is ${value}, the most is ${schema.maximum}`);
  }
  if (Array.isArray(value)) {
    if (schema.maxItems !== undefined && value.length > schema.maxItems) e(`has ${value.length} items, the most is ${schema.maxItems}`);
    if (schema.minItems !== undefined && value.length < schema.minItems) e(`has ${value.length} items, the least is ${schema.minItems}`);
    if (schema.uniqueItems && new Set(value.map(x => JSON.stringify(x))).size !== value.length) e("items must be unique");
    if (Array.isArray(schema.items)) value.forEach((x, i) => { const s = i < schema.items.length ? schema.items[i] : schema.additionalItems; if (s !== undefined && s !== true) errs.push(...validate(s, x, `${path}/${i}`)); });
    else if (schema.items) value.forEach((x, i) => errs.push(...validate(schema.items, x, `${path}/${i}`)));
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const keys = Object.keys(value);
    if (schema.maxProperties !== undefined && keys.length > schema.maxProperties) e(`has ${keys.length} properties, the most is ${schema.maxProperties}`);
    if (schema.minProperties !== undefined && keys.length < schema.minProperties) e(`has ${keys.length} properties, the least is ${schema.minProperties}`);
    for (const r of schema.required || []) if (!(r in value)) e(`is missing "${r}"`);
    const pp = schema.patternProperties || {}, props = schema.properties || {};
    for (const k of keys) {
      let matched = false; const p = `${path}/${k}`;
      if (k in props) { matched = true; errs.push(...validate(props[k], value[k], p)); }
      for (const [pat, sub] of Object.entries(pp)) { let re = null; try { re = new RegExp(pat); } catch {} if (re && re.test(k)) { matched = true; errs.push(...validate(sub, value[k], p)); } }
      if (!matched) { if (schema.additionalProperties === false) errs.push({ path: p, msg: "is not a property Vercel knows here" }); else if (schema.additionalProperties && typeof schema.additionalProperties === "object") errs.push(...validate(schema.additionalProperties, value[k], p)); }
    }
    for (const [k, dep] of Object.entries(schema.dependencies || {})) if (k in value) { if (Array.isArray(dep)) { for (const d of dep) if (!(d in value)) e(`"${k}" needs "${d}"`); } else errs.push(...validate(dep, value, path)); }
  }
  if (schema.allOf) for (const s of schema.allOf) errs.push(...validate(s, value, path));
  if (schema.not && validate(schema.not, value, path).length === 0) e("matches a form that is not allowed");
  for (const kw of ["anyOf", "oneOf"]) if (schema[kw]) {
    const results = schema[kw].map(s => validate(s, value, path)), good = results.filter(r => r.length === 0).length;
    if (kw === "anyOf" ? good === 0 : good !== 1) { const best = results.slice().sort((a, b) => a.length - b.length)[0] || []; if (good === 0) errs.push(...(best.length ? best : [{ path: path || "/", msg: "matches none of the allowed forms" }])); else e("matches more than one of the allowed forms"); }
  }
  return errs;
}
