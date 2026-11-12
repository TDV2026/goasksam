// DESK V4 INTAKE QUEUE CHECK (Lane S, Nov 10 2026). Forwarded leads in the queue, against REAL stored sheets read through the real case view (scripts/deskV4Harness.mjs seedIntake): a forwarded lead with a seller supplied VIN and mileage and an original email, two forwarded leads whose car was not identified, and a case made by hand.
//   1 TAG: a forwarded lead in New leads carries a small "Forwarded lead" tag; the hand made case in New leads does not; no row outside New leads has one; the open case's head carries it for a forwarded lead only.
//   2 UNVERIFIED MARKS: seller supplied facts show as Unverified, with Verify, until the analyst verifies them; Verify saves the case's own verified flag (the saved field is verified and analyst verified), and only that field's mark goes; a hand made case's facts carry no Unverified mark.
//   3 ORIGINAL EMAIL: opens from Documents, in a new tab, at the address the case carries; a hand made case has none.
//   4 UNIDENTIFIED CAR: the case's own needs line ("The vehicle is not identified." as the case sent it) shows in Needs attention with VIN, year, make and model inputs; an empty Identify sends nothing; year, make and model save as the case's fields and clear the line; a VIN saves as the case's VIN and clears the line.
//   5 THE REAL NAMES (Lane D, Nov 10 2026): a forwarded lead is case.origin === "forwarded" and NOT a lead reference (a typed case that carries one is not tagged; a forwarded case without one is); the original email is case.sourceEmail { name, url, line } and prints the case's own line, with no link when the signed url is null; the seller's ask is reserve.sellerAskLine and never reserve.sellerRequested (the analyst's yes or no).
//   MUTANTS (each run through the same assertion, each must fail): no tag, a tag on every New lead, an unverified fact drawn as verified, Verify that verifies the wrong field, no email link, an email that opens in the same tab, no unidentified path, Identify that saves nothing.
//   CLASS: a lead that looks verified, identified or tagged without the case saying so. Every word is the case's or a fixed interface label; the saved case is compared after every edit.
//   node scripts/deskV4IntakeQueueCheck.mjs
import { launch, openLive, tally, PV, seedIntake } from "./deskV4Harness.mjs";
const { ok, done } = tally(), wait = (ms = 900) => new Promise(r => setTimeout(r, ms));
const F = await seedIntake(); ok(F.typedOk, "the fixtures are stored (two forwarded leads with an original email, two with no car, one made by hand)");
const stored = async id => (await PV.previewDeskApi({ action: "case_get", id })).case;
const b = await launch();

