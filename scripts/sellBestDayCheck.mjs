// The /sell best-day tile (Oct 20 2026, Sam's answer 4): the paired compact line is "Weekends: 62% sold, midweek 48%
// (40 auctions)." (or its "Midweek: ..." mirror) within the card's 70 characters, and the tile shows only when EACH
// side has at least 10 auctions by the server's own counts (reserveDay.weekendN / weekdayN), otherwise no best-day line
// at all and the card drops the tile cleanly. Real page scripts on DOM stubs. No network.
//   node scripts/sellBestDayCheck.mjs
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
const rd=(o)=>({ ok:true, scopeLabel:"911", weekendPct:62, weekdayPct:48, weekendN:10, weekdayN:10, sample:20, winner:"weekend", ...o });
const a=v2ReserveDay({ reserveDay:rd({}) });
ok(a&&a.compact==="Weekends: 62% sold, midweek 48% (20 auctions)."&&a.headline==="Weekends", `10 and 10: Sam's line (${a&&a.compact})`);
ok(a&&a.compact.length<=70, `the compact line is within 70 characters (${a&&a.compact.length})`);
ok(a&&a.body==="911s with a reserve sold 62% of the time when the auction ended on a weekend, and 48% midweek (20 auctions).", `the full line is unchanged (${a&&a.body})`);
ok(v2ReserveDay({ reserveDay:rd({ weekendN:9 }) })===null, "9 on the weekend side: no best-day line");
ok(v2ReserveDay({ reserveDay:rd({ weekdayN:9 }) })===null, "9 on the midweek side: no best-day line");
ok(v2ReserveDay({ reserveDay:rd({ weekendN:undefined, weekdayN:undefined }) })===null, "no per-side counts from the server: no best-day line");
ok(v2ReserveDay({ reserveDay:rd({ ok:false, weekendN:40, weekdayN:40 }) })===null, "the server's own gate failed: no best-day line");
const m=v2ReserveDay({ reserveDay:rd({ weekendPct:41, weekdayPct:55, weekendN:31, weekdayN:44, sample:75, winner:"weekday" }) });
ok(m&&m.compact==="Midweek: 55% sold, weekends 41% (75 auctions)."&&m.headline==="Midweek"&&m.compact.length<=70, `the mirror when midweek wins (${m&&m.compact})`);
ok(m&&/sold 55% of the time when the auction ended midweek, and 41% on a weekend \(75 auctions\)\./.test(m.body), "the mirror's full line is unchanged");
const big=v2ReserveDay({ reserveDay:rd({ weekendPct:100, weekdayPct:100, sample:12345 }) });
ok(big&&big.compact.length<=70, `the longest numbers stay within 70 characters (${big&&big.compact.length})`);
// The rendered pick card: the tile drops cleanly when the floor fails (no empty tile, the reserve tile stands alone).
Object.assign(globalThis.sellState,{ resolvedVehicle:{year:2011,make:"Porsche",model:"911"}, sellDecision:{resultId:"bd",vehicle:{year:2011,make:"Porsche",model:"911"},evidence:{windowDays:180,ladder:{landed:{key:"generation_trim",thresholdMet:true}}}}, region:"US", sellerPreference:"diy", partnerReferral:{} });
const card=r=>{ const opt={ key:"bringatrailer", name:"Bring a Trailer", platformSlug:"bringatrailer", marketEvidence:{ evidenceSales:12, windowDays:180, pricePremium:{type:"premium",gateType:"symmetric",percent:22,windowDays:180}, reserveDay:r, reserveInsight:{ ok:true, scopeLabel:"911s", deltaPct:7, nReserve:14, nNoReserve:16 } } }; globalThis.sellState.sellOptions=[opt]; return renderPickCardV2(opt)||""; };
const shown=card(rd({ weekendN:12, weekdayN:11, sample:23 })), dropped=card(rd({ weekendN:9, weekdayN:30 }));
ok(/Best day to sell/.test(shown)&&/Weekends: 62% sold, midweek 48% \(23 auctions\)\./.test(shown)&&(shown.match(/class="pcard-tile"/g)||[]).length===2, "card at 12 and 11: two tiles, best day with Sam's line");
ok(!/Best day to sell|Weekends:|Midweek:/.test(dropped)&&(dropped.match(/class="pcard-tile"/g)||[]).length===1&&/pcard-tiles one/.test(dropped)&&/Reserve position/.test(dropped), "card at 9 and 30: no best-day tile, the reserve tile alone");
console.log(`sellBestDayCheck: ${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
