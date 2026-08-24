/* ============================================
   LIFT — Esecuzione sessione
   Stato persistito in localStorage. Rest timestamp-based.
   Wake-lock attivo durante l'esecuzione.
   ============================================ */

const LS_KEY = "lift_active_session";
let ex = null; // stato esecuzione corrente
let wakeLock = null;
let restTick = null;

/* ---------- avvio ---------- */

async function startSession(templateId) {
  // recupero scheda dai dati bootstrap (gia in memoria via renderHome)
  const data = await apiGet("lift_get_data");
  const tpl = (data.templates || []).find((t) => t.id === templateId);
  if (!tpl) {
    return liftAlert("Scheda non trovata");
  }
  // serve la struttura completa: la rileggo dal backend
  const full = await apiPost("lift_get_template", { id: templateId });
  const structure =
    full && full.structure ? full.structure : { blocks: [] };

  ex = {
    templateId: templateId,
    templateName: tpl.name,
    startedAt: new Date().toISOString(),
    lastInteractionAt: Date.now(),
    blocks: structure.blocks || [],
    weeks: structure.weeks || null,
    currentWeek: structure.currentWeek || 1,
    bi: 0, // block index
    si: 0, // set index dentro il blocco
    done: [], // {exerciseRef, exerciseName, muscleGroup, type, weight, reps, note, bi, si}
    previousByExercise: full.previousByExercise || {},
  };
  persist();
  acquireWakeLock();
  _armBackGuard();
  showScreen("exec");
  renderExec();
}

/**
 * Avvia un workout che fa parte di un programma periodizzato.
 * La settimana è quella corrente del programma (condivisa, per data/override).
 */
async function startProgramWorkout(programId, workoutId) {
  const res = await apiPost("lift_get_program", { id: programId });
  const prog = res && res.program ? res.program : null;
  if (!prog) return liftAlert("Programma non trovato");
  const wk = (prog.workouts || []).find((w) => w.id === workoutId);
  if (!wk) return liftAlert("Workout non trovato");

  const structure = wk.structure || { blocks: [] };
  const blocks = structure.blocks || [];
  // ripresa: blocchi già fatti questa settimana → riparto dal primo non fatto
  const doneBlocks = (res.doneBlocksByWk && res.doneBlocksByWk[workoutId]) || [];
  let startBi = 0;
  if (doneBlocks.length) {
    const doneSet = new Set(doneBlocks);
    const firstTodo = blocks.findIndex((_, i) => !doneSet.has(i));
    startBi = firstTodo >= 0 ? firstTodo : 0;
  }

  ex = {
    templateId: programId + "/" + workoutId,
    templateName: wk.name,
    programId: programId,
    programName: prog.nome,
    startedAt: new Date().toISOString(),
    lastInteractionAt: Date.now(),
    blocks: blocks,
    weeks: prog.weeks || null,
    currentWeek: prog.currentWeek || 1,
    bi: startBi,
    si: 0,
    done: [],
    resumedDoneBlocks: doneBlocks, // blocchi fatti in sessioni precedenti di questa settimana
    previousByExercise: res.previousByExercise || {},
    prByExercise: res.prByExercise || {},
  };
  persist();
  acquireWakeLock();
  _armBackGuard();
  showScreen("exec");
  if (doneBlocks.length) {
    liftAlert(
      "Riprendi " + wk.name + ": " + doneBlocks.length + " esercizi già fatti questa settimana, riparti da dove avevi lasciato.",
      "Ripresa allenamento"
    );
  }
  renderExec();
}

function resumeSessionIfAny() {
  // 1. PARSING (sicuro): un JSON corrotto è l'UNICO caso in cui si può buttare.
  const saved = _readActiveSession();
  if (!saved) return false;

  // 2. auto-terminazione se troppo vecchia (≥4h). Se lastInteractionAt manca
  //    (NaN), NON auto-termino: meglio riprendere che rischiare di perdere.
  const hrs = (Date.now() - saved.lastInteractionAt) / 3600000;
  if (Number.isFinite(hrs) && hrs >= 4) {
    finalizeSession(saved, true); // salva sul backend
    localStorage.removeItem(LS_KEY);
    return false;
  }

  // 3. RENDERING: se fallisce NON tocco localStorage. La sessione resta salvata
  //    e recuperabile (banner in home / prossimo avvio). Mai perdere i dati.
  try {
    ex = saved;
    acquireWakeLock();
    _armBackGuard();
    showScreen("exec");
    renderExec();
    return true;
  } catch (e) {
    console.error("Ripresa sessione: errore di rendering, stato PRESERVATO", e);
    ex = null; // evito uno stato half-rendered incoerente
    return false;
  }
}

/** Legge e valida lo stato attivo da localStorage. null se assente/corrotto. */
function _readActiveSession() {
  const raw = localStorage.getItem(LS_KEY);
  if (!raw) return null;
  try {
    const saved = JSON.parse(raw);
    // sanity minima: deve avere i blocchi. Se no, è irrecuperabile.
    if (!saved || !Array.isArray(saved.blocks)) {
      localStorage.removeItem(LS_KEY);
      return null;
    }
    return saved;
  } catch (e) {
    localStorage.removeItem(LS_KEY); // JSON corrotto: unico caso di scarto
    return null;
  }
}

/** true se c'è una sessione attiva ripristinabile (per il banner in home). */
function hasActiveSession() {
  return !!_readActiveSession();
}

/** Etichetta della sessione attiva (nome scheda) per il banner. */
function activeSessionName() {
  const s = _readActiveSession();
  return s ? s.templateName || "Allenamento" : "";
}

function persist() {
  if (!ex) return;
  ex.lastInteractionAt = Date.now();
  localStorage.setItem(LS_KEY, JSON.stringify(ex));
}

/* ---------- wake lock ---------- */

async function acquireWakeLock() {
  try {
    if ("wakeLock" in navigator) {
      wakeLock = await navigator.wakeLock.request("screen");
    }
  } catch (e) {
    /* fallback grazioso: niente lock */
  }
}
function releaseWakeLock() {
  if (wakeLock) {
    wakeLock.release().catch(() => {});
    wakeLock = null;
  }
}
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && ex) acquireWakeLock();
});

/* ---------- blocco gesture "indietro" durante l'esecuzione ----------
   Su Android/Chrome la gesture indietro (edge-swipe) o il tasto back, in una
   PWA che non gestisce la history, ESCE dall'app: cold-start e sessione persa
   di fatto. Durante l'esecuzione la neutralizziamo: teniamo uno stato-sentinella
   in cima alla history; ogni volta che il back lo consuma, lo re-inseriamo →
   l'indietro non fa nulla finché la sessione è attiva. Per uscire: bottoni
   Termina/Scarta dell'app. */
let _backGuardArmed = false;

function _armBackGuard() {
  if (_backGuardArmed) return;
  _backGuardArmed = true;
  try {
    history.pushState({ liftExec: true }, "");
  } catch (e) {}
  window.addEventListener("popstate", _onExecPopState);
}

function _disarmBackGuard() {
  if (!_backGuardArmed) return;
  _backGuardArmed = false;
  window.removeEventListener("popstate", _onExecPopState);
}

function _onExecPopState() {
  // se siamo ancora in esecuzione, annulliamo l'indietro re-inserendo lo stato
  if (ex) {
    try {
      history.pushState({ liftExec: true }, "");
    } catch (e) {}
  }
}

/* ---------- helpers stato ---------- */

function curBlock() {
  return ex.blocks[ex.bi];
}
function curExerciseOfBlock(b) {
  // v1: solo blocchi single. Superset: iterazione successiva.
  return {
    ref: b.exerciseRef,
    name: b.exerciseName,
    muscle: b.muscle || "",
  };
}

/**
 * Set di un blocco per la settimana corrente.
 * - Blocco periodizzato: b.perWeek[currentWeek-1].sets (+ eventuali warm-up aggiunti al volo).
 * - Blocco vecchio formato: b.sets ({targetReps}) normalizzato a {reps,type}.
 * Le warm-up aggiunte runtime vivono in b._extraSets (per blocco), in testa.
 */
function setsForBlock(b) {
  // un esercizio a durata conta come 1 "unità" (per panoramica/progress)
  if (isDurationBlock(b)) {
    const d = durationForBlock(b);
    return [{ reps: d.durataMin + "′", type: "duration" }];
  }
  let base;
  if (b.perWeek) {
    const wi = (ex.currentWeek || 1) - 1;
    const wk = b.perWeek[wi] || b.perWeek[0] || { sets: [] };
    base = (wk.sets || []).map((s) => {
      const o = { reps: s.reps, type: s.type || "work" };
      if (s.restBefore != null) o.restBefore = s.restBefore; // rest-pause
      if (s.nota != null && String(s.nota).trim() !== "") o.nota = String(s.nota).trim(); // nota per-serie
      return o;
    });
  } else {
    base = (b.sets || []).map((s) => ({
      reps: s.targetReps != null ? s.targetReps : 8,
      type: s.setType || "work",
    }));
  }
  const extra = b._extraSets || [];
  // Il totale serie NON si accorcia più: "salta serie" registra un done
  // di tipo "skipped" per quella serie (barrata nello storico), ma la serie
  // resta nel conteggio. Il completamento del blocco è deciso da isBlockComplete.
  return extra.concat(base);
}

