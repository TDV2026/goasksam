// Spec G: compose the cache-warming model list for Sam's approval, then write it
// to scripts/warm-list.json (the artifact fillLadder.js consumes). No network:
// this only assembles and dedupes curated nameplates. Run: npm run warm:list.
//
// Composition = curated enthusiast/collector nameplates (below) UNION the warm.js
// SEED, deduped make+model. The depth probe (K) trims this before any fill runs.
import fs from "node:fs";

// Curated by make. Real, high-demand collector/enthusiast nameplates a TDV reader
// is likely to search. Breadth over exhaustiveness; K's coverage census prunes.
const MODELS_BY_MAKE = {
  Porsche: ["911", "911 Turbo", "911 GT3", "911 Carrera", "930", "993", "996", "997", "991", "992", "356", "912", "914", "944", "928", "968", "Boxster", "Cayman", "Cayman GT4", "Panamera", "Macan", "Cayenne", "Carrera GT"],
  Ferrari: ["308", "328", "348", "355", "360", "430", "458", "488", "512", "550", "575", "599", "612", "Testarossa", "Mondial", "California", "F355", "F430", "F12", "812", "Dino 246", "Portofino", "Roma"],
  Lamborghini: ["Countach", "Diablo", "Murcielago", "Gallardo", "Huracan", "Aventador", "Urus", "Miura", "Espada", "Jarama", "Jalpa", "LM002"],
  Chevrolet: ["Corvette", "Corvette Stingray", "Corvette Z06", "Camaro", "Camaro Z28", "Camaro SS", "Chevelle", "Chevelle SS", "Bel Air", "Nova", "Impala", "El Camino", "C10", "K5 Blazer", "Nomad", "Monte Carlo", "Corvair", "Chevy II", "SSR"],
  Ford: ["Mustang", "Mustang GT", "Mustang Shelby GT500", "Mustang Boss 302", "Bronco", "F-100", "F-150", "GT", "GT40", "Thunderbird", "Fairlane", "Torino", "Galaxie", "Falcon", "Ranchero", "Model A", "Deuce", "Escort RS", "Focus RS", "Sierra Cosworth", "Capri"],
  Shelby: ["Cobra", "GT350", "GT500", "Daytona"],
  Dodge: ["Charger", "Challenger", "Challenger Hellcat", "Charger Hellcat", "Viper", "Dart", "Coronet", "Super Bee", "Demon", "D150", "Power Wagon"],
  Plymouth: ["Barracuda", "Cuda", "Road Runner", "GTX", "Superbird", "Duster", "Satellite", "Fury"],
  Pontiac: ["GTO", "Firebird", "Trans Am", "Bonneville", "Catalina", "LeMans", "Grand Prix"],
  Oldsmobile: ["442", "Cutlass", "Toronado", "88"],
  Buick: ["Grand National", "GNX", "GS", "Riviera", "Skylark", "Regal"],
  Cadillac: ["Eldorado", "DeVille", "Series 62", "CTS-V", "Escalade", "Allante"],
  BMW: ["M3", "M5", "M2", "M4", "M6", "2002", "2002 tii", "3.0 CS", "E30", "E36", "E46", "E39", "Z3", "Z3 M", "Z4", "Z8", "1M", "M1", "8 Series", "850i", "i8", "2002 Turbo", "507"],
  "Mercedes-Benz": ["SL", "300SL", "280SL", "560SL", "190SL", "300SEL", "600", "AMG GT", "SLS AMG", "G-Class", "G500", "G550", "C63 AMG", "E63 AMG", "CLK GTR", "190E", "280SE", "450SEL", "SLK"],
  Audi: ["Quattro", "RS4", "RS6", "S4", "R8", "TT", "Sport Quattro", "80", "Coupe GT"],
  Volkswagen: ["Beetle", "Bus", "Type 2", "Karmann Ghia", "Golf GTI", "GTI", "Corrado", "Thing", "Vanagon", "Scirocco", "R32", "Golf R"],
  Toyota: ["Land Cruiser", "FJ40", "FJ60", "FJ62", "Supra", "Supra MK4", "MR2", "Celica", "AE86", "Corolla", "2000GT", "Tacoma", "4Runner", "Tundra", "GR86", "86", "Previa"],
  Nissan: ["GT-R", "Skyline", "Skyline GT-R", "240Z", "260Z", "280Z", "280ZX", "300ZX", "350Z", "370Z", "Z", "Silvia", "240SX", "Pathfinder", "Patrol", "Sentra SE-R"],
  Datsun: ["510", "240Z", "260Z", "280Z", "620", "Roadster", "1200"],
  Mazda: ["MX-5 Miata", "Miata", "RX-7", "RX-8", "RX-3", "Cosmo", "323 GTX", "Mazdaspeed3", "B2000"],
  Honda: ["S2000", "Civic", "Civic Type R", "Civic Si", "CRX", "Prelude", "Integra", "NSX", "S600", "S800", "Del Sol", "Ridgeline"],
  Acura: ["NSX", "Integra", "Integra Type R", "RSX", "Legend", "TL Type-S"],
  Subaru: ["Impreza", "Impreza WRX", "WRX", "WRX STI", "STI", "BRZ", "Legacy", "SVX", "Forester", "Baja", "360"],
  Mitsubishi: ["Lancer Evolution", "Evo", "3000GT", "Eclipse", "Starion", "Montero", "Galant VR-4"],
  Jaguar: ["E-Type", "XKE", "XK120", "XK140", "XK150", "XKR", "XJ", "XJS", "XK8", "F-Type", "Mark 2", "XJ220"],
  "Aston Martin": ["Vantage", "DB4", "DB5", "DB6", "DB7", "DB9", "DBS", "V8 Vantage", "Vanquish", "Virage", "Lagonda"],
  Lotus: ["Elise", "Exige", "Esprit", "Europa", "Elan", "Seven", "Evora", "Elite"],
  "Land Rover": ["Defender", "Range Rover", "Series", "Series III", "Discovery", "Range Rover Classic"],
  Jeep: ["Wrangler", "CJ", "CJ5", "CJ7", "Grand Wagoneer", "Wagoneer", "Cherokee", "Grand Cherokee", "Gladiator", "Scrambler"],
  International: ["Scout", "Scout II", "Harvester", "Travelall"],
  "Alfa Romeo": ["Spider", "Giulia", "Giulietta", "GTV", "Montreal", "4C", "2000", "1750", "Duetto"],
  Maserati: ["GranTurismo", "Ghibli", "Quattroporte", "Bora", "Merak", "Biturbo", "3200 GT", "Coupe", "MC20"],
  "Lancia": ["Delta", "Delta Integrale", "Stratos", "Fulvia", "037", "Beta"],
  Fiat: ["124 Spider", "500", "Dino", "X1/9", "850", "Abarth"],
  "Rolls-Royce": ["Silver Shadow", "Corniche", "Silver Cloud", "Phantom", "Wraith", "Silver Spirit"],
  Bentley: ["Continental", "Continental GT", "Azure", "Arnage", "Turbo R", "Mulsanne"],
  "MG": ["MGB", "MGA", "MG TD", "MG TF", "Midget", "MGB GT"],
  Triumph: ["TR6", "TR4", "TR3", "TR250", "Spitfire", "GT6", "Stag", "TR7"],
  "Austin-Healey": ["3000", "100", "Sprite", "Bugeye"],
  "Mini": ["Cooper", "Cooper S", "Classic Mini"],
  "Volvo": ["1800", "P1800", "122", "240", "Amazon", "PV544"],
  Saab: ["900", "900 Turbo", "99", "Sonett"],
  DeLorean: ["DMC-12"],
  Studebaker: ["Avanti", "Hawk", "Champion"],
  "Pontiac (GM)": [],
  Hummer: ["H1", "H2"],
  GMC: ["Syclone", "Typhoon", "Jimmy", "Sierra", "Suburban"],
  Lincoln: ["Continental", "Mark III", "Mark IV", "Mark V", "Town Car"],
  Chrysler: ["300", "300C", "Town & Country", "Newport", "Cordoba"],
  AMC: ["Javelin", "AMX", "Gremlin", "Eagle", "Rebel"],
  McLaren: ["MP4-12C", "570S", "650S", "720S", "F1", "P1"],
  Bugatti: ["Veyron", "Chiron", "EB110"],
  "Koenigsegg": ["Agera", "CCX"],
  Ferrari_Vintage: [],
  Isuzu: ["VehiCROSS", "Trooper"],
  Suzuki: ["Samurai", "Jimny", "Cappuccino"],
  "TVR": ["Griffith", "Chimaera", "Cerbera"],
  "De Tomaso": ["Pantera", "Mangusta"]
};

