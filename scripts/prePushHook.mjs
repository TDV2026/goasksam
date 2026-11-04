// prePushHook.mjs - preload for scripts/prePush.mjs (Lane C). Loaded with `node --import scripts/prePushHook.mjs scripts/prePush.mjs`.
// prePush.mjs itself is NOT edited: every check it runs goes through child_process.execSync, and this hook wraps that one function.
//   PREPUSH_TIMING_FILE=<file>  append one JSON line per check command: cmd, ms, exit status, whether it printed a summary line.
//   PREPUSH_CACHE_DIR=<dir>     serve a check command from <dir>/<sha1 of the command>.json (written by prePushParallel.mjs) instead of running it,
//                               and throw exactly what execSync throws for a non-zero exit (e.status, e.stdout, e.stderr, e.message).
//   PREPUSH_DISCOVER_FILE=<file> do not run any check: record each check command (and the timeout prePush gave it) and return "" (prePushParallel.mjs phase 1).
//   PREPUSH_STRICT=1            a check that exits 0 but printed no "<scriptName>: ..." summary line counts as a FAIL (see hasSummary).
// With none of these set the hook changes nothing.
import cp from "node:child_process";
import { syncBuiltinESMExports } from "node:module";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const isCheckCommand = cmd => /^\s*(node scripts\/|npm run )/.test(String(cmd));
export const cmdKey = cmd => crypto.createHash("sha1").update(String(cmd)).digest("hex");
// A check has SUMMARISED when it printed a verdict a reader can see: its own "<scriptName>: ..." line (what prePush's detail regex reads), a
// PASS/ok line, or a count ("12 passed", "8/8 checks passed", "all pass"). Exit 0 with none of these (empty or silent output) proves nothing ran,
// so under PREPUSH_STRICT it is a FAIL, never a pass. A "&&" chain needs a verdict from every script in it.
export function scriptNames(cmd) { return [...String(cmd).matchAll(/scripts\/([A-Za-z0-9_.-]+?)\.(?:mjs|js)\b/g)].map(m => m[1]); }
const VERDICT = /^\s*(PASS|ok)\b|\b\d+\s*\/\s*\d+\s+(checks?\s+)?pass(ed)?\b|\b\d+\s+pass(ed)?\b|\ball\s+(\w+\s+)?pass/im;
export function hasSummary(cmd, text) {
  if (/^\s*npm run /.test(String(cmd))) return true;                      // npm scripts are a bundle; their own exit code is the verdict
  const names = scriptNames(cmd);
  if (!names.length) return true;
  if (names.length > 1) return names.every(n => new RegExp("^" + n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ": ", "m").test(text));
  return new RegExp("^" + names[0].replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ": ", "m").test(text) || VERDICT.test(text);
}

const real = cp.execSync;
const timingFile = process.env.PREPUSH_TIMING_FILE || "";
const cacheDir = process.env.PREPUSH_CACHE_DIR || "";
const strict = process.env.PREPUSH_STRICT === "1";
const discoverFile = process.env.PREPUSH_DISCOVER_FILE || "";

function failure(cmd, status, stdout, stderr, signal, note) {
  const e = new Error(`Command failed: ${cmd}${note ? "\n" + note : ""}\n${stderr || ""}`);
  e.status = status; e.signal = signal || null; e.stdout = stdout; e.stderr = stderr; e.output = [null, stdout, stderr]; e.pid = 0;
  return e;
}

cp.execSync = function (cmd, opts) {
  if (!isCheckCommand(cmd) || (!timingFile && !cacheDir && !strict && !discoverFile)) return real.apply(this, arguments);
  if (discoverFile) {
    try { fs.appendFileSync(discoverFile, JSON.stringify({ cmd: String(cmd), timeout: (opts && opts.timeout) || 0 }) + "\n"); } catch {}
    return opts && opts.encoding ? "" : Buffer.from("");
  }
  const t0 = Date.now();
  if (!cacheDir && !strict) {
    // timing only: run it exactly as prePush would, just time it
    const log = (status, out, signal) => { try { fs.appendFileSync(timingFile, JSON.stringify({ cmd, ms: Date.now() - t0, status, signal: signal || null, summary: hasSummary(cmd, String(out || "")) }) + "\n"); } catch {} };
    try { const out = real.apply(this, arguments); log(0, out); return out; }
    catch (e) { log(e.status == null ? 1 : e.status, (e.stdout || "") + "\n" + (e.stderr || ""), e.signal); throw e; }
  }
  let rec = null;
  if (cacheDir) {
    try { rec = JSON.parse(fs.readFileSync(path.join(cacheDir, cmdKey(cmd) + ".json"), "utf8")); } catch { rec = null; }
  }
  if (!rec) {
    // not in the cache (or no cache): run it here, with the caller's own options, and capture what execSync would throw
    try { const out = real.call(this, cmd, { ...(opts || {}), encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }); rec = { status: 0, stdout: String(out), stderr: "", ms: Date.now() - t0 }; }
    catch (e) { rec = { status: e.status == null ? 1 : e.status, signal: e.signal || null, stdout: String(e.stdout || ""), stderr: String(e.stderr || ""), ms: Date.now() - t0 }; }
  }
  const summary = hasSummary(cmd, rec.stdout + "\n" + rec.stderr);
  if (timingFile) { try { fs.appendFileSync(timingFile, JSON.stringify({ cmd, ms: rec.ms, status: rec.status, signal: rec.signal || null, summary, timedOut: !!rec.timedOut }) + "\n"); } catch {} }
  if (rec.status !== 0 || rec.timedOut) return (() => { throw failure(cmd, rec.status || 1, rec.stdout, rec.stderr, rec.signal, rec.timedOut ? "TIMED OUT" : ""); })();
  if (strict && !summary) {
    const why = "FAIL " + scriptNames(cmd).join(" ") + ": printed no summary line (a check with no summary is a FAIL, never a pass)";
    throw failure(cmd, 1, rec.stdout + "\n" + why + "\n", rec.stderr, null, why);
  }
  return opts && opts.encoding ? rec.stdout : Buffer.from(rec.stdout);
};
syncBuiltinESMExports();
