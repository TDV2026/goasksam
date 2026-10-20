// trimGearboxCheck (Lane B, Oct 20 2026, B2's row 21: the typed "1965 Ford Mustang coupe" asked "These sold as 3Speed and
// 4Speed, and they price differently. Which one is it?"): a trim question's options come from the sales' own titles, and a
// GEARBOX word ("3-Speed", "4-Speed", "Manual", "Automatic", "Tiptronic", "PDK" ...) is never a trim. Real trim words
// still group (330i / M340i, GT / GT350). Offline: pure function, no network, no database.
import { trimGroupsFromSales } from "../lib/onebox.js";
let bad = 0;
const ok = (c, m) => { if (c) console.log("ok   " + m); else { bad++; console.log("FAIL " + m); } };
const rows = ts => ts.map(t => ({ title: t, raw_title: t }));
const mustang = { make: "Ford", model: "Mustang", year: 1965 };
const m65 = rows([
  "1965 Ford Mustang Coupe 3-Speed", "1965 Ford Mustang Coupe 3-Speed", "1965 Ford Mustang Coupe 3-Speed",
  "1965 Ford Mustang Coupe 4-Speed", "1965 Ford Mustang Coupe 4-Speed", "1965 Ford Mustang Coupe 4-Speed",
  "1965 Ford Mustang 289 Coupe 4-Speed", "1965 Ford Mustang Coupe Automatic", "1965 Ford Mustang Coupe Automatic",
  "1965 Ford Mustang Coupe Automatic", "1965 Ford Mustang Coupe 3 Speed", "1965 Ford Mustang Coupe Manual"
]);
const g = trimGroupsFromSales(m65, mustang);
const labels = g.named.map(x => x.label.toLowerCase());
ok(!labels.some(l => /speed|manual|automatic|^auto$/.test(l)), `no gearbox word is a trim option (named: ${JSON.stringify(labels)})`);
ok(g.named.length < 2, "the 1965 Mustang coupe's sales give no trim question (fewer than two named trims)");
const pdk = trimGroupsFromSales(rows([
  "2019 Porsche 911 Carrera S PDK", "2019 Porsche 911 Carrera S PDK", "2019 Porsche 911 Carrera S PDK",
  "2019 Porsche 911 Carrera 7-Speed", "2019 Porsche 911 Carrera 7-Speed", "2019 Porsche 911 Carrera 7-Speed",
  "2004 Porsche 911 Carrera Tiptronic", "2004 Porsche 911 Carrera Tiptronic", "2004 Porsche 911 Carrera Tiptronic"
]), { make: "Porsche", model: "911", year: 2019 }).named.map(x => x.label.toLowerCase());
ok(!pdk.some(l => /speed|pdk|tiptronic/.test(l)), `PDK, Tiptronic and 7-Speed are never trims (named: ${JSON.stringify(pdk)})`);
const bmw = trimGroupsFromSales(rows([
  "2021 BMW 3 Series 330i 6-Speed", "2021 BMW 3 Series 330i", "2021 BMW 3 Series 330i",
  "2021 BMW 3 Series M340i", "2021 BMW 3 Series M340i Automatic", "2021 BMW 3 Series M340i"
]), { make: "BMW", model: "3 Series", year: 2021 }).named.map(x => x.label);
ok(bmw.includes("330i") && bmw.includes("M340i"), `real trim words still group (named: ${JSON.stringify(bmw)})`);
console.log(bad ? `trimGearboxCheck: ${bad} failed` : "trimGearboxCheck: all passed");
process.exit(bad ? 1 : 0);
