// REPO FILES FOR A CHECK THAT SWEEPS THE TREE (Lane C, Nov 18 2026). A check that walks the repo to find every file that says or does something must see the SAME files on every machine, so it never reads local
// build output or a tool's cache: .vercel/output (a stale copy of every function), .next, .turbo, dist, build, out and the like. They are ignored by git, so a person's machine can hold old copies a clean checkout never has, and
// a check that counted them gave one answer here and another in CI (sellRefusalCheck read "two copies of the sentence" from a Nov 15 .vercel/output).
//   repoFiles(root, { exts, skipTop })   the repo-relative paths (forward slashes) of the files a clean checkout would hold: git's own list (tracked plus new files not ignored) when root is a git checkout,
//                                         else a walk that skips BUILD_DIRS. Never a path with a BUILD_DIRS part. exts: a RegExp on the file name. skipTop: top level folders left out (scripts, docs, ...).
// scripts/buildOutputCheck.mjs proves it: every check that walks the tree gives the same counts with decoy build folders present as without them.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
export const BUILD_DIRS = new Set([".vercel", ".next", ".nuxt", ".turbo", ".cache", ".output", ".svelte-kit", ".parcel-cache", "dist", "build", "out", "coverage", "node_modules", ".git"]);
export const inBuildDir = rel => String(rel).split(/[\\/]/).some(p => BUILD_DIRS.has(p));
function viaGit(root) {
  try {
    const out = execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], { cwd: root, encoding: "utf8", maxBuffer: 1 << 28, stdio: ["ignore", "pipe", "ignore"] });
    const top = execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    if (path.resolve(top) !== path.resolve(root)) return null;   // a folder inside some other checkout: not this repo's list
    return out.split("\0").filter(Boolean).filter(f => fs.existsSync(path.join(root, f)));
  } catch { return null; }
}
function viaWalk(root) {
  const out = []; const walk = d => { for (const e of fs.readdirSync(path.join(root, d), { withFileTypes: true })) { if (BUILD_DIRS.has(e.name)) continue; const rel = d ? d + "/" + e.name : e.name; if (e.isDirectory()) walk(rel); else out.push(rel); } };
  walk(""); return out;
}
export function repoFiles(root = process.cwd(), { exts = null, skipTop = [] } = {}) {
  const all = (viaGit(root) || viaWalk(root)).filter(f => !inBuildDir(f)).filter(f => !skipTop.includes(f.split("/")[0])).filter(f => !exts || exts.test(f.split("/").pop()));
  return all.sort();
}
