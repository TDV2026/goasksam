// clock: real-ok cookies are minted from the real now in the same process
// DESK RETIRED (Lane E, Nov 11 2026). The old Desk screen (/desk, the Desk V3 page) is gone: /desk and every /desk/* answer a visitor, a tester and a seat with the platform's 404,
// and the crew with the cookie are sent to the Desk V4 preview (/preview/desk). Every API (/api/desk, deskIntake, deskInbound, deskSend, deskSeat, deskOrg) stays.
//   node scripts/deskRetiredCheck.mjs            the check
//   node scripts/deskRetiredCheck.mjs --mutants  puts the old page back (and four other ways to bring /desk back) and shows each one fails the check
// CLASS: any way a /desk address could still answer a stranger: the router (an unconditional rewrite, a seat or tester rewrite), the function (a page entry for desk), robots (not disallowed),
// the sitemaps and the site's own links (an href or script that points there). Each is a case below, and each has a mutant.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), ".."); process.chdir(ROOT);
process.env.CURTAIN_CREW_CODE = "fixture-crew-code"; process.env.LAUNCH_STAGE = "2"; process.env.CURTAIN_TESTER_CODE = "fixture-tester-code-0123456789"; process.env.TESTER_CODE_EXPIRES = new Date(Date.now() + 864e5).toISOString();
delete process.env.SUPABASE_URL; delete process.env.SUPABASE_SERVICE_ROLE_KEY; delete process.env.SUPABASE_ANON_KEY;
const imp = f => import(pathToFileURL(path.join(ROOT, f)).href + "?t=" + Math.random());
const rd = f => fs.readFileSync(path.join(ROOT, f), "utf8");
const { mintCrewCookieValue } = await imp("lib/_crew.js"), { mintTesterCookieValue } = await imp("lib/_tester.js"), { mintSeatCookieValue } = await imp("lib/desk/seatCookie.js");

const call = async (file, { url, cookie, accept = "text/html" }) => {
  const m = await imp(file), res = { h: {}, code: 200, body: undefined, setHeader(k, v) { this.h[k.toLowerCase()] = v; return this; }, getHeader(k) { return this.h[k.toLowerCase()]; }, removeHeader(k) { delete this.h[k.toLowerCase()]; },
    status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, send(b) { this.body = b; return this; }, end() { return this; } };
  const u = new URL("https://goasksam.com" + url);
  await m.default({ url, method: "GET", query: Object.fromEntries(u.searchParams), headers: { host: "goasksam.com", "user-agent": "Mozilla/5.0", accept, "x-vercel-id": "sfo1::t-1-abcdef", ...(cookie ? { cookie } : {}) } }, res);
  return res;
};
const is404 = r => r.code === 404 && r.h["x-vercel-error"] === "NOT_FOUND" && !r.h["set-cookie"] && !r.h.location;

