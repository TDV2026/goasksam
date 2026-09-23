// HVT-100: pre-registered archive pull for the 100-car Hagerty July-2026 comparison.
// sales_archive ONLY, sold-only, zero OldCarsData. Rules are FIXED (do not tune scoping, windows
// or exclusions to make a row look better). Drives the deployed archiveQuery:pool probe (archive-
// only) through a real browser (ACM), applies the exclusions here, writes:
//   docs/hvt100/gas_100.csv           (one row per car per window = 300 rows)
//   docs/hvt100/receipts/<id>.json    (every W3 sale, with excluded + why)
//   docs/hvt100/summary.md
//
// SCOPING: exact variant as listed, title-scoped to the distinctive trim token(s) within the
// variant's production/generation years (never widened to the model/family). A car we cannot scope
// gets comparable=no and a resolver_note; we never substitute a nearby trim.
// EXCLUSIONS (counted under flagged_share): halo variants of the listed base car (documented per
// car), salvage/rebuilt title, listed-as-modified, non-US spec where the listed car is US-market.
// METRICS: median/p25/p75/min/max on USD sale price; median_mileage blank if <half carry mileage;
// house_share = fraction sold at the six houses; flagged_share = excluded/raw; vin_history = frac
// of the W3 pool whose VIN/chassis appears >=2x in the archive. No mean/midpoint/closest-comp.
import fs from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";

const CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE = process.env.HVT_BASE || "https://goasksam.com";
const TODAY = new Date().toISOString().slice(0, 10);
const OUT = path.resolve("docs/hvt100");
const HOUSES = ["RM Sotheby's", "Gooding & Co", "Bonhams", "Broad Arrow", "Barrett-Jackson", "Mecum Auctions"];

// Generic exclusions applied to EVERY car (title-based). Halo terms are added per car.
const SALVAGE = /salvage|rebuilt title|branded title|reconstruct|flood|lemon\b|prior damage|theft recovery/i;
const MODIFIED = /restomod|resto-mod|engine swap|motor swap|\bswap(ped)?\b|ls[0-9]\b|ls swap|widebody|wide-body|body\s?kit|\bbagged\b|air ride|coilover|slammed|stanced|pro-?touring|pro-?street|gasser|twin-?turbo(?!.*factory)|supercharged(?! from factory)|rwb|rauh|liberty walk|prior race/i;
const REPLICA = /replica|recreation|re-creation|tribute|clone|kit car|continuation|evocation|homage|\bcsx\b.*replica|superformance|backdraft|factory five/i;
const NONUS = /\beuro\b|european(-| )spec|grey(-| )market|jdm-import|rhd\b|right(-| )hand(-| )drive|km\/h|kilometer|\brow\b/i;

