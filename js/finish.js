/* ============================================
   LIFT — Fine sessione (3 step)
   1) mood/energia/note
   2) spinner AI
   3) risultato (PR + volume + durata + feedback)
   ============================================ */

let finState = null;

function renderFinish(sessionState) {
  finState = {
    raw: sessionState,
    mood: null, // 1..5 (low -> peak)
    energy: null, // 1..5 (sotto terra -> fulmine)
    notes: "",
    saveResult: null,
    feedbackText: "",
  };
  showScreen("finish");
  const root = document.getElementById("screen-finish");
  root.innerHTML = `
    <div id="fin-step-1" class="fin-step active">${_finStep1Html()}</div>
    <div id="fin-step-2" class="fin-step">${_finStep2Html()}</div>
    <div id="fin-step-3" class="fin-step"></div>
  `;
  _wireStep1();
}

/* ---------- STEP 1: mood / energia / note ---------- */

const MOOD_LABELS = ["GIU", "BLAH", "OK", "BENE", "TOP"];
const ENERGY_LABELS = ["KO", "SCARICA", "MEDIA", "PIENA", "FULMINE"];

function _chipsHtml(kind) {
  // kind = 'mood' | 'energy'. Valori 1..5.
  const labels = kind === "mood" ? MOOD_LABELS : ENERGY_LABELS;
  return [1, 2, 3, 4, 5]
    .map(
      (v, i) => `
      <button class="fin-chip" data-${kind}="${v}" type="button" title="${labels[i]}">
        ${iconSvg(kind + "-" + v)}
        <span class="fc-lab">${labels[i]}</span>
      </button>`
    )
    .join("");
}

function _finStep1Html() {
  return `
    <h1 class="fin-title">Sessione chiusa</h1>
    <p class="fin-sub">Come e andata? Due tap e via.</p>

    <div class="fin-block">
      <div class="fin-block-label">Mood</div>
      <div class="fin-chips" id="fin-mood-chips">${_chipsHtml("mood")}</div>
    </div>

    <div class="fin-block">
      <div class="fin-block-label">Energia</div>
      <div class="fin-chips" id="fin-energy-chips">${_chipsHtml("energy")}</div>
    </div>

    <textarea id="fin-notes" class="fin-notes"
      placeholder="Note (opzionale): come ti sentivi, fastidi, motivazione..."></textarea>

    <button id="fin-save" class="fin-save-btn" disabled>Salva sessione</button>
  `;
}

function _wireStep1() {
  const updateSaveBtn = () => {
    document.getElementById("fin-save").disabled =
      finState.mood == null || finState.energy == null;
  };
  const wireChips = (containerId, kind) => {
    const c = document.getElementById(containerId);
    c.querySelectorAll(".fin-chip").forEach((chip) => {
      chip.onclick = () => {
        const val = +chip.dataset[kind];
        finState[kind] = val;
        c.querySelectorAll(".fin-chip").forEach((x) =>
          x.classList.toggle("selected", +x.dataset[kind] === val)
        );
        updateSaveBtn();
      };
    });
  };
  wireChips("fin-mood-chips", "mood");
  wireChips("fin-energy-chips", "energy");
  document.getElementById("fin-save").onclick = _goSaveAndAnalyze;
}

/* ---------- STEP 2: spinner ---------- */

function _finStep2Html() {
  return `
    <div class="fin-analyzing">
      <div class="fin-spin"></div>
      <div style="text-align:center">
        <div class="fin-title" style="font-size:1.5rem">Analisi in corso</div>
        <div class="fin-sub" style="margin-bottom:0">Sto guardando come e andata…</div>
      </div>
    </div>
  `;
}

function _goStep(n) {
  ["fin-step-1", "fin-step-2", "fin-step-3"].forEach((id) => {
    document.getElementById(id).classList.remove("active");
  });
  document.getElementById("fin-step-" + n).classList.add("active");
}

