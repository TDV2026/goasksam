// Full 100-car coverage harness, run in budget-safe batches across days.
// Each run processes up to BATCH cars not yet done, persists results to
// scripts/coverage-progress.json (cache-first: already-done cars are skipped),
// and prints the full report once all 100 are complete. Schedule daily.
//   node scripts/coverageFull.mjs        (run the next batch)
//   node scripts/coverageFull.mjs report (print current aggregate report)
import fs from "node:fs";
const BASE=process.env.FLOW_BASE||"https://goasksam.vercel.app";
const BATCH=Number(process.env.COVERAGE_BATCH||12);
const PROGRESS="scripts/coverage-progress.json";

const CARS=[
  // 911 generations
  "1969 Porsche 911 T","1973 Porsche 911 Carrera RS","1988 Porsche 911 Carrera","1990 Porsche 911 Carrera 2",
  "1995 Porsche 911 Carrera","1999 Porsche 911 Carrera","2004 Porsche 911 GT3","2008 Porsche 911 GT3 RS",
  "2012 Porsche 911 Carrera S","2016 Porsche 911 GT3","2018 Porsche 911 GT3","2021 Porsche 911 Turbo S",
  "1985 Porsche 911 Carrera","1978 Porsche 911 SC","1993 Porsche 911 RS America","2019 Porsche 911 Carrera 4S",
  // M-cars
  "1988 BMW M3","1995 BMW M3","2002 BMW M3","2008 BMW M3","2015 BMW M3","2021 BMW M3","1991 BMW M5","2006 BMW M5",
  "2013 BMW M5","2000 BMW M Coupe","2016 BMW M2","2020 BMW M2 Competition","1998 BMW M3","2011 BMW 1M",
  // Broncos / Defenders / trucks
  "1966 Ford Bronco","1971 Ford Bronco","1977 Ford Bronco","1993 Ford Bronco","2021 Ford Bronco",
  "1994 Land Rover Defender 90","1997 Land Rover Defender 90","1985 Land Rover Defender","1988 Toyota Land Cruiser FJ62",
  "1978 Toyota Land Cruiser FJ40","1985 Toyota Land Cruiser","2000 Toyota Land Cruiser","1993 Toyota Land Cruiser",
  // Muscle
  "1967 Chevrolet Camaro SS","1969 Chevrolet Camaro Z28","1970 Chevrolet Chevelle SS","1968 Chevrolet Corvette",
  "1963 Chevrolet Corvette","1972 Chevrolet Corvette","1967 Ford Mustang","1969 Ford Mustang Boss 302",
  "1970 Dodge Challenger R/T","1969 Dodge Charger","1970 Plymouth Barracuda","1987 Buick GNX","1968 Pontiac GTO",
  "1970 Chevrolet Chevelle","1965 Shelby Cobra","1966 Ford GT40","2006 Ford GT",
  // JDM / sports
  "1994 Toyota Supra Turbo","1998 Toyota Supra","1991 Acura NSX","2001 Acura NSX","2017 Acura NSX",
  "2000 Honda S2000","2009 Honda S2000","1993 Mazda RX-7","1990 Mazda Miata","2005 Mazda MX-5",
  "1972 Datsun 240Z","1970 Datsun 240Z","1990 Nissan 300ZX","1999 Nissan Skyline GT-R","2009 Nissan GT-R",
  "1993 Toyota MR2","1986 Toyota MR2","1992 Mitsubishi 3000GT VR-4","1995 Mitsubishi Eclipse","1998 Subaru Impreza 22B",
  "2004 Subaru Impreza WRX STI","2015 Subaru WRX STI","1992 Nissan 240SX","2003 Mazda RX-8","1994 Mazda RX-7",
  // Euro classics / exotics
  "1972 Ferrari 246 Dino","1985 Ferrari 308 GTS","1995 Ferrari F355","2005 Ferrari F430","1973 Jaguar E-Type",
  "1969 Mercedes-Benz 280SL","1972 BMW 2002 tii","1974 Volkswagen Beetle","1965 Volkswagen Bus","1985 Ferrari Testarossa",
  "1990 Lamborghini Countach","2005 Lamborghini Gallardo","2011 Audi R8","1987 Buick Grand National","1963 Jaguar E-Type",
  "2002 BMW M Roadster","1995 Ferrari 512 TR","1989 Porsche 944 Turbo","1986 Porsche 928 S","1999 Lotus Esprit"
].slice(0,100);

function loadProgress(){ try{ return JSON.parse(fs.readFileSync(PROGRESS,"utf8")); }catch{ return { done:{} }; } }
function saveProgress(p){ fs.writeFileSync(PROGRESS, JSON.stringify(p,null,0)); }

