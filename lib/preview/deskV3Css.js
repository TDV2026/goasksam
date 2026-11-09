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
@media (max-width:760px){.v3 .shell{flex-direction:column}.v3 .rail{position:static;width:100%;flex-basis:auto;height:auto;max-height:280px;border-right:0;border-bottom:1px solid var(--ln)}.v3 .work{padding:0 16px 60px;width:100%;align-self:stretch}.v3 .bar3{margin:18px 30px 6px}}
.v3 .stk{position:sticky;top:var(--bar);z-index:20;display:flex;align-items:center;gap:18px;flex-wrap:wrap;gap:2px 14px;min-height:44px;max-height:92px;margin:0 -28px;padding:4px 28px;background:var(--pn);border-bottom:1px solid var(--ln)}
.v3 .stk[hidden]{display:none}
.v3 .sk-car{font-weight:650;white-space:nowrap;max-width:220px;overflow:hidden;text-overflow:ellipsis}
.v3 .sk{display:flex;gap:6px;align-items:baseline;border:0;background:none;font:inherit;color:inherit;padding:4px 6px;margin:0;white-space:nowrap;border-radius:4px}
.v3 .sk i{font-style:normal;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--mu)}.v3 .sk b{font-weight:650}
.v3 .sk.ev b{color:var(--ev)}.v3 .sk.cu b{color:var(--cu)}.v3 button.sk{cursor:pointer}.v3 button.sk:hover{background:var(--cubg)}
.v3 .sk-tabs{display:flex;gap:2px;margin-left:auto}.v3 .sk-tabs button{border:0;background:none;font:inherit;padding:6px 10px;cursor:pointer;border-radius:4px;color:var(--mu)}
.v3 .sk-tabs button:hover{background:var(--bg)}.v3[data-view="vehicle"] .sk-tabs [data-tab="vehicle"],.v3[data-view="market"] .sk-tabs [data-tab="market"],.v3[data-view="decision"] .sk-tabs [data-tab="decision"]{color:var(--ink);font-weight:600;background:var(--bg)}
.v3 .sk-clock{color:var(--mu);font-size:13px;white-space:nowrap}
.v3 .sum{padding:18px 0 8px}
.v3 .figs{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
.v3 .fig{display:flex;flex-direction:column;gap:4px;min-width:0;padding:12px 14px;border:1px solid var(--ln);border-radius:6px;background:var(--pn);text-align:left;font:inherit;color:inherit}
.v3 button.fig{cursor:pointer}.v3 button.fig:hover{border-color:var(--cu)}.v3 .fig:focus-visible{outline:2px solid var(--ev);outline-offset:2px}
.v3 .fig#figM{border-top:3px solid var(--ev)}.v3 .fig.cu{border-top:3px solid var(--cu)}
.v3 .fg-k{font-size:11px;letter-spacing:.07em;text-transform:uppercase;color:var(--mu)}
.v3 .fg-v{margin:0;font-size:22px;line-height:1.2;font-weight:650}.v3 .fg-v.ev{color:var(--ev)}.v3 .fg-v.cu{color:var(--cu)}
.v3 .fg-s,.v3 .fg-note{margin:0;font-size:13px;color:var(--mu)}
.v3 .stale{margin-left:4px;padding:1px 6px;border:1px solid var(--cu);color:var(--cu);border-radius:3px;font-size:11px;font-weight:600}
.v3 .bar3{position:relative;height:86px;margin:18px 44px 6px}
.v3 .bar3-line{position:absolute;left:0;right:0;top:34px;height:2px;background:var(--ln)}
.v3 .iqr{position:absolute;top:-4px;height:10px;background:var(--evbg);border:1px solid var(--ev)}
.v3 .rng{position:absolute;top:-10px;height:6px;background:var(--cubg);border:1px solid var(--cu)}
.v3 .mk{position:absolute;top:0;transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;font-size:11px;line-height:1.25;white-space:nowrap}
.v3 .mk i{width:0;height:36px;border-left:2px solid var(--ev)}.v3 .mk b{font-weight:500;color:var(--mu);margin-top:14px}.v3 .mk em{font-style:normal;font-weight:600;color:var(--ink)}
.v3 .mk-q:nth-of-type(odd) b{margin-top:14px}
.v3 .mk-median i{border-left-width:3px}
.v3 .mk-res i{border-left:2px dotted var(--cu)}.v3 .mk-ask i{border-left:2px dashed var(--cu)}
.v3 .mk-res b,.v3 .mk-ask b{color:var(--cu)}
.v3 .tabs3{display:flex;gap:4px;margin:14px 0 0;border-bottom:1px solid var(--ln)}
.v3 .tabs3 button{border:0;border-bottom:2px solid transparent;background:none;font:inherit;padding:9px 14px;color:var(--mu);cursor:pointer;margin-bottom:-1px}
.v3 .tabs3 button[aria-selected="true"]{color:var(--ink);font-weight:600;border-bottom-color:var(--ev)}
.v3 .tabs3 button:focus-visible{outline:2px solid var(--ev);outline-offset:-2px}
.v3 .pn{padding:18px 0;min-height:320px}.v3 .pn[hidden]{display:none}
.v3 .cu-sec{margin:0 0 22px;scroll-margin-top:120px}.v3 .cu-sec h2{margin:0 0 8px;font-size:15px;color:var(--cu)}
.v3 .ins{display:flex;gap:14px;flex-wrap:wrap}.v3 .in{display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--mu)}
.v3 .in input{width:160px;height:36px;padding:0 10px;border:1px solid var(--cu);border-radius:4px;font:inherit;font-size:15px;color:var(--ink);background:var(--pn)}.v3 .in input:focus{outline:2px solid var(--cu);outline-offset:1px}
@media (max-width:1100px){.v3 .figs{grid-template-columns:repeat(2,minmax(0,1fr))}.v3 .sk-tabs{margin-left:0}}
@media (max-width:760px){.v3 .figs{grid-template-columns:1fr}.v3 .stk{margin:0 -16px;padding:6px 16px}.v3 .bar3{height:100px}}
.v3 .fg-l{margin:0;padding-left:16px;font-size:13px}.v3 .fg-l li{margin:1px 0}
.v3 .veh{display:grid;gap:26px}.v3 .veh h2{margin:0 0 8px;font-size:12px;letter-spacing:.07em;text-transform:uppercase;color:var(--mu)}
.v3 .facts{width:100%;border-collapse:collapse;background:var(--pn);border:1px solid var(--ln)}.v3 .facts th{width:170px;text-align:left;font-weight:500;color:var(--mu);padding:7px 12px;border-bottom:1px solid var(--ln2)}.v3 .facts td{padding:7px 12px;border-bottom:1px solid var(--ln2)}
.v3 .facts td.src{width:160px}.v3 .facts td.act{width:60px;text-align:right}.v3 .nc{color:var(--mu)}.v3 .cand{display:block;font-size:12px;color:var(--mu)}
.v3 .chip{display:inline-block;padding:1px 8px;border:1px solid var(--ln);border-radius:10px;font-size:12px;color:var(--mu);margin-right:6px}.v3 .chip.ok{border-color:var(--ev);color:var(--ev)}
.v3 .lnk{border:0;background:none;color:var(--ink);text-decoration:underline;text-underline-offset:3px;font:inherit;font-size:13px;cursor:pointer;padding:2px 4px}.v3 .lnk:disabled{color:var(--mu);text-decoration:none;cursor:default}
.v3 .btn{height:30px;padding:0 12px;border:1px solid var(--ln);border-radius:4px;background:var(--pn);font:inherit;font-size:13px;cursor:pointer;margin-left:6px}.v3 .btn:hover{border-color:var(--ink)}
.v3 .ed{height:30px;width:min(320px,60%);padding:0 8px;border:1px solid var(--ln);border-radius:4px;font:inherit}
.v3 .gal{display:flex;flex-wrap:wrap;gap:10px}.v3 .ph{margin:0;width:150px}.v3 .ph-i{display:block;width:150px;height:88px;padding:0;border:1px solid var(--ln);background:var(--ln2);cursor:zoom-in;overflow:hidden}.v3 .ph-i img{width:100%;height:100%;object-fit:cover;display:block}
.v3 .ph.cover .ph-i{outline:2px solid var(--ev);outline-offset:-2px}.v3 .ph figcaption{display:flex;justify-content:space-between;align-items:center;font-size:12px;margin-top:3px}
.v3 .up{display:inline-block;margin-top:10px;font-size:13px;cursor:pointer;text-decoration:underline;text-underline-offset:3px}.v3 .up input{display:none}
.v3 .nds,.v3 .docs{list-style:none;margin:0;padding:0;border:1px solid var(--ln);background:var(--pn)}
.v3 .nd{display:flex;align-items:center;flex-wrap:wrap;gap:6px 12px;padding:9px 12px;border-bottom:1px solid var(--ln2)}.v3 .nd.done{color:var(--mu)}.v3 .nd-l{flex:1 1 240px;font-weight:500}.v3 .nd-s{font-size:12px;color:var(--mu)}
.v3 .docs li{padding:9px 12px;border-bottom:1px solid var(--ln2)}
.v3 .lb{position:fixed;inset:0;z-index:60;background:rgba(20,24,22,.86);display:flex;align-items:center;justify-content:center}.v3 .lb[hidden]{display:none}.v3 .lb img{max-width:90vw;max-height:86vh}.v3 .lb-x{position:absolute;top:16px;right:20px;border:1px solid #fff;background:none;color:#fff;padding:6px 12px;border-radius:4px;cursor:pointer;font:inherit}
.v3 .msg{margin:0 0 12px;padding:8px 12px;border:1px solid var(--cu);background:var(--cubg);color:var(--cu)}
@media (max-width:760px){.v3 .facts,.v3 .facts tbody{display:block}.v3 .facts tr{display:grid;grid-template-columns:minmax(0,1fr) auto;padding:6px 12px;border-bottom:1px solid var(--ln2)}.v3 .facts th,.v3 .facts td{display:block;width:auto!important;border:0;padding:2px 0;min-width:0;overflow-wrap:anywhere}.v3 .facts th{grid-column:1/-1;font-size:12px}.v3 .facts td.act{text-align:right}.v3 .ph{width:46%}.v3 .ph-i{width:100%}.v3 .nd-a{flex:1 0 100%}.v3 .btn{margin:0 6px 0 0}}
.v3 .mk4{display:grid;grid-template-columns:minmax(0,1fr);gap:26px}.v3 .mkt{min-width:0}.v3 .mk4 h2{margin:0 0 8px;font-size:12px;letter-spacing:.07em;text-transform:uppercase;color:var(--mu)}.v3 .mk4 h3{margin:0 0 6px;font-size:14px}
.v3 .evg{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.v3 .evc{padding:12px 14px;background:var(--pn);border:1px solid var(--ln);border-top:3px solid var(--ev)}
.v3 .evc dl{margin:0}.v3 .evc dl div{display:flex;justify-content:space-between;gap:12px;padding:4px 0;border-bottom:1px solid var(--ln2)}.v3 .evc dt{color:var(--mu)}.v3 .evc dd{margin:0;font-weight:600;text-align:right}
.v3 .tw{overflow-x:auto;border:1px solid var(--ln);background:var(--pn)}.v3 .cps{width:100%;border-collapse:collapse}.v3 .cps td{padding:8px 10px;border-bottom:1px solid var(--ln2);vertical-align:top}
.v3 .cp-ph{width:96px}.v3 .cp-ph img{width:88px;height:58px;object-fit:cover;display:block;border:1px solid var(--ln)}.v3 .cp-t b{display:block}.v3 .cp-t span,.v3 .cp-s span{display:block;color:var(--mu);font-size:13px}.v3 .cp-s{white-space:nowrap;font-weight:600}.v3 .cp-a{white-space:nowrap;font-size:13px}.v3 .cp-a .lnk{margin-left:8px}
.v3 .cp.ex td{color:var(--mu);background:var(--bg)}.v3 .cp.ex img{opacity:.45}.v3 .cp.ex .cp-t b{text-decoration:line-through}.v3 .cp-x{display:block;font-style:normal;font-size:12px;color:var(--cu);margin-top:2px}
.v3 .cp.outpop .cp-s{color:var(--mu)}.v3 .xf{display:flex;flex-wrap:wrap;gap:8px;align-items:end;margin-top:6px}.v3 .xf label{font-size:12px;color:var(--mu);display:flex;flex-direction:column;gap:2px}.v3 .xf input,.v3 .xf select{height:30px;border:1px solid var(--cu);border-radius:4px;padding:0 6px;font:inherit}.v3 .xf .btn:disabled{opacity:.5;cursor:default}
.v3 .qt,.v3 .lv{width:100%;border-collapse:collapse;background:var(--pn);border:1px solid var(--ln)}.v3 .qt th,.v3 .qt td,.v3 .lv td{padding:7px 12px;border-bottom:1px solid var(--ln2);text-align:left;font-weight:400}.v3 .qt th{font-weight:600}
.v3 .ol{margin:0;padding:10px 12px 10px 28px;background:var(--pn);border:1px solid var(--ln)}
@media (max-width:760px){.v3 .evg{grid-template-columns:1fr}}
`;
