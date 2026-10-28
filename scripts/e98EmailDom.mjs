// THE TASK EMAIL, READ WHERE IT IS (shared by e98LiveCheck.mjs and underlineCheck.mjs). /api/tasks?carmails=1 is a crew preview PAGE whose emails sit in sandboxed iframes (srcdoc): reading the page's own text reads the wrapper, not
// an email (the first live run read 863 characters and 0 figures and failed for that reason). So each email frame is read on its own: it must carry figures, no number inside a link or under an underline (the View auction and Market
// Check buttons carry no figure), no stale line, no "Latest sale:" line, and at least one email must have been read.
export async function readEmails(browser, html, shot) {
  const p = await browser.newPage(); await p.setViewport({ width: 700, height: 900 }); await p.setContent(html, { waitUntil: "load" });
  if (shot) await p.screenshot({ path: shot, fullPage: true });
  const out = [];
  for (const f of p.frames()) { if (f === p.mainFrame()) continue;
    out.push(await f.evaluate(() => { const t = document.body ? document.body.innerText : ""; const bad = [];
      for (const a of document.querySelectorAll("a")) if (/\$\s?\d/.test(a.innerText)) bad.push(a.innerText.trim().slice(0, 50) + " [in a link]");
      for (const e of document.querySelectorAll("*")) if (e.children.length === 0 && /\$\s?\d/.test(e.textContent) && /underline/.test(getComputedStyle(e).textDecorationLine)) bad.push(e.textContent.trim().slice(0, 50) + " [underlined]");
      return { len: t.length, money: (t.match(/\$[\d,]+/g) || []).length, bad, stale: /Sales read on|Sales since then are not in yet|Updating now/.test(t), latest: /Latest sale: [A-Z]/.test(t) }; })); }
  await p.close(); return out;
}
export const judgeEmails = (ok, name, E) => {
  ok(E.length > 0 && E.some(e => e.money > 0), `${name}: at least one email was read, with figures (${E.length} emails, ${E.map(e => e.money).join("/")} figures)`);
  ok(E.every(e => !e.bad.length), `${name}: no underlined or linked number in any email${E.flatMap(e => e.bad).length ? " (" + E.flatMap(e => e.bad).slice(0, 3).join(" | ") + ")" : ""}`);
  ok(E.every(e => !e.stale && !e.latest), `${name}: no stale line and no Latest sale line in any email`);
};
