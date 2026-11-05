// THE NO-RANGE LINE FLAG (Lane E, Nov 5 2026). The engine's noRangeLine / findAnswer.noRange.line wording is WAITING ON SAM (lib/reasonWords.js, norange.* entries). Pages print it only behind this one flag:
// on for the crew, or for everyone when NORANGE_LINE=1 is set in the environment. Lane B removing the WAITING ON SAM marker is the signal to turn it on by default (delete the crew test and return true).
// The pieces that are NOT wording (the See the sales button on a card with no range, the full sales list, the pre-war bodies) never depend on this flag.
import { isCrewRequest } from "./_crew.js";
export const noRangeLineOn = req => process.env.NORANGE_LINE === "1" || (!!req && isCrewRequest(req));
