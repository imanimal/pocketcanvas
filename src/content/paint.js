/* PocketCanvas: Canvas's own colours in the theme's, on every Canvas page. Canvas and InstUI draw every page from one
   light palette, and PC.themes.role names each colour's job there (a card, a well, a hairline, body text, a link, the
   main key, a state), which is drawn in the theme's colour for that job. So a page nobody has opened yet comes out in
   the theme too, not only the ones canvas.css styles by name:
   - InstUI's rules, in the page's own <style> sheets, are rewritten in place as React adds them, hover and focus
     included (PC.themes.recolour).
   - Canvas's own sheets come from its CDN and can't be read, so each element they colour is measured as it appears or
     changes state and marked with the job's token: data-pc-c (text), data-pc-b (fill), data-pc-l (border), and
     data-pc-f / data-pc-s (an icon's fill or stroke: empty for its text colour, else a fill's token). canvas.css draws the marks, under its
     own rules. A shadow drawn as a hairline or focus ring is recoloured inline (data-pc-sh), since its shape is the
     element's own.
   - A teacher's page (.user_content) keeps its colours. Text anywhere that still doesn't read where it sits gets a
     colour that does (data-pc-ink, PC.themes.ink), and plain white boxes pasted into a teacher's page go.
   Runs at document_start after boot.js has put the theme on <html>, so the page is marked as it parses, and works while
   data-pc-on is set (canvas.js clears it on pages that aren't Canvas, and when Restyle Canvas is off). */
