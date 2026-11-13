// DESK V4 SELLER FACTS CHECK (Lane S, Nov 13 2026). A forwarded case carries the seller and the place (case.seller { name, email, phone }, case.lead.facts { city, state, titleStatus, mileageOriginal }, each fact { value, source, verified, line? }). The case head prints the seller's name, a Contact line (email, phone) and a Location line (city, state) under it, each value as sent; the facts grid gains Title status and Mileage original rows, read only and marked as the seller's, unverified. NOTHING is printed that the case does not carry: no empty line, no row, no placeholder, no word the page made (a yes or no answer prints the server's word, case.lead.*, never true or false).
//   CLASS: any value the page prints in the head's Contact and Location lines or in those two rows is a string the case carried; a case that carries none of them shows none of them (the demonstration case, a hand-made case).
//   MUTANTS: a Contact line with nothing to say, a state the case does not carry, a row with nothing to say, a yes or no turned into a word by the page.
//   node scripts/deskV4SellerFactsCheck.mjs
import fs from "node:fs";
import { launch, openLive, tally, V3, V4, imp } from "./deskV4Harness.mjs";
const { ok, done } = tally(), b = await launch();
const base = await V4.renderDeskV4({ query: { case: V3.DEMO_ID } });
const give = (html, mut) => { const m = /window\.__V4__=([\s\S]*?);window\.__DESK_V3__/.exec(html); const o = JSON.parse(m[1]); mut(o.kase); return html.replace(m[0], "window.__V4__=" + JSON.stringify(o).replace(/</g, "\\u003c") + ";window.__DESK_V3__"); };
const f = (v, extra = {}) => ({ value: v, source: "seller", verified: false, ...extra });
const FULL = c => { c.seller = { ...(c.seller || {}), name: "Pat Lee", email: "pat@example.com", phone: "310 555 0142" }; c.lead = { source: "hagerty_form", facts: { city: f("Santa Monica"), state: f("CA"), titleStatus: f("Clean"), mileageOriginal: f(true, { line: "Yes" }) } }; };
const PART = c => { c.seller = { ...(c.seller || {}), name: "Pat Lee", email: "pat@example.com", phone: undefined }; delete c.seller.phone; c.lead = { source: "hagerty_form", facts: { city: f("Santa Monica") } }; };
const NONE = c => { c.seller = { name: "Pat Lee" }; delete c.lead; };
const BOOL = c => { FULL(c); delete c.lead.facts.mileageOriginal.line; };
const page = (mut, o = {}) => openLive(b, { ...o, mutate: h => { const x = mut ? give(base, mut) : base; return o.html ? o.html(x) : x; } });
const READ = () => { const g = s => document.querySelector(s), t = e => e ? e.textContent : null, all = s => [...document.querySelectorAll(s)];
  const K = window.__v4.K(), strs = new Set(); const walk = o => { if (o == null) return; if (typeof o === "string") strs.add(o.trim()); else if (typeof o === "object") for (const k in o) walk(o[k]); }; walk(K);
  const printed = [...all("#ch-contact .wv"), ...all("#ch-location .wv"), ...all("[data-lead]")].map(e => e.textContent.trim());
  return { contact: all("#ch-contact .wv").map(e => e.dataset.contact + "=" + e.textContent), hasContact: !!g("#ch-contact"), loc: all("#ch-location .wv").map(e => e.dataset.loc + "=" + e.textContent), hasLoc: !!g("#ch-location"), rows: all("[data-lead]").map(e => e.dataset.lead + "=" + e.textContent), marks: all("#facts .marks[data-fact]").filter(m => /^(titleStatus|mileageOriginal)$/.test(m.dataset.fact)).map(m => m.dataset.fact + ":" + [...m.querySelectorAll("[data-mark]")].map(c => c.textContent).join()),
    labels: all("#facts .k").map(e => e.textContent), unsent: printed.filter(p => !strs.has(p)), name: t(g(".casehead .meta b")), head: g("#s-head") ? g("#s-head").textContent : "", lineAbove: (() => { const a = g("#ch-contact"), m = g(".casehead .meta"); return !a || !m ? null : a.getBoundingClientRect().top >= m.getBoundingClientRect().bottom - 1; })() }; };
