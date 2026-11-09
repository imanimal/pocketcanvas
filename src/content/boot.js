/* PocketCanvas: first paint on a Canvas page. Runs at document_start, before Canvas draws anything, and applies the
   theme and flags remembered from the last visit (this site's localStorage "pocketcanvas"), so the page never
   flashes the stock look, and opens a class's menu with the tabs you open most first. canvas.js then reads the real
   settings and corrects whatever changed. */
(function () {
  const root = document.documentElement;
  let c = null;
  try { c = JSON.parse(localStorage.getItem("pocketcanvas") || "null"); } catch (e) { /* storage blocked */ }
  if (!c || c.menu !== false) openMenu();
  try {
    if (/^\/courses\/\d+/.test(location.pathname) && (!c || c.tabs !== false)) sortTabs((c && c.tabs) || PC.work.tabRanks({}, Date.now()));
  } catch (e) { /* the menu keeps Canvas's order */ }
  try {
    if (!c || !c.theme) return;
    PC.themes.apply(c.theme, root);
    if (!c.on) { root.style.colorScheme = ""; return; }
    root.setAttribute("data-pc-on", "");
    root.style.setProperty("--pc-school", JSON.stringify(PC.u.school(location.hostname)));
    for (const f of c.flags || []) root.setAttribute("data-pc-" + f, "");
    for (const [k, v] of Object.entries(c.icons || {})) root.style.setProperty("--pc-ic-" + k, v);
  } catch (e) { /* first visit, or storage blocked: canvas.js applies it a moment later */ }

  // A class's menu (Home, Modules, Grades…) starts open, though Canvas folds it once you've folded it and on a few
  // pages of its own (Gradebook, a new page). Opened the way Canvas's ☰ opens it, as the page parses: the body class
  // lays the page out, #left-side's inline display follows and the ☰ says Hide. The ☰ still folds it for that page.
  function openMenu() {
    let opened = false;
    const step = () => {
      const b = document.body;
      if (!b) return false;
      if (!opened) {
        if (!b.classList.contains("with-left-side") || b.classList.contains("course-menu-expanded")) return true;
        b.classList.add("course-menu-expanded"); opened = true;
      }
      const left = document.getElementById("left-side");
      if (!left) return false;
      left.style.display = "block";
      const t = document.getElementById("courseMenuToggle"), label = t && t.getAttribute("aria-label");
      if (label) t.setAttribute("aria-label", label.replace(/^Show /, "Hide "));
      return true;
    };
    if (step()) return;
    const mo = new MutationObserver(() => { if (step()) mo.disconnect(); });
    mo.observe(root, { childList: true, subtree: true });
    document.addEventListener("DOMContentLoaded", () => mo.disconnect(), { once: true });
  }

  // The menu's tabs in the order you use them (PC.work.tabRanks, kept in the cache by canvas.js): each of Canvas's
  // <li>s moves into its place as the page parses, so Canvas's order never shows and Tab goes through them in the order
  // you see. data-pc-tab is its group (top, used, rest), which canvas.css draws. The menu is whole once #content starts.
  function sortTabs(ranks) {
    const at = new Map();
    const step = () => {
      const ul = document.getElementById("section-tabs");
      if (!ul) return false;
      for (const li of Array.from(ul.children)) {
        if (at.has(li) || !li.matches("li.section")) continue;
        const a = li.querySelector(":scope > a");
        if (!a) continue;
        const r = ranks[PC.work.tabKey(a.classList)] || 1000;
        at.set(li, r);
        li.setAttribute("data-pc-tab", r < 10 ? "top" : r < 1000 ? "used" : "rest");
        const next = Array.from(ul.children).find((x) => at.get(x) > r);
        if (next) ul.insertBefore(li, next);
      }
      return !!document.getElementById("content");
    };
    if (step()) return;
    const mo = new MutationObserver(() => { if (step()) mo.disconnect(); });
    mo.observe(root, { childList: true, subtree: true });
    document.addEventListener("DOMContentLoaded", () => { step(); mo.disconnect(); }, { once: true });
  }
})();
