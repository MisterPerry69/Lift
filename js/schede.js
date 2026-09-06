/* ============================================
   LIFT — Schede allenamenti (lista + dettaglio + edit rapido)
   ============================================ */

async function openSchede() {
  showScreen("schede");
  const root = document.getElementById("screen-schede");
  root.innerHTML = `
    <div class="history-head">
      <button class="icon-btn" id="sch-back" aria-label="Indietro">${iconSvg(
        "arrow-left"
      )}</button>
      <div class="history-title">Schede</div>
      <button class="icon-btn" id="sch-new" aria-label="Nuova">+</button>
    </div>
    <div id="sch-list" class="schede-list"></div>
  `;
  document.getElementById("sch-back").onclick = openProfile;
  document.getElementById("sch-new").onclick = () => openEditor(null);

  const data = await apiGet("lift_get_data", {}, { silent: true });
  const templates = (data && data.templates) || [];
  const programs = (data && data.programs) || [];
  const list = document.getElementById("sch-list");

  let html = "";

  // Workout dei programmi attivi (rimando: tap = avvia il workout alla settimana corrente)
  programs
    .filter((p) => !p.completed)
    .forEach((p) => {
      html += `<div class="section-label label-micro sch-group-label">${escapeHtml(
        p.nome
      )} · Settimana ${p.currentWeek}/${p.weeks}</div>`;
      html += p.workouts
        .map(
          (w) => `
        <button class="sch-item" data-prog="${escapeAttr(p.id)}" data-wk="${escapeAttr(w.id)}">
          <div class="sch-info">
            <div class="sch-name">${escapeHtml(w.name)}</div>
            <div class="sch-meta">${w.exerciseCount} esercizi</div>
          </div>
          <span class="sch-arrow">${iconSvg("chevron-right")}</span>
        </button>`
        )
        .join("");
    });

  // Schede singole (non periodizzate), se presenti
  if (templates.length) {
    if (programs.length) {
      html += `<div class="section-label label-micro sch-group-label">Altre schede</div>`;
    }
    html += templates
      .map((t) => {
        const days = t.daysSince >= 999 ? "mai eseguita" : daysSinceLabel(t.daysSince);
        return `
        <button class="sch-item" data-id="${escapeAttr(t.id)}">
          <div class="sch-info">
            <div class="sch-name">${escapeHtml(t.name)}</div>
            <div class="sch-meta">${t.exerciseCount} esercizi · ${days}</div>
          </div>
          <span class="sch-arrow">${iconSvg("chevron-right")}</span>
          <img class="sch-illus" src="assets/illus-${escapeAttr(t.id)}.svg" alt=""
               aria-hidden="true" onerror="this.src='assets/illus-hero.svg'" />
        </button>`;
      })
      .join("");
  }

  if (!html) {
    list.innerHTML = `<div class="empty-state">Nessuna scheda. Tap + per crearne una.</div>`;
    return;
  }
  list.innerHTML = html;

  // workout di programma → apre il DETTAGLIO (consultazione), non avvia
  list.querySelectorAll(".sch-item[data-prog]").forEach((b) => {
    b.onclick = () => openProgramWorkoutDetail(b.dataset.prog, b.dataset.wk);
  });
  // schede singole → dettaglio
  list.querySelectorAll(".sch-item[data-id]").forEach((b) => {
    b.onclick = () => openSchedaDetail(b.dataset.id);
  });
}

/* ---------- DETTAGLIO SCHEDA ---------- */

let _schedaDetailState = null;

async function openSchedaDetail(templateId) {
  showScreen("scheda-detail");
  const root = document.getElementById("screen-scheda-detail");
  root.innerHTML = `<div class="empty-state">Carico…</div>`;
  let res;
  try {
    res = await apiPost("lift_get_template", { id: templateId });
  } catch (e) {
    root.innerHTML = `<div class="empty-state">Errore: ${escapeHtml(
      e.message || String(e)
    )}</div>`;
    return;
  }
  if (!res || res.status !== "OK") {
    root.innerHTML = `<div class="empty-state">Scheda non trovata</div>`;
    return;
  }
  _schedaDetailState = res;
  _renderSchedaDetail();
}

