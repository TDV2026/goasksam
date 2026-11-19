// DIAGNOSTIC LOG LINES ARE OFF IN PRODUCTION (Lane E, Nov 3 2026, lane-e-vercelcost). Every console line a function prints is a Vercel observability event
// (5.02M in Oct 25 to Nov 3, the biggest line of the bill), and the per-request diagnostics (the cache a read walked, the stages of an engine read, the epoch poll)
// printed dozens of lines per Find search. A line that carries a DECISION or an ERROR stays on always; a line that only describes a normal read is a diagnostic and prints
// only when the DEBUG_LOG environment variable is 1. scripts/logLinesCheck.mjs holds each hot path to an agreed number of lines per request.
export const debugLogOn = () => process.env.DEBUG_LOG === "1";
export function diagLog(line) { if (debugLogOn()) { try { console.log(typeof line === "string" ? line : JSON.stringify(line)); } catch { /* diagnostics only */ } } }
