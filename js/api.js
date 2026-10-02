/* ============================================
   LIFT — API layer
   Wrapper unico per le chiamate al backend GAS.
   In dev (USE_MOCK=true) ritorna i dati mock.
   ============================================ */

const USE_MOCK = false; // TODO: false quando il backend GAS e pronto
const GAS_URL = "https://script.google.com/macros/s/AKfycbwjlns1fPiARx6jVA_5INxyfdfDeMNR3fUIdsiA_8MblMdY3DEXBi7PlA4flHqs1pQuIg/exec";

// GAS risponde con un redirect a googleusercontent: il Content-Type finale
// non e sempre application/json, quindi parsiamo come testo e poi JSON.parse.
async function _parse(res) {
  const txt = await res.text();
  if (txt.trim().startsWith("<")) {
    // HTML invece di JSON = quasi sempre login Google (deploy non "Chiunque")
    throw new Error(
      "Il backend ha risposto con HTML invece di JSON. Verifica che il deploy GAS sia 'Chiunque' con una NUOVA versione."
    );
  }
  try {
    return JSON.parse(txt);
  } catch (e) {
    throw new Error("Risposta non JSON: " + txt.slice(0, 120));
  }
}

/* ---- Overlay di caricamento globale ---- */
let _loadingCount = 0;
function _showLoading(msg) {
  _loadingCount++;
  let o = document.getElementById("global-loader");
  if (!o) {
    o = document.createElement("div");
    o.id = "global-loader";
    o.innerHTML =
      '<div class="gl-box"><div class="gl-spin"></div><div class="gl-msg"></div></div>';
    document.body.appendChild(o);
  }
  o.querySelector(".gl-msg").textContent = msg || "Caricamento…";
  o.classList.add("show");
}
function _hideLoading() {
  _loadingCount = Math.max(0, _loadingCount - 1);
  if (_loadingCount === 0) {
    const o = document.getElementById("global-loader");
    if (o) o.classList.remove("show");
  }
}

const LOADING_MSG = {
  lift_get_data: "Carico i tuoi dati…",
  lift_get_template: "Preparo la scheda…",
  lift_get_session: "Carico la sessione…",
  lift_get_history: "Carico lo storico…",
  lift_get_ceck: "Preparo il CECK…",
  lift_save_template: "Salvo la scheda…",
  lift_save_session: "Salvo la sessione…",
  lift_log_weight: "Salvo il peso…",
  lift_get_stats: "Carico le statistiche…",
  lift_get_pr_stats: "Calcolo i progressi…",
  lift_get_month_report: "Preparo il report…",
  lift_get_report_notice: "",
  lift_get_exercise_trend: "Carico il trend…",
  lift_save_custom_exercise: "Salvo l'esercizio…",
  lift_generate_session_feedback: "Analisi in corso…",
  lift_suggest_starting_weight: "Calcolo un peso…",
  lift_extract_pdf: "Leggo il PDF della scheda…",
};

// Cache delle GET, key = "action?params". TTL semplice in ms.
const _apiCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 min: l'app e mono-utente, niente race conditions

function _cacheKey(action, params) {
  return action + "?" + JSON.stringify(params || {});
}

/** Invalida una o piu chiavi della cache (chiamato dopo i POST mutanti) */
function apiInvalidate(actionPrefix) {
  for (const k of [..._apiCache.keys()]) {
    if (!actionPrefix || k.startsWith(actionPrefix)) _apiCache.delete(k);
  }
}

/** Attesa non bloccante. */
function _sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** fetch con TIMEOUT: senza, una risposta appesa del backend blocca la app per
 *  minuti (splash ferma a 3/4). Con AbortController fallisce in ms e si riprova. */
async function _fetchTimeout(url, ms) {
  const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
  const t = ctrl ? setTimeout(() => ctrl.abort(), ms) : null;
  try {
    return await fetch(url, {
      redirect: "follow",
      signal: ctrl ? ctrl.signal : undefined,
    });
  } finally {
    if (t) clearTimeout(t);
  }
}

