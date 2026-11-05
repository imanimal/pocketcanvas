// PocketCanvas core tests: node --test tests/core.test.js
// The libraries are classic scripts on globalThis.PC; this loads them into one VM context with a stub `browser`.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function load() {
  const store = {};
  const area = { get: async (k) => (k == null ? { ...store } : typeof k === "string" ? { [k]: store[k] } : Object.fromEntries(k.map((x) => [x, store[x]]))), set: async (o) => Object.assign(store, o) };
  const ctx = { browser: { storage: { local: area, sync: area } }, console, URL, Date, Intl, setTimeout, clearTimeout, encodeURIComponent, decodeURIComponent };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  for (const f of ["util", "icons", "themes", "apps", "work", "canvas-api", "collegiapp", "cloud"]) vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "src", "lib", f + ".js"), "utf8"), ctx, { filename: f + ".js" });
  return ctx.PC;
}
const PC = load();
const u = (s) => Date.parse(s);
// values made in the VM have its own Object and Array, so compare plain copies
const J = (x) => JSON.parse(JSON.stringify(x));

test("WeBWorK dates read as WeBWorK prints them", () => {
  assert.strictEqual(PC.apps.wwDate("11/05/2026 at 11:59pm PST"), u("2026-11-06T07:59:00Z"));
  assert.strictEqual(PC.apps.wwDate("10/30/2026 at 11:59pm PDT."), u("2026-10-31T06:59:00Z"));
  assert.strictEqual(PC.apps.wwDate("November 5, 2026 at 11:59:00 PM PST"), u("2026-11-06T07:59:00Z"));
  // no zone: Pacific, daylight time until the first Sunday of November (Nov 1, 2026)
  assert.strictEqual(PC.apps.wwDate("10/20/2026 at 09:00am"), u("2026-10-20T16:00:00Z"));
  assert.strictEqual(PC.apps.wwDate("11/20/2026 at 09:00am"), u("2026-11-20T17:00:00Z"));
  assert.strictEqual(PC.apps.wwDate("11/05/2026 at 12:00am -0800"), u("2026-11-05T08:00:00Z"));
  assert.strictEqual(PC.apps.wwDate("whenever"), null);
});

test("WeBWorK status sentences", () => {
  const st = (s) => PC.apps.wwStatus({ opens: null, due: null, lateDue: null, closed: false }, s);
  assert.strictEqual(st("Open, closes 11/05/2026 at 11:59pm PST.").due, u("2026-11-06T07:59:00Z"));
  const r = st("Open, due 10/30/2026 at 11:59pm PDT. Afterward reduced credit can be earned until 11/02/2026 at 11:59pm PST.");
  assert.strictEqual(r.due, u("2026-10-31T06:59:00Z"));
  assert.strictEqual(r.lateDue, u("2026-11-03T07:59:00Z"));
  const q = st("Due date 10/29/2026 at 11:59pm PDT has passed. Reduced credit can still be earned until 11/03/2026 at 11:59pm PST.");
  assert.strictEqual(q.due, u("2026-10-30T06:59:00Z"));
  assert.strictEqual(q.lateDue, u("2026-11-04T07:59:00Z"));
  assert.strictEqual(st("Will open on 11/06/2026 at 12:00am PST.").opens, u("2026-11-06T08:00:00Z"));
  assert.ok(st("Closed, answers available.").closed);
});

test("WeBWorK addresses name the course and set", () => {
  const r = PC.apps.wwFromUrl("https://webwork.math.ucsb.edu/webwork2/math4B-01-f26-blee/Homework_3/?user=student&key=x");
  assert.strictEqual(r.id, "math4B-01-f26-blee");
  assert.strictEqual(r.set, "Homework_3");
  assert.strictEqual(r.code, "MATH 4B");
  assert.strictEqual(r.home, "https://webwork.math.ucsb.edu/webwork2/math4B-01-f26-blee/");
  assert.strictEqual(PC.apps.wwFromUrl("https://webwork.math.ucsb.edu/webwork2/math4B-01-f26-blee/hardcopy/").set, null);
  assert.strictEqual(PC.apps.wwFromUrl("https://webwork.math.ucsb.edu/webwork2/ltiadvantage/launch"), null);
  assert.strictEqual(PC.apps.wwCode("math2a_34a-01-sims24-x"), "MATH 2A");
});

