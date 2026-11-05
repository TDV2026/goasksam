// DESK INBOUND WEBHOOK SIGNATURE (Lane D, Nov 4 2026). Resend signs email.received with the Svix scheme; /api/deskInbound answered 401 "bad signature" to real
// deliveries. The class: every way a genuine, signed delivery can be refused (body re-stringified or re-decoded, secret with whitespace, quotes or no prefix, header
// with several entries) and every way a forged one could pass (changed byte, wrong secret, stale timestamp). Offline; the secret is made up.
//   node scripts/signedWebhookCheck.mjs [repo root]   (a tree without the fix fails: scripts/intakeFailsWithout.mjs)
import path from "node:path"; import crypto from "node:crypto"; import { fileURLToPath, pathToFileURL } from "node:url";
const root = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
process.chdir(root);
let pass = 0, fail = 0; const ok = (n, c, d) => { if (c) pass++; else { fail++; console.log("FAIL " + n + (d ? " " + JSON.stringify(d) : "")); } };
const W = await import(pathToFileURL(path.join(root, "lib/desk/intake/resendInbound.js")).href);
const { verifyWebhook, signWebhook } = W;
const b64 = crypto.randomBytes(24).toString("base64"), secret = "whsec_" + b64;
const now = Date.now(), ts = String(Math.floor(now / 1000)), id = "msg_2abc";
// a realistic payload: non ASCII (accents, a Porsche "ß", an emoji, a curly quote), an attachments array, uneven spacing and a tab
const raw = '{"type":"email.received","created_at":"2026-11-04T12:00:00.000Z","data":{"email_id":"em_1","from":"Zoë Müller <zoe@hagerty.example>","subject":"Fwd: 1987 Porsche 911 Carrera – “Grand Prix White” 🚗","to":["hagerty@desk.goasksam.com"],"attachments":[{"id":"a1","filename":"Straße-IMG_0001.HEIC","content_type":"image/heic","size":1234567},{"id":"a2","filename":"service.pdf","content_type":"application/pdf","size":88}],\t"note":"naïve  spacing"}}';
const hdr = (r, t = ts, i = id, s = secret) => ({ "svix-id": i, "svix-timestamp": t, "svix-signature": signWebhook(r, i, t, s) });
// signed independently of the code under test, so the check does not just agree with itself
const ref = (r, i, t, k) => "v1," + crypto.createHmac("sha256", Buffer.from(k, "base64")).update(`${i}.${t}.${r}`).digest("base64");

ok("valid, fresh, signed by the reference scheme, passes", verifyWebhook(raw, { "svix-id": id, "svix-timestamp": ts, "svix-signature": ref(raw, id, ts, b64) }, secret, now).ok);
ok("valid passes when the body arrives as the raw Buffer of bytes", verifyWebhook(Buffer.from(raw, "utf8"), hdr(raw), secret, now).ok);
ok("a one byte body change fails", !verifyWebhook(raw.replace("em_1", "em_2"), hdr(raw), secret, now).ok);
ok("a changed non ASCII character fails", !verifyWebhook(raw.replace("Müller", "Muller"), hdr(raw), secret, now).ok);
{ const w = verifyWebhook(raw, hdr(raw, ts, id, "whsec_" + crypto.randomBytes(24).toString("base64")), secret, now); ok("the wrong secret fails with no_matching_signature", !w.ok && w.reason === "no_matching_signature", w); }
{ const old = String(Number(ts) - 600), w = verifyWebhook(raw, hdr(raw, old), secret, now); ok("a stale timestamp (ten minutes) fails with stale_timestamp", !w.ok && w.reason === "stale_timestamp", w); }
ok("a timestamp four minutes old still passes (five minute tolerance)", verifyWebhook(raw, hdr(raw, String(Number(ts) - 240)), secret, now).ok);
ok("a future timestamp past five minutes fails", !verifyWebhook(raw, hdr(raw, String(Number(ts) + 600)), secret, now).ok);
{ const re = JSON.stringify(JSON.parse(raw)); ok("the test body really differs once re-stringified", re !== raw);
  ok("a re-stringified body (different spacing) fails", !verifyWebhook(re, hdr(raw), secret, now).ok);
  ok("a body decoded as latin1 and re-encoded fails (bytes are not re-decoded)", !verifyWebhook(Buffer.from(raw, "latin1"), hdr(raw), secret, now).ok); }
