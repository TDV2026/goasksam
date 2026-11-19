// Before and after screenshots of every page at 1440 and 390 for a copy move (Lane E, Nov 1 2026): renders two directories of served HTML (scripts/copyRender.mjs) and compares the pictures.
//   node scripts/copyShots.mjs <beforeDir> <afterDir> <outDir>
import fs from "node:fs";
import path from "node:path";
import { startBrowser } from "./e98Render.mjs";
const [, , B, A, OUT] = process.argv; fs.mkdirSync(OUT, { recursive: true });
const browser = await startBrowser(); let same = 0, diff = 0; const bad = [];
async function shoot(file, width) {
  const p = await browser.newPage(); await p.setViewport({ width, height: 900 }); const html = fs.readFileSync(file, "utf8");
  await p.setRequestInterception(true); p.on("request", r => { const u = new URL(r.url()); if (u.host === "goasksam.com" && r.isNavigationRequest()) return r.respond({ status: 200, contentType: "text/html", body: html }); return r.respond({ status: 204, body: "" }); });
  await p.goto("https://goasksam.com/x", { waitUntil: "domcontentloaded" }).catch(() => {}); await new Promise(r => setTimeout(r, 500));
  const buf = await p.screenshot({ fullPage: true }); await p.close(); return buf;
}
for (const f of fs.readdirSync(B).filter(x => /\.html$/.test(x) && !/\.crew\./.test(x))) for (const w of [1440, 390]) {
  const b = await shoot(path.join(B, f), w), a = await shoot(path.join(A, f), w), name = f.replace(".html", "") + "-" + w;
  fs.writeFileSync(path.join(OUT, name + "-after.png"), a); if (Buffer.compare(a, b) === 0) same++; else { diff++; bad.push(name); fs.writeFileSync(path.join(OUT, name + "-before.png"), b); }
}
await browser.close(); console.log(`copyShots: ${same} identical, ${diff} differ${bad.length ? " (" + bad.join(", ") + ")" : ""}`); process.exit(diff ? 1 : 0);
