// THE AMAZON AUTOS PARTNER DEMO (Sam's spec, locked Oct 19 2026, new build Oct 20 2026; Lane C). The same gated demo
// shell as the eBay demo (api/partnerDemo.js): the black demo bar with three tabs, the car box, a partner header with the
// partner's own logo and "Prepared for Amazon", "Sample listing" on every listing frame. Presentation only: every figure,
// line, range and sale comes from the one engine through the existing partner answer path (api/partnerAnswer.js, the
// same seven stored demo answers); the page adds no partner logic. The PROFILE below controls presentation only.
// Every buy, finance, trade-in, sign-in and search control is inert (a button that does nothing, no form, no link); the
// only links are the demo's own tabs and "How Sam decides". Served by api/partnerDemo.js at /preview?p=amazon, behind
// the same gate (the signed crew cookie or the partner cookie), noindex.
import { SELLS_FOR_CARD_CSS } from "../lib/sellsForCard.js";
import { DEMO_CARS } from "./partnerAnswer.js";
import { demoAnswerCase, OUT_OF_SCOPE_LINE } from "../lib/amazonDemoCase.js";

// THE PROFILE (presentation only). makeScope: the pilot's enthusiast and specialty cars (Sam approves the list); a car
// outside it shows no module. Each entry: a make, and the models in scope (["*"] for every model of the make).
export const AMAZON_PROFILE = {
  key: "amazon",
  name: "Amazon Autos",
  logoPath: "/preview?img=amazon-logo",
  logoAlt: "Amazon Autos",
  preparedFor: "Prepared for Amazon",
  tabs: [["a", "a. Before shopping"], ["b", "b. Dealer lists a car"], ["c", "c. On the listing"], ["d", "d. In search results"]],
  moduleName: "Market Check",
  attribution: "Powered by GoAskSam",
  // REVISION 2 (Sam, Oct 20 2026): the Amazon Autos listing layout. The sub-nav and the section tabs are the partner's
  // own navigation, drawn inert; "Demo" sits on every screen.
  subnav: ["New Cars", "Used Cars", "Certified Pre-Owned", "Trade", "Body Type", "Make", "Fuel Type"],
  sectionTabs: ["Overview", "Condition", "Coverage", "Benefits", "Pricing"],
  demoLabel: "Demo",
  // Under the shared card, on the Amazon profile only (Sam's words).
  cardContext: "These are completed auction sales. Dealer prices can include reconditioning, warranty and delivery.",
  // THE SAMPLE LISTING FIGURES (Sam, Oct 20 2026): FIXED per-car demo constants, written once here and labelled Sample;
  // never computed in the browser and never from an engine figure. price: the sample asking price (shown only when it
  // sits inside the engine's own range); monthly: the sample finance figure, from one fixed formula ($3,500 down,
  // 72 months, 7.98% APR), rounded; miles: the listing's own mileage, only where the listing has one (else no line).
  sampleListings: {
    "2014 Porsche 911 GT3": { price: 120000, monthly: 2041, miles: 30400 },
    "2015 Porsche 911 GT3": { price: 120000, monthly: 2041, miles: null },
    "2005 Porsche 911": { price: 40000, monthly: 640, miles: null },
    "1965 Ford Mustang": { price: 50000, monthly: 815, miles: null },
    "1957 Porsche 356 Speedster": { price: 260000, monthly: 4495, miles: null },
    "2023 Porsche 911 GT3": { price: 250000, monthly: 4320, miles: null }
  },
  historyDisplay: { a: "inline", b: "inline", c: "link" },
  // A LISTING is one specific car, so its body is known: a demo car the engine reads by body is listed with one (the
  // sample listing's own body, read by the engine as that car). Tabs a and b keep the engine's question, with its options.
  listingBody: { "1965 Ford Mustang": "Fastback" },
  // THE PILOT SCOPE, APPROVED BY SAM (Oct 20 2026): rules, not a list (amazonInScope below).
  scopeRule: "Sam, Oct 20 2026: (a) 25 years old or older, any make; (b) any year, the listed makes; (c) any year, the listed models"
};

