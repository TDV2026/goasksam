function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function asText(value) {
  return String(value || "").trim();
}

function makeReference() {
  return `GAS-${Math.floor(10000 + Math.random() * 90000)}`;
}

async function insertLead(row, supabaseUrl, supabaseKey) {
  const res = await fetch(`${supabaseUrl}/rest/v1/seller_leads`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      Prefer: "return=representation"
    },
    body: JSON.stringify(row)
  });

  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { message: text };
  }
  if (!res.ok) {
    throw new Error(data?.message || `seller_leads insert failed: ${res.status}`);
  }
  return Array.isArray(data) ? data[0] : data;
}

// The live table may lack some optional columns. PostgREST reports one unknown
// column per attempt, so strip whichever it names and retry; the full context
// is preserved in decision_summary regardless. Never drop the lead over a
// missing optional column.
async function insertLeadWithFallback(row, supabaseUrl, supabaseKey) {
  const attempt = { ...row };
  for (let tries = 0; tries < 6; tries++) {
    try {
      return await insertLead(attempt, supabaseUrl, supabaseKey);
    } catch (err) {
      const missing = String(err.message || "").match(/find the '([a-zA-Z0-9_]+)' column/)?.[1];
      if (!missing || !(missing in attempt) || missing === "seller_email" || missing === "reference") throw err;
      delete attempt[missing];
    }
  }
  return insertLead(attempt, supabaseUrl, supabaseKey);
}

export default async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) return res.status(500).json({ error: "Supabase not configured" });

  const { seller = {}, car = {}, choice = {}, decision = {} } = req.body || {};
  const email = asText(seller.email);
  if (!email || !email.includes("@")) return res.status(400).json({ error: "Valid email is required" });

  const reference = makeReference();
  const decisionSummary = {
    ...decision,
    carContext: {
      raw: asText(car.raw),
      vin: asText(car.vin) || null,
      region: asText(car.region) || null,
      state: asText(car.state) || null,
      mileage: asText(car.mileage) || null,
      condition: asText(car.condition) || null,
      serviceRecords: asText(car.serviceRecords) || null,
      title: asText(car.title) || null,
      targetPrice: asText(car.targetPrice) || null,
      timeline: asText(car.timeline) || null,
      involvement: asText(car.involvement) || null,
      notes: asText(car.notes) || null
    }
  };
  const row = {
    reference,
    submitted_at: new Date().toISOString(),
    lead_status: "submitted",
    car_raw: asText(car.raw),
    vin: asText(car.vin) || null,
    car_region: asText(car.region) || null,
    car_state: asText(car.state) || null,
    mileage: asText(car.mileage) || null,
    condition: asText(car.condition) || null,
    service_records: asText(car.serviceRecords) || null,
    title_status: asText(car.title) || null,
    target_price: asText(car.targetPrice) || null,
    timeline: asText(car.timeline) || null,
    involvement_preference: asText(car.involvement) || null,
    notes: asText(car.notes) || null,
    chosen_destination: asText(choice.destination),
    chosen_destination_type: asText(choice.destinationType) || null,
    chosen_option_key: asText(choice.optionKey) || null,
    seller_email: email,
    seller_phone: asText(seller.phone) || null,
    decision_summary: decisionSummary
  };

  try {
    const inserted = await insertLeadWithFallback(row, supabaseUrl, supabaseKey);
    return res.status(200).json({
      status: "submitted",
      reference: inserted?.reference || reference,
      lead: inserted || row
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
