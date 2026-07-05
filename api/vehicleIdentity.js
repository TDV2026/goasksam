// Thin HTTP wrapper over the shared vehicle resolver (lib/vehicle.js).
// All parsing, alias expansion, typo confirmation, and year validation live there.

import { resolveVehicle } from "../lib/vehicle.js";

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

export default async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const raw = req.body?.text || req.body?.car || req.body?.search || req.body?.query;
  if (!raw) return res.status(400).json({ error: "Missing text" });

  try {
    const result = await resolveVehicle(raw);
    // The wizard treats a typo confirmation like any other clarification: it
    // shows the question and the "Did you mean ..." suggestion chip.
    const status = result.status === "needs_confirmation" ? "needs_clarification" : result.status;
    return res.status(200).json({
      status,
      vehicle: result.vehicle,
      clarification: result.clarification,
      corrections: result.corrections
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Vehicle identity failed" });
  }
}