test("Gradescope course codes stop at the number", () => {
  assert.strictEqual(PC.apps.gsCode("CMPSC16"), "CMPSC 16");
  assert.strictEqual(PC.apps.gsCode("Math 4B - Fall 2026"), "MATH 4B");
  assert.strictEqual(PC.apps.gsTime("2026-10-28 23:59:00 -0700"), u("2026-10-29T06:59:00Z"));
});

test("work names match across apps", () => {
  const same = PC.apps.sameWork;
  assert.ok(same("Homework 5", "HW 5"));
  assert.ok(same("Homework_5", "Homework #5 (Sections 3.1 & 3.2)"));
  assert.ok(same("hw5", "Homework 5"));
  assert.ok(!same("Homework 5", "Homework 6"));
  assert.ok(!same("Quiz 5", "Homework 5"));
  assert.ok(same("Section 4.2", "WeBWorK Section 4.2"));
});

test("a code finds its Canvas class, the current term first", () => {
  const now = Date.now();
  const cs = [{ id: "1", code: "MATH 4B F25", name: "Linear Algebra", termEnd: now - 300 * 864e5 }, { id: "2", code: "MATH4B F26", name: "Linear Algebra", termEnd: now + 30 * 864e5 }, { id: "3", code: "MATH 4BH", name: "Honors" }];
  assert.strictEqual(PC.apps.classFor("MATH 4B", cs).id, "2");
  assert.strictEqual(PC.apps.classFor("MATH 4BH", cs).id, "3");
  assert.strictEqual(PC.apps.classFor("CMPSC 16", cs), null);
});

function state(extra) {
  const now = Date.now();
  return Object.assign({
    settings: Object.assign({}, PC.DEFAULTS), courseFlags: {}, itemFlags: {}, tasks: [], seenAt: now - 1000,
    cache: {
      origin: "https://canvas.ucsb.edu", host: "canvas.ucsb.edu", at: now,
      courses: [{ id: "10", name: "MATH 4B - Linear Algebra", code: "MATH 4B F26", term: "Fall 2026", termEnd: now + 40 * 864e5, url: "https://canvas.ucsb.edu/courses/10" },
        { id: "11", name: "CMPSC 130A", code: "CMPSC 130A S25", term: "Spring 2025", termEnd: now - 200 * 864e5, url: "https://canvas.ucsb.edu/courses/11" }],
      assignments: [
        { id: "100", course: "10", title: "Homework 3", url: "u100", due: null, types: ["external_tool"], state: "unsubmitted", apps: ["https://webwork.math.ucsb.edu/webwork2/math4B-01-f26-blee/Homework_3/"], first: 1 },
        { id: "101", course: "10", title: "HW 4", url: "u101", due: null, types: ["external_tool"], state: "unsubmitted", first: 1 },
        { id: "102", course: "10", title: "Midterm", url: "u102", due: now + 5 * 864e5, types: ["on_paper"], state: "unsubmitted", first: 1 },
        { id: "200", course: "11", title: "PA1", url: "u200", due: now - 190 * 864e5, types: ["online_upload"], state: "unsubmitted", first: 1 },
      ],
      planner: [], links: [], announcements: {}, loaded: ["10", "11"],
    },
    apps: { webwork: { "https://webwork.math.ucsb.edu/webwork2/math4B-01-f26-blee": { base: "https://webwork.math.ucsb.edu/webwork2", id: "math4B-01-f26-blee", code: "MATH 4B", status: "ok", at: now, sets: {
      Homework_3: { id: "Homework_3", name: "Homework 3", due: now + 2 * 864e5, url: "s3" },
      Homework_4: { id: "Homework_4", name: "Homework 4", due: now + 6 * 864e5, url: "s4" },
      Homework_5: { id: "Homework_5", name: "Homework 5", due: now + 9 * 864e5, url: "s5" },
      Homework_1: { id: "Homework_1", name: "Homework 1", due: now - 20 * 864e5, closed: true, url: "s1" },
    } } } },
  }, extra || {});
}

