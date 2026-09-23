import puppeteer from "puppeteer-core";
const CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const Q = [
  "Which house has sold the most air-cooled 911s in the last two years, and what did they bring?",
  "Sell-through by price band on Bring a Trailer this quarter versus last.",
  "E30 M3s: median and count by month over three years, houses and online.",
  "Where does reserve-not-met cluster for C2 Corvettes, and what were they bid to?",
  "Day of week and listing length effects for 964s online.",
  "Share of 250-series Ferrari sales by house, by year, three years.",
  "Same-chassis repeat sales of 993 Turbos: time between and price change.",
  "1929 Duesenberg Model J, every house sale, rooms stated or inferred.",
  "1973 Carrera RS 2.7 Lightweight",
  "what's my car worth"
];
const b = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
const p = await b.newPage();
await p.setCookie({ name: "gas_crew", value: "ok", domain: "goasksam.com", path: "/" });
await p.goto("https://goasksam.com/sell", { waitUntil: "networkidle2" });
for (let i = 0; i < Q.length; i++) {
  try {
    const j = await p.evaluate(async (q) => (await fetch("/api/sellerDecision", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ desk: true, action: "run", question: q }) })).json(), Q[i]);
    const chips = (j.echo && j.echo.chips || []).join(" · ");
    let line = `Q${i + 1} [${j.status}]`;
    if (j.status === "ok") line += ` total=${j.answer.total} rows=${j.answer.rows.length} recs=${(j.receipts || []).length}${j.velocity ? " velocity=" + j.velocity.length : ""} | ${chips}`;
    else if (j.status === "refused") line += ` refusal=${j.reason}`;
    else line += ` ${JSON.stringify(j).slice(0, 120)}`;
    console.log(line);
    if (j.status === "ok") console.log("   READ:", (j.read || "").slice(0, 240));
  } catch (e) { console.log(`Q${i + 1} ERROR ${e.message}`); }
}
await b.close();
