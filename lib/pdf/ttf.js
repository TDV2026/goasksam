// TRUETYPE FOR THE PDF WRITER (Lane D, Nov 9 2026). Reads a static TrueType file (the OFL fonts in lib/pdf/fonts), maps text to glyph ids, measures it with the font's own advances, and cuts a subset holding only the glyphs a document prints.
// The subset keeps every glyph id where it was (unused glyphs are emptied), so the PDF font is a CIDFontType2 with an Identity CIDToGIDMap and no cmap is needed in the embedded file. Pure: bytes in, bytes out.
import zlib from "node:zlib";
const u16 = (b, o) => b.readUInt16BE(o), i16 = (b, o) => b.readInt16BE(o), u32 = (b, o) => b.readUInt32BE(o);

export function parseTTF(buf) {
  const n = u16(buf, 4), tab = {};
  for (let i = 0; i < n; i++) { const o = 12 + i * 16; tab[buf.toString("latin1", o, o + 4)] = { off: u32(buf, o + 8), len: u32(buf, o + 12) }; }
  const need = t => { if (!tab[t]) throw new Error("font has no " + t + " table"); return tab[t].off; };
  const head = need("head"), maxp = need("maxp"), hhea = need("hhea"), hmtx = need("hmtx"), loca = need("loca"), glyf = need("glyf");
  const upm = u16(buf, head + 18), locFmt = i16(buf, head + 50), numGlyphs = u16(buf, maxp + 4), nHM = u16(buf, hhea + 34);
  const advance = g => u16(buf, hmtx + 4 * Math.min(g, nHM - 1));
  const glyphOff = g => (locFmt === 0 ? u16(buf, loca + 2 * g) * 2 : u32(buf, loca + 4 * g));
  // cmap: format 4 (BMP) or 12, unicode platforms
  const cmapOff = need("cmap"), subs = []; for (let i = 0; i < u16(buf, cmapOff + 2); i++) subs.push({ pid: u16(buf, cmapOff + 4 + i * 8), eid: u16(buf, cmapOff + 6 + i * 8), off: cmapOff + u32(buf, cmapOff + 8 + i * 8) });
  const map = new Map(), pick = subs.find(s => s.pid === 3 && s.eid === 10) || subs.find(s => s.pid === 3 && s.eid === 1) || subs.find(s => s.pid === 0);
  if (pick) {
    const f = u16(buf, pick.off);
    if (f === 4) { const sc = u16(buf, pick.off + 6) / 2, endO = pick.off + 14, startO = endO + sc * 2 + 2, deltaO = startO + sc * 2, rangeO = deltaO + sc * 2;
      for (let s = 0; s < sc; s++) { const end = u16(buf, endO + 2 * s), start = u16(buf, startO + 2 * s), delta = i16(buf, deltaO + 2 * s), ro = u16(buf, rangeO + 2 * s); for (let c = start; c <= end && c !== 0xffff; c++) { let g = 0; if (ro === 0) g = (c + delta) & 0xffff; else { const gi = rangeO + 2 * s + ro + 2 * (c - start); if (gi + 2 <= buf.length) { g = u16(buf, gi); if (g) g = (g + delta) & 0xffff; } } if (g) map.set(c, g); } } }
    else if (f === 12) { const ng = u32(buf, pick.off + 12); for (let k = 0; k < ng; k++) { const o = pick.off + 16 + k * 12, s = u32(buf, o), e = u32(buf, o + 4), g0 = u32(buf, o + 8); for (let c = s; c <= e; c++) map.set(c, g0 + (c - s)); } }
  }
  const nameOff = tab.name ? tab.name.off : null; let psName = "Font";
  if (nameOff != null) { const cnt = u16(buf, nameOff + 2), so = nameOff + u16(buf, nameOff + 4); for (let i = 0; i < cnt; i++) { const o = nameOff + 6 + i * 12; if (u16(buf, o + 6) === 6) { const l = u16(buf, o + 8), off = so + u16(buf, o + 10); psName = u16(buf, o) === 3 || u16(buf, o) === 0 ? Buffer.from(buf.subarray(off, off + l)).swap16().toString("utf16le") : buf.toString("latin1", off, off + l); break; } } }
  psName = psName.replace(/[^A-Za-z0-9-]/g, "") || "Font";
  const os2 = tab["OS/2"] ? tab["OS/2"].off : null;
  return {
    buf, tab, upm, numGlyphs, advance, glyphOff, psName, bbox: [i16(buf, head + 36), i16(buf, head + 38), i16(buf, head + 40), i16(buf, head + 42)], ascent: i16(buf, hhea + 4), descent: i16(buf, hhea + 6),
    capHeight: os2 != null && tab["OS/2"].len >= 90 ? i16(buf, os2 + 88) : i16(buf, hhea + 4),
    gid: cp => map.get(cp) || 0, has: cp => map.has(cp), nHM, locFmt, head, hhea, maxp, hmtx, loca, glyf
  };
}
// the width of a string in 1/1000 em units of this font, per character: what the PDF's /W array carries and what layout measures with
export const widthOf = (f, s) => { let w = 0; for (const ch of String(s)) w += f.advance(f.gid(ch.codePointAt(0))) * 1000 / f.upm; return w; };

