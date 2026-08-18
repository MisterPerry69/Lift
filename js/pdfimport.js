/* ============================================
   ForgE — pdfimport.js
   Editor "correggi valori" sul JSON estratto dal PDF.
   Opera sul formato "umano" del programma:
   { nome, dataInizio, settimane, workout:[{nome, esercizi:[...]}] }
   Al salvataggio: parseImportProgrammaJson() -> lift_import_programma.
   Livello editing: correzione valori (no riordino, no nuovi superset).
   ============================================ */

let pdfImportState = null;

const PDF_SET_TYPES = ["work", "warmup", "test", "max", "failure"];

/**
 * Apre l'editor sul programma estratto dal PDF.
 * @param {object} program - JSON "umano" prodotto dall'estrattore.
 * @param {string} pdfBase64 - per "Rigenera con AI".
 */
function openPdfImportEditor(program, pdfBase64) {
  pdfImportState = {
    program: _normalizeProgram(program),
    pdfBase64: pdfBase64 || null,
    programId: null, // nuovo programma
    onSaved: null,
  };
  showScreen("editor");
  renderPdfImportEditor();
}

/**
 * Apre lo STESSO editor per MODIFICARE un programma esistente.
 * @param {object} prog - programma dal backend (formato interno: blocks).
 * @param {function} [onSaved] - callback dopo il salvataggio.
 */
function openProgramEditEditor(prog, onSaved) {
  pdfImportState = {
    program: _normalizeProgram(_programToHuman(prog)),
    pdfBase64: null,
    programId: prog.id,
    onSaved: onSaved || null,
  };
  showScreen("editor");
  renderPdfImportEditor();
}

/**
 * Inverso di parseImportProgrammaJson: formato interno (blocks) -> formato "umano".
 * Usato per precompilare l'editor da un programma salvato.
 */
function _programToHuman(prog) {
  const weeks = parseInt(prog.weeks, 10) || 1;
  return {
    nome: prog.nome || "",
    dataInizio: prog.dataInizio || "",
    settimane: weeks,
    workout: (prog.workouts || []).map((w) => ({
      nome: w.name || "",
      esercizi: ((w.structure && w.structure.blocks) || []).map((b) => {
        const kind = b.kind === "durata" ? "durata" : "serie";
        const perSettimana = (b.perWeek || []).map((wk) => {
          if (kind === "durata") {
            return { durata: wk.durataMin || 0, parametri: wk.parametri || "" };
          }
          return {
            serie: (wk.sets || []).map((s) => {
              const set = { reps: s.reps, tipo: s.type || "work" };
              if (s.restBefore != null) set.restBefore = s.restBefore;
              if (s.nota != null && String(s.nota).trim() !== "") set.nota = s.nota;
              return set;
            }),
          };
        });
        return {
          nome: b.exerciseName || "",
          gruppo: b.muscle || "",
          attrezzo: b.attrezzo || "",
          nota: b.note || "",
          rest: b.rest || "",
          superset: b.supersetGroup || null,
          tipoEsercizio: kind,
          perSettimana: perSettimana,
        };
      }),
    })),
  };
}

/** Porta il JSON grezzo in una forma sicura da editare (difensivo sui campi). */
function _normalizeProgram(p) {
  p = p && typeof p === "object" ? p : {};
  const settimane = Math.max(1, parseInt(p.settimane, 10) || 1);
  const workout = Array.isArray(p.workout) ? p.workout : [];
  return {
    nome: String(p.nome || ""),
    dataInizio: _normDate(p.dataInizio),
    settimane: settimane,
    workout: workout.map((w) => ({
      nome: String((w && w.nome) || ""),
      esercizi: (Array.isArray(w && w.esercizi) ? w.esercizi : []).map((ex) =>
        _normEx(ex, settimane)
      ),
    })),
  };
}