test("Canvas work with no due date takes WeBWorK's; WeBWorK-only sets join the class", () => {
  const S = state(), V = PC.work.view(S);
  const by = (t) => V.items.find((i) => i.title === t);
  assert.strictEqual(by("Homework 3").dueBy, "app");
  assert.strictEqual(by("Homework 3").due, S.apps.webwork["https://webwork.math.ucsb.edu/webwork2/math4B-01-f26-blee"].sets.Homework_3.due);
  assert.strictEqual(by("HW 4").dueBy, "app");
  assert.strictEqual(by("Midterm").dueBy, "canvas");
  const hw5 = by("Homework 5");
  assert.ok(hw5 && hw5.src === "webwork" && hw5.course === "10" && hw5.dueBy === "app");
  assert.ok(!by("Homework 1"), "closed sets stay out");
  // the ended class is ghosted by default, so its work is out of the list
  assert.ok(!by("PA1"));
  // your own date still wins
  const S2 = state({ itemFlags: { "canvas.ucsb.edu/a100": { due: new Date(Date.now() + 864e5).toISOString() } } });
  assert.strictEqual(PC.work.view(S2).items.find((i) => i.title === "Homework 3").dueBy, "mine");
});

test("Collegiapp payload names app sources the way Collegiapp's readers do", () => {
  const S = state(), V = PC.work.view(S, { includeAll: true });
  const p = PC.cap.payload(V);
  const hw3 = p.work.find((w) => w.title === "Homework 3"), hw5 = p.work.find((w) => w.title === "Homework 5");
  assert.deepStrictEqual([hw3.adapter, hw3.external_id], ["canvas", "event-assignment-100"]);
  assert.deepStrictEqual(J(hw3.same_as), { adapter: "webwork", external_id: "math4B-01-f26-blee/Homework_3" });
  assert.strictEqual(hw3.due_from, "webwork");
  assert.deepStrictEqual([hw5.adapter, hw5.external_id], ["webwork", "math4B-01-f26-blee/Homework_5"]);
  assert.strictEqual(p.courses.find((c) => c.canvas_id === "11").mode, "ghost");
  // work you turn in online (or an app's) is to do; an on-paper midterm could be a grade column, so Collegiapp asks
  assert.deepStrictEqual([hw3.to_do, hw5.to_do, p.work.find((w) => w.title === "Midterm").to_do], [true, true, false]);
});

test("Send to Collegiapp carries one item as the push does, with what you added", () => {
  const V = PC.work.view(state(), { includeAll: true });
  const hw3 = V.items.find((i) => i.title === "Homework 3");
  const b = J(PC.cap.one(V, hw3, { est_minutes: 90, priority: 2, notes: "ch. 4" }));
  assert.deepStrictEqual(b.work, J(PC.cap.payload(V).work.find((w) => w.title === "Homework 3")));
  assert.deepStrictEqual([b.host, b.course.canvas_id, b.est_minutes, b.priority, b.notes], ["canvas.ucsb.edu", "10", 90, 2, "ch. 4"]);
  // Collegiapp may have it as the Canvas item or as the WeBWorK item it's the same as
  assert.deepStrictEqual(J(PC.cap.refs(hw3)), [{ adapter: "canvas", external_id: "event-assignment-100" }, { adapter: "webwork", external_id: "math4B-01-f26-blee/Homework_3" }]);
  assert.deepStrictEqual(J(PC.cap.refs(V.items.find((i) => i.title === "Homework 5"))), [{ adapter: "webwork", external_id: "math4B-01-f26-blee/Homework_5" }]);
});

test("WeBWorK work Canvas calls graded stays to do until it has every point", () => {
  // WeBWorK sends Canvas a grade after every answer, so Canvas calls a set submitted as soon as you start it
  const S = state(), A = S.cache.assignments, now = Date.now();
  Object.assign(A.find((a) => a.id === "100"), { state: "graded", points: 10, score: 6.5, submittedAt: now - 36e5 });
  A.push({ id: "103", course: "10", title: "Chapter 2 practice", url: "u103", due: now + 864e5, types: ["external_tool"], ww: true, state: "graded", points: 4, score: 1, first: 1 },
    { id: "104", course: "10", title: "Essay", url: "u104", due: now - 864e5, types: ["online_upload"], state: "graded", points: 10, score: 6, first: 1 });
  let V = PC.work.view(S, { includeAll: true });
  const by = (t) => V.items.find((i) => i.title === t), sent = (t) => PC.cap.payload(V).work.find((w) => w.title === t);
  // matched to its WeBWorK set, or launching WeBWorK from Canvas (a course PocketCanvas hasn't read)
  assert.deepStrictEqual([by("Homework 3").open, by("Homework 3").status, by("Homework 3").partial], [true, "todo", true]);
  assert.ok(by("Chapter 2 practice").open);
  assert.deepStrictEqual([sent("Homework 3").submitted, sent("Homework 3").score, sent("Homework 3").points], [false, 6.5, 10]);
  // anything else Canvas graded is done
  assert.deepStrictEqual([by("Essay").open, by("Essay").status], [false, "graded"]);
  A.find((a) => a.id === "100").score = 10;
  V = PC.work.view(S, { includeAll: true });
  assert.deepStrictEqual([by("Homework 3").open, by("Homework 3").status, sent("Homework 3").submitted], [false, "graded", true]);
});

