// THE ONE VENUE NAME MAP (Lane S, Nov 19 2026). Every source the product knows, by its key, and the name a person reads.
// The engine serves the NAME; a page prints only the name. A source key (dupontregistrylive, rmsothebys) never reaches a page.
//   CAUSE: houseName() in api/_historyData.js passed any key it did not know straight through, and "dupontregistrylive" was not in its list, so the Find badge for a duPont Registry Live car printed the key.
//   Five other maps (lib/onebox.js, lib/_email.js, lib/desk/execute.js, the Find page, the sale pages) each held a partial copy of their own and disagreed ("PCarMarket", "PCARMarket"; "Gooding", "Gooding & Co").
//   CLASS: any page, email or tile that prints a source. They all read this file now; venueName() of a key nobody named gives "" (the venue is left out), never the key.
//   scripts/venueNamesCheck.mjs fails on any raw key reaching a page and on any source the product knows that has no name here.
// Three groups, all in one table: the vendor's auction sources (sold and live), the dealer sources and the classified sources (data/forsaleSources.json). Nothing computes here.
export const VENUES = {
  // auctions: the vendor's sources, sold results and live listings
  bringatrailer: "Bring a Trailer", carsandbids: "Cars & Bids", pcarmarket: "PCarMarket", hagerty: "Hagerty",
  acc: "All Collector Cars", gooding: "Gooding & Co", rmsothebys: "RM Sotheby's", hemmings: "Hemmings",
  sothebysmotorsport: "Sotheby's Motorsport", mbmarket: "MB Market", autohunter: "AutoHunter",
  barrettjackson: "Barrett-Jackson", mecum: "Mecum", bonhams: "Bonhams", broadarrow: "Broad Arrow",
  carandclassic: "Car & Classic", collectingcars: "Collecting Cars", themarket: "The Market", pistonheads: "PistonHeads",
  dupontregistrylive: "duPont Registry Live",
  // dealers (the dealer's own site)
  streetside: "Streetside Classics", grautogallery: "GR Auto Gallery", classicautomall: "Classic Auto Mall", rkmotors: "RK Motors",
  vanguardmotorsales: "Vanguard Motor Sales", restoreamusclecar: "Restore A Muscle Car", supersportclassics: "Super Sport Classics",
  autobarnclassiccars: "Auto Barn Classic Cars", fusionmotorco: "Fusion Motor Co", driversource: "Driver Source",
  pjsautoworld: "PJ's Auto World", ellingsonmotorcars: "Ellingson Motorcars", gaudinclassic: "Gaudin Classic Motorcars",
  gpmotorsports: "GP Motorsports", gatewayclassiccars: "Gateway Classic Cars",
  // classifieds (a marketplace or listing site that carries many sellers)
  autotraderclassics: "Autotrader Classics", classiccars: "ClassicCars.com", dupontregistry: "duPont Registry",
  barnfinds: "Barn Finds", lowmilesnomiles: "Low Miles No Miles"
};
// keys that are the same venue under another spelling (the archive and the old pages wrote these)
const ALIASES = { allcollectorcars: "acc", bat: "bringatrailer", carsandclassic: "carandclassic", cb: "carsandbids" };
const keyOf = s => String(s == null ? "" : s).toLowerCase().replace(/[^a-z0-9]/g, "");
// The name of a source. A key we know gives its name; a value that is already a name ("Bring a Trailer", "Cars & Bids") passes through as it is;
// a key nobody named (all lowercase letters and digits, no space) gives "" so a page leaves the venue out rather than print a key.
export function venueName(s) {
  const raw = String(s == null ? "" : s).trim(); if (!raw) return "";
  const k = keyOf(raw), hit = VENUES[ALIASES[k] || k]; if (hit) return hit;
  return /^[a-z0-9_.-]+$/.test(raw) ? "" : raw;
}
// true for a source key (known, or the shape of one): used by the check
export const looksLikeKey = s => /^[a-z0-9_.-]{3,}$/.test(String(s || "").trim());
export const venueKeys = () => Object.keys(VENUES);
