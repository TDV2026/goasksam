// DESK V4 AGAINST LANE D'S ad37ba09 (Lane S, Nov 13 2026): the three things the page takes from it, each answered by the REAL handler (handleSheetAction with injected readers), never by a stub.
//   1 RE-READ THE EMAIL: a button on a forwarded case's Documents card, in the table's words (case.reread.button); a typed case and a finalized case carry none; a click posts case_reread_email for the open case; the page prints the server's line (or its refusal) and shows the case the server sent.
//   2 THE CHECK DIGIT WARNING: a 17 character VIN with a wrong check digit decodes, and the server's warning prints on the car card in its own words; a VIN that passes prints none.
//   3 EACH PREFILLED FIELD'S SOURCE LABEL: a value from the car's last sale says "From its last sale" and a value only the decode named says "VIN decoded" (the server's SRC_LABEL words), on the card's tags and on the pickers; a plain decode keeps its one line.
//   Mutants: no button on a forwarded case; the button on a typed case; the server's line not printed; the check digit warning not printed; every field labelled alike.
//   node scripts/deskV4RereadCheck.mjs
import fs from "node:fs"; import path from "node:path";
import { launch, openLive, tally, seedIntake, imp, ROOT, V3, PV, claim } from "./deskV4Harness.mjs";
const { ok, done } = tally(), wait = ms => new Promise(r => setTimeout(r, ms)), b = await launch();
const A = await imp("lib/desk/sheetActions.js"), { reasonLine } = await imp("lib/reasonWords.js"), { simpleParser } = await import("mailparser").catch(async () => { const { createRequire } = await import("node:module"); for (const d of ["../goasksam-laneD", "../laneC-main"]) { try { return createRequire(path.join(ROOT, d, "x.js"))("mailparser"); } catch { /* next */ } } throw new Error("mailparser is not installed here or in a sibling worktree"); });   // this worktree shares the main checkout's node_modules, which has no mailparser; a worktree that has it supplies it
const SUBJ = fs.readFileSync(path.join(ROOT, "scripts/fixtures/hagertySamResend.subject.txt"), "utf8").trim(), BODY = fs.readFileSync(path.join(ROOT, "scripts/fixtures/hagertySamResend.txt"), "utf8");
const EML = `From: Ann Analyst <ann@hagerty.example>\r\nTo: hagerty@desk.goasksam.com\r\nSubject: Fwd: ${SUBJ}\r\nMime-Version: 1.0\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${BODY.replace(/\r?\n/g, "\r\n")}`;
const ids = await seedIntake(), store = await PV.previewStore();
const ctxOf = over => ({ env: {}, org: PV.PREVIEW_ORG.id, seat: PV.PREVIEW_SEAT, store, now: new Date().toISOString(), orgSettings: { name: PV.PREVIEW_ORG.name }, readSheet: PV.previewReadSheet, fetchImage: async () => null, fetchObject: async () => Buffer.from(EML), mailDeps: { simpleParser, resolveVehicle: async () => ({ status: "invalid" }), decodeVin: async () => null }, ...over });
const sent = [];   // every answer the real handler gave the page, in order
const real = over => async bd => { if (bd.action !== "case_reread_email" && bd.action !== "case_decode") return undefined; const r = await A.handleSheetAction(bd.action, bd, ctxOf(over)); sent.push({ action: bd.action, r }); return r; };
const openCase = async (id, opts = {}) => { const p = await openLive(b, { id, intercept: real(), ...opts }); await claim(p); return p; };
const txt = (p, sel) => p.evaluate(s => { const e = document.querySelector(s); return e ? e.textContent : null; }, sel);
const has = (p, sel) => p.evaluate(s => { const e = document.querySelector(s); return !!e && e.offsetWidth > 0; }, sel);

