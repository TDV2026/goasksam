// Disguised 404 (Oct 2026, Job 2): for an endpoint that must look like it never existed to anyone
// without the right cookie (Sam Desk, api/desk.js) - never a 403/JSON refusal that tells a stranger
// something is there, just gated. The PAGE case (/desk) is handled for free by vercel.json's
// conditional rewrite (no rewrite matches -> Vercel's own native 404, byte-identical by
// construction). The API case cannot use that trick (api/desk.js is a real serverless function at
// a real filesystem path, so Vercel always invokes it regardless of any rewrite) - this module is
// the closest practical match from inside a function: same status, same content-type, same
// generic "page not found" body shape as Vercel's own platform 404, no app text anywhere in it.
export function sendDisguisedNotFound(res) {
  const html = `<!doctype html><html lang=en><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><meta name=theme-color content=#0a0a0a media="(prefers-color-scheme: dark)"><meta name=theme-color content=#ffffff media="(prefers-color-scheme: light)"><title>404: NOT_FOUND</title><style>:root{color-scheme:dark;--background:#0a0a0a;--foreground:#ededed;--copy:#ffffff;--secondary:#a0a0a0}@media(prefers-color-scheme:light){:root{color-scheme:light;--background:#ffffff;--foreground:#171717;--copy:#171717;--secondary:#4d4d4d}}*,*::before,*::after{box-sizing:border-box}html,body{min-height:100%}body{margin:0;background:var(--background);color:var(--foreground);font-family:geist,-apple-system,BlinkMacSystemFont,segoe ui,helvetica neue,Arial,sans-serif}main{display:grid;min-height:100vh;place-items:center;padding:32px}h1{font-size:24px;font-weight:600;letter-spacing:-.96px;line-height:32px;margin:0}p{margin:8px 0 0;color:var(--copy);font-size:16px;line-height:24px}.metadata{margin-top:23px;color:var(--secondary);font-family:geist mono,sfmono-regular,Consolas,liberation mono,Menlo,monospace;font-size:12px;line-height:16px}</style><main><section aria-labelledby=error-title><h1 id=error-title>This page doesn&#8217;t exist</h1><p>It may have been moved, removed, or never existed.</p><div class=metadata><p>404 NOT_FOUND</p></div></section></main>`;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=0, must-revalidate");
  res.status(404).send(html);
}
