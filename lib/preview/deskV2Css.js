// DESK V2 STYLES (Lane S, Nov 15 2026). GoAskSam forest and cream, Instrument Sans and Newsreader, light and dark. No gradient, no shadow.
import { DESK_V4_CSS } from "./deskV4Css.js";
// The New case form is /preview/desk's own (lib/preview/deskV4.js newCaseV4Html); its rules are lifted from the V4 sheet so the two never drift.
const NC_FROM = DESK_V4_CSS.indexOf(".nc{padding:28px 32px}"), NC_MEDIA = DESK_V4_CSS.indexOf("@media (max-width:700px){.nc{padding"), NC_TO = DESK_V4_CSS.indexOf("\n", NC_MEDIA);
const NEW_CASE_CSS = NC_FROM > 0 && NC_MEDIA > NC_FROM ? DESK_V4_CSS.slice(NC_FROM, NC_TO) : "";
export const DESK_V2_CSS = `
:root{--page:#f6f4ee;--panel:#fff;--sunk:#efede5;--ink:#10231c;--ink2:#34453d;--mute:#66736c;--faint:#98a29c;--line:#e0ddd2;--accent:#0b3126;--accent-ink:#fff;--ev:#1c5a47;--ev-soft:#e3efe9;--tab:#2f6b57;--an:#b25f1c;--an-soft:#f8eadb;--warn:#946200;--warn-soft:#fbf2da;--ok:#1c6b3c;--ok-soft:#e2f1e7;--bad:#9a2a1c;--bad-soft:#f8e3df;--ui:"Instrument Sans",system-ui,-apple-system,"Segoe UI",sans-serif;--serif:"Newsreader",Georgia,"Times New Roman",serif;--shadow:0 1px 2px rgba(16,35,28,.06),0 8px 24px rgba(16,35,28,.08)}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--page:#0e1613;--panel:#16201c;--sunk:#121b17;--ink:#ecf0ed;--ink2:#c8d1cc;--mute:#97a39d;--faint:#6b7872;--line:#26332d;--accent:#8fd1b8;--accent-ink:#0b1a14;--ev:#86c9b1;--ev-soft:#1b2c27;--tab:#244a3d;--an:#e79a5a;--an-soft:#33261a;--warn:#e0b55c;--warn-soft:#30291a;--ok:#84c79a;--ok-soft:#1b2b21;--bad:#ee8c7c;--bad-soft:#341c18;--shadow:0 1px 2px rgba(0,0,0,.3),0 8px 24px rgba(0,0,0,.3);color-scheme:dark}}
*{box-sizing:border-box}
body{margin:0;background:var(--page);color:var(--ink);font:14px/1.45 var(--ui)}
h1,h2,h3,p{margin:0}
button,input,textarea{font:inherit;color:inherit}
a{color:inherit;text-decoration:none}
.num{font-variant-numeric:tabular-nums}
.top{display:flex;align-items:center;gap:14px;height:56px;padding:0 20px;background:var(--accent);color:var(--accent-ink);position:sticky;top:0;z-index:5}
.top .brand{font-family:var(--serif);font-size:18px;font-weight:600;letter-spacing:-.01em}
.top .org{font-size:15px;color:rgba(255,255,255,.8);padding-left:14px;border-left:1px solid rgba(255,255,255,.3);line-height:24px}
.top .tr{margin-left:auto;display:flex;align-items:center;gap:14px}
.top .hbtn{background:none;border:0;color:var(--accent-ink);cursor:pointer;padding:0;display:grid;place-items:center;opacity:.9}
.top .hbtn svg{fill:none;stroke:currentColor;stroke-width:1.5;stroke-linecap:round}
.top .whow{position:relative}
.top .who{display:flex;align-items:center;gap:6px;background:none;border:0;cursor:pointer;color:var(--accent-ink);padding:0}
.top .wi{display:inline-grid;place-items:center;width:32px;height:32px;border-radius:50%;background:var(--accent-ink);color:var(--accent);font-size:12px;font-weight:600}
.top .chev{fill:none;stroke:currentColor;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round}
.top .wmenu{position:absolute;right:0;top:42px;min-width:200px;background:var(--panel);color:var(--ink);border:1px solid var(--line);border-radius:12px;padding:12px 14px;display:flex;flex-direction:column;gap:8px;align-items:flex-start;z-index:8}
.top .wmenu[hidden]{display:none}
.top .wn{font-weight:600}
.top .whoin{font:inherit;width:170px;padding:4px 8px;border-radius:6px;border:1px solid var(--line);background:var(--page);color:var(--ink)}
.ws{display:grid;grid-template-columns:300px minmax(0,1fr);min-height:calc(100vh - 56px)}
.rail{width:300px;display:flex;flex-direction:column;gap:10px;padding:16px 14px;background:var(--panel);border-right:1px solid var(--line)}
.btn{border:1px solid var(--line);background:var(--panel);border-radius:8px;padding:9px 14px;cursor:pointer;font-weight:500}
.btn.pri{background:var(--accent);color:var(--accent-ink);border-color:var(--accent)}
.btn[disabled]{opacity:.45;cursor:default}
#qs{width:100%;border:1px solid var(--line);background:var(--page);border-radius:8px;padding:8px 12px}
.fls{display:flex;flex-direction:column;gap:0;overflow:visible}
.fl{display:flex;align-items:center;gap:10px;border:0;border-radius:8px;background:transparent;padding:0 10px;height:40px;cursor:pointer;text-align:left;font-size:15px;font-weight:400;color:var(--ink)}
.fl .ic{flex:0 0 16px;width:16px;height:16px;fill:none;stroke:var(--mute);stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round}
.fl span{flex:1}
.fl b{font-weight:400;color:var(--mute);font-variant-numeric:tabular-nums;font-size:13px;background:none;padding:0;text-align:right}
.fl.on{background:var(--ev-soft);color:var(--ink)}
.fl.on span{font-weight:600}
.fl.on b{color:var(--mute)}
.clab{display:flex;gap:6px;align-items:baseline;border-top:1px solid var(--line);padding-top:12px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--mute);font-weight:600}
.clab b{font-weight:600}
.cards{display:flex;flex-direction:column;gap:8px}
.cd{position:relative;height:68px;border:0;border-radius:10px;display:flex;align-items:center;gap:6px;padding-right:8px;background:transparent}
.cd:hover{background:var(--sunk)}
.cd.on,.cd.on:hover{background:var(--ev-soft)}
.cd[hidden]{display:none}
.cd-a{display:flex;gap:12px;align-items:center;padding:0 0 0 12px;flex:1;min-width:0;height:100%}
.th{position:relative;flex:0 0 44px;width:44px;height:44px;border-radius:8px;background:#cfdcd2 center/cover no-repeat;display:grid;place-items:center}
.th i,.th b{font-style:normal;font-family:var(--serif);color:#2f4a3d;line-height:1}
.th i{font-size:9px;font-weight:500;letter-spacing:.04em}
.th b{font-size:16px;font-weight:600}
.att{position:absolute;top:4px;right:6px;min-width:17px;height:17px;border-radius:9px;background:var(--bad);color:#fff;font-size:10.5px;font-weight:600;display:grid;place-items:center;padding:0 4px;z-index:1}
.cd-b{display:flex;flex-direction:column;gap:3px;min-width:0;flex:1}
.cd-t{font-size:15px;font-weight:600;line-height:1.25;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cd-m{display:flex;align-items:center;gap:5px;min-width:0;color:var(--mute);font-size:13px;white-space:nowrap}
.cd-s{overflow:hidden;text-overflow:ellipsis;min-width:0}
.cd-e,.dot{flex:0 0 auto}
.cd-an{flex:0 1 auto;overflow:hidden;text-overflow:ellipsis}
.pill{flex:0 0 auto;font-size:11px;font-weight:600;border-radius:999px;padding:1px 7px;background:var(--sunk);color:var(--ink2)}
.pill[hidden]{display:none}
.pill[data-st="new"]{background:var(--an-soft);color:var(--an)}
.pill[data-st="waiting"]{background:var(--warn-soft);color:var(--warn)}
.pill[data-st="ready"],.pill[data-st="sent"],.pill[data-st="converted"]{background:var(--ok-soft);color:var(--ok)}
.claim{flex:0 0 auto;border:1px solid var(--accent);background:transparent;color:var(--accent);border-radius:7px;padding:3px 9px;font-size:12px;cursor:pointer;font-weight:600;opacity:0}
.cd:hover .claim,.claim:focus-visible{opacity:1}
.none{color:var(--mute);padding:8px 2px}
.sortr{display:flex;align-items:center;gap:6px;color:var(--mute);font-size:13px;padding:0 2px}
.sortr svg{fill:none;stroke:currentColor;stroke-width:1.4;stroke-linecap:round;stroke-linejoin:round}
#viewallc{align-self:flex-start;margin-top:auto;padding:6px 2px;font-size:13px}
.col{min-width:0;padding:20px;display:flex;flex-direction:column;gap:16px}
.choose{color:var(--mute);font-family:var(--serif);font-size:22px}
.ct{font-family:var(--serif);font-size:28px;font-weight:600;line-height:1.15}
@media (max-width:900px){.ws{grid-template-columns:1fr}.rail{width:auto;border-right:0;border-bottom:1px solid var(--line)}.claim{opacity:1}}
.card{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:20px;box-shadow:none}
.card[hidden],.three[hidden]{display:none}
.sec-h{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:12px;flex-wrap:wrap}
.sec-h h3{font-family:var(--serif);font-size:20px;font-weight:600}
.link{background:none;border:0;color:var(--ev);cursor:pointer;padding:0;font-weight:600;font-size:13px}
.msg{color:var(--bad);margin-top:8px}
.acts{display:flex;align-items:center;justify-content:flex-end;gap:6px;color:var(--mute);font-size:13px;font-variant-numeric:tabular-nums;margin-bottom:6px}
.ic{fill:none;stroke:currentColor;stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round;flex:0 0 auto}
.hd2{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap}
.ct{line-height:32px}.hr{min-height:32px}.hr .btn.ob{padding:4px 12px}.hr .btn.ob.kb{padding:4px 8px}.hr .pill.big{padding:3px 12px}
.hl{min-width:0}
.hr{display:flex;align-items:center;gap:10px}
.pill.big{font-size:13px;padding:4px 12px;background:var(--ev-soft);color:var(--ev)}
.hm{color:var(--mute);margin-top:2px;font-size:14px;line-height:20px}
.btn.ob{background:var(--panel);border:1px solid var(--line);color:var(--ink);display:inline-flex;align-items:center;gap:6px}
.btn.ob .cv{width:14px;height:14px}
.btn.ob.kb{padding:9px 10px}
.menuw{position:relative}
.menu{position:absolute;right:0;top:calc(100% + 6px);min-width:200px;background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:6px;z-index:6;display:flex;flex-direction:column}
.menu[hidden]{display:none}
.menu button{background:none;border:0;text-align:left;padding:8px 10px;border-radius:6px;cursor:pointer}
.menu button:hover{background:var(--sunk)}
.enq{margin-top:10px;padding:10px 12px;background:var(--sunk);border-radius:8px}
.enq[hidden]{display:none}
.prior{margin-top:8px;color:var(--ink2)}
.prior ul{margin:4px 0 0;padding-left:18px}
.vs{display:grid;grid-template-columns:448px minmax(260px,1fr);gap:20px}
#s-vehicle{padding:16px}
.cw{position:relative;width:448px;max-width:100%}
.gal .cover{width:448px;max-width:100%;height:300px;object-fit:cover;border-radius:12px;display:block;background:var(--sunk)}
.gal .cover.none{width:448px;max-width:100%;height:300px;background:#cfdcd2}
.pchip{position:absolute;right:10px;bottom:10px;background:rgba(16,35,28,.78);color:#fff;font-size:12px;font-weight:600;border-radius:999px;padding:3px 10px}
.strip{display:flex;gap:8px;margin-top:10px;width:448px;max-width:100%}
.pt{flex:0 0 72px;width:72px;min-width:0;height:72px;border:2px solid transparent;border-radius:8px;padding:0;overflow:hidden;background:var(--sunk);cursor:pointer;display:grid;place-items:center;color:var(--ink2);font-weight:600}
.pt.on{border-color:var(--ev)}
.pt.more{flex:0 0 48px;width:48px;border-radius:8px;background:transparent;font-size:13px;color:var(--mute)}
.pt img{width:100%;height:100%;object-fit:cover;display:block}
.vd{min-width:0}
.vdh{display:flex;justify-content:space-between;align-items:center;margin-bottom:6px}
.vdh h3{font-family:var(--serif);font-size:18px;font-weight:600}
.vdh .btn.sm{padding:2px 10px;font-size:12px}
.btn.sm{padding:4px 12px;font-size:13px}
.frs{display:flex;flex-direction:column}
.fr{display:grid;grid-template-columns:minmax(0,1fr) auto;grid-template-areas:"l t" "v t";column-gap:12px;row-gap:0;align-items:center;padding:2px 0;min-height:38px;box-sizing:border-box;border-bottom:1px solid var(--line)}
.fr .fl2{grid-area:l}.fr .fv{grid-area:v}.fr .tg,.fr>span:last-child:not(.fl2):not(.fv){grid-area:t}
.fr:last-child{border-bottom:0}
.fl2{color:var(--mute);font-size:13px;line-height:16px}
.fv{min-width:0;font-size:14px;line-height:18px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.frs.editing .fv{overflow:visible}.fv .txt{height:22px;padding:0 6px;font-size:14px}
.fv[role=button]{cursor:text;border-bottom:1px dashed var(--faint)}
.fv .txt{width:100%}
.ow{display:block}
.txt{border:1px solid var(--line);background:var(--page);border-radius:6px;padding:5px 8px}
.tg{font-style:normal;font-size:11px;font-weight:600;border-radius:999px;padding:2px 8px;background:var(--sunk);color:var(--ink2);white-space:nowrap}
.tg[data-tag=verified]{background:var(--ok-soft);color:var(--ok)}
.tg[data-tag=seller]{background:var(--sunk);color:var(--ink2)}
.tg[data-tag=needs]{background:var(--warn-soft);color:var(--warn)}
.three{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;align-items:start}
.sm3{padding:20px}
.sm3 .sh{display:flex;align-items:center;gap:8px;margin-bottom:8px}
.sm3 .sh h3{font-size:14px;font-weight:600;flex:1;font-family:var(--ui)}
.sm3 .sh .ic{color:var(--mute)}
.one{color:var(--ink2);font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#c-prior .one{white-space:normal}
.dl{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px}
.dl li{display:flex;align-items:center;flex-wrap:wrap;gap:6px 8px;font-size:13px}
.dl .dk,.dadw .dk{height:26px;border:1px solid var(--line);border-radius:6px;background:var(--panel);color:var(--ink);font-size:12px;padding:0 4px}
.dl .dr{font-size:12px;color:var(--mute);font-weight:400;text-decoration:underline}
.dadw{display:flex;flex-direction:column;gap:6px;margin-top:10px}
.dadd{display:grid;gap:2px;justify-items:center;border:1.5px dashed var(--line);border-radius:8px;background:var(--sunk);padding:12px 8px;text-align:center;cursor:pointer;font-weight:600;font-size:13px}.dadd small{font-weight:400;color:var(--mute);font-size:12px}.dadd.over{border-color:var(--ev);background:var(--ev-soft)}
.dl .dn{flex:1 0 calc(100% - 26px);min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dl .dk{width:92px}.dl .dv{padding:2px 8px;font-size:12px}
.tk{color:var(--ok);width:16px;height:16px}
.tk.none{display:inline-block;border:1.5px solid var(--faint);border-radius:50%;width:14px;height:14px;flex:0 0 14px}
.seg{display:inline-flex;border:1px solid var(--line);border-radius:8px;overflow:hidden}
.seg button{border:0;background:transparent;padding:5px 14px;cursor:pointer;font-size:13px}
.seg button.on{background:var(--ev-soft);color:var(--ev);font-weight:600}
.busy{opacity:.55}
.mrow{display:grid;grid-template-columns:minmax(230px,42%) minmax(0,1fr);gap:20px;align-items:start}
.mstrip{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
.mc{display:flex;flex-direction:column;gap:2px;padding:10px 12px;background:var(--sunk);border-radius:10px}
.mc.em{background:var(--ev-soft)}
.mcl{font-size:13px;color:var(--mute)}
.mcv{font-family:var(--serif);font-size:22px;font-weight:600;line-height:1.15;font-variant-numeric:tabular-nums}
.mc small{color:var(--mute);font-size:12px}
.thinline{margin:0 0 12px;font-size:13px;line-height:18px;background:var(--warn-soft);color:var(--warn);padding:6px 10px;border-radius:6px}
.mr{min-width:0}
.plotw{min-height:0}
#plot{display:block}
.closing{margin-top:8px;font-size:13px;color:var(--mute)}
.sgrid{display:flex;flex-direction:column}
.sc{display:grid;grid-template-columns:96px minmax(0,1.2fr) minmax(0,1fr) auto;gap:16px;align-items:center;padding:12px 0;border-bottom:1px solid var(--line)}
.sc:last-child{border-bottom:0}
.sc.ex{opacity:.7}
.sph{width:96px;height:72px;object-fit:cover;display:block;background:var(--sunk);border-radius:8px}
.sph.none{background:#cfdcd2}
.sb{display:flex;flex-direction:column;gap:3px;min-width:0}
.stt{font-weight:600;line-height:1.3;font-size:14px}
.sm,.sw,.sx{font-size:13px;color:var(--mute)}
.sw{margin:0}
.spc{display:flex;flex-direction:column;align-items:flex-end;gap:6px}
.sp{display:flex;align-items:center;gap:10px}
.spr{font-family:var(--serif);font-size:18px;font-weight:600;font-variant-numeric:tabular-nums}
.slink{color:var(--mute);display:grid;place-items:center}
.hmark{align-self:flex-start;font-size:11px;font-weight:600;color:var(--an);background:var(--an-soft);border-radius:999px;padding:1px 8px}
.sa{display:flex;gap:12px;align-items:center;font-size:13px}
.inr{display:flex;gap:5px;align-items:center;font-size:13px;cursor:pointer;white-space:nowrap}
.xf{display:flex;gap:6px}
.xf[hidden]{display:none}
.xf .txt{flex:1;min-width:0}
@media (max-width:1200px){.vs{grid-template-columns:1fr}.mrow{grid-template-columns:1fr}.three{grid-template-columns:1fr}.sc{grid-template-columns:96px minmax(0,1fr) auto}.sc .sw{grid-column:2/3}}
.ws.has-case{grid-template-columns:300px minmax(0,1fr) 320px}
.val{align-self:start;position:sticky;top:56px;max-height:calc(100vh - 56px);overflow:hidden;background:var(--panel);border-left:1px solid var(--line);padding:20px 20px 16px;display:flex;flex-direction:column;gap:12px}
.rtitle{font-family:var(--serif);font-size:22px;font-weight:600}
.rb{overflow-y:auto;min-height:0;flex:1 1 auto;display:flex;flex-direction:column;gap:14px}
.rs:empty{display:none}
.rs.foot{padding:12px 0 0;flex:0 0 auto;border-top:1px solid var(--line)}
.rs.box{border-radius:12px;padding:14px 16px}
.rs.green{background:var(--ev-soft)}
.rs.cream{background:var(--sunk)}
.rh{display:flex;justify-content:space-between;align-items:center;gap:8px}
.rh2{font-size:14px;font-weight:600;margin:0 0 8px}
.rl2{display:block;font-size:13px;color:var(--mute);margin-bottom:6px}
.crow{display:flex;flex-direction:column;gap:6px}
.seg2{display:grid;grid-template-columns:repeat(4,1fr);border:1px solid var(--line);border-radius:8px;overflow:hidden}
.seg2 button{border:0;border-right:1px solid var(--line);background:var(--panel);padding:7px 0;cursor:pointer;font-size:13px}
.seg2 button:last-child{border-right:0}
.seg2 button.pick{background:var(--ev-soft);color:var(--ev);font-weight:600}
.seg2 button.on{background:var(--accent);color:var(--accent-ink);font-weight:600}
.cfig{display:block;margin-top:6px;font-size:13px;color:var(--ink2)}
.cfig.unset{color:var(--mute)}
.rn{color:var(--ink2);margin-top:6px;font-size:13px;line-height:18px}
.rs .txt{width:100%;margin-top:8px}
.rs .btn.sm.pri{margin-top:8px}
.rl{display:block;font-size:13px;color:var(--mute)}
.rv{display:block;font-family:var(--serif);font-size:22px;font-weight:600;margin-top:4px}
.rfig{display:block;font-family:var(--serif);font-size:40px;font-weight:600;line-height:1.1;margin-top:4px;color:var(--ink)}
.pen{background:none;border:0;color:var(--mute);cursor:pointer;padding:2px;display:grid;place-items:center}
.lrow{display:grid;grid-template-columns:20px minmax(0,1fr) auto;gap:10px;align-items:start;padding:10px 12px;border:1px solid var(--line);border-radius:10px;margin-bottom:8px;cursor:pointer}
.lrow.use{border-color:var(--ev);background:var(--ev-soft)}
.lrow.off{opacity:.55;cursor:default}
.lmid{display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 8px;min-width:0}
.lfg{font-family:var(--serif);font-size:18px;font-weight:600}
.lrec{font-style:normal;font-size:12px;font-weight:600;color:var(--ev);background:var(--ev-soft);border-radius:999px;padding:1px 8px}
.lrow.use .lrec{background:var(--panel)}
.lln{flex:1 1 100%;color:var(--mute);font-size:13px}
.ltick{margin:2px 0 0}
#why{width:100%;border:1px solid var(--line);background:var(--page);border-radius:8px;padding:8px;resize:vertical}
.nd{padding:8px 0;border-bottom:1px solid var(--line);font-size:13px}
.nd.done{color:var(--mute);display:flex;gap:8px;align-items:center}
.nl{display:flex;gap:8px;align-items:center;font-weight:600;margin-bottom:6px}
.nb{display:flex;gap:6px;flex-wrap:wrap;margin-top:6px}
.btns{display:flex;flex-direction:column;gap:8px}
.btns .btn{width:100%;justify-content:center}
.fhint{margin-top:6px;font-size:12px;color:var(--warn)}
.fblk{margin:-2px 0 2px}
.fblk .fhint{margin-top:2px}
.fhint.ok{color:var(--ok)}
.rs.foot small{display:block;margin-top:4px;color:var(--mute)}
.scrim{position:fixed;inset:0;background:rgba(10,20,16,.5);display:grid;place-items:center;z-index:20}
.dlg{background:var(--panel);border-radius:12px;padding:20px;width:min(560px,92vw);max-height:90vh;overflow:auto;display:flex;flex-direction:column;gap:10px}
#pvDlg{width:min(900px,94vw);height:88vh}
.pdfframe{flex:1;width:100%;min-height:60vh;border:1px solid var(--line);border-radius:8px}
.pdfbar{display:flex;gap:10px;align-items:center;justify-content:space-between}
.fld{display:flex;flex-direction:column;gap:3px}
.ro{background:var(--sunk);border-radius:6px;padding:6px 8px;overflow-wrap:anywhere}
@media (max-width:1300px){.ws.has-case{grid-template-columns:300px minmax(0,1fr)}.val{grid-column:1/-1;position:static;max-height:none}}
${NEW_CASE_CSS}
.ncover{position:fixed;inset:0;z-index:40;display:none;justify-content:center;align-items:flex-start;overflow:auto;padding:6vh 16px;background:rgba(10,20,16,.5)}
body[data-new] .ncover{display:flex}body[data-new]{overflow:hidden}
.ncover .ncsheet{width:min(720px,100%)}.ncover .nc{margin:0}
.ncbar{display:flex;gap:8px;align-items:center;margin-top:12px;flex-wrap:wrap}
.nc .fld label{display:block;font-size:13px;color:var(--ink2);margin:0 0 6px}
.nc .txt{margin:0;flex:initial}.nc .unit .txt{flex:1}
.nc .btn.pri{margin:0}
.nc .msg{margin-top:10px;font-size:13px}.nc .msg.say{color:var(--mute)}
`;
