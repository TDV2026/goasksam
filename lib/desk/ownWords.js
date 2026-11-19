// THE WORDS OF THE CAR'S OWN HISTORY (Lane D, Nov 13 2026): the lines made from stored figures with the table's words (lib/reasonWords.js own.*). Imports nothing but the table, so the engine (lib/deskV3.js) and the case (lib/desk/ownCar.js) share one way to say it.
import { reasonLine } from "../reasonWords.js";
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const monthYearShort = d => { const m = /^(\d{4})-(\d{2})/.exec(String(d || "")); return m ? `${MON[Number(m[2]) - 1]} ${m[1]}` : ""; };
export const lineOfOwn = h => h.kind === "sale" ? reasonLine("own.sale", { when: monthYearShort(h.date), price: h.price, venue: h.venue, miles: h.miles }) : reasonLine("own.no_sale", { when: monthYearShort(h.date), highBid: h.highBid, venue: h.venue });
export const lastSoldLine = last => last && last.price > 0 ? reasonLine("own.last_sold", { when: monthYearShort(last.date), price: last.price, miles: last.miles }) : null;
