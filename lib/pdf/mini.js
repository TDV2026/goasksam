// A small PDF writer (Lane E, Nov 4 2026): the Desk's valuation report is built server side and the project carries no PDF library. Standard fonts (Helvetica, Times, Courier), text, rules,
// filled rectangles, a rotated watermark, and JPEG and PNG images (PNG with alpha becomes an RGB image plus a soft mask). Content streams are written uncompressed so a check can read the text back.
import zlib from "node:zlib";

const HELV = [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584];
const FONTS = { sans: "Helvetica", sansb: "Helvetica-Bold", serif: "Times-Roman", serifb: "Times-Bold", mono: "Courier", monob: "Courier-Bold" };
export function textWidth(s, size, font = "sans") {
  const f = font === "mono" || font === "monob" ? 0 : (font === "serif" ? 0.92 : font === "serifb" ? 0.97 : font === "sansb" ? 1.06 : 1);
  let w = 0; for (const ch of String(s)) { const c = ch.charCodeAt(0); w += f === 0 ? 600 : ((c >= 32 && c <= 126 ? HELV[c - 32] : 556) * f); }
  return w * size / 1000;
}
const WIN = { "‘": "'", "’": "'", "“": '"', "”": '"', "–": "-", "—": "-", "…": "...", " ": " ", "→": "->", "·": "." };
const clean = s => String(s == null ? "" : s).replace(/[‘’“”–—… →·]/g, c => WIN[c]).replace(/[^\x09\x0a\x20-\x7e¡-ÿ]/g, "?");
const esc = s => clean(s).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
const fx = n => (Math.round(n * 100) / 100).toString();
const rgb = c => (c || [0, 0, 0]).map(v => fx(v)).join(" ");

export function wrap(text, size, font, maxW) {
  const out = [];
  for (const para of clean(text).split("\n")) {
    let line = "";
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const t = line ? line + " " + word : word;
      if (textWidth(t, size, font) <= maxW || !line) line = t; else { out.push(line); line = word; }
    }
    out.push(line);
  }
  return out;
}

