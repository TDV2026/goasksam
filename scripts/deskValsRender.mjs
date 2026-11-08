// Renders the real Desk page (lib/crewPages/desk.html + public/js/desk.js + public/js/deskvals.js) in Chrome against the REAL sheet actions (lib/desk/sheetActions.js over the memory store):
// every /api/desk call the page makes is answered in-process by handleDeskRequest, so what the page prints is what the server sent. No network.
import fs from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";
import { handleSheetAction } from "../lib/desk/sheetActions.js";
import { memoryStore } from "../lib/desk/sheetStore.js";
export const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
export const CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
export const PHOTO = "data:image/svg+xml;base64," + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="320" height="220"><rect width="320" height="220" fill="#8a9"/></svg>').toString("base64");
export async function startDesk({ seat = "crew", org = "sam", orgSettings = { name: "Hagerty Marketplace" }, store = memoryStore(), send = null, calls = [], mutateJs = null, ctxExtra = {}, delayMs = 0 } = {}) {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
  const ctxOf = s => ({ env: {}, org, seat: s || seat, store, orgSettings, send, fetchImage: async () => null, ...ctxExtra });
  const state = { seat, setSeat(s) { state.seat = s; } };
  async function open(width = 1440, opts = {}) {
    const page = await browser.newPage(); await page.setViewport({ width, height: 1000 }); const errs = []; page.on("pageerror", e => errs.push(e.message)); page.on("console", m => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });
    await page.evaluateOnNewDocument(m => { try { sessionStorage.setItem("desk_mode", m); } catch (e) {} }, opts.mode || "vals");
    await page.setRequestInterception(true);
    const html = fs.readFileSync(path.join(ROOT, "lib/crewPages/desk.html"), "utf8").replace(/<script>\s*\(function\(\)\{try\{[\s\S]*?<\/script>/, "");
    page.on("request", async r => { const u = new URL(r.url());
      if (u.host === "goasksam.com" && r.isNavigationRequest()) return r.respond({ status: 200, contentType: "text/html", body: html });
      const m = /^\/dsk\.[^/]+\/([\w.-]+\.js)$/.exec(u.pathname); if (u.host === "goasksam.com" && m) return r.respond({ status: 200, contentType: "application/javascript", body: (m[1] === "deskvals.js" && mutateJs) ? mutateJs : fs.readFileSync(path.join(ROOT, "public/js", m[1]), "utf8") });
      if (u.host === "goasksam.com" && u.pathname === "/api/desk" && r.method() === "POST") { let b = {}; try { b = JSON.parse(r.postData() || "{}"); } catch {} calls.push(b); if (delayMs && /^sheet_/.test(String(b.action))) await new Promise(r => setTimeout(r, delayMs)); const out = await handleSheetAction(b.action, b, ctxOf(state.seat)).catch(e => ({ ok: false, why: String(e.message) })); return r.respond({ status: 200, contentType: "application/json", body: JSON.stringify(out) }); }
      return r.respond({ status: 204, body: "" }); });
    await page.goto("https://goasksam.com/desk", { waitUntil: "networkidle2" }).catch(() => {}); await new Promise(r => setTimeout(r, 400));
    page._errs = errs; return page;
  }
  return { browser, store, open, state, calls, ctxOf, close: () => browser.close() };
}
export const wait = ms => new Promise(r => setTimeout(r, ms));
export async function seed(store, { seat = "crew", vin = "WP0AB29918S745123", status = "New", photos = true, org = "sam", consignor = { name: "A Seller", email: "seller@example.com" }, minutesAgo = 12 } = {}) {
  const { emptyState } = await import("../lib/desk/sheetActions.js"), { readSheet } = await import("../lib/desk/sheetRead.js");
  const read = vin ? await readSheet({}, { vin }) : null, now = Date.now();
  const sheet = { id: "s_" + Math.random().toString(16).slice(2, 10), owner_seat: seat, forwarded_by: seat, vin: vin || null, car_label: read ? read.car.label : null, status, created_at: new Date(now - minutesAgo * 60000).toISOString(), opened_at: null, submission: { consignor, mileage: 33500, photos: photos ? [{ id: "p1", name: "front", url: PHOTO }, { id: "p2", name: "rear", url: PHOTO }, { id: "p3", name: "interior", url: PHOTO }] : [], documents: [{ name: "Service history 2019 to 2024.pdf", url: "https://docs.example/1" }] }, state: emptyState(), read: null, events: [] };
  await store.insert(org, sheet); return sheet;
}

// Page actions that cannot race a re-render: the element is found and acted on inside ONE page turn, so a response that rebuilds the sheet can never leave the check holding a detached handle.
export const press = (p, sel) => p.evaluate(s => document.querySelector(s).click(), sel);
export const typeIn = async (p, sel, text, replace = false) => { await p.evaluate((s, r) => { const e = document.querySelector(s); e.focus(); if (r) e.select(); }, sel, replace); await p.keyboard.type(text); };
export const settle = p => p.evaluate(() => window.__deskVals.settled());
