const puppeteer = require("puppeteer-core");
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
(async () => {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
  const p = await b.newPage();
  await p.setCookie({ name: "gas_crew", value: "ok", domain: "goasksam.com", path: "/" });
  await p.goto("https://goasksam.com/onebox", { waitUntil: "networkidle2", timeout: 45000 });
  const u = "/api/publicConfig?__mock=1be08a27a854a34d";
  const txt = await p.evaluate(async(x)=>{ const r=await fetch(x); return await r.text(); }, u);
  require("fs").writeFileSync("/private/tmp/claude-501/-Users-davidzysblat-Documents-GitHub-goasksam/ca33290f-26cb-4830-84de-21c1500cd74a/scratchpad/mockdata.json", txt);
  let d; try{d=JSON.parse(txt);}catch(e){console.log("PARSE ERR:",txt.slice(0,300));await b.close();return;}
  if(d.err){console.log("ERR:",d.err,d.stack);await b.close();return;}
  console.log("match:", JSON.stringify({displayName:d.match&&d.match.displayName, engine:d.match&&d.match.engine, isMod:d.match&&d.match.isModified, mods:d.match&&d.match.modifications, source:d.match&&d.match.source, soldDate:d.match&&d.match.soldDate, price:d.match&&d.match.price, mileage:d.match&&d.match.mileage, photo:!!(d.match&&d.match.photoUrl), count:d.match&&d.match.count}));
  console.log("m3 pool: n=" + d.m3.length + " prices=" + JSON.stringify(d.m3.map(r=>Math.round(r.p)).sort((a,z)=>a-z)));
  console.log("997 CarreraS pool: n=" + d.p997.length + " prices=" + JSON.stringify(d.p997.map(r=>Math.round(r.p)).sort((a,z)=>a-z)));
  for(const k in d.thinCands){ console.log("  thin " + k + ": n=" + d.thinCands[k].length + " " + JSON.stringify(d.thinCands[k].slice(0,3).map(r=>({p:Math.round(r.p),t:(r.t||"").slice(0,36)})))); }
  await b.close();
})().catch(e=>{console.error("THREW",e.message);process.exit(1);});
