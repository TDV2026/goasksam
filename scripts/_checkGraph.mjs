// THE IMPORT GRAPH the check runner and the map builder share (Lane C, Nov 17 2026): which repo files a file imports, read from the text (static and dynamic imports, relative or lib/ and api/ rooted), plus the data files it names.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC_DIRS = ["lib", "api", "js", "public/js", "scripts"];
const IMPORT = /(?:from\s*|import\s*\(\s*|require\s*\(\s*)["'`](\.{1,2}\/[^"'`]+|(?:lib|api)\/[^"'`]+)["'`]/g;
const DATA = /["'`/]((?:\.\.\/)*data\/[A-Za-z0-9_.\/-]+\.(?:json|csv|txt))["'`]/g;
const walk = (d, root) => { const out = []; const base = path.join(root, d); if (!fs.existsSync(base)) return out; for (const e of fs.readdirSync(base, { withFileTypes: true })) { const rel = d + "/" + e.name; if (e.isDirectory()) { if (e.name !== "node_modules") out.push(...walk(rel, root)); } else if (/\.(m?js|cjs)$/.test(e.name)) out.push(rel); } return out; };
export function buildGraph(root = ROOT) {
  const files = new Set(SRC_DIRS.flatMap(d => walk(d, root))), imports = new Map(), data = new Map(), reverse = new Map();
  const resolve = (spec, fromFile) => { let x = spec.startsWith(".") ? path.posix.normalize(path.posix.join(path.posix.dirname(fromFile), spec)) : spec; for (const c of [x, x + ".js", x + ".mjs", x + "/index.js"]) if (files.has(c)) return c; return null; };
  for (const f of files) {
    let t = ""; try { t = fs.readFileSync(path.join(root, f), "utf8"); } catch { continue; }
    const im = new Set(); for (const m of t.matchAll(IMPORT)) { const r = resolve(m[1], f); if (r) im.add(r); }
    imports.set(f, im); for (const r of im) { if (!reverse.has(r)) reverse.set(r, new Set()); reverse.get(r).add(f); }
    const d = new Set(); for (const m of t.matchAll(DATA)) { const x = path.posix.normalize(m[1].replace(/^(\.\.\/)+/, "")); if (fs.existsSync(path.join(root, x))) d.add(x); } data.set(f, d);
  }
  return { files, imports, data, reverse };
}
// every file reachable from the given roots through imports (the roots included)
export function reach(graph, roots) { const seen = new Set(); const stack = [...roots]; while (stack.length) { const f = stack.pop(); if (seen.has(f)) continue; seen.add(f); for (const i of graph.imports.get(f) || []) stack.push(i); } return seen; }
// the files within `depth` import steps of the roots (depth 0: the roots; 1: what they import directly; ...). Unbounded depth selects almost every check for any widely imported file, so the runner reads one step by default and says so in the map.
export function reachDepth(graph, roots, depth) { let frontier = new Set(roots); const seen = new Set(roots); for (let i = 0; i < depth; i++) { const next = new Set(); for (const f of frontier) for (const m of graph.imports.get(f) || []) if (!seen.has(m)) { seen.add(m); next.add(m); } frontier = next; } return seen; }
