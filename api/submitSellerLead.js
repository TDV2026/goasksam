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
  const row = {
    reference,
    submitted_at: new Date().toISOString(),
    lead_status: "submitted",
    car_raw: asText(car.raw),
    vin: asText(car.vin) || null,
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
    decision_summary: decision || null
  };

  try {
    const inserted = await insertLead(row, supabaseUrl, supabaseKey);
    return res.status(200).json({
      status: "submitted",
      reference: inserted?.reference || reference,
      lead: inserted || row
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
