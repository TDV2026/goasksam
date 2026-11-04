// DESK INTAKE: the engine read, started in the background when a sheet is created (Lane D, Nov 2026).
// Every figure on a sheet comes from the engine; this module only asks and stores what came back (rule: pages and emails compute nothing).
// Lane B's one sheet read call (lib/desk/sheetRead.js readSheet) is used the moment it exists; until then the same oneEngineAnswer call the consumer pages use.
// A failed read is recorded on the row (engine_status failed) and the sheet screen asks again when it opens; it never blocks or loses the sheet.
import { findGeneration } from "../../generations.js";
import { syncSheet } from "./toSheet.js";

async function loadSheetRead() {
  try { const m = await import("../sheetRead.js"); return typeof m.readSheet === "function" ? m.readSheet : null; }
  catch (e) { if (e && (e.code === "ERR_MODULE_NOT_FOUND" || /Cannot find module/.test(String(e.message)))) return null; throw e; }
}
export function engineReader(store, env) {
  return async function readInBackground(sheet, car, read) {
    const patch = p => store.patchSheet(sheet.org_id, sheet.id, p).catch(() => {});
    try {
      const label = [car.year, car.make, car.model, car.trim].filter(Boolean).join(" ");
      let out = null;
      const readSheet = await loadSheetRead();
      if (readSheet) { const sr = await readSheet(env, { vin: sheet.vin || read.vin || null, vehicle: car, text: label, mileage: read && read.mileage ? read.mileage.miles : sheet.mileage || null }); out = { source: "sheetRead", read: sr }; if (sr) await syncSheet(store, sheet.org_id, sheet.id, { read: sr }).catch(() => {}); }   // Lane E's readSheet is (env, input); its read goes into the sheet object the page opens
      else {
        const { oneEngineAnswer } = await import("../../onebox.js");
        const vehicle = { year: car.year, make: car.make, model: car.model, trim: car.trim || null, bodyStyle: car.bodyStyle || null, raw: label };
        const generation = await findGeneration(vehicle, env).catch(() => null);
        const a = await oneEngineAnswer(vehicle, generation, label, { supabaseUrl: env.supabaseUrl, supabaseKey: env.supabaseKey, asked: 0 }, null);
        const { raw, ...answer } = a || {};
        out = { source: "oneEngineAnswer", read: answer };
      }
      await patch({ engine_read: { ...out, readAt: new Date().toISOString() }, engine_status: "done" });
    } catch (e) {
      await patch({ engine_status: "failed", engine_read: { error: String(e && e.message || e).slice(0, 200), readAt: new Date().toISOString() } });
    }
  };
}