{ // 1 RE-READ THE EMAIL
  const word = reasonLine("case.reread.button"), page = id => openCase(id);
  const g = await page(ids.fwd);
  ok(await has(g, "#s-docs #reread") && (await txt(g, "#reread")) === word, `a forwarded lead's Documents card carries the button "${word}", the table's word`, await txt(g, "#reread"));
  sent.length = 0; await g.click("#reread"); await g.waitForFunction(() => { const m = document.getElementById("rereadmsg"); return m && !m.hidden && m.textContent; }, { timeout: 20000 }).catch(() => {});
  const a1 = sent.find(x => x.action === "case_reread_email"), post1 = g._posts.filter(x => x.action === "case_reread_email");
  ok(post1.length === 1 && post1[0].id === ids.fwd, "a click posts case_reread_email for the open case, once", JSON.stringify(post1));
  ok(!!a1 && a1.r.ok === true && (await txt(g, "#rereadmsg")) === a1.r.line, "the page prints the server's own line, as sent", [a1 && a1.r.ok, a1 && a1.r.line, await txt(g, "#rereadmsg")].join(" | "));
  if (a1 && a1.r.ok && a1.r.filled > 0) { const phone = a1.r.case.seller && a1.r.case.seller.phone; ok(!phone || (await txt(g, "#ch-contact") || "").includes(phone), "the case the server sent is what the page shows (the seller's phone from the email is in the head)", phone); }
  sent.length = 0; await g.click("#reread"); await g.waitForFunction(p => { const m = document.getElementById("rereadmsg"); return m && m.textContent && m.textContent !== p; }, { timeout: 20000 }, a1 && a1.r.line).catch(() => {});
  const a2 = sent.find(x => x.action === "case_reread_email");
  ok(!!a2 && a2.r.filled === 0 && (await txt(g, "#rereadmsg")) === a2.r.line && a2.r.line === reasonLine("case.reread.nothing"), "a second read adds nothing and says so in the server's words", a2 && a2.r.line);
  const ty = await page(ids.typed); ok(!(await has(ty, "#reread")), "a case typed by hand carries no Re-read button");
  const nc = await page(ids.nocar); ok(await has(nc, "#reread"), "a forwarded lead whose car was not identified carries it too");
  // a refusal prints as sent: a case with no email path
  const refuse = await openLive(b, { id: ids.fwd, intercept: async bd => bd.action === "case_reread_email" ? { ok: false, why: reasonLine("case.reread.refuse_no_email") } : undefined }); await claim(refuse);
  await refuse.click("#reread"); await refuse.waitForFunction(() => { const m = document.getElementById("rereadmsg"); return m && !m.hidden && m.textContent; }, { timeout: 8000 }).catch(() => {});
  ok((await txt(refuse, "#rereadmsg")) === reasonLine("case.reread.refuse_no_email"), "a refusal prints the server's why under the header");
  const fin = await openLive(b, { id: V3.DEMO_ID }); ok(!(await has(fin, "#reread")), "the demonstration case (not a forwarded lead) carries none");
  const m1 = await openLive(b, { id: ids.fwd, mutate: h => h.replace("D.forwarded && D.rereadWord", "false && D.rereadWord") }); ok(!(await has(m1, "#reread")), "mutant caught: no button on a forwarded lead");
  const m2 = await openLive(b, { id: ids.typed, mutate: h => h.replace("D.forwarded && D.rereadWord", "D.rereadWord") }); ok(await has(m2, "#reread"), "mutant caught: the button on a typed case");
  const m3 = await openLive(b, { id: ids.fwd, intercept: real(), mutate: h => h.replace("m2.textContent = (r && (r.ok ? r.line : (r.why || r.line))) || ", "m2.textContent = ") }); await claim(m3); await m3.click("#reread"); await wait(2500);
  ok((await txt(m3, "#rereadmsg")) !== reasonLine("case.reread.nothing") && (await txt(m3, "#rereadmsg")) !== sent[sent.length - 1].r.line, "mutant caught: the server's line not printed"); }

{ // 2 THE CHECK DIGIT WARNING, from the real case_decode
  const facts = { year: 1999, make: "Porsche", model: "911", trim: "Carrera", bodyStyle: "Coupe" }, base = { decodeVin: async () => facts, archiveMatch: async () => null, liveMatch: async () => null, resolveVehicle: async () => ({ status: "invalid" }) };
  const BAD = "WP0AA2995XS626786", GOOD = "WP0AA2995XS626785", open = async mutate => openLive(b, { id: null, intercept: real(base), mutate });
  const start = async (p, vin) => { await p.evaluate(() => document.getElementById("newcase-btn").click()); await wait(200); await p.type("#nc-start", vin); await p.click("#nc-startbtn"); await p.waitForFunction(() => { const m = document.getElementById("nc-msg1"); return !document.getElementById("nc-s2").hidden || (m && m.textContent && m.textContent !== "Reading the car"); }, { timeout: 15000 }).catch(() => {}); await wait(80); };
  const read = p => p.evaluate(() => ({ s2: !document.getElementById("nc-s2").hidden, warn: document.getElementById("nc-warn") && !document.getElementById("nc-warn").hidden ? document.getElementById("nc-warn").textContent : "", title: document.getElementById("nc-title").textContent }));
  sent.length = 0; const pb = await open(null); await start(pb, BAD); const rb = await read(pb), ab = sent.find(x => x.action === "case_decode");
  ok(!!ab && ab.r.ok === true && ab.r.warning === reasonLine("case.decode.warn_check"), "the real case_decode answers ok:true with the check digit warning for a 17 character VIN with a wrong check digit", JSON.stringify(ab && ab.r).slice(0, 160));
  ok(rb.s2 && rb.warn === ab.r.warning && /Carrera/.test(rb.title), "the card opens and prints that warning line exactly as sent", JSON.stringify(rb));
  sent.length = 0; const pg = await open(null); await start(pg, GOOD); const rg = await read(pg);
  ok(rg.s2 && rg.warn === "", "a VIN whose check digit passes prints no warning", JSON.stringify(rg));
  const pm = await open(h => h.replace("if (r && r.ok && r.warning) car.warning = String(r.warning);", "")); await start(pm, BAD); ok((await read(pm)).warn === "", "mutant caught: the warning not printed"); }

