/* ============================================
   LIFT — Mock data
   Usato in sviluppo finche il backend GAS non e pronto.
   Rispecchia la forma dei dati che lift_get_data restituira.
   ============================================ */

const MOCK_DATA = {
  profile: {
    name: "Ale",
    weightKg: 96.7,
    lastSessionDate: "2026-05-11",
    avatarUrl: "",
  },
  streakWeeks: 7, // settimane consecutive con >=3 sessioni
  templates: [
    {
      id: "t_upper_a",
      name: "Upper A",
      notes: "Panca pesante, focus petto",
      exerciseCount: 6,
      lastUsedAt: "2026-05-11T07:42:00Z",
      daysSince: 1,
    },
    {
      id: "t_lower_a",
      name: "Lower A",
      notes: "",
      exerciseCount: 5,
      lastUsedAt: "2026-05-09T18:00:00Z",
      daysSince: 3,
    },
    {
      id: "t_upper_b",
      name: "Upper B",
      notes: "",
      exerciseCount: 6,
      lastUsedAt: "2026-05-06T18:00:00Z",
      daysSince: 6,
    },
    {
      id: "t_misto",
      name: "Misto",
      notes: "Richiamo full body",
      exerciseCount: 7,
      lastUsedAt: "2026-05-02T18:00:00Z",
      daysSince: 10,
    },
  ],
  recentSessions: [],
  prs: [],
};

/* La scheda suggerita = quella fatta meno di recente (daysSince max) */
function pickSuggestedTemplate(templates) {
  return templates.reduce((best, t) =>
    t.daysSince > (best ? best.daysSince : -1) ? t : best
  , null);
}
