// Local screenshots of the eBay demo (views a, b, c) at 1440 and 390 with stubbed engine answers in the current shape (no network). PNGs go to proofs/partner-demo/.
import fs from "node:fs";
import { MC } from "./e98Fixtures.mjs";
import { startBrowser } from "./e98Render.mjs";
import { pageHtml, DUMMY } from "../api/partnerDemo.js";
import { partnerShape } from "../api/partnerAnswer.js";
const RANGE = { status: "one_box", ...MC["2001 BMW M3 (alike with options)"].d };
const RC = { year: 2025, make: "Porsche", model: "911", nameModel: "911", canonicalLabel: "2025 Porsche 911 (992)" };
const TRIM_Q = { status: "one_box", tier: "trim_choice", askIndex: 2, resolvedCar: RC, prompt: "Which 911?", trimOptions: [{ label: "Carrera", value: "carrera", n: 14 }, { label: "Carrera S", value: "carrera s", n: 9 }], trimChips: ["Carrera (14)", "Carrera S (9)"], optionCounts: [14, 9] };
const out = "proofs/partner-demo/"; fs.mkdirSync(out, { recursive: true });
const browser = await startBrowser();
async function shot(name, view, car, width, answers, act) {
  const p = await browser.newPage(); await p.setViewport({ width, height: 900 }); let n = 0; const html = pageHtml(view, car);
  await p.setRequestInterception(true);
  p.on("request", r => { const u = new URL(r.url());
    if (u.host === "goasksam.com" && r.isNavigationRequest()) return r.respond({ status: 200, contentType: "text/html", body: html });
    if (u.pathname === "/api/partnerAnswer" && r.method() === "POST") { let b = {}; try { b = JSON.parse(r.postData() || "{}"); } catch {} return r.respond({ status: 200, contentType: "application/json", body: JSON.stringify({ ...partnerShape(answers[Math.min(n++, answers.length - 1)], b.q || car, Number(b.asked) || 0, {}), updated: null }) }); }
    return r.respond({ status: 204, body: "" }); });
  await p.goto("https://goasksam.com/preview?view=" + view + "&car=" + encodeURIComponent(car), { waitUntil: "networkidle2" }).catch(() => {});
  await new Promise(r => setTimeout(r, 600)); if (act) await act(p);
  await p.screenshot({ path: out + name + "-" + width + ".png", fullPage: true }); await p.close();
}
const clickFirst = sel => async p => { await p.click(sel); await new Promise(r => setTimeout(r, 900)); };
const reserve = async p => { await p.evaluate(() => { const i = document.getElementById("b-res"); i.value = "30000"; i.dispatchEvent(new Event("input", { bubbles: true })); }); await new Promise(r => setTimeout(r, 300)); };
for (const w of [1440, 390]) {
  await shot("a1-2025-911-trim-question", "a", "2025 Porsche 911", w, [TRIM_Q, RANGE]);
  await shot("a2-2025-911-after-trim-chip", "a", "2025 Porsche 911", w, [TRIM_Q, RANGE], clickFirst("#a-out button.opt"));
  await shot("b-2025-911-reserve-30000", "b", "2025 Porsche 911", w, [RANGE], reserve);
  await shot("c-2014-gt3-listing", "c", DUMMY.q, w, [RANGE]);
}
await browser.close();
