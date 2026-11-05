/* PocketCanvas: where a blocked site lands during focus. The time left, what to do first instead, and an emergency
   exit: hold the key for 2.5 seconds to let every site through for 5 minutes. */
(function () {
  const PC = globalThis.PC, api = PC.api, K = PC.kit, P = PC.page, { esc } = PC.u;
  const app = document.getElementById("app");
  const want = /^https?:\/\//.test(location.hash.slice(1)) ? location.hash.slice(1) : "";
  const site = PC.u.hostOf(want) || "This site";
  document.body.classList.add("pc-blocked");

  function render(S, V) {
    const f = S.focus && S.focus.until > Date.now() ? { until: S.focus.until, from: "PocketCanvas" } : S.cap && S.cap.focus ? { until: S.cap.focus.until, from: "Collegiapp" } : null;
    const top = PC.work.rank(V.items, V.now)[0];
    app.innerHTML = `<div class="pc-bcard">
      ${K.lcd({ label: f ? "Focus ends in" : "Focus ended", num: f && f.until ? PC.u.countdown(f.until - Date.now()) : f ? "ON" : "0:00", until: f && f.until ? f.until : "" })}
      <h1>${esc(site.replace(/^www\./, ""))} is blocked while you focus</h1>
      <p>${f ? `${esc(f.from)} started this focus session.` : "The block lifts in a moment. Reload to go on."} Your list is right here instead.</p>
      ${top ? K.hero(top, V, {}) : ""}
      <div class="pc-row2" style="justify-content:center">${K.key("Open the board", { icon: "all", cls: "primary", act: "board" })}
        ${f ? `<button type="button" class="pc-key ghost pc-hold" data-act="hold" title="Hold for 2.5 seconds">${PC.ic("lock")}<span class="pc-kl">Hold to let me through for 5 min</span><i></i></button>` : K.key("Go on", { icon: "go", act: "go" })}</div></div>`;
  }
  let timer = null;
  const release = () => { clearTimeout(timer); timer = null; const h = app.querySelector(".pc-hold"); if (h) h.classList.remove("go"); };
  app.addEventListener("pointerdown", (e) => {
    const h = e.target.closest(".pc-hold"); if (!h) return;
    h.classList.add("go");
    timer = setTimeout(async () => { await api.runtime.sendMessage({ t: "focus", pause: 5 }); if (want) location.replace(want); }, 2500);
  });
  app.addEventListener("pointerup", release); app.addEventListener("pointerleave", release, true); app.addEventListener("pointercancel", release);
  P.bind(app, (act) => {
    if (act === "board") { location.href = "board.html"; return true; }
    if (act === "go") { if (want) location.replace(want); return true; }
    if (act === "hold") return true;
  });
  P.start(render);
})();
