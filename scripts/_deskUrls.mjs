// SIGNED URLS half of rlsCheck (Lane S, Nov 4 2026). A sheet's photos and documents carry a storage path and url null; the url is minted
// at render time (lib/desk/storage.js mintSheetUrls, one hour) on a copy. Proven here, no Postgres needed:
//   - the sheet's own org gets a url for each file, signed for one hour; a link document passes through untouched;
//   - a seat from ANOTHER org cannot mint a url for the sheet's files (no url, and the signer is never asked);
//   - a path planted from another sheet, another org, or with traversal is never signed;
//   - minting never changes the stored sheet object, and the handler never saves a url (page open);
//   - a seat of another org cannot even open the sheet.
// Each rule also runs against a MUTANT with that protection removed; every mutant must fail.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ROOT } from "./_deskDb.mjs";

const LIBD = path.join(ROOT, "lib/desk");
let useq = 0;
async function loadMods(storageT, actionsT) {
  const read = f => fs.readFileSync(path.join(LIBD, f), "utf8"), mine = [];
  const put = (n, src) => { const p = path.join(LIBD, n); fs.writeFileSync(p, src); mine.push(p); return pathToFileURL(p).href; };
  try {
    const n = ++useq, sn = `__urlmut${n}_storage.js`;
    const sto = await import(put(sn, storageT ? storageT(read("storage.js")) : read("storage.js")));
    let a = read("sheetActions.js").replace('"./storage.js"', `"./${sn}"`); if (actionsT) a = actionsT(a);
    const act = await import(put(`__urlmut${n}_actions.js`, a));
    const store = await import(pathToFileURL(path.join(LIBD, "sheetStore.js")).href);
    return { sto, act, store };
  } finally { for (const p of mine) fs.rmSync(p, { force: true }); }
}

export async function urlFindings({ storageT, actionsT } = {}) {
  const fails = [], { sto, act, store: sst } = await loadMods(storageT, actionsT);
  const SH = "11111111-1111-4111-8111-111111111111", OTHER = "22222222-2222-4222-8222-222222222222";
  const calls = [], sign = async (env, org, p, ttl) => { calls.push({ org, p, ttl }); return `https://signed.test/${org}/${p}?t=1`; };
  const sheet = org => ({ id: SH, owner_seat: "crew", status: "New", created_at: "2026-11-04T10:00:00Z", events: [], state: act.emptyState(), read: null, vin: null, car_label: "Car",
    submission: { photos: [{ id: "p1", name: "front", path: `${org}/${SH}/web/a.jpg`, url: null }], documents: [{ id: "d1", name: "history.pdf", path: `${org}/${SH}/doc/h.pdf`, url: null }, { id: "d2", name: "drive link", url: "https://drive.example/x" }] } });
  const mine = await sto.mintSheetUrls({}, "hagerty", sheet("hagerty"), { sign });
  if (!mine.submission.photos[0].url || !mine.submission.documents[0].url) fails.push("the sheet's own org is not given a url for its photo and document");
  if (mine.submission.documents[1].url !== "https://drive.example/x") fails.push("a link document was altered");
  if (!calls.length || calls.some(c => c.ttl !== 3600)) fails.push(`the url lifetime is not one hour (${calls.map(c => c.ttl).join(",")})`);
  if (sto.SIGNED_URL_TTL !== 3600) fails.push("SIGNED_URL_TTL is not 3600");
  calls.length = 0;
  const theirs = await sto.mintSheetUrls({}, "sam", sheet("hagerty"), { sign });
  if (theirs.submission.photos[0].url || theirs.submission.documents[0].url) fails.push("a seat from another org was given a url for the sheet's files");
  if (calls.length) fails.push(`the signer was called for another org's files (${calls.length} calls)`);
  calls.length = 0;
  const planted = sheet("hagerty"); planted.submission.photos = [{ id: "x1", path: `hagerty/${OTHER}/web/z.jpg` }, { id: "x2", path: `sam/${SH}/web/z.jpg` }, { id: "x3", path: `hagerty/${SH}/../${OTHER}/web/z.jpg` }]; planted.submission.documents = [];
  const pl = await sto.mintSheetUrls({}, "hagerty", planted, { sign });
  if (pl.submission.photos.some(f => f.url) || calls.length) fails.push("a planted path from another sheet or org was signed");
  const s1 = sheet("hagerty"), before = JSON.stringify(s1); await sto.mintSheetUrls({}, "hagerty", s1, { sign });
  if (JSON.stringify(s1) !== before) fails.push("minting changed the stored sheet object in place");
  const store = sst.storeFor({}); await store.insert("hagerty", sheet("hagerty"));
  const ctx = { org: "hagerty", seat: "crew", env: {}, store, signUrl: sign, now: "2026-11-04T10:05:00Z" };
  const opened = await act.handleSheetAction("sheet_open", { id: SH, pickUp: true }, ctx);
  if (!opened.ok) fails.push("sheet_open failed in the check: " + JSON.stringify(opened).slice(0, 120));
  else if (!opened.sheet.submission.photos[0].url) fails.push("the sheet page is given no url for its photo");
  const stored = await store.get("hagerty", SH);
  if (stored.submission.photos.some(f => f.url) || stored.submission.documents.some(f => f.path && f.url)) fails.push("a minted url was written into the stored sheet");
  const other = await act.handleSheetAction("sheet_open", { id: SH }, { ...ctx, org: "sam", store: sst.storeFor({}) });
  if (other.ok) fails.push("a sam seat opened a hagerty sheet");
  return fails;
}

const rep = (s, from, to) => { if (!s.includes(from)) throw new Error("mutant did not apply: " + from.slice(0, 60)); return s.replace(from, () => to); };
const GATE = "if (!prefix || !seatMayRead(callerOrg, f.path) || !f.path.startsWith(prefix)) return { ...f, url: null };";
export const URL_MUTANTS = [
  ["minting skips the caller-org test", { storageT: f => rep(f, GATE, "if (!prefix || !f.path.startsWith(prefix)) return { ...f, url: null };") }],
  ["minting skips the sheet-folder test", { storageT: f => rep(f, GATE, "if (!prefix || !seatMayRead(callerOrg, f.path)) return { ...f, url: null };") }],
  ["minting skips both tests", { storageT: f => rep(f, GATE, "") }],
  ["the lifetime is a day", { storageT: f => rep(f, "SIGNED_URL_TTL = 3600", "SIGNED_URL_TTL = 86400") }],
  ["minting writes into the stored sheet", { storageT: f => rep(f, "return { ...sheet, submission: { ...sub, photos: await Promise.all((sub.photos || []).map(one)), documents: await Promise.all((sub.documents || []).map(one)) } };", "sub.photos = await Promise.all((sub.photos || []).map(one)); sub.documents = await Promise.all((sub.documents || []).map(one)); return sheet;") }],
  ["the page saves the minted sheet", { actionsT: a => rep(a, "const sheet = await minted(ctx, org, stored);", "const sheet = await minted(ctx, org, stored); await store.put(org, sheet);") }],
  ["the page shows the unminted sheet", { actionsT: a => rep(a, "const sheet = await minted(ctx, org, stored);", "const sheet = stored;") }]
];
