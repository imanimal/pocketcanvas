/* PocketCanvas: the board, every class on one page so you never click through them one by one. The whole to-do
   list as a calendar (filters, search, a class strip, add your own), Do first, every class with its mode
   (priority, normal, ghost, hidden: one click each), the items you hid, and where app dates come from. */
(function () {
  const PC = globalThis.PC, api = PC.api, K = PC.kit, P = PC.page, { esc, plural } = PC.u, ic = (n, c) => PC.ic(n, c);
  const app = document.getElementById("app");
  const st = { q: "", course: null, tab: "open", open: {} };
  const skipped = new Set();
  const TABS = [["open", "Open", (i) => i.open], ["nodate", "No due date", (i) => i.open && i.due == null], ["new", "New", (i) => i.isNew || i.newGrade],
    ["missing", "Late", (i) => i.open && (i.overdue || i.status === "missing")], ["done", "Done", (i) => !i.open]];
  const MODES = [["priority", "Priority", "flag"], ["normal", "Normal", null], ["ghost", "Ghost", "ghost"], ["hidden", "Hide", "eyeoff"]];

  function todo(V) {
    const q = st.q.trim().toLowerCase();
    const pass = (i) => (!st.course || i.course === st.course) && (!q || (i.title + " " + ((i.courseObj && i.courseObj.label) || i.courseText || "")).toLowerCase().includes(q));
    const tab = TABS.find((t) => t[0] === st.tab) || TABS[0];
    const items = V.items.filter((i) => pass(i) && tab[2](i));
    const classes = PC.work.docked(V.courses);
    const body = `<div class="pc-search">${ic("search")}<input type="search" data-f="q" placeholder="Filter by title or class" value="${esc(st.q)}"></div>
      <div class="pc-filters">${TABS.map(([id, l, fn]) => K.chip(l, { act: "tab", v: id, on: st.tab === id, count: V.items.filter((i) => pass(i) && fn(i)).length || null })).join("")}</div>
      <div class="pc-strip">${K.chip("All classes", { act: "course", v: "", on: !st.course })}${classes.map((c) => K.classChip(c, { act: "course", v: c.id, on: st.course === c.id })).join("")}</div>
      ${K.agenda(items, V, { weeks: 6, rows: 8, open: st.open, today: st.tab === "open" && !st.course && !q, showDone: st.tab === "done" || st.tab === "new", rel: P.S.settings.relDates, empty: K.empty(st.tab === "nodate" ? "Every open item has a date" : st.tab === "new" ? "Nothing new" : "Nothing here", st.course || q ? "Try another class or tab." : "No open work. Ghosted and hidden classes are left out.") })}
      <div class="pc-addtask"><input type="text" data-f="task" placeholder="Add your own: work a teacher announced but never posted" aria-label="Add your own task">${K.key("Add", { icon: "plus", cls: "primary sm", act: "addTask" })}
        <div class="pc-at2"><select data-f="tcourse" aria-label="Class"><option value="">No class</option>${classes.map((c) => `<option value="${c.id}"${st.course === c.id ? " selected" : ""}>${esc(c.label)}</option>`).join("")}</select>${K.dueFields(st.tdue, "tdue")}</div></div>`;
    return K.module("To do", "work", body, { right: `${Object.keys(st.open).length ? K.key("Fold", { cls: "ghost sm", act: "fold" }) : ""}${K.key("Seen", { icon: "eye", cls: "ghost sm", act: "seenAll", title: "Mark everything seen" })}` });
  }

  function classes(V) {
    const all = V.all.courses.slice().sort((a, b) => ["priority", "normal", "ghost", "hidden"].indexOf(a.mode) - ["priority", "normal", "ghost", "hidden"].indexOf(b.mode) || a.label.localeCompare(b.label));
    const ended = all.filter((c) => c.mode === "normal" && PC.work.ended(c, V.now));
    const rows = all.map((c) => {
      const n = V.all.items.filter((i) => i.course === c.id && i.open && !i.flags.hide).length;
      return `<div class="pc-crow ${c.mode}" style="${K.kc(c)}">${K.mark(c)}<div class="pc-cn"><a href="${esc(c.url)}" target="_blank">${esc(c.label)}</a>
        <div class="pc-meta"><span>${esc(c.name)}</span>${c.term ? `<span>${esc(c.term)}</span>` : ""}${n ? `<span>${plural(n, "open")}</span>` : ""}${c.autoMode && c.mode === "ghost" ? "<span>Term ended</span>" : ""}</div></div>
        <div class="pc-seg">${MODES.map(([m, l, icn]) => K.chip(l, { act: "mode", id: c.id, v: m, on: c.mode === m, icon: icn })).join("")}${K.key("", { icon: "menu", cls: "ghost sm", act: "courseMenu", id: c.id, aria: "Class settings" })}</div></div>`;
    }).join("");
    return K.module("Classes", "classes", (all.length ? `<div class="pc-classlist">${rows}</div>` : `<p class="pc-note">No classes yet. Open Canvas once.</p>`)
      + (ended.length ? `<div class="pc-row2" style="margin-top:8px">${K.key(`Ghost ${plural(ended.length, "class", "classes")} from past terms`, { icon: "ghost", cls: "sm", act: "ghostPast" })}</div>` : ""),
      { right: `<span class="pc-cnt">${all.filter((c) => c.mode === "ghost").length} ghosted · ${all.filter((c) => c.mode === "hidden").length} hidden</span>` });
  }

  function hidden(V) {
    if (!V.hidden.length) return "";
    return K.module("Hidden items", "eyeoff", V.hidden.map((i) => `<div class="pc-row" style="${K.kc(i.courseObj)}"><span class="pc-dot"></span><span class="pc-rm"><span class="pc-rt">${esc(i.title)}</span><span class="pc-meta">${i.courseObj ? K.cchip(i.courseObj) : ""}</span></span>${K.key("Show", { cls: "sm", act: "unhideItem", id: i.key })}</div>`).join(""));
  }

  function apps(S, V) {
    const list = PC.apps.summary(S);
    if (!list.length) return "";
    const say = { ok: "Reading", lms: "Reading set by set", signedout: "Signed out", noaccess: "Needs access", error: "Couldn't read", new: "Not read yet" };
    return K.module("Dates from other apps", "links", list.map((a) => `<div class="pc-row"><span class="pc-rm"><span class="pc-rt">${esc(a.app)} · ${esc(a.code)}</span><span class="pc-meta">${a.course && V.all.byId[a.course.id] ? K.cchip(V.all.byId[a.course.id]) : "<span>No class matched</span>"}<span>${esc(say[a.status] || a.status)}</span>${a.sets ? `<span>${plural(a.sets, "item")}</span>` : ""}</span></span>
      ${a.status === "signedout" ? K.key("Sign in", { cls: "sm", href: a.launch || a.home, target: "_blank", icon: "ext" }) : a.status === "noaccess" ? K.key("Allow", { cls: "sm primary", act: "allow", v: a.origin }) : ""}</div>`).join("")
      + `<p class="pc-note" style="margin-top:8px">Signing in works however you normally do (school sign-in, Google, a password), in this browser. ${K.key("Read now", { cls: "ghost sm", act: "readApps", icon: "refresh" })}</p>`);
  }

  function render(S, V) {
    if (app.contains(document.activeElement) && document.activeElement.matches('input[data-f="task"], select, input[type="date"], input[type="time"]')) return;
    const top = PC.work.rank(V.items, V.now).filter((i) => !skipped.has(i.key));
    const age = S.cache ? Date.now() - S.cache.at : null;
    const q = app.querySelector('[data-f="q"]'), focused = q && document.activeElement === q, pos = focused ? q.selectionStart : null;
    app.innerHTML = `${P.top("PocketCanvas", `<span class="pc-meta">${age == null ? "Not read yet" : age < 60e3 ? "Read just now" : "Read " + PC.u.span(age) + " ago"}</span>${K.key("Refresh", { icon: "refresh", cls: "ghost sm", act: "refresh" })}${K.key("Settings", { icon: "gear", cls: "ghost sm", act: "options" })}`)}
      <main class="pc-wrap" id="main">${!S.cache ? K.empty("Open Canvas once", "PocketCanvas reads your classes from Canvas with your own sign-in. Open your school's Canvas, then come back.") : `
        <div class="pc-cols2"><div class="pc-stack">${todo(V)}</div>
        <div class="pc-stack">${K.module("Do first", "now", K.hero(top[0], V, { next: top.length > 1 }), { cls: "do" })}${classes(V)}${apps(S, V)}${hidden(V)}</div></div>`}</main>`;
    if (focused) { const q2 = app.querySelector('[data-f="q"]'); q2.focus(); q2.setSelectionRange(pos, pos); }
    app.querySelectorAll(".pc-strip").forEach((s) => { const m = []; if (s.scrollLeft + s.clientWidth < s.scrollWidth - 2) m.push("r"); s.dataset.more = m.join(" "); s.addEventListener("scroll", () => { const n = []; if (s.scrollLeft > 2) n.push("l"); if (s.scrollLeft + s.clientWidth < s.scrollWidth - 2) n.push("r"); s.dataset.more = n.join(" "); }, { passive: true }); });
  }

  async function addTask() {
    const inp = app.querySelector('[data-f="task"]'), t = inp.value.trim(); if (!t) return;
    const due = K.dueValue(app, "tdue"), course = app.querySelector('[data-f="tcourse"]').value || null;
    const tasks = await PC.store.local("tasks", []);
    tasks.push({ id: PC.u.uid(), title: t, course, due, done: false, at: Date.now() });
    inp.value = "";
    await PC.store.setLocal("tasks", tasks);
    K.toast("Added · " + t);
  }
  app.addEventListener("input", PC.u.debounce((e) => { if (e.target.dataset.f === "q") { st.q = e.target.value; P.redraw(); } }, 120));
  app.addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target.dataset.f === "task") { e.preventDefault(); addTask(); } });
  // the new task's due date survives redraws
  app.addEventListener("change", (e) => { if (/^tdue-/.test(e.target.dataset.f || "")) { const iso = K.dueValue(app, "tdue"); st.tdue = iso ? Date.parse(iso) : null; } });
  P.bind(app, async (act, el, e, V) => {
    if (act === "tab") { st.tab = el.dataset.v; st.open = {}; P.redraw(); return true; }
    if (act === "course") { st.course = el.dataset.v || null; P.redraw(); return true; }
    if (act === "more") { st.open = Object.assign({}, st.open, { [el.dataset.v]: true }); P.redraw(); return true; }
    if (act === "fold") { st.open = {}; P.redraw(); return true; }
    if (act === "addTask") { await addTask(); return true; }
    if (act === "skip") { skipped.add(el.dataset.id); P.redraw(); return true; }
    if (act === "refresh") { P.refresh(); return true; }
    if (act === "options") { P.open("options"); return true; }
    if (act === "mode") { await PC.store.setCourseFlag(V.host + "/" + el.dataset.id, { mode: el.dataset.v }); return true; }
    if (act === "courseMenu") { const c = V.all.byId[el.dataset.id]; if (c) K.courseMenu(el, c, V); return true; }
    if (act === "ghostPast") { for (const c of V.all.courses.filter((c) => c.mode === "normal" && PC.work.ended(c, V.now))) await PC.store.setCourseFlag(V.host + "/" + c.id, { mode: "ghost" }); K.toast("Ghosted classes from past terms"); return true; }
    if (act === "allow") { const ok = await api.permissions.request({ origins: [el.dataset.v + "/*"] }).catch(() => false); if (ok) api.runtime.sendMessage({ t: "apps" }); return true; }
    if (act === "readApps") { K.toast("Reading WeBWorK and Gradescope…", { ms: 2500 }); const r = await api.runtime.sendMessage({ t: "apps" }).catch(() => null); K.toast(r && r.report && r.report.length ? r.report.join(" · ") : "Dates read"); return true; }
  });
  P.start(render);
})();
