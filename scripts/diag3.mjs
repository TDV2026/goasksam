import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", args: ["--no-sandbox"] });
const p = await b.newPage();
await p.setCookie({ name: "gas_crew", value: "ok", domain: "goasksam.com", path: "/" });
await p.goto("https://goasksam.com/sell", { waitUntil: "networkidle2" });
const run = (f, v) => p.evaluate(async (ff, vv) => { const r = await fetch("/api/sellerDecision", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ desk: true, action: "run", dsl: { filters: { ...ff, window: "36mo" }, groupBy: [], measures: ["count","median"] }, vehicle: vv }) }); const j = await r.json(); return { status: j.status, total: j.answer && j.answer.total, excl: j.coverage && j.coverage.excluded_by_reason, sample: (j.receipts||[]).slice(0,3).map(x=>({t:(x.title||"").slice(0,40), ex:x.excluded, why:x.excluded_reason})) }; }, f, v);
const cases = [
 ["79 SLS AMG (all channel)", {make:"Mercedes-Benz",model:"SLS AMG",year_min:2011,year_max:2013}, null],
 ["79 SLS AMG channel=online", {make:"Mercedes-Benz",model:"SLS AMG",year_min:2011,year_max:2013,channel:"online"}, null],
 ["79 SLS AMG channel=house", {make:"Mercedes-Benz",model:"SLS AMG",year_min:2011,year_max:2013,channel:"house"}, null],
 ["8 Charger R/T (all)", {make:"Dodge",model:"Charger",trim:"R/T",year_min:1968,year_max:1970}, null],
 ["8 Charger no-trim", {make:"Dodge",model:"Charger",year_min:1968,year_max:1970}, null],
 ["35 928 GTS (all)", {make:"Porsche",model:"928",trim:"GTS",year_min:1993,year_max:1995}, null],
 ["35 928 no-trim", {make:"Porsche",model:"928",year_min:1993,year_max:1995}, null],
];
for (const [name, f, v] of cases) { const r = await run(f, v); console.log(name, "=> total="+r.total, "status="+r.status, "excl="+JSON.stringify(r.excl), "sample="+JSON.stringify(r.sample)); }
await b.close();
