// THE FINAL ENTRY PAGES' COPY THAT NAMES SAM (Sam's brief, docs/design/entry-pages-final-brief.md, Nov 9 2026): the three search placeholders and the chip label.
// They live here and not in the reason table because reasonWordsCheck keeps Sam's name out of the table's sentences; the pages print them from here and type none.
export const ENTRY_BRIEF_COPY = {
  find: { placeholder: "Speak or type" },
  mc: { placeholder: "Tell Sam the car you want to check..." },
  sell: { placeholder: "Tell Sam the car you want to sell..." },
  chipsLabel: "Go ask Sam:",
  platformPickLabel: "Sam's platform pick",
  viewAuction: "View auction"   // the Tasks email card's button words (lib/tasks/emailCardLayout.js), printed on each Find card
};
