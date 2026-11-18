// WHEN HAS FIND ANSWERED (Lane D, Nov 18 2026, lane-d-partial-bar-fix). The live smoke waits for Find's answer on the page. Find says it in ONE of two ways, and both are an answer: the engine's count line ("3 live matches") or its none line
// ("No 2009 BMWs are live right now. These are the nearest years, 2008."; "Nothing live ..."). A wait for the count line alone fails whenever the live board holds none of the car, a market fact, not a fault of the page.
// One pattern, imported by scripts/liveSmoke.mjs and by scripts/partialCarJoinCheck.mjs, so the smoke and the check judge the same words.
export const FIND_ANSWERED = /live match|Nothing live|No [^|.]*\blive\b|0 live/i;
