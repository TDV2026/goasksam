// clock: real-ok every clock in these worlds is a fixed date passed in (Lane B, Nov 2026)
// THE TEST WORLD OF mcExamplesCheck AND sellExampleCheck (Lane B, Nov 8 2026): no database, no network. An in-memory app_config store, a clock, a HEAD that can fail a photo, an engine that answers pools and Sell places by model text.
import path from "node:path"; import { pathToFileURL } from "node:url";
export async function load(ROOT) {
  process.chdir(ROOT);
  process.env.CURTAIN_CREW_CODE = "mcx-check-secret"; process.env.SUPABASE_URL = "https://fake.supabase.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "k";
  for (const k of ["CREW_MC_EXAMPLES", "CREW_SELL_EXAMPLE", "MC_EXAMPLE_SALES", "SELL_EXAMPLE_FIELD"]) delete process.env[k];
  const W = { metered: 0 };
  globalThis.fetch = async u => { if (/oldcarsdata\.com\/auctions/.test(String(u))) W.metered++; return new Response("[]", { status: 200 }); };
  const imp = f => import(pathToFileURL(path.join(ROOT, f)).href);
  W.EE = await imp("lib/live/entryExamples.js"); W.MX = await imp("lib/live/marketCheckExamples.js"); W.C = await imp("lib/_crew.js"); W.M = await imp("lib/preview/mcSellPreview.js"); W.RW = await imp("lib/reasonWords.js");
  W.env = { supabaseUrl: "https://fake.supabase.test", supabaseKey: "k" };
  W.CREW = { headers: { cookie: "gas_crew=" + W.C.mintCrewCookieValue() } }; W.NOCREW = { headers: {} };
  W.D1 = Date.parse("2026-11-09T20:00:00Z"); W.DAY = 864e5;
  let uid = 0;
  W.card = (miles, price, o = {}) => ({ id: ++uid, title: "2001 BMW M3", price, mi: miles, milesHidden: false, platformName: "Bring a Trailer", platform: "Bring a Trailer", date: "2026-0" + (1 + (uid % 9)) + "-1" + (uid % 9), image: "https://img.test/m" + uid + ".jpg", url: "https://bringatrailer.com/listing/m3-" + uid + "/", ...o });
  W.pool = (len, o = {}) => Array.from({ length: len }, (_, i) => W.card(20000 + i * 9000, 52000 - i * 2600, o));
  W.places = (n = 3) => ({ cohort_name: "2008 Porsche 911", window_label: "in the last 24 months", places: [{ name: "Bring a Trailer", house: false, sales: 9, most_sold_between: [60000, 80000] }, { name: "Cars & Bids", house: false, sales: 5, most_sold_between: null }, { name: "RM Sotheby's", house: true, sales: n, most_sold_between: null }] });
  W.world = (poolsByText, placesByText, now = W.D1) => {
    W.EE.resetRetryGuard(); W.MX.resetRecheck();
    const w = { store: new Map(), clock: now, asked: [], heads: {} };
    w.d = { now: () => w.clock, head: async u => (u in w.heads ? w.heads[u] : { status: 200, bytes: 1000, type: "image/jpeg" }),
      select: async (e, q) => { const m = /^app_config\?key=eq\.([a-z_]+)/.exec(q); if (m) { const v = w.store.get(m[1]); return v ? [{ value: v }] : []; } return []; },
      write: async (e, row) => { w.store.set(row.key, row.value); },
      answer: async (e, text) => { w.asked.push(text); const p = poolsByText[text]; return p ? { tier: "result", cards: p } : null; },
      places: async (e, text) => { w.asked.push(text); return placesByText[text] || null; } };
    return w;
  };
  W.ALLMC = c => Object.fromEntries(W.EE.MC_CANDIDATES.map(t => [t, c]));
  W.ALLSELL = c => Object.fromEntries(W.EE.SELL_CANDIDATES.map(t => [t, c]));
  return W;
}
