// FIND PAGE CODE BY NAME, NEVER BY ITS SIGNATURE OR A LINE OF IT (Lane E, Nov 3 2026). A check that locates a page function by "  function drawerHtml(l, j){" breaks the day the function gains a parameter (drawerHtml(l, j, pk)); one that ends a slice at a typed-out
// line ("    lastDraw = d;") breaks the day that line moves. fnBlock(src, name) returns the whole declaration (from "  function name(" to the next declaration at the same indent), found by NAME only. scripts/pageSliceCheck.mjs fails any check
// that pins a signature with parameters or a typed-out indented line as a locator.
export function fnBlock(src, name) {
  const a = src.indexOf("  function " + name + "("); if (a < 0) throw new Error("missing function " + name);
  const b = src.indexOf("\n  function ", a + 10);
  return src.slice(a, b > 0 ? b : src.length);
}
