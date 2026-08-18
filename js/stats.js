/* ============================================
   LIFT — Statistiche (3 viste: frequenza / PR / trend)
   ============================================ */

let _statsData = null;
let _chartLoaded = false;
let _trendChart = null;

async function openStats() {
  showScreen("stats");
  const root = document.getElementById("screen-stats");
  root.innerHTML = `
    <div class="history-head">
      <button class="icon-btn" id="st-back" aria-label="Indietro">${iconSvg(
        "arrow-left"
      )}</button>
      <div class="history-title">Statistiche</div>
    </div>

    <div class="stats-tabs">
      <button class="stats-tab active" data-tab="weight">Frequenza</button>
      <button class="stats-tab" data-tab="pr">PR</button>
      <button class="stats-tab" data-tab="trend">Trend</button>
      <button class="stats-tab" data-tab="freq">Peso</button>
    </div>

    <div id="view-weight" class="stats-view active"></div>
    <div id="view-pr" class="stats-view"></div>
    <div id="view-trend" class="stats-view"></div>
    <div id="view-freq" class="stats-view"></div>
  `;

  document.getElementById("st-back").onclick = openProfile;
  document.querySelectorAll(".stats-tab").forEach((b) => {
    b.onclick = () => _switchTab(b.dataset.tab);
  });

  // Carico i dati una volta, le 3 viste leggono da qui
  try {
    _statsData = await apiPost("lift_get_stats", {});
  } catch (e) {
    document.getElementById("view-freq").innerHTML =
      '<div class="empty-state">Errore: ' + escapeHtml(e.message || e) + "</div>";
    return;
  }
  _renderFreq();
  _renderPRs();
  _renderTrend(); // setup picker subito, chart al primo trigger
  _renderWeight(); // render placeholder, chart al primo switch
}

function _switchTab(name) {
  document.querySelectorAll(".stats-tab").forEach((b) =>
    b.classList.toggle("active", b.dataset.tab === name)
  );
  document.querySelectorAll(".stats-view").forEach((v) =>
    v.classList.toggle("active", v.id === "view-" + name)
  );
  if (name === "trend" && document.getElementById("trend-picker")) {
    const sel = document.getElementById("trend-picker");
    if (sel.value) _drawTrendChart(sel.value);
  }
  if (name === "weight") {
    _drawWeightChart();
  }
}

/* ---------- VISTA 1: FREQUENZA (heatmap 12 settimane) ---------- */

function _renderFreq() {
  const v = document.getElementById("view-freq");
  const freq = (_statsData && _statsData.frequency) || {};

  // 12 settimane = 84 giorni, da oggi indietro
  const weeks = 12;
  const totalDays = weeks * 7;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  // allineo a domenica (per riempire colonne settimanali)
  const lastDow = today.getDay();
  const end = new Date(today);
  end.setDate(today.getDate() + (6 - lastDow)); // sabato prossimo

  // calcolo i counts massimi per colorare i livelli
  const counts = Object.values(freq);
  const max = counts.length ? Math.max.apply(null, counts) : 0;
  const lvl = (n) => {
    if (!n) return 0;
    if (max <= 1) return 4;
    if (n >= max * 0.75) return 4;
    if (n >= max * 0.5) return 3;
    if (n >= max * 0.25) return 2;
    return 1;
  };

  const cells = [];
  let totSessions = 0;
  let totSets = 0;
  const sessionDays = new Set();
  for (let i = totalDays - 1; i >= 0; i--) {
    const d = new Date(end);
    d.setDate(end.getDate() - i);
    const key =
      d.getFullYear() +
      "-" +
      String(d.getMonth() + 1).padStart(2, "0") +
      "-" +
      String(d.getDate()).padStart(2, "0");
    const n = freq[key] || 0;
    if (n > 0) {
      sessionDays.add(key);
      totSets += n;
    }
    const tomorrow = d > today;
    cells.push(
      `<div class="hm-cell" data-level="${tomorrow ? 0 : lvl(n)}" title="${key} · ${n} set"></div>`
    );
  }
  totSessions = sessionDays.size;

  v.innerHTML = `
    <div class="heatmap-wrap">
      <div class="heatmap">${cells.join("")}</div>
    </div>
    <div class="heatmap-legend">
      <span>Poco</span>
      <span class="hm-cell" data-level="1"></span>
      <span class="hm-cell" data-level="2"></span>
      <span class="hm-cell" data-level="3"></span>
      <span class="hm-cell" data-level="4"></span>
      <span>Tanto</span>
    </div>
    <div class="stats-summary">
      <div class="stats-card"><div class="v">${totSessions}</div><div class="l">giorni allenati</div></div>
      <div class="stats-card"><div class="v">${totSets}</div><div class="l">set totali</div></div>
      <div class="stats-card"><div class="v">${weeks}w</div><div class="l">periodo</div></div>
    </div>
  `;
}

