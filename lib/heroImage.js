// One hero for the landing pages (Lane C, Oct 2026): text on the left, ONE car photo on the right fading
// into the page's warm off-white. The photo is a single file in the repo, HERO_IMAGE_PATH, served as a
// static asset; until it is uploaded the <img> removes itself on load error and the plain tint shows, so
// no page ever shows a broken image. Used by /buy now; built to be dropped into the /sell and
// /market-check landings unchanged (heroHtml + HERO_CSS).
//   Upload: img/hero/hero-car.jpg (repo root), 2400 x 1000 px, car in the right half, JPG under ~350 KB.
export const HERO_IMAGE_PATH = "img/hero/hero-car.jpg";
export const HERO_IMAGE_URL = "/" + HERO_IMAGE_PATH;

// inner: the hero's left-column HTML (already escaped by the caller).
export function heroHtml(inner, opts = {}) {
  const alt = opts.alt || "";
  return `<section class="gas-hero"><div class="gas-hero-img" aria-hidden="${alt ? "false" : "true"}"><img src="${HERO_IMAGE_URL}" alt="${alt.replace(/"/g, "&quot;")}" decoding="async" fetchpriority="high" onerror="this.parentNode.remove()"></div><div class="gas-hero-in">${inner}</div></section>`;
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
}`;
