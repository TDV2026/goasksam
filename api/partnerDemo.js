// PARTNER DEMO PAGE (Lane C, Oct 15 2026; closed, crew-only, noindex, linked from nowhere public): four views of
// "What these sell for, powered by GoAskSam" inside a partner's own listing layout. The page is a NEUTRAL MIRROR of
// that layout (its structure, type scale, button shape and colour pattern) applied to our own elements: no partner
// name, logo, copy or photos, placeholder photos only. Every number on it comes from api/partnerAnswer.js, which is
// Market Check's own answer for the same words; the page computes nothing but where a figure sits against a range.
//   a. Before listing: one box (any car or VIN), the engine's identity chips and question, the range panel only when
//      the engine gives a range, the VIN's history, a List it button that does nothing in the demo.
//   b. Setting a reserve: a reserve field with a pill (inside the range green, above amber, below slate, no range
//      grey; grey means only "no range", Sam Oct 16 2026).
//   c. On the listing: the dummy listing with "What these sell for" and "This car before" in the right rail and a
//      pill for the current price against the range; on a phone they stack under the price and buy buttons.
//   d. Under the listing: a full-width "What cars like this sold for" (sale tiles, lowest price first), then "This car
//      before"; on a phone after the description.
// Route: /preview (vercel.json rewrite to /api/partnerDemo; Sam, Oct 18 2026: the old /partner-demo redirects there), ?view=a|b|c|d.
import { sendDisguisedNotFound } from "../lib/_notFound.js";
import { isCrewRequest } from "../lib/_crew.js";
import { isPartnerRequest, partnerCodeMatches, partnerSetCookies } from "../lib/_partnerAccess.js";
import { checkCeiling } from "../lib/_ceilings.js";
import { supabaseEnv } from "../lib/_supabase.js";
import { SELLS_FOR_CARD_CSS } from "../lib/sellsForCard.js";
import { PARTNER_LOGO_SVG_B64 } from "./_partnerLogo.js";
import { DEMO_CARS } from "./partnerAnswer.js";
import { amazonPageHtml } from "./_amazonDemo.js";
import { reasonLine } from "../lib/reasonWords.js";
import { AMAZON_LOGO_SVG_B64 } from "./_amazonLogo.js";

// THE LISTING CAR (c9, Sam, Oct 18 2026): the real 2014 Porsche 911 GT3, VIN WP0AC2A9XES183617, listed at 30,400 miles
// (never below its last recorded sale, 29,000) and $139,900. Its photo and its earlier sales are its own stored records
// (the endpoint's VIN history, venue-blind); nothing else about it is stated (no colour, title status or time left).
export const DUMMY = { title: "2014 Porsche 911 GT3", year: 2014, miles: 30400, price: 139900, priceKind: "Buy It Now", vin: "WP0AC2A9XES183617", q: "2014 Porsche 911 GT3" };

