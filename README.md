# PocketCanvas

A Firefox extension for Canvas: every class's work in one list, in due order, with undated work kept in sight and due dates filled in from WeBWorK and Gradescope. Hide or ghost old classes, mark the important ones priority, and give Canvas [Collegiapp](https://github.com/imanimal/collegiapp)'s Pocket look or a plain Standard one.

## What it does

**One list instead of clicking through classes**
- A dock of class keys on top of every Canvas page. A key opens the *same page* in that class (Assignments in 4B → Assignments in 130A). Drag a key to put your classes in your own order. Hover one to peek at its work, links and notes; right-click it for its settings. `Alt+1`…`Alt+9`, `Alt+[` / `Alt+]` switch classes from the keyboard.
- The dashboard's **To do** as a calendar: the weeks from this one on, Sunday to Saturday, each day's work in its square led by the time it's due (in a narrow drawer or the popup, just the days with work, each under a date tile), late work above it and undated work after. Filters for No due date, New, Late and Done, a class strip, and a line to add your own tasks (for work a teacher announced but never posted).
- Above it, **Do first**: the next three things due as cards, soonest first, each with a countdown, where its date comes from, and Open and Done keys. Only work due within a week (or late within one) shows, by Canvas's date, the app's or one you set; undated work never does, and neither do dates read from a description. And **Go to**: big keys for the pages you open most (a class's Modules, a tool in its menu, Calendar), with each class's WeBWorK or Gradescope, your own links, Inbox and Grades suggested until you have your own.
- **No due date** is its own group, never hidden. When the description mentions a date ("due Friday at 11:59pm"), the item offers to use it. Any item can take your own due date: pick a day and it's saved at 11:59 PM, change the time if you need to, no Save button.
- With PocketCanvas's To do on, Canvas's own List View (its planner) folds away under it, so the dashboard opens on To do instead of scrolling down to today; one click shows it again.
- **New** marks on work and grades you haven't opened, and a notification when new work shows up, dated or not.
- An All work drawer (`Alt+W`) on every page with the same Go to, Do first and To do, the board (a full tab with the calendar, Do first and every class), and the toolbar popup (the next few days).
- `Ctrl+K` or `/`: search classes, class pages ("4b grades"), assignments and commands.

**Dates from the apps your homework lives in**
- Classes that keep homework in **WeBWorK** or **Gradescope** often post it on Canvas with no due date, or not at all. PocketCanvas finds those apps from your classes' own Canvas links, reads their due dates with your sign-in in Firefox (school sign-in, Google or a password, whatever you use there), and fills them in. WeBWorK sets that aren't on Canvas at all join the class's list. Your own date always wins.
- Setup is one click (Allow) when a school's WeBWorK isn't UCSB's; UCSB's WeBWorK and Gradescope work out of the box.

**Classes**
- **Priority**: first in the dock (until you drag the dock into your own order), and first in Do first among work due at the same time. **Ghost**: still reachable, but out of lists, counts and reminders (classes from past terms are ghosted automatically). **Hide**: gone everywhere. Set them from a card's menu, a dock key, the board or settings.
- Per class: nickname, colour, an icon (book, Σ, terminal, drama mask, music and more), units, notes, your own links.

**Canvas itself**
- The Pocket look (Collegiapp's handheld: raised keys, graphite label bands, LCD inlays, pixel icons) or Standard (plain and flat, system fonts, no gradients or glow), each light or dark, with night on a schedule or with the system.
- A theme browser with eight built-in themes, import (the shared Pocket theme format, so Collegiapp and Claude Companion themes work here), and themes made by a chatbot: describe it, open Claude or ChatGPT with the prompt filled in, paste the reply, and PocketCanvas checks and fixes the contrast.
- Assignment, quiz and discussion pages get a panel on top: a countdown to the due date (or how it went), where the date comes from (Canvas, WeBWorK, Gradescope or yours), what the description says when Canvas has no date, and keys to set your own date, open the work in its app, mark it done and send it to Collegiapp. Canvas's new assignment view takes the look too, and a tool Canvas can only open in a new window gets a key instead of a white box.
- Each class's menu puts the tabs you open most first: Home, Assignments and Grades start on top as keys, the tabs you open most move up (a tool you stop using sinks again over a few weeks), and the ones you never open fade.
- Full-width pages, each class's menu kept open (even where Canvas folds it), class codes in tab titles, class-coloured tab icons, grades on cards (or only on hover), compact cards, Canvas's to-do sidebar folded away (Do first and To do are on the dashboard), dashboard notes, GPA (term and cumulative), and a "what do I need on the final" helper on every Grades page.

**Reminders and focus**
- Notifications 24 h and 3 h before work is due (your choice of hours), for new work and for new grades; a toolbar count of what's late or due within a day.
- Focus sessions (from the popup, or Collegiapp's) block the sites you list, with an emergency exit: hold the key on the blocked page for 5 minutes through.

**Collegiapp**
- [Collegiapp](https://github.com/imanimal/collegiapp) is a do-first planner for Windows and macOS; settings link to it. Connect it once (Collegiapp shows a code and asks you to allow the browser). PocketCanvas then sends Collegiapp your classes with their modes and all your work, app dates included, and follows Collegiapp's focus sessions. Everything stays on your computer (127.0.0.1).
- **Send to Collegiapp** on any assignment page sends that one piece of work as it is, with a due date (pick one when Canvas has none), how long it'll take, a priority and notes (Canvas's description too, if you like). It works for ghosted classes, says when Collegiapp already has it, and updates it there when you send it again.

## Privacy

PocketCanvas only *reads* Canvas, WeBWorK and Gradescope, with the session you already have in Firefox. Nothing is sent anywhere except to Collegiapp on your own computer, if you connect it, and to your Google account, if you sign in there. Settings and class choices sync through your Firefox account when Firefox Sync is on. Signed in with Google (Settings › Sync), your settings, class choices, item marks, tasks, imported themes and dashboard note are kept in your Google account, in the Firebase project Collegiapp syncs with, and come back in any Firefox where you sign in; Collegiapp needn't be installed. The Canvas cache and your sign-ins stay local. The Pocket look loads its fonts from Google Fonts.

## Install

From a release: open the `.xpi` attached to the [latest release](https://github.com/imanimal/pocketcanvas/releases/latest) in Firefox (128 or newer). It updates itself.

From source: `about:debugging` → This Firefox → Load Temporary Add-on → pick `manifest.json`.

## Develop

Plain classic scripts on `globalThis.PC`; no bundler, no npm packages.

```bash
node --test tests/core.test.js
```

```bash
npx -y web-ext@8.3.0 lint --source-dir . --ignore-files "dist/**" "tests/**" "tools/**" ".github/**" --self-hosted
```

```bash
python tools/build.py --updates
```

```bash
python tools/gen_icons.py
```

Release: `python tools/build.py --bump 0.2.0`, commit, tag `v0.2.0`, push the tag. The workflow signs the package as an unlisted add-on (repository secrets `AMO_JWT_ISSUER` and `AMO_JWT_SECRET` from addons.mozilla.org) and publishes the `.xpi` and `updates.json`.

PocketCanvas is written from scratch. It does the same jobs as BetterCanvas/BetterCampus and more, but shares no code with it.
