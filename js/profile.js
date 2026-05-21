/* ============================================
   LIFT — Profilo (menu globale)
   ============================================ */

async function openProfile() {
  showScreen("profile");
  const root = document.getElementById("screen-profile");
  // mostro subito uno scheletro, poi popolo coi dati
  root.innerHTML = _profileHtml({ name: "…", weightKg: null, lastSessionDate: "" });
  _wireProfile();
  try {
    const data = await apiGet("lift_get_data");
    if (data && data.profile) {
      root.innerHTML = _profileHtml(data.profile);
      _wireProfile();
    }
  } catch (e) {
    /* lasciamo lo scheletro */
  }
}

function _profileHtml(p) {
  const last = p.lastSessionDate
    ? "ultima sessione " + _fmtShortDate(p.lastSessionDate)
    : "nessuna sessione ancora";
  const weight = p.weightKg ? p.weightKg + " kg" : "peso non registrato";
  const items = [
    { id: "schede", icon: "clipboard", label: "Schede allenamenti" },
    { id: "esercizi", icon: "library", label: "Esercizi" },
    { id: "peso", icon: "scale", label: "Aggiorna peso" },
    { id: "storico", icon: "history", label: "Storico allenamenti" },
    { id: "stats", icon: "bar-chart", label: "Statistiche" },
    { id: "home", icon: "home", label: "Homepage" },
  ];
  return `
    <div class="prof-head">
      <div class="prof-avatar">${renderAvatar(p, "profile")}</div>
      <div>
        <div class="prof-name">${escapeHtml(p.name || "Ale")}</div>
        <div class="prof-meta">${escapeHtml(weight)} · ${escapeHtml(last)}</div>
      </div>
    </div>
    <div class="prof-menu">
      ${items
        .map(
          (it) => `
        <button class="prof-item" data-pi="${it.id}">
          <span class="pi-icon">${iconSvg(it.icon)}</span>
          <span class="pi-text">${it.label}</span>
          ${it.soon ? '<span class="pi-soon">soon</span>' : ""}
          <span class="pi-arrow">${iconSvg("chevron-right")}</span>
        </button>`
        )
        .join("")}
    </div>
  `;
}

function _wireProfile() {
  document.querySelectorAll(".prof-item").forEach((btn) => {
    btn.onclick = () => _handleProfileItem(btn.dataset.pi);
  });
}

async function _handleProfileItem(id) {
  switch (id) {
    case "home":
      showScreen("home");
      return renderHome();
    case "schede":
      // Per ora: torna in home (le schede si gestiscono da li).
      // Quando avremo una pagina "gestione schede" la apriremo qui.
      showScreen("home");
      return renderHome();
    case "peso":
      return openWeightModal();
    case "storico":
      return openHistory();
    case "stats":
      return openStats();
    case "esercizi":
      return openLibrary();
  }
}

/* ---------- Modale aggiorna peso ---------- */

async function openWeightModal() {
  const currentWeightTxt = document.querySelector(".prof-meta")?.textContent || "";
  const m = parseFloat(currentWeightTxt);
  const current = isFinite(m) ? m : "";

  const dlgResult = await new Promise((resolve) => {
    let d = document.getElementById("weight-dlg");
    if (!d) {
      d = document.createElement("div");
      d.id = "weight-dlg";
      d.className = "dlg";
      document.body.appendChild(d);
    }
    d.innerHTML = `
      <div class="dlg-box weight-modal-content">
        <div class="dlg-title">Aggiorna peso</div>
        <div class="weight-display">
          <input id="wd-input" type="number" inputmode="decimal" step="0.1" min="30" max="300" value="${current}" />
          <span class="wd-unit">kg</span>
        </div>
        <div class="dlg-actions">
          <button class="dlg-btn dlg-btn-cancel" id="wd-cancel">Annulla</button>
          <button class="dlg-btn dlg-btn-ok" id="wd-ok">Salva</button>
        </div>
      </div>`;
    d.classList.add("show");
    setTimeout(() => {
      const inp = document.getElementById("wd-input");
      inp.focus();
      inp.select();
    }, 60);
    d.querySelector("#wd-cancel").onclick = () => {
      d.classList.remove("show");
      resolve(null);
    };
    d.querySelector("#wd-ok").onclick = () => {
      const v = parseFloat(document.getElementById("wd-input").value);
      d.classList.remove("show");
      resolve(isFinite(v) ? v : null);
    };
  });

  if (dlgResult == null) return;
  try {
    const res = await apiPost("lift_log_weight", { weightKg: dlgResult });
    if (res && res.status === "OK") {
      // re-render profilo per aggiornare la meta
      openProfile();
    } else {
      liftAlert(res && res.message ? res.message : "Salvataggio fallito");
    }
  } catch (e) {
    liftAlert("Errore: " + (e.message || e));
  }
}

/* ---------- util ---------- */

function _fmtShortDate(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("it-IT", { day: "2-digit", month: "short" });
  } catch (e) {
    return iso;
  }
}