const run = async (mut, o) => { const p = await page(mut, o); const r = await p.evaluate(READ); await p.close(); return r; };
const good = r => r.contact.join() === "email=pat@example.com,phone=310 555 0142" && r.loc.join() === "city=Santa Monica,state=CA" && r.rows.join("|") === "titleStatus=Clean|mileageOriginal=Yes" && r.marks.join("|") === "titleStatus:Unverified|mileageOriginal:Unverified" && r.labels.includes("Title status") && r.labels.includes("Mileage original") && r.unsent.length === 0 && r.name === "Pat Lee" && r.lineAbove === true;
const bare = r => !r.hasContact && !r.hasLoc && r.rows.length === 0 && !r.labels.includes("Title status") && !r.labels.includes("Mileage original") && !/Contact|Location/.test(r.head) && r.unsent.length === 0;
const g = await run(FULL); ok(good(g), `a forwarded case prints the seller's name, a Contact line (email, phone) and a Location line (city, state) under it, and the Title status and Mileage original rows, each as sent and marked Unverified (${g.contact.join(" ")} | ${g.loc.join(" ")} | ${g.rows.join(" ")})`);
const pt = await run(PART); ok(pt.contact.join() === "email=pat@example.com" && pt.loc.join() === "city=Santa Monica" && pt.rows.length === 0 && pt.unsent.length === 0, `a case that carries only an email and a city prints only those (${pt.contact.join(" ")} | ${pt.loc.join(" ")}), no phone, no state, no row`);
const nn = await run(NONE); ok(bare(nn), "a case that carries none of them prints no Contact line, no Location line and no row");
const dm = await run(null); ok(dm.contact.join() === "email=hal@example.com" && !dm.hasLoc && dm.rows.length === 0 && !dm.labels.includes("Title status") && dm.unsent.length === 0, `the demonstration case carries an email and nothing else, so prints that email only (${dm.contact.join(" ")})`);
const bo = await run(BOOL); ok(!bo.rows.some(x => x.startsWith("mileageOriginal")) && bo.unsent.length === 0, "a yes or no with no word from the server prints nothing: the page never turns true into Yes");
const { leadOf } = await imp("lib/desk/caseView.js"), L = leadOf({ facts: { a: { value: true }, b: { value: false }, c: { value: "x" } } });
ok(L.facts.a.line === "Yes" && L.facts.b.line === "No" && L.facts.c.line === undefined, "the server gives a yes or no its word (Yes, No) and leaves a text answer alone");
const SRC = fs.readFileSync("lib/preview/deskV4Client.js", "utf8");
for (const [label, from, to, on, expectBad] of [
  ["a Contact line with nothing to say", "if (ct.length) {", "if (true) {", NONE, r => r.hasContact],
  ["a state the case does not carry", 'lf.state && lf.state.value]', '(lf.state && lf.state.value) || "XX"]', PART, r => r.unsent.length > 0 || r.loc.length > 1],
  ["a row with nothing to say", 'lf.value : "")); if (!t) return;', 'lf.value : "")); lf = lf || { value: "Unknown" }; t = t || "Unknown";', PART, r => r.rows.length > 0],
  ["a yes or no turned into a word by the page", '(lf.line || (typeof lf.value === "string" ? lf.value : ""))', '(lf.line || (lf.value === true ? "Yes" : lf.value === false ? "No" : typeof lf.value === "string" ? lf.value : ""))', BOOL, r => r.rows.some(x => x.startsWith("mileageOriginal"))],
  ["a Location line with nothing to say", "if (lc.length) {", "if (true) {", NONE, r => r.hasLoc]]) {
  ok(SRC.includes(from), "the mutant applies: " + label); const r = await run(on, { html: h => h.replace(from, to) }); ok(expectBad(r), "mutant caught: " + label); }
await b.close();
done("deskV4SellerFactsCheck");
