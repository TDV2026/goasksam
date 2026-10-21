// CSP REPORTS (security job E, F-05; Sam approved, Oct 21 2026; Lane C). The site sends its script policy in
// REPORT-ONLY mode (vercel.json, Content-Security-Policy-Report-Only, report-uri /api/cspReport): browsers block
// nothing and post here what a real policy WOULD have blocked. Each report is written as one trimmed line to the
// function log only (no table, no cost beyond the call), so the lanes can list every violation before the policy is
// enforced. Never stores a full address: the page is reduced to its path, the blocked item to its origin.
export const REPORT_MAX_BYTES = 8192;
export function reportLine(body) {
  let j = body;
  if (typeof j === "string") { if (j.length > REPORT_MAX_BYTES) return null; try { j = JSON.parse(j); } catch { return null; } }
  const list = Array.isArray(j) ? j.map(x => x && (x.body || x)) : [j && (j["csp-report"] || j.body || j)];
  const out = [];
  for (const r of list.slice(0, 5)) {
    if (!r || typeof r !== "object") continue;
    const pathOf = u => { try { const x = new URL(String(u)); return x.pathname.slice(0, 80); } catch { return String(u || "").slice(0, 40); } };
    const originOf = u => { const s = String(u || ""); if (/^(inline|eval|data|blob|self|wasm-eval)$/i.test(s) || !/^https?:/i.test(s)) return s.slice(0, 40); try { return new URL(s).origin; } catch { return s.slice(0, 40); } };
    const dir = String(r["effective-directive"] || r.effectiveDirective || r["violated-directive"] || r.violatedDirective || "").split(" ")[0].slice(0, 40);
    const blocked = originOf(r["blocked-uri"] || r.blockedURL || r.blockedUri || "");
    const page = pathOf(r["document-uri"] || r.documentURL || r.documentUri || "");
    const src = r["source-file"] || r.sourceFile ? originOf(r["source-file"] || r.sourceFile) : "";
    out.push(`csp_report ${dir} blocked=${blocked} page=${page}${src ? " src=" + src : ""}${r["line-number"] || r.lineNumber ? " line=" + (r["line-number"] || r.lineNumber) : ""}`);
  }
  return out.length ? out : null;
}
async function rawBody(req) {
  if (req.body != null && (typeof req.body === "string" || typeof req.body === "object") && !Buffer.isBuffer(req.body)) return req.body;
  if (Buffer.isBuffer(req.body)) return req.body.toString("utf8");
  return await new Promise(resolve => { let s = "", n = 0; req.on("data", c => { n += c.length; if (n <= REPORT_MAX_BYTES) s += c; }); req.on("end", () => resolve(n > REPORT_MAX_BYTES ? "" : s)); req.on("error", () => resolve("")); });
}
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  try { const lines = reportLine(await rawBody(req)); if (lines) for (const l of lines) console.log(l); } catch { /* never fails the page */ }
  return res.status(204).end();
}