function _renderSchedaDetail() {
  const t = _schedaDetailState;
  const root = document.getElementById("screen-scheda-detail");
  const blocks = (t.structure && t.structure.blocks) || [];

  const blocksHtml = blocks
    .map((b, i) => {
      const nSets = (b.sets || []).length;
      let detail;
      if (b.mode === "custom") {
        const reps = (b.sets || []).map((s) => s.targetReps).join("+");
        detail = `Custom · ${nSets} serie (${reps})`;
      } else {
        const reps = (b.sets && b.sets[0] && b.sets[0].targetReps) || "?";
        detail = `${nSets} × ${reps} reps`;
      }
      if (b.setType && b.setType !== "normal") {
        detail += " · " + (b.setType === "drop" ? "drop" : "rest-pause");
      }
      if (b.restAfterSetSec) {
        detail += " · rest " + _fmtRest(b.restAfterSetSec);
      }
      return `
        <div class="sch-block">
          <div class="sch-block-main">
            <div class="sch-block-name">${escapeHtml(b.exerciseName || "?")}</div>
            <div class="sch-block-detail">${escapeHtml(detail)}</div>
          </div>
          <button class="sch-block-edit" data-bi="${i}" aria-label="Modifica">
            ${iconSvg("edit")}
          </button>
        </div>`;
    })
    .join("");

  root.innerHTML = `
    <div class="history-head">
      <button class="icon-btn" id="sd-back-list" aria-label="Indietro">${iconSvg(
        "arrow-left"
      )}</button>
      <div class="sch-detail-name">${escapeHtml(t.name)}</div>
      <button class="icon-btn" id="sd-edit-all" aria-label="Modifica scheda">${iconSvg(
        "edit"
      )}</button>
    </div>

    ${t.notes ? `<div class="sch-detail-notes">${escapeHtml(t.notes)}</div>` : ""}

    ${blocksHtml || '<div class="empty-state">Nessun esercizio in questa scheda</div>'}
  `;

  document.getElementById("sd-back-list").onclick = openSchede;
  document.getElementById("sd-edit-all").onclick = () => {
    openEditor({
      id: t.id,
      name: t.name,
      notes: t.notes || "",
      structure: t.structure,
    });
  };
  root.querySelectorAll("[data-bi]").forEach((btn) => {
    btn.onclick = () => _openQuickBlockEdit(+btn.dataset.bi);
  });
}

/* ---------- DETTAGLIO WORKOUT DI PROGRAMMA (periodizzato, sola lettura) ---------- */

async function openProgramWorkoutDetail(programId, workoutId) {
  showScreen("scheda-detail");
  const root = document.getElementById("screen-scheda-detail");
  root.innerHTML = `<div class="empty-state">Carico…</div>`;
  let res;
  try {
    res = await apiPost("lift_get_program", { id: programId });
  } catch (e) {
    root.innerHTML = `<div class="empty-state">Errore: ${escapeHtml(e.message || String(e))}</div>`;
    return;
  }
  const prog = res && res.program;
  const wk = prog && (prog.workouts || []).find((w) => w.id === workoutId);
  if (!wk) {
    root.innerHTML = `<div class="empty-state">Workout non trovato</div>`;
    return;
  }
  _renderProgramWorkoutDetail(prog, wk);
}

// formatta le serie di un blocco periodizzato per una settimana (riepilogo testuale)
function _fmtPeriodSets(sets) {
  // raggruppa reps uguali consecutive: es. [6,6,6,6] -> "4×6"; [7,6,6,6] -> "1×7 3×6"
  if (!sets || !sets.length) return "";
  const groups = [];
  sets.forEach((s) => {
    const key = String(s.reps) + (s.type && s.type !== "work" ? " " + s.type : "");
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.n++;
    else groups.push({ key, n: 1, reps: s.reps, type: s.type });
  });
  return groups
    .map((g) => {
      const t = g.type && g.type !== "work" ? ` ${g.type}` : "";
      return `${g.n}×${g.reps}${t}`;
    })
    .join("  ");
}

