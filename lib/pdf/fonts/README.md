# Fonts for the Desk report PDF

Newsreader (The Newsreader Project Authors) and Instrument Sans (The Instrument Sans Project Authors), both under the SIL Open Font License 1.1: the licence texts are OFL-Newsreader.txt and OFL-InstrumentSans.txt.

The files here are static instances (Regular at weight 400, Bold at weight 700, Newsreader at optical size 18, Instrument Sans at width 100) cut from the variable TrueType files in https://github.com/google/fonts (ofl/newsreader and ofl/instrumentsans) with fontTools varLib.instancer, because the PDF writer (lib/pdf/mini.js, lib/pdf/ttf.js) embeds a TrueType file and does not apply variations. Neither licence names a Reserved Font Name. The report embeds only the glyphs it prints.
