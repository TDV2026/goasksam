// DESK V4, SAM'S FOURTH RUN (Lane S, Nov 13 2026), against Lane D's d6996122 shapes. Six things, each with a mutant:
//   1 THE UNOPENED LEAD: case.claim { line, button } prints in the case header as the server sent it; until the button is pressed every card and the Reserve panel are locked and no refusal prints; the click sends case_get { open: true } and the page then shows the claimed case, unlocked.
//   2 THE DOT HINT: "Dot marks the suggestion" prints only when the engine marked a condition (condition.suggested), otherwise it is absent.
//   3 CONDITION IN THE MARKET HEADER: beside the period switch, in the same button style; the right panel keeps the figure, its lines, the checks and the tabs and no condition.
//   4 FOR SALE NOW above Closest sales, as photo cards (photo, title, venue, bid, time left, the engine's vs-range line, each opening its listing); "Listed now" is the same card.
//   5 THE PERIOD SWITCH prints desk.windows as sent and nothing else (no 24 months button when the server did not send it); the page carries no list of its own.
//   6 THE LIVE LINE under the figure (case.reserve.liveLine) and the NOTE under the start (case.reserve.start.note), each as sent, absent when not sent.
//   node scripts/deskV4FourthRunCheck.mjs
import fs from "node:fs"; import path from "node:path";
import { launch, openLive, tally, seedIntake, imp, ROOT, V3, V4, PV } from "./deskV4Harness.mjs";
const { ok, done } = tally(), wait = ms => new Promise(r => setTimeout(r, ms)), b = await launch();
const { liveOf } = await imp("lib/deskV3.js"), { reasonLine } = await imp("lib/reasonWords.js");
const base = await V4.renderDeskV4({ query: { case: V3.DEMO_ID } });
const give = mut => h => { const m = /window\.__V4__=([\s\S]*?);window\.__DESK_V3__/.exec(h); const o = JSON.parse(m[1]); mut(o.kase, o); return h.replace(m[0], "window.__V4__=" + JSON.stringify(o).replace(/</g, "\\u003c") + ";window.__DESK_V3__"); };
const demo = async (mut, extra = {}) => openLive(b, { ...extra, mutate: h => { const x = mut ? give(mut)(h) : h; return extra.html ? extra.html(x) : x; } });
const txt = (p, s) => p.evaluate(q => { const e = document.querySelector(q); return e ? e.textContent : null; }, s);
const shown = (p, s) => p.evaluate(q => { const e = document.querySelector(q); return !!e && !e.hidden && e.offsetWidth > 0; }, s);
const SRC = fs.readFileSync(path.join(ROOT, "lib/preview/deskV4Client.js"), "utf8") + fs.readFileSync(path.join(ROOT, "lib/preview/deskV4.js"), "utf8");

