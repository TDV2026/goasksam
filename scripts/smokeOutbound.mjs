// Part 6 smoke: the tracked outbound redirect and the authenticated read path.
// Runs against prod (or FLOW_BASE). The click-log TABLE is a manual step
// (docs/supabase-outbound-clicks.sql); /out still 302s before it exists, so these
// checks do not depend on the table. Row-content verification is done via the
// read path once the table exists (and needs USAGE_DASHBOARD_KEY).
const BASE = process.env.FLOW_BASE || "https://goasksam.vercel.app";
let failures = 0;
const check = (name, ok, detail = "") => { console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  ->  " + detail}`); if (!ok) failures++; };

// Raw fetch with NO redirect following, so we can inspect the 302 Location.
async function head(path) {
  const res = await fetch(`${BASE}${path}`, { redirect: "manual" });
  return { status: res.status, location: res.headers.get("location") || "" };
}

const ctx = "s=q_test&sid=s_testsession&card=pick&year=2006&make=Ford&model=Focus&trim=&location=California&rung=any_year_model&reason=&pref=diy";

// 1. Continue: 302 to the platform URL with opaque UTMs, and NO identifying data.
{
  const r = await head(`/out?p=bringatrailer&${ctx}`);
  const loc = r.location;
  check("out: continue redirects 302", r.status === 302, `status=${r.status}`);
  check("out: Location is the Bring a Trailer submit page", loc.startsWith("https://bringatrailer.com/submit-a-vehicle/"), loc);
  check("out: Location carries all three referral UTMs", /utm_source=goasksam/.test(loc) && /utm_medium=referral/.test(loc) && /utm_campaign=seller_recommendation/.test(loc), loc);
  check("out: Location leaks NO identifying/opaque data to the platform", !/s_testsession|q_test|sid=|session|California|Focus|pref=|search/i.test(loc), loc);
}

// 2. Abandon beacon: log only, no redirect.
{
  const r = await head(`/out?p=bringatrailer&${ctx}&outcome=abandoned&beacon=1`);
  check("out: abandon beacon returns 204 with no Location", r.status === 204 && !r.location, `status=${r.status} loc=${r.location}`);
}

// 3. Unknown platform never open-redirects to an arbitrary URL.
{
  const r = await head(`/out?p=evil%3A%2F%2Fattacker.example&${ctx}`);
  check("out: unknown platform does not open-redirect (goes home)", r.status === 302 && (r.location === "/" || r.location.endsWith("/")), `status=${r.status} loc=${r.location}`);
}

// 4. Read path is NOT public: it must never serve data without a valid key.
// Without the key it is 401 (key configured, none provided) or 500 (key not yet
// set in Vercel, same as the usage dashboard) - either way, no data is served.
{
  const noKey = await fetch(`${BASE}/api/outboundClicks`);
  const noKeyBody = await noKey.text();
  check("read path: serves no data without a key (not public)", [401, 500].includes(noKey.status) && !/<table/i.test(noKeyBody), `status=${noKey.status}`);
  const wrongKey = await fetch(`${BASE}/api/outboundClicks?key=definitely-wrong-key`);
  const wrongBody = await wrongKey.text();
  check("read path: serves no data with a wrong key", [401, 500].includes(wrongKey.status) && !/<table/i.test(wrongBody), `status=${wrongKey.status}`);
}

console.log(failures ? `\n${failures} FAILURE(S)` : "\nOUTBOUND ALL PASS");
process.exit(failures ? 1 : 0);