// The 100 cars. term = title scope (array = union); ymin/ymax = variant era; halo = this car's
// halo/other-variant exclusions; scopeOK=false = we cannot honestly title-scope this variant.
const CARS = [
  { id:1, y:1957, mk:"Chevrolet", trim:"Bel Air convertible", term:["Bel Air"], ymin:1957, ymax:1957, req:/convertible/i, halo:/fuel(ie|-inj)|f\.i\.\b/i },
  { id:2, y:1963, mk:"Chevrolet", trim:"Corvette Sting Ray coupe 327/340", term:["327/340","327-340"], ymin:1963, ymax:1963, req:/coupe|split/i, halo:/fuelie|327\/360|convertible/i },
  { id:3, y:1965, mk:"Ford", trim:"Mustang fastback 289", term:["fastback"], ymin:1965, ymax:1965, req:/289/i, halo:/shelby|gt350|hi-po|k-code|hipo/i },
  { id:4, y:1967, mk:"Chevrolet", trim:"Corvette L71 427/435 coupe", term:["427/435"], ymin:1965, ymax:1967, req:/coupe/i, halo:/l88|l89|convertible/i },
  { id:5, y:1969, mk:"Chevrolet", trim:"Camaro Z/28", term:["Z/28","Z28"], ymin:1967, ymax:1969, halo:/copo|zl1|yenko|ss 396|restomod/i },
  { id:6, y:1970, mk:"Chevrolet", trim:"Chevelle SS 396", term:["SS 396","SS396"], ymin:1970, ymax:1970, halo:/ls6|454|restomod|clone/i },
  { id:7, y:1970, mk:"Plymouth", trim:"Cuda 340", term:["Cuda 340","'Cuda 340"], ymin:1970, ymax:1971, halo:/hemi|440|440-6|six.?pack|convertible/i },
  { id:8, y:1969, mk:"Dodge", trim:"Charger R/T 440", term:["Charger R/T","Charger RT"], ymin:1968, ymax:1970, req:/440/, halo:/hemi|daytona|500\b/i },
  { id:9, y:1966, mk:"Shelby", trim:"GT350", term:["GT350"], ymin:1965, ymax:1966, halo:/gt350h|gt350 h|paxton|r-model|\br\b model/i },
  { id:10, y:1968, mk:"Pontiac", trim:"GTO", term:["GTO"], ymin:1968, ymax:1968, halo:/ram air|judge|restomod/i },
  { id:11, y:1955, mk:"Ford", trim:"Thunderbird", term:["Thunderbird"], ymin:1955, ymax:1957, halo:/restomod|supercharged|f-code|312/i },
  { id:12, y:1959, mk:"Cadillac", trim:"Series 62 convertible", term:["Series 62","62 Convertible"], ymin:1959, ymax:1959, req:/convertible/i, halo:/eldorado|biarritz/i },
  { id:13, y:1971, mk:"Chevrolet", trim:"C10 short bed pickup", term:["C10"], ymin:1967, ymax:1972, req:/short/i, halo:/restomod|ls swap|lsx|big block|cheyenne super|blazer/i },
  { id:14, y:1976, mk:"Ford", trim:"Bronco", term:["Bronco"], ymin:1966, ymax:1977, halo:/restomod|coyote|ls swap|stroppe|baja/i, note:"early Bronco (1966-77)" },
  { id:15, y:1965, mk:"Ford", trim:"F-100", term:["F-100","F100"], ymin:1961, ymax:1966, halo:/restomod|ls swap|coyote|big window custom cab/i },
  { id:16, y:1965, mk:"Porsche", trim:"356C coupe", term:["356C","356 C"], ymin:1964, ymax:1965, req:/coupe/i, halo:/carrera|cabriolet|outlaw|speedster/i },
  { id:17, y:1970, mk:"Porsche", trim:"911T coupe", term:["911T","911 T"], ymin:1968, ymax:1973, req:/coupe/i, halo:/911s\b|911e\b|carrera|targa|hot rod|outlaw|backdate/i },
  { id:18, y:1973, mk:"Porsche", trim:"911 Carrera RS 2.7 Touring", term:["Carrera RS 2.7 Touring","Carrera RS Touring"], ymin:1972, ymax:1974, halo:/lightweight|\brsr\b|3\.0/i },
  { id:19, y:1966, mk:"Jaguar", trim:"E-Type Series 1 4.2 roadster", term:["Series 1","Series I"], ymin:1965, ymax:1968, req:/roadster|convertible|ots|4\.2/i, halo:/coupe|2\+2|lightweight|3\.8/i },
  { id:20, y:1962, mk:"Mercedes-Benz", trim:"190SL", term:["190SL","190 SL"], ymin:1955, ymax:1963, halo:/300sl|restomod/i },
  { id:21, y:1971, mk:"Mercedes-Benz", trim:"280SL", term:["280SL","280 SL"], ymin:1968, ymax:1971, halo:/restomod|280sl\/8|pagoda restomod/i },
  { id:22, y:1957, mk:"Mercedes-Benz", trim:"300SL Roadster", term:["300SL Roadster","300 SL Roadster"], ymin:1957, ymax:1963, halo:/gullwing|coupe|alloy/i },
  { id:23, y:1965, mk:"Austin-Healey", trim:"3000 Mk III", term:["3000 Mk III","3000 MkIII","3000 Mark III"], ymin:1964, ymax:1967, halo:/works|rally|restomod/i },
  { id:24, y:1967, mk:"Alfa Romeo", trim:"Giulia Sprint GT Veloce", term:["Sprint GT Veloce","GT Veloce","GTV"], ymin:1965, ymax:1968, halo:/gta\b|1750|2000|junior/i },
  { id:25, y:1972, mk:"Datsun", trim:"240Z", term:["240Z"], ymin:1970, ymax:1973, halo:/restomod|ls swap|rb swap|g-nose|432|fairlady/i },
  { id:26, y:1967, mk:"Volkswagen", trim:"Beetle", term:["Beetle"], ymin:1965, ymax:1969, halo:/restomod|outlaw|cal-look|baja|herbie/i },
  { id:27, y:1973, mk:"BMW", trim:"2002tii", term:["2002tii","2002 tii"], ymin:1972, ymax:1974, halo:/turbo|restomod|m10 swap/i },
  { id:28, y:1964, mk:"Ferrari", trim:"250 GT Lusso", term:["Lusso"], ymin:1963, ymax:1965, halo:/swb|gto|california|pf coupe/i },
  { id:29, y:1972, mk:"Ferrari", trim:"365 GTB/4 Daytona coupe", term:["Daytona"], ymin:1969, ymax:1973, req:/coupe|berlinetta|gtb/i, halo:/spider|competizione|comp|conversion/i },
  { id:30, y:1969, mk:"Lamborghini", trim:"Miura P400S", term:["Miura P400 S","Miura P400S","P400 S"], ymin:1968, ymax:1971, halo:/p400 sv|sv\b|jota/i },
  { id:31, y:1979, mk:"Porsche", trim:"930 Turbo", term:["930 Turbo","911 Turbo"], ymin:1976, ymax:1979, halo:/slant|flat.?nose|3\.3|restomod|convertible|targa/i, note:"930 3.0 era (1976-79)" },
  { id:32, y:1987, mk:"Porsche", trim:"911 Carrera coupe G50", term:["Carrera"], ymin:1987, ymax:1989, req:/coupe/i, halo:/turbo|speedster|targa|cabriolet|club sport|backdate|restomod/i, note:"G50 3.2 Carrera (1987-89)" },
  { id:33, y:1989, mk:"Porsche", trim:"911 Speedster", term:["Speedster"], ymin:1989, ymax:1989, halo:/turbo|widebody/i },
  { id:34, y:1994, mk:"Porsche", trim:"911 Turbo 3.6 (964)", term:["Turbo 3.6","964 Turbo"], ymin:1993, ymax:1994, halo:/3\.3|flat.?nose|slant|s\b/i },
  { id:35, y:1995, mk:"Porsche", trim:"928 GTS", term:["928 GTS"], ymin:1993, ymax:1995, halo:/restomod|manual swap/i },
  { id:36, y:1987, mk:"Porsche", trim:"944 Turbo", term:["944 Turbo"], ymin:1986, ymax:1989, halo:/turbo s\b|951 restomod|track/i },
  { id:37, y:1989, mk:"Ferrari", trim:"Testarossa", term:["Testarossa"], ymin:1987, ymax:1991, halo:/straman|convertible|spider|koenig|512/i },
  { id:38, y:1991, mk:"Ferrari", trim:"348 TS", term:["348 ts","348ts"], ymin:1990, ymax:1993, halo:/tb\b|challenge|zagato|spider|gtb|gts\b/i },
  { id:39, y:1985, mk:"Ferrari", trim:"308 GTS QV", term:["308 GTS QV","GTS Quattrovalvole","308 QV"], ymin:1983, ymax:1985, halo:/gtb|gt4|carburet|injection.?only/i },
  { id:40, y:1991, mk:"BMW", trim:"M3 (E30)", term:["M3"], ymin:1988, ymax:1991, halo:/sport evo|evolution|cecotto|ravaglia|europa|e36|e46/i },
  { id:41, y:1988, mk:"BMW", trim:"M5 (E28)", term:["M5"], ymin:1985, ymax:1988, halo:/e34|e39|e60|restomod/i, note:"E28 M5 (1985-88)" },
  { id:42, y:1995, mk:"BMW", trim:"M3 coupe (E36)", term:["M3"], ymin:1995, ymax:1999, req:/coupe/i, halo:/e30|e46|lightweight|ltw|sedan|convertible|turbo|swap/i },
  { id:43, y:1990, mk:"Mercedes-Benz", trim:"560SL", term:["560SL","560 SL"], ymin:1986, ymax:1989, halo:/restomod|amg/i, note:"560SL (1986-89)" },
  { id:44, y:1992, mk:"Mercedes-Benz", trim:"500E", term:["500E","500 E"], ymin:1992, ymax:1994, halo:/e500 restomod|amg/i },
  { id:45, y:1994, mk:"Toyota", trim:"Supra Turbo", term:["Supra Turbo","Supra Twin Turbo"], ymin:1993, ymax:1998, halo:/single turbo|built|swap|1000hp|900hp|modified/i, req:/turbo/i },
  { id:46, y:1993, mk:"Mazda", trim:"RX-7", term:["RX-7","RX7"], ymin:1993, ymax:1995, halo:/ls swap|ls-swap|single turbo|built|restomod|fc\b|fb\b/i, note:"FD RX-7 (1993-95)" },
  { id:47, y:1991, mk:"Acura", trim:"NSX", term:["NSX"], ymin:1991, ymax:1996, halo:/nsx-t|targa|supercharged|turbo|comptech|swap|2002|2003|2004|2005/i, note:"NA1 fixed-roof era" },
  { id:48, y:1990, mk:"Nissan", trim:"300ZX Twin Turbo", term:["300ZX Twin Turbo","Twin Turbo"], ymin:1990, ymax:1996, req:/twin turbo|twin-turbo/i, halo:/single turbo|built|slicktop restomod|convertible/i },
  { id:49, y:1987, mk:"Buick", trim:"Grand National", term:["Grand National"], ymin:1986, ymax:1987, halo:/gnx|restomod|built/i },
  { id:50, y:1990, mk:"Chevrolet", trim:"Corvette ZR-1", term:["ZR-1","ZR1"], ymin:1990, ymax:1995, halo:/c6|c7|restomod/i, note:"C4 ZR-1 (1990-95)" },
  { id:51, y:1985, mk:"Chevrolet", trim:"Camaro IROC-Z", term:["IROC-Z","IROC"], ymin:1985, ymax:1990, halo:/restomod|ls swap|1le/i },
  { id:52, y:1993, mk:"Ford", trim:"Mustang SVT Cobra", term:["SVT Cobra","Cobra"], ymin:1993, ymax:1993, halo:/cobra r\b|terminator|restomod|supercharged/i, note:"Fox SVT Cobra 1993" },
  { id:53, y:1989, mk:"Jeep", trim:"Grand Wagoneer", term:["Grand Wagoneer"], ymin:1987, ymax:1991, halo:/restomod|ls swap|hemi swap/i },
  { id:54, y:1997, mk:"Land Rover", trim:"Defender 90 NAS", term:["Defender 90"], ymin:1994, ymax:1997, req:/nas\b|north american/i, halo:/restomod|ls swap|td5|puma|110/i },
  { id:55, y:1985, mk:"Toyota", trim:"Land Cruiser FJ60", term:["FJ60","FJ 60"], ymin:1981, ymax:1987, halo:/restomod|ls swap|fj62|fj40|fj55/i },
  { id:56, y:1991, mk:"Lamborghini", trim:"Diablo", term:["Diablo"], ymin:1990, ymax:1994, halo:/sv\b|vt\b|se30|gt\b|roadster|restomod/i, note:"early Diablo (1990-94)" },
  { id:57, y:1993, mk:"Dodge", trim:"Viper RT/10", term:["RT/10","RT-10"], ymin:1992, ymax:1995, halo:/gts\b|acr|built|supercharged/i },
  { id:58, y:1997, mk:"Porsche", trim:"911 Turbo (993)", term:["911 Turbo"], ymin:1995, ymax:1998, halo:/turbo s\b|\bruf\b|wls|slant|rwb|converted|modified|cabriolet/i },
  { id:59, y:1999, mk:"Porsche", trim:"911 Carrera coupe (996)", term:["Carrera"], ymin:1999, ymax:2001, req:/coupe/i, halo:/turbo|gt3|gt2|targa|cabriolet|4s|c4s|restomod|backdate/i, note:"996.1 Carrera (1999-2001)" },
  { id:60, y:2004, mk:"Porsche", trim:"911 GT3 (996)", term:["GT3"], ymin:2004, ymax:2005, halo:/gt3 rs|gt2|cup\b|race/i, note:"996 GT3 (2004-05)" },
  { id:61, y:2007, mk:"Porsche", trim:"911 GT3 (997.1)", term:["GT3"], ymin:2007, ymax:2009, halo:/gt3 rs|gt2|cup\b|997.2|4\.0/i, note:"997.1 GT3 (2007-09)" },
  { id:62, y:2004, mk:"Porsche", trim:"Carrera GT", term:["Carrera GT"], ymin:2004, ymax:2006, halo:/restomod|replica/i },
  { id:63, y:2001, mk:"BMW", trim:"M3 coupe manual (E46)", term:["M3"], ymin:2001, ymax:2006, req:/coupe/i, halo:/smg\b|csl|e30|e36|e92|convertible|sedan|swap/i },
  { id:64, y:2003, mk:"BMW", trim:"M5 (E39)", term:["M5"], ymin:2000, ymax:2003, halo:/e28|e34|e60|dinan|supercharged/i },
  { id:65, y:2000, mk:"BMW", trim:"Z3 M Coupe", term:["M Coupe","Z3 M Coupe"], ymin:1998, ymax:2002, halo:/roadster|s54 swap/i },
  { id:66, y:2001, mk:"Honda", trim:"S2000", term:["S2000"], ymin:2000, ymax:2003, halo:/cr\b|supercharged|turbo|built|swap/i, note:"AP1 (2000-03)" },
  { id:67, y:2005, mk:"Ford", trim:"GT", term:["Ford GT"], ymin:2005, ymax:2006, halo:/heritage|gt40|replica|superformance/i },
  { id:68, y:2002, mk:"Chevrolet", trim:"Corvette Z06 (C5)", term:["Z06"], ymin:2001, ymax:2004, halo:/c6|c7|restomod|supercharged|built/i },
  { id:69, y:2006, mk:"Chevrolet", trim:"Corvette Z06 (C6)", term:["Z06"], ymin:2006, ymax:2013, halo:/zr1|c5|c7|restomod|supercharged|built|427 collector/i },
  { id:70, y:2005, mk:"Mercedes-Benz", trim:"SLR McLaren", term:["SLR McLaren","SLR"], ymin:2005, ymax:2009, halo:/722|roadster|stirling moss/i },
  { id:71, y:2006, mk:"Ferrari", trim:"F430 coupe F1", term:["F430"], ymin:2005, ymax:2009, req:/coupe|berlinetta/i, halo:/spider|scuderia|16m|6-speed|gated|manual/i },
  { id:72, y:1999, mk:"Ferrari", trim:"550 Maranello", term:["550 Maranello","550"], ymin:1997, ymax:2001, halo:/575|barchetta|wsr|superamerica/i },
  { id:73, y:2004, mk:"Lamborghini", trim:"Gallardo", term:["Gallardo"], ymin:2004, ymax:2008, halo:/superleggera|se\b|nera|spyder|se30|twin turbo|built/i, note:"early Gallardo 5.0 (2004-08)" },
  { id:74, y:2002, mk:"Acura", trim:"NSX", term:["NSX"], ymin:2002, ymax:2005, halo:/targa|nsx-t|supercharged|turbo|swap/i, note:"NA2 (2002-05)" },
  { id:75, y:2009, mk:"Nissan", trim:"GT-R", term:["GT-R","GTR"], ymin:2009, ymax:2011, halo:/built|tuned|900hp|1000hp|alpha|switzer|nismo/i, note:"R35 early (2009-11)" },
  { id:76, y:2012, mk:"Lexus", trim:"LFA", term:["LFA"], ymin:2012, ymax:2012, halo:/nurburgring/i },
  { id:77, y:2006, mk:"Dodge", trim:"Viper SRT-10 coupe", term:["SRT-10","SRT10"], ymin:2006, ymax:2010, req:/coupe/i, halo:/acr|convertible|roadster|built|supercharged/i },
  { id:78, y:2000, mk:"Toyota", trim:"Land Cruiser (100 series)", term:["Land Cruiser"], ymin:1998, ymax:2002, halo:/restomod|lift|built|fj|80 series|fzj80/i, note:"100-series" },
  { id:79, y:2011, mk:"Mercedes-Benz", trim:"SLS AMG coupe", term:["SLS AMG","SLS"], ymin:2011, ymax:2012, req:/coupe/i, halo:/roadster|black series|gt\b|convertible/i },
  { id:80, y:2016, mk:"Porsche", trim:"911 GT3 RS (991.1)", term:["GT3 RS"], ymin:2015, ymax:2017, halo:/991\.2|gt2|4\.0 2019|2018|2019|2020/i },
  { id:81, y:2019, mk:"Porsche", trim:"911 GT3 RS (991.2)", term:["GT3 RS"], ymin:2019, ymax:2019, halo:/991\.1|2015|2016|gt2/i },
  { id:82, y:2018, mk:"Porsche", trim:"911 Carrera T (991.2)", term:["Carrera T"], ymin:2018, ymax:2019, halo:/gts|turbo|targa|4\b/i },
  { id:83, y:2016, mk:"Porsche", trim:"Cayman GT4 (981)", term:["Cayman GT4","GT4"], ymin:2016, ymax:2016, halo:/gt4 rs|718|982|clubsport|club sport/i, note:"981 GT4 (2016)" },
  { id:84, y:2015, mk:"Porsche", trim:"918 Spyder", term:["918 Spyder","918"], ymin:2014, ymax:2015, halo:/weissach.*replica/i },
  { id:85, y:2017, mk:"Dodge", trim:"Viper GTS", term:["Viper GTS"], ymin:2013, ymax:2017, halo:/acr|gtc|1:1|comp coupe|built/i, note:"Gen V GTS (2013-17)" },
  { id:86, y:2020, mk:"Ferrari", trim:"488 Pista", term:["488 Pista"], ymin:2019, ymax:2020, halo:/spider|piloti|challenge/i },
  { id:87, y:2013, mk:"Ferrari", trim:"458 Italia", term:["458 Italia"], ymin:2010, ymax:2015, halo:/spider|speciale|aperta|challenge/i },
  { id:88, y:2015, mk:"Ferrari", trim:"458 Speciale", term:["458 Speciale"], ymin:2014, ymax:2015, halo:/aperta|spider|challenge/i },
  { id:89, y:2012, mk:"McLaren", trim:"MP4-12C", term:["MP4-12C","12C"], ymin:2012, ymax:2014, halo:/spider|built|tuned/i },
  { id:90, y:2019, mk:"McLaren", trim:"720S", term:["720S"], ymin:2018, ymax:2021, halo:/spider|track pack|built|tuned/i },
  { id:91, y:2015, mk:"Lamborghini", trim:"Huracan LP610-4", term:["LP610-4","LP610"], ymin:2015, ymax:2018, halo:/spyder|performante|evo|sto|built|twin turbo/i },
  { id:92, y:2018, mk:"Lamborghini", trim:"Aventador S", term:["Aventador S"], ymin:2017, ymax:2019, halo:/svj|sv\b|roadster|built|twin turbo/i },
  { id:93, y:2014, mk:"Chevrolet", trim:"Corvette Stingray Z51", term:["Z51"], ymin:2014, ymax:2019, halo:/z06|zr1|grand sport|restomod|supercharged/i, note:"C7 Z51" },
  { id:94, y:2019, mk:"Chevrolet", trim:"Corvette ZR1", term:["ZR1"], ymin:2019, ymax:2019, halo:/zr-1|c4|c6|built/i, note:"C7 ZR1 (2019)" },
  { id:95, y:2020, mk:"Chevrolet", trim:"Corvette Stingray (C8)", term:["Stingray","C8"], ymin:2020, ymax:2021, halo:/z06|e-ray|zr1|built|supercharged/i },
  { id:96, y:2013, mk:"Ford", trim:"Shelby GT500", term:["GT500"], ymin:2013, ymax:2014, halo:/gt350|super snake|built|supercharger upgrade|1000hp/i, note:"S197 GT500 (2013-14)" },
  { id:97, y:2016, mk:"Ford", trim:"Shelby GT350R", term:["GT350R"], ymin:2016, ymax:2020, halo:/gt350\b(?! r)|gt500|built/i },
  { id:98, y:2018, mk:"Dodge", trim:"Challenger SRT Demon", term:["Demon"], ymin:2018, ymax:2018, halo:/redeye|hellcat|built|widebody/i },
  { id:99, y:2019, mk:"BMW", trim:"M4 Competition coupe", term:["M4 Competition"], ymin:2019, ymax:2020, req:/coupe/i, halo:/cs\b|gts|convertible|cabriolet|built|f82 base/i },
  { id:100, y:2017, mk:"Ford", trim:"Focus RS", term:["Focus RS"], ymin:2016, ymax:2018, halo:/built|tuned|mountune|500hp/i }
];

