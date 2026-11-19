// THE CLASS BEHIND "usd in reportPdfV3": a Desk or PDF file formatting a figure of its own. Every dollar string comes from moneyWords and every count or mileage with its noun from countNoun (lib/reasonWords.js, lib/countNoun.js);
// a file that groups digits, builds "$" + n, joins a number to "miles" or rounds to a string by hand can print a figure two ways on two pages. node scripts/deskFormatCheck.mjs [rootDir]
import fs from "node:fs"; import path from "node:path";
const root = path.resolve(process.argv[2] || "."); let pass = 0, fail = 0; const ok = (n, c, d) => { if (c) pass++; else { fail++; console.log("FAIL " + n + (d ? "  " + d : "")); } };
const walk = d => fs.existsSync(d) ? fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? (e.name === "fonts" ? [] : walk(d + "/" + e.name)) : /\.js$/.test(e.name) ? [d + "/" + e.name] : []) : [];
const files = [...walk(path.join(root, "lib/desk")), ...walk(path.join(root, "lib/pdf"))].map(f => path.relative(root, f));
const strip = t => t.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map(l => l.replace(/(^|\s)\/\/.*$/, "")).join("\n");
const RULES = [
  ["groups digits by hand (toLocaleString)", /\.toLocaleString\(/],
  ["Intl.NumberFormat", /Intl\.NumberFormat/],
  ["builds a dollar string by hand", /["'`]\$["'`]\s*\+|`[^`]*\$\$\{|["']\$["']\s*\+/],
  ["builds a mileage string by hand", /\$\{[^}]*\}\s*miles\b|\+\s*["'`] ?miles\b|["'`]\s*mi["'`]\s*\+/],
  ["rounds to a display string with toFixed (a number rounded to a number, +(x).toFixed(n), is not display)", /(?<!\+\()(?<![+(]Number\()\.toFixed\((?![^)]*\)\))/]
];
const hits = [];
for (const f of files) { const t = strip(fs.readFileSync(path.join(root, f), "utf8")); for (const [why, re] of RULES) { if (why.startsWith("rounds")) { for (const m of t.matchAll(/[^\n]*\.toFixed\([^\n]*/g)) if (!/\+\s*\(|\+\(|Number\(/.test(m[0].slice(0, m[0].indexOf(".toFixed")).slice(-80)) && !/\+\(.*\)\.toFixed|\+[\w.]+\.toFixed/.test(m[0])) hits.push(f + ": " + why.split(" (")[0]); } else if (re.test(t)) hits.push(f + ": " + why); } }
ok(`no lib/desk or lib/pdf file formats a figure of its own (${files.length} files read)`, hits.length === 0, [...new Set(hits)].join(" | "));
// the one formatters exist and the PDF takes its dollars from them
const rw = fs.readFileSync(path.join(root, "lib/reasonWords.js"), "utf8"), v3 = fs.readFileSync(path.join(root, "lib/desk/reportPdfV3.js"), "utf8"), old = fs.readFileSync(path.join(root, "lib/desk/reportPdf.js"), "utf8");
ok("reasonWords exports moneyWords, the one dollar formatter", /export const moneyWords = money/.test(rw));
ok("reportPdfV3 defines no usd and takes every dollar string from moneyWords", !/\busd\b/.test(strip(v3)) && /import \{ moneyWords \} from "\.\.\/reasonWords\.js"/.test(v3) && /moneyWords\(/.test(v3));
ok("the old report's usd is a wrapper over moneyWords and its counts and mileages go through countNoun", /const usd = n => n == null \? "n\/a" : moneyWords\(n\)/.test(old) && /countNoun\(/.test(old) && !/\bnum\(/.test(strip(old)));
// the formatted text is the same everywhere
const { moneyWords } = await import("file://" + path.join(root, "lib/reasonWords.js")), { countNoun } = await import("file://" + path.join(root, "lib/countNoun.js"));
ok("the formatters agree with what the pages print: whole dollars, grouped; a count with its noun", moneyWords(34583.4) === "$34,583" && countNoun(61400, "mile", { words: false }) === "61,400 miles" && countNoun(1, "mile", { words: false }) === "1 mile");
console.log(`deskFormatCheck: ${pass} pass, ${fail} FAIL`); process.exit(fail ? 1 : 0);
