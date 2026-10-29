// THE SAME COLOURS FOR EVERYONE (Sam, Oct 28 2026): what the crew sees is what the public sees. Reads, on one page, every colour a visitor can see: the design tokens and the computed colour, background and border of the page's main pieces.
export const TOKENS = ["--ink", "--sec", "--soft", "--page", "--card", "--border", "--div", "--green", "--green-dk", "--tint", "--red", "--rail-bg", "--main-bg", "--rail-text", "--rail-active-bg", "--bg", "--text", "--dark", "--on-accent", "--num", "--track", "--underline", "--brand", "--line"];
export const SELECTORS = ["body", "h1", "a", "button", "input", "#gas-rail", "#gas-rail a", "#gas-main", ".sfc-card", ".sfc-range", ".vauc", ".kl-btn", ".gas-kl-btn", ".pill", ".chip", ".tab", ".hero-label", ".hc-note"];
export const colourProbe = (TOKENS, SELECTORS) => { const out = {}, rs = getComputedStyle(document.documentElement);
  for (const t of TOKENS) out[t] = rs.getPropertyValue(t).trim().toLowerCase();
  for (const s of SELECTORS) { const e = document.querySelector(s); if (!e) continue; const c = getComputedStyle(e); out[s] = [c.color, c.backgroundColor, c.borderTopColor, c.fill === "none" ? "" : c.fill].join(" | "); }
  return out; };
export const colourDiffs = (a, b) => Object.keys(a).filter(k => k in b && a[k] !== b[k]).map(k => `${k}: public ${a[k]} / crew ${b[k]}`);
