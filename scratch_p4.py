def sub(p, old, new, cnt=1):
    s=open(p).read(); assert s.count(old)>=1, (p, old[:70]); s=s.replace(old,new,cnt); open(p,'w').write(s)
# variants.js: test override of the family list
sub('lib/variants.js','export const familiesOf = (list = null) => { if (list) return list.map(compile); if (!COMPILED)','let OVERRIDE = null;\nexport const __useFamilies = list => { OVERRIDE = Array.isArray(list) ? list.map(compile) : null; };   // a check only: an empty list is the engine as it was before the variants (the control of variantSplitCheck)\nexport const familiesOf = (list = null) => { if (list) return list.map(compile); if (OVERRIDE) return OVERRIDE; if (!COMPILED)')
# onebox: off mode drops the variant-derived trim fence
sub('lib/onebox.js','''  const rows = await fetchQualifyingCore0(spec, sinceIso, env, diag), box = variantCtx.getStore();
  if (!box || !spec || !spec.variantFamily || !Array.isArray(rows)) return rows;''','''  const box = variantCtx.getStore();
  // THIN, EVERY VARIANT READ TOGETHER: the car's own variant is also its trim word (a title fence), so the fallback read leaves that fence off too
  const wide = !!(box && box.off && spec && spec.variantFamily && spec.variantStated && spec.variantStated.length);
  const rows = await fetchQualifyingCore0(wide ? { ...spec, trim: null, titleContains: null } : spec, sinceIso, env, diag);
  if (!box || !spec || !spec.variantFamily || !Array.isArray(rows)) return rows;''')
p='scripts/variantSplitCheck.mjs'
sub(p,'sale_date: new Date(Date.now() - (20 + (k % 12) * 30) * DAY)','sale_date: new Date(Date.now() - (10 + (k % 9) * 25) * DAY)')
s=open(p).read()
s=s.replace('String(s.title)','tl(s)').replace('String(c.title)','tl(c)').replace('c => c.title','c => tl(c)')
s=s.replace('const vb = d => d && d.variants;','const vb = d => d && d.variants, tl = x => String((x && (x.titleLine || x.title)) || "");')
s=s.replace('pos: 5, years: [1982, 1992], map: { F: "GTA" }','pos: 4, years: [1982, 1992], map: { F: "GTA" }').replace('"1G2FS21S8JL000000"','"1G2SS21F8JL000000"')
open(p,'w').write(s)