{ // 1 THE UNOPENED LEAD, through the real handlers
  const ids = await seedIntake(), store = await PV.previewStore(), sh = await store.get(PV.PREVIEW_ORG.id, ids.fwd);
  await store.put(PV.PREVIEW_ORG.id, { ...sh, owner_seat: "Expert 9", opened_at: null, status: "New" });   // a lead forwarded by another seat and not yet opened
  const html = await V4.renderDeskV4({ query: { case: ids.fwd } }), claim = (/window\.__V4__=([\s\S]*?);window\.__DESK_V3__/.exec(html) && JSON.parse(/window\.__V4__=([\s\S]*?);window\.__DESK_V3__/.exec(html)[1]).kase.claim) || null;
  ok(!!claim && claim.line === reasonLine("case.claim.line") && claim.button === reasonLine("case.claim.button"), "the server sends case.claim with its line and its button for a lead this seat can pick up", JSON.stringify(claim));
  const p = await openLive(b, { id: ids.fwd });
  ok((await txt(p, "#openline")) === claim.line && (await txt(p, "#openbtn")) === claim.button, `the header prints the server's line and button as sent ("${claim && claim.button}")`);
  const lockedNow = await p.evaluate(() => ["s-car", "s-docs", "s-market", "s-closest", "val"].every(i => { const e = document.getElementById(i); return !e || e.hasAttribute("inert"); }));
  await p.click("#val .tabs button[data-tab=needs]").catch(() => {}); await p.evaluate(() => { const c = document.querySelector("#cond button"); if (c) c.click(); const v = document.getElementById("valIn"); if (v) v.focus(); }); await wait(300);
  const edits = p._posts.filter(x => /case_edit/.test(x.action)).length, msgs = await p.evaluate(() => [...document.querySelectorAll(".msg")].filter(e => !e.hidden && e.textContent).map(e => e.textContent));
  ok(lockedNow && edits === 0 && msgs.length === 0, "until it is pressed every card and the Reserve panel are locked, nothing is sent and no refusal line prints anywhere", JSON.stringify([lockedNow, edits, msgs]));
  // THE CLASS: no control inside any locked card or the panel does anything until the claim, whatever it is (every button, field and checkbox is tried with a real click)
  const hs = await p.$$("#s-car button, #s-car input, #s-docs button, #s-market button, #s-closest button, #s-considered button, #s-steps button, #val button, #val input, #val textarea"); let tried = 0; for (const h of hs.slice(0, 80)) { try { await h.click({ delay: 0 }); tried++; } catch { /* not clickable at all */ } }
  await wait(300); const sent = p._posts.filter(x => /case_(edit|reread|finalize|send)|sheet_/.test(String(x.action))).length, msgs2 = await p.evaluate(() => [...document.querySelectorAll(".msg")].filter(e => !e.hidden && e.textContent).map(e => e.textContent));
  ok(hs.length > 20 && sent === 0 && msgs2.length === 0, `every control in the locked cards and the panel (${hs.length} found) does nothing and prints nothing before the claim`, JSON.stringify([hs.length, tried, sent, msgs2]));
  p._posts.length = 0; await p.click("#openbtn"); await p.waitForFunction(() => !document.getElementById("openbar"), { timeout: 15000 }).catch(() => {});
  const opened = p._posts.filter(x => x.action === "case_get" && x.open === true).length, after = await p.evaluate(() => ({ bar: !!document.getElementById("openbar"), inert: ["s-car", "s-market", "val"].some(i => document.getElementById(i).hasAttribute("inert")), claim: window.__v4.K().claim }));
  ok(opened === 1 && !after.bar && !after.inert && !after.claim, "the click sends case_get with open true once; the claimed case shows without the bar and unlocked", JSON.stringify([opened, after]));
  const ok0 = await demo(null); ok(!(await shown(ok0, "#openbar")) && !(await ok0.evaluate(() => document.getElementById("val").hasAttribute("inert"))), "a case that is already open shows no bar and no lock");
  // mutants: no lock; the bar not printed
  await store.put(PV.PREVIEW_ORG.id, { ...(await store.get(PV.PREVIEW_ORG.id, ids.fwd)), owner_seat: "Expert 9", opened_at: null, status: "New" });
  const m1 = await openLive(b, { id: ids.fwd, mutate: h => h.replace('if (u) { e.setAttribute("inert", "");', "if (false) {") }); await m1.evaluate(() => { const c = document.querySelector("#cond button"); if (c) c.click(); }); await wait(500);
  ok(m1.evaluate && (await m1.evaluate(() => !document.getElementById("val").hasAttribute("inert"))), "mutant caught: a lead that is not locked");
  const m2 = await openLive(b, { id: ids.fwd, mutate: h => h.replace("var op = K.claim; if (op)", "var op = null; if (op)") }); ok(!(await shown(m2, "#openbar")), "mutant caught: no Open button on an unopened lead"); }

{ // 2 THE DOT HINT
  const sug = k => { k.condition = { ...(k.condition || {}), suggested: { tier: 2, name: "Good" } }; }, none = k => { k.condition = { ...(k.condition || {}), suggested: null }; };
  const a = await demo(sug), c = await demo(none);
  ok((await shown(a, "#condhint")) && (await txt(a, "#condhint")) === "Dot marks the suggestion" && (await a.evaluate(() => !!document.querySelector("#cond button.sug"))), "the engine marked a condition: the hint prints and the dot is on that button");
  ok(!(await shown(c, "#condhint")) && (await c.evaluate(() => !document.querySelector("#cond button.sug"))), "no condition marked: the hint is absent and there is no dot");
  const m = await demo(none, { html: h => h.replace('(hint) hint.hidden = sug == null;', "(hint) hint.hidden = false;") }); const m0 = await demo(none, { html: h => h.replace("hint.hidden = sug == null", "hint.hidden = false") }); ok(await shown(m0, "#condhint"), "mutant caught: the hint always printed"); }

