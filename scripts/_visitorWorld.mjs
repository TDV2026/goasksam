// THE STORED-PICK WORLD of goLiveVisitorCheck and goLiveLiveCheck --self-test (Lane E, Nov 11 2026): Lane B's publicExamplesCheck fixture (a fake store, live rows, every example's stored pick made by the real refreshers) with the clock at NOW so the stored picks are today's, then the fake database as fetch.
import path from "node:path"; import { pathToFileURL } from "node:url";
export async function visitorWorld(root, ok = () => {}) {
  process.env.CURTAIN_CREW_CODE = "pubex-check-secret"; process.env.SUPABASE_URL = "https://fake.supabase.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "k";
  for (const k of ["PUBLIC_EXAMPLES", "FIND_EXAMPLES", "TASKS_DEMO", "FEATURED_HISTORY", "CREW_MC_EXAMPLES", "MC_EXAMPLE_SALES", "CREW_SELL_EXAMPLE", "SELL_EXAMPLE_FIELD"]) delete process.env[k];
  let vendor = 0; globalThis.fetch = async u => { if (!/fake\.supabase\.test/.test(String(u))) vendor++; return new Response("[]", { status: 200 }); };   // anything that is not the (fake) database: OldCarsData, a vendor, a photo host
  const imp = f => import(pathToFileURL(path.join(root, f)).href);
  const FE = await imp("lib/live/findExamples.js"), FH = await imp("lib/live/featuredHistory.js"), TD = await imp("lib/live/tasksDemo.js"), MCX = await imp("lib/live/marketCheckExamples.js"), PX = await imp("lib/live/publicExamples.js"), EE = await imp("lib/live/entryExamples.js"), C = await imp("lib/_crew.js"), S = await imp("lib/live/search.js");
  const API = await imp("api/publicExamples.js");
  const env = { supabaseUrl: "https://fake.supabase.test", supabaseKey: "k" };
  const CREW = "gas_crew=" + C.mintCrewCookieValue(), CREWCK = CREW, FORGED = "gas_crew=v1.9999999999.forged", PUBLIC = "";
  const NOW = Date.now(), HOUR = 3600e3, DAY = 24 * HOUR, TODAY = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(NOW)), YESTERDAY = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(NOW - DAY));
  const NAMES = Object.keys(API.READERS);
  ok("the public endpoint serves the nine examples and nothing else", JSON.stringify(NAMES) === JSON.stringify(["find", "findSales", "featured", "mcCard", "mcResult", "mcSales", "sellCard", "sellCars", "tasksEmail"]), NAMES.join(","));

  // ---- the world: a fake store, live rows, and a counter on every door that builds or spends
  let id = 0;
  const car = (make, model, year, o = {}) => ({ id: ++id, source: o.source || "bringatrailer", url: "https://auction.test/lot/" + id, photo_url: "https://img.test/p" + id + ".jpg", listing_title: `${year} ${make} ${model}`, year, make, model, vin_norm: o.vin || "VIN" + String(id).padStart(14, "0"), mileage: 20000, mileage_unit: "miles", current_bid: 60000, current_bid_usd: 60000, currency: "USD", country: "US", location: "Austin, TX", transmission: "Manual", exterior_color: "Red", body: null, status: "live", end_time: new Date(NOW + (o.h ?? 30 + id) * HOUR).toISOString(), description: "" });
  const sale = (vin, o = {}) => ({ kind: "sale", date: "2022-05-14", house: "Bring a Trailer", url: "https://bringatrailer.com/listing/" + vin + "/", image: "https://img.test/old-" + vin + ".jpg", mileage: 15000, priceUsd: 46000, vinNorm: vin, year: 2008, make: "Porsche", model: "911", ...o });
  const mk = () => {
    const w = { store: new Map(), rows: [], apps: {}, clock: NOW, selects: 0, writes: 0, builds: 0, engine: 0, head: 0, headOk: true };
    w.reset = () => { w.selects = 0; w.writes = 0; w.builds = 0; w.engine = 0; w.head = 0; vendor = 0; };
    w.d = { now: () => w.clock, head: async () => { w.head++; return w.headOk ? { status: 200, bytes: 1000, type: "image/jpeg" } : { status: 404, bytes: 0, type: "" }; },
      appearances: async (e, vin) => ({ ok: true, vinNorm: vin, appearances: w.apps[vin] || [] }), urlStatus: async () => 200, facts: async r => S.listingFacts(r),
      answer: async () => { w.engine++; w.builds++; return null; }, sellBlock: async () => { w.engine++; w.builds++; return null; }, places: async () => { w.engine++; w.builds++; return null; },
      enrich: async (e, o) => { w.engine++; return { title: FE.titleOf(o.r), end_time: o.r.end_time, url: o.r.url }; }, blocks: async () => { w.engine++; w.builds++; return []; },
      select: async (e, q) => { w.selects++; (w.queries = w.queries || []).push(q); let m = /^app_config\?key=eq\.([a-z_]+)/.exec(q); if (m) { const v = w.store.get(m[1]); return v ? [{ value: v }] : []; }
        m = /^live_listings\?id=eq\.([^&]+)/.exec(q); if (m) return w.rows.filter(r => String(r.id) === decodeURIComponent(m[1])).slice(0, 1);
        if (/^live_listings\?status=eq\.live/.test(q)) return w.rows.filter(r => r.status === "live" && r.photo_url && Date.parse(r.end_time) > w.clock);
        if (/^task_updates/.test(q)) { w.builds++; return w.updates || []; }
        if (/^tasks\?id=/.test(q)) { w.builds++; return w.taskRow ? [w.taskRow] : []; }
        if (/^vin_index\?|^sales_archive\?/.test(q)) { const m2 = /in\.\((.*)\)&/.exec(q); if (m2) return decodeURIComponent(m2[1]).replace(/"/g, "").split(",").filter(v => w.apps[v]).map(v => ({ vin_norm: v })); return []; }
        return []; },
      cardName: async (e, row) => ({ name: [row.year, row.make, row.model, "Carrera S"].join(" "), trim: "Carrera S" }),
      write: async (e, row) => { w.writes++; w.store.set(row.key, row.value); }, clear: async (e, key) => { w.store.delete(key); } };
    return w;
  };
  const vS = "VINSOLD0000000001";
  const W = mk(); W.rows = [car("Porsche", "911", 2008, { vin: vS }), car("BMW", "M3", 2006), car("Ferrari", "F430", 2007), car("BMW", "3.0 CSL", 1995)]; W.apps = { [vS]: [sale(vS)] };
  W.updates = [{ id: 7, task_id: 3, created_at: "2026-11-05T10:00:00Z", data: { cards: [{ id: W.rows[1].id, title: "1995 BMW M3 Coupe", house: "Bring a Trailer", miles: 147000, location: "West New York NJ" }] } }]; W.taskRow = { filters: { make: "BMW", year_min: 1995 }, summary: "Sam is looking for BMWs from 1995." };
  W.d.blocks = async () => [{ cardHtml: "<p>card</p>", cardText: "card", bid: 1000 }];
  // the stored picks, made the way the cron makes them (find, featured) and hand-written for the daily ones (the shapes the readers' own guards accept)
  await FE.refreshFindExamples(env, W.d); const fhr = await FH.refreshFeaturedHistory(env, W.d); await TD.refreshTasksEmailExample(env, W.d);
  const h = u => u, https = k => "https://img.test/" + k + ".jpg";
  const mcSalesData = { pickDate: TODAY, model: "2001 BMW M3", poolN: 30, line: "Three of the 30 of this model sold for $20,000 to $30,000.", sales: [1, 2, 3].map(i => ({ title: "2001 BMW M3 " + i, priceLabel: "$2" + i + ",000", milesLabel: "30,000 miles", platform: "Bring a Trailer", dateLine: "Sold October 2026", photo: https("m" + i), url: "https://auction.test/m" + i, price: 20000 + i })) };
  const mcResultData = { ...mcSalesData, result: { tier: "result", cards: mcSalesData.sales.map(s => ({ url: s.url })), cluster: [20000, 30000] } };
  const mcCardData = { pickDate: TODAY, model: "2001 BMW M3", titleLine: "2001 BMW M3", photo: https("c1"), range: { low: 20000, high: 30000 }, rangeLine: "x", countLine: "30 sales", periodLine: "in the last 12 months", recentSale: { price: 25000, priceLine: "Sold for $25,000", platform: "Bring a Trailer", milesLine: "30,000 miles", metaLine: "x", url: "https://auction.test/r1", photo: https("c2") }, resultUrl: "/market-check?q=2001%20BMW%20M3" };
  const sellCardData = { pickDate: TODAY, model: "1995 Mazda Miata", titleLine: "1995 Mazda Miata", photo: https("s1"), platformPick: { name: "Bring a Trailer", sentence: "11 of 14 relevant completed online sales were on Bring a Trailer.", mark: "BaT" }, reserve: { headline: "Reserve?", sentence: "x" }, resultUrl: "/sell?car=1995%20Mazda%20Miata" };
  const sellCarsData = { pickDate: TODAY, note: "These are sales that happened, not a promise of a price.", cars: [{ title: "1995 Mazda Miata", line: "14 sales: x", url: "/sell?car=a" }, { title: "2001 BMW M3", line: "12 sales: y", url: "/sell?car=b" }] };
  const emailData = { source: "preferred", update: { id: 1, at: "2026-11-05T10:00:00.000Z" }, subject: "A match", why: "Matches your Task: a BMW from 1995.", task: { summary: "Sam is looking for BMWs from 1995.", filters: { make: "BMW" } }, block: { cardHtml: "<p>x</p>", cardText: "x" } };
  const store = (pickDate = TODAY) => {
    const a = { ...mcSalesData, pickDate }, c = { ...mcCardData, pickDate }, s = { ...sellCardData, pickDate }, k = { ...sellCarsData, pickDate }, r = { ...mcResultData, pickDate };
    W.store.set(MCX.MC_STORE, { v: EE.STORE_V, data: r, builtAt: "x" }); W.store.set(MCX.MC_CARD_KEY, { v: EE.STORE_V, data: c, builtAt: "x" }); W.store.set(MCX.SELL_CARD_KEY, { v: EE.STORE_V, data: s, builtAt: "x" }); W.store.set(MCX.SELL_STORE, { v: EE.STORE_V, data: k, builtAt: "x" });
  };
  store();
  W.store.set(FE.FALLBACK_KEY, { v: FE.FALLBACK_V, builtAt: new Date(NOW).toISOString(), items: [1, 2, 3].map(i => ({ title: "199" + i + " Porsche 911 Carrera", platform: ["Bring a Trailer", "Cars & Bids", "PCarMarket"][i - 1], url: "https://auction.test/s" + i, photo: "https://img.test/s" + i + ".jpg", priceLabel: "Sold for $10" + i + ",000", dateLine: "Sold October 2026", live: false, fallback: true, soldAt: "2026-10-1" + i, findUrl: "/find" })) });

  const { historyRows } = await import(pathToFileURL(path.join(root, "scripts/_historyStub.mjs")).href);
  const dbRows = u => { const s = String(u); const hr = historyRows(s); if (hr) return hr; let m = /app_config\?key=eq\.([a-z_]+)/.exec(s); if (m) { const v = W.store.get(m[1]); return v ? [{ value: v }] : []; } m = /live_listings\?id=eq\.([^&]+)/.exec(s); if (m) return W.rows.filter(r => String(r.id) === decodeURIComponent(m[1])).slice(0, 1); if (/live_listings\?status=eq\.live/.test(s)) return W.rows.filter(r => r.status === "live" && r.photo_url && Date.parse(r.end_time) > Date.now()); return []; };
  globalThis.fetch = async u => new Response(JSON.stringify(/fake\.supabase\.test/.test(String(u)) ? dbRows(u) : []), { status: 200, headers: { "content-type": "application/json" } });
  process.env.LAUNCH_STAGE = "2"; delete process.env.CURTAIN_SEALED; process.env.SUPABASE_ANON_KEY = "k";
  return { W, API, NAMES, CREW, FE, C };
}
