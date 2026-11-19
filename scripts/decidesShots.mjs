// How Sam decides, the "Where the numbers come from" section: PNG at 1440 and 390, and the underline rule read from computed styles.
//   node scripts/decidesShots.mjs   writes docs/screens/e98/decides-numbers-1440.png and -390.png
import { startBrowser, ROOT } from "./e98Render.mjs";
const { default: handler } = await import("../api/howSamDecides.js");
const res = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(c) { this.code = c; return this; }, send(b) { this.body = b; } };
await handler({ headers: {}, url: "/how-sam-decides", method: "GET" }, res);
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const b = await startBrowser();
for (const w of [1440, 390]) {
  const p = await b.newPage(); await p.setViewport({ width: w, height: 900, deviceScaleFactor: 1 });
  await p.setContent(res.body, { waitUntil: "domcontentloaded" });
  const r = await p.evaluate(() => {
    const h = [...document.querySelectorAll("h2.hd-headline")].find(x => x.textContent === "Where the numbers come from"); if (!h) return null;
    const sec = h.closest("section"), deco = el => { for (let e = el; e && e !== document.body; e = e.parentElement) { const d = getComputedStyle(e).textDecorationLine; if (d && d !== "none") return d; } return "none"; };
    const bb = sec.getBoundingClientRect();
    return { top: bb.top + scrollY, h: bb.height, links: sec.querySelectorAll("a").length, deco: [...sec.querySelectorAll("p,h2")].map(deco), fs: [...sec.querySelectorAll("p")].map(x => parseFloat(getComputedStyle(x).fontSize)), overflow: document.documentElement.scrollWidth > innerWidth };
  });
  ok(!!r, `section renders at ${w}`); if (!r) continue;
  ok(r.links === 0 && r.deco.every(d => d === "none"), `nothing in the section is a link or underlined at ${w}`);
  ok(r.fs.every(x => x >= 16), `body text is 16px or more at ${w}`);
  ok(!r.overflow, `no sideways scroll at ${w}`);
  await p.screenshot({ path: `${ROOT}/docs/screens/e98/decides-numbers-${w}.png`, clip: { x: 0, y: Math.max(0, r.top - 12), width: w, height: Math.min(r.h + 24, 1400) } });
  await p.close();
}
await b.close();
console.log(`decidesShots: ${pass} pass, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
