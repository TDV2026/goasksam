// COPY INVENTORY (Lane E, Nov 1 2026): for each public page, the static words it serves, split into those that come from data/copy.json and those still in page code.
// Served text only: <title>, meta description, visible text nodes, placeholder, aria-label and button labels of the page as rendered (signed out). Engine words never appear on these first screens.
//   node scripts/copyInventory.mjs [--list]   (--list prints the strings still in code)
import fs from "node:fs";
import path from "node:path";
import { renderAll } from "./copyRender.mjs";
import { copyData } from "../lib/copy.js";
const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const flat = []; const walk = v => { if (typeof v === "string") flat.push(v); else if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === "object") Object.values(v).forEach(walk); }; walk(copyData());
const decode = s => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&middot;/g, "·").replace(/&copy;/g, "©");
const inCopy = t => flat.some(c => c.trim().length > 1 && (t === c.trim() || t.includes(c.trim()) || c.includes(t)));
const pages = await renderAll(false); const rows = [], list = {};
for (const [name, html0] of Object.entries(pages)) {
  const html = html0.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<style[\s\S]*?<\/style>/g, "").replace(/<svg[\s\S]*?<\/svg>/g, "");
  const strs = new Set();
  for (const m of html.matchAll(/<title>([^<]*)<\/title>/g)) strs.add(decode(m[1]).trim());
  for (const m of html.matchAll(/<meta name="description" content="([^"]*)"/g)) strs.add(decode(m[1]).trim());
  for (const m of html.matchAll(/(?:placeholder|aria-label)="([^"]{3,})"/g)) strs.add(decode(m[1]).trim());
  for (const m of html.matchAll(/>([^<>]{3,})</g)) { const t = decode(m[1]).replace(/\s+/g, " ").trim(); if (t.length >= 3 && /[A-Za-z]/.test(t)) strs.add(t); }
  const all = [...strs], mine = all.filter(inCopy), rest = all.filter(t => !inCopy(t));
  rows.push([name, all.length, mine.length, rest.length]); list[name] = rest;
}
const pad = (s, n) => String(s).padEnd(n);
console.log(pad("page", 18) + pad("served strings", 16) + pad("in copy.json", 14) + "still in code");
for (const r of rows) console.log(pad(r[0], 18) + pad(r[1], 16) + pad(r[2], 14) + r[3]);
console.log("total".padEnd(18) + pad(rows.reduce((a, r) => a + r[1], 0), 16) + pad(rows.reduce((a, r) => a + r[2], 0), 14) + rows.reduce((a, r) => a + r[3], 0));
if (process.argv.includes("--list")) for (const [n, l] of Object.entries(list)) { console.log("\n== " + n); l.slice(0, 60).forEach(x => console.log("  " + x.slice(0, 110))); }
