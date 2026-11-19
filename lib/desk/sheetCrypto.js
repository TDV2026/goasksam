import { randomUUID } from "node:crypto";
// a sheet id is a uuid: desk_sheets.id is uuid (Lane S, docs/supabase-desk-storage.sql)
export const crypto = { id: () => randomUUID() };
