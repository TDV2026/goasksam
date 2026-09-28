// Sam Desk API (crew-gated B2B analytics over the archive).
// =====================================================================
// Its OWN serverless function since Vercel Pro (maxDuration 300s, set in vercel.json).
// It previously rode api/sellerDecision.js only because the Hobby plan capped functions
// at 12; that constraint is gone. Archive-only, ZERO OldCarsData. The heavy ranking /
// trend / comparison reads need more than sellerDecision's 60s budget, so they get their
// own function with a 300s ceiling and never share the storefront's timeout.
//
// Behaviour is identical to the old inlined block: crew-only ALWAYS (a non-crew,
// non-tester caller is refused regardless of the launch curtain), same context shape.
import { handleDeskRequest } from "../lib/desk/handler.js";
import { testerCodeExpired } from "../lib/_tester.js";

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}
function parseCookies(header) {
  const out = {};
  String(header || "").split(";").forEach(part => {
    const i = part.indexOf("=");
    if (i > 0) { try { out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim()); } catch (e) {} }
  });
  return out;
}

export default async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

  const cookies = parseCookies(req.headers.cookie);
  const crew = cookies.gas_crew === "ok";
  const tester = cookies.gas_tester === "ok" && !testerCodeExpired();
  // Desk is crew-only ALWAYS (never public, unlike the storefront).
  if (!crew && !tester) return res.status(403).json({ status: "sealed", error: "Desk is crew-only." });

  try {
    const out = await handleDeskRequest(req.body || {}, {
      env: { supabaseUrl, supabaseKey }, apiKey: process.env.ANTHROPIC_API_KEY,
      crew, tester, curtainSealed: process.env.CURTAIN_SEALED === "1",
      org: crew ? "sam" : (tester ? "tester" : "public"), seat: "crew"
    });
    const code = out.httpStatus || 200; delete out.httpStatus;
    return res.status(code).json(out);
  } catch (e) {
    return res.status(500).json({ status: "error", error: e.message || "desk failed" });
  }
}
