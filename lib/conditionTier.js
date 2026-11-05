// CONDITION TIER (Lane B, Nov 2026, Desk Valuations spec "Condition tier", build order item 1). Pure: no database, no network, no clock.
// Every sale gets a tier from its OWN listing text and fields: 1 concours, 2 excellent, 3 good, 4 fair, or null = Untiered (too little to tier). No photo scoring.
// The tier is a reading of what the listing SAID at the sale (rule 26: dated, past tense), never a statement of the car's condition today.
//
// SIGNALS (each is observed or not; an unobserved signal scores nothing and is not counted):
//   mileage        listed miles against the MODEL's own bands (lower and upper quartile of that model's listed miles): at or under the lower quartile +1, at or over the upper quartile -1, between 0
//   owners         one owner +1, two 0, three or more -1
//   service        service records, a service file, maintenance history or receipts mentioned +1
//   accident       "no accidents" / "accident free" +1; an accident, collision, damage or insurance claim mentioned -1
//   restoration    restored / refinished / repainted / rebuilt mentioned 0 (shown, never scored: a fresh restoration is not worse or better on its own); original paint, unrestored, survivor +1; needs restoration, project, incomplete -2 (and tier 4)
//   modification   a modifications field or aftermarket / modified / swapped / lowered words -1; unmodified or completely stock +1
//   title          a clean title +1; salvage, rebuilt, branded, flood, lemon, parts only -3 (and tier 4)
// TIER: a hard negative (branded title, project) is 4. Otherwise score 4 or more is 1, 2 or 3 is 2, 0 or 1 is 3, below 0 is 4.
// UNTIERED: fewer than THREE signals observed and no hard negative. Such a sale stays in the wider pool and is out of every same tier pool.
export const TIER_VERSION = "ct1-20261105";
export const TIER_NAMES = { 1: "Concours", 2: "Excellent", 3: "Good", 4: "Fair" };
export const MIN_SIGNALS = 3;

const OWNER_ONE = /\b(?:one|single|1)[- ]owner\b|\bowned by (?:one|a single) (?:owner|family)\b|\bsole owner\b/i;
const OWNER_TWO = /\b(?:two|2)[- ]owners?\b|\bsecond owner\b|\b2nd owner\b|\bthe second owner\b/i;
const OWNER_MANY = /\b(?:three|3|four|4|five|5|six|6|several|multiple|many)[- ](?:previous[- ]|prior[- ])?owners?\b/i;
const SERVICE = /\b(?:service (?:records?|file|history|book|logs?)|maintenance (?:records?|history|logs?)|documented (?:service|maintenance|history)|dealer[- ]serviced|stamped (?:service )?book|receipts?|records? (?:from|dating))\b/i;
const NO_ACCIDENT = /\b(?:no (?:reported )?(?:accidents?|collisions?|damage)|accident[- ]free|damage[- ]free|never (?:been )?(?:in )?(?:an? )?(?:accident|crash|collision)|clean (?:carfax|autocheck))\b/i;
const ACCIDENT = /\b(?:accident|collision|crash(?:ed)?|insurance claim|damage[d]?|frame (?:damage|repair)|bodywork after|struck|fender[- ]bender)\b/i;
const RESTORED = /\b(?:restored|restoration|refinished|repainted|resprayed|rebuilt engine|re-?upholstered|re-?trimmed|rotisserie)\b/i;
const ORIGINAL = /\b(?:original paint|unrestored|survivor|all[- ]original|numbers[- ]matching|factory paint|preservation class|time[- ]capsule)\b/i;
const PROJECT = /\b(?:project|needs (?:a )?(?:full )?restoration|in need of (?:a )?(?:full )?restoration|barn find|non[- ]running|not running|incomplete|requires (?:a )?restoration)\b/i;
const MODDED = /\b(?:modified|aftermarket|upgraded|custom|lowered|tuned|engine swap|swapped|coilovers?|turbo kit|supercharger kit|restomod|resto-mod|big[- ]bore)\b/i;
const STOCK = /\b(?:unmodified|completely stock|all stock|factory stock|stock condition)\b/i;
const BAD_TITLE = /\b(?:salvage|rebuilt|reconstructed|branded|flood|lemon|parts only|non[- ]repairable|junk)\b/i;
const CLEAN_TITLE = /\bclean\b/i;
const NO_MODS_FIELD = /^(?:|none|n\/a|no|null|\[\]|\{\}|unknown|-)$/i;

