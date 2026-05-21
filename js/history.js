/* ============================================
   LIFT — Storico + Dettaglio sessione
   ============================================ */

async function openHistory() {
  showScreen("history");
  const root = document.getElementById("screen-history");
  root.innerHTML = `
    <div class="history-head">
      <button class="icon-btn" id="hist-back" aria-label="Indietro">${iconSvg(
        "arrow-left"
      )}</button>
      <div class="history-title">Storico</div>
    </div>
    <div id="hist-list" class="history-list"></div>
  `;
  document.getElementById("hist-back").onclick = openProfile;

  const data = await apiGet("lift_get_data", {}, { silent: true });
  const sessions = (data && data.recentSessions) || [];
  const prs = (data && data.prs) || [];

  // Conto PR per sessione
  const prCountBySession = {};
  prs.forEach((p) => {
    const sid = p.sessionId;
    if (!sid) return;
    prCountBySession[sid] = (prCountBySession[sid] || 0) + 1;
  });

  const list = document.getElementById("hist-list");
  if (sessions.length === 0) {
    list.innerHTML = `<div class="empty-state">Nessuna sessione ancora.<br>Inizia una scheda dalla home.</div>`;
    return;
  }

  list.innerHTML = sessions
    .map((s) => {
      const d = s.startedAt ? new Date(s.startedAt) : new Date();
      const day = d.getDate();
      const mon = d.toLocaleDateString("it-IT", { month: "short" }).replace(".", "");
      const dur = s.durationSec
        ? Math.round(s.durationSec / 60) + " min"
        : "—";
      const prs = prCountBySession[s.id] || 0;
      return `
        <button class="history-item" data-sid="${s.id}">
          <div class="hi-date">
            <div class="d-day">${day}</div>
            <div class="d-mon">${mon}</div>
          </div>
          <div class="hi-body">
            <div class="hi-name">${escapeHtml(s.templateName || "Sessione")}</div>
            <div class="hi-meta">${dur}</div>
          </div>
          ${prs ? `<div class="hi-prs">★ ${prs}</div>` : ""}
        </button>`;
    })
    .join("");

  list.querySelectorAll(".history-item").forEach((btn) => {
    btn.onclick = () => openSessionDetail(btn.dataset.sid);
  });
}

/* ---------- Dettaglio sessione ---------- */

async function openSessionDetail(sessionId) {
  showScreen("session-detail");
  const root = document.getElementById("screen-session-detail");
  root.innerHTML = `<div class="empty-state">Carico…</div>`;

  let res;
  try {
    res = await apiPost("lift_get_session", { sessionId: sessionId });
  } catch (e) {
    root.innerHTML = `<div class="empty-state">Errore: ${escapeHtml(
      e.message || String(e)
    )}</div>`;
    return;
  }
  if (!res || res.status !== "OK") {
    root.innerHTML = `<div class="empty-state">Sessione non trovata</div>`;
    return;
  }
  _renderSessionDetail(res.session, res.sets || []);
}

function _renderSessionDetail(s, sets) {
  const root = document.getElementById("screen-session-detail");
  const dateStr = s.startedAt
    ? new Date(s.startedAt).toLocaleDateString("it-IT", {
        weekday: "long",
        day: "numeric",
        month: "long",
      })
    : "—";
  const dur = s.durationSec ? Math.round(s.durationSec / 60) + " min" : "—";

  // raggruppo i set per exerciseRef nell'ordine in cui appaiono
  const byEx = {};
  const order = [];
  sets.forEach((st) => {
    const k = st.exerciseRef;
    if (!byEx[k]) {
      byEx[k] = { name: st.exerciseName || _shortRef(k), sets: [] };
      order.push(k);
    }
    byEx[k].sets.push(st);
  });

  let totalVolume = 0;
  let prCount = 0;
  sets.forEach((st) => {
    totalVolume += parseFloat(st.volume) || 0;
    if (String(st.isPR).toLowerCase() === "true") prCount++;
  });

  const exHtml = order
    .map((k) => {
      const ex = byEx[k];
      const setsHtml = ex.sets
        .map((st) => {
          if (st.setType === "skipped") {
            return `<span class="sd-set skip">salto</span>`;
          }
          const isPR = String(st.isPR).toLowerCase() === "true";
          const label =
            (st.weight !== "" ? st.weight : "?") +
            " × " +
            (st.reps !== "" ? st.reps : "?");
          return `<span class="sd-set${isPR ? " pr" : ""}">${
            isPR ? "★ " : ""
          }${label}</span>`;
        })
        .join("");
      return `
        <div class="sd-ex">
          <div class="sd-ex-name">${escapeHtml(ex.name)}</div>
          <div class="sd-ex-sets">${setsHtml}</div>
        </div>`;
    })
    .join("");

  root.innerHTML = `
    <div class="history-head">
      <button class="icon-btn" id="sd-back" aria-label="Indietro">${iconSvg(
        "arrow-left"
      )}</button>
      <div class="history-title">Sessione</div>
    </div>

    <div class="sd-head">
      <div class="sd-date">${escapeHtml(dateStr)}</div>
      <div class="sd-name">${escapeHtml(s.templateName || "Sessione")}</div>
      <div class="sd-stats">
        <div class="sd-stat"><div class="v">${dur}</div><div class="l">durata</div></div>
        <div class="sd-stat"><div class="v">${Math.round(
          totalVolume
        )}</div><div class="l">volume</div></div>
        <div class="sd-stat"><div class="v">${prCount}</div><div class="l">PR</div></div>
      </div>
    </div>

    ${
      s.aiFeedback
        ? `<div class="sd-feedback">${escapeHtml(s.aiFeedback).replace(
            /\n/g,
            "<br>"
          )}</div>`
        : ""
    }

    <div class="section-label label-micro sd-section-label">Esercizi</div>
    ${exHtml || `<div class="empty-state">Nessun set registrato</div>`}
  `;

  document.getElementById("sd-back").onclick = openHistory;
}

function _shortRef(ref) {
  if (!ref) return "?";
  const id = String(ref).split(":")[1] || ref;
  return id.replace(/_/g, " ");
}
