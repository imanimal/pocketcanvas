/* PocketCanvas: the background (a Firefox event page). Wakes once a minute ("tick") and on messages:
   - reminders: a notification when open work crosses each lead time (24 h and 3 h before by default), one for new
     work and one for new grades; clicking one opens the item. The toolbar badge counts what's late or due in 24 h.
   - Canvas: refreshes the cache itself when no Canvas tab has in 30 minutes (best effort; pages do most reads).
   - related apps: reads WeBWorK and Gradescope every 20 minutes for due dates Canvas lacks (lib/apps.js).
   - Collegiapp: pings 127.0.0.1:4747, pushes your classes and work when they change, follows its focus session, and
     carries a work page's Send to Collegiapp (pages can't reach the bridge themselves: it only answers extensions).
   - your Google account, once you sign in on the settings page: syncs settings, class choices, item flags, tasks,
     themes and the dashboard note (lib/cloud.js) at startup, a few seconds after they change and every 3 minutes.
   - site blocking: while a focus session runs (Collegiapp's, or one started from the popup) and blocking is on, the
     blocklist redirects to pages/blocked.html (declarativeNetRequest; plain blocking without host access).
   - extra Canvas hosts (settings.hosts) get the content scripts registered once you grant access in settings. */
const PC = globalThis.PC, api = PC.api;
const HR = PC.u.HR, CS = { js: ["util", "icons", "themes", "apps", "work", "canvas-api", "collegiapp"].map((f) => `src/lib/${f}.js`).concat(["src/ui/kit.js", "src/content/boot.js", "src/content/paint.js", "src/content/canvas.js"]), css: ["src/ui/kit.css", "src/content/canvas.css"] };
const menus = api.menus || api.contextMenus;
const page = (p) => api.runtime.getURL(`src/pages/${p}.html`);

api.runtime.onInstalled.addListener(async (d) => {
  if (!(await PC.store.local("seenAt", 0))) await PC.store.setLocal("seenAt", Date.now());
  menus.removeAll(() => {
    menus.create({ id: "pc-task", title: "Add to PocketCanvas as a task", contexts: ["selection", "link", "page"] });
    menus.create({ id: "pc-cap", title: "Send to Collegiapp", contexts: ["selection", "link", "page"] });
  });
  if (d.reason === "install") api.tabs.create({ url: page("options") + "#welcome" });
  start();
});
api.runtime.onStartup.addListener(start);
function start() {
  api.alarms.create("tick", { periodInMinutes: 1, delayInMinutes: 0.1 });
  hosts();
  cloud();
}

api.alarms.onAlarm.addListener((a) => { if (a.name === "tick" || a.name === "focus-end") tick(); });
api.storage.onChanged.addListener((ch, area) => {
  if (PC.cloud.watched(ch)) cloudSoon();
  // signed in (or to another account): the first cycle now
  if (ch.cloudAuth && ch.cloudAuth.newValue && (ch.cloudAuth.oldValue || {}).uid !== ch.cloudAuth.newValue.uid) cloud();
  if (ch.settings && area !== "local") { hosts(); tick(); return; }
  if (ch.cache || ch.itemFlags || ch.tasks || ch.courseFlags || ch.focus) tickSoon();
});
let soonT = null;
const tickSoon = () => { clearTimeout(soonT); soonT = setTimeout(tick, 1500); };

// ── the minute ──
let ticking = false;
async function tick() {
  if (ticking) return; ticking = true;
  try {
    let S = await PC.store.all();
    if (S.cache && Date.now() - S.cache.at > 30 * 60e3 && !(await canvasTabs(S.cache.host)).length) S = (await bgRefresh(S)) || S;
    if (S.cache && S.settings.apps !== false) { await PC.apps.refresh(S, false); S = await PC.store.all(); }
    const V = PC.work.view(S, { now: Date.now() });
    await badge(V, S.settings);
    await remind(V, S);
    await collegiapp(S);
    await blocking(S);
    if (Date.now() - lastCloud > 3 * 60e3) cloud();
  } catch (e) { console.warn("PocketCanvas tick", e); }
  finally { ticking = false; }
}

async function canvasTabs(host) { if (!host) return []; try { return await api.tabs.query({ url: `*://${host}/*` }); } catch (e) { return []; } }
async function bgRefresh(S) {
  try {
    const skip = (c) => { const m = PC.work.mode(c, S.courseFlags[S.cache.host + "/" + c.id], S.settings, Date.now()); return m === "hidden" || m === "ghost"; };
    const data = await PC.canvas.load(S.cache.origin, skip);
    PC.work.stamp(data, S.cache);
    await PC.store.setLocal("cache", data);
    return Object.assign({}, S, { cache: data });
  } catch (e) { return null; }
}

