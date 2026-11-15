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
.ws{display:grid;grid-template-columns:320px minmax(0,1fr);gap:20px;max-width:1440px;margin:0 auto;padding:18px}
.rail{display:flex;flex-direction:column;gap:10px;align-self:start;position:sticky;top:66px;max-height:calc(100vh - 84px);overflow:auto}
.btn{border:1px solid var(--line);background:var(--panel);border-radius:8px;padding:8px 14px;cursor:pointer;font-weight:500}
.btn.pri{background:var(--accent);color:var(--accent-ink);border-color:var(--accent)}
.btn[disabled]{opacity:.45;cursor:default}
#qs{width:100%;border:1px solid var(--line);background:var(--panel);border-radius:8px;padding:8px 12px}
.fls{display:flex;flex-direction:column;border:1px solid var(--line);border-radius:10px;background:var(--panel);overflow:hidden}
.fl{display:flex;justify-content:space-between;align-items:center;border:0;border-bottom:1px solid var(--line);background:transparent;padding:8px 12px;cursor:pointer;text-align:left}
.fl:last-child{border-bottom:0}
.fl b{font-weight:600;color:var(--mute);font-variant-numeric:tabular-nums}
.fl.on{background:var(--ev-soft);color:var(--ev);font-weight:600}
.fl.on b{color:var(--ev)}
.cards{display:flex;flex-direction:column;gap:8px}
.cd{position:relative;border:1px solid var(--line);background:var(--panel);border-radius:10px;display:flex;gap:8px;align-items:stretch}
.cd.on{border-color:var(--ev);box-shadow:inset 3px 0 0 var(--ev)}
.cd[hidden]{display:none}
.cd-a{display:flex;gap:10px;padding:10px;flex:1;min-width:0}
.th{flex:0 0 56px;height:42px;border-radius:6px;background:var(--sunk) center/cover no-repeat}
.th.none{background:var(--sunk)}
.cd-b{display:flex;flex-direction:column;gap:2px;min-width:0}
.cd-t{font-weight:600;line-height:1.25}
.cd-s,.cd-e,.cd-an{color:var(--mute);font-size:12px}
.cd-m{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:3px}
.pill{font-size:11px;font-weight:600;border-radius:999px;padding:2px 8px;background:var(--sunk);color:var(--ink2)}
.pill[data-st="new_enquiries"]{background:var(--an-soft);color:var(--an)}
.pill[data-st="waiting_info"]{background:var(--warn-soft);color:var(--warn)}
.pill[data-st="ready_to_send"],.pill[data-st="report_sent"],.pill[data-st="converted"]{background:var(--ok-soft);color:var(--ok)}
.att{position:absolute;top:8px;right:8px;min-width:20px;height:20px;border-radius:10px;background:var(--bad);color:#fff;font-size:11px;font-weight:600;display:grid;place-items:center;padding:0 5px}
.claim{align-self:center;margin-right:10px;border:1px solid var(--accent);background:transparent;color:var(--accent);border-radius:8px;padding:5px 10px;cursor:pointer;font-weight:600}
.none{color:var(--mute);padding:8px 2px}
.col{min-width:0}
.ct{font-family:var(--serif);font-size:26px;font-weight:600}
@media (max-width:900px){.ws{grid-template-columns:1fr}.rail{position:static;max-height:none}}
`;
