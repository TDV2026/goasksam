// The sign-in card never writes a URL value into HTML (Oct 21 2026, Lane D, docs/lane-security.md F-29). auth.js is
// served by a local HTTP server on a blank page in topbar mode (as on Market Check, Buy, Tasks, history and spec, where
// chat-core.js's escapeHtml does not exist), in headless Chrome. Proves: a normal ?email= still prefills the field and
// is scrubbed from the address bar; ?email="><img onerror=...> makes no element, runs no script and is dropped;
// authEsc escapes & < > " ' on its own; the code screen and the top bar show a crafted email as text; the analytics
// ids no longer use Math.random. Offline: nothing leaves the machine.
//   node scripts/authPrefillCheck.mjs
// Run by scripts/prePush.mjs.
import http from "node:http";
import fs from "node:fs";
import puppeteer from "puppeteer-core";
const CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL", m); } };
if (!fs.existsSync(CHROME)) { console.log("authPrefillCheck: SKIP, no Chrome at " + CHROME); process.exit(0); }
const AUTH = fs.readFileSync("public/js/auth.js", "utf8");
const PAGE = `<!doctype html><html><head><meta charset="utf-8"><script>
  window.GAS_AUTH_MODE = "topbar"; window.gasFunnel = () => {}; window.gasFunnelOnce = () => {}; window.gasTrack = () => {};
  window.fetch = async () => new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
</script></head><body><div id="signin-area"></div><script src="/auth.js"></script></body></html>`;
const server = http.createServer((req, res) => {
  if (req.url.startsWith("/auth.js")) { res.writeHead(200, { "content-type": "text/javascript" }); return res.end(AUTH); }
  res.writeHead(200, { "content-type": "text/html" }); res.end(PAGE);
}).listen(0);
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
const page = await browser.newPage();
const errs = []; page.on("pageerror", e => errs.push(String(e.message || e)));
const open = async q => { await page.goto(base + "/tasks" + q, { waitUntil: "load" }); await page.evaluate(() => { window.__pwned = 0; openSignInCard(); }); };
try {
  await open("?signin=1&email=seller%40example.com");
  const a = await page.evaluate(() => ({ v: document.getElementById("auth-email").value, url: location.href }));
  ok(a.v === "seller@example.com", `a normal ?email= prefills the field (${a.v})`);
  ok(!/email=/.test(a.url), `?email= is scrubbed from the address bar (${a.url})`);
  const attack = encodeURIComponent('"><img src=x onerror="window.__pwned=1">');
  await open("?signin=1&email=" + attack);
  await new Promise(r => setTimeout(r, 300));
  const b = await page.evaluate(() => ({ img: document.querySelectorAll("#auth-modal img").length, pwned: window.__pwned, v: document.getElementById("auth-email").value, attrs: document.getElementById("auth-email").getAttributeNames() }));
  ok(b.img === 0 && b.pwned === 0, `?email="><img onerror> makes no element and runs nothing (${JSON.stringify(b)})`);
  ok(b.v === "" && !b.attrs.includes("value"), "a non-email prefill is dropped, and the field has no value attribute");
  const e = await page.evaluate(() => authEsc(`&<>"'`));
  ok(e === "&amp;&lt;&gt;&quot;&#39;", `authEsc escapes all five on its own (${e})`);
  const c = await page.evaluate(() => { window.__p2 = 0; authRenderCheckEmail('"><img src=x onerror="window.__p2=1">'); return { img: document.querySelectorAll("#auth-modal img").length, txt: document.querySelector("#auth-modal strong").textContent }; });
  await new Promise(r => setTimeout(r, 200));
  ok(c.img === 0 && (await page.evaluate(() => window.__p2)) === 0 && c.txt === '"><img src=x onerror="window.__p2=1">', "the code screen shows a crafted email as text");
  const t = await page.evaluate(() => { window.__p3 = 0; localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify({ access_token: "t", email: '<img src=x onerror="window.__p3=1">' })); authRenderTopbar(); const el = document.querySelector("#signin-area .hp-account-email"); return { img: document.querySelectorAll("#signin-area img").length, txt: el && el.textContent, title: el && el.title }; });
  await new Promise(r => setTimeout(r, 200));
  ok(t.img === 0 && (await page.evaluate(() => window.__p3)) === 0 && t.txt === '<img src=x onerror="window.__p3=1">' && t.title === t.txt, "the top bar shows a crafted email as text");
  const ids = await page.evaluate(() => { const real = Math.random; Math.random = () => { throw new Error("Math.random used"); }; try { localStorage.removeItem("gas_anon"); return { anon: gasAnonId(), uuid: gasUuid() }; } catch (x) { return { err: String(x.message) }; } finally { Math.random = real; } });
  ok(!ids.err && /^a_[0-9a-z]+$/.test(ids.anon) && /^[0-9a-f-]{36}$/.test(ids.uuid), `the analytics ids come from crypto, never Math.random (${JSON.stringify(ids)})`);
  ok(errs.length === 0, `no page errors (${errs.slice(0, 2).join(" | ")})`);
} finally { await browser.close(); server.close(); }
console.log(`authPrefillCheck: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
