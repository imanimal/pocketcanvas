/* PocketCanvas: due dates from the apps your homework actually lives in. Some classes post WeBWorK or Gradescope
   work on Canvas with no due date, or not at all; PocketCanvas reads those apps with your own browser sign-in
   (UCSB SSO, Google, a password: whatever you used) and fills the dates in.

   Finding them (no setup): Canvas assignments and module items that link into an app (an external tool URL
   https://<host>/webwork2/<course>/<set>/, a link in the description, a Gradescope course) say which app course
   goes with which class. A link you add to a class yourself (class settings → Your links) counts too, and a
   course whose code matches the class's ("math4B-01-f26-x" → MATH 4B) is used when nothing links it.

   Reading: the background fetches each WeBWorK course home (its set list; Collegiapp's core webwork.rs documents
   the page) and Gradescope's /account and course pages (core gradescope.rs) every 20 minutes, which also keeps
   WeBWorK's 30-minute session alive. Visiting those pages yourself saves what they show too
   (content/apps-page.js), and a WeBWorK course that only opens from Canvas is read set by set. Dates once read
   stay until the app shows new ones, so a signed-out app keeps the dates it had.

   Applying (fromCache): a Canvas item with no due date takes its app's ("dueBy: app"; your own date still wins),
   and a Gradescope submission marks it submitted. App work with no Canvas item at all joins the class's list. */