function _renderProgramWorkoutDetail(prog, wk) {
  const root = document.getElementById("screen-scheda-detail");
  const wi = (prog.currentWeek || 1) - 1;
  const blocks = (wk.structure && wk.structure.blocks) || [];

  const blocksHtml = blocks
    .map((b, bi) => {
      const ss = b.supersetGroup
        ? `<span class="sch-ss">SS ${escapeHtml(b.supersetGroup)}</span>`
        : "";
      let detail;
      if (b.kind === "durata") {
        const w = (b.perWeek && (b.perWeek[wi] || b.perWeek[0])) || {};
        detail = `${w.durataMin || "?"} min${w.parametri ? " · " + w.parametri : ""}`;
      } else {
        const w = (b.perWeek && (b.perWeek[wi] || b.perWeek[0])) || { sets: [] };
        detail = _fmtPeriodSets(w.sets);
        if (b.rest) detail += ` · rest ${b.rest}`;
      }
      return `
        <div class="sch-block">
          <div class="sch-block-main">
            <div class="sch-block-name">${escapeHtml(b.exerciseName || "?")} ${ss}</div>
            <div class="sch-block-detail">${escapeHtml(detail)}</div>
            ${b.note ? `<div class="sch-block-note">${escapeHtml(b.note)}</div>` : ""}
          </div>
          <button class="sch-block-edit" data-swap="${bi}" aria-label="Sostituisci esercizio">
            ${iconSvg("edit")}
          </button>
        </div>`;
    })
    .join("");

  root.innerHTML = `
    <div class="history-head">
      <button class="icon-btn" id="pwd-back" aria-label="Indietro">${iconSvg("arrow-left")}</button>
      <div class="sch-detail-name">${escapeHtml(wk.name)}</div>
    </div>
    <div class="sch-detail-notes">${escapeHtml(prog.nome)} · Settimana ${prog.currentWeek}/${prog.weeks}</div>
    ${blocksHtml || '<div class="empty-state">Nessun esercizio</div>'}
    <button class="save-template-btn" id="pwd-start">${iconSvg("play")} Inizia ${escapeHtml(wk.name)}</button>
    <button class="add-block-btn" id="pwd-edit">${iconSvg("edit")} Modifica valori scheda</button>
  `;

  document.getElementById("pwd-back").onclick = openSchede;
  document.getElementById("pwd-start").onclick = () => startProgramWorkout(prog.id, wk.id);
  document.getElementById("pwd-edit").onclick = () =>
    openProgramEditEditor(prog, () => openProgramWorkoutDetail(prog.id, wk.id));
  root.querySelectorAll("[data-swap]").forEach((btn) => {
    btn.onclick = () =>
      openSwapExercise(prog, wk, parseInt(btn.dataset.swap, 10));
  });
}

/* ---------- SOSTITUISCI ESERCIZIO (in un workout di programma) ---------- */

function openSwapExercise(prog, wk, blockIndex) {
  const blocks = (wk.structure && wk.structure.blocks) || [];
  const b = blocks[blockIndex];
  if (!b) return;
  const catalog = typeof EXERCISES_CATALOG !== "undefined" ? EXERCISES_CATALOG : [];

  let m = document.getElementById("swap-modal");
  if (!m) {
    m = document.createElement("div");
    m.id = "swap-modal";
    m.className = "ov-modal";
    document.body.appendChild(m);
    m.addEventListener("click", (e) => {
      if (e.target === m) m.classList.remove("open");
    });
  }

  const renderList = (q) => {
    const query = (q || "").trim().toLowerCase();
    const filtered = catalog.filter(
      (e) => !query || String(e.nome).toLowerCase().includes(query)
    );
    return filtered.length
      ? filtered
          .map(
            (e) => `
        <button class="addex-item" data-id="${escapeAttr(e.id)}">
          <span class="addex-name">${escapeHtml(e.nome)}</span>
          <span class="addex-meta">${escapeHtml(e.gruppo || "")}</span>
        </button>`
          )
          .join("")
      : `<div class="empty-state">Nessun esercizio. Creane uno nuovo qui sotto.</div>`;
  };

  m.innerHTML = `
    <div class="ov-sheet">
      <div class="ov-head">
        <div class="ov-title" style="font-size:1.2rem">Sostituisci<br><span class="ov-sub">${escapeHtml(
          b.exerciseName || ""
        )}</span></div>
        <button class="ov-close" id="swap-close">✕</button>
      </div>
      <input class="addex-search" id="swap-search" placeholder="Cerca esercizio…" />
      <div class="ov-list" id="swap-list">${renderList("")}</div>
      <button class="ov-add" id="swap-new">+ Nuovo esercizio nel catalogo</button>
    </div>`;

  const wire = () => {
    m.querySelectorAll(".addex-item").forEach((it) => {
      it.onclick = async () => {
        await _doSwap(prog, wk, blockIndex, it.dataset.id);
        m.classList.remove("open");
      };
    });
  };
  wire();
  m.querySelector("#swap-close").onclick = () => m.classList.remove("open");
  m.querySelector("#swap-search").oninput = (e) => {
    document.getElementById("swap-list").innerHTML = renderList(e.target.value);
    wire();
  };
  m.querySelector("#swap-new").onclick = async () => {
    const created = await openNewExerciseForm();
    if (created) {
      await _doSwap(prog, wk, blockIndex, created.id);
      m.classList.remove("open");
    }
  };
  m.classList.add("open");
}

