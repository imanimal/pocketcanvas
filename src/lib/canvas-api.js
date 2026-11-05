/* PocketCanvas: the Canvas REST API, read with your Canvas session (no token). Runs in a Canvas page (same origin, so
   the session cookie always goes along) and in the background (host permission, credentials included). It only
   reads: PocketCanvas never changes anything in your Canvas account.

   One load = the course list, then per class you haven't hidden or ghosted: every assignment with your submission
   (including the ones with no due date), plus the planner (ungraded discussions and pages with a to-do date, and
   Canvas's own "done" marks), recent announcements, and module links into WeBWorK and Gradescope (lib/apps.js
   reads due dates there for work Canvas has none for). */
(function (g) {
  const PC = (g.PC = g.PC || {});

  class CanvasError extends Error { constructor(msg, status) { super(msg); this.status = status; } }

  async function get(origin, path) {
    const out = [];
    let url = origin + path, pages = 0;
    while (url && pages++ < 20) {
      const r = await fetch(url, { credentials: "include", headers: { Accept: "application/json" } });
      if (r.status === 401 || r.status === 403) throw new CanvasError("Signed out of Canvas", r.status);
      if (!r.ok) throw new CanvasError(`Canvas answered ${r.status} for ${path.split("?")[0]}`, r.status);
      const text = (await r.text()).replace(/^while\(1\);/, "");
      const json = JSON.parse(text);
      if (!Array.isArray(json)) return json;
      out.push(...json);
      const next = (r.headers.get("Link") || "").split(",").find((l) => /rel="next"/.test(l));
      url = next ? next.slice(next.indexOf("<") + 1, next.indexOf(">")) : null;
    }
    return out;
  }

  // run `fn` over `xs`, at most `n` at a time
  async function pool(xs, n, fn) {
    const out = new Array(xs.length); let i = 0;
    await Promise.all(Array.from({ length: Math.min(n, xs.length) }, async () => { while (i < xs.length) { const k = i++; try { out[k] = await fn(xs[k]); } catch (e) { out[k] = { error: e }; } } }));
    return out;
  }

  // links into the apps PocketCanvas reads dates from (lib/apps.js): WeBWorK sets and Gradescope courses
  const APP = /\/webwork2\/[^\s"'<>]+|gradescope\.com\/courses\/\d+[^\s"'<>]*/i;
  const appLinks = (a) => {
    const out = [], tool = a.external_tool_tag_attributes && a.external_tool_tag_attributes.url;
    if (tool && APP.test(tool)) out.push(tool);
    for (const m of String(a.description || "").matchAll(/href="([^"]+)"/g)) if (APP.test(m[1])) out.push(m[1].replace(/&amp;/g, "&"));
    return out.length ? out : undefined;
  };
  // Canvas launches WeBWorK for it: a set, or WeBWorK's LTI launch (not a course home, which is a whole-course grade column)
  const inWebwork = (tool) => {
    if (!tool || !/\/webwork2\//i.test(tool)) return false;
    const r = PC.apps && PC.apps.wwFromUrl(tool);
    return !(r && !r.set);
  };
  const text = (html, n) => String(html || "").replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ").replace(/<br\s*\/?>|<\/p>|<\/li>|<\/div>/gi, "\n").replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/[ \t]+/g, " ").replace(/\n\s*/g, "\n").trim().slice(0, n);

  function course(c, origin) {
    const e = (c.enrollments || []).find((x) => x.type === "student" || x.type === "StudentEnrollment") || (c.enrollments || [])[0] || {};
    const term = c.term || {};
    const ends = [term.end_at, c.end_at].map((t) => (t ? Date.parse(t) : null)).filter(Boolean);
    return {
      id: String(c.id), name: c.name || c.course_code || "Course " + c.id, original: c.original_name || "", code: c.course_code || "", term: term.name || "",
      termEnd: ends.length ? Math.max(...ends) : null, concluded: !!c.concluded || c.workflow_state === "completed",
      score: e.computed_current_score != null ? e.computed_current_score : e.current_period_computed_current_score != null ? e.current_period_computed_current_score : null,
      grade: e.computed_current_grade || e.current_period_computed_current_grade || null,
      role: e.type || "", image: c.image_download_url || null, fav: !!c.is_favorite, url: `${origin}/courses/${c.id}`,
    };
  }

  /** One assignment (with your submission) as the cache keeps it. */
  function assignment(a, courseId) {
    const s = a.submission || {};
    return {
      id: String(a.id), course: courseId, title: a.name, url: a.html_url, due: a.due_at ? Date.parse(a.due_at) : null,
      unlock: a.unlock_at ? Date.parse(a.unlock_at) : null, lock: a.lock_at ? Date.parse(a.lock_at) : null,
      points: a.points_possible, types: a.submission_types || [], quiz: !!a.quiz_id || (a.submission_types || []).includes("online_quiz"),
      discussion: (a.submission_types || []).includes("discussion_topic"), group: a.assignment_group_id ? String(a.assignment_group_id) : null,
      state: s.workflow_state || "unsubmitted", submittedAt: s.submitted_at ? Date.parse(s.submitted_at) : null,
      gradedAt: s.graded_at && s.score != null ? Date.parse(s.graded_at) : null, score: s.score, grade: s.grade, excused: !!s.excused,
      missing: !!s.missing, late: !!s.late, created: a.created_at ? Date.parse(a.created_at) : null, desc: text(a.description, 1500), apps: appLinks(a),
      ww: inWebwork(a.external_tool_tag_attributes && a.external_tool_tag_attributes.url) || undefined,
    };
  }
  /** Read one assignment, for a page whose work isn't in the cache (a ghosted class, or posted since the last read). */
  async function one(origin, courseId, id) {
    const a = await get(origin, `/api/v1/courses/${courseId}/assignments/${id}?include[]=submission`);
    return a && a.id ? Object.assign(assignment(a, String(courseId)), { first: 1 }) : null;
  }

  /** Load everything for `origin` ("https://canvas.ucsb.edu"). `skip(courseId)` says which classes to leave out. */
  async function load(origin, skip) {
    const now = Date.now(), iso = (t) => new Date(t).toISOString();
    const raw = await get(origin, "/api/v1/courses?include[]=term&include[]=total_scores&include[]=current_grading_period_scores&include[]=concluded&include[]=favorites&include[]=course_image&per_page=100");
    const courses = raw.filter((c) => c && c.id && !c.access_restricted_by_date).map((c) => course(c, origin));
    let colors = {};
    try { colors = (await get(origin, "/api/v1/users/self/colors")).custom_colors || {}; } catch (e) { /* colours are optional */ }
    for (const c of courses) c.canvasColor = colors["course_" + c.id] || null;
    const want = courses.filter((c) => !(skip && skip(c)));
    const lists = await pool(want, 4, (c) => get(origin, `/api/v1/courses/${c.id}/assignments?include[]=submission&order_by=due_at&per_page=100`));
    const assignments = [];
    want.forEach((c, i) => {
      const l = lists[i];
      if (!Array.isArray(l)) { c.loadError = (l && l.error && l.error.message) || "not loaded"; return; }
      for (const a of l) if (a.published !== false) assignments.push(assignment(a, c.id));
    });
    // module links into WeBWorK or Gradescope: how a class with no Canvas assignments for its homework says where it is
    const links = [];
    const mods = await pool(want, 4, (c) => get(origin, `/api/v1/courses/${c.id}/modules?include[]=items&per_page=50`));
    want.forEach((c, i) => {
      if (!Array.isArray(mods[i])) return;
      for (const m of mods[i]) for (const it of m.items || []) {
        const u = it.external_url || "";
        if ((it.type === "ExternalTool" || it.type === "ExternalUrl") && APP.test(u)) links.push({ course: c.id, title: it.title || "", url: u, launch: it.html_url || null, module: m.name || "" });
      }
    });
    let planner = [];
    try {
      planner = (await get(origin, `/api/v1/planner/items?start_date=${iso(now - 30 * 864e5)}&end_date=${iso(now + 200 * 864e5)}&per_page=100`)).map((p) => ({
        type: p.plannable_type, id: String(p.plannable_id), course: p.course_id ? String(p.course_id) : null, title: (p.plannable && (p.plannable.title || p.plannable.name)) || "",
        url: p.html_url ? (p.html_url.startsWith("http") ? p.html_url : origin + p.html_url) : null, date: p.plannable_date ? Date.parse(p.plannable_date) : null,
        assignment: p.plannable && p.plannable.assignment_id ? String(p.plannable.assignment_id) : null, done: !!(p.planner_override && p.planner_override.marked_complete),
        newActivity: !!p.new_activity, submitted: !!(p.submissions && p.submissions.submitted),
      }));
    } catch (e) { /* the planner is a bonus */ }
    const announcements = {};
    try {
      if (want.length) {
        const ctx = want.map((c) => "context_codes[]=course_" + c.id).join("&");
        for (const a of await get(origin, `/api/v1/announcements?${ctx}&start_date=${iso(now - 21 * 864e5)}&end_date=${iso(now + 864e5)}&per_page=50`)) {
          const cid = String(a.context_code || "").replace("course_", "");
          (announcements[cid] = announcements[cid] || []).push({ id: String(a.id), title: a.title, url: a.html_url, at: Date.parse(a.posted_at || a.created_at), unread: a.read_state === "unread" });
        }
      }
    } catch (e) { /* optional */ }
    return { origin, host: new URL(origin).host, at: now, courses, assignments, planner, announcements, links, loaded: want.map((c) => c.id) };
  }

  PC.canvas = { get, load, one, assignment, CanvasError, text };
})(globalThis);
