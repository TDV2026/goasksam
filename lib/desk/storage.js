// Sam Desk Valuations: per-org private storage for submission photos and documents (Lane S, Nov 4 2026).
// =====================================================================
// Spec: docs/desk-valuations-spec.md "Photos and documents" and "Saving per seat and org".
//   - ONE private bucket per org, "desk-<org>"; every object lives under "<org>/<sheet>/...".
//   - Photos and documents come from the SUBMISSION only. Originals are kept as received; the resized copy is
//     what the sheet and the report use (the resizing and HEIC conversion happen upstream, in intake).
//   - The service role writes; a seat reads only its own org (RLS in docs/supabase-desk-storage.sql). This module
//     also refuses at the application layer: every function that touches a sheet first checks the sheet belongs to
//     the org the caller is acting for, so a wrong org id can never reach another org's objects.
//   - A sheet's objects and rows are deleted TOGETHER (deleteSheetEverywhere), storage first and rows second, every
//     path logged (desk_deletion_log is written by a database trigger, so even a code path that forgets still logs).
// No figure is computed here. Server-side only: the service role key never reaches a browser.
import crypto from "node:crypto";
import { supabaseSelect, supabaseInsert, supabaseFetch } from "../_supabase.js";

export const ORG_RE = /^[a-z0-9][a-z0-9-]{1,38}$/;
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const MAX_OBJECT_BYTES = 25 * 1024 * 1024;
export const PHOTO_ORIGINAL_TYPES = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic", "image/heif": "heif" };
export const PHOTO_RESIZED_TYPES = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
export const DOCUMENT_TYPES = {
  "application/pdf": "pdf", "text/plain": "txt", "message/rfc822": "eml",
  "application/msword": "doc", "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-excel": "xls", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "image/jpeg": "jpg", "image/png": "png"
};

export function validOrg(org) { return typeof org === "string" && ORG_RE.test(org); }
export function bucketFor(org) { if (!validOrg(org)) throw new Error("desk storage: bad org id"); return "desk-" + org; }
export function sheetPrefix(org, sheetId) { if (!validOrg(org) || !UUID_RE.test(String(sheetId))) throw new Error("desk storage: bad org or sheet id"); return `${org}/${sheetId}/`; }

// A path is built from ids and a fixed extension only; a user's filename is never part of a path.
export function objectPath(org, sheetId, kind, id, ext) {
  if (!["orig", "web", "doc", "sent", "mail", "in"].includes(kind)) throw new Error("desk storage: bad kind");
  if (!UUID_RE.test(String(id)) || !/^[a-z0-9]{2,5}$/.test(String(ext))) throw new Error("desk storage: bad object id or extension");
  return `${sheetPrefix(org, sheetId)}${kind}/${id}.${ext}`;
}
export function logoPath(org, ext) { bucketFor(org); if (!/^(png|jpg|svg|webp)$/.test(ext)) throw new Error("desk storage: logo type"); return `${org}/brand/logo.${ext}`; }

// True only when the path is inside the org's own folder and has no traversal.
export function pathInOrg(org, path) {
  return validOrg(org) && typeof path === "string" && path.startsWith(org + "/") && !path.split("/").some(p => p === ".." || p === "." || p === "") && !path.includes("\\");
}

// The seat gate for a READ: the caller's org must be the object's org. Used by the server before it signs a URL.
export function seatMayRead(callerOrg, path) { return pathInOrg(callerOrg, path); }

function headers(env, extra = {}) { return { apikey: env.supabaseKey, Authorization: `Bearer ${env.supabaseKey}`, ...extra }; }
const sbase = env => `${env.supabaseUrl}/storage/v1`;

// Create the org's bucket (private). Safe to call again: an existing bucket is fine.
export async function ensureOrgBucket(env, org) {
  const id = bucketFor(org);
  const res = await supabaseFetch(`${sbase(env)}/bucket`, { method: "POST", headers: headers(env, { "Content-Type": "application/json" }), body: JSON.stringify({ id, name: id, public: false, file_size_limit: MAX_OBJECT_BYTES }) }, 20000);
  if (res.ok) return { ok: true, created: true, bucket: id };
  const text = await res.text().catch(() => "");
  if (res.status === 409 || /already exists|Duplicate/i.test(text)) return { ok: true, created: false, bucket: id };
  return { ok: false, error: `bucket ${id}: ${res.status} ${text.slice(0, 160)}` };
}

