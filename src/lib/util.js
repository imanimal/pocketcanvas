/* PocketCanvas: shared helpers for every context (background, Canvas pages, popup, board, options). Classic scripts
   on globalThis.PC, no bundler and no npm. Load order everywhere: util → icons → themes → work → (canvas-api,
   collegiapp) → the context's own script.

   Storage: storage.sync holds the small things worth having on every computer (settings, course flags);
   storage.local holds the rest (the Canvas cache, item flags, your own tasks, imported themes). Signed in with Google,
   lib/cloud.js also keeps the ones you made in your account. */
(function (g) {
  const PC = (g.PC = g.PC || {});
  const api = (PC.api = g.browser || g.chrome);
  const MIN = 60e3, HR = 60 * MIN, DAY = 24 * HR;

  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const DEFAULTS = {
    v: 1,
    // look
    theme: "pocket-cream", nightTheme: "pocket-night", night: "auto", nightFrom: "20:00", nightTo: "07:00", restyle: true,
    // Canvas
    hosts: [], dock: true, openMenu: true, tabOrder: true, tabTitles: true, favicons: true, fullWidth: true, hideLogo: false, hideFeedback: false,
    // dashboard
    cardWork: true, cardItems: 4, cardGrades: true, gradeHover: false, condensed: false, replaceTodo: true, dashNote: true, gpa: false,
    // lists
    relDates: true, clock24: false, showDone: false, autoGhostPast: true,
    // grades
    gpaScale: [[97, 4, "A+"], [93, 4, "A"], [90, 3.7, "A-"], [87, 3.3, "B+"], [83, 3, "B"], [80, 2.7, "B-"], [77, 2.3, "C+"], [73, 2, "C"], [70, 1.7, "C-"], [67, 1.3, "D+"], [63, 1, "D"], [60, 0.7, "D-"], [0, 0, "F"]],
    priorGpa: "", priorUnits: "", defaultUnits: 4,
    // reminders
    notifyDue: true, leadHours: [24, 3], notifyNew: true, notifyGrades: true, badge: true,
    // Collegiapp
    capSync: true, blockSites: false,
    // related apps (lib/apps.js): read due dates from WeBWorK and Gradescope; gradescope: "auto" (when a class links to it) | true | false
    apps: true, gradescope: "auto",
    blocklist: ["youtube.com", "reddit.com", "x.com", "twitter.com", "instagram.com", "tiktok.com", "twitch.tv", "facebook.com", "netflix.com", "discord.com"],
  };

  async function area(name) { try { await api.storage[name].get("v"); return api.storage[name]; } catch (e) { return api.storage.local; } }
  const store = {
    async settings() { const a = await area("sync"); const r = await a.get("settings"); return Object.assign({}, DEFAULTS, r.settings || {}); },
    async setSettings(patch) { const a = await area("sync"); const cur = await store.settings(); const next = Object.assign(cur, patch); await a.set({ settings: next }); return next; },
    async courseFlags() { const a = await area("sync"); return (await a.get("courseFlags")).courseFlags || {}; },
    async setCourseFlag(key, patch) { return store.setCourseFlags({ [key]: patch }); },
    /** Several classes' flags in one write: { "<host>/<courseId>": patch }. */
    async setCourseFlags(patches) {
      const a = await area("sync"); const all = (await a.get("courseFlags")).courseFlags || {};
      for (const [key, patch] of Object.entries(patches)) {
        const next = Object.assign({}, all[key] || {}, patch);
        for (const k of Object.keys(next)) if (next[k] === null || next[k] === "" || next[k] === undefined) delete next[k];
        if (Object.keys(next).length) all[key] = next; else delete all[key];
      }
      await a.set({ courseFlags: all }); return all;
    },
    async local(k, d) { const r = await api.storage.local.get(k); return r[k] === undefined ? d : r[k]; },
    async setLocal(k, v) { await api.storage.local.set({ [k]: v }); },
    async itemFlag(key, patch) {
      const all = await store.local("itemFlags", {}); const next = Object.assign({}, all[key] || {}, patch);
      for (const k of Object.keys(next)) if (next[k] === null || next[k] === undefined || next[k] === false) delete next[k];
      if (Object.keys(next).length) all[key] = next; else delete all[key];
      await store.setLocal("itemFlags", all); return all;
    },
    /** Everything the views need, in one read. */
    async all() {
      const [settings, courseFlags, l] = await Promise.all([store.settings(), store.courseFlags(), api.storage.local.get(["cache", "itemFlags", "tasks", "themes", "cap", "seenAt", "focus", "apps", "tabUse", "visits", "cloudAuth", "cloudStatus"])]);
      // the Google account's sync (lib/cloud.js), without its refresh token
      const cloud = Object.assign({ email: l.cloudAuth ? l.cloudAuth.email || "" : null }, l.cloudStatus);
      return { settings, courseFlags, cache: l.cache || null, itemFlags: l.itemFlags || {}, tasks: l.tasks || [], themes: l.themes || [], cap: l.cap || {}, seenAt: l.seenAt || 0, focus: l.focus || null, apps: l.apps || null, tabUse: l.tabUse || {}, visits: l.visits || {}, cloud };
    },
  };

  // ── time and words (docs/UIKit/README.md § 10: "9:30 AM", "Today", "Mon", "Mon, Nov 3", "in 3h", "2h overdue") ──
  const DNM = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"], MNM = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const sod = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
  let H24 = false;
  const time = (t) => { const d = new Date(t), h = d.getHours(), m = String(d.getMinutes()).padStart(2, "0"); return H24 ? `${String(h).padStart(2, "0")}:${m}` : `${h % 12 || 12}:${m} ${h >= 12 ? "PM" : "AM"}`; };
  function day(t, now) {
    const diff = Math.round((sod(t) - sod(now)) / DAY), d = new Date(t);
    if (diff === 0) return "Today"; if (diff === 1) return "Tomorrow"; if (diff === -1) return "Yesterday";
    return diff > 0 && diff < 7 ? DNM[d.getDay()] : `${DNM[d.getDay()]}, ${MNM[d.getMonth()]} ${d.getDate()}`;
  }
  const span = (ms) => { const h = Math.abs(ms) / HR; return h < 1 ? Math.max(1, Math.round(h * 60)) + "m" : h < 48 ? Math.round(h) + "h" : Math.round(h / 24) + "d"; };
  /** A due date as a pill: { t: words, c: "" | soon | hot | over | none, abs: "Fri 11:59 PM" }. */
  function due(t, now, rel = true) {
    if (t == null) return { t: "No due date", c: "none", abs: "" };
    const d = t - now, abs = `${day(t, now)} ${time(t)}`;
    if (d < 0) return { t: span(d) + " overdue", c: "over", abs };
    if (!rel) return { t: abs, c: d < 3 * HR ? "hot" : d < DAY ? "soon" : "", abs };
    if (d < 3 * HR) return { t: "in " + span(d), c: "hot", abs };
    if (d < DAY) return { t: "in " + span(d), c: "soon", abs };
    return { t: day(t, now), c: "", abs };
  }
  /** "2:14:08" under a day, "3D 4H" beyond (Collegiapp's cdText). */
  function countdown(ms) {
    if (ms <= 0) return "NOW";
    const s = Math.floor(ms / 1000), d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
    if (d) return `${d}D ${h}H`;
    return h ? `${h}:${String(m).padStart(2, "0")}:${String(x).padStart(2, "0")}` : `${m}:${String(x).padStart(2, "0")}`;
  }
  const plural = (n, w, ws) => `${n} ${n === 1 ? w : ws || w + "s"}`;
  const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  // a Canvas host from a URL or a typed domain
  const hostOf = (u) => { try { return new URL(/^https?:/.test(u) ? u : "https://" + u).host.toLowerCase(); } catch (e) { return ""; } };
  const BUILTIN_HOSTS = ["canvas.ucsb.edu"];
  const isCanvasHost = (h, settings) => /\.instructure\.com$/.test(h) || BUILTIN_HOSTS.includes(h) || ((settings && settings.hosts) || []).includes(h);

  /** A school's short name from its Canvas address, for the logo's place: ucsb.instructure.com and canvas.ucsb.edu → UCSB. */
  const school = (h) => (String(h || "").toLowerCase().split(".").slice(0, -1).filter((p) => p && !/^(www|canvas|instructure|beta|test|com|edu|org|net|ac|co)$/.test(p))[0] || "canvas").toUpperCase().slice(0, 8);
  PC.u = { esc, MIN, HR, DAY, sod, time, day, due, span, countdown, plural, debounce, uid, hostOf, isCanvasHost, school, setClock24: (v) => (H24 = !!v), DNM, MNM };
  PC.DEFAULTS = DEFAULTS;
  PC.store = store;
})(globalThis);
