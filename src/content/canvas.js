/* PocketCanvas: on every Canvas page.
   - Look: the theme and restyle flags on <html> (canvas.css and paint.js do the drawing), remembered for boot.js.
   - Data: reads your classes and every assignment from the Canvas API with this page's session, at most every
     10 minutes (or when asked), into storage.local "cache". Every surface redraws from storage.
   - Dock: a strip of course keys on top of every page. A key opens the same page in that class (Assignments in
     130A → Assignments in 154); hovering one peeks at its work, links and notes; right-click sets its mode.
   - Dashboard: all your work across classes on top (undated work in its own group, never hidden), cards with their
     next items, priority first and ghosts folded away, and Do first / GPA / notes in the sidebar.
   - Class pages: "This class" in the sidebar, a banner on work with no due date, the final-exam helper on Grades,
     the course code in the tab title and a course-coloured tab icon.
   - Canvas's own parts: the Courses tray shows each class's colour and mode; the calendar uses the classes' colours.
   Keys (not while typing): Ctrl+K or / search · Alt+1–9 classes · Alt+[ ] previous/next class · Alt+W all work ·
   Alt+H dashboard. */
(async function () {
  const PC = globalThis.PC, api = PC.api, K = PC.kit, doc = document, root = doc.documentElement;
  const { esc, plural } = PC.u, ic = (n, c) => PC.ic(n, c);
  const origin = location.origin, host = location.host;
  const STALE = 10 * 60e3;
  let S = await PC.store.all(), V = null, refreshing = false, lastError = null;
  const path = location.pathname;
  const cm = path.match(/^\/courses\/(\d+)(\/[^?#]*)?/);
  const courseId = cm ? cm[1] : null, coursePath = cm ? cm[2] || "" : "";
  const isDash = () => (path === "/" || path === "/dashboard") && !!doc.querySelector("#dashboard, .ic-DashboardCard, #DashboardCard_Container");
  const typing = (el) => !!el && (el.isContentEditable || /^(input|textarea|select)$/i.test(el.tagName) || !!el.closest('[contenteditable="true"], .tox, .mce-content-body'));

  function applyLook() {
    const s = S.settings;
    PC.u.setClock24(s.clock24);
    const t = K.theme(S);
    const flags = [];
    if (s.restyle) {
      root.setAttribute("data-pc-on", "");
      const want = { full: s.fullWidth, nologo: s.hideLogo, nofeedback: s.hideFeedback, condensed: s.condensed, todo: s.replaceTodo, gradehover: s.gradeHover, icons: true };
      for (const [f, on] of Object.entries(want)) { if (on) { root.setAttribute("data-pc-" + f, ""); flags.push(f); } else root.removeAttribute("data-pc-" + f); }
    } else {
      root.removeAttribute("data-pc-on"); root.style.colorScheme = "";
    }
    root.style.setProperty("--pc-school", JSON.stringify(PC.u.school(location.hostname)));
    const icons = {};
    for (const n of ["now", "classes", "week", "inbox", "clock", "help", "links"]) { icons[n] = PC.icUrl(n, t.look); root.style.setProperty("--pc-ic-" + n, icons[n]); }
    const tabs = s.tabOrder ? PC.work.tabRanks(S.tabUse[host] || {}, Date.now()) : false;
    try { localStorage.setItem("pocketcanvas", JSON.stringify({ on: !!s.restyle, menu: !!s.openMenu, tabs, theme: { look: t.look, scheme: t.scheme, tokens: t.tokens }, flags, icons })); } catch (e) { /* private mode */ }
  }
  applyLook();
  if (doc.readyState === "loading") await new Promise((r) => doc.addEventListener("DOMContentLoaded", r, { once: true }));
  // *.instructure.com serves pages that aren't Canvas (status, community); leave those alone
  if (!doc.querySelector("#application, #wrapper, #header.ic-app-header, .ic-app-header, #dashboard")) {
    root.removeAttribute("data-pc-on"); root.style.colorScheme = ""; return;
  }

  // ── data ──
  const skip = (c) => { const m = PC.work.mode(c, S.courseFlags[host + "/" + c.id], S.settings, Date.now()); return m === "hidden" || m === "ghost"; };
  async function refresh(force) {
    const c = S.cache;
    if (!force && c && c.host === host && Date.now() - c.at < STALE) return;
    if (refreshing) return;
    refreshing = true; dockBusy(true);
    try {
      const data = await PC.canvas.load(origin, skip);
      PC.work.stamp(data, c && c.host === host ? c : null);
      await PC.store.setLocal("cache", data);
      lastError = null;
    } catch (e) {
      lastError = e.message; dockBusy(false);
      if (force) K.toast(e.status === 401 ? "Sign in to Canvas, then refresh" : "Couldn't read Canvas: " + e.message);
    } finally { refreshing = false; dockBusy(false); }
  }
  api.runtime.onMessage.addListener((m) => { if (m && m.t === "refresh") return refresh(true).then(() => ({ ok: !lastError, error: lastError })); });

  // ── draw ──
  function build() {
    V = PC.work.view(S, { now: Date.now() });
    V.all = PC.work.view(S, { now: V.now, includeAll: true, includeHidden: true });
    V.hidden = V.all.items.filter((i) => i.flags.hide);
    V.cid = courseId;
  }
  const docked = () => PC.work.docked(V.courses);
  const SECT = ["assignments/syllabus", "assignments", "modules", "grades", "announcements", "discussion_topics", "files", "pages", "quizzes", "users", "external_tools", "conferences", "collaborations", "outcomes"];
  function sameSection(c) {
    if (!courseId) return c.url;
    const p = coursePath.replace(/^\//, "");
    const s = SECT.find((x) => p === x || p.startsWith(x + "/"));
    return s && s !== "external_tools" ? `${c.url}/${s}` : c.url;
  }
  const soon = (c) => V.items.filter((i) => i.course === c.id && i.open && (i.overdue || (i.due != null && i.due - V.now < 3 * PC.u.DAY))).length;

  function dockBusy(on) { const d = doc.querySelector(".pc-dock .pc-logo"); if (d) d.classList.toggle("busy", on); }
  function renderDock() {
    let d = doc.querySelector(".pc-dock");
    if (!S.settings.dock) { if (d) d.remove(); return; }
    if (!d) {
      d = doc.createElement("div"); d.className = "pc-dock pc-root"; d.setAttribute("role", "navigation"); d.setAttribute("aria-label", "Your classes");
      const at = doc.getElementById("wrapper") || doc.getElementById("main") || doc.body;
      at.insertBefore(d, at.firstChild);
      bindDock(d);
    }
    const strip = d.querySelector(".pc-strip"), scroll = strip ? strip.scrollLeft : 0;
    const ghosts = V.courses.filter((c) => c.mode === "ghost");
    const keys = docked().map((c, i) => {
      const n = soon(c), ann = ((S.cache && S.cache.announcements && S.cache.announcements[c.id]) || []).some((a) => a.unread);
      return `<a class="pc-key pc-ck${c.id === courseId ? " on" : ""}" href="${esc(sameSection(c))}" data-act="course" data-id="${c.id}" style="${K.kc(c)}" title="${esc(c.name)}${i < 9 ? " · Alt+" + (i + 1) : ""} · drag to reorder"${c.id === courseId ? ' aria-current="page"' : ""} draggable="true">
        ${K.mark(c)}<span class="pc-kl">${esc(c.label)}</span>${c.mode === "priority" ? ic("flag") : ""}${n ? `<span class="pc-ct">${n}</span>` : ""}${ann ? '<span class="pc-ann" title="Unread announcements"></span>' : ""}</a>`;
    }).join("");
    const ghostKey = ghosts.length ? K.key(String(ghosts.length), { icon: "ghost", cls: "ghost sm", act: "ghosts", title: plural(ghosts.length, "ghosted class", "ghosted classes") }) : "";
    const next = PC.work.rank(V.items, V.now, Infinity)[0];
    const dueSoon = V.items.filter((i) => i.open && (i.overdue || (i.due != null && i.due - V.now < PC.u.DAY))).length;
    const lcd = next ? `<div class="pc-lcd mini${next.due < V.now ? " bad" : next.due - V.now < 3 * PC.u.HR ? " hot" : ""}" data-act="drawer" title="${esc(next.title)}"><span class="pc-ll">${next.due < V.now ? "Late" : "Next"}</span><span class="pc-ln" data-cd="${next.due}">${esc(PC.u.countdown(Math.abs(next.due - V.now)))}</span></div>` : "";
    const cap = S.cap && S.cap.token ? `<span class="pc-cap${S.cap.ok ? " on" : ""}" title="${S.cap.ok ? "Collegiapp is connected" : "Collegiapp isn't running"}"></span>` : "";
    d.innerHTML = `<button type="button" class="pc-logo${refreshing ? " busy" : ""}" data-act="palette" title="PocketCanvas · search (Ctrl+K)">PC</button>
      <div class="pc-strip">${keys || `<span class="pc-note">${S.cache ? "Every class is ghosted or hidden." : "Loading your classes…"}</span>`}${ghostKey}</div>
      <div class="pc-dk-r">${lcd}${K.key("All work", { icon: "all", cls: "dark sm", act: "drawer", count: dueSoon || null, title: "All work across classes (Alt+W)" })}${K.key("", { icon: "search", cls: "ghost sm", act: "palette", aria: "Search classes and work (Ctrl+K)" })}${cap}</div>`;
    const s2 = d.querySelector(".pc-strip"); s2.scrollLeft = scroll; edges(s2);
    const on = s2.querySelector(".on"); if (on && !scroll) on.scrollIntoView({ block: "nearest", inline: "nearest" });
  }
  // a strip scrolls by wheel, drag and touch, and fades only where there's more (Collegiapp's bindStrips)
  function edges(s) { const m = []; if (s.scrollLeft > 2) m.push("l"); if (s.scrollLeft + s.clientWidth < s.scrollWidth - 2) m.push("r"); s.dataset.more = m.join(" "); }
  function bindStrip(s) {
    s.addEventListener("scroll", () => edges(s), { passive: true });
    s.addEventListener("wheel", (e) => { if (Math.abs(e.deltaY) > Math.abs(e.deltaX) && s.scrollWidth > s.clientWidth) { const before = s.scrollLeft; s.scrollLeft += e.deltaY; if (s.scrollLeft !== before) e.preventDefault(); } }, { passive: false });
    let down = null, moved = false;
    // dragging a key that can be dragged (the dock's class keys) reorders it instead of scrolling the strip
    s.addEventListener("pointerdown", (e) => { if (e.pointerType !== "mouse" || e.button || e.target.closest('[draggable="true"]')) return; down = { x: e.clientX, l: s.scrollLeft }; moved = false; });
    s.addEventListener("pointermove", (e) => { if (!down) return; const dx = e.clientX - down.x; if (Math.abs(dx) > 5) { moved = true; s.scrollLeft = down.l - dx; } });
    const up = () => { down = null; };
    s.addEventListener("pointerup", up); s.addEventListener("pointerleave", up); s.addEventListener("pointercancel", up);
    s.addEventListener("click", (e) => { if (moved) { e.preventDefault(); e.stopPropagation(); moved = false; } }, true);
  }
  function bindDock(d) {
    d.addEventListener("click", (e) => {
      const a = e.target.closest("[data-act]"); if (!a) return;
      const act = a.dataset.act;
      if (act === "course") return; // a real link: new tabs and middle clicks work
      e.preventDefault();
      if (act === "palette") openPalette();
      else if (act === "drawer") openDrawer();
      else if (act === "ghosts") ghostMenu(a);
    });
    d.addEventListener("contextmenu", (e) => { const a = e.target.closest('[data-act="course"]'); if (!a) return; e.preventDefault(); const c = V.all.byId[a.dataset.id]; if (c) K.courseMenu(a, c, V); });
    // hover a class key to peek at it
    let timer = null, open = null;
    d.addEventListener("mouseover", (e) => {
      const a = e.target.closest('[data-act="course"]'); if (!a || (open && open.anchor === a)) return;
      clearTimeout(timer); timer = setTimeout(() => { open = peek(a); }, open ? 120 : 450);
    });
    d.addEventListener("mouseout", (e) => { const a = e.target.closest('[data-act="course"]'); if (a && !a.contains(e.relatedTarget)) clearTimeout(timer); });
    doc.addEventListener("mousemove", PC.u.debounce((e) => {
      if (!open) return;
      const inside = (el) => el && (el.contains(e.target));
      if (!inside(open.anchor) && !inside(open.pop)) { if (open.pop.isConnected) K.closePop(); open = null; }
    }, 260));
    // drag a class key to another place in the dock; the order is saved per class (flag `pos`) and used everywhere
    let dragId = null;
    const clearDrop = () => d.querySelectorAll(".pc-ck.drop-l, .pc-ck.drop-r").forEach((k) => k.classList.remove("drop-l", "drop-r"));
    // where a drop lands goes by the pointer's x anywhere over the dock: left of the first key's middle (the logo
    // included) is the front, right of the last key's middle is the end
    const dropAt = (e) => {
      const keys = [...d.querySelectorAll(".pc-strip .pc-ck")].filter((k) => k.dataset.id !== dragId);
      if (!keys.length) return null;
      const i = keys.findIndex((k) => { const r = k.getBoundingClientRect(); return e.clientX < r.left + r.width / 2; });
      return i < 0 ? { k: keys[keys.length - 1], after: true, i: keys.length } : { k: keys[i], after: false, i };
    };
    d.addEventListener("dragstart", (e) => {
      const k = e.target.closest && e.target.closest(".pc-ck"); if (!k) return;
      dragId = k.dataset.id; clearTimeout(timer); if (open) { K.closePop(); open = null; }
      e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/uri-list", k.href); e.dataTransfer.setData("text/plain", k.href);
      k.classList.add("dragging");
    });
    d.addEventListener("dragover", (e) => {
      if (!dragId) return;
      e.preventDefault(); e.dataTransfer.dropEffect = "move";
      const s = d.querySelector(".pc-strip"), r = s.getBoundingClientRect();
      // near an end of the strip (or past it) the strip scrolls that way, faster the closer you get
      const edge = 64, l = r.left + edge - e.clientX, rr = e.clientX - (r.right - edge);
      if (l > 0) s.scrollLeft -= Math.min(36, 6 + l / 2); else if (rr > 0) s.scrollLeft += Math.min(36, 6 + rr / 2);
      const t = dropAt(e); clearDrop(); if (t) t.k.classList.add(t.after ? "drop-r" : "drop-l");
    });
    d.addEventListener("drop", (e) => {
      if (!dragId) return;
      e.preventDefault();
      const t = dropAt(e); clearDrop(); if (!t) return;
      const ids = docked().map((c) => c.id).filter((id) => id !== dragId);
      ids.splice(t.i, 0, dragId);
      K.arrange(V, ids);
    });
    d.addEventListener("dragend", () => { dragId = null; clearDrop(); d.querySelectorAll(".pc-ck.dragging").forEach((k) => k.classList.remove("dragging")); });
    bindStrip(d.querySelector(".pc-strip") || d);
    new MutationObserver(() => { const s = d.querySelector(".pc-strip"); if (s && !s.dataset.bound) { s.dataset.bound = "1"; bindStrip(s); } }).observe(d, { childList: true });
  }
  function peek(anchor) {
    const c = V.all.byId[anchor.dataset.id]; if (!c) return null;
    const items = V.items.filter((i) => i.course === c.id && i.open).sort((a, b) => (a.due == null) - (b.due == null) || a.due - b.due);
    const undated = items.filter((i) => i.due == null).length;
    const f = c.flags || {};
    const links = K.SECTIONS.filter(([p]) => ["", "/assignments", "/modules", "/grades", "/assignments/syllabus"].includes(p)).map(([p, n]) => K.key(n, { href: c.url + p, cls: "sm" }))
      .concat((f.links || []).map((l) => K.key(l.label || "Link", { href: l.url, cls: "sm", icon: "ext", target: "_blank" }))).join("");
    const grade = c.score != null ? ` · ${c.grade ? c.grade + " · " : ""}${+c.score.toFixed(1)}%` : "";
    const html = `<div class="pc-pt">${K.dot(c)}${esc(c.name)}</div><div class="pc-meta">${esc(c.codeText)}${c.term ? " · " + esc(c.term) : ""}${esc(grade)}</div>
      <div class="pc-sub">${items.length ? plural(items.length, "open item") + (undated ? ` · ${undated} with no due date` : "") : "Nothing open"}</div>
      ${items.slice(0, 5).map((it) => K.row(it, V, { noCourse: true })).join("")}
      <div class="pc-qlinks">${links}</div>${f.notes ? `<div class="pc-pnotes">${esc(f.notes)}</div>` : ""}
      <div class="pc-row2">${K.key("Class settings", { icon: "gear", act: "settings", cls: "ghost sm" })}${items.length > 5 ? K.key("All of it", { icon: "all", act: "all", cls: "ghost sm" }) : ""}</div>`;
    const p = K.pop(anchor, html, (act, el) => {
      if (act === "settings") K.courseMenu(anchor, c, V);
      else if (act === "all") { K.closePop(); openDrawer({ course: c.id }); }
      else K.act(act, el, V);
    }, { cls: "pc-peek wide" });
    return { anchor, pop: p };
  }
  function ghostMenu(anchor) {
    const gs = V.courses.filter((c) => c.mode === "ghost");
    const html = `<div class="pc-pt">${ic("ghost")}Ghosted classes</div><p class="pc-note">Still here when you need them. Their work stays out of lists, counts and reminders.</p>
      ${gs.map((c) => `<div class="pc-row" style="${K.kc(c)}"><span class="pc-dot"></span><span class="pc-rm"><a class="pc-rt" href="${esc(c.url)}">${esc(c.name)}</a><span class="pc-meta">${esc(c.term || c.codeText)}${c.autoMode ? " · term ended" : ""}</span></span>${K.key("Bring back", { cls: "sm", act: "courseMode", id: c.id, v: "normal" })}</div>`).join("")}`;
    K.pop(anchor, html, (act, el) => { K.act(act, el, V); }, { cls: "wide" });
  }

  // ── palette ──
  function openPalette() {
    if (doc.querySelector(".pc-scrim")) return;
    const ended = V.courses.filter((c) => c.mode === "normal" && PC.work.ended(c, V.now));
    const cmds = [
      { t: "All work", sub: "Every class in one list · Alt+W", icon: "all", run: () => openDrawer() },
      { t: "Board", sub: "All work and classes in a tab of their own", icon: "work", run: () => api.runtime.sendMessage({ t: "open", page: "board" }) },
      { t: "Refresh from Canvas", sub: S.cache ? "Last read " + PC.u.span(Date.now() - S.cache.at) + " ago" : "", icon: "refresh", run: () => refresh(true) },
      { t: "Mark everything seen", sub: "Clears the New marks", icon: "eye", run: () => PC.store.setLocal("seenAt", Date.now()) },
      { t: root.dataset.pcScheme === "dark" ? "Day theme" : "Night theme", sub: "Until you change it back in settings", icon: "moon", run: () => PC.store.setSettings({ night: root.dataset.pcScheme === "dark" ? "off" : "on" }) },
      { t: "PocketCanvas settings", sub: "Themes, classes, reminders, Collegiapp", icon: "gear", run: () => api.runtime.sendMessage({ t: "open", page: "options" }) },
    ];
    if (ended.length) cmds.push({ t: `Ghost ${plural(ended.length, "class", "classes")} from past terms`, sub: ended.map((c) => c.label).join(", "), icon: "ghost", run: async () => { for (const c of ended) await PC.store.setCourseFlag(host + "/" + c.id, { mode: "ghost" }); } });
    const send = doc.querySelector('.pc-work [data-act="send"]'), wit = send && courseId && pageItem(V.all.byId[courseId]);
    if (wit) cmds.push({ t: "Send this to Collegiapp", sub: `${wit.title} · with a date, an estimate, a priority and notes`, icon: "send", run: () => openSend(send, wit) });
    else if (S.cap && S.cap.token) cmds.push({ t: "Send this page to Collegiapp", sub: doc.title, icon: "send", run: () => api.runtime.sendMessage({ t: "capture", title: doc.title, url: location.href }).then((r) => K.toast(r && r.ok ? "Sent to Collegiapp" : (r && r.error) || "Collegiapp isn't running")) });
    K.palette(V.all, cmds, (e, newTab) => {
      if (e.run) return e.run();
      if (!e.url) return;
      if (newTab) window.open(e.url, "_blank", "noopener"); else location.href = e.url;
    });
  }

  // ── the to-do list: every class's work on a calendar, undated work in its own group (never hidden) ──
  // One renderer for the dashboard's To do and the All work drawer: filters, a class strip, the agenda, add your own.
  // `st.open` holds the agenda's groups you unfolded ("weeks", "none", "done").
  const TABS = [["open", "Open", (i) => i.open], ["nodate", "No due date", (i) => i.open && i.due == null], ["new", "New", (i) => i.isNew || i.newGrade],
    ["missing", "Late", (i) => i.open && (i.overdue || i.status === "missing")], ["done", "Done", (i) => !i.open]];
  function panel(st, o) {
    const q = st.q.trim().toLowerCase();
    const pass = (i) => (!st.course || i.course === st.course) && (!q || (i.title + " " + ((i.courseObj && i.courseObj.label) || i.courseText || "")).toLowerCase().includes(q));
    const tab = TABS.find((t) => t[0] === st.tab) || TABS[0];
    const items = V.items.filter((i) => pass(i) && tab[2](i));
    const empty = K.empty(st.tab === "nodate" ? "Every open item has a date" : st.tab === "new" ? "Nothing new" : st.tab === "missing" ? "Nothing late" : st.tab === "done" ? "Nothing done yet" : "Nothing due",
      st.tab === "new" ? "New work and grades show up here until you open them or mark everything seen." : st.course || q ? "Try another class or tab." : "No open work. Ghosted and hidden classes are left out.");
    return `${o.search ? `<div class="pc-search">${ic("search")}<input type="search" data-f="q" placeholder="Filter by title or class" value="${esc(st.q)}"></div>` : ""}
      <div class="pc-filters">${TABS.map(([id, l, fn]) => K.chip(l, { act: "tab", v: id, on: st.tab === id, count: V.items.filter((i) => pass(i) && fn(i)).length || null })).join("")}</div>
      <div class="pc-strip">${K.chip("All classes", { act: "course", v: "", on: !st.course })}${docked().map((c) => K.classChip(c, { act: "course", v: c.id, on: st.course === c.id })).join("")}</div>
      <div class="pc-todo">${K.agenda(items, V, { weeks: o.weeks, rows: o.rows, open: st.open, today: st.tab === "open" && !st.course && !q, showDone: st.tab === "done" || st.tab === "new", rel: S.settings.relDates, empty })}</div>
      <div class="pc-addtask"><input type="text" data-f="task" placeholder="Add your own: work a teacher announced but never posted" aria-label="Add your own task"><button type="button" class="pc-key primary sm" data-act="addTask">${ic("plus")}<span class="pc-kl">Add</span></button>
        <div class="pc-at2"><select data-f="tcourse" aria-label="Class"><option value="">No class</option>${docked().map((c) => `<option value="${c.id}"${st.course === c.id ? " selected" : ""}>${esc(c.label)}</option>`).join("")}</select>${K.dueFields(st.tdue, "tdue")}</div></div>`;
  }
  async function addTask(box) {
    const inp = box.querySelector('[data-f="task"]'), t = inp.value.trim(); if (!t) return;
    const due = K.dueValue(box, "tdue"), course = box.querySelector('[data-f="tcourse"]').value || null;
    const tasks = await PC.store.local("tasks", []);
    tasks.push({ id: PC.u.uid(), title: t, course, due, done: false, at: Date.now() });
    inp.value = "";
    await PC.store.setLocal("tasks", tasks);
    K.toast("Added · " + t);
  }
  /** Clicks a panel handles itself, else the kit's shared actions. */
  async function panelClick(e, st, box, redraw) {
    const a = e.target.closest("[data-act]"); if (!a) return;
    const act = a.dataset.act;
    if (act === "tab") { st.tab = a.dataset.v; st.open = {}; return redraw(); }
    if (act === "course") { st.course = a.dataset.v || null; return redraw(); }
    if (act === "more") { e.preventDefault(); st.open = Object.assign({}, st.open, { [a.dataset.v]: true }); return redraw(); }
    if (act === "addTask") return addTask(box);
    if (await K.act(act, a, V)) e.preventDefault();
  }
  function bindPanel(box, st, redraw) {
    box.addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target.dataset.f === "task") { e.preventDefault(); addTask(box); } });
    box.addEventListener("input", (e) => { if (e.target.dataset.f === "q") { st.q = e.target.value; redraw(true); } });
    // the new task's due date survives redraws
    box.addEventListener("change", (e) => { if (/^tdue-/.test(e.target.dataset.f || "")) { const iso = K.dueValue(box, "tdue"); st.tdue = iso ? Date.parse(iso) : null; } });
  }

  /** What to open next, above a panel: Go to (the pages you open most, PC.work.gotos) and Do first's top few. */
  const goTiles = (n) => PC.work.gotos(S.visits[host], V, PC.apps.summary(S), n);
  function dueSoon() {
    const late = V.items.filter((i) => i.overdue).length, day = V.items.filter((i) => i.open && !i.overdue && i.due != null && i.due - V.now < PC.u.DAY).length;
    return [late ? `${late} late` : "", day ? `${day} due within a day` : ""].filter(Boolean).join(" · ");
  }
  // The countdowns tick in place (K.tick), so a redraw only counts as a change when something other than them did.
  const stable = (html) => html.replace(/(data-cd="\d+">)[^<]*/g, "$1");
  const strips = (el) => el.querySelectorAll(".pc-strip").forEach((s) => { bindStrip(s); edges(s); });

  const drawerState = { q: "", course: null, tab: "open", open: {} };
  function openDrawer(o) {
    let d = doc.querySelector(".pc-drawer");
    if (o) Object.assign(drawerState, o);
    if (!d) {
      d = doc.createElement("aside"); d.className = "pc-drawer pc-root"; d.setAttribute("aria-label", "All work"); doc.body.appendChild(d);
      d.addEventListener("click", (e) => {
        const a = e.target.closest("[data-act]"); if (!a) return;
        if (a.dataset.act === "close") return closeDrawer();
        if (a.dataset.act === "board") return api.runtime.sendMessage({ t: "open", page: "board" });
        panelClick(e, drawerState, d, () => drawDrawer(d));
      });
      bindPanel(d, drawerState, (keep) => drawDrawer(d, keep));
      d.addEventListener("keydown", (e) => { if (e.key === "Escape") closeDrawer(); });
    }
    drawDrawer(d);
    const q = d.querySelector('[data-f="q"]'); if (q && !o) q.focus();
  }
  function closeDrawer() { const d = doc.querySelector(".pc-drawer"); if (d) d.remove(); }
  function drawDrawer(d, keepInput) {
    const go = goTiles(4), top = PC.work.rank(V.items, V.now).slice(0, 3), soon = dueSoon();
    const body = (go.length ? `<section class="pc-dsec"><div class="pc-grp"><span>Go to</span></div>${K.tiles(go)}</section>` : "")
      + (top.length ? `<section class="pc-dsec do"><div class="pc-grp"><span>Do first</span>${soon ? `<span class="pc-gc">${esc(soon)}</span>` : ""}</div>${K.tops(top, V)}</section>` : "")
      + `<section class="pc-dsec"><div class="pc-grp"><span>To do</span></div></section>${panel(drawerState, { search: true, rows: 5 })}`;
    const b0 = d.querySelector(".pc-dbody");
    if (keepInput && b0) {
      const scroll = b0.scrollTop, q = d.querySelector('[data-f="q"]'), pos = q && q.selectionStart;
      const tmp = doc.createElement("div"); tmp.innerHTML = body;
      b0.replaceChildren(...tmp.childNodes);
      const q2 = d.querySelector('[data-f="q"]'); if (q2) { q2.focus(); if (pos != null) q2.setSelectionRange(pos, pos); }
      b0.scrollTop = scroll;
    } else {
      const scroll = b0 ? b0.scrollTop : 0;
      d.innerHTML = `<div class="pc-dh"><span class="pc-bt">${ic("all")}<span>All work</span></span><span class="pc-sp" style="flex:1"></span>
        ${K.key("Seen", { icon: "eye", cls: "ghost sm", act: "seenAll", title: "Mark everything seen" })}${K.key("Board", { icon: "ext", cls: "ghost sm", act: "board", title: "Open the board in its own tab" })}${K.key("", { icon: "close", cls: "ghost sm", act: "close", aria: "Close" })}</div>
        <div class="pc-dbody">${body}</div>`;
      d.querySelector(".pc-dbody").scrollTop = scroll;
    }
    strips(d);
  }

  // ── dashboard ──
  // On top: Do first's next three as cards and Go to's tiles, side by side when there's room; then To do as a calendar.
  const dashState = { q: "", course: null, tab: "open", open: {} };
  function renderDash() {
    const top = doc.querySelector("#dashboard") || doc.querySelector("#content");
    let w = doc.querySelector(".pc-dashwork");
    if (!w) {
      w = doc.createElement("div"); w.className = "pc-dashwork pc-root";
      const anchor = doc.querySelector("#DashboardCard_Container, #dashboard-planner, .ic-DashboardCard__box");
      if (anchor && anchor.parentElement) anchor.parentElement.insertBefore(w, anchor); else if (top) top.prepend(w);
      w.addEventListener("click", (e) => {
        const a = e.target.closest("[data-act]"); if (!a) return;
        if (a.dataset.act === "drawer") { e.preventDefault(); return openDrawer(); }
        if (a.dataset.act === "fold") { e.preventDefault(); dashState.open = {}; return renderDash(); }
        panelClick(e, dashState, w, renderDash);
      });
      bindPanel(w, dashState, renderDash);
      holdTop();
    }
    const open = V.items.filter((i) => i.open), soon = dueSoon();
    const body = !S.cache ? `<div class="pc-empty"><b>Reading your classes…</b><span>${lastError ? esc(lastError) : "The first read takes a few seconds."}</span></div>` : panel(dashState, { weeks: 5, rows: 6 });
    const right = `<span class="pc-cnt">${open.length} open</span>${Object.keys(dashState.open).length ? K.key("Fold", { cls: "ghost sm", act: "fold" }) : ""}${K.key("Drawer", { icon: "all", cls: "ghost sm", act: "drawer", title: "All work in a side drawer (Alt+W)" })}`;
    const go = goTiles(8);
    const head = S.cache ? `<div class="pc-dtop">${K.module("Do first", "now", K.tops(PC.work.rank(V.items, V.now).slice(0, 3), V), { cls: "do", right: soon ? `<span class="pc-cnt">${esc(soon)}</span>` : "" })}${go.length ? K.module("Go to", "go", K.tiles(go), { cls: "pc-gomod", right: `<span class="pc-cnt">The pages you open most</span>` }) : ""}</div>` : "";
    const html = head + K.module("To do", "work", body, { right }), h = stable(html);
    // never redraw under your typing
    if (w.dataset.h !== h && !(w.contains(doc.activeElement) && doc.activeElement.matches("input, select, textarea"))) {
      w.innerHTML = html; w.dataset.h = h;
      strips(w);
    }
    cards();
    side();
    planner(w);
  }
  // Canvas's List View (the planner) is the old to-do. With ours in its place (data-pc-todo) it folds away behind a
  // line under To do (canvas.css), so the dashboard opens on To do instead of scrolling down to today in it.
  function planner(w) {
    const pl = doc.getElementById("dashboard-planner");
    let bar = doc.querySelector(".pc-plannerbar");
    if (!pl || !pl.childElementCount || !root.hasAttribute("data-pc-todo")) { if (bar) bar.remove(); return; }
    if (!bar) {
      bar = doc.createElement("div"); bar.className = "pc-plannerbar pc-root";
      bar.addEventListener("click", (e) => { if (e.target.closest('[data-act="showPlanner"]')) { root.toggleAttribute("data-pc-showplanner"); renderDash(); } });
    }
    if (bar.previousElementSibling !== w) w.after(bar);
    const on = root.hasAttribute("data-pc-showplanner");
    const bh = `${ic("week")}<span>Canvas's list view ${on ? "is open below" : "is folded away · To do has the same work"}</span>${K.key(on ? "Fold away" : "Show", { cls: "ghost sm", act: "showPlanner" })}`;
    if (bar.dataset.h !== bh) { bar.innerHTML = bh; bar.dataset.h = bh; }
  }
  // The planner scrolls the page down to today once it loads. For the first few seconds, until you scroll or press
  // a key yourself, the dashboard stays at the top, on To do.
  function holdTop() {
    const t0 = Date.now(); let yours = false;
    const mine = () => { yours = true; };
    for (const ev of ["wheel", "keydown", "pointerdown", "touchstart"]) window.addEventListener(ev, mine, { capture: true, passive: true, once: true });
    const hold = () => {
      if (yours || Date.now() - t0 > 4000) return window.removeEventListener("scroll", hold);
      if (window.scrollY > 0) window.scrollTo(0, 0);
    };
    window.addEventListener("scroll", hold, { passive: true });
  }
  function cards() {
    const s = S.settings, list = [...doc.querySelectorAll(".ic-DashboardCard")];
    if (!list.length) return;
    let ghosts = 0;
    list.forEach((card, idx) => {
      const a = card.querySelector('a.ic-DashboardCard__link, a[href*="/courses/"]'), m = a && (a.getAttribute("href") || "").match(/\/courses\/(\d+)/);
      if (!m) return;
      const c = V.all.byId[m[1]]; if (!c) return;
      card.classList.toggle("pc-card-hidden", c.mode === "hidden");
      card.classList.toggle("pc-card-ghost", c.mode === "ghost");
      card.classList.toggle("pc-card-pri", c.mode === "priority");
      if (c.mode === "ghost") ghosts++;
      card.style.order = String((c.mode === "priority" ? -100 : c.mode === "ghost" ? 1000 : 0) + idx);
      card.style.setProperty("--kc", `var(--pc-k${c.color})`);
      let band = card.querySelector(":scope > .pc-cband");
      if (!band) { band = doc.createElement("div"); band.className = "pc-cband pc-root"; card.prepend(band); band.addEventListener("click", (e) => cardClick(e, c.id)); }
      const grade = s.cardGrades && c.score != null ? `<a class="pc-grade" href="${esc(c.url)}/grades" title="Current grade">${esc(c.grade || +c.score.toFixed(1) + "%")}</a>` : "";
      const bh = `<a class="pc-cl" href="${esc(c.url)}" title="${esc(c.name)}">${K.dot(c)}${esc(c.label)}</a>${c.mode === "priority" ? `<span class="pc-flag" title="Priority class">${ic("flag")}</span>` : ""}<span class="pc-sp"></span>${grade}${K.key("", { icon: "menu", cls: "ghost sm", act: "courseMenu", id: c.id, aria: "Class settings" })}`;
      if (band.dataset.h !== bh) { band.innerHTML = bh; band.dataset.h = bh; }
      let w = card.querySelector(":scope > .pc-cardwork");
      if (!s.cardWork) { if (w) w.remove(); return; }
      if (!w) { w = doc.createElement("div"); w.className = "pc-cardwork pc-root"; const h = card.querySelector(".ic-DashboardCard__header"); if (h) h.after(w); else card.append(w); w.addEventListener("click", (e) => cardClick(e, c.id)); }
      const its = V.items.filter((i) => i.course === c.id && i.open).sort((x, y) => (x.due == null) - (y.due == null) || x.due - y.due);
      const nodate = its.filter((i) => i.due == null).length;
      const rows = its.slice(0, +s.cardItems || 4);
      const wh = c.mode === "ghost" ? `<div class="pc-cw-none">Ghosted${c.autoMode ? ": its term ended" : ""}.</div>`
        : (rows.length ? rows.map((it) => K.row(it, V, { noCourse: true })).join("") : `<div class="pc-cw-none">${S.cache ? "Nothing open." : "Reading…"}</div>`)
          + (its.length > rows.length || nodate ? `<div class="pc-cw-foot">${its.length > rows.length ? K.chip(`${its.length - rows.length} more`, { act: "courseAll" }) : ""}${nodate ? K.chip(`${nodate} with no date`, { act: "courseUndated" }) : ""}</div>` : "");
      if (w.dataset.h !== wh) { w.innerHTML = wh; w.dataset.h = wh; }
    });
    // the ghosts fold into one line after the cards
    const box = list[0].parentElement;
    let bar = box.querySelector(":scope > .pc-ghostbar");
    if (!ghosts) { if (bar) bar.remove(); return; }
    if (!bar) { bar = doc.createElement("div"); bar.className = "pc-ghostbar pc-root"; bar.style.order = "999"; box.appendChild(bar); bar.addEventListener("click", (e) => { if (e.target.closest('[data-act="showGhost"]')) root.toggleAttribute("data-pc-showghost"); renderDash(); }); }
    const on = root.hasAttribute("data-pc-showghost");
    const bh = `${ic("ghost")}<span>${plural(ghosts, "ghosted class", "ghosted classes")}</span>${K.key(on ? "Fold away" : "Show", { cls: "ghost sm", act: "showGhost" })}`;
    if (bar.dataset.h !== bh) { bar.innerHTML = bh; bar.dataset.h = bh; }
  }
  async function cardClick(e, id) {
    const a = e.target.closest("[data-act]"); if (!a) return;
    e.stopPropagation();
    const act = a.dataset.act;
    if (act === "courseMenu") { e.preventDefault(); const c = V.all.byId[id]; return c && K.courseMenu(a, c, V); }
    if (act === "courseAll") { e.preventDefault(); return openDrawer({ course: id, tab: "open" }); }
    if (act === "courseUndated") { e.preventDefault(); return openDrawer({ course: id, tab: "nodate" }); }
    if (await K.act(act, a, V)) e.preventDefault();
  }
  function side() {
    const s = S.settings, rs = doc.getElementById("right-side");
    if (!rs) return;
    let box = rs.querySelector(":scope > .pc-side");
    if (!box) {
      box = doc.createElement("div"); box.className = "pc-side pc-root"; rs.prepend(box);
      box.addEventListener("click", async (e) => { const a = e.target.closest("[data-act]"); if (a && (await K.act(a.dataset.act, a, V))) e.preventDefault(); });
      box.addEventListener("input", PC.u.debounce((e) => { if (e.target.dataset.f === "note") PC.store.setLocal("note", e.target.value); }, 600));
    }
    // Do first sits on top of the dashboard now (renderDash), so the sidebar keeps GPA and notes
    let html = "";
    if (s.gpa) html += gpaModule();
    if (s.dashNote) html += K.module("Notes", "note", `<div class="pc-notes"><textarea data-f="note" placeholder="Anything to remember this week">${esc(note)}</textarea></div>`);
    if (box.dataset.h !== html && !box.contains(doc.activeElement)) { box.innerHTML = html; box.dataset.h = html; K.tick(box); }
  }
  let note = await PC.store.local("note", "");
  function gpaModule() {
    const g = PC.work.gpa(V.all.courses.filter((c) => c.mode !== "hidden"), S.settings, (c) => c.flags.gpa !== false && c.mode !== "ghost");
    const rows = g.rows.map((r) => `<tr style="${K.kc(r.c)}"><td>${K.cchip(r.c, { href: r.c.url + "/grades" })}</td><td class="n">${esc(+r.c.score.toFixed(1))}%</td><td class="n">${esc(r.letter)}</td><td class="n">${esc(r.units)}u</td></tr>`).join("");
    const body = g.term == null ? `<p class="pc-note">No current grades yet. GPA shows once your classes have scores.</p>`
      : `<div class="pc-gpatop">${K.lcd({ label: "Term GPA", num: g.term.toFixed(2) })}${g.cum != null ? K.lcd({ label: "Cumulative", num: g.cum.toFixed(2) }) : ""}</div><table>${rows}</table><p class="pc-note">From current scores. Units and the scale are in PocketCanvas settings.</p>`;
    return K.module("GPA", "grade", `<div class="pc-gpa">${body}</div>`);
  }

  // ── class pages ──
  function renderCourse() {
    const c = V.all.byId[courseId]; if (!c) return;
    // this class, in the sidebar
    const rs = doc.getElementById("right-side");
    if (rs && !/\/(grades|assignments\/\d+|quizzes\/\d+|discussion_topics\/\d+)/.test(coursePath)) {
      let box = rs.querySelector(":scope > .pc-side");
      if (!box) { box = doc.createElement("div"); box.className = "pc-side pc-root"; rs.prepend(box); box.addEventListener("click", async (e) => { const a = e.target.closest("[data-act]"), c2 = V.all.byId[courseId]; if (!a || !c2) return; if (a.dataset.act === "settings") { e.preventDefault(); return K.courseMenu(a, c2, V); } if (a.dataset.act === "all") { e.preventDefault(); return openDrawer({ course: c2.id }); } if (await K.act(a.dataset.act, a, V.all)) e.preventDefault(); }); }
      const items = V.all.items.filter((i) => i.course === c.id && i.open && !i.flags.hide).sort((a, b) => (a.due == null) - (b.due == null) || a.due - b.due);
      const f = c.flags || {};
      const body = (items.length ? items.slice(0, 6).map((it) => K.row(it, V, { noCourse: true })).join("") : `<p class="pc-note" style="margin:0">Nothing open in this class.</p>`)
        + `<div class="pc-row2">${items.length > 6 ? K.key(`All ${items.length}`, { icon: "all", cls: "sm", act: "all" }) : ""}${(f.links || []).map((l) => K.key(l.label || "Link", { href: l.url, icon: "ext", cls: "sm", target: "_blank" })).join("")}${K.key("Class settings", { icon: "gear", cls: "ghost sm", act: "settings" })}</div>`
        + (f.notes ? `<div class="pc-peek"><div class="pc-pnotes">${esc(f.notes)}</div></div>` : "");
      const html = K.module(c.mode === "ghost" ? "This class · ghosted" : "This class", "classes", body, { right: `<span class="pc-cnt">${esc(c.label)}</span>` });
      if (box.dataset.h !== html) { box.innerHTML = html; box.dataset.h = html; }
    }
    if (wm) workPanel(c);
    if (/^\/grades/.test(coursePath)) finalHelper(c);
  }

  // ── one piece of work (an assignment, quiz or discussion): a panel over Canvas's page with when it's due, where the
  // date comes from, its status, and keys to set your own date, open it in its app and send it to Collegiapp ──
  const wm = coursePath.match(/^\/(assignments|quizzes|discussion_topics)\/(\d+)/);
  let fetched = null, fetching = false, capItem, capAsked = null;
  /** This page's work item: from the cache, else (a ghosted class, or work posted since the last read) read once. */
  function pageItem(c) {
    const mine = (i) => i.course === c.id && (i.id === wm[2] || (i.url || "").includes(`/${wm[1]}/${wm[2]}`));
    const it = V.all.items.find(mine);
    if (it) return it;
    if (fetched) {
      const w = PC.work.view(Object.assign({}, S, { cache: Object.assign({}, S.cache, { assignments: [fetched], planner: [] }) }), { now: V.now, includeAll: true, includeHidden: true });
      return w.items.find(mine) || null;
    }
    if (wm[1] === "assignments" && !fetching) {
      fetching = true;
      PC.canvas.one(origin, c.id, wm[2]).then((a) => { fetched = a; if (a) render(); }).catch(() => { /* the page still works without the panel */ });
    }
    return null;
  }
  // a view that holds just this item, for the kit's shared actions (it may not be in V)
  const pv = (it) => ({ host: V.all.host, items: [it], hidden: [], now: V.now });
  /** Ask Collegiapp once per page (and after a send) whether it has this work. */
  function askCap(it) {
    if (!S.cap || !S.cap.token || capAsked === it.key) return;
    capAsked = it.key;
    api.runtime.sendMessage({ t: "capFind", refs: PC.cap.refs(it) }).then((r) => { capItem = r && r.ok ? r.item || null : undefined; render(); }).catch(() => {});
  }
  // A tool Canvas can only open in a new window (WeBWorK, for one): the new assignment view frames Canvas's own launch
  // page (/assignments/<id>/tool_launch, same site), a tall white box with a line and a button; the classic page puts
  // the same form in the page. The frame takes the theme and shrinks to its words, and the button is also a key on the
  // panel. A launch works once and Canvas expires the button after 150 s, so the frame loads again after a launch and
  // before a stale one is used.
  let tool = null;
  const toolButton = (el) => (el && el.querySelector('form[data-tool-launch-type="window"] button[type="submit"], form[target="_blank"] button[type="submit"]')) || null;
  const toolLabel = (b) => (b.textContent || "").trim().replace(/\s+/g, " ").replace(/^load (.+) in a new (browser )?window$/i, "Open $1") || "Open the tool";
  function toolFrame() {
    const was = tool;
    tool = null;
    const inPage = toolButton(doc.getElementById("content"));
    if (inPage) { tool = { frame: null, label: toolLabel(inPage) }; return; }
    for (const f of doc.querySelectorAll("#content iframe")) {
      let d = null;
      try { d = f.contentDocument; } catch (e) { /* another site's frame */ }
      if (!f.dataset.pcWatch) { f.dataset.pcWatch = "1"; f.addEventListener("load", () => { toolFrame(); render(); }); f.addEventListener("pointerenter", () => freshen(f)); }
      const b = toolButton(d);
      if (!b) continue;
      themeFrame(f, d);
      // an expired button says so instead of the tool's name
      tool = { frame: f, label: b.disabled && was ? was.label : toolLabel(b) };
      return;
    }
  }
  function themeFrame(f, d) {
    const fr = d.documentElement;
    for (let i = 0; i < root.style.length; i++) { const p = root.style[i]; if (p.startsWith("--pc-")) fr.style.setProperty(p, root.style.getPropertyValue(p)); }
    fr.style.colorScheme = root.style.colorScheme;
    if (!d.getElementById("pc-frame")) {
      // a fresh launch page
      f.dataset.pcAt = Date.now();
      // Canvas's own button counts as a launch too: load the frame again once it has opened the window
      d.addEventListener("submit", () => setTimeout(() => reloadTool(f), 1500), true);
      const st = d.createElement("style"); st.id = "pc-frame";
      (d.head || fr).appendChild(st);
    }
    const st = d.getElementById("pc-frame");
    if (!root.hasAttribute("data-pc-on")) { f.removeAttribute("data-pc-tool"); st.textContent = ""; return; }
    st.textContent = `html, body { height: auto !important; min-height: 0 !important; background: var(--pc-surface) !important; color: var(--pc-text2) !important; }
      body { margin: 0 !important; padding: 12px 2px !important; font: 500 14px/1.45 var(--pc-font), system-ui, sans-serif !important; }
      body * { font-family: inherit !important; color: inherit !important; background-color: transparent !important; }
      .tool_content_wrapper { height: auto !important; min-height: 0 !important; }
      :is(button, .btn) { display: inline-flex !important; align-items: center; margin: 10px 0 0 !important; padding: 8px 14px !important; border: 0 !important; border-radius: 9px !important; cursor: pointer;
        font: 600 13.5px/1.2 var(--pc-font), system-ui, sans-serif !important; color: var(--pc-on-accent) !important; background: var(--pc-accent) !important; background-image: none !important; text-shadow: none !important;
        box-shadow: inset 0 1px 0 rgba(255, 255, 255, .3), 0 0 0 1px color-mix(in srgb, var(--pc-accent) 50%, #000), 0 3px 0 color-mix(in srgb, var(--pc-accent) 55%, #000) !important; }
      :is(button, .btn):active { transform: translateY(3px); box-shadow: 0 0 0 1px color-mix(in srgb, var(--pc-accent) 50%, #000) !important; }
      :is(button, .btn):focus-visible { outline: 2px solid var(--pc-text) !important; outline-offset: 2px; }
      :is(button, .btn)[disabled] { opacity: .5; cursor: default; }`;
    f.setAttribute("data-pc-tool", "");
    const form = d.querySelector('form[data-tool-launch-type="window"], form[target="_blank"]');
    f.style.setProperty("--pc-th", Math.min(240, Math.max(64, Math.ceil(form ? form.getBoundingClientRect().bottom + 14 : 96))) + "px");
  }
  function reloadTool(f) { try { f.contentWindow.location.reload(); } catch (e) { /* gone */ } }
  // a launch page that's about to expire (or has) loads again while the pointer is on its way to the button
  function freshen(f) {
    const b = f && toolButton(f.contentDocument);
    if (b && (b.disabled || Date.now() - +(f.dataset.pcAt || 0) > 140e3)) reloadTool(f);
  }
  function launchTool() {
    const b = tool && toolButton(tool.frame ? tool.frame.contentDocument : doc.getElementById("content"));
    if (!b || (!tool.frame && b.offsetParent === null)) return K.toast("Reload the page to open the tool again");
    if (b.disabled) { reloadTool(tool.frame); return K.toast("That launch timed out. It's ready again: press it once more."); }
    b.click();
  }
  function workPanel(c) {
    const it = pageItem(c);
    toolFrame();
    let p = doc.querySelector(".pc-work");
    if (!it) { if (p) p.remove(); return; }
    if (it.isNew || it.newGrade) PC.store.itemFlag(host + "/" + it.key, { seen: Date.now(), gradeSeen: Date.now() });
    askCap(it);
    const at = workSpot();
    if (!at) return;
    if (!p) {
      p = doc.createElement("section"); p.className = "pc-work pc-mod pc-root"; p.setAttribute("aria-label", "This work in PocketCanvas");
      p.addEventListener("click", (e) => workClick(e, c));
      p.addEventListener("pointerover", (e) => { if (tool && tool.frame && e.target.closest('[data-act="tool"]')) freshen(tool.frame); });
    }
    if (p.parentElement !== at.parent || p.nextSibling !== at.before) at.parent.insertBefore(p, at.before);
    const html = workHtml(it, c);
    if (p.dataset.h !== html) { p.innerHTML = html; p.dataset.h = html; K.tick(p); }
  }
  /** Where the panel goes: its own card just over Canvas's (#content), outside anything React draws, so a re-render
      never drops it. */
  function workSpot() {
    const content = doc.getElementById("content");
    return content && content.parentElement ? { parent: content.parentElement, before: content } : null;
  }
  function workHtml(it, c) {
    const now = V.now, d = it.due != null ? it.due - now : null, kind = PC.work.KIND_NAME[it.kind] || "Work";
    const day = (t) => `${PC.u.day(t, now)} ${PC.u.time(t)}`;
    // the display: how long until it's due, or how it went
    let lcd;
    if (!it.open) {
      const graded = it.status === "graded" && it.score != null;
      lcd = K.lcd({ label: graded ? "Graded" : it.status === "excused" ? "Excused" : it.status === "submitted" ? "Submitted" : "Done", num: graded && it.points ? `${+it.score.toFixed(2)}/${it.points}` : "DONE", sub: it.submittedAt ? "Turned in " + day(it.submittedAt) : it.due != null ? "Was due " + day(it.due) : "", cls: "pc-wl" });
    } else lcd = K.lcd({ label: d == null ? "No date" : d < 0 ? "Late by" : "Due in", num: d == null ? "--:--" : PC.u.countdown(Math.abs(d)), until: it.due || "", sub: it.due != null ? day(it.due) : it.guess ? "Description says " + PC.u.day(it.guess, now) : "Set a date", cls: "pc-wl" + (d == null ? "" : d < 0 ? " bad" : d < 3 * PC.u.HR ? " hot" : "") });
    const meta = [K.cchip(c), `<span>${esc(kind)}</span>`];
    if (it.points) meta.push(`<span>${esc(it.partial ? `${+it.score.toFixed(2)}/${it.points}` : it.points)} pts${it.partial ? " so far" : ""}</span>`);
    if (it.unlock && it.unlock > now) meta.push(`<span>Opens ${esc(day(it.unlock))}</span>`);
    if (it.lock && it.open && it.lock > now) meta.push(`<span>Closes ${esc(day(it.lock))}</span>`);
    if (it.status === "missing") meta.push(`<span class="pc-tag bad">Missing</span>`);
    if (it.late && !it.open) meta.push(`<span class="pc-tag bad">Late</span>`);
    if (it.pri) meta.push(`<span class="pc-tag pri">${ic("flag")}Priority</span>`);
    // where the date comes from, when it isn't plainly Canvas's
    let note = "";
    if (it.dueBy === "app") note = `No due date on Canvas. ${esc(it.app.name)} has it due ${esc(day(it.due))}${it.app.lateDue ? `, with reduced credit until ${esc(day(it.app.lateDue))}` : ""}. PocketCanvas uses that date.`;
    else if (it.dueBy === "mine") note = `Your date. ${it.canvasDue != null ? `Canvas has it due ${esc(day(it.canvasDue))}.` : "Canvas has no due date."}`;
    else if (it.due == null && it.open) note = it.guess ? `No due date on Canvas. The description says ${esc(day(it.guess))}.` : "No due date on Canvas. It stays in your No due date list so it doesn't get lost.";
    // Collegiapp: whether it's there, and what you gave it
    const ci = capItem, cap = S.cap && S.cap.token;
    let capLine = "";
    if (cap && ci) {
      const bits = [ci.done ? "checked off" : ci.due ? "due " + day(Date.parse(ci.due)) : "no date", ci.est_minutes ? "~" + est(ci.est_minutes) : "", ci.priority ? "!".repeat(ci.priority) : ""].filter(Boolean);
      capLine = `<span class="pc-wcap on" title="${esc(ci.shown ? "In Collegiapp" : "In Collegiapp, but its class is left out of your lists there")}"><i></i>In Collegiapp · ${esc(bits.join(" · "))}${ci.shown ? "" : " · class hidden there"}</span>`;
    } else if (cap && ci === null) capLine = `<span class="pc-wcap"><i></i>Not in Collegiapp yet</span>`;
    const keys = [
      K.key(cap && ci ? "Update in Collegiapp" : "Send to Collegiapp", { icon: "send", cls: "primary sm", act: "send", id: it.key, title: "Send it as it is, with a date, an estimate, a priority and notes" }),
      it.guess && it.due == null ? K.key("Use that date", { cls: "sm", act: "useGuess", id: it.key }) : "",
      it.open || it.flags.due ? K.key(it.dueBy === "mine" ? "Change your date" : "Set your date", { icon: "clock", cls: "sm", act: "itemMenu", id: it.key }) : "",
      it.app ? K.key("Open in " + it.app.name, { icon: "ext", cls: "sm", href: it.app.url, target: "_blank" }) : "",
      tool ? K.key(tool.label, { icon: "ext", cls: "sm", act: "tool", title: "Canvas opens it in a new tab and signs you in" }) : "",
      it.open ? K.key("Mark done", { icon: "check", cls: "ghost sm", act: "done", id: it.key, title: "For work Canvas can't see you finish" }) : it.flags.done ? K.key("Not done", { cls: "ghost sm", act: "undone", id: it.key }) : "",
    ].join("");
    return `${K.band("This " + kind.toLowerCase(), "work", capLine)}<div class="pc-mb pc-wb">${lcd}
      <div class="pc-wm"><div class="pc-meta">${meta.join("")}</div>${note ? `<p class="pc-wnote">${note}</p>` : ""}<div class="pc-acts">${keys}</div></div></div>`;
  }
  const est = (m) => (m % 60 ? (m > 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : m + "m") : m / 60 + "h");
  async function workClick(e, c) {
    const a = e.target.closest("[data-act]"); if (!a) return;
    const it = pageItem(c); if (!it) return;
    const act = a.dataset.act;
    if (act === "send") { e.preventDefault(); return openSend(a, it); }
    if (act === "tool") { e.preventDefault(); return launchTool(); }
    if (act === "itemMenu") { e.preventDefault(); return K.itemMenu(a, it, pv(it)); }
    if (await K.act(act, a, pv(it))) e.preventDefault();
  }

  // ── Send to Collegiapp: the work as it is, with a due date (needed when Canvas has none), how long it'll take, a
  // priority and notes. A date you pick becomes your date here too, so later pushes carry the same one. ──
  const ESTS = [[0, "None"], [30, "30m"], [60, "1h"], [120, "2h"], [180, "3h"], [300, "5h"]];
  const parseEst = (s) => { const m = String(s).trim().toLowerCase().match(/^(\d+(?:\.\d+)?)\s*(h|hr|hrs|hours?|m|min|mins|minutes?)?$/); if (!m) return null; const n = parseFloat(m[1]); return Math.round(/^h/.test(m[2] || (n <= 12 ? "h" : "m")) ? n * 60 : n); };
  function openSend(anchor, it) {
    if (!S.cap || !S.cap.token) {
      K.pop(anchor, `<div class="pc-pt">${ic("send")}Send to Collegiapp</div><p class="pc-note">Connect PocketCanvas to Collegiapp first: open Collegiapp, then Connect in PocketCanvas settings and allow it there.</p><div class="pc-row2">${K.key("Open settings", { icon: "gear", cls: "primary sm", act: "settings" })}${K.key("Get Collegiapp", { icon: "ext", cls: "sm", href: PC.cap.HOME, target: "_blank" })}</div>`,
        (act) => { if (act === "settings") { K.closePop(); api.runtime.sendMessage({ t: "open", page: "options" }); } }, { cls: "wide", right: true });
      return;
    }
    const ci = capItem || null, c = it.courseObj, now = V.now;
    const from = it.dueBy === "canvas" ? "from Canvas" : it.dueBy === "app" ? "from " + it.app.name : it.dueBy === "mine" ? "your date" : "";
    const dueLabel = it.due == null ? "Due date · Canvas has none, so pick one" : `Due date · ${from}`;
    const estNow = ci ? ci.est_minutes || 0 : 0, priNow = ci ? ci.priority : 0;
    const what = [c ? K.cchip(c, { link: false }) : "", `<span>${esc(PC.work.KIND_NAME[it.kind] || "Work")}</span>`, it.points ? `<span>${esc(it.points)} pts</span>` : "", !it.open ? `<span>${esc(it.status === "graded" ? "graded, lands checked off" : "turned in, lands checked off")}</span>` : ""].join("");
    const html = `<div class="pc-pt">${ic("send")}${ci ? "Update in Collegiapp" : "Send to Collegiapp"}</div>
      <div class="pc-swhat"><b>${esc(it.title)}</b><span class="pc-meta">${what}</span></div>
      <div class="pc-field"><span>${esc(dueLabel)}</span>${K.dueFields(it.due != null ? it.due : it.guess, "sd")}
        <div class="pc-seg">${it.guess && it.due == null ? K.chip("Description says " + PC.u.day(it.guess, now) + " " + PC.u.time(it.guess), { act: "guess" }) : ""}${it.dueBy === "mine" && it.canvasDue != null ? K.chip("Canvas's date", { act: "srcDate", v: it.canvasDue }) : ""}${it.dueBy === "mine" && it.appDue != null ? K.chip(it.app.name + "'s date", { act: "srcDate", v: it.appDue }) : ""}${it.canvasDue == null && it.appDue == null ? K.chip("No date", { act: "noDate" }) : ""}</div></div>
      <div class="pc-field"><span>How long it'll take</span><div class="pc-seg">${ESTS.map(([m, l]) => K.chip(l, { act: "est", v: m, on: m === estNow })).join("")}<input type="text" class="pc-sest" data-f="est" placeholder="Other: 45m, 1.5h" value="${estNow && !ESTS.some(([m]) => m === estNow) ? esc(est(estNow)) : ""}" aria-label="Other estimate"></div></div>
      <div class="pc-field"><span>Priority</span><div class="pc-seg">${[[0, "None"], [1, "!"], [2, "!!"], [3, "!!!"]].map(([n, l]) => K.chip(l, { act: "pri", v: n, on: n === priNow })).join("")}</div></div>
      <label class="pc-field"><span>Notes</span><textarea rows="3" data-f="notes" placeholder="Anything to remember about it">${esc(ci ? ci.notes : "")}</textarea></label>
      ${it.desc ? `<label class="pc-check"><input type="checkbox" data-f="desc"${ci ? "" : " checked"}> Add Canvas's description to the notes</label>` : ""}
      <div class="pc-row2">${K.key(ci ? "Update" : "Send", { icon: "send", cls: "primary", act: "go", title: "Enter (Ctrl+Enter in the notes)" })}${K.key("Cancel", { cls: "ghost sm", act: "close" })}<span class="pc-saved" aria-live="polite"></span></div>`;
    let estPick = estNow, priPick = priNow, busy = false;
    const p = K.pop(anchor, html, async (act, el, pop) => {
      const on = (sel, x) => pop.querySelectorAll(sel).forEach((b) => b.classList.toggle("on", b === x));
      if (act === "est") { estPick = +el.dataset.v; pop.querySelector('[data-f="est"]').value = ""; on('[data-act="est"]', el); }
      else if (act === "pri") { priPick = +el.dataset.v; on('[data-act="pri"]', el); }
      else if (act === "guess") setDue(pop, it.guess);
      else if (act === "srcDate") setDue(pop, +el.dataset.v);
      else if (act === "noDate") setDue(pop, null);
      else if (act === "close") K.closePop();
      else if (act === "go" && !busy) { busy = true; el.disabled = true; await send(pop); busy = false; if (pop.isConnected) el.disabled = false; }
    }, { cls: "wide pc-sendpop", right: true });
    // the day field first when Canvas has no date, so a date is one pick away
    const first = it.due == null ? p.querySelector('[data-f="sd-d"]') : p.querySelector('[data-act="go"]');
    if (first) first.focus();
    p.addEventListener("input", (e) => { if (e.target.dataset.f === "est") { const v = parseEst(e.target.value); if (v != null) { estPick = v; p.querySelectorAll('[data-act="est"]').forEach((b) => b.classList.remove("on")); } } });
    p.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" || e.target.matches("button, a")) return;
      if (e.target.tagName === "TEXTAREA" && !(e.ctrlKey || e.metaKey)) return;
      e.preventDefault(); p.querySelector('[data-act="go"]').click();
    });
    async function send(pop) {
      const msg = pop.querySelector(".pc-saved"), say = (t) => { msg.textContent = t; };
      // a date that's Canvas's or the app's goes back to it; any other becomes your date here too, so pushes carry it
      const iso = K.dueValue(pop, "sd"), t = iso ? Date.parse(iso) : null;
      const near = (x) => x != null && t != null && Math.abs(t - x) < 60e3;
      const mine = t != null && !near(it.canvasDue) && !near(it.appDue) ? t : null;
      if (!(t == null ? it.due == null : near(it.due))) await PC.store.itemFlag(host + "/" + it.key, { due: mine != null ? iso : null });
      const due = mine != null ? mine : it.canvasDue != null ? it.canvasDue : it.appDue != null ? it.appDue : null;
      const dueBy = mine != null ? "mine" : it.canvasDue != null ? "canvas" : it.appDue != null ? "app" : null;
      let notes = pop.querySelector('[data-f="notes"]').value.trim();
      const desc = pop.querySelector('[data-f="desc"]');
      if (desc && desc.checked && it.desc) notes = (notes ? notes + "\n\n" : "") + it.desc;
      const body = PC.cap.one(V.all, Object.assign({}, it, { due, dueBy }), { est_minutes: estPick, priority: priPick, notes });
      say("Sending…");
      const r = await api.runtime.sendMessage({ t: "capSend", body }).catch((e) => ({ ok: false, error: e.message }));
      if (!r || !r.ok) return say((r && r.error) || "Collegiapp isn't running.");
      capItem = r.item; capAsked = it.key;
      K.closePop();
      K.toast(`${r.added ? "Added to" : "Updated in"} Collegiapp · ${it.title}${r.item && !r.item.shown ? " · its class is hidden there" : ""}`);
      render();
    }
  }
  function setDue(pop, t) {
    const s = t != null ? new Date(t - new Date(t).getTimezoneOffset() * 60e3).toISOString() : "";
    pop.querySelector('[data-f="sd-d"]').value = s.slice(0, 10);
    pop.querySelector('[data-f="sd-t"]').value = s.slice(11, 16) || "23:59";
  }
  function finalHelper(c) {
    const rs = doc.getElementById("right-side") || doc.getElementById("content"); if (!rs || rs.querySelector(".pc-final")) return;
    const box = doc.createElement("div"); box.className = "pc-final pc-side pc-root";
    const opts = S.settings.gpaScale.filter((x) => x[0] > 0).map(([min, , l]) => `<option value="${min}"${l === "A" ? " selected" : ""}>${esc(l)} (${min}%)</option>`).join("");
    box.innerHTML = K.module("What do I need on the final", "exams", `<div class="pc-fgrid">
      <label class="pc-field"><span>Grade now (%)</span><input type="number" step="0.1" data-f="cur" value="${c.score != null ? +c.score.toFixed(2) : ""}"></label>
      <label class="pc-field"><span>Final is worth (%)</span><input type="number" step="1" min="1" max="99" data-f="w" value="25"></label>
      <label class="pc-field" style="grid-column:1/-1"><span>To finish with</span><select data-f="t">${opts}</select></label></div><div class="pc-out" aria-live="polite"></div>`);
    rs.prepend(box);
    const calc = () => {
      const cur = parseFloat(box.querySelector('[data-f="cur"]').value), w = parseFloat(box.querySelector('[data-f="w"]').value), t = parseFloat(box.querySelector('[data-f="t"]').value);
      const need = PC.work.needOnFinal(cur, t, w), out = box.querySelector(".pc-out");
      if (need == null || isNaN(need)) out.textContent = "Fill in your grade now and the final's weight.";
      else if (need <= 0) out.textContent = "You already have it, even with a zero on the final.";
      else if (need > 100) out.textContent = `You'd need ${need.toFixed(1)}%, more than a perfect score. Check for extra credit or a curve.`;
      else out.innerHTML = `You need <b>${need.toFixed(1)}%</b> on the final.`;
    };
    box.addEventListener("input", calc); calc();
  }

  function renderTitle() {
    const c = courseId && V.all.byId[courseId];
    if (S.settings.tabTitles && c) {
      const want = c.label + " · ";
      if (!doc.title.startsWith(want)) doc.title = want + doc.title.replace(/^[^·]{1,16} · /, "");
    }
    if (S.settings.favicons && c && favDone !== c.color + S.settings.theme) favicon(c);
  }
  let favDone = null;
  function favicon(c) {
    try {
      const cv = doc.createElement("canvas"); cv.width = cv.height = 32;
      const x = cv.getContext("2d"), css = getComputedStyle(root);
      x.fillStyle = css.getPropertyValue("--pc-k" + c.color).trim() || "#ff5b1f"; x.beginPath(); x.roundRect ? x.roundRect(0, 0, 32, 32, 7) : x.rect(0, 0, 32, 32); x.fill();
      x.fillStyle = "#fff";
      PC.PIX.classes.split("|").forEach((row, y) => [...row].forEach((p, xx) => { if (p === "#") x.fillRect(2 + xx * 3, 3 + y * 3, 3, 3); }));
      doc.querySelectorAll('link[rel~="icon"]').forEach((l) => l.remove());
      const l = doc.createElement("link"); l.rel = "icon"; l.href = cv.toDataURL(); doc.head.appendChild(l);
      favDone = c.color + S.settings.theme;
    } catch (e) { /* the tab keeps Canvas's icon */ }
  }

  // ── the global nav's Courses tray: each class in its colour (or icon) and mode, like the dock. Hidden classes are
  // left out, ghosts dimmed at the end, priority ones first, the class you're in lit (canvas.css draws it). ──
  function trays() {
    const p = doc.getElementById("nav-tray-portal"), box = p && p.querySelector(".courses-tray");
    if (!box || !V) return;
    const look = root.dataset.pcLook;
    for (const li of box.querySelectorAll("li")) {
      const a = li.querySelector(":scope > a[href]"), m = a && (a.getAttribute("href") || "").match(/\/courses\/(\d+)/);
      const c = m ? V.all.byId[m[1]] : null;
      li.classList.toggle("pc-tr", !!c);
      li.classList.toggle("pc-tr-hidden", !!c && c.mode === "hidden");
      li.classList.toggle("pc-tr-ghost", !!c && c.mode === "ghost");
      li.classList.toggle("pc-tr-pri", !!c && c.mode === "priority");
      li.classList.toggle("pc-tr-on", !!c && c.id === courseId);
      if (c) li.style.setProperty("--kc", `var(--pc-k${Math.min(6, Math.max(1, +c.color || 1))})`); else li.style.removeProperty("--kc");
      if (c && c.icon) { li.dataset.pcIcon = c.icon; li.style.setProperty("--pc-trm", PC.icUrl(c.icon, look)); }
      else if (li.dataset.pcIcon) { delete li.dataset.pcIcon; li.style.removeProperty("--pc-trm"); }
    }
  }
  // ── the calendar: Canvas colours a class's chips and checkbox by .group_course_<id>; these take its PocketCanvas colour ──
  function calColors() {
    if (!/^\/calendar/.test(path)) return;
    const css = V.all.courses.map((c) => { const k = `var(--pc-k${Math.min(6, Math.max(1, +c.color || 1))})`; return `html[data-pc-on] .group_course_${c.id}{color:${k}!important;border-color:${k}!important}`; }).join("\n");
    let st = doc.getElementById("pc-calcolors");
    if (!st) { st = doc.createElement("style"); st.id = "pc-calcolors"; doc.head.appendChild(st); }
    if (st.textContent !== css) st.textContent = css;
  }

  // ── a class's menu: each page counts a visit to the tab it's under, and the next pages put the tabs you open most
  // first (boot.js sorts them from the ranks applyLook keeps; canvas.css draws the groups) ──
  async function tabVisit() {
    const a = courseId && S.settings.tabOrder && doc.querySelector("#section-tabs a.active");
    const key = a && PC.work.tabKey(a.classList);
    if (!key) return;
    const all = await PC.store.local("tabUse", {}), next = PC.work.tabVisit(all[host] || {}, key, Date.now());
    if (next) { all[host] = next; await PC.store.setLocal("tabUse", all); }
  }
  // ── Go to: a page of its own (a class's Grades, a tool in its menu, Calendar) counts a visit the same way, by class,
  // under the name its menu gives it, so the dashboard and the drawer offer the ones you open most (PC.work.gotos) ──
  async function goVisit() {
    const pg = PC.work.page(path);
    if (!pg) return;
    const a = pg.course && doc.querySelector("#section-tabs a.active");
    const name = a && ([...a.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join("").trim() || a.textContent.trim());
    const all = await PC.store.local("visits", {}), next = PC.work.pageVisit(all[host] || {}, pg.path, name || pg.label, Date.now());
    if (next) { all[host] = next; await PC.store.setLocal("visits", all); }
  }

  function render() {
    build();
    renderDock();
    if (isDash()) renderDash();
    if (courseId) renderCourse();
    renderTitle();
    trays();
    calColors();
  }

  // ── keys ──
  doc.addEventListener("keydown", (e) => {
    if (typing(e.target) || doc.querySelector(".pc-scrim")) return;
    const k = e.code;
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && k === "KeyK") { e.preventDefault(); openPalette(); }
    else if (e.key === "/" && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); openPalette(); }
    else if (e.altKey && !e.ctrlKey && !e.metaKey && /^Digit[1-9]$/.test(k)) { const c = docked()[+k.slice(5) - 1]; if (c) { e.preventDefault(); location.href = sameSection(c); } }
    else if (e.altKey && !e.ctrlKey && (k === "BracketLeft" || k === "BracketRight")) {
      const list = docked(); if (!list.length) return; e.preventDefault();
      const i = list.findIndex((c) => c.id === courseId), n = list[(i < 0 ? 0 : i + (k === "BracketRight" ? 1 : -1) + list.length) % list.length];
      location.href = sameSection(n);
    } else if (e.altKey && !e.ctrlKey && k === "KeyW") { e.preventDefault(); doc.querySelector(".pc-drawer") ? closeDrawer() : openDrawer(); }
    else if (e.altKey && !e.ctrlKey && k === "KeyH") { e.preventDefault(); location.href = origin + "/"; }
    else if (e.key === "Escape" && doc.querySelector(".pc-drawer")) closeDrawer();
  }, true);

  // ── live ──
  const again = PC.u.debounce(async () => { S = await PC.store.all(); applyLook(); render(); const d = doc.querySelector(".pc-drawer"); if (d) drawDrawer(d, true); }, 80);
  api.storage.onChanged.addListener(again);
  if (window.matchMedia) window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", again);
  // Canvas draws the dashboard and much else after load (React): enhance what appears, never our own nodes
  const mo = new MutationObserver(PC.u.debounce(() => { if (isDash()) renderDash(); else if (courseId) renderCourse(); if (!doc.querySelector(".pc-dock") && S.settings.dock) renderDock(); }, 200));
  mo.observe(doc.body, { childList: true, subtree: true });
  // the nav trays render on a click: mark their classes in the same frame, before they paint
  let trayFrame = 0;
  new MutationObserver(() => { if (!trayFrame) trayFrame = requestAnimationFrame(() => { trayFrame = 0; trays(); }); }).observe(doc.body, { childList: true, subtree: true });
  if (S.settings.tabTitles) new MutationObserver(() => renderTitle()).observe(doc.querySelector("title") || doc.head, { childList: true, characterData: true, subtree: true });
  setInterval(() => K.tick(), 1000);
  setInterval(() => { if (doc.visibilityState === "visible") refresh(false); }, 5 * 60e3);
  render();
  refresh(false);
  tabVisit();
  goVisit();
})();
