/* ============================================
   LIFT — Bootstrap + router schermate
   ============================================ */

const screens = {};

function showScreen(id) {
  Object.values(screens).forEach((el) => el.classList.remove("active"));
  if (screens[id]) screens[id].classList.add("active");
}

async function boot() {
  screens.home = document.getElementById("screen-home");
  screens.editor = document.getElementById("screen-editor");
  screens.exec = document.getElementById("screen-exec");
  screens.profile = document.getElementById("screen-profile");

  // se c'e una sessione attiva non terminata, riprendila
  if (typeof resumeSessionIfAny === "function" && resumeSessionIfAny()) {
    return;
  }

  showScreen("home");

  try {
    await renderHome();
  } catch (err) {
    console.error("Errore boot:", err);
    document.getElementById("home-greeting").textContent =
      "Connessione fallita";
    const streak = document.getElementById("home-streak");
    if (streak) {
      streak.innerHTML =
        '<span style="color:var(--danger)">' +
        (USE_MOCK
          ? "Errore mock: " + String(err.message || err)
          : "Backend non raggiungibile. Controlla che il deploy GAS sia su 'Chiunque' e che l'URL in api.js sia corretto.") +
        "</span>";
    }
  }
}

document.addEventListener("DOMContentLoaded", boot);
