// The demonstration case for the Desk v3 preview (Lane E, Nov 8 2026): Lane D's real demonstration case (lib/desk/caseDemo.js, lead HM-24117, a 1999 Porsche 911 Carrera) with the engine block
// Lane B's own function (lib/deskV3.js deskBlock) builds over twelve SAMPLE sales, stored on the case as case.desk the way the Desk stores a read. The assessment and reserve are set through the case's own writers
// (lib/desk/caseWorkflow.js). The sample sales are written here and nothing on the page is typed: every figure the page prints is read from the case or from the desk block.
import { deskBlock } from "../deskV3.js";
import { demoCase } from "../desk/caseDemo.js";
import { setAssessment, setReserve, syncNeeds, settle } from "../desk/caseWorkflow.js";

export const DEMO_ID = "pv_hm";
const day = n => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
const SALES = [[1, 58500, 31200], [9, 61200, 24800], [17, 54000, 52100], [26, 57250, 38400], [33, 63000, 19900], [41, 52500, 67300], [52, 59800, 28800], [60, 55500, 44100], [71, 60400, 26500], [83, 56800, 40200], [94, 53250, 58700], [110, 62100, 21300]];
export const DEMO_ROWS = SALES.map(([ago, price, miles], i) => ({ id: "s" + (i + 1), title: "1999 Porsche 911 Carrera", year: 1999, generation: "996", body: "coupe", gearbox: i % 4 === 3 ? "automatic" : "manual", gearboxWord: i % 4 === 3 ? "Tiptronic" : "6-speed manual", miles, platform: ["Bring a Trailer", "Cars & Bids", "PCarMarket"][i % 3], date: day(ago), price, url: "https://example.test/sale/" + (i + 1), photo: null, tier: null, inPopulation: i % 4 !== 3 }));
const flat = (label, fill) => "data:image/svg+xml;base64," + Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="480" height="320"><rect width="480" height="320" fill="${fill}"/><text x="20" y="300" font-family="Arial" font-size="18" fill="#fff">${label}</text></svg>`).toString("base64");
export const DEMO_PHOTOS = [{ id: "ph_front", name: "front.jpg", url: flat("Front", "#3d5a6e") }, { id: "ph_rear", name: "rear.jpg", url: flat("Rear", "#6b6a63") }];

export async function demoDesk(now = new Date().toISOString()) { return deskBlock(DEMO_ROWS, { caseDate: now.slice(0, 10), subjectFacts: { year: 1999, generation: "996", body: "coupe", gearbox: "manual", miles: 61200 }, subject: { transmission: "Manual", label: "1999 Porsche 911 Carrera" } }); }
// the case as the Desk holds it: Lane D's demonstration case, the engine block stored on it, the analyst's decisions set through the case writers
export async function demoCaseRecord(now = new Date().toISOString()) {
  let c = demoCase(now); c.desk = await demoDesk(now);
  c = setAssessment(c, { figure: 58500, low: 56000, high: 61000, explanation: "" }, now); c = setReserve(c, { figure: 55500, rationale: "" }, now);
  return settle(syncNeeds(c), now);
}
