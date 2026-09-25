import puppeteer from "puppeteer-core";
const CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const b = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
const p = await b.newPage();
await p.setCookie({ name: "gas_crew", value: "ok", domain: "goasksam.com", path: "/" });
await p.goto("https://goasksam.com/sell", { waitUntil: "networkidle2" });
const call = (body) => p.evaluate(async (x) => (await fetch("/api/sellerDecision",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(x)})).json(), body);
// save
const dsl = { filters:{ make:"Porsche", model:"911", descriptor:"air-cooled 911", channel:"house", window:"24mo" }, groupBy:["venue"], measures:["count","median"] };
const saved = await call({ desk:true, action:"save_view", name:"Air-cooled 911 houses (gate test)", question:"Which house...", dsl, summary:{total:141,rows:6} });
console.log("SAVE:", saved.status, "id:", saved.view && saved.view.id);
// list
const list = await call({ desk:true, action:"list_views" });
console.log("LIST:", list.status, "count:", (list.views||[]).length, "names:", (list.views||[]).slice(0,3).map(v=>v.name).join(" | "));
// rerun
const id = saved.view && saved.view.id;
const rr = await call({ desk:true, action:"rerun_view", id });
console.log("RERUN:", rr.status, "total:", rr.answer && rr.answer.total, "changed_since:", JSON.stringify(rr.changed_since));
// delete (cleanup)
const del = await call({ desk:true, action:"delete_view", id });
console.log("DELETE:", del.status);
await b.close();
