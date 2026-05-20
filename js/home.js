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

const DAY_NAMES = ["Dom", "Lun", "Mar", "Mer", "Gio", "Ven", "Sab"];

function renderWeekBar(sessions) {
  const wb = document.getElementById("week-bar");
  if (!wb) return;
  // settimana = da domenica (indice 0) come nei mockup
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = new Date(today);
  start.setDate(today.getDate() - today.getDay()); // domenica
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

  renderWeekBar(data.recentSessions || []);

  // Saluto + streak
  document.getElementById("home-greeting").textContent = randomGreeting(
    profile.name
  );
  const streakEl = document.getElementById("home-streak");
  streakEl.innerHTML = streakWeeks
    ? `<strong>${streakWeeks}</strong> settimane di fila`
    : "Nessuna streak attiva";

  // Avatar
  const avatarBtn = document.getElementById("avatar-btn");
  avatarBtn.innerHTML = profile.avatarUrl
    ? `<img src="${profile.avatarUrl}" alt="Profilo">`
    : iconSvg("user");

  // Hero = scheda suggerita (fatta meno di recente)
  const suggested = pickSuggestedTemplate(templates);
  const hero = document.getElementById("hero-card");

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
    <div class="hero-name">${suggested.name}</div>
    <div class="hero-meta">${suggested.exerciseCount} esercizi · ultima volta ${daysSinceLabel(
      suggested.daysSince
    )}</div>
    <div class="hero-illustration">${iconSvg("dumbbell")}</div>
    <button class="hero-start" data-template="${suggested.id}">
      ${iconSvg("play")} Inizia
    </button>
  `;
  hero
    .querySelector(".hero-start")
    .addEventListener("click", () => startSession(suggested.id));

  // Altre schede (escludo la suggerita)
  const others = templates.filter((t) => t.id !== suggested.id);
  const list = document.getElementById("template-list");
  list.innerHTML = others
    .map(
      (t) => `
    <li class="template-card" data-template="${t.id}">
      <div>
        <div class="tc-name">${t.name}</div>
        <div class="tc-meta">${t.exerciseCount} esercizi · ${daysSinceLabel(
        t.daysSince
      )}</div>
      </div>
      <span class="tc-arrow">${iconSvg("chevron-right")}</span>
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

// startSession() vera vive in exec.js
