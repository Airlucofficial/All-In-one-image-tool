/**
 * Luminary Image Studio - Master Application Controller
 * Connects UI, CanvasEngine, Compressor, Palette, Batch & History modules.
 */

document.addEventListener('DOMContentLoaded', () => {
  // 1. Initialize Core Engines
  const historyStatusText = document.getElementById('historyStatusText');
  const engine = new CanvasEngine();
  const history = new HistoryManager({
    onHistoryChange: (actions) => renderHistoryLists(actions),
    onStatusChange: (status) => {
      if (historyStatusText) historyStatusText.textContent = status;
    }
  });
  const batch = new BatchProcessor();

  // 2. DOM Elements
  const dropZone = document.getElementById('dropZone');
  const fileInput = document.getElementById('fileInput');
  const dropFileInput = document.getElementById('dropFileInput');
  const canvasWrapper = document.getElementById('canvasWrapper');
  const mainCanvas = document.getElementById('mainCanvas');
  const canvasViewport = document.getElementById('canvasViewport');

  // Toolbar & HUD
  const dimensionsText = document.getElementById('dimensionsText');
  const sizeText = document.getElementById('sizeText');
  const mpText = document.getElementById('mpText');
  const undoBtn = document.getElementById('undoBtn');
  const redoBtn = document.getElementById('redoBtn');
  const splitViewBtn = document.getElementById('splitViewBtn');
  const resetImgBtn = document.getElementById('resetImgBtn');
  const topDownloadBtn = document.getElementById('topDownloadBtn');
  const zoomInBtn = document.getElementById('zoomInBtn');
  const zoomOutBtn = document.getElementById('zoomOutBtn');
  const zoomFitBtn = document.getElementById('zoomFitBtn');
  const zoomLevelText = document.getElementById('zoomLevelText');

  // Split Viewer
  const splitViewer = document.getElementById('splitViewer');
  const splitCanvas = document.getElementById('splitCanvas');
  const splitLine = document.getElementById('splitLine');

  // Crop Overlay
  const cropOverlay = document.getElementById('cropOverlay');
  const cropBox = document.getElementById('cropBox');
  const toggleCropModeBtn = document.getElementById('toggleCropModeBtn');

  // Tool Navigation & Panels
  const toolBtns = document.querySelectorAll('.tool-tab-btn');
  const toolSections = document.querySelectorAll('.tool-section');
  const panelTitle = document.getElementById('panelTitle');
  const panelSubtitle = document.getElementById('panelSubtitle');
  const applyToolBtn = document.getElementById('applyToolBtn');
  const revertToolBtn = document.getElementById('revertToolBtn');

  // Samples
  const samplePhotoBtn = document.getElementById('samplePhotoBtn');
  const samplePortraitBtn = document.getElementById('samplePortraitBtn');
  const sampleLogoBtn = document.getElementById('sampleLogoBtn');

  // Modals & Toasts
  const historyModal = document.getElementById('historyModal');
  const historyIndicatorBtn = document.getElementById('historyIndicatorBtn');
  const closeHistoryModalBtn = document.getElementById('closeHistoryModalBtn');
  const modalHistoryTimeline = document.getElementById('modalHistoryTimeline');
  const sideHistoryTimeline = document.getElementById('sideHistoryTimeline');
  const exportHistoryMdBtn = document.getElementById('exportHistoryMdBtn');
  const toastContainer = document.getElementById('toastContainer');

  // State
  let currentTool = 'convert';
  let isSplitActive = false;
  let isCropActive = false;
  let currentZoom = 1.0;
  let pickedColor = { r: 255, g: 255, b: 255, hex: '#FFFFFF' };
  let isPickingColor = false;
  let watermarkLogoImg = null;

  // Sync canvas display
  function syncCanvasDisplay() {
    const rendered = engine.getCanvas();
    mainCanvas.width = rendered.width;
    mainCanvas.height = rendered.height;
    const ctx = mainCanvas.getContext('2d');
    ctx.clearRect(0, 0, mainCanvas.width, mainCanvas.height);
    ctx.drawImage(rendered, 0, 0);

    updateHUD();
    updateUndoRedoUI();
  }

  function updateHUD() {
    const c = engine.getCanvas();
    if (!c.width || !c.height) {
      dimensionsText.textContent = 'No image loaded';
      sizeText.textContent = '0 KB';
      mpText.textContent = '0.0 MP';
      return;
    }
    const mp = SmartCompressor.calculateMegapixels(c.width, c.height);
    dimensionsText.textContent = `${c.width} × ${c.height} px`;
    mpText.textContent = `${mp} MP`;

    // Estimate memory/size: prioritize verified compressed blob or dynamic estimate
    if (engine.lastCompressedBlob) {
      const sizeStr = SmartCompressor.formatBytes(engine.lastCompressedBlob.size);
      sizeText.textContent = sizeStr;
      const estSizeBadge = document.getElementById('convertEstSize');
      if (estSizeBadge) estSizeBadge.textContent = sizeStr;
      const compressResultBadge = document.getElementById('compressResultBadge');
      if (compressResultBadge) {
        compressResultBadge.textContent = `${sizeStr} (Ready to Export)`;
        compressResultBadge.style.background = 'rgba(52, 199, 89, 0.15)';
        compressResultBadge.style.color = '#248a3d';
      }
    } else {
      const activeConvertBtn = document.querySelector('#convertFormatGroup .pill-option-btn.active');
      const activeCompressBtn = document.querySelector('#compressFormatGroup .pill-option-btn.active');
      const fmt = (currentTool === 'compress' && activeCompressBtn)
        ? activeCompressBtn.dataset.fmt
        : (engine.exportFormat || (activeConvertBtn ? activeConvertBtn.dataset.fmt : 'image/jpeg'));
      const q = (currentTool === 'convert')
        ? (parseInt(document.getElementById('convertQualitySlider').value) / 100)
        : (engine.exportQuality || 0.92);

      engine.exportBlob(fmt, q).then(b => {
        sizeText.textContent = SmartCompressor.formatBytes(b.size);
        const estSizeBadge = document.getElementById('convertEstSize');
        if (estSizeBadge) estSizeBadge.textContent = SmartCompressor.formatBytes(b.size);
      }).catch(() => {});
    }
  }

  function syncFormatPillsToMime(mime) {
    if (!mime) return;
    engine.exportFormat = mime;

    // Sync convert format pills
    const convertFmtBtns = document.querySelectorAll('#convertFormatGroup .pill-option-btn');
    convertFmtBtns.forEach(b => {
      b.classList.toggle('active', b.dataset.fmt === mime);
    });
    if (!Array.from(convertFmtBtns).some(b => b.classList.contains('active'))) {
      const def = document.querySelector('#convertFormatGroup [data-fmt="image/jpeg"]');
      if (def) def.classList.add('active');
    }

    // Sync compress format pills (JPEG or WEBP)
    const compPills = document.querySelectorAll('#compressFormatGroup .pill-option-btn');
    if (mime === 'image/webp') {
      compPills.forEach(b => b.classList.toggle('active', b.dataset.fmt === 'image/webp'));
    } else {
      compPills.forEach(b => b.classList.toggle('active', b.dataset.fmt === 'image/jpeg'));
    }

    const isLossy = (mime === 'image/jpeg' || mime === 'image/webp' || mime === 'image/avif');
    const convertQualityGroup = document.getElementById('convertQualityGroup');
    if (convertQualityGroup) convertQualityGroup.style.display = isLossy ? 'flex' : 'none';
  }

  function syncConvertUI(fmt, quality) {
    if (!fmt) return;
    const convertFmtBtns = document.querySelectorAll('#convertFormatGroup .pill-option-btn');
    convertFmtBtns.forEach(b => {
      b.classList.toggle('active', b.dataset.fmt === fmt);
    });

    const compPills = document.querySelectorAll('#compressFormatGroup .pill-option-btn');
    compPills.forEach(b => {
      b.classList.toggle('active', b.dataset.fmt === fmt);
    });

    const isLossy = (fmt === 'image/jpeg' || fmt === 'image/webp' || fmt === 'image/avif');
    const convertQualityGroup = document.getElementById('convertQualityGroup');
    if (convertQualityGroup) convertQualityGroup.style.display = isLossy ? 'flex' : 'none';

    if (quality !== undefined && quality !== null) {
      const qVal = Math.round(quality * 100);
      const convertQualitySlider = document.getElementById('convertQualitySlider');
      const convertQualityBadge = document.getElementById('convertQualityBadge');
      if (convertQualitySlider) convertQualitySlider.value = qVal;
      if (convertQualityBadge) convertQualityBadge.textContent = `${qVal}%`;
    }
  }

  function updateUndoRedoUI() {
    undoBtn.disabled = !history.canUndo();
    redoBtn.disabled = !history.canRedo();
  }

  function showToast(msg, duration = 2800) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.innerHTML = `<span>${msg}</span>`;
    toastContainer.appendChild(t);
    setTimeout(() => {
      t.style.opacity = '0';
      t.style.transform = 'translateY(10px)';
      t.style.transition = 'all 0.3s ease';
      setTimeout(() => t.remove(), 300);
    }, duration);
  }

  // 3. Image Loading
  function handleFile(file) {
    if (!file || !file.type.startsWith('image/')) {
      showToast('Please select a valid image file');
      return;
    }

    engine.loadImage(file).then(meta => {
      dropZone.style.display = 'none';
      canvasWrapper.style.display = 'inline-flex';
      resetImgBtn.style.display = 'inline-flex';

      syncFormatPillsToMime(meta.type);

      // Save initial undo snapshot
      history.pushUndoState(engine.getBaseCanvas(), `Loaded ${meta.name}`);
      history.logAction('Load Image', `Opened ${meta.name} (${meta.width}×${meta.height} px, ${SmartCompressor.calculateMegapixels(meta.width, meta.height)} MP)`);

      syncCanvasDisplay();
      if (typeof updateCompressTargetStatus === 'function') updateCompressTargetStatus();
      zoomFit();
      refreshColorPalette();
      showToast(`Loaded ${meta.name} successfully!`);
    }).catch(err => {
      showToast(err.message || 'Error opening image');
    });
  }

  // Synthetic Sample Image Generators (for immediate instant testing)
  function createSyntheticLandscape() {
    const canvas = document.createElement('canvas');
    canvas.width = 1920;
    canvas.height = 1280; // 2.45 Megapixels
    const ctx = canvas.getContext('2d');

    // Sky gradient (Sunset / Dawn)
    const sky = ctx.createLinearGradient(0, 0, 0, 800);
    sky.addColorStop(0, '#1e1b4b');
    sky.addColorStop(0.3, '#4338ca');
    sky.addColorStop(0.6, '#f97316');
    sky.addColorStop(1, '#fde047');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, 1920, 800);

    // Glowing Sun
    ctx.save();
    ctx.shadowColor = '#fff';
    ctx.shadowBlur = 60;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(960, 520, 85, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Distant Mountain Silhouette
    ctx.fillStyle = '#312e81';
    ctx.beginPath();
    ctx.moveTo(0, 800);
    ctx.lineTo(300, 480);
    ctx.lineTo(650, 680);
    ctx.lineTo(1050, 420);
    ctx.lineTo(1450, 650);
    ctx.lineTo(1920, 490);
    ctx.lineTo(1920, 800);
    ctx.closePath();
    ctx.fill();

    // Closer Mountain Silhouette
    ctx.fillStyle = '#1e1b4b';
    ctx.beginPath();
    ctx.moveTo(0, 800);
    ctx.lineTo(200, 600);
    ctx.lineTo(550, 750);
    ctx.lineTo(920, 540);
    ctx.lineTo(1350, 720);
    ctx.lineTo(1700, 590);
    ctx.lineTo(1920, 760);
    ctx.lineTo(1920, 800);
    ctx.closePath();
    ctx.fill();

    // Lake / Water reflection
    const water = ctx.createLinearGradient(0, 800, 0, 1280);
    water.addColorStop(0, '#0f172a');
    water.addColorStop(0.5, '#1e293b');
    water.addColorStop(1, '#020617');
    ctx.fillStyle = water;
    ctx.fillRect(0, 800, 1920, 480);

    // Reflection ripples
    ctx.fillStyle = 'rgba(253, 224, 71, 0.25)';
    for (let i = 0; i < 20; i++) {
      let ry = 810 + i * 22;
      let rw = Math.max(10, 180 - i * 6);
      ctx.fillRect(960 - rw / 2, ry, rw, 3);
    }

    const img = new Image();
    img.onload = () => {
      engine.loadFromImageElement(img, 'luminary-landscape-sample', 'image/jpeg');
      dropZone.style.display = 'none';
      canvasWrapper.style.display = 'inline-flex';
      resetImgBtn.style.display = 'inline-flex';
      syncFormatPillsToMime('image/jpeg');
      history.pushUndoState(engine.getBaseCanvas(), 'Sample Landscape (2.4 MP)');
      history.logAction('Load Sample', 'Generated Landscape Sample (1920×1280, 2.45 MP)');
      syncCanvasDisplay();
      if (typeof updateCompressTargetStatus === 'function') updateCompressTargetStatus();
      zoomFit();
      refreshColorPalette();
      showToast('Loaded 2.4 MP Landscape Sample!');
    };
    img.src = canvas.toDataURL('image/jpeg', 0.95);
  }

  function createSyntheticPortrait() {
    const canvas = document.createElement('canvas');
    canvas.width = 1080;
    canvas.height = 1920; // 9:16 Mobile / Stories 2.07 MP
    const ctx = canvas.getContext('2d');

    // Apple-style abstract wallpaper background
    const bg = ctx.createLinearGradient(0, 0, 1080, 1920);
    bg.addColorStop(0, '#fbcfe8');
    bg.addColorStop(0.5, '#c084fc');
    bg.addColorStop(1, '#6366f1');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 1080, 1920);

    // Glowing spheres
    ctx.save();
    ctx.shadowColor = 'rgba(255,255,255,0.6)';
    ctx.shadowBlur = 80;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.beginPath();
    ctx.arc(540, 700, 280, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Sleek frosted card in center
    ctx.save();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.roundRect(160, 500, 760, 920, 48);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 56px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Luminary Studio', 540, 880);

    ctx.font = '32px -apple-system, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fillText('9:16 Portrait Canvas (2.07 MP)', 540, 960);
    ctx.restore();

    const img = new Image();
    img.onload = () => {
      engine.loadFromImageElement(img, 'luminary-portrait-9-16', 'image/jpeg');
      dropZone.style.display = 'none';
      canvasWrapper.style.display = 'inline-flex';
      resetImgBtn.style.display = 'inline-flex';
      syncFormatPillsToMime('image/jpeg');
      history.pushUndoState(engine.getBaseCanvas(), 'Sample 9:16 Portrait');
      history.logAction('Load Sample', 'Generated 9:16 Portrait Sample (1080×1920, 2.07 MP)');
      syncCanvasDisplay();
      if (typeof updateCompressTargetStatus === 'function') updateCompressTargetStatus();
      zoomFit();
      refreshColorPalette();
      showToast('Loaded 9:16 Portrait Sample!');
    };
    img.src = canvas.toDataURL('image/jpeg', 0.95);
  }

  function createSyntheticLogo() {
    const canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = 800;
    const ctx = canvas.getContext('2d');

    // Transparent canvas
    ctx.clearRect(0, 0, 800, 800);

    // Glowing badge
    const grad = ctx.createLinearGradient(150, 150, 650, 650);
    grad.addColorStop(0, '#0071e3');
    grad.addColorStop(1, '#8b5cf6');

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.roundRect(180, 180, 440, 440, 100);
    ctx.fill();

    // White Star
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(400, 400, 90, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#0071e3';
    ctx.beginPath();
    ctx.arc(400, 400, 50, 0, Math.PI * 2);
    ctx.fill();

    const img = new Image();
    img.onload = () => {
      engine.loadFromImageElement(img, 'luminary-transparent-logo', 'image/png');
      dropZone.style.display = 'none';
      canvasWrapper.style.display = 'inline-flex';
      resetImgBtn.style.display = 'inline-flex';
      syncFormatPillsToMime('image/png');
      history.pushUndoState(engine.getBaseCanvas(), 'Sample Transparent Logo');
      history.logAction('Load Sample', 'Generated Transparent Logo Sample (800×800 px)');
      syncCanvasDisplay();
      if (typeof updateCompressTargetStatus === 'function') updateCompressTargetStatus();
      zoomFit();
      refreshColorPalette();
      showToast('Loaded Transparent Logo Sample!');
    };
    img.src = canvas.toDataURL('image/png');
  }

  // Event Listeners for Uploads & Samples
  samplePhotoBtn.addEventListener('click', (e) => { e.stopPropagation(); createSyntheticLandscape(); });
  samplePortraitBtn.addEventListener('click', (e) => { e.stopPropagation(); createSyntheticPortrait(); });
  sampleLogoBtn.addEventListener('click', (e) => { e.stopPropagation(); createSyntheticLogo(); });

  fileInput.addEventListener('change', (e) => {
    if (e.target.files.length) handleFile(e.target.files[0]);
  });
  dropFileInput.addEventListener('change', (e) => {
    if (e.target.files.length) handleFile(e.target.files[0]);
  });

  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
  });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    if (e.dataTransfer.files.length) {
      if (currentTool === 'batch') {
        batch.addFiles(e.dataTransfer.files);
        renderBatchQueue();
      } else {
        handleFile(e.dataTransfer.files[0]);
      }
    }
  });

  // 4. Tool Switching Logic
  const toolDetails = {
    convert: { title: 'Convert Format', sub: 'Change file type and export settings' },
    compress: { title: 'Compress & Size Reducer', sub: 'Reduce file size to exact KB/MB or Megapixels' },
    aspect: { title: 'Aspect Ratio & Resize', sub: '1:1, 16:9, 9:16, 4:5 with blur-pad or crop' },
    crop: { title: 'Crop, Rotate & Flip', sub: 'Precision framing, rotation and straighten' },
    transparency: { title: 'Transparency & Magic Eraser', sub: 'Alpha transparency and background eraser' },
    watermark: { title: 'Logo & Watermark Stamper', sub: 'Brand watermark with 9-point anchor snap' },
    blur: { title: 'Blur & Privacy Censor', sub: 'Gaussian, Tilt-shift and Pixelate mosaic' },
    adjust: { title: 'Pro Adjustments & Filters', sub: 'Color grading, warmth, exposure and sharpen' },
    border: { title: 'Border, Squircle & Mockup', sub: 'Apple rounded corners, frame and drop shadow' },
    palette: { title: 'Color Palette Extractor', sub: 'Sample dominant hex colors and pixel loupe' },
    batch: { title: 'Batch Multi-Image Processor', sub: 'Bulk convert, resize and export ZIP' },
    history: { title: 'Session History & Source of Truth', sub: 'Real-time action log and auto-save checkpoints' }
  };

  toolBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const tool = btn.dataset.tool;
      switchTool(tool);
    });
  });

  function switchTool(tool) {
    currentTool = tool;

    toolBtns.forEach(b => b.classList.toggle('active', b.dataset.tool === tool));
    toolSections.forEach(s => s.classList.toggle('active', s.id === `sec-${tool}`));

    const meta = toolDetails[tool] || { title: 'Tool', sub: '' };
    panelTitle.textContent = meta.title;
    panelSubtitle.textContent = meta.sub;

    // Reset crop if active
    if (tool !== 'crop' && isCropActive) {
      isCropActive = false;
      cropOverlay.classList.remove('active');
    }

    // Refresh tool-specific data
    if (tool === 'palette') {
      refreshColorPalette();
    } else if (tool === 'history') {
      renderHistoryLists(history.actions);
    } else if (tool === 'aspect') {
      const c = engine.getBaseCanvas();
      document.getElementById('resizeWidthInput').value = c.width;
      document.getElementById('resizeHeightInput').value = c.height;
    } else if (tool === 'compress') {
      updateCalculatedMP();
      if (typeof updateCompressTargetStatus === 'function') updateCompressTargetStatus();
    }
  }

  // 5. Apply / Discard Actions
  applyToolBtn.addEventListener('click', () => {
    executeApplyCurrentTool();
  });

  revertToolBtn.addEventListener('click', () => {
    engine.restoreFromBase();
    syncCanvasDisplay();
    showToast('Discarded unapplied preview adjustments');
  });

  function executeApplyCurrentTool() {
    // Push current base state to undo before committing
    history.pushUndoState(engine.getBaseCanvas(), `${panelTitle.textContent} Applied`);

    switch (currentTool) {
      case 'convert': {
        const activeFmtBtn = document.querySelector('#convertFormatGroup .pill-option-btn.active');
        const fmt = activeFmtBtn ? activeFmtBtn.dataset.fmt : 'image/png';
        const q = parseInt(document.getElementById('convertQualitySlider').value) / 100;
        history.logAction('Convert Format', `Configured format to ${fmt.toUpperCase()} at ${Math.round(q * 100)}% quality`);
        triggerDownload(fmt, q);
        break;
      }

      case 'compress': {
        const activeMode = document.querySelector('#compressModeGroup .pill-option-btn.active').dataset.mode;
        const fmtBtn = document.querySelector('#compressFormatGroup .pill-option-btn.active');
        const fmt = fmtBtn ? fmtBtn.dataset.fmt : 'image/jpeg';

        if (activeMode === 'targetKB') {
          const targetKB = parseInt(document.getElementById('targetKBInput').value) || 200;
          showToast(`Optimizing image to ≤ ${targetKB} KB...`);
          SmartCompressor.compressToTargetKB(engine.getBaseCanvas(), targetKB, fmt, (pct, curKB) => {
            const compressResultBadge = document.getElementById('compressResultBadge');
            if (compressResultBadge) compressResultBadge.textContent = `Optimizing: ${curKB} KB (${pct}%)`;
          }).then(res => {
            const img = new Image();
            img.onload = () => {
              engine._applyingCompression = true;
              engine.setDimensions(res.width, res.height);
              engine.currentCtx.clearRect(0, 0, res.width, res.height);
              engine.currentCtx.drawImage(img, 0, 0);
              engine.commitChanges();
              engine._applyingCompression = false;

              // Store verified compressed blob and parameters
              engine.lastCompressedBlob = res.blob;
              engine.lastTargetKB = targetKB;
              engine.exportFormat = fmt;
              engine.exportQuality = res.quality;
              engine.meta.size = res.blob.size;

              syncConvertUI(fmt, res.quality);
              syncCanvasDisplay();
              if (typeof updateCompressTargetStatus === 'function') updateCompressTargetStatus();

              URL.revokeObjectURL(img.src);

              history.logAction('Compress to Target Size', `Reduced to ${res.sizeKB} KB (${res.width}×${res.height} px, Quality ${Math.round(res.quality*100)}%)`);
              showToast(`Achieved ${res.sizeKB} KB! (${res.width}×${res.height} px)`);
            };
            img.src = URL.createObjectURL(res.blob);
          }).catch(err => {
            showToast('Compression error: ' + (err.message || 'unknown error'));
          });
        } else {
          // Target Megapixels
          const targetMP = parseFloat(document.getElementById('targetMPSlider').value);
          const res = engine.resizeToMegapixels(targetMP);
          engine.commitChanges();
          engine.exportFormat = fmt;

          // Re-estimate size after downscaling MP
          engine.exportBlob(fmt, 0.90).then(b => {
            engine.lastCompressedBlob = b;
            engine.meta.size = b.size;
            syncCanvasDisplay();
            if (typeof updateCompressTargetStatus === 'function') updateCompressTargetStatus();
          });

          history.logAction('Reduce Megapixels', `Downscaled to ${res.megapixels.toFixed(2)} MP (${res.width}×${res.height} px)`);
          showToast(`Resized to ${res.megapixels.toFixed(2)} Megapixels!`);
        }
        break;
      }

      case 'aspect': {
        const activePresetBtn = document.querySelector('#aspectPresets .pill-option-btn.active');
        const activeRatio = activePresetBtn ? activePresetBtn.dataset.ratio : 'original';
        const activeFitBtn = document.querySelector('#aspectFitModes .pill-option-btn.active');
        const activeFit = activeFitBtn ? activeFitBtn.dataset.fit : 'pad-blur';
        const manualW = parseInt(document.getElementById('resizeWidthInput').value);
        const manualH = parseInt(document.getElementById('resizeHeightInput').value);

        if (activeRatio === 'custom' && manualW > 0 && manualH > 0) {
          engine.resize(manualW, manualH);
          engine.commitChanges();
          history.logAction('Resize Dimensions', `Resized to ${manualW}×${manualH} px`);
        } else if (activeRatio !== 'original' && activeRatio !== 'custom') {
          const [rw, rh] = activeRatio.split(':').map(Number);
          engine.fitToAspectRatio(rw, rh, activeFit);
          engine.commitChanges();
          history.logAction('Aspect Ratio Fit', `Fitted to ${activeRatio} with mode: ${activeFit}`);
        }
        const updatedCanvas = engine.getBaseCanvas();
        document.getElementById('resizeWidthInput').value = updatedCanvas.width;
        document.getElementById('resizeHeightInput').value = updatedCanvas.height;
        syncCanvasDisplay();
        showToast('Aspect ratio / resize applied!');
        break;
      }

      case 'crop': {
        if (isCropActive) {
          applyInteractiveCrop();
        } else {
          engine.commitChanges();
          history.logAction('Rotate & Transform', `Applied rotation/straighten transformation`);
          showToast('Transformation applied!');
        }
        break;
      }

      case 'transparency': {
        engine.commitChanges();
        opacitySlider.value = 100;
        opacityBadge.textContent = '100%';
        history.logAction('Transparency Applied', `Applied transparency / color eraser modification`);
        syncCanvasDisplay();
        showToast('Transparency modifications saved!');
        break;
      }

      case 'watermark': {
        engine.commitChanges();
        history.logAction('Watermark Applied', `Stamped watermark onto image`);
        syncCanvasDisplay();
        showToast('Watermark permanently stamped!');
        break;
      }

      case 'blur': {
        engine.commitChanges();
        history.logAction('Blur / Censor Applied', `Applied privacy blur effect`);
        syncCanvasDisplay();
        showToast('Blur effect applied!');
        break;
      }

      case 'adjust': {
        engine.commitChanges();
        history.logAction('Color Filters Applied', `Committed color adjustments`);
        syncCanvasDisplay();
        showToast('Color grading saved!');
        break;
      }

      case 'border': {
        engine.commitChanges();
        history.logAction('Border & Frame Applied', `Applied squircle / border / drop shadow frame`);
        syncCanvasDisplay();
        showToast('Frame & border applied!');
        break;
      }

      default:
        engine.commitChanges();
        syncCanvasDisplay();
        showToast('Changes committed!');
        break;
    }
  }

  // 6. Real-Time Interactive Tool Controllers

  // --- TOOL 1: CONVERT ---
  const convertFmtBtns = document.querySelectorAll('#convertFormatGroup .pill-option-btn');
  const convertQualityGroup = document.getElementById('convertQualityGroup');
  const convertQualitySlider = document.getElementById('convertQualitySlider');
  const convertQualityBadge = document.getElementById('convertQualityBadge');

  convertFmtBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      convertFmtBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const fmt = btn.dataset.fmt;
      const isLossy = (fmt === 'image/jpeg' || fmt === 'image/webp' || fmt === 'image/avif');
      convertQualityGroup.style.display = isLossy ? 'flex' : 'none';
      updateHUD();
    });
  });

  convertQualitySlider.addEventListener('input', () => {
    convertQualityBadge.textContent = `${convertQualitySlider.value}%`;
    updateHUD();
  });

  // --- TOOL 2: COMPRESS & MP ---
  const compressModeBtns = document.querySelectorAll('#compressModeGroup .pill-option-btn');
  const compressFormatBtns = document.querySelectorAll('#compressFormatGroup .pill-option-btn');
  const compressTargetKBWrap = document.getElementById('compressTargetKBWrap');
  const compressTargetMPWrap = document.getElementById('compressTargetMPWrap');
  const targetKBPills = document.querySelectorAll('#targetKBPills .pill-option-btn');
  const targetKBInput = document.getElementById('targetKBInput');
  const targetMPPills = document.querySelectorAll('#targetMPPills .pill-option-btn');
  const targetMPSlider = document.getElementById('targetMPSlider');
  const targetMPBadge = document.getElementById('targetMPBadge');
  const calcDimsBadge = document.getElementById('calcDimsBadge');
  const compressAndExportBtn = document.getElementById('compressAndExportBtn');

  function updateCompressTargetStatus() {
    const targetKB = parseInt(targetKBInput.value) || 200;
    const activeFmtBtn = document.querySelector('#compressFormatGroup .pill-option-btn.active');
    const fmt = activeFmtBtn ? activeFmtBtn.dataset.fmt : 'image/jpeg';
    const fmtName = fmt === 'image/webp' ? 'WEBP' : 'JPEG';

    const statusBadge = document.getElementById('compressStatusBadge');
    if (statusBadge) {
      statusBadge.textContent = `≤ ${targetKB} KB (${fmtName})`;
    }

    const quickBtnText = document.getElementById('compressAndExportText');
    if (quickBtnText) {
      quickBtnText.textContent = `Compress & Export (≤ ${targetKB} KB)`;
    }

    const resultBadge = document.getElementById('compressResultBadge');
    if (resultBadge) {
      if (engine.lastCompressedBlob && engine.lastTargetKB === targetKB && engine.exportFormat === fmt) {
        const sz = SmartCompressor.formatBytes(engine.lastCompressedBlob.size);
        resultBadge.textContent = `${sz} (Ready to Export)`;
        resultBadge.style.background = 'rgba(52, 199, 89, 0.15)';
        resultBadge.style.color = '#248a3d';
      } else {
        resultBadge.textContent = 'Not yet applied';
        resultBadge.style.background = 'var(--surface-secondary)';
        resultBadge.style.color = 'var(--text-primary)';
      }
    }
  }

  compressFormatBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      compressFormatBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      engine.exportFormat = btn.dataset.fmt;
      // Invalidate last compressed blob if format changed
      if (engine.lastCompressedBlob && engine.lastCompressedBlob.type !== btn.dataset.fmt) {
        engine.lastCompressedBlob = null;
      }
      updateCompressTargetStatus();
      updateHUD();
    });
  });

  compressModeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      compressModeBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const isKB = btn.dataset.mode === 'targetKB';
      compressTargetKBWrap.style.display = isKB ? 'block' : 'none';
      compressTargetMPWrap.style.display = isKB ? 'none' : 'block';
    });
  });

  targetKBPills.forEach(pill => {
    pill.addEventListener('click', () => {
      targetKBPills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      const kb = pill.dataset.kb;
      if (kb !== 'custom') {
        targetKBInput.value = kb;
      }
      updateCompressTargetStatus();
    });
  });

  targetKBInput.addEventListener('input', () => {
    const val = parseInt(targetKBInput.value);
    const match = Array.from(targetKBPills).find(p => p.dataset.kb === String(val));
    targetKBPills.forEach(p => p.classList.remove('active'));
    if (match) match.classList.add('active');
    else {
      const customPill = document.querySelector('#targetKBPills [data-kb="custom"]');
      if (customPill) customPill.classList.add('active');
    }
    updateCompressTargetStatus();
  });

  if (compressAndExportBtn) {
    compressAndExportBtn.addEventListener('click', async () => {
      if (!engine.getCanvas().width) {
        showToast('Load an image first before compressing');
        return;
      }
      const targetKB = parseInt(targetKBInput.value) || 200;
      const activeFmtBtn = document.querySelector('#compressFormatGroup .pill-option-btn.active');
      const fmt = activeFmtBtn ? activeFmtBtn.dataset.fmt : 'image/jpeg';

      showToast(`Compressing to ≤ ${targetKB} KB and exporting...`);
      try {
        const res = await SmartCompressor.compressToTargetKB(engine.getBaseCanvas(), targetKB, fmt);
        engine.lastCompressedBlob = res.blob;
        engine.lastTargetKB = targetKB;
        engine.exportFormat = fmt;
        engine.exportQuality = res.quality;
        engine.meta.size = res.blob.size;

        syncConvertUI(fmt, res.quality);
        syncCanvasDisplay();
        updateCompressTargetStatus();

        downloadBlob(res.blob, fmt);
      } catch (err) {
        showToast('Compression error: ' + err.message);
      }
    });
  }

  targetMPPills.forEach(pill => {
    pill.addEventListener('click', () => {
      targetMPPills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      const mp = pill.dataset.mp;
      if (mp !== 'custom') {
        targetMPSlider.value = mp;
        targetMPBadge.textContent = `${mp} MP`;
        updateCalculatedMP();
      }
    });
  });

  targetMPSlider.addEventListener('input', () => {
    const val = targetMPSlider.value;
    targetMPBadge.textContent = `${val} MP`;
    updateCalculatedMP();
    const match = Array.from(targetMPPills).find(p => p.dataset.mp === val);
    targetMPPills.forEach(p => p.classList.remove('active'));
    if (match) match.classList.add('active');
    else {
      const customPill = document.querySelector('#targetMPPills [data-mp="custom"]');
      if (customPill) customPill.classList.add('active');
    }
  });

  function updateCalculatedMP() {
    const c = engine.getBaseCanvas();
    if (!c.width) return;
    const targetMP = parseFloat(targetMPSlider.value);
    const dims = SmartCompressor.dimensionsFromTargetMP(c.width, c.height, targetMP);
    calcDimsBadge.textContent = `${dims.width} × ${dims.height} px`;
  }

  // --- TOOL 3: ASPECT RATIO & RESIZE ---
  const aspectPresets = document.querySelectorAll('#aspectPresets .pill-option-btn');
  const aspectFitModes = document.querySelectorAll('#aspectFitModes .pill-option-btn');
  const resizeWidthInput = document.getElementById('resizeWidthInput');
  const resizeHeightInput = document.getElementById('resizeHeightInput');
  const lockAspectCheckbox = document.getElementById('lockAspectCheckbox');

  function updateCustomResizePreview() {
    const w = parseInt(resizeWidthInput.value);
    const h = parseInt(resizeHeightInput.value);
    if (w > 0 && h > 0) {
      engine.resize(w, h);
      syncCanvasDisplay();
    }
  }

  aspectPresets.forEach(preset => {
    preset.addEventListener('click', () => {
      aspectPresets.forEach(p => p.classList.remove('active'));
      preset.classList.add('active');
      const ratio = preset.dataset.ratio;

      if (ratio === 'original') {
        engine.restoreFromBase();
        document.getElementById('resizeWidthInput').value = engine.getBaseCanvas().width;
        document.getElementById('resizeHeightInput').value = engine.getBaseCanvas().height;
        syncCanvasDisplay();
      } else if (ratio === 'custom') {
        updateCustomResizePreview();
      } else {
        const [rw, rh] = ratio.split(':').map(Number);
        const fitBtn = document.querySelector('#aspectFitModes .pill-option-btn.active');
        const fitMode = fitBtn ? fitBtn.dataset.fit : 'pad-blur';
        engine.fitToAspectRatio(rw, rh, fitMode);
        document.getElementById('resizeWidthInput').value = engine.getCanvas().width;
        document.getElementById('resizeHeightInput').value = engine.getCanvas().height;
        syncCanvasDisplay();
      }
    });
  });

  aspectFitModes.forEach(fit => {
    fit.addEventListener('click', () => {
      aspectFitModes.forEach(f => f.classList.remove('active'));
      fit.classList.add('active');
      const activePresetBtn = document.querySelector('#aspectPresets .pill-option-btn.active');
      const activePreset = activePresetBtn ? activePresetBtn.dataset.ratio : 'original';
      if (activePreset !== 'original' && activePreset !== 'custom') {
        const [rw, rh] = activePreset.split(':').map(Number);
        engine.fitToAspectRatio(rw, rh, fit.dataset.fit);
        document.getElementById('resizeWidthInput').value = engine.getCanvas().width;
        document.getElementById('resizeHeightInput').value = engine.getCanvas().height;
        syncCanvasDisplay();
      }
    });
  });

  resizeWidthInput.addEventListener('input', () => {
    aspectPresets.forEach(p => p.classList.toggle('active', p.dataset.ratio === 'custom'));
    const w = parseInt(resizeWidthInput.value);
    if (!w) return;
    if (lockAspectCheckbox.checked) {
      const c = engine.getBaseCanvas();
      const h = Math.max(1, Math.round(w / (c.width / c.height)));
      resizeHeightInput.value = h;
    }
    updateCustomResizePreview();
  });

  resizeHeightInput.addEventListener('input', () => {
    aspectPresets.forEach(p => p.classList.toggle('active', p.dataset.ratio === 'custom'));
    const h = parseInt(resizeHeightInput.value);
    if (!h) return;
    if (lockAspectCheckbox.checked) {
      const c = engine.getBaseCanvas();
      const w = Math.max(1, Math.round(h * (c.width / c.height)));
      resizeWidthInput.value = w;
    }
    updateCustomResizePreview();
  });

  // --- TOOL 4: CROP & ROTATE ---
  document.getElementById('rotateCwBtn').addEventListener('click', () => {
    engine.rotate90(true);
    engine.commitChanges();
    syncCanvasDisplay();
    history.logAction('Rotate CW', 'Rotated 90 degrees clockwise');
  });

  document.getElementById('rotateCcwBtn').addEventListener('click', () => {
    engine.rotate90(false);
    engine.commitChanges();
    syncCanvasDisplay();
    history.logAction('Rotate CCW', 'Rotated 90 degrees counter-clockwise');
  });

  document.getElementById('flipHBtn').addEventListener('click', () => {
    engine.flip(true, false);
    engine.commitChanges();
    syncCanvasDisplay();
    history.logAction('Flip Horizontal', 'Mirrored horizontally');
  });

  document.getElementById('flipVBtn').addEventListener('click', () => {
    engine.flip(false, true);
    engine.commitChanges();
    syncCanvasDisplay();
    history.logAction('Flip Vertical', 'Mirrored vertically');
  });

  const straightenSlider = document.getElementById('straightenSlider');
  const straightenBadge = document.getElementById('straightenBadge');
  straightenSlider.addEventListener('input', () => {
    const deg = parseInt(straightenSlider.value);
    straightenBadge.textContent = `${deg}°`;
    engine.rotateAngle(deg);
    syncCanvasDisplay();
  });

  toggleCropModeBtn.addEventListener('click', () => {
    isCropActive = !isCropActive;
    cropOverlay.classList.toggle('active', isCropActive);
    toggleCropModeBtn.querySelector('span').textContent = isCropActive ? 'Disable Crop Box' : 'Enable Crop Box';
    if (isCropActive) {
      initCropBox();
    }
  });

  function initCropBox() {
    setZoom(1.0);
    const w = canvasWrapper.clientWidth || mainCanvas.clientWidth;
    const h = canvasWrapper.clientHeight || mainCanvas.clientHeight;
    const padX = Math.round(w * 0.1);
    const padY = Math.round(h * 0.1);

    cropBox.style.left = `${padX}px`;
    cropBox.style.top = `${padY}px`;
    cropBox.style.width = `${Math.max(40, w - padX * 2)}px`;
    cropBox.style.height = `${Math.max(40, h - padY * 2)}px`;
  }

  function applyInteractiveCrop() {
    const canvasRect = mainCanvas.getBoundingClientRect();
    const boxRect = cropBox.getBoundingClientRect();

    const scaleX = engine.getBaseCanvas().width / canvasRect.width;
    const scaleY = engine.getBaseCanvas().height / canvasRect.height;

    let cropX = Math.max(0, (boxRect.left - canvasRect.left) * scaleX);
    let cropY = Math.max(0, (boxRect.top - canvasRect.top) * scaleY);
    let cropW = Math.min(engine.getBaseCanvas().width - cropX, boxRect.width * scaleX);
    let cropH = Math.min(engine.getBaseCanvas().height - cropY, boxRect.height * scaleY);

    if (cropW > 4 && cropH > 4) {
      engine.crop(cropX, cropY, cropW, cropH);
      engine.commitChanges();
      isCropActive = false;
      cropOverlay.classList.remove('active');
      toggleCropModeBtn.querySelector('span').textContent = 'Enable Crop Box';
      syncCanvasDisplay();
      history.logAction('Interactive Crop', `Cropped to ${Math.round(cropW)}×${Math.round(cropH)} px`);
      showToast('Crop applied!');
    } else {
      showToast('Crop region too small');
    }
  }

  // Interactive Draggable and Resizable Crop Box
  let isDraggingCrop = false;
  let activeCropHandle = null;
  let dragStartX, dragStartY;
  let initBoxLeft, initBoxTop, initBoxWidth, initBoxHeight;

  cropBox.addEventListener('mousedown', (e) => {
    const handle = e.target.closest('.crop-handle');
    if (handle) {
      if (handle.classList.contains('crop-handle-nw')) activeCropHandle = 'nw';
      else if (handle.classList.contains('crop-handle-ne')) activeCropHandle = 'ne';
      else if (handle.classList.contains('crop-handle-sw')) activeCropHandle = 'sw';
      else if (handle.classList.contains('crop-handle-se')) activeCropHandle = 'se';
      dragStartX = e.clientX;
      dragStartY = e.clientY;
      initBoxLeft = cropBox.offsetLeft;
      initBoxTop = cropBox.offsetTop;
      initBoxWidth = cropBox.offsetWidth;
      initBoxHeight = cropBox.offsetHeight;
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    if (e.target === cropBox || e.target.classList.contains('crop-grid-line')) {
      isDraggingCrop = true;
      dragStartX = e.clientX;
      dragStartY = e.clientY;
      initBoxLeft = cropBox.offsetLeft;
      initBoxTop = cropBox.offsetTop;
      initBoxWidth = cropBox.offsetWidth;
      initBoxHeight = cropBox.offsetHeight;
      e.preventDefault();
    }
  });

  window.addEventListener('mousemove', (e) => {
    if (!isCropActive) return;
    const parentW = cropOverlay.clientWidth || canvasWrapper.clientWidth;
    const parentH = cropOverlay.clientHeight || canvasWrapper.clientHeight;
    const dx = e.clientX - dragStartX;
    const dy = e.clientY - dragStartY;

    if (isDraggingCrop) {
      const maxLeft = Math.max(0, parentW - initBoxWidth);
      const maxTop = Math.max(0, parentH - initBoxHeight);
      const newLeft = Math.max(0, Math.min(maxLeft, initBoxLeft + dx));
      const newTop = Math.max(0, Math.min(maxTop, initBoxTop + dy));
      cropBox.style.left = `${newLeft}px`;
      cropBox.style.top = `${newTop}px`;
    } else if (activeCropHandle) {
      const minSize = 24;
      if (activeCropHandle === 'se') {
        const maxW = parentW - initBoxLeft;
        const maxH = parentH - initBoxTop;
        const newW = Math.max(minSize, Math.min(maxW, initBoxWidth + dx));
        const newH = Math.max(minSize, Math.min(maxH, initBoxHeight + dy));
        cropBox.style.width = `${newW}px`;
        cropBox.style.height = `${newH}px`;
      } else if (activeCropHandle === 'sw') {
        const maxW = initBoxLeft + initBoxWidth;
        const maxH = parentH - initBoxTop;
        const newW = Math.max(minSize, Math.min(maxW, initBoxWidth - dx));
        const newLeft = initBoxLeft + (initBoxWidth - newW);
        const newH = Math.max(minSize, Math.min(maxH, initBoxHeight + dy));
        cropBox.style.left = `${newLeft}px`;
        cropBox.style.width = `${newW}px`;
        cropBox.style.height = `${newH}px`;
      } else if (activeCropHandle === 'ne') {
        const maxW = parentW - initBoxLeft;
        const maxH = initBoxTop + initBoxHeight;
        const newW = Math.max(minSize, Math.min(maxW, initBoxWidth + dx));
        const newH = Math.max(minSize, Math.min(maxH, initBoxHeight - dy));
        const newTop = initBoxTop + (initBoxHeight - newH);
        cropBox.style.top = `${newTop}px`;
        cropBox.style.width = `${newW}px`;
        cropBox.style.height = `${newH}px`;
      } else if (activeCropHandle === 'nw') {
        const maxW = initBoxLeft + initBoxWidth;
        const maxH = initBoxTop + initBoxHeight;
        const newW = Math.max(minSize, Math.min(maxW, initBoxWidth - dx));
        const newLeft = initBoxLeft + (initBoxWidth - newW);
        const newH = Math.max(minSize, Math.min(maxH, initBoxHeight - dy));
        const newTop = initBoxTop + (initBoxHeight - newH);
        cropBox.style.left = `${newLeft}px`;
        cropBox.style.top = `${newTop}px`;
        cropBox.style.width = `${newW}px`;
        cropBox.style.height = `${newH}px`;
      }
    }
  });

  window.addEventListener('mouseup', () => {
    isDraggingCrop = false;
    activeCropHandle = null;
  });

  // --- TOOL 5: TRANSPARENCY & MAGIC ERASER ---
  const opacitySlider = document.getElementById('opacitySlider');
  const opacityBadge = document.getElementById('opacityBadge');
  const magicColorInput = document.getElementById('magicColorInput');
  const pickCanvasColorBtn = document.getElementById('pickCanvasColorBtn');
  const toleranceSlider = document.getElementById('toleranceSlider');
  const toleranceBadge = document.getElementById('toleranceBadge');
  const featherSlider = document.getElementById('featherSlider');
  const featherBadge = document.getElementById('featherBadge');
  const applyEraseColorBtn = document.getElementById('applyEraseColorBtn');

  opacitySlider.addEventListener('input', () => {
    const val = parseInt(opacitySlider.value);
    opacityBadge.textContent = `${val}%`;
    engine.setGlobalOpacity(val / 100);
    syncCanvasDisplay();
  });

  pickCanvasColorBtn.addEventListener('click', () => {
    isPickingColor = true;
    mainCanvas.style.cursor = 'crosshair';
    showToast('Click anywhere on the image to sample color');
  });

  mainCanvas.addEventListener('click', (e) => {
    if (!isPickingColor && currentTool !== 'palette') return;

    const rect = mainCanvas.getBoundingClientRect();
    const scaleX = engine.getCanvas().width / rect.width;
    const scaleY = engine.getCanvas().height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    const color = PaletteExtractor.getPixelColor(engine.getCanvas(), x, y);
    pickedColor = color;

    if (isPickingColor) {
      magicColorInput.value = color.hex;
      isPickingColor = false;
      mainCanvas.style.cursor = 'default';
      updateLiveColorErase();
      showToast(`Selected color: ${color.hex}`);
    }

    if (currentTool === 'palette') {
      const pill = document.getElementById('eyedropperResultPill');
      const dot = document.getElementById('eyedropperColorDot');
      const hex = document.getElementById('eyedropperHexText');
      pill.style.display = 'inline-flex';
      dot.style.background = color.hex;
      hex.textContent = color.hex;
      navigator.clipboard?.writeText(color.hex);
      showToast(`Copied ${color.hex} to clipboard!`);
    }
  });

  function updateLiveColorErase() {
    const hex = magicColorInput.value;
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const tol = parseInt(toleranceSlider.value);
    const fea = parseInt(featherSlider.value);

    engine.removeColor(r, g, b, tol, fea);
    syncCanvasDisplay();
  }

  toleranceSlider.addEventListener('input', () => {
    toleranceBadge.textContent = `${toleranceSlider.value}%`;
    updateLiveColorErase();
  });
  featherSlider.addEventListener('input', () => {
    featherBadge.textContent = `${featherSlider.value}%`;
    updateLiveColorErase();
  });
  magicColorInput.addEventListener('input', updateLiveColorErase);

  applyEraseColorBtn.addEventListener('click', () => {
    updateLiveColorErase();
    showToast(`Erased color ${magicColorInput.value} (Tolerance: ${toleranceSlider.value}%)`);
  });

  // --- TOOL 6: WATERMARK & LOGO ---
  const wmTypeBtns = document.querySelectorAll('#wmTypeGroup .pill-option-btn');
  const wmLogoSubPanel = document.getElementById('wmLogoSubPanel');
  const wmTextSubPanel = document.getElementById('wmTextSubPanel');
  const logoFileInput = document.getElementById('logoFileInput');
  const logoScaleSlider = document.getElementById('logoScaleSlider');
  const logoScaleBadge = document.getElementById('logoScaleBadge');
  const wmTextInput = document.getElementById('wmTextInput');
  const wmFontSizeSlider = document.getElementById('wmFontSizeSlider');
  const wmFontSizeBadge = document.getElementById('wmFontSizeBadge');
  const wmRepeatCheckbox = document.getElementById('wmRepeatCheckbox');
  const wmAnchorBtns = document.querySelectorAll('#wmAnchorGroup .pill-option-btn');
  const wmOpacitySlider = document.getElementById('wmOpacitySlider');
  const wmOpacityBadge = document.getElementById('wmOpacityBadge');

  wmTypeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      wmTypeBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const isLogo = btn.dataset.wm === 'logo';
      wmLogoSubPanel.style.display = isLogo ? 'block' : 'none';
      wmTextSubPanel.style.display = isLogo ? 'none' : 'block';
      updateLiveWatermark();
    });
  });

  logoFileInput.addEventListener('change', (e) => {
    if (e.target.files.length) {
      const file = e.target.files[0];
      const img = new Image();
      img.onload = () => {
        watermarkLogoImg = img;
        updateLiveWatermark();
        showToast('Logo file loaded for watermarking');
      };
      img.src = URL.createObjectURL(file);
    }
  });

  logoScaleSlider.addEventListener('input', () => {
    logoScaleBadge.textContent = `${logoScaleSlider.value}%`;
    updateLiveWatermark();
  });
  wmFontSizeSlider.addEventListener('input', () => {
    wmFontSizeBadge.textContent = `${wmFontSizeSlider.value}px`;
    updateLiveWatermark();
  });
  wmOpacitySlider.addEventListener('input', () => {
    wmOpacityBadge.textContent = `${wmOpacitySlider.value}%`;
    updateLiveWatermark();
  });
  wmTextInput.addEventListener('input', updateLiveWatermark);
  wmRepeatCheckbox.addEventListener('change', updateLiveWatermark);

  wmAnchorBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      wmAnchorBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      updateLiveWatermark();
    });
  });

  function updateLiveWatermark() {
    const isLogo = document.querySelector('#wmTypeGroup .pill-option-btn.active').dataset.wm === 'logo';
    const anchor = document.querySelector('#wmAnchorGroup .pill-option-btn.active').dataset.anchor;
    const opacity = parseInt(wmOpacitySlider.value) / 100;

    if (isLogo && watermarkLogoImg) {
      const scale = parseInt(logoScaleSlider.value) / 100;
      engine.addLogoWatermark(watermarkLogoImg, { anchor, scale, opacity });
      syncCanvasDisplay();
    } else if (!isLogo) {
      const text = wmTextInput.value;
      const fontSize = parseInt(wmFontSizeSlider.value);
      const repeat = wmRepeatCheckbox.checked;
      engine.addTextWatermark({ text, fontSize, anchor, opacity, repeat });
      syncCanvasDisplay();
    }
  }

  // --- TOOL 7: BLUR & PRIVACY CENSOR ---
  const blurStyleBtns = document.querySelectorAll('#blurStyleGroup .pill-option-btn');
  const blurRadiusWrap = document.getElementById('blurRadiusWrap');
  const pixelateWrap = document.getElementById('pixelateWrap');
  const tiltShiftWrap = document.getElementById('tiltShiftWrap');
  const blurRadiusSlider = document.getElementById('blurRadiusSlider');
  const blurRadiusBadge = document.getElementById('blurRadiusBadge');
  const pixelateSlider = document.getElementById('pixelateSlider');
  const pixelateBadge = document.getElementById('pixelateBadge');
  const tiltCenterSlider = document.getElementById('tiltCenterSlider');
  const tiltCenterBadge = document.getElementById('tiltCenterBadge');

  blurStyleBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      blurStyleBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const s = btn.dataset.style;
      blurRadiusWrap.style.display = (s === 'gaussian' || s === 'tiltshift') ? 'block' : 'none';
      pixelateWrap.style.display = (s === 'pixelate') ? 'block' : 'none';
      tiltShiftWrap.style.display = (s === 'tiltshift') ? 'block' : 'none';
      updateLiveBlur();
    });
  });

  blurRadiusSlider.addEventListener('input', () => {
    blurRadiusBadge.textContent = `${blurRadiusSlider.value}px`;
    updateLiveBlur();
  });
  pixelateSlider.addEventListener('input', () => {
    pixelateBadge.textContent = `${pixelateSlider.value}px`;
    updateLiveBlur();
  });
  tiltCenterSlider.addEventListener('input', () => {
    tiltCenterBadge.textContent = `${tiltCenterSlider.value}%`;
    updateLiveBlur();
  });

  function updateLiveBlur() {
    const style = document.querySelector('#blurStyleGroup .pill-option-btn.active').dataset.style;
    if (style === 'gaussian') {
      const rad = parseInt(blurRadiusSlider.value);
      engine.applyBlur(rad);
    } else if (style === 'pixelate') {
      const block = parseInt(pixelateSlider.value);
      engine.applyPixelate(block);
    } else if (style === 'tiltshift') {
      const rad = parseInt(blurRadiusSlider.value);
      const centerRatio = parseInt(tiltCenterSlider.value) / 100;
      engine.applyTiltShift(centerRatio, 0.25, rad);
    }
    syncCanvasDisplay();
  }

  // --- TOOL 8: PRO ADJUSTMENTS & FILTERS ---
  const filterPresets = document.querySelectorAll('#filterPresets .pill-option-btn');
  const adjBrightness = document.getElementById('adjBrightness');
  const adjContrast = document.getElementById('adjContrast');
  const adjSaturation = document.getElementById('adjSaturation');
  const adjExposure = document.getElementById('adjExposure');
  const adjWarmth = document.getElementById('adjWarmth');
  const adjSharpen = document.getElementById('adjSharpen');

  const adjSliders = [adjBrightness, adjContrast, adjSaturation, adjExposure, adjWarmth, adjSharpen];

  adjSliders.forEach(sl => {
    sl.addEventListener('input', () => {
      document.getElementById(`${sl.id}Badge`).textContent = sl.value;
      updateLiveAdjustments();
    });
  });

  filterPresets.forEach(preset => {
    preset.addEventListener('click', () => {
      filterPresets.forEach(p => p.classList.remove('active'));
      preset.classList.add('active');

      const pName = preset.dataset.preset;
      resetAdjustmentsValues();

      switch (pName) {
        case 'vivid':
          adjSaturation.value = 40;
          adjContrast.value = 20;
          break;
        case 'noir':
          adjSaturation.value = -100;
          adjContrast.value = 35;
          adjBrightness.value = -10;
          break;
        case 'warm':
          adjWarmth.value = 35;
          adjSaturation.value = 15;
          break;
        case 'cool':
          adjWarmth.value = -35;
          adjBrightness.value = 5;
          break;
        case 'sepia':
          adjWarmth.value = 20;
          adjSaturation.value = -40;
          break;
      }

      adjSliders.forEach(sl => {
        document.getElementById(`${sl.id}Badge`).textContent = sl.value;
      });
      updateLiveAdjustments();
    });
  });

  function resetAdjustmentsValues() {
    adjBrightness.value = 0;
    adjContrast.value = 0;
    adjSaturation.value = 0;
    adjExposure.value = 0;
    adjWarmth.value = 0;
    adjSharpen.value = 0;
  }

  function updateLiveAdjustments() {
    const values = {
      brightness: parseInt(adjBrightness.value),
      contrast: parseInt(adjContrast.value),
      saturation: parseInt(adjSaturation.value),
      exposure: parseInt(adjExposure.value),
      warmth: parseInt(adjWarmth.value),
      sharpen: parseInt(adjSharpen.value)
    };
    engine.applyAdjustments(values);
    syncCanvasDisplay();
  }

  // --- TOOL 9: BORDER, SQUIRCLE & MOCKUP ---
  const borderRadiusSlider = document.getElementById('borderRadiusSlider');
  const borderRadiusBadge = document.getElementById('borderRadiusBadge');
  const squircleCheckbox = document.getElementById('squircleCheckbox');
  const borderWidthSlider = document.getElementById('borderWidthSlider');
  const borderWidthBadge = document.getElementById('borderWidthBadge');
  const borderColorInput = document.getElementById('borderColorInput');
  const borderHexCode = document.getElementById('borderHexCode');
  const paddingSlider = document.getElementById('paddingSlider');
  const paddingBadge = document.getElementById('paddingBadge');
  const shadowSlider = document.getElementById('shadowSlider');
  const shadowBadge = document.getElementById('shadowBadge');

  [borderRadiusSlider, borderWidthSlider, paddingSlider, shadowSlider].forEach(sl => {
    sl.addEventListener('input', () => {
      document.getElementById(`${sl.id.replace('Slider', 'Badge')}`).textContent = `${sl.value}px`;
      updateLiveBorder();
    });
  });

  squircleCheckbox.addEventListener('change', updateLiveBorder);
  borderColorInput.addEventListener('input', () => {
    borderHexCode.textContent = borderColorInput.value.toUpperCase();
    updateLiveBorder();
  });

  function updateLiveBorder() {
    const config = {
      radius: parseInt(borderRadiusSlider.value),
      isSquircle: squircleCheckbox.checked,
      borderWidth: parseInt(borderWidthSlider.value),
      borderColor: borderColorInput.value,
      padding: parseInt(paddingSlider.value),
      shadowBlur: parseInt(shadowSlider.value)
    };
    engine.applyBorderAndSquircle(config);
    syncCanvasDisplay();
  }

  // --- TOOL 10: PALETTE EXTRACTOR ---
  function refreshColorPalette() {
    const palette = PaletteExtractor.extractPalette(engine.getCanvas(), 6);
    const container = document.getElementById('paletteList');
    container.innerHTML = '';

    palette.forEach(item => {
      const card = document.createElement('div');
      card.className = 'color-swatch-card';
      card.innerHTML = `
        <div class="swatch-color-box" style="background:${item.hex};"></div>
        <div class="swatch-hex">${item.hex}</div>
      `;
      card.addEventListener('click', () => {
        navigator.clipboard?.writeText(item.hex);
        showToast(`Copied ${item.hex} to clipboard!`);
      });
      container.appendChild(card);
    });
  }

  document.getElementById('refreshPaletteBtn').addEventListener('click', refreshColorPalette);
  document.getElementById('eyedropperLoupeBtn').addEventListener('click', () => {
    isPickingColor = true;
    mainCanvas.style.cursor = 'crosshair';
    showToast('Click anywhere on the image to inspect color');
  });

  // --- TOOL 11: BATCH PROCESSOR ---
  const batchFilesInput = document.getElementById('batchFilesInput');
  const batchItemsList = document.getElementById('batchItemsList');
  const batchFormatGroup = document.querySelectorAll('#batchFormatGroup .pill-option-btn');
  const startBatchBtn = document.getElementById('startBatchBtn');
  const downloadBatchZipBtn = document.getElementById('downloadBatchZipBtn');

  batchFilesInput.addEventListener('change', (e) => {
    if (e.target.files.length) {
      batch.addFiles(e.target.files);
      renderBatchQueue();
    }
  });

  batchFormatGroup.forEach(btn => {
    btn.addEventListener('click', () => {
      batchFormatGroup.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  function renderBatchQueue() {
    if (batch.queue.length === 0) {
      batchItemsList.innerHTML = '<div style="font-size:0.8rem;color:var(--text-muted);text-align:center;padding:20px 0;">No images in batch queue</div>';
      return;
    }

    batchItemsList.innerHTML = '';
    batch.queue.forEach(item => {
      const row = document.createElement('div');
      row.className = 'batch-item';
      row.innerHTML = `
        <div class="batch-item-left">
          <img class="batch-thumb" src="${item.thumbUrl}">
          <div>
            <div class="batch-item-name">${item.name}</div>
            <div style="font-size:0.72rem;color:var(--text-muted);">${SmartCompressor.formatBytes(item.size)}</div>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:8px;">
          <span style="font-size:0.72rem;text-transform:uppercase;font-weight:600;color:${item.status === 'done' ? 'var(--accent-emerald)' : 'var(--text-muted)'};">${item.status}</span>
          <button class="sample-btn" style="padding:2px 8px;" onclick="window.removeBatchItem('${item.id}')">✕</button>
        </div>
      `;
      batchItemsList.appendChild(row);
    });
  }

  window.removeBatchItem = (id) => {
    batch.removeItem(id);
    renderBatchQueue();
  };

  startBatchBtn.addEventListener('click', () => {
    if (batch.queue.length === 0) {
      showToast('Add images to the batch queue first');
      return;
    }

    const fmt = document.querySelector('#batchFormatGroup .pill-option-btn.active').dataset.fmt;
    startBatchBtn.textContent = 'Processing...';
    startBatchBtn.disabled = true;

    batch.processAll({ format: fmt, quality: 0.85 }, (item) => {
      renderBatchQueue();
    }, (processed) => {
      startBatchBtn.textContent = 'Process All Images';
      startBatchBtn.disabled = false;
      downloadBatchZipBtn.style.display = 'inline-flex';
      history.logAction('Batch Processing', `Processed ${processed.length} images to ${fmt.toUpperCase()}`);
      showToast(`Finished processing ${processed.length} images!`);
    });
  });

  downloadBatchZipBtn.addEventListener('click', () => {
    batch.downloadZip('luminary-batch-exported.zip');
    showToast('Downloaded ZIP archive!');
  });

  // --- TOOL 12: HISTORY & MODAL ---
  function renderHistoryLists(actions) {
    const renderTimeline = (container) => {
      if (!container) return;
      if (actions.length === 0) {
        container.innerHTML = '<div style="font-size:0.8rem;color:var(--text-muted);">No actions recorded yet</div>';
        return;
      }
      container.innerHTML = actions.slice(0, 15).map(act => `
        <div class="timeline-item">
          <div class="timeline-dot"></div>
          <div class="timeline-time">${act.displayTime || ''}</div>
          <div class="timeline-content">${act.description}</div>
        </div>
      `).join('');
    };

    renderTimeline(sideHistoryTimeline);
    renderTimeline(modalHistoryTimeline);
  }

  historyIndicatorBtn.addEventListener('click', () => {
    renderHistoryLists(history.actions);
    historyModal.classList.add('open');
  });

  closeHistoryModalBtn.addEventListener('click', () => {
    historyModal.classList.remove('open');
  });

  historyModal.addEventListener('click', (e) => {
    if (e.target === historyModal) {
      historyModal.classList.remove('open');
    }
  });

  exportHistoryMdBtn.addEventListener('click', () => {
    history.exportHistoryMarkdown();
    showToast('Session History exported as Markdown');
  });

  // --- UNDO / REDO ---
  undoBtn.addEventListener('click', () => {
    const prevState = history.undo(engine.getBaseCanvas());
    if (prevState) {
      engine.setDimensions(prevState.width, prevState.height);
      engine.currentCtx.clearRect(0, 0, prevState.width, prevState.height);
      engine.currentCtx.drawImage(prevState, 0, 0);
      engine.commitChanges();
      syncCanvasDisplay();
      showToast('Action undone');
    }
  });

  redoBtn.addEventListener('click', () => {
    const nextState = history.redo(engine.getBaseCanvas());
    if (nextState) {
      engine.setDimensions(nextState.width, nextState.height);
      engine.currentCtx.clearRect(0, 0, nextState.width, nextState.height);
      engine.currentCtx.drawImage(nextState, 0, 0);
      engine.commitChanges();
      syncCanvasDisplay();
      showToast('Action redone');
    }
  });

  // Keyboard Shortcuts
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (historyModal.classList.contains('open')) {
        historyModal.classList.remove('open');
      }
      if (isCropActive) {
        toggleCropModeBtn.click();
      }
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) redoBtn.click();
      else undoBtn.click();
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
      e.preventDefault();
      redoBtn.click();
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      topDownloadBtn.click();
    }
  });

  // Reset to original
  resetImgBtn.addEventListener('click', () => {
    if (engine.originalImage) {
      engine.loadFromImageElement(engine.originalImage, engine.meta.name);
      syncCanvasDisplay();
      showToast('Image reset to original state');
    }
  });

  // --- SPLIT BEFORE / AFTER VIEWER ---
  splitViewBtn.addEventListener('click', () => {
    isSplitActive = !isSplitActive;
    splitViewer.classList.toggle('active', isSplitActive);
    splitViewBtn.classList.toggle('active', isSplitActive);

    if (isSplitActive) {
      // Draw original image on splitCanvas
      splitCanvas.width = engine.getBaseCanvas().width;
      splitCanvas.height = engine.getBaseCanvas().height;
      const sCtx = splitCanvas.getContext('2d');
      if (engine.originalImage) {
        sCtx.drawImage(engine.originalImage, 0, 0, splitCanvas.width, splitCanvas.height);
      }
      updateSplitClip(50);
      showToast('Compare Mode Active: Drag divider to compare');
    }
  });

  function updateSplitClip(percent) {
    splitLine.style.left = `${percent}%`;
    splitCanvas.style.clipPath = `polygon(0 0, ${percent}% 0, ${percent}% 100%, 0 100%)`;
  }

  let isDraggingSplit = false;
  splitLine.addEventListener('mousedown', () => isDraggingSplit = true);
  window.addEventListener('mousemove', (e) => {
    if (!isDraggingSplit) return;
    const rect = mainCanvas.getBoundingClientRect();
    const pct = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
    updateSplitClip(pct);
  });
  window.addEventListener('mouseup', () => isDraggingSplit = false);

  // --- ZOOM CONTROLS ---
  function setZoom(val) {
    currentZoom = Math.max(0.1, Math.min(4.0, val));
    mainCanvas.style.transform = `scale(${currentZoom})`;
    mainCanvas.style.transformOrigin = 'center center';
    splitCanvas.style.transform = `scale(${currentZoom})`;
    splitCanvas.style.transformOrigin = 'center center';
    zoomLevelText.textContent = `${Math.round(currentZoom * 100)}%`;
  }

  function zoomFit() {
    setZoom(1.0);
    mainCanvas.style.maxWidth = '100%';
    mainCanvas.style.maxHeight = 'calc(100vh - 220px)';
  }

  zoomInBtn.addEventListener('click', () => setZoom(currentZoom + 0.15));
  zoomOutBtn.addEventListener('click', () => setZoom(currentZoom - 0.15));
  zoomFitBtn.addEventListener('click', zoomFit);

  // --- DOWNLOAD EXPORT ---
  topDownloadBtn.addEventListener('click', () => {
    exportCurrentImage();
  });

  async function exportCurrentImage() {
    if (!engine.getCanvas().width) {
      showToast('Load an image first before exporting');
      return;
    }

    // 1. If currently in Compress tool with targetKB mode:
    if (currentTool === 'compress') {
      const activeMode = document.querySelector('#compressModeGroup .pill-option-btn.active')?.dataset.mode;
      if (activeMode === 'targetKB') {
        const targetKB = parseInt(document.getElementById('targetKBInput').value) || 200;
        const fmtBtn = document.querySelector('#compressFormatGroup .pill-option-btn.active');
        const fmt = fmtBtn ? fmtBtn.dataset.fmt : 'image/jpeg';

        // If we already have a verified compressed blob matching this target and format, download directly!
        if (engine.lastCompressedBlob && engine.lastTargetKB === targetKB && engine.exportFormat === fmt) {
          downloadBlob(engine.lastCompressedBlob, fmt);
          return;
        }

        // Otherwise optimize on-the-fly to guarantee the target size
        showToast(`Optimizing image to ≤ ${targetKB} KB for export...`);
        try {
          const res = await SmartCompressor.compressToTargetKB(engine.getBaseCanvas(), targetKB, fmt);
          engine.lastCompressedBlob = res.blob;
          engine.lastTargetKB = targetKB;
          engine.exportFormat = fmt;
          engine.exportQuality = res.quality;
          engine.meta.size = res.blob.size;

          syncConvertUI(fmt, res.quality);
          syncCanvasDisplay();
          updateCompressTargetStatus();

          downloadBlob(res.blob, fmt);
          return;
        } catch (err) {
          console.error(err);
        }
      }
    }

    // 2. If a verified compressed blob exists (e.g. user clicked Apply in Compress tool and then clicked Export Image):
    if (engine.lastCompressedBlob) {
      downloadBlob(engine.lastCompressedBlob, engine.exportFormat || 'image/jpeg');
      return;
    }

    // 3. If on Convert Format tab:
    if (currentTool === 'convert') {
      const activeFmtBtn = document.querySelector('#convertFormatGroup .pill-option-btn.active');
      const fmt = activeFmtBtn ? activeFmtBtn.dataset.fmt : (engine.exportFormat || 'image/jpeg');
      const q = parseInt(document.getElementById('convertQualitySlider').value) / 100;
      triggerDownload(fmt, q);
      return;
    }

    // 4. Default export using engine's current format and quality
    const format = engine.exportFormat || (engine.meta.type && engine.meta.type.startsWith('image/') ? engine.meta.type : 'image/jpeg');
    const quality = engine.exportQuality || 0.92;
    triggerDownload(format, quality);
  }

  function downloadBlob(blob, format) {
    const ext = batch.getExtensionForMime(format || blob.type || 'image/jpeg');
    const filename = `${engine.meta.name || 'luminary-export'}.${ext}`;

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    history.logAction('Export Image', `Exported ${filename} (${SmartCompressor.formatBytes(blob.size)})`);
    showToast(`Exported ${filename} (${SmartCompressor.formatBytes(blob.size)}) successfully!`);
  }

  function triggerDownload(format, quality = 0.92) {
    if (!engine.getCanvas().width) {
      showToast('Load an image first before exporting');
      return;
    }

    engine.exportBlob(format, quality).then(blob => {
      downloadBlob(blob, format);
    }).catch(err => {
      showToast('Export error: ' + err.message);
    });
  }

  // Initialize display
  renderHistoryLists(history.actions);
});
