/*
  Dashboard.js
  Loads progress from localStorage (key: tangram_progress), shows summary and level breakdown,
  supports export/import (JSON), CSV download, and clearing progress.
*/

(function () {
  const STORAGE_KEY = "tangram_progress";

  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));

  function loadProgress() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : { levels: {}, attempts: 0 };
    } catch (e) {
      return { levels: {}, attempts: 0 };
    }
  }

  function saveProgress(p) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
    } catch (e) {}
  }

  function render() {
    const progress = loadProgress();
    renderSummary(progress);
    renderLevelsTable(progress);
    renderInsights(progress);
  }

  function renderSummary(progress) {
    const summary = $("#summary");
    const levels = progress.levels || {};
    const totalPlays = Object.values(levels).reduce((s, l) => s + (l.plays || 0), 0);
    const totalStars = Object.values(levels).reduce((s, l) => s + (l.stars || 0), 0);
    const patternsCompleted = Object.values(levels).filter(l => (l.stars || 0) > 0).length;
    const attempts = progress.attempts || 0;

    summary.innerHTML = `
      <div style="display:flex;gap:12px;flex-wrap:wrap">
        <div class="db-card" style="padding:10px;">
          <strong>${totalPlays}</strong><div class="small">Total plays</div>
        </div>
        <div class="db-card" style="padding:10px;">
          <strong>${totalStars}</strong><div class="small">Total stars</div>
        </div>
        <div class="db-card" style="padding:10px;">
          <strong>${patternsCompleted}</strong><div class="small">Patterns completed</div>
        </div>
        <div class="db-card" style="padding:10px;">
          <strong>${attempts}</strong><div class="small">Attempts</div>
        </div>
      </div>
    `;
  }

  function renderLevelsTable(progress) {
    const tbody = $("#levels-body");
    tbody.innerHTML = "";
    const levels = progress.levels || {};
    const keys = Object.keys(levels).sort();
    if (!keys.length) {
      tbody.innerHTML = `<tr><td colspan="5" class="small">No level data yet.</td></tr>`;
      return;
    }
    keys.forEach(k => {
      const info = levels[k];
      // key format: grid{grid}_id{patternId} (we saved it this way in game)
      const m = /^grid(\d+)_id(.+)$/.exec(k);
      const grid = m ? m[1] : "-";
      const pid = m ? m[2] : k;
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${pid}</td>
        <td>${grid}</td>
        <td>${info.plays || 0}</td>
        <td>${info.stars || 0}</td>
        <td>${info.hints || 0}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  function renderInsights(progress) {
    const el = $("#insights");
    const levels = progress.levels || {};
    const totalPatterns = Object.keys(levels).length;
    const avgStars = totalPatterns ? (Object.values(levels).reduce((s,l)=>s+(l.stars||0),0)/totalPatterns).toFixed(2) : "0";
    el.innerHTML = `
      <p class="small">Stored patterns: <strong>${totalPatterns}</strong></p>
      <p class="small">Average stars: <strong>${avgStars}</strong></p>
      <p class="small">Progress is stored locally in the browser. Use Export to save a copy.</p>
    `;
  }

  // Export progress as JSON file
  function exportProgress() {
    const progress = loadProgress();
    const dataStr = JSON.stringify(progress, null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "tangram_progress.json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  // Import progress: merge levels and attempts
  function importProgress(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const incoming = JSON.parse(reader.result);
        if (!incoming || typeof incoming !== "object") throw new Error("Invalid file");
        const existing = loadProgress();
        const merged = { levels: Object.assign({}, existing.levels || {}, incoming.levels || {}), attempts: (existing.attempts || 0) + (incoming.attempts || 0) };
        saveProgress(merged);
        render();
        alert("Progress imported and merged.");
      } catch (e) {
        alert("Failed to import progress: " + e.message);
      }
    };
    reader.readAsText(file);
  }

  // Clear entire progress
  function clearProgress() {
    if (!confirm("Reset all progress? This will clear stored stars and plays.")) return;
    localStorage.removeItem(STORAGE_KEY);
    render();
  }

  // Clear only levels (keep attempts)
  function clearLevels() {
    if (!confirm("Clear only level data? Attempts will be preserved.")) return;
    const p = loadProgress();
    p.levels = {};
    saveProgress(p);
    render();
  }

  // Download CSV representation
  function downloadCSV() {
    const progress = loadProgress();
    const rows = [["pattern","grid","plays","stars","hints"]];
    const levels = progress.levels || {};
    Object.keys(levels).forEach(k => {
      const info = levels[k];
      const m = /^grid(\d+)_id(.+)$/.exec(k);
      const grid = m ? m[1] : "";
      const pid = m ? m[2] : k;
      rows.push([pid, grid, info.plays||0, info.stars||0, info.hints||0]);
    });
    const csv = rows.map(r => r.map(cell => `"${String(cell).replace(/"/g,'""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "tangram_progress.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  // Wire up buttons
  function attachHandlers() {
    $("#export-btn") && $("#export-btn").addEventListener("click", exportProgress);
    $("#import-file") && $("#import-file").addEventListener("change", (e) => {
      const f = e.target.files && e.target.files[0];
      if (f) importProgress(f);
      e.target.value = "";
    });
    $("#clear-btn") && $("#clear-btn").addEventListener("click", clearProgress);
    $("#download-csv") && $("#download-csv").addEventListener("click", downloadCSV);
    $("#clear-levels") && $("#clear-levels").addEventListener("click", clearLevels);
  }

  // Init
  document.addEventListener("DOMContentLoaded", () => {
    attachHandlers();
    render();
  });
})();
