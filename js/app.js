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
  screens.profile = document.getElementById("screen-profile");

  showScreen("home");

  try {
    await renderHome();
  } catch (err) {
    console.error("Errore boot:", err);
    document.getElementById("home-greeting").textContent =
      "Qualcosa è andato storto";
  }
}

document.addEventListener("DOMContentLoaded", boot);
