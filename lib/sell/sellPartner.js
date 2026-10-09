// The new Sell's PowerSeller card facts (Lane C, Oct 2026). The card's display rules are the live /sell
// card's own, js/result-v2.js renderPowerSellerCardV2 and its psv* helpers (product rules 9-11 and 14 in
// CLAUDE.md decide WHETHER a partner shows: api/sellerDecision.js evaluatePartnerReferral; these decide
// WHAT the card says). Ported here unchanged in substance so the new Sell server hands the page finished
// facts from the partner record evaluatePartnerReferral returns; the only change is voice: the new Sell
// never speaks as Sam in the first person, so the intro's "I'd trust him" reads "Sam would trust him".
// Every tile is roster truth (partner_provided, source notes never printed) or the data_verified premium
// the nightly compute persisted; nothing is composed or computed on the page. If any helper here changes
// in js/result-v2.js, change it here too (and the reverse).

const STATES = { al: "Alabama", ak: "Alaska", az: "Arizona", ar: "Arkansas", ca: "California", co: "Colorado", ct: "Connecticut", de: "Delaware", fl: "Florida", ga: "Georgia", hi: "Hawaii", id: "Idaho", il: "Illinois", in: "Indiana", ia: "Iowa", ks: "Kansas", ky: "Kentucky", la: "Louisiana", me: "Maine", md: "Maryland", ma: "Massachusetts", mi: "Michigan", mn: "Minnesota", ms: "Mississippi", mo: "Missouri", mt: "Montana", ne: "Nebraska", nv: "Nevada", nh: "New Hampshire", nj: "New Jersey", nm: "New Mexico", ny: "New York", nc: "North Carolina", nd: "North Dakota", oh: "Ohio", ok: "Oklahoma", or: "Oregon", pa: "Pennsylvania", ri: "Rhode Island", sc: "South Carolina", sd: "South Dakota", tn: "Tennessee", tx: "Texas", ut: "Utah", vt: "Vermont", va: "Virginia", wa: "Washington", wv: "West Virginia", wi: "Wisconsin", wy: "Wyoming" };
const WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];
const COUNT_RE = /(\d[\d,]*)\s*\+?\s*(?:[a-z]+\s+)?(?:listings|auctions)/i;
const texts = list => (list || []).map(s => s && s.text).filter(Boolean);

