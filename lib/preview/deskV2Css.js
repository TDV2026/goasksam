// DESK V2 STYLES (Lane S, Nov 15 2026). GoAskSam forest and cream, Instrument Sans and Newsreader, light and dark. No gradient; one shadow, on the sticky rail.
export const DESK_V2_CSS = `
:root{--page:#f6f4ee;--panel:#fff;--sunk:#efede5;--ink:#10231c;--ink2:#34453d;--mute:#66736c;--faint:#98a29c;--line:#e0ddd2;--accent:#0b3126;--accent-ink:#fff;--ev:#1c5a47;--ev-soft:#e3efe9;--an:#b25f1c;--an-soft:#f8eadb;--warn:#946200;--warn-soft:#fbf2da;--ok:#1c6b3c;--ok-soft:#e2f1e7;--bad:#9a2a1c;--bad-soft:#f8e3df;--ui:"Instrument Sans",system-ui,-apple-system,"Segoe UI",sans-serif;--serif:"Newsreader",Georgia,"Times New Roman",serif;--shadow:0 1px 2px rgba(16,35,28,.06),0 8px 24px rgba(16,35,28,.08)}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--page:#0e1613;--panel:#16201c;--sunk:#121b17;--ink:#ecf0ed;--ink2:#c8d1cc;--mute:#97a39d;--faint:#6b7872;--line:#26332d;--accent:#8fd1b8;--accent-ink:#0b1a14;--ev:#86c9b1;--ev-soft:#1b2c27;--an:#e79a5a;--an-soft:#33261a;--warn:#e0b55c;--warn-soft:#30291a;--ok:#84c79a;--ok-soft:#1b2b21;--bad:#ee8c7c;--bad-soft:#341c18;--shadow:0 1px 2px rgba(0,0,0,.3),0 8px 24px rgba(0,0,0,.3);color-scheme:dark}}
*{box-sizing:border-box}
body{margin:0;background:var(--page);color:var(--ink);font:13.5px/1.45 var(--ui)}
h1,h2,h3,p{margin:0}
button,input,textarea{font:inherit;color:inherit}
a{color:inherit;text-decoration:none}
.num{font-variant-numeric:tabular-nums}
.top{display:flex;align-items:center;gap:14px;height:48px;padding:0 18px;background:var(--accent);color:var(--accent-ink);position:sticky;top:0;z-index:5}
.top .brand{font-family:var(--serif);font-size:19px;font-weight:600;letter-spacing:-.01em}
.top .org{font-size:12.5px;opacity:.85;padding-left:14px;border-left:1px solid rgba(255,255,255,.3)}
.top .grow{flex:1}
.top .who{display:inline-grid;place-items:center;width:30px;height:30px;border-radius:50%;background:var(--accent-ink);color:var(--accent);font-size:11.5px;font-weight:600}
.ws{display:grid;grid-template-columns:300px minmax(0,1fr);min-height:calc(100vh - 48px)}
.rail{width:300px;display:flex;flex-direction:column;gap:10px;padding:16px 14px;background:var(--panel);border-right:1px solid var(--line)}
.btn{border:1px solid var(--line);background:var(--panel);border-radius:8px;padding:9px 14px;cursor:pointer;font-weight:500}
.btn.pri{background:var(--accent);color:var(--accent-ink);border-color:var(--accent)}
.btn[disabled]{opacity:.45;cursor:default}
#qs{width:100%;border:1px solid var(--line);background:var(--page);border-radius:8px;padding:8px 12px}
.fls{display:flex;flex-direction:column;gap:2px;overflow:visible}
.fl{display:flex;justify-content:space-between;align-items:center;border:0;border-radius:8px;background:transparent;padding:0 10px;height:34px;cursor:pointer;text-align:left}
.fl b{font-weight:600;color:var(--mute);font-variant-numeric:tabular-nums;font-size:12px;background:var(--sunk);border-radius:10px;padding:1px 8px}
.fl.on{background:var(--ev-soft);color:var(--ev);font-weight:600}
.fl.on b{color:var(--ev);background:transparent}
.cards{display:flex;flex-direction:column;gap:6px;border-top:1px solid var(--line);padding-top:10px}
.cd{position:relative;height:72px;border-radius:10px;display:flex;align-items:center;gap:6px;padding-right:8px}
.cd:hover{background:var(--sunk)}
.cd.on,.cd.on:hover{background:var(--ev-soft)}
.cd[hidden]{display:none}
.cd-a{display:flex;gap:10px;align-items:center;padding:0 0 0 12px;flex:1;min-width:0;height:100%}
.th{position:relative;flex:0 0 48px;width:48px;height:48px;border-radius:8px;background:#cfdcd2 center/cover no-repeat;display:grid;place-items:center}
.th i,.th b{font-style:normal;font-family:var(--serif);color:#2f4a3d;line-height:1}
.th i{font-size:10px;font-weight:500;letter-spacing:.04em}
.th b{font-size:17px;font-weight:600}
.att{position:absolute;top:4px;right:6px;min-width:17px;height:17px;border-radius:9px;background:var(--bad);color:#fff;font-size:10.5px;font-weight:600;display:grid;place-items:center;padding:0 4px;z-index:1}
.cd-b{display:flex;flex-direction:column;gap:3px;min-width:0;flex:1}
.cd-t{font-weight:600;line-height:1.25;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cd-m{display:flex;align-items:center;gap:5px;min-width:0;color:var(--mute);font-size:12px;white-space:nowrap}
.cd-s{overflow:hidden;text-overflow:ellipsis;min-width:0}
.cd-e,.dot{flex:0 0 auto}
.pill{flex:0 0 auto;font-size:10.5px;font-weight:600;border-radius:999px;padding:1px 7px;background:var(--sunk);color:var(--ink2)}
.pill[hidden]{display:none}
.pill[data-st="new_enquiries"]{background:var(--an-soft);color:var(--an)}
.pill[data-st="waiting_info"]{background:var(--warn-soft);color:var(--warn)}
.pill[data-st="ready_to_send"],.pill[data-st="report_sent"],.pill[data-st="converted"]{background:var(--ok-soft);color:var(--ok)}
.claim{flex:0 0 auto;border:1px solid var(--accent);background:transparent;color:var(--accent);border-radius:7px;padding:3px 9px;font-size:12px;cursor:pointer;font-weight:600;opacity:0}
.cd:hover .claim,.claim:focus-visible{opacity:1}
.none{color:var(--mute);padding:8px 2px}
.col{min-width:0;padding:20px 20px}
.choose{color:var(--mute);font-family:var(--serif);font-size:22px}
.ct{font-family:var(--serif);font-size:26px;font-weight:600}
@media (max-width:900px){.ws{grid-template-columns:1fr}.rail{width:auto;border-right:0;border-bottom:1px solid var(--line)}.claim{opacity:1}}
.card{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:16px 18px;margin-top:14px}
.sec-h{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:10px;flex-wrap:wrap}
.sec-h h3{font-family:var(--serif);font-size:18px;font-weight:600}
.link{background:none;border:0;color:var(--ev);cursor:pointer;padding:0;font-weight:600}
.msg{color:var(--bad);margin-top:8px}
.hd{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.pill.big{font-size:12px;padding:3px 10px}
.hm{color:var(--mute);margin-top:4px}
.enq{margin-top:8px;padding:10px 12px;background:var(--sunk);border-radius:8px}
.enq[hidden]{display:none}
.enqdocs{margin:6px 0 0;padding-left:18px}
.prior{margin-top:8px;color:var(--ink2)}
.prior ul{margin:4px 0 0;padding-left:18px}
.vs{display:grid;grid-template-columns:minmax(0,460px) minmax(230px,1fr);gap:18px}
.gal .cover{width:100%;max-width:460px;aspect-ratio:3/2;object-fit:cover;border-radius:10px;display:block;background:var(--sunk)}
.gal .cover.none{height:307px;background:#cfdcd2}
.strip{display:flex;gap:6px;margin-top:8px}
.pt{width:64px;height:46px;border:2px solid transparent;border-radius:6px;padding:0;overflow:hidden;background:var(--sunk);cursor:pointer;display:grid;place-items:center;color:var(--ink2);font-weight:600}
.pt.on{border-color:var(--ev)}
.pt img{width:100%;height:100%;object-fit:cover;display:block}
.frs{display:flex;flex-direction:column}
.fr{display:grid;grid-template-columns:92px minmax(0,1fr);gap:2px 10px;align-items:baseline;padding:7px 0;border-bottom:1px solid var(--line)}
.fr .tg{grid-column:2;justify-self:start}
.fr:last-child{border-bottom:0}
.fl2{color:var(--mute);font-size:12.5px}
.fv{min-width:0;overflow-wrap:anywhere}
.fv[role=button]{cursor:text}
.fv .txt{width:100%}
.ow{display:block}
.txt{border:1px solid var(--line);background:var(--page);border-radius:6px;padding:4px 8px}
.tg{font-style:normal;font-size:11px;font-weight:600;border-radius:999px;padding:1px 8px;background:var(--sunk);color:var(--ink2);white-space:nowrap}
.tg[data-tag=verified]{background:var(--ok-soft);color:var(--ok)}
.tg[data-tag=seller]{background:var(--ev-soft);color:var(--ev)}
.tg[data-tag=needs]{background:var(--warn-soft);color:var(--warn)}
.seg{display:inline-flex;border:1px solid var(--line);border-radius:8px;overflow:hidden}
.seg button{border:0;background:transparent;padding:4px 12px;cursor:pointer}
.seg button.on{background:var(--ev-soft);color:var(--ev);font-weight:600}
.busy{opacity:.55}
.mstrip{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}
.mc{display:flex;flex-direction:column;gap:2px;padding:8px 10px;background:var(--sunk);border-radius:8px}
.mc.em{background:var(--ev-soft)}
.mcl{font-size:11.5px;color:var(--mute)}
.mcv{font-size:16px;font-variant-numeric:tabular-nums}
.mc small{color:var(--mute)}
.mline,.thinline,.axis{margin-top:8px;color:var(--ink2)}
.thinline{background:var(--warn-soft);color:var(--warn);padding:6px 10px;border-radius:6px}
.axis{font-size:12px;color:var(--mute)}
.plotw{margin-top:8px}
.sgrid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}
.sc{border:1px solid var(--line);border-radius:10px;overflow:hidden;background:var(--panel);display:flex;flex-direction:column}
.sc.hag{border-color:var(--an)}
.sc.ex{opacity:.7}
.sph{width:100%;aspect-ratio:16/10;object-fit:cover;display:block;background:var(--sunk)}
.sph.none{background:#cfdcd2}
.sb{padding:8px 10px 10px;display:flex;flex-direction:column;gap:3px}
.sp{display:flex;justify-content:space-between;align-items:baseline}
.spr{font-size:16px;font-variant-numeric:tabular-nums}
.slink{font-size:12px;color:var(--ev);font-weight:600}
.stt{font-weight:600;line-height:1.3}
.sm,.sw,.sx{font-size:12px;color:var(--mute)}
.sx{color:var(--bad)}
.hmark{align-self:flex-start;font-size:10.5px;font-weight:600;color:var(--an);background:var(--an-soft);border-radius:999px;padding:1px 7px}
.sa{display:flex;justify-content:space-between;align-items:center;margin-top:6px}
.inr{display:flex;gap:5px;align-items:center;font-size:12px;cursor:pointer;white-space:nowrap}
.btn.sm{padding:3px 10px;font-size:12px}
.xf{display:flex;gap:6px;margin-top:6px}
.xf[hidden]{display:none}
.xf .txt{flex:1;min-width:0}
@media (max-width:1200px){.sgrid{grid-template-columns:repeat(2,minmax(0,1fr))}.vs{grid-template-columns:1fr}}
.ws.has-case{grid-template-columns:300px minmax(0,1fr) 340px}
.val{align-self:start;position:sticky;top:48px;max-height:calc(100vh - 48px);overflow:hidden;background:var(--panel);border-left:1px solid var(--line);box-shadow:var(--shadow);padding:14px 16px 12px;display:flex;flex-direction:column;gap:10px}
.rb{overflow-y:auto;min-height:0;flex:1 1 auto;display:flex;flex-direction:column;gap:12px;padding-right:2px}
.rs:empty{display:none}
.rs{padding-bottom:12px;border-bottom:1px solid var(--line)}
.rs.foot{border-bottom:0;padding:8px 0 0;flex:0 0 auto;border-top:1px solid var(--line)}
.rh{display:flex;justify-content:space-between;align-items:center;gap:8px}
.rh h3,.rh2{font-size:13px;font-weight:600;margin:0 0 6px}
.cfig{font-family:var(--serif);font-size:18px;font-weight:600;color:var(--ink)}
.cfig.unset{color:var(--mute);font-weight:500}
.rn{color:var(--ink2);margin-top:4px;font-size:12.5px}
.cbtns{display:grid;grid-template-columns:repeat(4,1fr);gap:4px;margin:8px 0}
.cbtns button{border:1px solid var(--line);background:var(--panel);border-radius:7px;padding:5px 0;cursor:pointer;font-size:12.5px}
.cbtns button.pick{border-color:var(--ev);color:var(--ev)}
.cbtns button.on{background:var(--ev);color:#fff;border-color:var(--ev)}
.rs .txt{width:100%;margin-bottom:6px}
.rl{display:block;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--mute);font-weight:600}
.rv{font-size:15px}
.rfig{display:block;font-family:var(--serif);font-size:42px;font-weight:600;line-height:1.1;margin-top:2px;color:var(--ink)}
.lrow{display:grid;grid-template-columns:18px 84px minmax(0,1fr) auto;gap:8px;align-items:center;padding:6px 0;border-bottom:1px solid var(--line);font-size:12.5px}
.lrow.use{background:var(--ev-soft);border-radius:6px;padding-left:4px}
.lrow.off{opacity:.55}
.lfg{font-size:13px}
.lln{color:var(--mute);min-width:0}
.luse.on{color:var(--ev);font-weight:600}
#why{width:100%;border:1px solid var(--line);background:var(--page);border-radius:8px;padding:8px;margin-top:4px;resize:vertical}
.nd{padding:6px 0;border-bottom:1px solid var(--line)}
.nd.done{color:var(--mute)}
.nl{display:block;font-weight:600;margin-bottom:4px}
.nb{display:flex;gap:6px;flex-wrap:wrap}
.btns{display:flex;flex-direction:column;gap:6px}
.btns .btn{width:100%}
.fhint{margin-top:6px;font-size:12px;color:var(--warn)}
.fhint.ok{color:var(--ok)}
.rs.foot small{display:block;margin-top:4px;color:var(--mute)}
.scrim{position:fixed;inset:0;background:rgba(10,20,16,.5);display:grid;place-items:center;z-index:20}
.dlg{background:var(--panel);border-radius:12px;padding:18px;width:min(560px,92vw);max-height:90vh;overflow:auto;display:flex;flex-direction:column;gap:10px;box-shadow:var(--shadow)}
#pvDlg{width:min(900px,94vw);height:88vh}
.pdfframe{flex:1;width:100%;min-height:60vh;border:1px solid var(--line);border-radius:8px}
.pdfbar{display:flex;gap:10px;align-items:center;justify-content:space-between}
.fld{display:flex;flex-direction:column;gap:3px}
.ro{background:var(--sunk);border-radius:6px;padding:6px 8px;overflow-wrap:anywhere}
@media (max-width:1300px){.ws.has-case{grid-template-columns:300px minmax(0,1fr)}.val{grid-column:1/-1;position:static;max-height:none}}
`;
