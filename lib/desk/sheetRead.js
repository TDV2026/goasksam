// DESK VALUATIONS: the one place the page's read comes from. Lane B's sheet read call (sections 1 to 4 for a VIN or year make model plus mileage, and a tier when the expert clicked one) registers
// itself with useSheetEngine(fn); until it does, the fixtures in sheetShape.js answer for the fixture VINs and every other car gets null ("the read is not available for this car yet"), so
// no figure is ever invented. The page computes nothing, so every number on a sheet is whatever this returns.
import { fixtureRead } from "./sheetShape.js";
let engine = null;
export function useSheetEngine(fn) { engine = typeof fn === "function" ? fn : null; }
export async function readSheet(env, input) {
  if (engine) { try { const r = await engine(env, input); if (r) return r; } catch (e) { /* the engine failed: no read, never a stale or invented one */ } return null; }
  // Lane B, Nov 2026: with the archive reachable the read is the engine's (lib/sheetRead.js), never a fixture; the fixtures answer only when there is no archive to read (offline checks)
  if (env && env.supabaseUrl && env.supabaseKey && !(env && env.fixtures === true)) { try { const { sheetRead } = await import("../sheetRead.js"); return await sheetRead(env, input || {}); } catch (e) { return null; } }
  const f = fixtureRead(input || {}, new Date().toISOString());
  return f ? { ...f, fixture: true } : null;
}
