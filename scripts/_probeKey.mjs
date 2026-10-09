// The probe key for dev scripts (Oct 2026): read from the environment only, never a file, an address or a
// body. Server-only flags (archiveQuery, poolDiag, ...) are ignored without it (lib/_credential.js).
// withProbeKey(page) adds the x-probe-key header to the page's own same-origin fetches only, so the key
// never goes to a font or script host the page also loads. Call it right after newPage(), before goto().
export async function withProbeKey(page) {
  const k = process.env.PROBE_KEY || "";
  if (!k) { console.error("PROBE_KEY is not set in the environment: server-only flags will be ignored."); return; }
  await page.evaluateOnNewDocument(key => {
    const f = window.fetch;
    window.fetch = (u, o) => {
      o = o || {};
      try {
        if (new URL(String(u && u.url || u), location.href).origin === location.origin) {
          o = Object.assign({}, o, { headers: Object.assign({}, o.headers || {}, { "x-probe-key": key }) });
        }
      } catch (e) {}
      return f(u, o);
    };
  }, k);
}
