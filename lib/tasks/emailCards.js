// THE TASK EMAIL'S CARDS (Sam, Oct 23 2026, stage 3): the same car, the same card as Find and the Tasks page, in an email's own layout
// (tables, inline styles, hosted image URLs, alt text, 600 pixels that works at 390, readable in dark mode, with a plain-text twin).
// NOTHING is composed here: every piece of text comes out of FIND'S OWN card builders (lib/findCardKit.js runs the card code lifted from
// Find's client: the title, the dark source and time label, the LAST BID SEEN strip with its time, the miles and place, the tags, the
// SAM range panel with "The typical range for cars like this." and its plain line, Sold before / Listed before), fed with the same engine
// card (lib/tasks/fullCards.js, Find's enrichFast). This file only lays those pieces out for a mail client. Photo and View auction go to
// the auction; Market Check and the history tag go to the car's history page. No source counts, no first person, no other tools.
import { tagOutbound, trackedLink } from "../outboundUtm.js";
import vm from "node:vm";
import { findCardKitJs } from "../findCardKit.js";

const SITE = "https://goasksam.com";
let P = null;
function parts() {
  if (P) return P;
  const win = { GAS_REL: { mc: true, tasks: true }, matchMedia: () => ({ matches: false }) };
  const ctx = vm.createContext({ window: win, document: { querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, getElementById: () => null, body: {} }, Date, Math, JSON, String, Number, Array, Object, RegExp, encodeURIComponent, Intl, URL,
    setInterval: () => 0, clearInterval() {}, setTimeout, requestAnimationFrame: () => 0, MutationObserver: function () { this.observe = () => {}; }, console, fetch: () => Promise.resolve({ json: () => ({}) }), sessionStorage: { getItem: () => null }, localStorage: { getItem: () => null }, location: { pathname: "/", search: "" } });
  vm.runInContext(findCardKitJs(), ctx);
  return (P = win.GASCARD.parts);
}
const unesc = s => String(s).replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
const strip = h => unesc(String(h || "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const abs = u => !u ? "" : /^https?:/i.test(u) ? u : SITE + (u.charAt(0) === "/" ? u : "/" + u);
const slug = s => String(s || "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

// The card as data: Find's own pieces, text only.
export function emailCardData(l) {
  const f = parts();
  const money = f.moneyHtml(l, false);
  const mk = /class="mk">([^<]*)</.exec(money), mv = /class="mv">([^<]*)</.exec(money), mt = /class="mt">([^<]*)</.exec(money);
  const chips = [...String(f.chipsHtml(l)).matchAll(/<span class="spec[^"]*"[^>]*>([^<]*)<\/span>/g)].map(m => unesc(m[1]).trim()).filter(Boolean);
  const hist = strip(f.histChipHtml(l)) || null;
  const pending = l.market && (l.market.kind === "pending" || l.market.stillReading);
  // emailMode none (the engine's call): nothing about the market prints in the email
  let sam = pending || (l.market && l.market.emailMode === "none") ? [] : [...String(f.slInner(l)).matchAll(/<p class="([^"]*)">([\s\S]*?)<\/p>/g)].map(m => ({ cls: m[1], text: strip(m[2]) })).filter(x => x.text && !/still reading/i.test(x.text));
  // E98: Find's card now prints only the leading option's range, and the options' own lines only in the expanded panel. The email's mode (the engine's call) still prints every option's own line:
  // range_with_options adds them under the range; options replaces the card's lead figure and its "other option" line with them, so no option prints twice.
  const em = l.market && l.market.emailMode, ol = l.market && Array.isArray(l.market.optionLines) ? l.market.optionLines.filter(x => typeof x === "string" && x) : [];
  if (ol.length && (em === "range_with_options" || em === "options")) {
    if (em === "options") for (let i = sam.length - 1; i >= 0; i--) if (/fx-lab|fx-range|fx-near/.test(sam[i].cls)) sam.splice(i, 1);
    const at = sam.findIndex(x => /fx-count/.test(x.cls)), add = ol.map(text => ({ cls: "fx-opt", text }));
    sam.splice(at < 0 ? sam.length : at, 0, ...add);
  }
  const q = (l.market && l.market.query) || "";
  return {
    id: l.id, title: f.carTitle(l), pill: f.pillText(l), photo: l.photo_url || null, url: l.url ? trackedLink(tagOutbound(l.url, "tasks_email")) : null,
    bid: mk && mv ? { key: unesc(mk[1]), val: unesc(mv[1]), time: mt ? unesc(mt[1]) : "" } : null, bidNote: mk ? "" : strip(money),
    meta: [...String(f.metaLine(l)).matchAll(/<span class="nw">([^<]*)<\/span>/g)].map(m => unesc(m[1])).join(" · "),
    chips, hist, sam,
    mcUrl: l.mc_url ? abs(l.mc_url) : (l.history_url ? abs(l.history_url) : (q ? `${SITE}/market-check?car=${encodeURIComponent(slug(q))}` : `${SITE}/market-check`))
  };
}

import { cardHtmlFromData, cardTextFromData, EMAIL_CARD_STYLE } from "./emailCardLayout.js";
export { cardHtmlFromData, cardTextFromData, EMAIL_CARD_STYLE };
export function emailCardHtml(l) { return cardHtmlFromData(emailCardData(l)); }
export function emailCardText(l) { return cardTextFromData(emailCardData(l)); }
