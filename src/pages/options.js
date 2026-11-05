/* PocketCanvas: settings. One page, a section per topic with a side index: Look (the theme browser: built-in themes,
   your own, import a file or pasted JSON, generate one with a chatbot, night mode), Canvas, Classes, Lists and
   reminders, Other apps (where due dates come from), Grades, Sync (your Google account, lib/cloud.js), Collegiapp
   (pairing, sending, focus and site blocking), Keys, Data. Every control saves as you change it. */
(function () {
  const PC = globalThis.PC, api = PC.api, K = PC.kit, P = PC.page, T = PC.themes, { esc, plural } = PC.u, ic = (n, c) => PC.ic(n, c);
  const app = document.getElementById("app");
  let pairing = null, gen = { idea: "", reply: "", read: null }, paste = "", resetArmed = false, slot = null, refocus = null, signing = false;

  const SECTIONS = [["look", "Look", "palette"], ["canvas", "Canvas", "classes"], ["classes", "Classes", "flag"], ["lists", "Lists and reminders", "bell"], ["apps", "Other apps", "links"],
    ["grades", "Grades", "grade"], ["sync", "Sync", "refresh"], ["collegiapp", "Collegiapp", "send"], ["keys", "Keys", "help"], ["data", "Data", "note"]];
  const sw = (key, s) => `<input type="checkbox" class="pc-switch" data-s="${key}"${s[key] ? " checked" : ""} aria-label="${esc(key)}">`;
  const opt = (title, sub, control, cls) => `<div class="pc-opt${cls ? " " + cls : ""}"><div><b>${esc(title)}</b>${sub ? `<span>${sub}</span>` : ""}</div>${control || ""}</div>`;

  // a small drawing of a theme: page, a card with its label band and LCD, the accent key, three class colours
  function preview(t, quiet) {
    const k = t.tokens, pocket = t.look === "pocket", r = pocket ? 6 : 3;
    return `<svg class="pc-sw" viewBox="0 0 180 76" ${quiet ? `aria-hidden="true"` : `role="img" aria-label="${esc(t.name)} colours"`}><rect width="180" height="76" fill="${k.bg}"/>
      <rect x="10" y="9" width="160" height="58" rx="${r}" fill="${k.surface}" stroke="${k.line}"/>
      <rect x="10" y="9" width="160" height="14" rx="${r}" fill="${pocket ? k["chrome-bg"] : k.surface}"/>${pocket ? "" : `<rect x="10" y="22" width="160" height="1" fill="${k.line}"/>`}
      <rect x="16" y="14" width="40" height="4" rx="1" fill="${pocket ? k["chrome-fg"] : k.text}"/>
      <rect x="18" y="30" width="54" height="28" rx="${pocket ? 4 : 2}" fill="${k["disp-bg"]}"/><rect x="24" y="40" width="34" height="8" rx="1" fill="${k["disp-fg"]}"/>
      <rect x="80" y="31" width="70" height="4" rx="1" fill="${k.text}"/><rect x="80" y="39" width="52" height="3" rx="1" fill="${k.text3}"/>
      <rect x="80" y="48" width="34" height="11" rx="${pocket ? 4 : 2}" fill="${k.accent}"/><rect x="86" y="52" width="22" height="3" rx="1" fill="${k["on-accent"]}"/>
      ${["k1", "k2", "k3"].map((c, i) => `<rect x="${122 + i * 11}" y="50" width="7" height="7" rx="${pocket ? 1 : 3.5}" fill="${k[c]}"/>`).join("")}</svg>`;
  }
  // Night off: one theme, and a click uses it. Night on: a Day and a Night slot; a click puts the theme in the selected
  // slot (the one in effect until you pick the other), and while that isn't the one in effect this page previews it.
  const SLOTS = { day: ["Day", "today", "theme"], night: ["Night", "moon", "nightTheme"] };
  const nightOn = (s) => s.night !== "off";
  const live = (s) => (T.isNight(s) ? "night" : "day");
  const picking = (s) => (nightOn(s) ? slot || live(s) : "day");
  const all = (S) => T.BUILTIN.concat(S.themes || []);
  const inSlot = (S, k) => all(S).find((t) => t.id === S.settings[SLOTS[k][2]]) || (k === "day" ? T.BUILTIN[0] : T.byId("pocket-night"));

  function card(t, s, demo) {
    const sel = picking(s), on = !demo && s[SLOTS[sel][2]] === t.id, bad = T.checks(t.tokens).length;
    const marks = demo || !nightOn(s) ? "" : ["day", "night"].filter((k) => s[SLOTS[k][2]] === t.id).map((k) => `<span class="pc-tbadge${k === sel ? " on" : ""}">${ic(SLOTS[k][1])}${SLOTS[k][0]}</span>`).join("");
    return `<div class="pc-tcard${on ? " on" : ""}" data-act="useTheme" data-v="${esc(t.id)}" role="button" tabindex="0" aria-pressed="${on}">${preview(t)}
      <div class="pc-tn">${esc(t.name)}<span class="pc-sp"></span><span class="pc-tbadge">${t.look === "pocket" ? "Pocket" : "Standard"}</span>${t.scheme === "dark" ? `<span class="pc-tbadge">Dark</span>` : ""}</div>
      <div class="pc-meta"><span>${esc(t.note || (t.by ? "By " + t.by : ""))}</span>${bad ? `<span style="color:var(--pc-bad)">${plural(bad, "low-contrast pair")}</span>` : ""}</div>
      <div class="pc-tacts">${marks}<span class="pc-sp"></span>${K.key("", { icon: "send", cls: "ghost sm", act: "exportTheme", v: t.id, aria: "Save as a file to share" })}${t.builtin ? "" : K.key("", { icon: "trash", cls: "ghost sm", act: "delTheme", v: t.id, aria: "Delete this theme" })}</div></div>`;
  }
  function slots(S) {
    const s = S.settings, sel = picking(s), now = live(s);
    return `<div class="pc-slots" role="tablist" aria-label="Which theme to pick">${["day", "night"].map((k) => {
      const t = inSlot(S, k), [label, icon] = SLOTS[k];
      return `<button type="button" class="pc-slot${k === sel ? " on" : ""}" role="tab" id="pc-slot-${k}" aria-selected="${k === sel}" aria-controls="pc-pick" tabindex="${k === sel ? 0 : -1}" data-act="slot" data-v="${k}">${preview(t, true)}
        <span class="pc-slt"><span class="pc-slk">${ic(icon)}${label}${k === now ? `<span class="pc-tbadge">Now</span>` : ""}</span><b>${esc(t.name)}</b></span></button>`;
    }).join("")}</div>`;
  }

  function look(S) {
    const s = S.settings, night = nightOn(s), sel = picking(s);
    const read = gen.read;
    return `<section class="pc-sec" id="look">${K.module("Look", "palette", `
      ${opt("Restyle Canvas", "Draw Canvas in your theme. Off keeps Canvas's own look; the dock, lists and everything else stay.", sw("restyle", s))}
      ${opt("Night theme", "Switch to a second theme when it's dark.", `<div class="pc-seg">${[["off", "Off"], ["auto", "With the system"], ["schedule", "On a schedule"], ["on", "Always"]].map(([v, l]) => K.chip(l, { act: "set", id: "night", v, on: s.night === v })).join("")}</div>`)}
      ${s.night === "schedule" ? opt("Schedule", "", `<span class="pc-inline"><input type="time" data-s="nightFrom" value="${esc(s.nightFrom)}" aria-label="From"> to <input type="time" data-s="nightTo" value="${esc(s.nightTo)}" aria-label="Until"></span>`) : ""}
      <div class="pc-opt col"><div><b>${night ? "Day and night themes" : "Themes"}</b><span>${night ? "Choose Day or Night, then click a theme for it." : "Click one to use it."} Pocket themes are the handheld look from Collegiapp; Standard themes are plain and flat.</span></div>
        ${night ? `${slots(S)}<div class="pc-pickhd">${ic(SLOTS[sel][1])}<b>Pick a ${sel} theme</b>${sel !== live(s) ? `<span>This page shows it while you pick</span>` : ""}</div>` : ""}
        <div class="pc-themes" id="pc-pick"${night ? ` role="tabpanel" aria-labelledby="pc-slot-${sel}"` : ""}>${all(S).map((t) => card(t, s)).join("")}</div></div>
      <div class="pc-opt col"><div><b>Import a theme</b><span>A theme file from Collegiapp, Claude Companion or a friend (the shared Pocket theme format), or its JSON pasted here.</span></div>
        <div class="pc-inline"><label class="pc-key sm">${ic("plus")}<span class="pc-kl">Choose a file</span><input type="file" accept=".json,application/json" data-f="themeFile" hidden></label></div>
        <textarea class="pc-code" data-f="paste" placeholder='{"pocketTheme":1,"name":"…","tokens":{…}}'>${esc(paste)}</textarea>
        <div class="pc-row2">${K.key("Import", { cls: "sm", act: "importPaste" })}</div></div>
      <div class="pc-opt col pc-gen"><div><b>Make one with a chatbot</b><span>Describe it, open the chatbot with the prompt filled in, then paste its reply below. PocketCanvas checks the contrast and can fix it.</span></div>
        <input type="text" data-f="idea" placeholder="Matcha latte and old Game Boy" value="${esc(gen.idea)}">
        <div class="pc-row2">${K.key("Open Claude", { icon: "ext", cls: "sm primary", act: "bot", v: "claude" })}${K.key("Open ChatGPT", { icon: "ext", cls: "sm", act: "bot", v: "chatgpt" })}${K.key("Copy the prompt", { cls: "sm ghost", act: "copyPrompt" })}</div>
        <textarea class="pc-code" data-f="reply" placeholder="Paste the chatbot's reply">${esc(gen.reply)}</textarea>
        <div class="pc-row2">${K.key("Read the reply", { cls: "sm", act: "readReply" })}</div>
        ${read ? read.error ? `<p class="pc-note" style="color:var(--pc-bad)">${esc(read.error)}</p>` : `<div class="pc-themes" style="grid-template-columns:minmax(0,260px)">${card(Object.assign({}, read.theme, { builtin: true }), s, true)}</div>
          ${read.warnings.length ? `<p class="pc-note">${esc(read.warnings.join(" "))}</p>` : `<p class="pc-note">Every pair reads well.</p>`}
          <div class="pc-row2">${read.lowContrast ? K.key("Fix contrast and save", { cls: "sm primary", act: "saveGen", v: "fix" }) : ""}${K.key(read.lowContrast ? "Save as it is" : "Save and use it", { cls: read.lowContrast ? "sm ghost" : "sm primary", act: "saveGen" })}</div>` : ""}</div>`)}</section>`;
  }

  function canvas(S) {
    const s = S.settings;
    return `<section class="pc-sec" id="canvas">${K.module("Canvas", "classes", `
      ${opt("Class dock", "Your classes as keys on top of every Canvas page. A key opens the same page in that class.", sw("dock", s))}
      ${opt("Keep each class's menu open", "Home, Modules, Grades… on the left of a class's pages, even where Canvas folds it. The ☰ still folds it for that page.", sw("openMenu", s))}
      ${opt("Most used tabs first", "In each class's menu, Home, Assignments and Grades start on top as keys, the tabs you open most move up, and the ones you never open fade.", `<span class="pc-inline">${K.key("Start over", { cls: "ghost sm", act: "resetTabs", title: "Forget which tabs you open" })}${sw("tabOrder", s)}</span>`)}
      ${opt("Class codes in tab titles", "\"154 · Assignments\" instead of \"Assignments\".", sw("tabTitles", s))}
      ${opt("Class-coloured tab icons", "", sw("favicons", s))}
      ${opt("Use the full window width", "", sw("fullWidth", s))}
      ${opt("Hide the school logo", "In the left navigation.", sw("hideLogo", s))}
      ${opt("Hide Recent feedback", "On the dashboard sidebar.", sw("hideFeedback", s))}
      ${opt("Compact cards", "Smaller dashboard cards, more of them per row.", sw("condensed", s))}
      ${opt("Work on each card", "A class card lists its next items.", `<span class="pc-inline"><input type="number" min="1" max="10" data-s="cardItems" value="${esc(s.cardItems)}" aria-label="Items per card" style="width:64px">${sw("cardWork", s)}</span>`)}
      ${opt("Grades on cards", "", sw("cardGrades", s))}
      ${opt("Show grades only on hover", "For when someone's looking over your shoulder.", sw("gradeHover", s))}
      ${opt("Replace Canvas's to-do sidebar", "Its to-do sidebar and List View fold away. Do first, Go to and To do, day by day, sit on top of the dashboard either way.", sw("replaceTodo", s))}
      ${opt("Notes on the dashboard", "", sw("dashNote", s))}
      <div class="pc-opt col"><div><b>Other Canvas sites</b><span>PocketCanvas runs on *.instructure.com and canvas.ucsb.edu. Add your school's own Canvas address here.</span></div>
        ${(s.hosts || []).map((h) => `<div class="pc-inline"><span>${esc(h)}</span>${K.key("Remove", { cls: "ghost sm", act: "delHost", v: h })}</div>`).join("")}
        <div class="pc-inline"><input type="text" data-f="host" placeholder="canvas.myschool.edu">${K.key("Add", { cls: "sm", act: "addHost" })}</div></div>`)}</section>`;
  }

  function classes(S, V) {
    const all = V.all.courses;
    const ended = all.filter((c) => c.mode === "normal" && PC.work.ended(c, V.now));
    const rows = all.map((c) => `<tr style="${K.kc(c)}"><td>${K.dot(c)}</td><td><b><a href="${esc(c.url)}" target="_blank" rel="noopener">${esc(c.name)}</a></b><div class="pc-meta">${esc(c.codeText)}${c.term ? " · " + esc(c.term) : ""}</div></td>
      <td><select data-c="${c.id}" data-p="mode" aria-label="Mode"><option value=""${c.autoMode ? " selected" : ""}>Automatic (${c.autoMode ? esc(c.mode) : PC.work.ended(c, V.now) && s0(S).autoGhostPast ? "ghost" : "normal"})</option>${["priority", "normal", "ghost", "hidden"].map((m) => `<option value="${m}"${!c.autoMode && c.mode === m ? " selected" : ""}>${m[0].toUpperCase() + m.slice(1)}</option>`).join("")}</select></td>
      <td><input type="text" maxlength="14" data-c="${c.id}" data-p="nick" value="${esc(c.flags.nick || "")}" placeholder="${esc(PC.work.short(c, {}))}" aria-label="Nickname"></td>
      <td><select data-c="${c.id}" data-p="color" aria-label="Colour">${[1, 2, 3, 4, 5, 6].map((n) => `<option value="${n}"${c.color === n ? " selected" : ""}>Colour ${n}</option>`).join("")}</select></td>
      <td class="n"><input type="number" min="0" max="12" step="0.5" data-c="${c.id}" data-p="units" value="${esc(c.flags.units != null ? c.flags.units : "")}" placeholder="${esc(c.units)}" aria-label="Units" style="width:64px"></td></tr>`).join("");
    return `<section class="pc-sec" id="classes">${K.module("Classes", "flag", `
      ${opt("Ghost classes from past terms", "A class whose term ended stays reachable but drops out of lists, counts and reminders.", sw("autoGhostPast", S.settings))}
      ${ended.length ? `<p class="pc-note">${plural(ended.length, "class")} from past terms ${ended.length === 1 ? "is" : "are"} still set to normal. ${K.key("Ghost them", { cls: "sm", act: "ghostPast" })}</p>` : ""}
      ${all.length ? `<div class="pc-scroll"><table class="pc-tbl"><thead><tr><th></th><th>Class</th><th>Mode</th><th>Nickname</th><th>Colour</th><th class="n">Units</th></tr></thead><tbody>${rows}</tbody></table></div>`
        : `<p class="pc-note">Your classes show up here after you open Canvas once.</p>`}
      <p class="pc-note">Priority classes go first in the dock and weigh more in Do first. Hidden ones are gone everywhere. More per class (notes, links) in the menu on its dashboard card or dock key.</p>`)}</section>`;
  }
  const s0 = (S) => S.settings;

  function lists(S) {
    const s = S.settings;
    return `<section class="pc-sec" id="lists">${K.module("Lists and reminders", "bell", `
      ${opt("Relative dates", "\"in 3h\" and \"Tomorrow\" instead of the date.", sw("relDates", s))}
      ${opt("24-hour clock", "", sw("clock24", s))}
      ${opt("Remind me before work is due", "A notification when open work gets this close. Hours, separated by commas.", `<span class="pc-inline"><input type="text" data-s="leadHours" value="${esc((s.leadHours || []).join(", "))}" style="width:90px" aria-label="Hours before">${sw("notifyDue", s)}</span>`)}
      ${opt("Tell me about new work", "Including work with no due date, so it doesn't slip by.", sw("notifyNew", s))}
      ${opt("Tell me about new grades", "", sw("notifyGrades", s))}
      ${opt("Count on the toolbar button", "Work that's late or due within 24 hours.", sw("badge", s))}`)}</section>`;
  }

  function apps(S, V) {
    const s = S.settings, list = PC.apps.summary(S);
    const say = { ok: "Reading its homework list", lms: "Reading set by set (this course opens only from Canvas)", signedout: "Signed out. Open any of its homework from Canvas once to sign in again.", noaccess: "PocketCanvas needs your OK to read it", error: "Couldn't read it", new: "Not read yet" };
    const rows = list.map((a) => `<div class="pc-opt"><div><b>${esc(a.app)} · ${esc(a.code)}</b><span>${a.course && V.all.byId[a.course.id] ? "Dates go to " + K.cchip(V.all.byId[a.course.id], { target: "_blank" }) : "No class matched. Add its address to a class's links (class settings) to connect it."} · ${esc(say[a.status] || a.status)}${a.sets ? " · " + plural(a.sets, "item") : ""}${a.at ? " · read " + PC.u.span(Date.now() - a.at) + " ago" : ""}${a.error ? " · " + esc(a.error) : ""}</span></div>
      <span class="pc-inline">${a.status === "noaccess" ? K.key("Allow", { cls: "sm primary", act: "allow", v: a.origin }) : ""}${K.key("Open", { cls: "sm ghost", icon: "ext", href: a.status === "signedout" && a.launch ? a.launch : a.home, target: "_blank" })}</span></div>`).join("");
    return `<section class="pc-sec" id="apps">${K.module("Other apps", "links", `
      <p class="pc-note">Some classes keep their homework in WeBWorK or Gradescope and post it on Canvas with no due date, or not at all. PocketCanvas finds those apps from your classes' Canvas links, reads their due dates with your own sign-in in this browser (school sign-in, Google, or a password all work), and fills them in. Your own date always wins.</p>
      ${opt("Read due dates from other apps", "WeBWorK and Gradescope, every 20 minutes. Reading WeBWorK also keeps you signed in to it.", sw("apps", s))}
      ${opt("Gradescope", "", `<div class="pc-seg">${[["auto", "When a class links to it"], [true, "Always"], [false, "Never"]].map(([v, l]) => K.chip(l, { act: "set", id: "gradescope", v: String(v), on: String(s.gradescope) === String(v) })).join("")}</div>`)}
      ${rows || `<p class="pc-note">No WeBWorK or Gradescope links found in your classes yet. Opening a WeBWorK or Gradescope page from Canvas also connects it.</p>`}
      <div class="pc-row2">${K.key("Read them now", { icon: "refresh", cls: "sm", act: "readApps" })}${list.some((a) => a.status === "noaccess") ? K.key("Allow all", { cls: "sm primary", act: "allowAll" }) : ""}</div>`)}</section>`;
  }

  function grades(S) {
    const s = S.settings;
    return `<section class="pc-sec" id="grades">${K.module("Grades", "grade", `
      ${opt("GPA on the dashboard", "Your term GPA from current scores, and cumulative with the numbers below.", sw("gpa", s))}
      ${opt("GPA before this term", "", `<span class="pc-inline"><input type="number" step="0.01" min="0" max="4.3" data-s="priorGpa" value="${esc(s.priorGpa)}" placeholder="3.50" style="width:80px" aria-label="Prior GPA"><input type="number" step="1" min="0" data-s="priorUnits" value="${esc(s.priorUnits)}" placeholder="Units" style="width:80px" aria-label="Prior units"></span>`)}
      ${opt("Units per class", "Unless you set a class's own.", `<input type="number" step="0.5" min="0" max="12" data-s="defaultUnits" value="${esc(s.defaultUnits)}" style="width:80px" aria-label="Default units">`)}
      <div class="pc-opt col"><div><b>Scale</b><span>Lowest percent for each letter and its grade points (UCSB's by default).</span></div>
        <div class="pc-scroll"><table class="pc-tbl"><thead><tr><th>Letter</th><th class="n">From %</th><th class="n">Points</th></tr></thead><tbody>
        ${(s.gpaScale || []).map(([min, pts, l], i) => `<tr><td>${esc(l)}</td><td class="n"><input type="number" step="0.1" data-g="${i}" data-p="0" value="${min}" style="width:80px" aria-label="${esc(l)} from"></td><td class="n"><input type="number" step="0.1" data-g="${i}" data-p="1" value="${pts}" style="width:80px" aria-label="${esc(l)} points"></td></tr>`).join("")}
        </tbody></table></div><div class="pc-row2">${K.key("Back to UCSB's scale", { cls: "ghost sm", act: "resetScale" })}</div></div>`)}</section>`;
  }

  function sync(S) {
    const c = S.cloud || {}, on = c.email != null;
    const status = on ? `Signed in as ${esc(c.email || "your Google account")}${c.at ? ` · synced ${PC.u.span(Date.now() - c.at)} ago` : c.error ? "" : " · syncing…"}${c.offline ? " · offline, it syncs when you're back" : ""}` : "Not signed in";
    return `<section class="pc-sec" id="sync">${K.module("Sync", "refresh", `
      <p class="pc-note">Sign in with Google to keep your settings, class choices (modes, nicknames, colours, units, notes, links), what you've marked on work (done, hidden, seen, your own dates), your tasks, imported themes and dashboard note in your Google account, and get them back in any Firefox where you sign in. It's the account Collegiapp syncs with, but PocketCanvas doesn't need Collegiapp for it. Your Canvas reads and sign-ins stay in this Firefox.</p>
      ${opt("Google account", status, on ? `<span class="pc-inline">${K.key("Sync now", { icon: "refresh", cls: "sm", act: "cloudSync" })}${K.key("Sign out", { cls: "ghost sm", act: "cloudOut" })}</span>` : K.key(signing ? "Signing in…" : "Sign in with Google", { cls: "primary sm", act: "cloudIn" }))}
      ${c.error ? `<p class="pc-note" style="color:var(--pc-bad)">${esc(c.error)}</p>` : ""}
      ${on ? "" : `<p class="pc-note">The first time, what your account already has wins, and what's only here is added to it.</p>`}`)}</section>`;
  }

  function collegiapp(S) {
    const s = S.settings, cap = S.cap || {};
    const status = cap.token ? (cap.ok ? `Connected${cap.version ? " to Collegiapp " + esc(cap.version) : ""}${cap.pushedAt ? ` · synced ${PC.u.span(Date.now() - cap.pushedAt)} ago${cap.pushedCount != null ? ", " + plural(cap.pushedCount, "item") : ""}` : ""}` : "Paired, but Collegiapp isn't running right now")
      : cap.error ? esc(cap.error) : "Not connected";
    const pair = pairing ? `<div class="pc-pair">${pairing.code ? `${K.lcd({ label: "Code", num: pairing.code })}<p class="pc-note">Collegiapp is asking whether to allow this browser. Check it shows the same code, then allow it there.</p>` : ""}
        <p class="pc-note">${esc(pairing.msg || "")}</p>${K.key("Cancel", { cls: "ghost sm", act: "pairCancel" })}</div>` : "";
    return `<section class="pc-sec" id="collegiapp">${K.module("Collegiapp", "send", `
      <p class="pc-note">With Collegiapp open on this computer, PocketCanvas sends it your classes (and their modes) and all your work, dates from WeBWorK and Gradescope included, and follows its focus sessions. Nothing leaves your computer: they talk over 127.0.0.1.</p>
      ${cap.token ? "" : opt("Get Collegiapp", "The planner PocketCanvas connects to, free for Windows and macOS.", K.key("Get it", { icon: "ext", cls: "sm", href: PC.cap.HOME, target: "_blank" }))}
      ${opt("Status", status, cap.token ? K.key("Disconnect", { cls: "ghost sm", act: "unpair" }) : pairing ? "" : K.key("Connect", { cls: "primary sm", act: "pair" }))}
      ${pair}
      ${opt("Send classes and work to Collegiapp", "When they change, and every 30 minutes.", sw("capSync", s))}
      ${opt("Block distracting sites while you focus", "During a focus session from Collegiapp or from the PocketCanvas button. Hold the key on the blocked page for an emergency exit.", sw("blockSites", s))}
      <div class="pc-opt col"><div><b>Sites to block</b><span>One per line. Subdomains count (youtube.com covers m.youtube.com).</span></div>
        <textarea class="pc-code" data-s="blocklist" style="min-height:140px">${esc((s.blocklist || []).join("\n"))}</textarea></div>`)}</section>`;
  }

  function keys() {
    const k = [["Ctrl+K or /", "Search classes, class pages, work and commands"], ["Alt+1 to Alt+9", "Open a class in the dock (the same page in that class)"], ["Alt+[ and Alt+]", "Previous and next class"],
      ["Alt+W", "All work drawer"], ["Alt+H", "Canvas dashboard"], ["Alt+Shift+P", "This popup, from any tab"], ["Alt+Shift+B", "The board, from any tab"]];
    return `<section class="pc-sec" id="keys">${K.module("Keys", "help", `<div class="pc-kbds">${k.map(([a, b]) => `<kbd>${esc(a)}</kbd><span>${esc(b)}</span>`).join("")}</div>
      <p class="pc-note" style="margin-top:10px">Keys on Canvas pages work whenever you're not typing. Change the two browser-wide ones in Firefox's add-on shortcuts (about:addons, the gear, Manage extension shortcuts).</p>`)}</section>`;
  }
  function data() {
    return `<section class="pc-sec" id="data">${K.module("Data", "note", `
      <p class="pc-note">Settings and class choices sync through your Firefox account when Firefox Sync is on. Signed in with Google (Sync, above), they, your item marks, tasks, themes and dashboard note are kept in your Google account too. Your Canvas reads stay on this computer. PocketCanvas only reads Canvas; it never changes anything there.</p>
      <div class="pc-row2">${K.key("Save a backup", { cls: "sm", act: "export" })}<label class="pc-key sm"><span class="pc-kl">Restore a backup</span><input type="file" accept=".json" data-f="restore" hidden></label>
        ${K.key(resetArmed ? "Really reset everything" : "Reset", { cls: resetArmed ? "sm primary" : "ghost sm", act: "reset" })}</div>`)}</section>`;
  }
  function welcome(S) {
    if (location.hash !== "#welcome") return "";
    return `<section class="pc-sec">${K.module("Welcome", "now", `<div class="pc-welcome"><p>PocketCanvas puts every class's work in one list, in order, and keeps undated work in sight.</p><ol>
      <li>Open your Canvas (canvas.ucsb.edu or yourschool.instructure.com). Your classes fill in by themselves.</li>
      <li>Pick a look below. Pocket is Collegiapp's handheld; Standard is plain.</li>
      <li>Old classes from past terms are ghosted for you. Mark the important ones Priority in Classes.</li>
      <li>Using <a href="${PC.cap.HOME}" target="_blank" rel="noopener">Collegiapp</a>? Connect it at the bottom of this page.</li></ol>
      <div class="pc-row2">${K.key("Open Canvas", { icon: "go", cls: "primary sm", href: "https://canvas.ucsb.edu/", target: "_blank" })}</div></div>`, { cls: "do" })}</section>`;
  }

  function render(S, V) {
    const a = document.activeElement, s = S.settings;
    // picking the slot that isn't in effect: this page wears it until you pick the other slot or leave (nothing saved)
    if (nightOn(s) && picking(s) !== live(s)) K.theme(S, inSlot(S, picking(s)));
    if (a && app.contains(a) && a.matches('input:not([type="checkbox"]):not([type="file"]), textarea, select')) return; // saves on change; redraw after
    const y = window.scrollY;
    const keep = refocus || (a && app.contains(a) && a.matches(".pc-slot, .pc-tcard") ? `[data-act="${a.dataset.act}"][data-v="${CSS.escape(a.dataset.v)}"]` : null);
    refocus = null;
    app.innerHTML = `${P.top("PocketCanvas settings", K.key("Board", { icon: "all", cls: "ghost sm", href: "board.html" }))}
      <div class="pc-wrap"><div class="pc-set"><nav class="pc-nav" aria-label="Sections">${SECTIONS.map(([id, l, icn]) => `<a href="#${id}">${ic(icn)}${esc(l)}</a>`).join("")}</nav>
      <div class="pc-stack">${welcome(S)}${look(S)}${canvas(S)}${classes(S, V)}${lists(S)}${apps(S, V)}${grades(S)}${sync(S)}${collegiapp(S)}${keys()}${data()}</div></div></div>`;
    window.scrollTo(0, y);
    if (keep) { const f = app.querySelector(keep); if (f) f.focus({ preventScroll: true }); }
    if (first && location.hash && location.hash !== "#welcome") { const el = document.getElementById(location.hash.slice(1)); if (el) el.scrollIntoView(); }
    first = false;
  }
  let first = true;

  // ── saving ──
  async function setting(el) {
    const k = el.dataset.s, s = P.S.settings;
    let v = el.type === "checkbox" ? el.checked : el.value;
    if (k === "leadHours") v = String(v).split(/[ ,]+/).map(Number).filter((h) => h > 0 && h < 24 * 14);
    else if (k === "blocklist") v = String(v).split(/\s+/).map((d) => PC.u.hostOf(d).replace(/^www\./, "")).filter(Boolean);
    else if (k === "cardItems" || k === "defaultUnits") v = +v || s[k];
    if (k === "blockSites" && v) await askSites(s.blocklist);
    if (k === "blocklist" && s.blockSites) await askSites(v);
    await PC.store.setSettings({ [k]: v });
    api.runtime.sendMessage({ t: "tick" }).catch(() => {});
  }
  // with access to the sites, a blocked page says what's going on; without it, Firefox shows its own error page
  const askSites = (list) => api.permissions.request({ origins: (list || []).flatMap((d) => [`*://${d}/*`, `*://*.${d}/*`]) }).catch(() => false);
  app.addEventListener("change", async (e) => {
    const el = e.target;
    if (el.dataset.s) return setting(el);
    if (el.dataset.c) {
      const p = el.dataset.p, v = el.value.trim();
      const patch = { [p]: p === "units" ? (v === "" ? null : +v) : p === "color" ? +v : v || null };
      return PC.store.setCourseFlag(P.view().host + "/" + el.dataset.c, patch);
    }
    if (el.dataset.g) {
      const scale = P.S.settings.gpaScale.map((r) => r.slice());
      scale[+el.dataset.g][+el.dataset.p] = +el.value;
      return PC.store.setSettings({ gpaScale: scale.sort((a, b) => b[0] - a[0]) });
    }
    if (el.dataset.f === "themeFile" && el.files[0]) { paste = await el.files[0].text(); return importText(paste); }
    if (el.dataset.f === "restore" && el.files[0]) return restore(await el.files[0].text());
    if (el.dataset.f === "idea") gen.idea = el.value;
    if (el.dataset.f === "reply") gen.reply = el.value;
    if (el.dataset.f === "paste") paste = el.value;
  });
  app.addEventListener("input", (e) => { const f = e.target.dataset.f; if (f === "idea") gen.idea = e.target.value; if (f === "reply") gen.reply = e.target.value; if (f === "paste") paste = e.target.value; });
  app.addEventListener("keydown", (e) => {
    const c = e.target.closest('.pc-tcard[data-act="useTheme"]'); if (c && (e.key === "Enter" || e.key === " ") && e.target === c) { e.preventDefault(); c.click(); }
    // the Day/Night slots are tabs: arrows, Home and End move between them
    const t = e.target.closest(".pc-slot"), to = { ArrowLeft: "day", ArrowUp: "day", Home: "day", ArrowRight: "night", ArrowDown: "night", End: "night" }[e.key];
    if (t && to) { e.preventDefault(); slot = to; refocus = `.pc-slot[data-v="${to}"]`; P.redraw(); }
  });

  async function saveTheme(t, use) {
    const mine = (P.S.themes || []).filter((x) => x.id !== t.id);
    mine.push(Object.assign({}, t, { builtin: undefined }));
    await PC.store.setLocal("themes", mine);
    const sel = picking(P.S.settings);
    if (use) await PC.store.setSettings({ [SLOTS[sel][2]]: t.id });
    K.toast(`Saved · ${t.name}${use && nightOn(P.S.settings) ? ` · your ${sel} theme` : ""}`);
  }
  async function importText(text) {
    const r = T.normalize(text);
    if (r.error) return K.toast(r.error);
    await saveTheme(r.lowContrast ? Object.assign(r.theme, { tokens: T.fix(r.theme).tokens }) : r.theme, true);
    if (r.warnings.length) K.toast(r.warnings.join(" ") + (r.lowContrast ? " Contrast fixed." : ""), { ms: 8000 });
    paste = ""; P.redraw();
  }
  function download(name, obj) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" }));
    a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
  async function restore(text) {
    let o; try { o = JSON.parse(text); } catch (e) { return K.toast("That file isn't a PocketCanvas backup."); }
    if (!o || o.pocketCanvasBackup !== 1) return K.toast("That file isn't a PocketCanvas backup.");
    if (o.sync) await api.storage.sync.set(o.sync).catch(() => api.storage.local.set(o.sync));
    if (o.local) await api.storage.local.set(o.local);
    K.toast("Backup restored");
  }

  // ── Google sign-in: Firefox's sign-in window opens the web app's link page (lib/cloud.js) ──
  async function cloudIn() {
    signing = true; P.redraw();
    try { const r = await PC.cloud.signIn(); K.toast(`Signed in as ${r.email}. Syncing…`); }
    catch (e) { K.toast(e.message, { ms: 6000 }); }
    finally { signing = false; P.redraw(); }
  }

  // ── Collegiapp pairing: Collegiapp shows a code and asks you to allow this browser ──
  async function pair() {
    const ok = await api.permissions.request({ origins: ["http://127.0.0.1:4747/*"] }).catch(() => true);
    if (!ok) return K.toast("PocketCanvas needs to reach Collegiapp at 127.0.0.1.");
    pairing = { msg: "Asking Collegiapp…" }; P.redraw();
    try {
      const r = await PC.cap.pair("Firefox · PocketCanvas");
      pairing = { id: r.id, code: r.code, msg: "Waiting for you to allow it in Collegiapp…", until: Date.now() + 120e3 };
      P.redraw();
      while (pairing && pairing.id === r.id && Date.now() < pairing.until) {
        await new Promise((res) => setTimeout(res, 1500));
        const st = await PC.cap.pairStatus(r.id).catch(() => null);
        if (!pairing || !st) continue;
        if (st.status === "allowed" && st.token) {
          await PC.store.setLocal("cap", { token: st.token, ok: true, pairedAt: Date.now() });
          pairing = null; K.toast("Connected to Collegiapp"); api.runtime.sendMessage({ t: "tick" }).catch(() => {}); return P.redraw();
        }
        if (st.status === "denied" || st.status === "expired") { pairing = { msg: st.status === "denied" ? "Collegiapp said no." : "That took too long. Try again." }; return P.redraw(); }
      }
      if (pairing) { pairing = { msg: "That took too long. Try again." }; P.redraw(); }
    } catch (e) {
      pairing = { msg: e.offline ? "Collegiapp isn't running. Open it, then connect." : e.message }; P.redraw();
    }
  }

  P.bind(app, async (act, el, e, V) => {
    const S = P.S, s = S.settings;
    if (act === "useTheme") {
      const t = all(S).find((x) => x.id === el.dataset.v); if (!t) return true;
      await PC.store.setSettings({ [SLOTS[picking(s)][2]]: t.id });
      return true;
    }
    if (act === "slot") { slot = el.dataset.v; P.redraw(); return true; }
    if (act === "exportTheme") { e.stopPropagation(); const t = T.BUILTIN.concat(S.themes || []).find((x) => x.id === el.dataset.v); if (t) download(`${t.id}.pocket-theme.json`, { pocketTheme: 1, id: t.id, name: t.name, by: t.by, note: t.note, look: t.look, scheme: t.scheme, tokens: t.tokens, css: t.css || undefined }); return true; }
    if (act === "delTheme") { e.stopPropagation(); await PC.store.setLocal("themes", (S.themes || []).filter((x) => x.id !== el.dataset.v)); if (s.theme === el.dataset.v) await PC.store.setSettings({ theme: "pocket-cream" }); if (s.nightTheme === el.dataset.v) await PC.store.setSettings({ nightTheme: "pocket-night" }); return true; }
    if (act === "set") { const v = el.dataset.v; if (el.dataset.id === "night") slot = null; await PC.store.setSettings({ [el.dataset.id]: v === "true" ? true : v === "false" ? false : v }); return true; }
    if (act === "importPaste") { await importText(paste); return true; }
    if (act === "bot") { window.open(T.BOTS[el.dataset.v](T.prompt(gen.idea)), "_blank", "noopener"); return true; }
    if (act === "copyPrompt") { await navigator.clipboard.writeText(T.prompt(gen.idea)).then(() => K.toast("Prompt copied. Paste it into any chatbot."), () => K.toast("Couldn't copy here.")); return true; }
    if (act === "readReply") { gen.read = T.normalize(gen.reply); P.redraw(); return true; }
    if (act === "saveGen") { const r = gen.read; if (!r || !r.theme) return true; await saveTheme(el.dataset.v === "fix" ? Object.assign({}, r.theme, { tokens: T.fix(r.theme).tokens }) : r.theme, true); gen = { idea: gen.idea, reply: "", read: null }; P.redraw(); return true; }
    if (act === "addHost") {
      const h = PC.u.hostOf(app.querySelector('[data-f="host"]').value); if (!h) return true;
      const ok = await api.permissions.request({ origins: [`https://${h}/*`] }).catch(() => false);
      if (!ok) { K.toast("PocketCanvas needs your OK to run on " + h); return true; }
      await PC.store.setSettings({ hosts: Array.from(new Set((s.hosts || []).concat(h))) });
      K.toast(`Added ${h}. Reload its tabs.`); return true;
    }
    if (act === "delHost") { await PC.store.setSettings({ hosts: (s.hosts || []).filter((h) => h !== el.dataset.v) }); api.permissions.remove({ origins: [`https://${el.dataset.v}/*`] }).catch(() => {}); return true; }
    if (act === "ghostPast") { for (const c of V.all.courses.filter((c) => c.mode === "normal" && PC.work.ended(c, V.now))) await PC.store.setCourseFlag(V.host + "/" + c.id, { mode: "ghost" }); return true; }
    if (act === "allow") { const ok = await api.permissions.request({ origins: [el.dataset.v + "/*"] }).catch(() => false); if (ok) await api.runtime.sendMessage({ t: "apps" }); return true; }
    if (act === "allowAll") { const origins = Array.from(new Set(PC.apps.summary(S).filter((a) => a.status === "noaccess").map((a) => a.origin + "/*"))); if (await api.permissions.request({ origins }).catch(() => false)) await api.runtime.sendMessage({ t: "apps" }); return true; }
    if (act === "readApps") { K.toast("Reading…", { ms: 2000 }); const r = await api.runtime.sendMessage({ t: "apps" }).catch(() => null); K.toast(r && r.report && r.report.length ? r.report.join(" · ") : "Up to date"); return true; }
    if (act === "resetTabs") { await PC.store.setLocal("tabUse", {}); K.toast("Class menus start over from Home, Assignments and Grades"); return true; }
    if (act === "resetScale") { await PC.store.setSettings({ gpaScale: PC.DEFAULTS.gpaScale }); return true; }
    if (act === "cloudIn") { if (!signing) cloudIn(); return true; }
    if (act === "cloudSync") {
      K.toast("Syncing…", { ms: 2000 });
      const r = await api.runtime.sendMessage({ t: "cloudSync" }).catch((x) => ({ ok: false, error: x.message }));
      K.toast(r && r.ok ? (r.moved ? "Synced" : "Up to date") : (r && r.error) || "Couldn't sync"); return true;
    }
    if (act === "cloudOut") { await PC.cloud.signOut(); K.toast("Signed out. What's here stays, and so does your account's copy."); return true; }
    if (act === "pair") { pair(); return true; }
    if (act === "pairCancel") { pairing = null; P.redraw(); return true; }
    if (act === "unpair") { await PC.store.setLocal("cap", {}); K.toast("Disconnected. Remove PocketCanvas in Collegiapp's Connect dialog too, if you like."); return true; }
    if (act === "export") {
      const sync = await api.storage.sync.get(null).catch(() => ({})), local = await api.storage.local.get(["itemFlags", "tasks", "themes", "note", "seenAt"]);
      download(`pocketcanvas-backup-${new Date().toISOString().slice(0, 10)}.json`, { pocketCanvasBackup: 1, at: new Date().toISOString(), sync, local });
      return true;
    }
    if (act === "reset") {
      if (!resetArmed) { resetArmed = true; P.redraw(); setTimeout(() => { resetArmed = false; P.redraw(); }, 5000); return true; }
      await api.storage.sync.clear().catch(() => {}); await api.storage.local.clear(); await PC.store.setLocal("seenAt", Date.now());
      resetArmed = false; K.toast("Everything reset"); return true;
    }
  });
  P.start(render);
})();
