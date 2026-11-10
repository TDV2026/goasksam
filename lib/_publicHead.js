// THE PUBLIC HEAD (Lane E, Nov 10 2026, go live Stage 2; Sam's answer): a new page that answers a PUBLIC address wears the head of the CURRENT page for the same address, byte for byte:
// the title, the meta description, the meta robots tag (or none, when the current page has none), the canonical, the Open Graph and Twitter tags and every JSON-LD block. Only the h1
// (and the body) are the new design's. The preview head ("GoAskSam preview: Find", noindex, nofollow, no canonical, no description, no structured data) never reaches a public response.
// Nothing is written here: every tag is lifted verbatim from the page the handler already answered.
const META = n => new RegExp(`<meta\\b[^>]*\\bname=["']${n}["'][^>]*>`, "gi");
const PROP = p => new RegExp(`<meta\\b[^>]*\\bproperty=["']${p}[^"']*["'][^>]*>`, "gi");
const SHAPES = [
  ["title", /<title\b[^>]*>[\s\S]*?<\/title>/gi],
  ["description", META("description")],
  ["robots", META("robots")],
  ["canonical", /<link\b[^>]*\brel=["']canonical["'][^>]*>/gi],
  ["og", PROP("og:")],
  ["twitter", META("twitter:[^\"']*")],
  ["ld", /<script\b[^>]*\btype=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi]
];
export function headTagsOf(html) {
  const out = {}; const s = String(html || "");
  const head = (/<head\b[\s\S]*?<\/head>/i.exec(s) || [s])[0];
  for (const [k, re] of SHAPES) { re.lastIndex = 0; out[k] = (k === "ld" ? s : head).match(re) || []; re.lastIndex = 0; }
  return out;
}
export function applyPublicHead(newHtml, legacyHtml) {
  let h = String(newHtml || "");
  const legacy = headTagsOf(legacyHtml);
  for (const [, re] of SHAPES) { re.lastIndex = 0; h = h.replace(re, ""); re.lastIndex = 0; }
  const block = ["title", "description", "robots", "canonical", "og", "twitter", "ld"].flatMap(k => legacy[k]).join("\n");
  return /<\/head>/i.test(h) ? h.replace(/<\/head>/i, () => block + "\n</head>") : h;
}

// PUBLIC ADDRESSES (Stage 2): the crew previews name their own addresses (/preview/market-check, /preview/tasks/api, the patched onebox script). A public response names the public ones:
// each preview address is replaced by the address it previews, longest first, and the patched Market Check script by the script the current page loads. Text replacement only.
const ADDR = [
  ["/preview/market-check/example", "/market-check"], ["/preview/tasks/mine", "/tasks/mine"], ["/preview/tasks/api", "/api/tasks"], ["/preview/for-business", "/business"],
  ["/preview/how-sam-decides", "/how-sam-decides"], ["/preview/market-check", "/market-check"], ["/preview/whats-new", "/whats-new"], ["/preview/feedback", "/feedback"],
  ["/preview/business", "/business"], ["/preview/history", "/history"], ["/preview/privacy", "/privacy"], ["/preview/about", "/about"], ["/preview/terms", "/terms"],
  ["/preview/tasks", "/tasks"], ["/preview/sell", "/sell"], ["/preview/find", "/find"], ["/preview/home", "/"]
];
export function publicAddresses(newHtml, legacyHtml) {
  let h = String(newHtml || "");
  const js = /<script\b[^>]*\bsrc="([^"]*onebox\.js[^"]*)"/i.exec(String(legacyHtml || ""));
  if (js) h = h.split("/preview/market-check/onebox.js").join(js[1]);
  h = h.split('"/preview"+u').join("u");   // Sell's recent searches: the saved address, not a crew address
  for (const [from, to] of ADDR) h = h.split(from).join(to);
  return h;
}
