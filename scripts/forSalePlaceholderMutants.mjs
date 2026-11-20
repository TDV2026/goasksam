// MUTANTS OF THE FILLER MILEAGE AND HOLDING LINE FIXES (Lane D, Nov 19 2026): each puts one piece of the fix back as it was, in a COPY of the tree (never the branch); the check that covers it must fail.
//   node scripts/forSalePlaceholderMutants.mjs [repo root]
import fs from "node:fs"; import os from "node:os"; import path from "node:path"; import { execFileSync, spawnSync } from "node:child_process"; import { fileURLToPath } from "node:url";
const ROOT = path.resolve(process.argv.slice(2).find(a => !a.startsWith("--") && !/^\d+$/.test(a)) || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
const M = [
  ["liveTrust: the stated mileage is the raw number", "lib/live/liveTrust.js", "let stated = statedMiles(r.mileage);", "let stated = Number(r.mileage) > 0 ? Number(r.mileage) : null;", "forSalePlaceholderMilesCheck"],
  ["liveTrust: a mileage read from the title is not checked", "lib/live/liveTrust.js", "stated = statedMiles(Math.round(Number(m[1].replace(/,/g, \"\")) * (m[2] ? 1000 : 1))); }", "stated = Math.round(Number(m[1].replace(/,/g, \"\")) * (m[2] ? 1000 : 1)); }", "forSalePlaceholderMilesCheck"],
  ["rowOf stores the filler", "lib/forsale/rules.js", "const mi = statedMiles(num(rec.mileage));", "const mi = num(rec.mileage);", "forSalePlaceholderMilesCheck"],
  ["rowOf converts a km filler without a check", "lib/forsale/rules.js", "statedMiles(Math.round(/^km|kilomet/.test(unit) ? mi * 0.621371 : mi))", "Math.round(/^km|kilomet/.test(unit) ? mi * 0.621371 : mi)", "forSalePlaceholderMilesCheck"],
  ["the Find card prints a stored filler", "lib/forsale/serve.js", "miles: statedMiles(row.mileage), milesLine: statedMiles(row.mileage) ? statedMiles(row.mileage).toLocaleString(\"en-US\") + \" miles\" : null,", "miles: Number(row.mileage) > 0 ? Number(row.mileage) : null, milesLine: Number(row.mileage) > 0 ? Math.round(Number(row.mileage)).toLocaleString(\"en-US\") + \" miles\" : null,", "forSalePlaceholderMilesCheck"],
  ["prepare bands a filler as a mileage", "lib/forsale/prepare.js", "const n = statedMiles(m); if (!(n > 0)) return \"unknown\";", "const n = Number(m); if (!(n > 0)) return \"unknown\";", "forSalePlaceholderMilesCheck"],
  ["the auction feed keeps a filler", "lib/live/feed.js", "const m = statedMiles(numOf(pick(rec, \"mileage\", \"odometer\", \"miles\")));", "const m = numOf(pick(rec, \"mileage\", \"odometer\", \"miles\"));", "forSalePlaceholderMilesCheck"],
  ["the history line takes a filler as the earlier mileage", "lib/live/priorListing.js", "more = statedMiles(miles) && statedMiles(last.miles) && statedMiles(miles) > statedMiles(last.miles) ? statedMiles(miles) - statedMiles(last.miles) : 0;", "more = miles && last.miles && Number(miles) > Number(last.miles) ? Number(miles) - Number(last.miles) : 0;", "forSalePlaceholderMilesCheck"],
  ["the history page keeps an earlier filler", "api/_historyData.js", "mileage: statedMiles(r.mileage)", "mileage: num(r.mileage)", "forSalePlaceholderMilesCheck"],
  ["the rule: the ceiling is gone", "lib/placeholderMiles.js", "if (n > MAX_PLAUSIBLE_MILES) return true;", "if (n > 50000000) return true;", "forSalePlaceholderMilesCheck"],
  ["the rule: one digit repeated is a mileage", "lib/placeholderMiles.js", "if (s.length >= 5 && /^(\\d)\\1+$/.test(s)) return true;", "", "forSalePlaceholderMilesCheck"],
  ["the rule: 0 and 1 are mileages", "lib/placeholderMiles.js", "if (n <= 1) return true;", "if (n < 0) return true;", "forSalePlaceholderMilesCheck"],
  ["the rule: 123,456 is a mileage", "lib/placeholderMiles.js", "const SEQUENCES = new Set([12345, 123456, 1234567, 12345678, 54321, 654321, 7654321]);", "const SEQUENCES = new Set([]);", "forSalePlaceholderMilesCheck"],
  ["the table filter leaves out the ceiling", "lib/placeholderMiles.js", "mileage.gt.${MAX_PLAUSIBLE_MILES},", "", "forSalePlaceholderMilesCheck"],
  ["the requeue keeps the old read", "lib/forsale/report.js", "mileage: null, read: null, updated_at", "mileage: null, updated_at", "forSalePlaceholderMilesCheck"],
  ["the sweep counts gone rows too", "lib/forsale/report.js", "&gone=eq.false&${placeholderFilter()}", "&${placeholderFilter()}", "forSalePlaceholderMilesCheck"],
  ["the requeue is a scheduled job", "api/pullForSale.js", "if (scheduled) return res.status(403).json({ error: \"The requeue is not a scheduled job.\" });", "", "forSalePlaceholderMilesCheck"],
  ["a stale-version read still shows its numbers", "lib/forsale/serve.js", "row.read.engine_version === ENGINE_VERSION);", "true);", "forSaleHoldingCheck"],
  ["an unread card has an empty Sam box", "lib/forsale/serve.js", "reasonLine(\"forsale.holding\", {}))", "\"\")", "forSaleHoldingCheck"],
  ["an unread card is not marked pending", "lib/forsale/serve.js", "readKind: readed ? row.read.kind : \"pending\",", "readKind: row.read ? row.read.kind : null,", "forSaleHoldingCheck"],
  ["a listing with no read is held back again", "lib/forsale/rules.js", "  // A LISTING WHOSE READ HAS NOT LANDED IS SERVED", "  if (!(row.read && row.read.sold_line && row.read.engine_version === engineVersion)) return \"read_pending\";\n  // A LISTING WHOSE READ HAS NOT LANDED IS SERVED", "forSaleHoldingCheck"],
  ["the holding line is reworded", "lib/reasonWords.js", "text: () => \"Sam's read is on its way.\"", "text: () => \"Reading.\"", "forSaleHoldingCheck"],
  ["the queue ignores demand", "lib/forsale/prepare.js", "export const byDemand = (groups, demand) => groups.slice().sort((a, b) => groupDemand(b, demand) - groupDemand(a, demand) || b.length - a.length);", "export const byDemand = (groups, demand) => groups.slice().sort((a, b) => b.length - a.length);", "forSalePrepareCheck"],
  ["the queue puts size before demand", "lib/forsale/prepare.js", "groupDemand(b, demand) - groupDemand(a, demand) || b.length - a.length);", "b.length - a.length || groupDemand(b, demand) - groupDemand(a, demand));", "forSalePrepareCheck"],
  ["an unreadable demand table breaks the run", "lib/forsale/prepare.js", "for (const r of Array.isArray(rows) ? rows : [])", "for (const r of rows)", "forSalePrepareCheck"],
  ["the top of the queue is not reported", "lib/forsale/prepare.js", "out.started = rg.slice(0, 20).map(", "out.startedX = rg.slice(0, 20).map(", "forSalePrepareCheck"]
];
const only = process.argv.includes("--only") ? Number(process.argv[process.argv.indexOf("--only") + 1]) : null;
let survived = 0, n = 0;
for (const [i, [name, file, from, to, check]] of M.entries()) {
  if (only != null && i !== only) continue;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fsmut-"));
  try {
    execFileSync("rsync", ["-a", "--exclude", ".git", "--exclude", "node_modules", "--exclude", "proofs", ROOT + "/", dir + "/"]);
    fs.symlinkSync(path.join(ROOT, "node_modules"), path.join(dir, "node_modules"));
    const f = path.join(dir, file), t = fs.readFileSync(f, "utf8");
    if (!t.includes(from)) { console.log(`ERROR  #${i} ${name}: the text to change is not in ${file}`); survived++; continue; }
    fs.writeFileSync(f, t.replace(from, () => to));
    const r = spawnSync("node", [path.join(dir, "scripts", check + ".mjs"), dir], { encoding: "utf8", timeout: 240000 });
    const killed = r.status !== 0; n++; if (!killed) survived++;
    console.log(`${killed ? "KILLED  " : "SURVIVED"} #${i} ${name}  (${check})`);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}
console.log(`\n${n} mutants run, ${survived} survived`); process.exit(survived ? 1 : 0);
