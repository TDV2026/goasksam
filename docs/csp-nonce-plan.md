# Content Security Policy: from report-only to enforced (security F-05)

Sam approved job E on Oct 21 2026: the script policy ships in REPORT-ONLY mode first and is enforced only after the
report-only run is clean and Sam says so.

## Today (report-only)
- vercel.json sends `Content-Security-Policy-Report-Only` on every path, with `report-uri /api/cspReport`.
- Browsers block nothing. Each would-be block is posted to `/api/cspReport`, which writes one trimmed line to the
  function log (`csp_report <directive> blocked=<origin> page=<path>`). No table, no full address.
- Enforced today, because nothing is framed by another site: `X-Frame-Options: SAMEORIGIN` and
  `Content-Security-Policy: frame-ancestors 'self'`.
- `script-src` still allows `'unsafe-inline'`: every shell writes inline scripts, so a policy without it would report on
  every page and say nothing useful yet.

## Step 1: read the report-only log
List every distinct `csp_report` line (directive, blocked origin, page) for a week of real traffic. Each one is either a
host the pages really need (add it to the policy) or something that should not be there (find and remove it).

## Step 2: nonces for inline scripts
- Every page shell (lib/appShell.js, api/_chrome.js, api/buy.js, api/history.js, api/sellPage.js, api/tasksPage.js,
  api/partnerDemo.js and the static pages' build) mints ONE random nonce per response
  (`crypto.randomBytes(16).toString("base64")`) and stamps it on every inline `<script>` it writes
  (`<script nonce="...">`).
- The response sends the policy itself (per response, because the nonce changes), not vercel.json.
- Inline event handlers (`onclick=`, `onerror=`) are moved into the scripts (a nonce does not cover them).
- Static HTML in public/ either gets its inline scripts moved to files, or a hash per script.

## Step 3: enforce
When the report-only log shows only lines Sam accepts, `'unsafe-inline'` leaves `script-src`, the nonce goes in, and the
header changes from `Content-Security-Policy-Report-Only` to `Content-Security-Policy`, after Sam says so. Proved on a
preview first (scripts/pushCheck.mjs, the four pages, a real-browser pass), then the push protocol.