const S = {
  async queue(p) { return p.evaluate(F2 => { const tagged = id => !!document.querySelector(`#queue .qi[data-case="${id}"] [data-forwarded]`), inNew = id => { const r = document.querySelector(`#queue .qi[data-case="${id}"]`), e = r && r.closest(".qgrp") && r.closest(".qgrp").querySelector(".qg"); return e ? e.textContent.trim().startsWith("New leads") : false; };
      const outside = [...document.querySelectorAll("#queue [data-forwarded]")].filter(t => { const r = t.closest(".qi"), e = r.closest(".qgrp") && r.closest(".qgrp").querySelector(".qg"); return !(e && e.textContent.trim().startsWith("New leads")); }).length;
      return { fwd: tagged(F2.fwd) && inNew(F2.fwd), nocar: tagged(F2.nocar) && inNew(F2.nocar), noref: tagged(F2.fwdnoref) && inNew(F2.fwdnoref), typed: tagged(F2.typed), typedlead: tagged(F2.typedlead), typedInNew: inNew(F2.typed) && inNew(F2.typedlead), outside }; }, F).then(q => ({ ...q, pass: q.fwd && q.nocar && q.noref && q.typedInNew && !q.typed && !q.typedlead && q.outside === 0 })); },
  async head(p, want) { const t = await p.evaluate(() => !!document.getElementById("fwdtag")); return { t, pass: t === want }; },
  async marks(p) { const m = await p.evaluate(() => [...document.querySelectorAll("[data-unverified]")].map(e => e.dataset.unverified)); const has = m.includes("vin") && m.includes("mileage");
    if (!has) return { m, pass: false }; await p.click('[data-verify="mileage"]'); await wait(1300); const after = await p.evaluate(() => ({ unv: [...document.querySelectorAll("[data-unverified]")].map(e => e.dataset.unverified), chip: [...document.querySelectorAll("#facts .v")].map(v => v.nextElementSibling && v.nextElementSibling.textContent) })); const sv = (await stored(F.fwd)).fields;
    return { m, after, pass: sv.mileage.verified === true && sv.mileage.source === "analyst_verified" && !after.unv.includes("mileage") && after.unv.includes("vin") && sv.vin.verified === false && /Verified/.test(after.chip.join("|")) }; },
  async typedMarks(p) { const m = await p.evaluate(() => document.querySelectorAll("[data-unverified]").length); return { m, pass: m === 0 }; },
  async email(p, want) { const r = await p.evaluate(() => { const a = document.getElementById("origmail"), se = window.__v4.K().sourceEmail; return a ? { href: a.href, target: a.target, inDocs: !!a.closest("#s-docs"), tile: a.textContent, name: se && se.name, line: se && se.line } : null; });
    return { r, pass: want ? !!r && r.href === "https://example.test/mail/" + want + ".eml" && r.target === "_blank" && r.inDocs && !!r.line && r.tile.includes(r.line) && r.tile.includes(r.name) : r === null }; },
  async askLine(p) { const r = await p.evaluate(() => { const K = window.__v4.K(), e = document.getElementById("sellerAsk"); return { want: K.reserve && K.reserve.sellerAskLine, req: K.reserve && K.reserve.sellerRequested, shown: e && !e.hidden ? e.textContent : null }; }); return { r, pass: !!r.want && r.shown === r.want && r.shown !== String(r.req) }; },
  async identifyEmpty(p) { const n0 = p._posts.length; if (!(await p.$("#idgo"))) return { pass: false, why: "no identify path" }; await p.click("#idgo"); await wait(300); return { pass: p._posts.length === n0 && /Enter a VIN/.test(await p.evaluate(() => document.getElementById("idmsg").textContent)) }; },
  async identifyYMM(p, id) { const line = await p.evaluate(() => { const b = (window.__V4__.readiness.blockers || []).find(x => x.key === "vehicle"); const row = document.querySelector('[data-need="vehicle"] > span'); return { want: b && b.why, got: row && row.textContent }; });
    if (!(await p.$("#idyear"))) return { pass: false, why: "no identify path" }; await p.type("#idyear", "1999"); await p.type("#idmake", "Porsche"); await p.type("#idmodel", "911"); await p.click("#idgo"); await wait(2500);
    const sv = (await stored(id)).fields, gone = await p.evaluate(() => !document.querySelector('[data-need="vehicle"]')); return { line, pass: !!line.want && line.want === line.got && sv.year.value === 1999 && sv.make.value === "Porsche" && sv.model.value === "911" && gone }; },
  async identifyVin(p, id, vin) { if (!(await p.$("#idvin"))) return { pass: false, why: "no identify path" }; await p.type("#idvin", vin); await p.click("#idgo"); await wait(2500); const sv = (await stored(id)).fields, gone = await p.evaluate(() => !document.querySelector('[data-need="vehicle"]')); return { pass: sv.vin.value === vin && gone }; }
};
const MUT = [
  ["no tag on a forwarded lead", h => h.split('<em class="tag" data-forwarded="1">Forwarded lead</em>').join(""), p => S.queue(p)],
  ["a tag on every New lead (the hand made case too)", h => { const i = h.indexOf('data-case="' + F.typed + '"'), j = h.indexOf('</span><span class="q2">', i); return h.slice(0, j) + '<em class="tag" data-forwarded="1">Forwarded lead</em>' + h.slice(j); }, p => S.queue(p)],
  ["an unverified fact drawn as verified", h => h.replace("if (f.verified) {", 'if (f.verified || f.source === "seller") {'), p => S.marks(p), F.fwd],
  ["Verify that verifies the wrong field", h => h.replace('edit("verify", { field: k })', 'edit("verify", { field: "colour" })'), p => S.marks(p), F.fwd],
  ["the tag read from the lead reference instead of origin (tags the typed case that has one)", h => { const i = h.indexOf('data-case="' + F.typedlead + '"'), j = h.indexOf('</span><span class="q2">', i); return h.slice(0, j) + '<em class="tag" data-forwarded="1">Forwarded lead</em>' + h.slice(j); }, p => S.queue(p)],
  ["the tag read from the lead reference instead of origin (drops the forwarded case that has none)", h => { const i = h.indexOf('data-case="' + F.fwdnoref + '"'), j = h.indexOf('<em class="tag" data-forwarded="1">Forwarded lead</em>', i), k = h.indexOf("</a>", i); return j > 0 && j < k ? h.slice(0, j) + h.slice(j + '<em class="tag" data-forwarded="1">Forwarded lead</em>'.length) : h; }, p => S.queue(p)],
  ["the email tile prints the file name instead of the case's line", h => h.replace('el("span", { text: em.line || "" })', 'el("span", { text: em.name || "" })'), p => S.email(p, F.fwd), F.fwd],
  ["the seller's ask read from sellerRequested instead of sellerAskLine", h => h.replace('sa.textContent = r.sellerAskLine || ""; sa.hidden = !r.sellerAskLine;', 'sa.textContent = r.sellerRequested || ""; sa.hidden = !r.sellerRequested;'), p => S.askLine(p), F.fwd],
  ["no original email link", h => h.replace("var em = K.sourceEmail; if (em && em.url)", "var em = null; if (em && em.url)"), p => S.email(p, F.fwd), F.fwd],
  ["an original email that opens in the same tab", h => h.replace('id: "origmail", href: em.url, target: "_blank"', 'id: "origmail", href: em.url, target: "_self"'), p => S.email(p, F.fwd), F.fwd],
  ["no way to identify an unidentified car", h => h.replace("if (vb) { open++; box.appendChild(vehicleRow(vb)); }", ""), p => S.identifyYMM(p, F.nocar2), F.nocar2],
  ["Identify that saves nothing", h => h.replace('return edit("field", { field: x[0], value: x[1] });', "return Promise.resolve();"), p => S.identifyYMM(p, F.nocar2), F.nocar2]
];
// the mutants first: each leaves the saved cases as it found them
for (const [label, mutate, run, id] of MUT) { const p = await openLive(b, { id: id || F.typed, mutate }); let r; try { r = await run(p); } catch (e) { r = { pass: false, why: String(e.message).slice(0, 80) }; } await p.close(); ok(r.pass === false, `mutant caught: ${label}`); }

