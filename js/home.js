/* ============================================
   LIFT — Home screen
   ============================================ */

const GREETINGS = [
  "Ciao, {name}",
  "Si torna in pista, {name}",
  "Pronto, {name}?",
  "Bentornato, {name}",
  "Che si pesta oggi, {name}?",
  "Forza {name}, si lavora",
];

function randomGreeting(name) {
  const g = GREETINGS[Math.floor(Math.random() * GREETINGS.length)];
  return g.replace("{name}", name);
}

const DAY_NAMES = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];

function renderWeekBar(sessions) {
  const wb = document.getElementById("week-bar");
  if (!wb) return;
  // settimana = da lunedì (ISO week)
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = new Date(today);
  // getDay(): 0=dom,1=lun,...,6=sab → offset da lunedì
  const dayOfWeek = today.getDay(); // 0=sun
  const offsetToMon = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  start.setDate(today.getDate() - offsetToMon); // lunedì
  const sessionDates = new Set(
    sessions
      .map((s) => {
        if (!s.startedAt) return null;
        const d = new Date(s.startedAt);
        d.setHours(0, 0, 0, 0);
        return d.getTime();
      })
      .filter(Boolean)
  );
  const html = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const isToday = d.getTime() === today.getTime();
    const hasSession = sessionDates.has(d.getTime());
    html.push(
      `<div class="wb-day${isToday ? " today" : ""}${
        hasSession ? " has-session" : ""
      }">
        <span class="wb-dot"></span>
        <div class="wb-name">${DAY_NAMES[i]}</div>
        <div class="wb-num">${d.getDate()}</div>
      </div>`
    );
  }
  wb.innerHTML = html.join("");
}

function daysSinceLabel(days) {
  if (days === 0) return "oggi";
  if (days === 1) return "ieri";
  return `${days} giorni fa`;
}

async function renderHome() {
  const data = await apiGet("lift_get_data");
  const { profile, streakWeeks, templates } = data;
  const programs = data.programs || [];

  // catalogo esercizi condiviso (per picker editor / libreria)
  if (data.exercises) EXERCISES_CATALOG = data.exercises;

  renderWeekBar(data.recentSessions || []);

  // Saluto
  document.getElementById("home-greeting").textContent = randomGreeting(
    profile.name
  );

  // Streak: sotto il week-bar
  const streakEl = document.getElementById("home-streak");
  if (streakWeeks) {
    streakEl.innerHTML = `🔥 <strong>${streakWeeks}</strong> ${streakWeeks === 1 ? "settimana" : "settimane"} di fila`;
    streakEl.classList.add("has-streak");
  } else {
    streakEl.innerHTML = `Nessuna streak attiva`;
    streakEl.classList.remove("has-streak");
  }

  // Avatar -> apre il profilo (menu globale)
  const avatarBtn = document.getElementById("avatar-btn");
  avatarBtn.innerHTML = renderAvatar(profile, "home");
  avatarBtn.onclick = openProfile;

  // Sezione programma periodizzato (se presente)
  renderProgramSection(programs);

  const hero = document.getElementById("hero-card");
  const list = document.getElementById("template-list");
  const otherLabel = document.querySelector(".section-label");
  const newBtnEl = document.getElementById("home-new-template");
  const hasActiveProgram = (programs || []).some((p) => !p.completed);

  // Programma unico protagonista: niente hero/altre-schede quando c'è un programma.
  if (hasActiveProgram) {
    hero.hidden = true;
    list.innerHTML = "";
    if (otherLabel) otherLabel.hidden = true;
    if (newBtnEl) newBtnEl.onclick = () => openEditor(null);
    return;
  }
  hero.hidden = false;
  if (otherLabel) otherLabel.hidden = false;

  // Hero = scheda suggerita (fatta meno di recente)
  const suggested = pickSuggestedTemplate(templates);

  // Empty state: nessuna scheda ancora
  if (!suggested) {
    hero.innerHTML = `
      <div class="hero-kicker">Nessuna scheda</div>
      <div class="hero-name">Inizia da qui</div>
      <div class="hero-meta">Crea la tua prima scheda per allenarti</div>
      <button class="hero-start" id="create-first-template">
        ${iconSvg("play")} Crea scheda
      </button>
    `;
    hero
      .querySelector("#create-first-template")
      .addEventListener("click", () => openEditor(null));
    document.getElementById("template-list").innerHTML = "";
    const newBtn0 = document.getElementById("home-new-template");
    if (newBtn0) newBtn0.onclick = () => openEditor(null);
    return;
  }

  hero.innerHTML = `
    <div class="hero-kicker">Oggi tocca</div>
    <div class="hero-name">${escapeHtml(suggested.name)}</div>
    <div class="hero-meta">${suggested.exerciseCount} esercizi · ultima volta ${daysSinceLabel(
      suggested.daysSince
    )}</div>
    <button class="hero-start" data-template="${escapeAttr(suggested.id)}">
      ${iconSvg("play")} Inizia
    </button>
    <img class="hero-illustration" src="assets/illus-${escapeAttr(suggested.id)}.svg" alt=""
         aria-hidden="true" onerror="this.src='assets/illus-hero.svg'" />
  `;
  hero
    .querySelector(".hero-start")
    .addEventListener("click", () => startSession(suggested.id));

  // Altre schede (escludo la suggerita)
  const others = templates.filter((t) => t.id !== suggested.id);
  list.innerHTML = others
    .map(
      (t) => `
    <li class="template-card" data-template="${escapeAttr(t.id)}">
      <div class="tc-body">
        <div class="tc-name">${escapeHtml(t.name)}</div>
        <div class="tc-meta">${t.exerciseCount} esercizi · ${daysSinceLabel(t.daysSince)}</div>
      </div>
      <span class="tc-arrow">${iconSvg("chevron-right")}</span>
      <img class="tc-illus" src="assets/illus-${escapeAttr(t.id)}.svg" alt=""
           aria-hidden="true" onerror="this.src='assets/illus-hero.svg'" />
    </li>`
    )
    .join("");
  list.querySelectorAll(".template-card").forEach((card) => {
    card.addEventListener("click", () =>
      startSession(card.dataset.template)
    );
  });

  const newBtn = document.getElementById("home-new-template");
  if (newBtn) newBtn.onclick = () => openEditor(null);
}

