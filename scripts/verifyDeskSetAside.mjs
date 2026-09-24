// Golden guard for the shared set-aside rule (Desk + One Box). Deterministic, offline.
// #1 generation-aware BMW M3 Evolution; #3/#4 halos, race cars, restomods, period tuners.
import { recordExcludeReason } from "../lib/onebox.js";
import { isPartsListing } from "../lib/_classify.js";
let fails = 0;
const ck = (name, got, want) => { const ok = (got || "KEEP") === want; console.log(`${ok ? "PASS" : "FAIL"}  ${name}  (${got || "KEEP"})`); if (!ok) fails++; };
const r = (t, m = "BMW") => recordExcludeReason({ raw_title: t, year: Number(String(t).slice(0, 4)) || null }, m);
// #1 generation-aware Evolution
ck("E30 1990 M3 Evolution -> halo", r("1990 BMW M3 Evolution"), "halo");
ck("E30 1989 M3 Evo II -> halo", r("1989 BMW M3 Evo II"), "halo");
ck("E30 1988 M3 Sport Evolution -> halo", r("1988 BMW M3 Sport Evolution"), "halo");
ck("E36 1997 M3 Evolution -> KEEP (mainstream)", r("1997 BMW M3 Evolution"), "KEEP");
ck("E36 1996 M3 3.2 Evolution -> KEEP", r("1996 BMW M3 3.2 Evolution"), "KEEP");
// halos / race
ck("M3 GT -> halo", r("1995 BMW M3 GT"), "halo");
ck("M3 CSL -> halo", r("2003 BMW M3 CSL"), "halo");
ck("M3 Lightweight -> halo", r("1995 BMW M3 Lightweight"), "halo");
ck("M3 (E30) DTM -> race car", r("1992 BMW M3 (E30) DTM Competition Saloon"), "race car");
// #4 period tuners / conversions
ck("AC Schnitzer -> period tuner", r("1995 BMW M3 AC Schnitzer ACS3 CLS"), "period tuner");
ck("Dinan-built -> period tuner", r("1998 Dinan BMW M3 Coupe"), "period tuner");
ck("Hartge -> period tuner", r("1990 BMW M3 Hartge H35"), "period tuner");
ck("Hamann -> period tuner", r("2002 BMW M3 Hamann"), "period tuner");
// separate manufacturers are NOT tuners
ck("Alpina -> KEEP (own marque)", r("1991 BMW Alpina B10"), "KEEP");
// a plain standard car
ck("standard 1989 M3 -> KEEP", r("1989 BMW M3"), "KEEP");

// Fitment-phrased parts lots (shared isPartsListing) - dropped on both surfaces.
const pk=(t)=>isPartsListing(t,null);
ck("parts: Wheels for 2005-2006 Ford GT", pk("18x9 and 19x11.5 BBS Wheels for 2005-2006 Ford GT")?"halo":"KEEP","halo");
ck("parts: Seats for a 1990 M3", pk("Seats for a 1990 BMW M3")?"halo":"KEEP","halo");
ck("parts: Engine for the 1972 Corvette", pk("Engine for the 1972 Chevrolet Corvette")?"halo":"KEEP","halo");
ck("parts: real car NOT parts (2005 Ford GT)", pk("2005 Ford GT")?"halo":"KEEP","KEEP");
ck("parts: 'wheels for track use' NOT parts", pk("1989 BMW M3 with wheels for track use")?"halo":"KEEP","KEEP");

console.log(fails ? `\n${fails} FAILURE(S)` : "\nAll set-aside rule checks passed.");
process.exit(fails ? 1 : 0);
