/* PocketCanvas: sync through your Google account, on its own (Collegiapp needn't be installed or running). You sign in
   with Google on the web app's sign-in page (collegiapp ui/js/link.js), which Firefox's identity.launchWebAuthFlow opens
   and which hands a Google ID token back to this extension's redirect address. PocketCanvas trades it for a Firebase
   session of its own (Identity Toolkit REST) and keeps the refresh token in storage.local "cloudAuth": never synced,
   never in a backup.

   What syncs is one Firestore document in the Firebase project Collegiapp syncs with: `users/{uid}/meta/pocketcanvas`
   (collegiapp firestore.rules), `j` the JSON of a map from key to { v, at, by } (the value, and when and in which
   browser it last changed), `d` the browser and `s` the server's time of the write. Keys:
     s.<setting>                  a setting (util.js DEFAULTS)
     c.<host>/<courseId>.<field>  a class choice: mode, nick, color, icon, pos, units, notes, links
     i.<host>/<itemKey>           an item's flags: done, hide, seen, gradeSeen, due
     t.<taskId>                   one of your tasks
     th.<themeId>                 an imported theme
     n                            the dashboard note
   null is "not set": a setting at its default, a flag taken off, a deleted task. A cycle stamps what changed here since
   the last one, reads the document, takes each key whose stamp there is later (a full tie takes the account's), writes
   those into storage, and writes the document back when this browser has something newer. A browser's first cycle after
   signing in stamps what it already had as oldest, so the account's choices win and only what the account lacks is
   added. The map and this browser's id are in storage.local "cloud", the last result in "cloudStatus". Only the
   background runs cycles (PC.cloud.sync, one at a time); pages sign in and out. Collegiapp never reads this document. */
