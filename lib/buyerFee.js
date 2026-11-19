// THE ENGINE'S BUYER'S FEE RULES (lane-b-sale-name, Nov 18 2026; the arithmetic used to sit in api/history.js withFee). Only where the house's published fee is known and the sale is a USD hammer:
// Bring a Trailer 5% ($250 to $7,500), Cars & Bids 4.5% ($225 to $4,500). Elsewhere the hammer stands alone and the line is null. A page prints withFeeLine as it is and works out nothing.
const FEES = { "bring a trailer": [0.05, 250, 7500], "cars & bids": [0.045, 225, 4500], bringatrailer: [0.05, 250, 7500], carsandbids: [0.045, 225, 4500] };
const feeKey = h => String(h || "").trim().toLowerCase();
export function withFeeUsd(house, priceUsd, nativePrice) {
  const f = FEES[feeKey(house)];
  if (!f || !(Number(priceUsd) > 0) || nativePrice) return null;
  return Number(priceUsd) + Math.min(f[2], Math.max(f[1], Math.round(Number(priceUsd) * f[0])));
}
export const withFeeLineOf = (house, priceUsd, nativePrice) => { const w = withFeeUsd(house, priceUsd, nativePrice); return w ? `$${Math.round(w).toLocaleString("en-US")} with buyer's fee` : null; };
// the field a sale appearance carries
export const feeFieldsOf = a => ({ withFeeLine: a && a.kind === "sale" ? withFeeLineOf(a.house, a.priceUsd, a.nativePrice) : null });
