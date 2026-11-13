// DESK V4 STYLES (Lane E, Nov 10 2026): the stylesheet of docs/desk-mockups/desk-v4.html, copied as drawn (tokens, type, components, light and dark), minus the Design spec view's own rules. Additions at the end are the queue drawer, the New case form and the states the script sets; nothing else is restyled.
export const DESK_V4_CSS = `/* Layout: queue rail | the car and its evidence (scrolls) | one sticky Valuation panel where the number lives and is edited. No tabs. Green = evidence from completed sales. Copper = the analyst's decision. Everything else is neutral. */
:root{
  --page:#f4f5f3; --panel:#ffffff; --sunk:#f0f1ee; --ink:#12171a; --ink2:#3a4246; --mute:#687177; --faint:#9aa1a5; --line:#e2e5e2; --line2:#eef0ed;
  --ev:#1c5a47; --ev-soft:#e3efe9; --ev-dot:#7fae9d; --an:#b25f1c; --an-soft:#f8eadb; --warn:#946200; --warn-soft:#fbf2da; --ok:#1c6b3c; --ok-soft:#e2f1e7; --bar:#0f1f1b; --bar-ink:#e9efec;
  --shadow:0 1px 2px rgba(18,23,26,.05),0 8px 24px rgba(18,23,26,.06);
  --ui:"Instrument Sans",system-ui,-apple-system,"Segoe UI",sans-serif; --serif:"Newsreader",Georgia,"Times New Roman",serif;
}
@media (prefers-color-scheme: dark){ :root:not([data-theme="light"]){
  --page:#101314; --panel:#181c1e; --sunk:#141819; --ink:#eceeed; --ink2:#c9cecd; --mute:#98a1a4; --faint:#6b7377; --line:#2a3033; --line2:#21272a;
  --ev:#86c9b1; --ev-soft:#1b2c27; --ev-dot:#4f8f7b; --an:#e79a5a; --an-soft:#33261a; --warn:#e0b55c; --warn-soft:#30291a; --ok:#84c79a; --ok-soft:#1b2b21; --bar:#0b1513; --bar-ink:#dfe7e4;
  --shadow:0 1px 2px rgba(0,0,0,.3),0 8px 24px rgba(0,0,0,.3); color-scheme:dark } }
:root[data-theme="dark"]{
  --page:#101314; --panel:#181c1e; --sunk:#141819; --ink:#eceeed; --ink2:#c9cecd; --mute:#98a1a4; --faint:#6b7377; --line:#2a3033; --line2:#21272a;
  --ev:#86c9b1; --ev-soft:#1b2c27; --ev-dot:#4f8f7b; --an:#e79a5a; --an-soft:#33261a; --warn:#e0b55c; --warn-soft:#30291a; --ok:#84c79a; --ok-soft:#1b2b21; --bar:#0b1513; --bar-ink:#dfe7e4;
  --shadow:0 1px 2px rgba(0,0,0,.3),0 8px 24px rgba(0,0,0,.3); color-scheme:dark }

*{box-sizing:border-box}
body{background:var(--page);color:var(--ink);font-family:var(--ui);font-size:13.5px;line-height:1.45;padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px));padding-block:0 48px}
h1,h2,h3,h4,p{margin:0}
h1,h2,h3{text-wrap:balance}
button,input,textarea{font:inherit;color:inherit}
a{color:inherit}
.num{font-variant-numeric:tabular-nums}
.eyebrow{font-size:10.5px;letter-spacing:.09em;text-transform:uppercase;color:var(--mute);font-weight:600}
.mute{color:var(--mute)}
.wrap{max-width:1440px;margin:0 auto}
.view[hidden]{display:none}

/* top bar */
.top{background:var(--bar);color:var(--bar-ink);display:flex;align-items:center;gap:18px;padding:0 16px;height:48px;border-radius:0 0 10px 10px;flex-wrap:wrap}
.top .brand{font-weight:600;font-size:14px;letter-spacing:-.01em}
.top .org{opacity:.65;font-weight:400;margin-left:8px;padding-left:10px;border-left:1px solid rgba(255,255,255,.25)}
.top nav{display:flex;gap:2px;margin-left:10px}
.top nav a{font-size:12.5px;padding:5px 11px;border-radius:6px;text-decoration:none;color:var(--bar-ink);opacity:.7}
.top nav a.on{background:rgba(255,255,255,.14);opacity:1}
.top .r{margin-left:auto;display:flex;gap:14px;align-items:center;font-size:12px;opacity:.8}
.top .tag{font-size:11px;padding:2px 8px;border-radius:4px;background:rgba(255,255,255,.12)}

/* workspace grid */
.ws{display:grid;grid-template-columns:232px minmax(0,1fr) 372px;gap:18px;margin-top:16px;align-items:start}
.card{background:var(--panel);border:1px solid var(--line);border-radius:12px}
.card.pad{padding:16px 18px}
.sec-h{display:flex;align-items:baseline;justify-content:space-between;gap:10px;margin-bottom:12px;flex-wrap:wrap}
.sec-h h3{font-size:14px;font-weight:600;letter-spacing:-.005em}
.sec-h .act{display:flex;gap:6px;align-items:center;font-size:12px;color:var(--mute);flex-wrap:wrap}
.btn{height:32px;padding:0 12px;border-radius:8px;border:1px solid var(--line);background:var(--panel);cursor:pointer;font-size:12.5px;font-weight:500;white-space:nowrap}
.btn:hover{border-color:var(--faint)}
.btn.sm{height:26px;padding:0 9px;font-size:12px;border-radius:6px}
.btn.pri{background:var(--ink);color:var(--panel);border-color:var(--ink)}
.btn.pri:disabled{opacity:.4;cursor:not-allowed}
.btn:focus-visible,.seg button:focus-visible,input:focus-visible,textarea:focus-visible{outline:2px solid var(--an);outline-offset:1px}
.link{background:none;border:0;padding:0;color:var(--mute);text-decoration:underline;text-underline-offset:3px;cursor:pointer;font-size:12px}

/* queue */
.queue{position:sticky;top:10px;padding:12px 10px;max-height:calc(100vh - 20px);overflow-y:auto;overscroll-behavior:contain}
.queue .new{width:100%;margin-bottom:10px}
.queue input{width:100%;height:32px;border:1px solid var(--line);border-radius:8px;background:var(--sunk);padding:0 10px;font-size:12.5px;margin-bottom:6px}
.qg{font-size:11px;letter-spacing:.04em;color:var(--mute);font-weight:600;display:flex;justify-content:space-between;padding:12px 8px 4px}
.qf{display:flex;gap:4px;margin:2px 0 4px}
.qf button{flex:1;height:28px;border:1px solid var(--line);border-radius:8px;background:var(--panel);font-size:12px;color:var(--mute);cursor:pointer}
.qf button.on{background:var(--ev-soft);border-color:var(--ev-dot);color:var(--ev);font-weight:600}
.qi{position:relative;border-radius:8px}
.qi:hover,.qi:focus-within{background:var(--sunk)}.qi.on{background:var(--an-soft)}
.qi[hidden]{display:none}
.qi .qa{display:grid;grid-template-columns:44px minmax(0,1fr);gap:10px;padding:0 30px 0 8px;height:56px;box-sizing:border-box;align-items:center;text-decoration:none;color:inherit;border-radius:8px}
.qi .qa:focus-visible{outline:2px solid var(--ev);outline-offset:-2px}
.qi .ph{width:44px;height:44px;box-sizing:border-box;border-radius:6px;background:var(--sunk) center/cover;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;overflow:hidden}
.qi .ph.none{border:1px solid var(--line);color:var(--ink2);font-family:var(--serif)}
.qi .ph .ty{font-style:normal;font-size:10px;line-height:1;color:var(--mute)}.qi .ph .tm{font-size:17px;line-height:1;font-weight:600;color:var(--ink2)}
.qi .qt{min-width:0;display:grid;gap:3px}
.qi .qn{display:block;font-size:13px;font-weight:500;line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.qi .q2{display:flex;gap:5px;align-items:center;min-width:0;font-size:11.5px;color:var(--mute);line-height:1.3;white-space:nowrap}
.qi .q2 .tag{flex:none;display:inline-block;margin:0;font-size:9.5px;font-weight:500;letter-spacing:0;text-transform:none;line-height:1.4;padding:0 5px;border-radius:999px;white-space:nowrap}
.qi .q2 i{font-style:normal}.qi .qsel{flex:0 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.qi .qsel.none{color:var(--faint)}.qi .qage{flex:none;margin-left:auto;white-space:nowrap}
.qk{position:absolute;right:4px;top:8px;width:24px;height:24px;border:0;border-radius:6px;background:transparent;color:var(--mute);font-size:16px;line-height:1;cursor:pointer;opacity:0}
.qi:hover .qk,.qi:focus-within .qk,.qk[aria-expanded="true"]{opacity:1}.qk:hover{background:var(--line2)}
@media (hover:none),(max-width:1100px){.qk{opacity:1}}
.qm{position:absolute;right:4px;top:34px;z-index:5;min-width:128px;display:grid;padding:4px;background:var(--panel);border:1px solid var(--line);border-radius:8px}
.qm[hidden],.qc[hidden],.qe[hidden]{display:none}
.qm button{border:0;background:transparent;text-align:left;font-size:12.5px;padding:7px 10px;border-radius:6px;cursor:pointer}.qm button:hover,.qm button:focus-visible{background:var(--sunk)}
.qi[data-archived="1"] [data-op="archive"],.qi:not([data-archived="1"]) [data-op="restore"]{display:none}
.qc{display:flex;gap:6px;align-items:center;flex-wrap:wrap;padding:4px 8px 8px 62px;font-size:12px;color:var(--ink2)}
.qc .dng{color:var(--warn);border-color:var(--warn)}
.qe{margin:0;padding:0 8px 8px 62px;font-size:12px;color:var(--warn)}
.qi.busy{opacity:.5}
.qarch{margin-top:6px;border-top:1px solid var(--line2)}
.qgh{width:100%;border:0;background:transparent;cursor:pointer;text-align:left}.qgh::after{content:"\\25B8";margin-left:6px}.qgh[aria-expanded="true"]::after{content:"\\25BE"}
.qgh span:first-child{flex:1}
.qarch[hidden],.qgrp[hidden]{display:none}
.today .trow{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px}
.today .tt{font-family:var(--serif);font-weight:600;font-size:26px;letter-spacing:-.01em}
.ttiles{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-top:10px}
.tl{border:1px solid var(--line);border-radius:10px;padding:12px 14px;background:var(--panel);display:flex;flex-direction:column;gap:4px;min-width:0}
.tl .tlab{font-size:10.5px;letter-spacing:.06em;text-transform:uppercase;color:var(--mute);font-weight:600}
.tl .tval{font-family:var(--serif);font-size:30px;font-weight:600;line-height:1.05;color:var(--ink)}
.tl .tsub{font-size:11.5px;color:var(--mute)}
.tstats .tval{font-size:22px}
@media (max-width:760px){.ttiles{grid-template-columns:repeat(2,minmax(0,1fr))}}

/* center */
.col{display:grid;gap:16px;min-width:0}
.casehead{display:flex;gap:14px;align-items:flex-end;justify-content:space-between;flex-wrap:wrap;padding:2px 2px 0}
.casehead h1{font-family:var(--serif);font-weight:600;font-size:28px;letter-spacing:-.01em;line-height:1.1}
.casehead .spec{color:var(--mute);margin-top:4px}
.casehead .meta{display:flex;gap:16px;font-size:12px;color:var(--mute);flex-wrap:wrap;align-items:center}
.casehead .who{flex-basis:100%;display:grid;gap:2px;font-size:12px;color:var(--mute)}
.casehead .wl{display:flex;gap:0;flex-wrap:wrap}.casehead .wk{margin-right:8px}
.casehead .wv{color:var(--ink)}.casehead .wv+.wv::before{content:", ";color:var(--mute)}
.facts .v.ro{align-self:center;overflow-wrap:anywhere}
.casehead .meta b{color:var(--ink);font-weight:500}
.pill{font-size:11.5px;font-weight:500;padding:3px 9px;border-radius:999px;background:var(--an-soft);color:var(--an)}

.car{display:grid;grid-template-columns:minmax(0,5fr) minmax(0,6fr);gap:18px}
.hero{aspect-ratio:3/2;max-width:100%;border-radius:10px;background:var(--sunk) center/cover;position:relative}
.hero span{position:absolute;left:10px;bottom:10px;font-size:11px;background:rgba(15,31,27,.72);color:#fff;padding:3px 8px;border-radius:5px}
.thumbs{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-top:8px}
.th{aspect-ratio:4/3;max-width:100%;border-radius:6px;background:var(--sunk) center/cover;position:relative;cursor:pointer;border:2px solid transparent}
.th.inr{border-color:var(--ev)}
.th.inr::after{content:"✓";position:absolute;right:3px;top:3px;width:15px;height:15px;border-radius:50%;background:var(--ev);color:var(--panel);font-size:10px;display:flex;align-items:center;justify-content:center}
.th.add{border:1.5px dashed var(--line);display:flex;align-items:center;justify-content:center;font-size:18px;color:var(--mute);background:none}
.photobar{display:flex;justify-content:space-between;align-items:center;margin-top:8px;font-size:12px;color:var(--mute);gap:8px;flex-wrap:wrap}
.facts{display:grid;grid-template-columns:max-content minmax(0,1fr);gap:0 12px;font-size:13px;align-content:start}
.facts>.k,.facts>.v{padding:6px 0;border-top:1px solid var(--line2)}
.facts>.k:first-child,.facts>.k:first-child+.v{border-top:0}
.facts .marks{grid-column:2;display:flex;gap:6px;flex-wrap:wrap;align-items:center;padding:0 0 4px}.facts .marks:empty{display:none}
.facts .k.long{grid-column:1/-1;padding-bottom:0}.facts .v.long{grid-column:1/-1;border-top:0;padding-top:2px}.facts .marks.long{grid-column:1/-1}
.facts .k{color:var(--mute)}
.facts .v{font-weight:500;min-width:0}
.facts .v input{border:0;background:none;width:100%;padding:0;font-weight:500}
.chip{font-size:10.5px;font-weight:500;padding:1px 7px;border-radius:4px;background:var(--sunk);color:var(--mute);white-space:nowrap;align-self:center;justify-self:start}
.chip.ok{background:var(--ok-soft);color:var(--ok)}
.chip.warn{background:var(--warn-soft);color:var(--warn)}
.notes{margin-top:12px;font-size:13px;color:var(--ink2);background:var(--sunk);border-radius:8px;padding:10px 12px}
.notes b{display:block;font-size:10.5px;letter-spacing:.09em;text-transform:uppercase;color:var(--mute);font-weight:600;margin-bottom:3px}
.docs{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
.doc{border:1px solid var(--line);border-radius:8px;padding:9px 11px;font-size:12.5px;display:grid;gap:2px;min-width:0}
.doc b{font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.doc span{font-size:11.5px;color:var(--mute)}
.doc.drop{border:1.5px dashed var(--line);color:var(--mute);align-content:center;text-align:center;cursor:pointer}

/* market */
.mk-sum{display:flex;gap:26px;flex-wrap:wrap;align-items:flex-end;margin-bottom:6px}
.mk-sum .big{font-family:var(--serif);font-size:26px;font-weight:600;color:var(--ev);line-height:1}
.mk-sum .st b{display:block;font-size:15px;font-weight:600}
.mk-sum .st span{font-size:11.5px;color:var(--mute)}
.seg{display:inline-flex;background:var(--sunk);border-radius:8px;padding:2px;gap:2px}
.seg button{border:0;background:none;height:26px;padding:0 10px;border-radius:6px;font-size:12px;color:var(--mute);cursor:pointer;font-weight:500;white-space:nowrap}
.seg button.on{background:var(--panel);color:var(--ink);box-shadow:0 1px 2px rgba(0,0,0,.08)}
.seg button small{font-weight:400;opacity:.75;margin-left:3px}
#plot{width:100%;display:block;touch-action:none;cursor:ew-resize;margin-top:4px}
.legend{display:flex;gap:14px;flex-wrap:wrap;font-size:11.5px;color:var(--mute);margin-top:2px}
.legend i{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:5px;vertical-align:-1px}
.rungline{font-size:12.5px;color:var(--ink2);margin-top:8px;min-height:19px}
.illus{font-size:10.5px;color:var(--warn);background:var(--warn-soft);padding:1px 6px;border-radius:4px;margin-left:6px}

.comp{display:grid;grid-template-columns:84px minmax(0,1fr) auto;gap:12px;padding:10px 0;border-top:1px solid var(--line2);align-items:center}
.comp:first-of-type{border-top:0}
.comp .im{width:84px;aspect-ratio:4/3;border-radius:6px;background:var(--sunk) center/cover}
.comp .t{font-weight:500}
.comp .m{font-size:12px;color:var(--mute)}
.comp .w{font-size:12px;color:var(--ink2);margin-top:2px}
.comp .rgt{text-align:right;display:grid;gap:5px;justify-items:end}
.comp .pr{font-family:var(--serif);font-size:19px;font-weight:600}
.comp label{font-size:12px;color:var(--mute);display:flex;gap:5px;align-items:center;cursor:pointer}
.comp.ex{opacity:.45}
.comp .rel{font-size:10.5px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;color:var(--ev);background:var(--ev-soft);padding:1px 6px;border-radius:4px;margin-left:6px}
.exf{grid-column:2/-1;display:none;gap:6px;flex-wrap:wrap}
.exf.on{display:flex}
.exf input{flex:1;min-width:160px;height:30px;border:1px solid var(--line);border-radius:6px;padding:0 9px;background:var(--panel)}
input[type=checkbox]{accent-color:var(--ev);width:14px;height:14px}
.steps{display:grid;gap:6px}
.steps .s{display:grid;grid-template-columns:20px 1fr auto;gap:8px;align-items:center}
.steps .s span{color:var(--mute);font-size:12px;text-align:right}
.steps .s input{height:32px;border:1px solid var(--line);border-radius:8px;padding:0 10px;background:var(--panel);width:100%}
.own-h h3{font-family:var(--serif);font-weight:600;font-size:17px}.own-h h3:empty{display:none}
.ownrows{list-style:none;margin:6px 0 0;padding:0;display:grid;gap:6px;font-size:13px}.ownrows:empty{display:none}.ownrow a{color:var(--ink);text-decoration:none}.ownrow a:hover{text-decoration:underline}
.ownlive{display:flex;flex-wrap:wrap;gap:4px 12px;align-items:baseline;margin-top:10px;padding-top:10px;border-top:1px solid var(--line);font-size:13px}.ownlive[hidden]{display:none}.ownlive a{color:var(--ink);font-weight:500}.ownlive .ownx{color:var(--mute)}
.ownchip{font-size:10.5px;letter-spacing:.06em;text-transform:uppercase;font-weight:600;color:var(--panel);background:var(--ev);border-radius:6px;padding:2px 7px}
#s-own[hidden]{display:none}
.live{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}
.lv{text-decoration:none;color:inherit;border:1px solid var(--line);border-radius:8px;padding:9px 11px;font-size:12.5px;min-width:0;display:block}
.lv b{display:block;font-weight:500}
.lv .f{font-family:var(--serif);font-size:17px;font-weight:600;margin-top:2px}
.lv span{font-size:11px;color:var(--mute)}

/* valuation panel */
.val{position:sticky;top:10px;box-shadow:var(--shadow);overflow:hidden;display:flex;flex-direction:column;max-height:calc(100vh - 82px)}
.val .hd{padding:14px 18px 12px;border-bottom:1px solid var(--line)}
.val .numrow{display:flex;align-items:baseline;gap:2px;margin-top:4px}
.val .numrow span{font-family:var(--serif);font-size:30px;color:var(--an);font-weight:600}
#valIn{font-family:var(--serif);font-size:44px;font-weight:600;color:var(--an);border:0;border-bottom:2px solid transparent;background:none;width:100%;padding:0;letter-spacing:-.01em;line-height:1.05}
#valIn:hover{border-bottom-color:var(--an-soft)}
#valIn:focus{outline:none;border-bottom-color:var(--an)}
.val .range{display:flex;gap:6px;align-items:center;font-size:12.5px;color:var(--mute);margin-top:6px}
.val .range input{width:86px;height:28px;border:1px solid var(--line);border-radius:6px;padding:0 8px;background:var(--panel);font-weight:500}
.val .diff{font-size:12.5px;color:var(--ink2);margin-top:6px}
.val .mkt{margin-top:8px;padding:7px 11px;background:var(--ev-soft);border-radius:8px;font-size:12.5px;color:var(--ev)}
.val .mkt b{font-weight:600}
.val .bd{padding:14px 18px;flex:1 1 auto;min-height:0;overflow:auto;display:flex;flex-direction:column}.val .bd>[role="tabpanel"]{display:grid;gap:14px;align-content:start;flex:1 0 auto;min-height:0}.val .bd>[role="tabpanel"][hidden]{display:none}
.fld label{display:flex;justify-content:space-between;font-size:12px;color:var(--mute);margin-bottom:5px}
.fld textarea{width:100%;min-height:84px;border:1px solid var(--line);border-radius:8px;padding:8px 10px;background:var(--panel);resize:vertical}
.fld .money{display:flex;align-items:center;gap:6px}
.fld .money input{width:120px;height:32px;border:1px solid var(--line);border-radius:8px;padding:0 10px;background:var(--panel);font-weight:600}
.fld .hint{font-size:12px;color:var(--mute);margin-top:5px}
.fld .hint.warn{color:var(--warn)}
.seg.full{display:grid;grid-template-columns:repeat(4,1fr);width:100%}
.seg.full button{height:44px;display:grid;align-content:center;line-height:1.15;padding:0 4px;position:relative}
.seg.full button small{display:block;margin:0;font-size:10.5px}
.seg.full button.sug::before{content:"";position:absolute;top:5px;right:6px;width:6px;height:6px;border-radius:50%;background:var(--ev)}
.att{display:grid;gap:6px}
.att .i{display:flex;gap:8px;align-items:center;font-size:12.5px;padding:7px 9px;border-radius:8px;background:var(--warn-soft);color:var(--ink)}
.att .i.need{flex-wrap:wrap;align-items:flex-start}
.att .i .nl{flex:1 1 100%;min-width:0;overflow-wrap:anywhere}
.att .i.need .x{margin-left:0;flex:1 1 100%;min-width:0;display:flex;flex-wrap:wrap;gap:6px;align-items:center}
.att .i .nstate{flex:1 1 100%;min-width:0}
.att .i .nb{display:flex;gap:6px;flex:1 1 100%;flex-wrap:wrap}
.att .i .nb .btn{white-space:nowrap}
.att .i .nmsg{flex:1 1 100%;margin:0}
.att .i.done{background:var(--ok-soft);color:var(--mute)}
.att .i .x{margin-left:auto;display:flex;gap:4px}
.val .ft{padding:14px 18px;border-top:1px solid var(--line);background:var(--sunk);display:grid;gap:8px}
.val .ft .row{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.val .ft .btn{height:38px;font-size:13.5px}
.val .ft small{font-size:11.5px;color:var(--mute);text-align:center}
.val .hi{display:flex;gap:8px;align-items:flex-start;margin-top:8px;font-size:12.5px;background:var(--warn-soft);color:var(--ink);border-radius:8px;padding:8px 10px;cursor:pointer}
.fld input.txt{width:100%;height:32px;border:1px solid var(--line);border-radius:8px;padding:0 10px;background:var(--panel)}
.chk{display:grid;gap:2px;font-size:12px;line-height:1.3;color:var(--mute);padding:8px 18px;border-bottom:1px solid var(--line)}.chk:empty{display:none}
.chk div::before{content:"✓";color:var(--ok);font-weight:600;margin-right:7px}
.chk div.no{color:var(--warn)}
.chk div.no::before{content:"!";color:var(--warn)}
.comp .t a,.lv a{color:inherit;text-decoration:none}
.comp .t a:hover,.lv a:hover b{text-decoration:underline}
.comp .im.none{display:flex;align-items:center;justify-content:center;font-size:10px;color:var(--faint);border:1px dashed var(--line);background:none}
.fin{display:none;font-size:12.5px;color:var(--ok);background:var(--ok-soft);border-radius:8px;padding:9px 11px}
.fin.on{display:block}

/* report */
.rep{max-width:860px;margin:18px auto 0;display:grid;gap:22px}
.pg{background:#fff;color:#14181a;border:1px solid var(--line);aspect-ratio:8.5/11;max-width:100%;position:relative;display:flex;flex-direction:column;overflow:hidden;box-shadow:var(--shadow);font-size:12.5px;--rev:#1c5a47;--ran:#b25f1c;--rm:#687177;--rl:#e2e5e2;--rs:#f4f5f3}
.pg .in{padding:30px 46px 46px;display:flex;flex-direction:column;gap:16px;flex:1;min-height:0}
.pg .rhd{display:flex;justify-content:space-between;align-items:center;font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--rm)}
.pg .logo{height:24px;padding:0 11px;border:1.5px solid #14181a;display:flex;align-items:center;font-size:10px;letter-spacing:.14em;font-weight:600;color:#14181a;background:#fff}
.pg .rft{position:absolute;left:46px;right:46px;bottom:16px;display:flex;justify-content:space-between;font-size:9.5px;color:#9aa1a5;border-top:1px solid var(--rl);padding-top:7px}
.pg .wm{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;font-size:120px;font-weight:600;letter-spacing:.2em;color:#14181a;opacity:.045;transform:rotate(-24deg);z-index:3}
.pg h2{font-family:var(--serif);font-weight:600;font-size:27px;line-height:1.12;letter-spacing:-.01em}
.pg h3{font-family:var(--serif);font-weight:600;font-size:16px;margin-bottom:6px}
.pg .ey{font-size:10px;letter-spacing:.11em;text-transform:uppercase;color:var(--rm);font-weight:600}
.p1img{flex:0 0 47%;background:var(--rs) center/cover;position:relative}
.p1img .logo{position:absolute;left:46px;top:28px}
.p1img .ref{position:absolute;right:46px;top:34px;font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:#fff;text-shadow:0 1px 3px rgba(0,0,0,.5)}
.p1t h2{font-size:36px}
.p1t .sp{color:var(--rm);margin-top:4px}
.p1v{display:grid;grid-template-columns:1fr 1.2fr;gap:26px;border-top:2px solid #14181a;padding-top:14px}
.p1v .v{font-family:var(--serif);font-size:54px;font-weight:600;color:var(--ran);line-height:1;margin-top:6px}
.p1v .v.sm{font-size:28px;color:#14181a}
.p1v p{font-size:11.5px;color:var(--rm);margin-top:7px;line-height:1.45}
.tiles{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
.tile{background:var(--rs);border-radius:6px;padding:10px 12px}
.tile b{display:block;font-family:var(--serif);font-size:18px;font-weight:600}
.tile span{font-size:10.5px;color:var(--rm)}
.lead{font-size:13px;line-height:1.55}
.strip{position:relative;height:150px;margin-top:6px}
.two{display:grid;grid-template-columns:1fr 1fr;gap:22px}
.it{display:grid;grid-template-columns:20px 1fr;gap:9px;padding:8px 0;border-bottom:1px solid var(--rl);font-size:12px}
.it i{width:18px;height:18px;border-radius:50%;background:#e3efe9;color:var(--rev);font-style:normal;font-weight:600;font-size:11px;display:flex;align-items:center;justify-content:center}
.it.c i{background:#fbf2da;color:#946200}
.it b{display:block;font-weight:600}
.it span{color:var(--rm)}
.cbox{display:flex;gap:14px;align-items:center;background:var(--rs);border-radius:6px;padding:11px 14px;font-size:12px}
.cbox b{font-family:var(--serif);font-size:22px;white-space:nowrap}
.pstrip{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}
.pstrip div{aspect-ratio:3/2;border-radius:4px;background:var(--rs) center/cover}
.cg{display:grid;gap:16px}
.cg.n2{grid-template-columns:repeat(2,1fr)}.cg.n3{grid-template-columns:repeat(3,1fr)}.cg.n4{grid-template-columns:repeat(2,1fr)}.cg.n4 .im{aspect-ratio:16/9}.cg.n1{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}
.cc{display:flex;flex-direction:column;gap:5px;min-width:0}
.cc .im{aspect-ratio:3/2;width:100%;border-radius:4px;background:var(--rs) center/cover}
.cc .l1{display:flex;justify-content:space-between;align-items:baseline;gap:8px}
.cc .pr{font-family:var(--serif);font-size:19px;font-weight:600}
.cc .l1{flex-wrap:wrap}
.cc .m{font-size:10.5px;color:var(--rm)}
.cc .nm{font-weight:600}
.cc .w{font-size:11.5px;color:var(--rm)}
.cc a{font-size:10.5px;color:var(--rev)}
.about{background:var(--rs);border-radius:6px;padding:11px 14px;font-size:11.5px;color:var(--rm);line-height:1.5;margin-top:auto}
.about b{display:block;color:#14181a;font-size:10px;letter-spacing:.11em;text-transform:uppercase;margin-bottom:3px}
.nsteps{display:grid;gap:0;margin-top:2px}
.ns{display:grid;grid-template-columns:54px 1fr;gap:14px;align-items:center;padding:14px 0;border-bottom:1px solid var(--rl)}
.ns b{font-family:var(--serif);font-size:38px;font-weight:600;color:var(--ran);line-height:1}
.ns span{font-size:15px;line-height:1.4}
.cc:not(:has(.im)){border-top:2px solid #14181a;padding-top:10px}
.bars{display:flex;align-items:flex-end;gap:8px;height:130px;border-bottom:1px solid var(--rl)}
.bars i{flex:1;background:#7fae9d;border-radius:3px 3px 0 0;position:relative;display:block}
.bars i span{position:absolute;top:-15px;left:50%;transform:translateX(-50%);font-size:10px;color:var(--rm);white-space:nowrap}
.ax{display:flex;justify-content:space-between;font-size:10px;color:var(--rm);margin-top:4px}
.lvr{display:flex;justify-content:space-between;gap:8px;padding:6px 0;border-bottom:1px solid var(--rl);font-size:12px}
.lvr span{font-size:10px;letter-spacing:.07em;text-transform:uppercase;color:var(--rm);white-space:nowrap}
.pg ol{margin:0;padding-left:18px;display:grid;gap:7px;font-size:12.5px}
.contact{border-top:1px solid var(--rl);padding-top:10px;font-size:11.5px;color:var(--rm);display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:auto}
.contact b{color:#14181a}

@media (max-width:1100px){
  .ws{grid-template-columns:minmax(0,1fr)}
  .val{position:static;order:-1}
  .car,.g2,.two,.p1v{grid-template-columns:1fr}
  .cg.n2,.cg.n3,.cg.n4,.cg.n1{grid-template-columns:1fr 1fr}
  .pstrip{grid-template-columns:1fr 1fr}
  .docs{grid-template-columns:1fr 1fr}
  .live{grid-template-columns:1fr 1fr}
  .thumbs{grid-template-columns:repeat(4,1fr)}
  .pg{aspect-ratio:auto}
  .pg .in{padding:22px 20px 44px}
  .pg .rft{left:20px;right:20px}
  .p1img{flex:0 0 auto;aspect-ratio:3/2}
  .p1img .logo{left:20px}.p1img .ref{right:20px}
  .pg .wm{font-size:64px}
  .tiles{grid-template-columns:1fr}
  .comp{grid-template-columns:64px minmax(0,1fr)}
  .comp .im{width:64px}
  .comp .rgt{grid-column:2;justify-items:start;text-align:left}
  #valIn{font-size:38px}
}
/* additions: not in the mockup */
.seg button.on{box-shadow:none;outline:1px solid var(--line)}.pg{box-shadow:none}   /* the Reserve panel is the only element with a shadow */
.qopen{display:none;height:30px;padding:0 10px;border-radius:6px;border:1px solid rgba(255,255,255,.3);background:none;color:var(--bar-ink);font-size:12.5px;cursor:pointer}
.qscrim{display:none}
.queue .qi{text-decoration:none;color:inherit}.queue .qi[hidden]{display:none}.queue .qnone{font-size:12px;color:var(--mute);padding:8px}
.col>.newcase{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:16px 18px}.col>.newcase[hidden]{display:none}
.newcase h2{font-size:14px;font-weight:600}.newcase .fg-s{font-size:12px;color:var(--mute);margin-top:3px}
.nc-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-top:12px}
.newcase .in{display:grid;gap:4px;font-size:12px;color:var(--mute)}.newcase .in.wide{margin-top:10px}
.newcase input[type=text],.newcase textarea{width:100%;border:1px solid var(--line);border-radius:8px;padding:7px 10px;background:var(--panel)}
.newcase .dbar{display:flex;gap:8px;align-items:center;margin-top:12px;flex-wrap:wrap}
.top nav button{font:inherit;font-size:12.5px;padding:5px 11px;border-radius:6px;border:0;background:none;color:var(--bar-ink);opacity:.7;cursor:pointer}.top nav button.on{background:rgba(255,255,255,.14);opacity:1}
.top nav button:focus-visible{outline:2px solid var(--bar-ink);outline-offset:1px}
@media (max-width:1100px){
  .qopen{display:inline-block}
  .queue{display:block;position:fixed;left:0;top:0;bottom:0;width:272px;max-width:86vw;z-index:40;overflow:auto;border-radius:0 12px 12px 0;transform:translateX(-105%);visibility:hidden;transition:transform .18s}
  .queue.open{transform:none;visibility:visible}
  .qscrim.on{display:block;position:fixed;inset:0;z-index:30;background:rgba(15,31,27,.45)}
}
@media (max-width:700px){.nc-grid{grid-template-columns:1fr 1fr}}
#dockind{height:26px;margin-left:8px;border:1px solid var(--line);border-radius:6px;background:var(--panel);color:var(--ink);font:inherit;font-size:12px;padding:0 6px}
.hi[hidden],.mkt[hidden],.fin:not(.on){display:none}
.ncbar{display:flex;gap:8px;align-items:center;margin-top:12px;flex-wrap:wrap}
.pdfbar{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;font-size:12.5px;color:var(--mute)}
.pdfbar a.btn{display:inline-flex;align-items:center;text-decoration:none;color:inherit}
.pdfframe{width:100%;height:calc(100vh - 150px);min-height:520px;border:1px solid var(--line);border-radius:10px;background:var(--panel)}
.val .hd,.val .ft,.val .chk,.val .tabs{flex:none}
.send{display:grid;gap:6px}
.send[hidden],.scrim2[hidden],.sentline[hidden]{display:none}
.send .btn{width:100%}
.send small{font-size:12px;color:var(--mute);text-align:center}
.sentline{font-size:12.5px;color:var(--ok);background:var(--ok-soft);border-radius:8px;padding:9px 11px}
.scrim2{position:fixed;inset:0;z-index:40;background:rgba(15,31,27,.45);display:flex;align-items:center;justify-content:center;padding:16px}
.dlg{width:min(560px,100%);max-height:calc(100vh - 32px);overflow:auto;background:var(--panel);color:var(--ink);border:1px solid var(--line);border-radius:12px;padding:18px;display:grid;gap:12px}
.dlg h3{font-size:15px;font-weight:600}
.dlg .ro{border:1px solid var(--line2);border-radius:8px;padding:8px 10px;background:var(--sunk);font-size:13px;overflow-wrap:anywhere}
.dlg .msg2{white-space:pre-wrap;max-height:200px;overflow:auto}
.dlg .att2{display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap}
.tag{display:inline-block;font-style:normal;font-size:10.5px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:var(--an);background:var(--an-soft);padding:1px 6px;border-radius:4px;margin-top:2px}
.marks{display:flex;gap:4px;align-items:center;flex-wrap:wrap;justify-content:flex-end}
.chip.unv{color:var(--warn);background:var(--warn-soft)}
.marks .link{font-size:11.5px}
.doc.mail{border-color:var(--ev);text-decoration:none;color:inherit}
.idcar{display:grid;gap:8px;margin-top:8px;width:100%}
.idcar .row4{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px}
.idcar .row4 .txt{height:30px}
.att .i.vehicle{flex-wrap:wrap}
@media (max-width:1100px){.val{max-height:calc(100vh - 88px)}}
#sendEarlierBox[hidden]{display:none}
#sendEarlier{display:grid;gap:6px}
#sendEarlier .ro{display:flex;gap:6px;align-items:baseline;flex-wrap:wrap}
#sellerAsk[hidden]{display:none}
.sentline span{display:block}
.sentline span+span{margin-top:4px}
.tag{margin-top:0}
.busy{opacity:.5;transition:opacity .12s}.busy button,.busy input{pointer-events:none}
.seg button.wait{background:var(--panel);color:var(--ink);outline:1px solid var(--an);cursor:progress}
body[data-new] #val{display:block!important}
body[data-new] #val .hd>:not(.eyebrow),body[data-new] #val .bd,body[data-new] #val .ft,body[data-new] #val .chk,body[data-new] #val .tabs{display:none!important}
#swmsg{margin:0 0 8px;font-size:12.5px;color:var(--warn)}#swmsg[hidden]{display:none}
.facts .v input{text-overflow:ellipsis}
#s-market.noplot .legend{display:none}#plot[aria-disabled="true"]{pointer-events:none;cursor:not-allowed}
.winlines{display:grid;gap:2px;margin:0 0 8px;font-size:12.5px;color:var(--mute)}.winlines[hidden]{display:none}
.rmode{border:1px solid var(--line);border-radius:10px;padding:10px 12px;margin-bottom:14px;display:grid;gap:8px}.rmode[hidden]{display:none}
.rmh{font-size:12px;color:var(--mute);font-weight:600}.rmline{margin:0;font-size:13px;line-height:1.4}
.rmc{display:grid;grid-template-columns:1fr 1fr;gap:8px}.rmc>div{background:var(--sunk);border-radius:8px;padding:7px 9px;display:grid;gap:1px;min-width:0}.rmc span{font-size:11px;color:var(--mute)}.rmc b{font-size:15px;font-weight:600}.rmc em{font-style:normal;font-size:11.5px;color:var(--ink2)}
.rmthin{margin:0;font-size:12.5px;color:var(--warn)}.rmthin[hidden],.rmset[hidden]{display:none}.rmset{margin:0;font-size:12.5px;color:var(--ev)}
.rmctl{display:flex;align-items:center;gap:8px;font-size:13px}.rmctl input:disabled+span{color:var(--faint)}
.sellerwords{margin-top:12px}.sellerwords[hidden]{display:none}.sellerwords h4{margin:0 0 6px;font-size:12px;color:var(--mute);font-weight:600}.sellerwords .sw{border-left:3px solid var(--line);padding:2px 0 2px 10px;margin-bottom:8px}.sellerwords .sw b{display:block;font-size:12px;font-weight:500;color:var(--mute)}.sellerwords .sw p{margin:2px 0 0;font-size:13px;white-space:pre-wrap}
.val input.txt,.val textarea{text-overflow:ellipsis}

/* NEW CASE, two steps (Lane S): Newsreader headings, Instrument Sans body, forest green, 8px radius, room to breathe */
.nc{padding:28px 32px}
.nc-h,.nc-title{font-family:var(--serif);font-weight:500;color:var(--ink);letter-spacing:-.01em}
.nc-h{font-size:26px;margin-bottom:18px}
.nc-lead{display:block;font-size:13px;color:var(--mute);margin-bottom:8px}
.nc-startrow{display:flex;gap:10px;align-items:stretch}
.nc-big{flex:1;min-width:0;height:52px;border:1px solid var(--line);border-radius:8px;background:var(--panel);padding:0 16px;font-size:18px}
.nc-big:focus,.nc .txt:focus,.nc textarea:focus,.nc .tagin:focus{outline:2px solid var(--ev-dot);outline-offset:0;border-color:var(--ev)}
.nc-startrow .btn{height:52px;padding:0 26px;font-size:14px}
#nc-msg1{margin-top:10px;font-size:12.5px;color:var(--warn)}#nc-msg1.say{color:var(--mute)}#nc-msg1[hidden]{display:none}
.nc-car{border:1px solid var(--line);border-radius:8px;background:var(--sunk);padding:18px 20px}
.nc-cardtop{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}
.nc-title{font-size:24px;line-height:1.2;overflow-wrap:anywhere}
.nc-vin{margin-top:4px;font-size:13px;color:var(--ink2);letter-spacing:.02em;overflow-wrap:anywhere}
.nc-warnline{margin-top:6px;font-size:12.5px;color:var(--ink);background:var(--warn-soft);border-radius:8px;padding:7px 10px}.nc-warnline[hidden]{display:none}
.nc-src{margin-top:2px;font-size:12px;color:var(--faint)}.nc-src.warn{color:var(--warn)}.nc-src[hidden],.nc-vin[hidden]{display:none}
.nc-tags{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}
.ntag{display:inline-flex;align-items:center;gap:6px;height:28px;padding:0 6px 0 10px;border:1px solid var(--line);border-radius:999px;background:var(--panel);font-size:12.5px}
.ntag i{font-style:normal;color:var(--mute);font-size:11.5px}.ntag b{font-weight:500}.ntag b.empty{color:var(--faint);font-weight:400}
.ntag .pen{border:0;background:transparent;color:var(--faint);cursor:pointer;width:20px;height:20px;border-radius:50%;font-size:12px;line-height:1}.ntag .pen:hover{color:var(--ev);background:var(--ev-soft)}.ntag .pen[hidden]{display:none}
.ntag .tagin{height:22px;border:1px solid var(--line);border-radius:6px;padding:0 6px;background:var(--panel);width:130px;font-size:12.5px}
.nc-sub{font-family:var(--serif);font-weight:500;font-size:18px;margin:26px 0 14px}
.nc2{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px 20px}
.nc2 .nf{margin:0}.nc2 .nf.wide{grid-column:1/-1}
.nc .nf label{display:block;font-size:12.5px;color:var(--ink2);margin:0 0 6px}
.nc .nf input.txt,.nc .nf .unit,.nc .txt,.nc .unit{width:100%;height:40px;border:1px solid var(--line);border-radius:8px;background:var(--panel);padding:0 12px;font-size:13.5px}
.nc .pk{position:relative;display:block}.nc .pk .txt{padding-right:80px;background:var(--panel) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M1 1l4 4 4-4' fill='none' stroke='%23687177' stroke-width='1.4'/%3E%3C/svg%3E") no-repeat right 12px center}
.nc .pk .dtag{position:absolute;right:30px;top:50%;transform:translateY(-50%);font-style:normal;font-size:11px;color:var(--ev);background:var(--ev-soft);border-radius:999px;padding:1px 8px}.nc .pk .dtag[hidden]{display:none}
.nc .unit{display:flex;align-items:center;gap:6px;padding:0 12px}.nc .unit:focus-within{outline:2px solid var(--ev-dot);border-color:var(--ev)}
.nc .nf .unit input.txt{border:0;height:38px;padding:0;flex:1;min-width:0;background:transparent;outline:0}.nc .unit .u{font-style:normal;color:var(--mute);font-size:13px}
.nc textarea{width:100%;min-height:88px;border:1px solid var(--line);border-radius:8px;background:var(--panel);padding:10px 12px;font-size:13.5px;resize:vertical}
.drop{position:relative;border:1.5px dashed var(--line);border-radius:8px;background:var(--sunk);padding:22px 16px;text-align:center;display:grid;gap:4px;cursor:pointer}
.drop span{font-size:13.5px}.drop u{color:var(--ev)}.drop small{font-size:12px;color:var(--mute)}
.drop.over{border-color:var(--ev);background:var(--ev-soft)}
.drop input{position:absolute;inset:0;width:100%;height:100%;opacity:0;cursor:pointer}
.nclist{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px;margin-top:12px}
.nclist .ncf{display:grid;grid-template-columns:44px minmax(0,1fr);gap:4px 10px;align-items:center;border:1px solid var(--line);border-radius:8px;padding:8px;background:var(--panel);font-size:12px}
.nclist .ncf .th{grid-row:1/3;width:44px;height:44px;border-radius:6px;background:var(--sunk) center/cover;display:flex;align-items:center;justify-content:center;font-size:10.5px;color:var(--mute)}
.nclist .ncf span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.nclist .ncf .link{justify-self:start;font-size:12px}
.nc .ncbar{margin-top:26px;gap:12px}
.nc .btn.pri{background:var(--ev);border-color:var(--ev);color:#fff;border-radius:8px}
.nc .btn.quiet{background:transparent;border-color:transparent;color:var(--mute)}.nc .btn.quiet:hover{color:var(--ink)}
#nc-s1 .ncbar{margin-top:18px}
@media (max-width:700px){.nc{padding:20px 16px}.nc2{grid-template-columns:1fr}.nc-startrow{flex-direction:column}.nc-big,.nc-startrow .btn{height:48px}}
#nc-msg{margin-top:12px;font-size:12.5px;color:var(--warn)}#nc-msg[hidden]{display:none}#nc-msg.say{color:var(--mute)}
body[data-new] #col>:not(#newcase){display:none}
.queue{overflow-x:hidden}

.val .tabs{display:grid;grid-template-columns:auto auto 1fr auto;gap:0;padding:0 8px;border-bottom:1px solid var(--line)}
.val .tabs [role="tab"]{font:inherit;font-size:12px;line-height:1.15;text-align:center;white-space:normal;min-width:0;padding:7px 7px;border:0;border-bottom:2px solid transparent;background:none;color:var(--mute);cursor:pointer;display:inline-flex;gap:5px;align-items:center;margin-bottom:-1px}
.val .tabs [role="tab"][aria-selected="true"]{color:var(--ink);font-weight:600;border-bottom-color:var(--an)}
.val .tabs [role="tab"]:focus-visible{outline:2px solid var(--ev);outline-offset:-2px}
.val .tabs .bdg{font-style:normal;font-size:10.5px;font-weight:600;min-width:16px;height:16px;border-radius:8px;padding:0 4px;display:inline-flex;align-items:center;justify-content:center;background:var(--warn);color:var(--panel);box-sizing:border-box}.val .tabs .bdg[hidden]{display:none}
.rmline.thin{color:var(--warn)}
.th .thc{position:absolute;left:3px;right:3px;bottom:3px;font:inherit;font-size:10px;line-height:1;white-space:nowrap;text-align:center;padding:4px 2px;border:0;border-radius:4px;background:rgba(15,31,27,.78);color:#fff;cursor:pointer;opacity:0}
.th:hover .thc,.th:focus-within .thc,.th .thc:focus-visible{opacity:1}
.th .ctag{position:absolute;left:3px;bottom:3px;font-style:normal;font-size:10px;font-weight:600;line-height:1;padding:3px 6px;border-radius:4px;background:var(--an);color:var(--panel)}
.th .thk{position:absolute;left:3px;top:3px;width:20px;height:20px;border:0;border-radius:4px;background:rgba(15,31,27,.78);color:#fff;cursor:pointer;line-height:1;opacity:0;font-size:14px;padding:0}
.th:hover .thk,.th:focus-within .thk,.th .thk[aria-expanded="true"]{opacity:1}
.th .thm{position:absolute;left:0;top:26px;z-index:5;background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:4px;display:grid;min-width:130px}.th .thm[hidden]{display:none}
.th .thm button{font:inherit;font-size:12.5px;text-align:left;padding:6px 8px;border:0;background:none;color:var(--ink);border-radius:5px;cursor:pointer}.th .thm button:hover{background:var(--sunk)}
@media (hover:none){.th .thc,.th .thk{opacity:1}}
.th.add{overflow:visible}
#tp-why:not([hidden]){display:flex;flex-direction:column;gap:14px}
#tp-why .fld{flex:none}
#tp-why .fld:last-child{display:flex;flex-direction:column;min-height:0;flex:1 1 auto}
#tp-why #why{flex:1 1 44px;height:auto;min-height:44px;resize:none}
.qi .ph .tm.word{font-size:10.5px;max-width:40px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
`;