function totalSetsOfBlock(b) {
  return setsForBlock(b).length || 1;
}

/** true se il blocco è un esercizio a durata (cardio a tempo). */
function isDurationBlock(b) {
  return b && b.kind === "durata";
}

/** Dati durata della settimana corrente: { durataMin, parametri }. */
function durationForBlock(b) {
  const wi = (ex.currentWeek || 1) - 1;
  const wk = (b.perWeek && (b.perWeek[wi] || b.perWeek[0])) || {};
  return { durataMin: wk.durataMin || 0, parametri: wk.parametri || "" };
}

/** La serie corrente (oggetto {reps,type}) del blocco corrente. */
function curSet() {
  const sets = setsForBlock(curBlock());
  return sets[ex.si] || sets[0] || { reps: 8, type: "work" };
}

/** Etichetta leggibile dell'obiettivo reps (numero, range, "8rm", "max"). */
function repsTargetLabel(set) {
  return String(set.reps);
}

/** reps numeriche suggerite di partenza da un target (range/rm/max -> numero). */
function repsTargetNumeric(set) {
  const r = set.reps;
  if (typeof r === "number") return r;
  const str = String(r);
  const range = str.match(/^(\d+)\s*-\s*(\d+)$/);
  if (range) return parseInt(range[1], 10); // estremo basso del range
  const rm = str.match(/^(\d+)\s*rm$/i);
  if (rm) return parseInt(rm[1], 10);
  const n = parseInt(str, 10);
  return Number.isFinite(n) ? n : 8;
}

