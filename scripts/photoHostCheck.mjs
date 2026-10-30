// A DEAD PHOTO HOST IS NEVER HANDED TO A PAGE (Lane B, Oct 29 2026). pushCheck on the live head: the 1995 Porsche 911 Carrera Market Check page carried a 993 Cabriolet sale photo on d2niwqq19lf86s.cloudfront.net, which no longer resolves: a broken image on the card.
// CAUSE: the archive keeps the photo URL it was given at ingest, nothing asked whether the host still exists, and a stored answer keeps the URL it was built with. FIX: data/deadPhotoHosts.json lists hosts that fail DNS; withReadFields (every answer, stored rows too) and the
// Find card scrub them to null and the card shows its no-photo slot; the sale stays in the pool and the range. The photohosts ops read lists dead hosts with counts. This check: (1) a stored-shape answer with dead-host photos in every place the engine puts one comes out with none, and a live host's photo
// is untouched; (2) the pool and range are the same with and without the dead photo (the sale counts); (3) a Find card's photo_url is scrubbed; (4) every property name that carries a picture in lib and api is one the scrub reads; (5) the dead host named by pushCheck is listed.
//   node scripts/photoHostCheck.mjs [repo root]
import fs from "node:fs";
import path from "node:path"; import { fileURLToPath, pathToFileURL } from "node:url";
const root = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
process.chdir(root);
process.env.SUPABASE_URL = "https://fake.supabase.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "k"; process.env.LAUNCH_STAGE = "2";
let fail = 0; const ok = (n, c, d) => { if (!c) fail++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`); };
const E = await import(pathToFileURL(path.join(root, "lib/onebox.js")).href), P = await import(pathToFileURL(path.join(root, "lib/photoHosts.js")).href).catch(() => null);
const DEAD = "https://d2niwqq19lf86s.cloudfront.net/uploads/993-cabriolet.jpg", LIVE = "https://media.carsandbids.com/ok.jpg";
const answer = () => ({ tier: "result", poolN: 10, soldCount: 10, cluster: [40000, 52000], optionsState: null, windowWords: "since November 2025",
  rawPool: Array.from({ length: 10 }, (_, i) => ({ id: "r" + i, _usd: 40000 + i * 1500, image: i === 0 ? DEAD : LIVE })),
  cards: [{ title: "1995 Porsche 911 Carrera Cabriolet", image: DEAD, price: 41000 }, { title: "1995 911", image: LIVE, price: 42000 }],
  recent3: [{ title: "x", image: DEAD }], ownSales: { sales: [{ photo: DEAD }] }, photos: [DEAD, LIVE], extraPhoto: DEAD, closest: { image: DEAD }, factsBlock: { count: 10 } });
const d = E.withReadFields(answer(), "1995 Porsche 911 Carrera", { year: 1995 }), flat = JSON.stringify(d);
ok("lib/photoHosts.js exists and lists the dead host pushCheck named", !!P && P.photoHostDead(DEAD) && !P.photoHostDead(LIVE));
ok("no dead-host photo is left anywhere in a served answer (cards, recent3, rawPool, ownSales, photo lists, closest)", !flat.includes("d2niwqq19lf86s"), flat.match(/.{40}d2niwqq19lf86s.{20}/) && flat.match(/.{40}d2niwqq19lf86s.{20}/)[0]);
ok("a live host's photo is untouched", d.cards[1].image === LIVE && d.rawPool[1].image === LIVE && d.photos.length === 1 && d.photos[0] === LIVE);
ok("the dead photo becomes null (the card's no-photo slot), the sale stays", d.cards[0].image === null && d.cards[0].title === "1995 Porsche 911 Carrera Cabriolet" && d.rawPool.length === 10 && d.rawPool[0].image === null);
ok("the pool and the range are the same with and without the dead photo", d.poolN === 10 && JSON.stringify(d.cluster) === JSON.stringify([40000, 52000]) && E.withReadFields({ ...answer(), rawPool: answer().rawPool.map(r => ({ ...r, image: LIVE })), cards: [], recent3: [], ownSales: undefined, photos: [], closest: undefined }, "x", { year: 1995 }).poolN === 10);
{ const S = await import(pathToFileURL(path.join(root, "api/buySearch.js")).href), c = S.cardOf({ r: { id: 1, source: "bringatrailer", listing_title: "1995 Porsche 911", photo_url: DEAD, url: "https://x/y", year: 1995, make: "Porsche", end_time: null, has_reserve: null }, facts: { priceUsd: null, priceState: "none", gearboxLabel: null }, gen: null, unknown: [] });
  ok("a Find card's photo_url on a dead host is null", c.photo_url === null, String(c.photo_url)); }
// every property that names a picture is one the scrub reads (it reads any name with image, photo, img or thumb in it)
{ const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? (/node_modules|\.git/.test(e.name) ? [] : walk(path.join(d, e.name))) : /\.js$/.test(e.name) ? [path.join(d, e.name)] : []);
  const names = new Set(); for (const f of [...walk("lib"), ...walk("api")]) for (const m of fs.readFileSync(f, "utf8").replace(/\/\/[^\n]*/g, "").matchAll(/\b([A-Za-z_]*(?:[Ii]mage|[Pp]hoto|[Tt]humb|[Ii]mg)[A-Za-z_]*)\s*:/g)) names.add(m[1]);
  const read = [...names].filter(n => /(image|photo|img|thumb)/i.test(n));
  ok(`every picture-bearing property name (${read.length}) is read by the scrub`, read.length === names.size, [...names].filter(n => !/(image|photo|img|thumb)/i.test(n)).join(",")); }
{ const src = fs.readFileSync("api/usageDashboard.js", "utf8"); ok("the photohosts ops read exists, read only (no write call inside it)", /task === "photohosts"/.test(src) && !/photohosts[\s\S]{0,2600}(method: "POST"|supabaseInsert|supabasePatch)/.test(src)); }
console.log(fail ? `photoHostCheck: ${fail} failure(s)` : "photoHostCheck: all pass");
process.exit(fail ? 1 : 0);
