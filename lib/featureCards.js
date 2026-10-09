// Feature cards for the landing pages (Lane C, Oct 2026): each point in its own white rounded card with a
// soft shadow, the icon in a round pale green circle, the title in the serif headline face, the body in
// the page's sans one shade darker than the secondary text. Shared so Buy, the new Sell and Market Check
// ("What you get.") look the same: render with featureCardsHtml and include FEATURE_CARDS_CSS once.
// Spacing comes from padding, never heading margins, so a page's own h2/h3 reset (Buy's
// "#lead h2{margin:0}") cannot collapse it.
// Four cards in a row, two by two at tablet width, one column on a phone.
//   items: [{ icon: "<svg ...>", title: "...", body: "..." }], already-escaped HTML strings.
//   opts.headingTag: the title's tag (default "h3"; Buy keeps its existing "h2").
//   item.eyebrow (optional): a small label above the title. Three items sit three across (.c3).
export function featureCardsHtml(items, opts = {}) {
  const tag = opts.headingTag || "h3", list = items || [];
  return `<div class="gas-fcards${list.length === 3 ? " c3" : ""}">${list.map(it =>
    `<div class="gas-fcard"><span class="gas-fic" aria-hidden="true">${it.icon || ""}</span>${it.eyebrow ? `<span class="gas-fce">${it.eyebrow}</span>` : ""}<${tag} class="gas-fct">${it.title}</${tag}><p class="gas-fcb">${it.body}</p></div>`).join("")}</div>`;
}

export const FEATURE_CARDS_CSS = `
.gas-fcards{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:18px}
.gas-fcard{display:flex;flex-direction:column;align-items:flex-start;background:#FFFFFF;border-radius:16px;padding:24px 22px 26px;box-shadow:0 1px 2px rgba(21,32,26,.05),0 10px 28px -16px rgba(21,32,26,.22)}
.gas-fic{width:64px;height:64px;flex:none;border-radius:50%;background:#E3EEE6;display:grid;place-items:center;margin-bottom:18px}
.gas-fic svg{width:40px;height:40px;fill:none;stroke:#1E4D38;stroke-width:1.5;stroke-linejoin:round;stroke-linecap:round}
.gas-fcard .gas-fct{margin:0;padding-bottom:8px;font:500 20px/1.25 var(--serif);color:#16140F;letter-spacing:-.005em}
.gas-fcard .gas-fcb{margin:0;font:400 14.5px/1.6 var(--sans);color:#4A5650}
.gas-fcards.c3{grid-template-columns:repeat(3,minmax(0,1fr))}
.gas-fce{margin:0 0 6px;font:600 11.5px/1.2 var(--sans);letter-spacing:.14em;text-transform:uppercase;color:#1E4D38}
@media (max-width:980px){.gas-fcards,.gas-fcards.c3{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (max-width:560px){.gas-fcards,.gas-fcards.c3{grid-template-columns:1fr;gap:14px}.gas-fcard{padding:20px 18px 22px}}`;
