/* ============================================
   LIFT — Libreria esercizi
   ============================================ */

let _libState = {
  query: "",
  muscle: "", // filtro muscolo attivo
  customExercises: [], // dal backend (caricati al primo apri)
  catalog: [], // catalogo "exercises" curato in italiano
};

// Catalogo esercizi condiviso (popolato al boot); usato da libreria + picker editor.
// var (non let) per tollerare l'ordine di caricamento degli script.
var EXERCISES_CATALOG = [];

const COMMON_MUSCLES = [
  "Petto",
  "Schiena",
  "Spalle",
  "Bicipiti",
  "Tricipiti",
  "Quadricipiti",
  "Femorali",
  "Glutei",
  "Polpacci",
  "Addome",
  "Avambracci",
];

async function openLibrary() {
  showScreen("library");
  const root = document.getElementById("screen-library");
  root.innerHTML = `
    <div class="history-head">
      <button class="icon-btn" id="lib-back" aria-label="Indietro">${iconSvg(
        "arrow-left"
      )}</button>
      <div class="history-title">Esercizi</div>
    </div>
    <input class="lib-search" id="lib-search" placeholder="Cerca esercizio…" />
    <select class="trend-picker" id="lib-muscle-sel">
      <option value="">Tutti i muscoli</option>
      ${COMMON_MUSCLES.map(
        (m) => `<option value="${m}">${m}</option>`
      ).join("")}
    </select>
    <div class="lib-counter" id="lib-counter"></div>
    <div class="lib-list" id="lib-list"></div>
    <button class="add-block-btn lib-add" id="lib-add">+ Aggiungi esercizio custom</button>
  `;
  document.getElementById("lib-back").onclick = openProfile;
  document.getElementById("lib-search").oninput = (e) => {
    _libState.query = e.target.value;
    _renderLibList();
  };
  document.getElementById("lib-muscle-sel").onchange = (e) => {
    _libState.muscle = e.target.value;
    _renderLibList();
  };
  document.getElementById("lib-add").onclick = _openCustomForm;

  // carico custom in background (silent, no spinner)
  try {
    const boot = await apiGet("lift_get_data", {}, { silent: true });
    _libState.customExercises = (boot && boot.customExercises) || [];
    _libState.catalog = (boot && boot.exercises) || [];
    // catalogo condiviso anche con il picker dell'editor
    EXERCISES_CATALOG = _libState.catalog;
  } catch (e) {
    _libState.customExercises = [];
  }
  _renderLibList();
}

function _allExercises() {
  // catalogo curato in italiano (foglio "exercises", ref "ex:<id>")
  const catExs = (_libState.catalog || []).map((e) => ({
    ref: "ex:" + e.id,
    name: e.nome,
    muscle: e.gruppo || "",
    equipment: e.attrezzo || "",
    category: "",
    isCustom: false,
  }));
  const customs = (_libState.customExercises || []).map((c) => ({
    ref: "custom:" + c.id,
    name: c.name,
    muscle: (c.primaryMuscles || "").split(",")[0] || "",
    equipment: c.equipment || "",
    category: c.category || "",
    isCustom: true,
  }));
  // i custom in cima
  return customs.concat(catExs);
}

function _renderLibList() {
  const q = _libState.query.trim().toLowerCase();
  const m = _libState.muscle;
  const all = _allExercises();
  const filtered = all.filter((e) => {
    if (m && e.muscle !== m) return false;
    if (q && !e.name.toLowerCase().includes(q)) return false;
    return true;
  });
  const cap = 80;
  const visible = filtered.slice(0, cap);

  document.getElementById("lib-counter").textContent =
    filtered.length > cap
      ? `Mostrati ${cap} di ${filtered.length} (filtra per restringere)`
      : `${filtered.length} esercizi`;

  const list = document.getElementById("lib-list");
  if (filtered.length === 0) {
    list.innerHTML = `<div class="empty-state">Nessun esercizio trovato</div>`;
    return;
  }
  list.innerHTML = visible
    .map(
      (e) => `
      <button class="lib-item" data-ref="${escapeAttr(e.ref)}">
        <span class="lib-name">${escapeHtml(e.name)}</span>
        ${e.isCustom ? '<span class="lib-tag-custom">custom</span>' : ""}
        <span class="lib-meta">${escapeHtml(e.muscle || "")}</span>
      </button>`
    )
    .join("");
  list.querySelectorAll(".lib-item").forEach((b) => {
    b.onclick = () => _openExerciseDetail(b.dataset.ref);
  });
}

/* ---------- DETTAGLIO ---------- */

