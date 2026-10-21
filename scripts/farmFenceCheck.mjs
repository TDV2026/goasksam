// farmFenceCheck (Lane B, Oct 21 2026, Sam's Buy 1f item 13): offline, no network. The tractor and farm machine fence
// (lib/_classify.js isFarmMachineTitle) keeps tractors and farm machinery out of every car search, the same places the
// motorcycle fence acts, and never fences a car that shares a word with them.
globalThis.fetch = async () => { throw new Error("blocked"); };
delete process.env.SUPABASE_URL; delete process.env.SUPABASE_SERVICE_ROLE_KEY;
const c = await import("../lib/_classify.js");
const ob = await import("../lib/onebox.js");
const live = await import("../lib/live/search.js");
let bad = 0;
const ok = (cond, m) => { console.log((cond ? "ok   " : "FAIL ") + m); if (!cond) bad++; };
const FENCED = [["1958 Porsche-Diesel Junior 108", "Porsche"], ["1960 Porsche Diesel Standard 218", "Porsche"], ["1959 Porsche Junior", "Porsche"],
  ["1962 Porsche Super 308 N", "Porsche"], ["1961 Porsche Master 419", "Porsche"], ["1955 Allgaier A22", "Allgaier"], ["1951 Lanz Bulldog D2816", "Lanz"],
  ["1937 Fordson Model N", "Fordson"], ["1952 Ford 8N", "Ford"], ["1948 Farmall Cub Tractor", "International"], ["Lamborghini 1R Trattori", "Lamborghini"],
  ["1956 Massey Ferguson 35", "Massey Ferguson"], ["2015 John Deere Gator", "John Deere"], ["1966 Oliver 1650", "Oliver"], ["1950 Ferguson TE20", "Ferguson"],
  ["1972 Allis-Chalmers D17", "Allis-Chalmers"], ["Kubota L2501 with Backhoe", "Kubota"], ["Case IH Magnum", "Case"]];
const CARS = [["1965 International Harvester Scout 800", "International"], ["1959 Porsche 356A Super 90", "Porsche"], ["1958 Porsche 356 Super", "Porsche"],
  ["1965 Porsche 911 Standard", "Porsche"], ["1973 Porsche 911 T", "Porsche"], ["2019 Porsche 911 Carrera S", "Porsche"], ["1932 Ford Model B", "Ford"],
  ["2005 Ford GT", "Ford"], ["1948 Ford Super Deluxe", "Ford"], ["1969 Dodge Super Bee", "Dodge"], ["1957 Chevrolet Bel Air", "Chevrolet"],
  ["1952 Oldsmobile 88 Super", "Oldsmobile"], ["1951 Allard J2", "Allard"], ["Mercedes-Benz Unimog 406", "Mercedes-Benz"], ["1948 Jeep CJ-2A", "Jeep"],
  ["1967 Porsche 912", "Porsche"], ["1974 Porsche 914 2.0", "Porsche"], ["1980 Ford Fiesta S", "Ford"], ["1957 Fiat 500", "Fiat"]];
for (const [t, m] of FENCED) ok(c.isFarmMachineTitle(t, m) === true, `fenced: ${t}`);
// the report read (Oct 21 2026): the archive files International Harvester road vehicles with the model "Harvester"
for (const [t, m, mo] of [["1979 INTERNATIONAL HARVESTER SCOUT II", "INTERNATIONAL", "HARVESTER"], ["1976 International Harvester Scout II Traveler 4X4", "International", "Harvester"],
  ["1935 INTERNATIONAL HARVESTER CUSTOM PICKUP", "INTERNATIONAL", "HARVESTER"], ["1971 International Harvester 1210 Pickup", "International", "Harvester 1210 Pickup"]])
  ok(c.isFarmMachineTitle(t, m, mo) === false, `stays a car with the archive's model "${mo}": ${t}`);
ok(c.isFarmMachineTitle("No-Reserve, 1964 International Harvester McCormick Farmall Cub Tractor and Rotary Mower", "International", "Harvester") === true, "an International Harvester Farmall Cub TRACTOR is still fenced");
ok(c.isFarmMachineTitle("55-Years-Family-Owned, Turbodiesel Kubota-Powered Willys M38A1", "Willys", "M Series") === false, "a car with a tractor maker's ENGINE (Kubota-Powered Willys) stays a car");
ok(c.isFarmMachineTitle("1981 International-Harvester 1724 S", "International", "1724") === false, "the hyphenated International-Harvester (a truck) stays out of the fence");
ok(c.isFarmMachineTitle("1955 Kubota L245 Tractor", "Kubota", "L245") === true, "a Kubota tractor is still fenced");
for (const [t, m] of CARS) ok(c.isFarmMachineTitle(t, m) === false, `stays a car: ${t}`);
ok(c.isFarmMachineTitle("1958 Junior", "Porsche-Diesel") === true, "the maker in the make field fences it (Porsche-Diesel)");
ok(c.isFarmMachineTitle("1958 Porsche", "Porsche", "Porsche-Diesel") === true, "the maker in a live row's model fences it (the Buy chip)");
// the same places as the motorcycle fence: the engine's qualifier, and Buy's live rows
const spec = { make: "Porsche", model: "911" };
ok(ob.titleFenceReason({ raw_title: "1958 Porsche-Diesel Junior 108", make: "Porsche" }, spec) === "a tractor or farm machine, not a car", "the engine's title fence (qualifyReason and the live comparables panel) sets a tractor aside with its reason");
ok(ob.titleFenceReason({ raw_title: "2019 Porsche 911 Carrera S", make: "Porsche" }, spec) !== "a tractor or farm machine, not a car", "a 911 is never fenced as a tractor");
ok(live.isFarmMachine({ listing_title: "1958 Porsche-Diesel Junior 108", make: "Porsche" }) === true && live.isFarmMachine({ listing_title: "2019 Porsche 911 Carrera S", make: "Porsche" }) === false, "Buy's row fence: the tractor is out, the 911 stays");
console.log(bad ? `farmFenceCheck: ${bad} failed` : "farmFenceCheck: all passed");
process.exit(bad ? 1 : 0);
