/* PocketCanvas: on WeBWorK and Gradescope pages. Saves the due dates the page shows (a WeBWorK set list or set, your
   Gradescope courses or a course's assignments) so Canvas work with no due date gets them (lib/apps.js). It reads
   only; nothing on these pages changes. */
(function () {
  const PC = globalThis.PC;
  const run = () => PC.apps.fromPage(document, location.href).catch(() => { /* not a page with dates */ });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", run, { once: true }); else run();
})();
