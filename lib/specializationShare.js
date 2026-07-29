// Specialization share metric. For platform P and scope S (landed rung: model,
// generation, or segment), over a 180-day window:
//   platform_share = P's sold count of S / P's total sold count
//   rest_share     = pooled other platforms' sold count of S / pooled other total
//   lift           = platform_share / rest_share
// A high lift means the platform is disproportionately WHERE this kind of car
// trades, even if another platform has more of them in absolute terms.
//
// Regenerated MONTHLY by scripts/refreshSpecializationShare.js from sales_archive
// (sold records already in Supabase; NO OldCarsData API calls, so it never
// touches the metered budget), reading the trailing 180 days. Same cadence and
// pattern as scripts/refreshReserveContext.js.
//
// PLATFORM-AGNOSTIC: `platform` is data on every row and every cell, never a
// literal in this module's logic.

const norm = s => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
const plural = w => { const s = String(w || "").trim(); return /s$/i.test(s) ? s : `${s}s`; };

// Usable-cell gates (locked): the platform has 5+ sold of the scope in window
// AND lift >= 2.0. Below either, no cell exists.
export const SPECIALIZATION_MIN_COUNT = 5;
export const SPECIALIZATION_MIN_LIFT = 2.0;

// Scope-value key + human label for a row, at each rung. generationOf and
// segmentOf are injected (pure + testable): generationOf(make,model,year) ->
// { code, label } | null ; segmentOf(make,model) -> { key, label } | null.
export function scopeKeysForRow(row, { generationOf, segmentOf } = {}) {
  const make = String(row.make || "").trim();
  const model = String(row.model || "").trim();
  const out = [];
  if (make && model) {
    out.push({ rung: "model", scope: "model", key: `model|${norm(make)}|${norm(model)}`, label: plural(model) });
    const gen = generationOf && generationOf(make, model, Number(row.year));
    if (gen && gen.code) out.push({ rung: "generation", scope: "generation", key: `generation|${norm(make)}|${norm(model)}|${norm(gen.code)}`, label: `${String(gen.code).toUpperCase()}-generation ${plural(model)}` });
    const seg = segmentOf && segmentOf(make, model);
    if (seg && seg.key) out.push({ rung: "segment", scope: "segment", key: `segment|${norm(seg.key)}`, label: seg.label || plural(model) });
  }
  return out;
}

// Pure computation (unit-tested). rows: { platform, make, model, year, sale_price }.
// Every row is a SOLD record. Returns usable cells only.
export function computeSpecializationCells(rows, { dataMonth, generationOf, segmentOf } = {}) {
  const valid = (rows || []).filter(r => r && r.platform && r.make && r.model);
  const totalByPlatform = new Map();       // platform -> total sold count
  const scopeByPlatform = new Map();       // platform -> Map(scopeKey -> { count, label, scope, rung })
  const scopeTotals = new Map();           // scopeKey -> total sold count across ALL platforms
  let grandTotal = 0;

  for (const r of valid) {
    const p = r.platform;
    grandTotal += 1;
    totalByPlatform.set(p, (totalByPlatform.get(p) || 0) + 1);
    if (!scopeByPlatform.has(p)) scopeByPlatform.set(p, new Map());
    const pMap = scopeByPlatform.get(p);
    for (const s of scopeKeysForRow(r, { generationOf, segmentOf })) {
      if (!pMap.has(s.key)) pMap.set(s.key, { count: 0, label: s.label, scope: s.scope, rung: s.rung });
      pMap.get(s.key).count += 1;
      scopeTotals.set(s.key, (scopeTotals.get(s.key) || 0) + 1);
    }
  }

  const cells = [];
  for (const [platform, pMap] of scopeByPlatform.entries()) {
    const pTotal = totalByPlatform.get(platform) || 0;
    if (!pTotal) continue;
    const restTotal = grandTotal - pTotal;
    for (const [key, s] of pMap.entries()) {
      if (s.count < SPECIALIZATION_MIN_COUNT) continue;      // 5+ of the scope
      const restScope = (scopeTotals.get(key) || 0) - s.count;
      if (restTotal <= 0) continue;
      const platformShare = s.count / pTotal;
      const restShare = restScope / restTotal;
      if (restShare <= 0) continue;                          // no comparison base
      const lift = platformShare / restShare;
      if (lift < SPECIALIZATION_MIN_LIFT) continue;          // lift >= 2.0
      cells.push({
        platform,
        scope: s.scope,
        scope_key: key,
        scope_label: s.label,
        rung: s.rung,
        platform_count: s.count,
        lift_rounded: Math.round(lift),                       // nearest whole multiple, never decimals
        window: 180,
        data_month: dataMonth || null,
      });
    }
  }
  return cells;
}