test("one assignment read from the API matches the cache's shape", () => {
  const a = PC.canvas.assignment({ id: 7, name: "HW2", html_url: "u", due_at: null, points_possible: 10, submission_types: ["external_tool"], external_tool_tag_attributes: { url: "https://webwork.math.ucsb.edu/webwork2/math4B-01-f26-blee/HW2/" }, submission: { workflow_state: "graded", score: 10, submitted_at: "2026-10-08T03:50:00Z", graded_at: "2026-10-09T00:00:00Z" } }, "10");
  assert.deepStrictEqual([a.id, a.course, a.due, a.points, a.state, a.score], ["7", "10", null, 10, "graded", 10]);
  assert.strictEqual(a.submittedAt, Date.parse("2026-10-08T03:50:00Z"));
  assert.deepStrictEqual(J(a.apps), ["https://webwork.math.ucsb.edu/webwork2/math4B-01-f26-blee/HW2/"]);
  assert.strictEqual(a.ww, true, "Canvas launches a WeBWorK set for it");
  const tool = (url) => PC.canvas.assignment({ id: 8, name: "x", submission_types: ["external_tool"], external_tool_tag_attributes: { url } }, "10").ww;
  assert.deepStrictEqual([tool("https://webwork.math.ucsb.edu/webwork2/ltiadvantage/launch"), tool("https://webwork.math.ucsb.edu/webwork2/math4B-01-f26-blee/"), tool("https://www.gradescope.com/courses/1")], [true, undefined, undefined]);
  const it = PC.work.fromCache({ assignments: [a], planner: [] })[0];
  assert.deepStrictEqual([it.status, it.submittedAt], ["graded", a.submittedAt]);
});

test("new work: the first read and newly read classes count as old", () => {
  const S = state();
  const prev = JSON.parse(JSON.stringify(S.cache));
  const next = JSON.parse(JSON.stringify(S.cache));
  next.assignments.push({ id: "103", course: "10", title: "Homework 6", types: [], first: 0 });
  next.assignments.push({ id: "300", course: "12", title: "Lab 1", types: [], first: 0 });
  PC.work.stamp(next, prev);
  assert.ok(next.assignments.find((a) => a.id === "103").first > 1);
  assert.strictEqual(next.assignments.find((a) => a.id === "300").first, 1);
  const fresh = PC.work.stamp(JSON.parse(JSON.stringify(S.cache)), null);
  assert.ok(fresh.assignments.every((a) => a.first === 1));
});

test("built-in themes pass their own contrast checks", () => {
  for (const t of PC.themes.BUILTIN) assert.deepStrictEqual(J(PC.themes.checks(t.tokens)).map((c) => `${c.f}/${c.b} ${c.r.toFixed(2)}`), [], t.name);
});

test("each theme shows in its own slot: the night one at night, the day one by day, light or dark", () => {
  const T = PC.themes, s = { theme: "pocket-ink", nightTheme: "pocket-night", night: "schedule", nightFrom: "20:00", nightTo: "07:00" };
  const at = (h) => new Date(2026, 10, 1, h).getTime();
  assert.strictEqual(T.isNight(s, at(22)), true);
  assert.strictEqual(T.isNight(s, at(5)), true);
  assert.strictEqual(T.isNight(s, at(12)), false);
  assert.strictEqual(T.pick(s, null, at(22)).id, "pocket-night");
  assert.strictEqual(T.pick(s, null, at(12)).id, "pocket-ink");
  assert.strictEqual(T.pick({ ...s, night: "off" }, null, at(22)).id, "pocket-ink");
  assert.strictEqual(T.pick({ ...s, night: "on" }, null, at(12)).id, "pocket-night");
  assert.strictEqual(T.pick({ ...s, nightTheme: "gone" }, null, at(22)).id, "pocket-night");
});