// SEED from warm.js (kept in sync manually; a small overlap is fine, we dedupe).
const SEED = [
  ["Porsche", "911"], ["Chevrolet", "Corvette"], ["Ford", "Mustang"], ["Chevrolet", "Camaro"],
  ["Toyota", "Land Cruiser"], ["Ford", "Bronco"], ["Mazda", "MX-5 Miata"], ["BMW", "M3"],
  ["Nissan", "GT-R"], ["Chevrolet", "Chevelle"], ["Dodge", "Charger"], ["Dodge", "Challenger"],
  ["Porsche", "Cayman"], ["Porsche", "Boxster"], ["Honda", "S2000"], ["Acura", "NSX"],
  ["Toyota", "Supra"], ["Nissan", "240Z"], ["Mazda", "RX-7"], ["Ferrari", "308"],
  ["Ferrari", "F355"], ["Lamborghini", "Gallardo"], ["Jaguar", "E-Type"], ["Mercedes-Benz", "SL"],
  ["BMW", "M5"], ["Subaru", "Impreza"], ["Ford", "GT"], ["Chevrolet", "Bel Air"],
  ["Volkswagen", "Beetle"], ["Land Rover", "Defender"], ["Alfa Romeo", "Spider"], ["Datsun", "510"],
  ["Pontiac", "Firebird"], ["Plymouth", "Barracuda"], ["Aston Martin", "Vantage"], ["Maserati", "GranTurismo"]
];

const seen = new Set();
const list = [];
const add = (make, model) => {
  const m = String(make).replace(/\s*\(GM\)|_Vintage/i, "").trim();
  const k = `${m.toLowerCase()}|${String(model).toLowerCase()}`;
  if (!model || seen.has(k)) return;
  seen.add(k); list.push([m, model]);
};
for (const [make, models] of Object.entries(MODELS_BY_MAKE)) for (const model of models) add(make, model);
for (const [make, model] of SEED) add(make, model);

const out = new URL("./warm-list.json", import.meta.url).pathname;
fs.writeFileSync(out, JSON.stringify({ generatedAt: new Date().toISOString(), count: list.length, models: list }, null, 2));
console.log(`Wrote ${list.length} nameplate(s) to ${out}`);
console.log(`Makes: ${new Set(list.map(x => x[0])).size}`);
