// THE COVER PHOTO OF THE REPORT (Lane D, Nov 15 2026, order 2318 item 5): the photo marked Cover on the case; with none marked, the first photo in the report; with neither, the sheet's own first photo. One function, so page one and anything else that shows the cover name the same picture. Pure: ids in, an id out (null when the case has no photo at all).
export function coverIdOf(c, sheetPhotos = []) {
  const items = new Set(((c && c.photos && c.photos.items) || []).map(p => String(p.id))), held = id => id != null && (items.has(String(id)) || sheetPhotos.some(p => String(p.id) === String(id)));
  const marked = c && c.photos && c.photos.coverId; if (held(marked)) return String(marked);
  const first = ((c && c.photos && c.photos.reportIds) || []).find(held); if (first != null) return String(first);
  const any = ((c && c.photos && c.photos.items) || [])[0] || sheetPhotos[0]; return any ? String(any.id) : null;
}
