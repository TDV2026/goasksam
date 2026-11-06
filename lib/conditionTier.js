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
// ct2 (Nov 5 2026, Sam): a COMMON WORD never flips a tier on its own. Every phrase below is a statement about the car (a phrase, not a word), and a negated phrase ("no aftermarket parts", "never modified",
// "not a project", "free of damage", "Not salvage") counts for nothing. ct1 read "project", "custom", "incomplete", "crash", "collision", "struck", "receipts", "numbers matching", "factory paint", "tuned",
// "lowered", "swapped", "upgraded" and any non-empty modifications text as the bad (or good) thing by themselves. Tier 1's bar (score 4) and the 3 signal minimum are unchanged.
export const TIER_VERSION = "ct3-20261105";
// THE LADDER, ONE SOURCE (Lane D, Nov 2026, Clint Sly's Desk Valuations change). Every place that prints a tier name or its one line (the Desk sheet, the PDF, the Send email, the tier job) reads it from here; a
// check fails if the words are typed anywhere else. FOUR TIERS ONLY, no 5 and no 6: this is Hagerty's four rung condition ladder (#1 Concours, #2 Excellent, #3 Good, #4 Fair), the scale the collector market
// already prices against, and the engine's signals (lib/conditionTier.js above) can only separate four honest steps from a listing's own text. A fifth or sixth rung would be a finer cut than the evidence supports.
// The names are unchanged from what the Desk and the tier job already used; the one line each is new wording.
export const TIER_LADDER = {
  1: { name: "Concours", line: "The best example anywhere, show quality" },
  2: { name: "Excellent", line: "Near new, a careful restoration or an exceptional original" },
  3: { name: "Good", line: "A sound driver with wear a buyer would expect" },
  4: { name: "Fair", line: "Runs and drives, visible wear or needs" }
};
export const UNTIERED_LADDER = { name: "Untiered", line: "Not enough evidence to place it" };
export const TIER_NAMES = Object.fromEntries(Object.entries(TIER_LADDER).map(([k, v]) => [k, v.name]));
// ANALYST PLUS AND MINUS: a judgment on which half of the SAME tier pool the car sits in. The engine never sets one, it never changes the stored tier, the pool or the starting figure, and an Untiered car takes none.
export const TIER_MARKS = ["plus", "minus"];
export const markLabel = (tier, mark) => ([1, 2, 3, 4].includes(Number(tier)) && TIER_MARKS.includes(mark) ? `${Number(tier)} ${mark}` : null);
// The saved mark for a sheet: null unless the sheet has a tier and the mark is one of the two. The reason is one line.
export function sanitizeMark(tier, m) {
  if (!([1, 2, 3, 4].includes(Number(tier))) || !m || !TIER_MARKS.includes(m.mark)) return null;
  return { mark: m.mark, tier: Number(tier), reason: String(m.reason || "").replace(/[\r\n]+/g, " ").trim().slice(0, 200) };
}
// "Engine: tier 2. Analyst: 2 plus" (the line the sheet, the PDF and the email print).
export const markStatement = m => (m && markLabel(m.tier, m.mark) ? `Engine: tier ${m.tier}. Analyst: ${markLabel(m.tier, m.mark)}` : null);
export const MIN_SIGNALS = 3;

