// Tasks (Lane C, Oct 2026): the buyer agent. A signed-in buyer gives Sam one job in plain words.
//   Understanding the job, the one question, edits and the updates' wording: Claude, on the shared core
//   (lib/live/chatCore.js) with the same output guard as /buy and /sell.
//   Which live cars fit: our rules-based matching, the SAME /buy search (runSearch: resolver, years,
//   body, gearbox, colour, spec-priced budget, location and radius, abroad rules). Same input, same
//   answer. After each live pull only listings NEW since the task's checkpoint (live_listings.first_seen)
//   are checked; finished cars never match (the live read is status=live only).
// Every qualifying car is reported (never ranked out, never a winner picked). Several matches in one
// pull become ONE update and one email. Nothing new: silence. No value is ever stored or shown.
import crypto from "node:crypto";
import { runChatTurn, usd, clean } from "../live/chatCore.js";
import { modelSpendGuard, TASKS_MODEL_PAUSED } from "../_ceilings.js";
import { anthropicCost, recordUsageEvent } from "../../api/_usage.js";
import { unsupportedNames } from "../live/nameCheck.js";
import { liveTrust, specialAsked } from "./liveTrust.js";
import { runSearch } from "../live/samChat.js";
import { marketCheck } from "../tools/marketCheck.js";
import { carHistory } from "../tools/carHistory.js";
import { supabaseSelect } from "../_supabase.js";
import { logEvent, EVENTS } from "../events.js";
import { trackCurrent } from "../track/log.js";
import { sendTaskEmail, firstEmailTo } from "../_email.js";
import { listingFacts, listingMarket, parseQueryResolved, specOf, walkLadder, soldLine, salesNoun } from "../live/search.js";
import { middleHalfLine } from "../live/buyAlerts.js";
import { bidState, bidTimePT } from "./bidTime.js";
import { applyRung, countText, trackedRung } from "../live/rung.js";
import { placingFor } from "../onebox.js";
import { houseName } from "../../api/_historyData.js";
import { humanTitle } from "../carTitle.js";
import { getDeliveryTargets, signInEmail, emailOf, testInbox } from "./delivery.js";
import { emailText, RESEARCH_PLAIN } from "./emailWords.js";

const SITE = "https://goasksam.com";
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const monthYear = d => { const m = /^(\d{4})-(\d{2})/.exec(String(d || "")); return m ? `${MONTHS[Number(m[2]) - 1]} ${m[1]}` : ""; };
const num = n => Math.round(Number(n)).toLocaleString("en-US");
const ACTIVE = ["running", "needs_you"];

// ---------------------------------------------------------------- storage (service role, server only)
// One small interface, two backends: the tables (production), or an in-memory store for probe-keyed
// test scenarios (env.mem), so the whole flow can be exercised without writing test rows.
async function rest(env, path, method = "GET", body, prefer) {
  const r = await fetch(`${env.supabaseUrl}/rest/v1/${path}`, { method, headers: { apikey: env.supabaseKey, Authorization: `Bearer ${env.supabaseKey}`, "Content-Type": "application/json", ...(prefer ? { Prefer: prefer } : {}) }, body: body ? JSON.stringify(body) : undefined });
  if (!r.ok) throw new Error(`tasks ${method} ${path.split("?")[0]} ${r.status}: ${(await r.text().catch(() => "")).slice(0, 200)}`);
  return method === "GET" || /representation/.test(prefer || "") ? r.json() : null;
}
const restStore = env => ({
  getTask: async (id, userId) => ((await rest(env, `tasks?id=eq.${id}${userId ? `&user_id=eq.${userId}` : ""}&select=*&limit=1`)) || [])[0] || null,
  // Drafts show while recent (the read-back waiting for Start); an abandoned one drops off after 7 days.
  // Only confirmed tasks (a row is written at Start; older unconfirmed rows never show).
  userTasks: userId => rest(env, `tasks?user_id=eq.${userId}&state=neq.draft&summary=not.is.null&select=*&order=updated_at.desc&limit=30`),
  taskUpdates: taskId => rest(env, `task_updates?task_id=eq.${taskId}&select=*&order=created_at.asc&limit=200`),
  saveTask: async (id, patch) => ((await rest(env, `tasks?id=eq.${id}`, "PATCH", { ...patch, updated_at: new Date().toISOString() }, "return=representation")) || [])[0] || null,
  newTask: async row => ((await rest(env, "tasks", "POST", [row], "return=representation")) || [])[0],
  addUpdate: async row => ((await rest(env, "task_updates", "POST", [row], "return=representation")) || [])[0],
  patchUpdate: (id, patch) => rest(env, `task_updates?id=eq.${id}`, "PATCH", patch),
  activeOther: async (userId, notId) => (await rest(env, `tasks?user_id=eq.${userId}&state=in.(running,needs_you)&summary=not.is.null${notId ? `&id=neq.${notId}` : ""}&select=id,summary,state,kind,filters&limit=1`)) || [],
  forRun: taskId => rest(env, taskId ? `tasks?id=eq.${taskId}&select=*` : "tasks?state=in.(running,needs_you,paused)&select=*&limit=500"),
  seededRefs: async userId => ((await rest(env, `tasks?user_id=eq.${userId}&select=seed_ref&limit=200`)) || []).map(t => t.seed_ref)
});
export function memStore() {
  const tasks = [], ups = []; let upId = 1;
  const now = () => new Date().toISOString();
  return {
    tasks, ups,
    getTask: async (id, userId) => tasks.find(t => t.id === id && (!userId || t.user_id === userId)) || null,
    userTasks: async userId => tasks.filter(t => t.user_id === userId && t.state !== "draft" && t.summary).slice().reverse(),
    taskUpdates: async taskId => ups.filter(u => u.task_id === taskId),
    saveTask: async (id, patch) => { const t = tasks.find(x => x.id === id); if (!t) return null; Object.assign(t, patch, { updated_at: now() }); return { ...t }; },
    newTask: async row => { const t = { id: crypto.randomUUID(), unread: 0, reported_ids: [], channels: ["inapp", "email"], checkpoint: null, still_looking_sent_at: null, last_interaction_at: now(), created_at: now(), updated_at: now(), ...row }; tasks.push(t); return { ...t }; },
    addUpdate: async row => { const u = { id: upId++, created_at: now(), emailed_at: null, email_status: null, read_at: null, ...row }; ups.push(u); return { ...u }; },
    patchUpdate: async (id, patch) => { const u = ups.find(x => x.id === id); if (u) Object.assign(u, patch); },
    activeOther: async (userId, notId) => tasks.filter(t => t.user_id === userId && ["running", "needs_you"].includes(t.state) && t.summary && t.id !== notId).map(t => ({ id: t.id, summary: t.summary, state: t.state, kind: t.kind, filters: t.filters })),
    forRun: async taskId => tasks.filter(t => taskId ? t.id === taskId : ["running", "needs_you", "paused"].includes(t.state)).map(t => ({ ...t })),
    seededRefs: async userId => tasks.filter(t => t.user_id === userId).map(t => t.seed_ref)
  };
}
const DB = env => env.mem || restStore(env);
export const getTask = (env, id, userId) => DB(env).getTask(id, userId);
export const userTasks = (env, userId) => DB(env).userTasks(userId);
export const taskUpdates = (env, taskId) => DB(env).taskUpdates(taskId);
export const saveTask = (env, id, patch) => DB(env).saveTask(id, patch);
const newTask = (env, row) => DB(env).newTask(row);
const addUpdate = (env, row) => DB(env).addUpdate(row);

// ---------------------------------------------------------------- the job read back, written in code
const BODY_PL = { coupe: "coupes", cabriolet: "Cabriolets", convertible: "convertibles", targa: "Targas", roadster: "roadsters", sedan: "sedans", wagon: "wagons", suv: "SUVs" };
// "black manual 997 coupes from 1966 under $70,000 with under 50,000 miles, within 500 miles of Los Angeles"
export function jobPhrase(f) {
  if (f.vin) return `this exact car (VIN ${f.vin}) coming back to auction`;
  // "Porsche 993 Carreras", "Porsche 997s", "Ford Mustangs": a 911 generation stands for the model.
  const gen = f.generation && !String(f.model || "").includes(f.generation) ? f.generation : null;
  const model = gen && /^911$/.test(String(f.model || "")) ? null : f.model;
  const car = [gen, model, f.trim].filter(Boolean).join(" ") || f.make || "";
  // "XJ-S" cannot take a plural s ("XJ-Ss"): a code ending in a capital S reads "XJ-S cars".
  let noun = car ? (f.body && BODY_PL[String(f.body).toLowerCase()] ? `${car} ${BODY_PL[String(f.body).toLowerCase()]}` : (/S$/.test(car) ? car + " cars" : /s$/.test(car) ? car : car + "s")) : "cars";
  if (f.make && (model || gen) && !new RegExp("^" + f.make, "i").test(noun)) noun = `${f.make} ${noun}`;
  const yrs = f.year_min ? (f.year_min === f.year_max ? `from ${f.year_min}` : `from ${f.year_min} to ${f.year_max || f.year_min}`) : "";
  const parts = [[f.colour, f.gearbox === "manual" ? "manual" : f.gearbox ? "automatic" : null, noun].filter(Boolean).join(" "), yrs,
    f.budget_max ? `under ${usd(f.budget_max)}` : "", f.miles_max ? `with under ${num(f.miles_max)} miles` : "",
    f.location ? `within ${f.radius_miles || 500} miles of ${f.location}` : ""].filter(Boolean);
  return parts.join(" ").replace(/\s+/g, " ").trim();
}
// What a match is checked against, as plain words ("black, manual, under $70,000").
export function matchReasons(f) {
  return [f.colour, f.gearbox === "manual" ? "manual" : f.gearbox ? "automatic" : null, f.year_min ? (f.year_min === f.year_max ? `from ${f.year_min}` : `from ${f.year_min} to ${f.year_max}`) : null,
    f.budget_max ? `under ${usd(f.budget_max)}` : null, f.miles_max ? `under ${num(f.miles_max)} miles` : null, f.location ? `within ${f.radius_miles || 500} miles of ${f.location}` : null].filter(Boolean).join(", ");
}
// The one car a research Task is about, named as typed (Sam, Oct 13 2026: never "that car"): "the 1997 Land
// Rover Defender 110", "the Porsche 993 Carrera". Year only when one year was given; the generation stands for
// a 911 the same way jobPhrase reads it. A VIN or a listing link names the car itself.
export function researchCar(f) {
  if (f.vin) return `the car with VIN ${f.vin}`;
  if (f.url) return "the car in that listing";
  const gen = f.generation && !String(f.model || "").includes(f.generation) ? f.generation : null;
  const model = gen && /^911$/.test(String(f.model || "")) ? null : f.model;
  const year = f.year_min && (!f.year_max || f.year_max === f.year_min) ? f.year_min : null;
  const words = [year, f.make, gen, model, f.trim, f.body].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  return words ? `the ${words}` : "that car";
}
export const summaryFor = (kind, f) => kind === "research" ? `Sam is researching ${researchCar(f)}: its auction history and what cars like it sold for.` : `Sam is looking for ${jobPhrase(f)}.`;

