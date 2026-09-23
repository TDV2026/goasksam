import puppeteer from "puppeteer-core";
const CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const b = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
const p = await b.newPage();
await p.setCookie({ name: "gas_crew", value: "ok", domain: "goasksam.com", path: "/" });
await p.goto("https://goasksam.com/sell", { waitUntil: "networkidle2" });
// Desk Q8
const d = await p.evaluate(async () => (await fetch("/api/sellerDecision",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({desk:true,action:"run",question:"1929 Duesenberg Model J, every house sale, rooms stated or inferred."})})).json());
console.log("DESK Q8 echo:", JSON.stringify(d.echo && d.echo.dsl && d.echo.dsl.filters));
console.log("DESK Q8 total:", d.answer && d.answer.total);
if (d.answer) for (const r of d.answer.rows) console.log("   ", r.group, "n="+r.count, "median="+r.median);
// One Box path for the same car (its house comparison / receipts)
const ob = await p.evaluate(async () => (await fetch("/api/sellerDecision",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({oneBox:true,car:{vehicle:{year:1929,make:"Duesenberg",model:"Model J"}}})})).json());
const hc = ob && (ob.decision && ob.decision.thin && ob.decision.thin.houseComparison || ob.houseComparison);
if (hc && hc.houses) { console.log("ONEBOX house comparison houses:", hc.houses.map(h=>h.display+":"+h.count).join(", "), "| total house:", hc.totalHouse); }
else console.log("ONEBOX houseComparison:", hc ? "present but no houses" : "none; status="+(ob&&ob.status)+" thin="+JSON.stringify(ob&&ob.decision&&ob.decision.thin&&{isThin:ob.decision.thin.isThin,houseN:ob.decision.thin.houseN}));
await b.close();
