/* ============================================
   LIFT — Bootstrap + router schermate + dialog custom
   ============================================ */

const screens = {};

/* ============================================
   Avatar personalizzato.
   - Carica un'immagine se l'utente la mette in assets/avatar.png (o .jpg).
   - Se 404, fallback all'icona user di Lucide.
   - Si controlla 1 volta a session (cache in memoria).
   ============================================ */
const AVATAR_CANDIDATES = ["assets/avatar.png", "assets/avatar.jpg"];
let _avatarUrl = null; // null = non ancora controllato, "" = nessuno, "..." = url valido
let _avatarChecked = false;

function _probeAvatar() {
  if (_avatarChecked) return;
  _avatarChecked = true;
  AVATAR_CANDIDATES.forEach((path) => {
    const img = new Image();
    img.onload = () => {
      if (!_avatarUrl) {
        _avatarUrl = path;
        // ridisegno gli avatar gia in DOM
        document.querySelectorAll("[data-avatar]").forEach((el) => {
          el.outerHTML = `<img src="${path}" alt="Profilo" data-avatar>`;
        });
      }
    };
    img.src = path;
  });
}

function renderAvatar(profile, _ctx) {
  _probeAvatar();
  // priorita: avatarUrl dal backend > file locale rilevato > fallback icona
  const url = (profile && profile.avatarUrl) || _avatarUrl;
  if (url) return `<img src="${url}" alt="Profilo" data-avatar>`;
  // marco l'svg per poterlo sostituire al volo quando il probe completa
  const svg = iconSvg("user");
  return svg.replace("<svg", '<svg data-avatar');
}

/* ---- Modali custom (sostituiscono confirm/alert nativi) ---- */
function liftDialog(opts) {
  return new Promise((resolve) => {
    let d = document.getElementById("lift-dlg");
    if (!d) {
      d = document.createElement("div");
      d.id = "lift-dlg";
      d.className = "dlg";
      d.innerHTML =
        '<div class="dlg-box">' +
        '<div class="dlg-title" id="dlg-title"></div>' +
        '<div class="dlg-msg" id="dlg-msg"></div>' +
        '<div class="dlg-actions" id="dlg-actions"></div>' +
        "</div>";
      document.body.appendChild(d);
    }
    d.querySelector("#dlg-title").textContent = opts.title || "";
    d.querySelector("#dlg-msg").textContent = opts.message || "";
    const acts = d.querySelector("#dlg-actions");
    acts.innerHTML = "";
    (opts.buttons || [{ label: "OK", value: true, primary: true }]).forEach(
      (b) => {
        const btn = document.createElement("button");
        btn.className =
          "dlg-btn " +
          (b.danger
            ? "dlg-btn-danger"
            : b.primary
            ? "dlg-btn-ok"
            : "dlg-btn-cancel");
        btn.textContent = b.label;
        btn.onclick = () => {
          d.classList.remove("show");
          resolve(b.value);
        };
        acts.appendChild(btn);
      }
    );
    d.classList.add("show");
  });
}

function liftConfirm(message, opts) {
  opts = opts || {};
  return liftDialog({
    title: opts.title || "Conferma",
    message: message,
    buttons: [
      { label: opts.cancelLabel || "Annulla", value: false },
      {
        label: opts.okLabel || "Conferma",
        value: true,
        primary: !opts.danger,
        danger: !!opts.danger,
      },
    ],
  });
}

function liftAlert(message, title) {
  return liftDialog({
    title: title || "",
    message: message,
    buttons: [{ label: "OK", value: true, primary: true }],
  });
}

function showScreen(id) {
  Object.values(screens).forEach((el) => el.classList.remove("active"));
  if (screens[id]) screens[id].classList.add("active");
}

async function boot() {
  screens.home = document.getElementById("screen-home");
  screens.editor = document.getElementById("screen-editor");
  screens.exec = document.getElementById("screen-exec");
  screens.finish = document.getElementById("screen-finish");
  screens.profile = document.getElementById("screen-profile");
  screens.history = document.getElementById("screen-history");
  screens["session-detail"] = document.getElementById("screen-session-detail");
  screens.stats = document.getElementById("screen-stats");

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
