// The demonstration case for the Desk v3 preview (Lane E, Nov 8 2026): a case record in Lane D's shape and the desk block the REAL engine functions (lib/deskV3.js deskBlock) build from sample sales.
// It stands in for the one live read until Lane C says go; the case is flagged demo, so the page shows the demonstration banner. Sales dates follow the clock so the stale flag never flips by itself.
// The sales are samples written here; every figure on the page is read from the desk block they produce, none is typed on the page.
import { deskBlock } from "../deskV3.js";

const day = n => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
const SALES = [[1, 58500, 31200], [9, 61200, 24800], [17, 54000, 52100], [26, 57250, 38400], [33, 63000, 19900], [41, 52500, 67300], [52, 59800, 28800], [60, 55500, 44100], [71, 60400, 26500], [83, 56800, 40200], [94, 53250, 58700], [110, 62100, 21300]];
export const DEMO_ROWS = SALES.map(([ago, price, miles], i) => ({ id: "s" + (i + 1), title: "2002 BMW M3 Convertible", year: 2002, generation: "E46", body: "convertible", gearbox: i % 4 === 3 ? "automatic" : "manual", gearboxWord: i % 4 === 3 ? "Automatic" : "6-speed manual", miles, platform: ["Bring a Trailer", "Cars & Bids", "PCarMarket"][i % 3], date: day(ago), price, url: "https://example.test/sale/" + (i + 1), photo: null, tier: null, inPopulation: i % 4 !== 3 }));

// Lane D's case record, the fields the summary reads: the analyst's range and reserve (decisions, drawn copper) and the lines Lane D writes about them.
export const DEMO_CASE = { analyst: { low: 56000, high: 61000, reserve: 55500, asking: 64000 },
  lines: { difference: "Assessment is above the market reference.", position: "The reserve sits below the assessed range.", review: "Mileage not verified. Title status not confirmed." }, needsReview: 2, handling: { clock: "Reply due in 2 d" } };

export async function demoDesk() { return deskBlock(DEMO_ROWS, { caseDate: day(0), subjectFacts: { year: 2002, generation: "E46", body: "convertible", gearbox: "manual", miles: 38000 }, subject: { transmission: "Manual", label: "2002 BMW M3 Convertible" } }); }