function components(f, g) {   // the glyph ids a composite glyph is made of
  const a = f.glyphOff(g), b = f.glyphOff(g + 1); if (b <= a) return [];
  const o = f.glyf.off + a || 0, buf = f.buf, start = f.tab.glyf.off + a; if (i16(buf, start) >= 0) return [];
  const out = []; let p = start + 10, flags;
  do { flags = u16(buf, p); out.push(u16(buf, p + 2)); p += 4 + (flags & 1 ? 4 : 2); if (flags & 8) p += 2; else if (flags & 0x40) p += 4; else if (flags & 0x80) p += 8; } while (flags & 0x20);
  return out;
}
const sum = b => { let s = 0; for (let i = 0; i < b.length; i += 4) { const w = Buffer.alloc(4); b.copy(w, 0, i, Math.min(i + 4, b.length)); s = (s + w.readUInt32BE(0)) >>> 0; } return s; };
const pad4 = b => (b.length % 4 ? Buffer.concat([b, Buffer.alloc(4 - (b.length % 4))]) : b);

// a TrueType file holding only the glyphs in `gids` (and what they are made of), at the same glyph ids
export function subsetTTF(f, gids) {
  const want = new Set([0, ...gids]), stack = [...want]; while (stack.length) { const g = stack.pop(); for (const c of components(f, g)) if (!want.has(c)) { want.add(c); stack.push(c); } }
  const parts = [], offs = []; let pos = 0;
  for (let g = 0; g < f.numGlyphs; g++) { offs.push(pos); if (want.has(g)) { const a = f.glyphOff(g), b = f.glyphOff(g + 1), d = pad4(f.buf.subarray(f.tab.glyf.off + a, f.tab.glyf.off + b)); parts.push(d); pos += d.length; } }
  offs.push(pos);
  const glyf = Buffer.concat(parts), loca = Buffer.alloc(4 * (f.numGlyphs + 1)); offs.forEach((o, i) => loca.writeUInt32BE(o, 4 * i));
  const head = Buffer.from(f.buf.subarray(f.tab.head.off, f.tab.head.off + f.tab.head.len)); head.writeUInt32BE(0, 8); head.writeInt16BE(1, 50);
  const tables = { glyf, head, hhea: f.buf.subarray(f.tab.hhea.off, f.tab.hhea.off + f.tab.hhea.len), hmtx: f.buf.subarray(f.tab.hmtx.off, f.tab.hmtx.off + f.tab.hmtx.len), loca, maxp: f.buf.subarray(f.tab.maxp.off, f.tab.maxp.off + f.tab.maxp.len) };
  const tags = Object.keys(tables).sort(), n = tags.length, hdr = Buffer.alloc(12 + 16 * n); hdr.writeUInt32BE(0x00010000, 0); hdr.writeUInt16BE(n, 4);
  let sr = 1, es = 0; while (sr * 2 <= n) { sr *= 2; es++; } hdr.writeUInt16BE(sr * 16, 6); hdr.writeUInt16BE(es, 8); hdr.writeUInt16BE(n * 16 - sr * 16, 10);
  let off = hdr.length; const bodies = [];
  tags.forEach((t, i) => { const d = pad4(Buffer.from(tables[t])), o = 12 + i * 16; hdr.write(t, o, "latin1"); hdr.writeUInt32BE(sum(d), o + 4); hdr.writeUInt32BE(off, o + 8); hdr.writeUInt32BE(tables[t].length, o + 12); off += d.length; bodies.push(d); });
  const out = Buffer.concat([hdr, ...bodies]), adj = (0xB1B0AFBA - sum(out)) >>> 0, ho = hdr.length + bodies.slice(0, tags.indexOf("head")).reduce((s, b) => s + b.length, 0); out.writeUInt32BE(adj, ho + 8);
  return out;
}
export const deflate = b => zlib.deflateSync(b, { level: 9 });
