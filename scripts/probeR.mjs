import puppeteer from "puppeteer-core";
const CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const b = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
const p = await b.newPage();
await p.setCookie({ name: "gas_crew", value: "ok", domain: "goasksam.com", path: "/" });
await p.goto("https://goasksam.com/sell", { waitUntil: "networkidle2" });
for (const t of ["E30 M3","BMW M3","993 Turbo","Porsche 993 Turbo"]) {
  const vi = await p.evaluate(async (x) => (await fetch("/api/vehicleIdentity",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({text:x})})).json(), t);
  console.log(t, "=> status:", vi.status, "make:", vi.vehicle&&vi.vehicle.make, "model:", vi.vehicle&&vi.vehicle.model, "trim:", vi.vehicle&&vi.vehicle.trim);
}
// raw archive pool for M3 (BaT) and 993 Turbo title
for (const [term,mk] of [["M3","BMW"],["993 Turbo","Porsche"],["911 Turbo","Porsche"]]) {
  const r = await p.evaluate(async (a)=> (await fetch("/api/sellerDecision",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({archiveQuery:"pool",term:a[0],make:a[1],dateFrom:"2023-09-23",dateTo:"2026-09-23"})})).json(), [term,mk]);
  console.log("raw pool term='"+term+"' make="+mk+":", (r.rows||[]).length);
}
await b.close();
