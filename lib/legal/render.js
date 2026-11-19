// Turns an approved legal text (lib/legal/privacyText.js, termsText.js) into the page's HTML without changing one word: "H3 " lines become headings,
// "- " lines bullets, **bold** bold, blank lines end a paragraph. Everything else is escaped as it stands. scripts/legalPagesCheck.mjs reads the
// rendered text back and compares it to the source.
const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const inline = s => esc(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
export function legalBodyHtml(text) {
  const out = []; let para = [], list = [];
  const flushP = () => { if (para.length) { out.push("<p>" + inline(para.join(" ")) + "</p>"); para = []; } };
  const flushL = () => { if (list.length) { out.push("<ul>" + list.map(x => "<li>" + inline(x) + "</li>").join("") + "</ul>"); list = []; } };
  for (const line of String(text).split("\n")) {
    if (!line.trim()) { flushP(); flushL(); continue; }
    if (line.startsWith("H3 ")) { flushP(); flushL(); out.push('<h2 class="lg-h">' + inline(line.slice(3)) + "</h2>"); continue; }
    if (line.startsWith("- ")) { flushP(); list.push(line.slice(2)); continue; }
    flushL(); para.push(line);
  }
  flushP(); flushL();
  return out.join("\n");
}