(function () {
  const PC = globalThis.PC, T = PC.themes, doc = document, root = doc.documentElement;
  const AUTHOR = ".user_content, .show-content";
  const SKIP = "head, script, style, noscript, template, iframe, textarea, select, math, .pc-root, .MathJax, .katex";
  const HEAD = "h1, h2, h3, h4, h5, h6, [class*='-heading']";
  const MARKS = ["data-pc-c", "data-pc-b", "data-pc-l", "data-pc-f", "data-pc-s", "data-pc-sh", "data-pc-ink"];
  const MARKED = MARKS.map((m) => `[${m}]`).join(", ");
  const STATE = ["class", "aria-selected", "aria-checked", "aria-pressed", "aria-expanded", "aria-current", "disabled", "open"];
  // the theme tokens, and what canvas.css makes from them, that marks and rewrites draw with
  const ROLES = [...T.KEYS, "on-ok", "on-warn", "on-mute", "on-acc2", "link", "warn-ink", "lip", "tint-accent", "tint-ok", "tint-bad", "tint-warn"];

  const named = doc.createElement("canvas").getContext("2d"), colours = new Map();
  /** Any colour CSS takes, names too, as [r, g, b, a]; null for none or inherit. */
  function colour(s) {
    if (!s || /^(none|inherit|initial|unset|revert|revert-layer|currentcolor)$/i.test(s)) return null;
    if (!colours.has(s)) {
      let v = T.rgba(s);
      if (!v) { named.fillStyle = "#010203"; named.fillStyle = s; v = named.fillStyle === "#010203" ? null : T.rgba(named.fillStyle); }
      colours.set(s, v);
    }
    return colours.get(s);
  }
  const key = (c) => c[0] + "," + c[1] + "," + c[2];

  // What the theme draws with, as a page measures it: a colour that's one of these is already the theme's (canvas.css,
  // a rewritten rule, or inherited from one), so it's left alone.
  let mine = new Map();
  function probe() {
    const p = doc.createElement("i");
    p.hidden = true; root.append(p);
    mine = new Map();
    for (const k of ROLES) { p.style.color = `var(--pc-${k})`; const c = colour(getComputedStyle(p).color); if (c && !mine.has(key(c))) mine.set(key(c), k); }
    p.remove();
  }
  const ours = (c) => mine.has(key(c));

  // ── InstUI's rules ──
  // Class colours Canvas paints from your choices (the calendar, colour pickers) keep theirs.
  const COURSE = /\.group_|\bfc-|color-?picker|swatch/i;
  const USE = (p) => p === "background-color" ? "bg" : p === "box-shadow" ? "shadow"
    : /^(color|fill|stroke|caret-color|text-decoration-color|-webkit-text-fill-color|stop-color|flood-color)$/.test(p) ? "fg"
    : /^(border-.*color|outline-color|column-rule-color)$/.test(p) ? "line" : null;
  let seen = new WeakMap(), edits = [];
  function rulesOf(list, out) {
    for (const r of list) { if (r.style && r.selectorText != null) out.push(r); if (r.cssRules) rulesOf(r.cssRules, out); }
    return out;
  }
  // A button's face (InstUI's baseButton__content) with a fill becomes a key: raised in Pocket (--pc-key, the lit
  // --pc-key-lit on a coloured fill), flat in Standard; its text takes the key's colour. A progress track's stroke is
  // the well under the meter, so it's drawn as a fill.
  const FACE = /baseButton__content$/;
  function recolour(r) {
    const st = r.style, sel = r.selectorText;
    if (!st.length || COURSE.test(sel)) return;
    const b = T.role(colour(st.getPropertyValue("background-color")), "bg"), fill = T.FILLS.has(b) ? b : null;
    const face = FACE.test(sel), head = face || /heading/i.test(sel), track = /track/i.test(sel);
    const w = [];
    for (let i = 0; i < st.length; i++) {
      const p = st[i], use = track && (p === "fill" || p === "stroke") ? "bg" : USE(p);
      if (!use) continue;
      const v = st.getPropertyValue(p), to = T.recolour(v, use, fill, head);
      if (to) w.push([p, v, to, st.getPropertyPriority(p)]);
    }
    if (face && b) w.push(["box-shadow", st.getPropertyValue("box-shadow"), fill ? "var(--pc-key-lit)" : "var(--pc-key)", ""], ["border-radius", st.getPropertyValue("border-radius"), "var(--pc-kr)", ""]);
    for (const [p, v, to, pri] of w) { edits.push([st, p, v, pri]); st.setProperty(p, to, pri); }
  }
  // InstUI adds its rules with insertRule as components first draw. Each is rewritten as it goes in, before anything
  // paints it, or measures it (which would start a fade from Canvas's colour on a key with a transition).
  const P = (window.wrappedJSObject || window).CSSStyleSheet.prototype, insertRule = P.insertRule;
  const hooked = function (rule, i) {
    const at = insertRule.call(this, rule, i);
    try { if (mo && this.ownerNode && !/^pc-/.test(this.ownerNode.id)) rulesOf([this.cssRules[at]], []).forEach(recolour); } catch (e) { /* Canvas's own call goes on */ }
    return at;
  };
  P.insertRule = typeof exportFunction === "function" ? exportFunction(hooked, window) : hooked;
  /** Rewrite the rules added to the page's own sheets since last time (sheets written as text, and any rule the hook
      missed). Rewriting is idempotent: a rule already in the theme's colours has none of Canvas's left. */
  function sheets() {
    for (const s of doc.styleSheets) {
      const n = s.ownerNode;
      if (s.href || !n || n.localName !== "style" || /^pc-/.test(n.id)) continue;
      let list;
      try { list = s.cssRules; } catch (e) { continue; }
      const from = seen.get(s) || 0;
      if (list.length <= from) { if (list.length < from) seen.set(s, list.length); continue; }
      seen.set(s, list.length);
      for (const r of rulesOf(Array.prototype.slice.call(list, from), [])) recolour(r);
    }
  }

  // ── what Canvas's own sheets colour ──
  function* elements(scopes) {
    for (const s of scopes) {
      if (s.matches(SKIP) || s.closest(AUTHOR)) continue;
      yield s;
      const w = doc.createTreeWalker(s, NodeFilter.SHOW_ELEMENT, (n) => n.matches(SKIP) || n.matches(AUTHOR) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT);
      for (let n = w.nextNode(); n; n = w.nextNode()) yield n;
    }
  }
  const ownText = (el) => { for (const n of el.childNodes) if (n.nodeType === 3 && n.data.trim()) return true; return false; };
  const SHAPE = /^(path|circle|rect|ellipse|polygon|polyline|line|text|tspan|use|g)$/;
  function paint(scopes) {
    const want = new Map(), fills = new Map(), fgs = new Map();
    // the token of the solid fill under an element: marked here, already marked, or measured; null on a picture
    const fillAt = (el) => {
      for (let a = el; a && a !== root; a = a.parentElement) {
        if (fills.has(a)) { const f = fills.get(a); if (f !== undefined) return f; continue; }
        const m = a.getAttribute("data-pc-b");
        if (m) return m;
        const cs = getComputedStyle(a), c = colour(cs.backgroundColor);
        if (c && c[3] >= 0.95) return mine.get(key(c)) || T.role(c, "bg");
        if (cs.backgroundImage !== "none") return null;
      }
      return "surface";
    };
    for (const el of elements(scopes)) {
      const cs = getComputedStyle(el), m = {};
      const bg = colour(cs.backgroundColor);
      if (bg && bg[3] > 0 && !ours(bg)) m.b = T.role(bg, "bg");
      fills.set(el, m.b || (bg && bg[3] >= 0.95 ? mine.get(key(bg)) || T.role(bg, "bg") : cs.backgroundImage !== "none" ? null : undefined));
      for (const sd of ["Top", "Right", "Bottom", "Left"]) {
        if (cs[`border${sd}Style`] === "none" || !parseFloat(cs[`border${sd}Width`])) continue;
        const c = colour(cs[`border${sd}Color`]);
        if (c && !ours(c)) m.l = T.role(c, "line");
        break;
      }
      const fg = colour(cs.color), up = el.parentElement && (fgs.get(el.parentElement) || colour(getComputedStyle(el.parentElement).color));
      fgs.set(el, fg);
      const head = () => !!el.closest(HEAD);
      if (fg && fg[3] > 0 && !ours(fg) && (ownText(el) || !up || key(up) !== key(fg))) m.c = T.role(fg, "fg", fillAt(el), head());
      if (el instanceof SVGElement && SHAPE.test(el.localName)) {
        for (const [p, a] of [["fill", "f"], ["stroke", "s"]]) {
          const c = colour(cs[p]);
          if (!c || c[3] === 0 || ours(c) || (fg && key(c) === key(fg))) continue;
          // ink in an icon takes its text colour; a pale shape (a picture's paper, a badge's cut-out) takes a fill's
          const r = T.role(c, "fg", fillAt(el)), b = !r && c[3] >= 0.95 && T.role(c, "bg");
          if (r) { m[a] = ""; m.c = r; } else if (b) m[a] = b;
        }
      }
      if (cs.boxShadow !== "none") m.sh = T.recolour(cs.boxShadow, "shadow", null, false, ours);
      if (m.b || m.l || m.c || m.f != null || m.s != null || m.sh) want.set(el, m);
    }
    for (const [el, m] of want) {
      if (m.b) el.setAttribute("data-pc-b", m.b);
      if (m.l) el.setAttribute("data-pc-l", m.l);
      if (m.c) el.setAttribute("data-pc-c", m.c);
      if (m.f != null) el.setAttribute("data-pc-f", m.f);
      if (m.s != null) el.setAttribute("data-pc-s", m.s);
      // a shadow's shape is the element's own, so its new colours go inline (and come off again in clear())
      if (m.sh) { shadows.set(el, el.style.getPropertyValue("box-shadow")); el.setAttribute("data-pc-sh", ""); el.style.setProperty("box-shadow", m.sh, "important"); }
    }
  }
  const shadows = new WeakMap();

  // ── text that doesn't read, and teachers' colours ──
  // Each bit of text is measured against what's really behind it and, under 3:1, given a colour that reads: the theme's
  // text on the theme, Canvas's dark ink in a teacher's light box. A teacher's own colours (canvas.css greys them in a
  // dark theme for the first paint) come back wherever they read and shift until they do where they don't.
  /** The colour a teacher gave this text in their page (style="color: …" or <font color>), if any. */
  function authored(el, box) {
    for (let a = el; a; a = a.parentElement) {
      const c = colour(a.style?.color || (a.localName === "font" ? a.getAttribute("color") : ""));
      if (c) return c;
      if (a === box || a.localName === "a") return null;
    }
    return null;
  }
  const NOT_TEXT = "script, style, noscript, template, svg, math, iframe, textarea, select, .pc-root, .MathJax, .katex";
  function ink(scopes) {
    const rs = getComputedStyle(root), text = T.hex(rs.getPropertyValue("--pc-text")), text2 = T.hex(rs.getPropertyValue("--pc-text2"));
    const pb = doc.body && colour(getComputedStyle(doc.body).backgroundColor);
    if (!text || !text2 || !pb) return;
    const page = T.over(pb, "#000000"), boxes = `:is(${AUTHOR}) [style*="background"]`;
    // text on one of the theme's own fills (a key, a badge, today in a calendar) takes that fill's text colour
    const on = new Map([...Object.entries(T.ON), ["acc2", "on-acc2"]].map(([f, t]) => [T.hex(rs.getPropertyValue("--pc-" + f)), T.hex(rs.getPropertyValue("--pc-" + t))]));
    for (const s of scopes) for (const el of [s, ...s.querySelectorAll(boxes)]) if (el.matches(boxes) && T.paper(colour(el.style.backgroundColor))) el.setAttribute("data-pc-b", "none");
    // what's behind an element: its own fill, else its parent's; null on a picture or gradient
    const grounds = new Map();
    const ground = (el) => {
      if (!el || el === doc.body || el === root) return page;
      if (!grounds.has(el)) {
        const cs = getComputedStyle(el), b = colour(cs.backgroundColor);
        let g;
        if (cs.backgroundImage !== "none") g = null;
        else if (b && b[3] >= 0.99) g = T.over(b, page);
        else { const u = ground(el.parentElement); g = u && b && b[3] > 0 ? T.over(b, u) : u; }
        grounds.set(el, g);
      }
      return grounds.get(el);
    };
    const els = new Set();
    for (const s of scopes) {
      if (s.closest(NOT_TEXT)) continue;
      const w = doc.createTreeWalker(s, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
        (n) => n.nodeType === 1 ? (n.matches(NOT_TEXT) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_SKIP) : n.data.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP);
      for (let n = w.nextNode(); n; n = w.nextNode()) els.add(n.parentElement);
    }
    const marks = [];
    for (const el of els) {
      if (!el.checkVisibility({ visibilityProperty: true })) continue;
      const g = ground(el), now = colour(getComputedStyle(el).color);
      if (!g || !now || now[3] === 0) continue;
      const box = el.closest(AUTHOR), own = box && authored(el, box), fg = T.over(own || now, g);
      const lit = !box && on.get(g), want = lit && T.contrast(fg, g) < 3 ? lit
        : T.ink(fg, g, el.closest("h1, h2, h3, h4, h5, h6") ? text : text2, own ? 4.5 : 3) || (own ? fg : null);
      if (want && want !== T.over(now, g)) marks.push([el, want]);
    }
    for (const [el, c] of marks) { el.setAttribute("data-pc-ink", ""); el.style.setProperty("--pc-ink", c); }
  }

  // ── when ──
  function clear(scope) {
    const els = scope.querySelectorAll(MARKED);
    for (const el of scope.matches(MARKED) ? [scope, ...els] : els) {
      if (el.hasAttribute("data-pc-sh")) { el.style.removeProperty("box-shadow"); if (shadows.get(el)) el.style.setProperty("box-shadow", shadows.get(el)); }
      for (const m of MARKS) el.removeAttribute(m);
      el.style.removeProperty("--pc-ink");
    }
  }
  // Measuring holds the scopes still (data-pc-still: no transitions), so a key fading to its pressed colour, or back
  // to Canvas's while its marks are cleared, is read as it ends up and not halfway.
  function measure(scopes, again) {
    for (const s of scopes) s.setAttribute("data-pc-still", "");
    if (again) for (const s of again) clear(s);
    paint(scopes); ink(scopes);
    getComputedStyle(doc.body).color;
    for (const s of scopes) s.removeAttribute("data-pc-still");
  }
  /** The whole page again: a new theme, or a sheet that loaded late. */
  function full() {
    if (!doc.body) return;
    sheets(); measure([doc.body], [doc.body]);
  }
  /** Of a set of elements, the ones no other one holds. */
  const outermost = (set) => [...set].filter((el) => { for (let a = el.parentElement; a; a = a.parentElement) if (set.has(a)) return false; return true; });
  function changed(recs) {
    if (!doc.body) return;
    sheets();
    const add = new Set(), again = [];
    for (const r of recs) {
      const el = r.type === "attributes" ? r.target : null;
      if (el) { if (el.isConnected && el !== root && !el.closest(SKIP)) { add.add(el); again.push(el); } continue; }
      for (const n of r.addedNodes) { const e = n.nodeType === 1 ? n : n.parentElement; if (e && e.isConnected && e !== root && !e.closest(SKIP)) add.add(e); }
    }
    if (add.size) measure(outermost(add), again);
  }
  let mo = null, sig = "";
  const look = () => [root.hasAttribute("data-pc-on"), root.dataset.pcLook, ...T.KEYS.map((k) => root.style.getPropertyValue("--pc-" + k))].join();
  function start() {
    probe();
    if (!mo) {
      mo = new MutationObserver(changed);
      mo.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: STATE });
    }
    full();
  }
  function stop() {
    if (mo) { mo.disconnect(); mo = null; }
    for (const [st, p, v, pri] of edits) st.setProperty(p, v, pri);
    edits = []; seen = new WeakMap();
    clear(root);
  }
  /** Follow the theme on <html>: start, stop, or measure again when its colours change. */
  function follow() {
    const now = look();
    if (now === sig) return;
    sig = now;
    if (root.hasAttribute("data-pc-on")) start(); else stop();
  }
  new MutationObserver(follow).observe(root, { attributes: true, attributeFilter: ["data-pc-on", "data-pc-look", "style"] });
  follow();
  // A stylesheet that arrives after the page has drawn (Canvas loads some with the page's scripts) changes Canvas's
  // colours under the marks, so the page is measured again, once for a burst of them: a whole pass restyles the page
  // three times, about a quarter second on a long class home.
  let late = 0;
  doc.addEventListener("load", (e) => {
    if (!mo || e.target.localName !== "link" || !/stylesheet/i.test(e.target.rel)) return;
    clearTimeout(late); late = setTimeout(() => mo && full(), 80);
  }, true);
  PC.paint = { full };
})();