async function runOne(raw){
  const res=await fetch(`${BASE}/api/sellerDecision`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({car:{raw,region:"US",state:"California",targetPrice:"120000",timeline:"No rush, right result only",debug:true},debug:true})});
  const d=await res.json();
  const routes=(d.decision?.routeFit?.routes||[]).filter(r=>r.routable!==false);
  // Pick reorder (same as result.js): highest cleared delta, else deepest market.
  const cleared=r=>{const p=r.marketEvidence?.pricePremium;return p&&p.gateType==="symmetric"&&Number.isFinite(p.percent)&&p.percent>=10?p.percent:-1;};
  let pick=routes[0],bestPct=-1;for(const r of routes){const pct=cleared(r);if(pct>bestPct){bestPct=pct;pick=r;}}
  if(bestPct<10){let dn=-1;for(const r of routes){const n=Number(r.marketEvidence?.evidenceSales||0);if(n>dn){dn=n;pick=r;}}}
  const p=pick?.marketEvidence?.pricePremium;
  const mode=!pick?"none":(p&&(p.type==="market_dominance"||(p.gateType==="symmetric"&&p.percent>=10))?"A":(p&&p.gateType==="symmetric"&&Number.isFinite(p.percent)&&Math.abs(p.percent)<10?"B":"honest"));
  const win=p?p.windowDays:null;
  const wk=pick?.marketEvidence?.dayAdvantage;
  // Stability: delta at 45 vs 90 for the pick platform from the debug walk.
  const walk=(d.debugPremiumWalk||{})[pick?.platform]||[];
  const gapAt=w=>{const s=walk.find(st=>st.windowDays===w&&Number.isFinite(st.gapPercent));return s?s.gapPercent:null;};
  const g45=gapAt(45),g90=gapAt(90);
  const bulletCount=1+(wk?1:0);
  return { status:d.status, mode, win, pick:pick?(pick.platform||pick.label):null, evidenceSales:pick?.marketEvidence?.evidenceSales||0,
    weekday: wk?{d:wk.weekday,pct:wk.liftPercent,scope:wk.scope,n:wk.sample}:null,
    g45, g90, stabilityGap:(g45!=null&&g90!=null)?Math.abs(g45-g90):null, bulletCount };
}

function report(prog){
  const rows=Object.entries(prog.done).map(([car,r])=>({car,...r}));
  const ok=rows.filter(r=>r.status==="decision_ready");
  if(!ok.length){ console.log(`No completed cars yet (${rows.length} attempted).`); return; }
  const finding=ok.filter(r=>r.mode==="A"||r.mode==="B");
  const twoPlus=ok.filter(r=>r.bulletCount>=2);
  const wins={45:0,90:0,180:0};ok.forEach(r=>{if(r.win)wins[r.win]=(wins[r.win]||0)+1;});
  const nonBaT=ok.filter(r=>r.mode==="A"&&r.pick&&r.pick!=="bringatrailer");
  const unstable=ok.filter(r=>r.stabilityGap!=null&&r.stabilityGap>10);
  const thin=ok.filter(r=>r.mode==="honest"||r.bulletCount<=1);
  console.log(`\n===== FULL COVERAGE (${ok.length}/${CARS.length} cars complete) =====`);
  console.log(`Mode A or B headline:   ${finding.length}/${ok.length} (${Math.round(finding.length/ok.length*100)}%)`);
  console.log(`2+ evidence lines:      ${twoPlus.length}/${ok.length}`);
  console.log(`Window distribution:    45d=${wins[45]||0} 90d=${wins[90]||0} 180d=${wins[180]||0}`);
  console.log(`Mode-A pick non-BaT:    ${nonBaT.length}/${finding.filter(r=>r.mode==="A").length} (${nonBaT.map(r=>r.car+":"+r.pick).join(", ")||"none"})`);
  console.log(`45d-vs-90d delta >10pts: ${unstable.length} cars (${unstable.map(r=>`${r.car}[45=${r.g45}% 90=${r.g90}%]`).join(", ")||"none"})`);
  console.log(`Thinnest ${Math.min(10,thin.length)} cards:  ${thin.slice(0,10).map(r=>r.car+"("+r.mode+")").join(", ")||"none"}`);
}

const prog=loadProgress();
if(process.argv[2]==="report"){ report(prog); process.exit(0); }
const todo=CARS.filter(c=>!prog.done[c]).slice(0,BATCH);
console.log(`Running ${todo.length} car(s) this batch (${Object.keys(prog.done).length}/${CARS.length} already done).`);
for(const raw of todo){
  try{ prog.done[raw]=await runOne(raw); console.log(`  ${raw}: ${prog.done[raw].mode} ${prog.done[raw].pick||""} ${prog.done[raw].weekday?`wk=${prog.done[raw].weekday.d}+${prog.done[raw].weekday.pct}%(n=${prog.done[raw].weekday.n})`:""}`); }
  catch(e){ console.log(`  ${raw}: ERROR ${e.message}`); }
  saveProgress(prog);
}
const remaining=CARS.filter(c=>!prog.done[c]).length;
if(remaining===0){ console.log("\nALL 100 COMPLETE."); report(prog); }
else console.log(`\n${remaining} car(s) remaining. Run again next budget window.`);
