import puppeteer from "puppeteer-core";
const CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const b = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
const p = await b.newPage();
await p.setCookie({ name: "gas_crew", value: "ok", domain: "goasksam.com", path: "/" });
await p.goto("https://goasksam.com/sell", { waitUntil: "networkidle2" });
// pull larger sample per house, bucket URL slugs
for (const plat of ["RM Sotheby's","Gooding & Co","Bonhams","Broad Arrow"]) {
  const r = await p.evaluate(async (pl) => (await fetch("/api/sellerDecision",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({archiveQuery:"sample",platform:pl,limit:60})})).json(), plat);
  const slugs = {};
  let onlineHits = [];
  for (const row of (r.rows||[])) {
    const u = (row.raw&&row.raw.url)||"";
    // RM/BA slug = path segment after /auctions/ or /vehicles/
    let m = u.match(/\/auctions\/([a-z0-9]+)\//i) || u.match(/\/vehicles\/([a-z0-9]+)_/i);
    const slug = m ? m[1].replace(/[0-9]+$/,"##") : (u.split("/")[3]||"?");
    slugs[slug]=(slugs[slug]||0)+1;
    const blob = (u+" "+(row.title||"")+" "+((row.raw&&row.raw.description)||"")).toLowerCase();
    if (/online|geared|open road/.test(blob)) onlineHits.push(u||row.title);
  }
  console.log("\n== "+plat+" == slug buckets:", JSON.stringify(slugs));
  console.log("   online-marker hits:", onlineHits.length, onlineHits.slice(0,3).join(" | "));
}
await b.close();
