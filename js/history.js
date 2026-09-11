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
  const list = document.getElementById("hist-list");

  let sessions = [];
  let prs = [];
  try {
    const res = await apiPost("lift_get_history", {});
    sessions = (res && res.sessions) || [];
    // i PR li prendo dal bootstrap (cache), per il badge ★
    const boot = await apiGet("lift_get_data", {}, { silent: true });
    prs = (boot && boot.prs) || [];
  } catch (e) {
    list.innerHTML = `<div class="empty-state">Errore nel caricamento dello storico.</div>`;
    return;
  }

  if (sessions.length === 0) {
    list.innerHTML = `<div class="empty-state">Nessuna sessione ancora.<br>Inizia una scheda dalla home.</div>`;
    return;
  }

  // conteggio PR per sessione (per il badge ★)
  const prCountBySession = {};
  prs.forEach((p) => {
    if (p.sessionId) prCountBySession[p.sessionId] = (prCountBySession[p.sessionId] || 0) + 1;
  });

  list.innerHTML = _renderHistoryGroups(sessions, prCountBySession);

  list.querySelectorAll(".history-item").forEach((btn) => {
    btn.onclick = () => openSessionDetail(btn.dataset.sid);
  });
}

/**
 * Raggruppa lo storico: prima per PROGRAMMA (i più recenti in alto), dentro
 * ogni programma per SETTIMANA (dalla più recente). Gli allenamenti senza
 * programma finiscono nel gruppo "Schede libere" in fondo.
 */
function _renderHistoryGroups(sessions, prCountBySession) {
  // 1. separo per programma, mantenendo l'ordine di comparsa (sessions già
  //    ordinate dal più recente).
  const byProgram = new Map(); // programId → { name, sessions[] }
  const libere = [];
  sessions.forEach((s) => {
    if (s.programId) {
      if (!byProgram.has(s.programId)) {
        byProgram.set(s.programId, {
          name: s.programName || "Programma",
          weeks: s.programWeeks || null,
          sessions: [],
        });
      }
      byProgram.get(s.programId).sessions.push(s);
    } else {
      libere.push(s);
    }
  });

  const blocks = [];

  // 2. un blocco per programma, con sotto-blocchi per settimana
  byProgram.forEach((prog) => {
    // raggruppo le sessioni del programma per settimana
    const byWeek = new Map(); // week → sessions[]
    prog.sessions.forEach((s) => {
      const wk = s.week != null ? s.week : "?";
      if (!byWeek.has(wk)) byWeek.set(wk, []);
      byWeek.get(wk).push(s);
    });
    // settimane dalla più alta (recente) alla più bassa
    const weeks = [...byWeek.keys()].sort((a, b) => {
      const na = a === "?" ? -1 : a;
      const nb = b === "?" ? -1 : b;
      return nb - na;
    });

    const weekBlocks = weeks
      .map((wk) => {
        const items = byWeek.get(wk).map((s) => _historyItemHtml(s, prCountBySession)).join("");
        const label = wk === "?" ? "Settimana n/d" : "Settimana " + wk;
        return `
          <div class="hist-week">
            <div class="hist-week-lab">${label}</div>
            ${items}
          </div>`;
      })
      .join("");

    blocks.push(`
      <div class="hist-group">
        <div class="hist-group-head">${escapeHtml(prog.name)}</div>
        ${weekBlocks}
      </div>`);
  });

  // 3. schede libere in fondo
  if (libere.length) {
    const items = libere.map((s) => _historyItemHtml(s, prCountBySession)).join("");
    blocks.push(`
      <div class="hist-group">
        <div class="hist-group-head">Schede libere</div>
        ${items}
      </div>`);
  }

  return blocks.join("");
}

/** Riga singola dello storico (data + nome + durata + PR). */
function _historyItemHtml(s, prCountBySession) {
  const d = s.startedAt ? new Date(s.startedAt) : new Date();
  const day = d.getDate();
  const mon = d.toLocaleDateString("it-IT", { month: "short" }).replace(".", "");
  const dur = s.durationSec ? Math.round(s.durationSec / 60) + " min" : "—";
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
  _renderSessionDetail(res.session, res.sets || [], res.prs || []);
}

function _renderSessionDetail(s, sets, prs) {
  prs = prs || [];
  const root = document.getElementById("screen-session-detail");
  const dateStr = s.startedAt
    ? new Date(s.startedAt).toLocaleDateString("it-IT", {
        weekday: "long",
        day: "numeric",
        month: "long",
      })
    : "—";
  const dur = s.durationSec ? Math.round(s.durationSec / 60) + " min" : "—";

  // PR per esercizio (dai dati prs reali della sessione)
  const prByEx = {};
  prs.forEach((p) => {
    if (!prByEx[p.exerciseRef]) prByEx[p.exerciseRef] = [];
    prByEx[p.exerciseRef].push(p.prType);
  });
  const prCount = prs.length;

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
  sets.forEach((st) => {
    totalVolume += parseFloat(st.volume) || 0;
  });

  const PR_LABEL = { "1rm": "1RM", volume: "Volume", heaviest: "Massimale" };

  const exHtml = order
    .map((k) => {
      const ex = byEx[k];
      const exPRs = prByEx[k] || [];
      const prBadge = exPRs.length
        ? `<span class="sd-ex-pr">★ ${exPRs
            .map((t) => PR_LABEL[t] || t)
            .join(" · ")}</span>`
        : "";
      // Esercizio interamente SALTATO: tutte le sue righe sono skipped.
      const allSkipped =
        ex.sets.length > 0 && ex.sets.every((st) => st.setType === "skipped");
      if (allSkipped) {
        return `
          <div class="sd-ex sd-ex-skipped">
            <div class="sd-ex-head">
              <div class="sd-ex-name">${escapeHtml(ex.name)}</div>
              <span class="sd-ex-skip-tag">SALTATO</span>
            </div>
          </div>`;
      }
      const rowsHtml = ex.sets
        .map((st, i) => {
          if (st.setType === "skipped") {
            return `<div class="sd-row sd-row-skip"><span class="sd-row-n">${i + 1}</span><span class="sd-row-val">saltata</span></div>`;
          }
          // esercizio a durata (cardio): minuti + parametri invece di kg × reps
          if (st.setType === "duration") {
            const min = st.durataMin !== "" && st.durataMin != null ? st.durataMin : "—";
            const par = st.parametri ? " · " + escapeHtml(st.parametri) : "";
            return `
              <div class="sd-row">
                <span class="sd-row-n">${i + 1}</span>
                <span class="sd-row-val"><strong>${min}</strong> min${par}</span>
              </div>`;
          }
          const w = st.weight !== "" ? st.weight : "—";
          const r = st.reps !== "" ? st.reps : "—";
          const typeTag =
            st.setType && st.setType !== "work" && st.setType !== "normal"
              ? `<span class="sd-row-type sd-row-type-${st.setType}">${st.setType}</span>`
              : "";
          const noteHtml = st.note
            ? `<div class="sd-row-note">✎ ${escapeHtml(st.note)}</div>`
            : "";
          return `
            <div class="sd-row">
              <span class="sd-row-n">${i + 1}</span>
              <span class="sd-row-val"><strong>${w}</strong> kg × <strong>${r}</strong></span>
              ${typeTag}
            </div>${noteHtml}`;
        })
        .join("");
      return `
        <div class="sd-ex">
          <div class="sd-ex-head">
            <div class="sd-ex-name">${escapeHtml(ex.name)}</div>
            ${prBadge}
          </div>
          <div class="sd-ex-rows">${rowsHtml}</div>
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
