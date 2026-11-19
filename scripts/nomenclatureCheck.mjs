// RICK CAREY'S NOMENCLATURE LIST IS READ BY ONE MODULE AND NOTHING IN IT IS PRINTED BACK (Lane B, Nov 1 2026; docs/rick-nomenclature.csv, 589 rows, four independent columns). Credit for any page or copy that uses the list: "Collector car auction data at rickcarey.com".
// CAUSE: the list's period body names (Torpedo, Tonneau, Roi-des-Belges, Dos-a-dos, Vis-a-vis, Sedanca deVille, Landaulette, Tudor, Fordor, Berline, Decapotable, Runabout, Tourster) were read by nothing on input: they fell into the trim or the model, or were dropped; the
// coachbuilder column spells one firm several ways (Pinin Farina and Pininfarina, Rollson and Rollston, Mulliner and H.J. Mulliner, ...).
// FIX: lib/nomenclature.js is the one table: coachbuilder names merged to one each, every Type name mapped onto a body pool or listed as intentionally unmapped (racing classes, model and trim words, non-cars), and periodBodyIn reads the period names on typed input
// (resolveVehicle) as the pool they mean, taking the name out of the text; the pool's label prints, never the period name. This check fails without the fix.
//   node scripts/nomenclatureCheck.mjs [repo root]
import fs from "node:fs"; import path from "node:path"; import { fileURLToPath, pathToFileURL } from "node:url";
const root = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
process.chdir(root);
let fail = 0; const ok = (n, c, d) => { if (!c) fail++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`); };
const N = await import(pathToFileURL(path.join(root, "lib/nomenclature.js")).href).catch(() => null);
ok("lib/nomenclature.js exists", !!N);
const csvRows = text => { const out = []; let cur = [], f = "", q = false; for (let i = 0; i < text.length; i++) { const c = text[i]; if (q) { if (c === '"' && text[i + 1] === '"') { f += '"'; i++; } else if (c === '"') q = false; else f += c; } else if (c === '"') q = true; else if (c === ",") { cur.push(f); f = ""; } else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; cur.push(f); f = ""; if (cur.some(x => x !== "")) out.push(cur); cur = []; } else f += c; } if (f !== "" || cur.length) { cur.push(f); out.push(cur); } return out; };
const raw = fs.readFileSync("docs/rick-nomenclature.csv", "utf8").replace(/^﻿/, ""), table = csvRows(raw), head = table[0].map(h => h.trim()), rows = table.slice(1).map(r => Object.fromEntries(head.map((h, i) => [h, (r[i] || "").trim()])));
ok("the list has 589 rows and the four columns", rows.length === 589 && ["Body", "Type", "Marque", "Model"].every(h => head.includes(h)), String(rows.length));
const col = k => [...new Set(rows.map(r => r[k]).filter(Boolean))];
if (N) {
  const { BODY_BUCKETS, BODY_WORD_RULES } = await import(pathToFileURL(path.join(root, "lib/bodyWords.js")).href);
  const styles = new Set([...BODY_BUCKETS.map(b => b.style), ...BODY_WORD_RULES.map(r => r.style)]);
  // 1. TYPE: every name maps to a pool or is listed as intentionally unmapped (with its reason)
  const types = col("Type"), missing = types.filter(t => !N.TYPE_MAP[t]);
  ok(`every one of the ${types.length} Type names is in the table`, missing.length === 0, missing.join(" | "));
  ok("every mapped Type names a real body pool", types.every(t => !N.TYPE_MAP[t] || N.TYPE_MAP[t].pool === null || styles.has(N.TYPE_MAP[t].pool)), types.filter(t => N.TYPE_MAP[t] && N.TYPE_MAP[t].pool && !styles.has(N.TYPE_MAP[t].pool)).join(" | "));
  ok("every unmapped Type says why (intentionally unmapped)", types.every(t => !N.TYPE_MAP[t] || N.TYPE_MAP[t].pool !== null || (N.TYPE_MAP[t].why || "").length > 8), types.filter(t => N.TYPE_MAP[t] && N.TYPE_MAP[t].pool === null && !(N.TYPE_MAP[t].why || "").length).join(" | "));
  ok("Cabriolet A to D and Pf Cabriolet Se I and II map to Cabriolet", ["Cabriolet A", "Cabriolet B", "Cabriolet C", "Cabriolet D", "Pf Cabriolet Se I", "Pf Cabriolet Se II"].every(t => N.TYPE_MAP[t] && N.TYPE_MAP[t].pool === "cabriolet"));
  ok("every racing class is intentionally unmapped, none becomes a road body", N.RACING_CLASSES.every(t => N.TYPE_MAP[t] && N.TYPE_MAP[t].pool === null && /racing/.test(N.TYPE_MAP[t].why)));
  ok("the non-car types are listed as not cars", N.NOT_CAR_TYPES.every(t => N.TYPE_MAP[t] && N.TYPE_MAP[t].pool === null && /not a car/.test(N.TYPE_MAP[t].why)));
  // 2. COACHBUILDERS: the named variants and every variant found resolve to one name each
  const PAIRS = [["Pinin Farina", "Pininfarina"], ["Rollson", "Rollston"], ["Mulliner", "H.J. Mulliner"], ["Van den Plas", "Vanden Plas"], ["Inskip", "J.S. Inskip"], ["Radford", "Harold Radford"], ["Ital Design", "Italdesign"], ["Erdmann & Rossi", "Erdmann & Rossi-J.Neuss"], ["Farina", "Stablimenti Farina"], ["Brunn & Co.", "Brunn"]];
  for (const [a, b] of PAIRS) ok(`coachbuilder "${a}" and "${b}" are one name`, N.coachbuilderName(a) === N.coachbuilderName(b), N.coachbuilderName(a));
  ok("the merged names are spelled one way, whatever case or punctuation a reader uses", N.coachbuilderName("pinin farina") === "Pininfarina" && N.coachbuilderName("VAN DEN PLAS") === "Vanden Plas" && N.coachbuilderName("h j mulliner") === "H.J. Mulliner");
  const bodies = col("Body"), canon = new Set(bodies.map(N.coachbuilderName));
  ok(`${bodies.length} Body spellings resolve to ${canon.size} coachbuilders`, canon.size < bodies.length && canon.size >= 90, `${bodies.length} -> ${canon.size}`);
  ok("firms that are not the same company stay apart (Darrin, Hibbard & Darrin, Mulliner Park Ward, Ghia Aigle)", ["Darrin", "Hibbard & Darrin", "Mulliner Park Ward", "Ghia Aigle", "Pininfarina-Scaglietti"].every(n => N.coachbuilderName(n) === n) && N.coachbuilderName("Ghia") !== N.coachbuilderName("Ghia Aigle"));
  // 3. MARQUE: non-cars are skipped; the collapse list names real list entries
  const marques = col("Marque"), carMarques = marques.filter(m => !N.NOT_CAR_MARQUES.includes(m));
  ok("Not Cataloged, Harley-Davidson and Vespa are skipped, no other marque is", N.NOT_CAR_MARQUES.length === 3 && carMarques.length === marques.length - 3);
  ok("every marque spelling the collapse list names is in the list", Object.values(N.MARQUE_COLLAPSES).flat().every(m => marques.includes(m) || m === Object.keys(N.MARQUE_COLLAPSES).find(k => N.MARQUE_COLLAPSES[k].includes(m))), "");
  // 4. INPUT: a period name is read as its pool, taken out of the text, and never printed back
  const { resolveVehicle } = await import(pathToFileURL(path.join(root, "lib/vehicle.js")).href);
  const periodTypes = types.filter(t => N.TYPE_MAP[t] && N.TYPE_MAP[t].how === "period");
  ok(`${periodTypes.length} period names are read on input`, periodTypes.length >= 12, periodTypes.join(" | "));
  for (const t of periodTypes) {
    const r = await resolveVehicle(`1930 Packard 745 ${t}`, {}), v = r.vehicle || {}, want = N.TYPE_MAP[t].pool;
    ok(`typed "${t}" scopes the ${want} pool`, v.bodyStyle === want, String(v.bodyStyle));
    ok(`typed "${t}" is not read as a trim or a model, and not printed back`, !new RegExp(t.replace(/[-]/g, "[ -]?"), "i").test([v.trim, v.model, v.raw, v.edition].filter(Boolean).join(" ")), JSON.stringify([v.trim, v.model, v.raw]));
  }
  // the period name is never a label: the pool labels a reader sees carry none of them
  const labels = BODY_BUCKETS.map(b => b.label).concat(BODY_WORD_RULES.map(r => r.label)).join(" | ");
  ok("no pool label is a period name", !periodTypes.some(t => new RegExp("\\b" + t.replace(/[-]/g, "[ -]?") + "\\b", "i").test(labels)), labels);
  const ob = fs.readFileSync("lib/onebox.js", "utf8").replace(/\/\/[^\n]*/g, "");
  ok("the engine's printed body labels (BODY_LABEL) carry no period name", !periodTypes.some(t => { const m = /const BODY_LABEL(?:_MORE)? = \{[^}]*\}/g.exec(ob); return m && new RegExp(t.replace(/[-]/g, "[ -]?"), "i").test(m[0]); }));
  // 5. THE RACING CLASSES: the engine does nothing with them today, and still does nothing
  for (const t of ["Formula 1", "Indy Car", "Group B Rally"]) { const r = await resolveVehicle(`1967 Ferrari 330 ${t}`, {}); ok(`typed racing class "${t}" sets no body`, !(r.vehicle && r.vehicle.bodyStyle), String(r.vehicle && r.vehicle.bodyStyle)); }
  // 6. THE SWEEP: the period names change only what they name. Pre-war texts without one are read as before
  const KEEP = ["1930 Packard 745 Roadster", "1931 Cadillac V-16 Phaeton", "1937 Cord 812 Phaeton", "1929 Duesenberg Model J", "1927 Bentley 3 Litre", "1932 Ford Highboy Roadster", "1928 Ford Model A", "1931 Ford Model A Deluxe", "1936 Ford Deluxe Roadster", "1941 Ford Super Deluxe", "1939 Plymouth Deluxe", "1935 Ford Custom"];
  for (const t of KEEP) { const r = await resolveVehicle(t, {}); ok(`"${t}" has no period body read into it`, !r.vehicle || !["touring", "towncar"].includes(r.vehicle.bodyStyle) || /tour|town/i.test(t), String(r.vehicle && r.vehicle.bodyStyle)); }
  // a period name that is also a maker's model name leaves the car as it was typed
  for (const t of ["1910 Stanley Runabout", "1936 Ford Tudor", "1912 Packard Torpedo"]) { const r = await resolveVehicle(t, {}); ok(`"${t}" still resolves a car (the word may be the maker's model)`, !!(r.vehicle && r.vehicle.make), r.status); }
}
console.log(fail ? `nomenclatureCheck: ${fail} failure(s)` : "nomenclatureCheck: all pass");
process.exit(fail ? 1 : 0);
