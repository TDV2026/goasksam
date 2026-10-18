// The partner demo's sale photo proxy (lib/_salePhoto.js, api/partnerAnswer.js ?photo=), offline: only an archive id is
// accepted, only a public https image address is fetched, redirects stay on the same host, non-images and oversize
// bodies are refused, the response carries no address or venue header, and the page only ever names ?photo=<id>.
// node scripts/salePhotoCheck.mjs
import fs from "node:fs";
import { photoId, safeImageUrl, fetchPhoto } from "../lib/_salePhoto.js";
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
ok(photoId("123456") === "123456" && photoId(42) === "42", "a plain archive id is accepted");
ok(photoId("1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d") === "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d" && photoId("1A2B3C4D-5E6F-4A7B-8C9D-0E1F2A3B4C5D") === "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d", "the archive's UUID id is accepted (lower-cased)");
for (const bad of ["1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5", "1a2b3c4d5e6f4a7b8c9d0e1f2a3b4c5d", "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d/x", "g a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d"]) ok(photoId(bad) === null, "refused as an id: " + JSON.stringify(bad));
for (const bad of ["https://example.com/a.jpg", "12a", "-1", "1 2", "", null, "../1", "1;drop", "1".repeat(16), "//evil.test/x"]) ok(photoId(bad) === null, "refused as an id: " + JSON.stringify(bad));
ok(!!safeImageUrl("https://images.example.com/a/b.jpg"), "a public https image address passes");
for (const bad of ["http://images.example.com/a.jpg", "https://127.0.0.1/a.jpg", "https://[::1]/a.jpg", "https://10.0.0.5/x", "https://localhost/x", "https://user:pw@images.example.com/a.jpg", "https://images.example.com:8443/a.jpg", "https://intranet/x", "https://box.internal/x", "file:///etc/passwd", "javascript:alert(1)"]) ok(!safeImageUrl(bad), "refused address: " + bad);
const res = (status, headers, bytes) => ({ status, headers: new Headers(headers), body: bytes == null ? null : new Blob([bytes]).stream() });
const u = safeImageUrl("https://images.example.com/a.jpg");
const jpg = new Uint8Array(1000).fill(7);
let r = await fetchPhoto(u, { fetchImpl: async () => res(200, { "content-type": "image/jpeg" }, jpg) });
ok(r && r.type === "image/jpeg" && r.body.length === 1000, "an image is returned with its type and bytes only");
ok(r && Object.keys(r).sort().join() === "body,type", "the result carries no address and no venue header");
r = await fetchPhoto(u, { fetchImpl: async () => res(200, { "content-type": "text/html" }, jpg) }); ok(r === null, "a non-image is refused");
r = await fetchPhoto(u, { fetchImpl: async () => res(200, { "content-type": "image/svg+xml" }, jpg) }); ok(r === null, "an SVG (script-capable) is refused");
r = await fetchPhoto(u, { maxBytes: 500, fetchImpl: async () => res(200, { "content-type": "image/jpeg" }, jpg) }); ok(r === null, "a body over the cap is refused");
r = await fetchPhoto(u, { maxBytes: 500, fetchImpl: async () => res(200, { "content-type": "image/jpeg", "content-length": "1000" }, jpg) }); ok(r === null, "a declared length over the cap is refused");
r = await fetchPhoto(u, { fetchImpl: async () => res(404, { "content-type": "image/jpeg" }, jpg) }); ok(r === null, "a missing photo is refused");
let hops = 0;
r = await fetchPhoto(u, { fetchImpl: async href => { hops++; return href.endsWith("/b.jpg") ? res(200, { "content-type": "image/webp" }, jpg) : res(302, { location: "/b.jpg" }); } });
ok(r && r.type === "image/webp" && hops === 2, "a redirect on the same host is followed");
r = await fetchPhoto(u, { fetchImpl: async () => res(302, { location: "https://other.example.net/b.jpg" }) }); ok(r === null, "a redirect to another host is refused");
r = await fetchPhoto(u, { fetchImpl: async () => res(302, { location: "https://127.0.0.1/b.jpg" }) }); ok(r === null, "a redirect to an internal address is refused");
r = await fetchPhoto(u, { fetchImpl: async href => res(302, { location: href }) }); ok(r === null, "a redirect loop ends in a refusal");
const t0 = Date.now();
r = await fetchPhoto(u, { timeoutMs: 200, fetchImpl: (href, o) => new Promise((_, rej) => o.signal.addEventListener("abort", () => rej(new Error("aborted")))) });
ok(r === null && Date.now() - t0 < 1500, "a slow photo is refused at the deadline");
r = await fetchPhoto(u, { fetchImpl: async () => { throw new Error("network"); } }); ok(r === null, "a network error is refused");
const lib = fs.readFileSync(new URL("../lib/_salePhoto.js", import.meta.url), "utf8");
ok(/PHOTO_TIMEOUT_MS = 4000/.test(lib) && /sales_archive\?id=eq\.\$\{id\}&select=image:raw_record->>featured_image_url&limit=1/.test(lib), "one primary-key read, a 4 s deadline");
const api = fs.readFileSync(new URL("../api/partnerAnswer.js", import.meta.url), "utf8");
const page = fs.readFileSync(new URL("../api/partnerDemo.js", import.meta.url), "utf8");
const gate = api.indexOf("if (!partnerAllowed(req)) return res.status(404)"), photo = api.indexOf("if (req.method === \"GET\" && req.query && req.query.photo != null)");
ok(gate > 0 && photo > gate, "the photo branch sits behind the crew-or-partner gate (no session: 404)");
ok(api.indexOf('res.setHeader("X-Robots-Tag", "noindex, nofollow")') > 0 && api.indexOf('res.setHeader("X-Robots-Tag", "noindex, nofollow")') < photo, "the photo response is noindex");
const block = api.slice(photo, photo + 1400);
ok(/checkCeiling\(env, req, "partner_photo"/.test(block) && !/market_check_search/.test(block), "the photo has its own ceiling, never Market Check's");
ok(!/setHeader\("(Location|Content-Disposition|X-Source|Link)"/.test(block) && /Cache-Control", "private, max-age=2592000/.test(block) && !/res\.json\(|url\.href|\.href\)/.test(block.replace("photoUrlFor", "")), "no address, filename or venue header; a long private cache");
const srcs = [...page.matchAll(/src="\/[^"']*/g)].map(m => m[0]);
ok(srcs.every(x => /^src="\/(partner-demo\?img=hero|api\/partnerAnswer\?photo=)$/.test(x)), "the page names only the hero and /api/partnerAnswer?photo=<id> (" + [...new Set(srcs)].join(" ") + ")");
ok(!/partner-demo\?photo=/.test(page) && !/\/api\/salePhoto/.test(page), "no other photo path and no new public path");
// Every demo car in every view (Sam, Oct 18 2026): the only images are the sales' photos through ?photo=<id> and, for the
// 2015 GT3 with its listing detail only, the listing's own hero; no other car shows a photo that is not its sales'.
{ const { pageHtml } = await import("../api/partnerDemo.js"), { DEMO_CARS } = await import("../api/partnerAnswer.js");
  DEMO_CARS.forEach((car, i) => ["a", "b", "c", "d"].forEach(v => {
    const h = pageHtml(v, i), all = [...h.matchAll(/src="([^"']*)/g)].map(m => m[1]);
    ok(all.every(x => x === "/partner-demo?img=hero" || x === "/api/partnerAnswer?photo="), `${car}, view ${v}: only the sales' photo path and the listing hero (${[...new Set(all)].join(" ")})`);
    ok(i === 0 ? all.includes("/partner-demo?img=hero") : !all.includes("/partner-demo?img=hero"), `${car}, view ${v}: the hero ${i === 0 ? "stays with the 2015 GT3 listing" : "is never shown for another car"}`);
    ok(/'<img data-ph src="\/api\/partnerAnswer\?photo=' \+ encodeURIComponent\(s\.photo\)/.test(h), `${car}, view ${v}: the sales list draws each sale's own photo by id`);
  })); }
const { CEILINGS } = await import("../lib/_ceilings.js");
const pp = CEILINGS.partner_photo, m = pp && pp.device.find(([w]) => w === 60e3);
ok(pp && m && m[1] >= 40 && pp.address, "partner_photo allows a view plus Show more several times a minute, per device and per address");
console.log(`salePhotoCheck: ${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
