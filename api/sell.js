// /sell (Lane C, Oct 26 2026): ONE door for the Sell address. vercel.json sends every /sell here, and this decides, per request, which
// Sell answers: the newer one-direction Sell (api/sellNext.js) for signed-in crew and for everyone once
// SELL_NEXT_ON=1; the previous Sell (api/sellPage.js) for everyone else. Nothing is computed here. With the flag off the public gets
// exactly what it got before (result addresses /sell?car= keep their noindex header). One switch (SELL_NEXT_ON) flips the whole public Sell.
import sellNext from "./sellNext.js";
import sellPage from "./sellPage.js";
import { isCrewRequest } from "./_chrome.js";
import { hasServerCredential } from "../lib/_credential.js";

export default function handler(req, res) {
  const result = /[?&]car=/.test(String(req.url || ""));
  // Our header credential keeps reaching the newer Sell at result addresses only (the golden reads and the checks), as before; plain /sell stays the previous Sell for it.
  if (process.env.SELL_NEXT_ON === "1" || isCrewRequest(req) || (result && hasServerCredential(req))) return sellNext(req, res);
  if (result) res.setHeader("X-Robots-Tag", "noindex, follow");
  return sellPage(req, res);
}
