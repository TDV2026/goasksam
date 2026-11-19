// MUTANTS FOR THE lane-b-coverage CHECKS (Lane B, Nov 19 2026). Run in a COPY of the worktree, never on the branch: each mutant breaks one line the fix depends on, runs the check that guards it and expects it to FAIL; the file is restored after each.
//   node scripts/coverageMutants.mjs <path of the copy>
import fs from "fs"; import path from "path"; import { execFileSync } from "child_process";
const root = path.resolve(process.argv[2] || "."); let killed = 0, survived = [];
const M = [
  ["poolSourceCheck", "online band back (8 online sales drop the house sales)", "lib/onebox.js", "const fetchPool = async (extra, days) => priceUp(await fetchQualifying({ ...famSpec, ...extra }, iso(days), env, diag));", "const fetchPool = async (extra, days) => { const rr = await fetchQualifying({ ...famSpec, ...extra }, iso(days), env, diag); const on = rr.filter(r => !isHouseSource(r.source)); return priceUp(on.length >= RANGE_THRESHOLD ? on : rr); };"],
  ["poolSourceCheck", "sibling read drops house sales", "lib/onebox.js", "const sibRows = priceUp(await fetchQualifying(sibFamSpec, iso(1825), env, diag));", "const sibRows = priceUp((await fetchQualifying(sibFamSpec, iso(1825), env, diag)).filter(r => !isHouseSource(r.source)));"],
  ["poolSourceCheck", "the strip names a house venue \"others\"", "lib/onebox.js", "venue: platformName(platSlug(r.source)) || platNamed(r.source)", "venue: platNamed(r.source)"],
  ["modelChoiceCarsOnlyCheck", "the non-car fence is not applied", "lib/onebox.js", "      if (nonCar(raw)) continue;", "      // (mutant) no fence"],
  ["modelChoiceCarsOnlyCheck", "tractors are not fenced", "lib/onebox.js", "isMotorcycleTitle(t, make) || isFarmMachineTitle(t, make)", "isMotorcycleTitle(t, make)"],
  ["modelChoiceCarsOnlyCheck", "ATVs are not fenced", "lib/_classify.js", "|atvs?|quad\\s?bikes?)", ")"],
  ["vendorSourceCheck", "duPont is left out of the pull list (DISPLAY)", "scripts/ingest.js", "  dupontregistrylive: \"duPont Registry Live\"   //", "  //"],
  ["vendorSourceCheck", "the label to slug bridge lacks duPont", "lib/_houseComps.js", ", \"dupont registry live\": \"dupontregistrylive\"", ""],
  ["vendorSourceCheck", "duPont is put in the fee set (its hammer would be backed out)", "lib/_houseComps.js", "export const HOUSE_SOURCES = new Set([\"rmsothebys\",", "export const HOUSE_SOURCES = new Set([\"dupontregistrylive\", \"rmsothebys\","],
  ["vendorSourceCheck", "duPont is not a house venue for words", "lib/_houseComps.js", "new Set([...HOUSE_SOURCES, \"dupontregistrylive\"])", "new Set([...HOUSE_SOURCES])"],
  ["vendorSourceCheck", "the email venue map drops Mecum (a pre-existing slug leak class)", "lib/_email.js", " mecum: \"Mecum\" }", " }"],
  ["vendorSourceCheck", "the engine's venue name map drops duPont (tile shows the slug)", "lib/onebox.js", "broadarrow: \"Broad Arrow\", dupontregistrylive: \"duPont Registry Live\", themarket", "broadarrow: \"Broad Arrow\", themarket"],
  ["vendorSourceCheck", "the room type of an uncalendared live auction reads online", "lib/desk/roomType.js", "if (!cal) return { type: \"live\", source: \"inferred\" };", "if (!cal) return { type: \"online\", source: \"inferred\" };"],
  ["softFlagCheck", "stored flags are not read again", "lib/onebox.js", "got = await reconcileSoftFlags(env, got); }", "}"],
  ["softFlagCheck", "only soft keys are read again (a stale hard flag stays)", "lib/onebox.js", "const soft = rows.filter(r => r && r.id != null && String(r.project_flag || \"\").trim());", "const soft = rows.filter(r => r && r.id != null && /^(tribute|replica|recreation)$/.test(String(r.project_flag || \"\").trim()));"],
  ["softFlagCheck", "a factory package does not spare the homage wording", "lib/_classify.js", "const Dn = packageNamed ? D.replace(HOMAGE_RE, \" \") : D;", "const Dn = D;"],
  ["softFlagCheck", "the description read result is ignored (every stale flag stands)", "lib/onebox.js", "r.project_flag = cur || null; r._softFlagRead = true;", "r._softFlagRead = true;"],
  ["softFlagCheck", "a tribute in the title no longer flags", "lib/_classify.js", "  const tl = T.match(PROJECT_TITLE_LOOSE); if (tl) return tl[0].toLowerCase().replace(/\\s+/g, \" \").trim();\n  for (const p of PROJECT_PATTERNS) if (p.re.test(T)) return p.k;", "  const tl = T.match(PROJECT_TITLE_LOOSE); if (tl) return tl[0].toLowerCase().replace(/\\s+/g, \" \").trim();\n  for (const p of PROJECT_PATTERNS) if (p.k !== \"tribute\" && p.re.test(T)) return p.k;"]
];
for (const [check, name, file, from, to] of M) {
  const fp = path.join(root, file), orig = fs.readFileSync(fp, "utf8");
  if (!orig.includes(from)) { console.log(`SKIP  ${name}: the line to mutate is not in ${file}`); survived.push(name + " (line not found)"); continue; }
  fs.writeFileSync(fp, orig.replace(from, to));
  let code = 0; try { execFileSync("node", [path.join(root, "scripts", check + ".mjs"), root], { stdio: "pipe", timeout: 240000 }); } catch (e) { code = e.status || 1; }
  fs.writeFileSync(fp, orig);
  if (code) { killed++; console.log(`KILLED  ${check}: ${name}`); } else { survived.push(`${check}: ${name}`); console.log(`SURVIVED  ${check}: ${name}`); }
}
console.log(`\ncoverageMutants: ${killed} of ${M.length} killed${survived.length ? "; survivors: " + survived.join(" | ") : ""}`);
process.exit(survived.length ? 1 : 0);