(function (g) {
  const PC = (g.PC = g.PC || {});
  const api = PC.api;
  // the project in collegiapp ui/js/cloud-config.js; none of it is secret (firestore.rules decides who reads what)
  const CFG = { apiKey: "AIzaSyCGJK1a7HDVPkiWQO1zMH7Bk-Q8PIx6gQ8", projectId: "collegiapp" };
  const LINK = `https://${CFG.projectId}.firebaseapp.com/link.html`;
  const ROOT = `projects/${CFG.projectId}/databases/(default)/documents`, API = "https://firestore.googleapis.com/v1/" + ROOT;
  const MAX_DOC = 900000; // Firestore holds 1 MiB a document
  const EPOCH = new Date(0).toISOString();
  const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

  // objects compare by content, whatever order their keys were written in
  const canon = (v) => JSON.stringify(v === undefined ? null : v, (k, x) => (x && typeof x === "object" && !Array.isArray(x) ? Object.keys(x).sort().reduce((o, y) => ((o[y] = x[y]), o), {}) : x));
  const same = (a, b) => canon(a) === canon(b);
  const clone = (v) => (v === undefined ? null : JSON.parse(JSON.stringify(v)));

  function parts(k) { const d = k.indexOf("."); return d < 0 ? [k, ""] : [k.slice(0, d), k.slice(d + 1)]; }
  /** Whether this version reads and writes a key; others (from a newer PocketCanvas) are kept as they are. */
  function known(k) {
    const [kind, rest] = parts(k);
    if (kind === "s") return rest !== "v" && has(PC.DEFAULTS, rest);
    if (kind === "c") return rest.lastIndexOf(".") > 0;
    if (kind === "i" || kind === "t" || kind === "th") return rest !== "";
    return k === "n";
  }

  /** The synced keys of a state (PC.store.all() plus `note`), each one that's set. */
  function flatten(S) {
    const out = {}, put = (k, v) => { if (v !== undefined && v !== null) out[k] = v; };
    for (const k of Object.keys(PC.DEFAULTS)) if (k !== "v" && !same(S.settings[k], PC.DEFAULTS[k])) put("s." + k, S.settings[k]);
    for (const [key, f] of Object.entries(S.courseFlags || {})) for (const [p, v] of Object.entries(f || {})) put(`c.${key}.${p}`, v);
    for (const [key, f] of Object.entries(S.itemFlags || {})) if (f && Object.keys(f).length) put("i." + key, f);
    for (const t of S.tasks || []) if (t && t.id) put("t." + t.id, t);
    for (const t of S.themes || []) if (t && t.id) put("th." + t.id, t);
    if (S.note) put("n", S.note);
    return out;
  }

  /** Stamp each known key whose value here differs from its last stamp; one never stamped and still not set stays
      unstamped. Returns whether anything was stamped. */
  function stamp(map, flat, at, by) {
    let any = false;
    for (const k of new Set(Object.keys(map).concat(Object.keys(flat)))) {
      if (!known(k)) continue;
      const v = has(flat, k) ? flat[k] : null, s = map[k];
      if (s ? same(s.v, v) : v === null) continue;
      map[k] = { v: clone(v), at, by };
      any = true;
    }
    return any;
  }

  /** Take the account's keys whose stamp is later, then the greater browser id; a full tie takes the account's, so two
      browsers' first stamps meet on one value. Returns the keys whose value changed here, and whether the account's map
      lacks something of the merged one (write it back). */
  function merge(map, remote) {
    const pulled = [], ms = (s) => Date.parse(s.at) || 0;
    for (const [k, r] of Object.entries(remote)) {
      const l = map[k];
      if (l && (ms(r) < ms(l) || (ms(r) === ms(l) && r.by < l.by))) continue;
      if (!l || !same(l.v, r.v)) pulled.push(k);
      map[k] = r;
    }
    const push = Object.keys(map).some((k) => { const r = remote[k], l = map[k]; return !r || r.at !== l.at || r.by !== l.by || !same(r.v, l.v); });
    return { pulled, push };
  }
  // a document's entries that read as stamps
  const stamps = (o) => Object.fromEntries(Object.entries(o && typeof o === "object" ? o : {}).filter(([, s]) => s && typeof s === "object" && has(s, "v") && typeof s.at === "string" && typeof s.by === "string"));

  /** Write these keys' values from the map into storage, area by area. */
  async function apply(map, keys) {
    const l = await api.storage.local.get(["itemFlags", "tasks", "themes"]);
    const settings = {}, classes = {}, items = Object.assign({}, l.itemFlags), tasks = (l.tasks || []).slice(), themes = (l.themes || []).slice();
    const local = {};
    for (const k of keys) {
      if (!known(k)) continue;
      const v = map[k] ? clone(map[k].v) : null, [kind, rest] = parts(k);
      if (kind === "s") settings[rest] = v === null ? clone(PC.DEFAULTS[rest]) : v;
      else if (kind === "c") { const d = rest.lastIndexOf("."); (classes[rest.slice(0, d)] = classes[rest.slice(0, d)] || {})[rest.slice(d + 1)] = v; }
      else if (kind === "i") { if (v && typeof v === "object") items[rest] = v; else delete items[rest]; local.itemFlags = items; }
      else if (kind === "t") { put(tasks, rest, v); local.tasks = tasks; }
      else if (kind === "th") { put(themes, rest, v); local.themes = themes; }
      else if (kind === "n") local.note = v || "";
    }
    if (Object.keys(settings).length) await PC.store.setSettings(settings);
    if (Object.keys(classes).length) await PC.store.setCourseFlags(classes);
    if (Object.keys(local).length) await api.storage.local.set(local);
  }
  // replace, add or remove the entry with this id, keeping the list's order
  function put(list, id, v) {
    const i = list.findIndex((x) => x && x.id === id);
    if (v && typeof v === "object") { if (i < 0) list.push(v); else list[i] = v; } else if (i >= 0) list.splice(i, 1);
  }

  // ── Google and Firebase ──
  async function call(url, { body, form, token } = {}) {
    let r;
    try {
      r = await fetch(url, { method: "POST", headers: Object.assign({ "Content-Type": form ? "application/x-www-form-urlencoded" : "application/json" }, token ? { Authorization: "Bearer " + token } : {}),
        body: form ? new URLSearchParams(form).toString() : JSON.stringify(body || {}) });
    } catch (e) { const x = new Error("No connection to Google right now."); x.offline = true; throw x; }
    const j = await r.json().catch(() => null);
    if (!r.ok) {
      const err = (Array.isArray(j) ? j[0] && j[0].error : j && j.error) || {};
      const x = new Error(r.status === 403 ? "Your Google account's sync rules don't let PocketCanvas in (collegiapp firestore.rules)." : err.message || `Google answered ${r.status}`);
      x.code = `${err.status || ""} ${err.message || ""}`;
      throw x;
    }
    return j;
  }
  const hex = (n) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => b.toString(16).padStart(2, "0")).join("");
  const device = () => "firefox-" + PC.u.uid();

  let tok = null; // { t, until, uid }: an ID token for this context
  const net = {
    now: () => Date.now(),
    async token(auth) {
      if (tok && tok.uid === auth.uid && net.now() + 300e3 < tok.until) return tok.t;
      let r;
      try { r = await call(`https://securetoken.googleapis.com/v1/token?key=${CFG.apiKey}`, { form: { grant_type: "refresh_token", refresh_token: auth.refresh } }); }
      catch (e) {
        if (/TOKEN_EXPIRED|INVALID_REFRESH_TOKEN|USER_DISABLED|USER_NOT_FOUND/.test(e.code || "")) { await signOut("Signed out: sign in with Google again."); e.message = "Signed out: sign in with Google again."; }
        throw e;
      }
      if (r.refresh_token && r.refresh_token !== auth.refresh) await PC.store.setLocal("cloudAuth", Object.assign({}, auth, { refresh: r.refresh_token }));
      tok = { t: r.id_token, until: net.now() + (+r.expires_in || 3600) * 1000, uid: auth.uid };
      return tok.t;
    },
    async read(token, uid) {
      const v = await call(`${API}:batchGet`, { token, body: { documents: [`${ROOT}/users/${uid}/meta/pocketcanvas`] } });
      const f = (Array.isArray(v) ? v : []).map((r) => r.found).find(Boolean);
      if (!f) return { map: {}, updateTime: null };
      let map = {}; try { map = JSON.parse(f.fields.j.stringValue); } catch (e) { map = {}; }
      return { map: stamps(map), updateTime: f.updateTime };
    },
    /** Write the map, only over the version read (updateTime), so two browsers' writes never cross. */
    async write(token, uid, map, by, updateTime) {
      const j = JSON.stringify(map);
      if (j.length > MAX_DOC) throw new Error(`Too much to sync: ${Math.round(j.length / 1024)} KB, and the account's document holds about 900 KB.`);
      try {
        await call(`${API}:commit`, { token, body: { writes: [{
          update: { name: `${ROOT}/users/${uid}/meta/pocketcanvas`, fields: { j: { stringValue: j }, d: { stringValue: by } } },
          updateTransforms: [{ fieldPath: "s", setToServerValue: "REQUEST_TIME" }],
          currentDocument: updateTime ? { updateTime } : { exists: false },
        }] } });
      } catch (e) { if (/FAILED_PRECONDITION|ALREADY_EXISTS|NOT_FOUND/.test(e.code || "")) e.conflict = true; throw e; }
    },
  };

  /** Sign in with Google in Firefox's sign-in window (the web app's link page). Resolves to { email }. */
  async function signIn() {
    if (!api.identity || !api.identity.launchWebAuthFlow) throw new Error("This Firefox can't open the sign-in window.");
    const ext = api.identity.getRedirectURL(), state = hex(32);
    let back;
    try { back = await api.identity.launchWebAuthFlow({ url: `${LINK}#${new URLSearchParams({ ext, state })}`, interactive: true }); }
    catch (e) { throw new Error(/cancel|denied|closed/i.test(e.message || "") ? "Sign-in was cancelled." : e.message || String(e)); }
    const h = new URLSearchParams(new URL(back).hash.slice(1));
    if (h.get("state") !== state) throw new Error("The sign-in page answered another request. Try again.");
    if (h.get("error") || !h.get("id_token")) throw new Error("Sign-in was cancelled.");
    const f = await call(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=${CFG.apiKey}`,
      { body: { postBody: `id_token=${encodeURIComponent(h.get("id_token"))}&providerId=google.com`, requestUri: "http://localhost", returnSecureToken: true } });
    if (!f.localId || !f.refreshToken) throw new Error("Firebase didn't start a session. Try again.");
    tok = { t: f.idToken, until: net.now() + (+f.expiresIn || 3600) * 1000, uid: f.localId };
    const cur = await PC.store.local("cloud", {});
    await api.storage.local.set({ cloudAuth: { uid: f.localId, email: f.email || "", refresh: f.refreshToken, at: Date.now() }, cloud: { device: cur.device || device() }, cloudStatus: {} });
    return { email: f.email || "" };
  }
  /** Forget the session and the map; what's in this browser stays, and so does the account's copy. */
  async function signOut(error) {
    tok = null;
    const cur = await PC.store.local("cloud", {});
    await api.storage.local.set({ cloudAuth: null, cloud: { device: cur.device || device() }, cloudStatus: error ? { error } : {} });
  }

  async function cycle() {
    const auth = await PC.store.local("cloudAuth", null);
    if (!auth || !auth.uid) return null;
    const old = await PC.store.local("cloudStatus", {});
    let st = await PC.store.local("cloud", {});
    if (st.uid !== auth.uid) st = { uid: auth.uid, device: st.device || device(), map: {}, stamped: false };
    // still signed in to this account: a sign-out while a cycle runs isn't undone by its saves
    const save = async (patch) => { const a = await PC.store.local("cloudAuth", null); if (a && a.uid === st.uid) await api.storage.local.set(patch); };
    let moved = false;
    try {
      const S = await PC.store.all(), flat = flatten(Object.assign({}, S, { note: await PC.store.local("note", "") }));
      const fresh = !st.stamped;
      if (stamp(st.map, flat, fresh ? EPOCH : new Date(net.now()).toISOString(), fresh ? "" : st.device) || fresh) { st.stamped = true; await save({ cloud: st }); }
      const token = await net.token(auth);
      for (let tries = 0; ; tries++) {
        const doc = await net.read(token, auth.uid), merged = clone(st.map);
        const r = merge(merged, doc.map);
        if (r.pulled.length) { await apply(merged, r.pulled); moved = true; }
        if (r.pulled.length || !same(merged, st.map)) { st.map = merged; await save({ cloud: st }); }
        if (!r.push) break;
        try { await net.write(token, auth.uid, merged, st.device, doc.updateTime); moved = true; break; }
        catch (e) { if (!e.conflict || tries >= 2) throw e; }
      }
      // the status is written when something moved, the error cleared, or every ten minutes, so pages don't redraw each cycle
      if (moved || old.error || !old.at || net.now() - old.at > 10 * 60e3) await save({ cloudStatus: { at: net.now() } });
      return { ok: true, moved };
    } catch (e) {
      const status = { at: old.at || null, error: e.offline ? null : e.message, offline: !!e.offline };
      if (!same(status, old)) await save({ cloudStatus: status });
      return { ok: false, error: e.message, offline: !!e.offline };
    }
  }
  let queue = Promise.resolve();
  /** Run a cycle after any that's running. Resolves to { ok, moved } or { ok: false, error }, or null when signed out. */
  function sync() { const run = queue.then(cycle, cycle); queue = run.catch(() => null); return run; }
  /** Whether a storage change touches what syncs. */
  const watched = (ch) => ["settings", "courseFlags", "itemFlags", "tasks", "themes", "note"].some((k) => has(ch, k));

  PC.cloud = { LINK, signIn, signOut, sync, watched, flatten, stamp, merge, apply, known, net, EPOCH };
})(globalThis);