async function _doSwap(prog, wk, blockIndex, exerciseId) {
  try {
    const res = await apiPost("lift_replace_exercise", {
      programId: prog.id,
      workoutId: wk.id,
      blockIndex: blockIndex,
      exerciseId: exerciseId,
    });
    if (!res || res.status !== "OK") {
      return liftAlert((res && res.message) || "Errore sostituzione", "Errore");
    }
    // ricarico il dettaglio con i dati aggiornati
    await openProgramWorkoutDetail(prog.id, wk.id);
  } catch (e) {
    liftAlert("Errore: " + (e.message || e), "Errore");
  }
}

/**
 * Form per creare un nuovo esercizio nel catalogo.
 * Ritorna l'esercizio creato ({id, nome, ...}) o null se annullato.
 */
function openNewExerciseForm() {
  return new Promise((resolve) => {
    let d = document.getElementById("newex-dlg");
    if (!d) {
      d = document.createElement("div");
      d.id = "newex-dlg";
      d.className = "dlg";
      document.body.appendChild(d);
    }
    const gruppi = typeof COMMON_MUSCLES !== "undefined" ? COMMON_MUSCLES : [];
    d.innerHTML = `
      <div class="dlg-box dlg-wide">
        <div class="dlg-title">Nuovo esercizio</div>
        <label class="newex-lab">Nome</label>
        <input class="addex-search newex-field" id="newex-nome" placeholder="Es. Pulley alto presa stretta" />
        <label class="newex-lab">Gruppo</label>
        <select class="trend-picker newex-field" id="newex-gruppo">
          ${gruppi.map((g) => `<option value="${escapeAttr(g)}">${escapeHtml(g)}</option>`).join("")}
        </select>
        <label class="newex-lab">Attrezzo</label>
        <select class="trend-picker newex-field" id="newex-attrezzo">
          ${["macchina", "cavi", "manubri", "bilanciere", "smith", "corpo libero", "altro"]
            .map((a) => `<option value="${a}">${a}</option>`)
            .join("")}
        </select>
        <div class="dlg-actions dlg-actions-top">
          <button class="dlg-btn dlg-btn-cancel" id="newex-cancel">Annulla</button>
          <button class="dlg-btn dlg-btn-ok" id="newex-ok">Crea</button>
        </div>
      </div>`;
    d.classList.add("show");

    const close = (val) => {
      d.classList.remove("show");
      resolve(val);
    };
    d.querySelector("#newex-cancel").onclick = () => close(null);
    d.querySelector("#newex-ok").onclick = async () => {
      const nome = d.querySelector("#newex-nome").value.trim();
      if (!nome) return liftAlert("Dai un nome all'esercizio");
      const gruppo = d.querySelector("#newex-gruppo").value;
      const attrezzo = d.querySelector("#newex-attrezzo").value;
      try {
        const res = await apiPost("lift_save_exercise", {
          nome: nome,
          gruppo: gruppo,
          attrezzo: attrezzo,
          // manubri = carico doppio (peso per-manubrio ×2 nel volume)
          caricoConteggio: attrezzo === "manubri" ? "doppio" : "singolo",
          unilaterale: "no",
        });
        if (!res || res.status !== "OK") {
          liftAlert((res && res.message) || "Errore creazione", "Errore");
          return close(null);
        }
        // aggiorno il catalogo in memoria
        const nuovo = {
          id: res.id,
          nome: nome,
          gruppo: gruppo,
          attrezzo: attrezzo,
          caricoConteggio: attrezzo === "manubri" ? "doppio" : "singolo",
          unilaterale: "no",
        };
        if (typeof EXERCISES_CATALOG !== "undefined") EXERCISES_CATALOG.push(nuovo);
        close(nuovo);
      } catch (e) {
        liftAlert("Errore: " + (e.message || e), "Errore");
        close(null);
      }
    };
  });
}

