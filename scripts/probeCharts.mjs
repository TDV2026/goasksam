import puppeteer from "puppeteer-core";
const CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const Q = {
  Q1:"Which house has sold the most air-cooled 911s in the last two years, and what did they bring?",
  Q2:"Sell-through by price band on Bring a Trailer this quarter versus last.",
  Q3:"E30 M3s: median and count by month over three years, houses and online.",
  Q5:"Day of week and listing length effects for 964s online.",
  Q6:"Share of 250-series Ferrari sales by house, by year, three years."
};
const b = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
const p = await b.newPage();
await p.setCookie({ name: "gas_crew", value: "ok", domain: "goasksam.com", path: "/" });
await p.goto("https://goasksam.com/sell", { waitUntil: "networkidle2" });
for (const [k,q] of Object.entries(Q)) {
  const j = await p.evaluate(async (x) => (await fetch("/api/sellerDecision",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({desk:true,action:"run",question:x})})).json(), q);
  console.log(k, "total="+j.answer.total, "charts:", (j.charts||[]).map(c=>c.type+(c.mode?"/"+c.mode:"")+(c.scale?"/"+c.scale:"")+(c.series?"/series:"+c.series:"")).join(", "));
}
await b.close();
