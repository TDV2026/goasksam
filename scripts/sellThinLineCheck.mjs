// The /sell thin-result sentence (Oct 20 2026, Sam's answer 3): "...so Sam widened the search to the {rungWord}." on
// both paths (the V2 pick card's v2Why and v2Because, and the old card composer's composerHonestHeadline), every
// variant and rung, and never a claim about buyers. Renders through the real page scripts on DOM stubs. No network.
//   node scripts/sellThinLineCheck.mjs
// Run by scripts/prePush.mjs.
import fs from "node:fs";
const noop=()=>{};
const elem=()=>new Proxy(function(){},{get:(t,p)=>{if(p==="style")return{};if(p==="classList")return{add:noop,remove:noop,toggle:noop,contains:()=>false};if(["value","textContent","id","className","innerHTML"].includes(p))return"";if(["appendChild","setAttribute","removeAttribute","addEventListener","removeEventListener","remove","focus","blur","scrollIntoView","insertBefore","replaceWith","click"].includes(p))return noop;if(p==="querySelectorAll")return()=>[];if(p==="querySelector"||p==="closest")return()=>null;return elem();},apply:()=>elem()});
globalThis.window=globalThis;
globalThis.document={getElementById:()=>elem(),querySelector:()=>elem(),querySelectorAll:()=>[],createElement:()=>elem(),addEventListener:noop,body:elem()};
try{Object.defineProperty(globalThis,"navigator",{value:{language:"en-US"},configurable:true});}catch{}
globalThis.location={hostname:"localhost",protocol:"file:",search:""};
globalThis.localStorage={getItem:()=>null,setItem:noop,removeItem:noop};
globalThis.fetch=async()=>({ok:true,json:async()=>({})});
const html=fs.readFileSync("public/index.html","utf8");
const files=[...html.matchAll(/<script src="js[^"]*\/([^"]+)"><\/script>/g)].map(m=>"public/js/"+m[1]);
(0,eval)(files.map(f=>fs.readFileSync(f,"utf8")).join("\n")+"\nglobalThis.sellState=sellState;");

let pass=0, fail=0;
const ok=(c,m)=>{ if(c)pass++; else { fail++; console.log("FAIL", m); } };
const BUYERS=/\bbuyers?\b|finds? (the|its) buyer|reach(es)? the/i;
const slots={ platform:"Bring a Trailer", carRef:"your 911", failedRef:"the 1995 Porsche 911", rungWord:"model", scope:"911s", scopeAttr:"911", rungRef:"911s", window:"180 days", delta:12, make:"Porsche" };
const seen=new Set();
for(let i=0;i<60;i++){
  globalThis.sellState.sellDecision={resultId:"thin-"+i,vehicle:{year:1995,make:"Porsche",model:"911"},evidence:{windowDays:180}};
  for(const mode of ["thin","thinNeutral"]){
    const w=v2Why(mode,slots), b=v2Because(mode,slots);
    seen.add(w);
    ok(/, so Sam widened the search to the model\.$/.test(w), `v2Why ${mode} ends with Sam's sentence (${w})`);
    ok(!BUYERS.test(w)&&!BUYERS.test(b), `v2Why/v2Because ${mode} name no buyers (${w} | ${b})`);
  }
}
ok(seen.size===3, `all three v2Why thin variants were rendered (${seen.size})`);
for(const [rung,word] of [["make","make"],["generation","generation"],["segment","segment"],["model","model"]]){
  const h=composerHonestHeadline({year:1995,make:"Porsche",model:"911"},word);
  ok(h.text===`Recent sales for the 1995 Porsche 911 are limited, so Sam widened the search to the ${word}.`, `old composer, ${rung} rung (${h.text})`);
}
const u=composerHonestHeadline({make:"Duesenberg",unverified:true},"make");
ok(u.text==="Recent sales for this Duesenberg are limited, so Sam widened the search to the make.", `old composer, an unverified make (${u.text})`);
console.log(`sellThinLineCheck: ${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
