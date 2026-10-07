// Hyphenated model codes (Oct 2026): unit test of joinShortHyphens (local) and, with --live, the deployed
// resolver (/api/vehicleIdentity) for XJ-S / XJS and one case per prefix pair. Exits 1 on any failure.
import { joinShortHyphens } from "../lib/vehicle.js";
const fails = [];
const check = (name, ok, got) => { console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  got " + JSON.stringify(got)}`); if (!ok) fails.push(name); };
const J = [["Jaguar XJ-S", "Jaguar XJS"], ["Shelby GT-350", "Shelby GT350"], ["Datsun 240-Z", "Datsun 240Z"], ["Camaro Z-28", "Camaro Z28"], ["Corvette ZR-1", "Corvette ZR1"], ["Jeep CJ-5", "Jeep CJ5"],
  ["Jaguar E-Type", "Jaguar E-Type"], ["Ford T-Bird", "Ford T-Bird"], ["Rolls-Royce Silver Cloud", "Rolls-Royce Silver Cloud"], ["6-speed", "6-speed"], ["65-70 Mustang", "65-70 Mustang"], ["1965-1970 Mustang", "1965-1970 Mustang"], ["Oldsmobile 4-4-2", "Oldsmobile 4-4-2"], ["Mercedes AMG-GT", "Mercedes AMG-GT"]];
for (const [i, o] of J) { const g = joinShortHyphens(i); check(`join "${i}" -> "${o}"`, g === o, g); }
if (process.argv.includes("--live")) {
  const { default: puppeteer } = await import("puppeteer-core");
  const b = await puppeteer.launch({ executablePath: process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", args: ["--no-sandbox"] });
  const p = await b.newPage(); await p.goto((process.env.SITE || "https://goasksam.com") + "/buy", { waitUntil: "domcontentloaded" });
  const res = t => p.evaluate(async t => { const j = await (await fetch("/api/vehicleIdentity", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: t }) })).json(); return j.vehicle || {}; }, t);
  const L = [
    ["1992 Jaguar XJ-S V12 coupe", v => v.model === "XJS"], ["1992 Jaguar XJ-S", v => v.model === "XJS"], ["1992 Jaguar XJS", v => v.model === "XJS"], ["1992 Jaguar XJ6", v => v.model === "XJ6"],
    ["1966 Shelby GT-350", v => v.model === "GT350"], ["1969 Chevrolet Camaro Z-28", v => v.model === "Camaro" && v.trim === "Z28"], ["1990 Chevrolet Corvette ZR-1", v => v.model === "Corvette" && v.trim === "ZR1"],
    ["1995 Mazda RX-7", v => v.model === "RX-7" && !v.trim], ["1976 Jeep CJ-5", v => v.model === "CJ-5" && !v.trim], ["2010 Nissan GT-R", v => v.model === "GT-R" && !v.trim], ["1965 Jaguar E-Type", v => v.model === "E-Type"],
    // prefix pairs: the longer name never collapses into the shorter, the shorter never grows
    ["1995 Porsche 911 Turbo", v => v.model === "911" && v.trim === "Turbo"], ["1995 Porsche 911", v => v.model === "911" && !v.trim],
    ["2020 BMW M3 Competition", v => v.model === "M3" && v.trim === "Competition"], ["2008 BMW M3", v => v.model === "M3" && !v.trim],
    ["1969 Dodge Charger R/T", v => v.model === "Charger" && v.trim === "R/T"], ["1969 Dodge Charger", v => v.model === "Charger" && !v.trim],
    ["2006 Chevrolet Corvette Z06", v => v.model === "Corvette" && v.trim === "Z06"], ["2006 Chevrolet Corvette", v => v.model === "Corvette" && !v.trim]
  ];
  for (const [t, ok] of L) { const v = await res(t); check(`resolve "${t}"`, ok(v), { model: v.model, trim: v.trim }); }
  await b.close();
}
console.log(fails.length ? `\n${fails.length} FAILED` : "\nALL PASS");
process.exit(fails.length ? 1 : 0);
