// Transactional email via Resend (Vercel-native). Used to notify a PowerSeller
// partner when a seller submits a lead, with feedback@goasksam.com BCC'd on EVERY
// send so there is always a second, independent record of a real lead even if the
// dashboard/journey layer has an issue (the Aug 2026 intro-bug lesson).
//
// BEST-EFFORT and NON-BLOCKING: a lead is written to seller_leads regardless. Any
// email failure (no API key configured yet, Resend down, bad address) is logged and
// swallowed so it never fails the seller's submission. Guarded on RESEND_API_KEY:
// until Sam sets it in Vercel, sends are skipped (reported as {skipped:true}), not errored.

const FEEDBACK_BCC = "feedback@goasksam.com";
// Resend authorizes the EXACT domain in the From address. The verified sending
// domain is the subdomain mail.goasksam.com (verifying it does NOT cover the root
// goasksam.com), so the From address must live on it - a root-domain sender would be
// rejected 403 "domain is not verified". Override with LEAD_EMAIL_FROM if the sending
// address/domain changes. The feedback@goasksam.com BCC is a recipient, not a sender,
// so it needs no verification.
const DEFAULT_FROM = "GoAskSam Leads <leads@mail.goasksam.com>";

function esc(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Slug -> display name for Sam's recommended platform, so the partner sees the exact
// platform the seller was already told. A known slug maps to its label; a value that is
// already a label (or unknown) passes through as-is; an empty value yields "" and the
// rows filter below drops the line (graceful degradation when no platform rec existed).
const PLATFORM_LABELS = {
  bringatrailer: "Bring a Trailer", bat: "Bring a Trailer", carsandbids: "Cars & Bids",
  pcarmarket: "PCARMarket", hemmings: "Hemmings", hagerty: "Hagerty Marketplace",
  sothebysmotorsport: "Sotheby's Motorsport", rmsothebys: "RM Sotheby's", gooding: "Gooding",
  mbmarket: "MB Market", collectingcars: "Collecting Cars", carandclassic: "Car & Classic",
  carsandclassic: "Car & Classic", pistonheads: "PistonHeads", themarket: "The Market",
  broadarrow: "Broad Arrow", barrettjackson: "Barrett-Jackson", acc: "All Collector Cars",
  allcollectorcars: "All Collector Cars", bonhams: "Bonhams"
};
function platformDisplayName(value) {
  const raw = String(value == null ? "" : value).trim();
  if (!raw) return "";
  return PLATFORM_LABELS[raw.toLowerCase().replace(/[^a-z0-9]/g, "")] || raw;
}

// Build the lead notification body from the same facts the lead row carries. No
// market claims or fees (product rule 11); this is a routing/contact notice only.
function renderLeadEmail({ partnerName, reference, seller, car, choice, recommendedPath, priorSaleUrl }) {
  const rows = [
    ["Car", car.raw],
    ["Sam's platform read", platformDisplayName(recommendedPath)],
    ["Reference", reference],
    ["Seller email", seller.email],
    ["Location", [car.state, car.region].filter(Boolean).join(", ")],
    ["Mileage", car.mileage],
    ["Condition", car.condition],
    ["Service records", car.serviceRecords],
    ["Title", car.title],
    ["Asking / target", car.targetPrice],
    ["Timeline", car.timeline],
    ["Notes", car.notes],
    ["Destination", choice.destination]
  ].filter(([, v]) => v != null && String(v).trim() !== "");

  // VIN feature (4c): the exact car's prior auction, if we matched it. Just the link
  // and a one-line label, no editorializing, so the partner can read the history.
  const priorLine = priorSaleUrl ? `This car's previous auction: ${priorSaleUrl}` : null;
  const textLines = [
    `New GoAskSam lead${partnerName ? ` for ${partnerName}` : ""}.`,
    "",
    ...rows.map(([k, v]) => `${k}: ${v}`),
    ...(priorLine ? ["", priorLine] : []),
    "",
    "Reply directly to the seller at the email above to start the conversation."
  ];
  const htmlRows = rows.map(([k, v]) =>
    `<tr><td style="padding:4px 12px 4px 0;color:#6b6b6b;vertical-align:top;white-space:nowrap">${esc(k)}</td><td style="padding:4px 0;color:#171717">${esc(v)}</td></tr>`
  ).join("");
  const priorHtml = priorSaleUrl
    ? `<p style="margin:0 0 16px"><span style="color:#6b6b6b">This car's previous auction:</span> <a href="${esc(priorSaleUrl)}" style="color:#0b5c3e">${esc(priorSaleUrl)}</a></p>`
    : "";
  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.5;color:#171717">
    <p style="margin:0 0 14px">New GoAskSam lead${partnerName ? ` for <strong>${esc(partnerName)}</strong>` : ""}.</p>
    <table style="border-collapse:collapse;margin:0 0 16px">${htmlRows}</table>
    ${priorHtml}
    <p style="margin:0;color:#6b6b6b">Reply directly to the seller at the email above to start the conversation.</p>
  </div>`;
  return { text: textLines.join("\n"), html };
}

// Sends the PowerSeller lead notification. `partnerEmail` may be null (partner
// destination not yet on file) - in that case the notification still goes to
// feedback@ so the record exists, and the partner is added once their address is set.
// Returns { ok, skipped?, id?, status?, error? }; never throws.
// Shared low-level send: TO the partner (or feedback@ if no partner address yet), BCC
// feedback@ on every send. Guarded on RESEND_API_KEY; best-effort, never throws.
async function resendSend({ partnerEmail, replyTo, subject, text, html }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { ok: false, skipped: true, reason: "no_resend_key" };
  const from = process.env.LEAD_EMAIL_FROM || DEFAULT_FROM;
  const to = partnerEmail && partnerEmail.includes("@") ? [partnerEmail] : [FEEDBACK_BCC];
  // BCC feedback@ on EVERY send, unless it is already the sole recipient (no partner
  // email yet) - Resend rejects an address that is both `to` and `bcc`.
  const bcc = to.includes(FEEDBACK_BCC) ? undefined : [FEEDBACK_BCC];
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to, ...(bcc ? { bcc } : {}), reply_to: replyTo || undefined, subject, text, html })
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, status: res.status, error: body?.message || `resend ${res.status}` };
    return { ok: true, id: body?.id || null, to, bcc: bcc || null };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

export async function sendLeadNotification({ partnerEmail, partnerName, reference, seller, car, choice, recommendedPath, priorSaleUrl }) {
  const subjectCar = String(car.raw || "a car").trim();
  const subject = `New GoAskSam lead: ${subjectCar}${partnerName ? ` (${partnerName})` : ""}`;
  const { text, html } = renderLeadEmail({ partnerName, reference, seller, car, choice, recommendedPath, priorSaleUrl });
  return resendSend({ partnerEmail, replyTo: seller.email, subject, text, html });
}

// Second-touch email: the optional VIN + note the seller adds after the lead sent.
// Same recipient rule (TO partner, BCC feedback@). Best-effort, never throws.
export async function sendAdditionalDetails({ partnerEmail, partnerName, reference, seller, car, vin, note }) {
  const carStr = String(car || "the car").trim();
  const rows = [
    ["Car", carStr],
    ["Reference", reference],
    ["Seller email", seller.email],
    ["VIN", vin],
    ["Note", note]
  ].filter(([, v]) => v != null && String(v).trim() !== "");
  const intro = `Additional details from ${seller.email} on the ${carStr}${partnerName ? ` for ${partnerName}` : ""}.`;
  const text = [intro, "", ...rows.map(([k, v]) => `${k}: ${v}`), "", "Reply directly to the seller at the email above."].join("\n");
  const htmlRows = rows.map(([k, v]) =>
    `<tr><td style="padding:4px 12px 4px 0;color:#6b6b6b;vertical-align:top;white-space:nowrap">${esc(k)}</td><td style="padding:4px 0;color:#171717">${esc(v)}</td></tr>`
  ).join("");
  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.5;color:#171717">
    <p style="margin:0 0 14px">${esc(intro)}</p>
    <table style="border-collapse:collapse;margin:0 0 16px">${htmlRows}</table>
    <p style="margin:0;color:#6b6b6b">Reply directly to the seller at the email above.</p>
  </div>`;
  const subject = `Additional details from ${seller.email} on the ${carStr}`;
  return resendSend({ partnerEmail, replyTo: seller.email, subject, text, html });
}
