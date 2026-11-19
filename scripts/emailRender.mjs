// Render the Task email fixtures (scripts/emailFixtures.mjs) to HTML and plain text under docs/screens/emails/. node scripts/emailRender.mjs
import fs from "node:fs";
const { buildEmails } = await import("./emailFixtures.mjs");
const esc = x => String(x).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const SET = {
  first:   ["1 First email after three Tasks were created (golden rows 73 to 75)", "The catch-up: headed Live right now, one footer line, each car by its engine emailMode (options for the 911 and the S-Class, range with options for the Corvette)."],
  options: ["2 First email of a new Task whose car has options", "A 2001 BMW M3 Convertible: the pooled range and each option's own line (emailMode range_with_options)."],
  later:   ["3 A later email for the same three Tasks", "Headed New since your last email; only cars new since the last email."],
  modes:   ["4 Later email: range, sales and none", "emailMode range (M3 Coupe), sales (Diablo, sales and no range), none (959, nothing about the market)."],
  watchOne:  ["5 Watch section: one sale of a sold-car Task", "The sale, the engine's band before it and where it sat; no heading, the Task's own Open, Pause and Stop, one footer line."],
  watchMany: ["6 Watch section: three sales", "A sale with its band, a sale with no band (nothing placed), a sale the engine set aside (its reason, never placed)."],
  watchMore: ["7 Watch section: thirteen sales", "Ten shown, the count covers all thirteen, and the line for the rest."],
  watchVin:  ["8 Watch section: an exact car", "Back at auction (last bid seen with its time), offered and did not sell, sold, each by its own event."],
  combined:  ["9 One email: a catch-up car section, a watch section and the quiet sibling line", "Live right now over the car section only; the watch sections carry no heading; one footer line."]
};
const out = "docs/screens/emails"; fs.mkdirSync(out, { recursive: true });
const mails = await buildEmails(), made = [];
for (const [k, m] of Object.entries(mails)) {
  const [title, note] = SET[k];
  const page = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)}</title></head><body style="margin:0;background:#EFEDE6"><div style="max-width:640px;margin:0 auto;padding:16px;font-family:Arial,sans-serif;font-size:13px;color:#5F5A53"><p style="margin:0 0 4px"><b>${esc(title)}</b></p><p style="margin:0 0 4px">Subject: <b>${esc(m.subject)}</b></p><p style="margin:0 0 12px">${esc(note)} Fixture numbers, not market data.</p><div style="background:#fff;padding:16px">${m.html}</div></div></body></html>`;
  fs.writeFileSync(`${out}/${k}.html`, page); fs.writeFileSync(`${out}/${k}.txt`, `Subject: ${m.subject}\n\n${m.text}\n`); made.push(`${out}/${k}.html`);
}
console.log(made.join("\n"));
