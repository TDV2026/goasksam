// Screenshots of the New case panel and the queue into docs/go-live-shots/desk-*.png (Lane S). Offline, the same harness as the checks; a decode answer is the stub's.
//   node scripts/deskV4Shots.mjs
import fs from "node:fs"; import path from "node:path"; import os from "node:os";
import { launch, openLive, V3, V4, PV } from "./deskV4Harness.mjs";
import { seedIntake } from "./deskV4Harness.mjs";
const OUT = "docs/go-live-shots", wait = ms => new Promise(r => setTimeout(r, ms)); fs.mkdirSync(OUT, { recursive: true });
const b = await launch(), dir = fs.mkdtempSync(path.join(os.tmpdir(), "v4shot-"));
const f = v => ({ value: v, source: "vin_decoded", verified: false }), opt = (v, n) => ({ value: v, label: v, count: n });
const stub = async bd => { if (bd.action === "case_decode") return bd.vin ? { ok: true, vin: bd.vin, decoded: { year: f(1999), make: f("Porsche"), model: f("911"), trim: f("Carrera"), body: f("Coupe"), transmission: f("Manual") } } : { ok: true, title: "1965 Ford Mustang Fastback", decoded: { year: f(1965), make: f("Ford"), model: f("Mustang"), trim: f("Fastback") } }; if (bd.action === "case_pickers") return { ok: true, body: [opt("Coupe", 9), opt("Convertible", 4)], trim: [opt("Carrera", 7)], transmission: [opt("Manual", 8), opt("Automatic", 5)], colour: [opt("Guards Red", 2), opt("Arctic Silver", 3)] }; };
const jpg = async (p, name, hue) => { const d = await p.evaluate(h => { const c = document.createElement("canvas"); c.width = 240; c.height = 160; const x = c.getContext("2d"), g = x.createLinearGradient(0, 0, 240, 160); g.addColorStop(0, `hsl(${h},35%,38%)`); g.addColorStop(1, `hsl(${h + 30},30%,70%)`); x.fillStyle = g; x.fillRect(0, 0, 240, 160); return c.toDataURL("image/jpeg", .85).split(",")[1]; }, hue); const fp = path.join(dir, name); fs.writeFileSync(fp, Buffer.from(d, "base64")); return fp; };
const open = async () => { const p = await openLive(b, { w: 1440, h: 1100, intercept: stub }); await p.evaluate(() => document.getElementById("newcase-btn").click()); await wait(250); return p; };
const shot = async (p, n) => { await p.screenshot({ path: path.join(OUT, n) }); console.log(n); };
{ const p = await open(); await shot(p, "desk-newcase-empty.png");
  await p.type("#nc-start", "WP0AA2995XS626785"); await p.click("#nc-startbtn"); await wait(700); await shot(p, "desk-newcase-vin.png");
  const A = await jpg(p, "front.jpg", 20), B2 = await jpg(p, "rear.jpg", 140), C = await jpg(p, "side.jpg", 220);
  await p.type("#nc-mileage", "72,000"); await p.type("#nc-asking", "58,000"); await p.type("#nc-seller", "Hal Moreau"); await (await p.$("#nc-photos")).uploadFile(A, B2, C); await wait(300); await shot(p, "desk-newcase-photos.png"); await p.close(); }
{ const p = await open(); await p.type("#nc-start", "1965 mustang fastback"); await p.click("#nc-startbtn"); await wait(700); await shot(p, "desk-newcase-words.png"); await p.close(); }
{ await seedIntake(); const m = await V3.deskModel({ query: { case: V3.DEMO_ID } }); m.cases.filter(c => c.id !== V3.DEMO_ID).slice(0, 2).forEach(c => { c.archived = true; });
  const html = V4.pageHtml(m); const p = await openLive(b, { w: 1440, h: 900, mutate: () => html });
  await p.evaluate(() => { const r = document.querySelector("#queue .qi:not(.on)"); const q = r.querySelector(".qn"); q.textContent = "1999 Porsche 911 Carrera Cabriolet Tiptronic With A Very Long Name"; q.title = q.textContent; }); await p.click("#qarchh"); await p.hover("#queue .qi:not(.on)"); await wait(200); await p.screenshot({ path: path.join(OUT, "desk-queue.png"), clip: { x: 0, y: 0, width: 420, height: 900 } }); console.log("desk-queue.png"); await p.close(); }
{ // the third run: the right panel's tabs at three widths, the price axis, the cover action
  for (const [w, h, tab, n] of [[1440, 900, "why", "desk-panel-1440.png"], [1280, 800, "needs", "desk-panel-1280-needs.png"], [1024, 768, "rmode", "desk-panel-1024.png"]]) { const p = await openLive(b, { w, h }); await p.evaluate(t => window.__v4tab(t), tab); await wait(250); await shot(p, n); await p.close(); }
  { const p = await openLive(b, { w: 1440, h: 900 }); await wait(300); const r = await p.evaluate(() => { const e = document.getElementById("s-market").getBoundingClientRect(); return { x: e.left, y: e.top + scrollY, w: e.width, h: e.height }; }); await p.screenshot({ path: path.join(OUT, "desk-axis.png"), clip: { x: r.x, y: r.y, width: r.w, height: r.h }, captureBeyondViewport: true }); console.log("desk-axis.png");
    const c = await p.evaluate(() => { const e = document.getElementById("s-car").getBoundingClientRect(); return { x: e.left, y: e.top + scrollY, w: e.width, h: e.height }; }); await p.hover('#thumbs [data-photo="ph_3"]'); await wait(200); await p.screenshot({ path: path.join(OUT, "desk-cover.png"), clip: { x: c.x, y: c.y, width: c.w, height: c.h }, captureBeyondViewport: true }); console.log("desk-cover.png"); await p.close(); } }
await b.close(); fs.rmSync(dir, { recursive: true, force: true });