// THE PILOT SCOPE, APPROVED BY SAM (Oct 20 2026). In scope if any one is true, from the answer's own identity (year, make,
// model, trim) and never from price or sales: (a) a car SCOPE_AGE_YEARS or more years old (model year at least that many
// years before the current year), any make; (b) any year, the makes in SCOPE_MAKES; (c) any year, the models in
// SCOPE_MODELS (a make, and a pattern over its model and trim words). Presentation only: it decides where the module shows,
// never what the engine answers. One function, run on the page (its source is sent as is) and by scripts/amazonScopeCheck.mjs.
export const SCOPE_AGE_YEARS = 25;
export const SCOPE_MAKES = ["Porsche", "Ferrari", "Lamborghini", "McLaren", "Aston Martin", "Bentley", "Rolls-Royce", "Bugatti", "Maserati", "Lotus", "Alfa Romeo", "De Tomaso", "Pagani", "Koenigsegg", "Lancia", "Shelby"];
export const SCOPE_MODELS = [
  ["Lexus", "^LFA\\b"],
  ["Mercedes-Benz", "\\bAMG\\b|^SL(S|R)?\\b|^SL-Class|^SL ?\\d|^SLS|^SLR|^G-Class|^G-Wagen|^G ?\\d{2,3}\\b"],
  ["BMW", "(^|\\s)(1M|M[1-8])\\b|^X[3-7] ?M\\b|^Z[34] ?M\\b|^M (Coupe|Roadster)\\b"],
  ["Audi", "(^|\\s)RS ?\\d|^RS\\b|^R8\\b"],
  ["Land Rover", "^Defender\\b"],
  ["Ford", "^GT\\b|^Ford GT\\b|^Mustang\\b.*\\b(Shelby|GT350|GT500|Boss|Mach 1)\\b|^Bronco\\b"],
  ["Chevrolet", "^Corvette\\b|^Camaro\\b.*\\b(Z\\/?28|SS|ZL1)\\b"],
  ["Dodge", "^Viper\\b|^(Challenger|Charger)\\b.*\\b(Hellcat|Demon)\\b"],
  ["Jeep", "^Wrangler\\b.*\\bRubicon 392\\b"],
  ["Nissan", "^(Skyline )?GT-?R\\b|^\\d{3}ZX?\\b|^Z\\b"],
  ["Toyota", "^Supra\\b|^Land Cruiser\\b"],
  ["Honda", "^NSX\\b|^S2000\\b|^Civic\\b.*\\bType R\\b"],
  ["Acura", "^NSX\\b"],
  ["Mazda", "^MX-5\\b|^Miata\\b"],
  ["Jaguar", "^E-Type\\b|^XKE\\b|^F-Type\\b.*\\bR\\b(?!-)"]
];
export function amazonInScope(id, nowYear, rules) {
  if (!id || !id.make) return false;
  var mk = String(id.make).toLowerCase(), words = [id.model, id.variant].filter(Boolean).join(" ");
  if (Number(id.year) > 0 && nowYear - Number(id.year) >= rules.age) return true;
  if (rules.makes.some(function(m){ return m.toLowerCase() === mk; })) return true;
  return rules.models.some(function(r){ return r[0].toLowerCase() === mk && new RegExp(r[1], "i").test(words); });
}
// SCOPE FROM THE LISTING'S OWN WORDS (Lane F on Sam's spec, Oct 20 2026: "outside scope the listing shows no module"):
// a listing's year and make are known before any read, so when the words name a year and a known make the same rules
// decide at once, and an out-of-scope listing draws no module and makes no read. Words without a year or a known make
// return null: the answer's own identity decides after the read, as before.
export const KNOWN_MAKES = ["Acura", "Alfa Romeo", "Aston Martin", "Audi", "Bentley", "BMW", "Bugatti", "Buick", "Cadillac", "Chevrolet", "Chrysler", "De Tomaso", "Dodge", "Ferrari", "Fiat", "Ford", "Genesis", "GMC", "Honda", "Hyundai", "Infiniti", "Jaguar", "Jeep", "Kia", "Koenigsegg", "Lamborghini", "Lancia", "Land Rover", "Lexus", "Lincoln", "Lotus", "Lucid", "Maserati", "Mazda", "McLaren", "Mercedes-Benz", "Mercury", "Mini", "Mitsubishi", "Nissan", "Pagani", "Polestar", "Pontiac", "Porsche", "Ram", "Rivian", "Rolls-Royce", "Saab", "Saturn", "Scion", "Shelby", "Subaru", "Suzuki", "Tesla", "Toyota", "Volkswagen", "Volvo"];
const MAKE_WORDS = [["chevy", "Chevrolet"], ["vw", "Volkswagen"], ["mercedes benz", "Mercedes-Benz"], ["mercedes", "Mercedes-Benz"], ["benz", "Mercedes-Benz"], ["rolls royce", "Rolls-Royce"], ["land rover", "Land Rover"], ["range rover", "Land Rover"]];
export function scopeFromWords(text, nowYear, rules) {
  const m = /^(\d{4})\s+(.+)$/.exec(String(text || "").replace(/\s+/g, " ").trim());
  if (!m) return null;
  const rest = m[2], low = rest.toLowerCase();
  const forms = KNOWN_MAKES.map(k => [k.toLowerCase(), k]).concat(MAKE_WORDS).sort((a, b) => b[0].length - a[0].length);
  const hit = forms.find(([w]) => low === w || low.startsWith(w + " "));
  if (!hit) return null;
  return amazonInScope({ year: Number(m[1]), make: hit[1], model: rest.slice(hit[0].length).trim() }, nowYear, rules);
}
const escHtml = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

