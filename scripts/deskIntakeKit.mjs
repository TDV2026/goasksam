// Shared fixtures for the Desk intake and send checks (Lane D, Nov 2026): a memory store, a mail builder, VINs with real check digits.
// The root argument lets a check run against a tree that lacks the fix (scripts/intakeFailsWithout.mjs).
import path from "node:path"; import fs from "node:fs"; import { pathToFileURL } from "node:url";
export async function loadKit(root) {
  const imp = f => import(pathToFileURL(path.join(root, f)).href);
  const [run, store, parse, images, send] = await Promise.all([imp("lib/desk/intake/run.js"), imp("lib/desk/intake/store.js"), imp("lib/desk/intake/parse.js"), imp("lib/desk/intake/images.js"), imp("lib/desk/send.js").catch(() => null)]);
  const W = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2], V = { A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8, J: 1, K: 2, L: 3, M: 4, N: 5, P: 7, R: 9, S: 2, T: 3, U: 4, V: 5, W: 6, X: 7, Y: 8, Z: 9 };
  // makeVin("WP0AB299", "8S745123") -> 17 characters with a correct check digit in position 9
  const makeVin = (first8, last8) => { const s = (first8 + "0" + last8).toUpperCase(); let sum = 0; for (let i = 0; i < 17; i++) sum += (/\d/.test(s[i]) ? Number(s[i]) : V[s[i]]) * W[i]; const r = sum % 11; return first8.toUpperCase() + (r === 10 ? "X" : String(r)) + last8.toUpperCase(); };
  const fx = f => fs.readFileSync(path.join(root, "scripts/fixtures/desk-intake", f));
  const { simpleParser } = await import("mailparser");
  let n = 0;
  const att = (filename, contentType, bytes) => ({ filename, contentType, size: bytes.length, load: async () => bytes });
  const mail = o => ({ emailId: o.id || "em_" + (++n), from: o.from, to: o.to || ["hagerty@desk.goasksam.com"], subject: o.subject || "", text: o.text || "", html: "", headers: o.headers || {}, authentication: o.authentication === undefined ? { spf: "pass", dkim: "pass", dmarc: "pass" } : o.authentication, attachments: o.attachments || [], raw: null });
  const orgs = [{ id: "hagerty", name: "Hagerty Marketplace", inbound_local: "hagerty", sending_address: "marketplace@hagerty.example", sending_name: "Hagerty Marketplace", sending_verified: true, send_provider: "resend", signature: "Hagerty Marketplace\nvaluations@hagerty.example", standard_message: "Thank you for your submission. Our valuation is attached.", auto_send: false },
    { id: "other", name: "Other Org", inbound_local: "other", auto_send: false }];
  const seats = [{ org_id: "hagerty", email: "ann@hagerty.example", role: "member", subject: "u1" }, { org_id: "hagerty", email: "bob@hagerty.example", role: "member", subject: "u2" }, { org_id: "other", email: "zed@other.example", role: "member", subject: "u3" }];
  const fresh = () => {
    const st = store.memoryStore({ orgs, seats });
    const reads = [];
    const deps = {
      store: st, now: () => "2026-11-04T12:00:00.000Z",
      resolveVehicle: async t => { const m = /^(\d{4}) (porsche|ferrari|ford|chevrolet) ([\w\- ]+)$/i.exec(String(t).trim()); if (!m) return { status: "needs_clarification", vehicle: null }; const [mk, ...rest] = [m[2], ...m[3].split(" ")]; return { status: "valid", vehicle: { year: Number(m[1]), make: mk[0].toUpperCase() + mk.slice(1).toLowerCase(), model: rest[0], trim: rest.slice(1).join(" ") || null } }; },
      decodeVin: async vin => ({ WP0: { year: 2008, make: "Porsche", model: "911", trim: "Carrera S", body: "Coupe" }, ZFF: { year: 1995, make: "Ferrari", model: "F355", trim: null, body: "Coupe" } }[vin.slice(0, 3)] || null),
      simpleParser,
      startRead: (sheet, car) => { reads.push({ sheet: sheet.id, car }); }
    };
    return { st, deps, reads };
  };
  return { run, store, parse, images, send, makeVin, fx, att, mail, orgs, seats, fresh, imp };
}
export function reporter() {
  let fail = 0, pass = 0;
  const ok = (name, cond, detail) => { if (cond) pass++; else fail++; console.log(`${cond ? "PASS" : "FAIL"}  ${name}${!cond && detail !== undefined ? "  " + (typeof detail === "string" ? detail : JSON.stringify(detail)) : ""}`); };
  return { ok, result: () => ({ pass, fail }) };
}
