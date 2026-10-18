import { execFileSync } from "node:child_process";

// The crew cookie, so the check measures speed and not the per-visitor ceiling ("Sam's catching his breath"). The crew code is
// read from the macOS Keychain item goasksam-crew per run, held in memory only long enough to sign the cookie, and never printed,
// written, exported or placed in an address. No Keychain item (CI, another machine) = no cookie, and the pages load as before.
export async function crewCookie() {
  if (process.platform !== "darwin" || process.argv.includes("--no-crew")) return null;
  try {
    const code = execFileSync("security", ["find-generic-password", "-s", "goasksam-crew", "-a", "goasksam", "-w"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    if (!code) return null;
    // The item holds the SIGNED cookie value (v1.<exp>.<sig>, minted by /api/crew; Oct 17 2026). Re-minting it as if it
    // were the code signed with the wrong key, so every "crew" read was refused as crew and hit the visitor's daily cap.
    // A signed value is used as is while it has not expired; anything else is treated as the code, as before.
    const signed = signedCrewValue(code);
    if (signed !== undefined) return signed;
    process.env.CURTAIN_CREW_CODE = code;
    try { const { mintCrewCookieValue } = await import("../lib/_crew.js"); return mintCrewCookieValue(); } finally { delete process.env.CURTAIN_CREW_CODE; }
  } catch (e) { return null; }
}


// v1.<expiry ms>.<signature> (lib/_crew.js): the value itself, or null once expired; undefined when the item is not a
// signed value.
export function signedCrewValue(v, nowMs = Date.now()) {
  const m = /^v1\.(\d{12,14})\.[A-Za-z0-9_-]{16,}$/.exec(String(v || ""));
  if (!m) return undefined;
  return Number(m[1]) > nowMs ? v : null;
}
