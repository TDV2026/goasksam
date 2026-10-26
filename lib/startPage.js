// GOASKSAM 2.0 STAGE 2: the start page (Sam's block and reference images, Oct 23 2026). ONE component for Home, Find, Market Check and
// Sell: a small caps eyebrow, the serif headline, one supporting sentence, the input card (the words, a helper line, the microphone and
// the submit arrow), and one quiet line under it. Every product draws it from this file, with its own copy and its own element ids
// (each page already wires its own engine to its own ids, so the component submits nothing itself: no universal router).
//
// startHtml is deliberately self-contained (no imports, no outer names) so its SOURCE also runs in the browser (START_JS prints it as
// window.gstHtml): the server's first paint and the page's own "new search" screen are the same function, never two copies.
// ONE definition for the start pages' input box width and send button (Sam, Oct 26 2026), so Sell, Find and Market Check cannot drift apart:
// the box is 600 px at most (full width less the page gutters on a phone), the send button is 40 px with 12 px corners in the dark brand green #123F33 (fixed, not a page variable, so every page and every visitor sees the same colour) with the
// right arrow. startHtml below keeps its own copy of the arrow (its source also runs in the browser, so it cannot read outer names);
// scripts/startButtonCheck.mjs keeps the two equal. Sell's button (api/sellPage.js) draws GO_ARROW_SVG with the same .gst-go class.
export const START_BOX_MAX = 600;
export const GO_ARROW_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
export function startHtml(c) {
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (m) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[m]; }); };
  var id = c.ids || {};
  var examples = Array.isArray(c.examples) && c.examples.length > 1 ? ' data-ph="' + esc(JSON.stringify(c.examples)) + '"' : "";
  var ph = c.placeholder || (c.examples && c.examples[0]) || "";
  var arrow = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
  var mic = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2z"/></svg>';
  return '<section class="gst' + (c.cls ? " " + esc(c.cls) : "") + '" id="' + esc(c.id || "gas-start") + '" data-gst>' +
    '<p class="gst-eye">' + esc(c.eyebrow) + "</p>" +
    '<h1 class="gst-h">' + esc(c.title) + "</h1>" +
    '<p class="gst-sub">' + esc(c.sub) + "</p>" +
    '<div class="gst-box" role="search"><label class="gst-sr" for="' + esc(id.input) + '">' + esc(c.label || c.title) + "</label>" +
    '<textarea id="' + esc(id.input) + '" class="gst-in" rows="1" autocomplete="off" enterkeyhint="search" spellcheck="false" placeholder="' + esc(ph) + '"' + examples + (c.enter ? " data-gst-enter" : "") + "></textarea>" +
    '<div class="gst-row"><span class="gst-help">' + esc(c.helper) + "</span>" +
    '<button type="button" class="gst-mic" id="' + esc(id.mic) + '" data-gst-mic="' + esc(id.input) + '" aria-label="Speak instead of typing" hidden>' + mic + "</button>" +
    '<button type="button" class="gst-go" id="' + esc(id.go) + '" aria-label="' + esc(c.goLabel || "Search") + '"' + (c.goAttrs ? " " + c.goAttrs : "") + ">" + arrow + "</button></div></div>" +
    (c.line ? '<p class="gst-line">' + esc(c.line) + "</p>" : "") +
    (c.asof ? '<p class="gst-asof"' + (c.leadMark ? " data-lead-sentence" : "") + ">" + esc(c.asof) + "</p>" : "") +
    (c.after || "") + "</section>";
}