async function badge(V, s) {
  const n = s.badge ? V.items.filter((i) => i.open && i.due != null && i.due - V.now < 24 * HR).length : 0;
  await api.action.setBadgeText({ text: n ? String(n) : "" });
  if (n) {
    const late = V.items.some((i) => i.overdue);
    await api.action.setBadgeBackgroundColor({ color: late ? "#e5484d" : "#ff5b1f" });
    if (api.action.setBadgeTextColor) await api.action.setBadgeTextColor({ color: "#ffffff" });
  }
  await api.action.setTitle({ title: n ? `PocketCanvas · ${PC.u.plural(n, "item")} late or due in 24 hours` : "PocketCanvas" });
}

// ── reminders ──
const note = (id, title, message) => api.notifications.create(id, { type: "basic", iconUrl: api.runtime.getURL("icons/icon-96.png"), title, message });
async function remind(V, S) {
  const s = S.settings, sent = await PC.store.local("notified", {}), now = V.now, keep = {};
  const leads = (s.leadHours || []).map(Number).filter((h) => h > 0).sort((a, b) => a - b);
  for (const it of V.items) {
    if (!it.open || it.due == null) continue;
    const k = V.host + "/" + it.key + "@" + it.due;
    const done = sent[k] || [];
    keep[k] = done;
    if (!s.notifyDue || it.due < now) continue;
    // the nearest lead this item has crossed; every larger one counts as sent with it
    const crossed = leads.filter((h) => it.due - now <= h * HR);
    if (!crossed.length || crossed.every((h) => done.includes(h))) continue;
    if (!done.includes(crossed[0])) {
      const c = it.courseObj;
      note("open:" + (it.url || page("board")), `${c ? c.label + " · " : ""}${it.title}`, `Due ${PC.u.day(it.due, now).toLowerCase() === "today" ? "today" : PC.u.day(it.due, now)} at ${PC.u.time(it.due)} (in ${PC.u.span(it.due - now)})`);
    }
    keep[k] = Array.from(new Set(done.concat(crossed)));
  }
  await PC.store.setLocal("notified", keep);

  const last = await PC.store.local("notifiedAt", 0) || Date.now();
  if (S.cache && S.cache.at > last) {
    const fresh = V.items.filter((i) => i.isNew && i.first > last), graded = V.items.filter((i) => i.newGrade && i.gradedAt > last);
    if (s.notifyNew && fresh.length) {
      const nodate = fresh.filter((i) => i.due == null).length;
      note(fresh.length === 1 && fresh[0].url ? "open:" + fresh[0].url : "open:" + page("board"), fresh.length === 1 ? `New in ${fresh[0].courseObj ? fresh[0].courseObj.label : "Canvas"} · ${fresh[0].title}` : `${fresh.length} new items on Canvas`,
        (fresh.length === 1 ? (fresh[0].due ? `Due ${PC.u.day(fresh[0].due, now)} ${PC.u.time(fresh[0].due)}` : "No due date") : fresh.slice(0, 4).map((i) => i.title).join(" · ")) + (nodate && fresh.length > 1 ? ` · ${nodate} with no due date` : ""));
    }
    if (s.notifyGrades && graded.length) note(graded.length === 1 && graded[0].url ? "open:" + graded[0].url : "open:" + page("board"), graded.length === 1 ? `Graded · ${graded[0].title}` : `${graded.length} new grades`, graded.slice(0, 4).map((i) => `${i.courseObj ? i.courseObj.label + " " : ""}${i.title}${i.score != null && i.points ? ` ${+i.score.toFixed(2)}/${i.points}` : ""}`).join(" · "));
    await PC.store.setLocal("notifiedAt", S.cache.at);
  } else if (!(await PC.store.local("notifiedAt", 0))) await PC.store.setLocal("notifiedAt", Date.now());
}
api.notifications.onClicked.addListener((id) => {
  if (id.startsWith("open:")) api.tabs.create({ url: id.slice(5) });
  api.notifications.clear(id);
});