/* ---------- VISTA 2: PR ---------- */

const PR_TYPE_LABEL = {
  "1rm": "1RM stimato",
  volume: "Volume sessione",
  heaviest: "Peso piu alto",
};

function _renderPRs() {
  const v = document.getElementById("view-pr");
  const prs = (_statsData && _statsData.prs) || [];
  if (prs.length === 0) {
    v.innerHTML = `<div class="empty-state">Nessun PR registrato ancora.</div>`;
    return;
  }
  // raggruppo per exerciseRef
  const byEx = {};
  prs.forEach((p) => {
    if (!byEx[p.exerciseRef]) byEx[p.exerciseRef] = { name: p.exerciseName, items: [] };
    byEx[p.exerciseRef].items.push(p);
  });
  // ordino i gruppi per data PR piu recente
  const groups = Object.values(byEx).sort((a, b) => {
    const aMax = Math.max.apply(null, a.items.map((x) => +new Date(x.date) || 0));
    const bMax = Math.max.apply(null, b.items.map((x) => +new Date(x.date) || 0));
    return bMax - aMax;
  });
  v.innerHTML = groups
    .map(
      (g) => `
      <div class="pr-group">
        <div class="pr-group-name">${escapeHtml(g.name)}</div>
        ${g.items
          .map(
            (p) => `
          <div class="pr-row">
            <span class="pr-type">${PR_TYPE_LABEL[p.prType] || p.prType}</span>
            <span class="pr-val">${p.value}${p.prType === "heaviest" ? " kg" : ""}</span>
            <span class="pr-date">${_fmtShortDate(p.date)}</span>
          </div>`
          )
          .join("")}
      </div>`
    )
    .join("");
}

/* ---------- VISTA 3: TREND su singolo esercizio ---------- */

function _renderTrend() {
  const v = document.getElementById("view-trend");
  const list = (_statsData && _statsData.exercises) || [];
  if (list.length === 0) {
    v.innerHTML = `<div class="empty-state">Nessun esercizio registrato ancora.</div>`;
    return;
  }
  v.innerHTML = `
    <select class="trend-picker" id="trend-picker">
      ${list
        .map(
          (e) => `<option value="${escapeHtml(e.ref)}">${escapeHtml(e.name)}</option>`
        )
        .join("")}
    </select>
    <div class="trend-chart-wrap">
      <canvas id="trend-canvas"></canvas>
    </div>
  `;
  document.getElementById("trend-picker").onchange = (e) =>
    _drawTrendChart(e.target.value);
}

async function _loadChartJs() {
  if (_chartLoaded || window.Chart) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js";
    s.onload = () => {
      _chartLoaded = true;
      resolve();
    };
    s.onerror = () => reject(new Error("Chart.js non caricato"));
    document.head.appendChild(s);
  });
}

/* ---------- VISTA 4: PESO CORPOREO ---------- */

let _weightChart = null;

function _renderWeight() {
  const v = document.getElementById("view-weight");
  v.innerHTML = `
    <div id="weight-summary" class="stats-summary stats-summary--top"></div>
    <div class="trend-chart-wrap">
      <canvas id="weight-canvas"></canvas>
    </div>
  `;
}

/**
 * Media peso di una settimana (lun-dom) `weeksAgo` settimane fa rispetto a oggi.
 * weeksAgo=1 → settimana scorsa completa; =2 → quella prima.
 * Ritorna { avg, from, to, count } o null se nessuna pesata in quella settimana.
 */
function _weeklyAvg(log, weeksAgo) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  // lunedì della settimana CORRENTE
  const dow = today.getDay(); // 0=dom
  const offToMon = dow === 0 ? 6 : dow - 1;
  const monThis = new Date(today);
  monThis.setDate(today.getDate() - offToMon);
  // lunedì e domenica della settimana target
  const from = new Date(monThis);
  from.setDate(monThis.getDate() - 7 * weeksAgo);
  const to = new Date(from);
  to.setDate(from.getDate() + 6);
  to.setHours(23, 59, 59, 999);

  const inWeek = log.filter((p) => {
    const d = new Date(p.date);
    d.setHours(12, 0, 0, 0);
    return d >= from && d <= to;
  });
  if (inWeek.length === 0) return null;
  const avg = inWeek.reduce((s, p) => s + p.weight, 0) / inWeek.length;
  return { avg: avg, from: from, to: to, count: inWeek.length };
}

