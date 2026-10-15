import { execFileSync } from "node:child_process";

// The crew cookie, so the check measures speed and not the per-visitor ceiling ("Sam's catching his breath"). The crew code is
// read from the macOS Keychain item goasksam-crew per run, held in memory only long enough to sign the cookie, and never printed,
// written, exported or placed in an address. No Keychain item (CI, another machine) = no cookie, and the pages load as before.
export async function crewCookie() {
  if (process.platform !== "darwin" || process.argv.includes("--no-crew")) return null;
  try {
    const code = execFileSync("security", ["find-generic-password", "-s", "goasksam-crew", "-a", "goasksam", "-w"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    if (!code) return null;
    process.env.CURTAIN_CREW_CODE = code;
    try { const { mintCrewCookieValue } = await import("../lib/_crew.js"); return mintCrewCookieValue(); } finally { delete process.env.CURTAIN_CREW_CODE; }
  } catch (e) { return null; }
}

