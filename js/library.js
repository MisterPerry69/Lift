/* ============================================
   LIFT — Libreria esercizi
   ============================================ */

let _libState = {
  query: "",
  muscle: "", // filtro muscolo attivo
  customExercises: [], // dal backend (caricati al primo apri)
};

const COMMON_MUSCLES = [
  "chest",
  "back",
  "shoulders",
  "biceps",
  "triceps",
  "quadriceps",
  "hamstrings",
  "glutes",
  "calves",
  "abdominals",
  "forearms",
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
    <div class="lib-filters" id="lib-filters"></div>
    <div class="lib-counter" id="lib-counter"></div>
    <div class="lib-list" id="lib-list"></div>
    <button class="add-block-btn lib-add" id="lib-add">+ Aggiungi esercizio custom</button>
  `;
  document.getElementById("lib-back").onclick = openProfile;
  document.getElementById("lib-search").oninput = (e) => {
    _libState.query = e.target.value;
    _renderLibList();
  };
  document.getElementById("lib-add").onclick = _openCustomForm;
  _renderFilters();

  // carico custom in background (silent, no spinner)
  try {
    const boot = await apiGet("lift_get_data", {}, { silent: true });
    _libState.customExercises = (boot && boot.customExercises) || [];
  } catch (e) {
    _libState.customExercises = [];
  }
  _renderLibList();
}

function _renderFilters() {
  const wrap = document.getElementById("lib-filters");
  const chips = ["", ...COMMON_MUSCLES];
  wrap.innerHTML = chips
    .map(
      (m) =>
        `<button class="lib-chip${_libState.muscle === m ? " active" : ""}" data-m="${m}">${
          m || "tutti"
        }</button>`
    )
    .join("");
  wrap.querySelectorAll(".lib-chip").forEach((c) => {
    c.onclick = () => {
      _libState.muscle = c.dataset.m;
      _renderFilters();
      _renderLibList();
    };
  });
}

function _allExercises() {
  // unione: public + custom con prefisso unificato
  const pubExs = (typeof EXERCISE_DB !== "undefined" ? EXERCISE_DB : []).map(
    (e) => ({
      ref: "public:" + e.id,
      name: e.name,
      muscle: e.m || "",
      equipment: e.eq || "",
      category: e.cat || "",
      isCustom: false,
    })
  );
  const customs = (_libState.customExercises || []).map((c) => ({
    ref: "custom:" + c.id,
    name: c.name,
    muscle: (c.primaryMuscles || "").split(",")[0] || "",
    equipment: c.equipment || "",
    category: c.category || "",
    isCustom: true,
  }));
  // i custom in cima
  return customs.concat(pubExs);
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
            <p style="color:var(--text-dim)">Non disponibili per questo esercizio.</p>
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
  const e = (typeof EXERCISE_DB !== "undefined" ? EXERCISE_DB : []).find(
    (x) => x.id === id
  );
  if (!e) return null;
  return {
    ref: ref,
    name: e.name,
    muscle: e.m,
    equipment: e.eq,
    category: e.cat,
    isCustom: false,
    instructions: [],
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
      <div class="dlg-box" style="max-width:380px">
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
        <div class="dlg-actions" style="margin-top:var(--sp-4)">
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