// ---------------------------------------------------------------- the task conversation (setup + edits)
const SETUP_TOOLS = [
  { name: "propose_task", description: "Set (or change) the job from the buyer's words. Send the COMPLETE job every time. kind: hunt (ongoing: find cars that come up) or research (finite: one car's history and what cars like it sold for). Returns the read-back sentence to use word for word, or the one question to ask first.",
    input_schema: { type: "object", properties: { kind: { type: "string", enum: ["hunt", "research"] }, vehicle: { type: "string", enum: ["car", "motorcycle"], description: "car unless the buyer says motorcycle, motorbike or bike, or names a bike model" }, make: { type: "string" }, model: { type: "string" }, generation: { type: "string" }, trim: { type: "string" }, body: { type: "string" }, gearbox: { type: "string", enum: ["manual", "automatic"] }, colour: { type: "string" }, budget_max: { type: "number" }, miles_max: { type: "number" }, year_min: { type: "number" }, year_max: { type: "number" }, location: { type: "string" }, radius_miles: { type: "number" }, vin: { type: "string" }, url: { type: "string" } }, required: ["kind"] } },
  { name: "task_control", description: "Start (after the buyer agrees to the read-back), pause, resume or stop the Task.", input_schema: { type: "object", properties: { action: { type: "string", enum: ["start", "pause", "resume", "stop"] } }, required: ["action"] } }
];
function setupPrompt(ctx, today) {
  return `You are Sam, setting up a job for a buyer: looking through the collector car auctions for them (a hunt) or researching one car (research). Sam always speaks in the third person ("Sam will look for"), never "I", "we" or "our".
- Plain short sentences, no dashes, no lists. Never the words valuation, worth, estimate, appraisal or verdict. Never say a car is a good buy, a deal or worth a look.
- First call propose_task with the complete job from the buyer's words (a stated year, range or decade goes in year_min and year_max; "under 70" for a Porsche means $70,000). Then reply with its "say" sentences word for word and nothing else. If it returns a question, ask only that question.
- When the buyer agrees (yes, start, go ahead), call task_control start. When they ask to pause, resume or stop, call task_control with that.
- When the buyer changes the job, call propose_task again with the complete changed job, then read it back.
- Never invent a number or a car. Never describe the page.
Today is ${today}. The task so far: ${JSON.stringify(ctx.task ? { state: ctx.task.state, kind: ctx.task.kind, job: ctx.task.filters, summary: ctx.task.summary } : null)}. ${ctx.seed ? "It was started from: " + JSON.stringify(ctx.seed) : ""}`;
}
// The job from a proposal (the setup tool) or from a draft the page sends back at Start: cleaned, and the
// one question when something essential is missing (a hunt needs a model or a VIN; research needs a car).
const JOB_KEYS = ["vehicle", "make", "model", "generation", "trim", "body", "gearbox", "colour", "budget_max", "miles_max", "year_min", "year_max", "location", "radius_miles", "vin", "url"];
export function validateJob(kindIn, input) {
  const kind = kindIn === "research" ? "research" : "hunt", p = {};
  for (const k of JOB_KEYS) if (input && input[k] != null && input[k] !== "") p[k] = typeof input[k] === "number" ? input[k] : String(input[k]).slice(0, 200);
  if (p.year_min && !p.year_max) p.year_max = p.year_min;
  if (p.vin) p.vin = String(p.vin).toUpperCase().replace(/[^A-Z0-9]/g, "");
  // A generation names the model (a 997 is a 911).
  if (!p.model && p.generation && /^porsche$/i.test(String(p.make || ""))) p.model = "911";
  let question = null;
  if (kind === "hunt" && !p.vin && !p.model && !p.generation) question = p.make ? `Which ${p.make} model should Sam look for?` : "Which car should Sam look for?";
  if (kind === "research" && !p.vin && !p.url && !p.model) question = "Which car should Sam research? A VIN or a listing link works best.";
  return { kind, filters: p, question };
}
// The car as typed (Oct 2026, Lane C): the setup model splits the buyer's words its own way and can drop some ("Mustang
// GT" kept only Mustang, "Regal Grand National" only Regal, "911 Carrera" became model "911 Carrera", "Defender 110"
// lost the 110). The one resolver Buy and Market Check read the same words with (parseQueryResolved) fills model and
// trim from what was typed when it is the same car (same make, same model line); otherwise the model's job stands.
// The live search rebuilds the car from these fields (lib/live/samChat.js runSearch), so they must carry every word.
const sq = s => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
export function typedCar(p, v) {
  if (!p || !v || !v.make || !v.model || !p.make || sq(v.make) !== sq(p.make)) return p;
  const vm = sq(v.parentModel || v.model), pm = sq(p.model || p.generation);
  if (pm && !pm.startsWith(vm) && !vm.startsWith(pm) && !(p.generation && sq(v.model) === sq(p.generation)) && sq(v.trim) !== pm) return p;
  const model = String(v.parentModel || v.model), seen = new Set(model.toLowerCase().split(/\s+/));
  const words = [v.trim, v.edition, v.variant, v.series, v.wheelbase].filter(Boolean).join(" ").split(/\s+/).filter(w => { const k = w.toLowerCase(); if (!k || seen.has(k)) return false; seen.add(k); return true; });
  const out = { ...p, model };
  if (v.parentModel && sq(v.model) !== sq(v.parentModel) && !p.generation) out.generation = String(v.model);
  if (words.length) out.trim = words.join(" ");
  else if (p.trim && sq(model + p.trim) === pm) delete out.trim;   // the model's trim was only the model again
  if (!out.year_min && Number(v.year) > 1885) out.year_min = out.year_max = Number(v.year);
  // The body as the resolver gives it, so the Task reads the same pool as Market Check (an M3 Coupe reads coupes).
  if (v.bodyStyle && !out.body) out.body = String(v.bodyStyle);
  return out;
}
async function typedFilters(env, typed, p) {
  for (const t of typed || []) {
    const s = String(t || "").trim(); if (!s) continue;
    const r = await Promise.race([parseQueryResolved(s.slice(0, 300), env).catch(() => null), new Promise(res => setTimeout(() => res(null), 2500))]);
    const out = typedCar(p, r && r.vehicle);
    if (out !== p) return out;
  }
  return p;
}
async function execSetup(env, name, input, ctx) {
  if (name === "propose_task") {
    const v0 = validateJob(input && input.kind, input || {});
    // Search and research Tasks alike (a typed "1997 Land Rover Defender 110" can be proposed as either); a VIN or a
    // listing link names the car itself, so those are left alone.
    const v = !v0.filters.vin && !v0.filters.url && ctx.typed ? validateJob(v0.kind, await typedFilters(env, ctx.typed, v0.filters)) : v0;
    const kind = v.kind, p = v.filters, question = v.question;
    ctx.proposed = { kind, filters: p, question };
    if (question) return { kind, question, say: [question] };
    const summary = summaryFor(kind, p);
    return { kind, job: p, say: [summary.replace(/^Sam is (looking for|researching)/, m => m === "Sam is looking for" ? "Sam will look for" : "Sam will research"), kind === "hunt" ? "Shall Sam start?" : "Shall Sam start the research?"] };
  }
  if (name === "task_control") { ctx.control = String((input && input.action) || ""); return { ok: true, action: ctx.control }; }
  return { error: "unknown tool" };
}
const SETUP = { system: setupPrompt, tools: SETUP_TOOLS, execTool: execSetup, cacheSystem: true,
  codeReply: trace => { const t = trace.filter(x => x.tool === "propose_task").pop(); return t && t.result && t.result.say ? t.result.say.join(" ") : "What should Sam look for?"; },
  extraBlocks: [[/\bSam (?:thinks|believes|feels|likes|recommends|loves)\b/i, "Sam giving an opinion"]],
  rewriteHint: "Use the 'say' sentences word for word, nothing else, third person, no judgements." };

// The slot (one task at a time during the beta): one task per account that is WORKING (running, or
// needing the buyer). A paused task waits without holding it, so "Swap it for this one" can pause the
// current task and start another; resuming a paused task while another works meets the same choice.
// Matches the database's own unique index (tasks_one_active_per_user: running, needs_you).
export async function slotTask(env, userId, notId) { const a = await DB(env).activeOther(userId, notId || null); return a[0] || null; }
// What the task is doing, as the words after "You already have Sam looking for".
export function taskPhrase(t) {
  if (!t) return "";
  if (t.kind === "hunt" && t.filters) return jobPhrase(t.filters);
  return String(t.summary || "").replace(/^Sam is (?:looking for|researching)\s+/i, "").replace(/:.*$/, "").replace(/[.]+$/, "");
}
const blockedOf = t => ({ blocked: { task_id: t.id, state: t.state, summary: t.summary, current: taskPhrase(t) } });

// A new task's conversation, before Start. NOTHING is written: the draft (the words, the job, the read-back
// and the last few turns) lives in the page and comes back with each message. A row exists only once the
// buyer has seen the read-back and said start (startDraft).
export async function draftTurn(env, user, { draft, text, seed, apiKey, model, paused = false, gate = null }) {
  const held = await slotTask(env, user.userId); if (held) return blockedOf(held);
  const d = draft && typeof draft === "object" ? draft : {};
  const thread = (Array.isArray(d.thread) ? d.thread : []).slice(-10).map(m => ({ role: m.role === "sam" ? "sam" : "buyer", text: String(m.text || "").slice(0, 2000) }));
  const words = String(d.words || text).slice(0, 2000);
  const prior = d.kind ? validateJob(d.kind, d.filters || {}) : null;
  const ctx = { task: prior ? { state: "draft", kind: prior.kind, filters: prior.filters, summary: prior.question ? null : summaryFor(prior.kind, prior.filters) } : null, seed: seed || d.seed || null, proposed: null, control: null, typed: [text, words] };
  const history = thread.concat([{ role: "buyer", text: String(text).slice(0, 2000) }]).map(m => ({ role: m.role === "buyer" ? "user" : "assistant", content: m.text }));
  const out = await modelTurn("setup", SETUP, { env, apiKey, model, messages: history, ctx, deadlineMs: 25000, paused, userId: user.userId });
  const job = ctx.proposed || prior;
  const next = { words, seed: ctx.seed, kind: job ? job.kind : null, filters: job ? job.filters : {}, question: job ? job.question : null,
    summary: job && !job.question ? summaryFor(job.kind, job.filters) : null,
    thread: thread.concat([{ role: "buyer", text: String(text).slice(0, 2000) }, { role: "sam", text: out.reply }]).slice(-10) };
  if (ctx.control === "start" && next.summary) return { ...(await startDraft(env, user, next, { apiKey, model, gate })), reply: out.reply };
  if (ctx.control === "stop" || ctx.control === "pause") return { draft: null, discarded: true, reply: "Fine. Nothing was started." };
  return { draft: next, reply: out.reply };
}

