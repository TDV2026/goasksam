// Shared page chrome for the server-rendered public pages (history, /buy): One Box tokens + fonts,
// the left rail (with Buy) and the phone header. Lane C.
export const PAGE_CSS = `
:root{--page:#F6F3EC;--card:#FFFFFF;--border:#DCD8CC;--ink:#15201A;--green:#1E4D38;--green-dk:#15372A;--sec:#5E6B63;--div:#E2DED3;--take:#F1F5F1;--live:#2E8B57;--ph:#E6E2D8;--soft:#3C4942;--tint:#EDF3EE;--tint-line:#D5E2D8;--serif:"Newsreader",Georgia,"Times New Roman",serif;--sans:"Instrument Sans",system-ui,-apple-system,"Segoe UI",sans-serif;color-scheme:light}
*{box-sizing:border-box}html,body{margin:0}
body{background:var(--page);color:var(--ink);font:400 17px/1.5 var(--sans);-webkit-font-smoothing:antialiased;font-variant-numeric:lining-nums}
[hidden]{display:none!important}
a{color:var(--green)}a:hover{color:var(--green-dk)}
:focus-visible{outline:2px solid var(--green);outline-offset:2px}
.rail{position:fixed;left:0;top:0;bottom:0;width:240px;border-right:1px solid var(--div);padding:28px 24px;display:flex;flex-direction:column;gap:2px;background:var(--page)}
.rail .logo{font:600 26px/1.1 var(--serif);color:var(--ink);text-decoration:none;margin-bottom:22px}
.rail a.n{display:flex;align-items:center;min-height:44px;padding:0 14px;color:var(--sec);text-decoration:none;font-size:15px;border-left:2px solid transparent}
.rail a.n:hover{color:var(--ink)}.rail a.n.on{color:var(--green);font-weight:600;border-left-color:var(--green);padding-left:12px}
.mhead,.mnav{display:none}
main{margin-left:240px;padding:36px 48px 64px;display:flex;justify-content:center}
.col{width:100%;max-width:860px;display:flex;flex-direction:column;gap:28px}
.card{background:var(--card);border:1px solid var(--border);border-radius:16px}
.eyebrow{font:600 13px/1.4 var(--sans);letter-spacing:.14em;text-transform:uppercase;color:var(--green)}
.muted{color:var(--sec)}
.top{display:grid;grid-template-columns:minmax(0,1fr) 340px;gap:28px;align-items:start}
.top h1{margin:6px 0 4px;font:600 40px/1.12 var(--serif);letter-spacing:-.01em}
.vinline{font:500 15px/1.4 var(--sans);color:var(--sec);letter-spacing:.04em}
.answer{margin:14px 0 0;font:400 20px/1.45 var(--serif);color:var(--ink)}
figure{margin:0}
.photo{display:block;position:relative;height:220px;border-radius:14px;overflow:hidden;background:var(--ph);border:1px solid var(--border)}
.photo img{width:100%;height:100%;object-fit:cover;display:block}
figcaption{margin-top:6px;font:400 14px/1.4 var(--sans);color:var(--sec)}
.live{display:flex;align-items:center;gap:16px;padding:18px 22px;flex-wrap:wrap}
.live .dot{width:10px;height:10px;border-radius:50%;background:var(--live);flex:none}
.live .t{font:600 20px/1.3 var(--serif)}
section.card{padding:22px 26px}
.sh{display:flex;justify-content:space-between;align-items:baseline;gap:12px;margin-bottom:12px}
h2{margin:0;font:500 22px/1.25 var(--serif)}
table{width:100%;border-collapse:collapse;font-size:16px}
th{text-align:left;font:600 13px/1.3 var(--sans);letter-spacing:.1em;text-transform:uppercase;color:var(--sec);padding:0 12px 10px 0;border-bottom:1px solid var(--div)}
td{padding:14px 12px 14px 0;border-bottom:1px solid var(--div);vertical-align:top}
tr:last-child td{border-bottom:0}
td.r,th.r{text-align:right;padding-right:0}
td a{font-weight:500}
.sold{font-weight:600}
.thumb{display:block;width:72px;height:50px;border-radius:8px;overflow:hidden;background:var(--ph)}
.thumb img{width:100%;height:100%;object-fit:cover;display:block}
.samline{display:flex;gap:14px;align-items:flex-start}
.roundel{flex:none;width:34px;height:34px;border-radius:50%;border:1.5px solid var(--green);color:var(--green);font:600 10px/1 var(--sans);letter-spacing:.08em;display:flex;align-items:center;justify-content:center}
.samline p{margin:4px 0 0;font:400 20px/1.45 var(--serif)}
.card.anscard{display:grid;grid-template-columns:repeat(10,minmax(0,1fr));overflow:hidden;padding:0}
.ans-main{grid-column:span 7;padding:26px 28px 24px;display:flex;flex-direction:column;gap:10px;border-right:1px solid var(--div)}
.anscard.solo .ans-main{grid-column:1 / -1;border-right:0}
.ans-main .eyebrow{color:var(--sec)}
.range{margin:0;font:600 40px/1.1 var(--serif);color:var(--green);font-variant-numeric:tabular-nums}
.range .to{font-weight:400;font-size:26px;color:var(--sec)}
.landed{margin:0;font:400 20px/1.4 var(--serif)}
.fresh{display:flex;gap:10px;align-items:center;font-size:14px;color:var(--sec)}
.fresh .d{width:8px;height:8px;border-radius:50%;background:var(--live);flex:none}
.ctx{margin:0;font-size:15px;color:var(--soft)}
.full{font-weight:600;font-size:15px;text-decoration:underline;text-underline-offset:3px;min-height:44px;display:inline-flex;align-items:center;align-self:flex-start}
.take{grid-column:span 3;padding:24px 22px;background:var(--take);display:flex;flex-direction:column;gap:8px}
.take .tag{font:600 13px/1 var(--sans);letter-spacing:.14em;text-transform:uppercase;color:var(--green);display:flex;gap:10px;align-items:center}
.take .tag .roundel{width:28px;height:28px}
.take p{margin:0;font:400 17px/1.45 var(--serif);color:var(--soft)}
.faq dt{font:600 16px/1.4 var(--sans);margin-top:14px}.faq dt:first-child{margin-top:0}
.faq dd{margin:4px 0 0;font:400 17px/1.5 var(--serif);color:var(--soft)}
.btns{display:flex;gap:12px;flex-wrap:wrap}
.btn{display:inline-flex;align-items:center;justify-content:center;min-height:48px;padding:0 20px;border-radius:12px;font:600 16px var(--sans);text-decoration:none;cursor:pointer;border:0}
.btn.p{background:var(--green);color:#fff}.btn.p:hover{background:var(--green-dk);color:#fff}
.btn.s{background:var(--card);color:var(--green);border:1.5px solid var(--green)}.btn.s:hover{background:var(--tint)}
.watch{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-top:12px}
.watch input{min-height:48px;min-width:260px;flex:1;border:1px solid var(--border);border-radius:12px;padding:0 16px;font:400 16px var(--sans);background:var(--card);color:var(--ink)}
.watch .msg{flex-basis:100%;font-size:15px;color:var(--sec);margin:0}
.links{display:flex;gap:8px 24px;flex-wrap:wrap;font-size:15px}
.links a{font-weight:600;min-height:44px;display:inline-flex;align-items:center}
.foot{font-size:14px;color:var(--sec);margin:0}
.whynote{display:flex;flex-direction:column;gap:6px}
.whynote .eyebrow{color:var(--sec)}
.whynote p{margin:0;font:400 15px/1.55 var(--sans);color:var(--sec);max-width:68ch}
.whynote a{font-weight:600;font-size:15px;min-height:44px;display:inline-flex;align-items:center;align-self:flex-start}
.notfound h1{font:600 36px/1.2 var(--serif);margin:0 0 10px;overflow-wrap:anywhere}
.range,.cprice,td{font-variant-numeric:lining-nums tabular-nums}
@media (max-width:860px){
  .rail{display:none}
  .mhead{display:flex;justify-content:space-between;align-items:center;padding:20px 16px 0}
  .mhead>a{font:600 22px/1 var(--serif);color:var(--ink);text-decoration:none}
  .mnav{display:flex;gap:2px}
  .mnav a.n{display:inline-flex;align-items:center;min-height:44px;padding:0 10px;color:var(--sec);text-decoration:none;font-size:15px;border-radius:8px}
  .mnav a.n.on{color:var(--green);font-weight:600;background:var(--tint)}
  main{margin-left:0;padding:20px 16px 40px}
}
@media (max-width:640px){
  .col{gap:20px}
  .top{grid-template-columns:1fr;gap:16px}
  .top h1{font-size:30px}
  .answer{font-size:19px}
  .photo{height:200px}
  section.card{padding:18px 16px}
  table.stack thead{display:none}
  table.stack,table.stack tbody,table.stack tr,table.stack td{display:block;width:100%}
  table.stack tr{padding:12px 0;border-bottom:1px solid var(--div)}
  table.stack tr:last-child{border-bottom:0}
  table.stack td{border:0;padding:2px 0;text-align:left}
  table.stack td[data-l]::before{content:attr(data-l) ": ";color:var(--sec);font-size:14px}
  table.stack td.thumbcell{float:right;margin-left:12px}
  .card.anscard{display:flex;flex-direction:column}
  .ans-main{padding:18px;border-right:0;border-bottom:1px solid var(--div)}
  .anscard.solo .ans-main{border-bottom:0}
  .range{font-size:32px}.range .to{font-size:20px}
  .take{padding:16px 18px}
  .btns .btn{flex:1 1 100%}
  .watch input{min-width:0}
}`;
export const FONT_LINKS = '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;0,6..72,600;1,6..72,400&amp;family=Instrument+Sans:wght@400;500;600&amp;display=swap">';
export function railHtml(active, extra) {
  const item = (key, href, label) => '<a class="n' + (active === key ? ' on" aria-current="page' : '') + '" href="' + href + '">' + label + '</a>';
  return '<nav class="rail" aria-label="Main navigation"><a class="logo" href="/onebox">GoAskSam</a>' +
    item('ask', '/onebox', 'Ask Sam') + item('buy', '/buy', 'Buy') + item('sell', '/sell', 'Where to sell') +
    (active === 'history' ? item('history', '#', 'Car histories') : '') +
    item('how', '/how-sam-decides', 'How Sam decides') + item('business', '/business', 'For business') + (extra || '') + '</nav>' +
    '<header class="mhead"><a href="/onebox">GoAskSam</a><nav class="mnav" aria-label="Sections">' + item('ask', '/onebox', 'Ask Sam') + item('buy', '/buy', 'Buy') + item('sell', '/sell', 'Sell') + '</nav></header>';
}

export const WHY_RESULT_HTML = '<section class="whynote"><span class="eyebrow">Why it looks like this</span><p>No chart and no score. Every figure on this page is a hammer price from a real auction, matched to the car&#8217;s trim, body and gearbox, converted at the rate on the day it sold, with the replicas, projects and odd sales set aside. The range is where most of those sales landed. Where there aren&#8217;t enough sales to say something, we say that instead.</p><a href="/how-sam-decides">How Sam decides &#8594;</a></section>';