async function _goSaveAndAnalyze() {
  finState.notes = document.getElementById("fin-notes").value || "";
  _goStep(2);

  // arricchisco lo stato sessione con mood/energia/note prima del save
  const s = finState.raw;
  s.mood = finState.mood;
  s.energy = finState.energy;
  s.sessionNotes = finState.notes;

  try {
    const saveRes = await finalizeSession(s, false);
    if (saveRes && saveRes.status === "OK") {
      finState.saveResult = saveRes;
      // chiamo AI feedback (fallisce in modo grazioso se Gemini down)
      try {
        const fb = await apiPost("lift_generate_session_feedback", {
          sessionId: saveRes.sessionId,
        });
        if (fb && fb.status === "OK") {
          finState.feedbackText = fb.feedback;
        } else if (fb && fb.message) {
          finState.feedbackError =
            "AI: " + fb.message + (fb.step ? " (step: " + fb.step + ")" : "");
          console.warn("[FB]", fb);
        }
      } catch (e) {
        finState.feedbackError = "Errore rete: " + (e.message || e);
        console.error("[FB] fetch", e);
      }
      localStorage.removeItem(LS_KEY);
      _renderStep3();
    } else {
      throw new Error(
        saveRes && saveRes.message ? saveRes.message : "Salvataggio fallito"
      );
    }
  } catch (err) {
    _goStep(1);
    liftAlert("Errore: " + (err.message || err), "Salvataggio non riuscito");
  }
}

/* ---------- STEP 3: risultato ---------- */

function _fmtDuration(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return h > 0 ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
}

const PR_LABEL = {
  "1rm": "1RM stimato",
  volume: "Volume sessione",
  heaviest: "Peso piu alto",
};

function _renderStep3() {
  const r = finState.saveResult;
  const step3 = document.getElementById("fin-step-3");
  const prs = r.prsHit || [];
  const prsHtml = prs.length
    ? `
      <div class="section-label label-micro fin-prs-title">Nuovi record</div>
      <div class="fin-prs">
        ${prs
          .map(
            (p) => `
          <div class="fin-pr">
            <span class="fpr-star">★</span>
            <span class="fpr-name">${escapeHtml(p.exerciseName)}</span>
            <span class="fpr-type">${PR_LABEL[p.prType] || p.prType}</span>
            <span class="fpr-val">${p.value}${
              p.prType === "heaviest" ? " kg" : ""
            }</span>
          </div>`
          )
          .join("")}
      </div>`
    : "";

  const fb = finState.feedbackText;
  const fbErr = finState.feedbackError;
  const feedbackHtml = fb
    ? `<div class="fin-feedback">${escapeHtml(fb).replace(/\n/g, "<br>")}</div>`
    : `<div class="fin-feedback empty">
        Feedback non disponibile al momento.
        ${fbErr ? `<div style="margin-top:8px;color:var(--danger);font-size:.85em">${escapeHtml(fbErr)}</div>` : ""}
        <div class="fin-feedback-retry" id="fin-retry-fb">Rigenera feedback</div>
       </div>`;

  step3.innerHTML = `
    <h1 class="fin-title">Tutto salvato</h1>
    <p class="fin-sub">Ecco com'e andata.</p>

    <div class="fin-stats">
      <div class="fin-stat">
        <div class="fs-val">${_fmtDuration(r.durationSec || 0)}</div>
        <div class="fs-lab">durata</div>
      </div>
      <div class="fin-stat">
        <div class="fs-val">${Math.round(r.totalVolume || 0)}</div>
        <div class="fs-lab">volume kg</div>
      </div>
      <div class="fin-stat">
        <div class="fs-val">${prs.length}</div>
        <div class="fs-lab">PR oggi</div>
      </div>
    </div>

    ${prsHtml}
    ${feedbackHtml}

    <button class="fin-done-btn" id="fin-done">Vai alla home</button>
  `;
  _goStep(3);

  document.getElementById("fin-done").onclick = async () => {
    finState = null;
    ex = null;
    showScreen("home");
    await renderHome();
  };
  const retry = document.getElementById("fin-retry-fb");
  if (retry)
    retry.onclick = async () => {
      retry.textContent = "Sto rigenerando…";
      try {
        const fb2 = await apiPost("lift_generate_session_feedback", {
          sessionId: finState.saveResult.sessionId,
        });
        if (fb2 && fb2.status === "OK") {
          finState.feedbackText = fb2.feedback;
          _renderStep3();
        } else {
          retry.textContent = "Rigenera feedback";
          liftAlert("AI ancora non disponibile, riprova piu tardi.");
        }
      } catch (e) {
        retry.textContent = "Rigenera feedback";
      }
    };
}