// Regenerated monthly by scripts/refreshSpecializationShare.js. Empty until the
// first refresh runs.
export const SPECIALIZATION_CELLS = [
  {
    "platform": "PCARMarket",
    "scope": "model",
    "scope_key": "model|porsche|718",
    "scope_label": "718s",
    "rung": "model",
    "platform_count": 7,
    "lift_rounded": 72,
    "window": 180,
    "data_month": "2026-06"
  },
  {
    "platform": "Cars & Bids",
    "scope": "model",
    "scope_key": "model|nissan|370z",
    "scope_label": "370Zs",
    "rung": "model",
    "platform_count": 7,
    "lift_rounded": 46,
    "window": 180,
    "data_month": "2026-06"
  },
  {
    "platform": "PCARMarket",
    "scope": "generation",
    "scope_key": "generation|porsche|911|901",
    "scope_label": "901-generation 911s",
    "rung": "generation",
    "platform_count": 8,
    "lift_rounded": 31,
    "window": 180,
    "data_month": "2026-06"
  },
  {
    "platform": "Cars & Bids",
    "scope": "generation",
    "scope_key": "generation|mazda|mx5|nc",
    "scope_label": "NC-generation MX-5s",
    "rung": "generation",
    "platform_count": 7,
    "lift_rounded": 23,
    "window": 180,
    "data_month": "2026-06"
  },
  {
    "platform": "PCARMarket",
    "scope": "model",
    "scope_key": "model|porsche|944",
    "scope_label": "944s",
    "rung": "model",
    "platform_count": 9,
    "lift_rounded": 21,
    "window": 180,
    "data_month": "2026-06"
  },
  {
    "platform": "Cars & Bids",
    "scope": "generation",
    "scope_key": "generation|bmw|m5|f10",
    "scope_label": "F10-generation M5s",
    "rung": "generation",
    "platform_count": 6,
    "lift_rounded": 20,
    "window": 180,
    "data_month": "2026-06"
  },
  {
    "platform": "PCARMarket",
    "scope": "model",
    "scope_key": "model|porsche|964",
    "scope_label": "964s",
    "rung": "model",
    "platform_count": 6,
    "lift_rounded": 20,
    "window": 180,
    "data_month": "2026-06"
  },
  {
    "platform": "Hagerty",
    "scope": "model",
    "scope_key": "model|chevrolet|ssr",
    "scope_label": "SSRs",
    "rung": "model",
    "platform_count": 6,
    "lift_rounded": 18,
    "window": 180,
    "data_month": "2026-06"
  },
  {
    "platform": "PCARMarket",
    "scope": "generation",
    "scope_key": "generation|porsche|911|930",
    "scope_label": "930-generation 911s",
    "rung": "generation",
    "platform_count": 17,
    "lift_rounded": 15,
    "window": 180,
    "data_month": "2026-06"
  },
  {
    "platform": "Hagerty",
    "scope": "model",
    "scope_key": "model|pontiac|lemans",
    "scope_label": "LeMans",
    "rung": "model",
    "platform_count": 5,
    "lift_rounded": 15,
    "window": 180,
    "data_month": "2026-06"
  },
  {
    "platform": "Cars & Bids",
    "scope": "model",
    "scope_key": "model|porsche|macan",
    "scope_label": "Macans",
    "rung": "model",
    "platform_count": 6,
    "lift_rounded": 13,
    "window": 180,
    "data_month": "2026-06"
  },
  {
    "platform": "Cars & Bids",
    "scope": "model",
    "scope_key": "model|audi|s4",
    "scope_label": "S4s",
    "rung": "model",
    "platform_count": 6,
    "lift_rounded": 13,
    "window": 180,
    "data_month": "2026-06"
  },
  {
    "platform": "PCARMarket",
    "scope": "model",
    "scope_key": "model|porsche|911",
    "scope_label": "911s",
    "rung": "model",
    "platform_count": 33,
    "lift_rounded": 12,
    "window": 180,
    "data_month": "2026-06"
  },
  {
    "platform": "PCARMarket",
    "scope": "model",
    "scope_key": "model|porsche|997",
    "scope_label": "997s",
    "rung": "model",
    "platform_count": 15,
    "lift_rounded": 10,
    "window": 180,
    "data_month": "2026-06"
  },
  {
    "platform": "PCARMarket",
    "scope": "generation",
    "scope_key": "generation|porsche|997|997",
    "scope_label": "997-generation 997s",
    "rung": "generation",
    "platform_count": 13,
    "lift_rounded": 10,
    "window": 180,
    "data_month": "2026-06"
  },
  {
    "platform": "PCARMarket",
    "scope": "model",
    "scope_key": "model|porsche|992",
    "scope_label": "992s",
    "rung": "model",
    "platform_count": 9,
    "lift_rounded": 10,
    "window": 180,
    "data_month": "2026-06"
  },
  {
    "platform": "PCARMarket",
    "scope": "generation",
    "scope_key": "generation|porsche|992|992",
    "scope_label": "992-generation 992s",
    "rung": "generation",
    "platform_count": 9,
    "lift_rounded": 10,
    "window": 180,
    "data_month": "2026-06"
  },
  {
    "platform": "PCARMarket",
    "scope": "model",
    "scope_key": "model|porsche|cayman",
    "scope_label": "Caymans",
    "rung": "model",
    "platform_count": 9,
    "lift_rounded": 10,
    "window": 180,
    "data_month": "2026-06"
  },
  {
    "platform": "Cars & Bids",
    "scope": "model",
    "scope_key": "model|subaru|wrx",
    "scope_label": "WRXs",
    "rung": "model",
    "platform_count": 8,
    "lift_rounded": 9,
    "window": 180,
    "data_month": "2026-06"
  },
  {
    "platform": "PCARMarket",
    "scope": "generation",
    "scope_key": "generation|porsche|911|993",
    "scope_label": "993-generation 911s",
    "rung": "generation",
    "platform_count": 7,
    "lift_rounded": 9,
    "window": 180,
    "data_month": "2026-06"
  },
  {
    "platform": "PCARMarket",
    "scope": "generation",
    "scope_key": "generation|porsche|991|9911",
    "scope_label": "991.1-generation 991s",
    "rung": "generation",
    "platform_count": 5,
    "lift_rounded": 9,
    "window": 180,
    "data_month": "2026-06"
  },
  {
    "platform": "PCARMarket",
    "scope": "model",
    "scope_key": "model|porsche|991",
    "scope_label": "991s",
    "rung": "model",
    "platform_count": 9,
    "lift_rounded": 8,
    "window": 180,
    "data_month": "2026-06"
  },
  {
    "platform": "Bring a Trailer",
    "scope": "model",
    "scope_key": "model|toyota|landcruiser100series",
    "scope_label": "Land Cruiser 100 Series",
    "rung": "model",
    "platform_count": 16,
    "lift_rounded": 7,
    "window": 180,
    "data_month": "2026-06"
  },
  {
    "platform": "Bring a Trailer",
    "scope": "generation",
    "scope_key": "generation|toyota|landcruiser100series|100series",
    "scope_label": "100-SERIES-generation Land Cruiser 100 Series",
    "rung": "generation",
    "platform_count": 16,
    "lift_rounded": 7,
    "window": 180,
    "data_month": "2026-06"
  },
  {
    "platform": "Cars & Bids",
    "scope": "model",
    "scope_key": "model|audi|a4",
    "scope_label": "A4s",
    "rung": "model",
    "platform_count": 8,
    "lift_rounded": 7,
    "window": 180,
    "data_month": "2026-06"
  },
  {
    "platform": "Hagerty",
    "scope": "model",
    "scope_key": "model|chevrolet|3100",
    "scope_label": "3100s",
    "rung": "model",
    "platform_count": 7,
    "lift_rounded": 7,
    "window": 180,
    "data_month": "2026-06"
  },
  {
    "platform": "Hagerty",
    "scope": "model",
    "scope_key": "model|ford|modela",
    "scope_label": "Model As",
    "rung": "model",
    "platform_count": 6,
    "lift_rounded": 7,
    "window": 180,
    "data_month": "2026-06"
  },
  {
    "platform": "Bring a Trailer",
    "scope": "model",
    "scope_key": "model|toyota|tacoma",
    "scope_label": "Tacomas",
    "rung": "model",
    "platform_count": 25,
    "lift_rounded": 6,
    "window": 180,
    "data_month": "2026-06"
  },
  {
    "platform": "Hagerty",
    "scope": "generation",
    "scope_key": "generation|chevrolet|corvette|c3",
    "scope_label": "C3-generation Corvettes",
    "rung": "generation",
    "platform_count": 17,
    "lift_rounded": 6,
    "window": 180,
    "data_month": "2026-06"
  },
  {
    "platform": "Bring a Trailer",
    "scope": "model",
    "scope_key": "model|mercedesbenz|sprinter",
    "scope_label": "Sprinters",
    "rung": "model",
    "platform_count": 14,
    "lift_rounded": 6,
    "window": 180,
    "data_month": "2026-06"
  },
  {
    "platform": "PCARMarket",
    "scope": "model",
    "scope_key": "model|porsche|996",
    "scope_label": "996s",
    "rung": "model",
    "platform_count": 9,
    "lift_rounded": 6,
    "window": 180,
    "data_month": "2026-06"
  },
  {
    "platform": "Hagerty",
    "scope": "generation",
    "scope_key": "generation|volkswagen|beetle|late",
    "scope_label": "LATE-generation Beetles",
    "rung": "generation",
    "platform_count": 8,
    "lift_rounded": 6,
    "window": 180,
    "data_month": "2026-06"
  },
  {
    "platform": "PCARMarket",
    "scope": "generation",
    "scope_key": "generation|porsche|996|996",
    "scope_label": "996-generation 996s",
    "rung": "generation",
    "platform_count": 8,
    "lift_rounded": 6,
    "window": 180,
    "data_month": "2026-06"
  },
  {
    "platform": "Cars & Bids",
    "scope": "model",
    "scope_key": "model|bmw|4series",
    "scope_label": "4-Series",
    "rung": "model",
    "platform_count": 7,
    "lift_rounded": 6,
    "window": 180,
    "data_month": "2026-06"
  },
  {
    "platform": "Cars & Bids",
    "scope": "model",
    "scope_key": "model|mazda|mx5",
    "scope_label": "MX-5s",
    "rung": "model",
    "platform_count": 20,
    "lift_rounded": 5,
    "window": 180,
    "data_month": "2026-06"
  },
  {
    "platform": "Cars & Bids",
    "scope": "segment",
    "scope_key": "segment|sportcompact",
    "scope_label": "Audi sport-compact",
    "rung": "segment",
    "platform_count": 13,
    "lift_rounded": 5,
    "window": 180,
    "data_month": "2026-06"
  },
  {
    "platform": "Bring a Trailer",
    "scope": "model",
    "scope_key": "model|ford|excursion",
    "scope_label": "Excursions",
    "rung": "model",
    "platform_count": 12,
    "lift_rounded": 5,
    "window": 180,
    "data_month": "2026-06"
  },
  {
    "platform": "Bring a Trailer",
    "scope": "model",
    "scope_key": "model|acura|nsx",
    "scope_label": "NSXs",
    "rung": "model",
    "platform_count": 12,
    "lift_rounded": 5,
    "window": 180,
    "data_month": "2026-06"
  },
  {
    "platform": "Bring a Trailer",
    "scope": "model",
    "scope_key": "model|dodge|viper",
    "scope_label": "Vipers",
    "rung": "model",
    "platform_count": 12,
    "lift_rounded": 5,
    "window": 180,
    "data_month": "2026-06"
  },
  {
    "platform": "Bring a Trailer",
    "scope": "model",
    "scope_key": "model|toyota|landcruiser80series",
    "scope_label": "Land Cruiser 80 Series",
    "rung": "model",
    "platform_count": 12,
    "lift_rounded": 5,
    "window": 180,
    "data_month": "2026-06"
  },
  {
    "platform": "Bring a Trailer",
    "scope": "generation",
    "scope_key": "generation|toyota|landcruiser80series|80series",
    "scope_label": "80-SERIES-generation Land Cruiser 80 Series",
    "rung": "generation",
    "platform_count": 12,
    "lift_rounded": 5,
    "window": 180,
    "data_month": "2026-06"
  },
  {
    "platform": "Bring a Trailer",
    "scope": "model",
    "scope_key": "model|honda|othermotorcycles",
    "scope_label": "Other Motorcycles",
    "rung": "model",
    "platform_count": 12,
    "lift_rounded": 5,
    "window": 180,
    "data_month": "2026-06"
  },
  {
    "platform": "Bring a Trailer",
    "scope": "model",
    "scope_key": "model|jeep|wagoneergrandwagoneer19631991",
    "scope_label": "Wagoneer/Grand Wagoneer (1963–1991)s",
    "rung": "model",
    "platform_count": 11,
    "lift_rounded": 5,
    "window": 180,
    "data_month": "2026-06"
  },
  {
    "platform": "Cars & Bids",
    "scope": "model",
    "scope_key": "model|bmw|1series",
    "scope_label": "1-Series",
    "rung": "model",
    "platform_count": 8,
    "lift_rounded": 5,
    "window": 180,
    "data_month": "2026-06"
  },
  {
    "platform": "Cars & Bids",
    "scope": "model",
    "scope_key": "model|bmw|x5",
    "scope_label": "X5s",
    "rung": "model",
    "platform_count": 7,
    "lift_rounded": 5,
    "window": 180,
    "data_month": "2026-06"
  },
  {
    "platform": "Hagerty",
    "scope": "model",
    "scope_key": "model|chevrolet|impala",
    "scope_label": "Impalas",
    "rung": "model",
    "platform_count": 7,
    "lift_rounded": 5,
    "window": 180,
    "data_month": "2026-06"
  },
  {
    "platform": "Hagerty",
    "scope": "generation",
    "scope_key": "generation|chevrolet|camaro|fourth",
    "scope_label": "FOURTH-generation Camaros",
    "rung": "generation",
    "platform_count": 5,
    "lift_rounded": 5,
    "window": 180,
    "data_month": "2026-06"
  },
  {
    "platform": "Hagerty",
    "scope": "generation",
    "scope_key": "generation|chevrolet|camaro|first",
    "scope_label": "FIRST-generation Camaros",
    "rung": "generation",
    "platform_count": 13,
    "lift_rounded": 4,
    "window": 180,
    "data_month": "2026-06"
  },
  {
    "platform": "Cars & Bids",
    "scope": "model",
    "scope_key": "model|bmw|5series",
    "scope_label": "5-Series",
    "rung": "model",
    "platform_count": 12,
    "lift_rounded": 4,
    "window": 180,
    "data_month": "2026-06"
  },
  {
    "platform": "Cars & Bids",
    "scope": "generation",
    "scope_key": "generation|bmw|3series|e90",
    "scope_label": "E90-generation 3-Series",
    "rung": "generation",
    "platform_count": 12,
    "lift_rounded": 4,
    "window": 180,
    "data_month": "2026-06"
  },
  {
    "platform": "Hagerty",
    "scope": "generation",
    "scope_key": "generation|chevrolet|corvette|c5",
    "scope_label": "C5-generation Corvettes",
    "rung": "generation",
    "platform_count": 11,
    "lift_rounded": 4,
    "window": 180,
    "data_month": "2026-06"
  },
  {
    "platform": "Hagerty",
    "scope": "model",
    "scope_key": "model|ford|thunderbird",
    "scope_label": "Thunderbirds",
    "rung": "model",
    "platform_count": 10,
    "lift_rounded": 4,
    "window": 180,
    "data_month": "2026-06"
  },
  {
    "platform": "Bring a Trailer",
    "scope": "generation",
    "scope_key": "generation|chevrolet|corvette|c8",
    "scope_label": "C8-generation Corvettes",
    "rung": "generation",
    "platform_count": 9,
    "lift_rounded": 4,
    "window": 180,
    "data_month": "2026-06"
  },
  {
    "platform": "Bring a Trailer",
    "scope": "model",
    "scope_key": "model|ferrari|430",
    "scope_label": "430s",
    "rung": "model",
    "platform_count": 9,
    "lift_rounded": 4,
    "window": 180,
    "data_month": "2026-06"
  },
  {
    "platform": "Bring a Trailer",
    "scope": "model",
    "scope_key": "model|toyota|landcruiser60series",
    "scope_label": "Land Cruiser 60 Series",
    "rung": "model",
    "platform_count": 9,
    "lift_rounded": 4,
    "window": 180,
    "data_month": "2026-06"
  },
  {
    "platform": "Cars & Bids",
    "scope": "generation",
    "scope_key": "generation|bmw|m3|e46",
    "scope_label": "E46-generation M3s",
    "rung": "generation",
    "platform_count": 9,
    "lift_rounded": 4,
    "window": 180,
    "data_month": "2026-06"
  },
  {
    "platform": "Cars & Bids",
    "scope": "model",
    "scope_key": "model|bmw|m5",
    "scope_label": "M5s",
    "rung": "model",
    "platform_count": 9,
    "lift_rounded": 4,
    "window": 180,
    "data_month": "2026-06"
  },
  {
    "platform": "Hagerty",
    "scope": "model",
    "scope_key": "model|volkswagen|beetle",
    "scope_label": "Beetles",
    "rung": "model",
    "platform_count": 9,
    "lift_rounded": 4,
    "window": 180,
    "data_month": "2026-06"
  },
  {
    "platform": "Hagerty",
    "scope": "generation",
    "scope_key": "generation|ford|mustang|sn95",
    "scope_label": "SN95-generation Mustangs",
    "rung": "generation",
    "platform_count": 8,
    "lift_rounded": 4,
    "window": 180,
    "data_month": "2026-06"
  },
  {
    "platform": "Cars & Bids",
    "scope": "model",
    "scope_key": "model|bmw|m3e90e92e93",
    "scope_label": "M3 (E90/E92/E93)s",
    "rung": "model",
    "platform_count": 6,
    "lift_rounded": 4,
    "window": 180,
    "data_month": "2026-06"
  },
  {
    "platform": "Cars & Bids",
    "scope": "generation",
    "scope_key": "generation|bmw|m3e90e92e93|e92",
    "scope_label": "E92-generation M3 (E90/E92/E93)s",
    "rung": "generation",
    "platform_count": 6,
    "lift_rounded": 4,
    "window": 180,
    "data_month": "2026-06"
  },
  {
    "platform": "Cars & Bids",
    "scope": "model",
    "scope_key": "model|toyota|mr2",
    "scope_label": "MR2s",
    "rung": "model",
    "platform_count": 6,
    "lift_rounded": 4,
    "window": 180,
    "data_month": "2026-06"
  },
  {
    "platform": "Cars & Bids",
    "scope": "model",
    "scope_key": "model|bmw|3series",
    "scope_label": "3-Series",
    "rung": "model",
    "platform_count": 26,
    "lift_rounded": 3,
    "window": 180,
    "data_month": "2026-06"
  },
  {
    "platform": "Hagerty",
    "scope": "model",
    "scope_key": "model|chevrolet|camaro",
    "scope_label": "Camaros",
    "rung": "model",
    "platform_count": 26,
    "lift_rounded": 3,
    "window": 180,
    "data_month": "2026-06"
  },
  {
    "platform": "Bring a Trailer",
    "scope": "generation",
    "scope_key": "generation|mercedesbenz|slclass|r129",
    "scope_label": "R129-generation SL-Class",
    "rung": "generation",
    "platform_count": 23,
    "lift_rounded": 3,
    "window": 180,
    "data_month": "2026-06"
  },
  {
    "platform": "Bring a Trailer",
    "scope": "model",
    "scope_key": "model|toyota|4runner",
    "scope_label": "4Runners",
    "rung": "model",
    "platform_count": 22,
    "lift_rounded": 3,
    "window": 180,
    "data_month": "2026-06"
  },
  {
    "platform": "Bring a Trailer",
    "scope": "model",
    "scope_key": "model|jaguar|xke",
    "scope_label": "XKEs",
    "rung": "model",
    "platform_count": 18,
    "lift_rounded": 3,
    "window": 180,
    "data_month": "2026-06"
  },
  {
    "platform": "Hagerty",
    "scope": "generation",
    "scope_key": "generation|ford|mustang|first",
    "scope_label": "FIRST-generation Mustangs",
    "rung": "generation",
    "platform_count": 18,
    "lift_rounded": 3,
    "window": 180,
    "data_month": "2026-06"
  },
  {
    "platform": "Hagerty",
    "scope": "generation",
    "scope_key": "generation|ford|mustang|s197",
    "scope_label": "S197-generation Mustangs",
    "rung": "generation",
    "platform_count": 13,
    "lift_rounded": 3,
    "window": 180,
    "data_month": "2026-06"
  },
  {
    "platform": "Bring a Trailer",
    "scope": "model",
    "scope_key": "model|porsche|928",
    "scope_label": "928s",
    "rung": "model",
    "platform_count": 12,
    "lift_rounded": 3,
    "window": 180,
    "data_month": "2026-06"
  },
  {
    "platform": "Hagerty",
    "scope": "generation",
    "scope_key": "generation|chevrolet|corvette|c4",
    "scope_label": "C4-generation Corvettes",
    "rung": "generation",
    "platform_count": 12,
    "lift_rounded": 3,
    "window": 180,
    "data_month": "2026-06"
  },
  {
    "platform": "Hagerty",
    "scope": "model",
    "scope_key": "model|jaguar|xj",
    "scope_label": "XJs",
    "rung": "model",
    "platform_count": 10,
    "lift_rounded": 3,
    "window": 180,
    "data_month": "2026-06"
  },
  {
    "platform": "Hagerty",
    "scope": "model",
    "scope_key": "model|dodge|challenger",
    "scope_label": "Challengers",
    "rung": "model",
    "platform_count": 9,
    "lift_rounded": 3,
    "window": 180,
    "data_month": "2026-06"
  },
  {
    "platform": "Hagerty",
    "scope": "generation",
    "scope_key": "generation|dodge|challenger|modern",
    "scope_label": "MODERN-generation Challengers",
    "rung": "generation",
    "platform_count": 9,
    "lift_rounded": 3,
    "window": 180,
    "data_month": "2026-06"
  },
  {
    "platform": "Cars & Bids",
    "scope": "model",
    "scope_key": "model|bmw|z3",
    "scope_label": "Z3s",
    "rung": "model",
    "platform_count": 8,
    "lift_rounded": 3,
    "window": 180,
    "data_month": "2026-06"
  },
  {
    "platform": "Cars & Bids",
    "scope": "model",
    "scope_key": "model|bmw|z4",
    "scope_label": "Z4s",
    "rung": "model",
    "platform_count": 8,
    "lift_rounded": 3,
    "window": 180,
    "data_month": "2026-06"
  },
  {
    "platform": "Hagerty",
    "scope": "model",
    "scope_key": "model|chevrolet|chevelle",
    "scope_label": "Chevelles",
    "rung": "model",
    "platform_count": 8,
    "lift_rounded": 3,
    "window": 180,
    "data_month": "2026-06"
  },
  {
    "platform": "Bring a Trailer",
    "scope": "model",
    "scope_key": "model|jeep|grandcherokee",
    "scope_label": "Grand Cherokees",
    "rung": "model",
    "platform_count": 7,
    "lift_rounded": 3,
    "window": 180,
    "data_month": "2026-06"
  },
  {
    "platform": "Bring a Trailer",
    "scope": "model",
    "scope_key": "model|astonmartin|v8vantage",
    "scope_label": "V8 Vantages",
    "rung": "model",
    "platform_count": 7,
    "lift_rounded": 3,
    "window": 180,
    "data_month": "2026-06"
  },
  {
    "platform": "Bring a Trailer",
    "scope": "model",
    "scope_key": "model|harleydavidson|vrod",
    "scope_label": "V-Rods",
    "rung": "model",
    "platform_count": 7,
    "lift_rounded": 3,
    "window": 180,
    "data_month": "2026-06"
  },
  {
    "platform": "Bring a Trailer",
    "scope": "generation",
    "scope_key": "generation|mercedesbenz|sclass|w126",
    "scope_label": "W126-generation S-Class",
    "rung": "generation",
    "platform_count": 7,
    "lift_rounded": 3,
    "window": 180,
    "data_month": "2026-06"
  },
  {
    "platform": "Bring a Trailer",
    "scope": "model",
    "scope_key": "model|harleydavidson|sportster",
    "scope_label": "Sportsters",
    "rung": "model",
    "platform_count": 7,
    "lift_rounded": 3,
    "window": 180,
    "data_month": "2026-06"
  },
  {
    "platform": "Bring a Trailer",
    "scope": "model",
    "scope_key": "model|porsche|914",
    "scope_label": "914s",
    "rung": "model",
    "platform_count": 7,
    "lift_rounded": 3,
    "window": 180,
    "data_month": "2026-06"
  },
  {
    "platform": "Cars & Bids",
    "scope": "model",
    "scope_key": "model|honda|s2000",
    "scope_label": "S2000s",
    "rung": "model",
    "platform_count": 7,
    "lift_rounded": 3,
    "window": 180,
    "data_month": "2026-06"
  },
  {
    "platform": "Bring a Trailer",
    "scope": "generation",
    "scope_key": "generation|porsche|boxster|981",
    "scope_label": "981-generation Boxsters",
    "rung": "generation",
    "platform_count": 6,
    "lift_rounded": 3,
    "window": 180,
    "data_month": "2026-06"
  },
  {
    "platform": "Bring a Trailer",
    "scope": "model",
    "scope_key": "model|ford|model40",
    "scope_label": "Model 40s",
    "rung": "model",
    "platform_count": 6,
    "lift_rounded": 3,
    "window": 180,
    "data_month": "2026-06"
  },
  {
    "platform": "Bring a Trailer",
    "scope": "model",
    "scope_key": "model|honda|ct70",
    "scope_label": "CT70s",
    "rung": "model",
    "platform_count": 6,
    "lift_rounded": 3,
    "window": 180,
    "data_month": "2026-06"
  },
  {
    "platform": "Bring a Trailer",
    "scope": "generation",
    "scope_key": "generation|toyota|landcruiser60series|60series",
    "scope_label": "60-SERIES-generation Land Cruiser 60 Series",
    "rung": "generation",
    "platform_count": 6,
    "lift_rounded": 3,
    "window": 180,
    "data_month": "2026-06"
  },
  {
    "platform": "Bring a Trailer",
    "scope": "model",
    "scope_key": "model|shelby|gt350",
    "scope_label": "GT350s",
    "rung": "model",
    "platform_count": 6,
    "lift_rounded": 3,
    "window": 180,
    "data_month": "2026-06"
  },
  {
    "platform": "Bring a Trailer",
    "scope": "generation",
    "scope_key": "generation|jaguar|xke|series1",
    "scope_label": "SERIES-1-generation XKEs",
    "rung": "generation",
    "platform_count": 6,
    "lift_rounded": 3,
    "window": 180,
    "data_month": "2026-06"
  },
  {
    "platform": "Bring a Trailer",
    "scope": "model",
    "scope_key": "model|ferrari|355",
    "scope_label": "355s",
    "rung": "model",
    "platform_count": 6,
    "lift_rounded": 3,
    "window": 180,
    "data_month": "2026-06"
  },
  {
    "platform": "Bring a Trailer",
    "scope": "model",
    "scope_key": "model|mercedesbenz|w140sclass",
    "scope_label": "W140 S-Class",
    "rung": "model",
    "platform_count": 6,
    "lift_rounded": 3,
    "window": 180,
    "data_month": "2026-06"
  },
  {
    "platform": "Hagerty",
    "scope": "model",
    "scope_key": "model|triumph|tr6",
    "scope_label": "TR6s",
    "rung": "model",
    "platform_count": 5,
    "lift_rounded": 3,
    "window": 180,
    "data_month": "2026-06"
  },
  {
    "platform": "Hagerty",
    "scope": "generation",
    "scope_key": "generation|chevrolet|chevelle|second",
    "scope_label": "SECOND-generation Chevelles",
    "rung": "generation",
    "platform_count": 5,
    "lift_rounded": 3,
    "window": 180,
    "data_month": "2026-06"
  },
  {
    "platform": "PCARMarket",
    "scope": "model",
    "scope_key": "model|porsche|cayenne",
    "scope_label": "Cayennes",
    "rung": "model",
    "platform_count": 5,
    "lift_rounded": 3,
    "window": 180,
    "data_month": "2026-06"
  },
  {
    "platform": "Hagerty",
    "scope": "model",
    "scope_key": "model|chevrolet|corvette",
    "scope_label": "Corvettes",
    "rung": "model",
    "platform_count": 58,
    "lift_rounded": 2,
    "window": 180,
    "data_month": "2026-06"
  },
  {
    "platform": "Hagerty",
    "scope": "model",
    "scope_key": "model|ford|mustang",
    "scope_label": "Mustangs",
    "rung": "model",
    "platform_count": 49,
    "lift_rounded": 2,
    "window": 180,
    "data_month": "2026-06"
  },
  {
    "platform": "Bring a Trailer",
    "scope": "model",
    "scope_key": "model|chevrolet|ck",
    "scope_label": "C/Ks",
    "rung": "model",
    "platform_count": 39,
    "lift_rounded": 2,
    "window": 180,
    "data_month": "2026-06"
  },
  {
    "platform": "Bring a Trailer",
    "scope": "generation",
    "scope_key": "generation|chevrolet|corvette|c6",
    "scope_label": "C6-generation Corvettes",
    "rung": "generation",
    "platform_count": 23,
    "lift_rounded": 2,
    "window": 180,
    "data_month": "2026-06"
  },
  {
    "platform": "Bring a Trailer",
    "scope": "model",
    "scope_key": "model|bmw|2002",
    "scope_label": "2002s",
    "rung": "model",
    "platform_count": 17,
    "lift_rounded": 2,
    "window": 180,
    "data_month": "2026-06"
  },
  {
    "platform": "Bring a Trailer",
    "scope": "model",
    "scope_key": "model|bmw|rseries",
    "scope_label": "R Series",
    "rung": "model",
    "platform_count": 17,
    "lift_rounded": 2,
    "window": 180,
    "data_month": "2026-06"
  },
  {
    "platform": "Bring a Trailer",
    "scope": "model",
    "scope_key": "model|toyota|hilux",
    "scope_label": "Hiluxs",
    "rung": "model",
    "platform_count": 16,
    "lift_rounded": 2,
    "window": 180,
    "data_month": "2026-06"
  },
  {
    "platform": "Bring a Trailer",
    "scope": "generation",
    "scope_key": "generation|ford|bronco|first",
    "scope_label": "FIRST-generation Broncos",
    "rung": "generation",
    "platform_count": 15,
    "lift_rounded": 2,
    "window": 180,
    "data_month": "2026-06"
  },
  {
    "platform": "Cars & Bids",
    "scope": "model",
    "scope_key": "model|mercedesbenz|eclass",
    "scope_label": "E-Class",
    "rung": "model",
    "platform_count": 14,
    "lift_rounded": 2,
    "window": 180,
    "data_month": "2026-06"
  },
  {
    "platform": "Cars & Bids",
    "scope": "model",
    "scope_key": "model|landrover|rangerover",
    "scope_label": "Range Rovers",
    "rung": "model",
    "platform_count": 14,
    "lift_rounded": 2,
    "window": 180,
    "data_month": "2026-06"
  },
  {
    "platform": "Bring a Trailer",
    "scope": "generation",
    "scope_key": "generation|toyota|landcruiser40series|40series",
    "scope_label": "40-SERIES-generation Land Cruiser 40 Series",
    "rung": "generation",
    "platform_count": 10,
    "lift_rounded": 2,
    "window": 180,
    "data_month": "2026-06"
  },
  {
    "platform": "Cars & Bids",
    "scope": "model",
    "scope_key": "model|bmw|m3",
    "scope_label": "M3s",
    "rung": "model",
    "platform_count": 10,
    "lift_rounded": 2,
    "window": 180,
    "data_month": "2026-06"
  },
  {
    "platform": "Cars & Bids",
    "scope": "model",
    "scope_key": "model|porsche|cayman",
    "scope_label": "Caymans",
    "rung": "model",
    "platform_count": 9,
    "lift_rounded": 2,
    "window": 180,
    "data_month": "2026-06"
  },
  {
    "platform": "Cars & Bids",
    "scope": "model",
    "scope_key": "model|lexus|ls",
    "scope_label": "LS",
    "rung": "model",
    "platform_count": 7,
    "lift_rounded": 2,
    "window": 180,
    "data_month": "2026-06"
  },
  {
    "platform": "Hagerty",
    "scope": "generation",
    "scope_key": "generation|chevrolet|corvette|c7",
    "scope_label": "C7-generation Corvettes",
    "rung": "generation",
    "platform_count": 7,
    "lift_rounded": 2,
    "window": 180,
    "data_month": "2026-06"
  },
  {
    "platform": "Cars & Bids",
    "scope": "generation",
    "scope_key": "generation|mazda|mx5|na",
    "scope_label": "NA-generation MX-5s",
    "rung": "generation",
    "platform_count": 6,
    "lift_rounded": 2,
    "window": 180,
    "data_month": "2026-06"
  },
  {
    "platform": "Bring a Trailer",
    "scope": "generation",
    "scope_key": "generation|toyota|supra|a80",
    "scope_label": "A80-generation Supras",
    "rung": "generation",
    "platform_count": 5,
    "lift_rounded": 2,
    "window": 180,
    "data_month": "2026-06"
  },
  {
    "platform": "Bring a Trailer",
    "scope": "model",
    "scope_key": "model|honda|element",
    "scope_label": "Elements",
    "rung": "model",
    "platform_count": 5,
    "lift_rounded": 2,
    "window": 180,
    "data_month": "2026-06"
  },
  {
    "platform": "Bring a Trailer",
    "scope": "model",
    "scope_key": "model|honda|civic",
    "scope_label": "Civics",
    "rung": "model",
    "platform_count": 5,
    "lift_rounded": 2,
    "window": 180,
    "data_month": "2026-06"
  },
  {
    "platform": "Bring a Trailer",
    "scope": "model",
    "scope_key": "model|chevrolet|corvair",
    "scope_label": "Corvairs",
    "rung": "model",
    "platform_count": 5,
    "lift_rounded": 2,
    "window": 180,
    "data_month": "2026-06"
  },
  {
    "platform": "Bring a Trailer",
    "scope": "generation",
    "scope_key": "generation|volkswagen|beetle|classic",
    "scope_label": "CLASSIC-generation Beetles",
    "rung": "generation",
    "platform_count": 5,
    "lift_rounded": 2,
    "window": 180,
    "data_month": "2026-06"
  },
  {
    "platform": "Bring a Trailer",
    "scope": "model",
    "scope_key": "model|detomaso|pantera",
    "scope_label": "Panteras",
    "rung": "model",
    "platform_count": 5,
    "lift_rounded": 2,
    "window": 180,
    "data_month": "2026-06"
  },
  {
    "platform": "Bring a Trailer",
    "scope": "model",
    "scope_key": "model|honda|acty",
    "scope_label": "Actys",
    "rung": "model",
    "platform_count": 5,
    "lift_rounded": 2,
    "window": 180,
    "data_month": "2026-06"
  },
  {
    "platform": "Bring a Trailer",
    "scope": "model",
    "scope_key": "model|volvo|1800",
    "scope_label": "1800s",
    "rung": "model",
    "platform_count": 5,
    "lift_rounded": 2,
    "window": 180,
    "data_month": "2026-06"
  },
  {
    "platform": "Hagerty",
    "scope": "generation",
    "scope_key": "generation|ford|mustang|foxbody",
    "scope_label": "FOX-BODY-generation Mustangs",
    "rung": "generation",
    "platform_count": 5,
    "lift_rounded": 2,
    "window": 180,
    "data_month": "2026-06"
  }
];

// Request-time lookup: the cell for a platform at the request's landed scope.
// scopeQuery: { rung, make, model, generationCode, segmentKey }. Returns the
// cell or null. A generation query falls back to model scope so a specialist
// still surfaces when no generation cell exists.
export function findSpecializationContext(platform, scopeQuery, table = SPECIALIZATION_CELLS) {
  if (!platform || !scopeQuery) return null;
  const p = norm(platform);
  const make = norm(scopeQuery.make), model = norm(scopeQuery.model);
  const candidates = [];
  if (scopeQuery.rung === "segment" && scopeQuery.segmentKey) candidates.push(`segment|${norm(scopeQuery.segmentKey)}`);
  if (scopeQuery.generationCode && make && model) candidates.push(`generation|${make}|${model}|${norm(scopeQuery.generationCode)}`);
  if (make && model) candidates.push(`model|${make}|${model}`);
  for (const key of candidates) {
    const hit = (table || []).find(c => norm(c.platform) === p && c.scope_key === key);
    if (hit) return hit;
  }
  return null;
}
