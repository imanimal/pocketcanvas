/* PocketCanvas: themes. A theme file is the shared Pocket theme format (docs/THEMES.md), the same JSON Collegiapp
   and Claude Companion import, so a theme made for one works in all three:
     { "pocketTheme": 1, "id", "name", "by", "look": "pocket" | "standard", "scheme": "light" | "dark",
       "tokens": { bg … k6 }, "css": "optional extra CSS" }
   `look` picks the parts: "pocket" is the handheld (raised keys, graphite label bands, LCD inlays, pixel icons),
   "standard" a plain modern UI (flat surfaces, hairlines, plain numbers, line icons). Tokens are hex colours;
   missing ones come from the built-in theme of the same look and scheme. normalize() checks contrast (4.5:1 for
   text) and fix() repairs it. apply() writes the tokens as --pc-* custom properties. */
(function (g) {
  const PC = (g.PC = g.PC || {});

  const KEYS = ["bg", "bg2", "surface", "surface2", "line", "text", "text2", "text3", "chrome-bg", "chrome-fg", "accent", "on-accent",
    "warn", "bad", "on-bad", "ok", "acc2", "disp-bg", "disp-fg", "disp-hot", "disp-bad", "k1", "k2", "k3", "k4", "k5", "k6"];
  const T = (look, scheme, id, name, note, tk) => ({ pocketTheme: 1, id, name, note, by: "PocketCanvas", look, scheme, builtin: true,
    tokens: Object.fromEntries(KEYS.map((k, i) => [k, tk[i]])) });

  // Pocket Cream and Night are Collegiapp's P9 and P11 (docs/UIKit/README.md § 2); the rest are new in the theme browser
  const BUILTIN = [
    T("pocket", "light", "pocket-cream", "Pocket Cream", "Light handheld plastic, orange keys, reflective LCD", ["#e6e2d8", "#fbf9f4", "#f6f3ec", "#ebe7dd", "#d3ccbd", "#1b1915", "#4a453c", "#6a645a", "#2a2722", "#f6f3ec", "#ff5b1f", "#1b1915",
      "#9a5b00", "#c8341b", "#ffffff", "#2e7d32", "#2f6fde", "#b1bd93", "#1f2a17", "#e9b45a", "#ee8f6e", "#2f6fde", "#ff5b1f", "#2e8b57", "#b03aa8", "#c27a00", "#5b5548"]),
    T("pocket", "dark", "pocket-night", "Pocket Night", "Graphite plastic and a backlit LCD for late study", ["#1a1917", "#2a2926", "#262522", "#302e2a", "#3f3c36", "#f4efe5", "#d0c9ba", "#a39c8d", "#0f0e0d", "#ece6da", "#ff6a2b", "#1b1915",
      "#f0b54a", "#ff7a5c", "#1b1915", "#62c470", "#7aa5ff", "#45b3a1", "#04211c", "#e2b04f", "#ef8b6c", "#7aa5ff", "#ff7a3d", "#4fbf86", "#d77bd0", "#e3a640", "#a39c8d"]),
    T("pocket", "light", "pocket-gaucho", "Pocket Gaucho", "UCSB navy bands and gold keys", ["#e3e7ec", "#fbfcfd", "#f5f7f9", "#e9edf1", "#ccd4dd", "#10202f", "#3a4a5a", "#56636f", "#003660", "#f5f7f9", "#febc11", "#10202f",
      "#8a5a00", "#c42b1c", "#ffffff", "#2a7a3b", "#1f6fb2", "#b1bd93", "#1f2a17", "#f2c75c", "#ee8f6e", "#1f6fb2", "#d9480f", "#2f8f4e", "#a23d9a", "#b7791f", "#56636f"]),
    T("pocket", "light", "pocket-pistachio", "Pocket Pistachio", "Pale green plastic with a red-orange key", ["#dfe6dc", "#f9fbf8", "#f2f6f0", "#e4ebe1", "#c7d2c3", "#172016", "#3d4a3b", "#5a6657", "#243024", "#f2f6f0", "#e8503a", "#170c09",
      "#8a5a00", "#b8321c", "#ffffff", "#2a7a3b", "#2f6fde", "#a9c0a0", "#162414", "#e9b45a", "#ee8f6e", "#2f6fde", "#e8503a", "#2e8b57", "#a23d9a", "#b7791f", "#5a6657"]),
    T("pocket", "dark", "pocket-ink", "Pocket Ink", "Blue-black plastic with a blue backlight", ["#141922", "#222a37", "#1c2330", "#252e3d", "#343f52", "#eef2f8", "#c8d0dc", "#98a3b4", "#0b0f16", "#e6ebf2", "#ff7a3d", "#1b1915",
      "#f0b54a", "#ff7a5c", "#1b1915", "#62c470", "#7aa5ff", "#6fb8e0", "#051824", "#e2b04f", "#ef8b6c", "#7aa5ff", "#ff8a4c", "#4fbf86", "#d77bd0", "#e3a640", "#98a3b4"]),
    T("standard", "light", "standard-light", "Standard", "Plain and bright: white cards, grey hairlines, one blue accent", ["#f4f4f2", "#ffffff", "#ffffff", "#f1f1ef", "#dededa", "#1c1c1b", "#444441", "#686864", "#1c1c1b", "#fafaf9", "#2b59c3", "#ffffff",
      "#8a5a00", "#c42b1c", "#ffffff", "#2a7a3b", "#0f7b8a", "#f1f1ef", "#1c1c1b", "#fbeccc", "#fbe0dc", "#2b59c3", "#d9480f", "#2f8f4e", "#a23d9a", "#b7791f", "#686864"]),
    T("standard", "dark", "standard-dark", "Standard Dark", "The plain look on charcoal", ["#141516", "#1d1e20", "#1b1c1e", "#26272a", "#333539", "#ededec", "#c9c9c6", "#9a9a96", "#0c0c0d", "#ededec", "#7ea2ff", "#0f1420",
      "#e8b04a", "#ff7b6b", "#1a0d0b", "#6cc47f", "#5fc4d0", "#26272a", "#ededec", "#4a3a12", "#4d201b", "#7ea2ff", "#ff8a4c", "#5cc489", "#d58ad0", "#e3b04f", "#9a9a96"]),
    T("standard", "light", "standard-contrast", "Standard Contrast", "Black on white with strong borders, for bright rooms", ["#ffffff", "#ffffff", "#ffffff", "#f0f0f0", "#767676", "#000000", "#1a1a1a", "#3d3d3d", "#000000", "#ffffff", "#0040c1", "#ffffff",
      "#6e4400", "#a8200f", "#ffffff", "#1d5c2b", "#00606b", "#f0f0f0", "#000000", "#ffe08a", "#ffc4ba", "#0040c1", "#b33900", "#1d6b36", "#8a2b83", "#7a5200", "#3d3d3d"]),
  ];
  const byId = (id) => BUILTIN.find((t) => t.id === id);

  // ── colour maths (WCAG 2.x) ──
  const hex = (s) => { s = String(s || "").trim().toLowerCase(); if (/^#[0-9a-f]{3}$/.test(s)) s = "#" + s.slice(1).replace(/./g, "$&$&"); return /^#[0-9a-f]{6}$/.test(s) ? s : null; };
  const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const lum = (h) => { const [r, g2, b] = rgb(h).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g2 + 0.0722 * b; };
  const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const mix = (a, b, t) => "#" + rgb(a).map((v, i) => Math.round(v + (rgb(b)[i] - v) * t).toString(16).padStart(2, "0")).join("");

  // [foreground, background, minimum, the token to repair]
  const PAIRS = [["text", "surface", 4.5], ["text2", "surface", 4.5], ["text3", "surface", 4.5], ["text3", "bg", 4.5], ["text3", "surface2", 4.5],
    ["on-accent", "accent", 4.5], ["chrome-fg", "chrome-bg", 4.5], ["on-bad", "bad", 4.5], ["disp-fg", "disp-bg", 4.5], ["disp-fg", "disp-hot", 4.5], ["disp-fg", "disp-bad", 4.5],
    ["warn", "surface", 3], ["bad", "surface", 3], ["ok", "surface", 3]];

  function checks(tk) {
    return PAIRS.map(([f, b, min]) => ({ f, b, min, r: contrast(tk[f], tk[b]) })).filter((c) => c.r < c.min);
  }
  /** Repair failing pairs by moving the foreground toward black or white, whichever the background needs. */
  function fix(theme) {
    const tk = Object.assign({}, theme.tokens);
    for (let pass = 0; pass < 3; pass++) for (const c of checks(tk)) {
      const toward = lum(tk[c.b]) > 0.18 ? "#000000" : "#ffffff";
      let t = 0; while (t < 1 && contrast(tk[c.f], tk[c.b]) < c.min) { t += 0.05; tk[c.f] = mix(theme.tokens[c.f] || tk[c.f], toward, Math.min(1, t)); }
    }
    return Object.assign({}, theme, { tokens: tk });
  }

  // ── Canvas's own colours (paint.js) ──
  const alpha = (a) => (a == null ? 1 : a.endsWith("%") ? parseFloat(a) / 100 : +a);
  const byte = (v) => Math.max(0, Math.min(255, Math.round(v)));
  /** A colour as a browser reports it (#rgb, #rrggbb, rgb(), rgba(), color(srgb …), transparent) as [r, g, b, a], else null. */
  function rgba(s) {
    s = String(s || "").trim().toLowerCase();
    if (s === "transparent") return [0, 0, 0, 0];
    const h = hex(s);
    if (h) return [...rgb(h), 1];
    let m = /^#([0-9a-f]{3}|[0-9a-f]{6})([0-9a-f]{1,2})$/.exec(s);
    if (m && m[2].length * 3 === m[1].length) return [...rgb(hex("#" + m[1])), parseInt(m[2].length === 1 ? m[2] + m[2] : m[2], 16) / 255];
    m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)\s*(?:[,/]\s*([\d.]+%?)\s*)?\)$/.exec(s);
    if (m) return [byte(m[1]), byte(m[2]), byte(m[3]), alpha(m[4])];
    m = /^color\(srgb\s+([-\d.e]+)\s+([-\d.e]+)\s+([-\d.e]+)\s*(?:\/\s*([\d.]+%?)\s*)?\)$/.exec(s);
    if (m) return [byte(m[1] * 255), byte(m[2] * 255), byte(m[3] * 255), alpha(m[4])];
    return null;
  }
  /** `c` ([r, g, b, a]) laid over the solid colour `under` (#rrggbb), as #rrggbb. */
  const over = (c, under) => "#" + rgb(under).map((u, i) => byte(c[i] * c[3] + u * (1 - c[3])).toString(16).padStart(2, "0")).join("");
  /** White or a near-white grey ([r, g, b, a]): what pasting from Word or Docs leaves behind, not a tint someone chose. */
  const paper = (c) => !!c && c[3] > 0.5 && Math.min(c[0], c[1], c[2]) >= 232 && Math.max(c[0], c[1], c[2]) - Math.min(c[0], c[1], c[2]) < 16;
  /** Canvas's own body text, for text on a light box in a dark theme. */
  const CANVAS_INK = "#2d3b45";
  /**
   * What to draw text `fg` in where it doesn't read on `bg` (both #rrggbb), or null where it does: 3:1 for Canvas's own
   * text, `min` (4.5) for a colour a teacher chose. Grey text takes `text` (the theme's) or Canvas's ink, whichever reads;
   * coloured text keeps its hue and moves toward white or black until it reaches 4.5:1.
   */
  function ink(fg, bg, text, min) {
    if (contrast(fg, bg) >= (min || 3)) return null;
    const c = rgb(fg);
    if (Math.max(...c) - Math.min(...c) < 48) {
      for (const t of [text, CANVAS_INK]) if (t && contrast(t, bg) >= 4.5) return t;
      return contrast("#000000", bg) > contrast("#ffffff", bg) ? "#000000" : "#ffffff";
    }
    const toward = lum(bg) > 0.18 ? "#000000" : "#ffffff";
    for (let t = 0.05; t < 1; t += 0.05) { const m = mix(fg, toward, t); if (contrast(m, bg) >= 4.5) return m; }
    return toward;
  }

  // Canvas and InstUI draw every page from one light palette: white cards, pale grey wells, grey hairlines, slate text,
  // a blue (or the school's colour) for links and the main key, and green, red and amber for states. role() names the
  // job a colour does there from its hue and lightness, not from a list of shades, so pages and shades Canvas adds
  // later are covered too. Each job is a theme token, or one canvas.css makes from them (link, tint-*).
  const FILLS = new Set(["accent", "chrome-bg", "bad", "ok", "warn", "text3"]);
  const ON = { accent: "on-accent", "chrome-bg": "chrome-fg", bad: "on-bad", ok: "on-ok", warn: "on-warn", text3: "on-mute" };
  /** Text tokens for the fills a theme names none for, made by apply(): [token, fill]. */
  const ON_MORE = [["on-ok", "ok"], ["on-warn", "warn"], ["on-mute", "text3"], ["on-acc2", "acc2"]];
  const onFill = (tk, b) => (contrast(tk.surface, tk[b]) >= contrast(tk.text, tk[b]) ? tk.surface : tk.text);
  /**
   * The token to draw one of Canvas's colours ([r, g, b, a]) in, by its use: "bg" (a fill), "fg" (text, icons) or
   * "line" (borders, rings). `fill` is the token of the solid fill under text, if any (white or slate text there takes
   * that fill's text colour); `head` is a heading's text. Null keeps the colour: see-through greys (shadows, scrims),
   * colours outside Canvas's families, and white text with no fill known under it.
   */
  function role(c, use, fill, head) {
    if (!c || c[3] === 0) return null;
    const h6 = c[3] < 1 ? over(c, "#ffffff") : over([c[0], c[1], c[2], 1], "#000000"), [r, g, b] = rgb(h6), L = lum(h6);
    const max = Math.max(r, g, b), ch = max - Math.min(r, g, b), s = max ? ch / max : 0;
    const grey = ch < 34 && s < 0.45 && !(L > 0.5 && s >= 0.06);
    if (grey && c[3] < 0.95 && use !== "fg") return null;
    let fam = null;
    if (!grey) {
      const h = ((r === max ? (g - b) / ch : g === max ? 2 + (b - r) / ch : 4 + (r - g) / ch) * 60 + 360) % 360;
      fam = h >= 330 || h < 14 ? "bad" : h < 65 ? "warn" : h < 180 ? "ok" : h < 255 ? "accent" : null;
    }
    if (use === "bg") {
      if (grey) return L >= 0.94 ? "surface" : L >= 0.6 ? "surface2" : L >= 0.3 ? "line" : L >= 0.1 ? "text3" : "chrome-bg";
      return fam && (L >= 0.7 ? "tint-" + fam : fam);
    }
    if (use === "line") return grey ? (L >= 0.15 ? "line" : "text3") : fam && (L >= 0.7 ? "line" : fam);
    if (FILLS.has(fill) && (grey || L >= 0.7)) return ON[fill];
    if (grey) return L < 0.1 ? (head ? "text" : "text2") : L < 0.75 ? "text3" : null;
    return fam && L < 0.7 ? { accent: "link", warn: "warn-ink" }[fam] || fam : null;
  }
  const COLOUR = /#[0-9a-f]{3,8}\b|(?:rgba?|color)\([^()]*\)|\b(?:white|black)\b/gi;
  /**
   * A CSS value with Canvas's colours in it swapped for var(--pc-<role>), or null when none changes. `use` as for
   * role(), or "shadow" for a box-shadow, where only solid pale greys (hairlines drawn as shadows) and colours (focus
   * rings) change; a drop shadow keeps its grey. `keep(c)` spares colours that are already the theme's.
   */
  function recolour(v, use, fill, head, keep) {
    let n = 0;
    const out = String(v).replace(COLOUR, (m) => {
      const c = rgba(/^white$/i.test(m) ? "#ffffff" : /^black$/i.test(m) ? "#000000" : m);
      const flat = c && c[3] === 1 && Math.max(c[0], c[1], c[2]) - Math.min(c[0], c[1], c[2]) < 34;
      const r = c && !(keep && keep(c)) && !(use === "shadow" && (c[3] < 1 || (flat && lum(over(c, "#000000")) < 0.1))) && role(c, use === "shadow" ? "line" : use, fill, head);
      if (!r) return m;
      n++; return `var(--pc-${r})`;
    });
    return n ? out : null;
  }

  const slug = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
  // Theme CSS may restyle anything, but never loads anything: no @import, no url() other than data: URLs
  const safeCss = (css) => String(css || "").slice(0, 60000).replace(/@import[^;]*;?/gi, "").replace(/url\(\s*(['"]?)(?!data:)[^)]*\)/gi, "none");

  /**
   * Read a theme from anything: an object, JSON text, or a chatbot reply with prose and code fences around the JSON.
   * Accepts Collegiapp v1 theme packs too (palette.tokens with p-* names). Returns { theme, warnings, error }.
   */
  function normalize(input) {
    let o = input;
    if (typeof o === "string") {
      const s = o.indexOf("{"), e = o.lastIndexOf("}");
      if (s < 0 || e < s) return { error: "No JSON object found. Paste the whole reply, or a theme file." };
      try { o = JSON.parse(o.slice(s, e + 1)); } catch (err) { return { error: "That JSON doesn't parse: " + err.message }; }
    }
    if (!o || typeof o !== "object") return { error: "That isn't a theme." };
    let src = o.tokens || (o.palette && o.palette.tokens) || o.colors || {};
    // Collegiapp v1 names → shared names
    const V1 = { "p-surface": "surface", "p-surface2": "surface2", "p-line": "line", "p-text": "text", "p-text2": "text2", "p-text3": "text3", "p-acc": "accent", "p-on-acc": "on-accent",
      "p-disp-bg": "disp-bg", "p-disp-fg": "disp-fg", "p-disp-hot": "disp-hot", "p-disp-bad": "disp-bad" };
    src = Object.fromEntries(Object.entries(src).map(([k, v]) => [V1[k] || String(k).replace(/^--(pc-)?/, ""), v]));
    const look = o.look === "standard" ? "standard" : "pocket";
    const bgGuess = hex(src.bg) || hex(src.surface);
    const scheme = o.scheme === "dark" || o.scheme === "light" ? o.scheme : bgGuess && lum(bgGuess) < 0.2 ? "dark" : "light";
    const base = BUILTIN.find((t) => t.look === look && t.scheme === scheme) || BUILTIN[0];
    const warnings = [];
    const tokens = {};
    let missing = 0;
    for (const k of KEYS) { const v = hex(src[k]); if (v) tokens[k] = v; else { tokens[k] = base.tokens[k]; missing++; } }
    if (missing === KEYS.length) return { error: "None of the colours were readable. Tokens are hex colours like #1b1915." };
    if (missing) warnings.push(`${missing} colour${missing > 1 ? "s" : ""} missing, taken from ${base.name}.`);
    const name = String(o.name || "My theme").slice(0, 48);
    const theme = { pocketTheme: 1, id: slug(o.id || name) || "theme", name, by: String(o.by || o.author || "").slice(0, 48), note: String(o.note || o.description || "").slice(0, 120),
      look, scheme, tokens, css: safeCss(o.css) };
    if (byId(theme.id)) theme.id = "my-" + theme.id;
    const bad = checks(tokens);
    if (bad.length) warnings.push("Low contrast: " + bad.map((c) => `${c.f} on ${c.b} ${c.r.toFixed(1)}:1 (needs ${c.min})`).join(", ") + ".");
    return { theme, warnings, lowContrast: bad.length > 0 };
  }

  /** Write a theme's tokens as --pc-* on `root` (an element), and its look and scheme as data attributes. */
  function apply(theme, root) {
    root = root || g.document.documentElement;
    const tk = theme.tokens;
    for (const k of KEYS) root.style.setProperty("--pc-" + k, tk[k]);
    for (const [k, b] of ON_MORE) root.style.setProperty("--pc-" + k, onFill(tk, b));
    root.dataset.pcLook = theme.look; root.dataset.pcScheme = theme.scheme;
    root.style.colorScheme = theme.scheme;
  }

  /** Whether it's night now: night is always on, scheduled now, or on with the system and the system is dark. */
  function isNight(settings, now) {
    const s = settings || {};
    if (s.night === "on") return true;
    if (s.night === "auto") return !!(g.matchMedia && g.matchMedia("(prefers-color-scheme: dark)").matches);
    if (s.night !== "schedule") return false;
    const m = (t) => { const [h, mm] = String(t || "0:0").split(":").map(Number); return h * 60 + (mm || 0); };
    const d = new Date(now || Date.now()), cur = d.getHours() * 60 + d.getMinutes(), a = m(s.nightFrom || "20:00"), b = m(s.nightTo || "07:00");
    return a > b ? cur >= a || cur < b : cur >= a && cur < b;
  }

  /** Which theme to show now: the night theme while it's night, else the day theme. Each shows exactly in its slot,
      light or dark (the settings page picks them as a Day and a Night slot). */
  function pick(settings, all, now) {
    const s = settings || {}, find = (id) => (all || BUILTIN).find((t) => t.id === id);
    return isNight(s, now) ? find(s.nightTheme) || byId("pocket-night") : find(s.theme) || BUILTIN[0];
  }

  /** The prompt for a chatbot. `idea` is the user's description. */
  function prompt(idea) {
    return `Make a colour theme for my Pocket apps (Collegiapp, PocketCanvas, Claude Companion). Reply with only one JSON object, no other text.

My idea: ${idea || "surprise me, something calm I can study with for hours"}

Format:
{"pocketTheme":1,"name":"…","look":"pocket","scheme":"light","tokens":{"bg":"#…", …}}

"look" is "pocket" (a handheld device: raised keys, dark label bands, small LCD screens) or "standard" (a plain modern UI: flat surfaces and thin borders). "scheme" is "light" or "dark".

Tokens, all hex #rrggbb:
- bg: page body behind the cards; bg2: recessed fields and inputs
- surface: card fill; surface2: key faces, wells, idle pills; line: hairlines and borders
- text: titles; text2: body text; text3: meta and placeholders
- chrome-bg, chrome-fg: label bands and dark keys, and the text on them
- accent, on-accent: the single most important action and the text on it (it means "do this", so not decoration)
- warn: due soon; bad, on-bad: overdue and the text on it; ok: done
- acc2: events and secondary marks
- disp-bg, disp-fg: the LCD screen and its digits; disp-hot, disp-bad: the LCD backlight when due soon or overdue (disp-fg is drawn on both)
- k1 k2 k3 k4 k5 k6: six clearly different course colours that read on surface

Rules: text, text2 and text3 reach 4.5:1 contrast on surface and on bg. on-accent on accent, chrome-fg on chrome-bg, on-bad on bad, and disp-fg on disp-bg, disp-hot and disp-bad all reach 4.5:1. warn, bad and ok reach 3:1 on surface. No gradients and no neon; pick colours that fit the idea.`;
  }
  /** A chatbot link that opens with the prompt filled in. Claude is the default; any chatbot works with Copy. */
  const BOTS = { claude: (p) => "https://claude.ai/new?q=" + encodeURIComponent(p), chatgpt: (p) => "https://chatgpt.com/?q=" + encodeURIComponent(p) };

  /** A 5-colour strip for theme cards. */
  const swatch = (t) => ["bg", "surface", "chrome-bg", "accent", "disp-bg"].map((k) => t.tokens[k]);

  PC.themes = { KEYS, BUILTIN, byId, normalize, fix, apply, isNight, pick, prompt, BOTS, contrast, hex, checks, swatch, safeCss, rgba, over, paper, ink, role, recolour, FILLS, ON };
})(globalThis);
