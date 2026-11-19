// THIS TREE'S PAGE HANDLERS ON A LOCAL PORT (Lane E, Nov 11 2026): the router's rewrites in miniature, no network. Used by goLiveLiveCheck --self-test and goLiveSignedInCheck. The caller sets the environment (NEW_DESIGN, PUBLIC_EXAMPLES ...) and loads the stored-pick world (scripts/_visitorWorld.mjs) first.
import path from "node:path"; import http from "node:http"; import { pathToFileURL } from "node:url";
export async function startSite(ROOT) {
  const imp = f => import(pathToFileURL(path.join(ROOT, "api", f + ".js")).href + "?v=" + Math.random());
  const MAP = u => { const x = new URL(u, "http://x"), pth = x.pathname, q = x.searchParams; const set = o => { for (const [k, v] of Object.entries(o)) if (!q.has(k)) q.set(k, v); };
    const simple = { "/": "home", "/find": "buy", "/market-check": "marketCheck", "/sell": "sell", "/tasks": "tasksPage", "/tasks/mine": "tasksPage", "/about": "about", "/how-sam-decides": "howSamDecides", "/whats-new": "whatsNew", "/business": "business", "/feedback": "feedback", "/api/publicExamples": "publicExamples", "/api/track": "track" };
    if (simple[pth]) return [simple[pth], pth, q]; if (pth === "/terms" || pth === "/privacy") { set({ page: pth.slice(1) }); return ["legal", pth, q]; } if (pth === "/history") { set({ index: "1" }); return ["history", pth, q]; }
    let m = /^\/history\/([^/]+)\/([^/]+)$/.exec(pth); if (m) { set({ slug: m[1], vin: m[2] }); return ["history", pth, q]; } m = /^\/history\/([^/]+)$/.exec(pth); if (m) { set({ slug: m[1] }); return ["history", pth, q]; } return null; };
  const server = http.createServer(async (req, res) => { const m = MAP(req.url); if (!m) { res.statusCode = 404; return res.end("no"); }
    const out = { h: {}, code: 200, body: "", setHeader(k, v) { this.h[String(k).toLowerCase()] = String(v); return this; }, getHeader(k) { return this.h[String(k).toLowerCase()]; }, removeHeader(k) { delete this.h[String(k).toLowerCase()]; }, writeHead(c, hh) { this.code = c; Object.assign(this.h, hh || {}); return this; }, status(c) { this.code = c; return this; }, send(b) { this.body = b == null ? "" : String(b); return this; }, end(b) { if (b != null) this.body = String(b); return this; }, json(o) { this.h["content-type"] = this.h["content-type"] || "application/json; charset=utf-8"; this.body = JSON.stringify(o); return this; } };
    const log = console.error; console.error = () => {}; try { await (await imp(m[0])).default({ method: "GET", url: m[1] + (m[2].toString() ? "?" + m[2].toString() : ""), query: Object.fromEntries(m[2]), headers: { host: "goasksam.com", ...req.headers }, socket: {} }, out); } catch (e) { out.code = 500; out.body = String(e && e.message); } finally { console.error = log; }
    res.writeHead(out.code, out.h); res.end(out.body); });
  await new Promise(r => server.listen(0, "127.0.0.1", r));
  return { base: "http://127.0.0.1:" + server.address().port, close: () => server.close() };
}
