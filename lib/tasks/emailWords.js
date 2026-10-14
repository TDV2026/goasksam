// Words that never reach a person's email (Oct 2026, Lane C, Sam's list). Model-written text (a research summary, a
// Task line) is screened before it is sent; on a hit the generated text is not sent, the email carries the plain
// template line instead, and the event is logged with the words that hit and no content. Code-written templates are
// held to the same list by scripts/emailWordsCheck.mjs (run by prePush).
export const EMAIL_BANNED = /\b(worth|values?|valued|valuations?|estimates?|estimated|appraisals?|appraised|medians?|percentiles?|alerts?|watch(?:es|ed|ing)?|pricing)\b/gi;

// The banned words in a text, lower-cased and once each ([] when clean). Addresses are left out of the reading.
export function bannedIn(text) {
  const s = String(text == null ? "" : text).replace(/https?:\/\/\S+/g, " ");
  return [...new Set((s.match(EMAIL_BANNED) || []).map(w => w.toLowerCase()))];
}
// The banned words inside link addresses (a link a person can read in a plain-text email).
export function bannedInLinks(text) {
  return [...new Set((String(text == null ? "" : text).match(/https?:\/\/\S+/g) || []).flatMap(u => (u.match(/[a-z]+/gi) || []).filter(w => new RegExp(`^${EMAIL_BANNED.source}$`, "i").test(w)).map(w => w.toLowerCase())))];
}

// The research email's plain line, used when the model's summary is held back.
export const RESEARCH_PLAIN = "Sam finished the research. Open the Task to read it.";

// What a Task email may print from an update: the update's own text when clean, else the plain line.
// generated: the text came from the model (a code-written update is never swapped, it is checked by prePush).
export function emailText(text, { generated, plain }) {
  const hits = generated ? bannedIn(text) : [];
  return hits.length ? { text: plain, held: hits } : { text, held: null };
}