const CSS = `
:root{--ink:#191919;--ink2:#707070;--rule:#e5e5e5;--soft:#f7f7f7;--blue:#3665f3;--blue2:#2b52c5;--green:#0b7a34;--greenbg:#e6f4ea;--amber:#8a5a00;--amberbg:#fdf3dc;--grey:#5c5c5c;--greybg:#efefef;--slate:#334b66;--slatebg:#e3eaf3;--r:16px;color-scheme:light;
  /* the shared card reads these tokens: the partner mirror's own type and lines, so the card sits in its layout */
  --sans:-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;--serif:var(--sans);--sec:var(--ink2);--div:var(--rule);--card:#fff}
*{box-sizing:border-box}
body{margin:0;background:#fff;color:var(--ink);font:400 16px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased}
.wrap{max-width:1280px;margin:0 auto;padding:0 24px}
.demo-bar{background:#111;color:#fff;font-size:13px}
.demo-bar .wrap{display:flex;gap:12px;align-items:center;justify-content:space-between;padding-block:8px;flex-wrap:wrap}
.tabs{display:flex;gap:6px;flex-wrap:wrap}
.carbar{background:var(--soft);border-bottom:1px solid var(--rule);font-size:14px}
.carbar .wrap{display:flex;gap:10px 18px;align-items:center;flex-wrap:wrap;padding-block:10px}
.carpick{display:flex;gap:8px;align-items:center;flex:1 1 320px;min-width:0}
.carpick label{font-weight:600}
.carpick input{flex:1;min-width:0;height:40px;border:1px solid var(--ink2);border-radius:999px;padding:0 14px;font:inherit;background:#fff}
.carpick .btn{min-height:40px;font-size:15px;padding:0 16px}
.tabs a{color:#fff;text-decoration:none;border:1px solid #555;border-radius:999px;padding:4px 12px}
.tabs a[aria-current=page]{background:#fff;color:#111;border-color:#fff}
.top{border-bottom:1px solid var(--rule)}
.top .wrap{display:flex;gap:20px;align-items:center;padding-block:16px}
/* eBay's own logo file, unedited (api/_partnerLogo.js), framed by CSS only: the 288 by 288 file is scaled so its
   wordmark is 40px tall (32px on a phone) and the frame shows the wordmark with clear space, level with the Search box. */
.plogo{display:flex;align-items:center;gap:10px;flex:none}
.plogo-frame{position:relative;display:block;width:116px;height:48px;overflow:hidden;flex:none}
.plogo-frame img{position:absolute;width:150.2px;height:150.2px;left:-17.5px;top:-51.1px;max-width:none}
.prep{font-size:12px;line-height:1.2;color:var(--ink2);white-space:nowrap}
.sbtn{flex:none;min-width:150px}
.sbox{flex:1;display:flex;border:2px solid var(--ink);border-radius:999px;height:48px;align-items:center;padding:0 18px;color:#767676;min-width:0}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:48px;padding:0 24px;border-radius:999px;font-family:inherit;font-weight:600;font-size:17px;line-height:1;cursor:pointer;border:1px solid var(--blue);text-decoration:none}
.btn.pri{background:var(--blue);color:#fff}
.btn.sec{background:#fff;color:var(--blue)}
.btn.blk{width:100%}
.btn[disabled]{opacity:1;cursor:default}
h1{font-size:28px;line-height:1.2;margin:0 0 6px;font-weight:700}
h2{font-size:24px;line-height:1.25;margin:0 0 14px;font-weight:700}
h3{font-size:18px;line-height:1.3;margin:0 0 10px;font-weight:700}
.sub{color:var(--ink2);margin:0}
.muted{color:var(--ink2)}
.panel{background:var(--soft);border-radius:var(--r);padding:20px}
.panel+.panel{margin-top:16px}
.gas-foot{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-top:14px;padding-top:12px;border-top:1px solid var(--rule);font-size:13px;color:var(--ink2)}
.gas-foot b{color:var(--ink);font-weight:600}
.gas-foot a{color:var(--ink);text-decoration:underline;text-underline-offset:3px}
.range{font-size:26px;font-weight:700;margin:2px 0 4px}
.pillrow{margin:6px 0 10px}
.note{color:var(--ink2);font-size:14px;margin:8px 0 0}
.qrow{margin:0 0 16px;font-size:15px}
.upd{font-weight:400}
.facts{display:flex;gap:0;flex-wrap:wrap;margin:10px 0 0}
.facts div{padding:0 16px;border-left:1px solid var(--rule)}
.facts div:first-child{padding-left:0;border-left:0}
.facts dt{font-size:13px;color:var(--ink2)}
.facts dd{margin:2px 0 0;font-size:16px}
.pill{display:inline-flex;align-items:center;gap:6px;border-radius:999px;padding:6px 12px;font-size:14px;font-weight:600}
.pill.in{background:var(--greenbg);color:var(--green)}
.pill.above{background:var(--amberbg);color:var(--amber)}
.pill.below{background:var(--slatebg);color:var(--slate)}
.pill.none{background:var(--greybg);color:var(--grey)}
.chips{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0 0}
.chip{border:1px solid var(--ink2);border-radius:999px;padding:6px 14px;font-size:14px;background:#fff}
.chip.opt{cursor:pointer;border-color:var(--blue);color:var(--blue);font-family:inherit}
.hist{list-style:none;margin:0;padding:0}
.hist li{display:flex;justify-content:space-between;gap:12px;padding:10px 0;border-top:1px solid var(--rule)}
.hist li:first-child{border-top:0;padding-top:0}
.hist li>span:first-child{flex:none;white-space:nowrap}
.hist .r{text-align:right}
.loading{color:var(--ink2);font-size:14px}
.sec-view{padding-block:28px 48px}
.sec-view[hidden]{display:none}
.lead{max-width:760px}
.ask{display:flex;gap:10px;margin:18px 0 0;flex-wrap:wrap}
.ask input{flex:1;min-width:0;height:48px;border:1px solid var(--ink2);border-radius:999px;padding:0 18px;font:inherit}
.money{display:flex;align-items:center;border:1px solid var(--ink2);border-radius:12px;height:48px;padding:0 14px;background:#fff}
.money input{border:0;font:inherit;width:140px;outline:none}
/* the listing (views c and d) */
.listing{display:grid;grid-template-columns:minmax(0,1.65fr) minmax(0,1fr);gap:40px;align-items:start}
.listing.with-below{row-gap:0}
.listing.with-below>.rail{grid-column:2;grid-row:1 / span 2}
.below-gal{grid-column:1;min-width:0}
.idline{margin:12px 2px 0;font-size:14px;color:var(--ink2,#555);line-height:1.7}
.idl{font:inherit;background:none;border:0;padding:0;color:var(--ink,#111);text-decoration:underline;text-underline-offset:3px;cursor:pointer}
.idl.chosen{text-decoration:none;font-weight:600}
.gal{display:grid;grid-template-columns:88px 1fr;gap:12px}
.thumbs{display:grid;gap:10px;align-content:start}
.ph{border-radius:12px;background:linear-gradient(135deg,#d9d9d9,#bfbfbf);display:grid;place-items:center;color:#7a7a7a;font-size:13px;aspect-ratio:4/3}
.thumbs .ph{aspect-ratio:1/1;font-size:10px}
.main-ph{aspect-ratio:4/3;font-size:15px}
.rail h1{font-size:28px}
.rail hr{border:0;border-top:1px solid var(--rule);margin:16px 0}
.price{font-size:28px;font-weight:700}
.sample-tag{display:inline-block;margin:6px 0 0;padding:3px 10px;border-radius:999px;background:#fff3cd;color:#6b4e00;font-size:13px;font-weight:600}
.price-kind{font-size:13px;color:var(--ink2);margin:2px 0 0}
.price small{font-size:15px;font-weight:400;color:var(--ink2)}
.specs{display:flex;flex-wrap:wrap}
.specs div{padding:0 18px;border-left:1px solid var(--rule)}
.specs div:first-child{padding-left:0;border-left:0}
.specs dt{font-size:14px;color:var(--ink2)}.specs dd{margin:2px 0 0}
.buy{display:grid;gap:10px;margin:16px 0}
.time{display:flex;gap:24px;font-size:15px}
.desc.below{margin-top:40px}
.desc h2{margin-bottom:8px}
.tiles{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:20px}
.tile .ph{aspect-ratio:4/3;margin-bottom:12px;border-radius:16px;background:var(--soft);border:12px solid var(--soft);background-image:linear-gradient(135deg,#d9d9d9,#bfbfbf);background-clip:content-box}
.tile{background:var(--soft);border-radius:var(--r);padding:16px 18px}
.tile .p{font-size:18px;font-weight:700}
.tile .d{color:var(--ink2);font-size:14px}
.full{margin-top:36px}
.hero-img{display:block;width:100%;height:auto;aspect-ratio:1600/1058;object-fit:cover;border-radius:12px;background:#d9d9d9}
.gal-hero{grid-template-columns:1fr}
.gal-own:empty{display:none}
.gal-own:not(:has(.thumbs)){grid-template-columns:1fr}
.thumb-img{display:block;width:100%;aspect-ratio:1/1;object-fit:cover;border-radius:12px;background:#d9d9d9}
.b-hero{max-width:760px;margin:0 0 22px}
.b-hero:empty{display:none}
.car-photo{margin:0 0 18px;max-width:760px}
.photo-note{margin:6px 0 0;font-size:13px;color:var(--ink2)}
.vin-line{display:block;margin:2px 0 10px;font-size:13px;color:var(--ink2);letter-spacing:.02em}
h2.car-name{font-size:22px;margin:0 0 2px}
#c-name .car-name,#b-name .car-name{display:block}
#c-name .vin-line,#b-name .vin-line{font-weight:400}
.tag-this{display:inline-block;margin-left:6px;padding:1px 8px;border-radius:999px;background:var(--ink);color:#fff;font-size:11px;font-weight:600;vertical-align:2px}
.own-main .car-photo{margin:0;max-width:none}
.prior{margin:0 0 18px}
.prior-none{margin:0 0 14px;font-size:14px;color:var(--ink2)}
.prior h3{margin-bottom:8px}
#c-photo .car-photo{max-width:none}
.full-a{margin-top:26px}
.full-a h2{font-size:20px;margin-bottom:8px}
.sl-head{margin:-6px 0 12px}
.slist{display:flex;flex-direction:column}
.srow{display:flex;align-items:center;gap:16px;padding:12px 0;border-top:1px solid var(--line,#e5e5e5)}
.srow:first-child{border-top:0}
.sph{flex:none;width:128px;aspect-ratio:4/3;border-radius:10px;background:#ececec;overflow:hidden}
.sph img{display:block;width:100%;height:100%;object-fit:cover}
.sinfo{flex:1;min-width:0}
.st{font-weight:600;font-size:15px;line-height:1.3;overflow-wrap:anywhere}
.sd{color:var(--ink2);font-size:14px}
.sr{color:var(--ink2);font-size:13px;margin-top:2px}
.sp{flex:none;font-weight:700;font-size:17px;text-align:right}
.morewrap{margin-top:16px;text-align:center}
.more{font:inherit;font-size:15px;font-weight:600;padding:12px 28px;border-radius:999px;border:1px solid #d0d0d0;background:#fff;color:inherit;cursor:pointer}
.aside-grp{margin-top:28px}
.aside-grp summary{cursor:pointer;font-weight:600;font-size:15px;padding:8px 0}
.aside-grp[open] summary{margin-bottom:4px}
@media (max-width:600px){.sph{width:88px}.srow{gap:12px}.sp{font-size:15px}}
.stable{width:100%;border-collapse:collapse;font-size:15px}
.stable th{text-align:left;font-size:13px;font-weight:600;color:var(--ink2);padding:0 8px 8px;border-bottom:1px solid var(--rule)}
.stable td{padding:10px 8px;border-bottom:1px solid var(--rule)}
.stable th:first-child,.stable td:first-child{padding-left:0}
.stable .num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap;padding-right:0}
.stable .res-row td{padding:8px 12px;background:var(--soft);border-top:2px solid var(--ink);border-bottom:2px solid var(--ink);font-weight:700}
.sfc-howline{margin:8px 0 0;font-size:13px;color:var(--ink2,#666);line-height:1.45}
.hsd{color:var(--ink)}
/* "How Sam decides" is plain static text on the demo (Sam): the card's own link styling is undone here only */
.sfc-card span.sfc-footer-link{color:var(--ink2);font-weight:400;text-decoration:none}
.tile .d+.d{margin-top:2px}
.phone-only{display:none}
@media (max-width:760px){
  .gal-hero .hero-img{border-radius:0;margin:0 -16px;width:calc(100% + 32px);max-width:none}
  .stable{font-size:14px}
  .stable td,.stable th{padding-left:6px;padding-right:6px}
  .wrap{padding-left:16px;padding-right:16px}
  .listing{grid-template-columns:1fr;gap:0}
  .listing.with-below>.rail,.below-gal{grid-column:1;grid-row:auto}
  .gal{grid-template-columns:1fr}
  .thumbs{display:none}
  .main-ph{border-radius:0;margin:0 -16px}
  .rail{padding-top:16px}
  .facts div,.specs div{padding:0 12px}
  .tiles{grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
  .sbox{height:44px}
  .top .wrap{gap:12px}
  .plogo{flex-direction:column;align-items:flex-start;gap:0}
  .plogo-frame{width:88px;height:44px}
  .plogo-frame img{width:120.1px;height:120.1px;left:-16.4px;top:-38.1px}
  .prep{font-size:11px}
  .sbtn{display:none}
  h1,.rail h1{font-size:24px}
}
/* ---- view b: the listing form (Sam, Nov 1 2026). A plain marketplace form and one GoAskSam card beside the price fields. */
#view-b .lf{max-width:1040px;margin:0 auto;padding:36px 0 64px}
#view-b h1{font-size:28px;line-height:1.2;margin:0 0 10px}
#view-b h2{font-size:15px;letter-spacing:.02em;text-transform:uppercase;margin:0 0 6px}
#view-b .lede{max-width:70ch;margin:0 0 22px}
#view-b .lf-row{display:grid;grid-template-columns:200px 1fr;align-items:center;gap:10px 16px;padding:8px 0}
#view-b .ctl{display:flex;flex-wrap:wrap;gap:10px;align-items:center}
#view-b input,#view-b select{font:inherit;color:var(--ink);background:#fff;border:1px solid var(--rule);border-radius:8px;padding:10px 12px;min-height:44px}
#view-b .btn-off{font:inherit;border:0;border-radius:999px;padding:10px 22px;min-height:44px;background:var(--rule);color:var(--ink2);font-weight:600}
#view-b .lf-or{display:flex;align-items:center;gap:12px;color:var(--ink2);font-size:14px;margin:6px 0}
#view-b .lf-or::before,#view-b .lf-or::after{content:"";flex:1;border-top:1px solid var(--rule)}
#view-b .found{margin:12px 0 8px;display:inline-flex;align-items:center;gap:8px;padding:8px 14px;border-radius:8px;background:var(--soft);border:1px solid var(--rule);font-weight:600}
#view-b .found .tick{color:var(--blue)}
#view-b hr{border:0;border-top:1px solid var(--rule);margin:28px 0}
#view-b .sub{margin:0 0 20px;font-size:15px}
#view-b .split{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,420px);gap:28px 40px;align-items:start}
#view-b .fields{display:grid;gap:18px;max-width:460px}
#view-b .fields[hidden]{display:none}
#view-b .field label{display:block;font-size:14px;margin-bottom:6px}
#view-b .field label small{color:var(--ink2)}
#view-b .field select,#view-b .field input{width:100%}
#view-b .mny{position:relative}
#view-b .mny span{position:absolute;left:12px;top:50%;transform:translateY(-50%);color:var(--ink2)}
#view-b .mny input{padding-left:26px;font-variant-numeric:tabular-nums}
#view-b .two{display:grid;grid-template-columns:1fr 1fr;gap:14px}
#view-b .hint{font-size:13px;color:var(--ink2);margin-top:6px}
#view-b .bpick{margin:14px 0 0}
#view-b .rel{font-size:13px;font-weight:600;margin-top:6px;color:#1F3D2B;min-height:18px}
#view-b #b-out.sam{background:#F4F1EA;color:#1C2A22;border-radius:14px;padding:22px;position:sticky;top:16px;--sam-ink:#1C2A22;--sam-rule:#DAD5C8;--sam-band:#BFD8C6;--sam-bg:#F4F1EA}
#view-b #b-out.plain{padding:0}
#view-b .sam h3{font-size:15px;margin:0 0 2px;font-weight:700}
#view-b .sam .car{font-size:14px;opacity:.8;margin-bottom:16px}
#view-b .sam .range{font-weight:700;font-size:34px;line-height:1.1;font-variant-numeric:tabular-nums}
#view-b .sam .cap{font-size:14px;opacity:.8;margin:4px 0 20px}
#view-b .bar{position:relative;height:10px;border-radius:999px;background:var(--sam-rule);margin:30px 0 8px}
#view-b .bar .mid{position:absolute;top:0;bottom:0;background:var(--sam-band);border-radius:999px}
#view-b .mk{position:absolute;top:50%;width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:50%;background:var(--sam-ink);color:var(--sam-bg);font-size:12px;font-weight:700;display:grid;place-items:center;border:2px solid var(--sam-bg)}
#view-b .ends{display:flex;justify-content:space-between;font-size:13px;opacity:.85;font-variant-numeric:tabular-nums}
#view-b.apart .split{grid-template-columns:minmax(0,1fr)}
#view-b.apart #b-out.sam{position:static}
#view-b .aopts{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr));gap:18px 24px;margin-top:14px}
#view-b .aopt{min-width:0}
#view-b .aopt h4{margin:0 0 4px;font-size:17px}
#view-b .aopt .range{font-size:22px;font-weight:700;margin:0 0 4px}
#view-b .aopt .few{margin:6px 0 0;font-size:15px}
#view-b .aopt .legend{margin-top:12px;padding-top:10px}
#view-b .aopt .slist{margin-top:12px}
#view-b .legend{list-style:none;margin:18px 0 0;padding:14px 0 0;border-top:1px solid var(--sam-rule);display:grid;gap:10px}
#view-b .legend li{display:flex;gap:10px;align-items:flex-start;font-size:15px}
#view-b .legend .dot{flex:none;width:22px;height:22px;border-radius:50%;background:var(--sam-ink);color:var(--sam-bg);font-size:12px;font-weight:700;display:grid;place-items:center;margin-top:1px}
#view-b .legend .empty{font-size:15px;opacity:.85}
#view-b .sales{margin-top:18px;padding-top:14px;border-top:1px solid var(--sam-rule)}
#view-b .sales-head{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:10px}
#view-b .sales h4{margin:0;font-size:15px}
#view-b .tog{display:inline-flex;border:1px solid var(--sam-rule);border-radius:999px;overflow:hidden}
#view-b .tog button{font:inherit;font-size:13px;background:transparent;color:var(--sam-ink);border:0;padding:6px 12px;min-height:32px;cursor:pointer}
#view-b .tog button[aria-pressed="true"]{background:var(--sam-ink);color:var(--sam-bg)}
#view-b .slist{list-style:none;margin:0;padding:0}
#view-b .slist li{display:grid;gap:2px 12px;align-items:center;padding:10px 0;border-bottom:1px solid var(--sam-rule);font-size:14px}
#view-b .slist li.has-th{grid-template-columns:72px 1fr auto}
#view-b .slist li.no-th{grid-template-columns:1fr auto}
#view-b .slist .th{grid-row:1 / span 2;width:72px;height:54px;border-radius:8px;overflow:hidden;background:var(--sam-rule)}
#view-b .slist .th img{width:100%;height:100%;object-fit:cover;display:block}
#view-b .slist li:last-child{border-bottom:0}
#view-b .slist .d{font-weight:600}
#view-b .slist .p{font-weight:700;font-variant-numeric:tabular-nums;text-align:right}
#view-b .slist .m{opacity:.85;font-variant-numeric:tabular-nums}
#view-b#view-b .all{display:inline-block;margin-top:8px;font-size:14px;color:var(--sam-ink)}
#view-b .foot{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-top:20px;padding-top:14px;border-top:1px solid var(--sam-rule);font-size:14px}
@media (max-width:860px){#view-b .split{grid-template-columns:minmax(0,1fr)}#view-b #b-out.sam{position:static}#view-b .lf-row{grid-template-columns:1fr}#view-b h1{font-size:24px}#view-b .sam .range{font-size:30px}}
`;

