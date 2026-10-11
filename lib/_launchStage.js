// LAUNCH_STAGE (Oct 2026): ONE shared setting controlling which public products are reachable,
// read fresh per request (never cached at module load - the same convention every other env-var
// flag in this app uses, e.g. lib/_ceilings.js marketCheckDailyCarCap), so a Vercel env change
// takes effect on the next request with no redeploy needed.
//
//   stage 0 (default, missing or unreadable): the public sees Sell only - plus How Sam decides,
//     PowerSellers, Send feedback, Privacy, About, sign in (none of those are "staged" below; they
//     are always on and this module has nothing to say about them).
//   stage 1: adds Market Check and Tasks.
//   stage 2: adds Buy. Sam's own call: launch happens at stage 2, everything at once - the stages
//     exist so he can pull one product back by changing one Vercel value, in minutes, without a
//     deploy.
//
// LAUNCH_BUSINESS is a SEPARATE on/off switch (default off) for /business - the For business link
// and page are not part of the numeric stage at all.
//
// Crew (lib/_crew.js isCrewRequest) always sees and reaches every product at every stage - that is
// what isReleased() below answers for almost every caller (nav links, page addresses, API gates).
// The bare stage number (launchStage()) is for bookkeeping only (the route table, tests) - product
// code should call isReleased(product, req), not compare launchStage() itself.
import { isCrewRequest } from "./_crew.js";
import { hasServerCredential } from "./_credential.js";

const VALID_STAGES = [0, 1, 2];

// Every GATED product and the stage it first appears at. Anything not listed here (sell, how,
// powersellers, about, privacy, sign-in) is always on - isReleased() returns true for an unlisted
// product name without even reading the env var, so a typo'd product name fails OPEN, never closed
// (a page that should never have been gated in the first place does not silently vanish).
const STAGE_OF = { "market-check": 1, tasks: 1, buy: 2 };

// launchStage(req): the raw numeric stage. req is OPTIONAL and only used for the test-only
// override below - every real caller that just wants "is X available" should use isReleased()
// instead, which also accounts for crew.
export function launchStage(req) {
  // TEST-ONLY OVERRIDE (Job 3's requirement: provable without touching production's real value,
  // and "a test only override that cannot be set from a request"): the override is read ONLY after
  // the SAME server credential every other probe/test path in this app already requires
  // (lib/_credential.js hasServerCredential - the x-probe-key/x-ops-key header or the cron bearer
  // secret) has been verified. A request with no credential can never influence this value no
  // matter what headers it sends - it is not "a request-settable flag with a secret gate on it", it
  // is unreachable without the secret, same as every other probe-only branch in this codebase.
  if (req && hasServerCredential(req)) {
    const t = Number(req.headers && req.headers["x-launch-stage-test"]);
    if (VALID_STAGES.includes(t)) return t;
  }
  const n = Number(process.env.LAUNCH_STAGE);
  return VALID_STAGES.includes(n) ? n : 0;
}

export function launchBusinessOn(req) {
  if (req && hasServerCredential(req)) {
    const t = req.headers && req.headers["x-launch-business-test"];
    if (t === "1" || t === "0") return t === "1";
  }
  return process.env.LAUNCH_BUSINESS === "1";
}

// isReleased(product, req): the one call every gate (nav links, address redirects, API refusals,
// sitemap filtering) should make. True for crew always, at every stage. For the public: "business"
// follows LAUNCH_BUSINESS; a staged product follows LAUNCH_STAGE >= its own stage; anything not in
// STAGE_OF is always on.
export function isReleased(product, req) {
  if (isCrewRequest(req)) return true;
  if (product === "business") return launchBusinessOn(req);
  const need = STAGE_OF[product];
  if (need == null) return true;
  return launchStage(req) >= need;
}

// A short, plain refusal body for a gated API endpoint - one shape everywhere, mirroring the
// existing CURTAIN_SEALED precedent (api/sellerDecision.js, api/vehicleIdentity.js:
// {status:"sealed", error:"Not open yet."}) so a client that already knows how to read that shape
// (if any does) reads this the same way. 403, never 404 (the endpoint exists, it is just not open).
export function notReleasedJson(res) {
  return res.status(403).json({ status: "sealed", error: "Not open yet." });
}

// STAGE_OF exported read-only for the route table / tests - callers should still prefer
// isReleased() over reading this directly.
export const STAGES = Object.freeze({ ...STAGE_OF });
