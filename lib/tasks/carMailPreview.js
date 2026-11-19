// CREW-ONLY PREVIEW OF THE REAL-CAR EMAILS (Sam, Oct 23 2026): every email the product can send about a car, built by the SAME builders a
// real send uses, from REAL live cars in the stored listings, and never sent (no address, no table write, no send). One page: for each
// email its subject, the HTML as a mail client would show it at 600 wide (and the plain-text twin), and a plain line saying whether it
// carries the car card. Nothing is composed here: the pieces are taskEmailBody / messageFor / watches testSend, unchanged.
//
// THE CAR EMAILS THE PRODUCT CAN SEND (the whole list; each carries the one card template, Find's own card in a mail layout):
//   1. Task match ("Sam found a ..., live now")         lib/tasks/tasks.js taskEmailBody, card per car (emailCards.js)
//   2. Daily Task email (several updates in one)       lib/tasks/digest.js composeDigest: its first block is the Task match above, the rest are sections
//   3. Before it ends (a Task or Find car, 2 hours out) lib/live/buyAlerts.js messageFor, card of the car
//   4. VIN-watch / spec-watch events ("Sold again", "Back at auction", "Sam saw N sell")  lib/live/watches.js, card per event
//   5. Sold notice (a watched car's sale and the range)   lib/live/watches.js, the same event card
// NOT car emails (no car card by design): "Sam has started your search" (the Task's own summary), partner lead notices, account and
// sign-in mail.
import { taskEmailBlocks, taskEmailBody, taskEmailSubject, cardOfMatch, taskFits, emailsOffLink } from "./tasks.js";
import { composeDigest } from "./digest.js";
import { listingFacts } from "../live/search.js";
import { runSearch } from "../live/samChat.js";
import { factsFor, messageFor as beforeMessage } from "../live/buyAlerts.js";
import { testSend } from "../live/watches.js";

const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const TASK = { id: "00000000-0000-4000-8000-0000000000e1", summary: "Sam is looking for manual Porsche 911s from 1964 to 1998", filters: { make: "Porsche", model: "911", year_min: 1964, year_max: 1998, gearbox: "manual" } };

export async function carMailPreview(env) {
  const mails = [];
  const add = (label, builder, m, note) => mails.push({ label, builder, subject: m.subject || "", html: m.html || "", text: m.text || "", card: /<table/i.test(m.html || "") && /alt="/i.test(m.html || ""), note: note || "" });
  const sr = await runSearch(env, TASK.filters, { keep: r => r.status === "live" && !(r.end_time && Date.parse(r.end_time) <= Date.now()) }).catch(() => null);
  const pool = ((sr && sr.matches) || []).map(x => x.r).filter(r => taskFits(TASK, r));
  const withBid = pool.find(r => Number(r.current_bid_usd) > 0), noBid = pool.find(r => r.current_bid_usd == null || Number(r.current_bid_usd) <= 0);
  const body = async (r, first) => { const card = cardOfMatch({ r, facts: listingFacts(r) }); const blocks = (await taskEmailBlocks(env, [r], [card])).map(b => ({ ...b, card })); return { card, ...taskEmailBody(TASK, blocks, { first }), subject: taskEmailSubject([card]) }; };
  let matchA = null, matchB = null;
  if (withBid) { matchA = await body(withBid, true); add("1. Task match, a car with a bid (a person's first email)", "taskEmailBody", matchA, "the junk-folder line shows on a first email only"); }
  if (noBid) { matchB = await body(noBid, false); add("1. Task match, a car with no bids", "taskEmailBody", matchB); }
  const endsSoon = pool.find(r => r.end_time && Date.parse(r.end_time) > Date.now()) || withBid || noBid;
  if (endsSoon) {
    const f = await factsFor(env, endsSoon);
    add("3. Before it ends (the car's own email)", "buyAlerts messageFor", beforeMessage(f, endsSoon, { first: false, userId: "preview", stopAll: emailsOffLink("preview") }));
    if (matchA) {
      const sec = beforeMessage(f, endsSoon, { first: false, userId: "preview", section: true, stopAll: emailsOffLink("preview") });
      const d = composeDigest([{ subject: matchA.subject, text: matchA.text, html: matchA.html, cars: 1 }, { ...sec, cars: 1 }], { every: "daily", first: false, stopAll: emailsOffLink("preview") });
      add("2. Daily Task email (a Task match, then a Before it ends section)", "digest composeDigest", d, "the first block is the same Task match card");
    }
  }
  // The sold notice: the first live car in the pool whose spec has a recent sale on record (14 days), so the card always has a real sale.
  const since = new Date(Date.now() - 14 * 864e5).toISOString().slice(0, 10);
  for (const c of pool.slice(0, 8)) {
    const r = await testSend(env, { kind: "spec", listing_id: c.id, since, first: false }).catch(() => null);
    if (r && r.html) { add("4 and 5. Watch event and sold notice (a sale of a watched car, with the range)", "watches messageFor", r); break; }
  }
  return page(mails);
}

function page(mails) {
  const rows = mails.map((m, i) => `<section><h2>${esc(m.label)}</h2><p class="meta">Builder: ${esc(m.builder)} &middot; Subject: <b>${esc(m.subject)}</b> &middot; ${m.card ? "carries the car card" : "NO car card in this email"}${m.note ? " &middot; " + esc(m.note) : ""}</p>
<iframe title="${esc(m.label)}" sandbox="" srcdoc="${esc(m.html)}" style="width:600px;max-width:100%;height:900px;border:1px solid #D8D4CB;background:#fff"></iframe>
<details><summary>Plain-text twin</summary><pre>${esc(m.text)}</pre></details></section>`).join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Car email preview</title><style>body{margin:0;background:#F6F3EC;color:#15201A;font:16px/1.5 system-ui,sans-serif}main{max-width:700px;margin:0 auto;padding:28px 16px 60px}h1{font:600 26px/1.2 Georgia,serif}h2{font:600 18px/1.3 system-ui;margin:34px 0 4px}.meta{margin:0 0 10px;color:#5E6B64;font-size:14px}pre{white-space:pre-wrap;font-size:13px}</style></head><body><main><h1>Car email preview</h1><p class="meta">Crew only. Real live cars, the real builders, nothing sent. ${mails.length} emails below.</p>${rows || "<p>No live car matched right now.</p>"}</main></body></html>`;
}