// The partner's look, CSS only: a dark navy header, white page, the partner's yellow and orange buttons and its type
// stack. The shared card reads the --sans, --sec and --div tokens so it sits in this layout.
const CSS = `
:root{--ink:#0f1111;--ink2:#565959;--rule:#d5d9d9;--soft:#f7fafa;--navy:#131921;--navy2:#232f3e;--yellow:#ffd814;--yellow2:#f7ca00;--orange:#ffa41c;--link:#007185;--r:8px;color-scheme:light;
  --sans:"Amazon Ember",Arial,"Helvetica Neue",Helvetica,sans-serif;--serif:var(--sans);--sec:var(--ink2);--div:var(--rule);--card:#fff}
*{box-sizing:border-box}
body{margin:0;background:#fff;color:var(--ink);font:400 15px/1.45 var(--sans);-webkit-font-smoothing:antialiased}
.wrap{max-width:1280px;margin:0 auto;padding:0 20px}
.demo-bar{background:#111;color:#fff;font-size:13px}
.demo-bar .wrap{display:flex;gap:12px;align-items:center;justify-content:space-between;padding-block:8px;flex-wrap:wrap}
.tabs{display:flex;gap:6px;flex-wrap:wrap}
.tabs a{color:#fff;text-decoration:none;border:1px solid #555;border-radius:999px;padding:4px 12px}
.tabs a[aria-current=page]{background:#fff;color:#111;border-color:#fff}
.carbar{background:var(--soft);border-bottom:1px solid var(--rule);font-size:14px}
.carbar .wrap{display:flex;gap:10px 18px;align-items:center;flex-wrap:wrap;padding-block:10px}
.carpick{display:flex;gap:8px;align-items:center;flex:1 1 320px;min-width:0}
.carpick label{font-weight:700}
.carpick input{flex:1;min-width:0;height:38px;border:1px solid #888c8c;border-radius:var(--r);padding:0 12px;font:inherit;background:#fff}
.top{background:var(--navy);color:#fff}
.top .wrap{display:flex;gap:18px;align-items:center;padding-block:10px;flex-wrap:wrap}
.plogo{display:flex;align-items:center;gap:12px;flex:none}
.plogo img{display:block;height:21px;width:auto}
.plogo .chip{background:#fff;border-radius:4px;padding:6px 8px;display:inline-flex}
.prep{font-size:12px;line-height:1.2;color:#ddd;white-space:nowrap}
.sbox{flex:1;display:flex;align-items:center;min-width:180px;height:40px;background:#fff;border-radius:var(--r);color:#6f7373;padding:0 12px;font-size:14px}
.subnav{background:var(--navy2);color:#fff;font-size:14px}
.subnav .wrap{display:flex;gap:18px;padding-block:8px;flex-wrap:wrap}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:40px;padding:0 18px;border-radius:999px;font:500 14px/1 var(--sans);cursor:default;border:1px solid transparent;color:var(--ink)}
.btn.yel{background:var(--yellow);border-color:var(--yellow2)}
.btn.org{background:var(--orange);border-color:#ff8f00}
.btn.out{background:#fff;border-color:#888c8c}
.btn.blk{width:100%}
.btn.nav{background:transparent;color:#fff;border-color:transparent;padding:0 6px;min-height:32px}
.sample-tag{display:inline-block;margin:6px 0 0;padding:2px 8px;border-radius:4px;background:#f0f2f2;color:var(--ink2);font-size:12px;font-weight:700;letter-spacing:.04em;text-transform:uppercase}
main{padding-block:22px 48px}
.listing{display:grid;grid-template-columns:minmax(0,1.25fr) minmax(0,1fr);gap:28px}
.gal{aspect-ratio:4/3;background:#eaeded;border-radius:var(--r);overflow:hidden;display:flex;align-items:center;justify-content:center;color:var(--ink2)}
.gal img{width:100%;height:100%;object-fit:cover;display:block}
.photo-note{margin:6px 0 0;font-size:12px;color:var(--ink2)}
.rail h1{margin:0;font:400 26px/1.25 var(--sans)}
.price{margin:14px 0 2px;font:400 28px/1.1 var(--sans)}
.price-kind{margin:0 0 12px;font-size:13px;color:var(--ink2)}
.buybox{border:1px solid var(--rule);border-radius:var(--r);padding:16px;display:flex;flex-direction:column;gap:10px;margin-top:12px}
.buybox .row{font-size:13px;color:var(--ink2)}
.dealer{margin:12px 0 0;font-size:14px}
.dealer b{font-weight:700}
.mc{margin-top:16px;border:1px solid var(--rule);border-radius:var(--r)}
.mc-row{all:unset;box-sizing:border-box;display:flex;width:100%;justify-content:space-between;align-items:center;padding:14px 16px;cursor:pointer;font:700 16px/1.2 var(--sans)}
.mc-row:focus-visible{outline:2px solid var(--link);outline-offset:2px}
.mc-row .attr{font:400 12px/1 var(--sans);color:var(--ink2)}
.mc-row .chev{font-size:14px;color:var(--ink2);margin-left:10px}
.mc-body{padding:0 16px 16px}
.below{grid-column:1/-1}
.sec{border-top:1px solid var(--rule);padding-top:18px;margin-top:22px}
.sec h2{margin:0 0 10px;font:700 20px/1.3 var(--sans)}
.specs{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:8px 18px;margin:0}
.specs dt{font-size:13px;color:var(--ink2)}.specs dd{margin:0;font-weight:700}
.hist-l{margin:0 0 8px}
.linkbtn{all:unset;cursor:pointer;color:var(--link);text-decoration:underline;text-underline-offset:2px}
.linkbtn:focus-visible{outline:2px solid var(--link);outline-offset:2px}
.muted{color:var(--ink2)}
.loading{color:var(--ink2)}
.pop-scrim{position:fixed;inset:0;background:rgba(15,17,17,.45);z-index:50;display:flex;align-items:center;justify-content:center;padding:16px}
.pop{background:#fff;border-radius:var(--r);max-width:560px;width:100%;max-height:80vh;overflow:auto;padding:20px}
.pop h3{margin:0 0 12px;font:700 18px/1.3 var(--sans)}
.pop ul{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:10px}
.pop li{display:grid;grid-template-columns:72px minmax(0,1fr) auto;gap:12px;align-items:center}
.pop .ph{width:72px;height:54px;border-radius:4px;background:#eaeded;object-fit:cover;display:flex;align-items:center;justify-content:center;font-size:10px;color:var(--ink2)}
.pop .pr{font-weight:700}
.pop .x{float:right}
.lead h1{margin:0 0 8px;font:400 28px/1.25 var(--sans)}
.foot{margin-top:10px;font-size:12px;color:var(--ink2)}
.foot a{color:var(--link)}
.entry{max-width:760px}
.entry .ask{display:flex;gap:8px;margin:14px 0 0;flex-wrap:wrap}
.entry .ask input{flex:1 1 260px;min-width:0;height:44px;border:1px solid #888c8c;border-radius:var(--r);padding:0 12px;font:inherit}
.nexts{display:flex;gap:10px;flex-wrap:wrap;margin-top:16px}
.inline-hist{margin:0 0 16px}
.inline-hist h3{margin:0 0 8px;font:700 16px/1.3 var(--sans)}
.inline-hist ul{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}
.inline-hist li{display:grid;grid-template-columns:72px minmax(0,1fr) auto;gap:12px;align-items:center}
.inline-hist .ph{width:72px;height:54px;border-radius:4px;background:#eaeded;object-fit:cover;display:flex;align-items:center;justify-content:center;font-size:10px;color:var(--ink2)}
.inline-hist .pr{font-weight:700}
.dealer-form{max-width:760px;border:1px solid var(--rule);border-radius:var(--r);padding:18px}
.dealer-form h2{margin:0 0 4px;font:700 20px/1.3 var(--sans)}
.field{margin-top:14px}
.field label{display:block;font-weight:700;margin-bottom:6px}
.field input{width:100%;max-width:360px;height:40px;border:1px solid #888c8c;border-radius:var(--r);padding:0 12px;font:inherit;background:#fff}
.field input[disabled]{background:#f7fafa;color:var(--ink2)}
/* "How Sam decides" is plain static text on the demo (as on the eBay demo): the card's own link styling is undone here only */
.sfc-card span.sfc-footer-link{color:var(--ink2);font-weight:400;text-decoration:none}
@media (max-width:860px){.listing{grid-template-columns:1fr}.rail h1{font-size:22px}.price{font-size:24px}}

/* REVISION 2 (Sam, Oct 20 2026): the Amazon Autos listing layout, inside the demo shell. */
.demo-lab{display:inline-block;padding:2px 8px;border-radius:4px;background:#febd69;color:#111;font:700 11px/1.4 var(--sans);letter-spacing:.06em;text-transform:uppercase}
.subnav{background:#fff;color:var(--ink);border-bottom:1px solid var(--rule)}
.subnav .wrap{gap:4px 26px;padding-block:12px}
.snav{all:unset;cursor:default;font:500 14px/1.2 var(--sans);color:var(--ink)}
.back{margin:0 0 14px;font-size:13px}
.back .linkbtn{color:var(--ink2);text-decoration:none}
.galwrap{display:grid;grid-template-columns:minmax(0,1fr) 64px;gap:12px;align-items:start}
.galwrap .photo-note{grid-column:1}
.thumbs{display:flex;flex-direction:column;gap:8px}
.thumbs img{width:64px;height:48px;object-fit:cover;border-radius:4px;border:1px solid var(--rule);display:block}
.thumbs img.on{border:2px solid #007185}
.rail h1{font:700 24px/1.3 var(--sans)}
.price{margin:12px 0 2px;font:700 28px/1.1 var(--sans)}
.miles{margin:0 0 12px;font-size:13px;color:var(--ink2)}
.fin{display:flex;border:2px solid #2162a1;border-radius:var(--r);overflow:hidden;margin-top:12px}
.fin-l{flex:0 0 74px;display:flex;align-items:center;justify-content:center;background:#2162a1;color:#fff;font:700 13px/1 var(--sans)}
.fin-b{flex:1;padding:12px 14px;text-align:right}
.fin-m{margin:0;font:700 26px/1.1 var(--sans)}
.fin-m span{font-weight:400;font-size:20px}
.fin-s{margin:2px 0 10px;font-size:12px;color:var(--ink2)}
.cash{display:flex;justify-content:space-between;align-items:center;border:1px solid var(--rule);border-radius:var(--r);padding:12px 14px;margin-top:10px;font-size:14px}
.cash b{font-weight:700}
.rail .mc{margin-top:10px}
.mc-row{font:700 15px/1.3 var(--sans)}
.mc-row .attr{font:400 15px/1.3 var(--sans);color:var(--ink)}
.mc-ctx{margin:10px 2px 0;font-size:12.5px;line-height:1.45;color:var(--ink2)}
.pdet{margin:12px 0 0;text-align:center;font-size:14px}
.pdet .linkbtn{color:#007185;text-decoration:none}
.stabs{display:flex;border-bottom:1px solid var(--rule);margin-top:26px;overflow-x:auto}
.stab{all:unset;cursor:default;flex:1 0 auto;text-align:center;padding:12px 18px;font:400 14px/1.2 var(--sans);color:var(--ink);border-bottom:3px solid transparent}
.stab[data-stab]{cursor:pointer}
.stab.on{background:#e7f0f9;border-bottom-color:#2162a1;color:#2162a1}
.kf{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:18px 24px}
.kfi{display:flex;gap:10px;align-items:flex-start}
.kfi svg{flex:0 0 22px;width:22px;height:22px;color:var(--ink2)}
.kfl{display:block;font-size:12px;color:var(--ink2)}.kfv{display:block;font-size:15px}
.listing>*{min-width:0}
.stabs{min-width:0;max-width:100%}
@media (max-width:760px){.galwrap{grid-template-columns:1fr}.thumbs{flex-direction:row;overflow-x:auto}}
.case{margin-top:12px;border:1px solid var(--rule);border-radius:var(--r);padding:14px 16px;background:var(--soft)}
.case-l{margin:0;font-size:15px}
.case-n{margin:6px 0 0;font-size:13px;color:var(--ink2)}
.rail h1:empty{display:none}
/* TAB d, the results grid */
.dhead{margin:0;font:700 22px/1.3 var(--sans)}
.dgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:18px;margin-top:16px}
.dcard{display:flex;flex-direction:column;border:1px solid var(--rule);border-radius:var(--r);overflow:hidden;color:var(--ink);text-decoration:none;background:#fff}
.dcard:hover{box-shadow:0 2px 10px rgba(15,17,17,.12)}
.dph{aspect-ratio:4/3;background:#eaeded;display:block}.dph img{width:100%;height:100%;object-fit:cover;display:block}
.dtx{display:flex;flex-direction:column;gap:4px;padding:12px 14px 14px}
.dtitle{font:700 15px/1.35 var(--sans)}.dmiles{font-size:13px;color:var(--ink2)}
.dchips{display:flex;gap:6px;flex-wrap:wrap}.dchips:empty{display:none}
.dchip{border:1px solid var(--rule);border-radius:999px;padding:2px 8px;font-size:12px;color:var(--ink2)}
.dprice{margin-top:4px;font:700 20px/1.2 var(--sans)}.dfin{font-size:13px;color:var(--ink2)}
.dmark{align-self:flex-start;margin-top:6px;border-radius:4px;padding:2px 8px;background:#f0f2f2;font:700 11px/1.5 var(--sans);letter-spacing:.04em;text-transform:uppercase;color:var(--ink2)}
`;