function _normDate(v) {
  const s = String(v || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
}

function _normEx(ex, settimane) {
  ex = ex && typeof ex === "object" ? ex : {};
  const kind =
    String(ex.tipoEsercizio || "serie").toLowerCase() === "durata"
      ? "durata"
      : "serie";
  let perSettimana = Array.isArray(ex.perSettimana) ? ex.perSettimana.slice() : [];
  // normalizza a ESATTAMENTE `settimane` elementi
  while (perSettimana.length < settimane) {
    perSettimana.push(perSettimana.length ? _cloneWeek(perSettimana[perSettimana.length - 1], kind) : _emptyWeek(kind));
  }
  perSettimana = perSettimana.slice(0, settimane).map((w) => _normWeek(w, kind));
  return {
    nome: String(ex.nome || ""),
    gruppo: String(ex.gruppo || ""),
    attrezzo: String(ex.attrezzo || ""),
    nota: String(ex.nota || ""),
    rest: String(ex.rest || ""),
    superset: ex.superset != null && ex.superset !== "" ? String(ex.superset) : null,
    tipoEsercizio: kind,
    perSettimana: perSettimana,
  };
}

function _emptyWeek(kind) {
  return kind === "durata"
    ? { durata: 15, parametri: "" }
    : { serie: [{ reps: 8, tipo: "work" }] };
}

function _cloneWeek(w, kind) {
  return _normWeek(JSON.parse(JSON.stringify(w || {})), kind);
}

function _normWeek(w, kind) {
  w = w && typeof w === "object" ? w : {};
  if (kind === "durata") {
    const min = parseInt(w.durata, 10);
    return { durata: Number.isFinite(min) && min > 0 ? min : 15, parametri: String(w.parametri || "") };
  }
  let serie = Array.isArray(w.serie) ? w.serie : [];
  if (serie.length === 0) serie = [{ reps: 8, tipo: "work" }];
  return {
    serie: serie.map((s) => {
      const t = String((s && (s.tipo || s.type)) || "work").toLowerCase();
      const out = {
        reps: s && s.reps != null && s.reps !== "" ? s.reps : 8,
        tipo: PDF_SET_TYPES.includes(t) ? t : "work",
      };
      const rb = s && parseInt(s.restBefore, 10);
      if (Number.isFinite(rb) && rb > 0) out.restBefore = rb;
      if (s && s.nota != null && String(s.nota).trim() !== "") out.nota = String(s.nota).trim();
      return out;
    }),
  };
}

/* ---------- RENDER ---------- */

function renderPdfImportEditor() {
  const p = pdfImportState.program;
  const root = document.getElementById("screen-editor");
  root.innerHTML = `
    <div class="editor-head">
      <button class="icon-btn" id="pdf-back" aria-label="Indietro">${iconSvg("arrow-left")}</button>
      <span class="editor-title-input" style="cursor:default">${pdfImportState.programId ? "Modifica scheda" : "Correggi la scheda"}</span>
    </div>

    <div class="pdf-imp-meta">
      <label class="pdf-imp-field">
        <span class="pdf-imp-lab">Nome programma</span>
        <input id="pdf-nome" class="pdf-imp-input" value="${escapeAttr(p.nome)}" placeholder="Nome" />
      </label>
      <div class="pdf-imp-meta-row">
        <label class="pdf-imp-field">
          <span class="pdf-imp-lab">Data inizio</span>
          <input id="pdf-data" class="pdf-imp-input" type="date" value="${escapeAttr(p.dataInizio)}" />
        </label>
        <label class="pdf-imp-field">
          <span class="pdf-imp-lab">Settimane</span>
          <input id="pdf-sett" class="pdf-imp-input" type="number" min="1" max="52" value="${p.settimane}" />
        </label>
      </div>
    </div>

    <div id="pdf-workouts"></div>

    <div class="pdf-imp-error" id="pdf-error" hidden></div>

    <div class="pdf-imp-actions">
      ${pdfImportState.pdfBase64 ? `<button class="pdf-imp-regen" id="pdf-regen" type="button">Rigenera con AI</button>` : ""}
      <button class="save-template-btn" id="pdf-save">Salva programma</button>
    </div>
  `;
  _renderPdfWorkouts();
  _wirePdfMeta();

  document.getElementById("pdf-back").onclick = () => {
    const cb = pdfImportState && pdfImportState.onSaved;
    pdfImportState = null;
    if (cb) cb(); // torna al dettaglio programma
    else {
      showScreen("home");
      renderHome();
    }
  };
  document.getElementById("pdf-save").onclick = _pdfSave;
  const regen = document.getElementById("pdf-regen");
  if (regen) regen.onclick = _pdfRegen;
}

function _renderPdfWorkouts() {
  const wrap = document.getElementById("pdf-workouts");
  const p = pdfImportState.program;
  wrap.innerHTML = p.workout
    .map((w, wi) => _pdfWorkoutHtml(w, wi))
    .join("");
  _wirePdfWorkouts(wrap);
}

function _pdfWorkoutHtml(w, wi) {
  return `
    <div class="pdf-imp-wk" data-wi="${wi}">
      <input class="pdf-imp-wk-name" data-wi="${wi}" value="${escapeAttr(w.nome)}" placeholder="Nome workout" />
      ${w.esercizi.map((ex, ei) => _pdfExHtml(ex, wi, ei)).join("")}
      <button class="pdf-imp-ex-add" data-wi="${wi}" type="button">+ Aggiungi esercizio</button>
    </div>`;
}

function _pdfExHtml(ex, wi, ei) {
  const weeks = pdfImportState.program.settimane;
  const supLabel = ex.superset ? `<span class="pdf-imp-sup">SS ${escapeHtml(ex.superset)}</span>` : "";
  const weeksHtml = ex.perSettimana
    .map((wk, si) => _pdfWeekHtml(ex, wk, wi, ei, si))
    .join("");
  return `
    <div class="pdf-imp-ex" data-wi="${wi}" data-ei="${ei}">
      <div class="pdf-imp-ex-head">
        <input class="pdf-imp-ex-name" data-f="nome" data-wi="${wi}" data-ei="${ei}"
          value="${escapeAttr(ex.nome)}" placeholder="Nome esercizio" />
        ${supLabel}
        <button class="pdf-imp-ex-del" data-wi="${wi}" data-ei="${ei}" type="button" title="Rimuovi esercizio" aria-label="Rimuovi esercizio">✕</button>
      </div>
      <div class="pdf-imp-ex-fields">
        <input class="pdf-imp-input sm" data-f="gruppo" data-wi="${wi}" data-ei="${ei}"
          value="${escapeAttr(ex.gruppo)}" placeholder="Gruppo" />
        <input class="pdf-imp-input sm" data-f="attrezzo" data-wi="${wi}" data-ei="${ei}"
          value="${escapeAttr(ex.attrezzo)}" placeholder="Attrezzo" />
        <input class="pdf-imp-input sm" data-f="rest" data-wi="${wi}" data-ei="${ei}"
          value="${escapeAttr(ex.rest)}" placeholder="Rest" />
      </div>
      <input class="pdf-imp-input" data-f="nota" data-wi="${wi}" data-ei="${ei}"
        value="${escapeAttr(ex.nota)}" placeholder="Nota" />
      <div class="pdf-imp-weeks">${weeksHtml}</div>
    </div>`;
}

function _pdfWeekHtml(ex, wk, wi, ei, si) {
  const head = `<div class="pdf-imp-wk-lab">Settimana ${si + 1}</div>`;
  if (ex.tipoEsercizio === "durata") {
    return `
      <div class="pdf-imp-week" data-wi="${wi}" data-ei="${ei}" data-si="${si}">
        ${head}
        <div class="pdf-imp-dur">
          <input class="pdf-imp-input xs" data-f="durata" data-wi="${wi}" data-ei="${ei}" data-si="${si}"
            type="number" min="1" value="${escapeAttr(wk.durata)}" placeholder="min" />
          <span class="pdf-imp-unit">min</span>
          <input class="pdf-imp-input" data-f="parametri" data-wi="${wi}" data-ei="${ei}" data-si="${si}"
            value="${escapeAttr(wk.parametri)}" placeholder="Parametri (vel/pend/liv)" />
        </div>
      </div>`;
  }
  const rows = wk.serie
    .map(
      (s, ri) => `
      <div class="pdf-imp-set" data-wi="${wi}" data-ei="${ei}" data-si="${si}" data-ri="${ri}">
        <span class="pdf-imp-set-n">${ri + 1}</span>
        <input class="pdf-imp-input xs" data-f="reps" data-wi="${wi}" data-ei="${ei}" data-si="${si}" data-ri="${ri}"
          value="${escapeAttr(s.reps)}" placeholder="reps" />
        <select class="pdf-imp-sel" data-f="tipo" data-wi="${wi}" data-ei="${ei}" data-si="${si}" data-ri="${ri}">
          ${PDF_SET_TYPES.map((t) => `<option value="${t}"${t === s.tipo ? " selected" : ""}>${t}</option>`).join("")}
        </select>
        <input class="pdf-imp-input xs" data-f="restBefore" data-wi="${wi}" data-ei="${ei}" data-si="${si}" data-ri="${ri}"
          type="number" min="0" value="${s.restBefore != null ? escapeAttr(s.restBefore) : ""}" placeholder="rest″" title="Rest-pause prima di questa serie (secondi)" />
        <button class="pdf-imp-set-del" data-wi="${wi}" data-ei="${ei}" data-si="${si}" data-ri="${ri}" type="button" title="Togli serie">−</button>
        <input class="pdf-imp-input pdf-imp-set-nota" data-f="setnota" data-wi="${wi}" data-ei="${ei}" data-si="${si}" data-ri="${ri}"
          value="${s.nota != null ? escapeAttr(s.nota) : ""}" placeholder="nota serie (es. mantieni il carico)" />
      </div>`
    )
    .join("");
  return `
    <div class="pdf-imp-week" data-wi="${wi}" data-ei="${ei}" data-si="${si}">
      ${head}
      <div class="pdf-imp-sets">${rows}</div>
      <button class="pdf-imp-set-add" data-wi="${wi}" data-ei="${ei}" data-si="${si}" type="button">+ serie</button>
    </div>`;
}

/* ---------- WIRING ---------- */

function _wirePdfMeta() {
  document.getElementById("pdf-nome").oninput = (e) =>
    (pdfImportState.program.nome = e.target.value);
  document.getElementById("pdf-data").oninput = (e) =>
    (pdfImportState.program.dataInizio = e.target.value);
  document.getElementById("pdf-sett").onchange = (e) => {
    const n = Math.max(1, Math.min(52, parseInt(e.target.value, 10) || 1));
    pdfImportState.program.settimane = n;
    // ri-normalizza il numero di settimane su ogni esercizio
    pdfImportState.program.workout.forEach((w) =>
      w.esercizi.forEach((ex) => {
        ex.perSettimana = _normEx(ex, n).perSettimana;
      })
    );
    _renderPdfWorkouts();
  };
}

function _idx(el) {
  return {
    wi: parseInt(el.dataset.wi, 10),
    ei: parseInt(el.dataset.ei, 10),
    si: parseInt(el.dataset.si, 10),
    ri: parseInt(el.dataset.ri, 10),
  };
}

function _wirePdfWorkouts(wrap) {
  const P = pdfImportState.program;

  wrap.querySelectorAll(".pdf-imp-wk-name").forEach((inp) => {
    inp.oninput = () => {
      const { wi } = _idx(inp);
      P.workout[wi].nome = inp.value;
    };
  });

  // campi esercizio (nome/gruppo/attrezzo/rest/nota)
  wrap.querySelectorAll(".pdf-imp-ex input[data-f]").forEach((inp) => {
    if (inp.dataset.si !== undefined && inp.dataset.si !== "") return; // skip week-level
    inp.oninput = () => {
      const { wi, ei } = _idx(inp);
      P.workout[wi].esercizi[ei][inp.dataset.f] = inp.value;
    };
  });

  // reps
  wrap.querySelectorAll('.pdf-imp-set input[data-f="reps"]').forEach((inp) => {
    inp.oninput = () => {
      const { wi, ei, si, ri } = _idx(inp);
      const v = inp.value.trim();
      // numero se e' un intero puro, altrimenti stringa (range/rm/max)
      P.workout[wi].esercizi[ei].perSettimana[si].serie[ri].reps =
        /^\d+$/.test(v) ? parseInt(v, 10) : v;
    };
  });
  // tipo
  wrap.querySelectorAll('.pdf-imp-sel[data-f="tipo"]').forEach((sel) => {
    sel.onchange = () => {
      const { wi, ei, si, ri } = _idx(sel);
      P.workout[wi].esercizi[ei].perSettimana[si].serie[ri].tipo = sel.value;
    };
  });
  // rest-pause (restBefore) per serie
  wrap.querySelectorAll('.pdf-imp-set input[data-f="restBefore"]').forEach((inp) => {
    inp.oninput = () => {
      const { wi, ei, si, ri } = _idx(inp);
      const set = P.workout[wi].esercizi[ei].perSettimana[si].serie[ri];
      const rb = parseInt(inp.value, 10);
      if (Number.isFinite(rb) && rb > 0) set.restBefore = rb;
      else delete set.restBefore;
    };
  });
  // nota per serie
  wrap.querySelectorAll('.pdf-imp-set input[data-f="setnota"]').forEach((inp) => {
    inp.oninput = () => {
      const { wi, ei, si, ri } = _idx(inp);
      const set = P.workout[wi].esercizi[ei].perSettimana[si].serie[ri];
      const v = inp.value.trim();
      if (v) set.nota = v;
      else delete set.nota;
    };
  });
  // durata / parametri
  wrap.querySelectorAll('input[data-f="durata"]').forEach((inp) => {
    inp.oninput = () => {
      const { wi, ei, si } = _idx(inp);
      P.workout[wi].esercizi[ei].perSettimana[si].durata =
        parseInt(inp.value, 10) || 0;
    };
  });
  wrap.querySelectorAll('input[data-f="parametri"]').forEach((inp) => {
    inp.oninput = () => {
      const { wi, ei, si } = _idx(inp);
      P.workout[wi].esercizi[ei].perSettimana[si].parametri = inp.value;
    };
  });

  // aggiungi/togli serie
  wrap.querySelectorAll(".pdf-imp-set-add").forEach((btn) => {
    btn.onclick = () => {
      const { wi, ei, si } = _idx(btn);
      P.workout[wi].esercizi[ei].perSettimana[si].serie.push({ reps: 8, tipo: "work" });
      _renderPdfWorkouts();
    };
  });
  wrap.querySelectorAll(".pdf-imp-set-del").forEach((btn) => {
    btn.onclick = () => {
      const { wi, ei, si, ri } = _idx(btn);
      const serie = P.workout[wi].esercizi[ei].perSettimana[si].serie;
      if (serie.length > 1) {
        serie.splice(ri, 1);
        _renderPdfWorkouts();
      }
    };
  });

  // rimuovi esercizio
  wrap.querySelectorAll(".pdf-imp-ex-del").forEach((btn) => {
    btn.onclick = async () => {
      const { wi, ei } = _idx(btn);
      const ex = P.workout[wi].esercizi[ei];
      const ok = await liftConfirm(
        "Rimuovere " + (ex.nome || "questo esercizio") + " dalla scheda?",
        { okLabel: "Rimuovi", danger: true }
      );
      if (!ok) return;
      P.workout[wi].esercizi.splice(ei, 1);
      _renderPdfWorkouts();
    };
  });

  // aggiungi esercizio (dal catalogo)
  wrap.querySelectorAll(".pdf-imp-ex-add").forEach((btn) => {
    btn.onclick = () => {
      const wi = parseInt(btn.dataset.wi, 10);
      _openAddExercisePicker(wi);
    };
  });
}

/** Serie base (una work per settimana) per un nuovo esercizio. */
function _blankExercise(nome, gruppo, attrezzo, settimane) {
  const perSettimana = [];
  for (let i = 0; i < settimane; i++) {
    perSettimana.push({ serie: [{ reps: 8, tipo: "work" }] });
  }
  return {
    nome: nome || "",
    gruppo: gruppo || "",
    attrezzo: attrezzo || "",
    nota: "",
    rest: "",
    superset: null,
    tipoEsercizio: "serie",
    perSettimana: perSettimana,
  };
}

/** Picker catalogo per aggiungere un esercizio al workout wi. */
function _openAddExercisePicker(wi) {
  const catalog = typeof EXERCISES_CATALOG !== "undefined" ? EXERCISES_CATALOG : [];
  let m = document.getElementById("pdf-add-modal");
  if (!m) {
    m = document.createElement("div");
    m.id = "pdf-add-modal";
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
      : `<div class="empty-state">Nessun esercizio nel catalogo per questa ricerca.</div>`;
  };
  m.innerHTML = `
    <div class="ov-sheet">
      <div class="ov-head">
        <div class="ov-title" style="font-size:1.2rem">Aggiungi esercizio</div>
        <button class="ov-close" id="pdfadd-close">✕</button>
      </div>
      <input class="addex-search" id="pdfadd-search" placeholder="Cerca esercizio…" />
      <div class="ov-list" id="pdfadd-list">${renderList("")}</div>
    </div>`;

  const addFromCatalog = (id) => {
    const cat = catalog.find((e) => String(e.id) === String(id));
    if (!cat) return;
    const settimane = pdfImportState.program.settimane;
    pdfImportState.program.workout[wi].esercizi.push(
      _blankExercise(cat.nome, cat.gruppo || "", cat.attrezzo || "", settimane)
    );
    m.classList.remove("open");
    _renderPdfWorkouts();
  };
  const wire = () => {
    m.querySelectorAll(".addex-item").forEach((it) => {
      it.onclick = () => addFromCatalog(it.dataset.id);
    });
  };
  wire();
  m.querySelector("#pdfadd-close").onclick = () => m.classList.remove("open");
  m.querySelector("#pdfadd-search").oninput = (e) => {
    document.getElementById("pdfadd-list").innerHTML = renderList(e.target.value);
    wire();
  };
  m.classList.add("open");
}

/* ---------- SALVA / RIGENERA ---------- */

async function _pdfSave() {
  const errBox = document.getElementById("pdf-error");
  errBox.hidden = true;
  errBox.textContent = "";

  let prog;
  try {
    // parseImportProgrammaJson vuole l'oggetto "umano" -> lo passiamo direttamente
    prog = parseImportProgrammaJson(pdfImportState.program);
  } catch (e) {
    errBox.textContent = e.message || "Dati non validi.";
    errBox.hidden = false;
    return;
  }

  const btn = document.getElementById("pdf-save");
  btn.textContent = "Salvataggio…";
  btn.disabled = true;
  const editId = pdfImportState.programId; // se presente = modifica in-place
  const onSaved = pdfImportState.onSaved;
  try {
    const payload = {
      nome: prog.name,
      dataInizio: prog.dataInizio,
      weeks: prog.weeks,
      workouts: prog.workouts,
    };
    if (editId) payload.id = editId; // aggiorna il programma esistente
    await apiPost("lift_import_programma", payload);
    pdfImportState = null;
    if (editId && onSaved) {
      onSaved(); // torna al dettaglio programma aggiornato
    } else {
      showScreen("home");
      await renderHome();
    }
  } catch (e) {
    errBox.textContent = "Errore import: " + (e.message || e);
    errBox.hidden = false;
    btn.textContent = "Salva programma";
    btn.disabled = false;
  }
}

async function _pdfRegen() {
  const btn = document.getElementById("pdf-regen");
  btn.textContent = "Rigenero…";
  btn.disabled = true;
  try {
    const res = await apiPost("lift_extract_pdf", { pdfBase64: pdfImportState.pdfBase64 });
    if (res && res.status === "OK" && res.program) {
      pdfImportState.program = _normalizeProgram(res.program);
      renderPdfImportEditor();
    } else {
      btn.textContent = "Rigenera con AI";
      btn.disabled = false;
      liftAlert((res && res.message) || "Rigenerazione non riuscita.");
    }
  } catch (e) {
    btn.textContent = "Rigenera con AI";
    btn.disabled = false;
    liftAlert("Errore rete: " + (e.message || e));
  }
}
