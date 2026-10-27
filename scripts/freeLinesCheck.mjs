// TWO FREE-TO-USE LINES (Sam, Oct 26 2026): the About page and the sign-in card each say, in bold, that Sam is free. The sign-in line names saving searches and setting
// Tasks only because both need an account (Tasks: api/tasks.js answers 401 needSignIn when signed out; a search is kept across visits and devices only for a signed-in
// account, lib/appShell.js RECENT_JS). No network.   node scripts/freeLinesCheck.mjs
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const ROOT = path.resolve(new URL("..", import.meta.url).pathname); process.chdir(ROOT);
const { default: h } = await import(pathToFileURL(path.join(ROOT, "api", "about.js")).href);
const body = await new Promise(resolve => { const res = { setHeader() {}, getHeader() {}, status() { return res; }, send(b) { resolve(String(b)); }, end() { resolve(""); } }; h({ method: "GET", url: "/about", headers: { host: "goasksam.com", cookie: "" }, query: {}, socket: {} }, res); });
const main = body.slice(body.indexOf("<main>"), body.indexOf("</main>"));
ok(/<h1 class="ab-h1">About GoAskSam<\/h1>\s*<p class="ab-free"[^>]*><b>Sam is free to use\. Built for the community, from The Daily Vroom\.<\/b><\/p>/.test(main), "About: the bold line sits right under the page heading");
ok((main.match(/Sam is free to use/g) || []).length === 1, "About: the line is there once");
ok(/<h2 class="ab-h2">What this is<\/h2>\s*<p data-lead-sentence>/.test(main), "About: the lead sentence is still the first line of 'What this is' (nothing else changed)");
const auth = fs.readFileSync("public/js/auth.js", "utf8");
const card = auth.slice(auth.indexOf("function openSignInCard"), auth.indexOf("function authMountTurnstile") > 0 ? auth.indexOf("async function authMountTurnstile") : undefined);
ok(/Email me a code<\/button>\s*<p class="auth-free"[^>]*><strong>Free to use\. Sign in to save searches and set Tasks\.<\/strong><\/p>/.test(card), "Sign-in card: the bold line sits under the sign-in buttons");
ok((card.match(/Free to use\./g) || []).length === 1, "Sign-in card: the line is there once");
const tasks = fs.readFileSync("api/tasks.js", "utf8");
ok(/if \(!user\) return res\.status\(401\)\.json\(\{ needSignIn: true \}\)/.test(tasks), "Tasks need an account: signed out, setting a Task answers 401 needSignIn (so the sign-in line may name Tasks)");
const shell = fs.readFileSync("lib/appShell.js", "utf8");
ok(/Signed in: the list is the account's, saved to the account/.test(shell) && /Signed out: only this tab's session/.test(shell), "Searches are kept across visits only for an account; signed out they last only this tab (so the sign-in line may name saving searches)");
ok(!/[–—]/.test("Sam is free to use. Built for the community, from The Daily Vroom. Free to use. Sign in to save searches and set Tasks."), "no dashes");
console.log(`freeLinesCheck: ${pass} pass, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
