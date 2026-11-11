// DESK INTAKE: reading one inbound submission (Lane D, Nov 2026; docs/desk-valuations-spec.md "Intake by email").
// Pure functions only: text in, facts out. No network, no database, no link is ever opened. Nothing here computes a figure.
import { mileageFromText } from "../../_mileageText.js";
import { parseHagertyForm } from "./hagertyForm.js";
import { transmissionFromText } from "../../_descFacts.js";

// ---- VIN: 17 characters, no I O Q, and the check digit (ISO 3779 position 9) ----
const VIN_VALUES = { A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8, J: 1, K: 2, L: 3, M: 4, N: 5, P: 7, R: 9, S: 2, T: 3, U: 4, V: 5, W: 6, X: 7, Y: 8, Z: 9 };
const VIN_WEIGHTS = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];
export function vinCheckDigitOk(vin) {
  const v = String(vin || "").toUpperCase();
  if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(v)) return false;
  let sum = 0;
  for (let i = 0; i < 17; i++) { const c = v[i], val = /\d/.test(c) ? Number(c) : VIN_VALUES[c]; if (val == null) return false; sum += val * VIN_WEIGHTS[i]; }
  const r = sum % 11, want = r === 10 ? "X" : String(r);
  return v[8] === want;
}
// ---- which 17-character strings are tried as a VIN (Sam, Nov 4 2026) ----
// STRUCTURE is the only gate: 17 letters and digits, none of I O Q; the first character is not 0; the model-year character (10th) is not U Z or 0; a North
// American VIN (first character 1 to 5) ends in five digits. A string that passes structure is tried as the car. Two MARKERS ride on the row and never gate:
//   "check digit not valid"  the check digit fails (European market VINs have no North American check digit)
//   "maker code unknown"     the first three characters are not in KNOWN_WMI below
// The decode decides whether the string is a car: if the decode (and the words of the email) find no car for a string that is both marker-flagged, the row is
// Needs the car with the string shown (lib/desk/intake/run.js). A string that fails structure is not a VIN: it is reported as rejected.
export const KNOWN_WMI = new Set(`
 WP0 WP1 WDB WDC WDD WDF WD0 WD1 WD2 WD3 WD4 W1K W1N W1V W1W W1Y WMX WBA WBS WBY WB1 WBW WAU WUA WA1 TRU WVW WV1 WV2 WV3 WVG WVV W0L W0V WF0 WFO WME WSM WJR WKK WUU W09 W0S WZ1 WG0
 ZFF ZFA ZAR ZAM ZHW ZA9 ZLA ZDF ZDM ZCG ZAP ZGA ZC2 ZSA ZFC ZJN ZAS
 SAJ SAD SAL SAR SAB SCA SCB SCC SCE SCF SCG SBM SDB SA9 SAX SAH SAY SAE SHH SHS SJN SU9 SB1
 VF1 VF3 VF7 VF6 VF8 VFA VSS VSX VS6 VS7 VR1 VNK VNV
 YV1 YV4 YS3 YK1 YTN TMB TMP TMT TM9 TNA TSM
 JN1 JN3 JN6 JN8 JNK JNR JHM JHL JH4 JH2 JHF JT2 JT3 JT4 JT8 JTD JTE JTH JTJ JTK JTM JTN JM1 JM3 JMZ JF1 JF2 JS1 JS2 JS3 JS4 JSA JAA JAC JAL JDA JKA JKB JYA JMB
 KMH KMF KM8 KNA KND KNM KNC KPT KL1 KLA LFV LSV LVV LHG LJD LZW
 1G1 1G2 1G3 1G4 1G6 1G8 1GA 1GB 1GC 1GD 1GE 1GG 1GK 1GN 1GT 1GY 2G1 2G2 3G1 4G1 5G1 1FA 1FB 1FC 1FD 1FM 1FT 1FU 1FV 2FA 2FM 2FT 3FA 1LN 1ME 1MR 1ZV 2LM 3LN 5LM 5LT 1C3 1C4 1C6 1B3 1B7 1D3 1D7 2B3 2C3 2C4 1J4 1J8 1P3 1P4 2P3 3C3 3C4 3C6 1N4 1N6 3N1 5N1 1HG 2HG 2HM 5FN 19U 19X 1YV 1VW 1VV 3VW 3VV 5YJ 7SA 5J6 5J8 5T3 4T1 4T3 5TD 5TF 1NX 2T1 2T2 3TM 4US 5UX 5UM 3MW 5YM WBX 1AC 1AM 1B6 1D8 1F1 1F9 1M1 1M2 1M8 1N7 1NK 1R9 1T7 1WU 2D4 2D8 2E3 2H3 2M2 2S3 2V4 3D4 3D7 3H1 3P3 3S4 3Y4 4F2 4F4 4M2 4S3 4S4 5F1 5GA 5GZ 5L1 5L3 5N3 5NP 5XX 5XY 6G1 6H8 6MM 6T1 8AP 8AD 8AF 8AG 8AJ 8AW 8GG 93H 93K 93R 93U 93V 93W 93X 93Y 94D 9BD 9BF 9BG 9BM 9BR 9BS 9BW 9FB 9C2 9C6 PE1 PL1 PNA MA1 MA3 MA6 MAL MAT MBH MBJ MCA MDH MEE MHF MHR MM8 MMB MMM MMT MNB MPA MRH MS0 NLA NLH NM0 NMT PAD PAE PM1 PM2 PR8 LA9 LB3 LBV LC0 LDC LE4 LGB LGJ LGX LH1 LJC LK6 LKL LL6 LMG LNB LPA LRB LS5 LSG LSJ LTV LUC LVS LWV LXV LYV LZ0 RFB
`.split(/\s+/).filter(Boolean));
export function vinStructureOk(vin) {
  const v = String(vin || "").toUpperCase();
  if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(v)) return false;
  if (v[0] === "0") return false;
  if (/[UZ0]/.test(v[9])) return false;
  if (/[1-5]/.test(v[0]) && !/^\d{5}$/.test(v.slice(12))) return false;
  return true;
}
export const knownWmi = vin => KNOWN_WMI.has(String(vin || "").toUpperCase().slice(0, 3));
// classify one 17-character string: { state: "valid" | "check_digit_not_valid" | "rejected", makerUnknown, reason }
export function classifyVin(vin) {
  const v = String(vin || "").toUpperCase();
  if (!vinStructureOk(v)) return { state: "rejected", makerUnknown: false, reason: "structure" };
  return { state: vinCheckDigitOk(v) ? "valid" : "check_digit_not_valid", makerUnknown: !knownWmi(v) };
}
// every 17-character run in the text, in text order (a run needs at least four digits, so a long word is never read as a VIN).
// valid = every string tried as the car, in order (check digit right or not, maker code known or not); checkDigitNotValid and makerUnknown = the marked subsets; failed = rejected (structure) strings.
export function findVins(text) {
  const t = String(text || "").toUpperCase();
  const valid = [], checkDigitNotValid = [], makerUnknown = [], failed = [];
  const re = /(?<![A-Z0-9])[A-Z0-9]{17}(?![A-Z0-9])/g;
  let m;
  while ((m = re.exec(t))) {
    const v = m[0];
    if ((v.match(/\d/g) || []).length < 4) continue;
    const c = classifyVin(v);
    if (c.state === "rejected") { if (!failed.includes(v)) failed.push(v); continue; }
    if (!valid.includes(v)) { valid.push(v); if (c.state === "check_digit_not_valid") checkDigitNotValid.push(v); if (c.makerUnknown) makerUnknown.push(v); }
  }
  return { valid, checkDigitNotValid, makerUnknown, failed };
}