// ── Collegiapp ──
async function setCap(patch) {
  const cur = await PC.store.local("cap", {}), next = Object.assign({}, cur, patch);
  if (JSON.stringify(cur) !== JSON.stringify(next)) await PC.store.setLocal("cap", next);
  return next;
}
let lastPing = 0;
async function collegiapp(S) {
  const cap = S.cap || {};
  if (!cap.token) return;
  try {
    const p = await PC.cap.ping(cap.token);
    if (p && p.paired === false) { await setCap({ token: null, ok: false, focus: null, error: "Collegiapp forgot this browser. Connect again in settings." }); return; }
    let focus = null;
    try { focus = await PC.cap.focus(cap.token); } catch (e) { /* older Collegiapp */ }
    const patch = { ok: true, version: p && p.version, focus: focus && focus.active ? { until: focus.until ? Date.parse(focus.until) : null, level: focus.level || "", label: focus.label || "" } : null, error: null };
    if (S.settings.capSync && S.cache) {
      const V = PC.work.view(S, { now: Date.now(), includeAll: true });
      const body = PC.cap.payload(V), h = hash(JSON.stringify(body));
      if (h !== cap.pushed || Date.now() - (cap.pushedAt || 0) > 30 * 60e3) {
        const r = await PC.cap.push(cap.token, body);
        Object.assign(patch, { pushed: h, pushedAt: Date.now(), pushedCount: r && r.items != null ? r.items : body.work.length });
      }
    }
    await setCap(patch);
  } catch (e) {
    await setCap(e.unpaired ? { token: null, ok: false, focus: null, error: e.message } : { ok: false, focus: null, error: e.offline ? null : e.message });
  }
  lastPing = Date.now();
}
const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };

// ── your Google account (lib/cloud.js) ──
let lastCloud = 0, cloudT = null;
function cloud() { lastCloud = Date.now(); return PC.cloud.sync(); }
const cloudSoon = () => { clearTimeout(cloudT); cloudT = setTimeout(cloud, 4000); };

// ── focus and site blocking ──
async function focusNow(S) {
  const local = await PC.store.local("focus", null), now = Date.now();
  if (local && local.until > now) return { until: local.until, from: "PocketCanvas", pauseUntil: local.pauseUntil || 0 };
  if (local) await PC.store.setLocal("focus", null);
  const f = S.cap && S.cap.ok && S.cap.focus;
  if (f) return { until: f.until, from: "Collegiapp", label: f.label, pauseUntil: (await PC.store.local("pause", 0)) };
  return null;
}
const dnr = api.declarativeNetRequest;
const esc = (d) => d.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
async function blocking(S) {
  const f = await focusNow(S), now = Date.now();
  const on = !!(f && S.settings.blockSites && (S.settings.blocklist || []).length && !(f.pauseUntil > now));
  const old = (await dnr.getDynamicRules()).map((r) => r.id);
  const rules = [];
  if (on) {
    const list = S.settings.blocklist.map((d) => PC.u.hostOf(d).replace(/^www\./, "")).filter(Boolean);
    const origins = list.flatMap((d) => [`*://${d}/*`, `*://*.${d}/*`]);
    let access = false;
    try { access = await api.permissions.contains({ origins }); } catch (e) { /* no */ }
    if (access) {
      rules.push({ id: 1, priority: 1, condition: { regexFilter: `^https?://([^/]*\\.)?(${list.map(esc).join("|")})(/.*)?$`, resourceTypes: ["main_frame"] },
        action: { type: "redirect", redirect: { regexSubstitution: page("blocked") + "#\\0" } } });
    } else {
      rules.push({ id: 1, priority: 1, condition: { requestDomains: list, resourceTypes: ["main_frame"] }, action: { type: "block" } });
    }
    if (f.until) api.alarms.create("focus-end", { when: f.until + 1000 });
    if (f.pauseUntil > now) api.alarms.create("focus-end", { when: f.pauseUntil + 1000 });
  } else if (f && f.pauseUntil > now) api.alarms.create("focus-end", { when: f.pauseUntil + 1000 });
  const want = JSON.stringify(rules), have = await PC.store.local("rules", "[]");
  if (want === have && old.length === rules.length) return;
  await dnr.updateDynamicRules({ removeRuleIds: old, addRules: rules });
  await PC.store.setLocal("rules", want);
}

// ── extra Canvas hosts ──
async function hosts() {
  if (!api.scripting || !api.scripting.registerContentScripts) return;
  const s = await PC.store.settings();
  const list = (s.hosts || []).filter((h) => h && !PC.u.isCanvasHost(h, { hosts: [] }));
  const granted = [];
  for (const h of list) { try { if (await api.permissions.contains({ origins: [`https://${h}/*`] })) granted.push(`https://${h}/*`); } catch (e) { /* skip */ } }
  try { await api.scripting.unregisterContentScripts({ ids: ["pc-hosts"] }); } catch (e) { /* none yet */ }
  if (granted.length) await api.scripting.registerContentScripts([{ id: "pc-hosts", matches: granted, js: CS.js, css: CS.css, runAt: "document_start", persistAcrossSessions: true }]);
}
api.permissions.onAdded && api.permissions.onAdded.addListener(() => { hosts(); tick(); });