/** Card "media sett. scorsa" con semaforo vs penultima settimana. */
function _weightAvgCardHtml(lastWeek, prevWeek) {
  if (!lastWeek) {
    return `<div class="stats-card stats-card--wide">
      <div class="v">—</div>
      <div class="l">media sett. scorsa</div>
    </div>`;
  }
  const fmt = (d) =>
    d.toLocaleDateString("it-IT", { day: "numeric", month: "short" });
  const range = `${fmt(lastWeek.from)}–${fmt(lastWeek.to)}`;

  // semaforo: confronto con la penultima settimana (se c'è)
  let cls = "wavg-neutral";
  if (prevWeek) {
    const diff = lastWeek.avg - prevWeek.avg;
    if (diff <= 0.3) cls = "wavg-good";
    else if (diff <= 1.0) cls = "wavg-warn";
    else cls = "wavg-bad";
  }
  return `<div class="stats-card stats-card--wide wavg ${cls}">
    <div class="v">${lastWeek.avg.toFixed(1)}</div>
    <div class="l">media sett. scorsa · ${range}</div>
  </div>`;
}

async function _drawWeightChart() {
  await _loadChartJs();
  const boot = await apiGet("lift_get_data", {}, { silent: true });
  const log = ((boot && boot.weightLog) || [])
    .filter((w) => w.weightKg)
    .map((w) => ({
      date: w.date ? new Date(w.date) : new Date(),
      weight: parseFloat(w.weightKg),
    }))
    .sort((a, b) => a.date - b.date);

  const sum = document.getElementById("weight-summary");
  if (log.length === 0) {
    if (sum)
      sum.innerHTML = `<div class="empty-state stats-empty-full">Nessuna registrazione peso ancora.</div>`;
    return;
  }
  const current = log[log.length - 1].weight;
  const min = Math.min.apply(null, log.map((p) => p.weight));
  const max = Math.max.apply(null, log.map((p) => p.weight));

  // Media settimana scorsa completa (lun-dom) + confronto con la penultima
  const lastWeek = _weeklyAvg(log, 1); // {avg, from, to, count} o null
  const prevWeek = _weeklyAvg(log, 2);
  const avgCardHtml = _weightAvgCardHtml(lastWeek, prevWeek);

  if (sum)
    sum.innerHTML = `
      <div class="stats-card"><div class="v">${current.toFixed(1)}</div><div class="l">attuale kg</div></div>
      <div class="stats-card"><div class="v">${min.toFixed(1)}</div><div class="l">min kg</div></div>
      <div class="stats-card"><div class="v">${max.toFixed(1)}</div><div class="l">max kg</div></div>
      ${avgCardHtml}
    `;

  const ctx = document.getElementById("weight-canvas");
  if (!ctx) return;
  if (_weightChart) _weightChart.destroy();
  _weightChart = new window.Chart(ctx, {
    type: "line",
    data: {
      labels: log.map((p) =>
        p.date.toLocaleDateString("it-IT", { day: "2-digit", month: "short" })
      ),
      datasets: [
        {
          label: "Peso (kg)",
          data: log.map((p) => p.weight),
          borderColor: getComputedStyle(document.body)
            .getPropertyValue("--accent")
            .trim() || "#4ade80",
          backgroundColor: "rgba(74,222,128,0.18)",
          tension: 0.25,
          fill: true,
          pointRadius: 3,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: {
          ticks: { color: "#9aa3ad", font: { size: 10 } },
          grid: { color: "rgba(255,255,255,0.04)" },
        },
        y: {
          ticks: { color: "#9aa3ad", font: { size: 10 } },
          grid: { color: "rgba(255,255,255,0.06)" },
          beginAtZero: false,
        },
      },
    },
  });
}

async function _drawTrendChart(ref) {
  await _loadChartJs();
  let res;
  try {
    res = await apiPost("lift_get_exercise_trend", { exerciseRef: ref });
  } catch (e) {
    return;
  }
  const points = (res && res.points) || [];
  const ctx = document.getElementById("trend-canvas");
  if (!ctx) return;
  if (_trendChart) _trendChart.destroy();
  _trendChart = new window.Chart(ctx, {
    type: "line",
    data: {
      labels: points.map((p) =>
        new Date(p.date).toLocaleDateString("it-IT", {
          day: "2-digit",
          month: "short",
        })
      ),
      datasets: [
        {
          label: "Peso top set (kg)",
          data: points.map((p) => p.weight),
          borderColor: getComputedStyle(document.body)
            .getPropertyValue("--accent")
            .trim() || "#4ade80",
          backgroundColor: "rgba(74,222,128,0.18)",
          tension: 0.25,
          fill: true,
          pointRadius: 3,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: {
          ticks: { color: "#9aa3ad", font: { size: 10 } },
          grid: { color: "rgba(255,255,255,0.04)" },
        },
        y: {
          ticks: { color: "#9aa3ad", font: { size: 10 } },
          grid: { color: "rgba(255,255,255,0.06)" },
          beginAtZero: false,
        },
      },
    },
  });
}