// Person references use display_name; the handle appears only in "Known online as" (psvDisplay).
function handleOf(p) { return String(p.name || "").trim(); }
function displayOf(p) {
  const d = String(p.displayName || p.name || "this consignor").trim(), h = handleOf(p);
  if (d.includes(" / ")) {
    const parts = d.split(" / ").map(s => s.trim()).filter(Boolean);
    if (parts.length > 1 && h && parts[0].toLowerCase() === h.toLowerCase()) return parts.slice(1).join(" / ");
    return parts[0];
  }
  return d;
}
const poss = n => String(n || "") + "'s";
function pron(p) { const pr = (p && p.specialties && p.specialties.pronoun) || {}; return { subj: pr.subj || "he", obj: pr.obj || "him", poss: pr.poss || "his" }; }
const subjHas = p => { const s = pron(p).subj; return s === "they" ? "they've" : s + "'s"; };
// Data-verified premium: positive only (the display gate), persisted by the nightly compute.
function premium(p) { const pr = p && p.specialties && p.specialties.premium; const pct = pr ? Number(pr.pct) : NaN; return Number.isFinite(pct) && pct > 0 ? Math.round(pct) : null; }
// The curated wheelhouse, never the broad matching `makes` (fail-honest when absent).
function wheelhouse(p) { const wh = (p && p.specialties && p.specialties.wheelhouse) || null; return { marques: (wh && wh.marques) || [], models: (wh && wh.models) || [] }; }
function claimOf(p, v) {
  const wh = wheelhouse(p), mk = String((v && v.make) || "").toLowerCase(), md = String((v && v.model) || "").toLowerCase();
  for (const m of wh.marques) if (mk && String(m).toLowerCase() === mk) return { level: "marque", label: m };
  for (const m of wh.models) { const x = m || {}; if (md && String(x.model || "").toLowerCase() === md && (!x.make || String(x.make).toLowerCase() === mk)) return { level: "model", label: x.label || x.model }; }
  return null;
}
// SPECIALISES IN: the matched marque/model, else the curated category identity, else nothing.
function specTile(p, v) { const c = claimOf(p, v); return c ? c.label : String((p && p.specialties && p.specialties.identity) || "").trim(); }
// The auctions/listings total from the roster (profile_stats, then service claims).
function trophy(p) {
  for (const t of [...texts(p.specialties && p.specialties.profile_stats), ...texts(p.serviceClaims)]) { const m = COUNT_RE.exec(t); if (m) return m[1].replace(/,/g, "") + "+"; }
  return null;
}
// One attributed track-record line that is not the auctions total and carries no unfilled placeholder.
function trustLines(p) { return texts(p.specialties && p.specialties.profile_stats).filter(t => !COUNT_RE.test(t) && !/\{[^}]+\}/.test(t)).slice(0, 1); }
// Location, state level only, from the "Based in ..." claim.
function locationOf(p) {
  let based = "";
  for (const t of texts(p.serviceClaims)) { const m = /Based in ([^,.;]+)/i.exec(t); if (m) { based = m[1].trim(); break; } }
  if (!based) return "";
  for (const s of Object.values(STATES)) if (new RegExp("\\b" + s + "\\b", "i").test(based)) return s;
  const ab = /\b([A-Za-z]{2})\b\s*$/.exec(based);
  return ab && STATES[ab[1].toLowerCase()] ? STATES[ab[1].toLowerCase()] : based;
}
function servesLine(text) {
  const parts = String(text || "").replace(/^\s*Serves\s+/i, "").trim().split(/\s*,\s*|\s+and\s+/i).map(x => x.trim()).filter(Boolean);
  if (parts.length <= 3) return text;
  const more = parts.length - 2;
  return `Serves ${parts[0]}, ${parts[1]} and ${WORDS[more] || more} more states.`;
}
function inHomeRegion(p, state) {
  const st = String(state || "").toLowerCase().trim(); if (!st) return null;
  return (p.regions || []).map(r => String(r).toLowerCase()).filter(r => r && r !== "nationwide").some(r => r === st || st.includes(r) || r.includes(st));
}
function coverage(p, ref, state) {
  const regions = (p.regions || []).map(r => String(r).toLowerCase()), nationwide = regions.includes("nationwide");
  const sellerSt = String((ref && ref.sellerState) || "").trim();
  if (sellerSt && ref && ref.coversSellerRegion === true) {
    const title = sellerSt.replace(/\b[a-z]/g, c => c.toUpperCase());
    const claim = texts(p.serviceClaims).map(t => /^\s*Serves\s+(.+?)\s*$/i.exec(t)).find(Boolean);
    if (claim) {
      const others = claim[1].split(/\s*,\s*|\s+and\s+/i).map(x => x.trim()).filter(Boolean).filter(x => x.toLowerCase() !== sellerSt.toLowerCase()).length;
      if (others > 0) return `Serves ${title} and ${WORDS[others] || others} other state${others > 1 ? "s" : ""}.`;
    }
    return `Serves ${title}.`;
  }
  if (inHomeRegion(p, state) === false) return nationwide ? "Works nationwide" : "";
  const serves = texts(p.serviceClaims).map(t => /^\s*(Serves .+?)\s*$/i.exec(t)).find(Boolean);
  if (serves) return servesLine(serves[1]);
  if (nationwide) return "Works nationwide";
  const first = (p.regions || []).find(r => String(r).toLowerCase() !== "nationwide");
  return first ? `Serves ${first}` : "";
}
// Preparation: the first service claim that is neither "Based in" nor "Serves".
function prepOf(p) { const t = texts(p.serviceClaims).map(s => s.trim()).find(s => !/^Based in\b/i.test(s) && !/^Serves\b/i.test(s)); return t ? t.replace(/\s*\(per[^)]*\)\s*$/i, "") : ""; }
function localityState(p, state) {
  if (!state || /^not sure$/i.test(state)) return null;
  const sl = String(state).toLowerCase();
  return (p.regions || []).map(r => String(r).toLowerCase()).filter(r => r && r !== "nationwide").some(r => r === sl || r.includes(sl) || sl.includes(r)) ? state : null;
}
// The intro carries the true reason for the match: (a) a marque/model the partner specialises in; (b) the
// car's state in the partner's roster regions; (c) nationwide otherwise, with the curated intro_hook.
function introOf(p, first, claim, carShort, state) {
  const pr = pron(p);
  if (claim) return `${claim.label} ${claim.level === "marque" ? "is" : "are"} one of ${poss(first)} strongest areas. For this ${carShort}, Sam would trust ${pr.obj} to choose the right platform, present it professionally and manage the sale from start to finish.`;
  const hook = String((p.specialties && p.specialties.intro_hook) || "").trim();
  const tail = ` Sam would trust ${pr.obj} to run the whole sale, from choosing the platform to the final paperwork.`;
  const loc = localityState(p, state);
  if (loc) return `Your ${carShort} is in ${loc}, right in ${poss(first)} patch.${hook ? " " + hook : ""}${tail}`;
  return `${first} works with sellers across the country.${hook ? " " + hook : ""}${tail}`;
}

// ref: evaluatePartnerReferral's result; v: the resolved car; state: the seller's state. Returns the card's
// facts, or null when the rules give the card nothing to show beyond a name (the page then leaves it out).
export function partnerCardFacts(ref, v, state) {
  const p = ref && ref.partner; if (!p) return null;
  const display = displayOf(p), first = display.split(/\s+/)[0], handle = handleOf(p);
  const carShort = [v && v.make, v && v.model].filter(Boolean).join(" ") || "car";
  const claim = claimOf(p, v);
  // Tiles in the live card's priority order, under its height budget (premium weighs 2, the rest 1, 4 in all).
  const defs = [];
  const pct = premium(p);
  if (pct != null) defs.push({ w: 2, t: { icon: "star", label: "Track record", num: `+${pct}%`, green: true, value: `higher sale prices on cars ${subjHas(p)} represented, compared with similar cars` } });
  const tr = trophy(p);
  if (tr) defs.push({ w: 1, t: { icon: "trophy", num: tr, value: "enthusiast auctions represented" } });
  const sp = specTile(p, v);
  if (sp) defs.push({ w: 1, t: { icon: "car", label: "Specialises in", value: sp, green: true } });
  const loc = locationOf(p), cov = coverage(p, ref, state);
  if (loc) defs.push({ w: 1, t: { icon: "pin", label: `Based in ${loc}`, sub: cov || null } });
  const prep = prepOf(p);
  if (prep) defs.push({ w: 1, t: { icon: "clip", label: "Preparation", value: prep } });
  const trust = pct != null ? [] : trustLines(p);
  if (trust.length) defs.push({ w: 1, t: { icon: "star", label: "Track record", lines: trust } });
  const tiles = []; let acc = 0;
  for (const d of defs) { if (acc + d.w > 4) break; acc += d.w; tiles.push(d.t); }
  if (!tiles.length) return null;
  return { slug: p.slug, name: display, first, knownAs: handle && handle.toLowerCase() !== display.toLowerCase() ? handle : null,
    intro: introOf(p, first, claim, carShort, state), tiles };
}