// task_created's fallback_rung (docs/analytics-events.md): the engine's rung for the Task's car, recorded only when it
// is sibling or not_enough_data. The Buy card's own stored read (listingMarket, noBlock), so creating a Task never waits
// on the engine: a read not already held records nothing.
// The listing row a Task's market is read from, the car as typed: a chassis-code generation (997, 993) is the model
// word Market Check reads ("2008 997 Carrera S Coupe"), so the row names it in place of the nameplate; the body
// as the resolver gave it.
export function taskRow(f, yr) {
  const model = f.generation && /^\d{3}$/.test(String(f.generation)) ? String(f.generation) : f.model;
  return { listing_title: [yr, f.make, model, f.trim, f.body].filter(Boolean).join(" "), year: yr, body_style: f.body || null };
}
async function taskRung(env, f) {
  if (env.mem || !f || !f.make || !f.model) return undefined;
  const yr = f.year_min && f.year_min === f.year_max ? f.year_min : null;
  const row = taskRow(f, yr);
  const m = await Promise.race([listingMarket(env, row, listingFacts(row), { noBlock: true }), new Promise(r => setTimeout(() => r(null), 2500))]).catch(() => null);
  return trackedRung(m);
}
// The Task email preview (Oct 2026, Lane C; the probe GET /api/tasks?emailpreview=1, read only): what a Task email
// would state for the typed car. The filters are the typed words through the same fill-in a Task's setup uses
// (typedCar over the one resolver), with no setup model turn. The market is the car's row exactly as taskRung builds
// it, read the way listingMarket reads a listing: specOf, then the stored spec_market_cache line when it is current,
// and the engine's own ladder (walkLadder, oneEngineAnswer) alongside. Nothing is written: no Task, no email, no
// cache row (walkLadder stores only in this instance's memory). The engine reads the archive only, zero OCD.
export async function emailPreview(env, text) {
  const r = await Promise.race([parseQueryResolved(String(text || "").slice(0, 300), env).catch(() => null), new Promise(res => setTimeout(() => res(null), 8000))]);
  const v0 = r && r.vehicle;
  if (!v0 || !v0.make) return { text, error: "the words did not resolve to a car" };
  const job = validateJob("hunt", typedCar({ make: v0.make, model: v0.parentModel || v0.model || undefined }, v0));
  const f = job.filters || {};
  if (!f.make || !f.model) return { text, filters: f, question: job.question || null, error: "no model to read" };
  const yr = f.year_min && f.year_min === f.year_max ? f.year_min : null;
  const row = taskRow(f, yr);
  const spec = await specOf(env, row, listingFacts(row));
  if (!spec) return { text, filters: f, row: row.listing_title, error: "no spec for that title" };
  const shape = c => { if (!c) return null; const m = { kind: c.kind, low: c.low || null, high: c.high || null, count: c.count || null, window: c.window || null, spread: !!c.spread, family: c.family || null, familyOne: c.familyOne || null, step: c.step || "exact", bodyScoped: c.bodyScoped === true || c.bodyScoped === false ? c.bodyScoped : null, fallbackRung: c.fallbackRung || null, rungLabel: c.rungLabel || null, siblingName: c.siblingName || null }; m.soldLine = soldLine({ ...m, salesNoun: salesNoun(m) }); const a = applyRung(m); return { kind: a.kind, count: a.count, low: a.low, high: a.high, window: a.window, family: a.family, rung: a.rung || null, sentence: a.soldLine, lines: blockLines(m, null, "", null).lines }; };
  const rows = await supabaseSelect(env, `spec_market_cache?spec_key=eq.${encodeURIComponent(spec.key)}&select=market,computed_at&limit=1`).catch(() => null);
  const st = Array.isArray(rows) && rows[0] && rows[0].market ? rows[0] : null;
  const t0 = Date.now(), core = await walkLadder(env, spec);
  const fresh = core === undefined ? undefined : core;
  // listingMarket serves the stored line when it carries this engine's version and shape and is under a day old.
  const current = !!(st && fresh && st.market.v === fresh.v && st.market.engineVersion === fresh.engineVersion && Date.now() - Date.parse(st.computed_at) < 24 * 3600e3);
  return { text, filters: f, question: job.question || null, summary: summaryFor("hunt", f), row: row.listing_title, spec_key: spec.key,
    stored: st ? { computed_at: st.computed_at, current, ...(st.market.kind === "none" ? { kind: "none" } : shape(st.market)) } : null,
    engine: fresh === undefined ? { error: "the read did not come back" } : fresh ? shape(fresh) : { kind: "none" }, engine_ms: Date.now() - t0,
    email: current ? "stored" : "engine" };
}
// task_created's payload for a search or research Task (scripts/rungCheck.mjs checks it in strict mode).
export const taskCreatedProps = (kind, tf, fallback_rung) => ({ kind, vehicle_key: tf.make ? `${tf.make}|${tf.model || ""}`.toLowerCase() : undefined, year: Number(tf.yearMin || tf.year) || undefined, fallback_rung });
// Start: the only way a task row is written. The job is re-checked here and the sentence rebuilt from it.
export async function startDraft(env, user, draft, opts = {}) {
  const v = validateJob(draft && draft.kind, (draft && draft.filters) || {});
  if (v.question) return { error: "not ready", question: v.question };
  const held = await slotTask(env, user.userId); if (held) return blockedOf(held);
  // opts.gate(what): the caller's per-account daily limit (lib/_ceilings.js tasksAllowance). A research Task past
  // it still starts; its thread shows the paused sentence and the research stays open (runResearch).
  if (v.kind === "research" && opts.gate && !opts.paused) opts = { ...opts, paused: !(await opts.gate("research")) };
  const seed = draft.seed || null;
  const pref = await notifyPrefs(env, user).catch(() => ({ on: true, email: user.email || null }));
  let task = await newTask(env, { user_id: user.userId, email: pref.email || user.email || null, channels: pref.on ? ["inapp", "email"] : ["inapp"], kind: v.kind, state: "draft", words: String(draft.words || "").slice(0, 2000) || summaryFor(v.kind, v.filters), filters: v.filters, summary: summaryFor(v.kind, v.filters), seeded_from: (seed && seed.from) || "typed", seed_ref: (seed && seed.ref) || null });
  // task_created (Oct 2026, open-search policy Part 1.3): once per real new task, after it succeeds.
  logEvent(env, { event: EVENTS.TASK_CREATED, tool: "tasks", userId: user.userId, visitorId: opts.visitorId || null }).catch(() => {});
  const tf = v.filters || {};
  const fallback_rung = v.kind === "hunt" ? await taskRung(env, tf).catch(() => undefined) : undefined;
  trackCurrent("task_created", taskCreatedProps(v.kind, tf, fallback_rung),
    { product: "tasks", surface: "tasks_page", user_id: user.userId });
  return { task: await beginTask(env, user, task, opts) };
}

// A message about an existing task: pause, resume or stop in words, or a change. A change is PROPOSED
// (read back, nothing applied) and applied only when the buyer confirms it (applyEdit).
export async function taskTurn(env, user, { taskId, text, pending, apiKey, model, paused = false }) {
  let task = await getTask(env, taskId, user.userId);
  if (!task) return { error: "not found" };
  await addUpdate(env, { task_id: task.id, role: "buyer", kind: "message", text: String(text).slice(0, 2000) });
  const history = (await taskUpdates(env, task.id)).filter(u => ["message", "confirm", "question"].includes(u.kind)).slice(-10).map(u => ({ role: u.role === "buyer" ? "user" : "assistant", content: u.text }));
  const ctx = { task, seed: null, proposed: null, control: null, typed: [text] };
  const out = await modelTurn("setup", SETUP, { env, apiKey, model, messages: history, ctx, deadlineMs: 25000, paused, userId: user.userId });
  await addUpdate(env, { task_id: task.id, role: "sam", kind: ctx.proposed ? (ctx.proposed.question ? "question" : "confirm") : "message", text: out.reply });
  await saveTask(env, task.id, { last_interaction_at: new Date().toISOString() });
  const proposal = ctx.proposed && !ctx.proposed.question ? { kind: ctx.proposed.kind, filters: ctx.proposed.filters, summary: summaryFor(ctx.proposed.kind, ctx.proposed.filters) } : null;
  if (ctx.control === "start" && (proposal || pending)) { const r = await applyEdit(env, user, task.id, proposal || pending, { apiKey, model }); return { ...r, reply: out.reply }; }
  if (ctx.control && ctx.control !== "start") { const r = await controlTask(env, user, task.id, ctx.control, { apiKey, model }); return { ...r, reply: out.reply }; }
  return { task: await getTask(env, task.id, user.userId), reply: out.reply, pending: proposal };
}

// A confirmed change to a running or paused task: the job and its sentence, rebuilt from the job here.
export async function applyEdit(env, user, taskId, pending, opts = {}) {
  let task = await getTask(env, taskId, user.userId);
  if (!task) return { error: "not found" };
  const v = validateJob(pending && pending.kind, (pending && pending.filters) || {});
  if (v.question) return { error: "not ready", question: v.question, task };
  if (v.kind !== task.kind) return { error: "Stop this Task to start a different kind of Task.", task };
  task = await saveTask(env, task.id, { filters: v.filters, summary: summaryFor(v.kind, v.filters), question: null, last_interaction_at: new Date().toISOString() });
  await addUpdate(env, { task_id: task.id, role: "sam", kind: "system", text: "Task changed." });
  // The same live check as at Start, on the changed job: cars already reported are left out, so the
  // update names only cars the change brings in ("Nothing new matches right now." when there are none).
  if (task.kind === "hunt" && task.state !== "done") task = await openingUpdate(env, task, opts, { edit: true });
  return { task };
}

// ---------------------------------------------------------------- start / pause / resume / stop
export async function controlTask(env, user, taskId, action, opts = {}) {
  let task = await getTask(env, taskId, user.userId);
  if (!task) return { error: "not found" };
  if (!task.summary) return { error: "not found" };
  const now = new Date().toISOString();
  const say = async (text, kind = "system") => addUpdate(env, { task_id: task.id, role: "sam", kind, text });
  if (action === "resume") {
    if (task.state !== "paused") return { task };
    // The slot rule: another running task holds it (only possible for rows from before the rule).
    const held = await slotTask(env, user.userId, task.id); if (held) return { ...blockedOf(held), task };
    task = await saveTask(env, task.id, { state: "running", question: null, checkpoint: task.checkpoint || now, last_interaction_at: now, still_looking_sent_at: null });
    await say("Resumed.");
    return { task };
  }
  if (action === "pause") { if (!["running", "needs_you"].includes(task.state)) return { task }; task = await saveTask(env, task.id, { state: "paused", last_interaction_at: now }); await say("Paused."); trackCurrent("task_paused", { via: opts.via || "page" }, { product: "tasks", surface: opts.via === "email_link" ? "email" : "tasks_page", user_id: user.userId }); return { task }; }
  if (action === "stop") { if (task.state === "done") return { task }; task = await saveTask(env, task.id, { state: "done", last_interaction_at: now }); await say("Stopped."); trackCurrent("task_cancelled", { via: opts.via || "page" }, { product: "tasks", surface: opts.via === "email_link" ? "email" : "tasks_page", user_id: user.userId }); return { task }; }
  if (action === "keep_looking") { if (task.state === "done") return { task }; task = await saveTask(env, task.id, { state: task.state === "paused" ? "running" : task.state, last_interaction_at: now, still_looking_sent_at: null }); await say("Sam is still looking."); return { task }; }
  return { error: "unknown action", task };
}