test("a chatbot reply becomes a theme, and fix() repairs contrast", () => {
  const r = PC.themes.normalize('Sure! ```json\n{"pocketTheme":1,"name":"Matcha","look":"pocket","scheme":"light","tokens":{"bg":"#e4ead8","surface":"#f3f6ec","text3":"#b0b8a0","accent":"#5f8f3a"}}\n``` Enjoy');
  assert.ok(!r.error);
  assert.strictEqual(r.theme.name, "Matcha");
  assert.ok(r.lowContrast);
  assert.deepStrictEqual(J(PC.themes.checks(PC.themes.fix(r.theme).tokens)), []);
  assert.ok(PC.themes.normalize("no json here").error);
});

test("GPA and the final-exam helper", () => {
  const scale = PC.DEFAULTS.gpaScale;
  const g = PC.work.gpa([{ score: 95, units: 4 }, { score: 84, units: 4 }], { gpaScale: scale, priorGpa: "3.5", priorUnits: "40" }, () => true);
  assert.strictEqual(g.term, 3.5);
  assert.strictEqual(+g.cum.toFixed(2), 3.5);
  assert.strictEqual(PC.work.needOnFinal(88, 90, 25), 96);
});

test("the dock: the order you dragged first, then priority, then Canvas's order; ghosts and hidden left out", () => {
  const C = (id, mode, pos) => ({ id, mode, flags: pos == null ? {} : { pos } });
  const ids = PC.work.docked([C("a", "normal"), C("b", "priority"), C("c", "ghost", 0), C("d", "normal", 1), C("e", "normal", 0), C("f", "hidden")]).map((c) => c.id);
  assert.deepStrictEqual(ids, ["e", "d", "b", "a"]);
});

test("a class's menu: Home, Assignments and Grades on top, then the tabs you open most; old use sinks", () => {
  const D = 864e5, t0 = u("2026-11-01T12:00:00Z"), tool = "context_external_tool_7";
  assert.strictEqual(PC.work.tabKey(["home", "active"]), "home");
  assert.strictEqual(PC.work.tabKey(["active", tool]), tool);
  const r0 = PC.work.tabRanks({}, t0);
  assert.deepStrictEqual([r0.home, r0.assignments, r0.grades, r0.modules, r0.syllabus, r0.people], [1, 2, 3, 10, 10, undefined]);
  // four days in a row on a tool: a fourth key on top; twice in ten minutes counts once
  let use = {};
  for (let d = 0; d < 4; d++) use = PC.work.tabVisit(use, tool, t0 + d * D);
  assert.strictEqual(PC.work.tabVisit(use, tool, t0 + 3 * D + 5 * 60e3), null);
  assert.strictEqual(PC.work.tabRanks(use, t0 + 3 * D)[tool], 4);
  // Modules every day for ten days: first, and the tool (unused since) drops out of the top but stays above the usual pages
  for (let d = 4; d < 14; d++) use = PC.work.tabVisit(use, "modules", t0 + d * D);
  const r1 = PC.work.tabRanks(use, t0 + 13 * D);
  assert.deepStrictEqual([r1.modules, r1.home, r1.assignments, r1.grades, r1[tool], r1.syllabus, r1.files], [1, 2, 3, 4, 10, 11, 11]);
  // a term later the tool is back with the rest
  assert.strictEqual(PC.work.tabRanks(use, t0 + 90 * D)[tool], undefined);
});

test("To do, day by day: late first, then each day in due-time order, then undated; today even when it's empty", () => {
  const at = (d, h, m = 0) => new Date(2026, 10, d, h, m).getTime(), now = at(3, 9), day = (d) => "d" + PC.u.sod(at(d, 0));
  const I = (title, due, more) => Object.assign({ title, due, open: true, pri: 0, isNew: false }, more);
  const items = [I("Essay", at(5, 23, 59)), I("Lab", at(2, 17)), I("Quiz", at(5, 9)), I("Reading", null), I("Old", at(1, 12), { open: false }), I("Flagged", null, { pri: 1 }), I("Set", at(4, 23, 59))];
  const g = PC.work.days(items, now, { today: true });
  assert.deepStrictEqual(J(g.map((x) => [x.id, x.items.map((i) => i.title)])), [["over", ["Lab"]], [day(3), []], [day(4), ["Set"]], [day(5), ["Quiz", "Essay"]], ["none", ["Flagged", "Reading"]]]);
  assert.deepStrictEqual(J(PC.work.days(items, now, { showDone: true }).map((x) => x.id)), ["over", day(4), day(5), "none", "done"]);
});

