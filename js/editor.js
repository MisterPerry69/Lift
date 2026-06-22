/* ============================================
   LIFT — Editor schede (v1: blocchi single)
   Superset/varianti avanzate: iterazione successiva.
   ============================================ */

let editorState = null;

function openEditor(template) {
  editorState = template
    ? JSON.parse(JSON.stringify(template))
    : { id: null, name: "", notes: "", structure: { blocks: [] } };
  if (!editorState.structure) editorState.structure = { blocks: [] };
  renderEditor();
  showScreen("editor");
}

function renderEditor() {
  const s = editorState;
  // Il pannello import si mostra solo su scheda nuova e ancora vuota.
  const showImport = !s.id && s.structure.blocks.length === 0;
  const root = document.getElementById("screen-editor");
  root.innerHTML = `
    <div class="editor-head">
      <button class="icon-btn" id="ed-back" aria-label="Indietro">${iconSvg(
        "arrow-left"
      )}</button>
      <input class="editor-title-input" id="ed-name" placeholder="Nome scheda" value="${escapeAttr(
        s.name
      )}" />
    </div>
    ${showImport ? _importPanelHtml() : ""}
    <div id="ed-blocks"></div>
    <button class="add-block-btn" id="ed-add">${iconSvg(
      "play"
    )} Aggiungi esercizio</button>
    <button class="save-template-btn" id="ed-save">Salva scheda</button>
  `;
  renderBlocks();

  document.getElementById("ed-back").onclick = () => {
    showScreen("home");
    renderHome();
  };
  document.getElementById("ed-name").oninput = (e) =>
    (s.name = e.target.value);
  document.getElementById("ed-add").onclick = () => openExPicker();
  document.getElementById("ed-save").onclick = saveEditorTemplate;
  if (showImport) _wireImportPanel();
}

/* ---------- Importer JSON ---------- */

function _importPanelHtml() {
  return `
    <div class="import-panel" id="ed-import">
      <div class="import-head">
        <span class="import-title">${iconSvg("play")} Importa da JSON</span>
        <button class="import-toggle" id="imp-toggle" type="button">Apri</button>
      </div>
      <div class="import-body" id="imp-body" hidden>
        <p class="import-hint">Incolla il JSON di un <b>programma</b> (più workout, tutte le settimane). Gli esercizi non ancora nel catalogo verranno creati in automatico.</p>
        <textarea class="import-textarea" id="imp-text" placeholder='{ "nome": "Brodesco 6 settimane", "dataInizio": "2026-06-22", "settimane": 6, "workout": [ ... ] }' spellcheck="false"></textarea>
        <div class="import-error" id="imp-error" hidden></div>
        <button class="import-btn" id="imp-do" type="button">Importa programma</button>
      </div>
    </div>`;
}

function _wireImportPanel() {
  const toggle = document.getElementById("imp-toggle");
  const body = document.getElementById("imp-body");
  toggle.onclick = () => {
    const open = body.hidden;
    body.hidden = !open;
    toggle.textContent = open ? "Chiudi" : "Apri";
  };
  document.getElementById("imp-do").onclick = _doImport;
}

async function _doImport() {
  const txt = document.getElementById("imp-text").value;
  const errBox = document.getElementById("imp-error");
  const btn = document.getElementById("imp-do");
  errBox.hidden = true;
  errBox.textContent = "";

  if (!txt.trim()) {
    errBox.textContent = "Incolla prima il JSON del programma.";
    errBox.hidden = false;
    return;
  }

  let prog;
  try {
    prog = parseImportProgrammaJson(txt);
  } catch (e) {
    errBox.textContent = e.message || "JSON non valido.";
    errBox.hidden = false;
    return;
  }

  // Import programma: crea esercizi mancanti + salva il programma lato backend.
  btn.textContent = "Importazione…";
  btn.disabled = true;
  try {
    await apiPost("lift_import_programma", {
      nome: prog.name,
      dataInizio: prog.dataInizio,
      weeks: prog.weeks,
      workouts: prog.workouts,
    });
    showScreen("home");
    await renderHome();
  } catch (e) {
    errBox.textContent = "Errore import: " + (e.message || e);
    errBox.hidden = false;
    btn.textContent = "Importa programma";
    btn.disabled = false;
  }
}

function renderBlocks() {
  const wrap = document.getElementById("ed-blocks");
  const blocks = editorState.structure.blocks;
  if (blocks.length === 0) {
    wrap.innerHTML = `<p class="editor-empty">Nessun esercizio. Aggiungine uno.</p>`;
    return;
  }
  const periodized = editorState.structure.weeks && blocks.some((b) => b.perWeek);
  wrap.innerHTML = blocks
    .map((b, i) =>
      b.perWeek
        ? _blockPeriodizedHtml(b, i)
        : b.mode === "custom"
        ? _blockCustomHtml(b, i)
        : _blockSimpleHtml(b, i)
    )
    .join("");
  if (periodized) {
    _attachPeriodizedHandlers(wrap);
  } else {
    _attachBlockHandlers(wrap);
  }
}

