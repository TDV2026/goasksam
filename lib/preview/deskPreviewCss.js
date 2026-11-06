// The redesign layer of /preview/desk (Lane E, Nov 5 2026). It is loaded AFTER the live Desk stylesheet, so every class the live scripts print is already styled and this layer changes only how it looks.
// Colour: GoAskSam's deep forest green from the homepage and Find redesign (docs/design/homepage-find-brief.md, "the deeper, richer forest green"; the preview design system's --forest #0B3126, hover #164536), one accent, nothing else.
// Type: Newsreader (serif, headings), Instrument Sans (body and figures). Monospace only for a VIN and a report number. No figure is made here: this file only styles what the page printed.
export const DESK_PREVIEW_CSS = `
:root{
  --forest:#0B3126;--forest-hover:#164536;--tint:#EEF3EF;--tint2:#F6F8F5;--hair:#E3E7E2;--hair2:#EEF0EC;--warn:#15201A;
  --paper:#FFFFFF;--card:#FFFFFF;--ink:#15201A;--slate:#4B574F;--faint:#85908A;--line:#E3E7E2;--line2:#EEF0EC;
  --green:#0B3126;--green-btn:#0B3126;--green-deep:#0B3126;--clay:#0B3126;
  --rail:#FAFBF9;--rail-ink:#26322B;--rail-faint:#85908A;--rail-line:#E3E7E2;--shadow:none;
  --sans:"Instrument Sans",system-ui,-apple-system,"Segoe UI",sans-serif;--serif:"Newsreader",Georgia,"Times New Roman",serif;
  --grotesk:var(--sans);--mono:var(--sans);--code:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;--top:52px;
}
body.pv{background:#fff;color:var(--ink);font:400 15px/1.6 var(--sans);-webkit-font-smoothing:antialiased}
.pv .num{font-family:var(--sans);font-variant-numeric:tabular-nums;letter-spacing:0}
.pv :focus-visible{outline:2px solid var(--forest);outline-offset:2px;border-radius:6px}
.pv button{font-family:var(--sans)}

/* ---- the top bar: on every Desk screen ---- */
.topbar{position:sticky;top:0;z-index:60;height:var(--top);background:var(--forest);color:#fff;display:flex;align-items:center;justify-content:space-between;padding:0 28px;box-shadow:inset 0 1px 0 rgba(255,255,255,.1)}
.topbar .tb-l{display:flex;align-items:center;gap:10px}
.topbar .tb-mark{font:500 22px/1 var(--serif);letter-spacing:-.01em}
.topbar .tb-beta{font:600 10.5px/1 var(--sans);letter-spacing:.14em;text-transform:uppercase;border:1px solid rgba(255,255,255,.4);border-radius:999px;padding:4px 8px;color:rgba(255,255,255,.88)}
.topbar .tb-r{display:flex;align-items:center;gap:12px;font:500 14px/1 var(--sans);color:rgba(255,255,255,.92);min-width:0}
.topbar .tb-logo{height:24px;width:auto;max-width:120px;object-fit:contain;filter:none}
.topbar .tb-org{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.topbar .tb-sep{width:1px;height:16px;background:rgba(255,255,255,.28)}
.topbar .tb-seat{white-space:nowrap;color:rgba(255,255,255,.78)}

/* ---- shell: a light rail and a quiet page ---- */
.pv .screen{min-height:calc(100vh - var(--top))}
.pv .rail,.pv[data-mode="vals"] .rail{width:288px;background:var(--rail);color:var(--rail-ink);border-right:1px solid var(--hair);padding:24px 14px 18px;top:var(--top);height:calc(100vh - var(--top))}
.pv .rail .top{display:none}
.pv .rail .new{font:500 14px/1 var(--sans);color:#fff;background:var(--forest);border:0;border-radius:10px;padding:12px 14px;margin-bottom:22px}
.pv .rail .new:hover{background:var(--forest-hover)}
.pv .rail .new .plus{background:rgba(255,255,255,.16);border-radius:6px}
.pv .rail .sec,.pv .valsrail .sec{font:600 11.5px/1 var(--sans);letter-spacing:.12em;text-transform:uppercase;color:var(--faint);margin:26px 8px 10px}
.pv .rail .item{font:400 14px/1.4 var(--sans);color:var(--slate);padding:8px 10px;border-radius:8px}
.pv .rail .item:hover{background:var(--tint);color:var(--ink)}
.pv .rail .item.mut,.pv .rail .item.mut:hover{color:var(--faint);background:none}
.pv .rail .seat{display:none}
.pv .valsrail .qrow{padding:10px 12px;border-radius:8px;margin-bottom:2px;color:var(--ink);border-left:2px solid transparent}
.pv .valsrail .qrow:hover{background:var(--tint2);color:var(--ink)}
.pv .valsrail .qrow.on{background:var(--tint);border-left-color:var(--forest);color:var(--ink)}
.pv .valsrail .qcar{font:500 14.5px/1.35 var(--sans)}
.pv .valsrail .qmeta{font:400 12.5px/1.3 var(--sans);color:var(--faint);gap:8px;margin-top:4px}
.pv .valsrail .st{font:500 12.5px/1 var(--sans);letter-spacing:0;text-transform:none;border:0;border-radius:0;padding:0;color:var(--slate)}
.pv .valsrail .st.fin,.pv .valsrail .st.sent{color:var(--forest);font-weight:600}
.pv .valsrail .st.need{color:var(--warn)}
.pv .valsrail .none{font:400 13.5px/1.4 var(--sans);color:var(--faint);padding:4px 10px}
.pv .valsrail input.csearch{font:400 13.5px/1 var(--sans);background:#fff;border:1px solid var(--hair);border-radius:10px;padding:10px 12px;color:var(--ink);margin:0 0 8px}
.pv .valsrail input.csearch::placeholder{color:var(--faint)}
.pv .valsrail input.csearch:focus{border-color:var(--forest);box-shadow:0 0 0 3px rgba(11,49,38,.12);outline:none}

.pv .main{background:#fff}
.pv .chrome{padding:18px 40px;border-bottom:1px solid var(--hair);gap:14px;flex-wrap:wrap}
.pv .chrome .brand{font:500 24px/1 var(--serif);letter-spacing:-.01em;order:1}
.pv .pvnote{order:2;font:400 13px/1.3 var(--sans);color:var(--faint)}
.pv .chrome .sp{order:3;flex:1}
.pv .vnew{order:4;margin-right:0}
.pv .mode{order:5;background:var(--tint2);border:1px solid var(--hair);border-radius:10px;padding:3px}
.pv .mode button{font:500 13.5px/1 var(--sans);letter-spacing:0;color:var(--slate);border-radius:8px;padding:8px 16px}
.pv .mode button:hover{color:var(--ink)}
.pv .mode button[aria-selected="true"]{background:#fff;color:var(--forest);box-shadow:0 0 0 1px var(--hair)}
.pv .vnew input{font:400 14px/1 var(--sans);border:1px solid var(--hair);border-radius:10px;padding:11px 14px;width:260px;background:#fff}
.pv .vnew input:focus{border-color:var(--forest);box-shadow:0 0 0 3px rgba(11,49,38,.12)}
.pv .vnew button,.pv .vbtn{font:500 14px/1 var(--sans);letter-spacing:0;color:var(--forest);background:#fff;border:1px solid var(--hair);border-radius:10px;padding:11px 16px;transition:border-color .15s,background .15s}
.pv .vnew button:hover,.pv .vbtn:hover{border-color:var(--forest);background:var(--tint2)}
.pv .vbtn.pri{background:var(--forest);color:#fff;border-color:var(--forest)}
.pv .vbtn.pri:hover{background:var(--forest-hover);border-color:var(--forest-hover)}
.pv .vbtn[disabled]{opacity:.4}

/* ---- open sheets ---- */
.pv .vals{padding:0 40px 120px}
.pv .vtabs{background:#fff;border-bottom:1px solid var(--hair);padding-top:10px;gap:2px}
.pv .vtab{font:500 14px/1 var(--sans);color:var(--slate);border:0;border-bottom:2px solid transparent;border-radius:0;padding:12px 14px}
.pv .vtab:hover{color:var(--ink)}
.pv .vtab.on{background:none;color:var(--ink);border-bottom-color:var(--forest);box-shadow:none}
.pv .vtab .x{font:400 16px/1 var(--sans);color:var(--faint)}
.pv .vempty{max-width:34em;margin:96px auto;font:400 22px/1.5 var(--serif);color:var(--slate);text-align:left}
.pv .sheet{max-width:820px;margin:44px auto 0}
.pv .shead h1{font:500 44px/1.08 var(--serif);letter-spacing:-.015em;margin:0 0 10px}
.pv .shead .vin{font:400 13px/1 var(--code);color:var(--slate);letter-spacing:.06em}
.pv .shead .chips{margin-top:16px;gap:8px}
.pv .chip{font:500 13px/1 var(--sans);letter-spacing:0;text-transform:none;border:1px solid var(--hair);border-radius:999px;padding:7px 12px;color:var(--slate);background:#fff}
.pv .chip.ok{color:var(--forest);border-color:var(--forest);background:var(--tint2)}
.pv .chip.warn{color:var(--warn);border-color:var(--ink);background:#fff}
.pv .shead .chips .chip:nth-child(3){font-family:var(--code);font-size:12.5px;letter-spacing:.04em}
.pv .banner{font:400 14.5px/1.55 var(--sans);background:var(--tint2);border:0;border-left:2px solid var(--forest);border-radius:0 10px 10px 0;padding:14px 18px;margin:22px 0;color:var(--ink)}
.pv .banner.fx{border-left-color:var(--hair);color:var(--slate)}

/* ---- the seven sections: open, hairline between, a small numeral above a serif heading ---- */
.pv .sec7{display:block;margin:64px 0 0}
.pv .sec7 .no{font:600 12.5px/1 var(--sans);letter-spacing:.14em;color:var(--forest);padding:0 0 12px}
.pv .sec7 .no::before{content:"0"}
.pv .card{background:none;border:0;border-top:1px solid var(--hair);border-radius:0;box-shadow:none;padding:26px 0 0}
.pv .card h2{font:500 30px/1.15 var(--serif);letter-spacing:-.01em;margin:0 0 8px}
.pv .card .sub{font:400 15px/1.55 var(--sans);color:var(--slate);margin:0 0 20px;max-width:60ch}
.pv .kv{border-top:0;grid-template-columns:180px 1fr}
.pv .kv>div{padding:12px 0;border-bottom:1px solid var(--hair2);font:400 15px/1.5 var(--sans)}
.pv .kv>.k{font:500 13.5px/1.5 var(--sans);letter-spacing:0;text-transform:none;color:var(--faint);padding-top:12px}
.pv .big{font:500 40px/1.1 var(--serif)}

/* the figures: the clearest thing on a sheet */
.pv .figs{display:grid;grid-template-columns:1.7fr 1fr .8fr 1.2fr;gap:22px 28px;margin:10px 0 18px}
.pv .fig .v{white-space:nowrap}
.pv .fig .l{font:500 13.5px/1.3 var(--sans);letter-spacing:0;text-transform:none;color:var(--faint);margin-bottom:8px}
.pv .fig .v{font:500 30px/1.1 var(--sans);letter-spacing:-.015em;font-variant-numeric:tabular-nums;color:var(--ink)}
.pv .fig.start{grid-column:1/-1;order:-1;background:var(--tint);border-radius:14px;padding:24px 28px}
.pv .fig.start .l{color:var(--forest);font-weight:600}
.pv .fig.start .v{font-size:56px;color:var(--forest);letter-spacing:-.025em}
.pv .beside{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;background:none;border:0;padding:0;margin:4px 0 22px;font:400 14px/1.3 var(--sans);color:var(--faint)}
.pv .beside>span{display:flex;flex-direction:column;gap:8px;background:var(--tint);border-radius:14px;padding:20px 24px}
.pv .beside b{font:500 34px/1.1 var(--sans);letter-spacing:-.02em;color:var(--forest);font-variant-numeric:tabular-nums}
.pv .slabel{font:500 13.5px/1.3 var(--sans)!important;letter-spacing:0!important;text-transform:none!important;color:var(--faint)!important;margin:30px 0 8px!important}
.pv table.vt{font-size:14.5px;margin-top:4px}
.pv table.vt th{font:500 13px/1.3 var(--sans);letter-spacing:0;text-transform:none;color:var(--faint);padding:10px 12px 10px 0;border-bottom:1px solid var(--hair)}
.pv table.vt td{padding:12px 12px 12px 0;border-bottom:1px solid var(--hair2)}
.pv table.vt td.m{font-family:var(--sans);font-size:14.5px;font-variant-numeric:tabular-nums}
.pv table.vt a,.pv .docs a{color:var(--forest);text-decoration:none;border-bottom:1px solid rgba(11,49,38,.35)}
.pv table.vt a:hover,.pv .docs a:hover{border-bottom-color:var(--forest)}

/* condition: the four tiers, photos */
.pv .tiers{gap:10px;margin:8px 0 16px}
.pv .tier{font:500 15px/1.25 var(--sans);background:#fff;border:1px solid var(--hair);border-radius:12px;padding:16px 18px;min-width:150px;flex:1 1 150px;transition:border-color .15s,background .15s}
.pv .tier:hover:not([disabled]){border-color:var(--forest)}
.pv .tier .n{font:600 11.5px/1 var(--sans);letter-spacing:.12em;color:var(--faint);margin-bottom:8px}
.pv .tier .c{font:400 13.5px/1 var(--sans);color:var(--slate);margin-top:8px}
.pv .tier.on{border-color:var(--forest);background:var(--tint);box-shadow:0 0 0 1px var(--forest)}
.pv .tier.on .n{color:var(--forest)}
.pv .photos{gap:14px;margin:10px 0}
.pv .ph{width:196px;border:1px solid var(--hair);border-radius:12px;background:#fff}
.pv .ph.on{border-color:var(--forest);box-shadow:0 0 0 1px var(--forest)}
.pv .ph img{height:128px}
.pv .ph .pb{font:400 13px/1 var(--sans);padding:10px 12px;color:var(--slate)}
.pv .ph .hero{font:500 12px/1 var(--sans);border:1px solid var(--hair);border-radius:6px;padding:5px 8px;color:var(--slate)}
.pv .ph .hero.on{background:var(--forest);border-color:var(--forest);color:#fff}
.pv .docs a{font:400 15px/1.9 var(--sans)}

/* what we cannot see, the decision, finalise */
.pv .chk{grid-template-columns:200px auto 1fr;border-top:1px solid var(--hair2);padding:14px 0;gap:10px 16px}
.pv .chk .nm{font:500 15px/1.35 var(--sans)}
.pv .seg{border:1px solid var(--hair);border-radius:10px}
.pv .seg button{font:500 13.5px/1 var(--sans);border-right:1px solid var(--hair);padding:10px 14px;color:var(--slate);background:#fff}
.pv .seg button:hover:not([disabled]){background:var(--tint2)}
.pv .seg button.on{background:var(--forest);color:#fff}
.pv input.vin,.pv textarea.vin,.pv select.vin{font:400 15px/1.45 var(--sans);border:1px solid var(--hair);background:#fff;border-radius:10px;padding:11px 14px}
.pv input.vin:focus,.pv textarea.vin:focus,.pv select.vin:focus{border-color:var(--forest);box-shadow:0 0 0 3px rgba(11,49,38,.12);outline:none}
.pv input.vin.mono{font-family:var(--sans);font-size:18px;font-variant-numeric:tabular-nums}
.pv textarea.vin{min-height:84px}
.pv .fields{gap:18px;margin:14px 0}
.pv .fields label{font:500 13.5px/1.3 var(--sans);letter-spacing:0;text-transform:none;color:var(--faint)}
.pv .fields .f input{margin-top:8px}
.pv .reasons legend{font:500 13.5px/1.3 var(--sans);letter-spacing:0;text-transform:none;color:var(--faint);margin-bottom:8px}
.pv .reasons.need legend{color:var(--warn);font-weight:600}
.pv .reasons label{font:400 15px/1.5 var(--sans);padding:7px 0}
.pv .reasons input[type=checkbox],.pv .ph input[type=checkbox]{accent-color:var(--forest);width:16px;height:16px}
.pv .guard{border:0;border-left:2px solid var(--warn);border-radius:0 10px 10px 0;background:var(--tint2);padding:14px 18px}
.pv .guard p{font:400 14.5px/1.55 var(--sans)}
.pv .missing{font:400 14.5px/1.6 var(--sans);color:var(--warn);padding-left:20px}
.pv .fin .refuse{color:var(--warn);font:400 15px/1.55 var(--sans)}
.pv .fin .done{font:400 17px/1.55 var(--serif)}
.pv .fin .done b,.pv .attach,.pv .sentbox b{font-family:var(--code);font-size:.92em;letter-spacing:.04em;font-weight:500}
.pv [data-finalise]{padding:15px 28px;font-size:15.5px;border-radius:12px}
.pv .send{border-top:1px solid var(--hair2);margin-top:18px;padding-top:18px}
.pv .sentbox{background:var(--tint);border-radius:12px;padding:16px 20px;font:400 15px/1.55 var(--sans)}
.pv .thiscar{margin-top:56px}
.pv .thiscar .tc{border-bottom:1px solid var(--hair2);font:400 14.5px/1.4 var(--sans)}
.pv .covfix{font:400 13.5px/1.6 var(--sans);color:var(--faint);border-top:1px solid var(--hair);margin-top:64px;padding-top:20px;max-width:64ch}

/* ---- Analyst mode ---- */
.pv .body{padding:44px 40px 8px;max-width:920px}
.pv .empty .lede{font:400 24px/1.45 var(--serif);color:var(--ink);max-width:30em;margin:0 0 30px}
.pv .empty .exlab,.pv .rcard .rc-lede,.pv .cant .exlab{font:600 11.5px/1 var(--sans);letter-spacing:.14em;color:var(--faint);margin:0 0 12px}
.pv .examples{gap:0;align-items:stretch;border-top:1px solid var(--hair)}
.pv .examples button{font:400 16px/1.45 var(--sans);color:var(--ink);background:none;border:0;border-bottom:1px solid var(--hair);border-radius:0;padding:16px 4px;max-width:none}
.pv .examples button:hover{color:var(--forest);background:var(--tint2)}
.pv .chat{padding:0 40px 28px}
.pv .chat .box{border:1px solid var(--hair);border-radius:16px;background:#fff;box-shadow:0 8px 30px rgba(21,32,26,.07);padding:6px 6px 6px 22px}
.pv .chat .box input{font:400 16px/1.4 var(--sans)}
.pv .chat .box .go{background:var(--forest);border-radius:12px}
.pv .chat .box .go:hover{background:var(--forest-hover)}
.pv .reading{font:400 16px/1.6 var(--sans);color:var(--slate)}
.pv .ev{border-bottom:1px dotted rgba(11,49,38,.5)}
.pv .ev:hover{color:var(--forest);border-bottom-color:var(--forest)}
.pv .rc-chip{font:500 13.5px/1 var(--sans);border:1px solid var(--hair);border-radius:999px;padding:8px 12px}
.pv .rc-chip .k{font-size:12px;letter-spacing:0;text-transform:none}
.pv .rc-opt{font:500 14px/1 var(--sans);border-radius:10px}
.pv .rline{font:400 13.5px/1.6 var(--sans)}
.pv .rline .rl-lab{font-size:12px;letter-spacing:.1em}
.pv .seesales{font:500 14px/1 var(--sans);color:var(--forest);border:1px solid var(--hair);border-radius:10px}
.pv .seesales:hover{border-color:var(--forest);color:var(--forest)}
.pv .hl{font-family:var(--serif)}
.pv .hl-num{font:500 56px/1.05 var(--sans);letter-spacing:-.025em;color:var(--forest);font-variant-numeric:tabular-nums}
.pv .rank-row .nm:hover{color:var(--forest)}
.pv .rank-row .bar{background:var(--forest)}
.pv .rank-row .bar.b2{background:#7F9A8C}
.pv table.answer th,.pv table.receipts th{font:500 13px/1.3 var(--sans);letter-spacing:0;text-transform:none;color:var(--faint)}
.pv table.answer td,.pv table.receipts td{font:400 14.5px/1.45 var(--sans);font-variant-numeric:tabular-nums}
.pv .cellnum,.pv .rcpt .p{font-family:var(--sans);font-variant-numeric:tabular-nums}
.pv .reclink{color:var(--forest)}
.pv .drawer{background:#fff;box-shadow:-10px 0 40px rgba(21,32,26,.1);border-left:1px solid var(--hair)}
.pv .modal{background:#fff;border:1px solid var(--hair);border-radius:16px}

/* ---- small screens ---- */
@media (max-width:900px){
  .pv .figs{grid-template-columns:repeat(2,minmax(0,1fr))}
  .pv .fig .v{font-size:26px}
  .pv .chrome,.pv .vals,.pv .body,.pv .chat{padding-left:24px;padding-right:24px}
  .pv .shead h1{font-size:36px}
  .pv .kv{grid-template-columns:140px 1fr}
}
@media (max-width:640px){
  .topbar{padding:0 16px}
  .topbar .tb-mark{font-size:19px}
  .topbar .tb-r{gap:8px;font-size:12.5px;line-height:1.25;flex-direction:column;align-items:flex-end;justify-content:center}
  .topbar .tb-sep{display:none}
  .topbar .tb-org{max-width:200px}
  .topbar .tb-logo{display:none}
  .pv[data-mode="vals"] .rail,.pv .rail{width:auto;height:auto;position:static;border-right:0;border-bottom:1px solid var(--hair);padding:14px 16px}
  .pv .chrome{padding:14px 16px}
  .pv .vals,.pv .body,.pv .chat{padding-left:16px;padding-right:16px}
  .pv .vnew{width:100%}.pv .vnew input{flex:1;width:auto}
  .pv .sheet{margin-top:28px}
  .pv .shead h1{font-size:30px}
  .pv .sec7{margin-top:48px}
  .pv .figs,.pv .beside{grid-template-columns:1fr}
  .pv .fig.start .v{font-size:44px}
  .pv .kv{grid-template-columns:1fr}.pv .kv>.k{padding-bottom:0;border-bottom:0}
  .pv .chk{grid-template-columns:1fr}
  .pv .tier{min-width:calc(50% - 5px)}
  .pv .ph{width:calc(50% - 7px)}
  .pv table.vt{display:block;overflow-x:auto}
  .pv .empty .lede{font-size:21px}
}
`;
