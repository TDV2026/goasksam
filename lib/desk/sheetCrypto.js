import { randomBytes } from "node:crypto";
export const crypto = { id: () => randomBytes(8).toString("hex") };