// ---- the chassis number of a car with no 17-character VIN (before 1981) ----
export function findChassis(text) {
  const t = String(text || "");
  const m = /\b(?:chassis|serial|car|frame)\s*(?:no\.?|number|num\.?|#)\s*[:\-]?\s*([A-Z0-9][A-Z0-9\-\/\.]{2,19}(?: ?[A-Z0-9]{2,8})?)/i.exec(t)
    || /\bchassis\s*[:\-]\s*([A-Z0-9][A-Z0-9\-\/\.]{2,19})/i.exec(t);
  if (!m) return null;
  const v = m[1].trim().replace(/[.\-\/]+$/, "").toUpperCase();
  if (v.length < 3 || /^(NUMBER|NO|NONE|UNKNOWN|TBC|TBD|N\/A)$/i.test(v) || !/\d/.test(v)) return null;
  return v;
}

// ---- mileage, gearbox, colour: only where the submission states them ----
export function findMileage(text) {
  const t = String(text || "");
  const labelled = /\b(?:mileage|odometer|miles on (?:the )?(?:car|odo(?:meter)?)|current miles)\s*[:\-=]\s*(\d[\d,\.]*)\s*(k\b)?\s*(km|kms|kilometres|kilometers|mi|miles)?/i.exec(t);
  if (labelled) {
    let n = Number(labelled[1].replace(/,/g, "")); if (labelled[2]) n *= 1000;
    const km = /^k/i.test(labelled[3] || "");
    if (Number.isFinite(n) && n > 0 && n < 2000000) return km ? { miles: Math.round(n * 0.621371 / 100) * 100, basis: "km", phrase: labelled[0].trim() } : { miles: Math.round(n), basis: "miles", phrase: labelled[0].trim() };
  }
  return mileageFromText("", t);
}
export function findGearbox(text) {
  const t = String(text || "");
  const phrase = transmissionFromText("", t);
  if (phrase) return phrase;
  const lab = /\b(?:gearbox|transmission|trans|box)\s*[:\-=]\s*(manual|automatic|auto|pdk|tiptronic|sequential|dct|cvt)\b/i.exec(t);
  const plain = /\b(?:[1-9][\s-]?speed\s+)?(manual|automatic)(?:\s+(?:gearbox|transmission|trans))?\b(?!\s+(?:mode|climate|control|lock|top|choke|steering|window))/gi;
  const hit = lab ? lab[1] : null;
  if (hit) return /^auto$/i.test(hit) ? "Automatic" : hit.toUpperCase() === hit ? hit : hit[0].toUpperCase() + hit.slice(1).toLowerCase();
  const words = new Set(); let m; while ((m = plain.exec(t))) words.add(m[1].toLowerCase());
  const bare = /\b(?:owner'?s|service|repair|workshop)\s+manual\b/i;
  const cleaned = t.replace(bare, " ");
  const w2 = new Set(); plain.lastIndex = 0; while ((m = plain.exec(cleaned))) w2.add(m[1].toLowerCase());
  return w2.size === 1 ? (w2.has("manual") ? "Manual" : "Automatic") : null;
}
export function findColour(text) {
  const m = /\b(?:colou?r|exterior(?: colou?r)?|paint(?:ed)?)\s*[:\-=]\s*([A-Za-z][A-Za-z0-9 \-\/']{2,32}?)(?=\s*(?:[,;\n\r|]|\.(?:\s|$)|\s{2,}|$|\b(?:interior|mileage|miles|gearbox|transmission|vin)\b))/i.exec(String(text || ""));
  if (!m) return null;
  const v = m[1].trim();
  return v.length >= 3 && !/^(unknown|n\/a|none|tbc|tbd)$/i.test(v) ? v : null;
}

// ---- links to a shared folder: kept as written, never opened ----
const SHARE_HOSTS = ["drive.google.com", "docs.google.com", "photos.app.goo.gl", "photos.google.com", "dropbox.com", "dropboxusercontent.com", "db.tt", "onedrive.live.com", "1drv.ms", "sharepoint.com", "icloud.com", "box.com", "wetransfer.com", "we.tl", "sendspace.com", "mega.nz", "smugmug.com", "flickr.com", "imgur.com"];
export function findShareLinks(text) {
  const out = [];
  for (const m of String(text || "").matchAll(/https?:\/\/[^\s<>"')\]]+/gi)) {
    const url = m[0].replace(/[.,;:!?]+$/, "");
    let host; try { host = new URL(url).hostname.toLowerCase(); } catch { continue; }
    if (SHARE_HOSTS.some(h => host === h || host.endsWith("." + h)) && !out.includes(url)) out.push(url);
    if (out.length >= 20) break;
  }
  return out;
}

// ---- the thread: every message in a forward chain, newest first ----
// Strips quote markers, then reads header blocks (Gmail "---------- Forwarded message ---------", Outlook "From: / Sent:", Apple Mail
// "Begin forwarded message:", and "On <date>, <name> <address> wrote:"). messages[0] is the forwarding seat's own note; the LAST message is the earliest.
const ADDR = /([A-Za-z0-9._%+'\-]+@[A-Za-z0-9\-]+(?:\.[A-Za-z0-9\-]+)+)/;
export function parseAddress(s) {
  const raw = String(s || "").replace(/mailto:/gi, "");
  // The address is the one inside <angle brackets> when there is one: a display name can hold anything, including a seat's address
  // ("ann@hagerty.example" <evil@elsewhere.example>), and the display name must never be read as who sent it.
  const angle = /<([^<>]*)>\s*$/.exec(raw.trim()) || /<([^<>]*@[^<>]*)>/.exec(raw);
  const am = (angle && ADDR.exec(angle[1])) || (angle ? null : ADDR.exec(raw));
  if (!am) return null;
  const email = am[1].toLowerCase();
  let name = raw.replace(/^\s*(?:On|El|Le|Am)\s.*?\b\d{1,2}:\d{2}(?:\s*[AP]M)?,?\s*(?:at\s*)?/i, " ").replace(/\s*(?:wrote|escribi\u00f3|a \u00e9crit|schrieb)\s*:?\s*$/i, " ").replace(/<[^>]*>/g, " ").replace(ADDR, " ").replace(/["'()\[\]]/g, " ").replace(/\s+/g, " ").trim();
  if (/^(from|to|cc)$/i.test(name)) name = "";
  return { name: name || null, email };
}
const stripQuotes = text => String(text || "").replace(/\r/g, "").split("\n").map(l => l.replace(/^(?:\s*>)+ ?/, "")).join("\n");
const HEADER_FROM = /^\s*(?:\*?From\*?|De|Von|Da)\s*:\s*(.+)$/i;
const NEXT_HEADER = /^\s*\*?(?:Subject|Sent|Date|To|Cc|Reply-To|Objet|Betreff)\*?\s*:/i;
const WROTE = /^\s*(?:On|El|Le|Am)\s.{4,200}?(?:wrote|escribió|a écrit|schrieb)\s*:?\s*$/i;
export function splitThread(text) {
  const lines = stripQuotes(text).split("\n");
  const marks = [];   // [lineIndex, address|null]
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const hf = HEADER_FROM.exec(l);
    if (hf) {
      let hits = 0; for (let j = i + 1; j <= i + 6 && j < lines.length; j++) if (NEXT_HEADER.test(lines[j])) hits++;
      if (hits >= 1) {
        let addr = parseAddress(hf[1]);
        if (!addr) { for (let j = i + 1; j <= i + 4 && j < lines.length && !addr; j++) { const a = ADDR.exec(lines[j]); if (a && /^\s*(?:to|cc)\s*:/i.test(lines[j]) === false) addr = parseAddress(lines[j]); } }
        marks.push([i, addr]);
        continue;
      }
    }
    if (WROTE.test(l) || (/^\s*(?:On|El|Le|Am)\s/.test(l) && lines[i + 1] && /(?:wrote|schrieb)\s*:\s*$/i.test(lines[i + 1]) && !WROTE.test(lines[i + 1]))) {
      const joined = (l + " " + (WROTE.test(l) ? "" : lines[i + 1])).trim();
      marks.push([i, parseAddress(joined)]);
    }
  }
  const messages = [];
  const first = marks.length ? marks[0][0] : lines.length;
  messages.push({ from: null, body: lines.slice(0, first).join("\n").trim() });
  marks.forEach(([idx, addr], k) => {
    const end = k + 1 < marks.length ? marks[k + 1][0] : lines.length;
    messages.push({ from: addr, body: lines.slice(idx, end).join("\n").trim() });
  });
  return messages;
}
// The consignor: the sender of the EARLIEST message in the chain (the last block). An address that belongs to the org itself (a seat, the inbound
// address) is never the consignor; the earliest message from anyone else is taken instead. A plain email with no chain has no consignor.
export function consignorOf(messages, internalEmails = []) {
  const skip = new Set(internalEmails.map(e => String(e || "").toLowerCase()));
  for (let i = messages.length - 1; i >= 1; i--) {
    const f = messages[i].from;
    if (f && f.email && !skip.has(f.email)) return { name: f.name, email: f.email };
  }
  return null;
}

// ---- the seller's phone and asking figure: only where the message states them (labelled), from the consignor's own message when there is one ----
export function findPhone(text) {
  const t = String(text || "");
  const lab = /\b(?:phone|tel|telephone|mobile|cell|call me(?: on| at)?)\s*(?:number|no\.?|#)?\s*[:\-=]?\s*(\+?\d[\d\s().\-]{7,18}\d)/i.exec(t);
  const m = lab ? lab[1] : (/(?:^|[^\d])((?:\+?1[\s.\-]?)?\(?\d{3}\)?[\s.\-]\d{3}[\s.\-]\d{4})(?!\d)/.exec(t) || [])[1];
  if (!m) return null; const digits = m.replace(/\D/g, ""); return digits.length >= 10 && digits.length <= 15 ? m.trim().replace(/\s+/g, " ") : null;
}
export function findAsking(text) {
  const t = String(text || "");
  const m = /\b(?:asking(?: price)?|ask(?:ing)? for|price|hoping for|looking for|want(?:ing)?)\s*(?:is|of|about|around|:|-|=)?\s*\$\s*(\d[\d,]*(?:\.\d+)?)\s*(k\b)?/i.exec(t);
  if (!m) return null; let n = Number(m[1].replace(/,/g, "")); if (m[2]) n *= 1000;
  return Number.isFinite(n) && n >= 1000 && n <= 20000000 ? Math.round(n) : null;
}

export function consignorBodyOf(messages, internalEmails = []) {   // the body of the consignor's own (earliest) message
  const skip = new Set(internalEmails.map(e => String(e || "").toLowerCase()));
  for (let i = messages.length - 1; i >= 1; i--) { const f = messages[i].from; if (f && f.email && !skip.has(f.email)) return messages[i].body; }
  return "";
}

// ---- a car written as words: "2008 Porsche 911 Carrera S" ----
// Candidate phrases only (a year with the words after it); the caller resolves them through the one vehicle resolver (lib/vehicle.js) and
// takes a car only when make AND model resolve with no confirmation pending (product rule 6: a typo is never taken silently).
const NOT_A_MAKE = /^(?:at|in|on|the|a|an|and|or|for|to|of|by|from|with|is|was|has|have|had|miles?|km|jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?|mon|tue|wed|thu|fri|sat|sun|am|pm|model|year|and|i|we|it|my|our)$/i;
export function carPhrases(subject, body) {
  const out = [];
  const add = s => { const p = String(s || "").replace(/\s+/g, " ").trim(); if (p && !out.includes(p)) out.push(p); };
  const scan = text => {
    for (const m of String(text || "").matchAll(/\b((?:19[0-9]{2}|20[0-3][0-9]))\s+([A-Za-z][A-Za-z0-9\-]*(?:[ \t]+[A-Za-z0-9][A-Za-z0-9\-\/\.]*){0,5})/g)) {
      const words = m[2].replace(/[.,;:]+$/, "");
      if (NOT_A_MAKE.test(words.split(/\s+/)[0])) continue;
      add(`${m[1]} ${words}`);
    }
  };
  scan(String(subject || "").replace(/^\s*((?:fwd?|re|aw|tr)\s*:\s*)+/i, ""));
  scan(body);
  return out.slice(0, 8);
}

export const subjectKey = s => String(s || "").replace(/^\s*(?:(?:fwd?|re|aw|tr|fw)\s*:\s*)+/i, "").replace(/\s+/g, " ").trim().toLowerCase();

// message ids of this email's thread (own id, In-Reply-To, References), angle brackets stripped
export function threadIdsOf(headers = {}) {
  const get = k => { const key = Object.keys(headers || {}).find(h => h.toLowerCase() === k); const v = key ? headers[key] : ""; return Array.isArray(v) ? v.join(" ") : String(v || ""); };
  const ids = [];
  for (const k of ["message-id", "in-reply-to", "references"]) for (const m of get(k).matchAll(/<([^<>\s]+)>/g)) if (!ids.includes(m[1])) ids.push(m[1]);
  return ids;
}

// The whole submission in one read. body = the email text (forwarded note plus the chain), subject, internalEmails = seats and the inbound address.
// Returns facts only; whether a typed phrase is a real car is the caller's job (carPhrases -> resolver).
export function readSubmission({ subject = "", body = "", internalEmails = [], extraText = "" } = {}) {
  const text = [body, extraText].filter(Boolean).join("\n"), form = parseHagertyForm(text);   // the Hagerty "Tell us about your vehicle" form, or null for every other lead
  const searchable = `${subject}\n${text}`;
  const vins = findVins(searchable);
  const messages = splitThread(text);
  const mileage = findMileage(text), links = findShareLinks(text);
  const year = (/\b(19[0-9]{2}|20[0-3][0-9])\b/.exec(searchable) || [])[1];
  const chassis = vins.valid.length ? null : findChassis(searchable);
  return {
    form,
    vin: vins.valid[0] || (form && form.vin) || null,
    vinCheckInvalid: !!(vins.valid[0] && vins.checkDigitNotValid.includes(vins.valid[0])),
    vinMakerUnknown: !!(vins.valid[0] && vins.makerUnknown.includes(vins.valid[0])),
    moreVins: vins.valid.slice(1),
    vinFailedCheck: vins.failed,
    chassis: chassis || (form && form.chassis) || null,
    noVin: !vins.valid.length && !(form && form.vin),
    preWar1981: !!(!vins.valid.length && year && Number(year) < 1981),
    mileage: form && form.odometer ? { miles: form.odometer.miles, basis: "form", phrase: `${form.odometer.value} ${form.odometer.unit}` } : mileage ? { miles: mileage.miles, basis: mileage.basis, phrase: mileage.phrase } : null,
    gearbox: findGearbox(text),
    colour: findColour(text),
    links,
    consignor: consignorOf(messages, internalEmails),
    phone: findPhone(consignorBodyOf(messages, internalEmails) || text),
    asking: findAsking(consignorBodyOf(messages, internalEmails) || text),
    messages: messages.length,
    carPhrases: form && form.carWords ? [form.carWords, ...carPhrases(subject, text).filter(p => p !== form.carWords)] : carPhrases(subject, text)
  };
}
