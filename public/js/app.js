// app.js — SONIQ main application
(function () {
  'use strict';

  // ── State ──────────────────────────────────────────────────────
  let sessionId = null;
  let transcriptData = null;
  let speakerNames = {};
  let pollTimer = null;
  let audioCtx = null;
  let analyserNode = null;
  let sourceNode = null;
  let isDragging = false;
  let stopIdleAnim = null;
  let stopProcessAnim = null;
  let selectedFile = null;
  let speakerCount = 2;
  // word edit state
  let popoverUttIdx = null;
  let popoverWordIdx = null;

  const CONF_THRESHOLD = 0.8;
  const SPEAKER_LABELS = ['A','B','C','D','E','F','G','H'];

  // ── Element refs ───────────────────────────────────────────────
  const $ = id => document.getElementById(id);
  const uploadSection     = $('uploadSection');
  const processingSection = $('processingSection');
  const resultSection     = $('resultSection');
  const dropZone          = $('dropZone');
  const fileInput         = $('fileInput');
  const fileInfo          = $('fileInfo');
  const fileName          = $('fileName');
  const transcribeBtn     = $('transcribeBtn');
  const spkMinus          = $('spkMinus');
  const spkPlus           = $('spkPlus');
  const spkCount          = $('spkCount');
  const utterancesEl      = $('utterances');
  const speakerLegend     = $('speakerLegend');
  const flaggedBadge      = $('flaggedBadge');
  const copyDisplay       = $('copyDisplay');
  const cpTimestamps      = $('cpTimestamps');
  const cpSpeakers        = $('cpSpeakers');
  const speakerModalOverlay  = $('speakerModalOverlay');
  const speakerModalBody     = $('speakerModalBody');
  const speakerModalClose    = $('speakerModalClose');
  const speakerModalCancel   = $('speakerModalCancel');
  const speakerModalSave     = $('speakerModalSave');
  const editSpeakersBtn      = $('editSpeakersBtn');
  const downloadModalOverlay = $('downloadModalOverlay');
  const downloadModalClose   = $('downloadModalClose');
  const downloadModalCancel  = $('downloadModalCancel');
  const downloadModalConfirm = $('downloadModalConfirm');
  const downloadTriggerBtn   = $('downloadTriggerBtn');
  const copyAllBtn        = $('copyAllBtn');
  const newBtn            = $('newBtn');
  const audioPlayer       = $('audioPlayer');
  const playPauseBtn      = $('playPauseBtn');
  const playIcon          = $('playIcon');
  const pauseIcon         = $('pauseIcon');
  const progressFill      = $('progressFill');
  const progressThumb     = $('progressThumb');
  const progressBar       = $('progressBar');
  const currentTimeEl     = $('currentTime');
  const totalTimeEl       = $('totalTime');
  const volumeSlider      = $('volumeSlider');
  const toast             = $('toast');
  const mainCanvas        = $('mainCanvas');
  const processingCanvas  = $('processingCanvas');
  const idleCanvas        = $('idleCanvas');
  const wordPopover       = $('wordPopover');
  const popoverInput      = $('popoverInput');
  const popoverCancel     = $('popoverCancel');
  const popoverSave       = $('popoverSave');

  // ── Speaker count ───────────────────────────────────────────────
  spkMinus.addEventListener('click', () => { speakerCount = Math.max(1, speakerCount-1); spkCount.textContent = speakerCount; });
  spkPlus.addEventListener('click',  () => { speakerCount = Math.min(10, speakerCount+1); spkCount.textContent = speakerCount; });

  // ── Idle canvas ─────────────────────────────────────────────────
  stopIdleAnim = Visualizer.idleAnimation(idleCanvas);

  // ── File drop/select ────────────────────────────────────────────
  dropZone.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', e => handleFile(e.target.files[0]));
  dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('dragover'); });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
  dropZone.addEventListener('drop', e => {
    e.preventDefault(); dropZone.classList.remove('dragover');
    if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
  });
  function handleFile(f) {
    if (!f) return;
    selectedFile = f;
    fileName.textContent = f.name;
    fileInfo.style.display = 'flex';
  }

  // ── Transcribe ──────────────────────────────────────────────────
  transcribeBtn.addEventListener('click', () => { if (selectedFile) startTranscription(); });

  async function startTranscription() {
    showSection('processing');
    animateSteps();
    const fd = new FormData();
    fd.append('audio', selectedFile);
    fd.append('speakersExpected', speakerCount);
    try {
      const res = await fetch('/api/transcribe', { method: 'POST', body: fd });
      const data = await res.json();
      if (!data.sessionId) throw new Error(data.error || 'Upload failed');
      sessionId = data.sessionId;
      pollTranscript();
    } catch (err) {
      showToast('❌ ' + err.message);
      showSection('upload');
    }
  }

  // ── Processing steps ────────────────────────────────────────────
  const allSteps = [$('step1'),$('step2'),$('step3'),$('step4')];
  let stepTimers = [];
  function animateSteps() {
    allSteps.forEach(s => { s.className = 'step'; });
    stepTimers.forEach(clearTimeout); stepTimers = [];
    [0, 4000, 12000, 26000].forEach((d, i) => {
      stepTimers.push(setTimeout(() => {
        if (i > 0) allSteps[i-1].className = 'step done';
        allSteps[i].className = 'step active';
      }, d));
    });
  }

  // ── Poll ────────────────────────────────────────────────────────
  function pollTranscript() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(async () => {
      try {
        const res = await fetch(`/api/transcript/${sessionId}`);
        const data = await res.json();
        if (data.status === 'completed') {
          clearInterval(pollTimer);
          stepTimers.forEach(clearTimeout);
          allSteps.forEach(s => s.className = 'step done');
          transcriptData = data;
          speakerNames = { ...data.speakerNames };
          setTimeout(() => showResult(), 500);
        } else if (data.status === 'error') {
          clearInterval(pollTimer);
          showToast('❌ ' + (data.error || 'Transcription failed'));
          showSection('upload');
        }
      } catch(e) { console.error(e); }
    }, 3000);
  }

  // ── Sections ────────────────────────────────────────────────────
  function showSection(which) {
    uploadSection.style.display     = which === 'upload'     ? '' : 'none';
    processingSection.style.display = which === 'processing' ? '' : 'none';
    resultSection.style.display     = which === 'result'     ? '' : 'none';
    if (which === 'processing') {
      if (stopProcessAnim) stopProcessAnim();
      stopProcessAnim = Visualizer.processingAnimation(processingCanvas);
    } else {
      if (stopProcessAnim) { stopProcessAnim(); stopProcessAnim = null; }
    }
    if (which === 'upload') {
      if (stopIdleAnim) stopIdleAnim();
      stopIdleAnim = Visualizer.idleAnimation(idleCanvas);
    } else {
      if (stopIdleAnim) { stopIdleAnim(); stopIdleAnim = null; }
    }
  }

  // ── Show result ─────────────────────────────────────────────────
  function showResult() {
    showSection('result');
    renderStats();
    renderLegend();
    renderUtterances();
    renderCopyDisplay();
    initVisualizer();
    loadAudioForPlayback();
  }

  function loadAudioForPlayback() {
    // Create object URL so user can play back the audio they uploaded
    if (selectedFile && audioPlayer) {
      const url = URL.createObjectURL(selectedFile);
      audioPlayer.src = url;
    }
  }

  // ── Stats ───────────────────────────────────────────────────────
  function renderStats() {
    const d = transcriptData;
    $('statDuration').textContent = d.duration ? formatTime(d.duration) : '—';
    $('statSpeakers').textContent = Object.keys(d.speakerNames || {}).length;
    $('statConfidence').textContent = d.confidence ? (d.confidence * 100).toFixed(1) + '%' : '—';
    const words = (d.utterances || []).reduce((a, u) => a + (u.words ? u.words.length : u.text.split(' ').length), 0);
    $('statWords').textContent = words.toLocaleString();
  }

  // ── Speaker helpers ─────────────────────────────────────────────
  function getLabel(speaker) { return speakerNames[speaker] || `Speaker ${speaker}`; }
  function getSpkClass(s) { const i = SPEAKER_LABELS.indexOf(s); return i >= 0 ? `spk-${SPEAKER_LABELS[i]}` : 'spk-A'; }
  function getDotClass(s)  { const i = SPEAKER_LABELS.indexOf(s); return i >= 0 ? `spk-dot-${SPEAKER_LABELS[i]}` : 'spk-dot-A'; }

  // ── Legend ──────────────────────────────────────────────────────
  function renderLegend() {
    const speakers = [...new Set((transcriptData.utterances || []).map(u => u.speaker))];
    speakerLegend.innerHTML = speakers.map(s => `
      <div class="legend-item">
        <div class="legend-dot ${getDotClass(s)}"></div>
        <span>${escHtml(getLabel(s))}</span>
      </div>`).join('');
  }

  // ── Utterances with word-level confidence ───────────────────────
  function renderUtterances() {
    const utts = transcriptData.utterances || [];
    let totalFlagged = 0;

    utterancesEl.innerHTML = utts.map((u, ui) => {
      const ts = formatTime(u.start / 1000);
      const te = formatTime(u.end / 1000);
      const label = getLabel(u.speaker);
      const cls = getSpkClass(u.speaker);
      const conf = u.confidence ? (u.confidence * 100).toFixed(0) + '%' : '';

      // Build word-level HTML
      let wordHtml = '';
      if (u.words && u.words.length > 0) {
        wordHtml = u.words.map((w, wi) => {
          const txt = w.edited !== undefined ? w.edited : w.text;
          const c = w.confidence || 1;
          const isLow = c < CONF_THRESHOLD;
          const isEdited = w.edited !== undefined;
          if (isLow && !isEdited) totalFlagged++;
          let cls2 = 'word-span';
          if (isEdited) cls2 += ' edited';
          else if (isLow) cls2 += ' low-conf';
          const title = isEdited
            ? `Edited · original confidence: ${(c*100).toFixed(0)}%`
            : isLow
              ? `Low confidence: ${(c*100).toFixed(0)}% — click to edit`
              : `${(c*100).toFixed(0)}% confidence`;
          return `<span class="${cls2}" data-ui="${ui}" data-wi="${wi}" title="${title}">${escHtml(txt)}</span> `;
        }).join('');
      } else {
        wordHtml = escHtml(u.text);
      }

      return `
        <div class="utterance" data-idx="${ui}" data-start="${u.start}">
          <div class="utterance-speaker ${cls}">${escHtml(label)}</div>
          <div class="utterance-body">
            <div class="utterance-time">${ts} → ${te}</div>
            <div class="utterance-text">${wordHtml}</div>
            ${conf ? `<div class="utterance-conf">${conf} avg confidence</div>` : ''}
          </div>
        </div>`;
    }).join('');

    // Flagged badge
    if (totalFlagged > 0) {
      flaggedBadge.textContent = `${totalFlagged} word${totalFlagged !== 1 ? 's' : ''} to review`;
      flaggedBadge.style.display = '';
    } else {
      flaggedBadge.style.display = 'none';
    }

    // Click utterance → seek audio
    utterancesEl.querySelectorAll('.utterance').forEach(el => {
      el.addEventListener('click', e => {
        if (e.target.classList.contains('word-span')) return; // word click handled below
        const start = parseFloat(el.dataset.start) / 1000;
        if (audioPlayer.src) { audioPlayer.currentTime = start; audioPlayer.play(); updatePlayState(true); }
      });
    });

    // Click low-conf word → open popover
    utterancesEl.querySelectorAll('.word-span.low-conf, .word-span.edited').forEach(span => {
      span.addEventListener('click', e => {
        e.stopPropagation();
        openWordPopover(span, parseInt(span.dataset.ui), parseInt(span.dataset.wi));
      });
    });
  }

  // ── Word edit popover ───────────────────────────────────────────
  function openWordPopover(span, uttIdx, wordIdx) {
    popoverUttIdx = uttIdx; popoverWordIdx = wordIdx;
    const word = transcriptData.utterances[uttIdx].words[wordIdx];
    const current = word.edited !== undefined ? word.edited : word.text;
    popoverInput.value = current;

    // Position near the word
    const rect = span.getBoundingClientRect();
    const pw = 220;
    let left = rect.left + window.scrollX;
    let top  = rect.bottom + window.scrollY + 6;
    if (left + pw > window.innerWidth - 16) left = window.innerWidth - pw - 16;
    wordPopover.style.left = left + 'px';
    wordPopover.style.top  = top + 'px';
    wordPopover.style.display = 'block';
    popoverInput.focus();
    popoverInput.select();
  }

  function closeWordPopover() {
    wordPopover.style.display = 'none';
    popoverUttIdx = null; popoverWordIdx = null;
  }

  async function saveWordEdit() {
    const ui = popoverUttIdx, wi = popoverWordIdx;
    if (ui == null || wi == null) return;
    const newText = popoverInput.value.trim();
    if (!newText) return;

    // Optimistic update
    transcriptData.utterances[ui].words[wi].edited = newText;
    // Rebuild utterance text
    transcriptData.utterances[ui].text = transcriptData.utterances[ui].words
      .map(w => w.edited !== undefined ? w.edited : w.text).join(' ');

    closeWordPopover();
    renderUtterances();
    renderCopyDisplay();

    // Persist to server
    try {
      await fetch(`/api/transcript/${sessionId}/word`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uttIdx: ui, wordIdx: wi, newText })
      });
    } catch(e) { console.warn('Word sync failed', e); }

    showToast('✓ Word corrected');
  }

  popoverSave.addEventListener('click', saveWordEdit);
  popoverCancel.addEventListener('click', closeWordPopover);
  popoverInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') saveWordEdit();
    if (e.key === 'Escape') closeWordPopover();
  });
  document.addEventListener('click', e => {
    if (wordPopover.style.display !== 'none' &&
        !wordPopover.contains(e.target) &&
        !e.target.classList.contains('word-span')) {
      closeWordPopover();
    }
  });

  // ── Copy-paste display ──────────────────────────────────────────
  function renderCopyDisplay() {
    const utts = transcriptData?.utterances || [];
    const showTs  = cpTimestamps.checked;
    const showSpk = cpSpeakers.checked;

    const lines = utts.map(u => {
      const label = getLabel(u.speaker);
      const ts = formatTime(u.start / 1000);
      const text = getEditedText(u);
      let line = '';
      if (showTs)  line += `[${ts}] `;
      if (showSpk) line += `${label}: `;
      line += text;
      return line;
    });

    copyDisplay.textContent = lines.join('\n\n');
  }

  cpTimestamps.addEventListener('change', renderCopyDisplay);
  cpSpeakers.addEventListener('change', renderCopyDisplay);

  function getEditedText(u) {
    if (!u.words || u.words.length === 0) return u.text;
    return u.words.map(w => w.edited !== undefined ? w.edited : w.text).join(' ');
  }

  // ── Copy all ────────────────────────────────────────────────────
  copyAllBtn.addEventListener('click', () => {
    const text = copyDisplay.textContent;
    navigator.clipboard.writeText(text).then(() => showToast('✓ Copied to clipboard'));
  });

  // ── Speaker edit modal ──────────────────────────────────────────
  editSpeakersBtn.addEventListener('click', openSpeakerModal);
  speakerModalClose.addEventListener('click', () => speakerModalOverlay.style.display = 'none');
  speakerModalCancel.addEventListener('click', () => speakerModalOverlay.style.display = 'none');
  speakerModalOverlay.addEventListener('click', e => { if (e.target === speakerModalOverlay) speakerModalOverlay.style.display = 'none'; });

  function openSpeakerModal() {
    const speakers = [...new Set((transcriptData?.utterances || []).map(u => u.speaker))];
    speakerModalBody.innerHTML = speakers.map(s => `
      <div class="speaker-field">
        <label class="speaker-field-label">
          <div class="speaker-field-dot ${getDotClass(s)}"></div>
          Speaker ${s}
        </label>
        <input type="text" data-speaker="${s}" value="${escHtml(speakerNames[s] || '')}" placeholder="Enter name…" maxlength="40" />
      </div>`).join('');
    speakerModalOverlay.style.display = 'flex';
    const first = speakerModalBody.querySelector('input');
    if (first) first.focus();
    speakerModalBody.querySelectorAll('input').forEach(inp => {
      inp.addEventListener('keydown', e => { if (e.key === 'Enter') saveSpeakerModal(); });
    });
  }

  speakerModalSave.addEventListener('click', saveSpeakerModal);
  async function saveSpeakerModal() {
    const updates = {};
    speakerModalBody.querySelectorAll('input').forEach(inp => {
      updates[inp.dataset.speaker] = inp.value.trim() || `Speaker ${inp.dataset.speaker}`;
    });
    try {
      await fetch(`/api/transcript/${sessionId}/speakers`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ speakerNames: updates })
      });
      speakerNames = { ...speakerNames, ...updates };
      speakerModalOverlay.style.display = 'none';
      renderLegend(); renderUtterances(); renderCopyDisplay();
      showToast('✓ Speaker names updated');
    } catch(e) { showToast('❌ Failed to save names'); }
  }

  // ── Download modal ──────────────────────────────────────────────
  downloadTriggerBtn.addEventListener('click', () => { downloadModalOverlay.style.display = 'flex'; });
  downloadModalClose.addEventListener('click', () => { downloadModalOverlay.style.display = 'none'; });
  downloadModalCancel.addEventListener('click', () => { downloadModalOverlay.style.display = 'none'; });
  downloadModalOverlay.addEventListener('click', e => { if (e.target === downloadModalOverlay) downloadModalOverlay.style.display = 'none'; });

  // Style card selection
  document.querySelectorAll('.style-card').forEach(card => {
    card.addEventListener('click', () => {
      document.querySelectorAll('.style-card').forEach(c => c.classList.remove('active'));
      card.classList.add('active');
      card.querySelector('input').checked = true;
    });
  });

  downloadModalConfirm.addEventListener('click', generateDocx);

  async function generateDocx() {
    const formatStyle  = document.querySelector('input[name="docStyle"]:checked')?.value || 'clean';
    const includeTimestamps  = $('dlTimestamps').checked;
    const includeSpeakerLabels = $('dlSpeakers').checked;
    const includeConfidence  = $('dlConfidence').checked;
    const includeMetadata    = $('dlMetadata').checked;

    downloadModalConfirm.textContent = 'Generating…';
    downloadModalConfirm.disabled = true;

    try {
      const res = await fetch(`/api/transcript/${sessionId}/docx`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ formatStyle, includeTimestamps, includeSpeakerLabels, includeConfidence, includeMetadata })
      });
      if (!res.ok) throw new Error('Generation failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const name = (transcriptData?.fileName || 'transcript').replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '_');
      a.href = url; a.download = `${name}_transcript.docx`;
      a.click(); URL.revokeObjectURL(url);
      downloadModalOverlay.style.display = 'none';
      showToast('✓ Word document downloaded');
    } catch(e) {
      showToast('❌ Download failed: ' + e.message);
    } finally {
      downloadModalConfirm.innerHTML = '<svg width="16" height="16" viewBox="0 0 18 18" fill="none" style="margin-right:6px"><path d="M9 2v10M5 8l4 4 4-4M3 14h12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>Generate &amp; Download';
      downloadModalConfirm.disabled = false;
    }
  }

  // ── Visualizer ──────────────────────────────────────────────────
  function initVisualizer() {
    Visualizer.stopLoop();
    Visualizer.init(mainCanvas, analyserNode);
    document.querySelectorAll('.viz-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.viz-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        Visualizer.setMode(btn.dataset.mode);
      });
    });
  }

  // ── Audio player ─────────────────────────────────────────────────
  audioPlayer.addEventListener('timeupdate', () => {
    if (!isDragging && audioPlayer.duration) {
      const pct = (audioPlayer.currentTime / audioPlayer.duration) * 100;
      progressFill.style.width = pct + '%';
      progressThumb.style.left = pct + '%';
      currentTimeEl.textContent = formatTime(audioPlayer.currentTime);
    }
    highlightActive();
  });
  audioPlayer.addEventListener('loadedmetadata', () => { totalTimeEl.textContent = formatTime(audioPlayer.duration); });
  audioPlayer.addEventListener('ended', () => updatePlayState(false));

  playPauseBtn.addEventListener('click', () => {
    if (!audioPlayer.src) return;
    if (audioPlayer.paused) {
      audioPlayer.play(); connectAudioCtx(); updatePlayState(true);
    } else {
      audioPlayer.pause(); updatePlayState(false);
    }
  });

  progressBar.addEventListener('mousedown', e => { isDragging = true; seekTo(e); });
  document.addEventListener('mousemove', e => { if (isDragging) seekTo(e); });
  document.addEventListener('mouseup', () => { isDragging = false; });
  function seekTo(e) {
    const rect = progressBar.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    progressFill.style.width = pct * 100 + '%';
    progressThumb.style.left = pct * 100 + '%';
    if (audioPlayer.duration) { audioPlayer.currentTime = pct * audioPlayer.duration; currentTimeEl.textContent = formatTime(audioPlayer.currentTime); }
  }
  volumeSlider.addEventListener('input', () => { audioPlayer.volume = volumeSlider.value; });

  function updatePlayState(playing) {
    playIcon.style.display  = playing ? 'none' : '';
    pauseIcon.style.display = playing ? '' : 'none';
  }

  function connectAudioCtx() {
    if (audioCtx) return;
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    analyserNode = audioCtx.createAnalyser();
    analyserNode.fftSize = 2048;
    sourceNode = audioCtx.createMediaElementSource(audioPlayer);
    sourceNode.connect(analyserNode);
    analyserNode.connect(audioCtx.destination);
    Visualizer.init(mainCanvas, analyserNode);
  }

  function highlightActive() {
    const t = audioPlayer.currentTime * 1000;
    utterancesEl.querySelectorAll('.utterance').forEach((el, i) => {
      const u = transcriptData?.utterances[i];
      if (!u) return;
      if (t >= u.start && t <= u.end) {
        el.classList.add('active');
        el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      } else {
        el.classList.remove('active');
      }
    });
  }

  // ── New ─────────────────────────────────────────────────────────
  newBtn.addEventListener('click', () => {
    if (!confirm('Start a new transcription? Current session will be cleared.')) return;
    sessionId = null; transcriptData = null; speakerNames = {};
    selectedFile = null; fileInput.value = '';
    fileInfo.style.display = 'none';
    audioPlayer.pause(); audioPlayer.src = '';
    updatePlayState(false); Visualizer.stopLoop();
    showSection('upload');
    stopIdleAnim = Visualizer.idleAnimation(idleCanvas);
  });

  // ── Toast ────────────────────────────────────────────────────────
  let toastTimer;
  function showToast(msg) {
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 3000);
  }

  // ── Helpers ──────────────────────────────────────────────────────
  function formatTime(sec) {
    const s = Math.floor(sec);
    return `${Math.floor(s/60)}:${(s%60).toString().padStart(2,'0')}`;
  }
  function escHtml(str) {
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

})();
