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

function daysSinceLabel(days) {
  if (days === 0) return "oggi";
  if (days === 1) return "ieri";
  return `${days} giorni fa`;
}

async function renderHome() {
  const data = await apiGet("lift_get_data");
  const { profile, streakWeeks, templates } = data;

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
}

function startSession(templateId) {
  // TODO: avvio modalita esecuzione (prossimo step)
  console.log("Avvio sessione:", templateId);
  alert("Avvio sessione: " + templateId + "\n(esecuzione in arrivo)");
}