/** Secondi da una stringa tipo "2'30\"", "1'30\"", "20\"", "0", o numero. */
function parseRestSeconds(raw) {
  if (raw == null || raw === "") return 0;
  if (typeof raw === "number") return raw;
  const str = String(raw).trim();
  if (str === "0") return 0;
  const m = str.match(/(?:(\d+)\s*')?\s*(\d+)?\s*"?/);
  if (m) {
    const min = parseInt(m[1] || "0", 10);
    const sec = parseInt(m[2] || "0", 10);
    return min * 60 + sec;
  }
  return 0;
}

/** Rest generale dell'esercizio (tra le serie). */
function restSecondsOf(b) {
  if (b.restAfterSetSec != null) return b.restAfterSetSec; // vecchio formato
  return parseRestSeconds(b.rest);
}

/**
 * Rest-pause "prima" di una serie: se la serie ha restBefore (es. 20" prima
 * della MAX), quello sostituisce il rest normale nel timer che la precede.
 * Ritorna secondi > 0 solo se la serie di destinazione ha un restBefore valido.
 */
function restBeforeOfSet(set) {
  if (!set || set.restBefore == null || set.restBefore === "") return 0;
  return parseRestSeconds(set.restBefore);
}

/** Gli altri esercizi dello stesso superset del blocco corrente (per etichetta). */
function supersetPartners(b) {
  if (!b.supersetGroup) return [];
  return ex.blocks.filter(
    (x) => x !== b && x.supersetGroup === b.supersetGroup
  );
}

/**
 * Peso/reps suggeriti per la serie corrente, in ordine di preferenza:
 * 1. Serie precedente di QUESTA sessione (stesso esercizio, ultima done valida)
 * 2. Set corrispondente (per indice) della sessione precedente
 * 3. Primo set della sessione precedente (se l'indice non esiste)
 * 4. null se non c'e proprio nulla
 */
function suggestedFor(bi, si) {
  const b = ex.blocks[bi];
  const exo = curExerciseOfBlock(b);
  const sets = setsForBlock(b);
  const curIsWarmup = (sets[si] && sets[si].type) === "warmup";

  // 1. serie precedente di oggi sullo stesso esercizio, stesso "gruppo" (warmup/lavoro)
  for (let i = ex.done.length - 1; i >= 0; i--) {
    const d = ex.done[i];
    if (d.exerciseRef !== exo.ref || d.type === "skipped" || d.weight == null) continue;
    if ((d.type === "warmup") !== curIsWarmup) continue; // non mischiare warm-up e lavoro
    return { weight: d.weight, reps: d.reps, source: "today" };
  }
  // 2. sessione precedente, allineata per tipo (vedi prevSessionSet)
  const set = prevSessionSet(exo.ref, si);
  if (set && set.weight != null) {
    return { weight: set.weight, reps: set.reps, source: "previous" };
  }
  return null;
}

/** Etichetta "prossimo": esercizio + serie su cui punta lo stato ora (usata nel rest). */
function nextUpLabel() {
  const b = ex.blocks[ex.bi];
  if (!b) return "Fine sessione";
  if (isDurationBlock(b)) return b.exerciseName;
  const tot = totalSetsOfBlock(b);
  return `${b.exerciseName} · serie ${ex.si + 1}/${tot}`;
}

/**
 * Riferimento dall'ultima sessione per la serie corrente, allineato per TIPO:
 * - la N-esima serie di LAVORO di oggi → N-esima serie di lavoro dell'ultima volta
 * - la N-esima serie di WARM-UP di oggi → N-esima warm-up dell'ultima volta
 * Così le warm-up non sfasano il confronto (es. oggi 3×6 ≠ warm-up del passato).
 */
function prevSessionSet(ref, si) {
  const prev = (ex.previousByExercise || {})[ref];
  if (!prev || !prev.length) return null;

  // tipo della serie corrente + il suo indice DENTRO le serie dello stesso "gruppo"
  const sets = setsForBlock(curBlock());
  const curType = (sets[si] && sets[si].type) || "work";
  const curIsWarmup = curType === "warmup";
  let rankInGroup = 0;
  for (let k = 0; k < si; k++) {
    const t = (sets[k] && sets[k].type) || "work";
    if (curIsWarmup === (t === "warmup")) rankInGroup++;
  }

  // serie precedenti dello stesso gruppo (warmup vs lavoro)
  const sameGroup = prev.filter((p) => (p.type === "warmup") === curIsWarmup);
  if (!sameGroup.length) {
    // nessuna corrispondenza di tipo: ripiego sull'ultima serie di lavoro precedente
    const work = prev.filter((p) => p.type !== "warmup");
    return work[work.length - 1] || prev[prev.length - 1] || null;
  }
  return sameGroup[rankInGroup] || sameGroup[sameGroup.length - 1] || null;
}

/* ---------- render ---------- */

function renderExec() {
  const root = document.getElementById("screen-exec");
  // niente chiusura automatica: se bi è fuori range, riporto sull'ultimo blocco
  if (ex.bi >= ex.blocks.length) {
    const inc = firstIncompleteBlock(0);
    ex.bi = inc >= 0 ? inc : ex.blocks.length - 1;
    ex.si = 0;
  }
  const b = curBlock();
  if (isDurationBlock(b)) {
    return renderExecDuration(b);
  }
  // blocco già completato e nessuna serie residua da fare → vista "completato"
  if (isBlockComplete(ex.bi) && ex.si >= totalSetsOfBlock(b)) {
    return renderExecCompleted(b);
  }
  // esercizio a corpo libero / reps "max" → vista SOLO REPS (numero grande + / − + ✅)
  if (isBodyweightBlock(b)) {
    return renderExecReps(b);
  }
  const exo = curExerciseOfBlock(b);
  const totSets = totalSetsOfBlock(b);
  const set = curSet();
  const targetLabel = repsTargetLabel(set);
  const targetNum = repsTargetNumeric(set);
  const isWarmup = set.type === "warmup";
  const sug = suggestedFor(ex.bi, ex.si);
  // PESO: suggerito dal riferimento (ultima volta / serie di oggi). REPS: dal target scheda.
  const sugW = sug ? sug.weight : null;
  const sugR = targetNum;
  const sugLabel = !sug
    ? "Nessun riferimento esercizio precedente"
    : sug.source === "today"
    ? "Serie precedente oggi: " + sug.weight + " kg × " + sug.reps
    : "Stesso peso dell'ultima volta";

  // Riferimento allenamento precedente COMPLETO: tutte le serie dell'ultima volta + PR
  const prevAll = (ex.previousByExercise || {})[exo.ref] || [];
  const prObj = (ex.prByExercise || {})[exo.ref] || {};
  const prVal = prObj.heaviest || prObj["1rm"] || 0;
  let prevHtml = "";
  if (prevAll.length) {
    const serie = prevAll
      .filter((p) => p.weight != null || p.reps != null)
      .map((p, i) => {
        const w = p.weight != null ? p.weight : "—";
        const r = p.reps != null ? p.reps : "—";
        // evidenzio la serie corrispondente a quella corrente
        const isCur = i === ex.si;
        return `<span class="pl-serie${isCur ? " pl-serie-cur" : ""}">${w}×${r}</span>`;
      })
      .join('<span class="pl-sep">·</span>');
    prevHtml =
      `<div class="pl-prev-label">Ultima volta</div>` +
      `<div class="pl-serie-row">${serie}</div>`;
  }
  if (prVal > 0) {
    prevHtml += `<span class="pl-pr">PR ${prVal}</span>`;
  }

  // riga settimana + superset
  const weekTag = ex.weeks
    ? `<span class="ep-week">Settimana ${ex.currentWeek}/${ex.weeks}</span>`
    : "";
  const partners = supersetPartners(b);
  const ssTag = b.supersetGroup
    ? `<div class="exec-superset">Superset ${escapeHtml(b.supersetGroup)}${
        partners.length
          ? " · con " + partners.map((p) => escapeHtml(p.exerciseName)).join(", ")
          : ""
      }</div>`
    : "";
  const note = (b.note || b.noteDefault || "").trim();
  const notaPers = exerciseNotaPersonale(exo.ref);
  const setNota = (set.nota || "").trim();
  const setTypeTag =
    set.type && set.type !== "work"
      ? `<span class="exec-settype exec-settype-${set.type}">${set.type}</span>`
      : "";

  root.innerHTML = `
    <div class="exec-header">
      <div>
        <div class="eh-name">${escapeHtml(ex.templateName)}</div>
        <div class="eh-timer" id="eh-timer">00:00:00</div>
      </div>
      <div class="exec-header-actions">
        <button class="eh-overview" id="ex-overview" title="Panoramica scheda">${iconSvg(
          "list"
        )}</button>
        <button class="eh-discard" id="ex-discard" title="Scarta sessione">✕</button>
        <button class="eh-end" id="ex-end">TERMINA</button>
      </div>
    </div>
    <div class="exec-body">
      <div class="exec-top">
        <div class="exec-progress">Esercizio ${ex.bi + 1} / ${
    ex.blocks.length
  } ${weekTag}</div>
        ${ssTag}
        <div class="exec-exname">${escapeHtml(exo.name)}</div>
        ${note ? `<div class="exec-note">${escapeHtml(note)}</div>` : ""}
        ${notaPers ? `<div class="exec-nota-personale">${iconSvg("edit")} ${escapeHtml(notaPers)}</div>` : ""}
      </div>

      <div class="exec-focus ${isWarmup ? "exec-focus-warmup" : ""}">
        <div class="exec-set-nav">Serie ${ex.si + 1} / ${totSets} ${setTypeTag} · obiettivo ${escapeHtml(
    targetLabel
  )} reps</div>
        ${setNota ? `<div class="exec-nota-serie">⚠ ${escapeHtml(setNota)}</div>` : ""}
        <div class="exec-prev">${escapeHtml(sugLabel)}</div>
        <div class="exec-controls">
          <button class="big-num" id="ex-weight">
            <div class="bn-val" id="exw">${sugW != null ? sugW : "—"}</div>
            <div class="bn-lab">peso kg</div>
          </button>
          <button class="big-check" id="ex-check" aria-label="Conferma">${iconSvg(
            "check"
          )}</button>
          <button class="big-num" id="ex-reps">
            <div class="bn-val" id="exr">${sugR != null ? sugR : "—"}</div>
            <div class="bn-lab">reps</div>
          </button>
        </div>
        ${prevHtml ? `<div class="exec-prevline">${prevHtml}</div>` : ""}
      </div>

      <div class="exec-secondary">
        <button class="exec-add-warmup" id="ex-add-warmup">+ avvicinamento</button>
        <button class="exec-note-btn ${notaPers ? "has-note" : ""}" id="ex-note">${iconSvg("edit")} Nota</button>
        <button class="exec-skip" id="ex-skip">Salta serie</button>
      </div>

      <button class="exec-skip-block" id="ex-skip-block" type="button">❎ Salta esercizio</button>
    </div>
  `;

  startSessionTimer();
  document.getElementById("ex-end").onclick = confirmEnd;
  document.getElementById("ex-discard").onclick = confirmDiscard;
  document.getElementById("ex-overview").onclick = openOverview;
  document.getElementById("ex-add-warmup").onclick = addWarmupSet;
  document.getElementById("ex-note").onclick = () => openNoteEditor(ex.bi);
  document.getElementById("ex-weight").onclick = () =>
    openNum("weight", parseFloat(document.getElementById("exw").textContent) || 0);
  document.getElementById("ex-reps").onclick = () =>
    openNum("reps", parseInt(document.getElementById("exr").textContent, 10) || targetNum);
  document.getElementById("ex-check").onclick = confirmSet;
  document.getElementById("ex-skip").onclick = skipSet;
  document.getElementById("ex-skip-block").onclick = skipBlock;
}

/* ---------- nota personale per esercizio (persistente sul catalogo) ---------- */

/** id catalogo (senza "ex:") da un exerciseRef. */
function _exId(ref) {
  return String(ref || "").replace(/^ex:/, "");
}

/** Voce catalogo di un esercizio (da EXERCISES_CATALOG). */
function _catEntry(ref) {
  const id = _exId(ref);
  const cat = typeof EXERCISES_CATALOG !== "undefined" ? EXERCISES_CATALOG : [];
  return cat.find((e) => String(e.id) === id) || null;
}

/** Nota personale persistente dell'esercizio (promemoria), o "" se assente. */
function exerciseNotaPersonale(ref) {
  const e = _catEntry(ref);
  return (e && (e.notaPersonale || "")).trim();
}

/**
 * Editor della NOTA PERSONALE dell'esercizio corrente (bi).
 * Persistente sul catalogo: riappare in alto ogni volta che rifai l'esercizio.
 * Mostra la nota attuale (con X per cancellarla) + textarea per scrivere/modificare.
 */
function openNoteEditor(bi) {
  const b = ex.blocks[bi];
  const exo = curExerciseOfBlock(b);
  const cur = exerciseNotaPersonale(exo.ref);

  let m = document.getElementById("note-modal");
  if (!m) {
    m = document.createElement("div");
    m.id = "note-modal";
    m.className = "dlg";
    document.body.appendChild(m);
    m.addEventListener("click", (e) => {
      if (e.target === m) m.classList.remove("show");
    });
  }
  m.innerHTML = `
    <div class="dlg-box dlg-wide">
      <div class="dlg-title">Nota personale</div>
      <div class="dlg-msg">Promemoria per ${escapeHtml(exo.name)}: riappare ogni volta che rifai l'esercizio (es. "dolore spalla, abbassa peso").</div>
      ${
        cur
          ? `<div class="note-current" id="note-current">
              <span class="note-current-txt">${escapeHtml(cur)}</span>
              <button class="note-current-del" id="note-del" title="Cancella nota">✕</button>
            </div>`
          : ""
      }
      <textarea class="import-textarea note-textarea" id="note-text" placeholder="Scrivi la nota…">${escapeHtml(cur)}</textarea>
      <div class="dlg-actions dlg-actions-top">
        <button class="dlg-btn dlg-btn-cancel" id="note-cancel">Annulla</button>
        <button class="dlg-btn dlg-btn-ok" id="note-ok">Salva</button>
      </div>
    </div>`;
  m.classList.add("show");

  const save = async (nota) => {
    const id = _exId(exo.ref);
    try {
      await apiPost("lift_save_exercise_note", { exerciseId: id, nota: nota });
      // aggiorno la copia in memoria così la nota appare/sparisce subito (no reload)
      const e = _catEntry(exo.ref);
      if (e) e.notaPersonale = nota;
      apiInvalidate("lift_get_data"); // il bootstrap rileggerà il catalogo aggiornato
      m.classList.remove("show");
      renderExec();
    } catch (err) {
      liftAlert("Errore salvataggio nota: " + (err.message || err));
    }
  };

  m.querySelector("#note-cancel").onclick = () => m.classList.remove("show");
  m.querySelector("#note-ok").onclick = () =>
    save(m.querySelector("#note-text").value.trim());
  const del = m.querySelector("#note-del");
  if (del) del.onclick = () => save(""); // X = cancella la nota
}

/* ---------- warm-up al volo (#5) ---------- */

/**
 * Aggiunge una serie di avvicinamento PRIMA della serie corrente, sul blocco
 * corrente. Le extra vivono in b._extraSets (in testa ai set della settimana).
 */
function addWarmupSet() {
  const b = curBlock();
  if (!b._extraSets) b._extraSets = [];
  b._extraSets.push({ reps: "", type: "warmup" });
  // la nuova warm-up si inserisce nella posizione corrente; resto sulla stessa
  // posizione così l'utente compila prima l'avvicinamento appena creato.
  persist();
  renderExec();
}

/* ---------- vista blocco COMPLETATO (entri in un esercizio già fatto) ---------- */

function renderExecCompleted(b) {
  const root = document.getElementById("screen-exec");
  const exo = curExerciseOfBlock(b);
  const weekTag = ex.weeks
    ? `<span class="ep-week">Settimana ${ex.currentWeek}/${ex.weeks}</span>`
    : "";
  const doneSum = doneSummaryForBlock(ex.bi);
  const nextInc = firstIncompleteBlock(ex.bi);
  const nextName =
    nextInc >= 0 && nextInc !== ex.bi ? ex.blocks[nextInc].exerciseName : "";

  root.innerHTML = `
    <div class="exec-header">
      <div>
        <div class="eh-name">${escapeHtml(ex.templateName)}</div>
        <div class="eh-timer" id="eh-timer">00:00:00</div>
      </div>
      <div class="exec-header-actions">
        <button class="eh-overview" id="ex-overview" title="Panoramica scheda">${iconSvg("list")}</button>
        <button class="eh-discard" id="ex-discard" title="Scarta sessione">✕</button>
        <button class="eh-end" id="ex-end">TERMINA</button>
      </div>
    </div>
    <div class="exec-body">
      <div class="exec-top">
        <div class="exec-progress">Esercizio ${ex.bi + 1} / ${ex.blocks.length} ${weekTag}</div>
        <div class="exec-exname">${escapeHtml(exo.name)}</div>
      </div>

      <div class="exec-focus">
        <div class="done-badge">${iconSvg("check")} Completato</div>
        ${doneSum ? `<div class="done-recap">${escapeHtml(doneSum)}</div>` : ""}
        <button class="dur-timer-btn" id="ex-add-series">+ Aggiungi serie</button>
      </div>

      <div class="exec-secondary">
        ${
          nextName
            ? `<button class="exec-skip exec-goto-next" id="ex-goto-next">Vai a ${escapeHtml(nextName)} →</button>`
            : `<span class="exec-alldone">Tutti gli esercizi completati · premi TERMINA</span>`
        }
      </div>
    </div>
  `;

  startSessionTimer();
  document.getElementById("ex-end").onclick = confirmEnd;
  document.getElementById("ex-discard").onclick = confirmDiscard;
  document.getElementById("ex-overview").onclick = openOverview;
  document.getElementById("ex-add-series").onclick = () => {
    // aggiunge UNA serie extra (di lavoro) a questo blocco e ci entra
    if (!b._extraSets) b._extraSets = [];
    b._extraSets.push({ reps: "", type: "work" });
    ex.si = totalSetsOfBlock(b) - 1; // la nuova serie
    persist();
    renderExec();
  };
  const gotoBtn = document.getElementById("ex-goto-next");
  if (gotoBtn) gotoBtn.onclick = () => jumpToBlock(nextInc);
}

/* ---------- esercizio a DURATA (cardio a tempo) ---------- */

function renderExecDuration(b) {
  const root = document.getElementById("screen-exec");
  const exo = curExerciseOfBlock(b);
  const d = durationForBlock(b);
  const weekTag = ex.weeks
    ? `<span class="ep-week">Settimana ${ex.currentWeek}/${ex.weeks}</span>`
    : "";
  const note = (b.note || b.noteDefault || "").trim();
  const notaPers = exerciseNotaPersonale(exo.ref);

  root.innerHTML = `
    <div class="exec-header">
      <div>
        <div class="eh-name">${escapeHtml(ex.templateName)}</div>
        <div class="eh-timer" id="eh-timer">00:00:00</div>
      </div>
      <div class="exec-header-actions">
        <button class="eh-overview" id="ex-overview" title="Panoramica scheda">${iconSvg(
          "list"
        )}</button>
        <button class="eh-discard" id="ex-discard" title="Scarta sessione">✕</button>
        <button class="eh-end" id="ex-end">TERMINA</button>
      </div>
    </div>
    <div class="exec-body">
      <div class="exec-top">
        <div class="exec-progress">Esercizio ${ex.bi + 1} / ${
    ex.blocks.length
  } ${weekTag}</div>
        <div class="exec-exname">${escapeHtml(exo.name)}</div>
        ${note ? `<div class="exec-note">${escapeHtml(note)}</div>` : ""}
        ${notaPers ? `<div class="exec-nota-personale">${iconSvg("edit")} ${escapeHtml(notaPers)}</div>` : ""}
      </div>

      <div class="exec-focus">
        <div class="dur-target">Da scheda: ${d.durataMin} min${
    d.parametri ? " · " + escapeHtml(d.parametri) : ""
  }</div>
        <div class="dur-input-row">
          <button class="dur-step" id="dur-minus" aria-label="Meno">−</button>
          <div class="dur-value">
            <span id="dur-min">${d.durataMin}</span>
            <span class="dur-unit">min</span>
          </div>
          <button class="dur-step" id="dur-plus" aria-label="Più">+</button>
        </div>
        <button class="big-check dur-confirm" id="ex-dur-done" aria-label="Conferma">${iconSvg("check")}</button>
      </div>

      <div class="exec-secondary">
        <button class="exec-skip" id="ex-skip">Salta esercizio</button>
      </div>
    </div>
  `;

  startSessionTimer();
  document.getElementById("ex-end").onclick = confirmEnd;
  document.getElementById("ex-discard").onclick = confirmDiscard;
  document.getElementById("ex-overview").onclick = openOverview;
  // minuti reali: +/- (min 1). Il valore parte da quello di scheda.
  const minEl = document.getElementById("dur-min");
  const stepMin = (delta) => {
    const cur = parseInt(minEl.textContent, 10) || 0;
    minEl.textContent = Math.max(1, cur + delta);
  };
  document.getElementById("dur-minus").onclick = () => stepMin(-1);
  document.getElementById("dur-plus").onclick = () => stepMin(1);
  document.getElementById("ex-dur-done").onclick = () =>
    confirmDuration(parseInt(minEl.textContent, 10) || d.durataMin);
  document.getElementById("ex-skip").onclick = skipDuration;
}

/** Registra il cardio con i minuti REALI fatti (default: quelli di scheda). */
function confirmDuration(minutiFatti) {
  const b = curBlock();
  const exo = curExerciseOfBlock(b);
  const d = durationForBlock(b);
  const min = minutiFatti != null ? minutiFatti : d.durataMin;
  ex.done.push({
    exerciseRef: exo.ref,
    exerciseName: exo.name,
    muscleGroup: exo.muscle,
    type: "duration",
    durataMin: min,
    parametri: d.parametri,
    weight: null,
    reps: null,
    note: "",
    bi: ex.bi,
    si: 0,
    week: ex.currentWeek || 1,
  });
  persist();
  showUndo();
  // un esercizio durata = un blocco intero. Vado al prossimo NON completato
  // (recupera eventuali saltati), niente bi++ cieco né chiusura automatica.
  _advanceToNextIncomplete();
}

function skipDuration() {
  // "Salta esercizio" del cardio: stesso comportamento del tasto generale
  // (marca _skippedBlock + conferma), così non rende incompleto l'allenamento.
  skipBlock();
}

/** Sposta il puntatore al primo blocco non completato (da `from`, default bi+1). */
function _advanceToNextIncomplete(from) {
  const start = from != null ? from : ex.bi + 1;
  const nextInc = firstIncompleteBlock(Math.min(start, ex.blocks.length));
  if (nextInc >= 0) {
    ex.bi = nextInc;
    ex.si = 0;
  } else {
    ex.bi = Math.min(ex.bi, ex.blocks.length - 1);
    ex.si = totalSetsOfBlock(curBlock());
  }
  persist();
  renderExec();
}

/* ---------- vista SOLO REPS (esercizi a corpo libero / "max") ---------- */

/** true se il blocco è a corpo libero o con target "max" (niente peso da inserire). */
function isBodyweightBlock(b) {
  if (!b || isDurationBlock(b)) return false;
  if (/corpo\s*libero/i.test(String(b.attrezzo || ""))) return true;
  // tutte le serie della settimana con target "max" → esercizio a cedimento a corpo libero
  const sets = setsForBlock(b);
  return sets.length > 0 && sets.every((s) => String(s.reps).toLowerCase() === "max");
}

function renderExecReps(b) {
  const root = document.getElementById("screen-exec");
  const exo = curExerciseOfBlock(b);
  const totSets = totalSetsOfBlock(b);
  const set = curSet();
  const weekTag = ex.weeks
    ? `<span class="ep-week">Settimana ${ex.currentWeek}/${ex.weeks}</span>`
    : "";
  const partners = supersetPartners(b);
  const ssTag = b.supersetGroup
    ? `<div class="exec-superset">Superset ${escapeHtml(b.supersetGroup)}${
        partners.length ? " · con " + partners.map((p) => escapeHtml(p.exerciseName)).join(", ") : ""
      }</div>`
    : "";
  const note = (b.note || b.noteDefault || "").trim();
  const notaPers = exerciseNotaPersonale(exo.ref);
  const setNota = (set.nota || "").trim();
  const targetTxt = String(set.reps).toLowerCase() === "max" ? "max" : escapeHtml(String(set.reps));
  // valore di partenza: reps della serie corrispondente dell'ultima volta, o vuoto
  const prev = prevSessionSet(exo.ref, ex.si);
  const startReps = prev && prev.reps != null ? prev.reps : "";

  root.innerHTML = `
    <div class="exec-header">
      <div>
        <div class="eh-name">${escapeHtml(ex.templateName)}</div>
        <div class="eh-timer" id="eh-timer">00:00:00</div>
      </div>
      <div class="exec-header-actions">
        <button class="eh-overview" id="ex-overview" title="Panoramica scheda">${iconSvg("list")}</button>
        <button class="eh-discard" id="ex-discard" title="Scarta sessione">✕</button>
        <button class="eh-end" id="ex-end">TERMINA</button>
      </div>
    </div>
    <div class="exec-body">
      <div class="exec-top">
        <div class="exec-progress">Esercizio ${ex.bi + 1} / ${ex.blocks.length} ${weekTag}</div>
        ${ssTag}
        <div class="exec-exname">${escapeHtml(exo.name)}</div>
        ${note ? `<div class="exec-note">${escapeHtml(note)}</div>` : ""}
        ${notaPers ? `<div class="exec-nota-personale">${iconSvg("edit")} ${escapeHtml(notaPers)}</div>` : ""}
      </div>

      <div class="exec-focus">
        <div class="exec-set-nav">Serie ${ex.si + 1} / ${totSets} · obiettivo ${targetTxt} reps</div>
        ${setNota ? `<div class="exec-nota-serie">⚠ ${escapeHtml(setNota)}</div>` : ""}
        <div class="dur-input-row">
          <button class="dur-step" id="reps-minus" aria-label="Meno">−</button>
          <div class="dur-value">
            <span id="reps-val">${startReps !== "" ? startReps : 0}</span>
            <span class="dur-unit">reps</span>
          </div>
          <button class="dur-step" id="reps-plus" aria-label="Più">+</button>
        </div>
        <button class="big-check dur-confirm" id="ex-reps-done" aria-label="Conferma">${iconSvg("check")}</button>
      </div>

      <div class="exec-secondary">
        <button class="exec-note-btn ${notaPers ? "has-note" : ""}" id="ex-note">${iconSvg("edit")} Nota</button>
        <button class="exec-skip" id="ex-skip">Salta serie</button>
      </div>

      <button class="exec-skip-block" id="ex-skip-block" type="button">❎ Salta esercizio</button>
    </div>
  `;

  startSessionTimer();
  document.getElementById("ex-end").onclick = confirmEnd;
  document.getElementById("ex-discard").onclick = confirmDiscard;
  document.getElementById("ex-overview").onclick = openOverview;
  document.getElementById("ex-note").onclick = () => openNoteEditor(ex.bi);
  const rv = document.getElementById("reps-val");
  const stepR = (d) => (rv.textContent = Math.max(0, (parseInt(rv.textContent, 10) || 0) + d));
  document.getElementById("reps-minus").onclick = () => stepR(-1);
  document.getElementById("reps-plus").onclick = () => stepR(1);
  document.getElementById("ex-reps-done").onclick = () =>
    confirmReps(parseInt(rv.textContent, 10) || 0);
  document.getElementById("ex-skip").onclick = skipSet;
  document.getElementById("ex-skip-block").onclick = skipBlock;
}

/** Registra una serie a corpo libero (solo reps, peso 0). */
function confirmReps(reps) {
  const b = curBlock();
  const exo = curExerciseOfBlock(b);
  const set = curSet();
  ex.done.push({
    exerciseRef: exo.ref,
    exerciseName: exo.name,
    muscleGroup: exo.muscle,
    type: set.type || "work",
    weight: 0,
    reps: reps,
    targetReps: set.reps,
    note: "",
    bi: ex.bi,
    si: ex.si,
    week: ex.currentWeek || 1,
  });
  persist();
  showUndo();
  advance();
}

/* ---------- panoramica scheda + salto rapido (#tendina) ---------- */

/** Quante serie risultano già registrate (done/skipped) per un blocco. */
function doneCountForBlock(bi) {
  return ex.done.filter((d) => d.bi === bi).length;
}

/** Riepilogo target della settimana per un blocco: "4×6", "3×8-12", "12 min". */
function targetSummaryForBlock(b) {
  if (isDurationBlock(b)) {
    const d = durationForBlock(b);
    return d.durataMin + " min" + (d.parametri ? " · " + d.parametri : "");
  }
  const sets = setsForBlock(b).filter((s) => s.type !== "warmup");
  if (!sets.length) return "";
  // raggruppa reps uguali consecutive
  const groups = [];
  sets.forEach((s) => {
    const key = String(s.reps) + (s.type && s.type !== "work" ? " " + s.type : "");
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.n++;
    else groups.push({ key, n: 1, reps: s.reps, type: s.type });
  });
  return groups
    .map((g) => `${g.n}×${g.reps}${g.type && g.type !== "work" ? " " + g.type : ""}`)
    .join("  ");
}

/** Cosa è stato fatto oggi su un blocco: "45×6 · 45×6" (o "12 min" per cardio). */
function doneSummaryForBlock(bi) {
  const dn = ex.done.filter((d) => d.bi === bi && d.type !== "skipped");
  if (!dn.length) return "";
  return dn
    .map((d) => {
      if (d.type === "duration") return (d.durataMin || "?") + " min";
      const w = d.weight != null ? d.weight : "?";
      const r = d.reps != null ? d.reps : "?";
      return w + "×" + r;
    })
    .join(" · ");
}

function openOverview() {
  let o = document.getElementById("ov-modal");
  if (!o) {
    o = document.createElement("div");
    o.id = "ov-modal";
    o.className = "ov-modal";
    document.body.appendChild(o);
    o.addEventListener("click", (e) => {
      if (e.target === o) o.classList.remove("open");
    });
  }

  const weekTag = ex.weeks ? ` · Settimana ${ex.currentWeek}/${ex.weeks}` : "";
  const items = ex.blocks
    .map((b, bi) => {
      const sets = setsForBlock(b);
      const done = doneCountForBlock(bi);
      const isCur = bi === ex.bi;
      // blocco fatto in una sessione PRECEDENTE di questa settimana (ripresa)
      const resumed = (ex.resumedDoneBlocks || []).indexOf(bi) >= 0;
      // pallini basati sui DONE REALI (non sulla posizione): un blocco saltato
      // avanti NON deve apparire fatto.
      const doneCount = ex.done.filter((d) => d.bi === bi && d.type !== "skipped").length;
      const dots = sets
        .map((s, si) => {
          const cls =
            resumed || si < doneCount
              ? "ov-dot-done"
              : isCur && si === ex.si
              ? "ov-dot-cur"
              : "ov-dot-todo";
          const wu = s.type === "warmup" ? " ov-dot-warmup" : "";
          return `<span class="ov-dot ${cls}${wu}"></span>`;
        })
        .join("");
      const ss = b.supersetGroup
        ? `<span class="ov-ss">SS ${escapeHtml(b.supersetGroup)}</span>`
        : "";
      const skipped = isBlockSkipped(bi);
      const resumedTag = resumed
        ? `<span class="ov-resumed">fatto</span>`
        : skipped
        ? `<span class="ov-skipped">saltato</span>`
        : "";
      const target = targetSummaryForBlock(b);
      const doneSum = doneSummaryForBlock(bi);
      return `
        <button class="ov-item ${isCur ? "ov-item-cur" : ""}" data-bi="${bi}">
          <div class="ov-item-main">
            <div class="ov-item-name">${escapeHtml(b.exerciseName)} ${ss}${resumedTag}</div>
            ${target ? `<div class="ov-item-target">${escapeHtml(target)}</div>` : ""}
            ${doneSum ? `<div class="ov-item-done">✓ ${escapeHtml(doneSum)}</div>` : ""}
            <div class="ov-item-dots">${dots}</div>
          </div>
          <div class="ov-item-meta">${resumed ? "✓" : skipped ? "❎" : done + "/" + sets.length}</div>
        </button>`;
    })
    .join("");

  o.innerHTML = `
    <div class="ov-sheet">
      <div class="ov-head">
        <div class="ov-title">${escapeHtml(ex.templateName)}<span class="ov-sub">${weekTag}</span></div>
        <button class="ov-close" id="ov-close">✕</button>
      </div>
      <div class="ov-list">${items}</div>
      <button class="ov-add" id="ov-add">+ Aggiungi esercizio</button>
    </div>`;

  o.querySelector("#ov-close").onclick = () => o.classList.remove("open");
  o.querySelectorAll(".ov-item").forEach((it) => {
    it.onclick = () => {
      const bi = parseInt(it.dataset.bi, 10);
      jumpToBlock(bi);
      o.classList.remove("open");
    };
  });
  o.querySelector("#ov-add").onclick = () => {
    o.classList.remove("open");
    openAddExercise();
  };
  o.classList.add("open");
}

/**
 * Aggiunge al volo un esercizio alla sessione corrente (non permanente),
 * scegliendolo dal catalogo. Utile per recuperare esercizi di un altro workout.
 */
function openAddExercise() {
  const catalog = typeof EXERCISES_CATALOG !== "undefined" ? EXERCISES_CATALOG : [];
  let m = document.getElementById("addex-modal");
  if (!m) {
    m = document.createElement("div");
    m.id = "addex-modal";
    m.className = "ov-modal";
    document.body.appendChild(m);
    m.addEventListener("click", (e) => {
      if (e.target === m) m.classList.remove("open");
    });
  }
  const itemsHtml = catalog
    .map(
      (e) => `
      <button class="addex-item" data-id="${escapeHtml(e.id)}">
        <span class="addex-name">${escapeHtml(e.nome)}</span>
        <span class="addex-meta">${escapeHtml(e.gruppo || "")}</span>
      </button>`
    )
    .join("");
  m.innerHTML = `
    <div class="ov-sheet">
      <div class="ov-head">
        <div class="ov-title" style="font-size:1.3rem">Aggiungi esercizio</div>
        <button class="ov-close" id="addex-close">✕</button>
      </div>
      <input class="addex-search" id="addex-search" placeholder="Cerca…" />
      <div class="ov-list" id="addex-list">${itemsHtml || '<div class="empty-state">Catalogo vuoto</div>'}</div>
    </div>`;
  const wire = () => {
    m.querySelectorAll(".addex-item").forEach((it) => {
      it.onclick = () => {
        const exo = catalog.find((x) => x.id === it.dataset.id);
        if (exo) _appendExerciseToSession(exo);
        m.classList.remove("open");
      };
    });
  };
  wire();
  m.querySelector("#addex-close").onclick = () => m.classList.remove("open");
  m.querySelector("#addex-search").oninput = (e) => {
    const q = e.target.value.trim().toLowerCase();
    const filtered = catalog.filter((x) => x.nome.toLowerCase().includes(q));
    document.getElementById("addex-list").innerHTML = filtered.length
      ? filtered
          .map(
            (x) => `<button class="addex-item" data-id="${escapeHtml(x.id)}">
              <span class="addex-name">${escapeHtml(x.nome)}</span>
              <span class="addex-meta">${escapeHtml(x.gruppo || "")}</span></button>`
          )
          .join("")
      : '<div class="empty-state">Nessun esercizio</div>';
    wire();
  };
  m.classList.add("open");
}

/** Aggiunge un blocco esercizio (3 serie libere) in coda alla sessione e ci salta. */
function _appendExerciseToSession(exo) {
  ex.blocks.push({
    exerciseRef: "ex:" + exo.id,
    exerciseName: exo.nome,
    muscle: exo.gruppo || "",
    note: "",
    rest: "1'30\"",
    supersetGroup: null,
    // 3 serie senza target (le riempi tu); valido per tutte le settimane
    perWeek: Array.from({ length: ex.weeks || 1 }, () => ({
      sets: [{ reps: "", type: "work" }, { reps: "", type: "work" }, { reps: "", type: "work" }],
    })),
    _added: true,
  });
  ex.bi = ex.blocks.length - 1;
  ex.si = 0;
  persist();
  renderExec();
}

/**
 * Un blocco è COMPLETATO se ha registrato tutte le sue serie di lavoro
 * (done non-skipped >= n. serie previste), oppure è tra i blocchi ripresi da
 * una sessione precedente della stessa settimana.
 */
/** Conteggi delle serie done per un blocco: { ok, skipped }. */
function _blockDoneCounts(bi) {
  let ok = 0, skipped = 0;
  ex.done.forEach((d) => {
    if (d.bi !== bi) return;
    if (d.type === "skipped") skipped++;
    else ok++;
  });
  return { ok, skipped };
}

/** Il blocco ha almeno una serie EFFETTIVAMENTE fatta (non-skipped). */
function isBlockDone(bi) {
  return _blockDoneCounts(bi).ok > 0;
}

/**
 * Il blocco è SALTATO di proposito: tasto "salta esercizio" (_skippedBlock),
 * oppure tutte le serie previste sono state saltate (nessuna fatta).
 */
function isBlockSkipped(bi) {
  const b = ex.blocks[bi];
  if (!b) return false;
  if (b._skippedBlock) return true;
  const needed = totalSetsOfBlock(b);
  const c = _blockDoneCounts(bi);
  return needed > 0 && c.ok === 0 && c.skipped >= needed;
}

/**
 * Blocco "gestito" = non più da fare: ripreso da sessione precedente, saltato
 * di proposito, oppure ogni serie prevista ha un esito (fatta o saltata).
 */
function isBlockComplete(bi) {
  if ((ex.resumedDoneBlocks || []).indexOf(bi) >= 0) return true;
  const b = ex.blocks[bi];
  if (!b) return false;
  if (b._skippedBlock) return true;
  const needed = totalSetsOfBlock(b);
  const c = _blockDoneCounts(bi);
  return c.ok + c.skipped >= needed;
}

/**
 * Trova il primo blocco NON completato: prima a valle di `fromBi`, poi (per
 * recuperare i saltati) dall'inizio. Ritorna -1 se sono tutti completati.
 */
function firstIncompleteBlock(fromBi) {
  for (let i = fromBi; i < ex.blocks.length; i++) {
    if (!isBlockComplete(i)) return i;
  }
  for (let i = 0; i < fromBi; i++) {
    if (!isBlockComplete(i)) return i;
  }
  return -1;
}

/** Salta a un esercizio dalla lista. Se è già completato, mostra la vista
 *  "completato" (niente serie vuota); altrimenti parte dalla prima serie. */
function jumpToBlock(bi) {
  if (bi < 0 || bi >= ex.blocks.length) return;
  ex.bi = bi;
  ex.si = isBlockComplete(bi) ? totalSetsOfBlock(ex.blocks[bi]) : 0;
  persist();
  closeRest();
  renderExec();
}

/* ---------- timer sessione (timestamp based) ---------- */

let sessTick = null;
function startSessionTimer() {
  clearInterval(sessTick);
  const tick = () => {
    const el = document.getElementById("eh-timer");
    if (!el || !ex) return;
    const s = Math.floor((Date.now() - new Date(ex.startedAt)) / 1000);
    const h = String(Math.floor(s / 3600)).padStart(2, "0");
    const m = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
    const sec = String(s % 60).padStart(2, "0");
    el.textContent = `${h}:${m}:${sec}`;
  };
  tick();
  sessTick = setInterval(tick, 1000);
}

/* ---------- modale numerica ---------- */

let numCtx = null;
function openNum(kind, current) {
  numCtx = { kind: kind, value: current };
  let m = document.getElementById("num-modal");
  if (!m) {
    m = document.createElement("div");
    m.id = "num-modal";
    m.className = "num-modal";
    m.innerHTML = `
      <div class="num-sheet">
        <div class="num-sheet-label" id="num-label">Peso (kg)</div>
        <div class="num-display">
          <button class="num-step" id="num-minus">−</button>
          <input id="num-input" readonly inputmode="decimal" />
          <button class="num-step" id="num-plus">+</button>
        </div>
        <div class="num-chips" id="num-chips"></div>
        <button class="num-confirm" id="num-ok">Conferma</button>
      </div>`;
    document.body.appendChild(m);
    m.addEventListener("click", (e) => {
      if (e.target === m) m.classList.remove("open");
    });
  }
  const label = m.querySelector("#num-label");
  if (label) label.textContent = kind === "weight" ? "Peso (kg)" : "Ripetizioni";
  const input = m.querySelector("#num-input");
  input.value = current || "";
  // PESO: chip che AGGIUNGONO (+incremento). REPS: chip PRESET che impostano il valore.
  const chips =
    kind === "weight"
      ? [1.25, 2.5, 5, 10, 15, 20]
      : [6, 8, 10, 12, 15, 20];
  const isPresetChips = kind !== "weight"; // reps = preset diretti
  m.querySelector("#num-chips").innerHTML = chips
    .map(
      (c) =>
        `<button class="num-chip" data-c="${c}">${
          isPresetChips ? _fmtNum(c) : "+" + _fmtNum(c)
        }</button>`
    )
    .join("");
  const step = kind === "weight" ? 1 : 1;
  m.querySelector("#num-minus").onclick = () =>
    (input.value = round(num(input.value) - step, kind));
  m.querySelector("#num-plus").onclick = () =>
    (input.value = round(num(input.value) + step, kind));
  m.querySelectorAll(".num-chip").forEach((ch) => {
    ch.onclick = () => {
      const c = parseFloat(ch.dataset.c);
      // reps: il chip IMPOSTA il valore; peso: lo somma
      input.value = isPresetChips ? round(c, kind) : round(num(input.value) + c, kind);
    };
  });
  m.querySelector("#num-ok").onclick = () => {
    const v = round(num(input.value), kind);
    if (kind === "weight") document.getElementById("exw").textContent = v;
    else document.getElementById("exr").textContent = v;
    m.classList.remove("open");
  };
  m.classList.add("open");
}
function num(v) {
  return parseFloat(v) || 0;
}
/** Formatta un numero in stile IT: 1.25 → "1,25", 5 → "5". */
function _fmtNum(n) {
  return String(n).replace(".", ",");
}
function round(v, kind) {
  if (kind === "weight") return Math.max(0, Math.round(v * 4) / 4); // step 0.25
  return Math.max(0, Math.round(v));
}

/* ---------- conferma / skip serie ---------- */

function confirmSet() {
  const b = curBlock();
  const exo = curExerciseOfBlock(b);
  const set = curSet();
  const weight = parseFloat(document.getElementById("exw").textContent) || 0;
  const reps = parseInt(document.getElementById("exr").textContent, 10) || 0;

  ex.done.push({
    exerciseRef: exo.ref,
    exerciseName: exo.name,
    muscleGroup: exo.muscle,
    type: set.type || "work",
    weight: weight,
    reps: reps,
    targetReps: set.reps, // obiettivo di scheda per questa serie (per il feedback AI)
    note: "",
    bi: ex.bi,
    si: ex.si,
    week: ex.currentWeek || 1,
  });
  persist();
  showUndo();
  advance();
}

function skipSet() {
  const b = curBlock();
  const exo = curExerciseOfBlock(b);
  const set = curSet();
  // "Salta serie": registra QUESTA serie come skipped (barrata nello storico)
  // e passa alla successiva. Il totale serie NON si accorcia.
  ex.done.push({
    exerciseRef: exo.ref,
    exerciseName: exo.name,
    muscleGroup: exo.muscle,
    type: "skipped",
    weight: 0,
    reps: 0,
    targetReps: set.reps,
    note: "",
    bi: ex.bi,
    si: ex.si,
    week: ex.currentWeek || 1,
  });
  persist();
  showUndo();
  advance(true);
}

/**
 * Salta l'INTERO esercizio corrente (tasto ❎). Chiede conferma.
 * Marca il blocco come saltato di proposito: NON rende incompleto l'allenamento.
 * In un superset salta solo QUESTO blocco, non tutto il gruppo.
 */
async function skipBlock() {
  const b = curBlock();
  const exo = curExerciseOfBlock(b);
  const ok = await liftConfirm(
    "Saltare tutto l'esercizio " + (exo.name || "") + "? Non conterà come incompleto.",
    { okLabel: "Salta esercizio", danger: true }
  );
  if (!ok) return;

  b._skippedBlock = true;
  // Una riga "skipped" così l'esercizio compare comunque nello storico.
  ex.done.push({
    exerciseRef: exo.ref,
    exerciseName: exo.name,
    muscleGroup: exo.muscle,
    type: "skipped",
    weight: 0,
    reps: 0,
    targetReps: "",
    note: "",
    bi: ex.bi,
    si: 0,
    week: ex.currentWeek || 1,
  });
  persist();
  closeRest();

  // vai al prossimo blocco da fare; se non ce ne sono, resta sull'ultimo (vista completato)
  const next = firstIncompleteBlock(ex.bi);
  if (next >= 0) {
    ex.bi = next;
    ex.si = 0;
  } else {
    ex.bi = Math.min(ex.bi, ex.blocks.length - 1);
    ex.si = totalSetsOfBlock(curBlock());
  }
  persist();
  renderExec();
}

/**
 * Indici dei blocchi che formano il gruppo superset del blocco `bi`
 * (blocchi CONSECUTIVI con lo stesso supersetGroup non nullo).
 * Se il blocco non è in un superset, ritorna [bi].
 */
function supersetGroupIndices(bi) {
  const g = ex.blocks[bi] && ex.blocks[bi].supersetGroup;
  if (!g) return [bi];
  const idx = [];
  let i = bi;
  while (i >= 0 && ex.blocks[i].supersetGroup === g) i--; // primo del gruppo
  i++;
  while (i < ex.blocks.length && ex.blocks[i].supersetGroup === g) {
    idx.push(i);
    i++;
  }
  return idx;
}

function advance(noRest) {
  const b = curBlock();
  const restSec = restSecondsOf(b);
  const group = supersetGroupIndices(ex.bi);

  if (group.length > 1) {
    // SUPERSET: alterno gli esercizi del gruppo a parità di serie, poi avanzo serie.
    // maxSets = giri totali del superset; un esercizio con meno serie viene saltato
    // nei giri eccedenti.
    const maxSets = Math.max.apply(
      null,
      group.map((gi) => totalSetsOfBlock(ex.blocks[gi]))
    );
    const pos = group.indexOf(ex.bi);
    // cerca il prossimo esercizio del giro corrente che ha ancora questa serie
    let next = -1;
    for (let k = pos + 1; k < group.length; k++) {
      if (ex.si < totalSetsOfBlock(ex.blocks[group[k]])) {
        next = group[k];
        break;
      }
    }
    if (next >= 0) {
      ex.bi = next; // prossimo esercizio, stessa serie
    } else {
      // giro completato: avanzo serie, torno al primo esercizio che ha quella serie
      ex.si++;
      if (ex.si >= maxSets) {
        ex.si = 0;
        ex.bi = group[group.length - 1] + 1; // superset finito
      } else {
        let first = -1;
        for (let k = 0; k < group.length; k++) {
          if (ex.si < totalSetsOfBlock(ex.blocks[group[k]])) {
            first = group[k];
            break;
          }
        }
        ex.bi = first >= 0 ? first : group[group.length - 1] + 1;
        if (first < 0) ex.si = 0;
      }
    }
  } else {
    // BLOCCO SINGOLO: comportamento classico
    const totSets = totalSetsOfBlock(b);
    ex.si++;
    if (ex.si >= totSets) {
      ex.si = 0;
      ex.bi++;
    }
  }

  // NIENTE chiusura automatica: se siamo usciti dai blocchi (o il blocco corrente
  // è già completo), vai al primo esercizio NON completato (recupera i saltati).
  // Se sono tutti completati, resta sull'ultimo blocco: si chiude solo con TERMINA.
  if (ex.bi >= ex.blocks.length || isBlockComplete(ex.bi)) {
    const nextInc = firstIncompleteBlock(
      ex.bi >= ex.blocks.length ? 0 : ex.bi
    );
    if (nextInc >= 0) {
      ex.bi = nextInc;
      ex.si = 0;
    } else {
      // tutto completato: resto sull'ultimo blocco valido con la vista "completato"
      ex.bi = Math.min(ex.bi, ex.blocks.length - 1);
      ex.si = totalSetsOfBlock(curBlock());
    }
  }

  persist();
  // Rest-pause: se la serie a cui stiamo arrivando ha un restBefore (es. 20"
  // prima della MAX), quello sostituisce il rest normale dell'esercizio.
  const destSets = setsForBlock(curBlock());
  const destSet = destSets[ex.si];
  const restBefore = restBeforeOfSet(destSet);
  const effectiveRest = restBefore > 0 ? restBefore : restSec;

  // rest: solo se previsto e non era uno skip
  if (!noRest && effectiveRest > 0) {
    openRest(effectiveRest, {
      hint: nextUpLabel(),
      label: restBefore > 0 ? "Rest-pause" : undefined,
    });
  } else {
    renderExec();
  }
}

/* ---------- undo ---------- */

let undoTimer = null;
function showUndo() {
  let t = document.getElementById("undo-toast");
  if (!t) {
    t = document.createElement("div");
    t.id = "undo-toast";
    t.className = "toast";
    t.innerHTML = `<span>Serie salvata</span><button id="undo-btn">ANNULLA</button>`;
    document.body.appendChild(t);
  }
  t.querySelector("#undo-btn").onclick = () => {
    // rimuovo l'ultimo done e torno ESATTAMENTE su quel blocco/serie (superset-safe).
    const removed = ex.done.pop();
    if (removed) {
      ex.bi = removed.bi != null ? removed.bi : ex.bi;
      ex.si = removed.si != null ? removed.si : ex.si;
    }
    persist();
    t.classList.remove("show");
    closeRest();
    renderExec();
  };
  t.classList.add("show");
  clearTimeout(undoTimer);
  undoTimer = setTimeout(() => t.classList.remove("show"), 4500);
}

/* ---------- rest timer ---------- */

// callback eseguito quando il timer arriva a 0 (usato dal timer cardio)
let _restOnComplete = null;

/**
 * Timer a cerchio. opts: { label, hint, onComplete }.
 * Default = riposo tra serie (label "Riposo"). Per il cardio si passa
 * label "Cardio" e onComplete che registra/avanza.
 */
function openRest(sec, opts) {
  opts = opts || {};
  const label = opts.label || "Riposo";
  const hint = opts.hint || "prossima serie";
  _restOnComplete = opts.onComplete || null;

  ex.restEndsAt = Date.now() + sec * 1000;
  persist();
  // ricreo sempre l'overlay (così label/hint sono corretti per rest vs cardio)
  let o = document.getElementById("rest-ov");
  if (o) o.remove();
  o = document.createElement("div");
  o.id = "rest-ov";
  o.className = "rest-overlay";
  // SVG ring: circumference = 2π * 98 ≈ 615.75
  o.innerHTML = `
      <div class="rest-label">${escapeHtml(label)}</div>
      <div class="rest-circle-wrap">
        <svg class="rest-ring-svg" viewBox="0 0 220 220">
          <circle class="rest-ring-bg" cx="110" cy="110" r="98"/>
          <circle class="rest-ring-fill" id="rest-ring" cx="110" cy="110" r="98"
            stroke-dasharray="615.75" stroke-dashoffset="0"/>
        </svg>
        <div class="rest-circle-inner">
          <div class="rest-time" id="rest-num">0:00</div>
        </div>
      </div>
      <div class="rest-nextup">
        <span class="rest-nextup-lab">Next up</span>
        <span class="rest-nextup-val">${escapeHtml(hint)}</span>
      </div>
      <div class="rest-actions">
        <button class="rest-btn" id="rest-minus">−15s</button>
        <button class="rest-btn rest-skip" id="rest-skip">${
          _restOnComplete ? "FATTO" : "SALTA"
        }</button>
        <button class="rest-btn" id="rest-plus">+15s</button>
      </div>
      <button class="rest-overview-btn" id="rest-overview">${iconSvg("list")} Lista esercizi</button>`;
  document.body.appendChild(o);
  o.querySelector("#rest-overview").onclick = openOverview;
  o.querySelector("#rest-minus").onclick = () => {
    ex.restEndsAt -= 15000;
    persist();
  };
  o.querySelector("#rest-plus").onclick = () => {
    ex.restEndsAt += 15000;
    persist();
  };
  // "SALTA"/"FATTO": se cardio, conta come completato (esegue onComplete); altrimenti chiude
  o.querySelector("#rest-skip").onclick = () => {
    if (_restOnComplete) {
      const cb = _restOnComplete;
      _restOnComplete = null;
      clearInterval(restTick);
      const ov = document.getElementById("rest-ov");
      if (ov) ov.classList.remove("open");
      ex.restEndsAt = null;
      persist();
      cb();
    } else {
      closeRest();
    }
  };

  o.classList.add("open");
  const totalSec = sec;
  clearInterval(restTick);
  const upd = () => {
    const left = Math.round((ex.restEndsAt - Date.now()) / 1000);
    const el = document.getElementById("rest-num");
    const ring = document.getElementById("rest-ring");
    if (left <= 0) {
      if (el) el.textContent = "0:00";
      if (ring) ring.style.strokeDashoffset = "615.75";
      beep();
      const cb = _restOnComplete;
      _restOnComplete = null;
      clearInterval(restTick);
      const ov = document.getElementById("rest-ov");
      if (ov) ov.classList.remove("open");
      ex.restEndsAt = null;
      persist();
      if (cb) cb();
      else renderExec();
      return;
    }
    if (el)
      el.textContent =
        Math.floor(left / 60) + ":" + String(left % 60).padStart(2, "0");
    if (ring) {
      const progress = Math.max(0, Math.min(1, left / totalSec));
      ring.style.strokeDashoffset = String(615.75 * (1 - progress));
    }
  };
  upd();
  restTick = setInterval(upd, 250);
}

function closeRest() {
  clearInterval(restTick);
  _restOnComplete = null;
  const o = document.getElementById("rest-ov");
  if (o) o.classList.remove("open");
  ex.restEndsAt = null;
  persist();
  renderExec();
}

/* AudioContext UNICO, riusato. Su iOS/Android un AudioContext creato fuori da
   un gesto utente parte "suspended" e resta muto: va creato/sbloccato al primo
   tap e riutilizzato. Creare un nuovo context ad ogni beep (come prima) su iOS
   non suona MAI. */
let _audioCtx = null;

/** Crea (una volta) e sblocca l'AudioContext. Da chiamare su un gesto utente. */
function _unlockAudio() {
  try {
    if (!_audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      _audioCtx = new AC();
    }
    if (_audioCtx.state === "suspended") _audioCtx.resume().catch(() => {});
  } catch (e) {}
}

// Sblocca l'audio al PRIMO tap/click ovunque nell'app (una volta sola basta,
// poi il context resta valido per i beep dei timer).
["touchend", "click"].forEach((ev) =>
  document.addEventListener(ev, _unlockAudio, { once: false, passive: true })
);

function beep() {
  try {
    _unlockAudio();
    if (!_audioCtx) return;
    // se ancora sospeso (nessun gesto sbloccante), provo comunque a riprendere
    if (_audioCtx.state === "suspended") _audioCtx.resume().catch(() => {});
    const ctx = _audioCtx;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.frequency.value = 660; // media, non acuta
    g.gain.value = 0.18; // volume soft (cuffie!)
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.25);
    // doppio bip breve per farsi sentire meglio a fine pausa
    const osc2 = ctx.createOscillator();
    const g2 = ctx.createGain();
    osc2.frequency.value = 880;
    g2.gain.value = 0.18;
    osc2.connect(g2);
    g2.connect(ctx.destination);
    osc2.start(ctx.currentTime + 0.3);
    osc2.stop(ctx.currentTime + 0.5);
  } catch (e) {}
}

/* ---------- fine sessione ---------- */

async function confirmEnd() {
  const ok = await liftConfirm(
    "La sessione verra salvata. Vuoi proseguire?",
    { title: "Terminare la sessione?", okLabel: "Termina", danger: true }
  );
  if (ok) openFinish();
}

async function confirmDiscard() {
  const ok = await liftConfirm(
    "La sessione verra eliminata e non salvata. Sicuro?",
    { title: "Scarta sessione?", okLabel: "Scarta", cancelLabel: "Annulla", danger: true }
  );
  if (!ok) return;
  clearInterval(sessTick);
  clearInterval(restTick);
  releaseWakeLock();
  _disarmBackGuard();
  localStorage.removeItem(LS_KEY);
  ex = null;
  apiInvalidate("lift_get_data");
  showScreen("home");
  renderHome();
}

function openFinish() {
  clearInterval(sessTick);
  clearInterval(restTick);
  releaseWakeLock();
  _disarmBackGuard();
  if (typeof renderFinish === "function") {
    renderFinish(ex);
  } else {
    // fallback se finish.js non c'e ancora
    finalizeSession(ex, false).then(() => {
      localStorage.removeItem(LS_KEY);
      showScreen("home");
      renderHome();
    });
  }
}

/* costruisce il payload e chiama il backend */
async function finalizeSession(state, autoTerminated) {
  const exercisesMap = {};
  state.done.forEach((d) => {
    const key = d.bi + "_" + d.exerciseRef;
    if (!exercisesMap[key]) {
      exercisesMap[key] = {
        exerciseRef: d.exerciseRef,
        exerciseName: d.exerciseName, // nome leggibile (per il feedback AI)
        muscleGroup: d.muscleGroup,
        sets: [],
      };
    }
    exercisesMap[key].sets.push({
      type: d.type,
      weight: d.weight,
      reps: d.reps,
      targetReps: d.targetReps != null ? d.targetReps : "", // obiettivo scheda
      note: d.note,
      // esercizi a durata (cardio): minuti + parametri
      durataMin: d.durataMin != null ? d.durataMin : "",
      parametri: d.parametri || "",
    });
  });
  // Stato per blocco: FATTO (>=1 serie non-skipped) o SALTATO (_skippedBlock o
  // tutte le serie skipped). Un blocco è "gestito" se fatto O saltato.
  // completed = ogni blocco è gestito; solo i "da fare" lasciati aperti bloccano.
  const blocks = state.blocks || [];
  const done = state.done || [];
  const counts = {}; // bi -> {ok, skipped}
  done.forEach((d) => {
    if (!counts[d.bi]) counts[d.bi] = { ok: 0, skipped: 0 };
    if (d.type === "skipped") counts[d.bi].skipped++;
    else counts[d.bi].ok++;
  });
  const handledBi = new Set(); // blocchi gestiti (fatti o saltati) → per doneBlocks + completed
  blocks.forEach((b, bi) => {
    const c = counts[bi] || { ok: 0, skipped: 0 };
    const isDone = c.ok > 0;
    const isSkipped = !!(b && b._skippedBlock) || (c.ok === 0 && c.skipped > 0);
    if (isDone || isSkipped) handledBi.add(bi);
  });
  const isCompleted = blocks.length > 0 && handledBi.size >= blocks.length;
  const doneBi = handledBi; // per la ripresa: fatti + saltati (entrambi non da riproporre)

  const payload = {
    templateId: state.templateId,
    templateName: state.templateName,
    startedAt: state.startedAt,
    endedAt: new Date().toISOString(),
    mood: state.mood != null ? state.mood : "",
    energy: state.energy != null ? state.energy : "",
    sessionNotes: state.sessionNotes || "",
    data: { exercises: Object.values(exercisesMap) },
    // contesto programma (per stato settimana + ripresa)
    programId: state.programId || "",
    workoutId: (state.templateId || "").split("/")[1] || "",
    week: state.currentWeek || "",
    completed: isCompleted ? "true" : "false",
    doneBlocks: [...doneBi].join(","), // indici blocchi fatti (per ripresa)
  };
  return apiPost("lift_save_session", payload);
}
