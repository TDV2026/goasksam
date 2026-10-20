// vinDecodeStoreCheck (Lane B, Oct 20 2026): the index-time decode store for the decode-first identity rule
// (lib/_vinDecodeStore.js). Offline, no network: the real vPIC batch response saved from the one test call
// (scripts/fixtures/vpicBatch5.json, 5 VINs we hold) parses to the fields the rule needs; the paced decode makes ONE call at a
// time, 2 s apart, at most maxBatches calls, and stops on any HTTP error; the step ships OFF; carIdentity reads the stored decode
// and never calls vPIC; the rule gives the intended names from vPIC's raw answers.
import fs from "fs";
globalThis.fetch = async (u) => { throw new Error("network blocked in check: " + String(u).slice(0, 80)); };
delete process.env.SUPABASE_URL; delete process.env.SUPABASE_SERVICE_ROLE_KEY; delete process.env.OLDCARSDATA_API_KEY;
const S = await import("../lib/_vinDecodeStore.js");
const H = await import("../api/_historyData.js");
let bad = 0;
const ok = (c, m) => { if (c) console.log("ok   " + m); else { bad++; console.log("FAIL " + m); } };
ok(S.VIN_DECODE_NIGHTLY === false, "the nightly decode step ships OFF");
ok(H.IDENTITY_RULES.decodeFirst === false, "the decode-first rule ships OFF");
const fx = JSON.parse(fs.readFileSync(new URL("./fixtures/vpicBatch5.json", import.meta.url), "utf8"));
const p = S.parseBatch(fx);
ok(p["1GNGR26N2LF151255"] && p["1GNGR26N2LF151255"].model === "Suburban" && p["1GNGR26N2LF151255"].make === "CHEVROLET" && p["1GNGR26N2LF151255"].err === "0", "the batch response parses to make, model, year and error code (the Suburban)");
ok(Object.keys(p).length === 5, "five VINs in, five decodes out");
// pacing: 120 VINs, batches of 50, at most 2 calls; one call at a time, 2 s apart
const calls = [], sleeps = [];
const okRes = vins => ({ ok: true, status: 200, json: async () => ({ Results: vins.map(v => ({ VIN: v, Make: "DODGE", Model: "Dakota", ModelYear: "1989", ErrorCode: "0" })) }) });
const vinsOf = body => decodeURIComponent(String(body).replace(/^.*data=/, "")).split(";");
const todo = Array.from({ length: 120 }, (_, i) => "1B7FL96Y0KS" + String(100000 + i));
let inFlight = 0, maxInFlight = 0;
const r1 = await S.decodeInBatches(todo, { maxBatches: 2, batchSize: 50, delayMs: 2000, sleep: async ms => { sleeps.push(ms); }, fetchImpl: async (u, o) => { inFlight++; maxInFlight = Math.max(maxInFlight, inFlight); calls.push({ u, o }); const r = okRes(vinsOf(o.body)); inFlight--; return r; } });
ok(r1.batches === 2 && calls.length === 2 && r1.decoded === 100, `the cap holds: ${calls.length} calls, ${r1.decoded} decoded (the rest wait for the next night)`);
ok(maxInFlight === 1, "one call at a time");
ok(sleeps.length === 1 && sleeps[0] === 2000, "2 seconds between calls");
ok(calls[0].o.method === "POST" && /DecodeVINValuesBatch/.test(calls[0].u) && /format=json/.test(calls[0].o.body), "POST to the batch endpoint, format=json");
for (const st of [429, 503]) {
  let n = 0;
  const r = await S.decodeInBatches(todo, { maxBatches: 40, sleep: async () => {}, fetchImpl: async () => { n++; return { ok: false, status: st, json: async () => ({}) }; } });
  ok(n === 1 && r.stoppedOn === `vPIC HTTP ${st}` && r.decoded === 0, `HTTP ${st} stops the night at once (${n} call)`);
}
// read side: a stored decode, never a vPIC call
S._resetDecodeMemForTest({ "1GNGR26N2LF151255": { make: "CHEVROLET", model: "Suburban", year: 1990 } });
const sd = await S.storedDecodeFor("1GNGR26N2LF151255");
ok(sd && sd.model === "Suburban", "carIdentity's decode comes from the stored row");
ok((await S.storedDecodeFor("11102712001042")) === null, "a chassis number has no stored decode (the rule never applies)");
const src = fs.readFileSync(new URL("../api/_historyData.js", import.meta.url), "utf8");
const blk = src.slice(src.indexOf("if (IDENTITY_RULES.decodeFirst"), src.indexOf("// Same car = same VIN and same MAKE.")).replace(/\/\/[^\n]*/g, "");   // code only, not comments
ok(/storedDecodeFor\(normVin\(vin\)\)/.test(blk) && !/resolveVehicle\(|vpic|fetch\(/i.test(blk), "carIdentity never calls vPIC or the resolver's VIN path on a request");
// the rule on vPIC's raw answers: our make spelling, the old model word dropped, Hummer/AM General one make
const nm = (v, y) => [y, v.make, H.familyOf(v)].join(" ");
const a = H.decodeIdentityFix({ make: "Shelby", model: "Dodge" }, "1989 Dodge Shelby Dakota Pickup", { make: "DODGE", model: "Dakota" });
ok(a && nm(a, 1989) === "1989 Dodge Dakota Shelby", `vPIC's "DODGE" reads as the title's "Dodge": ${a && nm(a, 1989)}`);
const b = H.decodeIdentityFix({ make: "AM General", model: "Hummer", trim: "H1" }, "2002 AM General Hummer H1", { make: "HUMMER", model: "H1" });
ok(b === null, `a decoded model today's name already carries changes nothing: "AM General Hummer H1" stays (${b ? nm(b, 2002) : "no change"})`);
const b2 = H.decodeIdentityFix({ make: "AM General", model: "Hummer" }, "1995 AM General Hummer Wagon H1", { make: "HUMMER", model: "H2" });
ok(b2 === null, "a decoded model the title does not name changes nothing");
const c = H.decodeIdentityFix({ make: "Chevrolet", model: "Silverado", trim: "2500" }, "1990 Chevrolet Suburban 2500 Silverado 454", { make: "CHEVROLET", model: "Suburban" });
ok(c && nm(c, 1990) === "1990 Chevrolet Suburban 2500", `the Suburban: ${c && nm(c, 1990)}`);
const ro = H.decodeIdentityFix({ make: "Dodge", model: "Charger", trim: "Shelby" }, "1987 Dodge Shelby Charger GLH-S", { make: "DODGE", model: "Shelby Charger" });
ok(ro === null, "the same words in another order are no change (Dodge Charger Shelby stays, vPIC's \"Shelby Charger\" adds nothing)");
const om = H.decodeIdentityFix({ make: "Shelby", model: "Dodge" }, "1986 Dodge Omni Shelby GLH-S", { make: "DODGE", model: "OMNI" });
ok(om && om.model === "Omni" && om.make === "Dodge", `a make used as the model is fixed: ${om && [om.make, H.familyOf(om)].join(" ")}`);
console.log(bad ? `vinDecodeStoreCheck: ${bad} failed` : "vinDecodeStoreCheck: all passed");
process.exit(bad ? 1 : 0);
