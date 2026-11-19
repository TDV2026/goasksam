// credStorageCheck (Lane S's check, adopted by Lane D, Oct 28 2026): two halves of one class, "a credential is somewhere it can leak".
//  A. SENDERS: no script or workflow sends the probe key in a request body or an address; header only (x-ops-key / x-probe-key).
//  B. STORAGE: no .claude/*.json (settings, allow rules) holds a credential-shaped string.
// Prints file:line only, never a value.
//   node scripts/credStorageCheck.mjs                       REPO MODE (what prePush runs): only files git tracks in this repo. A local, untracked settings file, or one
//                                                           outside the repo, cannot fail another lane's run.
//   node scripts/credStorageCheck.mjs --full [claudeRoot]   FULL MODE (for sweeps): walks the whole working tree, untracked files included, and, when claudeRoot is given, every
//                                                           .claude json under it (the repo's worktrees, a user's local settings).
import fs from "node:fs"; import path from "node:path"; import { execSync } from "node:child_process";
const args = process.argv.slice(2), full = args.includes("--full"), rest = args.filter(a => !a.startsWith("--"));
const root = process.cwd(), claudeRoot = full && rest[0] ? rest[0] : null;
const hits = [];
const walk = (d, f) => { for (const n of fs.existsSync(d) ? fs.readdirSync(d) : []) { const p = path.join(d, n), s = fs.statSync(p); if (s.isDirectory()) { if (n !== "node_modules" && n !== ".git") walk(p, f); } else f(p); } };
// the files in scope: git's tracked files (repo mode) or every file on disk (full mode)
let tracked = null;
if (!full) { try { tracked = new Set(execSync("git ls-files", { cwd: root, encoding: "utf8", maxBuffer: 64e6 }).split("\n").filter(Boolean)); } catch { tracked = null; } }
const inScope = rel => (tracked ? tracked.has(rel.split(path.sep).join("/")) : true);
const SENDER = [/\bkey\s*:\s*(?:KEY|PROBE|PROBE_KEY|probeKey|process\.env\.(?:PROBE_KEY|OPS_KEY))\b/, /[?&](?:key|opskey|ops_key|probekey|probe_key)=\$\{/];
for (const dir of ["scripts", ".github"]) walk(path.join(root, dir), p => { const rel = path.relative(root, p);
  if (!/\.(m?js|yml|yaml)$/.test(p) || /(keyInAddressCheck|routeLimitCheck|credStorageCheck)/.test(p) || !inScope(rel)) return;
  fs.readFileSync(p, "utf8").split("\n").forEach((l, i) => { if (!/^\s*(\/\/|#)/.test(l) && SENDER.some(r => r.test(l))) hits.push(`sender  ${rel}:${i + 1}`); }); });
const CRED = /(eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}|\bocd\.[A-Za-z0-9_-]{20,}|sk-ant-[A-Za-z0-9_-]{20,}|\bre_[A-Za-z0-9]{24,}|[?&]tcode=[A-Za-z0-9_%.-]{4,}|[?&]code=[A-Za-z0-9_%.-]{6,})/;
const storage = (p, base) => { if (!/[\\/]\.claude[\\/].*\.json$/.test(p)) return; fs.readFileSync(p, "utf8").split("\n").forEach((l, i) => { if (CRED.test(l)) hits.push(`storage ${path.relative(base, p)}:${i + 1}`); }); };
walk(root, p => { if (inScope(path.relative(root, p))) storage(p, root); });
if (claudeRoot) walk(claudeRoot, p => storage(p, claudeRoot));
const mode = full ? "full" : "repo";
if (hits.length) { console.log(`FAIL credStorageCheck (${mode}): ${hits.length} place(s):\n  ` + hits.join("\n  ")); process.exit(1); }
console.log(`PASS credStorageCheck (${mode}): probe key only in headers; no credential-shaped string in .claude json`);
