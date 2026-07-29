// Authenticated read path for the outbound click log (Part 6.8). Keyed with the
// same USAGE_DASHBOARD_KEY as the usage dashboard, so it is NOT publicly
// accessible. Plain unstyled table, newest first. Add ?format=json for raw rows.
import { supabaseEnv, supabaseSelect } from "../lib/_supabase.js";

function esc(value) {
  return String(value == null ? "" : value).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

export default async function handler(req, res) {
  const configuredKey = process.env.USAGE_DASHBOARD_KEY || process.env.ADMIN_DASHBOARD_KEY;
  const providedKey = req.headers["x-admin-key"] || req.query?.key;
  if (!configuredKey) return res.status(500).send("Set USAGE_DASHBOARD_KEY in Vercel before using this page.");
  if (providedKey !== configuredKey) return res.status(401).send("Unauthorized");

  const limit = Math.max(1, Math.min(1000, Number(req.query?.limit || 200)));
  const env = supabaseEnv();
  const rows = env
    ? await supabaseSelect(env, `outbound_clicks?select=created_at,year,make,model,trim,location,platform,card,outcome,reason,seller_preference,landed_rung&order=created_at.desc&limit=${limit}`)
    : null;

  if (req.query?.format === "json") {
    res.setHeader("Content-Type", "application/json");
    return res.status(200).send(JSON.stringify(rows || []));
  }

  const list = rows || [];
  const trs = list.map(r => `<tr><td>${esc(r.created_at)}</td><td>${esc(r.year)}</td><td>${esc(r.make)}</td><td>${esc(r.model)}</td><td>${esc(r.trim)}</td><td>${esc(r.location)}</td><td>${esc(r.platform)}</td><td>${esc(r.card)}</td><td>${esc(r.outcome)}</td><td>${esc(r.landed_rung)}</td><td>${esc(r.reason)}</td><td>${esc(r.seller_preference)}</td></tr>`).join("");
  const note = !env ? "Supabase env missing." : rows === null ? "outbound_clicks table not found yet (run docs/supabase-outbound-clicks.sql)." : `${list.length} rows.`;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.status(200).send(`<!doctype html><meta name="robots" content="noindex,nofollow"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Outbound clicks</title><h3>Outbound clicks (newest first)</h3><table border="1" cellpadding="4" cellspacing="0"><tr><th>date</th><th>year</th><th>make</th><th>model</th><th>trim</th><th>location</th><th>platform</th><th>card</th><th>outcome</th><th>rung</th><th>reason</th><th>pref</th></tr>${trs}</table><p>${esc(note)}</p>`);
}
