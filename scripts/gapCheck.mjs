// Fails unless: a READ GAP line from Lane F names a window that holds `now`, and no lock is open.
import fs from 'node:fs';
const notes = fs.readFileSync(process.argv[2], 'utf8').split('\n');
const now = process.argv[3]; // HH:MM in Z
const mins = (s) => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
let lock = false, gap = null;
for (const l of notes) {
  if (/^- (PUSH LOCK|WARM START)/.test(l)) lock = true;
  if (/^- .*(LOCK RELEASED|WARM STOP)/.test(l)) lock = false;
  const g = l.match(/^- READ GAP \(Lane F.*?window (\d\d:\d\d)Z to (\d\d:\d\d)Z/);
  if (g) gap = { a: mins(g[1]), b: mins(g[2]) };
}
const fails = [];
if (lock) fails.push('a lock is open');
if (!gap) fails.push('no READ GAP line from Lane F');
else if (mins(now) < gap.a || mins(now) > gap.b) fails.push('now is outside the named window');
console.log(fails.length ? 'FAIL: ' + fails.join('; ') : 'PASS');
process.exit(fails.length ? 1 : 0);