// ---------------------------------------------------------------- email preference (on the account)
// accounts.task_email_on / task_email (docs/supabase-accounts-task-email.sql). Until that is run the
// columns are missing: the preference then lives on the buyer's tasks (channels, email), which is also
// what sending reads, so the switch works either way.
// Whether accounts.task_email_every exists (docs/supabase-accounts-task-email-every.sql), asked of the table itself:
// a missing column answers 400, an existing one 200 even with no rows. Kept per instance once present; a "no" is
// asked again after ten minutes, so running the SQL shows the choice without a redeploy.
let everyColumn = { ok: false, at: 0 };
export async function hasEveryColumn(env) {
  if (env.mem) return true;
  if (everyColumn.ok || Date.now() - everyColumn.at < 10 * 60e3) return everyColumn.ok;
  const r = await fetch(`${env.supabaseUrl}/rest/v1/accounts?select=task_email_every&limit=1`, { headers: { apikey: env.supabaseKey, Authorization: `Bearer ${env.supabaseKey}` } }).catch(() => null);
  everyColumn = { ok: !!(r && r.ok), at: Date.now() };
  return everyColumn.ok;
}
export async function notifyPrefs(env, user) {
  let acct = null;
  // How often (task_email_every) is read only when the column exists, so an account table without it still answers.
  // everyReady: the column exists and this person has an account row, so the choice can be saved.
  const column = await hasEveryColumn(env).catch(() => false);
  if (!env.mem) {
    acct = ((await rest(env, `accounts?user_id=eq.${user.userId}&select=task_email_on${column ? ",task_email_every" : ""}&limit=1`).catch(() => null)) || [])[0] || null;
  } else acct = env.mem.prefs ? env.mem.prefs[user.userId] || null : null;
  const everyReady = !!env.mem || (column && !!acct);
  const tasks = await userTasks(env, user.userId).catch(() => []);
  const latest = tasks[0] || null;
  const on = acct && typeof acct.task_email_on === "boolean" ? acct.task_email_on : latest ? (latest.channels || ["inapp", "email"]).includes("email") : true;
  // The address shown is where Task emails go: the sign-in address (lib/tasks/delivery.js), never a typed one.
  const email = await signInEmail(env, user.userId).catch(() => null);
  const every = acct && EMAIL_EVERY.includes(acct.task_email_every) ? acct.task_email_every : "daily";
  return { on, email, every, everyReady, stored: acct && typeof acct.task_email_on === "boolean" ? "account" : "tasks" };
}
// How often a person hears about matches (Oct 2026, Sam): one setting for all their Tasks, default once a day.
export const EMAIL_EVERY = ["daily", "twice", "thrice", "instant"];
// The address is not a setting (Oct 2026, Sam): Task emails go only to the account's sign-in address.
export async function setNotifyPrefs(env, user, { on, every }) {
  const patch = {}, acctPatch = {};
  if (every !== undefined) {
    if (!EMAIL_EVERY.includes(every)) return { error: "Pick how often." };
    if (env.mem) { env.mem.prefs = env.mem.prefs || {}; env.mem.prefs[user.userId] = { ...(env.mem.prefs[user.userId] || {}), task_email_every: every }; }
    else {
      const r = await fetch(`${env.supabaseUrl}/rest/v1/accounts?user_id=eq.${user.userId}`, { method: "PATCH", headers: { apikey: env.supabaseKey, Authorization: `Bearer ${env.supabaseKey}`, "Content-Type": "application/json", Prefer: "return=representation" }, body: JSON.stringify({ task_email_every: every }) }).catch(() => null);
      // A PATCH that matched no account row answers 200 with nothing saved: count it as not saved.
      const saved = r && r.ok ? await r.json().catch(() => []) : [];
      if (!Array.isArray(saved) || !saved.length) return { error: "That setting can't be saved yet." };
    }
  }
  if (typeof on === "boolean") { patch.channels = on ? ["inapp", "email"] : ["inapp"]; acctPatch.task_email_on = on; }
  let stored = "tasks";
  if (!env.mem && Object.keys(acctPatch).length) {
    const r = await fetch(`${env.supabaseUrl}/rest/v1/accounts?user_id=eq.${user.userId}`, { method: "PATCH", headers: { apikey: env.supabaseKey, Authorization: `Bearer ${env.supabaseKey}`, "Content-Type": "application/json" }, body: JSON.stringify(acctPatch) }).catch(() => null);
    if (r && r.ok) stored = "account";
  }
  for (const t of await userTasks(env, user.userId)) if (t.state !== "done") await saveTask(env, t.id, patch);
  return { ...(await notifyPrefs(env, user)), stored };
}

// One short email when a hunt starts: the task sentence, how it works in plain words, the junk-folder line
// (first email only), and Pause, Stop and Open. One per Start. opts.to (probe only) sends it to a test inbox.
export const JUNK_LINE = "If this landed in your junk folder, mark it as not junk so the next one reaches your inbox.";
export const HOW_LINE = "Sam keeps searching in the background, day and night, and emails you once a day with any cars that fit. Free. Pause or stop any time.";
// The same line for each setting (the start email), and the line at the foot of every match email.
export function howLine(every) {
  const when = { daily: "emails you once a day with any cars that fit", twice: "emails you up to twice a day with any cars that fit", thrice: "emails you up to three times a day with any cars that fit", instant: "emails you as soon as a car fits, up to six emails a day" }[every] || "emails you once a day with any cars that fit";
  return `Sam keeps searching in the background, day and night, and ${when}. Free. Pause or stop any time.`;
}
export function oftenLine(every) {
  return ({ daily: "Sam sends one email a day with everything new from your Tasks.", twice: "Sam sends up to two emails a day with everything new from your Tasks.", thrice: "Sam sends up to three emails a day with everything new from your Tasks.", instant: "Sam emails you as soon as one comes, up to six emails a day." }[every] || "Sam sends one email a day with everything new from your Tasks.") + " Change how often on your Tasks page. Before it ends emails always come two hours before bidding ends.";
}
export async function sendStartEmail(env, task, update, opts = {}) {
  if (!opts.to && !(task.channels || ["inapp", "email"]).includes("email")) return;
  // The owner's sign-in address (lib/tasks/delivery.js); a probe's opts.to only ever our own test inbox.
  const to = opts.to ? testInbox(opts.to) : emailOf(await getDeliveryTargets(env, task.user_id));
  if (!to) return;
  const open = `${SITE}/tasks/mine?task=${task.id}`;
  const first = opts.to ? true : await firstEmailTo(env, to);
  const how = howLine(opts.every || (task.user_id ? (await notifyPrefs(env, { userId: task.user_id }).catch(() => ({}))).every : null));
  const text = `${task.summary}\n\n${how}\n\n${first ? JUNK_LINE + "\n\n" : ""}Open the Task: ${open}\nPause the Task: ${oneTap(task.id, "pause")}\nStop the Task: ${oneTap(task.id, "stop")}\n\nGoAskSam`;
  const esc = x => String(x).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const html = `<div style="font-family:Georgia,serif;font-size:17px;line-height:1.5;color:#1A1A1A;max-width:560px"><p>${esc(task.summary)}</p><p style="font-family:Arial,sans-serif;font-size:14px;color:#5F5A53">${esc(how)}</p>${first ? `<p style="font-family:Arial,sans-serif;font-size:14px;color:#5F5A53">${esc(JUNK_LINE)}</p>` : ""}<p style="font-family:Arial,sans-serif;font-size:15px;line-height:1.9"><a href="${open}" style="color:#D7262C;white-space:nowrap">Open the Task</a> &nbsp;·&nbsp; <a href="${oneTap(task.id, "pause")}" style="color:#1A1A1A;white-space:nowrap">Pause the Task</a> &nbsp;·&nbsp; <a href="${oneTap(task.id, "stop")}" style="color:#1A1A1A;white-space:nowrap">Stop the Task</a></p><p style="font-family:Arial,sans-serif;font-size:13px;color:#5F5A53">GoAskSam</p></div>`;
  let status = "test", id = null;
  if (!opts.test) { const r = await sendTaskEmail({ to, subject: "Sam has started your search", text, html, headers: taskMailHeaders(task) }); status = r.ok ? "sent" : r.skipped ? "skipped_" + (r.reason || "") : ("failed: " + String(r.error || r.status || "unknown")).slice(0, 200); id = r.id || null; if (!r.ok && !r.skipped) console.error("task start email failed:", task.id, status); }
  if (update && !opts.to) await DB(env).patchUpdate(update.id, { emailed_at: new Date().toISOString(), email_status: status, data: { resend_id: id } });
  return { status, resend_id: id, subject: "Sam has started your search", text };
}

// The task starts (from startDraft): running from now, the opening update with the cars live right now;
// research runs once and finishes.
async function beginTask(env, user, task, opts) {
  if (task.kind === "research") return runResearch(env, user, task, opts);
  const now = new Date().toISOString();
  task = await saveTask(env, task.id, { state: "running", question: null, checkpoint: now, last_interaction_at: now, still_looking_sent_at: null });
  const up = await addUpdate(env, { task_id: task.id, role: "sam", kind: "system", text: "Started. Sam checks every new listing and tells you when one matches." });
  await sendStartEmail(env, task, up, opts).catch(e => console.error("task start email:", e.message));
  return openingUpdate(env, task, opts);
}