function imageInfo(buf) {
  if (buf[0] === 0xff && buf[1] === 0xd8) {   // JPEG: find the frame header
    let i = 2; while (i < buf.length) { if (buf[i] !== 0xff) { i++; continue; } const m = buf[i + 1], len = buf.readUInt16BE(i + 2); if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { kind: "jpeg", h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7), comps: buf[i + 9] }; i += 2 + len; }
    return null;
  }
  if (buf.slice(1, 4).toString() === "PNG") {
    const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20), depth = buf[24], ct = buf[25], inter = buf[28];
    if (depth !== 8 || inter !== 0 || ![0, 2, 4, 6].includes(ct)) return null;
    return { kind: "png", w, h, ct };
  }
  return null;
}
function unfilterPng(buf, info) {
  const idat = []; let p = 8; while (p < buf.length) { const len = buf.readUInt32BE(p), type = buf.slice(p + 4, p + 8).toString(); if (type === "IDAT") idat.push(buf.slice(p + 8, p + 8 + len)); p += 12 + len; }
  const raw = zlib.inflateSync(Buffer.concat(idat)), bpp = { 0: 1, 2: 3, 4: 2, 6: 4 }[info.ct], stride = info.w * bpp, out = Buffer.alloc(stride * info.h);
  for (let y = 0; y < info.h; y++) {
    const f = raw[y * (stride + 1)], row = raw.slice(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? out[y * stride + x - bpp] : 0, b = y ? out[(y - 1) * stride + x] : 0, c = x >= bpp && y ? out[(y - 1) * stride + x - bpp] : 0;
      let v = row[x];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1; else if (f === 4) { const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      out[y * stride + x] = v & 255;
    }
  }
  const px = info.w * info.h; let color, alpha = null;
  if (info.ct === 2) color = out; else if (info.ct === 0) color = out;
  else { const n = info.ct === 6 ? 3 : 1; color = Buffer.alloc(px * n); alpha = Buffer.alloc(px); for (let i = 0; i < px; i++) { for (let k = 0; k < n; k++) color[i * n + k] = out[i * bpp + k]; alpha[i] = out[i * bpp + n]; } }
  return { color, alpha, comps: info.ct === 0 || info.ct === 4 ? 1 : 3 };
}

export class Doc {
  constructor({ title = "", author = "", subject = "", keywords = "", w = 595, h = 842 } = {}) { this.meta = { title, author, subject, keywords }; this.W = w; this.H = h; this.pages = []; this.images = []; this.cur = null; this.newPage(); }
  newPage() { this.cur = { ops: [], imgs: [], links: [] }; this.pages.push(this.cur); return this.cur; }
  text(x, y, s, { font = "sans", size = 10, color = [0, 0, 0] } = {}) { this.cur.ops.push(`BT /${font} ${size} Tf ${rgb(color)} rg ${fx(x)} ${fx(this.H - y)} Td (${esc(s)}) Tj ET`); }
  rule(x1, y, x2, { color = [0.8, 0.8, 0.8], width = 0.5 } = {}) { this.cur.ops.push(`${rgb(color)} RG ${width} w ${fx(x1)} ${fx(this.H - y)} m ${fx(x2)} ${fx(this.H - y)} l S`); }
  rect(x, y, w, h, { fill = [0.9, 0.9, 0.9], stroke = null } = {}) { this.cur.ops.push(`${rgb(fill)} rg ${fx(x)} ${fx(this.H - y - h)} ${fx(w)} ${fx(h)} re f` + (stroke ? ` ${rgb(stroke)} RG 0.5 w ${fx(x)} ${fx(this.H - y - h)} ${fx(w)} ${fx(h)} re S` : "")); }
  // a filled circle (a dot on a strip) and a straight line of any slope
  circle(cx, cy, r, { fill = [0, 0, 0], stroke = null } = {}) { const k = 0.5523 * r, X = fx(cx), Y = fx(this.H - cy); this.cur.ops.push(`${rgb(fill)} rg ${stroke ? rgb(stroke) + " RG 0.5 w " : ""}${fx(cx + r)} ${Y} m ${fx(cx + r)} ${fx(this.H - cy + k)} ${fx(cx + k)} ${fx(this.H - cy + r)} ${X} ${fx(this.H - cy + r)} c ${fx(cx - k)} ${fx(this.H - cy + r)} ${fx(cx - r)} ${fx(this.H - cy + k)} ${fx(cx - r)} ${Y} c ${fx(cx - r)} ${fx(this.H - cy - k)} ${fx(cx - k)} ${fx(this.H - cy - r)} ${X} ${fx(this.H - cy - r)} c ${fx(cx + k)} ${fx(this.H - cy - r)} ${fx(cx + r)} ${fx(this.H - cy - k)} ${fx(cx + r)} ${Y} c ${stroke ? "B" : "f"}`); }
  line(x1, y1, x2, y2, { color = [0.5, 0.5, 0.5], width = 0.8 } = {}) { this.cur.ops.push(`${rgb(color)} RG ${width} w ${fx(x1)} ${fx(this.H - y1)} m ${fx(x2)} ${fx(this.H - y2)} l S`); }
  // a clickable box (x, y, w, h from the top left) that opens an https address; anything else is not made a link
  link(x, y, w, h, url) { if (!/^https:\/\/[^\s()<>\\]+$/.test(String(url || ""))) return false; this.cur.links.push({ x, y: this.H - y - h, w, h, url: String(url) }); return true; }
  watermark(s, { size = 54, gray = 0.93 } = {}) { const a = 0.6, c = Math.cos(a), sn = Math.sin(a); this.cur.ops.unshift(`q BT /sansb ${size} Tf ${gray} g ${fx(c)} ${fx(sn)} ${fx(-sn)} ${fx(c)} ${fx(this.W * 0.12)} ${fx(this.H * 0.28)} Tm (${esc(s)}) Tj ET Q`); }
  // an image placed in the box (x, y, w, h) from the top-left, scaled to fit and centred in it; returns false when the bytes are not an image this writer reads
  image(bytes, x, y, w, h) {
    const buf = Buffer.from(bytes), info = imageInfo(buf); if (!info) return false;
    const k = Math.min(w / info.w, h / info.h), dw = info.w * k, dh = info.h * k, ox = x + (w - dw) / 2, oy = y + (h - dh) / 2;
    let id = this.images.findIndex(i => i.buf === buf); if (id < 0) { this.images.push({ buf, info }); id = this.images.length - 1; }
    if (!this.cur.imgs.includes(id)) this.cur.imgs.push(id);
    this.cur.ops.push(`q ${fx(dw)} 0 0 ${fx(dh)} ${fx(ox)} ${fx(this.H - oy - dh)} cm /Im${id} Do Q`); return true;
  }
  build(only) {   // only: a page index, to preview that one page (the viewer in a check or a screenshot shows page one)
    const objs = [null]; const add = o => { objs.push(o); return objs.length - 1; };
    const catalog = add(null), pagesObj = add(null), fontRef = {};
    for (const [k, n] of Object.entries(FONTS)) fontRef[k] = add(`<< /Type /Font /Subtype /Type1 /BaseFont /${n} /Encoding /WinAnsiEncoding >>`);
    const imgRef = this.images.map(im => {
      const info = im.info;
      if (info.kind === "jpeg") return add({ dict: `/Type /XObject /Subtype /Image /Width ${info.w} /Height ${info.h} /ColorSpace /${info.comps === 1 ? "DeviceGray" : info.comps === 4 ? "DeviceCMYK" : "DeviceRGB"} /BitsPerComponent 8 /Filter /DCTDecode`, data: im.buf });
      const d = unfilterPng(im.buf, info); let mask = null;
      if (d.alpha) mask = add({ dict: `/Type /XObject /Subtype /Image /Width ${info.w} /Height ${info.h} /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /FlateDecode`, data: zlib.deflateSync(d.alpha) });
      return add({ dict: `/Type /XObject /Subtype /Image /Width ${info.w} /Height ${info.h} /ColorSpace /${d.comps === 1 ? "DeviceGray" : "DeviceRGB"} /BitsPerComponent 8 /Filter /FlateDecode` + (mask ? ` /SMask ${mask} 0 R` : ""), data: zlib.deflateSync(d.color) });
    });
    const kids = this.pages.filter((_, i) => only == null || i === only).map(pg => {
      const content = add({ dict: "", data: Buffer.from(pg.ops.join("\n"), "latin1") });
      const xo = pg.imgs.length ? ` /XObject << ${pg.imgs.map(i => `/Im${i} ${imgRef[i]} 0 R`).join(" ")} >>` : "";
      const an = (pg.links || []).map(l => add(`<< /Type /Annot /Subtype /Link /Rect [${fx(l.x)} ${fx(l.y)} ${fx(l.x + l.w)} ${fx(l.y + l.h)}] /Border [0 0 0] /A << /S /URI /URI (${esc(l.url)}) >> >>`)), annots = an.length ? ` /Annots [${an.map(r => r + " 0 R").join(" ")}]` : "";
      return add(`<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 ${this.W} ${this.H}] /Contents ${content} 0 R${annots} /Resources << /Font << ${Object.entries(fontRef).map(([k, r]) => `/${k} ${r} 0 R`).join(" ")} >>${xo} >> >>`);
    });
    objs[catalog] = `<< /Type /Catalog /Pages ${pagesObj} 0 R >>`; objs[pagesObj] = `<< /Type /Pages /Count ${kids.length} /Kids [${kids.map(k => k + " 0 R").join(" ")}] >>`;
    const info = add(`<< /Title (${esc(this.meta.title)}) /Author (${esc(this.meta.author)}) /Subject (${esc(this.meta.subject)}) /Keywords (${esc(this.meta.keywords)}) /Producer (Valuation report writer) >>`);
    const parts = [Buffer.from("%PDF-1.4\n%\xe2\xe3\xcf\xd3\n", "latin1")], offs = [];
    let pos = parts[0].length;
    for (let i = 1; i < objs.length; i++) {
      const o = objs[i]; let b;
      if (typeof o === "string") b = Buffer.from(`${i} 0 obj\n${o}\nendobj\n`, "latin1");
      else b = Buffer.concat([Buffer.from(`${i} 0 obj\n<< ${o.dict} /Length ${o.data.length} >>\nstream\n`, "latin1"), o.data, Buffer.from("\nendstream\nendobj\n", "latin1")]);
      offs[i] = pos; pos += b.length; parts.push(b);
    }
    let x = `xref\n0 ${objs.length}\n0000000000 65535 f \n`; for (let i = 1; i < objs.length; i++) x += String(offs[i]).padStart(10, "0") + " 00000 n \n";
    x += `trailer\n<< /Size ${objs.length} /Root ${catalog} 0 R /Info ${info} 0 R >>\nstartxref\n${pos}\n%%EOF\n`;
    parts.push(Buffer.from(x, "latin1")); return Buffer.concat(parts);
  }
}
// read the text back out of a PDF this writer made: one string per page, in drawing order (used by the layout check)
export function pdfPages(bytes) {
  const s = Buffer.from(bytes).toString("latin1"), pages = [];
  for (const m of s.matchAll(/stream\n([\s\S]*?)\nendstream/g)) { if (!/BT /.test(m[1])) continue; const t = [...m[1].matchAll(/\(((?:\\.|[^\\)])*)\) Tj/g)].map(x => x[1].replace(/\\([()\\])/g, "$1")); pages.push(t); }
  return pages;
}
