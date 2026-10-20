// The Amazon Autos demo's own cars (Sam, Oct 20 2026, Amazon revision 2 item 6). Kept apart from DEMO_CARS
// (api/partnerAnswer.js), which the eBay demo shares and Sam keeps for eBay. The stored-answer store (demoKey) accepts
// both lists; task=warmDemo&profile=amazon and task=warmDemoCheck&profile=amazon warm this list with the same budget and
// tiers as the eBay warm. No imports, so api/partnerAnswer.js and api/_amazonDemo.js can both read it without a cycle.
// PROPOSED (Lane E's seven-car table, lane-notes Oct 20 2026 18:07Z); replaced in this one line once Sam approves.
export const AMAZON_DEMO_CARS = ["2017 Porsche 911 Carrera", "2022 Porsche 911 GT3", "2017 Audi R8 V10 Plus", "2019 Mercedes-AMG GT", "2013 BMW M3 Coupe", "2016 Ferrari 488 GTB", "2016 Mercedes-Benz C63 AMG"];
