// SPEND EMAILS TO SAM (Oct 2026, Lane C): one email when model spend in the last 24 hours passes 80 percent of the
// daily cap, one when it reaches the cap, each at most once per Pacific day. Triggered from the spend read every
// model guard already makes (lib/_ceilings.js buyChatSpend24h), so no extra cron. Sent through the existing mail
// path (lib/_email.js sendTaskEmail). The recipient is a setting, SPEND_ALERT_EMAIL, read from the environment;
// unset, nothing is sent (one log line per process).
const usd2 = n => "$" + (Math.round((Number(n) || 0) * 100) / 100).toFixed(2);
const usd0 = n => "$" + Math.round(Number(n) || 0);

// level: "eighty" | "cap". split: { buy, tasks, sell } in dollars.
export function spendAlertEmail(level, usd, split, cap) {
  const s = split || {};
  const lines = [`Buy chat: ${usd2(s.buy)}`, `Tasks: ${usd2(s.tasks)}`, `Sell chat: ${usd2(s.sell)}`];
  const keepRunning = "Searches, Task matching and Task emails keep running.";
  const subject = level === "cap" ? "Model spend has reached the daily cap" : "Model spend has passed 80 percent of the daily cap";
  const paras = level === "cap"
    ? [`Model spend in the last 24 hours is ${usd2(usd)}, at the ${usd0(cap)} cap.`, lines.join("\n"),
       `Written answers are now paused on Buy, Tasks and Sell until spend in the last 24 hours falls back under the cap. ${keepRunning}`,
       "This email is sent once a day."]
    : [`Model spend in the last 24 hours is ${usd2(usd)}, past 80 percent of the ${usd0(cap)} cap.`, lines.join("\n"),
       `At ${usd0(cap)}, written answers pause on Buy, Tasks and Sell until spend in the last 24 hours falls back under the cap. ${keepRunning}`,
       "This heads-up is sent once a day."];
  const text = paras.join("\n\n") + "\n\nGoAskSam";
  const esc = x => String(x).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const html = `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#1A1A1A;max-width:560px">${paras.map(p => `<p>${esc(p).replace(/\n/g, "<br>")}</p>`).join("")}<p>GoAskSam</p></div>`;
  return { subject, text, html };
}

let noAddressLogged = false;
// Which email (if any) is due for this spend: the cap one at or over the cap, else the 80 percent one.
export function spendAlertLevel(usd, cap) {
  if (usd == null || !(cap > 0)) return null;
  return usd >= cap ? "cap" : usd >= 0.8 * cap ? "eighty" : null;
}
// seen(level, day) -> bool and mark(level, day): the once-a-day record (the ceilings ledger, lib/_ceilings.js).
export async function maybeSendSpendAlert({ usd, split, cap, seen, mark, now = new Date(Date.now()), send }) {
  const level = spendAlertLevel(usd, cap);
  if (!level) return { sent: null };
  const to = String(process.env.SPEND_ALERT_EMAIL || "").trim();
  if (!to) { if (!noAddressLogged) { noAddressLogged = true; console.log("spend email skipped: SPEND_ALERT_EMAIL is not set"); } return { sent: null, skipped: "no address" }; }
  const day = new Date(now).toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
  if (await seen(level, day)) return { sent: null, already: level, day };
  // Marked before sending, so two instances reading the same spend send one email; when the cap is reached the
  // 80 percent email for the day is marked too (one email says it all).
  await mark(level, day); if (level === "cap") await mark("eighty", day);
  const msg = spendAlertEmail(level, usd, split, cap);
  const sender = send || (await import("./_email.js")).sendTaskEmail;
  const r = await sender({ to, subject: msg.subject, text: msg.text, html: msg.html });
  return { sent: level, day, status: r && r.ok ? "sent" : r && r.skipped ? "skipped_" + (r.reason || "") : "failed", ...msg };
}
