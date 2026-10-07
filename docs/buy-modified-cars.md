# Modified-car filtering (later, not in Tasks V1)

Tested Oct 2026 on 20 live listings: the current flag (lib/live/search.js cardFlag, title + description)
catches only titles with the literal word "Modified" (2 of 20) and missed at least seven clear cases.
For later: "-Powered" in a listing title (BaT's convention for a non-original engine: "347-Powered",
"5.7L-Powered", "L28-Powered") and the word "Conversion" would catch most modified cars. Verify on a
larger sample before any filter uses it.
