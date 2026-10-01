import puppeteer from "puppeteer-core";
const BASE="https://goasksam.com", CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PNG="/private/tmp/claude-501/-Users-davidzysblat-Documents-GitHub-goasksam/ca33290f-26cb-4830-84de-21c1500cd74a/scratchpad/png";
const [,,label,car,state,price,timeline,pref,png]=process.argv;
const b=await puppeteer.launch({executablePath:CHROME,headless:"new",args:["--no-sandbox"],protocolTimeout:280000});
const p=await b.newPage();p.setDefaultNavigationTimeout(90000);await p.setViewport({width:900,height:1300});
await p.setCookie({name:"gas_crew",value:"ok",domain:"goasksam.com",path:"/"});
const decs=[];p.on("response",async rr=>{try{if(/\/api\/sellerDecision/.test(rr.url())){const j=await rr.json().catch(()=>null);if(j)decs.push(j);}}catch(e){}});
await p.goto(BASE,{waitUntil:"networkidle2",timeout:90000});
const sleep=ms=>new Promise(x=>setTimeout(x,ms));
const body=()=>p.evaluate(()=>document.body.innerText);
async function send(t){await p.evaluate((x)=>{ if(typeof quick==="function")quick(x); else {const i=document.getElementById("inp");if(i){i.value=x;if(typeof window.send==="function")window.send();}} },t);}
const DONE=/which house|wider .* market|sam.?s pick|has gone to|only .* has sold|representative sale|here.?s where|no .* has sold on the online|couldn.t pull|i don.t recognize/i;
const STEPS=[["trim",/specific trim, package or edition|badge or model code/,"Skip"],["state",/which state is it in|what state/,state],["price",/hoping to get for it|roughly what/,price],["rush",/in a rush to list|are you in a rush/,timeline],["pref",/how would you like to sell it|handle the sale|run the auction/,pref]];
await send(car);await sleep(3200);
const answered={};
for(let i=0;i<20;i++){
  const t=(await body()); if(DONE.test(t))break;
  const tail=t.toLowerCase().slice(-450);
  let acted=false;
  for(const [key,re,ans] of STEPS){ if(!answered[key]&&re.test(tail)){ answered[key]=true; await send(ans); acted=true; await sleep(3200); break; } }
  if(!acted) await sleep(2000);
}
for(let i=0;i<30;i++){await sleep(1500);if(DONE.test(await body()))break;}
await sleep(2000);await p.evaluate(()=>window.scrollTo(0,0));await sleep(300);
await p.screenshot({path:PNG+"/"+png,fullPage:true});
const last=decs[decs.length-1]||{};const dec=last.decision||last;const txt=await body();
console.log("["+label+"] decisions="+decs.length+" classEra="+!!dec.classEra+" houseComparison="+!!dec.houseComparison+" thin="+!!(dec.thin&&dec.thin.isThin)+" notTracked="+(dec.tier==="not_tracked"||/not_tracked/.test(JSON.stringify(dec.tier||""))) +" widerMarket="+/wider .* market/i.test(txt));
const h=txt.match(/No [^\n]*has sold[^\n]*|[^\n]*have gone to[^\n]*|Only [^\n]*has sold[^\n]*|I couldn.t pull[^\n]*|I don.t recognize[^\n]*|No .* has sold on the online[^\n]*/i);console.log("  headline: "+(h?h[0].slice(0,150):"(none)"));
await b.close();
