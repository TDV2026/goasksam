// THE SITE PAGES' CONTENT IS THE LIVE PAGE'S (Lane E, Nov 9 2026; Sam: "the content of every page stays exactly as it is now: same headings, same text, same links, same forms, same tables and lists. Nothing is removed, reworded or reordered; only the frame and the type change").
// For each page the preview's <main> is compared with the live handler's: the inner HTML byte for byte, then the parts a person reads, in order: every text line, every link target, every form field (tag, name, type, id, required), every table and list, and the structured data blocks. The history pages add their sale rows and photo URLs (sitePagesContentCheck covers them when scripts/sitePagesHistory is added).
// Mutants: a dropped paragraph, a dropped link, a dropped form field, a reworded heading, a reordered pair of sections, a dropped JSON-LD block: each fails.   node scripts/sitePagesContentCheck.mjs
import { SITE_KEYS, previewOf, liveOf, previewStranger, SP, tally } from "./sitePagesHarness.mjs";
const { ok, done } = tally();
const main = h => { const m = /<main\b[^>]*>([\s\S]*?)<\/main>/i.exec(h); if (!m) return null; const w = /^<div class="sitecol wrap">([\s\S]*)<\/div>$/.exec(m[1]); return w ? w[1] : m[1]; };   // the preview wraps the live <main>'s content in the one column div; take that off to compare
const lines = h => String(h).replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, "\n").replace(/&nbsp;/g, " ").split("\n").map(x => x.replace(/\s+/g, " ").trim()).filter(Boolean);
const hrefs = h => [...String(h).matchAll(/<a\b[^>]*\bhref\s*=\s*"([^"]*)"/gi)].map(m => m[1]);
const fields = h => [...String(h).matchAll(/<(input|textarea|select|button)\b([^>]*)>/gi)].map(m => m[1] + "|" + ["name", "type", "id", "required", "maxlength"].map(a => { const r = new RegExp("\\b" + a + "(?:\\s*=\\s*\"([^\"]*)\")?", "i").exec(m[2]); return r ? a + "=" + (r[1] == null ? "" : r[1]) : ""; }).join(","));
const blocks = (h, tag) => (String(h).match(new RegExp("<" + tag + "\\b[\\s\\S]*?</" + tag + ">", "gi")) || []).map(x => x.replace(/\s+/g, " "));
const ld = h => [...String(h).matchAll(/<script\b[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)].map(m => m[1].trim());
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function diffs(P, L) { const bad = [], pm = main(P), lm = main(L); if (pm == null) return ["the preview has no <main>"]; if (lm == null) return ["the live page has no <main>"];
  if (pm !== lm) bad.push("the <main> is not byte identical to the live page's");
  if (!same(lines(pm), lines(lm))) bad.push("the text lines differ"); if (!same(hrefs(pm), hrefs(lm))) bad.push("the link targets differ"); if (!same(fields(pm), fields(lm))) bad.push("the form fields differ");
  for (const t of ["table", "ul", "ol", "form"]) if (!same(blocks(pm, t), blocks(lm, t))) bad.push(`the ${t} blocks differ`);
  if (!same(ld(P), ld(L))) bad.push("the structured data differs"); return bad; }
const SAMPLE = {};
for (const k of SITE_KEYS) { const P = await previewOf(k), L = await liveOf(k); SAMPLE[k] = [P, L]; const b = diffs(P, L);
  ok(!b.length && lines(main(L)).length > 5, `/${SP.SITE[k].live.slice(1)}: the preview's content is the live page's (${lines(main(L)).length} text lines, ${hrefs(main(L)).length} links, ${fields(main(L)).length} form controls, ${blocks(main(L), "ul").length + blocks(main(L), "ol").length} lists, ${blocks(main(L), "table").length} tables, ${ld(L).length} structured data blocks)${b.length ? ": " + b.join("; ") : ""}`);
  ok((await previewStranger(k)) === 404, `/preview${SP.SITE[k].live}: a visitor without the crew cookie gets the 404`); }
// the pages with a form keep every field
{ const [P, L] = SAMPLE.feedback; ok(fields(main(L)).length >= 4 && same(fields(main(P)), fields(main(L))), "Feedback: the form keeps every field (name, email, message, send), as the live page has them"); }
// ---------- mutants (applied inside the page's <main>, where the content is) ----------
const inMain = fn => h => { const m = /(<main\b[^>]*>)([\s\S]*?)(<\/main>)/i.exec(h); return m ? h.replace(m[0], m[1] + fn(m[2]) + m[3]) : h; };
const mut = (name, key, fn) => { const [P, L] = SAMPLE[key], M = fn(P); ok(M !== P && diffs(M, L).length > 0, `mutant caught: ${name} (${diffs(M, L)[0] || "NOT CAUGHT"})`); };
mut("a paragraph dropped", "about", inMain(h => h.replace(/<p[^>]*>(?:(?!<\/p>)[\s\S])*<\/p>/, "")));
mut("a link dropped", "about", inMain(h => h.replace(/<a\b[^>]*>([^<]*)<\/a>/, "$1")));
mut("a form field dropped", "feedback", inMain(h => h.replace(/<textarea\b[\s\S]*?<\/textarea>/i, "")));
mut("a heading reworded", "how", inMain(h => h.replace(/(<h2[^>]*>)([^<]+)/, "$1$2 and more")));
mut("two sections reordered", "about", inMain(h => { const i = [...h.matchAll(/<h2\b/g)].map(m => m.index); return i.length > 3 ? h.slice(0, i[0]) + h.slice(i[1], i[2]) + h.slice(i[0], i[1]) + h.slice(i[2]) : h; }));
mut("a structured data block added", "business", h => h.replace("</body>", '<script type="application/ld+json">{"@type":"Thing"}</script></body>'));
done("sitePagesContentCheck");