function _openExerciseDetail(ref) {
  showScreen("exercise-detail");
  const root = document.getElementById("screen-exercise-detail");
  const ex = _findExerciseByRef(ref);
  if (!ex) {
    root.innerHTML = `<div class="empty-state">Esercizio non trovato</div>`;
    return;
  }
  // dati dettaglio: per gli esercizi pubblici prendo istruzioni dal JSON RAW
  // (oggi bundle slim non ha instructions, quindi le mostriamo solo per i custom)
  const instructions = ex.instructions || [];
  const tagsHtml = [
    ex.muscle && `<span class="exd-tag">${escapeHtml(ex.muscle)}</span>`,
    ex.equipment && `<span class="exd-tag">${escapeHtml(ex.equipment)}</span>`,
    ex.category && `<span class="exd-tag">${escapeHtml(ex.category)}</span>`,
    ex.isCustom ? `<span class="exd-tag">custom</span>` : "",
  ]
    .filter(Boolean)
    .join("");

  root.innerHTML = `
    <div class="history-head">
      <button class="icon-btn" id="exd-back" aria-label="Indietro">${iconSvg(
        "arrow-left"
      )}</button>
      <div class="history-title">Esercizio</div>
    </div>

    <div class="exd-head">
      <div class="exd-name">${escapeHtml(ex.name)}</div>
      <div class="exd-tags">${tagsHtml}</div>
    </div>

    ${
      instructions.length
        ? `<div class="exd-section">
            <h3>Istruzioni</h3>
            <ol>${instructions
              .map((s) => `<li>${escapeHtml(s)}</li>`)
              .join("")}</ol>
          </div>`
        : `<div class="exd-section">
            <h3>Istruzioni</h3>
            <p>Non disponibili per questo esercizio.</p>
          </div>`
    }
  `;
  document.getElementById("exd-back").onclick = openLibrary;
}

function _findExerciseByRef(ref) {
  const [src, id] = String(ref).split(":");
  if (src === "custom") {
    const c = _libState.customExercises.find((x) => x.id === id);
    if (!c) return null;
    return {
      ref: ref,
      name: c.name,
      muscle: (c.primaryMuscles || "").split(",")[0] || "",
      equipment: c.equipment || "",
      category: c.category || "",
      isCustom: true,
      instructions: (c.instructions || "")
        .split(" | ")
        .map((s) => s.trim())
        .filter(Boolean),
    };
  }
  // catalogo curato (ref "ex:<id>")
  const e = (_libState.catalog || EXERCISES_CATALOG || []).find(
    (x) => x.id === id
  );
  if (!e) return null;
  return {
    ref: ref,
    name: e.nome,
    muscle: e.gruppo || "",
    equipment: e.attrezzo || "",
    category: "",
    isCustom: false,
    instructions: e.noteDefault ? [e.noteDefault] : [],
  };
}

/* ---------- NUOVO CUSTOM ---------- */

async function _openCustomForm() {
  const result = await new Promise((resolve) => {
    let d = document.getElementById("cust-dlg");
    if (!d) {
      d = document.createElement("div");
      d.id = "cust-dlg";
      d.className = "dlg";
      document.body.appendChild(d);
    }
    d.innerHTML = `
      <div class="dlg-box dlg-wide">
        <div class="dlg-title">Nuovo esercizio</div>
        <div class="cust-form">
          <div>
            <label>Nome</label>
            <input id="cf-name" type="text" placeholder="Es. Pulley con corda" />
          </div>
          <div>
            <label>Muscolo principale</label>
            <select id="cf-muscle">
              <option value="">—</option>
              ${COMMON_MUSCLES.map(
                (m) => `<option value="${m}">${m}</option>`
              ).join("")}
            </select>
          </div>
          <div>
            <label>Attrezzo</label>
            <input id="cf-eq" type="text" placeholder="Es. cable, dumbbell, body only" />
          </div>
          <div>
            <label>Note tecnica (opzionale)</label>
            <input id="cf-notes" type="text" placeholder="Es. stretch lungo, scapole basse" />
          </div>
        </div>
        <div class="dlg-actions dlg-actions-top">
          <button class="dlg-btn dlg-btn-cancel" id="cf-cancel">Annulla</button>
          <button class="dlg-btn dlg-btn-ok" id="cf-save">Salva</button>
        </div>
      </div>`;
    d.classList.add("show");
    setTimeout(() => document.getElementById("cf-name").focus(), 60);
    d.querySelector("#cf-cancel").onclick = () => {
      d.classList.remove("show");
      resolve(null);
    };
    d.querySelector("#cf-save").onclick = () => {
      const name = document.getElementById("cf-name").value.trim();
      if (!name) {
        liftAlert("Dai un nome all'esercizio");
        return;
      }
      d.classList.remove("show");
      resolve({
        name: name,
        primaryMuscles: [document.getElementById("cf-muscle").value || ""].filter(
          Boolean
        ),
        equipment: document.getElementById("cf-eq").value.trim(),
        instructions: [document.getElementById("cf-notes").value.trim()].filter(
          Boolean
        ),
      });
    };
  });

  if (!result) return;
  try {
    const res = await apiPost("lift_save_custom_exercise", result);
    if (res && res.status === "OK") {
      // invalido cache bootstrap (lo fa gia api.js) e ricarico
      apiInvalidate("lift_get_data");
      const boot = await apiGet("lift_get_data", {}, { silent: true });
      _libState.customExercises = (boot && boot.customExercises) || [];
      _renderLibList();
    } else {
      liftAlert(
        res && res.message ? res.message : "Salvataggio fallito",
        "Errore"
      );
    }
  } catch (e) {
    liftAlert("Errore: " + (e.message || e));
  }
}