const JS = String.raw`
(function(){
  var LISTCAR = __LISTCAR__, CAR = __CAR__, CARS = __CARS__, SCOPE = __SCOPE__, VIEW = __VIEW__, LIST = __LIST__, OUT_OF_SCOPE = __OUTSCOPE__, CHOSEN = __CHOSEN__, SAMPLES = __SAMPLES__, CONTEXT = __CONTEXT__, LISTBODY = __LISTBODY__;
  // THE ANSWER CASES (Sam's revision 2, item 8; Lane E's lib/amazonDemoCase.js, sent to the page as is): an unreadable VIN,
  // read with no sales, outside the pilot scope, or an answer. Never a silent empty box.
  var OUT_OF_SCOPE_LINE = __OOSLINE__, SCOPE_AGE_YEARS = SCOPE.age, SCOPE_MAKES = SCOPE.makes, SCOPE_MODELS = SCOPE.models;
  var demoAnswerCase = __CASEFN__;
  var $ = function(id){ return document.getElementById(id); };
  var esc = function(s){ return String(s == null ? "" : s).replace(/[&<>"]/g, function(c){ return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };
  var usd = function(n){ return "$" + Math.round(Number(n)).toLocaleString("en-US"); };
  var MON = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  var monthYear = function(d){ var p = String(d || "").split("-"); return p.length >= 2 && MON[Number(p[1]) - 1] ? MON[Number(p[1]) - 1] + " " + p[0] : ""; };
  // Sam's decision 6 (Oct 20 2026), the Amazon profile only: the page's own lines without "Sam"; the engine's own
  // still-reading line (a.line) is shown as the engine words it.
  var STILL_LINE = "Sam is still reading the sales for this one.", COULD_NOT = "The sales could not be read just now. Try again in a minute.";
  // ONE READ PER PAGE through the partner answer path (the same path and stored answers as the eBay demo); the engine's own
  // retryAfterMs is the only retry, and past the safety deadline a demo car falls back to its stored answer.
  var DEADLINE = 25000;
  function ask(body){
    var ctl = typeof AbortController === "function" ? new AbortController() : null, t = ctl ? setTimeout(function(){ ctl.abort(); }, DEADLINE) : null;
    return fetch("/api/partnerAnswer", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: ctl ? ctl.signal : undefined })
      .then(function(r){ return r.json(); }).catch(function(){ return { aborted: true }; })
      .then(function(a){ if (t) clearTimeout(t); if (!a || !a.aborted) return a; if (CARS.indexOf(String(body.q || "")) < 0) return { ok: false, stillReading: true };
        return fetch("/api/partnerAnswer?last=" + encodeURIComponent(body.q), { credentials: "include" }).then(function(r){ return r.json(); }).catch(function(){ return { ok: false, stillReading: true }; }); });
  }
  // THE PILOT SCOPE (the profile's makeScope): the answer's own make and model against the list; outside it, no module.
  // Sam's approved rules, the same function the server's check runs (amazonInScope), relative to this year.
  var amazonInScope = __INSCOPE__;
  // the same scope on typed words (scopeFromWords): an out-of-scope car named by year and a known make reads nothing
  var KNOWN_MAKES = __KNOWNMAKES__, MAKE_WORDS = __MAKEWORDS__, scopeFromWords = __FROMWORDS__;
  function wordsOut(q){ return scopeFromWords(q, new Date().getFullYear(), SCOPE) === false; }
  function inScope(a){ return amazonInScope(a && a.identity, new Date().getFullYear(), SCOPE); }
  // The shared card, as the partner answer draws it (cardWithRows: the engine's own sale rows, in the engine's order,
  // when the path sends them; else the card without its rows). The page adds nothing to it.
  function cardHtml(a){
    if (!a || a.ok === false) return '<p class="muted">' + esc(a && a.stillReading ? (a.line || STILL_LINE) : COULD_NOT) + "</p>";
    if (a.question) {
      var q = a.question, opts = (q.options || []).concat(q.skip ? [q.skip] : []);
      return '<p>' + esc(q.text || "") + '</p><div class="nexts">' + opts.map(function(o){ return '<button type="button" class="btn out" data-qsend="' + esc(JSON.stringify(o.send || {})) + '">' + esc(o.label) + "</button>"; }).join("") + "</div>";
    }
    var c = a.cardWithRows || a.card || ""; return c.replace('<div class="gas-pill-slot"></div>', "");
  }
  // This exact car's history (the answer's VIN history, newest first): "sold before" only when a prior listing sold.
  var anySold = function(h){ return (h || []).some(function(r){ return r.result === "sold"; }); };
  function histRows(h){
    return '<ul>' + h.map(function(r){
      var ph = r.photo ? '<img class="ph" src="/api/partnerAnswer?photo=' + encodeURIComponent(r.photo) + '&w=320" alt="" loading="lazy">' : '<span class="ph">No photo</span>';
      var what = r.result === "sold" ? "Sold " + monthYear(r.date) : "Listed " + monthYear(r.date) + ", did not sell";
      var amt = r.result === "sold" ? (r.price ? usd(r.price) : "") : (r.highBid ? "High bid " + usd(r.highBid) : "");
      return '<li>' + ph + '<span>' + esc(what) + (r.miles ? '<br><span class="muted">' + esc(Number(r.miles).toLocaleString("en-US")) + " miles</span>" : "") + '</span><span class="pr">' + esc(amt) + "</span></li>";
    }).join("") + "</ul>";
  }
  function inlineHist(h){ return h && h.length ? '<div class="inline-hist"><h3>' + (anySold(h) ? "This car has sold before" : "This car was listed before") + "</h3>" + histRows(h).replace(/^<ul>/, "<ul>") + "</div>" : ""; }
  function openHist(h){
    var s = document.createElement("div"); s.className = "pop-scrim"; s.setAttribute("data-close", "");
    s.innerHTML = '<div class="pop" role="dialog" aria-modal="true" aria-label="Previous market history"><button type="button" class="linkbtn x" data-close>Close</button><h3>' + (anySold(h) ? "This car has sold before" : "This car was listed before") + "</h3>" + histRows(h) + "</div>";
    document.body.appendChild(s);
  }
  var HIST = [];
  document.addEventListener("click", function(e){
    var t = e.target;
    if (t.closest("[data-inert]")) { e.preventDefault(); return; }
    if (t.closest("[data-hist]")) { e.preventDefault(); return openHist(HIST); }
    if (t.closest("[data-close]") && (t.hasAttribute("data-close") || t.closest(".pop") === null || t.classList.contains("x"))) { var sc = document.querySelector(".pop-scrim"); if (sc && (t === sc || t.closest("[data-close]") !== sc)) sc.remove(); return; }
    var mc = t.closest("[data-mc-toggle]");
    if (mc) { var b = $("mc-body"), open = b.hidden; b.hidden = !open; mc.setAttribute("aria-expanded", open ? "true" : "false"); var ch = mc.querySelector(".chev"); if (ch) ch.textContent = open ? "Hide" : "Show"; }
  });
  document.addEventListener("keydown", function(e){ if (e.key === "Escape") { var sc = document.querySelector(".pop-scrim"); if (sc) sc.remove(); } });
  document.addEventListener("submit", function(e){ if (e.target.closest("[data-inert]")) e.preventDefault(); });
  // The engine's own question: an option asks the engine again with that option's own words (the partner answer's send).
  document.addEventListener("click", function(e){
    var o = e.target.closest("[data-qsend]"); if (!o) return;
    var send = {}; try { send = JSON.parse(o.getAttribute("data-qsend")); } catch (x) {}
    var sec = o.closest("section"), v = sec ? sec.id.replace("view-", "") : "c";
    var draw = v === "a" ? (typeof drawA === "function" ? drawA : drawC) : v === "b" ? (typeof drawB === "function" ? drawB : drawC) : drawC;
    ask(send).then(draw);
  });
  // TAB c: the vehicle page.
  // The fixed sample listing figures for this car (the profile's constants; nothing computed here). The price shows only
  // inside the engine's own range, and the finance and cash rows only with it.
  function sampleOf(a){
    var sl = SAMPLES[CAR] || null;
    if (!sl || !a || a.ok === false || a.question || !a.range || !(sl.price >= a.range.low && sl.price <= a.range.high)) return null;
    return sl;
  }
  // The car's title in Amazon form, from the answer's own identity (never the VIN): "Used {year} {make} {model}".
  function amazonTitle(a){
    var d = a && a.vinDecode, id = a && a.identity, words = [];
    if (d && d.year && d.make && d.model) { words = [d.year, d.make, d.model]; if (d.trim) words.push(d.trim); if (d.body) words.push(d.body); }
    else if (id && id.year && id.make && id.model) { words = [id.year, id.make, id.model]; if (id.variant) words.push(id.variant); if (id.body) words.push(id.body); }
    else if (a && a.carName) words = [a.carName];
    if (!words.length) return null;
    var seen = [], out = [];
    words.forEach(function(w){ w = String(w); var low = w.toLowerCase(); if (seen.join(" ").indexOf(low) < 0) { out.push(w); seen.push(low); } });
    return "Used " + out.join(" ");
  }
  // Key features from the answer's own decode (a.features), each only when known; the section hides when none is.
  var KF = [["drivetrain", "Drivetrain"], ["seats", "Seating"], ["engine", "Engine"], ["fuel", "Fuel type"], ["transmission", "Transmission"], ["interior", "Interior"], ["exterior", "Exterior"]];
  var KF_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M8 12h8M12 8v8" stroke="currentColor" stroke-width="1.6"/></svg>';
  function kfHtml(a){
    var f = (a && a.vinDecode && a.vinDecode.features) || {};   // the VIN's own decode only (item 7)
    return KF.filter(function(k){ return f[k[0]] != null && String(f[k[0]]).trim(); }).map(function(k){ return '<div class="kfi">' + KF_ICON + '<span><span class="kfl">' + esc(k[1]) + '</span><span class="kfv">' + esc(f[k[0]]) + "</span></span></div>"; }).join("");
  }
  function caseHtml(a){
    var k = demoAnswerCase(a); if (!k || k.kind === "answer" || k.kind === "error" || !k.line) return "";
    return '<div class="case"><p class="case-l">' + esc(k.line) + "</p>" + (k.name ? '<p class="case-n">' + esc(k.name) + "</p>" : "") + "</div>";
  }
  function wordsCaseHtml(q){ return '<div class="case"><p class="case-l">' + esc(OUT_OF_SCOPE_LINE) + '</p><p class="case-n">' + esc(q) + "</p></div>"; }
  function mcCard(a){ return cardHtml(a) + (a && a.ok !== false && !a.question ? '<p class="mc-ctx">' + esc(CONTEXT) + "</p>" : ""); }
  function drawC(a){
    var ok = a && a.ok !== false;
    var photo = ok && a.carPhoto && a.carPhoto.photo;
    $("c-photo").innerHTML = photo ? '<img src="/api/partnerAnswer?photo=' + encodeURIComponent(photo) + '&w=960" alt="' + esc(CAR) + '" decoding="async"><p class="photo-note"></p>' : "";
    var gal = $("c-photo"); if (photo) { gal.classList.add("has"); var n = gal.querySelector(".photo-note"); if (n) { n.textContent = "Photo of a car like it from a recent sale."; gal.parentNode.appendChild(n); } }
    // The thumbnail strip: the same photo, then this exact car's own earlier photos (its history), never another car's.
    var th = [photo ? "/api/partnerAnswer?photo=" + encodeURIComponent(photo) + "&w=320" : null].concat(((a && a.history) || []).filter(function(r){ return r.photo; }).map(function(r){ return "/api/partnerAnswer?photo=" + encodeURIComponent(r.photo) + "&w=320"; })).filter(Boolean);
    $("c-thumbs").innerHTML = th.slice(0, 6).map(function(u, k){ return '<img src="' + esc(u) + '" alt="" loading="lazy"' + (k === 0 ? ' class="on"' : "") + ">"; }).join("");
    var t = amazonTitle(a); if (t) $("c-title").textContent = t;
    var scope = ok && (inScope(a) || !!a.question), sl = scope ? sampleOf(a) : null;   // an engine question is always drawn
    $("c-price").innerHTML = sl ? '<div class="price">' + usd(sl.price) + '</div><p class="price-kind">Sample asking price</p>' + (sl.miles ? '<p class="miles">' + esc(Number(sl.miles).toLocaleString("en-US")) + " miles</p>" : "") : "";
    $("c-fin").innerHTML = sl ? '<div class="fin"><span class="fin-l">Finance</span><div class="fin-b"><p class="fin-m">' + usd(sl.monthly) + '<span>/mo</span></p><p class="fin-s">Sample</p><button type="button" class="btn yel blk" data-inert>Estimate payments</button></div></div><div class="cash"><span>Cash</span><b>' + usd(sl.price) + "</b></div>" : "";
    if ($("c-mc")) { $("c-mc").hidden = !scope; if (scope) $("mc-body").innerHTML = mcCard(a); }
    // A read that failed (ok:false) draws the page's own "could not be read" or still-reading line, never a blank rail.
    $("c-case").innerHTML = scope ? "" : (ok ? caseHtml(a) : '<div class="case">' + cardHtml(a) + "</div>");
    $("c-pcard").innerHTML = scope ? mcCard(a) : "";
    var kf = kfHtml(ok ? a : null); $("c-kf").innerHTML = kf; $("c-kfsec").hidden = !kf;
    HIST = (a && a.history) || [];
    // History and condition shows only when this exact car has an earlier listing on record.
    $("c-hist").innerHTML = HIST.length ? '<p class="hist-l">This car has previous market history</p><button type="button" class="linkbtn" data-hist>See earlier sales</button>' : "";
    $("c-histsec").hidden = !HIST.length;
    if (a && a.stillReading && a.retryAfterMs > 0) setTimeout(function(){ ask(body).then(drawC); }, a.retryAfterMs);
  }
  // The two working section tabs: Overview and Pricing (the same card); the others are inert.
  document.addEventListener("click", function(e){
    var b = e.target.closest("[data-stab]"); if (!b) return;
    var k = b.getAttribute("data-stab");
    Array.prototype.forEach.call(document.querySelectorAll(".stab"), function(x){ var on = x === b; x.classList.toggle("on", on); x.setAttribute("aria-selected", on ? "true" : "false"); });
    $("c-overview").hidden = k !== "overview"; $("c-pricing").hidden = k !== "pricing";
  });
  // TAB d: each card's photo, chip and marker from that car's STORED partner answer only (?last=), never a live read.
  function drawD(){
    Array.prototype.forEach.call(document.querySelectorAll("[data-dcar]"), function(card){
      var q = card.getAttribute("data-dcar"), qq = (LISTBODY[q] ? q + " " + LISTBODY[q] : q);
      fetch("/api/partnerAnswer?last=" + encodeURIComponent(qq), { credentials: "include" }).then(function(r){ return r.json(); }).catch(function(){ return null; }).then(function(a){
        if (!a || a.ok === false || a.lastGood !== true) return;
        var ph = a.carPhoto && a.carPhoto.photo; if (ph) card.querySelector("[data-dph]").innerHTML = '<img src="/api/partnerAnswer?photo=' + encodeURIComponent(ph) + '&w=320" alt="" loading="lazy">';
        var id = a.identity || {}; if (id.body) card.querySelector("[data-dchips]").innerHTML = '<span class="dchip">' + esc(id.body) + "</span>";
        if (!inScope(a)) return;
        var m = card.querySelector("[data-dmark]"); m.textContent = anySold(a.history) ? "Sold before" : "Market Check"; m.hidden = false;
      });
    });
  }
  if (VIEW === "d") drawD();
  var body = LIST && LIST.vin ? { q: CAR, vin: LIST.vin } : { q: LISTCAR || CAR };
  if (VIEW === "c" && !OUT_OF_SCOPE) ask(body).then(drawC);   // an out-of-scope listing (from its own words) makes no read
  // TAB a, BEFORE SHOPPING: any car or a VIN returns the same shared card; with a VIN, this car's history inline above it.
  // Outside the pilot scope, no module. The two next steps are inert; no trade-in number is ever shown.
  function drawA(a){
    var out = $("a-out"); if (!out) return;
    var cs = caseHtml(a); if (cs) { out.innerHTML = cs; return; }
    if (a && a.ok !== false && !a.question && !inScope(a)) { out.innerHTML = ""; return; }
    out.innerHTML = inlineHist((a && a.history) || []) + cardHtml(a);
    if (a && a.stillReading && a.retryAfterMs > 0) setTimeout(function(){ goA(); }, a.retryAfterMs);
  }
  function goA(){ var q = String(($("a-q") || {}).value || "").trim(); if (!q) return; if (wordsOut(q)) { $("a-out").innerHTML = wordsCaseHtml(q); return; } $("a-out").innerHTML = '<p class="loading">Reading the sales for this one.</p>'; ask({ q: q }).then(drawA); }
  // TAB b, DEALER LISTS A CAR: VIN in; this car's history inline and the same shared card, ABOVE the asking price field.
  // No pricing advice, no suggested price: the price field is the dealer's and stays empty.
  function drawB(a){
    var out = $("b-out"); if (!out) return;
    var cs = caseHtml(a); if (cs) { out.innerHTML = cs; return; }
    if (a && a.ok !== false && !a.question && !inScope(a)) { out.innerHTML = ""; return; }
    out.innerHTML = inlineHist((a && a.history) || []) + cardHtml(a);
    if (a && a.stillReading && a.retryAfterMs > 0) setTimeout(function(){ goB(); }, a.retryAfterMs);
  }
  // The listing car opens by its name; its VIN goes with the read (for its history) and is never printed.
  function goB(){ var q = String(($("b-vin") || {}).value || "").trim(); if (!q) return; if (wordsOut(q)) { $("b-out").innerHTML = wordsCaseHtml(q); return; } $("b-out").innerHTML = '<p class="loading">Reading the sales for this one.</p>'; ask(LIST && LIST.vin && q === CAR ? { q: q, vin: LIST.vin } : { q: q }).then(drawB); }
  document.addEventListener("click", function(e){ if (e.target.closest("[data-a-go]")) goA(); if (e.target.closest("[data-b-go]")) goB(); });
  document.addEventListener("keydown", function(e){ if (e.key !== "Enter") return; if (e.target.id === "a-q") { e.preventDefault(); goA(); } if (e.target.id === "b-vin") { e.preventDefault(); goB(); } });
  // A car chosen in the bar opens on tabs a and b already read (the same one read per page as tab c).
  if (VIEW === "a" && CHOSEN) { $("a-q").value = CAR; goA(); }
  if (VIEW === "b" && CHOSEN) { $("b-vin").value = CAR; goB(); }
})();
`;