export async function putObject(env, org, path, buf, contentType) {
  if (!pathInOrg(org, path)) return { ok: false, error: "path is outside the org" };
  if (!Buffer.isBuffer(buf) || !buf.length) return { ok: false, error: "empty object" };
  if (buf.length > MAX_OBJECT_BYTES) return { ok: false, error: "object over the size limit" };
  const res = await supabaseFetch(`${sbase(env)}/object/${bucketFor(org)}/${path.split("/").map(encodeURIComponent).join("/")}`, {
    method: "POST", headers: headers(env, { "Content-Type": contentType || "application/octet-stream", "x-upsert": "false" }), body: buf
  }, 60000);
  if (!res.ok) return { ok: false, error: `upload ${res.status} ${(await res.text().catch(() => "")).slice(0, 160)}` };
  return { ok: true, path, bytes: buf.length };
}

// DIRECT UPLOAD (Lane D, Nov 15 2026, order 2318: documents over the JSON body limit). The browser sends the file straight to the org's bucket on a one-time signed address minted here; the function never carries the bytes.
// The path is the same as every other document's (objectPath: org/sheet/doc/<uuid>.<ext>) in the same bucket. The server then reads the object's size and first bytes (headOfObject) before a row exists, so an upload that is not what it said is removed, never listed.
export async function signedUploadUrl(env, org, path) {
  if (!pathInOrg(org, path)) return null;
  const res = await supabaseFetch(`${sbase(env)}/object/upload/sign/${bucketFor(org)}/${path.split("/").map(encodeURIComponent).join("/")}`, { method: "POST", headers: headers(env, { "Content-Type": "application/json" }), body: "{}" }, 15000);
  if (!res.ok) return null;
  const j = await res.json().catch(() => null), u = j && (j.url || j.signedURL);
  return u ? (/^https?:/.test(u) ? u : `${sbase(env)}${u.startsWith("/") ? "" : "/"}${u}`) : null;
}
// { bytes, head } of a stored object: the total size and its first 64 bytes, by a ranged read (never the whole file). null when the path is outside the org or nothing is there.
export async function headOfObject(env, org, path) {
  if (!pathInOrg(org, path)) return null;
  const res = await supabaseFetch(`${sbase(env)}/object/${bucketFor(org)}/${path.split("/").map(encodeURIComponent).join("/")}`, { headers: headers(env, { Range: "bytes=0-63" }) }, 30000);
  if (!res.ok && res.status !== 206) return null;
  const head = Buffer.from(await res.arrayBuffer()), cr = /\/(\d+)\s*$/.exec(res.headers.get("content-range") || ""), total = cr ? Number(cr[1]) : Number(res.headers.get("content-length"));
  return Number.isFinite(total) && total >= 0 ? { bytes: total, head: head.slice(0, 64) } : null;
}
// A WHOLE STORED OBJECT (a photo the browser sent by the direct route, read once to be made upright and resized), up to maxBytes; null when it is not there or is larger.
export async function readObject(env, org, path, maxBytes) {
  if (!pathInOrg(org, path)) return null;
  const res = await supabaseFetch(`${sbase(env)}/object/${bucketFor(org)}/${path.split("/").map(encodeURIComponent).join("/")}`, { headers: headers(env) }, 60000);
  if (!res.ok) return null; const buf = Buffer.from(await res.arrayBuffer()); return buf.length >= 1 && buf.length <= maxBytes ? buf : null;
}
// The row for an object already in the bucket (the direct route's second step). The row and the object go together: when the row cannot be written the object is removed again.
export async function registerSheetDocument(env, { org, sheetId, seatId, id, path, filename, contentType, bytes }) {
  const sheet = await sheetInOrg(env, org, sheetId);
  if (!sheet) return { ok: false, error: "no such sheet in this org" };
  if (!pathInOrg(org, path) || !path.startsWith(`${sheetPrefix(org, sheetId)}doc/`)) return { ok: false, error: "path is not this sheet's" };
  const ins = await supabaseInsert("desk_sheet_documents", [{ id, sheet_id: sheetId, org_id: org, seat_id: seatId, kind: "file", storage_path: path, filename: filename ? String(filename).slice(0, 200) : null, content_type: contentType, bytes }], env.supabaseUrl, env.supabaseKey, "return=representation");
  if (!ins.ok) { await removeObjects(env, org, [path]); return { ok: false, error: ins.error || "document row not written" }; }
  return { ok: true, document: ins.rows[0], path };
}

