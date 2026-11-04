// DESK INTAKE: attachments (Lane D, Nov 2026). An image is converted (HEIC to JPEG), turned upright from its orientation tag and resized; the ORIGINAL bytes are
// kept untouched by the caller and the resized copy is what the sheet shows (spec: "originals kept, resized copies used"). A document is only listed by name.
import sharp from "sharp";
import heicConvert from "heic-convert";

export const MAX_LONG_EDGE = 2000, JPEG_QUALITY = 82, MIN_PHOTO_EDGE = 300, MAX_ATTACHMENTS = 80, MAX_FILE_BYTES = 25 * 1024 * 1024;

const IMAGE_EXT = /\.(jpe?g|png|gif|webp|tiff?|bmp|avif|heic|heif)$/i, HEIC_EXT = /\.(heic|heif)$/i;
const DOC_EXT = /\.(pdf|docx?|xlsx?|txt|rtf|csv|zip|pages|numbers|odt|ods|pptx?|eml|msg)$/i;
// HEIF files start with a box: 4 bytes size, "ftyp", then a brand
export function isHeicBytes(buf) {
  if (!buf || buf.length < 12) return false;
  if (buf.toString("latin1", 4, 8) !== "ftyp") return false;
  return /^(heic|heix|hevc|hevx|heim|heis|mif1|msf1)/.test(buf.toString("latin1", 8, 12));
}
export function attachmentKind({ filename = "", contentType = "", bytes = null } = {}) {
  const ct = String(contentType || "").toLowerCase(), name = String(filename || "");
  if (/^image\/(heic|heif)/.test(ct) || HEIC_EXT.test(name) || (bytes && isHeicBytes(bytes))) return "image";
  if (/^image\//.test(ct) || IMAGE_EXT.test(name)) return "image";
  if (/^message\/rfc822/.test(ct) || /\.eml$/i.test(name)) return "email";
  if (/^application\/(pdf|msword|vnd\.|zip|rtf)/.test(ct) || /^text\//.test(ct) || DOC_EXT.test(name)) return "document";
  return "document";
}
export const safeFilename = (n, fallback = "file") => String(n || fallback).replace(/[\\/\u0000-\u001f]+/g, "_").replace(/[^A-Za-z0-9._ \-()]+/g, "_").replace(/^\.+/, "").slice(0, 120) || fallback;

// Returns { ok:true, jpeg:Buffer, width, height, converted:boolean, rotated:boolean } or { ok:false, reason }.
// Upright: sharp.rotate() with no argument applies the EXIF orientation and clears the tag, so the pixels are upright wherever the copy is shown.
export async function resizeUpright(bytes, { filename = "", contentType = "" } = {}) {
  try {
    let input = Buffer.from(bytes), converted = false;
    if (isHeicBytes(input) || /heic|heif/i.test(contentType) || HEIC_EXT.test(filename)) {
      const out = await heicConvert({ buffer: input, format: "JPEG", quality: 0.92 });
      input = Buffer.from(out); converted = true;
    }
    const meta = await sharp(input, { failOn: "none" }).metadata();
    const rotated = !!(meta.orientation && meta.orientation > 1);
    const { data, info } = await sharp(input, { failOn: "none" })
      .rotate()
      .resize({ width: MAX_LONG_EDGE, height: MAX_LONG_EDGE, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
      .toBuffer({ resolveWithObject: true });
    return { ok: true, jpeg: data, width: info.width, height: info.height, converted, rotated };
  } catch (e) {
    return { ok: false, reason: String(e && e.message || e).slice(0, 160) };
  }
}

// The type a file really is: its first bytes, then what the mail said, then its extension. The storage layer accepts only listed types (lib/desk/storage.js).
export function sniffType(bytes, declared = "", filename = "") {
  const b = Buffer.from(bytes || []), d = String(declared || "").toLowerCase().split(";")[0].trim(), name = String(filename || "").toLowerCase();
  if (isHeicBytes(b)) return /heif$/.test(d) ? "image/heif" : "image/heic";
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length > 8 && b.slice(0, 8).toString("hex") === "89504e470d0a1a0a") return "image/png";
  if (b.length > 12 && b.toString("latin1", 0, 4) === "RIFF" && b.toString("latin1", 8, 12) === "WEBP") return "image/webp";
  if (b.length > 4 && b.toString("latin1", 0, 4) === "%PDF") return "application/pdf";
  const EXT = { pdf: "application/pdf", txt: "text/plain", doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", xls: "application/vnd.ms-excel", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", heic: "image/heic", heif: "image/heif", eml: "message/rfc822" };
  if (d && d !== "application/octet-stream") return d;
  return EXT[(name.match(/\.([a-z0-9]+)$/) || [])[1]] || d || "application/octet-stream";
}