(function (g) {
  const PC = (g.PC = g.PC || {});
  const DAY = 864e5;
  // an element's words with a space at every tag (like core gradescope.rs text()), so "PDT.<br>Afterward" splits
  function txt(el) {
    if (!el) return "";
    const out = [];
    const walk = (n) => { for (const c of n.childNodes) { if (c.nodeType === 3) out.push(c.nodeValue); else if (c.nodeType === 1 && !/^(SCRIPT|STYLE)$/i.test(c.nodeName)) { out.push(" "); walk(c); out.push(" "); } } };
    walk(el);
    return out.join("").replace(/\s+/g, " ").trim();
  }
  const parse = (html) => new DOMParser().parseFromString(html, "text/html");

  // ── WeBWorK ──
  const WW_PAGES = new Set(["hardcopy", "options", "grades", "instructor", "achievements", "feedback", "logout", "equation_display", "show_me_another", "problem_list", "render_rpc"]);
  const WW_NOT_COURSE = new Set(["admin", "ltiadvantage", "ltiadvanced", "lti", "html2xml", "render_rpc", "instructorXMLHandler", "images", "htdocs", "login", "logout", "course_admin"]);
  /** "https://webwork.math.ucsb.edu/webwork2/math4B-01-f26-x/Homework_3/?user=y" → { base, id, set: "Homework_3", code: "MATH 4B" } */
  function wwFromUrl(u) {
    let url; try { url = new URL(u); } catch (e) { return null; }
    const segs = url.pathname.split("/").filter(Boolean);
    const at = segs.indexOf("webwork2");
    if (at < 0 || !segs[at + 1] || WW_NOT_COURSE.has(segs[at + 1]) || !/^[\w.-]+$/.test(segs[at + 1])) return null;
    const id = segs[at + 1], set = segs[at + 2] && !WW_PAGES.has(segs[at + 2]) && /^[\w.-]+$/.test(segs[at + 2]) ? decodeURIComponent(segs[at + 2]) : null;
    const base = `${url.origin}/${segs.slice(0, at + 1).join("/")}`;
    return { base, id, set, code: wwCode(id), key: base + "/" + id, home: `${base}/${id}/` };
  }
  /** "math34A-01-f26-blee" → "MATH 34A" (core webwork.rs course_code) */
  function wwCode(id) {
    const first = id.split(/[-_]/)[0], d = first.search(/\d/);
    return (d > 0 && /^[a-z]+$/i.test(first.slice(0, d)) ? `${first.slice(0, d)} ${first.slice(d)}` : first).toUpperCase();
  }
  const ZONES = { UTC: 0, GMT: 0, Z: 0, PST: -8, AKDT: -8, PDT: -7, MST: -7, MDT: -6, CST: -6, CDT: -5, EST: -5, EDT: -4, AKST: -9, HST: -10 };
  const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  // California's offset at a local time: daylight from the second Sunday of March to the first of November, 2 a.m.
  function pacific(y, mo, d, h) {
    const sunday = (m, n) => { const f = new Date(Date.UTC(y, m, 1)).getUTCDay(); return 1 + ((7 - f) % 7) + 7 * (n - 1); };
    const t = Date.UTC(y, mo, d, h), from = Date.UTC(y, 2, sunday(2, 2), 2), to = Date.UTC(y, 10, sunday(10, 1), 2);
    return t >= from && t < to ? -7 : -8;
  }
  const DATE_RE = /(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+at)?\s+(\d{1,2}):(\d{2})(?::\d{2})?\s*([aApP][mM])?(?:\s+([A-Z]{1,4}|[+-]\d{2}:?\d{2})\b)?|([A-Z][a-z]{2,8})\.? (\d{1,2}), (\d{4})(?:,| at)\s+(\d{1,2}):(\d{2})(?::\d{2})?\s*([AP]M)(?:\s+([A-Z]{1,4}|[+-]\d{2}:?\d{2})\b)?/;
  /** A date as WeBWorK prints it ("11/05/2026 at 11:59pm PST", "November 5, 2026 at 11:59:00 PM PST") → ms. No zone reads as Pacific. */
  function wwDate(s) {
    const m = String(s || "").match(DATE_RE); if (!m) return null;
    let y, mo, d, h, mi, ap, z;
    if (m[1]) [y, mo, d, h, mi, ap, z] = [+m[3], +m[1] - 1, +m[2], +m[4], +m[5], m[6], m[7]];
    else { mo = MONTHS.indexOf(m[8].slice(0, 3).toLowerCase()); if (mo < 0) return null; [y, d, h, mi, ap, z] = [+m[10], +m[9], +m[11], +m[12], m[13], m[14]]; }
    if (ap) { ap = ap.toLowerCase(); if (h === 12) h = 0; if (ap === "pm") h += 12; }
    let off;
    if (z && ZONES[z.toUpperCase()] != null) off = ZONES[z.toUpperCase()] * 60;
    else if (z && /^[+-]/.test(z)) { const dd = z.replace(":", ""); off = (dd[0] === "-" ? -1 : 1) * (+dd.slice(1, 3) * 60 + +dd.slice(3, 5)); }
    else off = pacific(y, mo, d, h) * 60;
    return Date.UTC(y, mo, d, h, mi) - off * 60e3;
  }
  /** A set from its status sentence: "Open, closes D." · "Open, due D. Afterward reduced credit… until D2." · "Will open on D." · "Closed, …" */
  function wwStatus(set, status) {
    for (const raw of status.split(/\.\s+|\.$/)) {
      const s = raw.trim(), l = s.toLowerCase();
      if (l.startsWith("will open on")) set.opens = wwDate(s);
      else if (/^open, (closes|due)\b/.test(l) || l.startsWith("due date")) set.due = wwDate(s);
      else if (l.includes("reduced credit") && l.includes(" until ")) set.lateDue = wwDate(s.slice(l.lastIndexOf(" until ")));
      else if (l.startsWith("closed")) set.closed = true;
    }
    return set;
  }
  const wwIsLogin = (d) => !d.querySelector(".problem_set_table") && (!!d.querySelector("#login_form") || /external authentication system/i.test(txt(d.body)));
  const wwLmsOnly = (d) => !d.querySelector(".problem_set_table") && /You must access assignments from your Course Management System/i.test(txt(d.body));
  /** The set rows of a course home. */
  function wwSets(d, course) {
    const out = [];
    for (const tr of d.querySelectorAll("table.problem_set_table tr")) {
      const td = tr.querySelectorAll("td"); if (td.length < 2) continue;
      const name = txt(td[0]); if (!name) continue;
      const a = td[0].querySelector("a[href]"), ref = a && wwFromUrl(new URL(a.getAttribute("href"), course.home).href);
      const id = (ref && ref.set) || name.replace(/ /g, "_");
      out.push(wwStatus({ id, name, url: `${course.home}${encodeURIComponent(id)}/`, opens: null, due: null, lateDue: null, closed: false }, txt(td[1])));
    }
    return out;
  }
  /** One set's own page (for courses that only open from Canvas): its name and dates, read from its words. */
  function wwSetPage(d, ref) {
    const body = txt(d.querySelector("#content, main, #page-body, body"));
    if (!body || wwIsLogin(d)) return null;
    const after = (re) => { const m = body.match(re); return m ? wwDate(body.slice(m.index + m[0].length, m.index + m[0].length + 60)) : null; };
    const set = { id: ref.set, name: (txt(d.querySelector("#page-title h1, h1, h2")) || ref.set.replace(/_/g, " ")).replace(/^Homework Sets?$/i, ref.set.replace(/_/g, " ")), url: `${ref.home}${encodeURIComponent(ref.set)}/`, opens: null, due: null, lateDue: null, closed: false };
    set.due = after(/\b(?:closes|is due|due)(?: on| date)?\s*:?\s*/i);
    set.opens = after(/\bwill open on\s*/i);
    set.lateDue = /reduced credit/i.test(body) ? after(/reduced credit[^.]*?until\s*/i) : null;
    set.closed = /\b(this (set|assignment) is closed|closed, answers)/i.test(body);
    return set.due || set.opens || set.closed ? set : null;
  }

  // ── Gradescope ──
  const GS = "https://www.gradescope.com";
  const gsIsLogin = (d) => !!d.querySelector('form[action$="/login"], form[action$="/login/"]') && !d.querySelector(".courseBox, .submissionTimeChart");
  function gsCourses(d) {
    let student = !d.querySelector(".js-createNewCourse"), term = "";
    const out = [];
    for (const el of d.querySelectorAll(".pageHeading, .courseList--term, a.courseBox")) {
      if (el.classList.contains("pageHeading")) { const h = txt(el).toLowerCase(); if (h.includes("student")) student = true; else if (h.includes("instructor")) student = false; }
      else if (el.classList.contains("courseList--term")) term = txt(el);
      else if (student) {
        const m = (el.getAttribute("href") || "").match(/\/courses\/(\d+)/), short = txt(el.querySelector(".courseBox--shortname"));
        if (m && short && !out.some((c) => c.id === m[1])) out.push({ id: m[1], short, name: txt(el.querySelector(".courseBox--name")), term, code: gsCode(short) });
      }
    }
    return out;
  }
  const gsTime = (s) => { const m = String(s || "").match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}(?::\d{2})?)\s*([+-]\d{2}):?(\d{2})$/); const t = m ? Date.parse(`${m[1]}T${m[2]}${m[3]}:${m[4]}`) : Date.parse(s); return isNaN(t) ? null : t; };
  function gsAssignments(d, courseId) {
    const out = [];
    for (const tr of d.querySelectorAll("tr")) {
      if ((tr.className || "").includes("dropzonePreview")) continue;
      const cells = tr.querySelectorAll("th, td"); if (!cells.length) continue;
      const dues = [...tr.querySelectorAll("[datetime].submissionTimeChart--dueDate")].map((t) => gsTime(t.getAttribute("datetime"))).filter(Boolean);
      const idEl = cells[0].querySelector("[data-assignment-id]"), link = cells[0].querySelector('a[href*="/assignments/"]');
      const id = (idEl && /^\d+$/.test(idEl.dataset.assignmentId) && idEl.dataset.assignmentId) || (link && ((link.getAttribute("href").match(/\/assignments\/(\d+)/) || [])[1])) || null;
      const name = txt(cells[0]);
      if (!name || (!id && !dues.length)) continue;
      const status = txt(cells[1]), sm = status.match(/([\d.]+)\s*\/\s*([\d.]+)/);
      const rel = tr.querySelector("[datetime].submissionTimeChart--releaseDate");
      out.push({ id, name, status, score: sm ? +sm[1] : null, points: sm ? +sm[2] : null, release: rel ? gsTime(rel.getAttribute("datetime")) : null, due: dues[0] || null, lateDue: dues[1] || null,
        submitted: !!sm || (/submitted/i.test(status) && !/no submission/i.test(status)), url: id ? `${GS}/courses/${courseId}/assignments/${id}` : `${GS}/courses/${courseId}` });
    }
    return out;
  }
  /** "CMPSC16" → "CMPSC 16", "Math 4B - Fall 2026" → "MATH 4B": words up to the first with a number (core gradescope.rs course_code) */
  function gsCode(short) {
    const words = [];
    for (const w0 of short.split(/\s+/)) {
      const w = w0.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ""); if (!w) continue;
      const d = w.search(/\d/);
      if (d >= 0) { if (d > 0 && /^\p{L}+$/u.test(w.slice(0, d))) words.push(w.slice(0, d), w.slice(d)); else words.push(w); break; }
      words.push(w);
    }
    return (words.join(" ") || short.trim()).toUpperCase();
  }

  // ── matching ──
  /** "HW 5", "Homework_5", "Homework #5 (Sections 3.1 & 3.2)" → "homework 5 sections 3.1 3.2" */
  const norm = (t) => String(t || "").toLowerCase().replace(/[_#]+/g, " ").replace(/\b(hw|hmwk|hwk)\s*(?=\d)/g, "homework ").replace(/\b(hw|hmwk|hwk)\b/g, "homework").replace(/\bwk\b/g, "week")
    .replace(/(\d)\.(?=\d)/g, "$1\u0001").replace(/[^a-z0-9\u0001]+/g, " ").replace(/\u0001/g, ".").trim().replace(/\s+/g, " ");
  const nums = (n) => n.match(/\d+(?:\.\d+)?/g) || [];
  const KIND = /^(homework|quiz|exam|midterm|lab|project|section|chapter|week|reading|worksheet|problem set|pset|discussion)/;
  function sameWork(a, b) {
    const x = norm(a), y = norm(b);
    if (!x || !y) return false;
    if (x === y) return true;
    const nx = nums(x), ny = nums(y), kx = (x.match(KIND) || [])[1], ky = (y.match(KIND) || [])[1];
    if (nx.length && nx[0] === ny[0] && kx && kx === ky) return true;
    const [s, l] = x.length < y.length ? [x, y] : [y, x];
    return s.length >= 8 && (l.startsWith(s + " ") || l.endsWith(" " + s));
  }
  /** "MATH 4B" names this Canvas class? Its code, name or original name holds it as whole words. */
  const codeKey = (s) => String(s || "").toUpperCase().replace(/([A-Z])\s*(\d)/g, "$1 $2").replace(/[^A-Z0-9]+/g, " ").trim();
  function classFor(code, courses, term) {
    const k = codeKey(code); if (!k) return null;
    const hits = courses.filter((c) => [c.code, c.name, c.original].some((s) => (" " + codeKey(s) + " ").includes(" " + k + " ")));
    if (hits.length < 2) return hits[0] || null;
    // the same class from several terms: the current one (not ended), else the latest
    return hits.find((c) => !c.concluded && (c.termEnd == null || c.termEnd > Date.now())) || hits.sort((a, b) => (b.termEnd || 0) - (a.termEnd || 0))[0];
  }

  /** App courses → the Canvas class each belongs to, and set → Canvas assignment links. */
  function links(cache, courseFlags) {
    const ww = {}, gs = {}, host = cache.host;
    const note = (u, course, launch, title) => {
      const r = wwFromUrl(u);
      if (r) { const e = (ww[r.key] = ww[r.key] || Object.assign({}, r, { canvas: course, sets: {} })); if (!e.canvas) e.canvas = course; if (r.set) e.sets[r.set] = { launch, title }; if (launch && !e.launch) e.launch = launch; return; }
      const m = String(u).match(/gradescope\.com\/courses\/(\d+)(?:\/assignments\/(\d+))?/);
      if (m) { const e = (gs[m[1]] = gs[m[1]] || { id: m[1], canvas: course, assignments: {} }); if (m[2]) e.assignments[m[2]] = { launch, title }; }
    };
    for (const a of cache.assignments || []) for (const u of a.apps || []) note(u, a.course, a.url, a.title);
    for (const l of cache.links || []) note(l.url, l.course, l.launch, l.title);
    for (const c of cache.courses || []) for (const l of ((courseFlags || {})[host + "/" + c.id] || {}).links || []) note(l.url, c.id, null, null);
    return { ww, gs };
  }

  /** Work entries from the apps, each with the Canvas class it belongs to (or none). */
  function entries(cache, apps, courseFlags) {
    const out = [], L = links(cache, courseFlags), courses = cache.courses || [];
    for (const [key, c] of Object.entries((apps && apps.webwork) || {})) {
      const canvas = (L.ww[key] && L.ww[key].canvas) || (classFor(c.code, courses) || {}).id || null;
      for (const s of Object.values(c.sets || {})) {
        if (s.closed && !s.due) continue;
        out.push({ app: "webwork", appName: "WeBWorK", ext: `${c.id}/${s.id}`, course: canvas, courseText: c.code, title: s.name, url: s.url, due: s.due, lateDue: s.lateDue, unlock: s.opens, closed: s.closed, set: s.id, wwKey: key });
      }
    }
    const gsc = (apps && apps.gradescope && apps.gradescope.courses) || {};
    for (const c of Object.values(gsc)) {
      const canvas = (L.gs[c.id] && L.gs[c.id].canvas) || (classFor(c.code, courses) || {}).id || null;
      for (const a of c.assignments || []) out.push({ app: "gradescope", appName: "Gradescope", ext: `${c.id}/${a.id || "name:" + norm(a.name).replace(/ /g, "-")}`, course: canvas, courseText: c.code, title: a.name, url: a.url, due: a.due, lateDue: a.lateDue, unlock: a.release, submitted: a.submitted, score: a.score, points: a.points, gsId: a.id, gsCourse: c.id });
    }
    return { list: out, L };
  }

  /** Fold app work into the work items fromCache made (see the header). Mutates and returns `out`. */
  function merge(out, cache, apps, courseFlags) {
    if (!apps || !cache) return out;
    const { list, L } = entries(cache, apps, courseFlags), now = Date.now(), used = new Set();
    const byCourse = new Map();
    for (const e of list) { if (!byCourse.has(e.course)) byCourse.set(e.course, []); byCourse.get(e.course).push(e); }
    for (const w of out) {
      if (w.src !== "assignment" && w.src !== "discussion_topic" && w.src !== "wiki_page") continue;
      const cands = byCourse.get(w.course) || [];
      const a = (cache.assignments || []).find((x) => x.id === w.id && w.src === "assignment");
      const exact = (a && a.apps || []).map((u) => { const r = wwFromUrl(u); if (r && r.set) return `webwork:${r.id}/${r.set}`; const m = u.match(/gradescope\.com\/courses\/(\d+)\/assignments\/(\d+)/); return m ? `gradescope:${m[1]}/${m[2]}` : null; }).filter(Boolean);
      const e = cands.find((x) => !used.has(x) && exact.includes(`${x.app}:${x.ext}`)) || cands.find((x) => !used.has(x) && sameWork(x.title, w.title));
      if (!e) continue;
      used.add(e);
      w.app = { app: e.app, name: e.appName, ext: e.ext, url: e.url, due: e.due, lateDue: e.lateDue };
      if (w.canvasDue == null && e.due) w.appDue = e.due;
      if (e.submitted && w.status === "todo") w.status = e.score != null ? "graded" : "submitted";
      if (e.score != null && w.score == null) { w.score = e.score; if (!w.points) w.points = e.points; }
    }
    for (const e of list) {
      if (used.has(e)) continue;
      // past work stays out unless it's still open for credit (or, on Gradescope, never turned in in the last week)
      const end = e.lateDue || e.due;
      if (e.app === "webwork" && (e.closed || (end && end < now - DAY))) continue;
      if (e.app === "gradescope" && end && end < now - (e.submitted ? DAY : 7 * DAY)) continue;
      out.push({ key: `x${e.app}:${e.ext}`, id: e.ext, src: e.app, course: e.course, courseText: e.course ? null : e.courseText, title: e.title, url: e.url, kind: PC.work.kindOf(e.title), canvasDue: null, appDue: e.due, unlock: e.unlock,
        points: e.points, score: e.score, status: e.submitted ? (e.score != null ? "graded" : "submitted") : "todo", noSubmit: false, first: 1, app: { app: e.app, name: e.appName, ext: e.ext, url: e.url, due: e.due, lateDue: e.lateDue } });
    }
    return out;
  }

  // ── reading ──
  const WW_EVERY = 20 * 60e3;
  async function fetchDoc(url) {
    const r = await fetch(url, { credentials: "include", redirect: "follow", headers: { Accept: "text/html" } });
    if (!r.ok) throw new Error(`answered ${r.status}`);
    return parse(await r.text());
  }
  const can = async (origin) => { try { return await PC.api.permissions.contains({ origins: [origin + "/*"] }); } catch (e) { return false; } };
  /** Merge a patch into storage "apps" (pages and the background both write it). */
  async function save(fn) {
    const cur = (await PC.store.local("apps", null)) || { webwork: {}, gradescope: { courses: {} } };
    cur.webwork = cur.webwork || {}; cur.gradescope = cur.gradescope || { courses: {} }; cur.gradescope.courses = cur.gradescope.courses || {};
    fn(cur);
    await PC.store.setLocal("apps", cur);
    return cur;
  }
  /** Store one WeBWorK page's sets: a course home (every set) or a set page (that one). */
  function wwStore(cur, ref, sets, status) {
    const e = (cur.webwork[ref.key] = cur.webwork[ref.key] || { base: ref.base, id: ref.id, code: ref.code, sets: {} });
    e.at = Date.now(); e.status = status; e.error = null;
    if (sets && status === "ok") { const keep = {}; for (const s of sets) keep[s.id] = Object.assign({}, e.sets[s.id] || {}, s); e.sets = keep; }
    else if (sets) for (const s of sets) e.sets[s.id] = Object.assign({}, e.sets[s.id] || {}, s);
  }
  /** Read every app that links into your classes (background, every 20 minutes or when asked). */
  async function refresh(S, force) {
    const cache = S.cache; if (!cache || S.settings.apps === false) return null;
    const have = (await PC.store.local("apps", null)) || {};
    const L = links(cache, S.courseFlags), report = [];
    // WeBWorK: linked courses plus any you visited
    const ww = Object.assign({}, L.ww);
    for (const [k, c] of Object.entries(have.webwork || {})) if (!ww[k]) ww[k] = { base: c.base, id: c.id, code: c.code, key: k, home: `${c.base}/${c.id}/`, sets: {} };
    for (const ref of Object.values(ww)) {
      const prev = (have.webwork || {})[ref.key];
      if (!force && prev && Date.now() - prev.at < WW_EVERY - 30e3) continue;
      const origin = new URL(ref.base).origin;
      if (!(await can(origin))) { await save((cur) => { wwStore(cur, ref, null, "noaccess"); }); report.push(`${ref.code}: allow ${new URL(origin).host}`); continue; }
      try {
        const d = await fetchDoc(ref.home);
        if (d.querySelector(".problem_set_table")) { const sets = wwSets(d, ref); await save((cur) => wwStore(cur, ref, sets, "ok")); continue; }
        if (wwIsLogin(d)) { await save((cur) => wwStore(cur, ref, null, "signedout")); report.push(`${ref.code}: signed out`); continue; }
        // a course that only opens from Canvas: read the sets Canvas links to, one page each
        const sets = [];
        for (const set of Object.keys(ref.sets || {})) {
          try { const sd = await fetchDoc(`${ref.home}${encodeURIComponent(set)}/`); const s = wwSetPage(sd, Object.assign({}, ref, { set })); if (s) sets.push(s); } catch (e) { /* next set */ }
        }
        await save((cur) => wwStore(cur, ref, sets, wwLmsOnly(d) ? (sets.length ? "lms" : "signedout") : "ok"));
      } catch (e) { await save((cur) => { wwStore(cur, ref, null, "error"); cur.webwork[ref.key].error = e.message; }); report.push(`${ref.code}: ${e.message}`); }
    }
    // Gradescope: when a class links to it, or you've used it before
    const gsWanted = Object.keys(L.gs).length || Object.keys((have.gradescope || {}).courses || {}).length || S.settings.gradescope === true;
    const gsPrev = have.gradescope || {};
    if (gsWanted && S.settings.gradescope !== false && (force || !gsPrev.at || Date.now() - gsPrev.at > WW_EVERY - 30e3)) {
      if (!(await can(GS))) await save((cur) => { cur.gradescope.status = "noaccess"; cur.gradescope.at = Date.now(); });
      else {
        try {
          const d = await fetchDoc(GS + "/account");
          if (gsIsLogin(d)) { await save((cur) => { cur.gradescope.status = "signedout"; cur.gradescope.at = Date.now(); }); report.push("Gradescope: signed out"); }
          else {
            const all = gsCourses(d), term = all.length ? all[0].term : "", now2 = all.filter((c) => c.term === term);
            const read = {};
            for (const c of now2) { try { read[c.id] = Object.assign({}, c, { at: Date.now(), assignments: gsAssignments(await fetchDoc(`${GS}/courses/${c.id}`), c.id) }); } catch (e) { read[c.id] = Object.assign({}, gsPrev.courses && gsPrev.courses[c.id] || c, { error: e.message }); } }
            await save((cur) => { cur.gradescope = { at: Date.now(), status: "ok", term, courses: read }; });
          }
        } catch (e) { await save((cur) => { cur.gradescope.status = "error"; cur.gradescope.error = e.message; cur.gradescope.at = Date.now(); }); }
      }
    }
    return report;
  }

  /** What a page of an app shows, saved as you browse it (content/apps-page.js). */
  async function fromPage(d, url) {
    const ref = wwFromUrl(url);
    if (ref) {
      if (d.querySelector(".problem_set_table")) { const sets = wwSets(d, ref); return save((cur) => wwStore(cur, ref, sets, "ok")); }
      if (ref.set) { const s = wwSetPage(d, ref); if (s) return save((cur) => wwStore(cur, ref, [s], ((cur.webwork[ref.key] || {}).status) === "ok" ? "ok" : "lms")); }
      return null;
    }
    if (/(^|\.)gradescope\.com$/.test(new URL(url).host)) {
      const p = new URL(url).pathname, m = p.match(/^\/courses\/(\d+)\/?$/);
      if (p === "/account" || p === "/") { const cs = gsCourses(d); if (!cs.length) return null; return save((cur) => { for (const c of cs.filter((x) => x.term === cs[0].term)) cur.gradescope.courses[c.id] = Object.assign({ assignments: [] }, cur.gradescope.courses[c.id] || {}, c); cur.gradescope.term = cs[0].term; }); }
      if (m) {
        const as = gsAssignments(d, m[1]); if (!as.length) return null;
        const short = txt(d.querySelector(".courseHeader--title, .sidebar--title, h1"));
        return save((cur) => { const c = (cur.gradescope.courses[m[1]] = cur.gradescope.courses[m[1]] || { id: m[1], short, name: "", term: "", code: gsCode(short) }); c.assignments = as; c.at = Date.now(); cur.gradescope.status = cur.gradescope.status || "ok"; });
      }
    }
    return null;
  }

  /** For settings: each app course with its class, status and how many dates it gives. */
  function summary(S) {
    const cache = S.cache, apps = S.apps || {}, out = [];
    if (!cache) return out;
    const L = links(cache, S.courseFlags), courses = cache.courses || [];
    const ww = Object.assign({}, L.ww);
    for (const [k, c] of Object.entries(apps.webwork || {})) if (!ww[k]) ww[k] = { base: c.base, id: c.id, code: c.code, key: k };
    for (const ref of Object.values(ww)) {
      const st = (apps.webwork || {})[ref.key] || {}, cid = ref.canvas || (classFor(ref.code, courses) || {}).id;
      out.push({ app: "WeBWorK", key: ref.key, code: ref.code, id: ref.id, origin: new URL(ref.base).origin, home: `${ref.base}/${ref.id}/`, launch: ref.launch || null, course: courses.find((c) => c.id === cid) || null,
        status: st.status || "new", at: st.at || 0, sets: Object.keys(st.sets || {}).length, error: st.error });
    }
    const gs = apps.gradescope || {};
    const gsIds = new Set(Object.keys(L.gs).concat(Object.keys(gs.courses || {})));
    for (const id of gsIds) {
      const c = (gs.courses || {})[id] || { id, code: "" }, cid = (L.gs[id] && L.gs[id].canvas) || (classFor(c.code, courses) || {}).id;
      out.push({ app: "Gradescope", key: "gs" + id, code: c.short || c.code || "Course " + id, id, origin: GS, home: `${GS}/courses/${id}`, course: courses.find((x) => x.id === cid) || null,
        status: gs.status || "new", at: c.at || gs.at || 0, sets: (c.assignments || []).length, error: c.error || gs.error });
    }
    return out;
  }

  PC.apps = { wwFromUrl, wwCode, wwDate, wwStatus, wwSets, wwSetPage, wwIsLogin, wwLmsOnly, gsCourses, gsAssignments, gsCode, gsTime, gsIsLogin, norm, sameWork, classFor, links, entries, merge, refresh, fromPage, summary, parse, GS };
})(globalThis);
