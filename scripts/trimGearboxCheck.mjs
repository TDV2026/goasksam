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
// Generic words (Oct 20 2026): "Edition" and "Anniversary" are never a chip on their own; those sales fold into "Other trims"
// with their count. Titles from the archive sample (the 2004/2005 Viper Mamba Edition, the 1969 Camaro Pace Car Edition).
const viper = trimGroupsFromSales(rows([
  "2004 Dodge Viper Mamba Edition", "2004 Dodge Viper Mamba Edition", "2004 Dodge Viper Mamba Edition",
  "2004 Dodge Viper SRT-10", "2004 Dodge Viper SRT-10", "2004 Dodge Viper SRT-10",
  "2004 Dodge Viper 10th Anniversary Edition", "2004 Dodge Viper 10th Anniversary Edition", "2004 Dodge Viper 10th Anniversary Edition"
]), { make: "Dodge", model: "Viper", year: 2004 });
const vl = viper.named.map(x => x.label.toLowerCase());
ok(!vl.includes("edition") && !vl.includes("anniversary"), `Edition and Anniversary are never a chip (named: ${JSON.stringify(vl)})`);
ok(viper.other === 6, `the Edition and Anniversary sales fold into Other trims with their count (${viper.other})`);
const camaro = trimGroupsFromSales(rows(["1969 Chevrolet Camaro Pace Car Edition Convertible", "1969 Chevrolet Camaro Pace Car Edition Convertible", "1969 Chevrolet Camaro Pace Car Edition Convertible"]), { make: "Chevrolet", model: "Camaro", year: 1969 });
ok(!camaro.named.some(x => /edition|car/i.test(x.label)), `no invented "Car Edition" or "Edition" (named: ${JSON.stringify(camaro.named.map(x => x.label))})`);
const gt = trimGroupsFromSales(rows(["2006 Ford GT Heritage Edition", "2006 Ford GT Heritage Edition", "2006 Ford GT Heritage Edition"]), { make: "Ford", model: "GT", year: 2006 });
ok(gt.named.some(x => x.label.toLowerCase() === "heritage"), `Heritage stays a trim word (named: ${JSON.stringify(gt.named.map(x => x.label))})`);
// Phrase-shaped body words (Oct 20 2026, the trim word count): Sport before Coupe/Spider and Touring before Sedan/Car are never a
// chip; elsewhere Sport, Touring, Super and Classic stay real trims. Titles from the archive table.
const named = (ts, spec) => trimGroupsFromSales(rows(ts), spec).named.map(x => x.label.toLowerCase());
const x3 = t => [t, t, t];
ok(!named(x3("1970 Chevrolet Chevelle Malibu Sport Coupe 4-Speed"), { make: "Chevrolet", model: "Chevelle", year: 1970 }).includes("sport"), "1970 Chevelle Malibu Sport Coupe: no Sport chip");
ok(!named(x3("1972 Chevrolet Chevelle Malibu Sport Coupe"), { make: "Chevrolet", model: "Chevelle", year: 1972 }).includes("sport"), "1972 Chevelle Malibu Sport Coupe: no Sport chip");
ok(!named(x3("1977 Fiat 124 Sport Spider"), { make: "Fiat", model: "124", year: 1977 }).includes("sport"), "Fiat 124 Sport Spider: no Sport chip");
ok(!named(x3("1939 Buick Special Series 40 Touring Sedan"), { make: "Buick", model: "Special", year: 1939 }).includes("touring"), "1939 Buick Special Touring Sedan: no Touring chip");
ok(!named(x3("1923 Ford Model T Touring Car"), { make: "Ford", model: "Model T", year: 1923 }).includes("touring"), "Ford Model T Touring Car: no Touring chip");
ok(named(x3("2001 Jeep Wrangler Sport 5-Speed"), { make: "Jeep", model: "Wrangler", year: 2001 }).includes("sport"), "Jeep Wrangler Sport keeps its Sport chip");
ok(named(x3("1993 Mazda RX-7 Touring 5-Speed"), { make: "Mazda", model: "RX-7", year: 1993 }).includes("touring"), "Mazda RX-7 Touring keeps its Touring chip");
ok(named(x3("1960 Porsche 356 B 1600 Super 90 Cabriolet"), { make: "Porsche", model: "356", year: 1960 }).some(l => /super/.test(l)), "356 Super 90 keeps its Super chip");
ok(named(x3("1996 Chevrolet Caprice Classic LT1"), { make: "Chevrolet", model: "Caprice", year: 1996 }).includes("classic"), "Caprice Classic keeps its Classic chip");
console.log(bad ? `trimGearboxCheck: ${bad} failed` : "trimGearboxCheck: all passed");
process.exit(bad ? 1 : 0);
