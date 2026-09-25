import puppeteer from "puppeteer-core";
const CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const b = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
async function run(q, dsl) {
  const p = await b.newPage();
  await p.setViewport({ width: 1000, height: 900, deviceScaleFactor: 1 });
  await p.setCookie({ name: "gas_crew", value: "ok", domain: "goasksam.com", path: "/" });
  await p.goto("https://goasksam.com/desk", { waitUntil: "networkidle2" });
  await p.waitForSelector("#q", { timeout: 15000 });
  if (dsl) { await p.evaluate(async (d) => { const r = await fetch("/api/sellerDecision",{method:"POST",credentials:"include",headers:{"content-type":"application/json"},body:JSON.stringify({desk:true,action:"run",dsl:d})}); window.__render(await r.json()); }, dsl).catch(()=>{}); }
  else { await p.evaluate((qq) => { document.getElementById("q").value = qq; document.getElementById("go").click(); }, q); }
  await p.waitForFunction(() => document.querySelector("#charts svg"), { timeout: 115000 }).catch(()=>{});
  await new Promise(r=>setTimeout(r,700));
  return p;
}
// expose render for dsl-driven (Q1 online refine)
async function shot(page, file){ await page.screenshot({ path:file }); console.log(file); }
async function clickTab(page, label){ await page.evaluate((l)=>{ const t=[...document.querySelectorAll(".ctab")].find(x=>x.textContent.trim()===l); if(t) t.click(); }, label); await new Promise(r=>setTimeout(r,500)); }

// Q1 bars + strip
let p = await run("Which house has sold the most air-cooled 911s in the last two years, and what did they bring?");
await shotChart(p, "/tmp/chart_q1_bars.png");
await clickTab(p, "Distribution"); await shotChart(p, "/tmp/chart_q1_strip.png");
// verify dot -> receipt (stub window.open, click a strip dot)
const clickRes = await p.evaluate(()=>{ let opened=null; const orig=window.open; window.open=(u)=>{opened=u;return null;}; const dot=document.querySelector("#cwrap .clk"); if(dot){ dot.dispatchEvent(new MouseEvent("click",{bubbles:true})); } window.open=orig; return opened; });
console.log("DOT CLICK opened URL:", clickRes ? clickRes.slice(0,70) : "none");
await p.close();
// Q2 line whisker
p = await run("Sell-through by price band on Bring a Trailer this quarter versus last."); await clickTab(p,"Line over time"); await shotChart(p,"/tmp/chart_q2_line.png"); await p.close();
// Q3 line dots
p = await run("E30 M3s: median and count by month over three years, houses and online."); await clickTab(p,"Line over time"); await shotChart(p,"/tmp/chart_q3_dots.png"); await p.close();
// Q5 bars Mon-Sun
p = await run("Day of week and listing length effects for 964s online."); await shotChart(p,"/tmp/chart_q5_bars.png"); await p.close();
// Q6 stacked
p = await run("Share of 250-series Ferrari sales by house, by year, three years."); await shotChart(p,"/tmp/chart_q6_stacked.png"); await p.close();
// Q1 online refine strip 500 cap
p = await run(null, {filters:{make:"Porsche",model:"911",descriptor:"air-cooled 911",channel:"online",window:"24mo"},groupBy:["venue"],measures:["count","median"]});
await clickTab(p,"Distribution");
const note = await p.evaluate(()=>{ const n=document.getElementById("cnote"); return n?n.textContent:""; });
console.log("Q1-online strip note:", note);
await shotChart(p,"/tmp/chart_q1online_strip.png");
await p.setViewport({width:390,height:900,deviceScaleFactor:1}); await new Promise(r=>setTimeout(r,300));
await p.evaluate(()=>window.dispatchEvent(new Event("resize"))); await new Promise(r=>setTimeout(r,600));
await shotChart(p,"/tmp/chart_q1online_strip_390.png");
await p.close();
await b.close();
async function shotChart(page, file){ const el = await page.$("#charts"); if(el){ await el.screenshot({path:file}); console.log(file,"ok"); } else console.log(file,"NO CHART"); }
