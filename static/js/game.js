/*
  Tangram Memory Puzzle - game.js
  Core game flow, drag/drop (pointer events), pattern display, guided outlines,
  progress tracking (localStorage), hints, and simple scoring.
*/

(() => {
  const config = window.APP_CONFIG || {};
  const patternsUrl = config.patternsUrl || "/static/patterns.json";
  const sounds = config.sounds || {};

  // DOM refs
  let patterns = [];
  let currentPattern = null;
  let currentGrid = 3;
  let currentMode = "guided"; // guided | free
  let viewTime = 5;
  let soundOn = true;

  const $ = sel => document.querySelector(sel);
  const $$ = sel => Array.from(document.querySelectorAll(sel));

  const refs = {};

  // Game state
  let placedMap = {}; // "r,c" -> placedPieceId
  let activeDrag = null;
  let progress = loadProgress();

  // Load DOM
  function cacheRefs() {
    refs.welcome = $("#welcome-screen");
    refs.game = $("#game-screen");
    refs.complete = $("#complete-screen");
    refs.patternCanvas = $("#pattern-canvas");
    refs.countdown = $("#countdown");
    refs.countdownOverlay = $("#countdown-overlay");
    refs.puzzleArea = $("#puzzle-area");
    refs.pieces = $("#pieces");
    refs.startBtn = $("#start-btn");
    refs.diffButtons = $$(".btn-diff");
    refs.modeButtons = $$(".btn-mode");
    refs.backMenu = $("#back-menu");
    refs.timerLabel = $("#timer");
    refs.starsLabel = $("#stars");
    refs.hintBtn = $("#hint-btn");
    refs.skipBtn = $("#skip-btn");
    refs.feedback = $("#feedback");
    refs.nextBtn = $("#next-btn");
    refs.menuBtn = $("#menu-btn");
    refs.dashboardBtn = $("#dashboard-btn");
    refs.settingsBtn = $("#settings-btn");
    refs.settingsModal = $("#settings-modal");
    refs.viewTimeInput = $("#view-time");
    refs.saveSettings = $("#save-settings");
    refs.closeSettings = $("#close-settings");
    refs.soundToggle = $("#sound-toggle");
  }

  // Utilities
  function speak(text) {
    // For screen readers / ARIA polite messages
    refs.feedback && (refs.feedback.textContent = text);
  }

  function playSound(name) {
    if (!soundOn) return;
    const src = sounds[name];
    // Try HTML5 Audio first if a file is provided
    if (src) {
      try {
        const a = new Audio(src);
        a.volume = 0.9;
        a.play().catch(()=>{});
        return;
      } catch (e) {
        // fall through to WebAudio fallback
      }
    }
    // Fallback: simple WebAudio beep so the app has audio feedback without external files
    try {
      const ctx = window.__tangram_audio_ctx || (window.__tangram_audio_ctx = new (window.AudioContext || window.webkitAudioContext)());
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      // choose frequency by event type
      if (name === "success") o.frequency.value = 880;
      else if (name === "place") o.frequency.value = 660;
      else if (name === "hint") o.frequency.value = 520;
      else o.frequency.value = 440;
      g.gain.value = 0.09;
      o.connect(g);
      g.connect(ctx.destination);
      o.start();
      setTimeout(()=>{ try { o.stop(); g.disconnect(); } catch(e){} }, 140);
    } catch (e) {
      // ignore audio errors
    }
  }

  function loadJSON(url) {
    return fetch(url, {cache: "no-store"}).then(r => {
      if (!r.ok) throw new Error("Failed to fetch " + url);
      return r.json();
    });
  }

  // LocalStorage progress
  function loadProgress() {
    try {
      const raw = localStorage.getItem("tangram_progress");
      return raw ? JSON.parse(raw) : {levels: {}, attempts: 0};
    } catch (e) { return {levels:{}, attempts:0}; }
  }
  function saveProgress() {
    try { localStorage.setItem("tangram_progress", JSON.stringify(progress)); } catch (e) {}
  }

  // Init
  function init() {
    cacheRefs();
    bindUI();
    // initial settings
    soundOn = !!refs.soundToggle && refs.soundToggle.checked;
    viewTime = Number(refs.viewTimeInput?.value || 5);

    // fetch patterns
    loadJSON(patternsUrl)
      .then(data => {
        patterns = Array.isArray(data) ? data : (data.patterns || []);
        speak("Patterns loaded. Ready to play.");
      })
      .catch(err => {
        console.error(err);
        speak("Unable to load patterns. Try refreshing.");
      });
  }

  function bindUI() {
    refs.startBtn && refs.startBtn.addEventListener("click", onStart);
    refs.diffButtons.forEach(b => b.addEventListener("click", onDiffSelect));
    refs.modeButtons.forEach(b => b.addEventListener("click", onModeSelect));
    refs.backMenu && refs.backMenu.addEventListener("click", backToMenu);
    refs.hintBtn && refs.hintBtn.addEventListener("click", onHint);
    refs.skipBtn && refs.skipBtn.addEventListener("click", onSkip);
    refs.nextBtn && refs.nextBtn.addEventListener("click", nextPattern);
    refs.menuBtn && refs.menuBtn.addEventListener("click", backToMenu);
    refs.dashboardBtn && refs.dashboardBtn.addEventListener("click", () => location.href="/dashboard");
    refs.settingsBtn && refs.settingsBtn.addEventListener("click", () => openSettings());
    refs.saveSettings && refs.saveSettings.addEventListener("click", saveSettings);
    refs.closeSettings && refs.closeSettings.addEventListener("click", closeSettings);
    refs.soundToggle && refs.soundToggle.addEventListener("change", (e) => { soundOn = e.target.checked; });
    window.addEventListener("resize", () => { /* could reposition pieces if needed */ });
  }

  // UI handlers
  function onDiffSelect(e) {
    refs.diffButtons.forEach(b=>b.setAttribute("aria-pressed","false"));
    e.currentTarget.setAttribute("aria-pressed","true");
    currentGrid = Number(e.currentTarget.dataset.grid || 3);
  }
  function onModeSelect(e) {
    refs.modeButtons.forEach(b=>b.setAttribute("aria-pressed","false"));
    e.currentTarget.setAttribute("aria-pressed","true");
    currentMode = e.currentTarget.dataset.mode || "guided";
  }

  function onStart() {
    // pick next pattern matching grid
    if (!patterns.length) {
      speak("No patterns available yet.");
      return;
    }
    // simple selection: random pattern with matching grid
    const pool = patterns.filter(p => Number(p.grid) === Number(currentGrid));
    if (!pool.length) {
      speak("No patterns available for this difficulty.");
      return;
    }
    currentPattern = pool[Math.floor(Math.random()*pool.length)];
    startGame();
  }

  function startGame() {
    // reset state
    placedMap = {};
    refs.pieces.innerHTML = "";
    refs.puzzleArea.innerHTML = "";
    refs.patternCanvas.innerHTML = "";
    refs.feedback.textContent = "";
    refs.welcome.classList.add("hidden");
    refs.game.classList.remove("hidden");
    refs.complete.classList.add("hidden");
    viewTime = Number(refs.viewTimeInput?.value || 5);
    refs.timerLabel.textContent = `View: ${viewTime}`;

    showPattern(currentPattern);
  }

  function showPattern(pattern) {
    if (!pattern) return;
    // draw pattern onto patternCanvas (grid layout)
    const pc = refs.patternCanvas;
    pc.innerHTML = "";
    pc.style.position = "relative";

    const gridN = Number(pattern.grid || currentGrid);
    // Draw a simple representation: colored boxes per cell where shape is present
    const wrapper = document.createElement("div");
    wrapper.style.width = "95%";
    wrapper.style.height = "95%";
    wrapper.style.display = "grid";
    wrapper.style.gridTemplateColumns = `repeat(${gridN},1fr)`;
    wrapper.style.gridTemplateRows = `repeat(${gridN},1fr)`;
    wrapper.style.gap = "4px";
    wrapper.style.borderRadius = "10px";
    wrapper.style.overflow = "hidden";
    wrapper.setAttribute("aria-hidden","true");

    // prepare appearance map
    const cellMap = {};
    (pattern.shapes || []).forEach(s => {
      const key = `${s.row},${s.col}`;
      cellMap[key] = s;
    });

    for (let r=0;r<gridN;r++){
      for (let c=0;c<gridN;c++){
        const cell = document.createElement("div");
        cell.style.background = "#fff";
        cell.style.borderRadius = "6px";
        cell.style.display = "flex";
        cell.style.alignItems = "center";
        cell.style.justifyContent = "center";
        cell.style.fontWeight = "800";
        cell.style.color = "#111";
        const key = `${r},${c}`;
        if (cellMap[key]) {
          // use color hint only during display
          const type = cellMap[key].type || "square";
          cell.textContent = ""; // keep children off for small children
          cell.style.background = colorForType(type);
        } else {
          cell.style.background = "transparent";
        }
        wrapper.appendChild(cell);
      }
    }
    pc.appendChild(wrapper);

    // show countdown then hide
    refs.countdown.textContent = String(viewTime);
    refs.countdownOverlay.style.display = "flex";
    startCountdown(viewTime, () => {
      refs.countdownOverlay.style.display = "none";
      preparePuzzle(pattern);
    });
  }

  function startCountdown(sec, cb) {
    let t = sec;
    refs.countdown.textContent = String(t);
    const id = setInterval(()=>{
      t--;
      refs.countdown.textContent = String(t);
      if (t<=0){
        clearInterval(id);
        refs.countdown.textContent = "0";
        setTimeout(()=>cb && cb(), 200);
      }
    },1000);
  }

  function preparePuzzle(pattern) {
    // create drop targets (if guided show outlines)
    createDropTargets(pattern);
    // render pieces palette
    renderPieces(pattern);
    // attach pointer handlers on puzzle area for drop
    refs.puzzleArea.addEventListener("pointerdown", puzzlePointerDown);
    // update timer label to show attempts/hints maybe
    refs.timerLabel.textContent = `Place pieces`;
  }

  function createDropTargets(pattern) {
    refs.puzzleArea.innerHTML = ""; // clear
    const gridN = Number(pattern.grid || currentGrid);
    const area = refs.puzzleArea;
    area.style.position = "relative";

    // create an invisible grid overlay for snapping
    const targetWrapper = document.createElement("div");
    targetWrapper.style.position = "absolute";
    targetWrapper.style.inset = "6%";
    targetWrapper.style.display = "grid";
    targetWrapper.style.gridTemplateColumns = `repeat(${gridN},1fr)`;
    targetWrapper.style.gridTemplateRows = `repeat(${gridN},1fr)`;
    targetWrapper.style.gap = "4px";
    targetWrapper.style.pointerEvents = "none";
    area.appendChild(targetWrapper);

    // fill cells with drop-targets where pattern expects pieces
    const cellMap = {};
    (pattern.shapes || []).forEach(s => {
      const idx = Number(s.row)*gridN + Number(s.col);
      cellMap[idx] = s;
    });

    for (let i=0;i<gridN*gridN;i++){
      const cellDiv = document.createElement("div");
      cellDiv.style.minHeight = "0";
      cellDiv.style.display = "block";
      cellDiv.style.position = "relative";
      if (cellMap[i]) {
        const drop = document.createElement("div");
        drop.className = "drop-target";
        drop.style.position = "absolute";
        drop.style.inset = "6%";
        drop.style.border = "3px dashed rgba(0,0,0,0.06)";
        drop.dataset.row = cellMap[i].row;
        drop.dataset.col = cellMap[i].col;
        drop.dataset.type = cellMap[i].type;
        if (currentMode === "guided"){
          drop.style.boxShadow = `inset 0 0 0 6px ${colorForType(cellMap[i].type)}22`;
        } else {
          drop.style.boxShadow = "none";
          drop.style.border = "none";
        }
        cellDiv.appendChild(drop);
      }
      targetWrapper.appendChild(cellDiv);
    }
  }

  function renderPieces(pattern) {
    refs.pieces.innerHTML = "";
    // create piece for each shape present in pattern (so counts match)
    const shapes = (pattern.shapes || []).map((s, idx) => {
      return Object.assign({}, s, {pid: `p${Date.now()}_${idx}`});
    });

    // shuffle for variety
    for (let i=shapes.length-1;i>0;i--){
      const j = Math.floor(Math.random()*(i+1));
      [shapes[i], shapes[j]] = [shapes[j], shapes[i]];
    }

    shapes.forEach(s => {
      const d = document.createElement("div");
      d.className = `piece ${s.type}`;
      d.setAttribute("role","listitem");
      d.setAttribute("tabindex","0");
      d.dataset.type = s.type;
      d.dataset.pid = s.pid;
      d.dataset.origRow = s.row;
      d.dataset.origCol = s.col;
      // label small for screen-readers
      d.setAttribute("aria-label", s.type);
      d.textContent = pieceGlyph(s.type);
      // pointer events for dragging
      d.addEventListener("pointerdown", piecePointerDown);
      refs.pieces.appendChild(d);
    });

    speak("Place the pieces to recreate the pattern.");
  }

  // Dragging using pointer events
  function piecePointerDown(e) {
    if (e.button && e.button !== 0) return;
    const el = e.currentTarget;
    e.preventDefault();
    el.setPointerCapture(e.pointerId);

    const rect = el.getBoundingClientRect();
    const clone = el.cloneNode(true);
    clone.style.position = "absolute";
    clone.style.left = `${rect.left}px`;
    clone.style.top = `${rect.top}px`;
    clone.style.width = `${rect.width}px`;
    clone.style.height = `${rect.height}px`;
    clone.style.zIndex = 9999;
    clone.classList.add("dragging");
    clone.dataset.type = el.dataset.type;
    clone.dataset.pid = el.dataset.pid || (`p_${Date.now()}`);
    document.body.appendChild(clone);

    activeDrag = {
      sourceEl: el,
      el: clone,
      offsetX: e.clientX - rect.left,
      offsetY: e.clientY - rect.top,
      pointerId: e.pointerId
    };

    clone.setPointerCapture && clone.setPointerCapture(e.pointerId);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  }

  function onPointerMove(e) {
    if (!activeDrag) return;
    e.preventDefault();
    const {el, offsetX, offsetY} = activeDrag;
    el.style.left = `${e.clientX - offsetX}px`;
    el.style.top = `${e.clientY - offsetY}px`;
  }

  function onPointerUp(e) {
    if (!activeDrag) return;
    const {el, sourceEl, pointerId} = activeDrag;
    try {
      el.releasePointerCapture && el.releasePointerCapture(pointerId);
    } catch (err){}
    // determine drop target location
    const dropResult = findNearestCell(e.clientX, e.clientY);
    if (dropResult) {
      const {row, col, distance} = dropResult;
      const pattern = currentPattern;
      const gridN = Number(pattern.grid || currentGrid);
      const match = (pattern.shapes || []).find(s => Number(s.row) === row && Number(s.col) === col);
      if (match && match.type === el.dataset.type && !placedMap[`${row},${col}`]) {
        // correct placement
        snapToCell(el, row, col);
        placedMap[`${row},${col}`] = el.dataset.pid;
        sourceEl.classList.add("correct");
        el.classList.add("correct");
        playSound("place");
        checkWin();
      } else {
        // incorrect
        el.classList.add("incorrect");
        playSound("hint");
        // animate back and remove clone
        setTimeout(()=> {
          el.remove();
          activeDrag = null;
        }, 500);
        // small feedback
        speak("Try again!");
      }
    } else {
      // dropped outside, remove clone
      el.remove();
      activeDrag = null;
    }

    // cleanup
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
  }

  function snapToCell(el, row, col) {
    // position element within puzzleArea to align with cell
    const areaRect = refs.puzzleArea.getBoundingClientRect();
    const gridN = Number(currentPattern.grid || currentGrid);
    const insetPct = 0.06; // same as createDropTargets uses inset 6%
    const left = areaRect.left + areaRect.width * insetPct;
    const top = areaRect.top + areaRect.height * insetPct;
    const usableW = areaRect.width * (1 - insetPct*2);
    const usableH = areaRect.height * (1 - insetPct*2);
    const cellW = usableW / gridN;
    const cellH = usableH / gridN;

    const cellLeft = left + col * cellW;
    const cellTop = top + row * cellH;

    el.style.left = `${cellLeft + (cellW - el.offsetWidth)/2}px`;
    el.style.top = `${cellTop + (cellH - el.offsetHeight)/2}px`;
    // attach inside puzzleArea
    refs.puzzleArea.appendChild(el);
    el.style.position = "absolute";
    el.style.zIndex = 400;
    // remove pointer handlers to make placed stable
    el.style.touchAction = "none";
  }

  function findNearestCell(clientX, clientY) {
    const areaRect = refs.puzzleArea.getBoundingClientRect();
    if (clientX < areaRect.left || clientX > areaRect.right || clientY < areaRect.top || clientY > areaRect.bottom) {
      return null;
    }
    const pattern = currentPattern;
    const gridN = Number(pattern.grid || currentGrid);
    const insetPct = 0.06;
    const left = areaRect.left + areaRect.width * insetPct;
    const top = areaRect.top + areaRect.height * insetPct;
    const usableW = areaRect.width * (1 - insetPct*2);
    const usableH = areaRect.height * (1 - insetPct*2);
    const cellW = usableW / gridN;
    const cellH = usableH / gridN;

    const relativeX = clientX - left;
    const relativeY = clientY - top;
    let col = Math.floor(relativeX / cellW);
    let row = Math.floor(relativeY / cellH);
    col = Math.max(0, Math.min(gridN-1, col));
    row = Math.max(0, Math.min(gridN-1, row));
    const cellCenterX = left + col*cellW + cellW/2;
    const cellCenterY = top + row*cellH + cellH/2;
    const dx = clientX - cellCenterX;
    const dy = clientY - cellCenterY;
    const dist = Math.sqrt(dx*dx + dy*dy);
    return {row, col, distance: dist};
  }

  function puzzlePointerDown(e) {
    // future: support repositioning placed pieces
  }

  function checkWin() {
    const pattern = currentPattern;
    const needed = (pattern.shapes || []).length;
    const placedCount = Object.keys(placedMap).length;
    if (placedCount >= needed) {
      // compute stars: quick simple rule: 3 stars if no hints used, else fewer
      const key = `grid${pattern.grid}_id${pattern.id}`;
      progress.levels[key] = progress.levels[key] || {plays:0, stars:0, hints:0};
      progress.levels[key].plays += 1;
      const usedHints = progress.levels[key].hints || 0;
      let earned = 3;
      if (usedHints >= 1) earned = 2;
      if (usedHints >= 2) earned = 1;
      progress.levels[key].stars = Math.max(progress.levels[key].stars || 0, earned);
      progress.attempts = (progress.attempts || 0) + 1;
      saveProgress();

      // celebration
      showComplete(earned);
    }
  }

  function showComplete(stars) {
    refs.complete.classList.remove("hidden");
    refs.complete.setAttribute("aria-hidden","false");
    refs.game.classList.add("hidden");
    refs.earnedStars && (refs.earnedStars.textContent = String(stars));
    refs.completionSummary = refs.completionSummary || $("#completion-summary");
    playSound("success");
    speak("Great job! You completed the pattern.");
  }

  function nextPattern() {
    // reset hints for this pattern
    const key = `grid${currentPattern.grid}_id${currentPattern.id}`;
    if (progress.levels[key]) progress.levels[key].hints = 0;
    saveProgress();
    // auto start a new one
    onStart();
  }

  function backToMenu() {
    refs.welcome.classList.remove("hidden");
    refs.game.classList.add("hidden");
    refs.complete.classList.add("hidden");
    refs.patternCanvas.innerHTML = "";
    refs.pieces.innerHTML = "";
  }

  // hints
  function onHint() {
    if (!currentPattern) return;
    const key = `grid${currentPattern.grid}_id${currentPattern.id}`;
    progress.levels[key] = progress.levels[key] || {plays:0, stars:0, hints:0};
    progress.levels[key].hints = (progress.levels[key].hints || 0) + 1;
    saveProgress();
    // find first unfilled cell and animate outline
    const pattern = currentPattern;
    const gridN = Number(pattern.grid || currentGrid);
    const firstMissing = (pattern.shapes || []).find(s => !placedMap[`${s.row},${s.col}`]);
    if (!firstMissing) {
      speak("All pieces already placed.");
      return;
    }
    // highlight matching drop-target (if present)
    const targets = refs.puzzleArea.querySelectorAll(".drop-target");
    targets.forEach(t => {
      if (Number(t.dataset.row)===Number(firstMissing.row) && Number(t.dataset.col)===Number(firstMissing.col)) {
        t.style.transition = "box-shadow 180ms ease, transform 180ms ease";
        t.style.transform = "scale(1.04)";
        t.style.boxShadow = `inset 0 0 0 8px ${colorForType(firstMissing.type)}66`;
        setTimeout(()=> {
          t.style.transform = "scale(1)";
          t.style.boxShadow = (currentMode==="guided") ? `inset 0 0 0 6px ${colorForType(firstMissing.type)}22` : "none";
        }, 900);
        playSound("hint");
        speak("Here's a hint.");
      }
    });
  }

  function onSkip() {
    // treat as failure and reveal solution briefly
    revealSolutionThenNext();
  }

  function revealSolutionThenNext() {
    const pattern = currentPattern;
    if (!pattern) return;
    // fill puzzle area with color boxes matching pattern positions
    const area = refs.puzzleArea;
    // create overlay for reveal
    const overlay = document.createElement("div");
    overlay.style.position = "absolute";
    overlay.style.inset = "6%";
    overlay.style.display = "grid";
    overlay.style.gridTemplateColumns = `repeat(${pattern.grid},1fr)`;
    overlay.style.gridTemplateRows = `repeat(${pattern.grid},1fr)`;
    overlay.style.gap = "4px";
    overlay.style.pointerEvents = "none";
    overlay.style.zIndex = 800;
    const cellMap = {};
    (pattern.shapes || []).forEach(s => { cellMap[`${s.row},${s.col}`] = s; });
    for (let r=0;r<pattern.grid;r++){
      for (let c=0;c<pattern.grid;c++){
        const cell = document.createElement("div");
        const key = `${r},${c}`;
        if (cellMap[key]) {
          cell.style.background = colorForType(cellMap[key].type);
          cell.style.borderRadius = "8px";
        } else {
          cell.style.background = "transparent";
        }
        overlay.appendChild(cell);
      }
    }
    area.appendChild(overlay);
    setTimeout(()=>{
      overlay.remove();
      // award zero stars, go to next
      const key = `grid${pattern.grid}_id${pattern.id}`;
      progress.levels[key] = progress.levels[key] || {plays:0, stars:0, hints:0};
      progress.levels[key].plays += 1;
      saveProgress();
      onStart();
    }, 1500);
  }

  // Helpers for visuals
  function colorForType(type) {
    switch(type){
      case "circle": return "#e74c3c";
      case "square": return "#3498db";
      case "triangle": return "#f1c40f";
      case "rectangle": return "#2ecc71";
      case "diamond": return "#9b59b6";
      case "star": return "#e67e22";
      case "heart": return "#ff6384";
    }
    return "#777";
  }
  function pieceGlyph(type) {
    switch(type){
      case "circle": return "●";
      case "square": return "■";
      case "triangle": return "▲";
      case "rectangle": return "▭";
      case "diamond": return "◆";
      case "star": return "★";
      case "heart": return "❤";
    }
    return "?";
  }

  // Settings modal
  function openSettings(){
    refs.settingsModal.classList.remove("hidden");
  }
  function closeSettings(){
    refs.settingsModal.classList.add("hidden");
  }
  function saveSettings(){
    viewTime = Number(refs.viewTimeInput.value || 5);
    soundOn = !!refs.soundOn?.checked || !!refs.soundToggle?.checked;
    closeSettings();
  }

  // Expose some functions for debugging
  window.tangram = {
    init, loadJSON, getPatterns: () => patterns, getProgress: () => progress
  };

  // Start on DOM ready
  document.addEventListener("DOMContentLoaded", init);
})();