export const START_CSS = `
.gst{width:100%;max-width:960px;margin:0 auto;padding:0 8px;display:flex;flex-direction:column;align-items:center;text-align:center;box-sizing:border-box}
.gst-eye{margin:0 0 14px;font:600 12px/1.3 var(--sans,system-ui);letter-spacing:.2em;text-transform:uppercase;color:var(--green,#1E4D38)}
.gst-h{margin:0 0 14px;font:500 clamp(30px,4.6vw,46px)/1.12 var(--serif,Georgia,serif);letter-spacing:-.01em;color:var(--ink,#15201A)}
.gst-sub{margin:0 0 22px;max-width:720px;text-wrap:balance;font:400 clamp(16px,1.6vw,19px)/1.45 var(--sans,system-ui);color:var(--sec,#5E6B64)}
.gst-box{position:relative;width:100%;max-width:${START_BOX_MAX}px;box-sizing:border-box;text-align:left;background:var(--card,#fff);border:1px solid var(--border,#D8D4CB);border-radius:22px;padding:14px 20px 8px;box-shadow:0 10px 30px rgba(21,32,26,.06)}
.gst-box:focus-within{border-color:var(--green,#1E4D38);box-shadow:0 10px 30px rgba(21,32,26,.08),0 0 0 3px rgba(30,77,56,.12)}
.gst-in{display:block;width:100%;box-sizing:border-box;min-height:28px;max-height:220px;overflow-y:auto;border:0;outline:0;resize:none;background:transparent;padding:0;margin:0 0 2px;font:400 20px/1.4 var(--sans,system-ui);color:var(--ink,#15201A)}
.gst-in::placeholder{color:#9AA39D}
.gst-row{display:flex;align-items:center;gap:10px;min-height:44px}
.gst-help{flex:1;min-width:0;font:400 14px/1.3 var(--sans,system-ui);color:var(--sec,#6E7A73)}
.gst-mic,.gst-go{flex:none;display:grid;place-items:center;border:0;cursor:pointer;padding:0}
.gst-mic{width:40px;height:40px;border-radius:50%;background:transparent;color:var(--sec,#5E6B64)}
.gst-mic[hidden]{display:none}
.gst-mic svg{width:22px;height:22px;fill:currentColor}
.gst-mic:hover,.gst-mic:focus-visible{background:var(--rail-hover-bg,#E3EFE6);color:var(--ink,#15201A)}
.gst-mic.on{background:#B3241F;color:#fff}
.gst-go{width:40px;height:40px;border-radius:12px;background:#123F33;color:#fff}
.gst-go:hover,.gst-go:focus-visible{background:#0C2F25}
.gst-go svg{width:22px;height:22px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.gst-line{margin:14px 0 0;font:400 15px/1.4 var(--sans,system-ui);color:var(--sec,#6E7A73)}
.gst-asof{margin:6px 0 0;font:400 12.5px/1.4 var(--sans,system-ui);color:#8A938D}
.gst-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.gst-cards{display:grid;grid-template-columns:1fr 1fr;gap:18px;width:100%;margin:22px 0 0;text-align:left}
.gst-card{display:flex;gap:14px;align-items:flex-start;padding:20px 22px;border:1px solid var(--border,#D8D4CB);border-radius:16px;background:var(--card,#fff);text-decoration:none;color:var(--ink,#15201A)}
.gst-card:hover,.gst-card:focus-visible{border-color:var(--green,#1E4D38)}
.gst-card-ic{flex:none;width:44px;height:44px;border-radius:12px;background:var(--rail-active-bg,#DCE9DF);display:grid;place-items:center;color:var(--green,#1E4D38)}
.gst-card-ic svg{width:22px;height:22px;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}
.gst-card-t{flex:1;min-width:0}
.gst-card-t b{display:block;font:600 18px/1.3 var(--sans,system-ui)}
.gst-card-t span{display:block;margin-top:4px;font:400 15px/1.4 var(--sans,system-ui);color:var(--sec,#5E6B64)}
.gst-card-ar{flex:none;width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:1.8;color:var(--sec,#5E6B64)}
@media (max-width:700px){
  .gst{padding:0}
  .gst-sub{margin-bottom:22px}
  .gst-box{border-radius:18px;padding:12px 16px 6px}
  .gst-in{font-size:18px;min-height:26px}
  .gst-cards{grid-template-columns:1fr;gap:12px}
}
`;

