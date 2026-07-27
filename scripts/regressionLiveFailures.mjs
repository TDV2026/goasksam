// Regression coverage for the three live failures reported July 2026.
// These lock the exact transcripts so they can never silently return.
//   B: 165 asking-price 911 -> no duplicate bullets, no price-level opinion
//   C: "2018 bmw 854g" -> did-you-mean or unverified, never verbatim-verified
// Failure A (year-less GTS through "Looks good") is covered by
// scripts/browserFlow.js, which drives the real send() entry point.
import fs from "node:fs";
import { resolveVehicle } from "../lib/vehicle.js";

// Capture node's real fetch before Section B installs a DOM/network stub, so
// Section C's resolver (which needs live vPIC) is never starved by that stub.
const realFetch = globalThis.fetch;

let failures = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  ->  " + detail}`);
  if (!ok) failures++;
};

// ---------- Failure B: pick-card bullets (local, no network) ----------
{
  const noop = () => {};
  const elem = () => new Proxy(function(){}, { get:(t,p)=>{ if(p==="style")return{}; if(p==="classList")return{add:noop,remove:noop,toggle:noop,contains:()=>false}; if(["value","textContent","id","className","innerHTML"].includes(p))return""; if(["appendChild","setAttribute","addEventListener","remove","append","scrollIntoView","focus"].includes(p))return noop; if(p==="querySelector")return()=>elem(); if(p==="querySelectorAll")return()=>[]; return elem(); }, apply:()=>elem() });
  globalThis.window = globalThis;
  globalThis.document = { getElementById:()=>elem(), querySelector:()=>elem(), querySelectorAll:()=>[], createElement:()=>elem(), addEventListener:noop, body:elem() };
  try { Object.defineProperty(globalThis,"navigator",{value:{language:"en-US"},configurable:true}); } catch {}
  globalThis.location = { hostname:"localhost", protocol:"file:" };
  globalThis.localStorage = { getItem:()=>null, setItem:noop };
  globalThis.fetch = async () => ({ ok:true, json:async()=>({}) });

  const html = fs.readFileSync("index.html","utf8");
  const files = [...html.matchAll(/<script src="(js\/[^"]+)"><\/script>/g)].map(m=>m[1]);
  const script = files.map(f=>fs.readFileSync(f,"utf8")).join("\n");
  const probe = `
    sellState.price="165";
    sellState.resolvedVehicle={make:"Porsche",model:"911",year:2019,trim:"Carrera"};
    sellState.timeline="Want it gone fast";
    sellState.sellDecision={evidence:{windowDays:180}};
    sellState.allRouteOptions=[];
    globalThis.__stLine = sellThroughLine({percent:80,band:"$50k to $150k"});
    const route={platform:"bringatrailer",label:"bringatrailer",marketEvidence:{evidenceSales:3,segmentSellThrough:{percent:80,band:"$50k to $150k"},pricePremium:null}};
    globalThis.__bullets = (primaryReasonBullets(route,null)||[]).map(b=>b.text);
    globalThis.__similar = bulletsSimilar;
  `;
  (0, eval)(script + "\n" + probe);
  const bullets = globalThis.__bullets || [];
  const joined = bullets.join(" || ").toLowerCase();
  check("B: sell-through line dropped when asking > band ceiling", globalThis.__stLine === null, `got ${JSON.stringify(globalThis.__stLine)}`);
  check("B: no 'higher end' / 'price point' value opinion on card", !/higher end|price point/.test(joined), joined);
  let dup = false;
  for (let i=0;i<bullets.length;i++) for (let j=i+1;j<bullets.length;j++) if (globalThis.__similar(bullets[i],bullets[j])) dup = true;
  check("B: no duplicate or near-duplicate bullets on the pick card", !dup, JSON.stringify(bullets));
  check("B: card still has bullets (price slot filled by other evidence)", bullets.length >= 1, JSON.stringify(bullets));
}

// ---------- Failure C: model validation (real resolver, free vPIC calls) ----------
{
  globalThis.fetch = realFetch; // undo Section B's stub so vPIC lookups work
  const fake = await resolveVehicle("2018 bmw 854g");
  const fakeV = fake.vehicle || {};
  const okFake = fake.status === "needs_confirmation"
    || (fake.status === "valid" && fakeV.unverified === true && fakeV.confidence === "low");
  check("C: '2018 bmw 854g' is did-you-mean OR unverified, never verbatim-verified",
    okFake, `status=${fake.status} model=${fakeV.model} conf=${fakeV.confidence} unverified=${fakeV.unverified} q=${JSON.stringify(fake.clarification?.question)}`);

  const totallyFake = await resolveVehicle("2018 bmw zx99q");
  const tfV = totallyFake.vehicle || {};
  check("C: a no-match designation is accepted but flagged unverified (never high)",
    totallyFake.status === "needs_confirmation" || (tfV.unverified === true && tfV.confidence !== "high"),
    `status=${totallyFake.status} conf=${tfV.confidence} unverified=${tfV.unverified}`);

  for (const real of ["2018 bmw 850i", "2018 bmw m3", "2018 bmw 840i"]) {
    const r = await resolveVehicle(real);
    check(`C: real model "${real}" still resolves valid and verified`,
      r.status === "valid" && !r.vehicle?.unverified, `status=${r.status} unverified=${r.vehicle?.unverified}`);
  }
}

console.log(failures ? `\n${failures} FAILURE(S)` : "\nREGRESSION ALL PASS");
process.exit(failures ? 1 : 0);