/**
 * GET verso GAS con RETRY automatico. GAS su rete instabile risponde a volte con
 * HTML invece di JSON, o la fetch fallisce/si appende. Le GET sono idempotenti →
 * sicuro riprovare.
 * TIMEOUT ALTO (30s): il bootstrap legge molte tab del foglio ed è LENTO ma
 * funzionante (a freddo può superare i 10-15s). Un timeout basso (era 12s) lo
 * abortiva → "signal is aborted without reason". 30s è solo il tetto anti-
 * appeso-infinito, non taglia le risposte lente-ma-valide.
 */
async function _getJsonWithRetry(url, tries = 3) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await _fetchTimeout(url, 30000);
      return await _parse(res); // lancia su HTML/non-JSON
    } catch (e) {
      lastErr = e;
      if (i < tries - 1) await _sleep(800 * (i + 1)); // 800ms, 1600ms
    }
  }
  throw lastErr;
}

async function apiGet(action, params = {}, opts = {}) {
  if (USE_MOCK) return mockResponse(action, params);
  const key = _cacheKey(action, params);
  const cached = _apiCache.get(key);
  if (cached && Date.now() - cached.t < CACHE_TTL && !opts.fresh) {
    return cached.data;
  }
  const showSpin = !opts.silent;
  if (showSpin) _showLoading(LOADING_MSG[action]);
  try {
    const qs = new URLSearchParams({ action, ...params }).toString();
    const data = await _getJsonWithRetry(`${GAS_URL}?${qs}`, 3);
    _apiCache.set(key, { t: Date.now(), data: data });
    return data;
  } finally {
    if (showSpin) _hideLoading();
  }
}

async function apiPost(action, payload = {}) {
  if (USE_MOCK) return mockResponse(action, payload);
  _showLoading(LOADING_MSG[action]);
  try {
    // text/plain evita il preflight CORS con GAS
    const res = await fetch(GAS_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action, ...payload }),
    });
    const data = await _parse(res);
    // Le POST che cambiano stato invalidano la cache di lettura
    if (_INVALIDATES_BOOTSTRAP[action]) {
      apiInvalidate("lift_get_data");
    }
    // Le action che toccano le SESSIONI invalidano anche storico + dettagli
    // (altrimenti dopo un salvataggio/modifica lo storico resta quello vecchio).
    if (_INVALIDATES_HISTORY[action]) {
      apiInvalidate("lift_get_history");
      apiInvalidate("lift_get_session");
      apiInvalidate("lift_get_ceck");
    }
    // il peso corporeo entra nella media settimanale del CECK
    if (action === "lift_log_weight") apiInvalidate("lift_get_ceck");
    // il merge rimappa i set di un esercizio → cambia storico/stats/ceck
    if (action === "lift_merge_exercise") {
      apiInvalidate("lift_get_history");
      apiInvalidate("lift_get_ceck");
      apiInvalidate("lift_get_pr_stats");
      apiInvalidate("lift_get_month_report");
    }
    return data;
  } finally {
    _hideLoading();
  }
}

// Quali action invalidano la cache di storico + dettaglio sessione
const _INVALIDATES_HISTORY = {
  lift_save_session: true,
  lift_edit_session: true,
};

// Quali action invalidano la cache di lift_get_data
const _INVALIDATES_BOOTSTRAP = {
  lift_save_template: true,
  lift_archive_template: true,
  lift_save_session: true,
  lift_log_weight: true,
  lift_save_custom_exercise: true,
  lift_edit_session: true,
  lift_import_programma: true,
  lift_set_program_week: true,
  lift_replace_exercise: true,
  lift_save_exercise: true,
  lift_merge_exercise: true,
};

function mockResponse(action) {
  return new Promise((resolve) => {
    setTimeout(() => {
      switch (action) {
        case "lift_get_data":
          resolve({
            status: "OK",
            profile: MOCK_DATA.profile,
            streakWeeks: MOCK_DATA.streakWeeks,
            templates: MOCK_DATA.templates,
            recentSessions: MOCK_DATA.recentSessions,
            prs: MOCK_DATA.prs,
          });
          break;
        default:
          resolve({ status: "OK" });
      }
    }, 180); // simula latenza rete
  });
}
