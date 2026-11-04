// Sam Desk Valuations: a VIN or year make model typed at the top of the Desk (Lane D, Nov 2026; spec "The Desk also takes a VIN or year make model typed at the top").
// POST /api/deskIntake {text}  -> the same sheet the inbound email makes (owned by the calling seat, status New, the engine read started in the background).
// Seat-only, like the other Desk endpoints. Words that are not a car (or a VIN that fails its check digit) are answered with the reason, never made into a row.
import { createTypedSheet, decodeVinPublic } from "../lib/desk/intake/run.js";
import { resolveSeat } from "../lib/desk/seat.js";
import { supabaseStore } from "../lib/desk/intake/store.js";
import { engineReader } from "../lib/desk/intake/engineRead.js";
import { resolveVehicle } from "../lib/vehicle.js";
import { supabaseEnv } from "../lib/_supabase.js";
import { keepAlive } from "../lib/keepAlive.js";
import { sendDisguisedNotFound } from "../lib/_notFound.js";
import { failBody } from "../lib/_fail.js";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  try {
    const env = supabaseEnv();
    if (!env) return res.status(500).json({ error: "not configured" });
    const store = supabaseStore(env);
    const who = await resolveSeat(req, store);
    if (!who) return sendDisguisedNotFound(res, req);
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
    const reader = engineReader(store, env);
    const out = await createTypedSheet({ org: who.org, seat: who.seat, text: String((req.body && req.body.text) || "").slice(0, 200), deps: { store, resolveVehicle, decodeVin: decodeVinPublic, startRead: (s, c, r) => { keepAlive(reader(s, c, r)); } } });
    return res.status(out.ok ? 200 : 422).json(out.ok ? { ok: true, sheetId: out.sheet.id, label: out.sheet.car_label, status: out.sheet.status } : { ok: false, reason: out.reason, vinFailedCheck: out.vinFailedCheck || [] });
  } catch (e) {
    return res.status(500).json(failBody("deskIntake", e, { ok: false, reason: "error" }));
  }
}
