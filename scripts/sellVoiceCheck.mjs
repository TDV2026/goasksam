// No first-person Sam on /sell (Oct 20 2026, Sam's rule via Lane F: "No first-person Sam anywhere on /sell"). Reads
// every string and template literal in the files that render /sell (plain /sell's public/js and index.html, the
// /sell?car= new Sell's lib/sell/*, the server-rendered hero api/sellPage.js) and fails on any I, I'd, I'll, I'm, I've,
// my, me, mine or myself that is not on the allowlist below. Each allowed phrase is named with why it stays: the
// visitor's own words (chips, buttons, typed questions) or quoted bans inside a chat prompt. Sam answered the three
// held lines (docs/sell-first-person-inventory.md A1 to A3) on Oct 20 2026, so none is held any more.
// A small tokenizer, not a parser: comments, regex literals and ${} expressions are code. No network.
// It also fails on "our records" or "our data" (and "our own sales data", "our archive"), Sam's rule of the same day.
//   node scripts/sellVoiceCheck.mjs
// Run by scripts/prePush.mjs.
import fs from "node:fs";
// Every string and template literal in a JS file, with its start line. A small tokenizer: comments, regex literals,
// and ${...} expressions read by the same code scanner (so a comment or regex inside one is handled), so a
// multi-line template is one literal and nothing inside code is mistaken for text.
function literals(src) {
  const out = []; let i = 0, line = 1; const n = src.length;
  function readStr(q) { const start = line; let s = ""; i++; while (i < n && src[i] !== q) { if (src[i] === "\\") { s += src[i] + (src[i + 1] || ""); if (src[i + 1] === "\n") line++; i += 2; continue; } if (src[i] === "\n") line++; s += src[i++]; } i++; out.push({ line: start, text: s }); }
  function readTpl() { const start = line; let s = ""; i++; while (i < n && src[i] !== "`") { if (src[i] === "\\") { s += src[i] + (src[i + 1] || ""); i += 2; continue; } if (src[i] === "$" && src[i + 1] === "{") { s += "X"; i += 2; scan(true); continue; } if (src[i] === "\n") line++; s += src[i++]; } i++; out.push({ line: start, text: s }); }
  // scan(inExpr): code until EOF, or until the brace closing a ${ when inExpr.
  function scan(inExpr) {
    let depth = 0, prevSig = "";
    const regexOk = () => prevSig === "" || /[(,=:\[!&|?{};+\-*%<>~^]$/.test(prevSig) || /\b(return|typeof|case|in|of|void|delete|throw|new|else)$/.test(prevSig);
    while (i < n) {
      const c = src[i], d = src[i + 1];
      if (c === "\n") { line++; i++; continue; }
      if (c === "/" && d === "/") { while (i < n && src[i] !== "\n") i++; continue; }
      if (c === "/" && d === "*") { i += 2; while (i < n && !(src[i] === "*" && src[i + 1] === "/")) { if (src[i] === "\n") line++; i++; } i += 2; continue; }
      if (c === "'" || c === '"') { readStr(c); prevSig = "s"; continue; }
      if (c === "`") { readTpl(); prevSig = "s"; continue; }
      if (c === "/" && regexOk()) { i++; let cls = false; while (i < n && (src[i] !== "/" || cls) && src[i] !== "\n") { if (src[i] === "\\") { i += 2; continue; } if (src[i] === "[") cls = true; else if (src[i] === "]") cls = false; i++; } i++; while (/[a-z]/i.test(src[i] || "")) i++; prevSig = "r"; continue; }
      if (inExpr) { if (c === "{") depth++; else if (c === "}") { if (depth === 0) { i++; return; } depth--; } }
      if (!/\s/.test(c)) prevSig = (prevSig + c).slice(-12);
      i++;
    }
  }
  scan(false);
  return out;
}

const FILES = ["public/js/result-v2.js", "public/js/result-copy.js", "public/js/result.js", "public/js/steps.js", "public/js/entry.js", "public/js/pipeline.js", "public/js/wizard.js", "public/js/chat-core.js", "public/js/homepage.js", "public/index.html", "lib/sell/sellChat.js", "lib/sell/sellFlow.js", "lib/sell/sellMcClient.js", "lib/sell/sellClient.js", "lib/sell/sellFacts.js", "lib/sell/sellFollow.js", "lib/sell/sellLanding.js", "lib/sell/sellExample.js", "lib/sell/sellPartner.js", "api/sellPage.js", "api/sellNext.js", "api/sellChat.js"];
const ALLOW = [
  // the visitor speaking (chips, buttons, the typed question a prompt quotes)
  ["visitor", "Sell my car"], ["visitor", "Sell my vehicle"], ["visitor", "Set my price"], ["visitor", "Run my analysis"], ["visitor", "Show me weekend cars"],
  ["visitor", "I'll manage it myself"], ["visitor", "I'll sell it myself"], ["visitor", "selling it myself"], ["visitor", "I'd like someone to handle everything"], ["visitor", "I'd like someone to handle it"],
  ["visitor", "I'm not sure yet"], ["visitor", "How I'll sell it"], ["visitor", "How I'll sell"], ["visitor", "I'd like it to go through an auction house"], ["visitor", "Send my details to"],
  ["visitor", "/myself|my own|diy/i"], ["visitor", "take my time"],
  ["visitor", "What is my car worth"], ["visitor", "value my car"], ["visitor", "do they work in my region?"], ["visitor", "where should I sell"],
  // quoted bans inside a chat prompt (the model is told never to say them)
  ["ban", "I wish I could"], ["ban", "I don't have that data"], ["ban", "I don't have the data"], ["ban", "I want to be straight"], ["ban", "I need to be honest"],
  ["ban", 'never "I", "we" or "our"'], ["ban", 'never "I", "me" or "my"'], ["ban", 'never "I", "me", "my"'], ["ban", "if this were my car"],
  
];
// Longest first, so a long allowed phrase is matched whole before a shorter phrase inside it.
const BY_LENGTH = [...ALLOW].sort((x, y) => y[1].length - x[1].length);
const OUR = /\bour (own )?(records?|data|sold-records|tracked records|sales data|archive)\b/gi;
// Sam, Oct 20 2026: "company 'we' only, never first-person Sam". Sam's own voice never says we, us or our; the company
// may, where a sentence needs a subject. Each company line kept is named here. The chat prompts and the model-facing
// context notes are instructions to the model, not page copy, so they are not read for "we".
const WE = /(^|[^A-Za-z'’\/_-])(we|We|we've|We've|we're|We're|we'll|We'll|us|our|Our)(?=[^A-Za-z'’_-]|$)/g;
const COMPANY = [
  "We're submitting your", "It helps us send the strongest possible submission", "We have commercial arrangements with some of the PowerSellers we work with",
  "Our PowerSellers are US-based today, and we're careful about who we add", "our PowerSellers focus on higher-value cars", "email us at feedback@goasksam.com",
];
const MODEL_FACING = t => /You are Sam|NEVER say|Hold this position|VIN note \(|VIN exact-match note|seller pasted a VIN/.test(t);
const FP = /(^|[^A-Za-z'’\\])(I|I'd|I’d|I'm|I’m|I've|I’ve|I'll|I’ll|my|My|me|Me|mine|myself)(?=[^A-Za-z'’]|$)/g;
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL", m); } };
const used = new Set();
function checkText(f, line, raw) {
  const t = raw.replace(/\\'/g, "'"); if (!(t.length > 3 && /\s/.test(t))) return;
  // Blank out every allowed phrase, then nothing first-person may remain.
  let rest = t;
  for (const [why, p] of BY_LENGTH) if (rest.includes(p)) { used.add(p); rest = rest.split(p).join(" ".repeat(p.length)); }
  // homepage.js is group D of Lane E's sweep, Lane C's to change; it joins this rule once that push lands.
  if (!MODEL_FACING(t) && !/homepage\.js$/.test(f)) { let r2 = t; for (const p of COMPANY) { if (r2.includes(p)) used.add(p); r2 = r2.split(p).join(" ".repeat(p.length)); }
    for (const m of r2.matchAll(WE)) ok(false, `${f}:${line} "we/us/our" outside a named company line: "${t.slice(Math.max(0, m.index - 50), m.index + 60).replace(/\s+/g, " ")}"`); }
  // Sam, Oct 20 2026: no "our records" or "our data" anywhere public (the quoted ban in a prompt is the only one).
  for (const m of t.split('never "our records" or "our data"').join(" ").matchAll(OUR)) ok(false, `${f}:${line} possessive record line: "${t.slice(Math.max(0, m.index - 50), m.index + 60).replace(/\s+/g, " ")}"`);
  for (const m of rest.matchAll(FP)) ok(false, `${f}:${line} first-person Sam: "${t.slice(Math.max(0, m.index - 50), m.index + 60).replace(/\s+/g, " ")}"`);
}
for (const f of FILES) {
  if (!fs.existsSync(f)) continue;
  let src = fs.readFileSync(f, "utf8");
  if (f.endsWith(".html")) {
    // index.html: its inline scripts as code, its markup text as text.
    for (const m of src.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)) for (const x of literals(m[1])) checkText(f, x.line, x.text);
    const text = src.replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<[^>]+>/g, " ");
    checkText(f, 0, text.replace(/\s+/g, " "));
    continue;
  }
  for (const x of literals(src)) checkText(f, x.line, x.text);
  pass++;
}
// A stale allowlist entry is a fail too: every allowed phrase must still be on the page (so the list cannot rot).
for (const p of COMPANY) ok(used.has(p), `company line no longer found: "${p}"`);
for (const [why, p] of ALLOW) ok(used.has(p), `allowlist entry no longer found (${why}): "${p}"`);
// The rule itself must be in both old chat prompts.
ok(/You always speak about Sam in the third person/.test(fs.readFileSync("public/js/wizard.js", "utf8")), "wizard.js SELL_SYS carries the third-person rule");
ok(/You always speak about Sam in the third person/.test(fs.readFileSync("public/js/chat-core.js", "utf8")), "chat-core.js SYS carries the third-person rule");
console.log(`sellVoiceCheck: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
