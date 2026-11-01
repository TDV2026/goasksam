// COPY RULES (Lane E, Nov 1 2026): the word rules shared by copyCheck (data/copy.json and the served pages) and copyProposalsCheck (docs/copy-proposals.md), so a proposal is judged by the same rules as the live file.
export const COMPETITORS = ["Hagerty", "Classic.com", "Hemmings", "Edmunds", "Kelley Blue Book", "KBB", "NADA", "Carfax", "CarGurus", "Autotrader", "Cars.com", "TrueCar", "Bring a Trailer", "Cars & Bids", "Cars and Bids", "Collecting Cars", "PCarMarket", "eBay Motors"];
export const RULES = [
  [/[–—]/, "has a dash (an em or en dash). Use a comma, a period or the word instead."],
  [/\b(?:our data|valuations?)\b/i, "uses \"our data\" or \"valuation\". Say what the sales show instead, and never put a value on a car."],
  [/\b(?:I|I'm|I'll|I've|I'd|my|mine|me)\b/, "speaks as \"I\" or \"my\". Sam is never written in the first person."],
  [/\b(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)\s+(?:sources?|auction houses?|houses|platforms?|venues?|marketplaces?|auction sites?)\b/i, "gives a count of sources or auction houses. Public copy names no source counts."]
];
// Words that sell: a page title or meta description never uses "AI" as a selling word.
export const SELLING_RULES = [[/\bAI\b|\bA\.I\./, "uses \"AI\" in a title or description. Say what Sam does with the sales, not the technology."]];
export const LIMIT_TITLE = 59, LIMIT_DESC = 159;
export const competitorIn = v => COMPETITORS.find(c => new RegExp("\\b" + c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "i").test(v));
