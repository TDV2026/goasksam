// One hero for the landing pages (Lane C, Oct 2026): text on the left, ONE car photo on the right fading
// into the page's warm off-white. The photo is a single file in the repo, HERO_IMAGE_PATH, served as a
// static asset; until it is uploaded the <img> removes itself on load error and the plain tint shows, so
// no page ever shows a broken image. Used by /buy now; built to be dropped into the /sell and
// /market-check landings unchanged (heroHtml + HERO_CSS).
//   Upload: img/hero/hero-car.jpg (repo root), 2400 x 1000 px, car in the right half, JPG under ~350 KB.
export const HERO_IMAGE_PATH = "img/hero/hero-car.jpg";
export const HERO_IMAGE_URL = "/" + HERO_IMAGE_PATH;

// inner: the hero's left-column HTML (already escaped by the caller).
// opts.layout = "banner" (Oct 2026, Market Check): for a centred page where the default left-text/
// right-photo split does not fit a narrow column, a full-width photo band sits ABOVE the text instead
// (the same shape the default layout already drops into on mobile - see HERO_CSS below). /buy's own
// call site passes no opts.layout, so its rendering is byte-for-byte unchanged.
export function heroHtml(inner, opts = {}) {
  const alt = opts.alt || "";
  const cls = opts.layout === "banner" ? "gas-hero gas-hero-banner" : "gas-hero";
  return `<section class="${cls}"><div class="gas-hero-img" aria-hidden="${alt ? "false" : "true"}"><img src="${HERO_IMAGE_URL}" alt="${alt.replace(/"/g, "&quot;")}" decoding="async" fetchpriority="high" onerror="this.parentNode.remove()"></div><div class="gas-hero-in">${inner}</div></section>`;
}

export const HERO_CSS = `
.gas-hero{position:relative;overflow:hidden;border-radius:0 0 18px 18px;background:linear-gradient(100deg,var(--page) 55%,#EDE7DA 100%)}
.gas-hero-img{position:absolute;inset:0 0 0 auto;width:62%;pointer-events:none}
.gas-hero-img img{width:100%;height:100%;object-fit:cover;object-position:right center;display:block}
.gas-hero-img::after{content:"";position:absolute;inset:0;background:linear-gradient(90deg,var(--page) 0%,rgba(246,243,236,.85) 22%,rgba(246,243,236,0) 60%)}
.gas-hero-in{position:relative;z-index:1}
@media (max-width:860px){
  .gas-hero{border-radius:0 0 14px 14px}
  .gas-hero-img{position:relative;inset:auto;width:auto;height:210px;margin:0 -16px 6px}
  .gas-hero-img::after{background:linear-gradient(180deg,rgba(246,243,236,0) 55%,var(--page) 100%)}
}
/* Banner layout (Oct 2026, Market Check): a full-width photo band above the text, the same shape the
   default layout already uses on mobile, applied at every width for a centred page. Scoped to
   .gas-hero-banner only - the default .gas-hero rules above (and /buy, which never passes this class)
   are untouched. */
.gas-hero.gas-hero-banner{border-radius:18px}
.gas-hero.gas-hero-banner .gas-hero-img{position:relative;inset:auto;width:auto;height:260px;margin:0}
.gas-hero.gas-hero-banner .gas-hero-img::after{background:linear-gradient(180deg,rgba(246,243,236,0) 50%,var(--page) 100%)}
@media (max-width:640px){
  .gas-hero.gas-hero-banner{border-radius:14px}
  .gas-hero.gas-hero-banner .gas-hero-img{height:190px}
}`;
