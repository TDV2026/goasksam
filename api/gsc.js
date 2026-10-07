// Google Search Console site verification via the HTML-file method, token from an env var so the
// secret never lives in the repo. Google issues a file named google<token>.html whose body must read
// "google-site-verification: google<token>.html". Sam sets GSC_VERIFICATION_TOKEN to the <token> part
// (everything between "google" and ".html"); this route serves the matching file and nothing else.
//   Wired in vercel.json:  /(google[A-Za-z0-9_-]+\.html)  ->  /api/gsc?file=$1
export default function handler(req, res) {
  const token = (process.env.GSC_VERIFICATION_TOKEN || "").trim();
  const file = String((req.query && req.query.file) || "").trim();
  res.setHeader("content-type", "text/html; charset=utf-8");
  if (!token) return res.status(404).send("Not configured.");
  const expected = `google${token}.html`;
  if (file !== expected) return res.status(404).send("Not found.");
  return res.status(200).send(`google-site-verification: ${expected}`);
}