// ---- the source sweep: a link, button or script that points at the page (the APIs are /api/desk..., never matched)
const LINK_RE = /(?:["'(=]|goasksam\.com)\/desk(?:["'/?#) ]|$)/;
const SKIP = /^(?:lib\/crewPages\/|lib\/desk\/|lib\/preview\/desk|public\/js\/desk|api\/desk)/;
export function linksToDesk(files) {
  const bad = [];
  for (const [f, src] of Object.entries(files)) {
    if (SKIP.test(f)) continue;
    src.split("\n").forEach((l, i) => { if (/^\s*(?:\/\/|\*|\/\*|#|<!--)/.test(l)) return; if (LINK_RE.test(l)) bad.push(f + ":" + (i + 1)); });
  }
  return bad;
}
const walk = (d, out = {}) => { for (const e of fs.readdirSync(path.join(ROOT, d), { withFileTypes: true })) { const p = d + "/" + e.name; if (e.isDirectory()) { if (!/node_modules|\.git$/.test(e.name)) walk(p, out); } else if (/\.(js|mjs|html|json|xml|txt)$/.test(e.name)) out[p] = rd(p); } return out; };

export async function run({ crewPage = "api/crewPage.js", vercel = rd("vercel.json"), robots = rd("public/robots.txt"), sources = null } = {}) {
  let pass = 0; const fails = []; const ok = (c, m) => { if (c) pass++; else fails.push(m); };
  const tv = mintTesterCookieValue(); ok(/^t1\./.test(tv || ""), "the fixture tester cookie is real"); const crew = "gas_crew=" + mintCrewCookieValue(), tester = "gas_tester=" + tv, seat = "gas_seat=" + mintSeatCookieValue(11);
  // 1. THE FUNCTION: /desk and /desk/* (the router sends both here for a crew cookie only)
  for (const [name, c] of [["no cookie", undefined], ["a tester cookie", tester], ["a seat cookie", seat], ["a forged crew cookie", "gas_crew=v1.1.AAAA"]]) {
    const r = await call(crewPage, { url: "/api/crewPage?page=desk", cookie: c }); ok(is404(r), `/desk with ${name} is the platform 404 (got ${r.code})`);
  }
  const rc = await call(crewPage, { url: "/api/crewPage?page=desk", cookie: crew });
  ok(rc.code === 302 && rc.h.location === "/preview/desk", `/desk with the crew cookie goes to /preview/desk (got ${rc.code} ${rc.h.location || ""})`);
  ok(/noindex/.test(rc.h["x-robots-tag"] || "") && !/<html/i.test(String(rc.body || "")), "the crew redirect carries noindex and no old page body");
  // 2. THE ROUTER (vercel.json): /desk and /desk/:path* reach the function only with the crew cookie; nothing for a tester, a seat or a stranger
  const vj = JSON.parse(vercel), rules = (vj.rewrites || []).filter(x => /^\/desk(?:\/|$)/.test(x.source));
  const srcs = rules.map(x => x.source);
  ok(srcs.includes("/desk") && srcs.includes("/desk/:path*"), `both /desk and /desk/:path* are routed (${srcs.join(", ")})`);
  ok(rules.length > 0 && rules.every(x => (x.has || []).length === 1 && x.has[0].type === "cookie" && x.has[0].key === "gas_crew" && x.destination === "/api/crewPage?page=desk"), "every /desk rewrite applies only with the gas_crew cookie (no stranger, tester or seat rewrite)");
  ok(!(vj.redirects || []).some(x => /^\/desk/.test(x.source)) && !(vj.rewrites || []).some(x => /desk/.test(x.destination) && /^\/desk/.test(x.destination) ), "nothing in vercel.json routes a visitor to a /desk page or file");
  ok(!fs.existsSync(path.join(ROOT, "public/desk.html")) && !fs.existsSync(path.join(ROOT, "public/desk")), "no desk file in public/ for the platform to serve");
  // 3. ROBOTS: every crawler group disallows /desk (a named group does not inherit from *)
  const groups = robots.split(/\n\s*\n/).filter(g => /^User-agent:/m.test(g));
  ok(groups.length >= 2 && groups.every(g => /^Disallow:\s*\/desk\s*$/m.test(g)), `every robots group disallows /desk (${groups.filter(g => /^Disallow:\s*\/desk\s*$/m.test(g)).length} of ${groups.length})`);
  // 4. NO LINK: no sitemap, nav, footer, page or script on the site points at /desk
  const files = sources || { ...walk("api"), ...walk("lib"), ...walk("public") };
  const bad = linksToDesk(files); ok(bad.length === 0, `nothing on the site links to /desk (${bad.slice(0, 5).join(", ")})`);
  ok(!/\/desk(?:["'<\s?#]|$)/.test(Object.entries(files).filter(([f]) => /sitemap/i.test(f)).map(e => e[1]).join("\n")), "no sitemap lists /desk");
  return { pass, fails };
}

const arg = process.argv[2], DIRECT = process.argv[1] === fileURLToPath(import.meta.url);
if (!DIRECT) { /* imported: run() only */ } else if (arg === "--mutants") {
  const base = await run(); if (base.fails.length) { console.log("base check is red, fix first:\n" + base.fails.join("\n")); process.exit(1); }
  const cp = rd("api/crewPage.js"), vj = rd("vercel.json"), rb = rd("public/robots.txt"), tag = "api/_deskRetiredMutant.js";
  const OLD_ENTRY = cp.replace(/  if \(name === "desk"\) \{[\s\S]*?\n  \}\n/, "").replace("const PAGES = {", 'const PAGES = { desk: { file: "desk.html", tester: true },');
  const files = { ...walk("api"), ...walk("lib"), ...walk("public") };
  const mutants = [
    ["the old page served again (a page entry for desk, no retirement branch)", { crewPage: tag, src: OLD_ENTRY }],
    ["an unconditional /desk rewrite", { vercel: vj.replace('{ "source": "/desk/:path*"', '{ "source": "/desk", "destination": "/api/crewPage?page=desk" },\n    { "source": "/desk/:path*"') }],
    ["a seat cookie rewrite for /desk", { vercel: vj.replace('{ "source": "/desk/:path*"', '{ "source": "/desk", "has": [{ "type": "cookie", "key": "gas_seat", "value": "s1\\\\..*" }], "destination": "/api/crewPage?page=desk" },\n    { "source": "/desk/:path*"') }],
    ["the /desk/* rewrite missing", { vercel: vj.replace(/\n\s*\{ "source": "\/desk\/:path\*"[^\n]*/, "") }],
    ["robots without the disallow", { robots: rb.replace(/Disallow: \/desk\n/, "") }],
    ["a footer link to /desk", { sources: { ...files, "lib/appShell.js": (files["lib/appShell.js"] || "") + '\nconst FOOT = \'<a href="/desk">Desk</a>\';\n' } }],
    ["/desk in a sitemap", { sources: { ...files, "api/sitemapPages.js": (files["api/sitemapPages.js"] || "") + '\nconst U = "https://goasksam.com/desk";\n' } }]
  ];
  let missed = 0;
  for (const [name, m] of mutants) {
    let r;
    try { if (m.src) fs.writeFileSync(path.join(ROOT, tag), m.src); r = await run({ crewPage: m.crewPage, vercel: m.vercel, robots: m.robots, sources: m.sources }); } finally { if (m.src) fs.rmSync(path.join(ROOT, tag), { force: true }); }
    const caught = r.fails.length > 0; if (!caught) missed++; console.log((caught ? "caught  " : "MISSED  ") + name + (caught ? " (" + r.fails.length + " failing: " + r.fails[0].slice(0, 90) + ")" : ""));
  }
  console.log(missed ? `deskRetiredCheck mutants: ${missed} not caught` : `deskRetiredCheck mutants: all ${mutants.length} caught`); process.exit(missed ? 1 : 0);
} else {
  const { pass, fails } = await run(); for (const f of fails) console.log("FAIL " + f);
  console.log(`deskRetiredCheck: ${pass} pass, ${fails.length} FAIL`); process.exit(fails.length ? 1 : 0);
}