// A short-lived signed URL. The caller must already have decided this seat may read this org (seatMayRead).
export async function signedUrl(env, org, path, ttlSeconds = SIGNED_URL_TTL) {
  if (!pathInOrg(org, path)) return null;
  const res = await supabaseFetch(`${sbase(env)}/object/sign/${bucketFor(org)}/${path.split("/").map(encodeURIComponent).join("/")}`, {
    method: "POST", headers: headers(env, { "Content-Type": "application/json" }), body: JSON.stringify({ expiresIn: Math.max(30, Math.min(3600, ttlSeconds | 0)) })
  }, 15000);
  if (!res.ok) return null;
  const j = await res.json().catch(() => null);
  return j && j.signedURL ? `${sbase(env)}${j.signedURL}` : null;
}

// The bytes of one stored object (the Re-read action reads the first email's .eml). null when the path is outside the org or the object is gone.
export async function downloadObject(env, org, path) {
  if (!pathInOrg(org, path)) return null;
  const res = await supabaseFetch(`${sbase(env)}/object/${bucketFor(org)}/${path.split("/").map(encodeURIComponent).join("/")}`, { headers: headers(env) }, 30000);
  return res.ok ? Buffer.from(await res.arrayBuffer()) : null;
}

// One hour: long enough for a sheet page left open and for a PDF build, short enough that a copied link dies the same day.
export const SIGNED_URL_TTL = 3600;

// Mint URLs for a sheet's photos and documents AT RENDER TIME, on a copy. Entries carry a storage `path` and url null in the stored
// sheet; this returns a new sheet whose entries have a signed url, and the stored object is never touched or saved from here.
// A file is signed only when its path sits inside the CALLER's org and inside this sheet's own folder (org/sheetId/...), so a seat
// from another org, or a path planted from another sheet, gets url null, never a link. Entries with no path (an external link, a
// fixture url) pass through unchanged. A signing failure gives url null, never a throw and never a stale link.
export async function mintSheetUrls(env, callerOrg, sheet, { sign = signedUrl, ttl = SIGNED_URL_TTL } = {}) {
  if (!sheet || !sheet.submission) return sheet;
  const prefix = validOrg(callerOrg) && sheet.id ? `${callerOrg}/${sheet.id}/` : null;
  const one = async f => {
    if (!f || typeof f !== "object" || !f.path) return f;
    if (!prefix || !seatMayRead(callerOrg, f.path) || !f.path.startsWith(prefix)) return { ...f, url: null };
    let url = null;
    try { url = await sign(env, callerOrg, f.path, ttl); } catch { url = null; }
    return { ...f, url: url || null };
  };
  const sub = sheet.submission, se = sub.sourceEmail && sub.sourceEmail.path ? await one(sub.sourceEmail) : sub.sourceEmail;
  return { ...sheet, submission: { ...sub, ...(se ? { sourceEmail: se } : {}), photos: await Promise.all((sub.photos || []).map(one)), documents: await Promise.all((sub.documents || []).map(one)) } };
}

// Every object under a prefix, recursively. Returns { ok, objects: [{path, bytes}] }; ok:false when ANY list call fails
// (a deletion must never proceed on a partial list).
export async function listAll(env, org, prefix) {
  const bare = prefix.replace(/\/$/, "");
  if (!(bare === org && validOrg(org)) && !pathInOrg(org, bare)) return { ok: false, error: "prefix is outside the org", objects: [] };
  const out = [];
  const walk = async dir => {
    for (let offset = 0; ; offset += 100) {
      const res = await supabaseFetch(`${sbase(env)}/object/list/${bucketFor(org)}`, {
        method: "POST", headers: headers(env, { "Content-Type": "application/json" }),
        body: JSON.stringify({ prefix: dir.replace(/\/$/, ""), limit: 100, offset, sortBy: { column: "name", order: "asc" } })
      }, 20000);
      if (!res.ok) throw new Error(`list ${res.status}`);
      const rows = await res.json();
      if (!Array.isArray(rows)) throw new Error("list shape");
      for (const r of rows) {
        const p = `${dir.replace(/\/$/, "")}/${r.name}`;
        if (r.id == null) await walk(p); else out.push({ path: p, bytes: Number(r.metadata && r.metadata.size) || 0, at: r.created_at || r.updated_at || (r.metadata && r.metadata.lastModified) || null });
      }
      if (rows.length < 100) break;
    }
  };
  try { await walk(prefix); return { ok: true, objects: out }; } catch (e) { return { ok: false, error: String(e && e.message || e), objects: out }; }
}

