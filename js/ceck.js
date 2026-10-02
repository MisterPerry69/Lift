/* ============================================
   LIFT — CECK
   Pagina a 2 tab: ESERCIZI (programma in corso coi pesi fatti, per settimana)
   + CECK (check settimanale + fine programma). Sola lettura.
   ============================================ */

let _ceckData = null;
let _ceckViewWeek = null;

/** Peso in stile IT: intero senza decimali, altrimenti virgola. null → "—". */
function _ceckKg(n) {
  if (n == null) return "—";
  const v = Math.round((parseFloat(n) || 0) * 10) / 10;
  return Number.isInteger(v) ? String(v) : String(v).replace(".", ",");
}

async function openCeck() {
  showScreen("ceck");
  const root = document.getElementById("screen-ceck");
  root.innerHTML = `
    <div class="history-head">
      <button class="icon-btn" id="ceck-back" aria-label="Indietro">${iconSvg("arrow-left")}</button>
      <div class="history-title">Ceck</div>
    </div>
    <div class="ceck-tabs">
      <button class="ceck-tab active" data-tab="esercizi">Esercizi</button>
      <button class="ceck-tab" data-tab="ceck">Ceck</button>
    </div>
    <div id="ceck-view-esercizi" class="ceck-view active">
      <div class="empty-state">Carico…</div>
    </div>
    <div id="ceck-view-ceck" class="ceck-view"></div>
  `;
  document.getElementById("ceck-back").onclick = openProfile;
  document.querySelectorAll(".ceck-tab").forEach((b) => {
    b.onclick = () => _ceckSwitchTab(b.dataset.tab);
  });

  let data;
  try {
    data = await apiGet("lift_get_ceck", {});
  } catch (e) {
    document.getElementById("ceck-view-esercizi").innerHTML =
      `<div class="empty-state">Errore nel caricamento del Ceck.</div>`;
    return;
  }
  _ceckData = data;
  if (!data || data.status !== "OK" || !data.hasProgram) {
    const msg = `<div class="empty-state">Serve un programma attivo per il Ceck.</div>`;
    document.getElementById("ceck-view-esercizi").innerHTML = msg;
    document.getElementById("ceck-view-ceck").innerHTML = msg;
    return;
  }
  _ceckViewWeek = data.viewWeek;
  _renderCeckEsercizi();
  _renderCeckCeck();
}

function _ceckSwitchTab(name) {
  document.querySelectorAll(".ceck-tab").forEach((b) =>
    b.classList.toggle("active", b.dataset.tab === name)
  );
  document.querySelectorAll(".ceck-view").forEach((v) =>
    v.classList.toggle("active", v.id === "ceck-view-" + name)
  );
}

/* ---------- TAB ESERCIZI ---------- */

function _renderCeckEsercizi() {
  const d = _ceckData;
  const v = document.getElementById("ceck-view-esercizi");
  const tot = d.program.weeks;

  // dropdown settimana
  const opts = [];
  for (let w = 1; w <= tot; w++) {
    const cur = w === d.program.currentWeek ? " (in corso)" : "";
    opts.push(`<option value="${w}"${w === _ceckViewWeek ? " selected" : ""}>Settimana ${w}${cur}</option>`);
  }

  const workouts = (d.esercizi || [])
    .map((w) => {
      const rows = (w.blocchi || [])
        .map((b) => {
          const serie = (b.serie || [])
            .map((s) => {
              // "6x32,5 kg" se c'è il peso, "6x—" se settimana non allenata
              return s.peso != null
                ? `${s.reps}x${_ceckKg(s.peso)} kg`
                : `${s.reps}x—`;
            })
            .join(" · ");
          return `
            <div class="ceck-ex-row">
              <div class="ceck-ex-name">${escapeHtml(b.exerciseName)}</div>
              <div class="ceck-ex-sets">${serie || "—"}</div>
            </div>`;
        })
        .join("");
      return `
        <div class="ceck-wo">
          <div class="ceck-wo-name">${escapeHtml(w.workoutName)}</div>
          ${rows || '<div class="ceck-ex-row"><span class="ceck-ex-name">Nessun esercizio</span></div>'}
        </div>`;
    })
    .join("");

  v.innerHTML = `
    <div class="ceck-week-bar">
      <span class="ceck-week-prog">${escapeHtml(d.program.nome)}</span>
      <select class="sch-week-select ceck-week-select" id="ceck-week">${opts.join("")}</select>
    </div>
    ${workouts || '<div class="empty-state">Nessun esercizio nel programma.</div>'}
  `;

  const sel = document.getElementById("ceck-week");
  if (sel) sel.onchange = () => _ceckChangeWeek(parseInt(sel.value, 10) || 1);
}