const OWNER_ONE = /\b(?:one|single|1)[- ]owner\b|\bowned by (?:one|a single) (?:owner|family)\b|\bsole owner\b/i;
const OWNER_TWO = /\b(?:two|2)[- ]owners?\b|\bsecond owner\b|\b2nd owner\b|\bthe second owner\b/i;
const OWNER_MANY = /\b(?:three|3|four|4|five|5|six|6|several|multiple|many)[- ](?:previous[- ]|prior[- ])?owners?\b/i;
// service: a records phrase, or receipts that are about the car's upkeep (a bare "receipts" is a sales receipt, a toll receipt, anything)
const SERVICE = /\b(?:service (?:records?|file|history|book|logs?)|maintenance (?:records?|history|logs?)|documented (?:service|maintenance|history)|dealer[- ]serviced|stamped (?:service )?book|(?:service|maintenance|repair|parts|restoration|dealer) receipts?|receipts? (?:for|documenting|detailing) (?:the )?(?:service|maintenance|repairs?|work|restoration)|records? (?:from|dating))\b/i;
const NO_ACCIDENT = /\b(?:no (?:reported )?(?:accidents?|collisions?|damage)|no history of (?:accidents?|damage)|accident[- ]free|damage[- ]free|(?:free of|without(?: any)?) (?:accidents?|collisions?|damage)|never (?:been )?(?:in )?(?:an? )?(?:accident|crash|collision)|clean (?:carfax|autocheck))\b/i;
// accident: an accident the car HAD (a/the/prior accident, accident damage), damage to it, a claim. Not "by accident", "collision warning/avoidance", "crash box/bar/test", "struck me".
const ACCIDENT = /\b(?:(?:an?|the|prior|previous|minor|major|reported) accident|accident (?:damage|history|repair|report)|(?:in|from|after|involved in) an? collision|collision (?:damage|repair|history|claim)|crashed|crash damage|(?:in|from) an? crash|insurance claim|(?:\w+ )?damage[d]?|frame (?:damage|repair)|bodywork after|(?:was|got|been) struck by|fender[- ]bender)\b/i;
const RESTORED = /\b(?:restored|restoration|refinished|repainted|resprayed|rebuilt engine|re-?upholstered|re-?trimmed|rotisserie)\b/i;
const NEG_RESTORED = /\b(?:never|not|un|not been)[- ]?restored\b|\bunrestored\b/gi;
// original: the paint or the whole car said to be original. NOT "numbers matching" (a restored car can match) and NOT a bare "factory paint" ("factory paint color Guards Red" after a respray).
const ORIGINAL = /\b(?:original (?:factory )?paint|factory[- ]original|paint is original|unrestored|survivor|all[- ]original|preservation class|time[- ]capsule)\b/i;
// project: the car described as one. "project car", "a project", "needs restoration", "barn find", "incomplete" (the car), not running. A restoration "project" completed, "not a project", "incomplete service history" are not.
const PROJECT = /\b(?:project car|an? project\b|needs (?:an? )?(?:full )?restoration|in need of (?:an? )?(?:full )?restoration|requires (?:an? )?(?:full )?restoration|barn[- ]find|non[- ]running|not running|incomplete (?:car|vehicle|project|restoration|build|and)|(?:car|vehicle|project) (?:is|was|sold) incomplete|sold incomplete)\b/i;
const NEG_PROJECT = /\b(?:not|no longer|never|isn'?t|wasn'?t)\s+(?:an?\s+|a\s+)?(?:project(?: car)?|barn[- ]find|incomplete)\b/gi;
// modification: a mods field with content, or a modification PHRASE. "custom" only before a part word, "tuned"/"lowered"/"swapped"/"upgraded" only as work done to the car.
const PART = "wheels?|exhaust|intake|suspension|headers?|engine|stereo|audio|bumpers?|kit|seats?|grille|lift|cams?|ecu|tune|bodywork|body|bodykit";
const MODDED = new RegExp("\\b(?:modified|aftermarket|custom[- ](?:" + PART + ")|(?:ecu|dyno|chip|engine|performance|software)[- ]tuned|tuned (?:ecu|engine|exhaust|suspension)|(?:suspension|springs|car|truck) lowered|lowered (?:suspension|springs|stance|ride height|on (?:coil|spring|air))|been lowered|(?:engine|motor|transmission|gearbox|drivetrain|ls|v8)[- ]swap(?:ped)?|swapped (?:engine|motor|transmission|gearbox)|(?:engine|motor|transmission|gearbox) (?:was |has been )?swapped|upgraded (?:" + PART + "|brakes|turbo|carburet\\w+|ignition|cooling|clutch)|coilovers?|turbo kit|supercharger kit|restomod|resto-mod|big[- ]bore)\\b", "i");
const NEG_MOD = /\b(?:no|not|never|without|free of|zero|non|un)[- ]+(?:\w+[- ]+){0,2}(?:modified|aftermarket|modifications?|upgraded|upgrades|custom|swapped|lowered|tuned)\b/gi;
const STOCK = /\b(?:unmodified|completely stock|all stock|factory stock|stock condition)\b/i;
// title status: a branded status. Not "Not salvage" / "never rebuilt" / "no salvage".
const BAD_TITLE = /\b(?:salvage|rebuilt|reconstructed|branded|flood|lemon|parts only|non[- ]repairable|junk)\b/i;
const NEG_TITLE = /\b(?:not|no|never|non|without)[- ]+(?:a )?(?:salvage|rebuilt|reconstructed|branded|flood|lemon|junk)\b/gi;
const CLEAN_TITLE = /\bclean\b/i;
const NOT_CLEAN = /\b(?:not|isn'?t|no longer)[- ]+clean\b/i;
// a modifications field that says there are none
const NO_MODS_FIELD = /^(?:|none|n\/a|na|no|null|nil|\[\]|\{\}|unknown|-|stock|unmodified|original|factory|all stock|no modifications?|none (?:noted|reported|listed|known|stated)|not (?:modified|applicable)|\[?"?(?:none|stock|no)"?\]?)\.?$/i;

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
  const noProject = text.replace(NEG_PROJECT, " "), noMod = text.replace(NEG_MOD, " "), noRestoredNeg = text.replace(NEG_RESTORED, " ");
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
  if (PROJECT.test(noProject) || (r.project_flag && String(r.project_flag).trim())) add("project", -2, `The listing described a project or an incomplete car${r.project_flag ? " (" + String(r.project_flag).trim() + ")" : ""}`, true);
  else if (ORIGINAL.test(text) && !RESTORED.test(noRestoredNeg)) add("original", 1, "The listing said the paint or the car was original or unrestored");
  else if (RESTORED.test(noRestoredNeg)) add("restored", 0, "The listing mentioned a restoration or refinish (shown, not scored)");
  // modification
  const mods = r.modifications == null ? "" : (typeof r.modifications === "string" ? r.modifications : JSON.stringify(r.modifications));
  const modsLeft = (() => { const m = mods.trim(); if (!m) return ""; try { const j = JSON.parse(m); if (typeof j === "object" && j) return Object.values(j).flat().map(x => String(x == null ? "" : x).trim()).filter(x => x && !NO_MODS_FIELD.test(x)).join(", "); } catch { /* plain text */ } return NO_MODS_FIELD.test(m) ? "" : m; })();
  if (modsLeft) add("modified", -1, "The listing carried a modifications field");
  else if (MODDED.test(noMod) && !STOCK.test(text)) add("modified", -1, "The listing mentioned modifications or aftermarket parts");
  else if (STOCK.test(text)) add("stock", 1, "The listing said unmodified or stock");
  // title
  const ts = r.title_status == null ? "" : String(r.title_status).trim();
  if (ts) {
    if (BAD_TITLE.test(ts.replace(NEG_TITLE, " "))) add("title_branded", -3, `The listing's title status read ${ts}`, true);
    else if (CLEAN_TITLE.test(ts) && !NOT_CLEAN.test(ts)) add("title_clean", 1, "The listing's title status read clean");
  }
  const tier = hard ? 4 : observed < MIN_SIGNALS ? null : score >= 4 ? 1 : score >= 2 ? 2 : score >= 0 && score <= 1 ? 3 : 4;
  return { tier, untiered: tier == null, score, observed, evidence: ev, version: TIER_VERSION };
}
// The analyst's note as the PDF and the Send email print it: the statement, then the one line reason if there is one.
export const markNote = m => { const s = markStatement(m); return s ? s + "." + (m.reason ? " " + m.reason.replace(/[.\s]+$/, "") + "." : "") : null; };
