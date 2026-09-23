import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", args: ["--no-sandbox"] });
const p = await b.newPage();
await p.setCookie({ name: "gas_crew", value: "ok", domain: "goasksam.com", path: "/" });
await p.goto("https://goasksam.com/sell", { waitUntil: "networkidle2" });
// mimic the harness: house+online, vehicle carries bodyStyle
const ch = (f, v, channel) => p.evaluate(async (ff, vv, c) => { const r = await fetch("/api/sellerDecision", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ desk: true, action: "run", dsl: { filters: { ...ff, channel: c, window: "36mo" }, groupBy: [], measures: ["count"] }, vehicle: vv }) }); const j = await r.json(); return { t: j.answer && j.answer.total, ex: j.coverage && j.coverage.excluded_by_reason, s: (j.receipts||[]).filter(x=>!x.excluded).slice(0,2).map(x=>(x.title||"").slice(0,40)) }; }, f, v, channel);
async function T(name, f, v) { const H = await ch(f, v, "house"); const O = await ch(f, v, "online"); console.log(name, "| house", H.t, "online", O.t, "| onlineExcl", JSON.stringify(O.ex), "| kept", JSON.stringify(O.s)); }
// 9 GT350: with body vs without
await T("9 GT350 +body fastback", {make:"Shelby",model:"GT350",year_min:1965,year_max:1967}, {make:"Shelby",model:"GT350",year:1966,bodyStyle:"fastback"});
await T("9 GT350 no body", {make:"Shelby",model:"GT350",year_min:1965,year_max:1967}, {make:"Shelby",model:"GT350",year:1966});
// 15 F-100: trim short bed vs no trim
await T("15 F-100 +trim short bed", {make:"Ford",model:"F-100",trim:"short bed",year_min:1963,year_max:1967}, {make:"Ford",model:"F-100",year:1965});
await T("15 F-100 no trim", {make:"Ford",model:"F-100",year_min:1963,year_max:1967}, {make:"Ford",model:"F-100",year:1965});
// 52 Cobra: +body hatchback vs no body ; trim Cobra
await T("52 Cobra +body hatch", {make:"Ford",model:"Mustang",trim:"Cobra",year_min:1991,year_max:1993}, {make:"Ford",model:"Mustang",trim:"Cobra",year:1993,bodyStyle:"hatchback"});
await T("52 Cobra no body", {make:"Ford",model:"Mustang",trim:"Cobra",year_min:1991,year_max:1993}, {make:"Ford",model:"Mustang",trim:"Cobra",year:1993});
// 82 Carrera T: +body coupe vs no body, year 2018-2019
await T("82 Carrera T +body 18-19", {make:"Porsche",model:"911",trim:"Carrera T",year_min:2018,year_max:2019}, {make:"Porsche",model:"911",trim:"Carrera T",year:2018,bodyStyle:"coupe"});
await T("82 Carrera T no body", {make:"Porsche",model:"911",trim:"Carrera T",year_min:2018,year_max:2019}, {make:"Porsche",model:"911",trim:"Carrera T",year:2018});
// 91 Huracan LP610: +body coupe vs no body
await T("91 Huracan +body coupe", {make:"Lamborghini",model:"Huracan",trim:"LP610",year_min:2015,year_max:2017}, {make:"Lamborghini",model:"Huracan",trim:"LP610",year:2015,bodyStyle:"coupe"});
await T("91 Huracan no body", {make:"Lamborghini",model:"Huracan",trim:"LP610",year_min:2015,year_max:2017}, {make:"Lamborghini",model:"Huracan",trim:"LP610",year:2015});
await b.close();
