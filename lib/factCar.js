// task=factcar (Lane D, Nov 20 2026, lane-d-factcar; Lane F's measure 4): READ ONLY. For n listings of one miner run (chosen by most statements) the listing's year, stated mileage, sale date and source, and every
// statement the miner kept for it: topic (the statement in our words), kind, statement type, polarity, stated year, stated miles, proof mentioned, unmatched. run=fm4 with like=fm5 returns the SAME listings' fm4 statements.
// NEVER the span text, the listing's text, VIN, title, URL or seller. Every output field is built from a fixed list here (a field of the stored row that is not on the list cannot leave), the listing is named by an opaque hash,
// and the one free text field (the topic, written by the miner) is scrubbed of anything shaped like a VIN, a link, an address or a long number.
import crypto from "node:crypto";
import { MINE_FAMILIES } from "./factMine.js";

export const MAX_N = 10, DEFAULT_N = 5, TOPIC_MAX = 80;
export const LISTING_FIELDS = ["listing", "source", "sale_date", "year", "stated_mileage", "statements"];
export const STATEMENT_FIELDS = ["topic", "kind", "statement_type", "polarity", "stated_year", "stated_miles", "proof_mentioned", "unmatched"];
const RUN_RE = /^fm\d{1,2}$/;
export function parseFactCarCall(q) {
  const get = k => String((q && q[k]) == null ? "" : q[k]).trim(), family = get("family"), run = get("run"), like = get("like") || run;
  if (!MINE_FAMILIES.includes(family)) return { ok: false, why: "family must be e46_m3 or p996_carrera" };
  if (!RUN_RE.test(run) || !RUN_RE.test(like)) return { ok: false, why: "run (and like) is a miner version such as fm5" };
  const n = get("n") === "" ? DEFAULT_N : Number(get("n")); if (!Number.isFinite(n) || n < 1 || n > MAX_N) return { ok: false, why: "n must be 1 to " + MAX_N };
  return { ok: true, call: { family, run, like, n: Math.floor(n) } };
}
// the topic is the miner's own few words; anything in it that could be listing text or an identifier is removed
export function scrubTopic(t) {
  let s = String(t == null ? "" : t);
  s = s.replace(/https?:\/\/\S+|www\.\S+/gi, " ").replace(/\S+@\S+/g, " ").replace(/\b[A-Za-z0-9]{17}\b/g, " ").replace(/\b(?=[A-Za-z0-9-]*\d)[A-Za-z0-9-]{9,}\b/g, " ").replace(/\d{6,}/g, " ");
  return s.replace(/\s+/g, " ").trim().slice(0, TOPIC_MAX);
}
export const hashOf = (id, secret) => crypto.createHmac("sha256", String(secret)).update("factcar1:" + id).digest("hex").slice(0, 16);
const num = v => (Number.isFinite(Number(v)) && v !== null && v !== "" ? Number(v) : null);
const day = v => /^\d{4}-\d{2}-\d{2}/.test(String(v || "")) ? String(v).slice(0, 10) : null;
const inList = ids => "(" + ids.map(i => `"${String(i).replace(/"/g, "")}"`).join(",") + ")";
export const statementOf = (m, kindOfTopic) => ({ topic: scrubTopic(m.topic), kind: kindOfTopic ? kindOfTopic(m.topic) : null, statement_type: String(m.statement_type || "").slice(0, 20), polarity: String(m.polarity || "").slice(0, 20), stated_year: num(m.stated_year), stated_miles: num(m.stated_miles), proof_mentioned: m.proof_mentioned === true, unmatched: m.unmatched === true });
export async function runFactCar(query, deps, secret) {
  const p = parseFactCarCall(query); if (!p.ok) return { ok: false, status: 400, why: p.why };
  if (!secret) return { ok: false, status: 500, why: "no key to make the listing hash" };
  const c = p.call, pick = await deps.select(`listing_mining_runs?select=listing_id,source&family=eq.${c.family}&miner_version=eq.${c.like}&status=eq.done&sold_or_attempt=eq.sold&items_found=gt.0&order=items_found.desc,listing_id.asc&limit=${c.n}`);
  if (!Array.isArray(pick)) return { ok: false, status: 409, why: "tables not created: run docs/supabase-factmine.sql in the Supabase SQL Editor" };
  const ids = pick.map(r => r.listing_id), ms = ids.length ? await deps.select(`listing_mentions?select=listing_id,topic,statement_type,polarity,stated_year,stated_miles,proof_mentioned,unmatched&family=eq.${c.family}&miner_version=eq.${c.run}&listing_id=in.${encodeURIComponent(inList(ids))}&order=id.asc&limit=2000`) : [];
  if (!Array.isArray(ms)) return { ok: false, status: 409, why: "the statements could not be read" };
  const map = await deps.select(`topic_map?select=raw_topic,kind&family=eq.${c.family}&map_version=eq.${encodeURIComponent(deps.mapVersion || "m1")}&limit=2000`).catch(() => []);
  const kinds = new Map((Array.isArray(map) ? map : []).map(x => [x.raw_topic, x.kind || null])), kindOfTopic = t => kinds.get(t) || null;
  const sales = new Map();
  for (const r of pick) { const sid = String(r.listing_id).slice(String(r.source).length + 1); if (!sales.has(r.source)) sales.set(r.source, []); sales.get(r.source).push(sid); }
  const facts = new Map();
  for (const [source, sids] of sales) {
    const got = await deps.select(`sales_archive?select=source_id,sale_date,year,mileage,stated_mileage&source_slug=eq.${encodeURIComponent(source)}&source_id=in.${encodeURIComponent(inList(sids))}`);
    if (Array.isArray(got)) for (const g of got) facts.set(`${source}:${g.source_id}`, g);
  }
  const listings = pick.map(r => { const f = facts.get(r.listing_id) || {}, mine = ms.filter(m => m.listing_id === r.listing_id).map(m => statementOf(m, kindOfTopic)); return { listing: hashOf(r.listing_id, secret), source: String(r.source).slice(0, 30), sale_date: day(f.sale_date), year: num(f.year), stated_mileage: num(f.mileage != null ? f.mileage : f.stated_mileage), statements: mine }; });
  return { ok: true, status: 200, body: { task: "factcar", family: c.family, run: c.run, listings_chosen_from: c.like, count: listings.length, listings } };
}