const WINDOWS = [
  { key:"W1", from:"2025-01-01", to:"2026-06-30" },
  { key:"W2", from:"2026-07-01", to:TODAY },
  { key:"W3", from:new Date(Date.now()-1096*864e5).toISOString().slice(0,10), to:TODAY }
];

const med = a => { const s=a.slice().sort((x,y)=>x-y); const n=s.length; return n?(n%2?s[(n-1)/2]:Math.round((s[n/2-1]+s[n/2])/2)):null; };
const pct = (a,q) => { if(!a.length)return null; const s=a.slice().sort((x,y)=>x-y); const i=(s.length-1)*q; const lo=Math.floor(i),hi=Math.ceil(i); return lo===hi?s[lo]:Math.round(s[lo]+(s[hi]-s[lo])*(i-lo)); };
const isHouse = p => HOUSES.includes(p);

function reason(c, s) {
  // returns null if kept, else the exclusion reason
  const t = s.title || "";
  if (c.req && !c.req.test(t)) return "wrong body/variant (missing required token)";
  if (c.halo && c.halo.test(t)) return "halo/other variant of the listed base car";
  if (SALVAGE.test(t)) return "salvage or rebuilt title";
  if (MODIFIED.test(t)) return "modified";
  if (REPLICA.test(t)) return "replica/recreation";
  if (NONUS.test(t)) return "non-US spec";
  return null;
}