test("the calendar's weeks run Sunday to Saturday from this week through the last day with work, across a clock change", () => {
  const at = (m, d) => new Date(2026, m, d).getTime(), now = new Date(2026, 10, 4, 15).getTime(); // Wed, Nov 4
  const w = PC.work.weeks([at(10, 6), at(10, 16)], now);
  assert.deepStrictEqual(J(w.map((x) => [new Date(x[0]).getDate(), new Date(x[6]).getDate()])), [[1, 7], [8, 14], [15, 21]]);
  assert.ok(w.flat().every((t) => t === PC.u.sod(t)), "every square starts at midnight");
  assert.strictEqual(PC.work.weeks([], now).length, 1);
  assert.deepStrictEqual(J(PC.work.weeks([at(11, 1)], now).map((x) => new Date(x[0]).getDate())), [1, 8, 15, 22, 29]);
});

test("Do first is dated work due within a week or late within one, soonest first; your dates count, guesses don't", () => {
  const H = 36e5, D = 24 * H, now = u("2026-11-01T20:00:00Z");
  const I = (title, due, more) => Object.assign({ title, due, open: true, pri: false }, more);
  const items = [I("Essay", now + 3 * D), I("Undated", null, { guess: now + D }), I("Mine", now + 5 * H, { dueBy: "mine" }), I("Far", now + 9 * D),
    I("Late", now - 2 * D), I("Stale", now - 8 * D), I("Done", now + H, { open: false }), I("Tie", now + 3 * D, { pri: true })];
  assert.deepStrictEqual(J(PC.work.rank(items, now).map((i) => i.title)), ["Late", "Mine", "Tie", "Essay"]);
  assert.deepStrictEqual(J(PC.work.rank(items, now, Infinity).map((i) => i.title)), ["Stale", "Late", "Mine", "Tie", "Essay", "Far"]);
  assert.deepStrictEqual(J(PC.work.reasons(items[2], now)), ["Due in 5h", "Your date"]);
});

test("Go to counts class sections, tools, Calendar, Inbox and Grades, not class homes or single pieces of work", () => {
  const p = (s) => { const r = PC.work.page(s); return r && [r.path, r.course, r.icon, r.label]; };
  assert.deepStrictEqual(J(p("/courses/12/modules/")), ["/courses/12/modules", "12", "all", "Modules"]);
  assert.deepStrictEqual(J(p("/courses/12/assignments/syllabus")), ["/courses/12/assignments/syllabus", "12", "book", "Syllabus"]);
  assert.deepStrictEqual(J(p("/courses/12/external_tools/88")), ["/courses/12/external_tools/88", "12", "links", "Tool"]);
  assert.deepStrictEqual(J(p("/calendar")), ["/calendar", null, "week", "Calendar"]);
  for (const s of ["/courses/12", "/courses/12/assignments/5", "/courses/12/pages/intro", "/", "/profile"]) assert.strictEqual(PC.work.page(s), null, s);
  // visits count like the menu's tabs: once per 10 minutes, the class's own name kept, faded pages dropped
  const D = 864e5, t0 = u("2026-11-01T12:00:00Z"), m = "/courses/12/modules";
  let v = PC.work.pageVisit({}, m, "Weekly modules", t0);
  assert.deepStrictEqual(J(v), { [m]: [1, t0, "Weekly modules"] });
  assert.strictEqual(PC.work.pageVisit(v, m, "", t0 + 5 * 60e3), null);
  v = PC.work.pageVisit(v, m, "", t0 + D);
  assert.strictEqual(v[m][2], "Weekly modules");
  v = PC.work.pageVisit(v, "/calendar", "Calendar", t0 + 120 * D);
  assert.deepStrictEqual(J(Object.keys(v)), ["/calendar"]);
});

