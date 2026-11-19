// THE HISTORY LINK GRAPH (Lane E, Nov 7 2026): the one place that decides which history page links to which, so no crawlable
// page is an orphan. Built from the nightly rollout (vin_rollout_cache: the hub list and every VIN page with its stored
// identity), read as stored: nothing here queries the archive, runs the engine or computes a market figure. It only
// names pages that already exist in the sitemaps and joins them.
//   /history                   -> every make, and under it every model hub (grouped by make)
//   /history/{make}            -> that make's model hubs (the parent make hub)
//   /history/{make}-{model}    -> its sibling hubs and the make hub (hubNav)
//   /history/{slug}/{VIN}      -> its hub, its make hub and three nearby VINs (nearbyVins)
// The graph is pure: it takes the rollout object and returns plain data; api/history.js draws it.
import { parseHubSlug, hubSlug, slugify } from "../api/_historyData.js";

const titleCase = s => String(s || "").split("-").filter(Boolean).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
const SITE = "https://goasksam.com";
const pathOf = loc => String(loc || "").replace(SITE, "");

const CACHE = new WeakMap();
// roll: the rollout object ({ hubs: [slug], hubLast: {slug: date}, vins: [{vin, loc, lastmod, ident}] }). Null when it is unreadable.
export function historyGraph(roll) {
  if (!roll || !Array.isArray(roll.hubs)) return null;
  if (CACHE.has(roll)) return CACHE.get(roll);
  const makeName = new Map(), famName = new Map(), byKey = new Map();
  for (const u of roll.vins || []) {
    const i = u && u.ident; if (!i || !i.make || !i.family || !u.vin || !u.loc) continue;
    makeName.set(slugify(i.make), i.make);
    const k = hubSlug(i.make, i.family);
    if (!famName.has(k)) famName.set(k, i.family);
    let a = byKey.get(k); if (!a) byKey.set(k, a = []);
    a.push({ vin: u.vin, year: Number(i.year) || null, lastmod: String(u.lastmod || ""), href: pathOf(u.loc), make: i.make, family: i.family });
  }
  const makes = new Map(), hubLast = roll.hubLast || {};
  for (const h of roll.hubs) {
    const p = parseHubSlug(h); if (!p || p.year) continue;
    let m = makes.get(p.makeSlug);
    if (!m) makes.set(p.makeSlug, m = { slug: p.makeSlug, name: makeName.get(p.makeSlug) || titleCase(p.makeSlug), hubs: [] });
    const fam = famName.get(h) || titleCase(p.modelSlug);
    m.hubs.push({ slug: h, family: fam, name: m.name + " " + fam, last: String(hubLast[h] || "") });
  }
  for (const m of makes.values()) m.hubs.sort((a, b) => a.family.localeCompare(b.family, "en", { numeric: true }));
  const g = { makes, byKey, makeList: [...makes.values()].sort((a, b) => a.name.localeCompare(b.name, "en", { numeric: true })) };
  CACHE.set(roll, g);
  return g;
}

// A make's hub page exists when the graph holds it. Dead-photo hubs (noindex, out of the sitemap) are left out.
export function makeOf(g, makeSlug, deadHubs) {
  const m = g && g.makes.get(String(makeSlug || ""));
  if (!m) return null;
  const hubs = m.hubs.filter(h => !(deadHubs && deadHubs.has(h.slug)));
  return hubs.length ? { ...m, hubs } : null;
}

// The index: every make with at least one live hub, in name order.
export function indexMakes(g, deadHubs) {
  return g ? g.makeList.map(m => makeOf(g, m.slug, deadHubs)).filter(Boolean) : [];
}

// Sibling hubs of the same make, newest activity first, the page's own hub left out, capped. `all` says whether the cap cut any.
export function hubNav(g, hubSlugStr, deadHubs, cap = 24) {
  const p = parseHubSlug(hubSlugStr); if (!p) return null;
  const m = makeOf(g, p.makeSlug, deadHubs);
  if (!m) return null;
  const own = p.year ? hubSlug(p.makeSlug, p.modelSlug) : String(hubSlugStr);
  const sibs = m.hubs.filter(h => h.slug !== own).sort((a, b) => b.last.localeCompare(a.last) || a.family.localeCompare(b.family));
  return { make: { slug: m.slug, name: m.name }, siblings: sibs.slice(0, cap), more: sibs.length > cap };
}

// Three nearby VIN pages for one car: the same spec (make + family), nearest model years first, newest page date next. Never the car itself.
export function nearbyVins(g, make, family, year, vin, n = 3) {
  if (!g || !make || !family) return [];
  const list = g.byKey.get(hubSlug(make, family)) || [];
  const y = Number(year) || 0;
  return list.filter(x => x.vin !== vin)
    .map(x => ({ x, d: y && x.year ? Math.abs(x.year - y) : 999 }))
    .sort((a, b) => a.d - b.d || b.x.lastmod.localeCompare(a.x.lastmod) || a.x.vin.localeCompare(b.x.vin))
    .slice(0, n).map(o => o.x);
}
