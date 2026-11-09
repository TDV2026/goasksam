// DESK V3 REPORT PREVIEW (Lane E, Nov 9 2026): Preview report opens Lane D's PDF in a pane on the case page, without leaving it, and the analyst's unsaved changes are kept (nothing is saved or reloaded to open it). The page asks the
// case's PDF action (case_pdf { id, draft: true }) and shows what it sends; a refusal is printed as the server worded it. node scripts/deskV3PreviewCheck.mjs
import { demoHtml, V3, launch, openPage, tally } from "./deskV3Harness.mjs";
const { ok, done } = tally(), html = await demoHtml();
const PDF = Buffer.from("%PDF-1.1\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF").toString("base64");
async function run(h, reply) { const br0 = { b: null }; try { return await run0(h, reply, br0); } catch (e) { try { await br0.b.close(); } catch {} return ["the page left or was torn down while previewing (" + String(e.message).slice(0, 60) + ")"]; } }
async function run0(h, reply, br0) {
  const bad = [], br = br0.b = await launch(), posts = [], p = await openPage(br, h, 1440, 900, { post: b => { posts.push(b); return b.action === "case_pdf" ? reply : { ok: true }; } });
  await p.evaluate(() => document.querySelector('[data-tab="decision"]').click()); await p.$eval("#in-aexp", e => { e.value = ""; }); await p.type("#in-aexp", "Unsaved words"); await p.$eval("#in-afigure", e => { e.value = ""; }); await p.type("#in-afigure", "59000");
  const url0 = await p.evaluate(() => location.href), navs = []; p.on("framenavigated", f => { if (f === p.mainFrame()) navs.push(f.url()); }); posts.length = 0;
  await p.click("#b-prev"); await new Promise(r => setTimeout(r, 500));
  const m = await p.evaluate(() => ({ url: location.href, exp: document.getElementById("in-aexp").value, fig: document.getElementById("in-afigure").value, open: !document.getElementById("pdfpane").hidden, src: (document.getElementById("pdff").getAttribute("src") || ""), msg: document.getElementById("dmsg").textContent, tab: document.getElementById("tab-decision").getAttribute("aria-selected") }));
  const pdfPost = posts.find(x => x.action === "case_pdf");
  if (!pdfPost || pdfPost.draft !== true || !pdfPost.id) bad.push("Preview did not ask case_pdf with draft true and the case id: " + JSON.stringify(posts));
  if (posts.some(x => x.action === "case_finalize" || (x.action === "case_edit" && !(x.op === "assessment" && Object.keys(x.patch || {}).join() === "figure")))) bad.push("Preview saved or finalized something: " + JSON.stringify(posts.map(x => x.op || x.action)));
  if (m.url !== url0 || navs.length) bad.push("Preview left or reloaded the case page (" + m.url + ")");
  if (m.exp !== "Unsaved words" || m.fig !== "59000") bad.push("the unsaved changes were lost (" + m.exp + ", " + m.fig + ")");
  if (reply.ok) { if (!m.open || !/^blob:/.test(m.src)) bad.push("the PDF pane did not open on the PDF (" + m.src + ")"); } else if (m.open || !m.msg) bad.push("a refusal should print its words and open no pane (" + m.msg + ")");
  if (m.tab !== "true") bad.push("the Decision tab was lost"); await br.close(); return bad;
}
{ const b = await run(html, { ok: true, pdf_b64: PDF }); for (const x of b) ok(false, x); ok(!b.length, "Preview report opens the PDF in a pane, on the same page, keeping the unsaved changes, saving nothing"); }
{ const b = await run(html, { ok: false, why: "The case has no report yet." }); for (const x of b) ok(false, x); ok(!b.length, "a refusal from the server is printed as worded and no pane opens"); }
for (const [n, fn] of [["Preview navigates to the PDF", h => h.replace('$("pdff").src=url;', 'location.href=url;')], ["Preview reloads the page", h => h.replace('$("pdff").src=url;', 'location.reload();')], ["Preview saves first", h => h.replace('say("Opening the report");post({action:"case_pdf"', 'say("Opening the report");post({action:"case_edit",id:C.active,op:"assessment",patch:{}});post({action:"case_pdf"')], ["the pane never opens", h => h.replace('$("pdfpane").hidden=false;', '')]]) ok((await run(fn(html), { ok: true, pdf_b64: PDF })).length > 0, "mutant caught: " + n);
done("deskV3PreviewCheck");