const miles = v => { const n = Number(String(v == null ? "" : v).replace(/[^\d.]/g, "")); return Number.isFinite(n) && n > 0 ? Math.round(n) : 0; };
const fmt = n => Math.round(n).toLocaleString("en-US");
const pick = (...xs) => xs.filter(x => x != null && String(x).trim() !== "").join(". ");

// The model's own mileage bands: lower and upper quartile of the miles listed for that model. Needs 20 or more listed odometers, else null (mileage is then not observed).
export function modelMileBands(milesList) {
  const v = (Array.isArray(milesList) ? milesList : []).map(miles).filter(n => n > 0).sort((a, b) => a - b);
  if (v.length < 20) return null;
  const q = p => { const i = (v.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i); return v[lo] + (v[hi] - v[lo]) * (i - lo); };
  return { n: v.length, q25: Math.round(q(0.25)), q75: Math.round(q(0.75)) };
}

// row: { listing_title, description, mileage_text | mileage, stated_mileage, title_status, modifications, project_flag, desc_facts }. bands: modelMileBands(...) for the row's model, or null.
// Returns { tier: 1..4 | null, untiered: boolean, score, observed, evidence: [{ code, points, line }], version }.
export function assignTier(row, bands) {
  const r = row || {};
  const text = pick(r.listing_title, r.description);
  const ev = []; let score = 0, observed = 0, hard = false;
  const add = (code, points, line, hardNeg) => { ev.push({ code, points, line }); score += points; observed++; if (hardNeg) hard = true; };
  // mileage
  const mi = miles(r.mileage_text != null ? r.mileage_text : r.mileage) || miles(r.stated_mileage);
  if (mi > 0 && bands) {
    if (mi <= bands.q25) add("mileage_low", 1, `Listed with ${fmt(mi)} miles, at or under the model's lower quartile of ${fmt(bands.q25)} (${bands.n} listed odometers)`);
    else if (mi >= bands.q75) add("mileage_high", -1, `Listed with ${fmt(mi)} miles, at or over the model's upper quartile of ${fmt(bands.q75)} (${bands.n} listed odometers)`);
    else add("mileage_mid", 0, `Listed with ${fmt(mi)} miles, between the model's quartiles of ${fmt(bands.q25)} and ${fmt(bands.q75)}`);
  }
  // owners
  if (OWNER_ONE.test(text)) add("owners_one", 1, "The listing said one owner");
  else if (OWNER_MANY.test(text)) add("owners_many", -1, "The listing said three or more owners");
  else if (OWNER_TWO.test(text)) add("owners_two", 0, "The listing said two owners");
  // service records
  if (SERVICE.test(text)) add("service", 1, "The listing mentioned service records or a service history");
  // accident
  if (NO_ACCIDENT.test(text)) add("accident_none", 1, "The listing said no accidents or damage");
  else if (ACCIDENT.test(text)) add("accident", -1, "The listing mentioned an accident, collision or damage");
  // restoration
  if (PROJECT.test(text) || (r.project_flag && String(r.project_flag).trim())) add("project", -2, `The listing described a project or an incomplete car${r.project_flag ? " (" + String(r.project_flag).trim() + ")" : ""}`, true);
  else if (ORIGINAL.test(text)) add("original", 1, "The listing said original, unrestored or numbers matching");
  else if (RESTORED.test(text)) add("restored", 0, "The listing mentioned a restoration or refinish (shown, not scored)");
  // modification
  const mods = r.modifications == null ? "" : (typeof r.modifications === "string" ? r.modifications : JSON.stringify(r.modifications));
  if (mods && !NO_MODS_FIELD.test(mods.trim())) add("modified", -1, "The listing carried a modifications field");
  else if (MODDED.test(text) && !STOCK.test(text)) add("modified", -1, "The listing mentioned modifications or aftermarket parts");
  else if (STOCK.test(text)) add("stock", 1, "The listing said unmodified or stock");
  // title
  const ts = r.title_status == null ? "" : String(r.title_status).trim();
  if (ts) {
    if (BAD_TITLE.test(ts)) add("title_branded", -3, `The listing's title status read ${ts}`, true);
    else if (CLEAN_TITLE.test(ts)) add("title_clean", 1, "The listing's title status read clean");
  }
  const tier = hard ? 4 : observed < MIN_SIGNALS ? null : score >= 4 ? 1 : score >= 2 ? 2 : score >= 0 && score <= 1 ? 3 : 4;
  return { tier, untiered: tier == null, score, observed, evidence: ev, version: TIER_VERSION };
}
