import puppeteer from "puppeteer-core";
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const inputs = ["1988 325i Convertible","1988 325i coupe","1988 325i wagon","1988 325i cabriolet","1965 convertible","1988 325i sedan"];
const b = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
const p = await b.newPage();
await p.goto("https://goasksam.com/sell", { waitUntil: "networkidle2", timeout: 45000 });
await new Promise(r=>setTimeout(r,1200));
for (const text of inputs) {
  const j = await p.evaluate(async(text)=>{ const r=await fetch("/api/vehicleIdentity",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text})}); return await r.json(); }, text);
  const v=j.vehicle||{};
  console.log(`'${text}' => ${j.status} | make=${v.make} model=${v.model} trim=${v.trim} body=${v.bodyStyle}`);
  console.log(`   corrections: ${JSON.stringify(j.corrections||[])}`);
}
await b.close();
