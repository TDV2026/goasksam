// US DOLLARS ONLY (Lane B, Nov 11 2026). The Find three held a 1966 Ford Thunderbird on Car & Classic, a UK venue whose listings are priced in pounds or euros. Examples on Home, Find, Tasks and Watching never pick a listing that is not priced in US dollars.
// CAUSE: the pickers fenced on a dollar FIGURE (the trust layer's priceUsd, which a converted pound or euro bid also carries) and never on the listing's CURRENCY; the launch scope fence (liveScopeOf) that hides UK venues from Find's search was never applied to the example pools.
// RULE: read the listing's own currency field, never the venue name: a row is priced in dollars only when its currency is USD. A row with no currency, or any other, is not picked (a venue that lists in dollars and abroad is judged row by row).
export const listingCurrency = row => String((row && row.currency) || "").trim().toUpperCase();
export const pricedInUsd = row => listingCurrency(row) === "USD";