{ // 3 CONDITION IN THE MARKET HEADER
  const p = await demo(null);
  const r = await p.evaluate(() => { const g = i => document.getElementById(i), R = e => e.getBoundingClientRect(), cs = e => getComputedStyle(e), c = g("cond"), pr = g("period"), cb = c && c.querySelector("button"), pb = pr && pr.querySelector("button"), head = document.querySelector("#s-market .sec-h"), val = g("val");
    return { inHead: !!c && !!head && head.contains(c) && head.contains(pr), inPanel: !!val.querySelector("#cond"), sameStyle: !!cb && !!pb && cs(cb).fontSize === cs(pb).fontSize && cs(cb).height === cs(pb).height && cs(cb).borderRadius === cs(pb).borderRadius && cs(c).borderRadius === cs(pr).borderRadius && cs(c).backgroundColor === cs(pr).backgroundColor, beside: !!c && Math.abs(R(c).top - R(pr).top) < 40,
      kept: ["valIn", "diff", "chk", "vtabs", "why", "bFin", "bPrev"].every(i => !!val.querySelector("#" + i)), n: c ? c.querySelectorAll("button").length : 0 }; });
  ok(r.inHead && r.beside && r.sameStyle && r.n >= 2, "Condition sits in the What the market paid header beside the period switch, in the same button style", JSON.stringify(r));
  ok(!r.inPanel && r.kept, "the right panel keeps the figure, its lines, the checks and the tabs, and no Condition", JSON.stringify(r));
  const mm = await demo(null, { html: h => h.replace("</body>", "<script>setTimeout(function(){var c=document.getElementById('cond');document.getElementById('tp-why').insertBefore(c,document.getElementById('tp-why').firstChild);},50)</script></body>") }); await wait(300);
  ok(await mm.evaluate(() => !!document.getElementById("val").querySelector("#cond")), "mutant caught: the condition left in the right panel"); }

{ // 4 FOR SALE NOW AS PHOTO CARDS, ABOVE CLOSEST SALES; LISTED NOW IS THE SAME CARD
  const rows = [{ listing_title: "1999 Porsche 911 Carrera Coupe", platform: "Bring a Trailer", current_bid_usd: 61000, end_time: new Date(Date.now() + 3 * 864e5).toISOString(), listing_url: "https://example.test/live/1", photo_url: "https://example.test/p1.jpg" }, { listing_title: "1998 Porsche 911 Carrera", platform: "Cars & Bids", current_bid_usd: 48000, end_time: new Date(Date.now() + 5 * 36e5).toISOString(), listing_url: "https://example.test/live/2", photo_url: null }];
  const live = liveOf(rows, new Date(), bid => bid > 55000 ? "above the range" : "inside the range");
  const p = await demo(k => { k.desk = { ...k.desk, live }; k.vehicle = { ...(k.vehicle || {}), ownLive: { line: "This car is live now", endsLine: "Ends in 3 days", listing: { title: "My own car", venue: "Bring a Trailer", url: "https://example.test/own", photo: "https://example.test/own.jpg", bidLine: "Current bid $70,000", vsRangeLine: "Above the range" } } }; });
  const r = await p.evaluate(() => { const g = i => document.getElementById(i), cards = [...document.querySelectorAll("#live .lvc")], pos = a => g(a).getBoundingClientRect().top, own = document.querySelector("#ownlive .lvc");
    const read = c => ({ href: c.href, img: (c.querySelector("img") || {}).src || null, none: !!c.querySelector(".ph.none"), title: (c.querySelector(".lt") || {}).textContent, venue: (c.querySelector(".lvn") || {}).textContent, bid: (c.querySelector(".lbid") || {}).textContent, left: (c.querySelector(".lleft") || {}).textContent, vs: (c.querySelector(".lvs") || {}).textContent, chip: (c.querySelector(".ownchip") || {}).textContent });
    return { above: pos("s-live") < pos("s-closest"), cards: cards.map(read), own: own ? read(own) : null, tags: cards.map(c => c.tagName).join() }; });
  ok(r.above, "For sale now sits above Closest sales");
  const [c1, c2] = r.cards;
  ok(r.cards.length === 2 && c1.href === live[0].url && c1.img === live[0].photo && c1.title.replace(/\s*↗$/, "") === live[0].title && c1.venue === live[0].platform && c1.bid === live[0].figureLine && c1.left === live[0].left && c1.vs === live[0].vsRangeLine && r.tags === "A,A", "each card is a link with the photo, title, venue, bid, time left and the engine's vs-range line, as sent", JSON.stringify(c1));
  ok(c2.none && !c2.img && c2.vs === live[1].vsRangeLine, "a listing with no photo shows a marked empty slot, not a text only row", JSON.stringify(c2));
  ok(r.own && r.own.chip === "Listed now" && r.own.img === "https://example.test/own.jpg" && r.own.title.replace(/\s*↗$/, "") === "My own car" && r.own.bid === "Current bid $70,000" && r.own.vs === "Above the range" && r.own.href === "https://example.test/own", "Listed now is the same card, with its photo and the engine's line", JSON.stringify(r.own));
  const m1 = await demo(k => { k.desk = { ...k.desk, live }; }, { html: h => h.replace('if (o.photo) ph.appendChild(el("img"', 'if (false) ph.appendChild(el("img"') }); ok(await m1.evaluate(() => !document.querySelector("#live .lvc img")), "mutant caught: the photo dropped");
  const m2 = await demo(k => { k.desk = { ...k.desk, live }; }, { html: h => h.replace('o.vs ? el("span", { class: "lvs"', 'false ? el("span", { class: "lvs"') }); ok(await m2.evaluate(() => !document.querySelector("#live .lvs")), "mutant caught: the vs-range line dropped"); }