/* ---------- Sezione programma periodizzato ---------- */

function renderProgramSection(programs) {
  // contenitore: lo creo una volta, ancorato prima dell'hero-card
  let sec = document.getElementById("program-section");
  if (!sec) {
    sec = document.createElement("section");
    sec.id = "program-section";
    const hero = document.getElementById("hero-card");
    hero.parentNode.insertBefore(sec, hero);
  }

  const active = (programs || []).filter((p) => !p.completed);
  if (active.length === 0) {
    sec.innerHTML = "";
    sec.hidden = true;
    return;
  }
  sec.hidden = false;

  // mostro il primo programma attivo (mono-programma per ora)
  const p = active[0];
  sec.innerHTML = `
    <div class="prog-card">
      <div class="prog-head">
        <div>
          <div class="prog-kicker">Programma</div>
          <div class="prog-name">${escapeHtml(p.nome)}</div>
        </div>
        <button class="prog-week" id="prog-week-btn" title="Cambia settimana">
          Settimana <strong>${p.currentWeek}</strong>/${p.weeks}
        </button>
      </div>
      <ul class="prog-workouts">
        ${p.workouts
          .map(
            (w) => `
          <li class="prog-wk" data-prog="${escapeAttr(p.id)}" data-wk="${escapeAttr(w.id)}">
            <div class="pw-name">${escapeHtml(w.name)}</div>
            <div class="pw-meta">${w.exerciseCount} esercizi</div>
            <span class="pw-arrow">${iconSvg("chevron-right")}</span>
          </li>`
          )
          .join("")}
      </ul>
    </div>`;

  sec.querySelectorAll(".prog-wk").forEach((li) => {
    li.addEventListener("click", () =>
      startProgramWorkout(li.dataset.prog, li.dataset.wk)
    );
  });
  const wkBtn = sec.querySelector("#prog-week-btn");
  if (wkBtn) wkBtn.onclick = () => openWeekPicker(p);
}

/** Modale per cambiare la settimana del programma (override manuale). */
function openWeekPicker(p) {
  let m = document.getElementById("week-modal");
  if (!m) {
    m = document.createElement("div");
    m.id = "week-modal";
    m.className = "dlg";
    document.body.appendChild(m);
    m.addEventListener("click", (e) => {
      if (e.target === m) m.classList.remove("show");
    });
  }
  const weeks = [];
  for (let i = 1; i <= p.weeks; i++) {
    weeks.push(
      `<button class="wk-opt ${i === p.currentWeek ? "wk-opt-cur" : ""}" data-w="${i}">W${i}</button>`
    );
  }
  m.innerHTML = `
    <div class="dlg-box">
      <div class="dlg-title">Settimana corrente</div>
      <div class="dlg-msg">Di norma avanza da sola col calendario. Forzala solo se sei più avanti o indietro.</div>
      <div class="wk-grid">${weeks.join("")}</div>
      <div class="dlg-actions dlg-actions-top">
        <button class="dlg-btn dlg-btn-cancel" id="wk-auto">Automatica (data)</button>
      </div>
    </div>`;
  m.querySelectorAll(".wk-opt").forEach((b) => {
    b.onclick = async () => {
      await apiPost("lift_set_program_week", { id: p.id, weekOverride: parseInt(b.dataset.w, 10) });
      m.classList.remove("show");
      await renderHome();
    };
  });
  m.querySelector("#wk-auto").onclick = async () => {
    await apiPost("lift_set_program_week", { id: p.id, weekOverride: "" });
    m.classList.remove("show");
    await renderHome();
  };
  m.classList.add("show");
}

// startSession() / startProgramWorkout() vivono in exec.js
