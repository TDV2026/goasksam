// THE FILES A CASE TAKES AS DOCUMENTS (Lane D, Nov 15 2026, order 2318 item 6; found live: .doc and .docx refused). PDF, Word (doc, docx), JPG, JPEG, PNG and HEIC, up to 20 MB, told by the file's own first bytes (never by the name alone: a file is what its bytes are, and the two ambiguous containers (a zip, an old OLE file) are taken only under the name that says Word).
// Pure: bytes and a file name in, { type, contentType } out, or null. The words for each type are the table's (case.doc_type).
export const MAX_DOC_BYTES = 20 * 1024 * 1024;
export const DOC_ACCEPT = ".pdf,.doc,.docx,.jpg,.jpeg,.png,.heic";
const HEIC_BRANDS = ["heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1", "heif"];
const MIME = { pdf: "application/pdf", doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", jpg: "image/jpeg", png: "image/png", heic: "image/heic" };
export function docFileOf(buf, name = "") {
  const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf || []), ext = (/\.([A-Za-z0-9]+)$/.exec(String(name)) || [])[1], e = ext ? ext.toLowerCase() : "";
  if (!b.length) return null;
  let type = null;
  if (b.slice(0, 5).toString("latin1") === "%PDF-") type = "pdf";
  else if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) type = "jpg";
  else if (b[0] === 0x89 && b.slice(1, 4).toString("latin1") === "PNG") type = "png";
  else if (b.slice(4, 8).toString("latin1") === "ftyp" && HEIC_BRANDS.includes(b.slice(8, 12).toString("latin1").toLowerCase())) type = "heic";
  else if (b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0 && (e === "doc" || e === "")) type = "doc";   // an old Word file is an OLE container; any other OLE file (a spreadsheet) must say .doc to pass, and a name that says anything else is refused
  else if (b[0] === 0x50 && b[1] === 0x4b && (b[2] === 0x03 || b[2] === 0x05) && e === "docx") type = "docx";   // a zip: only a file named .docx
  return type ? { type, contentType: MIME[type] } : null;
}

// the type of a document already on a case: from its stored content type, else its file name; null when it says neither
export function docTypeOf(d) {
  const ct = String((d && d.contentType) || "").toLowerCase(), hit = Object.entries(MIME).find(([, m]) => m === ct);
  if (hit) return hit[0]; if (ct === "image/jpg") return "jpg";
  const e = ((/\.([A-Za-z0-9]+)$/.exec(String((d && d.name) || "")) || [])[1] || "").toLowerCase(); return e === "jpeg" ? "jpg" : MIME[e] ? e : null;
}

// The extension a file is stored under, from its name: pdf, doc, docx, jpg (jpeg too), png or heic; null for any other name. The direct upload route names the object before the bytes exist, so the name's extension decides the path and the bytes decide the type (docFileOf) once they have arrived.
export function docExtOf(name) { const e = ((/\.([A-Za-z0-9]+)$/.exec(String(name || "")) || [])[1] || "").toLowerCase(); return e === "jpeg" ? "jpg" : MIME[e] ? e : null; }
// A file this big cannot ride in a JSON body (the platform stops a request at 4.5 MB, and base64 adds a third): over this it goes by the direct route.
export const JSON_DOC_BYTES = 3 * 1024 * 1024;

// A PHOTO FILE TAKES THE DIRECT ROUTE TOO (Lane C's live run, Nov 15 2026: a new case with three screenshots failed with no reason because the request passed the platform's 4.5 MB). A photo goes to storage by its own address (photo_upload_start, the PUT, photo_upload_commit); nothing of it rides in a JSON body. The most a photo file may be, and the types by their first bytes.
export const MAX_PHOTO_UPLOAD = 25 * 1024 * 1024;
export const PHOTO_EXTS = ["jpg", "jpeg", "png", "webp", "heic", "heif"];
export const photoExtOf = name => { const m = /\.([a-z0-9]{2,5})$/i.exec(String(name || "")); const e = m ? m[1].toLowerCase() : ""; return PHOTO_EXTS.includes(e) ? (e === "jpeg" ? "jpg" : e === "heif" ? "heic" : e) : null; };