// The client: asks the endpoint, draws each view from its answer. Every figure on screen is the endpoint's.
const JS = String.raw`
(function(){
  // THE SELECTED CAR (Sam, Oct 18 2026): one car for the whole demo, chosen in the bar on every view and carried in the
  // address (car=), so every view reads the same car. Only the 2014 GT3 has real listing detail (D); every other car shows the sample listing frame.
  var CAR = __CAR__, D = __LISTING__, CARS = __CARS__, CHOSEN = __CHOSEN__;
  var $ = function(id){ return document.getElementById(id); };
  var esc = function(s){ return String(s == null ? "" : s).replace(/[&<>"]/g, function(c){ return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };
  var usd = function(n){ return "$" + Math.round(Number(n)).toLocaleString("en-US"); };
  var MON = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  var monthYear = function(d){ var p = String(d || "").split("-"); return p.length >= 2 && MON[Number(p[1]) - 1] ? MON[Number(p[1]) - 1] + " " + p[0] : ""; };
  var plural = function(n, one, many){ return n === 1 ? one : many; };
  // One read. The page has no wait or retry rule of its own (Sam, Oct 18 2026): when the engine answers that it is still
  // reading, the page draws the engine's line and asks again after the engine's own retryAfterMs. The abort below is a
  // safety net only (Sam's approval): past it the page shows the stored last good answer for a demo car (GET ?last=, no
  // engine read), otherwise the plain still-reading state with Try again. Nothing on the page is timed for a number.
  var ASK_DEADLINE_MS = 25000;
  function ask1(body){
    var ctl = typeof AbortController === "function" ? new AbortController() : null;
    var t = ctl ? setTimeout(function(){ ctl.abort(); }, ASK_DEADLINE_MS) : null;
    var read = fetch("/api/partnerAnswer", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: ctl ? ctl.signal : undefined })
      .then(function(r){ return r.json(); }).catch(function(){ return { aborted: true }; });
    var late = new Promise(function(res){ setTimeout(function(){ res({ aborted: true }); }, ASK_DEADLINE_MS + 1000); });
    return Promise.race([read, late]).then(function(a){ if (t) clearTimeout(t); return a; });
  }
  var STILL = { ok: false, error: "unavailable", stillReading: true, line: null, retryAfterMs: null };
  // ONE READ PER PAGE (Sam's demo orders, Oct 19 2026): views a, b and c ask for the same car with the same words; an
  // identical body shares the one answer already asked for, never a second read. A failed or still-reading answer is
  // dropped from the share, so Try again and the engine's own retry read again.
  var shared = {};
  function ask(body){
    var k = JSON.stringify(body || {});
    if (shared[k]) return shared[k];
    var p = shared[k] = ask0(body).then(function(a){ if (!a || a.ok === false || a.stillReading) delete shared[k]; return a; });
    return p;
  }
  function ask0(body){
    return ask1(body).then(function(a){
      if (!a || !a.aborted) return a;
      if (body.refine || CARS.indexOf(String(body.q || "")) < 0) return STILL;
      return fetch("/api/partnerAnswer?last=" + encodeURIComponent(body.q), { credentials: "include" }).then(function(r){ return r.json(); }).catch(function(){ return STILL; });
    });
  }
  // A read and its drawing, kept per view so Try again (and the engine's own retry) reruns exactly that read.
  var runs = {};
  // THE CHOSEN CAR FOLLOWS EVERY VIEW (Sam, Oct 18 2026: a car typed into the first screen's own box did not reach the
  // second screen). Any read that names a new car, in any view (the first screen's box, a pasted VIN, an identity
  // chip), makes it the chosen car at once: car= in the address (replaced in place), every tab, the car bar and the
  // car bar. The real listing detail belongs to the 2014 GT3 only, so another car drops it. Nothing else changes.
  var VIEW = (document.querySelector('#car-form input[name="view"]') || {}).value || "a";
  function setCar(q){
    q = String(q || "").replace(/\s+/g, " ").trim();
    if (!q || q === CAR) return;
    CAR = q; if (CAR !== CARS[0]) D = null;
    var tail = CAR === CARS[0] ? "" : "&car=" + encodeURIComponent(CAR);
    try { var u = new URL(location.href); if (tail) u.searchParams.set("car", CAR); else u.searchParams.delete("car"); u.searchParams.delete("q"); history.replaceState(history.state, "", u.pathname + u.search); } catch (e) {}
    [].forEach.call(document.querySelectorAll(".tabs a"), function(a){ var k = (String(a.getAttribute("href")).match(/view=([abc])/) || [])[1]; if (k) a.setAttribute("href", "?view=" + k + tail); });
    var ci = $("car-in"); if (ci) ci.value = CAR;
  }
  // Only a view's latest read draws (Oct 18 2026: the page's first read of the default car could land after the
  // visitor's own typed car and draw over it); an older answer is dropped, never drawn.
  var seqs = {}, coldAt = {};
  function run(view, body, draw){
    if (view !== "all" && body && body.q && !body.refine && !body.vin) setCar(body.q);
    runs[view] = function(){ run(view, body, draw); };
    var my = seqs[view] = (seqs[view] || 0) + 1;
    return ask(body).then(function(a){
      if (seqs[view] !== my) return a;
      draw(a);
      // COLD SPEC (Sam, Oct 28 2026, no dead ends): asked again every retryAfterMs for up to the engine's waitMaxMs, then the one plain line; never "try again".
      if (a && a.stillReading) {
        coldAt[view] = coldAt[view] || Date.now();
        if (a.waitMaxMs > 0 && Date.now() - coldAt[view] >= a.waitMaxMs * (Number(window.GAS_WAIT_SCALE) || 1)) { delete coldAt[view]; draw({ ok: false, error: "cold" }); }
        else if (a.retryAfterMs > 0) setTimeout(runs[view], a.retryAfterMs * (Number(window.GAS_WAIT_SCALE) || 1));
      } else delete coldAt[view];
      return a;
    });
  }
  var COULD_NOT = ${JSON.stringify(reasonLine("cold.missed"))};
  // Each refusal says what it is: the demo's daily limit for other cars, the per-minute limit, or a read that failed.
  var LIMIT = "That is today's limit for other cars here.";
  var BUSY = "Lots of reads just now. Try again in a minute.";
  // The still-reading state draws the engine's own line; when the engine named no wait, a Try again button reruns the read.
  var STILL_LINE = ${JSON.stringify(reasonLine("cold.reading"))};
  var notRead = function(a){
    if (a && a.stillReading) return esc(a.line || STILL_LINE);
    return a && a.error === "car_limit" ? LIMIT : a && a.error === "rate_limited" ? BUSY : COULD_NOT;
  };
  document.addEventListener("click", function(e){
    var b = e.target.closest && e.target.closest("[data-retry]"); if (!b) return;
    var sec = b.closest(".sec-view"), v = sec && sec.id.replace("view-", "");
    if (v && runs[v]) { b.disabled = true; runs[v](); }
  });
  // The card's footer: the credit, the Updated date (the endpoint's shared last-ingest date, none when unread) and
  // How Sam decides.
  // Panels around the shared card (This car before, the sales section): the credit and How Sam decides only; the one
  // Updated date on a view is the card's own (its read time), never a second, different date beside it.
  function foot(a){ return '<div class="gas-foot"><span><b>Powered by GoAskSam</b></span><span class="hsd">How Sam decides</span></div>'; }
  // A sale's mileage as the engine read it, or the plain words when the listing stated none.
  var milesOf = function(s){ return s && s.miles ? Number(s.miles).toLocaleString("en-US") + " miles" : "Mileage not stated"; };
  var dayLabel = function(d){ var p = String(d || "").split("-"); return p.length === 3 && MON[Number(p[1]) - 1] ? MON[Number(p[1]) - 1].slice(0, 3) + " " + Number(p[2]) + ", " + p[0] : (monthYear(d) || ""); };
  var newest = function(a){ return (a && a.sales || []).slice().sort(function(x, y){ return String(y.date || "").localeCompare(String(x.date || "")) || y.price - x.price; }); };
  // Where a figure sits against the engine's range is the ENGINE's answer (positions[], Lane B; Sam, Nov 1 2026): the page keeps no comparison of its own. A pill is drawn only from a
  // position the engine returned, with its words; no position, no pill.
  var PLACE_PILL = { below: { cls: "below", text: "below the usual range" }, within: { cls: "in", text: "inside the usual range" }, above: { cls: "above", text: "above the usual range" } };
  function posOf(a, key){ var l = a && a.positions || []; for (var i = 0; i < l.length; i++) if (l[i].key === key) return l[i]; return null; }
  function posPill(p, who){ var w = PLACE_PILL[p && p.place]; return w ? { cls: w.cls, text: (who === "reserve" ? "Your reserve is " : "Asking price is ") + w.text } : null; }
  // The car's photo (Sam, Oct 18 2026): the endpoint's carPhoto, a photo from the engine's own included sales of this
  // car, served by id; none when the engine has none, and a photo that fails to load leaves nothing behind.
  function carPhotoHtml(a){
    var p = a && a.ok !== false && a.carPhoto && a.carPhoto.photo;
    return p ? '<div class="car-photo"><img class="hero-img" data-ph src="/api/partnerAnswer?photo=' + encodeURIComponent(p) + '&w=960" alt="' + esc(CAR) + '" decoding="async" fetchpriority="high"><p class="photo-note">Photo from a recent sale of a car like this one.</p></div>' : "";
  }
  // The listing car's own photos (c9): its earlier sales' own photos, newest first, by "<VIN>-<n>" through the photo
  // path; the newest is the main photo, the rest small beside it. None stored: no gallery, never another car's photo.
  // THE MAIN PHOTO (Sam, Oct 18 2026): when this exact car has an earlier sale with a photo, its newest such sale's photo,
  // captioned "Photo from this car's sale in {Month Year}."; otherwise the photo of a car like it, captioned as such. A
  // photo of another car is never captioned as this car.
  var ownSold = function(a){ return ((a && a.history) || []).filter(function(r){ return r.result === "sold" && r.photo; }); };
  function mainPhotoHtml(a){
    var own = ownSold(a)[0];
    if (!own) return carPhotoHtml(a);
    var my = monthYear(own.date);
    return '<div class="car-photo"><img class="hero-img" data-ph src="/api/partnerAnswer?photo=' + encodeURIComponent(own.photo) + '&w=960" alt="' + esc(nameOf(a) || CAR) + '" decoding="async" fetchpriority="high"><p class="photo-note">' + (my ? "Photo from this car's sale in " + esc(my) + "." : "Photo from this car's earlier sale.") + "</p></div>";
  }
  function ownPhotos(a, thumbs){
    var ph = ownSold(a);
    if (!ph.length) return carPhotoHtml(a);
    var img = function(r, cls){ return '<img class="' + cls + '" data-ph src="/api/partnerAnswer?photo=' + encodeURIComponent(r.photo) + '&w=320" alt="' + esc(D ? D.title : CAR) + '" loading="lazy" decoding="async">'; };
    return (thumbs && ph.length > 1 ? '<div class="thumbs">' + ph.map(function(r){ return img(r, "thumb-img"); }).join("") + "</div>" : "") + '<div class="own-main">' + mainPhotoHtml(a) + "</div>";
  }
  // THE HEADING FOR A CAR GIVEN BY VIN (Sam, Oct 18 2026): the engine's name for it, the VIN small beneath; when the
  // engine cannot name it, the VIN alone.
  var VIN_RE = /^[A-HJ-NPR-Z0-9]{17}$/i;
  var nameOf = function(a){ return (a && a.carName) || null; };
  function vinHead(a, tag){
    var vin = (a && a.vin) || (VIN_RE.test(CAR) ? CAR.toUpperCase() : ""); if (!vin) return "";
    var nm = nameOf(a);
    return "<" + tag + ' class="car-name">' + esc(nm || vin) + "</" + tag + ">" + (nm ? (tag === "span" ? '<span class="vin-line">VIN ' + esc(vin) + "</span>" : '<p class="vin-line">VIN ' + esc(vin) + "</p>") : "");
  }
  function idChips(a){
    var id = a && a.identity; if (!id) return "";
    var parts = [id.year, id.make, id.generation && id.model ? id.model + " (" + id.generation + ")" : (id.model || id.generation), id.body, id.variant].filter(Boolean);
    return '<div class="chips" aria-label="The car">' + parts.map(function(p){ return '<span class="chip">' + esc(p) + "</span>"; }).join("") + "</div>";
  }
  function questionHtml(a, slot){
    var q = a && a.question; if (!q) return "";
    var opts = (q.options || []).map(function(o, i){ return '<button type="button" class="chip opt" data-slot="' + slot + '" data-send="' + esc(JSON.stringify(o.send)) + '">' + esc(o.label) + (o.count != null && !/\(\d[\d,]*\)\s*$/.test(String(o.label)) ? " (" + o.count + ")" : "") + "</button>"; }).join("");   // the engine's own chip words may carry the count already ("Carrera (14)"): never twice
    return '<p style="margin:14px 0 0;font-weight:600">' + esc(q.text || "Which one is it?") + '</p><div class="chips">' + opts + "</div>";
  }
  function rangePanel(a, opts){
    opts = opts || {};
    if (!a || a.ok === false) return '<div class="panel"><h3>What these sell for</h3><p class="muted">' + notRead(a) + "</p>" + foot(a) + "</div>";
    if (a.question) return '<div class="panel"><h3>What these sell for</h3>' + idChips(a) + questionHtml(a, opts.slot || "") + foot(a) + "</div>";
    // The shared card (lib/sellsForCard.js, rendered by the endpoint): this page only fills its pill slot. The card has
    // pill slot in every case (Lane A's 3e8445d6), so every pill, the grey no-range one too, sits where the card puts it.
    if (a.card) {
      var pl = opts.pos ? posPill(opts.pos, opts.who) : null, ph = (pl ? '<p class="pillrow"><span class="pill ' + pl.cls + '">' + esc(pl.text) + "</span></p>" : "") + (opts.underPill || "");
      return (opts.chips ? idChips(a) : "") + (a.card.indexOf('<div class="gas-pill-slot"></div>') >= 0 ? a.card.replace('<div class="gas-pill-slot"></div>', ph) : a.card + ph) + (opts.lines ? linesHtml(opts.lines) : "");
    }
    var pl0 = opts.pos ? posPill(opts.pos, opts.who) : null, pill = pl0 ? '<p class="pillrow"><span class="pill ' + pl0.cls + '">' + esc(pl0.text) + "</span></p>" : "";
    var body = a.range
      ? '<p class="range">' + usd(a.range.low) + " to " + usd(a.range.high) + "</p>" + pill + '<p class="sub">The typical range, from ' + a.count + " " + plural(a.count, "sale", "sales") + "" + ".</p>"
      : '<p class="sub">' + (a.thin ? esc(a.thin) : COULD_NOT) + "</p>" + pill;   // never an empty panel: a range, the engine's thin or refusal line, else the one plain line the engine registers for a read that gave nothing (Oct 31 2026, the blank 2025 911 card)
    var aside = a.setAside && a.setAside.total ? '<p class="note">' + a.setAside.total + " more set aside" + (a.setAside.reasons ? " (" + Object.keys(a.setAside.reasons).map(function(k){ return a.setAside.reasons[k] + " " + esc(k); }).join(", ") + ")" : "") + ".</p>" : "";
    return '<div class="panel"><h3>What these sell for</h3>' + (opts.chips ? idChips(a) : "") + body + aside + foot(a) + "</div>";
  }
  // THIS EXACT CAR SOLD BEFORE (Sam, Oct 18 2026, stage 4): when the car's VIN or chassis number matched earlier sales
  // in the archive (the endpoint's history), every sale, newest first, at the top of the answer: its own photo, the
  // month and year, the price and the mileage at that sale. Venue-blind: no venue name and no link (Sam's answer).
  var soldRows = function(a){ return ((a && a.history) || []).filter(function(r){ return r.result === "sold" && r.price; }); };
  // (Sam, Oct 18 2026) On the listing view it sits directly under the car's own listing details, above the range card;
  // when the exact car has no earlier sale it is one plain line that takes no room. Never an invented row.
  function priorPanel(a, exact){
    var sold = soldRows(a);
    if (!sold.length) return exact && a && a.ok !== false && !a.question ? '<p class="prior-none">No earlier sale of this car on record.</p>' : "";
    var last = sold[0], my = monthYear(last.date);
    return '<div class="panel prior"><h3>This car last sold for ' + usd(last.price) + (my ? " in " + esc(my) : "") + ".</h3>" + '<div class="slist">' +
      sold.map(function(r){ return '<div class="srow">' + photoSlot(r) + '<div class="sinfo"><div class="st">Sold ' + esc(monthYear(r.date) || "") + '</div><div class="sd">' + esc(r.miles ? Number(r.miles).toLocaleString("en-US") + " miles at that sale" : "Mileage not stated at that sale") + '</div></div><div class="sp">' + usd(r.price) + "</div></div>"; }).join("") +
      "</div>" + foot(a) + "</div>";
  }
  function historyPanel(a){
    if ((!a || a.ok === false) && !(a && a.history && a.history.length)) return '<div class="panel"><h3>This car before</h3><p class="muted">' + notRead(a) + "</p>" + foot(a) + "</div>";   // a failed read never claims the car has no history
    var h = a && a.history;
    var rows = h && h.length ? '<ul class="hist">' + h.map(function(r){
      var right = r.result === "sold" ? (r.price ? "Sold for " + usd(r.price) : "Sold") : (r.highBid ? "Offered, not sold. High bid " + usd(r.highBid) : "Offered, not sold");
      return "<li><span>" + esc(monthYear(r.date)) + (r.miles ? '<br><span class="muted" style="font-size:14px">' + Number(r.miles).toLocaleString("en-US") + " miles</span>" : "") + '</span><span class="r">' + esc(right) + "</span></li>"; }).join("") + "</ul>"
      : '<p class="muted">No earlier sale or listing of this car on record.</p>';
    return '<div class="panel"><h3>This car before</h3>' + rows + foot(a) + "</div>";
  }
  // THE SALES LIST (Sam, Oct 18 2026), views a and d: the answer's own included sales (the engine's cards, never a
  // set-aside one), newest first, ten at a time with Show more from the same answer (no request, no new number). Each
  // row: a photo in a fixed slot (/api/partnerAnswer?photo=<id>, lazy; a neutral tile when there is none or it fails), the
  // engine row's own title, the sale date, mileage and price. Rows are not links. Set-aside sales, if the engine sent any,
  // sit in their own small group below with the engine's own reason words.
  var LIST_STEP = 10, lists = {};
  function photoSlot(s){ return '<div class="sph">' + (s && s.photo ? '<img data-ph src="/api/partnerAnswer?photo=' + encodeURIComponent(s.photo) + '&w=320" alt="" width="160" height="120" loading="lazy" decoding="async">' : "") + "</div>"; }
  // "This car" (Sam, Oct 18 2026): a row of the sales list that is one of this exact car's own earlier sales, matched on
  // date and price against the same history rows the earlier-sales panel draws (no second lookup).
  var thisKeys = {};
  var keysOf = function(a){ var k = {}; ((a && a.history) || []).forEach(function(r){ if (r.result === "sold" && r.price && r.date) k[r.date + "|" + Math.round(r.price)] = 1; }); return k; };
  function saleRow(s, reason, keys){
    var mine = keys && s.date && keys[s.date + "|" + Math.round(s.price)];
    return '<div class="srow">' + photoSlot(s) + '<div class="sinfo"><div class="st">' + esc(s.name || "") + (mine ? ' <span class="tag-this">This car</span>' : "") + '</div><div class="sd">Sold ' + esc(dayLabel(s.date)) + '</div><div class="sd">' + esc(milesOf(s)) + "</div>" +
      (reason ? '<div class="sr">' + esc(reason.charAt(0).toUpperCase() + reason.slice(1)) + "</div>" : "") + '</div><div class="sp">' + usd(s.price) + "</div></div>";
  }
  function listHead(slot){ var n = $("sl-" + slot) ? $("sl-" + slot).children.length : 0; return "The most recent " + (n < 10 ? ["zero","one","two","three","four","five","six","seven","eight","nine"][n] : n) + " " + plural(n, "sale", "sales") + " behind this answer, newest first."; }
  function salesList(a, slot){
    if (!a || a.ok === false) return '<p class="muted">' + notRead(a) + "</p>";
    if (a.question || !a.sales || !a.sales.length) return '<p class="muted">' + esc((a && a.thin) || "No recorded sales of cars like this yet.") + "</p>";
    var rows = newest(a); lists[slot] = rows; thisKeys[slot] = keysOf(a);
    var shown = rows.slice(0, LIST_STEP), n = shown.length;
    var aside = (a.asideRows || []).slice().sort(function(x, y){ return String(y.date || "").localeCompare(String(x.date || "")); });
    return '<p class="sub sl-head" id="slh-' + slot + '">The most recent ' + (n < 10 ? ["zero","one","two","three","four","five","six","seven","eight","nine"][n] : n) + " " + plural(n, "sale", "sales") + " behind this answer, newest first.</p>" +
      '<div class="slist" id="sl-' + slot + '">' + shown.map(function(s){ return saleRow(s, null, thisKeys[slot]); }).join("") + "</div>" +
      (rows.length > LIST_STEP ? '<p class="morewrap"><button type="button" class="more" data-more="' + slot + '">Show more</button></p>' : "") +
      (aside.length ? '<details class="aside-grp"><summary>' + esc(a.asideLine || ((aside.length < 10 ? ["zero","one","two","three","four","five","six","seven","eight","nine"][aside.length] : aside.length) + " " + plural(aside.length, "sale", "sales") + " set aside")) + '</summary><p class="sub">Not part of the answer above.</p><div class="slist">' + aside.map(function(s){ return saleRow(s, s.reason); }).join("") + "</div></details>" : "");
  }
  document.addEventListener("click", function(e){
    var m = e.target.closest && e.target.closest("[data-more]"); if (!m) return;
    var slot = m.getAttribute("data-more"), box = $("sl-" + slot), rows = lists[slot] || []; if (!box) return;
    var have = box.children.length;
    box.insertAdjacentHTML("beforeend", rows.slice(have, have + LIST_STEP).map(function(s){ return saleRow(s, null, thisKeys[slot]); }).join(""));
    $("slh-" + slot).textContent = listHead(slot);
    if (box.children.length >= rows.length) m.parentNode.removeChild(m);
  });
  // A photo that does not load leaves the plain neutral tile, never a broken image.
  document.addEventListener("error", function(e){ var t = e.target; if (t && t.tagName === "IMG" && t.hasAttribute("data-ph")) { var box = t.closest(".car-photo"); (box || t).parentNode.removeChild(box || t); } }, true);
  // THE NARROWING LINES (Sam, Oct 18 2026): Market Check's own "Which M3? Convertible (9) · Coupe (3)" lines, from the
  // engine's fields (a.lines, api/partnerAnswer.js linesOf). An option reruns the same query with that refine; once
  // chosen, the line stays, the choice in plain ink, with "Any (N)" back to the unsplit answer (N the engine's count).
  var idState = { a: null, b: null, c: null };
  function noteLines(slot, a){ var st = idState[slot]; if (st && st.refining) { st.refining = false; return; } idState[slot] = { q: a && a.query, lines: (a && a.lines) || [], chosen: null }; }
  function linesHtml(slot){
    var st = idState[slot]; if (!st || !st.lines.length) return "";
    return st.lines.map(function(l){
      var hasChosen = st.chosen && st.chosen.key === l.key;
      var items = l.options.map(function(o){
        var lab = esc(o.label) + " (" + Number(o.n).toLocaleString("en-US") + ")";
        return hasChosen && String(st.chosen.value) === String(o.value) ? '<span class="idl chosen">' + lab + "</span>" : '<button type="button" class="idl" data-idopt="' + slot + '" data-key="' + esc(l.key) + '" data-val="' + esc(o.value) + '">' + lab + "</button>";
      });
      if (hasChosen && l.any != null) items.push('<button type="button" class="idl" data-idopt="' + slot + '" data-key="' + esc(l.key) + '" data-val="">Any (' + Number(l.any).toLocaleString("en-US") + ")</button>");
      return '<p class="idline">' + (l.lead ? esc(l.lead) + " " : "") + items.join(" &middot; ") + "</p>";
    }).join("");
  }
  document.addEventListener("click", function(e){
    var b = e.target.closest && e.target.closest("[data-idopt]"); if (!b) return;
    var slot = b.getAttribute("data-idopt"), key = b.getAttribute("data-key"), val = b.getAttribute("data-val"), st = idState[slot]; if (!st) return;
    st.chosen = val ? { key: key, value: val } : null; st.refining = true;
    var send = { q: st.q || CAR }; if (val) { send.refine = {}; send.refine[key] = val; }
    if (slot === "a") return runA(send);
    if (slot === "b") { bSend = send; $("b-out").innerHTML = '<p class="loading">${reasonLine("cold.reading")}</p>'; return bRead(false); }
    if (slot === "c") return run("c", D ? Object.assign({ vin: D.vin, prices: { item_price: D.price } }, send) : send, drawListing);
  });
  // ---- view a: before listing
  var aLast = null;
  function drawA(a){
    noteLines("a", a);
    aLast = a;
    if (a.ok === false) { $("a-out").innerHTML = rangePanel(a, { slot: "a" }); return; }
    // (Sam, Oct 18 2026) Once a car is in, the page's heading names it: the engine's name for a VIN (the VIN small
    // beneath), else the engine's identity of the car, else the words as typed.
    var idn = a.identity ? [a.identity.year, a.identity.make, a.identity.model, a.identity.variant].filter(Boolean).join(" ") : "";
    $("a-head").textContent = a.vin ? (nameOf(a) || a.vin) : (idn || a.query || CAR);
    $("a-vin").hidden = !(a.vin && nameOf(a)); $("a-vin").textContent = a.vin && nameOf(a) ? "VIN " + a.vin : "";
    $("a-out").innerHTML = (a.question ? "" : priorPanel(a, !!a.vin)) + (a.question ? "" : mainPhotoHtml(a)) + (a.question ? rangePanel(a, { slot: "a", chips: true }) : (idChips(a) ? '<div style="margin:0 0 16px">' + idChips(a) + "</div>" : "") + rangePanel(a, { lines: "a" })) + ((a.vin || (a.history && a.history.length)) && !soldRows(a).length ? historyPanel(a) : "") +
      (!a.question && a.sales && a.sales.length ? '<section class="full-a"><h2>What cars like this sold for</h2>' + salesList(a, "a") + "</section>" : "") +
      '<div style="margin-top:20px"><button type="button" class="btn pri" id="a-list">List it</button></div>';
  }
  function runA(body){ $("a-out").innerHTML = '<p class="loading">${reasonLine("cold.reading")}</p>'; run("a", body, drawA); }
  // ---- view b: the listing form (Sam, Nov 1 2026). Format, duration and the price fields of a marketplace form, and the GoAskSam card beside them. The page sends the car, the mileage, the order
  // and the typed prices; the ENGINE answers the range, the position of each price (positions[]) and the five sales in that order (sales[], order). The page compares nothing and sorts nothing.
  var bAns = null, bOrder = null;
  var B_KEYS = { auction: [["start", "starting_bid", "S", "Starting bid"], ["reserve", "reserve", "R", "Reserve"], ["bin", "buy_it_now", "B", "Buy It Now"]], fixed: [["price", "item_price", "P", "Item price"]] };
  var B_DUR = { auction: ["7 days", "3 days", "5 days", "10 days"], fixed: ["30 days", "Good \u2019Til Cancelled"] };
  var PLACE_WORDS = { below: "Below the range", within: "Within the range", above: "Above the range" };
  var B_ORDERS = [["miles", "Closest miles"], ["date", "Newest"], ["price", "Highest price"]];
  var wholeOf = function(v){ var n = Math.round(Number(String(v == null ? "" : v).replace(/[^\d]/g, ""))); return n > 0 ? n : null; };
  var bFmt = function(){ return $("b-format").value === "fixed" ? "fixed" : "auction"; };
  // The page's first read: views b and c send the SAME body, so they share one read (ask() keys on it). The listing car carries its price as item_price; the order is newest first.
  function plainBody(){ var b = { q: CAR }; if (D) b.vin = D.vin; b.order = "date"; if (D) b.prices = { item_price: D.price }; return b; }
  var bTouched = false;
  // The engine's own choice (a body, trim, gearbox or model option it offered) rides with everything the visitor typed: the choice never drops a price, the mileage or the order.
  var bSend = null;
  function bBody(){
    if (!bTouched && !bSend) return plainBody();
    var body = { q: CAR }; if (bSend) { for (var sk in bSend) body[sk] = bSend[sk]; } if (D) body.vin = D.vin;
    var mi = wholeOf($("b-miles").value); if (mi) body.mileage = mi;
    body.order = bOrder || (mi ? "miles" : "date");
    var pr = {}; B_KEYS[bFmt()].forEach(function(k){ var n = wholeOf($("b-" + k[0]).value); if (n) pr[k[1]] = n; });
    if (Object.keys(pr).length) body.prices = pr;
    return body;
  }
  function bRead(touch){ if (touch) bTouched = true; run("b", bBody(), gotB); }
  function gotB(a){ bAns = a; noteLines("b", a); if (!D && $("b-name") && VIN_RE.test(CAR)) $("b-name").innerHTML = vinHead(a, "span"); else if ($("b-name")) $("b-name").textContent = (nameOf(a) || (D ? D.title : CAR)); drawB(); }
  var B_CAP = { miles: "Closest to the mileage entered for this car", date: "Most recent first", price: "Highest price first" };
  // photo, car name, date, miles and price only (Sam, Nov 1 2026): no link and no venue on a sale row; the name is the engine's venue-safe name and prints nothing when it is empty; a tile only for a photo that loads
  function saleRows(rows){
    return rows.map(function(s){
      var th = s.photo ? '<span class="th"><img src="/api/partnerAnswer?photo=' + encodeURIComponent(s.photo) + '&w=320" alt="" decoding="async" onerror="this.parentNode.remove()"></span>' : "";   // the engine's photo id, served by the partner endpoint; a photo that does not load leaves no tile and no stand-in
      var meta = [s.date ? dayLabel(s.date) : "", s.miles ? Number(s.miles).toLocaleString("en-US") + " miles" : ""].filter(Boolean).join(" \u00b7 ");
      return '<li class="' + (s.photo ? "has-th" : "no-th") + '">' + th + (s.name ? '<span class="d">' + esc(s.name) + "</span>" : "") + '<span class="p">' + usd(s.price) + '</span><span class="m">' + meta + "</span></li>";
    }).join("");
  }
  function orderToggle(a){
    return '<div class="tog" role="group" aria-label="Order the sales">' + B_ORDERS.map(function(o){ return '<button type="button" data-order="' + o[0] + '" aria-pressed="' + (a.order === o[0]) + '">' + o[1] + "</button>"; }).join("") + "</div>";
  }
  function bSales(a){
    var rows = a.placedSales || [];
    if (!rows.length || a.order == null) return "";
    return '<div class="sales"><div class="sales-head"><h4>Recent sales</h4>' + orderToggle(a) + '</div><div class="cap" style="margin:0 0 6px">' + B_CAP[a.order] + '</div><ul class="slist">' + saleRows(rows) + '</ul><a class="all" href="?view=a&car=' + encodeURIComponent(CAR) + '">See all sales for this car</a></div>';
  }
  // ---- an answer that prices apart (Lane B lane-b-apart, Nov 1 2026): no one range, so perOption carries each option's OWN range, the place of each typed price against it and its five sales in the asked order.
  // Everything below is the engine's: the labels, counts, ranges, places and sales. The page only lays the options side by side; it places, sorts and sums nothing.
  var FEW = '${reasonLine("thin.few_sales")}';   // the engine's own words for an option with too few sales for a range
  function optPos(o, key){ var l = o && o.positions || []; for (var i = 0; i < l.length; i++) if (l[i].key === key) return l[i]; return null; }
  function drawApart(a){
    var out = $("b-out"), po = a.perOption, keys = B_KEYS[bFmt()];
    out.className = "sam apart";
    var cols = po.options.map(function(o){
      var h = '<div class="aopt"><h4>' + esc(o.label) + (o.n != null ? " (" + Number(o.n).toLocaleString("en-US") + ")" : "") + "</h4>";
      if (!o.range) return h + '<p class="few">' + FEW + "</p></div>";
      h += '<div class="range">' + usd(o.range.low) + " to " + usd(o.range.high) + "</div>";
      var lg = "";
      keys.forEach(function(k){
        if (!wholeOf($("b-" + k[0]).value)) return;   // a line only for a price the visitor typed in this field
        var p = optPos(o, k[1]); if (!p) return;
        var w = PLACE_WORDS[p.place]; if (!w) return;
        lg += '<li><span class="dot">' + k[2] + "</span><span>" + k[3] + " <b>" + usd(p.value) + "</b>. " + w + ".</span></li>";
      });
      if (lg) h += '<ul class="legend">' + lg + "</ul>";
      var rows = o.placedSales || [];
      if (rows.length) h += '<ul class="slist">' + saleRows(rows) + "</ul>";   // an option whose sales are not listed carries none: its positions stand alone, with no words of the page's own
      return h + "</div>";
    }).join("");
    var fm = po.forMileage && po.forMileage.line ? '<p class="cap">' + esc(po.forMileage.line) + "</p>" : "";
    var anyRows = po.options.some(function(o){ return (o.placedSales || []).length; });
    var head = anyRows && a.order != null ? '<div class="sales-head"><h4>Recent sales</h4>' + orderToggle(a) + '</div><div class="cap">' + B_CAP[a.order] + "</div>" : "";
    var hint = !hasTyped() ? '<p class="cap">Type a price and Sam shows where it sits against each range.</p>' : "";
    out.innerHTML = "<h3>What these sell for</h3>" + '<div class="car">' + esc(nameOf(a) || CAR) + "</div>" + fm + hint + head + '<div class="aopts">' + cols + "</div>" + '<div class="foot"><strong>Powered by GoAskSam</strong><span>How Sam decides</span></div>';
    $("view-b").classList.add("apart");
  }
  function drawB(){
    var a = bAns, out = $("b-out"); if (!a) return;
    $("view-b").classList.remove("apart");
    ["start", "reserve", "bin", "price"].forEach(function(id){ var e = document.querySelector('.rel[data-for="' + id + '"]'); if (e) e.textContent = ""; });
    if (!a.question && a.ok !== false && !a.range && a.perOption && Array.isArray(a.perOption.options) && a.perOption.options.length) { drawApart(a); return; }
    if (a.question || a.ok === false || !a.range) { out.className = "plain"; out.innerHTML = rangePanel(a, { slot: "b" }) + (a.question ? "" : pickHtml()); return; }   // a car the engine reads as separate markets (coupes and cabriolets) has no one range: the engine's own choice is offered, and the typed prices go with it
    out.className = "sam";
    var keys = B_KEYS[bFmt()], got = a.positions || [], sp = a.span;
    var geo = function(v){ return sp ? "clamp(0%, calc(" + ((v - sp.low) / (sp.high - sp.low) * 100).toFixed(2) + "%), 100%)" : null; };   // layout only: where a figure falls on the bar's own ends; CSS clamps it to the bar
    var marks = "", legend = "";
    keys.forEach(function(k){
      if (!wholeOf($("b-" + k[0]).value)) return;   // a line only for a price the visitor typed in this field
      var p = posOf(a, k[1]); if (!p) return;
      var w = PLACE_WORDS[p.place]; if (!w) return;
      var rel = document.querySelector('.rel[data-for="' + k[0] + '"]'); if (rel) rel.textContent = w + ".";
      if (sp) marks += '<div class="mk" style="left:' + geo(p.value) + '">' + k[2] + "</div>";
      legend += '<li><span class="dot">' + k[2] + "</span><span>" + k[3] + " <b>" + usd(p.value) + "</b>. " + w + ".</span></li>";
    });
    if (!legend && !got.length && !hasTyped()) legend = '<li><span class="empty">Type a price and Sam shows where it sits against the range.</span></li>';
    var bar = sp ? '<div class="bar" aria-hidden="true"><div class="mid" style="left:' + geo(a.range.low) + ";width:calc(" + geo(a.range.high) + " - " + geo(a.range.low) + ')"></div>' + marks + '</div><div class="ends"><span>Lowest sale ' + usd(sp.low) + "</span><span>Highest sale " + usd(sp.high) + "</span></div>" : "";
    out.innerHTML = "<h3>What these sell for</h3>" + '<div class="car">' + esc(nameOf(a) || CAR) + '</div><div class="range">' + usd(a.range.low) + " to " + usd(a.range.high) + '</div><div class="cap">The middle half of completed sales</div>' + bar +
      (legend ? '<ul class="legend">' + legend + "</ul>" : "") + bSales(a) + '<div class="foot"><strong>Powered by GoAskSam</strong><span>How Sam decides</span></div>' + (idState.b && idState.b.chosen ? pickHtml() : "");
  }
  function pickHtml(){ var h = linesHtml("b"); return h ? '<div class="bpick">' + h + "</div>" : ""; }
  function hasTyped(){ return B_KEYS[bFmt()].some(function(k){ return wholeOf($("b-" + k[0]).value); }); }
  function bFormat(){
    var f = bFmt(); $("b-auction").hidden = f !== "auction"; $("b-fixed").hidden = f !== "fixed";
    $("b-durlab").textContent = f === "auction" ? "Auction duration" : "Duration";
    $("b-duration").innerHTML = B_DUR[f].map(function(t){ return "<option>" + t + "</option>"; }).join("");
    if (bAns) drawB();
  }
  // ---- view c: the listing (Sam, Oct 18 2026: c and d are one page; the card under the buy box, the sales list and
  // "This car before" under the gallery, once)
  var cAns = null;
  // THE SAMPLE ASKING PRICE (Sam's demo orders, Oct 19 2026): demo chrome on a sample listing only, never fed into the
  // card or any engine output. A round figure inside the engine's own range: the range's low end rounded up to the next
  // $10,000, else $5,000, else $1,000, the first that stays inside. No range (thin, or the engine asks a question first):
  // no price and no buttons.
  function samplePrice(a){
    if (!a || a.ok === false || a.question || !a.range || !(a.range.low > 0) || !(a.range.high >= a.range.low)) return null;
    var steps = [10000, 5000, 1000];
    for (var i = 0; i < steps.length; i++) { var p = Math.ceil(a.range.low / steps[i]) * steps[i]; if (p <= a.range.high) return p; }
    return null;
  }
  function sampleBuy(a){
    var p = samplePrice(a); if (p == null) return "";
    return '<div class="price">US ' + usd(p) + '</div><p class="price-kind">Sample asking price</p>' +
      '<div class="buy"><button type="button" class="btn pri blk">Buy It Now</button><button type="button" class="btn sec blk">Make offer</button><button type="button" class="btn sec blk">Save</button></div>';
  }
  function drawListing(a){
    cAns = a; noteLines("c", a);
    if (!D && $("c-sample")) $("c-sample").innerHTML = sampleBuy(a);
    if (!D && $("c-photo")) $("c-photo").innerHTML = mainPhotoHtml(a);
    if (!D && $("c-name") && VIN_RE.test(CAR)) $("c-name").innerHTML = vinHead(a, "span");
    if (D && $("own-gal")) $("own-gal").innerHTML = ownPhotos(a, true);
    $("c-rail").innerHTML = (D ? priorPanel(a, true) : "") + rangePanel(a, D ? { pos: posOf(a, "item_price"), slot: "c", lines: "c" } : { slot: "c", lines: "c" });
    var lq = a && a.range && a.trend && a.trend.length ? a.trend.reduce(function(m, t){ return String(t.period) > String(m.period) ? t : m; }) : null;   // the latest quarter with eight or more sales, view d only
    $("d-sales").innerHTML = '<h2>What cars like this sold for</h2>' +
      (a && a.card ? (a.quarter ? '<div class="qrow">' + a.quarter + "</div>" : "") : (lq ? '<p class="qrow"><b>' + esc(lq.period.replace("-", " ")) + "</b> " + usd(lq.low) + " to " + usd(lq.high) + ", " + lq.count + " sales</p>" : "")) + salesList(a, "d") + foot(a);
    // Offered but never sold: those appearances stay in This car before, lower down; a car that sold shows them nowhere twice.
    $("d-hist").innerHTML = D && !soldRows(a).length && (a.history || []).some(function(r){ return r.result === "not_sold"; }) ? historyPanel(a) : "";
  }
  document.addEventListener("click", function(e){
    var b = e.target.closest && e.target.closest("[data-send]"); if (!b) return;
    var send = JSON.parse(b.getAttribute("data-send")), slot = b.getAttribute("data-slot");
    if (slot === "a") return runA(send);
    if (slot === "b") { bSend = send; $("b-out").innerHTML = '<p class="loading">${reasonLine("cold.reading")}</p>'; return bRead(false); }
    if (slot === "c") return run("c", D ? Object.assign({ vin: D.vin, prices: { item_price: D.price } }, send) : send, drawListing);
  });
  document.addEventListener("click", function(e){ if (e.target && e.target.id === "a-list") e.preventDefault(); });   // the demo's List it does nothing
  $("a-form").addEventListener("submit", function(e){ e.preventDefault(); var v = String($("a-q").value || "").trim(); if (v) runA({ q: v }); });
  $("b-format").addEventListener("change", function(){ bFormat(); bRead(true); });
  // A price or the mileage is READ when it is committed (leaving the field, or Return), once, never per keystroke (Sam, Nov 1 2026). The field still formats as it is typed.
  ["b-start", "b-reserve", "b-bin", "b-price", "b-miles"].forEach(function(id){
    var el = $(id);
    el.addEventListener("input", function(){ var d = String(this.value || "").replace(/[^\d]/g, "").slice(0, 9); this.value = d ? Number(d).toLocaleString("en-US") : ""; });
    el.addEventListener("change", function(){ bRead(true); });
    el.addEventListener("keydown", function(e){ if (e.key === "Enter") { e.preventDefault(); this.blur(); } });   // Return commits: blur fires the one change
  });
  document.addEventListener("click", function(e){ var t = e.target.closest && e.target.closest("[data-order]"); if (!t) return; bOrder = t.getAttribute("data-order"); bRead(true); });
  bFormat();
  // (Sam, Oct 18 2026) View a opens empty when no car has been chosen: no read until the visitor submits one. Views b and
  // c start on the listing car (the 2014 GT3) when none has been chosen, and follow the chosen car when one has.
  var pre = new URLSearchParams(location.search).get("q") || (CHOSEN ? CAR : ""); $("a-q").value = pre;
  if (VIEW !== "a" || CHOSEN || pre) {
    bRead();   // the first read of the chosen car, with the default order
    run("c", plainBody(), drawListing);
    if (pre) runA(pre === CAR ? plainBody() : { q: pre });   // the same body as views b and c when it is the chosen car: one read for the page
  }
})();
`;

