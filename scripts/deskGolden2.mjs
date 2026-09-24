import puppeteer from "puppeteer-core";
const BASE=(process.argv.find(a=>a.startsWith("http"))||"https://goasksam.com").replace(/\/$/,"");
const b=await puppeteer.launch({executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",headless:"new",args:["--no-sandbox"]});
const p=await b.newPage(); await p.setCookie({name:"gas_crew",value:"ok",domain:new URL(BASE).hostname,path:"/"});
await p.goto(BASE+"/sell",{waitUntil:"networkidle2"});
const post=(body)=>p.evaluate(async(body,BASE)=>{const r=await fetch(BASE+"/api/sellerDecision",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(Object.assign({desk:true,action:"run"},body))});const t=await r.text();try{return JSON.parse(t)}catch(e){return{parseError:t.slice(0,80)}}},body,BASE);
let fails=0; const ck=(n,ok,d="")=>{console.log((ok?"PASS":"FAIL")+"  "+n+(ok?"":"  -> "+d));if(!ok)fails++;};

// (e)+(e3) record question: top sale is eligible (not halo/race/restomod); specials set aside
const rec=await post({question:"what's the record sale for a BMW M3"});
const top=rec.record&&rec.record.top&&rec.record.top[0];
console.log("  record top:",top&&("$"+top.hammer_usd+"  "+top.title));
ck("(e) record present with a top sale", !!top, JSON.stringify(rec).slice(0,120));
const spRe=/sport\s?evolution|\bevo\b|cecotto|\bcsl\b|\bgt\b|dtm|redux|enhanced & evolved|clubsport|\bcup\b|race/i;
ck("(e3) record top is NOT a halo/race/restomod", top && !spRe.test(top.title||""), top&&top.title);
const aside=(rec.record&&rec.record.set_aside)||[];
ck("(e3) specials are set aside separately", aside.length>0, "set_aside="+aside.length);
ck("(e) definition states 'since coverage began'", rec.record&&/since coverage began/i.test(rec.record.definition||""), rec.record&&rec.record.definition);
console.log("  set-aside sample:",aside.slice(0,3).map(x=>"$"+x.hammer_usd+" "+(x.title||"").slice(0,32)+" ["+x.record_excluded_as+"]").join(" | "));

// (e2) generation title code over year: M3 by generation, the DTM ~$453k tags e30 not e36
const byGen=await post({dsl:{filters:{make:"BMW",model:"M3",channel:"all",window:"36mo"},groupBy:["generation"],measures:["count","max"]},vehicle:{make:"BMW",model:"M3"}});
console.log("  genTitleFixed:",byGen.gen_title_fixed);
const rowsG=byGen.answer&&byGen.answer.rows||[];
const e36=rowsG.find(r=>r.group==="e36"), e30=rowsG.find(r=>r.group==="e30");
console.log("  e36 max:",e36&&e36.max,"e36 max car:",e36&&e36.max_receipt&&e36.max_receipt.title);
ck("(e2) e36 max is not the E30 DTM car", !(e36&&e36.max_receipt&&/\(e30\)|dtm/i.test(e36.max_receipt.title||"")), e36&&e36.max_receipt&&e36.max_receipt.title);
ck("(d) answer rows carry max_receipt (traceable)", rowsG.length>0 && rowsG.every(r=>r.thin||r.max_receipt), "some row missing max_receipt");

// (i) channel: record online total <= all; and receipts fewer when house sales exist
const cAll=await post({dsl:{filters:{make:"BMW",model:"M3",channel:"all",window:"36mo"},groupBy:[],measures:["count"]},vehicle:{make:"BMW",model:"M3"}});
const cOnline=await post({dsl:{filters:{make:"BMW",model:"M3",channel:"online",window:"36mo"},groupBy:[],measures:["count"]},vehicle:{make:"BMW",model:"M3"}});
console.log("  channel pool all:",cAll.answer&&cAll.answer.total,"online:",cOnline.answer&&cOnline.answer.total);
ck("(i) channel online total <= all", ((cOnline.answer&&cOnline.answer.total)||0) <= ((cAll.answer&&cAll.answer.total)||0), cOnline.answer.total+" vs "+cAll.answer.total);
ck("(i) channel online total < all (house sales exist)", ((cOnline.answer&&cOnline.answer.total)||0) < ((cAll.answer&&cAll.answer.total)||0), cOnline.answer.total+" vs "+cAll.answer.total);

// (g) no "sales sales" in the read
const m3read=await post({dsl:{filters:{make:"BMW",model:"M3",channel:"all"},groupBy:[],measures:["count","median"]},vehicle:{make:"BMW",model:"M3"}});
ck("(g) read has no 'sales sales'", !/sales sales/i.test(m3read.read||""), (m3read.read||"").slice(0,120));


// (charts) day_of_week table order Mon..Sun; distribution strip up to 500 with N-of-M
const dow=await post({dsl:{filters:{make:"BMW",model:"M3",window:"36mo"},groupBy:["day_of_week"],measures:["count","median"]},vehicle:{make:"BMW",model:"M3"}});
const dowOrder=(dow.answer&&dow.answer.rows||[]).map(r=>r.group).join(",");
ck("(chart) day_of_week table order Mon..Sun", dowOrder==="Mon,Tue,Wed,Thu,Fri,Sat,Sun", dowOrder);
const strip=await post({dsl:{filters:{make:"BMW",model:"M3",channel:"online",window:"36mo"},groupBy:["venue"],measures:["count","median"]},vehicle:{make:"BMW",model:"M3"}});
ck("(chart) strip sample > 300 (up to 500)", (strip.strip_receipts||[]).length>300, "strip_receipts="+((strip.strip_receipts||[]).length));
ck("(chart) strip_sampled states N of M when sampled", !!(strip.strip_sampled&&strip.strip_sampled.of>strip.strip_sampled.shown||((strip.strip_receipts||[]).length<=500)), JSON.stringify(strip.strip_sampled));

console.log(fails?`\n${fails} FAILURE(S)`:"\nAll Desk golden-2 checks passed.");
await b.close(); process.exit(fails?1:0);