const post = (page, body) => page.evaluate(async b => {
  const r = await fetch("/api/sellerDecision", { method:"POST", headers:{"content-type":"application/json"}, body: JSON.stringify(b) });
  return await r.json();
}, body);

(async () => {
  fs.mkdirSync(path.join(OUT,"receipts"), { recursive:true });
  const browser = await puppeteer.launch({ executablePath:CHROME, headless:"new", args:["--no-sandbox"] });
  const page = await browser.newPage();
  await page.setCookie({ name:"gas_crew", value:"ok", domain:new URL(BASE).hostname, path:"/" });
  await page.goto(BASE+"/sell", { waitUntil:"networkidle2" });

  const csv = [["car_id","year","make","model_trim_as_listed","window","comparable","n","thin","median","p25","p75","min","max","median_mileage","house_share","online_share","flagged_share","vin_history","excluded_variants","resolver_note"]];
  const summary = { comparable:0, thinW1:[], thinW2:[], resolverFail:[], queryFail:[], exclusions:{} };

  for (const c of CARS) {
    // W3 pool once (superset): scope + fetch, used for receipts + vin_history + as the source
    // filtered by date for each window (one archive read per car).
    const w3from = WINDOWS[2].from;
    // Retry a failed pool query (a leading-wildcard title ILIKE can statement-timeout under batch
    // load). The probe now returns {count:null,error:"query_failed"} on a real failure instead of a
    // false empty pool, so a timeout is retried here, never silently recorded as "zero comparable".
    let raw = null, queryFailed = false;
    for (let attempt = 1; attempt <= 5; attempt++) {
      raw = await post(page, { archiveQuery:"pool", terms:c.term, make:c.mk, yearMin:c.ymin, yearMax:c.ymax, dateFrom:w3from, dateTo:TODAY });
      if (raw && raw.error !== "query_failed" && raw.count !== null) { queryFailed = false; break; }
      queryFailed = true;
      process.stderr.write(`  car ${c.id} pool query failed (attempt ${attempt}/5), retrying...\n`);
      await new Promise(r => setTimeout(r, 800 * attempt));
    }
    const rawRows = (raw && raw.rows) || [];
    // A car whose pool query never succeeded is a query_error, NOT a genuine empty pool: report it
    // as such and never emit misleading zero/thin metrics for it.
    const scopeOK = !queryFailed && c.scopeOK !== false;
    if (queryFailed) summary.queryFail.push(`${c.id} ${c.mk} ${c.trim}`);
    // annotate exclusions
    const annotated = rawRows.map(s => ({ ...s, _excl: reason(c, s) }));
    // vin_history over the W3 KEPT pool
    const keptW3 = annotated.filter(s => !s._excl);
    const vins = [...new Set(keptW3.map(s=>s.vin).filter(Boolean))];
    let vinHist = null;
    if (keptW3.length) {
      let present = 0;
      if (vins.length) { const vp = await post(page, { archiveQuery:"vinPresence", vins }); const pres = vp.presence||{}; present = keptW3.filter(s=>s.vin && (pres[s.vin]||0)>=2).length; }
      vinHist = keptW3.length ? +(present/keptW3.length).toFixed(3) : null;
    }
    // receipts file (W3 pool, every sale + excluded+why)
    fs.writeFileSync(path.join(OUT,"receipts",`${c.id}.json`), JSON.stringify({
      car_id:c.id, listed:`${c.y} ${c.mk} ${c.trim}`, scope:{ terms:c.term, make:c.mk, yearMin:c.ymin, yearMax:c.ymax, window:"W3", from:w3from, to:TODAY },
      sales: annotated.map(s => ({ date:s.date, price:s.price, mileage:s.mileage, venue:s.platform, title:s.title, url:s.url, vin:s.vin, excluded:!!s._excl, why:s._excl||null }))
    }, null, 2)+"\n");

    for (const w of WINDOWS) {
      const inWin = annotated.filter(s => s.date && s.date >= w.from && s.date <= w.to);
      const rawN = inWin.length;
      const kept = inWin.filter(s => !s._excl);
      const excluded = inWin.filter(s => s._excl);
      const prices = kept.map(s=>s.price).filter(v=>v>0);
      const miles = kept.map(s=>s.mileage).filter(v=>v!=null&&v>0);
      const n = kept.length;
      const comparable = queryFailed ? "query_error" : (scopeOK ? "yes" : "no");
      const note = queryFailed ? "pool query failed after retries (transient DB timeout); not a scope or data gap" : (c.note || (scopeOK ? "" : (c.resolverNote||"resolver cannot scope this trim")));
      // exclusion breakdown
      for (const s of excluded) { const k=`${c.id}:${s._excl}`; summary.exclusions[k]=(summary.exclusions[k]||0)+1; }
      const row = {
        car_id:c.id, year:c.y, make:c.mk, model_trim_as_listed:c.trim, window:w.key, comparable,
        n: comparable==="yes"?n:"", thin: comparable==="yes"?(n<8?"yes":"no"):"",
        median: comparable==="yes"&&n?med(prices):"", p25: comparable==="yes"&&n?pct(prices,0.25):"", p75: comparable==="yes"&&n?pct(prices,0.75):"",
        min: comparable==="yes"&&n?Math.min(...prices):"", max: comparable==="yes"&&n?Math.max(...prices):"",
        median_mileage: comparable==="yes"&&n&&miles.length>=n/2?med(miles):"",
        house_share: comparable==="yes"&&n?+(kept.filter(s=>isHouse(s.platform)).length/n).toFixed(3):"",
        online_share: comparable==="yes"&&n?+(kept.filter(s=>!isHouse(s.platform)).length/n).toFixed(3):"",
        flagged_share: comparable==="yes"&&rawN?+(excluded.length/rawN).toFixed(3):"",
        vin_history: comparable==="yes"?(vinHist!=null?vinHist:""):"",
        excluded_variants: [...new Set(excluded.map(s=>s._excl))].join("; "),
        resolver_note: note
      };
      csv.push(Object.values(row).map(v => { const str=String(v??""); return /[",\n]/.test(str)?`"${str.replace(/"/g,'""')}"`:str; }));
      if (w.key==="W1"&&comparable==="yes"&&n<8) summary.thinW1.push(`${c.id} ${c.mk} ${c.trim}`);
      if (w.key==="W2"&&comparable==="yes"&&n<8) summary.thinW2.push(`${c.id} ${c.mk} ${c.trim}`);
    }
    if (queryFailed) { /* already recorded in summary.queryFail; not a scope/data failure */ }
    else if (scopeOK) summary.comparable++;
    else summary.resolverFail.push(`${c.id} ${c.mk} ${c.trim}: ${c.resolverNote||"cannot scope"}`);
    process.stderr.write(`  car ${c.id} ${c.mk} ${c.trim}: ${queryFailed?"QUERY_ERROR (retries exhausted)":`W3 raw ${rawRows.length}, kept ${keptW3.length}`}\n`);
  }
  await browser.close();

  fs.writeFileSync(path.join(OUT,"gas_100.csv"), csv.map(r=>r.join(",")).join("\n")+"\n");
  const md = [
    `# HVT-100 archive pull (sales_archive only, sold-only, zero OldCarsData)`,
    ``, `Generated ${TODAY}. Windows: W1 2025-01-01..2026-06-30 (pre-guide), W2 2026-07-01..${TODAY} (post-guide), W3 36 months.`,
    ``, `- Cars comparable (scoped): ${summary.comparable} of ${CARS.length}`,
    `- Cars thin (n<8) in W1: ${summary.thinW1.length}`, `- Cars thin (n<8) in W2: ${summary.thinW2.length}`,
    `- Cars with query errors (transient DB timeout, retries exhausted; NOT scope/data gaps): ${summary.queryFail.length}`,
    ``, `## Query errors (re-run these; not a scope or data failure)`, summary.queryFail.length?summary.queryFail.map(x=>`- ${x}`).join("\n"):"- none",
    ``, `## Resolver failures (comparable=no)`, summary.resolverFail.length?summary.resolverFail.map(x=>`- ${x}`).join("\n"):"- none",
    ``, `## Thin in W1`, summary.thinW1.length?summary.thinW1.map(x=>`- ${x}`).join("\n"):"- none",
    ``, `## Thin in W2`, summary.thinW2.length?summary.thinW2.map(x=>`- ${x}`).join("\n"):"- none",
    ``, `## Exclusions per car (W3)`, ...Object.entries(summary.exclusions).sort().map(([k,v])=>`- ${k} x${v}`)
  ].join("\n")+"\n";
  fs.writeFileSync(path.join(OUT,"summary.md"), md);
  console.log(`\nWrote docs/hvt100/gas_100.csv (${csv.length-1} rows), ${CARS.length} receipts, summary.md`);
  console.log(`comparable=${summary.comparable} thinW1=${summary.thinW1.length} thinW2=${summary.thinW2.length} resolverFail=${summary.resolverFail.length}`);
})();
