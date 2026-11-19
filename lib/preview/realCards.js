// THE REAL CARDS ON THE PREVIEWS (Lane E, Nov 8 2026, Sam: "the cards must BE the real cards"). A preview never draws a card of its own. Two components, both lifted from the live source by name, so a change to the live card is a change to the preview card:
//   FIND CARD      lib/findCardKit.js: Find's own client card(l) (api/buy.js), the same function the live Find results and the Tasks dashboard draw. It is fed an ENGINE CARD l (the object /api/buySearch returns for one listing; lib/tasks/fullCards.js builds it), nothing else.
//   TASK CARD      the dashboard's compactCard(t) and the watching row lookingItem(r), lifted by name from the dashboard client of /preview/tasks/mine (lib/preview/tasksApp.js TASKS_APP_JS), fed an engine Task row and an engine watching row.
// Nothing here words a figure or picks a car. The page hands the engine's objects to the component and prints what it prints. The pause and stop controls are shown disabled (a demo is not a live Task).
import { findCardKitJs, FIND_CARD_CSS } from "../findCardKit.js";

export const REAL_CARD_CSS = FIND_CARD_CSS;
// the JSON an inline script reads, safe inside <script>
export const jsonForScript = o => JSON.stringify(o).replace(/</g, "\\u003c").replace(/[\u2028\u2029]/g, c => "\\u" + c.charCodeAt(0).toString(16));
export const realCardsScripts = () => "<script>window.GAS_REL={mc:true,tasks:true};</script><script>" + findCardKitJs() + "</script>";
