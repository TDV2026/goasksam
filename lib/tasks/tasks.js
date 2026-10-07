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
import { runChatTurn, usd } from "../live/chatCore.js";
import { runSearch } from "../live/samChat.js";
import { marketCheck } from "../tools/marketCheck.js";
import { carHistory } from "../tools/carHistory.js";
import { supabaseSelect } from "../_supabase.js";
import { sendTaskEmail } from "../_email.js";
import { houseName } from "../../api/_historyData.js";

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
  userTasks: userId => rest(env, `tasks?user_id=eq.${userId}&state=neq.draft&select=*&order=updated_at.desc&limit=30`),
  taskUpdates: taskId => rest(env, `task_updates?task_id=eq.${taskId}&select=*&order=created_at.asc&limit=200`),
  saveTask: async (id, patch) => ((await rest(env, `tasks?id=eq.${id}`, "PATCH", { ...patch, updated_at: new Date().toISOString() }, "return=representation")) || [])[0] || null,
  newTask: async row => ((await rest(env, "tasks", "POST", [row], "return=representation")) || [])[0],
  addUpdate: async row => ((await rest(env, "task_updates", "POST", [row], "return=representation")) || [])[0],
  patchUpdate: (id, patch) => rest(env, `task_updates?id=eq.${id}`, "PATCH", patch),
  activeOther: async (userId, notId) => (await rest(env, `tasks?user_id=eq.${userId}&state=in.(running,needs_you)&id=neq.${notId}&select=id,summary&limit=1`)) || [],
  forRun: taskId => rest(env, taskId ? `tasks?id=eq.${taskId}&select=*` : "tasks?state=in.(running,needs_you,paused)&select=*&limit=500"),
  seededRefs: async userId => ((await rest(env, `tasks?user_id=eq.${userId}&select=seed_ref&limit=200`)) || []).map(t => t.seed_ref)
});
export function memStore() {
  const tasks = [], ups = []; let upId = 1;
  const now = () => new Date().toISOString();
  return {
    tasks, ups,
    getTask: async (id, userId) => tasks.find(t => t.id === id && (!userId || t.user_id === userId)) || null,
    userTasks: async userId => tasks.filter(t => t.user_id === userId && t.state !== "draft").slice().reverse(),
    taskUpdates: async taskId => ups.filter(u => u.task_id === taskId),
    saveTask: async (id, patch) => { const t = tasks.find(x => x.id === id); if (!t) return null; Object.assign(t, patch, { updated_at: now() }); return { ...t }; },
    newTask: async row => { const t = { id: crypto.randomUUID(), unread: 0, reported_ids: [], channels: ["inapp", "email"], checkpoint: null, still_looking_sent_at: null, last_interaction_at: now(), created_at: now(), updated_at: now(), ...row }; tasks.push(t); return { ...t }; },
    addUpdate: async row => { const u = { id: upId++, created_at: now(), emailed_at: null, email_status: null, read_at: null, ...row }; ups.push(u); return { ...u }; },
    patchUpdate: async (id, patch) => { const u = ups.find(x => x.id === id); if (u) Object.assign(u, patch); },
    activeOther: async (userId, notId) => tasks.filter(t => t.user_id === userId && ["running", "needs_you"].includes(t.state) && t.id !== notId).map(t => ({ id: t.id, summary: t.summary })),
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
  let noun = car ? (f.body && BODY_PL[String(f.body).toLowerCase()] ? `${car} ${BODY_PL[String(f.body).toLowerCase()]}` : (/s$/.test(car) ? car : car + "s")) : "cars";
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
export const summaryFor = (kind, f) => kind === "research" ? `Sam is researching ${f.vin ? "the car with VIN " + f.vin : f.url ? "the car in that listing" : "that car"}: its auction history and what cars like it sold for.` : `Sam is looking for ${jobPhrase(f)}.`;

// ---------------------------------------------------------------- the task conversation (setup + edits)
const SETUP_TOOLS = [
  { name: "propose_task", description: "Set (or change) the job from the buyer's words. Send the COMPLETE job every time. kind: hunt (ongoing: find cars that come up) or research (finite: one car's history and what cars like it sold for). Returns the read-back sentence to use word for word, or the one question to ask first.",
    input_schema: { type: "object", properties: { kind: { type: "string", enum: ["hunt", "research"] }, make: { type: "string" }, model: { type: "string" }, generation: { type: "string" }, trim: { type: "string" }, body: { type: "string" }, gearbox: { type: "string", enum: ["manual", "automatic"] }, colour: { type: "string" }, budget_max: { type: "number" }, miles_max: { type: "number" }, year_min: { type: "number" }, year_max: { type: "number" }, location: { type: "string" }, radius_miles: { type: "number" }, vin: { type: "string" }, url: { type: "string" } }, required: ["kind"] } },
  { name: "task_control", description: "Start (after the buyer agrees to the read-back), pause, resume or stop the task.", input_schema: { type: "object", properties: { action: { type: "string", enum: ["start", "pause", "resume", "stop"] } }, required: ["action"] } }
];
function setupPrompt(ctx, today) {
  return `You are Sam, setting up a job for a buyer: watching the collector car auctions for them (a hunt) or researching one car (research). Sam always speaks in the third person ("Sam will look for"), never "I", "we" or "our".
- Plain short sentences, no dashes, no lists. Never the words valuation, worth, estimate, appraisal or verdict. Never say a car is a good buy, a deal or worth a look.
- First call propose_task with the complete job from the buyer's words (a stated year, range or decade goes in year_min and year_max; "under 70" for a Porsche means $70,000). Then reply with its "say" sentences word for word and nothing else. If it returns a question, ask only that question.
- When the buyer agrees (yes, start, go ahead), call task_control start. When they ask to pause, resume or stop, call task_control with that.
- When the buyer changes the job, call propose_task again with the complete changed job, then read it back.
- Never invent a number or a car. Never describe the page.
Today is ${today}. The task so far: ${JSON.stringify(ctx.task ? { state: ctx.task.state, kind: ctx.task.kind, job: ctx.task.filters, summary: ctx.task.summary } : null)}. ${ctx.seed ? "It was started from: " + JSON.stringify(ctx.seed) : ""}`;
}
async function execSetup(env, name, input, ctx) {
  if (name === "propose_task") {
    const p = { ...(input || {}) }; const kind = p.kind === "research" ? "research" : "hunt"; delete p.kind;
    for (const k of Object.keys(p)) if (p[k] == null || p[k] === "") delete p[k];
    if (p.year_min && !p.year_max) p.year_max = p.year_min;
    if (p.vin) p.vin = String(p.vin).toUpperCase().replace(/[^A-Z0-9]/g, "");
    // One question when something essential is missing: a hunt needs a model (or a VIN); research needs a car.
    let question = null;
    // A generation names the model (a 997 is a 911).
    if (!p.model && p.generation && /^porsche$/i.test(String(p.make || ""))) p.model = "911";
    if (kind === "hunt" && !p.vin && !p.model && !p.generation) question = p.make ? `Which ${p.make} model should Sam look for?` : "Which car should Sam look for?";
    if (kind === "research" && !p.vin && !p.url && !p.model) question = "Which car should Sam research? A VIN or a listing link works best.";
    ctx.proposed = { kind, filters: p, question };
    if (question) return { kind, question, say: [question] };
    const summary = summaryFor(kind, p);
    return { kind, job: p, say: [summary.replace(/^Sam is (looking for|researching)/, m => m === "Sam is looking for" ? "Sam will look for" : "Sam will research"), kind === "hunt" ? "Shall Sam start?" : "Shall Sam start the research?"] };
  }
  if (name === "task_control") { ctx.control = String((input && input.action) || ""); return { ok: true, action: ctx.control }; }
  return { error: "unknown tool" };
}
const SETUP = { system: setupPrompt, tools: SETUP_TOOLS, execTool: execSetup,
  codeReply: trace => { const t = trace.filter(x => x.tool === "propose_task").pop(); return t && t.result && t.result.say ? t.result.say.join(" ") : "What should Sam look for?"; },
  extraBlocks: [[/\bSam (?:thinks|believes|feels|likes|recommends|loves)\b/i, "Sam giving an opinion"]],
  rewriteHint: "Use the 'say' sentences word for word, nothing else, third person, no judgements." };

// One buyer message in a task thread (a new task's first words, an answer, an edit, yes/pause/stop).
export async function taskTurn(env, user, { taskId, text, seed, apiKey, model }) {
  let task = taskId ? await getTask(env, taskId, user.userId) : null;
  if (!task) task = await newTask(env, { user_id: user.userId, email: user.email || null, kind: "hunt", state: "draft", words: String(text).slice(0, 2000), filters: {}, seeded_from: (seed && seed.from) || "typed", seed_ref: (seed && seed.ref) || null });
  await addUpdate(env, { task_id: task.id, role: "buyer", kind: "message", text: String(text).slice(0, 2000) });
  const history = (await taskUpdates(env, task.id)).filter(u => ["message", "confirm", "question", "research", "system"].includes(u.kind)).slice(-12).map(u => ({ role: u.role === "buyer" ? "user" : "assistant", content: u.text }));
  const ctx = { task, seed, proposed: null, control: null };
  const out = await runChatTurn(SETUP, { env, apiKey, model, messages: history, ctx, deadlineMs: 25000 });
  const patch = { last_interaction_at: new Date().toISOString() };
  if (ctx.proposed) {
    patch.kind = ctx.proposed.kind; patch.filters = ctx.proposed.filters; patch.question = ctx.proposed.question;
    patch.summary = ctx.proposed.question ? null : summaryFor(ctx.proposed.kind, ctx.proposed.filters);
    if (task.state === "draft" && ctx.proposed.question) patch.state = "draft";
    if (["running", "needs_you"].includes(task.state) && ctx.proposed.question) patch.state = "needs_you";
  }
  task = await saveTask(env, task.id, patch);
  await addUpdate(env, { task_id: task.id, role: "sam", kind: ctx.proposed && ctx.proposed.question ? "question" : (ctx.proposed ? "confirm" : "message"), text: out.reply });
  let control = null;
  if (ctx.control) control = await controlTask(env, user, task.id, ctx.control, { apiKey, model });
  return { task: control && control.task ? control.task : task, reply: out.reply, control, guards: out.trace ? undefined : undefined };
}

// ---------------------------------------------------------------- start / pause / resume / stop
export async function controlTask(env, user, taskId, action, opts = {}) {
  let task = await getTask(env, taskId, user.userId);
  if (!task) return { error: "not found" };
  const now = new Date().toISOString();
  const say = async (text, kind = "system") => addUpdate(env, { task_id: task.id, role: "sam", kind, text });
  if (action === "start" || action === "resume" || action === "keep_new") {
    if (!task.summary) return { error: "the job is not set yet", task };
    // One ACTIVE task per account: a second asks which to keep, never runs two.
    const active = await DB(env).activeOther(user.userId, task.id);
    if (active.length && action !== "keep_new") return { needChoice: true, current: active[0], task };
    if (active.length) { await saveTask(env, active[0].id, { state: "paused" }); await addUpdate(env, { task_id: active[0].id, role: "sam", kind: "system", text: "Paused so Sam could start your new task. One tap resumes it." }); }
    if (task.kind === "research") return { task: await runResearch(env, user, task, opts) };
    task = await saveTask(env, task.id, { state: "running", question: null, checkpoint: action === "resume" ? (task.checkpoint || now) : now, last_interaction_at: now, still_looking_sent_at: null });
    if (action !== "resume") { await say(task.summary + " Sam checks every new listing and tells you when one matches."); task = await openingUpdate(env, task, opts); }
    else await say("Resumed. " + task.summary);
    return { task };
  }
  if (action === "keep_current") { task = await saveTask(env, task.id, { state: "paused", last_interaction_at: now }); await say("Kept your current task running. This one is paused; one tap starts it instead."); return { task }; }
  if (action === "pause") { task = await saveTask(env, task.id, { state: "paused", last_interaction_at: now }); await say("Paused. One tap resumes it."); return { task }; }
  if (action === "stop") { task = await saveTask(env, task.id, { state: "done", last_interaction_at: now }); await say("Stopped. This task is done."); return { task }; }
  if (action === "keep_looking") { task = await saveTask(env, task.id, { state: task.state === "paused" ? "running" : task.state, last_interaction_at: now, still_looking_sent_at: null }); await say("Sam is still looking. " + (task.summary || "")); return { task }; }
  return { error: "unknown action", task };
}

// ---------------------------------------------------------------- update writing (matches, research)
const UPDATE_TOOLS = [
  { name: "get_matches", description: "The new live cars that match this task (already matched by the rules-based algorithm), with their facts.", input_schema: { type: "object", properties: {} } },
  { name: "car_history", description: "One car's earlier auction appearances, by VIN.", input_schema: { type: "object", properties: { vin_or_url: { type: "string" } }, required: ["vin_or_url"] } },
  { name: "market_check", description: "What cars like one spec sold for at auction.", input_schema: { type: "object", properties: { car: { type: "string" } }, required: ["car"] } }
];
function updatePrompt(ctx, today) {
  if (ctx.mode === "opening") return `You are Sam, telling a buyer which cars that match their new task are live right now, in the third person. Your final message is the update text itself and nothing else, no preamble. Call get_matches. Write at most three sentences. The first states the count exactly: "${ctx.total === 1 ? "One car that matches is live right now." : "N cars that match are live right now."}" using live_now_total. Then one sentence each for the first ${ctx.total === 1 ? "car" : "one or two cars"} (what it is, colour and gearbox if known, how far from the buyer or where, its miles, the house). The full list shows under the update, so never list more. Facts only: never "worth a look", a good buy, a deal, cheap, or what Sam thinks; no prediction; no first person; no dashes. Every number from the tools. Today is ${today}. The task: ${ctx.task.summary}`;
  return ctx.mode === "research"
    ? `You are Sam, reporting the research the buyer asked for, in the third person. Your final message is the result itself and nothing else, no preamble. Call car_history with the car's VIN or link, and market_check with the car. Then write two or three plain sentences: the car's own auction history (every earlier sale or attempt with its month, house and price), then what cars like it sold for. Facts only, no judgement, no prediction, never whether to buy, never "worth", "valuation", "estimate". No dashes. Today is ${today}. The job: ${JSON.stringify(ctx.task.filters)}.`
    : `You are Sam, writing ONE update for a buyer's task about the new cars that match it, in the third person. Your final message is the update text itself and nothing else: no preamble, no notes, no "here is the update". Call get_matches, then write the update: for each car, one sentence with what it is (year and model, colour and gearbox if known), how far from the buyer if known, and its miles; if the car has an earlier_sale sentence, use it word for word. End with "It matches your task: " (or "They match your task: " for several cars) followed by the match_reasons words exactly. Never add time words that are not in the tools ("this week"). Facts only: never "worth a look", a good buy, a deal, cheap, or what Sam thinks; no prediction; no first person; no dashes. Every number from the tools. Today is ${today}. The task: ${ctx.task.summary}`;
}
async function execUpdate(env, name, input, ctx) {
  if (name === "get_matches") return { ...(ctx.mode === "opening" ? { live_now_total: ctx.total, listed_under_the_update: ctx.cards.length } : {}), matches: (ctx.cards || []).map(({ history, ...c }) => c), match_reasons: matchReasons(ctx.task.filters) };
  if (name === "car_history") {
    const o = await carHistory(String((input && input.vin_or_url) || ""), env).catch(() => null);
    if (!o || o.kind !== "answer") return { kind: "none", reason: "No earlier auction appearances on record." };
    const cur = ctx.cards ? ctx.cards.find(c => c.vin === o.vin) : null;
    // This live listing itself is not an earlier appearance.
    const apps = o.appearances.filter(a => !cur || !cur.url || String(a.url || "").replace(/\/$/, "") !== String(cur.url).replace(/\/$/, ""));
    return { kind: "history", vin: o.vin, car: o.car, appearances: apps.map(a => ({ when: a.when, house: a.house, result: a.result, price: a.hammerUsd || a.highBidUsd, miles: a.miles })) };
  }
  if (name === "market_check") { const o = await marketCheck(String((input && input.car) || ""), env).catch(() => null); return o && o.kind === "answer" ? { spec: o.spec, sold_range: o.soldRangeHammerUsd, sales: o.salesCount, period: o.period } : { kind: "none", reason: (o && (o.reason || o.question)) || "No recorded sales to read." }; }
  return { error: "unknown tool" };
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
  return `${lead} ${what} just came up${c.house ? ` on ${c.house}` : ""}${where ? `, ${where}` : ""}${c.miles ? `, ${num(c.miles)} miles` : ""}.`;
}
function updateCodeReply(trace, ctx) {
  if (ctx.mode === "opening") {
    const first = ctx.total === 1 ? "One car that matches is live right now." : `${num(ctx.total)} cars that match are live right now.`;
    return [first, ...ctx.cards.slice(0, ctx.total === 1 ? 1 : 2).map((c, i) => cardLine(c, i === 0 ? (ctx.total === 1 ? "It is a" : "The first is a") : "Another is a").replace(" just came up", " listed"))].join(" ");
  }
  if (ctx.mode === "research") {
    const h = trace.filter(t => t.tool === "car_history").pop(), m = trace.filter(t => t.tool === "market_check").pop();
    const apps = h && h.result && h.result.appearances || [];
    const hs = apps.length ? `This car has ${apps.length === 1 ? "one earlier auction appearance" : apps.length + " earlier auction appearances"}: ` + apps.map(a => `${a.result === "sold" ? "sold" : "not sold"} ${a.house ? "on " + a.house + " " : ""}in ${a.when}${a.price ? " at " + a.price : ""}`).join(", then ") + "." : "This car has no earlier auction appearances on record.";
    const ms = m && m.result && m.result.sold_range ? `${m.result.spec} sold for ${m.result.sold_range.low} to ${m.result.sold_range.high}${m.result.sales ? ` across ${m.result.sales} sales` : ""}.` : "";
    return [hs, ms].filter(Boolean).join(" ");
  }
  const hist = Object.fromEntries(trace.filter(t => t.tool === "car_history" && t.result && t.result.vin).map(t => [t.result.vin, t.result]));
  const lines = [];
  ctx.cards.forEach((c, i) => { lines.push(cardLine(c, ctx.cards.length === 1 ? "A" : i === 0 ? "A" : "Another,")); const h = c.earlier_sale || (c.vin && hist[c.vin] ? histLine(hist[c.vin]) : ""); if (h) lines.push(h); });
  lines.push(`${ctx.cards.length === 1 ? "It matches" : "Both match"} your task: ${matchReasons(ctx.task.filters)}.`.replace("Both match", ctx.cards.length === 2 ? "Both match" : "They all match"));
  return lines.join(" ").replace(/Another, ([a-z])/, (m, c) => "Another " + c);
}
const UPDATE_MATCH_TOOLS = UPDATE_TOOLS.filter(t => t.name === "get_matches");
const UPDATE = { system: updatePrompt, tools: UPDATE_TOOLS, execTool: execUpdate, codeReply: updateCodeReply,
  extraBlocks: [[/\bSam (?:thinks|believes|feels|likes|recommends|loves)\b|\bworth a (?:look|closer look)\b|\bgood buy\b|\bmust[- ]see\b/i, "a judgement or an opinion in an update"]],
  rewriteHint: "Facts from the tools only: the cars, their distance and miles, an earlier sale if car_history returned one, then 'It matches your task: ' and the match_reasons words. No judgements, no opinions, third person." };

export function cardOfMatch(x) {
  const r = x.r;
  return { id: r.id, title: String(r.listing_title || "").replace(/^.*?\b(?=(?:19|20)\d{2}\b)/, "").replace(/\s+\d-Speed.*$/i, ""), year: r.year, colour: x.facts && x.facts.colour || null, gearbox: x.facts && x.facts.gearbox || null,
    miles: x.facts && x.facts.miles || null, distance_miles: x.distance != null ? Math.max(1, Math.round(x.distance)) : null, location: r.location || null, house: houseName(r.source), url: r.url || null, vin: r.vin_norm || null, ends: r.end_time ? String(r.end_time).slice(0, 10) : null };
}

// ---------------------------------------------------------------- one-tap links (email)
const SECRET = () => process.env.TASK_LINK_SECRET || process.env.CRON_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "dev";
export function oneTap(taskId, action) { const sig = crypto.createHmac("sha256", SECRET()).update(taskId + "|" + action).digest("base64url").slice(0, 22); return `${SITE}/api/tasks?a=${action}&t=${taskId}.${sig}`; }
export function verifyTap(token, action) { const [id, sig] = String(token || "").split("."); if (!id || !sig) return null; const ok = crypto.createHmac("sha256", SECRET()).update(id + "|" + action).digest("base64url").slice(0, 22); return crypto.timingSafeEqual(Buffer.from(ok), Buffer.from(sig.padEnd(ok.length).slice(0, ok.length))) ? id : null; }

// ---------------------------------------------------------------- notify (in-app always, email best-effort)
export async function notify(env, task, update, subject, opts = {}) {
  await saveTask(env, task.id, { unread: (task.unread || 0) + 1 });
  if (!(task.channels || ["inapp", "email"]).includes("email")) return;
  const thread = `${SITE}/tasks?task=${task.id}`;
  const text = `${update.text}\n\nThe task: ${task.summary || ""}\nOpen it: ${thread}\n${opts.keepLooking ? `Keep looking: ${oneTap(task.id, "keep_looking")}\n` : ""}Pause it: ${oneTap(task.id, "pause")}\nStop it: ${oneTap(task.id, "stop")}\n\nSam, GoAskSam`;
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const html = `<div style="font-family:Georgia,serif;font-size:17px;line-height:1.5;color:#1A1A1A;max-width:560px"><p>${esc(update.text)}</p><p style="font-family:Arial,sans-serif;font-size:13px;color:#5F5A53">${esc(task.summary || "")}</p><p style="font-family:Arial,sans-serif;font-size:15px"><a href="${thread}" style="color:#D7262C">Open the task</a>${opts.keepLooking ? ` &nbsp;·&nbsp; <a href="${oneTap(task.id, "keep_looking")}" style="color:#1A1A1A">Keep looking</a>` : ""} &nbsp;·&nbsp; <a href="${oneTap(task.id, "pause")}" style="color:#1A1A1A">Pause</a> &nbsp;·&nbsp; <a href="${oneTap(task.id, "stop")}" style="color:#1A1A1A">Stop</a></p><p style="font-family:Arial,sans-serif;font-size:13px;color:#5F5A53">Sam, GoAskSam</p></div>`;
  let status, r = null;
  if (opts.test) status = "test";
  else {
    r = await sendTaskEmail({ to: task.email, subject, text, html });
    status = r.ok ? "sent" : r.skipped ? "skipped_" + (r.reason || "") : ("failed: " + String(r.error || r.status || "unknown")).slice(0, 200);
    if (!r.ok && !r.skipped) console.error("task email failed:", task.id, status);
  }
  await DB(env).patchUpdate(update.id, { emailed_at: new Date().toISOString(), email_status: status });
  return { status, resend_id: r && r.id || null };
}

// ---------------------------------------------------------------- research (one turn, then Done)
export async function runResearch(env, user, task, opts = {}) {
  const ctx = { mode: "research", task };
  const words = task.filters.vin || task.filters.url || task.words;
  const out = await runChatTurn({ ...UPDATE, tools: UPDATE_TOOLS.filter(t => t.name !== "get_matches") }, { env, apiKey: opts.apiKey, model: opts.model, messages: [{ role: "user", content: `Research this car: ${words}` }], ctx, deadlineMs: 25000 });
  const up = await addUpdate(env, { task_id: task.id, role: "sam", kind: "research", text: out.reply, data: { tools: out.trace.map(t => t.tool) } });
  task = await saveTask(env, task.id, { state: "done", last_interaction_at: new Date().toISOString() });
  await notify(env, task, up, "Sam finished your research", { test: user.test });
  return task;
}

// The task's matches in the live table (the same /buy search): live cars not already reported, and with
// `since`, only those first seen after it.
async function findMatches(env, task, opts, since) {
  const reported = new Set((task.reported_ids || []).map(Number));
  const keep = r => r.status !== "ended_sold" && r.status !== "ended_unsold" && !reported.has(Number(r.id)) && (!since || !r.first_seen || new Date(r.first_seen) > since);
  if (task.filters.vin) {
    const rows = opts.rows || (await supabaseSelect(env, `live_listings?vin_norm=eq.${encodeURIComponent(task.filters.vin)}&status=eq.live&select=id,source,url,listing_title,make,model,year,vin_norm,mileage,location,country,current_bid_usd,end_time,photo_url,first_seen,status`)) || [];
    return rows.filter(r => String(r.vin_norm || "").toUpperCase() === task.filters.vin && keep(r)).map(r => ({ r, facts: { miles: r.mileage } }));
  }
  return (await runSearch(env, task.filters, { rows: opts.rows, keep })).matches;
}

// The opening update, right after the buyer confirms a hunt: the cars that match and are live right now
// (closest first, else soonest to close), one update with the count, the cars listed under it. From then
// on the checkpoint (set at start) means only listings new since then produce updates. Shown in the
// thread, not emailed: the buyer is looking at it.
const OPEN_LIST = 12;
async function openingUpdate(env, task, opts) {
  const matches = await findMatches(env, task, opts, null).catch(e => { console.error("tasks opening search failed:", e.message); return null; });
  if (matches == null) { await addUpdate(env, { task_id: task.id, role: "sam", kind: "system", text: "Sam could not read the live listings just now. The next check will include every car that matches." }); return (await saveTask(env, task.id, { checkpoint: null })) || task; }
  if (!matches.length) { await addUpdate(env, { task_id: task.id, role: "sam", kind: "match", text: "Nothing that matches is live right now.", data: { opening: true, total: 0 } }); return task; }
  matches.sort((a, b) => (a.distance ?? 1e9) - (b.distance ?? 1e9) || String(a.r.end_time || "9").localeCompare(String(b.r.end_time || "9")));
  const cards = matches.slice(0, OPEN_LIST).map(cardOfMatch);
  const ctx = { mode: "opening", task, cards, total: matches.length };
  const turn = await runChatTurn({ ...UPDATE, tools: UPDATE_MATCH_TOOLS }, { env, apiKey: opts.apiKey, model: opts.model, messages: [{ role: "user", content: "Write the update for the cars live right now." }], ctx, deadlineMs: 25000 });
  await addUpdate(env, { task_id: task.id, role: "sam", kind: "match", text: turn.reply, listing_ids: matches.map(x => Number(x.r.id)), data: { opening: true, cards, total: matches.length } });
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
      const up = await addUpdate(env, { task_id: task.id, role: "sam", kind: "still_looking", text: `Still looking? Sam has been watching for ${jobPhrase(task.filters)} for a while. One tap keeps the task running.` });
      await saveTask(env, task.id, { still_looking_sent_at: now.toISOString() });
      await notify(env, { ...task }, up, "Still looking?", { keepLooking: true, test: opts.test });
      out.still_looking = true; return out;
    }
    if (task.still_looking_sent_at && now - new Date(task.still_looking_sent_at) >= 7 * 864e5 && new Date(task.last_interaction_at) <= new Date(task.still_looking_sent_at)) {
      await saveTask(env, task.id, { state: "paused" });
      await addUpdate(env, { task_id: task.id, role: "sam", kind: "system", text: "Sam paused this task after no reply to Still looking? One tap resumes it." });
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
  out.matched = matches.length;
  const cards = matches.map(cardOfMatch);
  // Each car's earlier sale, looked up in code (car_history), so the writer has nothing to narrate.
  for (const c of cards) if (c.vin) { const h = await execUpdate(env, "car_history", { vin_or_url: c.vin }, { cards }).catch(() => null); if (h && h.kind === "history") { c.earlier_sale = histLine(h) || null; c.history = h; } }
  const ctx = { mode: "match", task, cards, testBad: !!(opts.test && opts.testBad) };
  const testDrafts = opts.test && opts.testBad ? ["Sam thinks this one is worth a look. " + cardLine(cards[0], "A"), "Sam thinks the " + cards[0].title + " is worth a look."] : null;
  const turn = await runChatTurn({ ...UPDATE, tools: UPDATE_MATCH_TOOLS }, { env, apiKey: opts.apiKey, model: opts.model, messages: [{ role: "user", content: "Write the update for the new matches." }], ctx, deadlineMs: 25000, testDrafts, onGuard: g => { (out.guards = out.guards || []).push(g); } });
  const up = await addUpdate(env, { task_id: task.id, role: "sam", kind: "match", text: turn.reply, listing_ids: cards.map(c => c.id), data: { cards } });
  const saved = await saveTask(env, task.id, { checkpoint: newestSeen.toISOString(), reported_ids: [...reported, ...cards.map(c => Number(c.id))].slice(-500) });
  await notify(env, saved || task, up, cards.length === 1 ? `A car matching your task just came up` : `${cards.length === 2 ? "Two cars" : "New cars"} matching your task just came up`, { test: opts.test });
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
