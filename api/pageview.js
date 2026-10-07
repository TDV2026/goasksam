// Page-view beacon for the STATIC pages (/sell, /mcp, the marketing pages) that have no server handler
// to log from. Returns a 1x1 gif and logs the referrer/UA via the shared classifier. Note this only
// captures real browsers (humans); crawlers do not run JS, so crawler/AI-bot visits are logged
// server-side inside the page handlers (api/history.js, api/buy.js) instead. No PII beyond referrer/UA.
import { supabaseEnv } from "../lib/_supabase.js";
import { logPageView } from "../lib/_pageview.js";

const PIXEL = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();
  const env = supabaseEnv();
  const path = (req.query && (req.query.p || req.query.path)) || (req.body && req.body.path) || null;
  await logPageView(env, {
    path: path ? String(path).slice(0, 120) : null,
    referer: req.headers["referer"] || req.headers["referrer"] || "",
    userAgent: req.headers["user-agent"] || ""
  });
  res.setHeader("content-type", "image/gif");
  res.setHeader("cache-control", "no-store");
  return res.status(200).send(PIXEL);
}
