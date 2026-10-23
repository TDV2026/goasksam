// THE EMAIL CARD'S LAYOUT (Sam, Oct 23 2026): the one template every car email uses (Task alert, Before it ends, sold notice, digest sections). It takes a plain card
// description (the title, photo, strip, meta, tags, SAM lines, links, all of them text the engine already produced) and lays it out for a mail client: tables, inline
// styles, hosted photo with alt text, 600 wide and fine at 390, a dark twin, a plain-text twin. It composes nothing and imports nothing from a page.
const SITE = "https://goasksam.com";
const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
export const abs = u => !u ? "" : /^https?:/i.test(u) ? u : SITE + (u.charAt(0) === "/" ? u : "/" + u);
const C = { ink: "#1A1A1A", sec: "#5F6B64", line: "#D8D4CB", card: "#FFFFFF", panel: "#F1F0E9", green: "#1E4D38", dark: "#1A1D1A" };
const SANS = "Arial,Helvetica,sans-serif", SERIF = "Georgia,'Times New Roman',serif";
// Mail clients that honour it get a dark twin; every element also carries explicit light colours, so a client that forces its own dark mode still reads.
export const EMAIL_CARD_STYLE = `<meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark"><style>@media (prefers-color-scheme: dark){.gc-card{background:#1D221F!important;border-color:#3A423D!important}.gc-t,.gc-v{color:#F3F1EA!important}.gc-m,.gc-s{color:#B9C2BC!important}.gc-panel{background:#262D29!important}.gc-chip{border-color:#4A544E!important;color:#DDE3DE!important}.gc-mc{color:#F3F1EA!important;border-color:#8A948E!important}.gc-g{color:#8FD0A8!important;border-color:#8FD0A8!important}}@media (max-width:480px){.gc-pad{padding-left:14px!important;padding-right:14px!important}.gc-btn{display:block!important;width:100%!important;margin:0 0 8px!important}}</style>`;

export function cardHtmlFromData(d) {
  const A = d.url ? esc(d.url) : "", M = esc(d.mcUrl), VIEW = d.viewLabel || "View auction";
  const row = (inner, pad) => `<tr><td class="gc-pad" style="padding:${pad || "0 18px"}">${inner}</td></tr>`;
  const label = (t, bg, fg) => `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td style="background:${bg};color:${fg};font-family:${SANS};font-size:13px;line-height:18px;font-weight:600;padding:6px 10px;border-radius:4px">${esc(t)}</td></tr></table>`;
  const photo = d.photo && A ? `<tr><td style="padding:0"><a href="${A}" target="_blank" rel="noopener" style="display:block"><img src="${esc(d.photo)}" alt="${esc(d.title)}" width="600" style="display:block;width:100%;max-width:600px;height:auto;border:0;border-radius:11px 11px 0 0;background:#E6E3DA;color:#1A1A1A;font-family:${SANS};font-size:16px;line-height:22px"></a></td></tr>` : "";
  const bid = d.bid
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td style="background:${C.dark};color:#FFFFFF;font-family:${SANS};padding:8px 12px;border-radius:4px"><span style="font-size:11px;letter-spacing:.12em;font-weight:700">${esc(d.bid.key)}</span> <span style="font-family:${SERIF};font-size:20px;font-weight:600">&nbsp;${esc(d.bid.val)}</span>${d.bid.time ? ` <span style="font-size:12px;color:#D5DAD6">&nbsp;${esc(d.bid.time)}</span>` : ""}</td></tr></table>`
    : (d.bidNote ? `<p class="gc-m" style="margin:0;font-family:${SANS};font-size:14px;color:${C.sec}">${esc(d.bidNote)}</p>` : "");
  const chips = d.chips.concat([]).map(c => `<span class="gc-chip" style="display:inline-block;margin:0 6px 6px 0;padding:3px 10px;border:1px solid ${C.line};border-radius:999px;font-family:${SANS};font-size:13px;color:${C.sec}">${esc(c)}</span>`).join("")
    + (d.hist ? `<a class="gc-g" href="${M}" target="_blank" rel="noopener" style="display:inline-block;margin:0 6px 6px 0;padding:3px 10px;border:1px solid ${C.green};border-radius:999px;font-family:${SANS};font-size:13px;color:${C.green};text-decoration:none">${esc(d.hist)}</a>` : "");
  const samLines = d.sam.map(x => /rf-range/.test(x.cls)
    ? `<p class="gc-t" style="margin:0 0 6px;font-family:${SERIF};font-size:24px;line-height:30px;color:${C.ink}">${esc(x.text)}</p>`
    : /rf-basis/.test(x.cls) ? `<p class="gc-s" style="margin:8px 0 0;padding-top:8px;border-top:1px solid ${C.line};font-family:${SANS};font-size:13px;line-height:19px;color:${C.sec}">${esc(x.text)}</p>`
    : `<p class="gc-t" style="margin:0 0 4px;font-family:${SERIF};font-size:16px;line-height:23px;color:${C.ink}">${esc(x.text)}</p>`).join("");
  const sam = samLines ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td class="gc-panel" style="background:${C.panel};border-left:3px solid ${C.green};padding:10px 14px"><p class="gc-g" style="margin:0 0 4px;font-family:${SANS};font-size:11px;letter-spacing:.14em;font-weight:700;color:${C.green}">SAM</p>${samLines}</td></tr></table>` : "";
  const buttons = `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>${A ? `<td class="gc-btn" style="padding:0 10px 0 0"><a href="${A}" target="_blank" rel="noopener" style="display:inline-block;padding:12px 18px;border-radius:8px;background:${C.green};color:#FFFFFF;font-family:${SANS};font-size:15px;font-weight:600;text-decoration:none">${esc(VIEW)} &#8599;</a></td>` : ""}<td class="gc-btn"><a class="gc-mc" href="${M}" target="_blank" rel="noopener" style="display:inline-block;padding:11px 17px;border-radius:8px;border:1px solid ${C.line};color:${C.ink};font-family:${SANS};font-size:15px;font-weight:600;text-decoration:none">Market Check</a></td></tr></table>`;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="gc-card" style="max-width:600px;margin:0 0 24px;background:${C.card};border:1px solid ${C.line};border-radius:12px;border-collapse:separate">` +
    photo + (d.pill ? row(label(d.pill, C.dark, "#FFFFFF"), "12px 18px 0") : "") + row(bid, "10px 18px 0") +
    row(`<p class="gc-t" style="margin:0;font-family:${SERIF};font-size:23px;line-height:29px;color:${C.ink}">${esc(d.title)}</p>`, "12px 18px 0") +
    (d.meta ? row(`<p class="gc-m" style="margin:0;font-family:${SANS};font-size:14px;line-height:20px;color:${C.sec}">${esc(d.meta)}</p>`, "4px 18px 0") : "") +
    (chips ? row(chips, "10px 18px 0") : "") + (sam ? row(sam, "6px 18px 0") : "") + row(buttons, "14px 18px 18px") + "</table>";
}

export function cardTextFromData(d) {
  return [d.title, d.pill, d.bid ? `${d.bid.key[0] + d.bid.key.slice(1).toLowerCase()} ${d.bid.val}${d.bid.time ? (d.bid.joiner || " at ") + d.bid.time : ""}` : d.bidNote, d.meta, [...d.chips, d.hist].filter(Boolean).join(", "), ...d.sam.map(x => x.text),
    d.url ? `${d.viewLabel || "View auction"}: ${d.url}` : null, `Market Check: ${d.mcUrl}`].filter(Boolean).join("\n");
}
