// One-time pass token: a stateless, HMAC-signed link that grants a small fixed
// number of TOTAL searches (not per day), enforced per-token so the whole link is
// worth N searches and then dies for everyone. Signed so only links minted with the
// server secret are valid (a user cannot forge `?once=` or a gas_once cookie to mint
// free searches); no DB migration needed. The nonce is the counted identity.
//
// Mint one with:  node -e "import('./lib/_onepass.js').then(m=>console.log(m.mintOnce()))"
import crypto from "node:crypto";

const SECRET = process.env.ONCE_SECRET || "gasm-once-8f2k-secret-2026";

function sig(nonce) {
  return crypto.createHmac("sha256", SECRET).update(String(nonce)).digest("hex").slice(0, 16);
}

// Fresh signed token: <nonce>.<sig>. URL- and cookie-safe (hex + one dot).
export function mintOnce() {
  const nonce = crypto.randomBytes(9).toString("hex");
  return `${nonce}.${sig(nonce)}`;
}

// Returns the nonce (the counted identity) if the token is authentic, else null.
// Constant-time compare; never throws.
export function verifyOnce(token) {
  const s = String(token || "");
  const dot = s.indexOf(".");
  if (dot < 1) return null;
  const nonce = s.slice(0, dot);
  const mac = s.slice(dot + 1);
  if (!/^[0-9a-f]{6,64}$/.test(nonce) || !/^[0-9a-f]{16}$/.test(mac)) return null;
  const good = sig(nonce);
  try {
    if (mac.length === good.length && crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(good))) return nonce;
  } catch { /* fall through */ }
  return null;
}