export async function removeObjects(env, org, paths) {
  if (!paths.length) return { ok: true, removed: 0 };
  if (!paths.every(p => pathInOrg(org, p))) return { ok: false, error: "a path is outside the org", removed: 0 };
  for (let i = 0; i < paths.length; i += 100) {
    const res = await supabaseFetch(`${sbase(env)}/object/${bucketFor(org)}`, {
      method: "DELETE", headers: headers(env, { "Content-Type": "application/json" }), body: JSON.stringify({ prefixes: paths.slice(i, i + 100) })
    }, 30000);
    if (!res.ok) return { ok: false, error: `remove ${res.status} ${(await res.text().catch(() => "")).slice(0, 160)}`, removed: i };
  }
  return { ok: true, removed: paths.length };
}

// A DOCUMENT REMOVED IS GONE, THE OBJECT AS WELL AS THE ROW (Lane C's live run on the Ferrari, Nov 15 2026: after doc_remove the signed address still served the file). The object is deleted and then looked for: only when it is not in its folder is the document row deleted and success reported; any failure leaves the row, so the document stays on the case and the remove can be tried again.
export async function deleteObjectConfirmed(env, org, path) {
  if (!pathInOrg(org, path)) return { ok: false, error: "a path is outside the org" };
  const gone = await removeObjects(env, org, [path]); if (!gone.ok) return { ok: false, error: gone.error };
  const dir = path.slice(0, path.lastIndexOf("/")), left = await listAll(env, org, dir);
  if (!left.ok) return { ok: false, error: "could not confirm the object is gone: " + left.error };
  return left.objects.some(o => o.path === path) ? { ok: false, error: "the object is still there" } : { ok: true };
}
export async function removeSheetDocument(env, { org, sheetId, id, path }) {
  if (path) { const g = await deleteObjectConfirmed(env, org, path); if (!g.ok) return { ok: false, error: g.error }; }
  const { supabaseDelete } = await import("../_supabase.js"), d = await supabaseDelete(env, `desk_sheet_documents?id=eq.${encodeURIComponent(id)}&sheet_id=eq.${encodeURIComponent(sheetId)}&org_id=eq.${encodeURIComponent(org)}`);
  return d && d.ok ? { ok: true } : { ok: false, error: (d && d.error) || "the document row was not deleted" };
}
// THE DOCUMENT FILES NO ROW OWNS (read only, Nov 15 2026): every object under the org's case folders (<org>/<case>/doc/...) with no desk_sheet_documents row for its path, by case alias, size and date. It deletes nothing.
export async function orphanDocs(env, org) {
  if (!validOrg(org)) return { ok: false, error: "bad org" };
  const all = await listAll(env, org, `${org}/`); if (!all.ok) return { ok: false, error: all.error };
  const { supabaseSelectAll } = await import("../_supabase.js"), rows = await supabaseSelectAll(env, `desk_sheet_documents?org_id=eq.${encodeURIComponent(org)}&kind=eq.file&select=storage_path`);
  if (!Array.isArray(rows)) return { ok: false, error: "could not read the document rows" };
  const have = new Set(rows.map(r => r.storage_path)), found = all.objects.filter(o => new RegExp(`^${org}/[0-9a-f-]{36}/doc/`).test(o.path));
  const orphans = found.filter(o => !have.has(o.path)).map(o => ({ case: o.path.split("/")[1].slice(0, 8), file: o.path.split("/").pop(), bytes: o.bytes, at: o.at })).sort((a, b) => String(a.case).localeCompare(String(b.case)));
  return { ok: true, org, objects: found.length, rows: rows.length, orphans, orphanBytes: orphans.reduce((n, o) => n + o.bytes, 0) };
}

