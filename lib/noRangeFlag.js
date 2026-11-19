// THE NO-RANGE LINE SWITCH (Lane E, Nov 5 2026). Sam approved the engine's noRangeLine wording and Lane B removed the WAITING ON SAM marker (09915cf7), so pages print it by default.
// The switch stays as a kill switch: NORANGE_LINE=0 in the environment turns the line off everywhere (window.GAS_NORANGE=false). The See the sales button, the full sales list and the pre-war bodies never depend on it.
export const noRangeLineOn = () => process.env.NORANGE_LINE !== "0";
