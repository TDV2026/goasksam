// WHICH SELLER REPORT IS BUILT (Lane D, Nov 15 2026; redesign order 2318 item 4). The org setting report.version picks the layout: 3 (the four page report, lib/desk/reportPdfV3.js) is the default and stays so until Sam switches an org to 4 (the three page report, lib/desk/reportPdfV4.js).
// A DRAFT may ask for either layout (case_pdf { draft: true, reportVersion: 4 }) so the crew can read the new report before the switch; a FINAL report, a sent report and every later export of it follow the org setting only, so a request can never change the layout of a report that is on the record.
export const REPORT_DEFAULT_VERSION = 3;
const asVersion = v => (Number(v) === 4 ? 4 : Number(v) === 3 ? 3 : null);
export const reportVersionOf = (set, ask, { draft = false } = {}) => (draft ? asVersion(ask) : null) || asVersion(set && (set.reportVersion != null ? set.reportVersion : set.report && set.report.version)) || REPORT_DEFAULT_VERSION;
export async function buildSellerReport(sheet, set, opts = {}, ask) {
  if (reportVersionOf(set, ask, { draft: opts.draft === true }) === 4) return (await import("./reportPdfV4.js")).buildReportV4(sheet, set, opts);
  return (await import("./reportPdfV3.js")).buildReportV3(sheet, set, opts);
}