// A PHOTO REMOVED IS GONE, BOTH FILES AND THE ROW (same rules as a document, Nov 15 2026): the original and the resized object are deleted and proved gone, then the desk_sheet_photos row; a failure leaves the photo where it was.
export async function removeSheetPhoto(env, { org, sheetId, id }) {
  const { supabaseSelect, supabaseDelete } = await import("../_supabase.js"), rows = await supabaseSelect(env, `desk_sheet_photos?id=eq.${encodeURIComponent(id)}&sheet_id=eq.${encodeURIComponent(sheetId)}&org_id=eq.${encodeURIComponent(org)}&select=original_path,resized_path&limit=1`);
  if (!Array.isArray(rows)) return { ok: false, error: "could not read the photo row" };
  for (const p of [...new Set(rows.flatMap(r => [r.original_path, r.resized_path]).filter(Boolean))]) { const g = await deleteObjectConfirmed(env, org, p); if (!g.ok) return { ok: false, error: g.error }; }
  const d = await supabaseDelete(env, `desk_sheet_photos?id=eq.${encodeURIComponent(id)}&sheet_id=eq.${encodeURIComponent(sheetId)}&org_id=eq.${encodeURIComponent(org)}`);
  return d && d.ok ? { ok: true } : { ok: false, error: (d && d.error) || "the photo row was not deleted" };
}

