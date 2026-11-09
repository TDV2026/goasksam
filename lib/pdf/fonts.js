// The report's fonts (Lane D, Nov 9 2026): Newsreader for the text and figures, Instrument Sans for the labels and marks, Regular and Bold, read once from lib/pdf/fonts (OFL, see the README there) and handed to the PDF writer to embed.
// vercel.json includes lib/pdf/fonts/** with api/desk.js and api/deskSend.js.
import fs from "node:fs";
import { parseTTF } from "./ttf.js";
const FILES = { serif: "Newsreader-Regular.ttf", serifb: "Newsreader-Bold.ttf", sans: "InstrumentSans-Regular.ttf", sansb: "InstrumentSans-Bold.ttf" };
let CACHE = null;
export function reportFonts() { if (!CACHE) CACHE = Object.fromEntries(Object.entries(FILES).map(([k, f]) => [k, parseTTF(fs.readFileSync(new URL("./fonts/" + f, import.meta.url)))])); return CACHE; }
