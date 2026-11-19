// An in-memory stand-in for Supabase Storage + PostgREST, for the Desk storage checks (Lane S, Nov 4 2026). Replaces globalThis.fetch
// while a check runs. It records every call in order (so a check can assert "objects removed BEFORE rows deleted"), and can be told to fail.
export function installFake(state) {
  const real = globalThis.fetch;
  state.calls = state.calls || []; state.objects = state.objects || new Map(); state.sheets = state.sheets || []; state.rows = state.rows || {};
  state.fail = state.fail || {};
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  globalThis.fetch = async (url, init = {}) => {
    const u = new URL(url), p = decodeURIComponent(u.pathname), method = (init.method || "GET").toUpperCase();
    const body = init.body && typeof init.body === "string" ? JSON.parse(init.body) : init.body;
    state.calls.push(`${method} ${p}${u.search}`);
    if (p.startsWith("/storage/v1/object/list/")) {
      if (state.fail.list) return json({ error: "boom" }, 500);
      const bucket = p.split("/").pop(), prefix = body.prefix ? body.prefix + "/" : "", seen = new Map();
      for (const [k, v] of state.objects) {
        if (v.bucket !== bucket || !k.startsWith(prefix)) continue;
        const rest = k.slice(prefix.length), first = rest.split("/")[0];
        if (rest.includes("/")) seen.set(first, { name: first, id: null }); else seen.set(first, { name: first, id: "x", metadata: { size: v.bytes } });
      }
      return json([...seen.values()].slice(body.offset || 0, (body.offset || 0) + (body.limit || 100)));
    }
    if (p.startsWith("/storage/v1/object/") && method === "DELETE") {
      if (state.fail.remove) return json({ error: "boom" }, 500);
      const bucket = p.split("/")[4]; for (const k of body.prefixes) { const o = state.objects.get(k); if (o && o.bucket === bucket) state.objects.delete(k); }
      return json([]);
    }
    if (p.startsWith("/storage/v1/object/sign/")) return json({ signedURL: `/object/sign/x?token=t` });
    if (p.startsWith("/storage/v1/object/") && method === "POST") {
      if (state.fail.upload) return json({ error: "boom" }, 500);
      const parts = p.split("/"); const bucket = parts[4], key = parts.slice(5).join("/");
      state.objects.set(key, { bucket, bytes: init.body.length || 1 }); return json({ Key: key });
    }
    if (p === "/storage/v1/bucket" && method === "POST") return state.buckets && state.buckets.has(body.id) ? json({ error: "Duplicate" }, 409) : (state.buckets = (state.buckets || new Set()).add(body.id), json({ name: body.id }));
    if (p === "/rest/v1/rpc/desk_delete_sheet") {
      if (state.fail.rpc) return json({ message: "boom" }, 500);
      const i = state.sheets.findIndex(s => s.id === body.p_sheet); if (i >= 0) state.sheets.splice(i, 1);
      state.log = state.log || []; state.log.push({ sheet_id: body.p_sheet, reason: body.p_reason, actor: body.p_actor, objects: body.p_objects, bytes: body.p_bytes });
      return json(i >= 0 ? 1 : 0);
    }
    if (p === "/rest/v1/desk_sheets" && method === "GET") {
      let rows = state.sheets.slice(); const q = u.searchParams;
      if (q.get("id")) rows = rows.filter(r => "eq." + r.id === q.get("id"));
      if (q.get("org_id")) rows = rows.filter(r => "eq." + r.org_id === q.get("org_id"));
      if (q.get("delete_after")) { const f = q.get("delete_after"); rows = f === "is.null" ? rows.filter(r => !r.delete_after) : rows.filter(r => r.delete_after && f.startsWith("lte.") && r.delete_after <= f.slice(4)); }
      return json(rows);
    }
    if (p === "/rest/v1/desk_deletion_log" && method === "POST") { state.log = state.log || []; state.log.push(...body.map(b => ({ ...b }))); return json([]); }
    // Generic table store: state.tables[name] = [rows]; filters are col=eq.value only.
    if (p.startsWith("/rest/v1/") && state.tables && state.tables[p.split("/").pop()]) {
      const t = state.tables[p.split("/").pop()], q = u.searchParams;
      const hit = r => [...q.entries()].every(([k, v]) => ["select", "limit", "order"].includes(k) || (v.startsWith("eq.") && String(r[k]) === v.slice(3)));
      if (method === "GET") return json(t.filter(hit).map(r => ({ ...r })));
      if (method === "PATCH") { if (state.fail.patch) return json({ message: "boom" }, 500); for (const r of t.filter(hit)) Object.assign(r, body); state.patches = (state.patches || []).concat([{ table: p.split("/").pop(), body }]); return new Response(null, { status: 204 }); }
      if (method === "POST") { const rows = body.map(b => ({ id: t.length + 1, active: true, ...b })); if (state.rejectInsert && state.rejectInsert(rows[0])) return json({ message: state.rejectInsert(rows[0]) }, 400); t.push(...rows); return json(rows, 201); }
    }
    if (p.startsWith("/rest/v1/") && method === "POST") { const t = p.split("/").pop(); const row = { id: "00000000-0000-4000-8000-" + String((state.rows[t] = (state.rows[t] || [])).length + 1).padStart(12, "0"), ...body[0] }; if (state.fail.insert) return json({ message: "boom" }, 500); state.rows[t].push(row); return json([row], 201); }
    if (state.passthrough) return real(url, init);
    return json({ message: "fake: unhandled " + method + " " + p }, 500);
  };
  return () => { globalThis.fetch = real; };
}
