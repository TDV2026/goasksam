// FORSALE_PUBLIC (Lane D, lane-d-forsale, Nov 2026): the one switch for dealer cars and classifieds on Find. OFF: the crew only. A visitor's answers are byte for byte what they were.
// The engine has no request, so a handler runs its work inside withForSale(req, fn) and the engine asks forSaleActive() before it reads, counts or serves one for-sale card.
// Outside a handler (a script, a warm job) nothing is active unless the switch is on.
import { AsyncLocalStorage } from "node:async_hooks";
import { isCrewRequest } from "../_crew.js";

export const FORSALE_PUBLIC = false;
export const forSaleOk = req => FORSALE_PUBLIC || !!(req && req.headers && isCrewRequest(req) === true);
const CTX = new AsyncLocalStorage();
export const withForSale = (req, fn) => CTX.run(forSaleOk(req), fn);
export const forSaleActive = () => FORSALE_PUBLIC || CTX.getStore() === true;