/* --- Vista blocco PERIODIZZATO (importato): riepilogo per-settimana, sola lettura per ora --- */
function _fmtSet(s) {
  const t =
    s.type && s.type !== "work"
      ? `<span class="ps-type ps-type-${s.type}">${s.type}</span>`
      : "";
  return `<span class="ps-set">${escapeHtml(String(s.reps))}${t}</span>`;
}

function _blockPeriodizedHtml(b, i) {
  const cur = (editorState.structure.currentWeek || 1) - 1;
  const ss = b.supersetGroup
    ? `<span class="ps-ss">Superset ${escapeHtml(b.supersetGroup)}</span>`
    : "";
  const weeksHtml = (b.perWeek || [])
    .map((wk, wi) => {
      const sets = (wk.sets || []).map(_fmtSet).join(" ");
      return `<div class="ps-week ${wi === cur ? "ps-week-cur" : ""}">
        <span class="ps-week-lab">W${wi + 1}</span>
        <span class="ps-week-sets">${sets}</span>
      </div>`;
    })
    .join("");
  return `
    <div class="block-card block-periodized">
      <div class="bc-top">
        <div>
          <div class="bc-exname">${escapeHtml(b.exerciseName)} ${ss}</div>
          <div class="bc-muscle">${escapeHtml(b.muscle || "")}${
    b.rest ? " · rest " + escapeHtml(b.rest) : ""
  }</div>
          ${b.note ? `<div class="ps-note">${escapeHtml(b.note)}</div>` : ""}
        </div>
        <button class="bc-del" data-del="${i}" aria-label="Rimuovi">×</button>
      </div>
      <div class="ps-weeks">${weeksHtml}</div>
    </div>`;
}

function _attachPeriodizedHandlers(wrap) {
  wrap.querySelectorAll("[data-del]").forEach((btn) => {
    btn.onclick = () => {
      editorState.structure.blocks.splice(parseInt(btn.dataset.del, 10), 1);
      renderEditor();
    };
  });
}

function _blockHeader(b, i) {
  return `
    <div class="bc-top">
      <div>
        <div class="bc-exname">${escapeHtml(b.exerciseName)}</div>
        <div class="bc-muscle">${escapeHtml(b.muscle || "")}</div>
      </div>
      <button class="bc-del" data-del="${i}" aria-label="Rimuovi">×</button>
    </div>`;
}

/* --- Vista SIMPLE: NxR + REST + bottone CUSTOM --- */
function _blockSimpleHtml(b, i) {
  const nSets = (b.sets || []).length || 3;
  const reps = (b.sets && b.sets[0] && b.sets[0].targetReps) || 8;
  const rest = b.restAfterSetSec ? _fmtRest(b.restAfterSetSec) : "";
  return `
    <div class="block-card">
      ${_blockHeader(b, i)}
      <div class="simple-row">
        <div class="simple-field">
          <input type="number" inputmode="numeric" min="1" max="20"
                 value="${nSets}" data-simple-n="${i}" />
          <span class="simple-lab">SERIE</span>
        </div>
        <div class="simple-x">×</div>
        <div class="simple-field">
          <input type="number" inputmode="numeric" min="1" max="50"
                 value="${reps}" data-simple-r="${i}" />
          <span class="simple-lab">REPS</span>
        </div>
      </div>
      <div class="simple-row simple-row-rest">
        <div class="simple-field simple-field-rest">
          <input type="text" inputmode="numeric" placeholder="—"
                 value="${rest}" data-simple-rest="${i}" />
          <span class="simple-lab">REST</span>
        </div>
      </div>
      <button class="custom-btn" data-tocustom="${i}">CUSTOM</button>
    </div>`;
}