// 1 tag
{ const p = await openLive(b, { id: F.fwd }); const q = await S.queue(p); ok(q.pass, `the queue: both forwarded leads tagged in New leads, the hand made case not, none outside New leads (${JSON.stringify(q)})`); const h = await S.head(p, true); ok(h.pass, "the open forwarded lead's head carries the tag");
  // 2 marks
  const m = await S.marks(p); ok(m.pass, `seller supplied facts show Unverified with Verify; Verify saves the case's verified flag for that field only (${m.m.join(", ")} then ${m.after && m.after.unv.join(", ")})`);
  const ak = await S.askLine(p); ok(ak.pass, `the seller's ask prints reserve.sellerAskLine exactly ("${ak.r.shown}") and never the analyst's sellerRequested (${ak.r.req})`);
  // 3 email
  const e = await S.email(p, F.fwd); ok(e.pass, "the original email opens from Documents, in a new tab, at the case's address"); ok(!p._err.length, "no page error (forwarded lead)" + p._err.join(" | ")); await p.close(); }
{ const p = await openLive(b, { id: F.fwdnoref }); ok((await S.head(p, true)).pass, "a forwarded case with no lead reference still carries the tag (origin, not lead_ref)"); ok((await S.email(p, null)).pass, "a null signed address is never a link"); await p.close(); }
{ const p = await openLive(b, { id: F.typedlead }); ok((await S.head(p, false)).pass, "a typed case that carries a lead reference is not a forwarded lead"); await p.close(); }
{ const fs = await import("node:fs"); const src = fs.readFileSync("lib/preview/deskV3.js", "utf8"), m = /forwarded: ([^,]+),/.exec(src); ok(!!m && /cv\.origin === "forwarded"/.test(m[1]) && !/lead_ref/.test(m[1]), "the queue reads the origin field only (caseOf.forwarded has no lead_ref fallback)"); const old = src.replace('forwarded: cv.origin === "forwarded",', 'forwarded: cv.origin ? cv.origin === "forwarded" : !!cv.lead_ref,'), m2 = /forwarded: (.+?),\s*demo/.exec(old) || /forwarded: ([^;]+?)\s*,\s*demo/.exec(old); ok(!!m2 && /lead_ref/.test(m2[1]), "mutant caught: a lead_ref fallback in the queue's forwarded test"); }
{ const p = await openLive(b, { id: F.typed }); ok((await S.head(p, false)).pass, "a hand made case's head has no Forwarded lead tag"); ok((await S.typedMarks(p)).pass, "a hand made case's facts carry no Unverified mark"); ok((await S.email(p, null)).pass, "a hand made case has no original email"); await p.close(); }
// 4 unidentified car
{ const p = await openLive(b, { id: F.nocar }); const e0 = await S.identifyEmpty(p); ok(e0.pass, "an empty Identify sends nothing and says what to enter"); const y = await S.identifyYMM(p, F.nocar); ok(y.pass, `unidentified car: the case's own line (${y.line && y.line.got}) with inputs; year, make and model save and the line clears`); ok(!p._err.length, "no page error (unidentified car)" + p._err.join(" | ")); await p.close(); }
{ const p = await openLive(b, { id: F.nocar2 }); const v = await S.identifyVin(p, F.nocar2, F.vin); ok(v.pass, "unidentified car: a VIN saves as the case's VIN and the line clears"); await p.close(); }
await b.close();
done("deskV4IntakeQueueCheck");