// The sheet must exist AND belong to the org the caller is acting for. Everything below starts here.
export async function sheetInOrg(env, org, sheetId) {
  if (!validOrg(org) || !UUID_RE.test(String(sheetId))) return null;
  const rows = await supabaseSelect(env, `desk_sheets?select=id,org_id,seat_id,status&id=eq.${sheetId}&org_id=eq.${encodeURIComponent(org)}&limit=1`);
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

// Keep one submission photo: the original as received and the resized copy, then the row. If the row cannot be
// written the objects are removed again, so nothing is left in a bucket that no row points to.
export async function storeSheetPhoto(env, { org, sheetId, seatId, original, resized, source = "email", position = 0, filename = null }) {
  const sheet = await sheetInOrg(env, org, sheetId);
  if (!sheet) return { ok: false, error: "no such sheet in this org" };
  const oExt = PHOTO_ORIGINAL_TYPES[original && original.contentType], rExt = PHOTO_RESIZED_TYPES[resized && resized.contentType];
  if (!oExt || !rExt) return { ok: false, error: "photo type not accepted" };
  const id = crypto.randomUUID();
  const origPath = objectPath(org, sheetId, "orig", id, oExt), webPath = objectPath(org, sheetId, "web", id, rExt);
  const a = await putObject(env, org, origPath, original.buf, original.contentType);
  if (!a.ok) return a;
  const b = await putObject(env, org, webPath, resized.buf, resized.contentType);
  if (!b.ok) { await removeObjects(env, org, [origPath]); return b; }
  const ins = await supabaseInsert("desk_sheet_photos", [{
    id, sheet_id: sheetId, org_id: org, seat_id: seatId, original_path: origPath, resized_path: webPath, filename: filename ? String(filename).slice(0, 200) : null,
    content_type: original.contentType, bytes: original.buf.length, width: resized.width || null, height: resized.height || null, position, source
  }], env.supabaseUrl, env.supabaseKey, "return=representation");
  if (!ins.ok) { await removeObjects(env, org, [origPath, webPath]); return { ok: false, error: ins.error || "photo row not written" }; }
  return { ok: true, photo: ins.rows[0], origPath, webPath };
}

// A document: a file kept in the bucket, or a Drive/Dropbox link kept as text and never opened by us.
export async function storeSheetDocument(env, { org, sheetId, seatId, file = null, link = null, filename = null }) {
  const sheet = await sheetInOrg(env, org, sheetId);
  if (!sheet) return { ok: false, error: "no such sheet in this org" };
  const id = crypto.randomUUID();
  if (link) {
    if (!/^https:\/\/(www\.)?(drive\.google\.com|docs\.google\.com|dropbox\.com|www\.dropbox\.com|dl\.dropboxusercontent\.com)\//i.test(link)) return { ok: false, error: "link not accepted" };
    const ins = await supabaseInsert("desk_sheet_documents", [{ id, sheet_id: sheetId, org_id: org, seat_id: seatId, kind: "link", link_url: String(link).slice(0, 2000), filename: filename ? String(filename).slice(0, 200) : null }], env.supabaseUrl, env.supabaseKey, "return=representation");
    return ins.ok ? { ok: true, document: ins.rows[0] } : { ok: false, error: ins.error };
  }
  const ext = DOCUMENT_TYPES[file && file.contentType];
  if (!ext) return { ok: false, error: "document type not accepted" };
  const path = objectPath(org, sheetId, "doc", id, ext);
  const a = await putObject(env, org, path, file.buf, file.contentType);
  if (!a.ok) return a;
  const ins = await supabaseInsert("desk_sheet_documents", [{ id, sheet_id: sheetId, org_id: org, seat_id: seatId, kind: "file", storage_path: path, filename: filename ? String(filename).slice(0, 200) : null, content_type: file.contentType, bytes: file.buf.length }], env.supabaseUrl, env.supabaseKey, "return=representation");
  if (!ins.ok) { await removeObjects(env, org, [path]); return { ok: false, error: ins.error || "document row not written" }; }
  return { ok: true, document: ins.rows[0], path };
}

async function rpc(env, fn, body) {
  const res = await supabaseFetch(`${env.supabaseUrl}/rest/v1/rpc/${fn}`, { method: "POST", headers: headers(env, { "Content-Type": "application/json" }), body: JSON.stringify(body) }, 30000);
  if (!res.ok) return { ok: false, error: `${fn} ${res.status} ${(await res.text().catch(() => "")).slice(0, 160)}` };
  return { ok: true, value: await res.json().catch(() => null) };
}

// Delete a sheet WITH its photos, documents, sent copy and email: objects first, then the rows (one RPC that logs).
// If the objects cannot be listed or removed, NOTHING is deleted and the failure is returned, so a retry finds it all.
// reason: 'sheet' | 'retention' | 'org_request' | 'early'.
export async function deleteSheetEverywhere(env, { org, sheetId, reason, actor }) {
  if (!["sheet", "retention", "org_request", "early"].includes(reason)) return { ok: false, error: "a deletion needs a reason" };
  const sheet = await sheetInOrg(env, org, sheetId);
  if (!sheet) return { ok: false, error: "no such sheet in this org" };
  const listed = await listAll(env, org, sheetPrefix(org, sheetId));
  if (!listed.ok) return { ok: false, error: "could not list objects: " + listed.error };
  const gone = await removeObjects(env, org, listed.objects.map(o => o.path));
  if (!gone.ok) return { ok: false, error: "could not remove objects: " + gone.error };
  const bytes = listed.objects.reduce((n, o) => n + o.bytes, 0);
  const r = await rpc(env, "desk_delete_sheet", { p_sheet: sheetId, p_reason: reason, p_actor: String(actor || "unknown").slice(0, 80), p_objects: listed.objects.length, p_bytes: bytes });
  if (!r.ok) return { ok: false, error: "objects removed but rows not deleted: " + r.error, objectsRemoved: listed.objects.length };
  return { ok: true, objects: listed.objects.length, bytes, rows: r.value };
}

// Everything an org has stored: every sheet, then the brand folder, then one log line for the org. On org request.
export async function purgeOrg(env, { org, actor, reason = "org_request" }) {
  if (!validOrg(org)) return { ok: false, error: "bad org" };
  const rows = await supabaseSelect(env, `desk_sheets?select=id&org_id=eq.${encodeURIComponent(org)}&limit=100000`);
  if (!Array.isArray(rows)) return { ok: false, error: "could not read the org's sheets" };
  let sheets = 0, objects = 0, bytes = 0; const failed = [];
  for (const r of rows) {
    const d = await deleteSheetEverywhere(env, { org, sheetId: r.id, reason, actor });
    if (d.ok) { sheets++; objects += d.objects; bytes += d.bytes; } else failed.push({ sheetId: r.id, error: d.error });
  }
  if (failed.length) return { ok: false, error: "some sheets were not deleted", sheets, failed };
  const rest = await listAll(env, org, org + "/");   // brand/logo and anything not tied to a sheet
  if (!rest.ok) return { ok: false, error: "could not list the org's remaining objects: " + rest.error, sheets };
  const gone = await removeObjects(env, org, rest.objects.map(o => o.path));
  if (!gone.ok) return { ok: false, error: gone.error, sheets };
  objects += rest.objects.length; bytes += rest.objects.reduce((n, o) => n + o.bytes, 0);
  await supabaseInsert("desk_deletion_log", [{ org_id: org, scope: "org", reason, actor: String(actor || "unknown").slice(0, 80), objects, bytes, note: `${sheets} sheets` }], env.supabaseUrl, env.supabaseKey);
  return { ok: true, sheets, objects, bytes };
}