{ // 3 EACH PREFILLED FIELD'S SOURCE LABEL
  const SL = V3.SRC_LABEL, decodeVin = async () => ({ year: 1999, make: "Porsche", model: "911", trim: "Carrera", bodyStyle: "Coupe", transmission: null });
  const archive = { year: 1999, make: "Porsche", model: "911", price: 41000, soldDate: "2024-05-01", displayName: "1999 Porsche 911 Carrera Coupe", bodyStyle: "Coupe", transmission: "6-Speed Manual", exteriorColor: "Guards Red", colour: "Guards Red", mileage: 61200, venue: "Bring a Trailer", url: "https://example.test/x" };
  const withSale = { decodeVin, archiveMatch: async () => archive, liveMatch: async () => null, resolveVehicle: async () => ({ status: "valid", vehicle: { make: "Porsche", model: "911", trim: null, bodyStyle: "Coupe" } }) }, plain = { decodeVin, archiveMatch: async () => null, liveMatch: async () => null, resolveVehicle: async () => ({ status: "invalid" }) };
  const run = async (over, mutate) => { sent.length = 0; const p = await openLive(b, { id: null, intercept: real(over), mutate }); await p.evaluate(() => document.getElementById("newcase-btn").click()); await wait(200); await p.type("#nc-start", "WP0AA2995XS626785"); await p.click("#nc-startbtn"); await p.waitForFunction(() => !document.getElementById("nc-s2").hidden, { timeout: 15000 }).catch(() => {}); await wait(120);
    const dec = (sent.find(x => x.action === "case_decode") || { r: {} }).r.decoded || {};
    const page = await p.evaluate(() => ({ src: document.getElementById("nc-src").hidden ? "" : document.getElementById("nc-src").textContent, tags: Object.fromEntries([...document.querySelectorAll("#nc-tags .ntag")].map(t => [t.dataset.tag, (t.querySelector(".tsrc") || {}).textContent || ""])), dtag: Object.fromEntries(["nc-body", "nc-trans", "nc-colour"].map(i => { const e = document.getElementById(i + "-dec"); return [i, e && !e.hidden ? e.textContent : ""]; })), vals: { body: document.getElementById("nc-body").value, colour: document.getElementById("nc-colour").value } }));
    return { dec, page }; };
  const g = await run(withSale), fromSale = Object.keys(g.dec).filter(k => g.dec[k].source === "last_sale"), fromVin = Object.keys(g.dec).filter(k => g.dec[k].source === "vin_decoded");
  ok(fromSale.length >= 2 && fromVin.length >= 1, "the real answer mixes sources: some fields from the car's last sale, some only decoded", JSON.stringify(Object.fromEntries(Object.entries(g.dec).map(([k, v]) => [k, v.source]))));
  const tagKeys = ["year", "make", "model", "trim"].filter(k => g.dec[k]);
  ok(tagKeys.every(k => g.page.tags[k] === SL[g.dec[k].source]), "each tag on the car card names its own source in the server's words (From its last sale, VIN decoded)", JSON.stringify(g.page.tags));
  const pk = { body: "nc-body", transmission: "nc-trans", colour: "nc-colour" };
  ok(Object.keys(pk).filter(k => g.dec[k] && g.dec[k].source === "last_sale").every(k => g.page.dtag[pk[k]] === SL.last_sale) && g.page.vals.colour === (g.dec.colour && g.dec.colour.value || ""), "a picker filled from the last sale carries \"" + SL.last_sale + "\" and the value", JSON.stringify(g.page));
  ok(g.page.src === "", "the one \"Decoded from the VIN\" line steps aside once the fields name their own sources", g.page.src);
  const pl = await run(plain);
  ok(Object.values(pl.dec).every(v => v.source === "vin_decoded") && Object.values(pl.page.tags).every(t => t === "") && pl.page.src === "Decoded from the VIN", "a plain decode keeps its one line and no per-field chip", JSON.stringify(pl.page));
  const mu = await run(withSale, h => h.replace("SRCL[car.src[k]] : null;", "\"VIN decoded\" : null;"));
  ok(tagKeys.some(k => mu.page.tags[k] !== SL[mu.dec[k].source]), "mutant caught: every field labelled alike"); }

await b.close(); done();
