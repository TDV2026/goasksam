import puppeteer from "puppeteer-core";
// THE LIVE GUARD (Lane F's rule, Oct 20 2026): this script POSTs to PRODUCTION /api/sellerDecision (the full Sell path,
// which can spend OldCarsData on a cache miss). It refuses without --live and says what it would call; run it only in a
// gap the lanes name, with the protection-bypass header.
if (!process.argv.includes("--live")) { console.log("probeDeskDbg: REFUSED. This script POSTs to production /api/sellerDecision (the full Sell path). Run it only in a gap the lanes name, with --live."); process.exit(2); }
const CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const b = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
const p = await b.newPage();
await p.setCookie({ name: "gas_crew", value: process.env.GAS_CREW_COOKIE || "", domain: "goasksam.com", path: "/" });
await p.goto("https://goasksam.com/sell", { waitUntil: "networkidle2" });
// 1) map only
const mapRes = await p.evaluate(async () => (await fetch("/api/sellerDecision",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({desk:true,action:"map",question:"Which house has sold the most air-cooled 911s in the last two years, and what did they bring?"})})).json());
console.log("MAP:", JSON.stringify(mapRes));
// 2) resolveVehicle Porsche 911 via vehicleIdentity
const vi = await p.evaluate(async () => (await fetch("/api/vehicleIdentity",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({text:"Porsche 911"})})).json());
console.log("RESOLVE Porsche 911: status=", vi.status, "vehicle.make=", vi.vehicle&&vi.vehicle.make, "model=", vi.vehicle&&vi.vehicle.model, "clar=", vi.clarification&&vi.clarification.kind);
// 3) run + full resolution
const runRes = await p.evaluate(async () => (await fetch("/api/sellerDecision",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({desk:true,action:"run",question:"Which house has sold the most air-cooled 911s in the last two years, and what did they bring?"})})).json());
console.log("RUN status:", runRes.status, "reason:", runRes.reason, "| resolution.status:", runRes.resolution&&runRes.resolution.status, "veh.make:", runRes.resolution&&runRes.resolution.vehicle&&runRes.resolution.vehicle.make, "model:", runRes.resolution&&runRes.resolution.vehicle&&runRes.resolution.vehicle.model);
await b.close();