{ // 5 THE PERIOD SWITCH FROM desk.windows
  const W = (...m) => k => { k.desk = { ...k.desk, windows: m.map(x => ({ months: x, label: reasonLine("desk4.window_label", { months: x }) })) }; };
  const btns = async (mut, extra) => { const p = await demo(mut, extra); return p.evaluate(() => [...document.querySelectorAll("#period button")].map(x => x.textContent + "=" + x.dataset.m)); };
  const three = await btns(W(3, 6, 12)), four = await btns(W(3, 6, 12, 24)), none = await btns(W());
  ok(three.join() === "3 months=3,6 months=6,12 months=12", "the switch prints the windows the case offers (3, 6, 12) and no 24 months button", three.join());
  ok(four.join() === "3 months=3,6 months=6,12 months=12,24 months=24", "24 months prints when the server sent it", four.join());
  ok(none.length === 0, "a case that offers no window prints no switch", none.join());
  const old = await btns(null); ok(old.join() === "6 months=6,12 months=12,24 months=24", "a case stored before desk.windows existed still offers the windows its stored answer holds (the switch does not vanish)", old.join());
  ok(!/\[6, "6 months"\]|\[24, "24 months"\]/.test(SRC), "the page carries no list of its own periods");
  const m = await btns(W(3, 6, 12), { html: h => h.replace(/"windows":\[[^\]]*\]\]/, '"windows":[]') }); const m2 = await demo(W(3, 6, 12), { html: h => h.replace('(desk().windows || [])', '[{ months: 24, label: "24 months" }].concat(desk().windows || [])') }); ok((await m2.evaluate(() => [...document.querySelectorAll("#period button")].map(x => x.dataset.m))).includes("24"), "mutant caught: a 24 months button the server did not send"); }

{ // 6 THE LIVE LINE UNDER THE FIGURE AND THE NOTE UNDER THE START
  const LIVE = "This car is at $20,000 now with 3 days left, above the recommended figure of $17,000.", NOTE = reasonLine("desk4.reserve_start_few", { name: "Good" });
  const p = await demo(k => { k.reserve = { ...k.reserve, liveLine: LIVE, start: { ...(k.reserve && k.reserve.start || {}), note: NOTE } }; });
  const r = await p.evaluate(() => { const g = i => document.getElementById(i), R = e => e.getBoundingClientRect(); return { live: g("ownLiveLine").hidden ? null : g("ownLiveLine").textContent, below: R(g("ownLiveLine")).top >= R(g("valIn")).bottom - 1, note: g("startNote") ? g("startNote").textContent : null, within: !!g("resStart").querySelector("#startNote") }; });
  ok(r.live === LIVE && r.below, "case.reserve.liveLine prints under the figure as sent", JSON.stringify(r));
  ok(r.note === NOTE && r.within, "the start note prints under the start as sent", JSON.stringify(r));
  const q = await demo(k => { k.reserve = { ...k.reserve, liveLine: null, start: { ...(k.reserve && k.reserve.start || {}), note: null } }; }); ok(!(await shown(q, "#ownLiveLine")) && !(await q.evaluate(() => !!document.getElementById("startNote"))), "no line and no note when the server sent none");
  const m1 = await demo(k => { k.reserve = { ...k.reserve, liveLine: LIVE }; }, { html: h => h.replace('ol.textContent = r.liveLine || "";', 'ol.textContent = "";') }); ok(!(await shown(m1, "#ownLiveLine")) || (await txt(m1, "#ownLiveLine")) === "", "mutant caught: the live line not printed");
  const m2 = await demo(k => { k.reserve = { ...k.reserve, start: { note: NOTE } }; }, { html: h => h.replace('if (r.start && r.start.note) st.appendChild', 'if (false) st.appendChild') }); ok(!(await m2.evaluate(() => !!document.getElementById("startNote"))), "mutant caught: the start note not printed"); }

await b.close(); done();