test("Go to's tiles: pages you open often, then each class's homework site, your links, Calendar, Inbox and Grades", () => {
  const now = u("2026-11-01T12:00:00Z"), D = 864e5;
  const C = (id, label, mode, links) => ({ id, label, mode, flags: links ? { links } : {} });
  const courses = [C("1", "PHYS 7B", "priority", [{ url: "https://piazza.com/x", label: "Piazza" }]), C("2", "MATH 6A", "normal"), C("3", "ENGL 10", "ghost")];
  const v = { now, host: "canvas.ucsb.edu", courses, byId: Object.fromEntries(courses.map((c) => [c.id, c])) };
  // Files is in a ghosted class and assignments/9 is one piece of work: neither shows; Calendar opened twice beats its suggestion
  const visits = { "/courses/2/modules": [3, now - D, "Modules"], "/courses/3/files": [5, now, "Files"], "/courses/1/grades": [1, now - D, "Grades"], "/courses/2/assignments/9": [4, now, ""], "/calendar": [2, now, ""] };
  const apps = [{ app: "WeBWorK", course: { id: "2" }, home: "https://webwork.math.ucsb.edu/6A/" }, { app: "Gradescope", course: { id: "3" }, home: "https://gradescope.com/courses/1" }];
  const t = PC.work.gotos(visits, v, apps, 8);
  assert.deepStrictEqual(J(t.map((x) => [x.label, x.sub])), [["Modules", "MATH 6A"], ["Calendar", "Canvas"], ["WeBWorK", "MATH 6A"], ["Piazza", "PHYS 7B"], ["Inbox", "Canvas"], ["Grades", "Canvas"], ["Grades", "PHYS 7B"]]);
  assert.strictEqual(t[0].url, "https://canvas.ucsb.edu/courses/2/modules");
  assert.deepStrictEqual(J(t.map((x) => !!x.ext)), [false, false, true, true, false, false, false]);
  assert.strictEqual(t[1].why, "You open it often");
  assert.strictEqual(PC.work.gotos(visits, v, apps, 3).length, 3);
});