/* ---------- EDIT RAPIDO BLOCCO (al volo) ---------- */

async function _openQuickBlockEdit(bi) {
  const t = _schedaDetailState;
  const b = (t.structure.blocks || [])[bi];
  if (!b) return;

  const isCustom = b.mode === "custom";
  const nSets = (b.sets || []).length;
  const reps = (b.sets && b.sets[0] && b.sets[0].targetReps) || 8;
  const restStr = b.restAfterSetSec ? _fmtRest(b.restAfterSetSec) : "";
  const setType = b.setType || "normal";

  const result = await new Promise((resolve) => {
    let d = document.getElementById("qb-dlg");
    if (!d) {
      d = document.createElement("div");
      d.id = "qb-dlg";
      d.className = "dlg";
      document.body.appendChild(d);
    }
    d.innerHTML = `
      <div class="dlg-box dlg-wide">
        <div class="dlg-title">${escapeHtml(b.exerciseName)}</div>
        ${
          isCustom
            ? `<div class="dlg-msg">Questo blocco e in modalita CUSTOM. Per modificarlo serie-per-serie usa la modifica completa della scheda.</div>`
            : `
        <div class="cust-form">
          <div>
            <label>Serie</label>
            <input id="qb-n" type="number" inputmode="numeric" min="1" max="20" value="${nSets}" />
          </div>
          <div>
            <label>Reps</label>
            <input id="qb-r" type="number" inputmode="numeric" min="1" max="50" value="${reps}" />
          </div>
          <div>
            <label>Rest (mm:ss o secondi, vuoto = nessuno)</label>
            <input id="qb-rest" type="text" inputmode="numeric" value="${restStr}" placeholder="—" />
          </div>
          <div>
            <label>Tipo set</label>
            <select id="qb-type">
              <option value="normal"${setType === "normal" ? " selected" : ""}>Normale</option>
              <option value="drop"${setType === "drop" ? " selected" : ""}>Drop set</option>
              <option value="rest_pause"${setType === "rest_pause" ? " selected" : ""}>Rest-pause</option>
            </select>
          </div>
        </div>`
        }
        <div class="dlg-actions dlg-actions-top">
          <button class="dlg-btn dlg-btn-danger" id="qb-del">Rimuovi</button>
          <button class="dlg-btn dlg-btn-cancel" id="qb-cancel">Annulla</button>
          ${
            isCustom
              ? ""
              : '<button class="dlg-btn dlg-btn-ok" id="qb-save">Salva</button>'
          }
        </div>
      </div>`;
    d.classList.add("show");
    d.querySelector("#qb-cancel").onclick = () => {
      d.classList.remove("show");
      resolve(null);
    };
    d.querySelector("#qb-del").onclick = () => {
      d.classList.remove("show");
      resolve({ action: "delete" });
    };
    if (!isCustom) {
      d.querySelector("#qb-save").onclick = () => {
        d.classList.remove("show");
        resolve({
          action: "save",
          n: parseInt(document.getElementById("qb-n").value, 10) || 1,
          r: parseInt(document.getElementById("qb-r").value, 10) || 1,
          restRaw: document.getElementById("qb-rest").value,
          type: document.getElementById("qb-type").value,
        });
      };
    }
  });

  if (!result) return;

  const blocks = t.structure.blocks;
  if (result.action === "delete") {
    const ok = await liftConfirm(
      "Rimuovere " + b.exerciseName + " dalla scheda?",
      { okLabel: "Rimuovi", danger: true }
    );
    if (!ok) return;
    blocks.splice(bi, 1);
  } else if (result.action === "save") {
    const restSec = _parseRest(result.restRaw);
    b.sets = Array.from({ length: result.n }, () => ({ targetReps: result.r }));
    if (restSec > 0) b.restAfterSetSec = restSec;
    else delete b.restAfterSetSec;
    b.setType = result.type;
  }

  // salva sul backend, poi rinfresca
  try {
    await apiPost("lift_save_template", {
      id: t.id,
      name: t.name,
      notes: t.notes || "",
      structure: t.structure,
    });
    apiInvalidate("lift_get_data");
    _renderSchedaDetail();
  } catch (e) {
    liftAlert("Errore: " + (e.message || e));
  }
}
