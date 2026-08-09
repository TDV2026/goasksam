// Real-page verifier (standing rule: visual checks run against the DEPLOYED page,
// never a local reconstruction). Drives goasksam.com through the wizard to a live
// 2018 M3 result, screenshots the platform card, and dumps the WHY-label node with
// its computed margins + matched CSS rules. Screenshots -> $SHOT_DIR (default cwd).
// Usage: node scripts/driveReal.mjs   (needs the system Chrome + crew cookie)
import puppeteer from "puppeteer-core";
const CHROME=process.env.CHROME_PATH||"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const OUT=process.env.SHOT_DIR||process.cwd();
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const browser=await puppeteer.launch({executablePath:CHROME,headless:"new",args:["--window-size=1200,1100"],defaultViewport:{width:1120,height:1050}});
const page=await browser.newPage();
await page.setCookie({name:"gas_crew",value:"ok",domain:"goasksam.com",path:"/"});
await page.goto("https://goasksam.com/",{waitUntil:"networkidle2",timeout:60000});
await page.waitForSelector("#inp",{timeout:30000});
const lastSam=()=>page.evaluate(()=>{const r=[...document.querySelectorAll('.row.sam')];const e=r[r.length-1];return e?e.textContent.replace(/\s+/g," ").trim().slice(0,120):"";});
async function type(text){await page.evaluate(t=>{document.getElementById("inp").value=t;},text);await page.click("#btn");await sleep(2200);}
async function clickChip(label){
  const ok=await page.evaluate(l=>{const c=[...document.querySelectorAll('.chip')].filter(b=>b.textContent.trim().toLowerCase()===l.toLowerCase());if(c.length){c[c.length-1].click();return true;}return false;},label);
  await sleep(2200); return ok;
}
await type("2018 BMW M3");
for(let i=0;i<12;i++){
  if(await page.$(".pcard")){console.log("CARD APPEARED at iter",i);break;}
  const s=(await lastSam()).toLowerCase();
  console.log(`iter${i} sam="${s.slice(0,80)}"`);
  if(/which m3|base and competition/.test(s)) await clickChip("Base");
  else if(/which country/.test(s)) await clickChip("United States");
  else if(/which state/.test(s)) { if(!await clickChip("California")) await type("California"); }
  else if(/city or region/.test(s)) await type("California");
  else if(/hoping to get|roughly what/.test(s)) await type("45000");
  else if(/how would you like|last one|handle the sale/.test(s)) await clickChip("I'm not sure yet");
  else await type("skip");
}
await page.waitForSelector(".pcard-platform",{timeout:60000});
await sleep(1500);
const card=await page.$(".pcard-platform");
await card.evaluate(el=>el.scrollIntoView({block:"center"}));
await sleep(500);
await card.screenshot({path:`${OUT}/real-card.png`});
await page.screenshot({path:`${OUT}/real-fullpage.png`,fullPage:true});
const info=await page.evaluate(()=>{
  const card=document.querySelector(".pcard-platform");
  const leaf=[...card.querySelectorAll("*")].filter(el=>/^\s*why i picked this\s*$/i.test(el.textContent||"")&&el.children.length===0);
  const el=leaf[0]; if(!el) return {found:0};
  const cs=getComputedStyle(el), name=card.querySelector(".pcard-name");
  const eb=el.getBoundingClientRect(), nb=name.getBoundingClientRect(), lead=el.nextElementSibling;
  return {found:leaf.length, outerHTML:el.outerHTML, className:el.className, computedMarginTop:cs.marginTop,
    headlineBottom:Math.round(nb.bottom), labelTop:Math.round(eb.top), gapHeadlineToLabel:Math.round(eb.top-nb.bottom),
    leadClass:lead?lead.className:null, gapLabelToLead:lead?Math.round(lead.getBoundingClientRect().top-eb.bottom):null,
    v2ResultRow:!!document.querySelector(".row.sam.v2-result"),
    stylesHref:[...document.querySelectorAll('link[rel=stylesheet]')].map(l=>l.getAttribute("href"))};
});
console.log("NODE_INFO "+JSON.stringify(info,null,2));
try{
  const client=await page.target().createCDPSession();
  await client.send("DOM.enable"); await client.send("CSS.enable");
  const {root}=await client.send("DOM.getDocument",{depth:-1,pierce:true});
  const q=await client.send("DOM.querySelector",{nodeId:root.nodeId,selector:".pcard-platform .pcard-whyl-main"});
  if(q.nodeId){
    const m=await client.send("CSS.getMatchedStylesForNode",{nodeId:q.nodeId});
    const rules=(m.matchedCSSRules||[]).map(r=>({selector:r.rule.selectorList.text,origin:r.rule.origin,
      margins:(r.rule.style.cssProperties||[]).filter(p=>/margin/.test(p.name)).map(p=>p.name+":"+p.value)})).filter(r=>r.margins.length);
    console.log("MATCHED_MARGIN_RULES "+JSON.stringify(rules));
  } else console.log("MATCHED: .pcard-whyl-main NOT under .pcard-platform");
}catch(e){console.log("CDP_ERR "+e.message);}
await browser.close();