test("every class icon is drawn in both looks", () => {
  for (const n of PC.CLASS_ICONS) {
    assert.match(PC.ic(n, null, "pocket"), /<path d="M/, n + " (pocket)");
    assert.match(PC.ic(n, null, "standard"), /<path d="M/, n + " (standard)");
  }
});

test("sync: what you set syncs key by key, defaults stay out", () => {
  const P = load();
  const S = { settings: Object.assign({}, P.DEFAULTS, { theme: "pocket-night", clock24: true }), courseFlags: { "canvas.ucsb.edu/11": { mode: "ghost", nick: "Algo" } },
    itemFlags: { "canvas.ucsb.edu/a-5": { done: true }, "canvas.ucsb.edu/a-6": {} }, tasks: [{ id: "t1", title: "Read ch. 3" }], themes: [{ id: "mine", name: "Mine" }], note: "hi" };
  assert.deepStrictEqual(Object.keys(J(P.cloud.flatten(S))).sort(),
    ["c.canvas.ucsb.edu/11.mode", "c.canvas.ucsb.edu/11.nick", "i.canvas.ucsb.edu/a-5", "n", "s.clock24", "s.theme", "t.t1", "th.mine"]);
  assert.ok(P.cloud.known("c.canvas.ucsb.edu/11.mode") && !P.cloud.known("s.v") && !P.cloud.known("s.nope") && !P.cloud.known("x.y"));
});

test("sync: the account wins a browser's first stamps, and later changes win the account", () => {
  const P = load(), E = P.cloud.EPOCH, t = (h) => `2026-11-03T${h}:00:00.000Z`;
  const map = {};
  P.cloud.stamp(map, { "s.theme": "standard-paper", "s.clock24": true }, E, "");
  const remote = { "s.theme": { v: "pocket-night", at: t("09"), by: "firefox-a" } };
  let r = P.cloud.merge(map, remote);
  assert.deepStrictEqual(J(r.pulled), ["s.theme"]);
  assert.strictEqual(map["s.theme"].v, "pocket-night");
  assert.ok(r.push, "clock24 is only here");
  P.cloud.stamp(map, { "s.theme": "standard-paper", "s.clock24": true }, t("10"), "firefox-b");
  r = P.cloud.merge(map, remote);
  assert.deepStrictEqual(J(r.pulled), []);
  assert.strictEqual(map["s.theme"].v, "standard-paper");
  // two browsers' first stamps tie: both take the account's
  const m2 = {};
  P.cloud.stamp(m2, { "s.theme": "x" }, E, "");
  P.cloud.merge(m2, { "s.theme": { v: "y", at: E, by: "" } });
  assert.strictEqual(m2["s.theme"].v, "y");
  // a key never set stays unstamped; one taken off is stamped null; one from a newer version is left alone
  const m3 = { "z.new": { v: 1, at: E, by: "" } };
  assert.ok(!P.cloud.stamp(m3, {}, t("10"), "b"));
  P.cloud.stamp(m3, { "i.h/a": { done: true } }, t("10"), "b");
  P.cloud.stamp(m3, {}, t("11"), "b");
  assert.deepStrictEqual(J(m3["i.h/a"]), { v: null, at: t("11"), by: "b" });
  assert.strictEqual(m3["z.new"].v, 1);
});

test("sync: two browsers meet in the account", async () => {
  const remote = { j: null, ut: null, n: 0 };
  let clock = Date.parse("2026-11-03T10:00:00Z");
  const write = async (token, uid, map, by, ut) => {
    if (ut !== remote.ut) { const e = new Error("conflict"); e.conflict = true; throw e; }
    remote.j = JSON.stringify(map); remote.ut = "v" + ++remote.n;
  };
  const browser = async (seed) => {
    const P = load();
    Object.assign(P.cloud.net, { now: () => clock, token: async () => "t", write, read: async () => ({ map: remote.j ? JSON.parse(remote.j) : {}, updateTime: remote.ut }) });
    await seed(P);
    await P.api.storage.local.set({ cloudAuth: { uid: "u1", email: "me@example.com", refresh: "r" } });
    return P;
  };
  const key = "canvas.ucsb.edu/11";
  const A = await browser(async (P) => {
    await P.store.setSettings({ theme: "pocket-night" });
    await P.store.setCourseFlag(key, { mode: "ghost", nick: "Algo" });
    await P.store.setLocal("tasks", [{ id: "t1", title: "Read ch. 3" }]);
  });
  assert.deepStrictEqual(J(await A.cloud.sync()), { ok: true, moved: true });
  // B had its own theme before signing in: the account's wins; what only B had is added
  const B = await browser(async (P) => { await P.store.setSettings({ theme: "standard-paper", relDates: false }); });
  clock += 1000; await B.cloud.sync();
  let s = await B.store.settings();
  assert.strictEqual(s.theme, "pocket-night");
  assert.strictEqual(s.relDates, false);
  assert.deepStrictEqual(J((await B.store.courseFlags())[key]), { mode: "ghost", nick: "Algo" });
  assert.deepStrictEqual(J(await B.store.local("tasks")), [{ id: "t1", title: "Read ch. 3" }]);
  // changes after that go both ways: B marks the class priority, A deletes the task and puts relDates back
  clock += 1000; await B.store.setCourseFlag(key, { mode: "priority", nick: null }); await B.cloud.sync();
  clock += 1000; await A.store.setLocal("tasks", []); await A.cloud.sync();
  assert.deepStrictEqual(J((await A.store.courseFlags())[key]), { mode: "priority" });
  assert.strictEqual((await A.store.settings()).relDates, false);
  clock += 1000; await A.store.setSettings({ relDates: true }); await A.cloud.sync();
  clock += 1000; await B.cloud.sync();
  assert.deepStrictEqual(J(await B.store.local("tasks")), []);
  assert.strictEqual((await B.store.settings()).relDates, true);
  // both change something at once: B writes between A's read and A's write, and A's write waits for it
  clock += 1000; await A.store.setSettings({ badge: false }); await B.store.setSettings({ gpa: true });
  let race = true;
  A.cloud.net.write = async (...a) => { if (race) { race = false; await B.cloud.sync(); } return write(...a); };
  await A.cloud.sync(); await B.cloud.sync();
  for (const P of [A, B]) { s = await P.store.settings(); assert.strictEqual(s.badge, false); assert.strictEqual(s.gpa, true); }
  assert.ok(!(await A.cloud.sync()).moved, "nothing left to move");
  // signed out, a browser leaves the account alone
  await A.cloud.signOut();
  assert.strictEqual(await A.cloud.sync(), null);
});
