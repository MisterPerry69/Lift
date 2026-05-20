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
}

function renderBlocks() {
  const wrap = document.getElementById("ed-blocks");
  const blocks = editorState.structure.blocks;
  if (blocks.length === 0) {
    wrap.innerHTML = `<p class="bc-muscle" style="padding:var(--sp-4) 0">Nessun esercizio. Aggiungine uno.</p>`;
    return;
  }
  wrap.innerHTML = blocks
    .map((b, i) => {
      const setsHtml = b.sets
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
        <div class="bc-top">
          <div>
            <div class="bc-exname">${escapeHtml(b.exerciseName)}</div>
            <div class="bc-muscle">${escapeHtml(b.muscle || "")}</div>
          </div>
          <button class="bc-del" data-del="${i}" aria-label="Rimuovi">${iconSvg(
        "arrow-left"
      )}</button>
        </div>
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
        </div>
      </div>`;
    })
    .join("");

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
  wrap.querySelectorAll("[data-del]").forEach((btn) => {
    btn.onclick = () => {
      editorState.structure.blocks.splice(+btn.dataset.del, 1);
      renderBlocks();
    };
  });
  wrap.querySelectorAll(".set-type").forEach((sel) => {
    sel.onchange = (e) => {
      editorState.structure.blocks[+e.target.dataset.type].setType =
        e.target.value;
    };
  });
}

/* ---------- Picker esercizi ---------- */

function openExPicker() {
  let picker = document.getElementById("ex-picker");
  if (!picker) {
    picker = document.createElement("div");
    picker.id = "ex-picker";
    picker.className = "ex-picker";
    picker.innerHTML = `
      <input class="ex-search" id="ex-search" placeholder="Cerca esercizio…" />
      <div class="ex-results" id="ex-results"></div>`;
    document.body.appendChild(picker);
    document
      .getElementById("ex-search")
      .addEventListener("input", (e) => filterExercises(e.target.value));
  }
  picker.classList.add("open");
  document.getElementById("ex-search").value = "";
  filterExercises("");
  setTimeout(() => document.getElementById("ex-search").focus(), 100);
}

function filterExercises(q) {
  q = q.trim().toLowerCase();
  const list = q
    ? EXERCISE_DB.filter((e) => e.name.toLowerCase().includes(q)).slice(0, 60)
    : EXERCISE_DB.slice(0, 60);
  const res = document.getElementById("ex-results");
  res.innerHTML = list
    .map(
      (e) => `
    <div class="ex-item" data-ex="${e.id}">
      <div class="ei-name">${escapeHtml(e.name)}</div>
      <div class="ei-meta">${e.m} · ${e.eq}</div>
    </div>`
    )
    .join("");
  res.querySelectorAll(".ex-item").forEach((it) => {
    it.onclick = () => {
      const ex = EXERCISE_DB.find((x) => x.id === it.dataset.ex);
      editorState.structure.blocks.push({
        type: "single",
        exerciseRef: "public:" + ex.id,
        exerciseName: ex.name,
        muscle: ex.m,
        setType: "normal",
        sets: [{ targetReps: 8 }, { targetReps: 8 }, { targetReps: 8 }],
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
    await apiPost("lift_save_template", {
      id: s.id,
      name: s.name.trim(),
      notes: s.notes || "",
      structure: s.structure,
    });
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
