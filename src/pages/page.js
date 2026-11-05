/* PocketCanvas: what every extension page shares. PC.page.start(render) reads the state, applies the theme, calls
   render(S, V) and calls it again whenever storage changes (a check in the popup redraws the board at once). The
   view V has your classes and work with ghosts and hidden left out; V.all has everything. */
(function (g) {
  const PC = g.PC, api = PC.api, doc = g.document;
  let S = null, draw = null;
  function view() {
    const V = PC.work.view(S, { now: Date.now() });
    V.all = PC.work.view(S, { now: V.now, includeAll: true, includeHidden: true });
    V.hidden = V.all.items.filter((i) => i.flags.hide);
    return V;
  }
  async function again() {
    S = await PC.store.all();
    PC.u.setClock24(S.settings.clock24);
    PC.kit.theme(S);
    if (draw) draw(S, view());
  }
  const soon = PC.u.debounce(again, 60);
  PC.page = {
    async start(render) {
      draw = render;
      api.storage.onChanged.addListener(soon);
      if (g.matchMedia) g.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", soon);
      setInterval(() => PC.kit.tick(), 1000);
      await again();
    },
    get S() { return S; },
    redraw: soon,
    /** The top bar every full page has. */
    top(title, right) {
      return `<header class="pc-top pc-ui"><a class="pc-brand" href="board.html" data-act="board"><span class="pc-mark">PC</span><span>${PC.u.esc(title)}</span></a><span class="pc-sp"></span>${right || ""}</header>`;
    },
    open: (p, hash) => api.runtime.sendMessage({ t: "open", page: p, hash }),
    /** Send to a Canvas tab, else read Canvas from the background; toasts what happened. */
    async refresh() {
      PC.kit.toast("Reading Canvas…", { ms: 2500 });
      const r = await api.runtime.sendMessage({ t: "refresh" }).catch((e) => ({ ok: false, error: e.message }));
      PC.kit.toast(r && r.ok ? "Up to date" : (r && r.error) || "Couldn't read Canvas");
    },
    /** Delegate clicks inside `el` to the kit's shared actions plus `extra(act, el, e)`. */
    bind(el, extra) {
      el.addEventListener("click", async (e) => {
        const a = e.target.closest("[data-act]"); if (!a || !el.contains(a)) return;
        const V = view();
        if (extra && (await extra(a.dataset.act, a, e, V)) !== undefined) return;
        if (await PC.kit.act(a.dataset.act, a, V)) e.preventDefault();
      });
    },
    view: () => view(),
  };
})(globalThis);