function phs(n) { let s = ""; for (let i = 0; i < n; i++) s += '<div class="ph" aria-hidden="true">Photo</div>'; return s; }

// The selected car (Sam, Oct 18 2026): car=<any year, make and model>, or a quick pick's number (0 to 5, the demo's six
// cars, api/partnerAnswer.js DEMO_CARS); the 2015 GT3 when absent or not plain car words. Only the 2015 GT3 carries
// listing detail (DUMMY); no other car gets an invented listing, mileage, price or photo.
export function carOf(v) {
  const t = String(v == null ? "" : v).replace(/\s+/g, " ").trim();
  if (/^\d$/.test(t) && Number(t) < DEMO_CARS.length) return DEMO_CARS[Number(t)];
  const hit = DEMO_CARS.find(c => c.toLowerCase() === t.toLowerCase()) || (t.toUpperCase() === DUMMY.vin ? DUMMY.q : null);
  // Any letters (accented too), digits and the usual punctuation of a car name (Sam, Oct 18 2026: "Citroën DS" or a
  // comma fell back to the GT3); anything else opens the 2015 GT3. The text is escaped wherever it is shown.
  return hit || (/^[\p{L}\p{N}][\p{L}\p{N} .,'&/()+-]{1,59}$/u.test(t) && /\p{L}/u.test(t) ? t : DEMO_CARS[0]);
}
const escHtml = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
export function pageHtml(view, carIn) {
  const v = view === "d" ? "c" : (/^[abc]$/.test(view || "") ? view : "a");   // the old d address opens the merged listing
  const chosen = String(carIn == null ? "" : carIn).trim() !== "";   // a car the visitor chose; else view a opens empty
  const car = carOf(carIn), hasListing = car === DUMMY.q;
  const carQ = k => `?view=${k}${car === DEMO_CARS[0] ? "" : "&car=" + encodeURIComponent(car)}`;
  const tab = (k, label) => `<a href="${escHtml(carQ(k))}"${k === v ? ' aria-current="page"' : ""}>${label}</a>`;
  // The car bar, on every view: any year, make and model. A new car reopens the
  // same view for that car (a plain form, no script needed).
  // (Sam, Oct 18 2026, for the eBay showing: the six example chips are gone at every width; the car box stays.)
  const carBar = `<div class="carbar"><div class="wrap"><form class="carpick" id="car-form" method="get" action="/preview"><input type="hidden" name="view" value="${v}"><label for="car-in">Car</label><input id="car-in" name="car" value="${chosen ? escHtml(car) : ""}" autocomplete="off" maxlength="60" placeholder="Type your car or paste a VIN"><button class="btn sec" type="submit">Show</button></form></div></div>`;
  const d = DUMMY, miles = d.miles.toLocaleString("en-US");
  // The listing car's own photos (c9): drawn by the page from its earlier sales' own photos once the answer is in.
  const listing = (withRail, withHero, below) => `
  <div class="listing${below ? " with-below" : ""}">
    <div>
      <div class="gal gal-own" id="own-gal"></div>
      <div class="phone-only"></div>
    </div>
    <div class="rail">
      <h1>${d.title}</h1><p class="vin-line">VIN ${d.vin}</p>
      <p class="sub">${miles} miles</p>
      <hr>
      <div class="price">US ${"$" + d.price.toLocaleString("en-US")}</div>
      <div class="buy"><button type="button" class="btn pri blk">${d.priceKind}</button><button type="button" class="btn sec blk">Make offer</button><button type="button" class="btn sec blk">Save</button></div>
      ${withRail ? `<div id="c-rail"><p class="loading">${reasonLine("cold.reading")}</p></div>` : ""}
    </div>
    ${below ? `<div class="below-gal">${below}</div>` : ""}
  </div>`;
  // THE SAMPLE LISTING (Sam's demo orders, Oct 19 2026; replaces the Oct 18 "no listing detail" layout): every other car
  // shows the same listing frame as the 2014 GT3, labelled "Sample listing" beside the title so a screenshot cannot pass
  // for a real listing. No VIN, no mileage, no "This car last sold". Its photo is a recent sale's, captioned as such. The
  // sample asking price and the buttons are drawn by the client from the engine's range (#c-sample, demo chrome that feeds
  // nothing); a car with no range (thin, or a question first) shows no price and no buttons.
  const sy = /^(\d{4})\b/.exec(car), sampleYear = sy ? sy[1] : null;
  const sampleDesc = sampleYear ? `<div class="desc below"><h2>About this car</h2><dl class="specs"><div><dt>Year</dt><dd>${sampleYear}</dd></div></dl></div>` : "";
  const noListing = `
  <div class="listing with-below">
    <div><div id="c-photo"></div></div>
    <div class="rail">
      <h1 id="c-name">${escHtml(car)}</h1><p class="sample-tag">Sample listing</p>
      <hr>
      <div id="c-sample"></div>
      <div id="c-rail"><p class="loading">${reasonLine("cold.reading")}</p></div>
    </div>
    <div class="below-gal">${sampleDesc}<div class="full" id="d-sales"><p class="loading">${reasonLine("cold.reading")}</p></div><div class="full" id="d-hist"></div></div>
  </div>`;
  const desc = `<div class="desc below"><h2>About this car</h2><dl class="specs"><div><dt>Year</dt><dd>${d.year}</dd></div><div><dt>Mileage</dt><dd>${miles}</dd></div></dl></div>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="robots" content="noindex,nofollow"><title>What these sell for</title><style>${CSS}${SELLS_FOR_CARD_CSS}</style></head><body>
<div class="demo-bar"><div class="wrap"><span>What these sell for, powered by GoAskSam.</span><nav class="tabs" aria-label="Views">${tab("a", "a. Before listing")}${tab("b", "b. Setting a reserve")}${tab("c", "c. On the listing")}</nav></div></div>
${carBar}
<header class="top"><div class="wrap"><div class="plogo"><span class="plogo-frame"><img src="/preview?img=logo" alt="eBay" width="150" height="150" decoding="async"></span><span class="prep">Prepared for eBay</span></div><div class="sbox">Search</div><button type="button" class="btn sec sbtn">Search</button></div></header>
<main>
<section class="sec-view wrap" id="view-a"${v === "a" ? "" : " hidden"}>
  <div class="lead"><h1 id="a-head">What have cars like yours sold for?</h1><p class="vin-line" id="a-vin" hidden></p>
  <form class="ask" id="a-form"><input id="a-q" name="q" autocomplete="off" placeholder="Type your car or paste a VIN" aria-label="Car or VIN"><button class="btn pri" type="submit">Check</button></form>
  <div id="a-out" style="margin-top:22px"></div></div>
</section>
<section class="sec-view wrap" id="view-b"${v === "b" ? "" : " hidden"}>
  <div class="lf">
  <h1>Look up your vehicle</h1>
  <p class="lede">Save time by entering your license plate or VIN first, and we'll fill in the rest of your listing details.</p>
  <div class="lf-row"><label class="lab" for="b-plate">License plate</label><div class="ctl"><select aria-label="State" disabled><option>State</option></select><input id="b-plate" type="text" placeholder="Plate number" autocomplete="off"><button class="btn-off" type="button" disabled>Look up</button></div></div>
  <div class="lf-or">OR</div>
  <div class="lf-row"><label class="lab" for="b-vin">VIN</label><div class="ctl"><input id="b-vin" type="text" placeholder="Vehicle Identification Number" autocomplete="off" style="min-width:min(100%,320px)"><button class="btn-off" type="button" disabled>Look up</button></div></div>
  <div class="found"><span class="tick" aria-hidden="true">&#10003;</span> <span id="b-name">${hasListing ? `${d.title}` : escHtml(car)}</span></div>
  <div class="lf-row"><label class="lab" for="b-miles">Mileage <small>(optional)</small></label><div class="ctl"><input id="b-miles" type="text" inputmode="numeric" placeholder="Miles" autocomplete="off" aria-label="Mileage in miles"></div></div>
  <hr>
  <h2>Listing format &amp; pricing</h2>
  <p class="sub">Set your listing format and prices.</p>
  <div class="split">
    <div class="fields">
      <div class="field"><label for="b-format">Format</label><select id="b-format"><option value="auction">Auction</option><option value="fixed">Buy It Now / Fixed Price</option></select></div>
      <div class="field"><label for="b-duration" id="b-durlab">Auction duration</label><select id="b-duration"></select></div>
      <div id="b-auction" class="fields">
        <div class="two">
          <div class="field"><label for="b-start">Starting bid</label><div class="mny"><span>$</span><input id="b-start" type="text" inputmode="numeric" autocomplete="off"></div><div class="rel" data-for="start"></div></div>
          <div class="field"><label for="b-bin">Buy It Now <small>(optional)</small></label><div class="mny"><span>$</span><input id="b-bin" type="text" inputmode="numeric" autocomplete="off"></div><div class="hint">Minimum: 30% more than starting bid</div><div class="rel" data-for="bin"></div></div>
        </div>
        <div class="field"><label for="b-reserve">Reserve price <small>(optional)</small></label><div class="mny"><span>$</span><input id="b-reserve" type="text" inputmode="numeric" autocomplete="off"></div><div class="rel" data-for="reserve"></div></div>
      </div>
      <div id="b-fixed" class="fields" hidden>
        <div class="field"><label for="b-price">Item price</label><div class="mny"><span>$</span><input id="b-price" type="text" inputmode="numeric" autocomplete="off"></div><div class="rel" data-for="price"></div></div>
      </div>
    </div>
    <aside id="b-out" class="plain" aria-label="What these sell for"><p class="loading">${reasonLine("cold.reading")}</p></aside>
  </div>
  </div>
</section>
<section class="sec-view wrap" id="view-c"${v === "c" ? "" : " hidden"}>${hasListing ? listing(true, "gallery", `${desc}
  <div class="full" id="d-sales"><p class="loading">${reasonLine("cold.reading")}</p></div>
  <div class="full" id="d-hist"></div>`) : noListing}</section>
</main>
<script>${JS.replace("__CAR__", JSON.stringify(car)).replace("__LISTING__", JSON.stringify(hasListing ? DUMMY : null)).replace("__CARS__", JSON.stringify(DEMO_CARS)).replace("__CHOSEN__", JSON.stringify(chosen))}</script></body></html>`;
}

// The plain 404 every refused request gets (no cookie, a wrong, empty or missing code, too many attempts): the same body
// and headers whatever the reason, so nothing says a code exists.
const notFound = (res, req) => sendDisguisedNotFound(res, req);
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  res.setHeader("Referrer-Policy", "no-referrer");
  const q = req.query || {};
  // THE ACCESS CODE (lib/_partnerAccess.js): ?k= (or ?code=) is checked, never echoed or logged, and the address bar is
  // cleared at once by the redirect; attempts are counted per address (lib/_ceilings.js partner_code).
  if (q.k != null || q.code != null) {
    if (isCrewRequest(req)) { res.setHeader("Location", "/preview"); return res.status(302).end(); }
    const lim = await checkCeiling(supabaseEnv(), req, "partner_code", { tool: "partner" }).catch(() => ({ ok: true }));
    const cookies = lim.ok && partnerCodeMatches(q.k != null ? q.k : q.code) ? partnerSetCookies() : null;
    if (!cookies) return notFound(res, req);
    res.setHeader("Set-Cookie", cookies);
    res.setHeader("Location", "/preview");
    return res.status(302).end();
  }
  if (!isCrewRequest(req) && !isPartnerRequest(req)) return notFound(res, req);
  // eBay's own logo, byte for byte, behind the same gate as the page.
  if (req.query && req.query.img === "logo") {
    res.setHeader("Content-Type", "image/svg+xml");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "private, max-age=3600");
    return res.status(200).send(Buffer.from(PARTNER_LOGO_SVG_B64, "base64"));
  }
  // The Amazon Autos logo (api/_amazonLogo.js), byte for byte, behind the same gate; used only in its demo's header.
  if (req.query && req.query.img === "amazon-logo") {
    res.setHeader("Content-Type", "image/svg+xml");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "private, max-age=3600");
    return res.status(200).send(Buffer.from(AMAZON_LOGO_SVG_B64, "base64"));
  }
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  // THE AMAZON AUTOS DEMO (Sam, Oct 20 2026): the same gate, the same answer path, its own profile (api/_amazonDemo.js).
  if (req.query && req.query.p === "amazon") return res.status(200).send(amazonPageHtml(String(req.query.view || "c"), req.query.car, { carOf, listing: DUMMY }));
  return res.status(200).send(pageHtml(String((req.query && req.query.view) || "a"), req.query && req.query.car));
}