// ---------------------------------------------------------------- update writing (matches, research)
const UPDATE_TOOLS = [
  { name: "get_matches", description: "The new live cars that match this Task (already matched by the rules-based algorithm), with their facts.", input_schema: { type: "object", properties: {} } },
  { name: "car_history", description: "One car's earlier auction appearances, by VIN.", input_schema: { type: "object", properties: { vin_or_url: { type: "string" } }, required: ["vin_or_url"] } },
  { name: "market_check", description: "What cars like one spec sold for at auction.", input_schema: { type: "object", properties: { car: { type: "string" } }, required: ["car"] } }
];
function updatePrompt(ctx, today) {
  if (ctx.mode === "opening") return `You are Sam, telling a buyer which cars that match their new Task are live right now, in the third person. Your final message is the update text itself and nothing else, no preamble. Call get_matches. Write at most three sentences. The first states the count exactly: "${ctx.total === 1 ? "One car that matches is live right now." : "N cars that match are live right now."}" using live_now_total. Then one sentence each for the first ${ctx.total === 1 ? "car" : "one or two cars"} (what it is, colour and gearbox if known, how far from the buyer or where, its miles, the house). The full list shows under the update, so never list more. Facts only: never "worth a look", a good buy, a deal, cheap, or what Sam thinks; no prediction; no first person; no dashes. Every number from the tools. Today is ${today}. The task: ${ctx.task.summary}`;
  return ctx.mode === "research"
    ? `You are Sam, reporting the research the buyer asked for, in the third person. Your final message is the result itself and nothing else, no preamble. Call car_history with the car's VIN or link, and market_check with the car. Then write two or three plain sentences: the car's own auction history in time order (every earlier sale or attempt with its month, house and price), then what cars like it sold for. If market_check returns no read, say so once, in one short last sentence ("Sam has no recorded sales of this exact model to compare."), and never before the history. Facts only, no judgement, no prediction, never whether to buy, never "worth", "valuation", "estimate". No dashes. Today is ${today}. The job: ${JSON.stringify(ctx.task.filters)}.`
    : `You are Sam, writing ONE update for a buyer's Task about the new cars that match it, in the third person. Your final message is the update text itself and nothing else: no preamble, no notes, no "here is the update". Call get_matches, then write the update: for each car, one sentence with what it is (year and model, colour and gearbox if known), how far from the buyer if known, and its miles; if the car has an earlier_sale sentence, use it word for word. Never add time words that are not in the tools ("this week"). Facts only: never "worth a look", a good buy, a deal, cheap, or what Sam thinks; no prediction; no first person; no dashes. Every number from the tools. Today is ${today}. The task: ${ctx.task.summary}`;
}
async function execUpdate(env, name, input, ctx) {
  if (name === "get_matches") return { ...(ctx.mode === "opening" ? { live_now_total: ctx.total, listed_under_the_update: ctx.cards.length } : {}), matches: (ctx.cards || []).map(({ history, ...c }) => c), match_reasons: matchReasons(ctx.task.filters) };
  if (name === "car_history") {
    const o = await carHistory(String((input && input.vin_or_url) || ""), env).catch(() => null);
    if (!o || o.kind !== "answer") return { kind: "none", reason: "No earlier auction appearances on record." };
    const cur = ctx.cards ? ctx.cards.find(c => c.vin === o.vin) : null;
    // This live listing itself is not an earlier appearance.
    const apps = o.appearances.filter(a => !cur || !cur.url || String(a.url || "").replace(/\/$/, "") !== String(cur.url).replace(/\/$/, ""));
    if (ctx.mode === "research" && o.car) ctx.car = o.car;   // the car's own identity, for the market read below
    return { kind: "history", vin: o.vin, car: o.car, appearances: apps.map(a => ({ when: a.when, house: a.house, result: a.result, price: a.hammerUsd || a.highBidUsd, miles: a.miles })) };
  }
  if (name === "market_check") {
    // Two reads per research turn at most: a model that keeps rephrasing the car is fishing.
    ctx.mcCalls = (ctx.mcCalls || 0) + 1;
    if (ctx.mode === "research" && ctx.mcCalls > 2) return { kind: "none", reason: "No more market reads in this turn." };
    const o = await marketCheck(String((input && input.car) || ""), env).catch(() => null);
    if (!o || o.kind !== "answer") return { kind: "none", reason: (o && (o.reason || o.question)) || "No recorded sales to read." };
    // A read that resolved to a different model than the car itself (an XJS read as an XJ) is not about
    // this car: refused, and the reason names no model, so neither the name nor its numbers can be used.
    if (ctx.car && specModelMismatch(o.spec, ctx.car)) return { kind: "none", reason: "No market read for this exact model." };
    return { spec: o.spec, sold_range: o.soldRangeHammerUsd, sales: o.salesCount, period: o.period };
  }
  return { error: "unknown tool" };
}
// True when a market read's model words (after the year and make, body words aside) are not all in the
// car's own identity: "1992 Jaguar XJ coupe" against "1992 Jaguar XJS V12".
function specModelMismatch(spec, car) {
  // Generation numbers stay out (a 2008 911 is a 997; the identity says 911).
  const words = String(spec || "").replace(/^\s*(?:19|20)\d{2}(?:\s*(?:to|-)\s*(?:19|20)\d{2})?\s+/, "").split(/\s+/).filter(w => w && !/^(coupe|cabriolet|convertible|roadster|targa|sedan|wagon|spyder|spider|fastback|hatchback|hardtop)s?$/i.test(w) && !/^\d{3}$/.test(w));
  return words.length > 1 && unsupportedNames(words.join(" "), [car]).length > 0;
}
// The update built in code when the model's fails twice (and the shape Claude is asked to follow).
function histLine(h) {
  const sold = (h && h.appearances || []).filter(a => a.result === "sold" && a.price);
  if (!sold.length) return "";
  const a = sold[0];
  return `The same car sold ${/^(Gooding|RM|Bonhams|Broad|Mecum|Barrett)/.test(a.house || "") ? "at" : "on"} ${a.house} in ${a.when} for ${a.price}.`;
}
function cardLine(c, lead) {
  const what = [c.colour, c.gearbox === "manual" ? "manual" : null, c.title].filter(Boolean).join(" ");
  const where = c.distance_miles != null ? `${num(c.distance_miles)} miles from you` : (c.location ? `in ${c.location}` : "");
  // "A" before a word that starts with a vowel letter reads "An" ("An Arctic Silver ...", "An orange ...").
  if (/^(?:A|It is a|The first is a|Another is a)$/.test(lead) && /^[AEIOU]/i.test(what)) lead = lead.replace(/a$/, "an").replace(/^A$/, "An");
  return `${lead} ${what} just came up${c.house ? ` on ${c.house}` : ""}${where ? `, ${where}` : ""}${c.miles ? `, ${num(c.miles)} miles` : ""}.`;
}
function updateCodeReply(trace, ctx) {
  if (ctx.mode === "opening") {
    const first = ctx.total === 1 ? "One car that matches is live right now." : `${num(ctx.total)} cars that match are live right now.`;
    return [first, ...ctx.cards.slice(0, ctx.total === 1 ? 1 : 2).map((c, i) => cardLine(c, i === 0 ? (ctx.total === 1 ? "It is a" : "The first is a") : "Another is a").replace(" just came up", " listed"))].join(" ");
  }
  if (ctx.mode === "research") {
    const h = trace.filter(t => t.tool === "car_history").pop(), m = trace.filter(t => t.tool === "market_check").pop();
    // Oldest first, so "then" reads in time order.
    const apps = (h && h.result && h.result.appearances || []).slice().sort((a, b) => (Date.parse("1 " + a.when) || 0) - (Date.parse("1 " + b.when) || 0));
    const hs = apps.length ? `This car has ${apps.length === 1 ? "one earlier auction appearance" : apps.length + " earlier auction appearances"}: ` + apps.map(a => `${a.result === "sold" ? "sold" : "not sold"} ${a.house ? "on " + a.house + " " : ""}in ${a.when}${a.price ? " at " + a.price : ""}`).join(", then ") + "." : "This car has no earlier auction appearances on record.";
    const ms = m && m.result && m.result.sold_range ? `${m.result.spec} sold for ${m.result.sold_range.low} to ${m.result.sold_range.high}${m.result.sales ? ` across ${m.result.sales} sales` : ""}.` : "";
    return [hs, ms].filter(Boolean).join(" ");
  }
  const hist = Object.fromEntries(trace.filter(t => t.tool === "car_history" && t.result && t.result.vin).map(t => [t.result.vin, t.result]));
  const lines = [];
  ctx.cards.forEach((c, i) => { lines.push(cardLine(c, i === 0 ? "A" : "Another")); const h = c.earlier_sale || (c.vin && hist[c.vin] ? histLine(hist[c.vin]) : ""); if (h) lines.push(h); });
  return lines.join(" ");
}
const UPDATE_MATCH_TOOLS = UPDATE_TOOLS.filter(t => t.name === "get_matches");
// Every make, model, generation and body style in an update must be in that turn's tool results or the
// buyer's own words (the task they typed, and the read-back they confirmed), like an unsupported number.
function namesCheck(reply, trace, ctx, userText) {
  const bad = unsupportedNames(reply, [trace.map(t => t.result), ctx.task && ctx.task.words, ctx.task && ctx.task.summary, ctx.task && ctx.task.filters, userText]);
  return bad.length ? [`a car name not in the tool results or the buyer's words ("${bad.join('", "')}")`] : [];
}
const UPDATE = { system: updatePrompt, tools: UPDATE_TOOLS, execTool: execUpdate, codeReply: updateCodeReply, extraCheck: namesCheck, cacheSystem: true,
  extraBlocks: [[/\bSam (?:thinks|believes|feels|likes|recommends|loves)\b|\bworth a (?:look|closer look)\b|\bgood buy\b|\bmust[- ]see\b/i, "a judgement or an opinion in an update"]],
  rewriteHint: "Facts from the tools only: the cars, their distance and miles, an earlier sale if car_history returned one, nothing more. No judgements, no opinions, third person." };

export function cardOfMatch(x) {
  const r = x.r, t = liveTrust(r);
  // The card's name in the shared humanised title (lib/carTitle.js, as Buy's cards): shouting words in
  // proper case, badges as the maker writes them.
  return { id: r.id, title: humanTitle(String(r.listing_title || "").replace(/^.*?\b(?=(?:19|20)\d{2}\b)/, "").replace(/\s+\d-Speed.*$/i, "")), year: r.year, colour: x.facts && x.facts.colour || null, gearbox: x.facts && x.facts.gearbox || null,
    miles: t.unit === "km" ? null : t.miles, km: t.km, distance_miles: x.distance != null ? Math.max(1, Math.round(x.distance)) : null, location: r.location || null, house: houseName(r.source), url: r.url || null, vin: r.vin_norm || null, ends: r.end_time ? String(r.end_time).slice(0, 10) : null, bid_usd: t.priceUsd, bid_at: t.priceUsd ? (r.bid_at || null) : null };
}

