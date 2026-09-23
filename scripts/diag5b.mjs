import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", args: ["--no-sandbox"] });
const p = await b.newPage();
await p.setCookie({ name: "gas_crew", value: "ok", domain: "goasksam.com", path: "/" });
await p.goto("https://goasksam.com/sell", { waitUntil: "networkidle2" });
const ch = (f, v, c) => p.evaluate(async (ff, vv, cc) => { const r = await fetch("/api/sellerDecision", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ desk: true, action: "run", dsl: { filters: { ...ff, channel: cc, window: "36mo" }, groupBy: [], measures: ["count"] }, vehicle: vv }) }); const j = await r.json(); return { t: j.answer && j.answer.total, ex: j.coverage && j.coverage.excluded_by_reason, s: (j.receipts||[]).filter(x=>!x.excluded).slice(0,3).map(x=>(x.title||"").slice(0,42)) }; }, f, v, c);
async function T(n,f,v){const O=await ch(f,v,"online");console.log(n,"online",O.t,"excl",JSON.stringify(O.ex),"kept",JSON.stringify(O.s));}
await T("9 GT350 trim=GT350", {make:"Shelby",model:"Mustang",trim:"GT350",year_min:1965,year_max:1967}, {make:"Shelby",model:"Mustang",trim:"GT350",year:1966});
await T("52 SVT Cobra", {make:"Ford",model:"Mustang",trim:"SVT Cobra",year_min:1993,year_max:1993}, {make:"Ford",model:"Mustang",trim:"SVT Cobra",year:1993});
await T("52 Cobra model=SVT Cobra", {make:"Ford",model:"SVT Cobra",year_min:1993,year_max:1993}, {make:"Ford",model:"SVT Cobra",year:1993});
await T("91 Huracan trim=610-4", {make:"Lamborghini",model:"Huracan",trim:"610-4",year_min:2015,year_max:2016}, {make:"Lamborghini",model:"Huracan",trim:"610-4",year:2015});
await T("91 Huracan trim=LP610-4", {make:"Lamborghini",model:"Huracan",trim:"LP610-4",year_min:2015,year_max:2016}, {make:"Lamborghini",model:"Huracan",trim:"LP610-4",year:2015});
await b.close();
