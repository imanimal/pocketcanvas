/* PocketCanvas: the UI kit every surface draws with (Canvas pages, popup, board, options). Parts are HTML strings with
   pc-* classes, styled by ui/kit.css for both looks; actions are data-act attributes that each surface delegates
   to PC.kit.act(). Shared actions write storage, and every surface re-renders on storage.onChanged, so a check in
   the popup shows up in the open Canvas tab at once.

   Parts: key · chip · dot · due pill · LCD · band/module · work row · agenda (a calendar) · Do first hero and cards ·
   Go to tiles · popover · toast · palette (Ctrl+K). Writing: sentence case, parts joined with " · ", keys are verbs (docs/UIKit/README.md § 10). */
(function (g) {
  const PC = (g.PC = g.PC || {});
  const { esc, due, countdown, plural } = PC.u;
  const ic = (n, c) => PC.ic(n, c);
  const doc = g.document;

  const attrs = (o) => Object.entries(o).filter(([, v]) => v != null && v !== false).map(([k, v]) => ` ${k}="${esc(v === true ? "" : v)}"`).join("");
  function key(label, o = {}) {
    const cls = "pc-key" + (o.cls ? " " + o.cls : "");
    const inner = (o.icon ? ic(o.icon) : "") + (label ? `<span class="pc-kl">${esc(label)}</span>` : "") + (o.kbd ? `<kbd>${esc(o.kbd)}</kbd>` : "") + (o.count != null ? `<span class="pc-ct">${esc(o.count)}</span>` : "");
    const a = { class: cls, title: o.title || (label ? null : o.aria), "aria-label": label ? null : o.aria || o.title, "data-act": o.act, "data-id": o.id, "data-v": o.v, "aria-pressed": o.pressed == null ? null : String(!!o.pressed), style: o.style, "data-hint": o.hint };
    if (o.href) return `<a${attrs(Object.assign(a, { href: o.href, target: o.target, rel: o.target ? "noopener" : null }))}>${inner}</a>`;
    return `<button type="button"${attrs(Object.assign(a, { disabled: !!o.disabled }))}>${inner}</button>`;
  }
  const chip = (label, o = {}) => `<button type="button" class="pc-chip${o.on ? " on" : ""}${o.cls ? " " + o.cls : ""}"${attrs({ "data-act": o.act, "data-v": o.v, "data-id": o.id, "aria-pressed": o.on == null ? null : String(!!o.on), style: o.style })}>${o.icon ? ic(o.icon) : ""}${esc(label)}${o.count != null ? `<span class="pc-ct">${esc(o.count)}</span>` : ""}</button>`;
  const kc = (c) => (c ? `--kc: var(--pc-k${Math.min(6, Math.max(1, +c.color || 1))})` : "--kc: var(--pc-text3)");
  // a class's mark: the icon you gave it, else its colour dot (inside something that already sets --kc)
  const mark = (c) => (c && c.icon ? ic(c.icon, "pc-cic") : `<span class="pc-dot"></span>`);
  const dot = (c) => (c && c.icon ? `<span class="pc-cmark" style="${kc(c)}">${mark(c)}</span>` : `<span class="pc-dot" style="${kc(c)}"></span>`);
  /** A class's mark and short name, linked to its Canvas page (`o.href` for another of its pages, `o.target` for a new
      tab, `o.link: false` for plain text). data-act="link" lets the popup open it in a tab; elsewhere it's a plain link. */
  function cchip(c, o = {}) {
    if (!c) return `<span class="pc-cchip none">Personal</span>`;
    const href = o.link === false ? null : o.href || c.url, inner = mark(c) + esc(c.label);
    if (!href) return `<span class="pc-cchip" style="${kc(c)}">${inner}</span>`;
    return `<a${attrs({ class: "pc-cchip", href, target: o.target, rel: o.target ? "noopener" : null, "data-act": "link", style: kc(c), title: c.name || c.label })}>${inner}</a>`;
  }
  /** A class as a chip in a class strip (filters), with its icon when it has one. */
  const classChip = (c, o = {}) => chip(c.label, Object.assign({ icon: c.icon || null, cls: "pc-cc", style: kc(c) }, o));
  function pill(it, now, rel) {
    if (!it.open && it.status !== "todo") {
      const t = it.status === "graded" ? (it.score != null && it.points ? `${+it.score.toFixed(2)}/${it.points}` : "Graded") : it.status === "excused" ? "Excused" : it.status === "done" ? "Done" : "Submitted";
      return `<span class="pc-due done">${esc(t)}</span>`;
    }
    const d = due(it.due, now, rel);
    return `<span class="pc-due ${d.c}${it.dueBy === "mine" ? " mine" : ""}" title="${esc(d.abs + (it.dueBy === "mine" ? " · your date" : it.dueBy === "app" ? " · from " + it.app.name : ""))}">${esc(d.t)}</span>`;
  }
  function lcd(o) {
    return `<div class="pc-lcd${o.cls ? " " + o.cls : ""}"${o.k ? ` data-k="${esc(o.k)}"` : ""}>${o.label ? `<span class="pc-ll">${esc(o.label)}</span>` : ""}<span class="pc-ln" data-cd="${o.until || ""}">${esc(o.num)}</span>${o.sub ? `<span class="pc-ls">${esc(o.sub)}</span>` : ""}${o.bar != null ? `<span class="pc-lbar"><i style="width:${Math.round(o.bar * 100)}%"></i></span>` : ""}</div>`;
  }
  const band = (title, icon, right) => `<div class="pc-band"><span class="pc-bt">${icon ? ic(icon) : ""}<span>${esc(title)}</span></span><span class="pc-sp"></span>${right || ""}</div>`;
  const module = (title, icon, body, o = {}) => `<section class="pc-mod${o.cls ? " " + o.cls : ""}"${o.id ? ` id="${o.id}"` : ""}>${band(title, icon, o.right)}<div class="pc-mb">${body}</div></section>`;

  /** One work row: check, title over its class and facts, due pill, menu. `o.time` ("time" | "late") leads it with its
      due time instead of the pill (the agenda's days); `o.compact` puts it on one line (undated and done work). */
  function row(it, v, o = {}) {
    const now = v.now, c = it.courseObj;
    const meta = [];
    if (!o.noCourse) meta.push(c || !it.courseText ? cchip(c) : `<span class="pc-cchip none">${esc(it.courseText)}</span>`);
    // an assignment is the usual thing, so only the other kinds are named; exams stand out
    if (it.kind === "exam") meta.push(`<span class="pc-tag exam">${ic("exams")}Exam</span>`);
    else if (it.kind !== "assignment") meta.push(`<span>${esc(PC.work.KIND_NAME[it.kind] || "Work")}</span>`);
    if (it.points) meta.push(`<span>${esc(it.partial ? `${+it.score.toFixed(2)}/${plural(it.points, "pt")} so far` : plural(it.points, "pt"))}</span>`);
    if (it.unlock && it.unlock > now) meta.push(`<span>Opens ${esc(PC.u.day(it.unlock, now))}</span>`);
    const tags = [];
    if (it.isNew) tags.push(`<span class="pc-tag new">New</span>`);
    if (it.newGrade) tags.push(`<span class="pc-tag grade">New grade</span>`);
    if (it.status === "missing") tags.push(`<span class="pc-tag bad">Missing</span>`);
    if (it.pri) tags.push(`<span class="pc-tag pri">${ic("flag")}Priority</span>`);
    if (it.app && (it.dueBy === "app" || it.src === "webwork" || it.src === "gradescope")) tags.push(`<a class="pc-tag app" href="${esc(it.app.url)}" target="_blank" rel="noopener" title="${esc(it.dueBy === "app" ? `Canvas has no due date; this one is from ${it.app.name}` : `On ${it.app.name}, not on Canvas`)}">${ic("ext")}${esc(it.app.name)}</a>`);
    if (it.guess && it.due == null) tags.push(`<button type="button" class="pc-tag guess" data-act="useGuess" data-id="${esc(it.key)}" title="Found in the description. Click to use it as your due date.">Says ${esc(PC.u.day(it.guess, now))} ${esc(PC.u.time(it.guess))}</button>`);
    const check = `<button type="button" class="pc-chk${it.open ? "" : " on"}" data-act="${it.open ? "done" : "undone"}" data-id="${esc(it.key)}" title="${it.open ? "Mark done" : "Mark not done"}" aria-label="${it.open ? "Mark done" : "Mark not done"}"${!it.open && !it.flags.done && !it.task && it.status !== "done" ? " disabled" : ""}>${ic("check")}</button>`;
    const title = it.url ? `<a class="pc-rt" href="${esc(it.url)}" data-act="openItem" data-id="${esc(it.key)}">${esc(it.title)}</a>` : `<span class="pc-rt">${esc(it.title)}</span>`;
    const cls = `pc-row${o.time ? " pc-ar" : o.compact ? " pc-cr" : ""}${it.open ? "" : " done"}${it.overdue ? " over" : ""}${it.isNew ? " fresh" : ""}`;
    const due = o.time ? "" : `<span class="pc-rd">${o.compact && it.open ? "" : pill(it, now, o.rel !== false)}</span>`;
    return `<div class="${cls}" data-k="${esc(it.key)}" style="${kc(c)}">${check}${o.time ? when(it, now, o.time === "late", o.rel) : ""}
      <span class="pc-rm">${title}<span class="pc-meta">${meta.join("")}${tags.join("")}</span></span>${due}
      ${key("", { icon: "menu", cls: "ghost sm pc-rmenu", act: "itemMenu", id: it.key, aria: "More for this item" })}</div>`;
  }
  /** An agenda row's lead: its due time (with "in 5h" under it within a day), or how late it is and the day it was due. */
  function when(it, now, late, rel) {
    const d = it.due - now, at = new Date(it.due);
    const abs = `${PC.u.day(it.due, now)} ${PC.u.time(it.due)}${it.dueBy === "mine" ? " · your date" : it.dueBy === "app" ? " · from " + it.app.name : ""}`;
    if (late) return `<span class="pc-tm over" title="${esc(abs)}">${esc(PC.u.span(d))} late<small>${esc(PC.u.MNM[at.getMonth()] + " " + at.getDate())}</small></span>`;
    const c = d < 3 * PC.u.HR ? " hot" : d < PC.u.DAY ? " soon" : "";
    return `<span class="pc-tm${c}${it.dueBy === "mine" ? " mine" : ""}" title="${esc(abs)}">${esc(PC.u.time(it.due))}${c && rel !== false ? `<small>in ${esc(PC.u.span(d))}</small>` : ""}</span>`;
  }

  /**
   * To do as a calendar (PC.work.days, laid out by PC.work.weeks): late work first, then the weeks from this one on,
   * Sunday to Saturday, each day's work in its square led by its due time; undated work follows, one line each and
   * never left out, then done work (`o.showDone`). Where the list is narrow (the drawer, the popup) the weeks become a
   * column of the days that have work, each a date tile beside its rows (kit.css). `o.weeks` caps the weeks and
   * `o.rows` the undated or done rows until `o.open` has "weeks", "none" or "done" (the keys are data-act="more" with
   * that data-v); `o.today` keeps the calendar when nothing is dated; `o.rel` adds "in 5h" under a time within a day.
   */
  function agenda(items, v, o = {}) {
    const gs = PC.work.days(items, v.now, { today: o.today, showDone: o.showDone }), open = o.open || {};
    if (!gs.some((g) => g.items.length)) return o.empty || empty("Nothing due", "No open work in these classes. Ghosted and hidden classes are left out.");
    const byDay = new Map(gs.filter((g) => g.day != null).map((g) => [g.day, g]));
    const out = gs.filter((g) => g.id === "over").map((g) => day(g, v, o));
    if (byDay.size) out.push(cal(byDay, v, o, open));
    out.push(...gs.filter((g) => g.id === "none" || g.id === "done").map((g) => flat(g, v, o, open)));
    return `<div class="pc-agenda">${out.join("")}</div>`;
  }
  function cal(byDay, v, o, open) {
    const now = v.now, today = PC.u.sod(now), all = PC.work.weeks([...byDay.keys()], now);
    const ws = o.weeks && !open.weeks ? all.slice(0, o.weeks) : all;
    const rest = all.slice(ws.length).flat().reduce((n, d) => n + (byDay.has(d) ? byDay.get(d).items.length : 0), 0);
    // a square names its month on the 1st and in the first square
    const weeks = ws.map((w) => `<div class="pc-calw">${w.map((d) => day(byDay.get(d) || { id: "d" + d, day: d, items: [] }, v, o,
      (d < today ? " past" : "") + (d === ws[0][0] || new Date(d).getDate() === 1 ? " m1" : ""))).join("")}</div>`).join("");
    return `<div class="pc-cal"><div class="pc-calh" aria-hidden="true">${PC.u.DNM.map((n) => `<span>${n}</span>`).join("")}</div>${weeks}</div>`
      + (rest ? `<button type="button" class="pc-more pc-amore" data-act="more" data-v="weeks">${esc(plural(all.length - ws.length, "more week"))} · ${esc(plural(rest, "item"))}</button>` : "");
  }
  function day(g, v, o, cls = "") {
    const now = v.now, late = g.id === "over", n = g.items.length, d = late ? null : new Date(g.day);
    const diff = late ? 0 : Math.round((g.day - PC.u.sod(now)) / PC.u.DAY);
    const tile = late ? ["Late", n, n === 1 ? "item" : "items"] : [diff === 0 ? "Today" : diff === 1 ? "Tmrw" : PC.u.DNM[d.getDay()], d.getDate(), PC.u.MNM[d.getMonth()]];
    const label = late ? `Late · ${plural(n, "item")}` : `${diff === 0 ? "Today" : diff === 1 ? "Tomorrow" : PC.u.DNM[d.getDay()]}, ${tile[2]} ${tile[1]} · ${n ? plural(n, "item") + " due" : "nothing due"}`;
    const rows = n ? g.items.map((it) => row(it, v, { time: late ? "late" : "time", rel: o.rel, noCourse: o.noCourse })).join("") : diff === 0 ? `<p class="pc-dnone">Nothing due today</p>` : "";
    return `<section class="pc-day${late ? " over" : diff === 0 ? " today" : diff === 1 ? " tmrw" : ""}${n ? "" : " none"}${cls}" aria-label="${esc(label)}">
      <span class="pc-dt" title="${esc(label)}"><span>${esc(tile[0])}</span><b>${esc(tile[1])}</b><span>${esc(tile[2])}</span></span><div class="pc-dayb">${rows}</div></section>`;
  }
  function flat(g, v, o, open) {
    const rows = o.rows && !open[g.id] ? g.items.slice(0, o.rows) : g.items;
    return `<section class="pc-flat${g.id === "none" ? " nodate" : ""}" aria-label="${esc(g.label)}"><div class="pc-grp${g.id === "none" ? " nodate" : ""}"><span>${esc(g.label)}</span><span class="pc-gc">${g.items.length}</span></div>
      <div class="pc-flatb">${rows.map((it) => row(it, v, { compact: true, rel: o.rel, noCourse: o.noCourse })).join("")}</div>
      ${rows.length < g.items.length ? `<button type="button" class="pc-more" data-act="more" data-v="${g.id}">Show all ${g.items.length}</button>` : ""}</section>`;
  }
  const empty = (bold, line, actions) => `<div class="pc-empty">${ic("done", "big")}<b>${esc(bold)}</b><span>${esc(line)}</span>${actions || ""}</div>`;

  const NOTHING_SOON = ["Nothing due this week", "Work shows up here a week before it's due, by Canvas's date or your own."];
  /** Do first, the next few: open work due within a week, soonest first (PC.work.rank), as cards in a strip, each
      with its place, a countdown, the facts and keys. */
  function tops(list, v) {
    if (!list.length) return empty(...NOTHING_SOON);
    const now = v.now;
    return `<div class="pc-tops pc-strip">${list.map((it, i) => {
      const d = it.due - now, why = PC.work.reasons(it, now).slice(1);
      return `<article class="pc-topc" data-k="top:${esc(it.key)}" style="${kc(it.courseObj)}">
        <div class="pc-toph"><span class="pc-rank" title="Number ${i + 1} in Do first">${i + 1}</span>${lcd({ label: d < 0 ? "Late by" : "Due in", num: countdown(Math.abs(d)), until: it.due, cls: d < 0 ? "bad" : d < 3 * PC.u.HR ? "hot" : "" })}</div>
        ${it.url ? `<a class="pc-tt" href="${esc(it.url)}" data-act="openItem" data-id="${esc(it.key)}">${esc(it.title)}</a>` : `<span class="pc-tt">${esc(it.title)}</span>`}
        <div class="pc-meta">${cchip(it.courseObj)}<span>${esc(`${PC.u.day(it.due, now)} ${PC.u.time(it.due)}`)}</span></div>
        ${why.length ? `<div class="pc-whys">${why.map((r) => `<span class="pc-why">${esc(r)}</span>`).join("")}</div>` : ""}
        <div class="pc-acts">${it.url ? key("Open", { icon: "go", cls: "primary sm", href: it.url, act: "openItem", id: it.key }) : ""}${key("Done", { icon: "check", cls: "sm", act: "done", id: it.key })}</div></article>`;
    }).join("")}</div>`;
  }

  /** Go to (PC.work.gotos): big keys for the pages you open most and a few suggestions, each in its class's colour;
      ones that leave Canvas open in a new tab and say so in a corner. */
  function tiles(list) {
    return `<nav class="pc-tiles" aria-label="Go to">${list.map((t) => `<a class="pc-key pc-tile" href="${esc(t.url)}"${t.ext ? ' target="_blank" rel="noopener"' : ""} style="${t.c ? kc(t.c) : "--kc: var(--pc-accent)"}" title="${esc(`${t.label} · ${t.sub} · ${t.why}`)}">${ic(t.icon, "pc-tic")}${t.ext ? ic("ext", "pc-tx") : ""}<span class="pc-tl">${esc(t.label)}</span><span class="pc-ts">${esc(t.sub)}</span></a>`).join("")}</nav>`;
  }

  /** The Do first card: the work due soonest (PC.work.rank), a countdown, the facts. */
  function hero(it, v, o = {}) {
    if (!it) return empty(...NOTHING_SOON);
    const now = v.now, d = it.due - now;
    const cls = d < 0 ? "bad" : d < 3 * PC.u.HR ? "hot" : "";
    const chips = PC.work.reasons(it, now).map((r) => `<span class="pc-why">${esc(r)}</span>`).join("");
    return `<div class="pc-hero" data-k="hero:${esc(it.key)}" style="${kc(it.courseObj)}">
      ${lcd({ label: d < 0 ? "Late by" : "Due in", num: countdown(Math.abs(d)), until: it.due, cls, sub: `${PC.u.day(it.due, now)} ${PC.u.time(it.due)}` })}
      <div class="pc-hm"><div class="pc-ht">${esc(it.title)}</div><div class="pc-meta">${cchip(it.courseObj)}<span>${esc(PC.work.KIND_NAME[it.kind] || "Work")}</span></div><div class="pc-whys">${chips}</div>
      <div class="pc-acts">${it.url ? key("Open", { icon: "go", cls: "primary", href: it.url, act: "openItem", id: it.key }) : ""}${key("Done", { icon: "check", act: "done", id: it.key })}${o.next ? key("Next", { icon: "next", cls: "ghost", act: "skip", id: it.key }) : ""}</div></div></div>`;
  }

  // ── popover, toast ──
  let popEl = null;
  function layer() {
    let r = doc.querySelector(".pc-layer");
    if (!r) { r = doc.createElement("div"); r.className = "pc-layer pc-root"; doc.body.appendChild(r); }
    return r;
  }
  function closePop() { if (popEl) { popEl.remove(); popEl = null; } }
  const DT = 'input[type="date"], input[type="time"], input[type="datetime-local"]';
  /** A popover by `anchor`; `onAct(act, el, pop)` gets its data-act clicks. */
  function pop(anchor, html, onAct, o = {}) {
    closePop();
    const p = doc.createElement("div");
    p.className = "pc-pop" + (o.cls ? " " + o.cls : "");
    p.setAttribute("role", "dialog");
    p.innerHTML = html;
    layer().appendChild(p);
    const r = anchor.getBoundingClientRect(), w = p.offsetWidth, h = p.offsetHeight;
    let x = Math.min(g.innerWidth - w - 8, Math.max(8, r.left + (o.right ? r.width - w : 0))), y = r.bottom + 6;
    if (y + h > g.innerHeight - 8) y = Math.max(8, r.top - h - 6);
    p.style.left = x + "px"; p.style.top = y + "px";
    p.addEventListener("click", (e) => { const a = e.target.closest("[data-act]"); if (a && onAct) onAct(a.dataset.act, a, p); });
    p.addEventListener("keydown", (e) => { if (e.key === "Escape") { closePop(); anchor.focus && anchor.focus(); } else if (e.target.matches(DT)) p.dataset.picking = "1"; });
    p.addEventListener("pointerdown", (e) => { if (e.target.matches(DT)) p.dataset.picking = "1"; });
    const f = p.querySelector("input, textarea, select, button"); if (f) f.focus();
    popEl = p;
    setTimeout(() => doc.addEventListener("mousedown", function off(e) {
      if (popEl && popEl.contains(e.target)) return;
      // a click away from a date or time field you're setting (and its calendar) commits it and keeps the popover open
      const f = doc.activeElement;
      if (popEl && popEl.dataset.picking && popEl.contains(f) && f.matches(DT)) { delete popEl.dataset.picking; f.blur(); return; }
      closePop(); doc.removeEventListener("mousedown", off, true);
    }, true), 0);
    return p;
  }
  function toast(msg, o = {}) {
    const box = layer().querySelector(".pc-toasts") || layer().appendChild(Object.assign(doc.createElement("div"), { className: "pc-toasts" }));
    const t = doc.createElement("div");
    t.className = "pc-toast";
    t.innerHTML = `<span>${esc(msg)}</span>${o.undo ? key("Undo", { cls: "ghost sm", act: "undo" }) : ""}${o.action ? key(o.action, { cls: "ghost sm", act: "go" }) : ""}`;
    t.addEventListener("click", (e) => { const a = e.target.closest("[data-act]"); if (!a) return; if (a.dataset.act === "undo" && o.undo) o.undo(); if (a.dataset.act === "go" && o.onAction) o.onAction(); t.remove(); });
    box.appendChild(t);
    while (box.children.length > 4) box.firstChild.remove();
    setTimeout(() => t.remove(), o.ms || 5200);
  }

  // ── shared actions ──
  const flagKey = (v, k) => v.host + "/" + k;
  const findItem = (v, k) => v.items.find((i) => i.key === k) || (v.hidden || []).find((i) => i.key === k);
  async function setTask(id, patch) {
    const tasks = await PC.store.local("tasks", []); const t = tasks.find((x) => x.id === id);
    if (t) { Object.assign(t, patch); await PC.store.setLocal("tasks", patch.deleted ? tasks.filter((x) => x.id !== id) : tasks); }
  }
  /** Item actions every surface shares. Returns true when handled. */
  async function act(a, el, v) {
    const id = el.dataset.id, it = id && findItem(v, id);
    if (a === "done" || a === "undone") {
      if (!it) return true;
      const on = a === "done";
      if (it.task) await setTask(it.id, { done: on });
      else await PC.store.itemFlag(flagKey(v, it.key), { done: on ? Date.now() : null, seen: Date.now() });
      if (on) toast(`Done · ${it.title}`, { undo: () => act("undone", el, v) });
      return true;
    }
    if (a === "hideItem") { await PC.store.itemFlag(flagKey(v, id), { hide: Date.now() }); closePop(); toast(`Hidden · ${it ? it.title : "item"}`, { undo: () => PC.store.itemFlag(flagKey(v, id), { hide: null }) }); return true; }
    if (a === "unhideItem") { await PC.store.itemFlag(flagKey(v, id), { hide: null }); return true; }
    if (a === "useGuess" && it && it.guess) { await PC.store.itemFlag(flagKey(v, it.key), { due: new Date(it.guess).toISOString() }); toast("Due date set from the description"); return true; }
    if (a === "seen" && it) { await PC.store.itemFlag(flagKey(v, it.key), { seen: Date.now(), gradeSeen: Date.now() }); closePop(); return true; }
    if (a === "openItem" && it && !it.task) { PC.store.itemFlag(flagKey(v, it.key), { seen: Date.now(), gradeSeen: it.newGrade ? Date.now() : undefined }); return false; }
    if (a === "itemMenu" && it) { itemMenu(el, it, v); return true; }
    if (a === "seenAll") { await PC.store.setLocal("seenAt", Date.now()); toast("Everything marked seen"); return true; }
    if (a === "courseMode") { await PC.store.setCourseFlag(v.host + "/" + id, { mode: el.dataset.v === "auto" ? null : el.dataset.v }); return true; }
    return false;
  }
  const local = (t) => { const d = new Date(t - new Date(t).getTimezoneOffset() * 60e3); return d.toISOString().slice(0, 16); };
  /** A due date as a day field and a time field. The time starts at 11:59 PM, so picking a day is enough. */
  function dueFields(t, f) {
    const s = t != null ? local(t) : "";
    return `<span class="pc-when"><input type="date" value="${esc(s.slice(0, 10))}" data-f="${f}-d" aria-label="Due day"><input type="time" value="${esc(s.slice(11, 16) || "23:59")}" data-f="${f}-t" aria-label="Due time"></span>`;
  }
  /** The ISO time in a dueFields pair, or null while there's no day. */
  function dueValue(box, f) {
    const d = box.querySelector(`[data-f="${f}-d"]`).value, t = box.querySelector(`[data-f="${f}-t"]`).value || "23:59";
    return d ? new Date(`${d}T${t}`).toISOString() : null;
  }
  function itemMenu(anchor, it, v) {
    const mine = () => it.task || it.dueBy === "mine";
    const html = `<div class="pc-pt">${esc(it.title)}</div>
      ${it.url ? key("Open in Canvas", { icon: "go", href: it.url, cls: "wide" }) : ""}
      <div class="pc-field"><span>${it.dueBy === "canvas" ? "Your own due date (overrides Canvas)" : "Your due date"}</span>${dueFields(it.due != null ? it.due : it.guess, "due")}</div>
      <div class="pc-row2"><span class="pc-saved" aria-live="polite">${mine() && it.due != null ? "Saved as you change it" : "Pick a day; it saves as you change it"}</span>${key("Clear my date", { act: "clearDue", cls: "ghost sm", disabled: !(mine() && it.due != null) })}</div>
      ${it.isNew || it.newGrade ? key("Mark seen", { icon: "eye", act: "seen", id: it.key, cls: "wide ghost" }) : ""}
      ${it.task ? key("Delete task", { icon: "trash", act: "delTask", cls: "wide ghost" }) : key("Hide this item", { icon: "eyeoff", act: "hideItem", id: it.key, cls: "wide ghost" })}`;
    let last = null;
    const write = async (iso) => {
      if (iso === last) return;
      last = iso;
      if (it.task) await setTask(it.id, { due: iso }); else await PC.store.itemFlag(flagKey(v, it.key), { due: iso });
    };
    const p = pop(anchor, html, async (a, el, p2) => {
      if (a === "clearDue") {
        await write(null); closePop(); toast("Your date cleared");
      } else if (a === "delTask") { await setTask(it.id, { deleted: true }); closePop(); }
      else act(a, el, v);
    }, { right: true });
    const save = PC.u.debounce(async () => {
      const iso = dueValue(p, "due"); if (!iso) return;
      await write(iso);
      p.querySelector(".pc-saved").textContent = `Saved · ${PC.u.day(Date.parse(iso), Date.now())} ${PC.u.time(Date.parse(iso))}`;
      const clr = p.querySelector('[data-act="clearDue"]'); if (clr) clr.disabled = false;
    }, 250);
    p.addEventListener("input", (e) => { if (e.target.type === "date" || e.target.type === "time") save(); });
    p.addEventListener("change", (e) => { if (e.target.type === "date" || e.target.type === "time") save(); });
  }

  /** A course's settings: mode, nickname, colour, units, notes, links. */
  function courseMenu(anchor, c, v) {
    const f = c.flags || {}, links = f.links || [];
    const modes = [["normal", "Normal"], ["priority", "Priority"], ["ghost", "Ghost"], ["hidden", "Hide"]];
    const html = `<div class="pc-pt">${dot(c)}${esc(c.name)}</div>
      <div class="pc-seg">${modes.map(([m, l]) => chip(l, { act: "mode", v: m, on: c.mode === m, icon: { priority: "flag", ghost: "ghost", hidden: "eyeoff" }[m] })).join("")}</div>
      <p class="pc-note">${c.mode === "ghost" ? (c.autoMode ? "Ghosted because its term ended. " : "") + "Still reachable, but its work stays out of lists, counts and reminders." : c.mode === "hidden" ? "Gone from the dock, the dashboard and every list." : c.mode === "priority" ? "First in the dock, and first in Do first among work due at the same time." : "Shown everywhere."}${!c.autoMode ? " " + key("Back to automatic", { act: "auto", cls: "ghost sm" }) : ""}</p>
      <label class="pc-field"><span>Nickname</span><input type="text" maxlength="14" value="${esc(f.nick || "")}" placeholder="${esc(PC.work.short(c, {}))}" data-f="nick"></label>
      <div class="pc-field"><span>Colour</span><div class="pc-colors">${[1, 2, 3, 4, 5, 6].map((n) => `<button type="button" class="pc-cdot${c.color === n ? " on" : ""}" data-act="color" data-v="${n}" style="--kc: var(--pc-k${n})" aria-label="Colour ${n}"></button>`).join("")}</div></div>
      <div class="pc-field"><span>Icon</span><div class="pc-icpick" style="${kc(c)}">${[""].concat(PC.CLASS_ICONS).map((n) => `<button type="button" class="${(c.icon || "") === n ? "on" : ""}" data-act="icon" data-v="${n}" aria-label="${n ? "Icon: " + n : "No icon (colour dot)"}" title="${n ? cap(n) : "Colour dot"}">${n ? ic(n) : '<span class="pc-dot"></span>'}</button>`).join("")}</div></div>
      ${c.mode === "priority" || c.mode === "normal" ? `<div class="pc-field"><span>Place in the dock</span><div class="pc-row2" style="margin:0">${key("Move to front", { icon: "prev", act: "move", v: "front", cls: "sm" })}${key("Move left", { icon: "prev", act: "move", v: "-1", cls: "sm" })}${key("Move right", { icon: "next", act: "move", v: "1", cls: "sm" })}<span class="pc-note" style="margin:0">or drag its key</span></div></div>` : ""}
      <label class="pc-field"><span>Units (for GPA)</span><input type="number" min="0" max="12" step="0.5" value="${esc(f.units != null ? f.units : "")}" placeholder="${esc(c.units)}" data-f="units"></label>
      <label class="pc-field"><span>Notes</span><textarea rows="3" data-f="notes" placeholder="Office hours, TA email, what the syllabus says about late work">${esc(f.notes || "")}</textarea></label>
      <div class="pc-field"><span>Your links</span>${[0, 1, 2].map((i) => `<div class="pc-link2"><input type="text" placeholder="Label" value="${esc((links[i] || {}).label || "")}" data-l="${i}" data-p="label"><input type="url" placeholder="https://" value="${esc((links[i] || {}).url || "")}" data-l="${i}" data-p="url"></div>`).join("")}</div>
      <div class="pc-row2">${key("Save", { act: "save", cls: "primary sm" })}${key("Close", { act: "close", cls: "ghost sm" })}</div>`;
    const k = v.host + "/" + c.id;
    let order = null;
    pop(anchor, html, async (a, el, p) => {
      if (a === "mode") { await PC.store.setCourseFlag(k, { mode: el.dataset.v }); p.querySelectorAll('[data-act="mode"]').forEach((b) => b.classList.toggle("on", b === el)); toast(`${c.label} · ${el.textContent.trim()}`); }
      else if (a === "auto") { await PC.store.setCourseFlag(k, { mode: null }); closePop(); }
      else if (a === "color") { await PC.store.setCourseFlag(k, { color: +el.dataset.v }); p.querySelectorAll(".pc-cdot").forEach((b) => b.classList.toggle("on", b === el)); p.querySelector(".pc-icpick").style.cssText = `--kc: var(--pc-k${+el.dataset.v})`; }
      else if (a === "icon") { await PC.store.setCourseFlag(k, { icon: el.dataset.v || null }); p.querySelectorAll('[data-act="icon"]').forEach((b) => b.classList.toggle("on", b === el)); }
      else if (a === "move") {
        // `v` is the view from when the menu opened, so later moves go from the order this menu last saved
        const ids = order || PC.work.docked(v.courses).map((x) => x.id), i = ids.indexOf(c.id), j = el.dataset.v === "front" ? 0 : i + +el.dataset.v;
        if (i < 0 || j < 0 || j >= ids.length) return;
        ids.splice(i, 1); ids.splice(j, 0, c.id); order = ids; await arrange(v, ids);
      }
      else if (a === "save") {
        const val = (f2) => p.querySelector(`[data-f="${f2}"]`).value.trim();
        const L = [0, 1, 2].map((i) => ({ label: p.querySelector(`[data-l="${i}"][data-p="label"]`).value.trim(), url: p.querySelector(`[data-l="${i}"][data-p="url"]`).value.trim() })).filter((l) => /^https?:\/\//.test(l.url));
        await PC.store.setCourseFlag(k, { nick: val("nick") || null, units: val("units") === "" ? null : +val("units"), notes: val("notes") || null, links: L.length ? L : null });
        closePop(); toast("Saved");
      } else if (a === "close") closePop();
    }, o_right(anchor));
  }
  const o_right = (anchor) => ({ right: anchor.getBoundingClientRect().left > g.innerWidth / 2, cls: "wide" });
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  /** Save the dock's order: `ids` are the docked classes, left to right. */
  function arrange(v, ids) {
    return PC.store.setCourseFlags(Object.fromEntries(ids.map((id, i) => [v.host + "/" + id, { pos: i }])));
  }

  // ── palette (Ctrl+K): classes, their pages, work, commands ──
  const SECTIONS = [["", "Home"], ["/assignments", "Assignments"], ["/modules", "Modules"], ["/grades", "Grades"], ["/announcements", "Announcements"], ["/discussion_topics", "Discussions"],
    ["/files", "Files"], ["/assignments/syllabus", "Syllabus"], ["/quizzes", "Quizzes"], ["/pages", "Pages"], ["/users", "People"]];
  function palette(v, commands, onPick) {
    const entries = [];
    const live = v.courses.filter((c) => c.mode !== "hidden");
    for (const c of live) {
      entries.push({ t: c.name, sub: c.label + (c.mode === "ghost" ? " · ghosted" : ""), url: c.url, c, w: c.mode === "priority" ? 3 : c.mode === "ghost" ? 0.5 : 2, icon: "classes" });
      for (const [p, n] of SECTIONS.slice(1)) entries.push({ t: `${c.label} ${n.toLowerCase()}`, sub: c.name, url: c.url + p, c, w: c.mode === "ghost" ? 0.3 : 1, icon: "go" });
      for (const l of (c.flags.links || [])) entries.push({ t: `${c.label} ${l.label || "link"}`, sub: l.url, url: l.url, c, w: 1, icon: "ext" });
    }
    for (const it of v.items) entries.push({ t: it.title, sub: [it.courseObj && it.courseObj.label, PC.u.due(it.due, v.now).t].filter(Boolean).join(" · "), url: it.url, c: it.courseObj, w: it.open ? 1.5 : 0.4, icon: it.open ? "work" : "done" });
    for (const cmd of commands || []) entries.push(Object.assign({ w: 1.2, icon: cmd.icon || "go" }, cmd));
    const wrap = doc.createElement("div");
    wrap.className = "pc-scrim pc-root";
    wrap.innerHTML = `<div class="pc-pal" role="dialog" aria-label="Search classes and work"><div class="pc-palin">${ic("search")}<input type="text" placeholder="Jump to a class, a class page, an assignment or a command" spellcheck="false" autocomplete="off"><kbd>Esc</kbd></div><div class="pc-palres" role="listbox"></div></div>`;
    doc.body.appendChild(wrap);
    const input = wrap.querySelector("input"), res = wrap.querySelector(".pc-palres");
    let shown = [], sel = 0;
    const norm = (s) => String(s || "").toLowerCase();
    function score(e, q) {
      if (!q) return e.w * (e.icon === "classes" ? 2 : e.icon === "work" ? 1 : 0.01);
      const t = norm(e.t), words = q.split(/\s+/).filter(Boolean);
      let s = 0;
      for (const w of words) { const i = t.indexOf(w); if (i < 0 && norm(e.sub).indexOf(w) < 0) return 0; s += i === 0 ? 3 : i > 0 && t[i - 1] === " " ? 2 : 1; }
      return s * e.w;
    }
    function draw() {
      const q = norm(input.value.trim());
      shown = entries.map((e) => ({ e, s: score(e, q) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s).slice(0, 12).map((x) => x.e);
      sel = Math.min(sel, Math.max(0, shown.length - 1));
      res.innerHTML = shown.length ? shown.map((e, i) => `<div class="pc-palit${i === sel ? " on" : ""}" role="option" data-i="${i}" style="${kc(e.c)}">${ic(e.icon)}<span class="pc-palt"><b>${esc(e.t)}</b><span>${esc(e.sub || "")}</span></span>${e.c ? '<span class="pc-dot"></span>' : ""}</div>`).join("")
        : `<div class="pc-palnone">Nothing matches. Try a course number ("130a") or a page ("130a grades").</div>`;
    }
    function close() { wrap.remove(); }
    function pick(i, newTab) { const e = shown[i]; if (!e) return; close(); onPick(e, newTab); }
    input.addEventListener("input", () => { sel = 0; draw(); });
    input.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown") { sel = Math.min(shown.length - 1, sel + 1); draw(); e.preventDefault(); }
      else if (e.key === "ArrowUp") { sel = Math.max(0, sel - 1); draw(); e.preventDefault(); }
      else if (e.key === "Enter") { pick(sel, e.ctrlKey || e.metaKey); e.preventDefault(); }
      else if (e.key === "Escape") { close(); e.preventDefault(); }
    });
    res.addEventListener("mousemove", (e) => { const r = e.target.closest(".pc-palit"); if (r && +r.dataset.i !== sel) { sel = +r.dataset.i; draw(); } });
    res.addEventListener("click", (e) => { const r = e.target.closest(".pc-palit"); if (r) pick(+r.dataset.i, e.ctrlKey || e.metaKey); });
    wrap.addEventListener("mousedown", (e) => { if (e.target === wrap) close(); });
    draw(); input.focus();
    return close;
  }

  /** Tick every countdown LCD once a second. */
  function tick(root) {
    const now = Date.now();
    (root || doc).querySelectorAll("[data-cd]").forEach((el) => { const t = +el.dataset.cd; if (t) el.textContent = countdown(Math.abs(t - now)); });
  }

  /** Apply the theme to this page (and the fonts it needs): the one in effect, or `t` (the settings page's preview). */
  function theme(state, t) {
    t = t || PC.themes.pick(state.settings, PC.themes.BUILTIN.concat(state.themes || []));
    PC.themes.apply(t);
    let css = doc.getElementById("pc-theme-css");
    if (t.css) { if (!css) { css = doc.createElement("style"); css.id = "pc-theme-css"; (doc.head || doc.documentElement).appendChild(css); } css.textContent = PC.themes.safeCss(t.css); }
    else if (css) css.remove();
    if (t.look === "pocket" && !doc.getElementById("pc-fonts")) {
      const l = doc.createElement("link"); l.id = "pc-fonts"; l.rel = "stylesheet";
      l.href = "https://fonts.googleapis.com/css2?family=Doto:wght@600;800&family=Space+Grotesk:wght@400;500;600;700&family=Space+Mono:wght@400;700&display=swap";
      (doc.head || doc.documentElement).appendChild(l);
    }
    return t;
  }

  PC.kit = { key, chip, dot, mark, cchip, classChip, arrange, dueFields, dueValue, kc, pill, lcd, band, module, row, agenda, tops, tiles, empty, hero, pop, closePop, toast, act, itemMenu, courseMenu, palette, tick, theme, layer, SECTIONS };
})(globalThis);
