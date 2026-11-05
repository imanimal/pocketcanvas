/* PocketCanvas: the toolbar popup. Do first on top, then what's due (the No due date group included), your classes as
   keys, a focus block, and one line to add a task (or send it to Collegiapp in its quick-add grammar). Links open
   in a new tab and close the popup. */
(function () {
  const PC = globalThis.PC, api = PC.api, K = PC.kit, P = PC.page, { esc, plural } = PC.u;
  const app = document.getElementById("app");
  let tab = "soon", skipped = new Set();

  function render(S, V) {
    const s = S.settings, cache = S.cache, cap = S.cap || {};
    if (!cache) {
      app.innerHTML = `${P.top("PocketCanvas", K.key("", { icon: "gear", cls: "ghost sm", act: "options", aria: "Settings" }))}
        <div class="pc-pbody">${K.empty("Open Canvas once", "PocketCanvas reads your classes from Canvas with your own sign-in. Open your school's Canvas and it fills in here.",
        `<div class="pc-row2" style="justify-content:center;margin-top:8px">${K.key("Open Canvas", { icon: "go", cls: "primary", href: "https://canvas.ucsb.edu/", target: "_blank" })}${K.key("Another school", { cls: "ghost", act: "options", v: "canvas" })}</div>`)}</div>`;
      return;
    }
    const open = V.items.filter((i) => i.open);
    const tabs = [["soon", "This week", (i) => i.open && (i.overdue || (i.due != null && i.due - V.now < 7 * PC.u.DAY))], ["nodate", "No date", (i) => i.open && i.due == null], ["new", "New", (i) => i.isNew || i.newGrade], ["all", "All", (i) => i.open]];
    const cur = tabs.find((t) => t[0] === tab) || tabs[0];
    const list = V.items.filter(cur[2]);
    const top = PC.work.rank(V.items, V.now).filter((i) => !skipped.has(i.key));
    const classes = PC.work.docked(V.courses);
    const f = focusState(S);
    const age = Date.now() - cache.at;
    app.innerHTML = `${P.top("PocketCanvas", `<span class="pc-meta" title="Last read from Canvas">${age < 60e3 ? "Just now" : PC.u.span(age) + " ago"}</span>${K.key("", { icon: "refresh", cls: "ghost sm", act: "refresh", aria: "Refresh from Canvas" })}${K.key("", { icon: "all", cls: "ghost sm", act: "board", aria: "Open the board" })}${K.key("", { icon: "gear", cls: "ghost sm", act: "options", aria: "Settings" })}`)}
      <div class="pc-pbody">
        ${K.module("Do first", "now", K.hero(top[0], V, { next: top.length > 1 }), { cls: "do", right: top.length ? `<span class="pc-cnt">${top.length}</span>` : "" })}
        <section class="pc-mod"><div class="pc-band"><span class="pc-filters" style="margin:0">${tabs.map(([id, l, fn]) => K.chip(l, { act: "tab", v: id, on: tab === id, count: V.items.filter(fn).length || null })).join("")}</span></div>
          <div class="pc-mb">${K.agenda(list, V, { weeks: 2, rows: 3, showDone: tab === "new", rel: s.relDates, empty: K.empty(tab === "nodate" ? "Every open item has a date" : tab === "new" ? "Nothing new" : "Nothing due this week", tab === "new" ? "New work and grades show up here until you open them." : `${plural(open.length, "open item")} in all.`) })}</div></section>
        ${classes.length ? `<div class="pc-strip pc-classes">${classes.map((c) => `<a class="pc-key pc-ck sm" href="${esc(c.url)}" target="_blank" data-act="link" style="${K.kc(c)}" title="${esc(c.name)}">${K.mark(c)}<span class="pc-kl">${esc(c.label)}</span>${c.mode === "priority" ? PC.ic("flag") : ""}</a>`).join("")}</div>` : ""}
        <div class="pc-focus">${f ? `${K.lcd({ label: f.from === "Collegiapp" ? "Collegiapp focus" : "Focus", num: f.until ? PC.u.countdown(f.until - Date.now()) : "ON", until: f.until || "", cls: "mini" })}<span class="pc-sp"></span>${f.from === "PocketCanvas" ? K.key("Stop", { cls: "sm", act: "focusStop" }) : `<span class="pc-meta">Ends in Collegiapp</span>`}`
          : `<span class="pc-meta">${s.blockSites ? "Focus blocks your distracting sites" : "Focus"}</span><span class="pc-sp"></span>${K.key("25 min", { icon: "focus", cls: "sm", act: "focus", v: "25" })}${K.key("50 min", { cls: "sm", act: "focus", v: "50" })}`}</div>
        <div class="pc-qa"><input type="text" data-f="qa" placeholder="${cap.token ? "Add a task, or pa3 130a fri ~2h for Collegiapp" : "Add a task"}" aria-label="Add a task">${K.key("Add", { icon: "plus", cls: "primary sm", act: "add" })}${cap.token ? K.key("", { icon: "send", cls: "sm", act: "send", aria: "Send to Collegiapp" }) : ""}</div>
        <div class="pc-status">${cap.token ? `<span class="pc-cap${cap.ok ? " on" : ""}"></span>${cap.ok ? "Collegiapp is connected" + (cap.pushedAt ? ` · synced ${PC.u.span(Date.now() - cap.pushedAt)} ago` : "") : "Collegiapp isn't running"}` : `<a href="#" data-act="options" data-v="collegiapp">Connect Collegiapp</a>`}<span class="pc-sp" style="flex:1"></span><a href="#" data-act="night">${document.documentElement.dataset.pcScheme === "dark" ? "Day theme" : "Night theme"}</a></div>
      </div>`;
    const qa = app.querySelector('[data-f="qa"]');
    if (qa) { qa.value = draft; qa.addEventListener("input", () => (draft = qa.value)); qa.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); add(e.shiftKey && cap.token ? "send" : "add"); } }); }
  }
  let draft = "";
  function focusState(S) {
    // mirrors background.js focusNow without its storage writes
    return S.focus && S.focus.until > Date.now() ? { from: "PocketCanvas", until: S.focus.until }
      : S.cap && S.cap.ok && S.cap.focus ? { from: "Collegiapp", until: S.cap.focus.until } : null;
  }
  async function add(how) {
    const t = draft.trim(); if (!t) return;
    if (how === "send") {
      const r = await api.runtime.sendMessage({ t: "capture", text: t });
      K.toast(r && r.ok ? "Sent to Collegiapp" : (r && r.error) || "Collegiapp isn't running");
      if (!r || !r.ok) return;
    } else {
      const tasks = await PC.store.local("tasks", []);
      tasks.push({ id: PC.u.uid(), title: t, course: null, due: null, done: false, at: Date.now() });
      await PC.store.setLocal("tasks", tasks);
      K.toast("Added · " + t);
    }
    draft = "";
  }

  P.bind(app, async (act, el, e, V) => {
    if (act === "tab") { tab = el.dataset.v; P.redraw(); return true; }
    if (act === "options") { e.preventDefault(); await P.open("options", el.dataset.v); window.close(); return true; }
    if (act === "board") { await P.open("board"); window.close(); return true; }
    if (act === "refresh") { P.refresh(); return true; }
    if (act === "skip") { skipped.add(el.dataset.id); P.redraw(); return true; }
    if (act === "focus") { await api.runtime.sendMessage({ t: "focus", minutes: +el.dataset.v }); return true; }
    if (act === "focusStop") { await api.runtime.sendMessage({ t: "focus", stop: true }); return true; }
    if (act === "add" || act === "send") { await add(act); P.redraw(); return true; }
    if (act === "night") { e.preventDefault(); await PC.store.setSettings({ night: document.documentElement.dataset.pcScheme === "dark" ? "off" : "on" }); return true; }
    // the popup shows a few days; the rest are on the board
    if (act === "more") { await P.open("board"); window.close(); return true; }
    if (act === "link") { e.preventDefault(); api.tabs.create({ url: el.href }); window.close(); return true; }
    if (act === "openItem") {
      e.preventDefault();
      await PC.kit.act("openItem", el, V);
      const it = V.items.find((i) => i.key === el.dataset.id);
      if (it && it.url) { api.tabs.create({ url: it.url }); window.close(); }
      return true;
    }
  });
  P.start(render);
})();
