// Lane C's hand back (Nov 10 2026): the preview report had no photo on page 1 because the preview context's fetchImage returned null. This builds the demonstration report through the preview door, offline, with a fetch that serves the repo's own JPEG for an allowed listing host, and asserts:
// the PDF holds an image on page 1 (the cover), the fetch is https only and limited to the listing photo hosts, it refuses a non-image, a file over the 600 KB photo rule and a slow host, and it never reaches an address that is not listed.
import fs from "node:fs"; import path from "node:path"; import { fileURLToPath, pathToFileURL } from "node:url";
const ROOT = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
const U = f => import(pathToFileURL(path.join(ROOT, f)).href);
let pass = 0, fail = 0; const ok = (n, c) => { if (c) pass++; else { fail++; console.log("FAIL " + n); } };
const JPG = fs.readFileSync(path.join(ROOT, "public/img/sell/specialist.jpg")), calls = [];
const resp = (body, type = "image/jpeg", status = 200, withLength = true) => ({ ok: status === 200, status, headers: { get: k => ({ "content-type": type, ...(withLength ? { "content-length": String(body.length) } : {}) })[String(k).toLowerCase()] }, arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.length) });
globalThis.fetch = async (u, o) => { calls.push(String(u)); const h = new URL(String(u)).hostname;
  if (h === "bringatrailer.com") return resp(JPG);
  if (h === "carsandbids.com") return resp(Buffer.from("<html>not an image</html>"), "text/html");
  if (h === "pcarmarket.com") return resp(Buffer.alloc(700 * 1024, 1), "image/jpeg", 200, false);
  if (h === "rmsothebys.com") return resp(Buffer.alloc(700 * 1024, 1));
  if (h === "hagerty.com") return new Promise((_, rej) => o.signal.addEventListener("abort", () => rej(new Error("aborted"))));
  return resp(JPG); };
const P = await U("lib/preview/deskPreview.js"), I = await U("lib/preview/previewImage.js"), { DEMO_ID } = await U("lib/preview/deskV3Fixture.js"), { DEMO_CAR } = await U("lib/desk/demoCar.js");
P.resetPreviewStore();
const r = await P.previewDeskApi({ action: "case_pdf", id: DEMO_ID, draft: true });
ok("the preview door builds the demonstration report", r && r.ok && r.pdf_b64);
const pdf = Buffer.from(r.pdf_b64 || "", "base64"), s = pdf.toString("latin1");
ok("the PDF holds an image object", /\/Subtype \/Image/.test(s));
const pg1 = (/\d+ 0 obj\n<<[^>]*\/Type \/Page\b(?!s)[\s\S]*?>>\nendobj/.exec(s) || [""])[0];
ok("page 1 draws an image (the cover), not only a pale band", /\/XObject/.test(pg1) && /\/Im\d+/.test(pg1));
ok("the cover was fetched from the demo car's own listing photo address", calls.some(u => u.split("?")[0] === DEMO_CAR.photoUrl.split("?")[0]));
const f = I.previewFetchImage();
calls.length = 0;
ok("http is refused, and nothing is fetched", (await f("http://bringatrailer.com/x.jpg")) === null && calls.length === 0);
ok("a host that is not listed is refused, and nothing is fetched", (await f("https://evil.example.com/x.jpg")) === null && (await f("https://bringatrailer.com.evil.example.com/x.jpg")) === null && calls.length === 0);
ok("a non-https scheme is refused", (await f("file:///etc/passwd")) === null && (await f("ftp://bringatrailer.com/x")) === null && calls.length === 0);
ok("a listed host's page that is not an image is refused", (await f("https://carsandbids.com/x.jpg")) === null);
ok("a file over the 600 KB photo rule is refused, whether or not the host says its length", (await f("https://pcarmarket.com/x.jpg")) === null && (await f("https://rmsothebys.com/x.jpg")) === null);
{ const t0 = Date.now(); const g = I.previewFetchImage({ timeoutMs: 80 }); ok("a host that never answers is dropped at the abort", (await g("https://hagerty.com/x.jpg")) === null && Date.now() - t0 < 2000); }
ok("a listed host serves its picture", (await f("https://www.bringatrailer.com/x.jpg")) !== null && (await f("https://bringatrailer.com/x.jpg")).length === JPG.length);
ok("an inline data: logo is decoded", (await f("data:image/png;base64," + Buffer.from("abc").toString("base64"))).toString() === "abc");
const src = fs.readFileSync(path.join(ROOT, "lib/preview/deskPreview.js"), "utf8");
ok("no desk preview context passes a stub fetchImage", !/fetchImage:\s*(async\s*)?\(\s*\)\s*=>\s*(null|undefined)/.test(src) && !/fetchImage:\s*async\s*\(\)\s*=>/.test(src));
console.log(`deskPreviewImageCheck: ${pass} pass, ${fail} FAIL`); process.exit(fail ? 1 : 0);
