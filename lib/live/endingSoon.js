// ENDING SOON (Lane B, Nov 10 2026): the ONE rule every live example picker shares (Home featured car, Find examples, Tasks demo, Watching demo). A car at auction is picked for what the reader can act on:
//   an auction ending within 7 days is preferred, within 3 days best; a car more than 14 days from its end is NEVER picked while any car within 14 days qualifies.
// Cause of the January lot (a 1999 Porsche 911 Carrera RUF Tribute at RM Sotheby's, sold January 2027, on Home): the Home choice sorted "sold before, fewest earlier appearances, LONGEST time left", so the car furthest from its end won every tie,
// and the search read the live table by end_time descending, so the farthest lots were evaluated first and the 60 car cap could cut the near ones out. Find and Tasks sorted on the end time descending too.
// Pages print the line this file's reason ("pick.ends") builds; they compute nothing.
export const DAY_MS = 864e5;
export const BEST_DAYS = 3, SOON_DAYS = 7, CAP_DAYS = 14;
export const endMsOf = x => Date.parse(x && (x.end_time || (x.row && x.row.end_time) || (x.featured && x.featured.current && x.featured.current.endsAt) || x.endsAt));
// 0 within 3 days, 1 within 7 days, 2 within 14 days, 3 further out
export const soonBand = (endMs, nowMs) => { const d = (endMs - nowMs) / DAY_MS; return d <= BEST_DAYS ? 0 : d <= SOON_DAYS ? 1 : d <= CAP_DAYS ? 2 : 3; };
export const withinCap = (endMs, nowMs) => soonBand(endMs, nowMs) < 3;
// the candidates a pick may come from: those within 14 days when any is; otherwise all of them (nothing nearer exists)
export const capPool = (list, nowMs, endOf = endMsOf) => { const near = list.filter(x => withinCap(endOf(x), nowMs)); return near.length ? near : list; };
// sort order: nearer band first; within a band the caller's own order decides
export const bandCompare = (a, b, nowMs, endOf = endMsOf) => soonBand(endOf(a), nowMs) - soonBand(endOf(b), nowMs);
