// null is no number: Number(null) is 0 and Number("") is 0, so Number.isFinite(Number(v)) is true for a missing value.
// Every place that reads an optional figure tests it with isNum, never Number.isFinite(Number(v)) alone (e96).
export const isNum = v => v != null && v !== "" && typeof v !== "boolean" && Number.isFinite(Number(v));
