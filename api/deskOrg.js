// Sam Desk Valuations: org and seat admin (Lane S, Nov 4 2026). One thin function over lib/desk/{orgSettings,domain,seats,storage,retention}.js.
// Reachable only by the signed crew cookie (the operator) or a signed-in account holding an active seat; anyone else gets the same
// disguised 404 the Desk gives, with no CORS headers and no JSON. It is not linked from any page, nav or sitemap, and not in robots.
// A seat acts only in its own org (canActOnOrg). It computes nothing: it stores and returns settings, seats and storage state.
import { sendDisguisedNotFound } from "../lib/_notFound.js";
import { cors as gasCors } from "../lib/_cors.js";
import { failBody } from "../lib/_fail.js";
import { supabaseEnv } from "../lib/_supabase.js";
import { routeLimit, sendTooMany } from "../lib/_routeLimit.js";
import { resolveCaller, canActOnOrg, canAdminOrg, listSeats, addSeat, deactivateSeat } from "../lib/desk/seats.js";
import { getOrgSettings, putOrgSettings, publicSettings } from "../lib/desk/orgSettings.js";
import { startDomainVerification, checkDomainVerification } from "../lib/desk/domain.js";
import { ensureOrgBucket, purgeOrg, validOrg } from "../lib/desk/storage.js";
import { retentionSweep } from "../lib/desk/retention.js";

export default async function handler(req, res) {
  const env = supabaseEnv();
  let caller = null;
  try { caller = env ? await resolveCaller(req, { env }) : null; } catch { caller = null; }
  if (!caller) return sendDisguisedNotFound(res, req);
  gasCors(req, res, { methods: "POST, OPTIONS", headers: "Content-Type, Authorization" });
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  { const lim = await routeLimit(env, req, "desk_org", { route: "/api/deskOrg" }); if (!lim.ok) return sendTooMany(res, lim.retryAfter); }   // a seat's line (device and address); the crew is exempt
  const body = req.body || {};
  const org = validOrg(body.org) ? body.org : caller.org;
  const deny = (status, error) => res.status(status).json({ ok: false, error });
  try {
    if (!canActOnOrg(caller, org)) return deny(403, "not your org");
    switch (body.action) {
      case "settings.get": { const s = await getOrgSettings(env, org); return s ? res.status(200).json({ ok: true, settings: publicSettings(s) }) : deny(500, "could not read the settings"); }
      case "settings.put": {
        if (!canAdminOrg(caller, org)) return deny(403, "only an admin can change the settings");
        const r = await putOrgSettings(env, { org, patch: body.patch, operator: caller.operator === true, seatId: caller.seatId });
        return res.status(r.ok ? 200 : 400).json(r);
      }
      case "domain.start": case "domain.check": {
        if (!canAdminOrg(caller, org)) return deny(403, "only an admin can verify the sending domain");
        const r = await (body.action === "domain.start" ? startDomainVerification(env, org) : checkDomainVerification(env, org));
        return res.status(r.ok ? 200 : 400).json(r);
      }
      case "seats.list": { const r = await listSeats(env, caller, org); return res.status(r.status || 200).json(r); }
      case "seats.add": { const r = await addSeat(env, caller, org, { email: body.email, role: body.role, displayName: body.displayName }); return res.status(r.status || 200).json(r); }
      case "seats.remove": { const r = await deactivateSeat(env, caller, org, body.seatId); return res.status(r.status || 200).json(r); }
      // Operator only (the crew): the org's bucket, the org's data removed on request, the retention sweep.
      case "storage.ensure": { if (!caller.operator) return deny(403, "operator only"); const r = await ensureOrgBucket(env, org); return res.status(r.ok ? 200 : 500).json(r); }
      case "org.purge": {
        if (!caller.operator) return deny(403, "operator only");
        if (body.confirm !== org) return deny(400, "confirm must repeat the org id");
        const r = await purgeOrg(env, { org, actor: "crew", reason: "org_request" });
        return res.status(r.ok ? 200 : 500).json(r);
      }
      case "retention.sweep": { if (!caller.operator) return deny(403, "operator only"); const r = await retentionSweep(env, { actor: "crew" }); return res.status(r.ok ? 200 : 500).json(r); }
      default: return deny(400, "unknown action");
    }
  } catch (e) { return res.status(500).json(failBody("deskOrg", e, { ok: false })); }
}