// ---------------------------------------------------------------- the live task alert (Oct 2026)
// Built in code from the stored listing rows, never the chat model. Per car, in this order: the car sentence;
// "View on {venue}" (straight to the listing, the primary action); the current bid exactly as stored ("Current
// bid $1"), or "No bids yet" only when there is no bid; when bidding ends, labelled Pacific time; one range line
// from the SAME pair Buy's cards use (lib/live/search.js listingMarket + lib/onebox.js placingFor), only when
// the engine has a range; a reason line only from the buyer's own filters that are true of this car.
const TASK_EMAIL_TZ = "America/Los_Angeles";
function endsLine(iso) {
  const d = new Date(iso); if (!iso || isNaN(d)) return null;
  // The one time format across every email (Oct 2026): "Thursday, October 15 at 11:00am PT".
  const day = d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: TASK_EMAIL_TZ });
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: TASK_EMAIL_TZ }).replace(" AM", "am").replace(" PM", "pm");
  return `Bidding ends ${day} at ${time} PT.`;
}
// "Matches your task: manual, 911, 1984." Only criteria the task actually has, and only when true of this car.
function reasonLine(f, c, bid) {
  const bits = [];
  if (f.gearbox === "manual" && c.gearbox === "manual") bits.push("manual");
  else if (f.gearbox && f.gearbox !== "manual" && c.gearbox && c.gearbox !== "manual") bits.push("automatic");
  if (f.colour && c.colour && String(c.colour).toLowerCase().includes(String(f.colour).toLowerCase())) bits.push(String(f.colour).toLowerCase());
  if (f.generation) bits.push(String(f.generation)); else if (f.model) bits.push(String(f.model));
  if ((f.year_min || f.year_max) && c.year) bits.push(String(c.year));
  if (Number(f.budget_max) > 0 && bid && bid <= Number(f.budget_max)) bits.push(`under ${usd(f.budget_max)}`);
  if (Number(f.miles_max) > 0 && c.miles != null && c.miles <= Number(f.miles_max)) bits.push(`under ${num(f.miles_max)} miles`);
  if (f.location && c.distance_miles != null) bits.push(`${num(c.distance_miles)} miles from ${f.location}`);
  return bits.length ? `Matches your Task: ${bits.join(", ")}.` : null;
}
// One car's market lines in the Task email, from one listingMarket read (m null when the bid is not usable): the
// rung applied (lib/live/rung.js; no rung, the same object). The bid is printed once: inside the range line when the
// engine has a range, else on its own. lines: what the block prints between its View button and its end time, in
// order; with no rung it is exactly [range line] or [bid line], as before. Pure, so scripts/rungCheck.mjs runs it.
export function blockLines(m0, stored, asOf, bidLine, lead = "Current bid") {
  const m = applyRung(m0 && m0.kind !== "pending" ? m0 : null);
  let rangeLine = null, extra = null, rung = [];
  // Only when the engine says the range fits the car (bodyScoped true or null); false leaves the bid alone.
  // Never placed against a sibling's sales (another car): its range is shown, labelled, past year only.
  const placing = stored != null && m && m.kind === "range" && m.bodyScoped !== false && m.rung !== "sibling" ? placingFor(stored, [Number(m.low), Number(m.high)]) : null;
  if (placing) rangeLine = `${lead} ${usd(stored)}${asOf}, ${placing} of recent sales.`;
  else if (m && m.rung === "sibling") extra = middleHalfLine(m);
  else if (m && m.rung === "not_enough_data") extra = m.soldLine;   // the count only
  // The rung line sits above the line it names, and only when there is one.
  if ((rangeLine || extra) && m.rungLines) rung = m.rungLines;
  return { rangeLine, lines: rangeLine ? [...rung, rangeLine] : [bidLine, ...rung, extra].filter(Boolean) };
}
// The bid part of one live car's block, by the bid's own time (lib/tasks/bidTime.js): within the hour as before
// ("Current bid $61,500."); older, only with its time ("Last bid we saw: $61,500 at 5:30am PT."), never as current; no
// bid time, no bid line at all (the block's "Bidding ends" line stays). Pure, so scripts/beforeItEndsCheck.mjs runs it.
export function bidBlock(r, m, now = new Date()) {
  const raw = r.current_bid_usd != null && Number(r.current_bid_usd) > 0 ? Math.round(Number(r.current_bid_usd)) : null;
  const st = bidState(raw, r.bid_at, now);
  const stored = st.kind === "fresh" || st.kind === "old" ? raw : null;
  const lead = st.kind === "old" ? "Last bid we saw:" : "Current bid", asOf = st.kind === "old" ? ` at ${bidTimePT(st.at, now)}` : "";
  const bidLine = stored != null ? `${lead} ${usd(stored)}${asOf}.` : st.kind === "untimed" ? null : "No bids yet.";
  return { raw, stored, bidLine, ...blockLines(m, stored, asOf, bidLine, lead) };
}
export async function taskEmailBlocks(env, rows, cards, now = new Date()) {
  const out = [];
  for (const c of cards) {
    const r = rows.find(x => Number(x.id) === Number(c.id)) || {};
    const t = liveTrust(r);
    const what = [c.colour, c.gearbox === "manual" ? "manual" : null, c.title].filter(Boolean).join(" ");
    const art = /^[aeiou8]/i.test(what) || /^1[18]\b/.test(what) ? "An" : "A";
    const venue = c.house || houseName(r.source) || "the auction";
    // "A X, located in Y, has 58,000 miles and is listed on Z." with each part only when the record has it.
    const miles = c.miles != null ? `${num(c.miles)} miles` : c.km != null ? `${num(c.km)} km` : null;
    const car = `${art} ${what}${c.location ? `, located in ${c.location},` : ""}${miles ? ` has ${miles} and` : ""} is listed on ${venue}.`;
    const usable = bidBlock(r, null, now).stored != null && t.priceState !== "suspect" && t.priceState !== "unconverted";
    const m = usable ? await listingMarket(env, r, listingFacts(r)).catch(() => null) : null;
    const { rangeLine, lines, bidLine, raw } = bidBlock(r, m, now);
    out.push({ id: c.id, car, url: c.url || r.url || null, venue, bidLine: rangeLine ? null : bidLine, ends: endsLine(r.end_time), rangeLine, lines, bid: raw });
  }
  return out;
}
// Subject (owner's form, Oct 2026): "Sam found a 1987 Porsche 911 Carrera Targa G50, live now"; several cars:
// "Sam found three cars for your task, live now". Never the word alert, no dashes.
const COUNT_WORDS = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
export function taskEmailSubject(cards) {
  if (cards.length === 1) { const t = String(cards[0].title || "car").trim(); return `Sam found ${/^[aeiou8]/i.test(t) || /^1[18]\b/.test(t) ? "an" : "a"} ${t}, live now`; }
  return `Sam found ${COUNT_WORDS[cards.length] || countText(cards.length)} cars for your Task, live now`;
}
// section: the Task's part of the combined Task email (lib/tasks/digest.js): its cars, its summary and its own
// Open, Pause and Stop links, with no junk-folder line and no sign-off (the combined email adds those once).
export function taskEmailBody(task, blocks, { first, more = 0, section = false } = {}) {
  const open = `${SITE}/tasks/mine?task=${task.id}`, pause = oneTap(task.id, "pause"), stop = oneTap(task.id, "stop");
  const f = task.filters || {};
  const esc = x => String(x).replace(/[&<>"]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));
  const textBlocks = blocks.map(b => [b.car, b.url ? `View on ${b.venue}: ${b.url}` : null, ...(b.lines || [b.rangeLine || b.bidLine]), b.ends, reasonLine(f, b.card || {}, b.bid)].filter(Boolean).join("\n"));
  const moreLine = more > 0 ? `And ${countText(more)} more ${more === 1 ? "is" : "are"} in your Task.` : "";
  const text = `${textBlocks.join("\n\n")}${moreLine ? `\n\n${moreLine} ${open}` : ""}\n\n${task.summary || ""}\nOpen the Task: ${open}\nPause: ${pause}\nStop: ${stop}` + (section ? "" : `\n\n${first ? JUNK_LINE + "\n\n" : ""}GoAskSam`);
  const btn = (href, label) => `<a href="${esc(href)}" style="display:inline-block;margin:6px 0 4px;padding:11px 18px;border-radius:8px;background:#1E4D38;color:#ffffff;text-decoration:none;font-family:Arial,sans-serif;font-size:15px;font-weight:600">${esc(label)}</a>`;
  const small = s => `<p style="margin:2px 0;font-family:Arial,sans-serif;font-size:15px;color:#1A1A1A">${esc(s)}</p>`;
  const htmlBlocks = blocks.map(b => `<div style="margin:0 0 22px"><p style="margin:0 0 6px">${esc(b.car)}</p>${b.url ? btn(b.url, `View on ${b.venue}`) : ""}${(b.lines || [b.rangeLine || b.bidLine]).map(small).join("")}${b.ends ? small(b.ends) : ""}${reasonLine(f, b.card || {}, b.bid) ? small(reasonLine(f, b.card || {}, b.bid)) : ""}</div>`).join("");
  const html = `<div style="font-family:Georgia,serif;font-size:17px;line-height:1.5;color:#1A1A1A;max-width:560px">${htmlBlocks}${moreLine ? `<p style="font-family:Arial,sans-serif;font-size:15px"><a href="${esc(open)}" style="color:#1A1A1A">${esc(moreLine)}</a></p>` : ""}<p style="font-family:Arial,sans-serif;font-size:13px;color:#5F5A53">${esc(task.summary || "")}</p><p style="font-family:Arial,sans-serif;font-size:15px"><a href="${esc(open)}" style="color:#1A1A1A">Open the Task</a> &nbsp;·&nbsp; <a href="${esc(pause)}" style="color:#1A1A1A">Pause</a> &nbsp;·&nbsp; <a href="${esc(stop)}" style="color:#1A1A1A">Stop</a></p>${section ? "" : `${first ? `<p style="font-family:Arial,sans-serif;font-size:13px;color:#5F5A53">${esc(JUNK_LINE)}</p>` : ""}<p style="font-family:Arial,sans-serif;font-size:13px;color:#5F5A53">GoAskSam</p>`}</div>`;
  return { text, html };
}
// The send-time check (stored records, no metered fetch): each car is still live (status and end time). A read
// that fails keeps only cars whose stored end time is still in the future.
export async function stillLive(env, rows, now = new Date()) {
  const ids = rows.map(r => Number(r.id)).filter(Number.isFinite);
  let fresh = null;
  if (ids.length && !env.mem) fresh = await supabaseSelect(env, `live_listings?id=in.(${ids.join(",")})&select=id,status,end_time,current_bid_usd,current_bid,currency,bid_at`).catch(() => null);
  const byId = new Map((fresh || []).map(x => [Number(x.id), x]));
  const keep = [], dropped = [];
  for (const r of rows) {
    const f = byId.get(Number(r.id));
    const merged = f ? { ...r, ...f } : r;
    const ended = merged.end_time && Date.parse(merged.end_time) <= now.getTime();
    const closed = f ? (f.status !== "live" || ended) : (!merged.end_time || ended);
    (closed ? dropped : keep).push(merged);
  }
  return { keep, dropped, checked: !!fresh };
}

// ---------------------------------------------------------------- one-tap links (email)
const SECRET = () => process.env.TASK_LINK_SECRET || process.env.CRON_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "dev";
export function oneTap(taskId, action) { const sig = crypto.createHmac("sha256", SECRET()).update(taskId + "|" + action).digest("base64url").slice(0, 22); return `${SITE}/api/tasks?a=${action}&t=${taskId}.${sig}`; }
// One-click unsubscribe (RFC 8058) on every task email: the task's own signed Stop link, which acts only
// on a POST (the mail provider's one-click POST, or the confirm page's button); a GET only shows the page.
// Stop ALL Task emails for one person (Oct 2026): the List-Unsubscribe header and one-click POST (RFC 8058) on every
// Task email, and the footer link of the combined email. It turns the "Email updates" switch off (setNotifyPrefs
// on:false): no Task email of any kind goes to them after; their Tasks keep running and show on the Tasks page.
export function emailsOffLink(userId) { return oneTap(userId, "emails_off"); }
export function emailsOffHeaders(userId) { return { "List-Unsubscribe": `<${emailsOffLink(userId)}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" }; }
// A Task's own email: the person-wide stop when the Task knows its person, else (an old row) that Task's Stop.
export const taskMailHeaders = task => (task && task.user_id ? emailsOffHeaders(task.user_id) : unsubscribeHeaders(task.id));
export function unsubscribeHeaders(taskId) { return { "List-Unsubscribe": `<${oneTap(taskId, "stop")}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" }; }
export function verifyTap(token, action) { const [id, sig] = String(token || "").split("."); if (!id || !sig) return null; const ok = crypto.createHmac("sha256", SECRET()).update(id + "|" + action).digest("base64url").slice(0, 22); return crypto.timingSafeEqual(Buffer.from(ok), Buffer.from(sig.padEnd(ok.length).slice(0, ok.length))) ? id : null; }

// ---------------------------------------------------------------- every Tasks model call
// Cost ceilings (Oct 2026): every Tasks model call goes through here. It is logged as spend (tasks_model_turn,
// with its cost) and held to the one global daily model cap shared with Buy chat (lib/_ceilings.js
// modelSpendGuard, $50). Over the cap there is no model call: a Task update writes its line in code (the
// surface's own codeReply, the same line the guard falls back to), and the setup chat and research answer
// with the paused sentence. Test drafts (probe tests) never call the model and are never held.
export async function modelTurn(kind, surface, args) {
  // args.paused: the caller found this account past its own daily limit (lib/_ceilings.js tasksAllowance).
  if (!args.testDrafts) {
    const g = args.paused ? { ok: false, why: "account" } : await modelSpendGuard(args.env).catch(() => ({ ok: true }));
    if (!g.ok) {
      const reply = kind === "setup" || kind === "research" ? TASKS_MODEL_PAUSED : clean(surface.codeReply([], args.ctx));
      if (args.env && args.env.supabaseUrl) await recordUsageEvent({ event_type: "tasks_model_paused", route: "tasks", status: "capped", oldcarsdata_metered_requests: 0, metadata: { kind, why: g.why || "spend", user_id: args.userId || null } }, args.env.supabaseUrl, args.env.supabaseKey).catch(() => {});
      return { reply, textOut: true, ctx: args.ctx, usage: { input_tokens: 0, output_tokens: 0, calls: 0 }, trace: [], ms: 0, capped: true };
    }
  }
  const out = await runChatTurn(surface, args);
  const u = out.usage || {};
  if (u.calls && args.env && args.env.supabaseUrl) await recordUsageEvent({ event_type: "tasks_model_turn", route: "tasks", status: "ok", anthropic_model: args.model, anthropic_input_tokens: u.input_tokens, anthropic_output_tokens: u.output_tokens, anthropic_cost_usd: anthropicCost(u), oldcarsdata_metered_requests: 0, metadata: { kind, user_id: args.userId || null, calls: u.calls, cache_read: u.cache_read_input_tokens || 0, cache_write: u.cache_creation_input_tokens || 0, ms: out.ms } }, args.env.supabaseUrl, args.env.supabaseKey).catch(() => {});
  return out;
}

// ---------------------------------------------------------------- notify (in-app always, email best-effort)
export async function notify(env, task, update, subject, opts = {}) {
  await saveTask(env, task.id, { unread: (task.unread || 0) + 1 });
  if (!(task.channels || ["inapp", "email"]).includes("email")) return;
  const thread = `${SITE}/tasks/mine?task=${task.id}`;
  if (opts.email) { opts.textOverride = opts.email.text; opts.htmlOverride = opts.email.html; }
  // Model-written text (a research summary, a match reply) is screened for the banned words (lib/tasks/emailWords.js);
  // on a hit the email carries the plain line instead and the hit is logged, words only. The Task page keeps the text.
  const generated = update.kind === "research" || update.kind === "match";
  const shown = emailText(update.text, { generated, plain: update.kind === "research" ? RESEARCH_PLAIN : "Sam has an update on your Task. Open the Task to read it." });
  if (shown.held && env.supabaseUrl) recordUsageEvent({ event_type: "email_words_held", route: "tasks", status: "held", oldcarsdata_metered_requests: 0, metadata: { surface: update.kind, words: shown.held, task_id: task.id } }, env.supabaseUrl, env.supabaseKey).catch(() => {});
  const text = `${shown.text}\n\nThe Task: ${task.summary || ""}\nOpen the Task: ${thread}\n${opts.keepLooking ? `Have Sam keep looking: ${oneTap(task.id, "keep_looking")}\n` : ""}Pause the Task: ${oneTap(task.id, "pause")}\nStop the Task: ${oneTap(task.id, "stop")}\n\nGoAskSam`;
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const html = `<div style="font-family:Georgia,serif;font-size:17px;line-height:1.5;color:#1A1A1A;max-width:560px"><p>${esc(shown.text)}</p><p style="font-family:Arial,sans-serif;font-size:13px;color:#5F5A53">${esc(task.summary || "")}</p>${opts.keepLooking ? `<p style="margin:0 0 14px"><a href="${oneTap(task.id, "keep_looking")}" style="display:inline-block;padding:11px 18px;border-radius:8px;background:#1E4D38;color:#ffffff;text-decoration:none;font-family:Arial,sans-serif;font-size:15px;font-weight:600">Have Sam keep looking</a></p>` : ""}<p style="font-family:Arial,sans-serif;font-size:15px;line-height:1.9"><a href="${thread}" style="color:#D7262C;white-space:nowrap">Open the Task</a> &nbsp;·&nbsp; <a href="${oneTap(task.id, "pause")}" style="color:#1A1A1A;white-space:nowrap">Pause the Task</a> &nbsp;·&nbsp; <a href="${oneTap(task.id, "stop")}" style="color:#1A1A1A;white-space:nowrap">Stop the Task</a></p><p style="font-family:Arial,sans-serif;font-size:13px;color:#5F5A53">GoAskSam</p></div>`;
  let status, r = null;
  const to = opts.test ? null : opts.to ? testInbox(opts.to) : emailOf(await getDeliveryTargets(env, task.user_id));
  if (opts.test) status = "test";
  else if (!to) status = "no_sign_in_address";
  else {
    r = await sendTaskEmail({ to, subject, text: opts.textOverride || text, html: opts.htmlOverride || html, headers: taskMailHeaders(task) });
    status = r.ok ? "sent" : r.skipped ? "skipped_" + (r.reason || "") : ("failed: " + String(r.error || r.status || "unknown")).slice(0, 200);
    if (!r.ok && !r.skipped) console.error("task email failed:", task.id, status);
  }
  await DB(env).patchUpdate(update.id, { emailed_at: new Date().toISOString(), email_status: status });
  return { status, resend_id: r && r.id || null, held: shown.held, text: opts.textOverride || text };
}

// ---------------------------------------------------------------- research (one turn, then Done)
export async function runResearch(env, user, task, opts = {}) {
  const ctx = { mode: "research", task };
  const words = task.filters.vin || task.filters.url || task.words;
  const guards = [];
  const out = await modelTurn("research", { ...UPDATE, tools: UPDATE_TOOLS.filter(t => t.name !== "get_matches") }, { env, paused: !!opts.paused, userId: user.userId, apiKey: opts.apiKey, model: opts.model, messages: [{ role: "user", content: `Research this car: ${words}` }], ctx, deadlineMs: 25000, testDrafts: opts.testDrafts || null, onGuard: g => guards.push({ attempt: g.attempt, reasons: g.reasons }) });
  // Over the model cap: the paused sentence in the thread, and the research stays open (not marked done).
  if (out.capped) { await addUpdate(env, { task_id: task.id, role: "sam", kind: "system", text: out.reply }); return task; }
  const up = await addUpdate(env, { task_id: task.id, role: "sam", kind: "research", text: out.reply, data: { tools: out.trace.map(t => ({ tool: t.tool, input: t.input, spec: t.result && (t.result.spec || t.result.car) || null })), guards } });
  task = await saveTask(env, task.id, { state: "done", last_interaction_at: new Date().toISOString() });
  await notify(env, task, up, "Sam finished your research", { test: user.test });
  return task;
}

// The task's matches in the live table (the same /buy search): live cars not already reported, and with
// `since`, only those first seen after it.
async function findMatches(env, task, opts, since) {
  const reported = new Set((task.reported_ids || []).map(Number));
  // Live only (Sam, Oct 2026): never a finished car, by status AND by its own end time (a listing whose end has
  // passed is not live even before the next pull marks it ended).
  const keep = r => r.status !== "ended_sold" && r.status !== "ended_unsold" && !(r.end_time && Date.parse(r.end_time) <= Date.now()) && !reported.has(Number(r.id)) && (!since || !r.first_seen || new Date(r.first_seen) > since);
  if (task.filters.vin) {
    const rows = opts.rows || (await supabaseSelect(env, `live_listings?vin_norm=eq.${encodeURIComponent(task.filters.vin)}&status=eq.live&select=id,source,url,listing_title,make,model,year,vin_norm,mileage,location,country,current_bid_usd,end_time,photo_url,first_seen,status,bid_at,last_seen`)) || [];
    return rows.filter(r => String(r.vin_norm || "").toUpperCase() === task.filters.vin && keep(r)).map(r => ({ r, facts: { miles: r.mileage } }));
  }
  // A task never notifies on an unknown: a listing that does not state a named attribute is not a match,
  // even when the Buy search it came from had "Show them too" on.
  const { include_unstated, ...taskFilters } = task.filters || {};
  return trustFilter(task, (await runSearch(env, taskFilters, { rows: opts.rows, keep })).matches).filter(x => taskFits(task, x.r));
}
// THE HARD GATE (Oct 2026): before any other criterion, a listing fits a task only when its make, its model
// family and its year fit the task's own. A gearbox, colour or budget match alone never admits a car.
const gnorm = x => String(x || "").toLowerCase().replace(/[^a-z0-9]/g, "");
export function taskFits(task, r) {
  const f = (task && task.filters) || {};
  if (f.vin) return String(r.vin_norm || "").toUpperCase() === String(f.vin).toUpperCase();
  const title = gnorm(r.listing_title), make = gnorm(r.make), model = gnorm(r.model);
  if (f.make && make !== gnorm(f.make) && !title.includes(gnorm(f.make))) return false;
  if (f.model) {
    const want = gnorm(f.model), gen = gnorm(f.generation);
    if (!(model.includes(want) || title.includes(want) || (gen && (model.includes(gen) || title.includes(gen))))) return false;
  }
  const y = Number(r.year) || Number((/\b(19\d{2}|20[0-3]\d)\b/.exec(String(r.listing_title || "")) || [])[1]) || null;
  if ((Number(f.year_min) > 0 || Number(f.year_max) > 0) && (!y || (f.year_min && y < Number(f.year_min)) || (f.year_max && y > Number(f.year_max)))) return false;
  return true;
}
// The listing's own numbers, read through liveTrust: a price that may not be dollars never meets a
// budget, a mileage not stated in miles never meets a miles limit, specials stay out unless asked for.
// ($0 or missing bids are not a price: the search's spec-based budget check is the only price test.)
function trustFilter(task, matches) {
  const f = task.filters || {};
  return matches.filter(x => {
    const t = liveTrust(x.r);
    if (!specialAsked(t.special, task)) return false;
    if (Number(f.budget_max) > 0) { if (t.priceState === "suspect" || t.priceState === "unconverted") return false; if (t.priceUsd != null && t.priceUsd > Number(f.budget_max)) return false; }
    if (Number(f.miles_max) > 0 && (t.miles == null || t.miles > Number(f.miles_max))) return false;
    return true;
  });
}

// The opening update, right after the buyer confirms a hunt: the cars that match and are live right now
// (closest first, else soonest to close), one update with the count, the cars listed under it. From then
// on the checkpoint (set at start) means only listings new since then produce updates. Shown in the
// thread, not emailed: the buyer is looking at it.
const OPEN_LIST = 12;
async function openingUpdate(env, task, opts, how = {}) {
  const matches = await findMatches(env, task, opts, null).catch(e => { console.error("tasks opening search failed:", e.message); return null; });
  if (matches == null) { await addUpdate(env, { task_id: task.id, role: "sam", kind: "system", text: "Sam could not read the live listings just now. The next check will include every car that matches." }); return (await saveTask(env, task.id, { checkpoint: null })) || task; }
  if (!matches.length) { await addUpdate(env, { task_id: task.id, role: "sam", kind: "match", text: how.edit ? "Nothing new matches right now." : "Nothing that matches is live right now.", data: { opening: true, edit: !!how.edit, total: 0 } }); return task; }
  matches.sort((a, b) => (a.distance ?? 1e9) - (b.distance ?? 1e9) || String(a.r.end_time || "9").localeCompare(String(b.r.end_time || "9")));
  const cards = matches.slice(0, OPEN_LIST).map(cardOfMatch);
  const ctx = { mode: "opening", task, cards, total: matches.length }, guards = [];
  const turn = await modelTurn("update", { ...UPDATE, tools: UPDATE_MATCH_TOOLS }, { env, userId: task.user_id, apiKey: opts.apiKey, model: opts.model, messages: [{ role: "user", content: "Write the update for the cars live right now." }], ctx, deadlineMs: 25000, testDrafts: opts.testDrafts || null, onGuard: g => guards.push({ attempt: g.attempt, reasons: g.reasons }) });
  await addUpdate(env, { task_id: task.id, role: "sam", kind: "match", text: turn.reply, listing_ids: matches.map(x => Number(x.r.id)), data: { opening: true, edit: !!how.edit, cards, total: matches.length, guards } });
  return (await saveTask(env, task.id, { reported_ids: [...(task.reported_ids || []), ...matches.map(x => Number(x.r.id))].slice(-500) })) || task;
}

// ---------------------------------------------------------------- the run (after every live pull)
// opts: { now (Date, mocked in tests), rows (seeded listing rows), taskId (one task), test }
export async function runTasks(env, opts = {}) {
  const now = opts.now ? new Date(opts.now) : new Date();
  const tasks = (await DB(env).forRun(opts.taskId)) || [];
  const report = [];
  for (const task of tasks) {
    try { report.push(await runOne(env, task, now, opts)); } catch (e) { report.push({ id: task.id, error: String(e.message || e).slice(0, 200) }); }
  }
  return { ran: tasks.length, at: now.toISOString(), report };
}
async function runOne(env, task, now, opts) {
  const out = { id: task.id, state: task.state, matched: 0, update: null };
  // 60 days with no interaction: one "Still looking?"; 7 days later with no response, pause.
  const quietMs = now - new Date(task.last_interaction_at);
  if (task.state === "running" && task.kind === "hunt") {
    if (!task.still_looking_sent_at && quietMs >= 60 * 864e5) {
      const up = await addUpdate(env, { task_id: task.id, role: "sam", kind: "still_looking", text: `Still looking? Sam has been looking for ${jobPhrase(task.filters)} for a while. One tap keeps the Task running.` });
      await saveTask(env, task.id, { still_looking_sent_at: now.toISOString() });
      await notify(env, { ...task }, up, "Still looking?", { keepLooking: true, test: opts.test });
      out.still_looking = true; return out;
    }
    if (task.still_looking_sent_at && now - new Date(task.still_looking_sent_at) >= 7 * 864e5 && new Date(task.last_interaction_at) <= new Date(task.still_looking_sent_at)) {
      await saveTask(env, task.id, { state: "paused" });
      await addUpdate(env, { task_id: task.id, role: "sam", kind: "system", text: "Sam paused this Task after no reply to Still looking? One tap resumes it." });
      out.auto_paused = true; return out;
    }
  }
  if (task.state !== "running" || task.kind !== "hunt") return out;
  // Only listings NEW since the checkpoint, never one already reported, never a finished car.
  const since = task.checkpoint ? new Date(task.checkpoint) : new Date(0);
  const reported = new Set((task.reported_ids || []).map(Number));
  const matches = await findMatches(env, task, opts, since);
  const newestSeen = new Date(Math.max(now.getTime() - 60e3, since.getTime()));
  if (!matches.length) { await saveTask(env, task.id, { checkpoint: newestSeen.toISOString() }); return out; }   // nothing new: silence
  // Send-time check (stored records): only cars still live now. Ended ones are skipped silently, logged, and
  // marked reported so they never come back.
  const live = await stillLive(env, matches.map(x => x.r), now);
  if (live.dropped.length) console.log("task email skipped ended listings:", task.id, live.dropped.map(r => r.id).join(","), live.checked ? "status/end time" : "stored end time");
  const liveIds = new Set(live.keep.map(r => Number(r.id)));
  const droppedIds = live.dropped.map(r => Number(r.id));
  const liveMatches = matches.filter(x => liveIds.has(Number(x.r.id))).map(x => ({ ...x, r: live.keep.find(r => Number(r.id) === Number(x.r.id)) || x.r }));
  if (!liveMatches.length) { await saveTask(env, task.id, { checkpoint: newestSeen.toISOString(), reported_ids: [...reported, ...droppedIds].slice(-500) }); out.skipped_ended = droppedIds.length; return out; }
  out.matched = liveMatches.length;
  const cards = liveMatches.map(cardOfMatch);
  // Each car's earlier sale, looked up in code (car_history), so the writer has nothing to narrate.
  for (const c of cards) if (c.vin) { const h = await execUpdate(env, "car_history", { vin_or_url: c.vin }, { cards }).catch(() => null); if (h && h.kind === "history") { c.earlier_sale = histLine(h) || null; c.history = h; } }
  const ctx = { mode: "match", task, cards, testBad: !!(opts.test && opts.testBad) };
  const testDrafts = opts.testDrafts || (opts.test && opts.testBad) ? (opts.testDrafts || ["Sam thinks this one is worth a look. " + cardLine(cards[0], "A"), "Sam thinks the " + cards[0].title + " is worth a look."]) : null;
  const turn = await modelTurn("update", { ...UPDATE, tools: UPDATE_MATCH_TOOLS }, { env, userId: task.user_id, apiKey: opts.apiKey, model: opts.model, messages: [{ role: "user", content: "Write the update for the new matches." }], ctx, deadlineMs: 25000, testDrafts, onGuard: g => { (out.guards = out.guards || []).push(g); } });
  const up = await addUpdate(env, { task_id: task.id, role: "sam", kind: "match", text: turn.reply, listing_ids: cards.map(c => c.id), data: { cards, guards: (out.guards || []).map(g => ({ attempt: g.attempt, reasons: g.reasons })) } });
  const saved = await saveTask(env, task.id, { checkpoint: newestSeen.toISOString(), reported_ids: [...reported, ...cards.map(c => Number(c.id)), ...droppedIds].slice(-500) });
  // At most 10 cars in one email; the rest are in the task (nothing is dropped from the task itself).
  const EMAIL_CAP = 10, shown = cards.slice(0, EMAIL_CAP);
  // Built here only for a test run; the combined email builds its blocks at send time, with the bids as they stand.
  const blocks = opts.test ? (await taskEmailBlocks(env, live.keep, shown)).map(b => ({ ...b, card: cards.find(c => Number(c.id) === Number(b.id)) })) : [];
  const first = false;
  // Task email frequency (Oct 2026): the match is shown in the Task now and QUEUED for the person's combined Task
  // email (lib/tasks/digest.js), which goes out on their setting (default once a day) under the daily cap. A test
  // run (opts.test) keeps the old immediate path so the probe scenarios still read their update.
  if (opts.test) await notify(env, saved || task, up, taskEmailSubject(cards), { test: opts.test, email: taskEmailBody(saved || task, blocks, { first, more: cards.length - shown.length }) });
  else { await saveTask(env, task.id, { unread: ((saved || task).unread || 0) + 1 }); await DB(env).patchUpdate(up.id, { email_status: (saved || task).channels && !(saved || task).channels.includes("email") ? "off" : "queued" }); }
  out.update = turn.reply; out.state_after = (saved || task).state;
  return out;
}

// Old pieces offered as starting tasks: hunt rows and watched saved searches not yet seeded.
export async function suggestions(env, userId) {
  const seeded = new Set((await DB(env).seededRefs(userId)).filter(Boolean));
  if (env.mem) return [];
  const out = [];
  const hunts = await supabaseSelect(env, `hunts?user_id=eq.${userId}&select=id,text&order=created_at.desc&limit=5`).catch(() => null);
  for (const h of hunts || []) if (!seeded.has("hunt:" + h.id)) out.push({ from: "hunt", ref: "hunt:" + h.id, words: h.text });
  const ws = await supabaseSelect(env, `buy_conversations?user_id=eq.${userId}&watch=is.true&select=id,title&order=updated_at.desc&limit=5`).catch(() => null);
  for (const w of ws || []) if (!seeded.has("search:" + w.id)) out.push({ from: "watched_search", ref: "search:" + w.id, words: w.title });
  return out;
}
export { ACTIVE };