/* --- Vista CUSTOM: serie-per-serie + tipo set + rest --- */
function _blockCustomHtml(b, i) {
  const setsHtml = (b.sets || [])
    .map(
      (set, si) => `
      <div class="set-config">
        <span>S${si + 1}</span>
        <input type="number" inputmode="numeric" min="1" max="50"
          value="${set.targetReps}" data-b="${i}" data-s="${si}" class="set-reps" />
        <span>reps</span>
      </div>`
    )
    .join("");
  return `
    <div class="block-card">
      ${_blockHeader(b, i)}
      <div class="sets-row">
        ${setsHtml}
        <button class="mini-select" data-addset="${i}">+ serie</button>
        <select class="mini-select set-type" data-type="${i}">
          <option value="normal"${
            b.setType === "normal" ? " selected" : ""
          }>Normale</option>
          <option value="drop"${
            b.setType === "drop" ? " selected" : ""
          }>Drop set</option>
          <option value="rest_pause"${
            b.setType === "rest_pause" ? " selected" : ""
          }>Rest-pause</option>
        </select>
        <div class="set-config">
          <span>Rest</span>
          <input type="text" inputmode="numeric" placeholder="—"
            value="${b.restAfterSetSec ? _fmtRest(b.restAfterSetSec) : ""}"
            data-rest="${i}" class="set-rest" />
        </div>
      </div>
      <button class="custom-btn" data-tosimple="${i}">← TORNA A SEMPLICE</button>
    </div>`;
}

function _attachBlockHandlers(wrap) {
  // SIMPLE
  wrap.querySelectorAll("[data-simple-n]").forEach((inp) => {
    inp.onchange = (e) => {
      const bi = +e.target.dataset.simpleN;
      const n = Math.max(1, parseInt(e.target.value, 10) || 1);
      const b = editorState.structure.blocks[bi];
      const reps = (b.sets[0] && b.sets[0].targetReps) || 8;
      b.sets = Array.from({ length: n }, () => ({ targetReps: reps }));
    };
  });
  wrap.querySelectorAll("[data-simple-r]").forEach((inp) => {
    inp.onchange = (e) => {
      const bi = +e.target.dataset.simpleR;
      const reps = Math.max(1, parseInt(e.target.value, 10) || 1);
      editorState.structure.blocks[bi].sets.forEach(
        (s) => (s.targetReps = reps)
      );
    };
  });
  wrap.querySelectorAll("[data-simple-rest]").forEach((inp) => {
    inp.onchange = (e) => {
      const bi = +e.target.dataset.simpleRest;
      const sec = _parseRest(e.target.value);
      if (sec > 0) editorState.structure.blocks[bi].restAfterSetSec = sec;
      else delete editorState.structure.blocks[bi].restAfterSetSec;
      e.target.value = sec > 0 ? _fmtRest(sec) : "";
    };
  });
  wrap.querySelectorAll("[data-tocustom]").forEach((btn) => {
    btn.onclick = () => {
      editorState.structure.blocks[+btn.dataset.tocustom].mode = "custom";
      renderBlocks();
    };
  });
  wrap.querySelectorAll("[data-tosimple]").forEach((btn) => {
    btn.onclick = () => {
      const bi = +btn.dataset.tosimple;
      editorState.structure.blocks[bi].mode = "simple";
      renderBlocks();
    };
  });

  // CUSTOM
  wrap.querySelectorAll(".set-reps").forEach((inp) => {
    inp.onchange = (e) => {
      const bi = +e.target.dataset.b,
        si = +e.target.dataset.s;
      editorState.structure.blocks[bi].sets[si].targetReps =
        parseInt(e.target.value, 10) || 1;
    };
  });
  wrap.querySelectorAll("[data-addset]").forEach((btn) => {
    btn.onclick = () => {
      const bi = +btn.dataset.addset;
      editorState.structure.blocks[bi].sets.push({ targetReps: 8 });
      renderBlocks();
    };
  });
  wrap.querySelectorAll(".set-type").forEach((sel) => {
    sel.onchange = (e) => {
      editorState.structure.blocks[+e.target.dataset.type].setType =
        e.target.value;
    };
  });
  wrap.querySelectorAll(".set-rest").forEach((inp) => {
    inp.onchange = (e) => {
      const bi = +e.target.dataset.rest;
      const sec = _parseRest(e.target.value);
      if (sec > 0) editorState.structure.blocks[bi].restAfterSetSec = sec;
      else delete editorState.structure.blocks[bi].restAfterSetSec;
      e.target.value = sec > 0 ? _fmtRest(sec) : "";
    };
  });

  // DELETE
  wrap.querySelectorAll("[data-del]").forEach((btn) => {
    btn.onclick = () => {
      editorState.structure.blocks.splice(+btn.dataset.del, 1);
      renderBlocks();
    };
  });
}

/** Accetta "90", "1:30", "1m30", "2m" -> secondi. 0 = nessun rest. */
function _parseRest(v) {
  if (!v) return 0;
  v = String(v).trim().toLowerCase();
  let m = v.match(/^(\d+):(\d+)$/);
  if (m) return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
  m = v.match(/^(\d+)m(\d+)?$/);
  if (m) return parseInt(m[1], 10) * 60 + parseInt(m[2] || "0", 10);
  const n = parseInt(v, 10);
  return isNaN(n) ? 0 : n;
}
function _fmtRest(sec) {
  if (!sec) return "";
  return Math.floor(sec / 60) + ":" + String(sec % 60).padStart(2, "0");
}

