// A CLOCK MOVED FORWARD (Lane B, Nov 6 2026), loaded with node --import by scripts/clockShiftCheck.mjs: Date.now() and new Date() (no argument) answer the real time plus CLOCK_SHIFT_DAYS. Everything else about Date is the real one.
const days = Number(process.env.CLOCK_SHIFT_DAYS || 0), off = days * 864e5, RealDate = globalThis.Date;
if (off) {
  class ShiftedDate extends RealDate { constructor(...a) { if (a.length) super(...a); else super(RealDate.now() + off); } static now() { return RealDate.now() + off; } }
  globalThis.Date = ShiftedDate;
}
