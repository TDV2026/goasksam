import puppeteer from "puppeteer-core";
const CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const Q = [
  ["q1","Which house has sold the most air-cooled 911s in the last two years, and what did they bring?"],
  ["q2","Sell-through by price band on Bring a Trailer this quarter versus last."],
  ["q3","E30 M3s: median and count by month over three years, houses and online."],
  ["q4","Where does reserve-not-met cluster for C2 Corvettes, and what were they bid to?"],
  ["q5","Day of week and listing length effects for 964s online."],
  ["q6","Share of 250-series Ferrari sales by house, by year, three years."],
  ["q7","Same-chassis repeat sales of 993 Turbos: time between and price change."],
  ["q8","1929 Duesenberg Model J, every house sale, rooms stated or inferred."],
  ["q9","1973 Carrera RS 2.7 Lightweight"],
  ["q10","what's my car worth"]
];
const b = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
for (const [id, q] of Q) {
  for (const [w, tag] of [[1200,"desktop"],[390,"390"]]) {
    const p = await b.newPage();
    await p.setViewport({ width: w, height: 1200, deviceScaleFactor: tag==="390"?1:1 });
    await p.setCookie({ name: "gas_crew", value: "ok", domain: "goasksam.com", path: "/" });
    await p.goto("https://goasksam.com/desk", { waitUntil: "networkidle2" });
    await p.waitForSelector("#q", { timeout: 15000 });
    await p.evaluate((qq) => { document.getElementById("q").value = qq; document.getElementById("go").click(); }, q);
    try { await p.waitForFunction(() => { const o = document.getElementById("out"); return o && (o.querySelector("table.answer") || o.querySelector(".msg")); }, { timeout: 115000 }); } catch(e){}
    await new Promise(r=>setTimeout(r,800));
    await p.screenshot({ path: `/tmp/desk_${id}_${tag}.png`, fullPage: true });
    console.log(`${id} ${tag} shot`);
    await p.close();
  }
}
await b.close();
