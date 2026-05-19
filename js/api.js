/* ============================================
   LIFT — API layer
   Wrapper unico per le chiamate al backend GAS.
   In dev (USE_MOCK=true) ritorna i dati mock.
   ============================================ */

const USE_MOCK = false; // TODO: false quando il backend GAS e pronto
const GAS_URL = "https://script.google.com/macros/s/AKfycbyoF8xar7vf7K99rPm9VCpCSZ_3_84_l8vaa9mLdorXWIEubOpC_woBE_l2JBZJ7jGifw/exec"; // TODO: URL web app Apps Script

async function apiGet(action, params = {}) {
  if (USE_MOCK) return mockResponse(action, params);
  const qs = new URLSearchParams({ action, ...params }).toString();
  const res = await fetch(`${GAS_URL}?${qs}`);
  return res.json();
}

async function apiPost(action, payload = {}) {
  if (USE_MOCK) return mockResponse(action, payload);
  // text/plain evita il preflight CORS con GAS
  const res = await fetch(GAS_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ action, ...payload }),
  });
  return res.json();
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
