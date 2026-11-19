// Dumps the server-rendered HTML of every public page, signed out and with the crew cookie, so a copy move can be proved identical byte for byte (Lane E, Nov 1 2026).
//   node scripts/copyRender.mjs <outDir>
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
process.env.LAUNCH_STAGE = "2";
const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
export const PAGES = [["home", "home", "/"], ["find", "buy", "/find"], ["market-check", "marketCheck", "/market-check"], ["sell", "sellPage", "/sell"], ["tasks", "tasksPage", "/tasks"], ["about", "about", "/about"], ["how-sam-decides", "howSamDecides", "/how-sam-decides"], ["whats-new", "whatsNew", "/whats-new"], ["feedback", "feedback", "/feedback"], ["business", "business", "/business"]];
export async function renderAll(crew) {
  const out = {};
  for (const [name, file, url] of PAGES) {
    const { default: h } = await import(pathToFileURL(path.join(ROOT, "api", file + ".js")).href);
    out[name] = await new Promise(resolve => {
      const done = x => resolve(String(x == null ? "" : x)), res = { statusCode: 200, setHeader() {}, getHeader() {}, status(c) { res.statusCode = c; return res; }, send: x => { done(x); return res; }, end: x => { done(x); return res; }, json: o => { done(JSON.stringify(o)); return res; }, writeHead() { return res; }, write() {} };
      Promise.resolve(h({ method: "GET", url, query: {}, headers: { host: "goasksam.com", cookie: crew ? "gas_crew=x" : "" }, socket: {} }, res)).catch(e => done("THREW " + e.message));
      setTimeout(() => done("TIMEOUT"), 20000);
    });
  }
  return out;
}
if (process.argv[1] && new URL(import.meta.url).pathname === process.argv[1]) {
  const dir = process.argv[2]; fs.mkdirSync(dir, { recursive: true });
  for (const crew of [false, true]) { const o = await renderAll(crew); for (const k of Object.keys(o)) fs.writeFileSync(path.join(dir, k + (crew ? ".crew" : "") + ".html"), o[k]); }
  console.log("copyRender: wrote " + fs.readdirSync(dir).length + " pages to " + dir);
}
