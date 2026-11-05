/* PocketCanvas: the Collegiapp bridge client. Collegiapp listens on 127.0.0.1:4747 (collegiapp src-tauri/src/bridge.rs):
     GET  /v1/ping                 { app: "collegiapp", version, paired }
     POST /v1/pair  {name}         { id, code }   then Collegiapp asks you to allow it, showing the same code
     GET  /v1/pair/<id>            { status: pending | allowed | denied | expired, token? }
     POST /v1/canvas {host, courses, work}   your classes (with their modes) and all your work, dated or not, with
                                             the dates PocketCanvas found in WeBWorK and Gradescope; `to_do` says
                                             Canvas calls it something to do, and work without it (grade columns,
                                             notices) lands in Collegiapp as Info for you to sort
     POST /v1/capture {text, url, title, notes}   quick add (Collegiapp's grammar: "pa3 130a fri ~2h !!")
     POST /v1/work {host, course, work, est_minutes, priority, notes}   one piece of work from its page, as the push
                                             carries it, with what you added in Send to Collegiapp -> { item, added }
     POST /v1/work/find {refs}               whether that work is in Collegiapp -> { item } (null when it isn't)
     GET  /v1/dofirst              the top of Collegiapp's Do first
     GET  /v1/focus                the focus session (site blocking follows it)
   Everything but ping and pair needs `Authorization: Bearer <token>`. The token lives in storage.local "cap". */
(function (g) {
  const PC = (g.PC = g.PC || {});
  const BASE = "http://127.0.0.1:4747";

  async function call(path, { method = "GET", body, token, ms = 4000 } = {}) {
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), ms);
    try {
      const r = await fetch(BASE + path, { method, signal: ctl.signal, headers: Object.assign({ "Content-Type": "application/json" }, token ? { Authorization: "Bearer " + token } : {}),
        body: body ? JSON.stringify(body) : undefined });
      if (r.status === 401) { const e = new Error("Collegiapp forgot this browser. Connect again."); e.unpaired = true; throw e; }
      if (!r.ok) throw new Error(`Collegiapp answered ${r.status}`);
      return r.status === 204 ? null : await r.json();
    } catch (e) {
      if (e.name === "AbortError" || e instanceof TypeError) { const x = new Error("Collegiapp isn't running."); x.offline = true; throw x; }
      throw e;
    } finally { clearTimeout(t); }
  }

  const kindFor = (k) => ({ discussion: "assignment", page: "reading", task: "task" }[k] || k);
  const modeFor = (c) => (c.autoMode && c.mode === "normal" ? null : c.mode);
  /** Where an item comes from, as Collegiapp's importers name it: the Canvas feed's UID for assignments (so feed items
      and these are one item), the WeBWorK / Gradescope ids Collegiapp's own readers use, else PocketCanvas's. */
  function source(i) {
    if (i.src === "assignment") return { adapter: "canvas", external_id: "event-assignment-" + i.id };
    if (i.src === "webwork" || i.src === "gradescope") return { adapter: i.src, external_id: i.id };
    return { adapter: "pocketcanvas", external_id: `${i.src}-${i.id}` };
  }

  const courseOf = (c) => ({ canvas_id: c.id, name: c.name, code: c.codeText, term: c.term, mode: modeFor(c), url: c.url, color: c.color });
  /** A work item as Collegiapp's importer takes it. */
  const workOf = (i) => Object.assign(source(i), {
    // a Canvas item whose date came from WeBWorK or Gradescope is the same work as that app's item
    same_as: i.app && i.src !== i.app.app ? { adapter: i.app.app, external_id: i.app.ext } : null,
    course: i.course || null, course_text: i.courseText || null, title: i.title, kind: kindFor(i.kind),
    due: i.due ? new Date(i.due).toISOString() : null, due_from: i.dueBy === "app" ? i.app.app : i.dueBy,
    // WeBWorK work is open until full marks (work.js), and Collegiapp checks the score too
    url: i.url, submitted: !i.open, points: i.points != null ? i.points : null, score: i.score != null ? i.score : null,
    // turned in online (an upload, a quiz, a discussion, an outside tool), on your Canvas To Do list, or an app's
    to_do: i.src !== "assignment" || !i.noSubmit,
  });

  /** The /v1/canvas payload from a view (PC.work.view with includeAll). */
  function payload(v) {
    return {
      host: v.host,
      courses: v.courses.map(courseOf),
      work: v.items.filter((i) => !i.task && !(i.courseObj && i.courseObj.mode === "hidden")).map(workOf),
    };
  }
  /** The /v1/work body for one item of a view, with `extra` ({ est_minutes, priority, notes }). */
  const one = (v, i, extra) => Object.assign({ host: v.host, course: i.courseObj ? courseOf(i.courseObj) : null, work: workOf(i) }, extra);
  /** The ids Collegiapp may know an item by: its own, then the app item it's the same as. */
  const refs = (i) => { const w = workOf(i); return [{ adapter: w.adapter, external_id: w.external_id }].concat(w.same_as || []); };

  PC.cap = {
    BASE,
    HOME: "https://github.com/imanimal/collegiapp", // where to get Collegiapp, linked wherever it asks you to connect
    ping: (token) => call("/v1/ping", { token, ms: 1500 }),
    pair: (name) => call("/v1/pair", { method: "POST", body: { name } }),
    pairStatus: (id) => call("/v1/pair/" + encodeURIComponent(id)),
    push: (token, body) => call("/v1/canvas", { method: "POST", token, body, ms: 15000 }),
    capture: (token, body) => call("/v1/capture", { method: "POST", token, body }),
    send: (token, body) => call("/v1/work", { method: "POST", token, body }),
    find: (token, refs) => call("/v1/work/find", { method: "POST", token, body: { refs }, ms: 2500 }),
    doFirst: (token) => call("/v1/dofirst", { token }),
    focus: (token) => call("/v1/focus", { token, ms: 1500 }),
    payload, one, refs,
  };
})(globalThis);