// ── messages and menus ──
async function capture(body) {
  const cap = await PC.store.local("cap", {});
  if (!cap.token) return { ok: false, error: "Connect Collegiapp in PocketCanvas settings first." };
  try { const r = await PC.cap.capture(cap.token, body); return { ok: true, title: r && r.title }; }
  catch (e) { return { ok: false, error: e.message }; }
}
/** Send one piece of work, or ask whether it's there (Send to Collegiapp on a work page). */
async function capWork(fn) {
  const cap = await PC.store.local("cap", {});
  if (!cap.token) return { ok: false, unpaired: true, error: "Connect Collegiapp in PocketCanvas settings first." };
  try { return Object.assign({ ok: true }, await fn(cap.token)); }
  catch (e) {
    if (e.unpaired) await setCap({ token: null, ok: false, focus: null, error: e.message });
    return { ok: false, offline: !!e.offline, unpaired: !!e.unpaired, error: /answered 404/.test(e.message) ? "This Collegiapp can't take one item at a time yet. Update it." : e.message };
  }
}
async function refreshAll() {
  const S = await PC.store.all();
  const host = S.cache && S.cache.host, tabs = await canvasTabs(host);
  for (const t of tabs) { try { const r = await api.tabs.sendMessage(t.id, { t: "refresh" }); if (r) return r; } catch (e) { /* that tab has no content script yet */ } }
  if (!S.cache) return { ok: false, error: "Open Canvas once so PocketCanvas can find your school." };
  const S2 = await bgRefresh(S);
  return S2 ? { ok: true } : { ok: false, error: "Couldn't read Canvas from here. Open a Canvas tab and sign in." };
}
api.runtime.onMessage.addListener((m, sender) => {
  if (!m || !m.t) return;
  if (m.t === "open") {
    if (m.page === "options") return api.runtime.openOptionsPage().then(() => ({ ok: true }));
    return api.tabs.create({ url: page(m.page) + (m.hash ? "#" + m.hash : "") }).then(() => ({ ok: true }));
  }
  if (m.t === "capture") return capture({ text: m.text || m.title || "", title: m.title || "", url: m.url || "", notes: m.notes || "" });
  if (m.t === "capSend") return capWork((t) => PC.cap.send(t, m.body));
  if (m.t === "capFind") return capWork((t) => PC.cap.find(t, m.refs));
  if (m.t === "refresh") return refreshAll();
  if (m.t === "tick") return tick().then(() => ({ ok: true }));
  if (m.t === "cloudSync") return cloud().then((r) => r || { ok: false, error: "Sign in with Google first." });
  if (m.t === "apps") return PC.store.all().then((S) => PC.apps.refresh(S, true)).then((report) => ({ ok: true, report }));
  if (m.t === "focus") return focusCmd(m).then(() => tick()).then(() => ({ ok: true }));
});
async function focusCmd(m) {
  if (m.minutes) await PC.store.setLocal("focus", { until: Date.now() + m.minutes * 60e3, at: Date.now() });
  if (m.stop) await PC.store.setLocal("focus", null);
  if (m.pause) {
    const f = await PC.store.local("focus", null), until = Date.now() + m.pause * 60e3;
    if (f) await PC.store.setLocal("focus", Object.assign(f, { pauseUntil: until }));
    else await PC.store.setLocal("pause", until);
  }
}
menus.onClicked.addListener(async (info, tab) => {
  const text = (info.selectionText || info.linkText || (tab && tab.title) || "").trim().slice(0, 300);
  const url = info.linkUrl || info.pageUrl || (tab && tab.url) || "";
  if (info.menuItemId === "pc-task") {
    const tasks = await PC.store.local("tasks", []);
    tasks.push({ id: PC.u.uid(), title: text || url, url, course: null, due: null, done: false, at: Date.now() });
    await PC.store.setLocal("tasks", tasks);
    note("open:" + page("board"), "Added to your tasks", text || url);
  } else if (info.menuItemId === "pc-cap") {
    const r = await capture({ text, title: (tab && tab.title) || "", url, notes: "" });
    note("cap:" + Date.now(), r.ok ? "Sent to Collegiapp" : "Couldn't send to Collegiapp", r.ok ? r.title || text : r.error);
  }
});
api.commands && api.commands.onCommand.addListener((c) => { if (c === "open-board") api.tabs.create({ url: page("board") }); });

start();
