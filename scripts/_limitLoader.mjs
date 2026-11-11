// Test-only module hook: loads lib/tasks/limit.js with FREE_TASK_LIMIT set to TASK_LIMIT_OVERRIDE (so a check can be run "with the constant at 3"). Registered by scripts/_limitRegister.mjs; nothing in the product imports this.
const N = Number(process.env.TASK_LIMIT_OVERRIDE) || 0;
export async function load(url, context, nextLoad) {
  const r = await nextLoad(url, context);
  if (N && /\/lib\/tasks\/limit\.js(\?|$)/.test(url)) {
    const src = String(r.source);
    if (!/export const FREE_TASK_LIMIT = \d+;/.test(src)) throw new Error("limit loader: FREE_TASK_LIMIT line not found");
    return { ...r, source: src.replace(/export const FREE_TASK_LIMIT = \d+;/, `export const FREE_TASK_LIMIT = ${N};`) };
  }
  return r;
}
