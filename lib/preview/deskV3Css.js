// Desk v3 stylesheet. Flat surfaces, hairlines, no gradients. Two meaning colours only: --ev (evidence green, completed sales) and --cu (copper, the analyst's decisions).
export const DESK_V3_CSS = `
.v3{--bg:#f6f6f4;--pn:#fff;--ink:#1c2321;--mu:#5d6662;--ln:#dcdedb;--ln2:#eceeeb;--ev:#1f6b4a;--evbg:#e9f2ed;--cu:#a8562a;--cubg:#f8ede6;--rail:272px;--bar:48px;
  margin:0;background:var(--bg);color:var(--ink);font:14px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased}
.v3 *{box-sizing:border-box}
.v3 .bar{position:sticky;top:0;z-index:30;height:var(--bar);display:flex;align-items:center;justify-content:space-between;padding:0 20px;background:var(--pn);border-bottom:1px solid var(--ln)}
.v3 .bar-m{font-weight:700;letter-spacing:.01em}.v3 .bar-o{margin-left:12px;padding-left:12px;border-left:1px solid var(--ln);color:var(--mu)}.v3 .bar-seat{color:var(--mu);font-size:13px}
.v3 .shell{display:flex;align-items:flex-start;min-height:calc(100vh - var(--bar))}
.v3 .rail{position:sticky;top:var(--bar);width:var(--rail);flex:0 0 var(--rail);height:calc(100vh - var(--bar));display:flex;flex-direction:column;background:var(--pn);border-right:1px solid var(--ln)}
.v3 .rail-s{padding:12px;border-bottom:1px solid var(--ln2)}
.v3 .rail-s input{width:100%;height:34px;padding:0 10px;border:1px solid var(--ln);border-radius:4px;font:inherit;background:var(--bg);color:var(--ink)}
.v3 .rail-s input:focus{outline:2px solid var(--ev);outline-offset:-1px;background:var(--pn)}
.v3 .rail-list{flex:1;overflow:auto;padding:4px 0 12px}
.v3 .grp-h{display:flex;justify-content:space-between;margin:14px 14px 4px;font-size:11px;font-weight:600;letter-spacing:.07em;text-transform:uppercase;color:var(--mu)}
.v3 .grp-n{font-weight:500}
.v3 .cs{display:block;padding:9px 14px 9px 12px;border-left:2px solid transparent;color:inherit;text-decoration:none;border-bottom:1px solid var(--ln2)}
.v3 .cs:hover{background:var(--bg)}.v3 .cs.on{background:var(--evbg);border-left-color:var(--ev)}
.v3 .cs:focus-visible{outline:2px solid var(--ev);outline-offset:-2px}
.v3 .cs[hidden]{display:none}
.v3 .cs-car{display:block;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.v3 .cs-sub{display:block;color:var(--mu);font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-height:18px}
.v3 .cs-meta{display:flex;justify-content:space-between;font-size:12px;color:var(--mu)}
.v3 .rail-none{margin:14px;color:var(--mu)}
.v3 .ops{border-top:1px solid var(--ln);padding:12px 14px;background:var(--bg)}
.v3 .ops-h{margin:0 0 6px;font-size:11px;font-weight:600;letter-spacing:.07em;text-transform:uppercase;color:var(--mu)}
.v3 .ops-r{display:flex;justify-content:space-between;gap:10px;padding:3px 0;font-size:13px}.v3 .ops-r b{font-weight:600}
.v3 .work{flex:1;min-width:0;padding:0 28px 80px}
.v3 .demo{margin:14px 0 0;padding:7px 12px;border:1px solid var(--cu);background:var(--cubg);color:var(--cu);font-size:13px;font-weight:600}
.v3 .chd{display:flex;align-items:center;gap:18px;padding:16px 0;border-bottom:1px solid var(--ln)}
.v3 .chd-empty{color:var(--mu)}
.v3 .chd-ph{flex:0 0 76px;height:52px;border:1px solid var(--ln);background:var(--ln2);overflow:hidden}.v3 .chd-ph img{display:block;width:100%;height:100%;object-fit:cover}
.v3 .chd-car{flex:1 1 auto;min-width:0}.v3 .chd-car h1{margin:0;font-size:19px;line-height:1.25;font-weight:650}
.v3 .chd-spec{margin:2px 0 0;color:var(--mu);font-size:13px}
.v3 .chd-f{display:flex;gap:26px;margin:0;flex:0 0 auto}.v3 .chd-f div{min-width:0}
.v3 .chd-f dt{font-size:11px;letter-spacing:.07em;text-transform:uppercase;color:var(--mu)}.v3 .chd-f dd{margin:1px 0 0;font-weight:600;white-space:nowrap}
.v3 .chd-st{color:var(--ink)}
@media (max-width:1100px){.v3{--rail:232px}.v3 .chd{flex-wrap:wrap}.v3 .chd-f{flex:1 0 100%;gap:22px}}
@media (max-width:760px){.v3 .shell{flex-direction:column}.v3 .rail{position:static;width:100%;flex-basis:auto;height:auto;max-height:280px;border-right:0;border-bottom:1px solid var(--ln)}.v3 .work{padding:0 16px 60px}}
`;