export function amazonPageHtml(view, carIn, { carOf, listing }) {
  const P = AMAZON_PROFILE;
  const v = /^[abcd]$/.test(view || "") ? view : "c";
  const car = carOf(carIn), chosen = String(carIn == null ? "" : carIn).trim() !== "";
  const hasListing = listing && car === listing.q;
  const listCar = P.listingBody[car] ? car + " " + P.listingBody[car] : car;
  // tab c: an out-of-scope listing, known from its own words, draws no Market Check module and makes no read
  const outC = v === "c" && scopeFromWords(car, new Date().getFullYear(), { age: SCOPE_AGE_YEARS, makes: SCOPE_MAKES, models: SCOPE_MODELS }) === false;
  const carQ = k => `?p=amazon&view=${k}${car === DEMO_CARS[0] ? "" : "&car=" + encodeURIComponent(car)}`;
  const tab = (k, label) => `<a href="${escHtml(carQ(k))}"${k === v ? ' aria-current="page"' : ""}>${label}</a>`;
  const carBar = `<div class="carbar"><div class="wrap"><form class="carpick" id="car-form" method="get" action="/preview"><input type="hidden" name="p" value="amazon"><input type="hidden" name="view" value="${v}"><label for="car-in">Car</label><input id="car-in" name="car" value="${chosen ? escHtml(car) : ""}" autocomplete="off" maxlength="60" placeholder="Type your car or paste a VIN"><button class="btn out" type="submit">Show</button></form></div></div>`;
  const sy = /^(\d{4})\b/.exec(car), year = sy ? sy[1] : null;
  // TAB c, ON THE LISTING: photos, title, "Sample listing", the sample asking price (inside the range only), the purchase box
  // (inert), the dealer line, then Market Check below the purchase box (a collapsed row opening the shared card), the
  // vehicle features and the vehicle history. No VIN printed, no "last sold" near the price, no verdict words.
  // TAB c, ON THE LISTING (revision 2, Sam, Oct 20 2026): the Amazon Autos listing layout. "Back to search results"; the
  // large photo with a thumbnail strip; the title in Amazon form ("Used {year} {make} {model}", from the answer's own
  // identity, never the VIN); "Sample listing"; the fixed sample price and the listing's own mileage; a Finance box and a
  // Cash row (fixed sample figures); Market Check collapsed directly under the Cash row; "See price details"; the dealer
  // line; the section tabs; Key features from the answer's own decode (a field left out when unknown); History and
  // condition. No VIN printed, nothing beside the price from the engine, no verdict words. Every partner control inert.
  const vinLike = /^[A-Za-z0-9]{11,17}$/.test(listCar) && /\d.*\d.*\d/.test(listCar) && !/\s/.test(listCar);
  const initTitle = vinLike ? "" : /^\d{4}\s/.test(listCar) ? "Used " + listCar : listCar;   // never the VIN (item 7)
  const viewC = `
<section class="wrap" id="view-c"${v === "c" ? "" : " hidden"}>
  <p class="back"><a class="back-l" href="${escHtml(`?p=amazon&view=d`)}">&lsaquo; Back to search results</a></p>
  <div class="listing">
    <div class="galwrap"><div class="gal" id="c-photo"></div><div class="thumbs" id="c-thumbs" aria-hidden="true"></div></div>
    <div class="rail">
      <h1 id="c-title">${escHtml(hasListing ? "Used " + listing.title : initTitle)}</h1><p class="sample-tag">Sample listing</p>
      <div id="c-price"></div>
      <div id="c-fin"></div>
      ${outC ? "" : `<div class="mc" id="c-mc" hidden>
        <button type="button" class="mc-row" data-mc-toggle aria-expanded="false" aria-controls="mc-body"><span>${escHtml(P.moduleName)}, <span class="attr">${escHtml(P.attribution.replace(/^Powered/, "powered"))}</span></span><span class="chev">Show</span></button>
        <div class="mc-body" id="mc-body" hidden><p class="loading">Reading the sales for this one.</p></div>
      </div>`}
      <div id="c-case">${outC ? `<div class="case"><p class="case-l">${escHtml(OUT_OF_SCOPE_LINE)}</p><p class="case-n">${escHtml(listCar)}</p></div>` : ""}</div>
      <p class="pdet"><button type="button" class="linkbtn" data-inert>See price details</button></p>
      <p class="dealer">Sold by <b>Sample dealer</b></p>
    </div>
    <div class="below">
      <div class="stabs" role="tablist" aria-label="Listing sections">${P.sectionTabs.map((t, k) => `<button type="button" class="stab${k === 0 ? " on" : ""}"${t === "Overview" || t === "Pricing" ? ` data-stab="${t.toLowerCase()}"` : " data-inert"} role="tab" aria-selected="${k === 0}">${escHtml(t)}</button>`).join("")}</div>
      <div id="c-overview">
        <div class="sec" id="c-kfsec" hidden><h2>Key features</h2><div class="kf" id="c-kf"></div></div>
        <div class="sec" id="c-histsec" hidden><h2>History and condition</h2><div id="c-hist"></div></div>
      </div>
      <div id="c-pricing" hidden><div class="sec"><h2>Pricing</h2><div id="c-pcard"></div></div></div>
    </div>
  </div>
</section>`;
  // TAB d, IN SEARCH RESULTS (revision 2, item 5): an Amazon Autos results grid of the demo cars. Each card: the photo,
  // "Used {year} {make} {model}", the mileage and a spec chip, the fixed sample price and finance line (profile
  // constants), and ONE neutral marker read from that car's STORED partner answer ("Sold before" when its VIN has sold,
  // else "Market Check"); no range, no verdict, no live engine call from the page. A card opens its tab c page.
  const dCard = (c, i) => { const sl = P.sampleListings[c] || null, body = P.listingBody[c] ? " " + P.listingBody[c] : "";
    return `<a class="dcard" href="${escHtml(`?p=amazon&view=c${i === 0 ? "" : "&car=" + i}`)}" data-dcar="${escHtml(c)}"><span class="dph" data-dph></span><span class="dtx"><span class="dtitle">${escHtml("Used " + c + body)}</span>${sl && sl.miles ? `<span class="dmiles">${sl.miles.toLocaleString("en-US")} miles</span>` : ""}<span class="dchips" data-dchips></span>${sl ? `<span class="dprice">${"$" + sl.price.toLocaleString("en-US")}</span><span class="dfin">${"$" + sl.monthly.toLocaleString("en-US")}/mo, Sample</span>` : ""}<span class="dmark" data-dmark hidden></span></span></a>`; };
  const viewD = `
<section class="wrap" id="view-d"${v === "d" ? "" : " hidden"}>
  <h1 class="dhead">Used cars</h1><p class="sample-tag">Sample results</p>
  <div class="dgrid">${DEMO_CARS.map(dCard).join("")}</div>
</section>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="robots" content="noindex,nofollow"><title>What these sell for</title><style>${CSS}${SELLS_FOR_CARD_CSS}</style></head><body>
<div class="demo-bar"><div class="wrap"><span>What these sell for, powered by GoAskSam.</span><nav class="tabs" aria-label="Views">${P.tabs.map(([k, l]) => tab(k, l)).join("")}</nav></div></div>
${carBar}
<header class="top"><div class="wrap"><div class="plogo"><span class="chip"><img src="${P.logoPath}" alt="${escHtml(P.logoAlt)}" width="138" height="21" decoding="async"></span><span class="prep">${escHtml(P.preparedFor)}</span><span class="demo-lab">${escHtml(P.demoLabel)}</span></div><div class="sbox" aria-hidden="true">Search Amazon Autos</div><button type="button" class="btn nav" data-inert>Sign in</button></div></header>
<nav class="subnav" aria-label="Sample navigation"><div class="wrap">${P.subnav.map(t => `<button type="button" class="snav" data-inert>${escHtml(t)}</button>`).join("")}</div></nav>
<main>
<section class="wrap" id="view-a"${v === "a" ? "" : " hidden"}>
  <div class="entry lead"><h1>What's your car going for?</h1>
    <div class="ask"><input id="a-q" autocomplete="off" maxlength="60" placeholder="Type your car or paste a VIN" aria-label="Car or VIN"><button type="button" class="btn yel" data-a-go>Check</button></div>
    <div id="a-out" style="margin-top:20px"></div>
    <div class="nexts"><button type="button" class="btn out" data-inert>Shop these cars</button><button type="button" class="btn out" data-inert>See your trade-in offer</button></div>
  </div>
</section>
<section class="wrap" id="view-b"${v === "b" ? "" : " hidden"}>
  <div class="dealer-form"><h2>List a car</h2><p class="sample-tag">Sample listing</p>
    <div class="field"><label for="b-vin">VIN</label><div class="ask" style="display:flex;gap:8px;flex-wrap:wrap"><input id="b-vin" autocomplete="off" maxlength="60" placeholder="Paste a VIN or type the car" aria-label="VIN or car"><button type="button" class="btn yel" data-b-go>Look up</button></div></div>
    <div id="b-out" style="margin-top:16px"></div>
    <div class="field"><label for="b-price">Asking price</label><input id="b-price" disabled placeholder="Set by the dealer" aria-label="Asking price"></div>
    <div class="nexts"><button type="button" class="btn org" data-inert>Continue</button></div>
  </div>
</section>
${viewC}
${viewD}
</main>
<script>${JS.replace("__LISTCAR__", JSON.stringify(listCar)).replace("__SAMPLES__", JSON.stringify(P.sampleListings)).replace("__LISTBODY__", JSON.stringify(P.listingBody)).replace("__OOSLINE__", JSON.stringify(OUT_OF_SCOPE_LINE)).replace("__CASEFN__", () => demoAnswerCase.toString()).replace("__CONTEXT__", JSON.stringify(P.cardContext)).replace("__CAR__", JSON.stringify(car)).replace("__OUTSCOPE__", JSON.stringify(outC)).replace("__CARS__", JSON.stringify(DEMO_CARS)).replace("__SCOPE__", JSON.stringify({ age: SCOPE_AGE_YEARS, makes: SCOPE_MAKES, models: SCOPE_MODELS })).replace("__KNOWNMAKES__", JSON.stringify(KNOWN_MAKES)).replace("__MAKEWORDS__", JSON.stringify(MAKE_WORDS)).replace("__FROMWORDS__", scopeFromWords.toString()).replace("__INSCOPE__", amazonInScope.toString()).replace("__VIEW__", JSON.stringify(v)).replace("__LIST__", JSON.stringify(hasListing ? { vin: listing.vin } : null)).replace("__CHOSEN__", JSON.stringify(chosen))}</script></body></html>`;
}
