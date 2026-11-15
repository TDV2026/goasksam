// THE CONDITION NOTE AS SERVED (Lane D, Nov 14 2026, order 2318). The note of a suggested condition names what it used in plain words (lib/reasonWords.js desk3.cond_from); no suggestion says nothing; and a case stored before the rewording, whose note counted signals aloud
// (engine talk), serves nothing rather than the count: the signals it used were never stored, and nothing is made up here.
const OLD_TALK = /signals? counted/i;
export const servedBasis = c => (c && c.suggested && c.basis && !OLD_TALK.test(String(c.basis)) ? c.basis : null);
