// The nightly log says whether raw columns are on or off, as the word only. Offline: spawns node on the real module.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
let fail = 0;
const t = (ok, name) => { console.log(`${ok ? "PASS" : "FAIL"}  ${name}`); if (!ok) fail++; };
const run = (val) => {
  const env = { ...process.env }; delete env.INGEST_RAW_COLUMNS; if (val !== undefined) env.INGEST_RAW_COLUMNS = val;
  const code = 'import("./lib/_rawColumns.js").then(m=>{console.log(m.rawColumnsLine());console.log(JSON.stringify(Object.keys(m.rawColumnsOf({id:1}))))})';
  return spawnSync(process.execPath, ["-e", code], { env, encoding: "utf8" }).stdout.trim().split("\n");
};
const on = run("1"), off = run(undefined), zero = run("0"), s = run("1 ");
t(on[0] === "raw columns: on" && JSON.parse(on[1]).includes("raw_cols_at"), "value 1: line says on and the writer writes the marker");
t(off[0] === "raw columns: off" && off[1] === "[]", "unset: line says off and the writer writes nothing");
t(zero[0] === "raw columns: off" && s[0] === "raw columns: off", "0 and '1 ' (trailing space) read off, the same as the writer");
t(!/[=:]\s*1\b/.test(on[0]) && on[0].split(" ").length === 3, "the line carries the word only, never the value");
const src = readFileSync("scripts/ingest.js", "utf8");
t(/console\.log\(rawColumnsLine\(\)\)/.test(src), "scripts/ingest.js prints the line in its report");
process.exit(fail ? 1 : 0);