/* ---------- Picker esercizi ---------- */

let _pickerMuscle = "";

function openExPicker() {
  let picker = document.getElementById("ex-picker");
  const PICKER_MUSCLES = [
    "chest","back","shoulders","biceps","triceps",
    "quadriceps","hamstrings","glutes","calves","abdominals","forearms",
  ];
  if (!picker) {
    picker = document.createElement("div");
    picker.id = "ex-picker";
    picker.className = "ex-picker";
    picker.innerHTML = `
      <div class="ex-picker-head">
        <input class="ex-search" id="ex-search" placeholder="Cerca esercizio…" />
        <button class="icon-btn" id="ex-close" aria-label="Chiudi">×</button>
      </div>
      <select class="trend-picker" id="ex-muscle-sel">
        <option value="">Tutti i muscoli</option>
        ${PICKER_MUSCLES.map(
          (m) => `<option value="${m}">${m}</option>`
        ).join("")}
      </select>
      <div class="ex-results" id="ex-results"></div>`;
    document.body.appendChild(picker);
    document
      .getElementById("ex-search")
      .addEventListener("input", () => _filterPickerExercises());
    document
      .getElementById("ex-muscle-sel")
      .addEventListener("change", (e) => {
        _pickerMuscle = e.target.value;
        _filterPickerExercises();
      });
    document.getElementById("ex-close").onclick = () =>
      picker.classList.remove("open");
  }
  picker.classList.add("open");
  document.getElementById("ex-search").value = "";
  document.getElementById("ex-muscle-sel").value = _pickerMuscle;
  _filterPickerExercises();
}

function _filterPickerExercises() {
  const q = (document.getElementById("ex-search").value || "")
    .trim()
    .toLowerCase();
  const m = _pickerMuscle;
  const catalog = typeof EXERCISES_CATALOG !== "undefined" ? EXERCISES_CATALOG : [];
  const filtered = catalog
    .filter((e) => {
      if (m && e.gruppo !== m) return false;
      if (q && !String(e.nome).toLowerCase().includes(q)) return false;
      return true;
    })
    .slice(0, 80);
  const res = document.getElementById("ex-results");
  res.innerHTML = filtered.length
    ? filtered
        .map(
          (e) => `
      <div class="ex-item" data-ex="${escapeAttr(e.id)}">
        <div class="ei-name">${escapeHtml(e.nome)}</div>
        <div class="ei-meta">${escapeHtml(e.gruppo || "")} · ${escapeHtml(e.attrezzo || "")}</div>
      </div>`
        )
        .join("")
    : `<div class="empty-state">Nessun esercizio nel catalogo</div>`;
  res.querySelectorAll(".ex-item").forEach((it) => {
    it.onclick = () => {
      const ex = catalog.find((x) => x.id === it.dataset.ex);
      editorState.structure.blocks.push({
        type: "single",
        mode: "simple",
        exerciseRef: "ex:" + ex.id,
        exerciseName: ex.nome,
        muscle: ex.gruppo || "",
        setType: "normal",
        sets: [{ targetReps: 8 }, { targetReps: 8 }, { targetReps: 8 }],
        restAfterSetSec: 90,
      });
      document.getElementById("ex-picker").classList.remove("open");
      renderBlocks();
    };
  });
}

/* ---------- Salvataggio ---------- */

async function saveEditorTemplate() {
  const s = editorState;
  if (!s.name.trim()) {
    return liftAlert("Dai un nome alla scheda");
  }
  if (s.structure.blocks.length === 0) {
    return liftAlert("Aggiungi almeno un esercizio");
  }
  const btn = document.getElementById("ed-save");
  btn.textContent = "Salvataggio…";
  btn.disabled = true;
  try {
    const periodized =
      s.structure.weeks && (s.structure.blocks || []).some((b) => b.perWeek);
    if (periodized) {
      // Import scheda periodizzata: crea esercizi mancanti + salva template.
      await apiPost("lift_import_scheda", {
        id: s.id,
        name: s.name.trim(),
        notes: s.notes || "",
        structure: s.structure,
      });
    } else {
      await apiPost("lift_save_template", {
        id: s.id,
        name: s.name.trim(),
        notes: s.notes || "",
        structure: s.structure,
      });
    }
    showScreen("home");
    await renderHome();
  } catch (e) {
    liftAlert("Errore salvataggio: " + (e.message || e), "Errore");
    btn.textContent = "Salva scheda";
    btn.disabled = false;
  }
}

/* ---------- util escaping ---------- */

function escapeHtml(s) {
  return String(s).replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])
  );
}
function escapeAttr(s) {
  return escapeHtml(s).replace(/'/g, "&#39;");
}
