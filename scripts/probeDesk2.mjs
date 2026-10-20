import puppeteer from "puppeteer-core";
// THE LIVE GUARD (Lane F's rule, Oct 20 2026): this script POSTs to PRODUCTION /api/sellerDecision (the full Sell path,
// which can spend OldCarsData on a cache miss). It refuses without --live and says what it would call; run it only in a
// gap the lanes name, with the protection-bypass header.
if (!process.argv.includes("--live")) { console.log("probeDesk2: REFUSED. This script POSTs to production /api/sellerDecision (the full Sell path). Run it only in a gap the lanes name, with --live."); process.exit(2); }
const CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const q = process.argv[2] || "Which house has sold the most air-cooled 911s in the last two years, and what did they bring?";
const b = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
const p = await b.newPage();
await p.setCookie({ name: "gas_crew", value: process.env.GAS_CREW_COOKIE || "", domain: "goasksam.com", path: "/" });
await p.goto("https://goasksam.com/sell", { waitUntil: "networkidle2" });
const j = await p.evaluate(async (qq) => (await fetch("/api/sellerDecision", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ desk: true, action: "run", question: qq }) })).json(), q);
console.log("status:", j.status, "| total:", j.answer && j.answer.total);
if (j.answer) for (const r of j.answer.rows) console.log("  ", String(r.group).padEnd(18), "n=" + r.count, "median=" + r.median, "online_share=" + (r.online_share != null ? Math.round(r.online_share * 100) + "%" : "-"), r.thin ? "THIN" : "");
console.log("READ:", j.read);
const cov = j.coverage || {};
console.log("sale_type_split:", JSON.stringify(cov.sale_type_split), "inferred:", cov.sale_type_inferred);
console.log("excluded_total:", cov.excluded_total, "by_reason:", JSON.stringify(cov.excluded_by_reason));
const exRecs = (j.receipts || []).filter(r => r.excluded);
console.log("excluded receipts shown:", exRecs.length, "| sample:", exRecs.slice(0, 3).map(r => r.venue + " $" + r.hammer_usd + " [" + r.excluded_reason + "]").join(" | "));
const sc = (j.receipts || []).filter(r => /\bSC\b/i.test(r.title || "")).slice(0, 1);
const c32 = (j.receipts || []).filter(r => /carrera 3\.2/i.test(r.title || "")).slice(0, 1);
console.log("G-body: SC=", sc.map(r => r.year + " " + (r.title || "").slice(0, 38)).join(""), "| Carrera3.2=", c32.map(r => r.year + " " + (r.title || "").slice(0, 38)).join(""));
console.log("sale_type badges:", (j.receipts || []).filter(r => r.sale_type).slice(0, 4).map(r => r.venue + ":" + r.sale_type.type + "(" + r.sale_type.source + ")").join(" | "));
await b.close();
