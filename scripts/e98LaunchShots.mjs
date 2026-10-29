// The withheld layout, three cars, desktop and phone, logged out and signed in (Sam, Oct 29 2026). Fixture answers through the real page code (the engine's sentence, its own newest-first rows); node scripts/e98LaunchShots.mjs docs/screens/launch
import { MC } from "./e98Fixtures.mjs";
import { startBrowser, openMC } from "./e98Render.mjs";
const out = process.argv[2] || "docs/screens/launch", MIX = "The mix of cars changed from quarter to quarter, so a change here would not show the market moving.";
const held = fx => ({ ...fx, d: (({ trend, trendHeld, chartCaption, chartWindowLine, ...r }) => ({ ...r, chart: { type: "withheld", scope: null, buckets: null, note: MIX, withheld: { reason: "mix_changes", line: null }, n: 17 } }))(fx.d) });
const P94 = MC["1994 Porsche 911 Carrera Cabriolet (27,000 typed, thin band)"], P95 = held({ ...P94, typed: "1995 Porsche 911", d: JSON.parse(JSON.stringify(P94.d).replace(/\b1994\b/g, "1995")) });
const CARS = { "1995-porsche-911": P95, "2004-bmw-m3": held(MC["2004 BMW M3 (split)"]), "1986-porsche-911-carrera": held(MC["1986 Porsche 911 (Targa 11, Cabriolet 11, Coupe 16 against 35)"]) };
const SIGNED = { gas_auth_session: JSON.stringify({ access_token: "tok", expires_at: 9999999999, user: { email: "sam@example.com" } }) };
const b = await startBrowser();
for (const [name, fx] of Object.entries(CARS)) for (const [w, wn] of [[1440, "desktop"], [390, "phone"]]) for (const [st, sn] of [[null, "logged-out"], [SIGNED, "signed-in"]]) {
  const ctx = await b.createBrowserContext(), p = await openMC(ctx, fx, w, { storage: st }), f = `${out}/${name}-${wn}-${sn}.png`; await p.screenshot({ path: f, fullPage: true }); console.log(f); await p.close(); await ctx.close(); }
await b.close();
