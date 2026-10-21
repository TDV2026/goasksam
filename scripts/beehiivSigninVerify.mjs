// RETIRED (Oct 21 2026, Lane D, Sam's decision): this tested the ?bhs= newsletter-link auto-signin on production, which
// is removed (api/crew.js no longer mints a session for a Beehiiv subscription id). Its replacement is the offline
// scripts/crewBhsCheck.mjs (a ?bhs= request mints nothing; the crew and tester paths unchanged), run by prePush. Kept as
// a note so an old command line explains itself instead of failing; it calls nothing.
console.log("beehiivSigninVerify: retired; the ?bhs= sign-in is removed. Run scripts/crewBhsCheck.mjs (offline) instead.");
