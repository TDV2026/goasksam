// Read-only diagnostic (crew-gated) for the out-of-scope report. Returns, per
// make+model: the all-time count in vehicle_market_records (our archive) and the
// OldCarsData all-time SOLD total (source of truth). Used once to calibrate the
// out-of-scope detector threshold; not the feature. One metered OCD request per
// call. Gate: the same gas_crew cookie the curtain uses.
import { callOldCarsData } from "../lib/_ocd.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  const cookie = req.headers.cookie || "";
  if (cookie.indexOf("gas_crew=ok") === -1) return res.status(403).json({ error: "forbidden (crew only)" });

  const make = String(req.query.make || "").trim();
  const model = String(req.query.model || "").trim();
  if (!make || !model) return res.status(400).json({ error: "make and model required" });

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const apiKey = process.env.OLDCARSDATA_API_KEY;

  const out = { make, model, vmrAllTime: null, ocdAllTime: null, ocdMeta: null, error: null };

  // Our archive: model-level all-time count (make exact-ish, model substring).
  try {
    const url = `${supabaseUrl}/rest/v1/vehicle_market_records?make=ilike.${encodeURIComponent(make)}&model=ilike.${encodeURIComponent("*" + model + "*")}&select=id`;
    const r = await fetch(url, { headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}`, Prefer: "count=exact", Range: "0-0" } });
    const cr = r.headers.get("content-range") || "*/0";
    out.vmrAllTime = Number(cr.split("/")[1] || 0);
  } catch (e) { out.error = "vmr:" + e.message; }

  // OldCarsData: all-time SOLD total for this make+model (year-unbounded).
  if (req.query.ocd !== "0" && apiKey) {
    try {
      const ocd = await callOldCarsData("/auctions", { make, model, status: "sold", sort: "date", direction: "desc", page: 1, limit: 1 }, apiKey);
      out.ocdMeta = ocd.meta || null;
      out.ocdAllTime = (ocd.meta && (ocd.meta.total ?? ocd.meta.total_results ?? ocd.meta.count)) ?? null;
      if (out.ocdAllTime == null && ocd.meta && ocd.meta.total_pages != null) out.ocdAllTime = { total_pages: ocd.meta.total_pages, note: "no total field; pages*limit approximates" };
    } catch (e) { out.error = (out.error ? out.error + "; " : "") + "ocd:" + e.message; }
  }

  return res.status(200).json(out);
}
