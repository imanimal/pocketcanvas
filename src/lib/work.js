/* PocketCanvas: the work model. Every assignment, quiz, discussion and to-do page from every class becomes one work
   item, so one list answers "what do I have", across classes, with or without a due date:

     { key, course, title, url, kind, due, dueBy: canvas | mine | null, guess, status, score, points, partial, isNew, newGrade, … }

   `partial`: WeBWorK work Canvas has a score for that isn't full marks yet. It stays to do (see inWebwork below).

   Course modes (flags, keyed `${host}/${id}`): normal · priority (first everywhere) · ghost (still
   reachable, faded, its work left out of lists and counts) · hidden (gone everywhere). Classes from terms that have
   ended are ghosted automatically unless you set a mode yourself.

   Item flags (keyed `${host}/${key}`): done (your own check, for work Canvas can't see), hide, due (your own date
   for work posted without one), seen. "New" = first seen after the last time you marked everything seen. */
(function (g) {
  const PC = (g.PC = g.PC || {});
  const { DAY, sod } = PC.u;

  const KIND_WORDS = [[/\b(midterm|final exam|final|exam|mt\d?)\b/i, "exam"], [/\bquiz\b/i, "quiz"], [/\blab\b/i, "lab"], [/\b(project|proj)\b/i, "project"], [/\b(reading|read)\b/i, "reading"]];
  const kindOf = (title, a) => { for (const [re, k] of KIND_WORDS) if (re.test(title)) return k; if (a && a.quiz) return "quiz"; if (a && a.discussion) return "discussion"; return "assignment"; };
  const KIND_NAME = { assignment: "Assignment", quiz: "Quiz", exam: "Exam", lab: "Lab", project: "Project", reading: "Reading", discussion: "Discussion", page: "Page", task: "Task" };

  /** "CMPSC 130A" from Canvas's course code (words up to the first one after the first that starts with a digit). */
  function code(c) {
    const words = String(c.code || c.name || "").replace(/[-_:]/g, " ").split(/\s+/).filter(Boolean);
    const i = words.findIndex((w, j) => j > 0 && /^\d/.test(w));
    return (i > 0 ? words.slice(0, i + 1) : words.slice(0, 2)).join(" ").toUpperCase();
  }
  /** The short label on a course key: your nickname, else the code if short, else its number ("130A"). */
  function short(c, flags) {
    const f = flags || {};
    if (f.nick) return f.nick;
    const k = code(c);
    if (k.length <= 9) return k;
    const num = k.split(" ").find((w) => /^\d/.test(w));
    return num || k.slice(0, 9);
  }

  // ── dates in assignment descriptions ("Due Friday, Nov 12 at 5pm", "due by 11/12") ──
  const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  function guessDue(text, ref) {
    const s = String(text || "");
    const re = /\b(?:due|deadline|submit(?:ted)? by|turn(?:ed)? in by|is due)\b[:\s]*(?:on |by |before )?([^\n]{0,60})/gi;
    let m;
    while ((m = re.exec(s))) {
      const t = m[1].toLowerCase();
      let mo = -1, d = 0, y = null;
      const a = t.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?/);
      const b = t.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
      if (a) { mo = MONTHS.indexOf(a[1]); d = +a[2]; y = a[3] ? +a[3] : null; }
      else if (b) { mo = +b[1] - 1; d = +b[2]; y = b[3] ? (+b[3] < 100 ? 2000 + +b[3] : +b[3]) : null; }
      if (mo < 0 || mo > 11 || d < 1 || d > 31) continue;
      let hh = 23, mm = 59;
      const tm = t.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)/) || (/\bnoon\b/.test(t) ? [0, "12", "00", "pm"] : /\bmidnight\b/.test(t) ? [0, "11", "59", "pm"] : null);
      if (tm) { hh = +tm[1] % 12 + (/^p/.test(tm[3]) ? 12 : 0); mm = tm[2] ? +tm[2] : 0; }
      const base = new Date(ref);
      let when = new Date(y || base.getFullYear(), mo, d, hh, mm).getTime();
      if (!y && when < ref - 60 * DAY) when = new Date(base.getFullYear() + 1, mo, d, hh, mm).getTime();
      return when;
    }
    return null;
  }

  const ended = (c, now) => c.concluded || (c.termEnd != null && c.termEnd < now - DAY);
  /** A course's mode: your choice, else ghost when its term has ended (with autoGhostPast), else normal. */
  function mode(c, flags, settings, now) {
    const f = flags || {};
    if (f.mode) return f.mode;
    return settings && settings.autoGhostPast && ended(c, now || Date.now()) ? "ghost" : "normal";
  }

  /** Raw cache → work items (before your flags). Planner to-dos that aren't assignments join in; duplicates drop. */
  function fromCache(cache) {
    if (!cache) return [];
    const out = [], byAssignment = new Set();
    for (const a of cache.assignments || []) {
      byAssignment.add(a.id);
      const kind = kindOf(a.title, a);
      const noSubmit = !a.types.length || a.types.every((t) => t === "none" || t === "on_paper" || t === "not_graded");
      const status = a.excused ? "excused" : a.state === "graded" && a.score != null ? "graded" : a.submittedAt || a.state === "submitted" || a.state === "pending_review" ? "submitted" : a.missing ? "missing" : "todo";
      out.push({ key: "a" + a.id, id: a.id, src: "assignment", course: a.course, title: a.title || "Untitled", url: a.url, kind, canvasDue: a.due, unlock: a.unlock, lock: a.lock,
        points: a.points, score: a.score, grade: a.grade, gradedAt: a.gradedAt, submittedAt: a.submittedAt, status, late: a.late, noSubmit, created: a.created, desc: a.desc, ww: a.ww, first: a.first });
    }
    for (const p of cache.planner || []) {
      if (p.type === "announcement" || p.type === "calendar_event" || p.type === "assessment_request") continue;
      if (p.assignment && byAssignment.has(p.assignment)) {
        // Canvas's own done mark (planner) and "new activity" ride along on the assignment
        const it = out.find((x) => x.id === p.assignment); if (it) { if (p.done) it.canvasDone = true; if (p.newActivity) it.activity = true; }
        continue;
      }
      if (p.type === "assignment" || p.type === "quiz") continue;
      const kind = p.type === "wiki_page" ? "page" : p.type === "discussion_topic" ? "discussion" : p.type === "planner_note" ? "task" : "assignment";
      out.push({ key: "p" + p.type + p.id, id: p.id, src: p.type, course: p.course, title: p.title || "Untitled", url: p.url, kind, canvasDue: p.date,
        status: p.done || p.submitted ? "submitted" : "todo", canvasDone: p.done, activity: p.newActivity, noSubmit: true, first: p.first });
    }
    return out;
  }

  const OPEN = (st) => st === "todo" || st === "missing";
  // WeBWorK sends Canvas a grade after every answer, so Canvas calls a set submitted as soon as you start it. Work that
  // lives in WeBWorK (Canvas launches it, or it matched a set) is done at full marks only (Collegiapp's pocketcanvas.rs too).
  const inWebwork = (w) => !!w.ww || !!(w.app && w.app.app === "webwork");
  const fullMarks = (w) => w.points > 0 && w.score != null && w.score >= w.points * 0.9995;

  /**
   * Your view of the work: flags applied, ghost and hidden classes left out (unless `includeAll`), your own tasks
   * added. Returns { items, courses } with each course's mode, short label and colour index.
   */
  function view(state, opts = {}) {
    const { cache, courseFlags = {}, itemFlags = {}, tasks = [], settings = {}, seenAt = 0 } = state; // state.apps: lib/apps.js
    const now = opts.now || Date.now(), host = cache ? cache.host : "";
    const courses = ((cache && cache.courses) || []).map((c, i) => {
      const f = courseFlags[host + "/" + c.id] || {};
      return Object.assign({}, c, { flags: f, mode: mode(c, f, settings, now), autoMode: !f.mode, label: short(c, f), codeText: code(c), color: f.color || (i % 6) + 1, icon: f.icon || null, units: f.units != null ? +f.units : +settings.defaultUnits || 4 });
    });
    const byId = Object.fromEntries(courses.map((c) => [c.id, c]));
    const items = [];
    const raw = fromCache(cache);
    if (PC.apps) PC.apps.merge(raw, cache, state.apps, courseFlags);
    for (const w of raw) {
      const c = byId[w.course];
      if (c && (c.mode === "hidden" || c.mode === "ghost") && !opts.includeAll) continue;
      const f = itemFlags[host + "/" + w.key] || {};
      if (f.hide && !opts.includeHidden) continue;
      const it = Object.assign({}, w, { flags: f, courseObj: c || null });
      // your date, else Canvas's, else the app's (lib/apps.js)
      it.due = f.due ? Date.parse(f.due) : w.canvasDue != null ? w.canvasDue : w.appDue != null ? w.appDue : null;
      it.dueBy = f.due ? "mine" : w.canvasDue != null ? "canvas" : w.appDue != null ? "app" : null;
      if (it.due == null && w.desc) { const gss = guessDue(w.desc, w.created || now); if (gss) it.guess = gss; }
      if ((it.status === "graded" || it.status === "submitted") && inWebwork(w) && !fullMarks(w)) { it.status = "todo"; it.partial = w.score != null; }
      if (f.done && OPEN(it.status)) it.status = "done";
      if (w.canvasDone && OPEN(it.status)) it.status = "done";
      // work with no submission (on paper, nothing to upload) stays open until you check it off
      it.open = OPEN(it.status);
      it.overdue = it.open && it.due != null && it.due < now;
      it.isNew = !!(seenAt && !f.seen && w.first && w.first > seenAt);
      it.newGrade = !!(w.gradedAt && seenAt && w.gradedAt > seenAt && !f.gradeSeen);
      it.pri = c && c.mode === "priority";
      items.push(it);
    }
    for (const t of tasks) {
      const c = byId[t.course];
      if (c && (c.mode === "hidden" || c.mode === "ghost") && !opts.includeAll) continue;
      const due = t.due ? Date.parse(t.due) : null;
      items.push({ key: "t" + t.id, id: t.id, src: "task", course: t.course || null, courseObj: c || null, title: t.title, url: t.url || null, kind: "task", due, dueBy: due ? "mine" : null,
        status: t.done ? "done" : "todo", open: !t.done, overdue: !t.done && due != null && due < now, flags: {}, pri: c && c.mode === "priority", task: true });
    }
    return { items, courses, byId, now, host };
  }

  /** Do first: open work due within `within` (a week), or that went late within it, soonest first. Only real dates
      count (yours, Canvas's or the app's); undated work and dates read from a description never rank. */
  const SOON = 7 * DAY;
  function rank(items, now, within = SOON) {
    return items.filter((i) => i.open && i.due != null && Math.abs(i.due - now) < within)
      .sort((a, b) => (a.due - b.due) || (!!b.pri - !!a.pri) || a.title.localeCompare(b.title));
  }
  /** What a Do first card says about its work: when it's due, then where the date comes from and the facts. */
  function reasons(it, now) {
    const r = [it.due < now ? PC.u.span(it.due - now) + " overdue" : "Due in " + PC.u.span(it.due - now)];
    if (it.dueBy === "mine") r.push("Your date");
    else if (it.dueBy === "app") r.push("Date from " + it.app.name);
    if (it.pri) r.push("Priority class");
    if (it.points) r.push(PC.u.plural(it.points, "pt"));
    if (it.status === "missing") r.push("Marked missing");
    return r;
  }

  /** The classes for the dock and class strips (priority and normal), in the order you dragged them into
      (flag `pos`); classes you haven't placed follow, priority first. */
  function docked(courses) {
    const at = (c) => (c.flags && c.flags.pos != null ? +c.flags.pos : Infinity);
    return courses.map((c, i) => ({ c, i })).filter((x) => x.c.mode === "priority" || x.c.mode === "normal")
      .sort((a, b) => (at(a.c) - at(b.c)) || ((b.c.mode === "priority") - (a.c.mode === "priority")) || (a.i - b.i)).map((x) => x.c);
  }

  // undated work: priority classes, then new, then what its description says, then by name; done work: latest first
  const undated = (a, b) => (b.pri - a.pri) || (b.isNew - a.isNew) || ((a.guess || 9e15) - (b.guess || 9e15)) || a.title.localeCompare(b.title);
  const lastDone = (a, b) => (b.due || 0) - (a.due || 0);

  /** The agenda, day by day (what Canvas's List View was): late work, then one group per day in due-time order
      ({ id: "d<start of day>", day }), then undated work (always), then done (with `showDone`). With `today`, today
      has its group even when nothing is due. */
  function days(items, now, opts = {}) {
    const late = [], by = new Map(), none = [], done = [];
    if (opts.today) by.set(sod(now), []);
    for (const it of items) {
      if (!it.open) done.push(it);
      else if (it.due == null) none.push(it);
      else if (it.due < now) late.push(it);
      else { const d = sod(it.due); if (!by.has(d)) by.set(d, []); by.get(d).push(it); }
    }
    const byTime = (a, b) => (a.due - b.due) || (b.pri - a.pri) || a.title.localeCompare(b.title);
    const out = [];
    if (late.length) out.push({ id: "over", label: "Late", items: late.sort(byTime) });
    for (const d of [...by.keys()].sort((a, b) => a - b)) out.push({ id: "d" + d, day: d, label: PC.u.day(d, now), items: by.get(d).sort(byTime) });
    if (none.length) out.push({ id: "none", label: "No due date", items: none.sort(undated) });
    if (done.length && opts.showDone) out.push({ id: "done", label: "Done", items: done.sort(lastDone) });
    return out;
  }
  /** The calendar's weeks, Sunday first, from this week through the one holding the last of `dayStarts`: each week is
      its seven days' starts. Days step by the calendar, not by 24 h, so a week across a clock change keeps its midnights. */
  function weeks(dayStarts, now) {
    const t = new Date(sod(now)), y = t.getFullYear(), m = t.getMonth(), d0 = t.getDate() - t.getDay();
    const last = Math.max(sod(now), ...dayStarts), out = [];
    do out.push([0, 1, 2, 3, 4, 5, 6].map((i) => new Date(y, m, d0 + out.length * 7 + i).getTime()));
    while (out[out.length - 1][6] < last);
    return out;
  }

  // ── Go to: the Canvas pages you open most, then suggestions ──
  // A class page counts by its section (or a tool in its menu); Calendar, Inbox and Grades count too. Class homes and
  // single pieces of work don't: the dock, the cards and the lists already reach them.
  // the class's own name for a page (its menu's) wins over these
  const PAGES = [[/^assignments\/syllabus$/, "book", "Syllabus"], [/^assignments$/, "work", "Assignments"], [/^modules$/, "all", "Modules"], [/^grades$/, "grade", "Grades"],
    [/^announcements$/, "announce", "Announcements"], [/^discussion_topics$/, "chat", "Discussions"], [/^files$/, "folder", "Files"], [/^quizzes$/, "exams", "Quizzes"],
    [/^pages$/, "note", "Pages"], [/^users$/, "person", "People"], [/^(external_tools|lti\/tool)\/\d+$/, "links", "Tool"]];
  const SITE = { "/calendar": ["Calendar", "week"], "/conversations": ["Inbox", "inbox"], "/grades": ["Grades", "grade"] };
  /** The Go to page a Canvas path is, or null: { path, course, icon, label }. */
  function page(pathname) {
    const p = String(pathname || "").replace(/\/+$/, ""), m = p.match(/^\/courses\/(\d+)\/(.+)$/);
    if (m) { const pg = PAGES.find(([re]) => re.test(m[2])); return pg ? { path: p, course: m[1], icon: pg[1], label: pg[2] } : null; }
    return SITE[p] ? { path: p, course: null, icon: SITE[p][1], label: SITE[p][0] } : null;
  }
  /** One more visit to a Go to page in a site's counts ({ path: [visits, at, label] }), counted and faded the way the
      menu's tabs are (tabVisit); null when it was counted in the last 10 minutes. Pages that have faded out drop. */
  function pageVisit(use, path, label, now) {
    const next = tabVisit(use || {}, path, now);
    if (!next) return null;
    next[path] = next[path].concat(label || (use && use[path] && use[path][2]) || "");
    for (const k of Object.keys(next)) if (tabUses(next[k], now) < 0.1) delete next[k];
    return next;
  }
  /**
   * Go to's tiles: the pages you open most (`visits`, a site's pageVisit counts), then suggestions until there are
   * `n`: each class's WeBWorK or Gradescope (`apps`, PC.apps.summary), your own class links, Calendar, Inbox and
   * Grades. A page opened once ranks under the suggestions; twice, over them. Ghosted and hidden classes are left out.
   * Tiles: { url, label, sub, icon, c (the class or null), ext (opens in a new tab), why }.
   */
  function gotos(visits, v, apps, n = 8) {
    const live = (id) => { const c = v.byId[id]; return c && (c.mode === "normal" || c.mode === "priority") ? c : null; };
    const origin = "https://" + v.host, cand = [];
    for (const [p, u] of Object.entries(visits || {})) {
      const pg = page(p), c = pg && pg.course ? live(pg.course) : null;
      if (!pg || (pg.course && !c)) continue;
      cand.push({ url: origin + pg.path, label: u[2] || pg.label || "Page", sub: c ? c.label : "Canvas", icon: pg.icon, c, why: u[0] >= 2 ? "You open it often" : "You opened it lately", s: tabUses(u, v.now) });
    }
    for (const a of apps || []) {
      const c = a.course && live(a.course.id);
      if (c) cand.push({ url: a.launch || a.home, label: a.app, sub: c.label, icon: "work", c, ext: true, why: "Suggested: where its homework is", s: 1.6 });
    }
    for (const c of v.courses) if (live(c.id)) for (const l of (c.flags && c.flags.links) || []) cand.push({ url: l.url, label: l.label || "Link", sub: c.label, icon: "links", c, ext: true, why: "Your link", s: 1.5 });
    Object.entries(SITE).forEach(([p, [label, icon]], i) => cand.push({ url: origin + p, label, sub: "Canvas", icon, c: null, why: "Suggested", s: 1.2 - i / 10 }));
    // a page you open often outranks its suggestion (a class's Gradescope from its menu, say), and a page shows once
    const out = [], have = new Set();
    for (const t of cand.sort((a, b) => b.s - a.s)) {
      const k = (t.c ? t.c.id : "") + "|" + t.label.toLowerCase();
      if (have.has(k) || have.has(t.url)) continue;
      have.add(k); have.add(t.url); delete t.s; out.push(t);
      if (out.length >= n) break;
    }
    return out;
  }

  // ── grades ──
  function letter(pct, scale) { for (const [min, pts, l] of scale) if (pct >= min) return { l, pts }; return { l: "F", pts: 0 }; }
  /** Term GPA from current scores; `counts(c)` says which classes count. Cumulative with a prior GPA and units. */
  function gpa(courses, settings, counts) {
    let pts = 0, units = 0; const rows = [];
    for (const c of courses) {
      if (c.score == null || !counts(c)) continue;
      const L = letter(c.score, settings.gpaScale || PC.DEFAULTS.gpaScale), u = c.units || 0;
      rows.push({ c, letter: L.l, pts: L.pts, units: u }); pts += L.pts * u; units += u;
    }
    const term = units ? pts / units : null;
    const pg = parseFloat(settings.priorGpa), pu = parseFloat(settings.priorUnits);
    const cum = term != null && pg >= 0 && pu > 0 ? (pts + pg * pu) / (units + pu) : null;
    return { rows, term, cum, units };
  }
  /** Score needed on a final worth `w`% to finish at `target`% from `current`%. */
  const needOnFinal = (current, target, w) => (w > 0 && w < 100 ? (target - current * (1 - w / 100)) / (w / 100) : null);

  /** Mark first-seen times on fresh cache items (so "New" can be computed). The very first load counts as old, and
      so does a class read for the first time (un-ghosting one doesn't flag its whole history as new). */
  function stamp(cache, prev) {
    const seen = new Map(((prev && prev.assignments) || []).map((a) => [a.id, a.first || 1]));
    const pseen = new Map(((prev && prev.planner) || []).map((p) => [p.type + p.id, p.first || 1]));
    const had = new Set((prev && prev.loaded) || ((prev && prev.assignments) || []).map((a) => a.course));
    const now = Date.now(), at = (course, old) => old || (prev && had.has(course) ? now : 1);
    for (const a of cache.assignments) a.first = at(a.course, seen.get(a.id));
    for (const p of cache.planner) p.first = at(p.course, pseen.get(p.type + p.id));
    return cache;
  }

  // ── a class's menu, the tabs you open most first ──
  // A tab is keyed by Canvas's class on its link (home, assignments, context_external_tool_12), the same in every class
  // on a site. Each page counts a visit to the tab it's under, at most once every 10 minutes, and counts halve every
  // three weeks so last term's tools sink. Home, Assignments and Grades start on top, Canvas's usual pages in the middle.
  const TAB_SEED = { home: 6, assignments: 5, grades: 4, modules: 1, announcements: 1, syllabus: 1, discussions: 1, quizzes: 1, files: 1, pages: 1 };
  const TAB_HALF = 21 * DAY, TAB_GAP = 10 * 60e3;
  /** A tab's key from its link's classes: the one that isn't Canvas's "active". */
  const tabKey = (classes) => Array.from(classes).find((c) => c !== "active") || "";
  const tabUses = (u, now) => (u ? u[0] * Math.pow(0.5, Math.max(0, now - u[1]) / TAB_HALF) : 0);
  /** One more visit to `key` in a site's counts ({ key: [visits, at] }); null when it was counted in the last 10 minutes. */
  function tabVisit(use, key, now) {
    const u = use[key];
    if (u && now - u[1] < TAB_GAP) return null;
    return Object.assign({}, use, { [key]: [+(tabUses(u, now) + 1).toFixed(3), now] });
  }
  /** Each tab's place in the menu: 1–4 on top (the four that score 3.5 or more, Home, Assignments and Grades to begin
      with), 10 and up for the ones you've opened lately and Canvas's usual pages, most used first (equal scores share
      a place and keep Canvas's order). Tabs left out are the rest, in Canvas's order. */
  function tabRanks(use, now) {
    const s = {};
    for (const k of new Set(Object.keys(TAB_SEED).concat(Object.keys(use || {})))) s[k] = +((TAB_SEED[k] || 0) + tabUses((use || {})[k], now)).toFixed(3);
    const r = {};
    let top = 0, at = 9, last = null;
    for (const k of Object.keys(s).filter((k) => s[k] >= 0.5).sort((a, b) => s[b] - s[a])) {
      if (top < 4 && s[k] >= 3.5) { r[k] = ++top; continue; }
      if (s[k] !== last) { at++; last = s[k]; }
      r[k] = at;
    }
    return r;
  }

  PC.work = { fromCache, view, days, weeks, page, pageVisit, gotos, rank, docked, reasons, code, short, mode, ended, guessDue, gpa, letter, needOnFinal, stamp, tabKey, tabVisit, tabRanks, KIND_NAME, kindOf };
})(globalThis);