// START_JS: the behaviour every start page shares. It never submits or routes anything itself.
//  - the microphone: shown only where the browser can listen (SpeechRecognition); one tap starts, one tap stops; the words land in the
//    box as editable text and sending stays the visitor's tap; a refusal or a browser with no microphone says so in plain words
//    (the same recognizer logic Find's composer has used since Oct 15 2026 on iPhone Safari, now one function for all four);
//  - Enter submits (Shift+Enter is a new line) by pressing the page's own submit button, so each page keeps its own engine path;
//  - the placeholder rotates through data-ph while the box is idle (Home only).
export const START_JS = "window.gstHtml=" + startHtml.toString() + ";" + String.raw`
(function(){
  var TOUCH = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
  function note(box, words){ if (!box || box.value || !words) return; var was = box.getAttribute("data-ph-now") || box.getAttribute("placeholder"); box.setAttribute("placeholder", words); setTimeout(function(){ if (box.getAttribute("placeholder") === words) box.setAttribute("placeholder", was); }, 3500); }
  function bindMic(mic){
    if (!mic || mic.getAttribute("data-gst-bound")) return; mic.setAttribute("data-gst-bound", "1");
    var input = document.getElementById(mic.getAttribute("data-gst-mic")), SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR || !input) { mic.hidden = true; return; }
    mic.hidden = false;
    var rec = null, state = "idle", heard = false, guard = 0;
    var show = function(on){ mic.classList.toggle("on", on); mic.setAttribute("aria-pressed", on ? "true" : "false"); mic.setAttribute("aria-label", on ? "Stop listening" : "Speak instead of typing"); };
    var idle = function(){ state = "idle"; rec = null; clearTimeout(guard); show(false); if (input.getAttribute("placeholder") === "Listening…") input.setAttribute("placeholder", input.getAttribute("data-ph-now") || input.getAttribute("placeholder")); };
    mic.addEventListener("pointerdown", function(e){ e.preventDefault(); });
    mic.addEventListener("click", function(e){
      e.preventDefault();
      if (state === "starting" || state === "stopping") return;
      if (state === "listening") { state = "stopping"; try { rec.stop(); } catch(err){ idle(); } return; }
      var r = new SR(); r.lang = "en-US"; r.interimResults = true; r.continuous = false;
      var base = input.value ? input.value + " " : ""; heard = false;
      r.onstart = r.onaudiostart = function(){ if (rec === r && state === "starting") state = "listening"; };
      r.onresult = function(ev){ if (rec !== r) return; var t = ""; for (var i = 0; i < ev.results.length; i++) t += ev.results[i][0].transcript; heard = !!t; input.value = base + t; input.dispatchEvent(new Event("input", { bubbles: true })); };
      r.onerror = function(ev){ if (rec !== r) return; var k = ev && ev.error;
        note(input, k === "not-allowed" || k === "service-not-allowed" ? "Microphone blocked. Please type." : k === "no-speech" ? "Didn’t catch that. Try again." : k === "audio-capture" ? "No microphone found. Please type." : k === "aborted" ? "" : "Voice didn’t work. Please type.");
        idle(); };
      r.onend = function(){ if (rec !== r) return; idle(); if (heard && !TOUCH) { try { input.focus(); } catch(err){} } };
      rec = r; state = "starting"; show(true);
      try { r.start(); } catch(err){ idle(); note(input, "Voice didn’t start. Please type."); return; }
      if (!input.value) input.setAttribute("placeholder", "Listening…");
      guard = setTimeout(function(){ if (rec === r && state !== "idle") { try { r.abort(); } catch(err){} idle(); } }, 12000);
    });
  }
  // One line to start; the box grows with the text (typed, pasted or a voice transcript) up to its cap, then scrolls inside: long text is never clipped.
  function fit(t){ t.style.height = "auto"; t.style.height = Math.min(t.scrollHeight + 2, 220) + "px"; }
  function bindBox(root){
    var input = root.querySelector(".gst-in"), go = root.querySelector(".gst-go"); if (!input || input.getAttribute("data-gst-bound")) return;
    input.setAttribute("data-gst-bound", "1");
    input.addEventListener("input", function(){ fit(input); }); window.addEventListener("resize", function(){ fit(input); }); fit(input);
    // Enter presses the page's own submit only where the page asked for it (data-gst-enter); Find, Market Check and Sell already handle Enter themselves.
    if (input.hasAttribute("data-gst-enter")) input.addEventListener("keydown", function(e){ if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); if (go) go.click(); } });
    var list = []; try { list = JSON.parse(input.getAttribute("data-ph") || "[]"); } catch(e){}
    if (list.length > 1) {
      var i = 0; input.setAttribute("data-ph-now", list[0]); input.setAttribute("placeholder", list[0]);
      var t = setInterval(function(){ if (document.activeElement === input || input.value) return; i = (i + 1) % list.length; input.setAttribute("data-ph-now", list[i]); input.setAttribute("placeholder", list[i]); }, 3200);
      input.addEventListener("focus", function(){ clearInterval(t); }, { once: true });
    }
    Array.prototype.forEach.call(root.querySelectorAll("[data-gst-mic]"), bindMic);
  }
  window.gstMic = bindMic;   // for a question screen's answer box (Market Check and Sell): the same microphone, bound to a button that names its box in data-gst-mic
  window.gstBind = function(scope){ Array.prototype.forEach.call((scope || document).querySelectorAll("[data-gst]"), bindBox); };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function(){ window.gstBind(); }); else window.gstBind();
})();
`;