ok("the secret with the whsec_ prefix works", verifyWebhook(raw, hdr(raw), "whsec_" + b64, now).ok);
ok("the secret without the prefix works", verifyWebhook(raw, hdr(raw), b64, now).ok);
ok("the secret with a trailing newline works", verifyWebhook(raw, hdr(raw), secret + "\n", now).ok);
ok("the secret with surrounding spaces works", verifyWebhook(raw, hdr(raw), "  " + secret + "  ", now).ok);
ok("the secret wrapped in double quotes works", verifyWebhook(raw, hdr(raw), '"' + secret + '"', now).ok);
ok("the secret wrapped in single quotes, no prefix, works", verifyWebhook(raw, hdr(raw), "'" + b64 + "'", now).ok);
{ const good = signWebhook(raw, id, ts, secret), h = { "svix-id": id, "svix-timestamp": ts };
  ok("several entries in the header: the matching one is found after a bad one", verifyWebhook(raw, { ...h, "svix-signature": "v1,AAAA v1," + good.slice(3) }, secret, now).ok);
  ok("several entries: a v2 entry and the v1 match", verifyWebhook(raw, { ...h, "svix-signature": "v2,AAAA " + good }, secret, now).ok);
  ok("only a bad entry fails", !verifyWebhook(raw, { ...h, "svix-signature": "v1,AAAAAAAA" }, secret, now).ok);
  ok("header names in any letter case are read", verifyWebhook(raw, { "Svix-Id": id, "SVIX-TIMESTAMP": ts, "Svix-Signature": good }, secret, now).ok); }
{ const r1 = verifyWebhook(raw, {}, secret, now), r2 = verifyWebhook(raw, hdr(raw), "", now), r3 = verifyWebhook(raw, hdr(raw), '" "', now);
  ok("no headers: missing_headers", !r1.ok && r1.reason === "missing_headers", r1);
  ok("no secret: secret_missing", !r2.ok && r2.reason === "secret_missing", r2);
  ok("a secret that is only quotes and space: secret_missing", !r3.ok && r3.reason === "secret_missing", r3); }
ok("the reasons carry no secret, signature or body text", ["missing_headers", "stale_timestamp", "no_matching_signature", "secret_missing"].every(c => /^[a-z_]+$/.test(c)));

// the route itself: the handler must verify the bytes that arrived, and name its refusal
process.env.DESK_INBOUND_WEBHOOK_SECRET = secret; delete process.env.SUPABASE_URL; delete process.env.RESEND_API_KEY;
const handler = (await import(pathToFileURL(path.join(root, "api/deskInbound.js")).href)).default;
const cfg = (await import(pathToFileURL(path.join(root, "api/deskInbound.js")).href)).config;
ok("the route turns the body parser off", cfg && cfg.api && cfg.api.bodyParser === false, cfg);
async function call(req) {
  const out = { code: 0, json: null, headers: {} };
  const res = { setHeader: (k, v) => { out.headers[k] = v; }, status(c) { out.code = c; return this; }, json(j) { out.json = j; return this; } };
  const warns = []; const w = console.warn; console.warn = (...a) => warns.push(a.join(" "));
  try { await handler(req, res); } finally { console.warn = w; }
  return { ...out, warns };
}
const stream = (chunks, extra = {}) => ({ method: "POST", headers: hdr(raw, String(Math.floor(Date.now() / 1000))), async *[Symbol.asyncIterator]() { for (const c of chunks) yield c; }, ...extra });
{ const bytes = Buffer.from(raw, "utf8"), mid = 41; // split mid-stream, and inside a multi byte character on purpose
  const cut = bytes.indexOf(Buffer.from("ü")) + 1;
  const r = await call(stream([bytes.subarray(0, cut), bytes.subarray(cut)]));
  ok("route: a signed delivery split across chunks (inside a multi byte character) is not refused as a bad signature", r.code !== 401, { code: r.code, json: r.json });
  const s = await call(stream([raw], {}));
  ok("route: a signed delivery arriving as string chunks is not refused", s.code !== 401, { code: s.code }); }
{ const r = await call({ method: "POST", headers: { ...hdr(raw, String(Math.floor(Date.now() / 1000))) }, async *[Symbol.asyncIterator]() {}, body: JSON.parse(raw) });
  ok("route: a body the platform already parsed is refused with reason and source, not a bare message", r.code === 401 && r.json && r.json.reason === "no_matching_signature" && r.json.body === "reparsed", r.json); }
{ const t = String(Math.floor(Date.now() / 1000)), r = await call({ method: "POST", headers: { "svix-id": id, "svix-timestamp": t, "svix-signature": signWebhook(raw, id, t, secret) }, async *[Symbol.asyncIterator]() { yield Buffer.from(raw.replace("em_1", "em_9")); } });
  ok("route: a changed body is 401 and the log line holds a reason code only", r.code === 401 && r.warns.length === 1 && /reason=no_matching_signature/.test(r.warns[0]) && !r.warns[0].includes(b64) && !r.warns[0].includes("Müller") && !r.warns[0].includes(signWebhook(raw, id, t, secret)), r.warns);
  const m = await call({ method: "POST", headers: {}, async *[Symbol.asyncIterator]() { yield Buffer.from(raw); } });
  ok("route: missing headers log missing_headers", m.code === 401 && m.json.reason === "missing_headers" && /reason=missing_headers/.test(m.warns[0] || ""), m); }
console.log(`signedWebhookCheck: ${pass} pass, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
