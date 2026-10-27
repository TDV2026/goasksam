// e95: the question rule can never be off outside the one test that switches it off. noQuestionRule is a test flag: it is named only in lib/onebox.js
// (the definition, honoured only when the process sets GAS_TEST_NO_QUESTION_RULE=1) and in the checks that set both. It is in no api route, no warm
// script, no lib module and no default env, and nothing reads the variable from a request.
//   node scripts/noQuestionRuleCheck.mjs [repo root]
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
const root = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
let failed = 0; const ok = (n, c, d) => { if (!c) failed++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`); };
const walk = (dir, out = []) => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { if (/^(node_modules|\.git|proofs|docs|\.vercel)$/.test(e.name)) continue; const p = path.join(dir, e.name); if (e.isDirectory()) walk(p, out); else if (/\.(js|mjs|cjs|json|yml|yaml)$/.test(e.name)) out.push(p); } return out; };
const files = walk(root);
const naming = files.filter(f => /noQuestionRule|GAS_TEST_NO_QUESTION_RULE/.test(fs.readFileSync(f, "utf8"))).map(f => path.relative(root, f));
const ALLOWED = new Set(["lib/onebox.js", "scripts/generationChipCheck.mjs", "scripts/questionRuleCheck.mjs", "scripts/noQuestionRuleCheck.mjs", "scripts/questionSpeedCheck.mjs"]);
ok("the flag is named only in the engine and the checks that set it", naming.every(f => ALLOWED.has(f)), naming.filter(f => !ALLOWED.has(f)).join(", "));
const src = fs.readFileSync(path.join(root, "lib/onebox.js"), "utf8");
ok("the engine honours it only when the process variable is set", /questionRuleOff = env => !!\(env && env\.noQuestionRule\) && process\.env\.GAS_TEST_NO_QUESTION_RULE === "1"/.test(src));
const setters = naming.filter(f => f !== "lib/onebox.js" && f !== "scripts/noQuestionRuleCheck.mjs");
ok("every check that passes the flag also sets the variable to 1 (or, for the rule's own check, clears it)", setters.every(f => /GAS_TEST_NO_QUESTION_RULE\s*=\s*"(1|)"/.test(fs.readFileSync(path.join(root, f), "utf8"))), setters.join(", "));
const prod = files.filter(f => /(^|\/)(api|lib)\//.test(path.relative(root, f)) && path.relative(root, f) !== "lib/onebox.js").filter(f => /noQuestionRule/.test(fs.readFileSync(f, "utf8")));
ok("no api route and no lib module outside the engine names it", prod.length === 0, prod.map(f => path.relative(root, f)).join(", "));
const envFiles = files.filter(f => /(vercel\.json|\.ya?ml|\.env[^/]*)$/.test(f) && /GAS_TEST_NO_QUESTION_RULE/.test(fs.readFileSync(f, "utf8")));
ok("no workflow, vercel.json or env file sets the variable", envFiles.length === 0, envFiles.map(f => path.relative(root, f)).join(", "));
const E = await import(path.join(root, "lib/onebox.js"));
process.env.GAS_TEST_NO_QUESTION_RULE = "";
const d = { tier: "gearbox_choice", gearboxOptions: ["Manual", "Automatic"], optionCounts: [6, 6] };
const env = { supabaseUrl: "https://fake.supabase.test", supabaseKey: "k", noQuestionRule: true };
globalThis.fetch = async () => new Response("[]", { status: 200 });
const r = await E.questionRule(d, { make: "Acme", model: "Iota", trim: "", year: 1985 }, null, "1985 Acme Iota", env, null);
ok("a request that carries the flag does not switch the rule off without the variable", r !== d && r.tier !== "gearbox_choice", `tier ${r && r.tier}`);
console.log(failed ? `noQuestionRuleCheck: ${failed} FAIL` : "noQuestionRuleCheck: all PASS");
process.exit(failed ? 1 : 0);
