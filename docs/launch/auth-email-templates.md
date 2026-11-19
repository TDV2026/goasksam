# Sign-in email templates (Supabase)

Written by Lane C, Oct 24 2026. For Sam to paste into Supabase one step at a time. Nothing here has been pasted; no SMTP setting, SPF or DNS is touched by this change.

## Which template our "Email me a code" flow uses

The sign-in dialog (public/js/auth.js, authSignInEmail) posts the address to Supabase `/auth/v1/otp` with no `create_user` override, so Supabase creates the account when the address is new. It then asks for the code and verifies it with `/auth/v1/verify` using `type: "email"`.

| Case | Supabase sends | Template to edit |
|---|---|---|
| The address has no account yet (a new reader) | the confirmation email | Confirm signup |
| The address already has an account | the sign-in email | Magic Link |

Both carry the code in the Supabase variable `{{ .Token }}` (the app's own comment says this project sends 8 digits; the dialog accepts 4 to 10). The only link in either template is the footer's goasksam.com (to https://goasksam.com); the code itself is never a link, so a mail scanner cannot use it up by opening one. The footer link is there on purpose: in Sam's four test emails (Oct 24 2026, below) the plain version went to Junk and the version with that one link went to the Inbox.

Where to paste: Supabase dashboard, Authentication, Emails (Email Templates). Do the two templates one at a time; save each, then send yourself a real code to a new address (Confirm signup) and to your own existing address (Magic Link).

The same subject for both: `Your GoAskSam sign-in code`

## What the email says

"You asked to sign in to GoAskSam. Enter this code on the sign-in screen:", then the code, then "If you did not ask for this, you can ignore this email.", then the footer "GoAskSam, goasksam.com". One footer link to goasksam.com and no images (the wordmark is text), no marketing, no minutes stated: the code's real expiry is a Supabase setting that Lane C has not read, so the email does not name one. It is a complete HTML document with tables and inline styles, in the same look as the Task emails, with a dark twin (clients that honour `prefers-color-scheme`; every element also carries light colours so a client that forces its own dark mode still reads).

## 1. Confirm signup

Field: Authentication, Emails, Confirm signup. Subject heading: `Your GoAskSam sign-in code`. Message body (paste the whole block):

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>Your GoAskSam sign-in code</title>
<style>
@media (prefers-color-scheme: dark) {
  .gas-body { background:#121512 !important; }
  .gas-card { background:#1D221F !important; border-color:#3A423D !important; }
  .gas-word, .gas-text { color:#F3F1EA !important; }
  .gas-sub, .gas-foot { color:#B9C2BC !important; }
  .gas-code { background:#262D29 !important; color:#8FD0A8 !important; border-color:#3A423D !important; }
  .gas-rule { border-top-color:#3A423D !important; }
}
@media (max-width: 480px) {
  .gas-pad { padding-left:20px !important; padding-right:20px !important; }
  .gas-code { font-size:32px !important; letter-spacing:4px !important; }
}
</style>
</head>
<body class="gas-body" style="margin:0;padding:0;background:#F6F3EC;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="gas-body" style="background:#F6F3EC;">
  <tr>
    <td align="center" style="padding:28px 12px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" class="gas-card" style="width:100%;max-width:600px;background:#FFFFFF;border:1px solid #D8D4CB;border-radius:12px;">
        <tr>
          <td class="gas-pad" style="padding:30px 36px 0 36px;">
            <div class="gas-word" style="font-family:Georgia,'Times New Roman',serif;font-size:26px;line-height:30px;font-weight:bold;color:#1E4D38;">GoAskSam</div>
          </td>
        </tr>
        <tr>
          <td class="gas-pad" style="padding:22px 36px 0 36px;">
            <p class="gas-text" style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:17px;line-height:26px;color:#1A1A1A;">You asked to sign in to GoAskSam. Enter this code on the sign-in screen:</p>
          </td>
        </tr>
        <tr>
          <td class="gas-pad" style="padding:22px 36px 0 36px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td align="center" class="gas-code" style="background:#F1F0E9;border:1px solid #D8D4CB;border-radius:10px;padding:20px 12px;font-family:'Courier New',Courier,monospace;font-size:38px;line-height:44px;font-weight:bold;letter-spacing:6px;color:#1E4D38;">{{ .Token }}</td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td class="gas-pad" style="padding:22px 36px 0 36px;">
            <p class="gas-sub" style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:23px;color:#5F6B64;">If you did not ask for this, you can ignore this email.</p>
          </td>
        </tr>
        <tr>
          <td class="gas-pad" style="padding:28px 36px 30px 36px;">
            <div class="gas-rule" style="border-top:1px solid #E6E1D8;font-size:0;line-height:0;height:1px;">&nbsp;</div>
            <p class="gas-foot" style="margin:14px 0 0 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:19px;color:#6B756F;">GoAskSam, <a href="https://goasksam.com" style="color:inherit;text-decoration:underline;">goasksam.com</a></p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>
```

## 2. Magic Link

Field: Authentication, Emails, Magic Link. Subject heading: `Your GoAskSam sign-in code`. Message body (paste the whole block; it is the same document, because the reader sees the same thing either way):

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>Your GoAskSam sign-in code</title>
<style>
@media (prefers-color-scheme: dark) {
  .gas-body { background:#121512 !important; }
  .gas-card { background:#1D221F !important; border-color:#3A423D !important; }
  .gas-word, .gas-text { color:#F3F1EA !important; }
  .gas-sub, .gas-foot { color:#B9C2BC !important; }
  .gas-code { background:#262D29 !important; color:#8FD0A8 !important; border-color:#3A423D !important; }
  .gas-rule { border-top-color:#3A423D !important; }
}
@media (max-width: 480px) {
  .gas-pad { padding-left:20px !important; padding-right:20px !important; }
  .gas-code { font-size:32px !important; letter-spacing:4px !important; }
}
</style>
</head>
<body class="gas-body" style="margin:0;padding:0;background:#F6F3EC;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="gas-body" style="background:#F6F3EC;">
  <tr>
    <td align="center" style="padding:28px 12px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" class="gas-card" style="width:100%;max-width:600px;background:#FFFFFF;border:1px solid #D8D4CB;border-radius:12px;">
        <tr>
          <td class="gas-pad" style="padding:30px 36px 0 36px;">
            <div class="gas-word" style="font-family:Georgia,'Times New Roman',serif;font-size:26px;line-height:30px;font-weight:bold;color:#1E4D38;">GoAskSam</div>
          </td>
        </tr>
        <tr>
          <td class="gas-pad" style="padding:22px 36px 0 36px;">
            <p class="gas-text" style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:17px;line-height:26px;color:#1A1A1A;">You asked to sign in to GoAskSam. Enter this code on the sign-in screen:</p>
          </td>
        </tr>
        <tr>
          <td class="gas-pad" style="padding:22px 36px 0 36px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td align="center" class="gas-code" style="background:#F1F0E9;border:1px solid #D8D4CB;border-radius:10px;padding:20px 12px;font-family:'Courier New',Courier,monospace;font-size:38px;line-height:44px;font-weight:bold;letter-spacing:6px;color:#1E4D38;">{{ .Token }}</td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td class="gas-pad" style="padding:22px 36px 0 36px;">
            <p class="gas-sub" style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:23px;color:#5F6B64;">If you did not ask for this, you can ignore this email.</p>
          </td>
        </tr>
        <tr>
          <td class="gas-pad" style="padding:28px 36px 30px 36px;">
            <div class="gas-rule" style="border-top:1px solid #E6E1D8;font-size:0;line-height:0;height:1px;">&nbsp;</div>
            <p class="gas-foot" style="margin:14px 0 0 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:19px;color:#6B756F;">GoAskSam, <a href="https://goasksam.com" style="color:inherit;text-decoration:underline;">goasksam.com</a></p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>
```

## Checks after pasting

- Send a code to a brand-new address and to an existing one; each arrives with the 8 digit code large in the middle.
- In the received message (Show original) the Authentication-Results line should still read spf=pass, dkim=pass, dmarc=pass.
- Look at it once in Hotmail or Outlook with images off and once in dark mode.
- The dialog itself now says "Check your junk folder if it does not arrive." under the code request.

## The test that chose the footer link (Oct 24 2026)

Four copies of this email were sent from the same sender to Sam's Hotmail address through our Resend account. Resend reported all four delivered. Where they landed:

| Variant | What differed | Result |
|---|---|---|
| V1 | the plain template | Junk |
| V2 | V1 plus Reply-To and the List-Unsubscribe headers the Task emails carry | Inbox |
| V3 | V1 plus the footer link | Inbox |
| V4 | V1 with the code first in the subject | Junk |

Supabase's template field takes HTML only, so it cannot add headers; it can add the link. That is why both templates above carry the footer link.
