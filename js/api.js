/* ============================================
   LIFT — API layer
   Wrapper unico per le chiamate al backend GAS.
   In dev (USE_MOCK=true) ritorna i dati mock.
   ============================================ */

const USE_MOCK = false; // TODO: false quando il backend GAS e pronto
const GAS_URL = "https://script.google.com/macros/s/AKfycbwjlns1fPiARx6jVA_5INxyfdfDeMNR3fUIdsiA_8MblMdY3DEXBi7PlA4flHqs1pQuIg/exec"; // TODO: URL web app Apps Script

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

async function apiGet(action, params = {}) {
  if (USE_MOCK) return mockResponse(action, params);
  const qs = new URLSearchParams({ action, ...params }).toString();
  const res = await fetch(`${GAS_URL}?${qs}`);
  return _parse(res);
}

async function apiPost(action, payload = {}) {
  if (USE_MOCK) return mockResponse(action, payload);
  // text/plain evita il preflight CORS con GAS
  const res = await fetch(GAS_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ action, ...payload }),
  });
  return _parse(res);
}

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