async function _ceckChangeWeek(week) {
  _ceckViewWeek = week;
  // ricarico solo i dati della tab esercizi per quella settimana
  let data;
  try {
    data = await apiGet("lift_get_ceck", { viewWeek: week });
  } catch (e) {
    return;
  }
  if (data && data.status === "OK" && data.hasProgram) {
    _ceckData.esercizi = data.esercizi;
    _renderCeckEsercizi();
  }
}

/* ---------- TAB CECK ---------- */

function _renderCeckCeck() {
  const d = _ceckData;
  const s = d.settimanale || {};
  const f = d.programmaFin || {};
  const v = document.getElementById("ceck-view-ceck");

  // --- blocco settimanale ---
  const pesoTxt = s.mediaPeso != null ? `${_ceckKg(s.mediaPeso)} kg` : "—";
  const energTxt = s.mediaEnergia != null ? `${String(s.mediaEnergia).replace(".", ",")} / 5` : "—";
  const noteHtml = (s.note || []).length
    ? s.note
        .map(
          (n) => `
          <div class="ceck-note">
            <span class="ceck-note-ex">${escapeHtml(n.exerciseName)}</span>
            <span class="ceck-note-txt">${escapeHtml(n.nota)}</span>
          </div>`
        )
        .join("")
    : `<div class="ceck-empty-row">Nessuna nota personale sugli esercizi.</div>`;

  // --- blocco fine programma ---
  const parz = f.completo ? "" : `<div class="ceck-parziale">dati parziali · programma in corso</div>`;

  const saltatiHtml = (f.saltati || []).length
    ? `<ul class="ceck-list">${f.saltati
        .map((x) => `<li>${escapeHtml(x.workoutName)} · Settimana ${x.week}</li>`)
        .join("")}</ul>`
    : `<div class="ceck-empty-row">Nessun allenamento saltato 💪</div>`;

  v.innerHTML = `
    <div class="ceck-sec-head ceck-sec-week">Check settimanale · Settimana ${s.week || "?"}</div>

    <div class="ceck-cards">
      <div class="ceck-card">
        <div class="ceck-card-v">${pesoTxt}</div>
        <div class="ceck-card-l">media peso${s.mediaPesoRange ? " · " + escapeHtml(s.mediaPesoRange) : ""}</div>
      </div>
      <div class="ceck-card">
        <div class="ceck-card-v">${energTxt}</div>
        <div class="ceck-card-l">media energia${s.nEnergia ? " · " + s.nEnergia + " sess." : ""}</div>
      </div>
    </div>

    <div class="ceck-sub-head">Note personali</div>
    ${noteHtml}

    <div class="ceck-sec-head ceck-sec-prog">Fine programma</div>
    ${parz}

    <div class="ceck-sub-head ceck-head-red">Allenamenti saltati${(f.saltati || []).length ? " (" + f.saltati.length + ")" : ""}</div>
    ${saltatiHtml}

    <div class="ceck-sub-head ceck-head-green">Top progressioni</div>
    <div class="ceck-mini-lab">Carico</div>
    ${_ceckProgList(f.topCarico, "kg")}
    <div class="ceck-mini-lab">Ripetizioni</div>
    ${_ceckProgList(f.topReps, "reps")}

    <div class="ceck-sub-head ceck-head-red">Non progrediti</div>
    ${_ceckProgList(f.nonProgrediti, null, true)}
  `;
}

/** Lista progressioni: "Panca 70→85 kg +15". unit "kg"|"reps"|null (auto da metrica). */
function _ceckProgList(items, unit, isNonProg) {
  if (!items || !items.length) {
    return `<div class="ceck-empty-row">${
      isNonProg ? "Tutto in progressione 🔥" : "Nessuna progressione ancora."
    }</div>`;
  }
  return `<div class="ceck-prog-list">${items
    .map((x) => {
      const u = unit || (x.metrica === "reps" ? "reps" : "kg");
      const da = u === "kg" ? _ceckKg(x.da) : x.da;
      const a = u === "kg" ? _ceckKg(x.a) : x.a;
      const d = x.delta;
      const dTxt = (d > 0 ? "+" : "") + (u === "kg" ? _ceckKg(d) : d);
      const cls = d > 0 ? "ceck-prog-up" : d < 0 ? "ceck-prog-down" : "ceck-prog-flat";
      return `
        <div class="ceck-prog-row">
          <span class="ceck-prog-ex">${escapeHtml(x.exerciseName)}</span>
          <span class="ceck-prog-val">${da}→${a} ${u} <strong class="${cls}">${dTxt}</strong></span>
        </div>`;
    })
    .join("")}</div>`;
}
