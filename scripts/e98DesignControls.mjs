// NO DESIGN TEST CONTROL ON ANY PAGE (Sam, Oct 28 2026). One list of what must never appear in a page the site serves, shared by noDesignControlsCheck.mjs (every page handler, as the public and as the crew, every static page and script) and e98LiveCheck.mjs (every live page).
export const DESIGN_CONTROLS = [
  [/gas-pal-bar|gas-pal-b\b|gas-pal-reset|gas-pal-close|gas-pal-sw|data-pal-btn|id="gas-pal/, "the palette switcher's markup or style"],
  [/gas-pal-lbl|aria-label="Color palette"|class="[^"]*pal[^"]*"[^>]*>\s*Palette\s*</, "the word PALETTE as a control label"],
  [/localStorage\.(?:get|set|remove)Item\(\s*["']gas-pal["']/, "a stored palette read or write"],
  [/data-pal\b|\[data-pal|setAttribute\(\s*["']data-pal["']/, "the palette attribute or its CSS"],
  [/PALETTE_SWITCHER|PALETTE_APPLY|paletteHead\b|paletteSwitcherHtml|ALL_PALETTES_CSS/, "the palette script or its names"],
  [/gas_cardv2|[?&]cardv2=/, "the legacy-card toggle (?cardv2, gas_cardv2)"],
  [/dotsChartHtml|\bhc-dot\b|<circle[^>]*class="hc-/, "a dots chart (per-sale points)"],
  [/[?&](?:palette|pal|theme|layout|design|skin|variant|preview)=1?\b[^"']*["'][^<]{0,40}(?:setAttribute|localStorage|classList)/, "a query string that changes the look"],
];
export const designControlProblems = (text, label = "") => DESIGN_CONTROLS.filter(([re]) => re.test(text)).map(([re, what]) => `${label}${label ? ": " : ""}${what} (${(re.exec(text) || [""])[0].slice(0, 50)})`);
