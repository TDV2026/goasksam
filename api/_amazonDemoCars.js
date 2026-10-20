// The Amazon Autos demo's own cars (Sam, Oct 20 2026, Amazon revision 2 item 6). Kept apart from DEMO_CARS
// (api/partnerAnswer.js), which the eBay demo shares and Sam keeps for eBay. The stored-answer store (demoKey) accepts
// both lists; task=warmDemo&profile=amazon and task=warmDemoCheck&profile=amazon warm this list with the same budget and
// tiers as the eBay warm. No imports, so api/partnerAnswer.js and api/_amazonDemo.js can both read it without a cycle.
// APPROVED by Sam (Oct 20 2026, "i approve", the plain AMG GT). Each name is the car's OWN listing title as read at
// 18:19Z, except the C63: its own title ("2016 Mercedes-AMG C63 Sedan") reads with every sedan sale set aside and no
// sales shown, so it keeps the approved typed name, whose answer is the thin one Sam approved.
export const AMAZON_DEMO_CARS = ["2017 Porsche 911 Carrera Coupe", "2022 Porsche 911 GT3 6-Speed", "2017 Audi R8 V10 Plus Coupe", "2019 Mercedes-AMG GT Roadster", "2013 BMW M3 Coupe Competition Package", "2016 Ferrari 488 GTB", "2016 Mercedes-Benz C63 AMG"];
