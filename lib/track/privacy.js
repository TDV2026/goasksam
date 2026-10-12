// What an analytics event may keep about a request (Oct 2026, Lane C; docs/analytics-events.md "Privacy in the data").
// Free text is cut and scrubbed, the browser string becomes a family and a device class, the referrer becomes
// a domain, and only the four whitelisted campaign fields survive. Nothing here ever returns an address.

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
// A VIN-shaped token: 11 to 17 letters and digits, no I, O or Q, with at least three digits and one letter.
const VIN_RE = /\b(?=[A-HJ-NPR-Z0-9]*[0-9][A-HJ-NPR-Z0-9]*[0-9][A-HJ-NPR-Z0-9]*[0-9])(?=[A-HJ-NPR-Z0-9]*[A-HJ-NPR-Z])[A-HJ-NPR-Z0-9]{11,17}\b/gi;
const PHONE_RE = /(?:\+?\d[\d\s().-]{8,}\d)/g;
const DIGITS_RE = /\d{7,}/g;

// Free text: VIN out first (to its own column), then email, phone and long digit runs, then cut to 120.
// The order matters: a VIN contains digit runs, and a phone pattern would otherwise eat part of it.
export function scrubText(s) {
  let text = String(s == null ? "" : s).slice(0, 400);
  let vin = null;
  text = text.replace(VIN_RE, m => { if (!vin) vin = m.toUpperCase(); return "[vin]"; });
  text = text.replace(EMAIL_RE, "[email]").replace(PHONE_RE, "[phone]").replace(DIGITS_RE, "[number]");
  text = text.replace(/\s+/g, " ").trim().slice(0, 120);
  return { text, vin };
}

const BOT_RE = /bot\b|bot\/|crawl|spider|slurp|facebookexternalhit|embedly|preview|headless|lighthouse|pagespeed|python-requests|python-urllib|curl\/|wget|node-fetch|undici|axios|go-http|java\/|okhttp|httpclient|scrapy|phantomjs|puppeteer|playwright|gptbot|claudebot|claude-web|anthropic|perplexity|ccbot|bytespider|amazonbot|applebot|yandex|baiduspider|duckduckbot|semrush|ahrefs|mj12bot|dotbot|petalbot|vercel/i;

export function isBotUa(ua) { const s = String(ua || ""); return !s || BOT_RE.test(s); }

// Browser family and device class only, never the string itself.
export function uaClass(ua) {
  const s = String(ua || "");
  if (isBotUa(s)) return { browser_family: "bot", device_class: "bot" };
  const browser_family = /edg\//i.test(s) ? "edge" : /samsungbrowser/i.test(s) ? "samsung" : /firefox|fxios/i.test(s) ? "firefox"
    : /chrome|crios|chromium/i.test(s) ? "chrome" : /safari/i.test(s) ? "safari" : "other";
  const device_class = /ipad|tablet|kindle|silk/i.test(s) || (/android/i.test(s) && !/mobile/i.test(s)) ? "tablet"
    : /mobi|iphone|ipod|android/i.test(s) ? "mobile" : "desktop";
  return { browser_family, device_class };
}

// Referring domain only. Our own pages and deploy hosts are not a referrer.
export function refDomain(ref) {
  try {
    const h = new URL(String(ref || "")).hostname.toLowerCase().replace(/^www\./, "");
    if (!h || h === "goasksam.com" || h.endsWith(".goasksam.com") || h.endsWith(".vercel.app") || h === "localhost") return null;
    return /^[a-z0-9.-]{1,80}$/.test(h) ? h : null;
  } catch { return null; }
}

export const UTM_FIELDS = ["utm_source", "utm_medium", "utm_campaign", "launch_wave"];
// The whitelist, from an object or a query string. Anything else in the address is ignored.
export function pickUtm(src) {
  const out = {};
  let get = () => null;
  if (typeof src === "string") { try { const u = new URLSearchParams(src.replace(/^[^?]*\?/, "")); get = k => u.get(k); } catch {} }
  else if (src && typeof src === "object") get = k => src[k];
  for (const k of UTM_FIELDS) {
    const v = get(k);
    out[k] = typeof v === "string" && /^[A-Za-z0-9_.-]{1,60}$/.test(v) ? v.toLowerCase() : null;
  }
  return out;
}

// A page path as a template: no query or fragment, and any VIN-shaped or id-shaped segment becomes :id.
export function pathTemplate(p) {
  const path = String(p || "/").split(/[?#]/)[0].slice(0, 200) || "/";
  return path.split("/").map(seg => {
    if (!seg) return seg;
    if (/^[a-z0-9]{5,17}$/i.test(seg) && /[0-9]/.test(seg) && /[a-z]/i.test(seg)) return ":id";
    if (/^\d{4,}$/.test(seg) || /^[0-9a-f-]{20,}$/i.test(seg) || seg.length > 60) return ":id";
    return seg.toLowerCase().replace(/[^a-z0-9_.-]/g, "-");
  }).join("/").slice(0, 60);
}
