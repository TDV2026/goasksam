// How old the stored partner premium numbers are (Oct 2026, Lane C). Read only, zero OCD, no compute.
// The nightly premium job (docs/nightly-workflow.yml, task=premium&persist=1) stamps each gate-passing partner's
// partners.specialties.premium.computedAt when it writes. This reads those stamps back, so a failed night shows
// as an aging number instead of nothing: used by the ops task premiumfresh and the /admin Cost and Reliability tab.
// A partner below the gate has its premium cleared on a successful run, so it carries no stamp: listed, not aged.
export const PREMIUM_STALE_HOURS = 36;

export function premiumFreshness(rows, now = new Date()) {
  const hours = t => Math.round((now.getTime() - t) / 36e5 * 10) / 10;
  const partners = (rows || []).map(r => {
    const p = r.specialties && r.specialties.premium, t = Date.parse((p && p.computedAt) || "");
    return { name: r.name, slug: r.slug, active: !!r.active, computedAt: Number.isFinite(t) ? new Date(t).toISOString() : null, hoursOld: Number.isFinite(t) ? hours(t) : null };
  });
  const stamps = partners.filter(p => p.computedAt).map(p => Date.parse(p.computedAt));
  const last = stamps.length ? Math.max(...stamps) : null;
  const hoursOld = last == null ? null : hours(last);
  return {
    lastRefreshed: last == null ? null : new Date(last).toISOString(),
    hoursOld,
    staleAfterHours: PREMIUM_STALE_HOURS,
    // Amber when the newest stamp is past the limit, or when no partner has a stamp at all.
    stale: hoursOld == null || hoursOld > PREMIUM_STALE_HOURS,
    partners,
  };
}

export async function readPremiumFreshness(select, env, now = new Date()) {
  const rows = await select(env, "partners?select=name,slug,active,specialties&order=name.asc");
  if (!Array.isArray(rows)) throw new Error("partners read failed");
  return premiumFreshness(rows, now);
}
