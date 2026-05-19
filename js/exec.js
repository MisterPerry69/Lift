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
    alert("Scheda non trovata");
    return;
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
    bi: 0, // block index
    si: 0, // set index dentro il blocco
    done: [], // {exerciseRef, exerciseName, muscleGroup, type, weight, reps, note}
    lastWeights: {}, // exerciseRef -> ultimo peso usato in questa sessione
  };
  persist();
  acquireWakeLock();
  showScreen("exec");
  renderExec();
}

function resumeSessionIfAny() {
  const raw = localStorage.getItem(LS_KEY);
  if (!raw) return false;
  try {
    const saved = JSON.parse(raw);
    const hrs = (Date.now() - saved.lastInteractionAt) / 3600000;
    if (hrs >= 4) {
      // auto-terminata: la salvo e pulisco
      finalizeSession(saved, true);
      localStorage.removeItem(LS_KEY);
      return false;
    }
    ex = saved;
    acquireWakeLock();
    showScreen("exec");
    renderExec();
    return true;
  } catch (e) {
    localStorage.removeItem(LS_KEY);
    return false;
  }
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
function totalSetsOfBlock(b) {
  return (b.sets || []).length || 1;
}

/* ---------- render ---------- */

function renderExec() {
  const root = document.getElementById("screen-exec");
  if (ex.bi >= ex.blocks.length) {
    return openFinish();
  }
  const b = curBlock();
  const exo = curExerciseOfBlock(b);
  const totSets = totalSetsOfBlock(b);
  const lastW = ex.lastWeights[exo.ref];
  const targetReps = (b.sets && b.sets[ex.si] && b.sets[ex.si].targetReps) || 8;

  root.innerHTML = `
    <div class="exec-header">
      <div>
        <div class="eh-name">${escapeHtml(ex.templateName)}</div>
        <div class="eh-timer" id="eh-timer">00:00:00</div>
      </div>
      <button class="eh-end" id="ex-end">TERMINA</button>
    </div>
    <div class="exec-body">
      <div class="exec-progress">Esercizio ${ex.bi + 1} / ${
    ex.blocks.length
  }</div>
      <div class="exec-exname">${escapeHtml(exo.name)}</div>
      <div class="exec-prev">${
        lastW ? "Ultimo: " + lastW + " kg" : "Primo set di questo esercizio"
      }</div>
      <div class="exec-set-nav">Serie ${ex.si + 1} / ${totSets} · obiettivo ${targetReps} reps</div>
      <div class="exec-controls">
        <button class="big-num" id="ex-weight">
          <div class="bn-val" id="exw">${lastW || "—"}</div>
          <div class="bn-lab">peso kg</div>
        </button>
        <button class="big-check" id="ex-check" aria-label="Conferma">${iconSvg(
          "check"
        )}</button>
        <button class="big-num" id="ex-reps">
          <div class="bn-val" id="exr">${targetReps}</div>
          <div class="bn-lab">reps</div>
        </button>
      </div>
      <div class="exec-secondary">
        <button class="exec-skip" id="ex-skip">Salta serie</button>
      </div>
    </div>
  `;

  startSessionTimer();
  document.getElementById("ex-end").onclick = confirmEnd;
  document.getElementById("ex-weight").onclick = () =>
    openNum("weight", parseFloat(document.getElementById("exw").textContent) || 0);
  document.getElementById("ex-reps").onclick = () =>
    openNum("reps", parseInt(document.getElementById("exr").textContent, 10) || targetReps);
  document.getElementById("ex-check").onclick = confirmSet;
  document.getElementById("ex-skip").onclick = skipSet;
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
        <div class="num-display">
          <button class="num-step" id="num-minus">−</button>
          <input id="num-input" inputmode="decimal" />
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
  const input = m.querySelector("#num-input");
  input.value = current || "";
  const chips =
    kind === "weight"
      ? [0.25, 0.5, 1, 5, 10, 15, 20]
      : [1, 2, 3, 5];
  m.querySelector("#num-chips").innerHTML = chips
    .map((c) => `<button class="num-chip" data-c="${c}">+${c}</button>`)
    .join("");
  const step = kind === "weight" ? 1 : 1;
  m.querySelector("#num-minus").onclick = () =>
    (input.value = round(num(input.value) - step, kind));
  m.querySelector("#num-plus").onclick = () =>
    (input.value = round(num(input.value) + step, kind));
  m.querySelectorAll(".num-chip").forEach((ch) => {
    ch.onclick = () =>
      (input.value = round(num(input.value) + parseFloat(ch.dataset.c), kind));
  });
  m.querySelector("#num-ok").onclick = () => {
    const v = round(num(input.value), kind);
    if (kind === "weight") document.getElementById("exw").textContent = v;
    else document.getElementById("exr").textContent = v;
    m.classList.remove("open");
  };
  m.classList.add("open");
  setTimeout(() => {
    input.focus();
    input.select();
  }, 80);
}
function num(v) {
  return parseFloat(v) || 0;
}
function round(v, kind) {
  if (kind === "weight") return Math.max(0, Math.round(v * 4) / 4); // step 0.25
  return Math.max(0, Math.round(v));
}

/* ---------- conferma / skip serie ---------- */

function confirmSet() {
  const b = curBlock();
  const exo = curExerciseOfBlock(b);
  const weight = parseFloat(document.getElementById("exw").textContent) || 0;
  const reps = parseInt(document.getElementById("exr").textContent, 10) || 0;

  ex.done.push({
    exerciseRef: exo.ref,
    exerciseName: exo.name,
    muscleGroup: exo.muscle,
    type: b.setType || "normal",
    weight: weight,
    reps: reps,
    note: "",
    bi: ex.bi,
    si: ex.si,
  });
  ex.lastWeights[exo.ref] = weight;
  persist();
  showUndo();
  advance();
}

function skipSet() {
  const b = curBlock();
  const exo = curExerciseOfBlock(b);
  ex.done.push({
    exerciseRef: exo.ref,
    exerciseName: exo.name,
    muscleGroup: exo.muscle,
    type: "skipped",
    weight: null,
    reps: null,
    note: "",
    bi: ex.bi,
    si: ex.si,
  });
  persist();
  advance(true);
}

function advance(noRest) {
  const b = curBlock();
  const totSets = totalSetsOfBlock(b);
  ex.si++;
  if (ex.si >= totSets) {
    ex.si = 0;
    ex.bi++;
  }
  persist();
  if (ex.bi >= ex.blocks.length) {
    return openFinish();
  }
  // rest: solo se la scheda lo prevede e non era uno skip
  const restSec = b.restAfterSetSec || 0;
  if (!noRest && restSec > 0) {
    openRest(restSec);
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
    ex.done.pop();
    // torno indietro di una serie
    ex.si--;
    if (ex.si < 0) {
      ex.bi = Math.max(0, ex.bi - 1);
      ex.si = totalSetsOfBlock(curBlock()) - 1;
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

function openRest(sec) {
  ex.restEndsAt = Date.now() + sec * 1000;
  persist();
  let o = document.getElementById("rest-ov");
  if (!o) {
    o = document.createElement("div");
    o.id = "rest-ov";
    o.className = "rest-overlay";
    o.innerHTML = `
      <div class="rest-circle" id="rest-num">0:00</div>
      <div class="rest-actions">
        <button class="rest-btn" id="rest-minus">−15s</button>
        <button class="rest-btn rest-skip" id="rest-skip">SALTA</button>
        <button class="rest-btn" id="rest-plus">+15s</button>
      </div>`;
    document.body.appendChild(o);
    o.querySelector("#rest-minus").onclick = () => {
      ex.restEndsAt -= 15000;
      persist();
    };
    o.querySelector("#rest-plus").onclick = () => {
      ex.restEndsAt += 15000;
      persist();
    };
    o.querySelector("#rest-skip").onclick = closeRest;
  }
  o.classList.add("open");
  clearInterval(restTick);
  const upd = () => {
    const left = Math.round((ex.restEndsAt - Date.now()) / 1000);
    const el = document.getElementById("rest-num");
    if (left <= 0) {
      if (el) el.textContent = "0:00";
      beep();
      closeRest();
      return;
    }
    if (el)
      el.textContent =
        Math.floor(left / 60) + ":" + String(left % 60).padStart(2, "0");
  };
  upd();
  restTick = setInterval(upd, 250);
}

function closeRest() {
  clearInterval(restTick);
  const o = document.getElementById("rest-ov");
  if (o) o.classList.remove("open");
  ex.restEndsAt = null;
  persist();
  renderExec();
}

function beep() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    const ctx = new AC();
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.frequency.value = 660; // media, non acuta
    g.gain.value = 0.18; // volume soft (cuffie!)
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.25);
  } catch (e) {}
}

/* ---------- fine sessione ---------- */

function confirmEnd() {
  if (confirm("Terminare la sessione?")) openFinish();
}

function openFinish() {
  clearInterval(sessTick);
  clearInterval(restTick);
  releaseWakeLock();
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
        muscleGroup: d.muscleGroup,
        sets: [],
      };
    }
    exercisesMap[key].sets.push({
      type: d.type,
      weight: d.weight,
      reps: d.reps,
      note: d.note,
    });
  });
  const payload = {
    templateId: state.templateId,
    templateName: state.templateName,
    startedAt: state.startedAt,
    endedAt: new Date().toISOString(),
    mood: state.mood != null ? state.mood : "",
    energy: state.energy != null ? state.energy : "",
    sessionNotes: state.sessionNotes || "",
    data: { exercises: Object.values(exercisesMap) },
  };
  return apiPost("lift_save_session", payload);
}
