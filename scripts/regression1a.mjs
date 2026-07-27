// Phase 1a merge gate: the single vehicle resolver surfaces its verdict
// identically on every input path. Drives the REAL send()/quick() browser entry
// points with live fetches to prod.
import fs from "node:fs";
const BASE = process.env.FLOW_BASE || "https://goasksam.vercel.app";

const els = {};
const mkEl = id => { const L={}; const el={ id, value:"", disabled:false, textContent:"", innerHTML:"", style:{}, className:"", scrollTop:0, scrollHeight:0, dataset:{}, classList:{add(){},remove(){},toggle(){},contains(){return false;}}, appendChild(){return el;}, removeChild(){}, remove(){}, setAttribute(){}, getAttribute(){return null;}, focus(){}, blur(){}, scrollIntoView(){}, insertAdjacentHTML(){}, addEventListener(ev,fn){(L[ev]||(L[ev]=[])).push(fn);}, querySelector(){return mkEl("q");}, querySelectorAll(){return [];}, closest(){return null;} }; return el; };
const getEl = id => els[id] || (els[id] = mkEl(id));
const SAM = [];
globalThis.window = globalThis;
globalThis.document = { getElementById:getEl, querySelector:()=>mkEl("q"), querySelectorAll:()=>[], createElement:()=>mkEl("n"), addEventListener(){}, body:mkEl("b"), documentElement:mkEl("h") };
try { Object.defineProperty(globalThis,"navigator",{value:{language:"en-US"},configurable:true}); } catch {}
globalThis.location = { hostname:new URL(BASE).hostname, protocol:"https:", href:BASE };
globalThis.localStorage = { getItem:()=>null, setItem(){}, removeItem(){} };
const wait = ms => new Promise(r=>globalThis.setTimeout(r,ms));
const realFetch = globalThis.fetch;
globalThis.fetch = (url,opts) => realFetch(String(url).startsWith("http")?url:BASE+(String(url).startsWith("/")?url:"/"+url), opts);

const html = fs.readFileSync("index.html","utf8");
const files = [...html.matchAll(/<script src="(js\/[^"]+)"><\/script>/g)].map(m=>m[1]);
const script = files.map(f=>fs.readFileSync(f,"utf8")).join("\n");
const bootstrap = `globalThis.__SAM=SAM;globalThis.sellState=sellState;globalThis.send=send;globalThis.startSellFlow=startSellFlow;
const __a=addMsg; addMsg=function(r,t,h,c){ if(r==="sam")SAM.push(String(t||"")); try{return __a(r,t,h,c);}catch(e){} };`;
globalThis.SAM = SAM;
(0,eval)(script + "\n" + bootstrap);

let failures = 0;
const check = (name, ok, detail="") => { console.log(`${ok?"PASS":"FAIL"}  ${name}${ok?"":"  ->  "+detail}`); if(!ok)failures++; };
async function type(text){ getEl("inp").value=text; await send(); await wait(1400); return SAM[SAM.length-1]||""; }
function reset(){ SAM.length=0; sellState.active=false; sellState.step=0; sellState.pendingVehicleIdentity=null; sellState.carName=null; sellState.resolvedVehicle=null; sellState.vehicleIdentityValidated=false; }

const UNVERIFIED = /don'?t recognize|broader .*make-level|make-level read|double-check the/i;
const GOTIT = /^got it\./i;

(async () => {
  // 1. Made-up model at INITIAL ENTRY
  reset();
  const e1 = await type("2002 bmw 351rg");
  check("1a: '351rg' at initial entry -> unverified acknowledgement, not 'Got it'", UNVERIFIED.test(e1) && !GOTIT.test(e1), JSON.stringify(e1).slice(0,160));

  // 2. Made-up model at STEP 1 (flow already started via generic trigger)
  reset();
  await type("sell my car"); await wait(300);
  const e2 = await type("2002 bmw 351rg");
  check("1a: '351rg' at step 1 -> same unverified acknowledgement", UNVERIFIED.test(e2) && !GOTIT.test(e2), JSON.stringify(e2).slice(0,160));

  // 3. Real model is unchanged: verified, never the unverified copy. (The M3
  // is verified but has a trim gap, so it asks the trim rather than "Got it";
  // either is correct as long as it is NOT the unverified acknowledgement.)
  reset();
  const e3 = await type("2018 bmw m3");
  check("1a: real 'm3' verified (no unverified copy)", !UNVERIFIED.test(e3) && (GOTIT.test(e3) || /which m3|competition|trim/i.test(e3)), JSON.stringify(e3).slice(0,160));

  // 4. Near-miss still gets did-you-mean (not unverified, not 'Got it')
  reset();
  const e4 = await type("2018 bmw 854f");
  check("1a: near-miss '854f' -> did-you-mean", /did you mean/i.test(e4), JSON.stringify(e4).slice(0,160));

  // 5. Real full car proceeds
  reset();
  const e5 = await type("2019 porsche 911 carrera");
  check("1a: real '911 carrera' verified/advances", (GOTIT.test(e5) || /which|located|where/i.test(e5)) && !UNVERIFIED.test(e5), JSON.stringify(e5).slice(0,160));

  // 6. Made-up model at CORRECTION (after a did-you-mean, reject + new no-match
  // designation) -> equivalent unverified handling (broader read / double-check).
  reset();
  await type("2018 bmw 854f"); await wait(300); // creates a did-you-mean pending
  const e6 = await type("no the 351rg");
  check("1a: '351rg' at correction -> unverified/double-check handling (no 'Got it')",
    (UNVERIFIED.test(e6) || /keep .* as typed|isn'?t a .* i can match|broader read/i.test(e6)) && !GOTIT.test(e6), JSON.stringify(e6).slice(0,180));

  console.log(failures ? `\n${failures} FAILURE(S)` : "\n1A ALL PASS");
  process.exit(failures ? 1 : 0);
})();
