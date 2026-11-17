// THE CAR TOKEN, STUB (Lane S, Nov 2026). Lane B owns the real contract (docs/lane-notes.md, branch lane-b-car-token): the engine answer carries car.token and a decode that turns a
// token back into the car. That has not posted, so THIS FILE IS THE ONLY STUB: swap decodeCarToken (and nothing else) when the contract lands. The car bar and the pages never encode
// and never resolve: a page prints the answer's car.token, a target tool is given the token in the address and this decode hands the tool's own entry the words of the car.
//   stub token  "c1." + base64url(JSON { year, make, model, trim, miles, vin })
// decodeCarToken(token) -> { token, text, line, short, miles, vin } | null
//   text   what a tool's entry is filled with ("2003 Mercedes-Benz SL500 38,400 miles"; a VIN when only a VIN is known)
//   line   the car bar's one line ("2003 Mercedes-Benz SL500 · 38,400 miles · VIN ...4627", mileage and VIN only when known)
//   short  the words of the Back link ("2003 SL500")
export const CAR_TOKEN_PREFIX = "c1.";
const nf = n => Number(n).toLocaleString("en-US");
export function stubTokenFor(car) { return CAR_TOKEN_PREFIX + Buffer.from(JSON.stringify(car || {}), "utf8").toString("base64url"); }
export function decodeCarToken(token) {
  const t = String(token == null ? "" : token); if (!t.startsWith(CAR_TOKEN_PREFIX) || t.length > 2000) return null;
  let c; try { c = JSON.parse(Buffer.from(t.slice(CAR_TOKEN_PREFIX.length), "base64url").toString("utf8")); } catch { return null; }
  if (!c || typeof c !== "object") return null;
  const s = v => (v == null ? "" : String(v)).replace(/\s+/g, " ").trim().slice(0, 80), name = [s(c.year), s(c.make), s(c.model), s(c.trim)].filter(Boolean).join(" ");
  const miles = Number(c.miles) > 0 ? Number(c.miles) : null, vin = s(c.vin).toUpperCase();
  if (!name && !vin) return null;
  const parts = [name || ("VIN " + vin)]; if (miles) parts.push(nf(miles) + " miles"); if (vin && name) parts.push("VIN ..." + vin.slice(-4));
  return { token: t, text: [name || vin, miles ? nf(miles) + " miles" : ""].filter(Boolean).join(" "), line: parts.join(" · "), short: [s(c.year), s(c.model)].filter(Boolean).join(" ") || name || vin, miles, vin: vin || null };
}
// the address part: the value of ?car= when it is a token (Sell's own ?car= is plain words, so only a token counts)
export const carTokenOf = url => { try { const v = new URL(String(url || "/"), "https://x").searchParams.get("car"); return v && v.startsWith(CAR_TOKEN_PREFIX) ? v : null; } catch { return null; } };
export const changeTokenOf = url => { try { const v = new URL(String(url || "/"), "https://x").searchParams.get("change"); return v && v.startsWith(CAR_TOKEN_PREFIX) ? v : null; } catch { return null; } };
// a tool opens already run. The live Find, Market Check and Sell pages run their search from the ADDRESS in the browser (q, or car as words for Sell), so a crew request for ?car=<token> to one of them is answered with a redirect to
// that tool's own address (q=<the car's words>, or car=<the words> for Sell) plus ct=<token>, which only keeps the token for the bar. Tasks keeps ?car=<token> and fills its composer; a ?change=<token> opens the tool's landing with the car filled.
export function resolveCarUrl(url, tool) {
  const tk = carTokenOf(url), ch = changeTokenOf(url);
  let ct = null; try { const v = new URL(String(url || "/"), "https://x").searchParams.get("ct"); ct = v && v.startsWith(CAR_TOKEN_PREFIX) ? v : null; } catch {}
  if (!tk && !ch && !ct) return { url, car: null, fill: null, redirect: null };
  const u = new URL(String(url || "/"), "https://x"), own = tool === "find" || tool === "mc" || tool === "sell";
  if (tk && own) { const car = decodeCarToken(tk); u.searchParams.delete("car"); if (car) { if (tool === "sell") u.searchParams.set("car", car.text); else u.searchParams.set("q", car.text); u.searchParams.set("ct", tk); } return { url: u.pathname + u.search, car, fill: null, redirect: car ? u.pathname + u.search : null }; }
  const car = decodeCarToken(tk || ct), fill = ch ? decodeCarToken(ch) : null;
  if (tk) u.searchParams.delete("car"); if (ch) u.searchParams.delete("change"); if (ct) u.searchParams.delete("ct");
  return { url: u.pathname + (u.search || ""), car, fill, redirect: null };
}
