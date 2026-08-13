// Phase 1c: after results, all free text goes to chat; only explicit control
// intents act on the UI. This asserts the keyword ladder is gone: genuine
// questions containing "powerseller"/"compare"/"why" route to chat (return
// false), while narrow explicit intents still act.
import fs from "node:fs";

const noop = () => {};
const elem = () => new Proxy(function(){}, { get:(t,p)=>{ if(p==="style")return{}; if(p==="classList")return{add:noop,remove:noop,toggle:noop,contains:()=>false}; if(["value","textContent","id","className","innerHTML"].includes(p))return""; if(["appendChild","setAttribute","addEventListener","remove","append","scrollIntoView","focus"].includes(p))return noop; if(p==="querySelector")return()=>elem(); if(p==="querySelectorAll")return()=>[]; return elem(); }, apply:()=>elem() });
globalThis.window = globalThis;
globalThis.document = { getElementById:()=>elem(), querySelector:()=>elem(), querySelectorAll:()=>[], createElement:()=>elem(), addEventListener:noop, body:elem() };
try { Object.defineProperty(globalThis,"navigator",{value:{language:"en-US"},configurable:true}); } catch {}
globalThis.location = { hostname:"localhost", protocol:"file:" };
globalThis.localStorage = { getItem:()=>null, setItem:noop };
let chatCalls = 0;
globalThis.fetch = async () => ({ ok:true, json:async()=>({ text:"(chat answer)" }) });

const rendered = [];
const html = fs.readFileSync("index.html","utf8");
const files = [...html.matchAll(/<script src="js[^"]*\/([^"]+)"><\/script>/g)].map(m=>"js/"+m[1]);
const script = files.map(f=>fs.readFileSync(f,"utf8")).join("\n");
const bootstrap = `globalThis.sellState=sellState;globalThis.handleSellRecommendationFollowup=handleSellRecommendationFollowup;
const __a=addMsg; addMsg=function(r,t,h,c){ rendered.push({text:String(t||""),html:String(h||"")}); try{return __a(r,t,h,c);}catch(e){} };`;
globalThis.rendered = rendered;
(0,eval)(script + "\n" + bootstrap);

let failures = 0;
const check = (name, ok, detail="") => { console.log(`${ok?"PASS":"FAIL"}  ${name}${ok?"":"  ->  "+detail}`); if(!ok)failures++; };

function setupResult(){
  sellState.active=true; sellState.step=12; sellState.awaitingPathChoice=false;
  sellState.sellOptions=[{key:"primary",name:"Bring a Trailer",badge:"Sam's pick",reasonBullets:[{text:"BaT closes 911s ~34% higher than other platforms."}]},{key:"route_1",name:"Cars & Bids",badge:"Also strong here",altReason:["If speed matters, Cars & Bids runs the quicker cycle."]}];
  sellState.allRouteOptions=sellState.sellOptions;
  sellState.partnerReferral={eligible:true,partner:{name:"howS"}};
  sellState.powerSellerProfiles=[];
  rendered.length=0;
}
function rerendersCard(){ return rendered.some(r=>/sell-rec-card|power-seller-|renderFeatured/.test(r.html)); }

// Genuine questions that contain the old hijack keywords as substrings.
const questions = [
  "so if the powerseller wants to sell it somewhere else what happens",
  "why is bring a trailer better for this",
  "can you compare the two for me",
  "what about the specialist option",
  "does the powerseller get me more money"
];
for (const q of questions) {
  setupResult();
  const handled = handleSellRecommendationFollowup(q);
  check(`1c: question routes to chat, not a card -> "${q.slice(0,42)}..."`, handled === false && !rerendersCard(), `handled=${handled} card=${rerendersCard()}`);
}

// Explicit control intents STILL act.
for (const [q, mustRender] of [["show me the cards again", false], ["change car", false], ["go with bring a trailer", true]]) {
  setupResult();
  if (q === "show me the cards again") sellState.lastResultHTML = '<div class="sell-rec-card">x</div>';
  const handled = handleSellRecommendationFollowup(q);
  check(`1c: explicit intent acts -> "${q}"`, handled === true, `handled=${handled}`);
}

console.log(failures ? `\n${failures} FAILURE(S)` : "\n1C-ROUTING ALL PASS");
process.exit(failures ? 1 : 0);
