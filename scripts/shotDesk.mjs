import puppeteer from "puppeteer-core";
const CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const q = process.argv[2] || "Which house has sold the most air-cooled 911s in the last two years, and what did they bring?";
const b = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
async function shot(w, file) {
  const p = await b.newPage();
  await p.setViewport({ width: w, height: 1200, deviceScaleFactor: 2 });
  await p.setCookie({ name: "gas_crew", value: "ok", domain: "goasksam.com", path: "/" });
  await p.goto("https://goasksam.com/desk", { waitUntil: "networkidle2" });
  await p.waitForSelector("#q", { timeout: 15000 });
  await p.evaluate((qq) => { document.getElementById("q").value = qq; document.getElementById("go").click(); }, q);
  await p.waitForFunction(() => { const o = document.getElementById("out"); return o && (o.querySelector("table.answer") || o.querySelector(".msg")); }, { timeout: 110000 });
  await new Promise(r => setTimeout(r, 1200));
  await p.screenshot({ path: file, fullPage: true });
  const txt = await p.evaluate(() => document.getElementById("out").innerText.slice(0, 400));
  console.log(file, "OK\n", txt.replace(/\n{2,}/g,"\n"));
  await p.close();
}
await shot(1200, "/tmp/desk_q1_desktop.png");
await shot(390, "/tmp/desk_q1_390.png");
await b.close();
