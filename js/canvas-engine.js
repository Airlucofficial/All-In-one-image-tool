/**
 * Luminary Image Studio - Core Canvas Engine
 * High-performance browser-based pixel processing, filters, and geometry engine.
 */

class CanvasEngine {
  constructor() {
    this.originalImage = null;       // Original HTMLImageElement
    this.originalBlob = null;        // Original File / Blob
    this.currentCanvas = document.createElement('canvas');
    this.currentCtx = this.currentCanvas.getContext('2d', { willReadFrequently: true });
    
    // Backup canvas representing applied state (before real-time live preview adjustments)
    this.baseCanvas = document.createElement('canvas');
    this.baseCtx = this.baseCanvas.getContext('2d', { willReadFrequently: true });

    // Image Metadata
    this.meta = {
      name: 'image',
      type: 'image/png',
      size: 0,
      width: 0,
      height: 0,
      aspectRatio: 1
    };

    // Compression and Export State
    this.lastCompressedBlob = null;
    this.lastTargetKB = null;
    this.exportFormat = 'image/jpeg';
    this.exportQuality = 0.92;
    this._applyingCompression = false;
  }

  /**
   * Load an image file into the engine
   * @param {File|Blob} file 
   * @returns {Promise<object>} metadata
   */
  async loadImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.crossOrigin = 'anonymous';

      img.onload = () => {
        this.originalImage = img;
        this.originalBlob = file;
        this.lastCompressedBlob = null;
        this.lastTargetKB = null;
        const mimeType = (file && file.type && file.type.startsWith('image/')) ? file.type : 'image/jpeg';
        this.exportFormat = mimeType;
        this.exportQuality = 0.92;
        this.meta = {
          name: file.name ? file.name.replace(/\.[^/.]+$/, "") : 'image',
          type: mimeType,
          size: file.size || 0,
          width: img.naturalWidth || img.width,
          height: img.naturalHeight || img.height,
          aspectRatio: (img.naturalWidth || img.width) / (img.naturalHeight || img.height)
        };

        this.setDimensions(this.meta.width, this.meta.height);
        this.currentCtx.drawImage(img, 0, 0);
        this.syncBaseCanvas();

        URL.revokeObjectURL(url);
        resolve({ ...this.meta });
      };

      img.onerror = (err) => {
        URL.revokeObjectURL(url);
        reject(new Error('Failed to decode image. Format may be unsupported by browser.'));
      };

      img.src = url;
    });
  }

  /**
   * Load from an Image element directly (e.g. sample image)
   */
  loadFromImageElement(img, name = 'sample-image', type = 'image/jpeg') {
    this.originalImage = img;
    this.lastCompressedBlob = null;
    this.lastTargetKB = null;
    this.exportFormat = type;
    this.exportQuality = 0.92;
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    this.meta = {
      name: name,
      type: type,
      size: 0,
      width: w,
      height: h,
      aspectRatio: w / h
    };

    this.setDimensions(w, h);
    this.currentCtx.drawImage(img, 0, 0);
    this.syncBaseCanvas();
    return { ...this.meta };
  }

  setDimensions(w, h) {
    w = Math.max(1, Math.round(w));
    h = Math.max(1, Math.round(h));
    this.currentCanvas.width = w;
    this.currentCanvas.height = h;
    this.currentCtx.imageSmoothingEnabled = true;
    this.currentCtx.imageSmoothingQuality = 'high';
  }

  syncBaseCanvas() {
    this.baseCanvas.width = this.currentCanvas.width;
    this.baseCanvas.height = this.currentCanvas.height;
    this.baseCtx.imageSmoothingEnabled = true;
    this.baseCtx.imageSmoothingQuality = 'high';
    this.baseCtx.clearRect(0, 0, this.baseCanvas.width, this.baseCanvas.height);
    this.baseCtx.drawImage(this.currentCanvas, 0, 0);
  }

  restoreFromBase() {
    this.setDimensions(this.baseCanvas.width, this.baseCanvas.height);
    this.currentCtx.clearRect(0, 0, this.currentCanvas.width, this.currentCanvas.height);
    this.currentCtx.drawImage(this.baseCanvas, 0, 0);
  }

  commitChanges() {
    this.syncBaseCanvas();
    this.meta.width = this.currentCanvas.width;
    this.meta.height = this.currentCanvas.height;
    this.meta.aspectRatio = this.meta.width / this.meta.height;
    if (!this._applyingCompression) {
      this.lastCompressedBlob = null;
      this.lastTargetKB = null;
    }
  }

  getCanvas() {
    return this.currentCanvas;
  }

  getBaseCanvas() {
    return this.baseCanvas;
  }

  // ==========================================
  // 1. RESIZE & ASPECT RATIO
  // ==========================================

  /**
   * Resize to specific width and height with resampling
   */
  resize(targetW, targetH) {
    targetW = Math.max(1, Math.round(targetW));
    targetH = Math.max(1, Math.round(targetH));

    const temp = document.createElement('canvas');
    temp.width = targetW;
    temp.height = targetH;
    const ctx = temp.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    // Step-down resizing algorithm for sharp downscaling
    let curW = this.baseCanvas.width;
    let curH = this.baseCanvas.height;

    if (curW > targetW * 2 || curH > targetH * 2) {
      // Half-step downscaling for anti-aliased sharpness
      let stepCanvas = document.createElement('canvas');
      let stepCtx = stepCanvas.getContext('2d');
      stepCanvas.width = curW;
      stepCanvas.height = curH;
      stepCtx.drawImage(this.baseCanvas, 0, 0);

      while (curW * 0.5 > targetW && curH * 0.5 > targetH) {
        curW = Math.round(curW * 0.5);
        curH = Math.round(curH * 0.5);
        const nextCanvas = document.createElement('canvas');
        nextCanvas.width = curW;
        nextCanvas.height = curH;
        const nextCtx = nextCanvas.getContext('2d');
        nextCtx.imageSmoothingEnabled = true;
        nextCtx.imageSmoothingQuality = 'high';
        nextCtx.drawImage(stepCanvas, 0, 0, curW, curH);
        stepCanvas = nextCanvas;
        stepCtx = nextCtx;
      }
      ctx.drawImage(stepCanvas, 0, 0, targetW, targetH);
    } else {
      ctx.drawImage(this.baseCanvas, 0, 0, targetW, targetH);
    }

    this.setDimensions(targetW, targetH);
    this.currentCtx.clearRect(0, 0, targetW, targetH);
    this.currentCtx.drawImage(temp, 0, 0);
  }

  /**
   * Resize to target Megapixels (e.g. 2 MP, 1 MP, 0.5 MP)
   */
  resizeToMegapixels(targetMP) {
    const totalPixels = targetMP * 1000000;
    const currentW = this.baseCanvas.width;
    const currentH = this.baseCanvas.height;
    const aspect = currentW / currentH;

    const newH = Math.round(Math.sqrt(totalPixels / aspect));
    const newW = Math.round(newH * aspect);
    this.resize(newW, newH);
    return { width: newW, height: newH, megapixels: (newW * newH) / 1000000 };
  }

  /**
   * Fit to aspect ratio with mode: 'crop', 'pad-blur', 'pad-white', 'pad-transparent', 'stretch'
   */
  fitToAspectRatio(ratioWidth, ratioHeight, mode = 'pad-blur') {
    const targetRatio = ratioWidth / ratioHeight;
    const srcW = this.baseCanvas.width;
    const srcH = this.baseCanvas.height;
    const srcRatio = srcW / srcH;

    if (mode === 'stretch') {
      let finalW = srcW;
      let finalH = Math.round(srcW / targetRatio);
      this.resize(finalW, finalH);
      return;
    }

    if (mode === 'crop') {
      let cropW, cropH, cropX, cropY;
      if (srcRatio > targetRatio) {
        // Image is wider than target ratio: crop sides
        cropH = srcH;
        cropW = Math.round(srcH * targetRatio);
        cropX = Math.round((srcW - cropW) / 2);
        cropY = 0;
      } else {
        // Image is taller than target ratio: crop top & bottom
        cropW = srcW;
        cropH = Math.round(srcW / targetRatio);
        cropX = 0;
        cropY = Math.round((srcH - cropH) / 2);
      }
      this.crop(cropX, cropY, cropW, cropH);
      return;
    }

    // Pad / Letterbox modes
    let canvasW, canvasH, drawW, drawH, drawX, drawY;
    if (srcRatio > targetRatio) {
      // Wider: pad top and bottom
      canvasW = srcW;
      canvasH = Math.round(srcW / targetRatio);
      drawW = srcW;
      drawH = srcH;
      drawX = 0;
      drawY = Math.round((canvasH - srcH) / 2);
    } else {
      // Taller: pad sides
      canvasH = srcH;
      canvasW = Math.round(srcH * targetRatio);
      drawW = srcW;
      drawH = srcH;
      drawX = Math.round((canvasW - srcW) / 2);
      drawY = 0;
    }

    this.setDimensions(canvasW, canvasH);
    this.currentCtx.clearRect(0, 0, canvasW, canvasH);

    if (mode === 'pad-blur') {
      // Create frosted blurred background
      const blurCanvas = document.createElement('canvas');
      blurCanvas.width = canvasW;
      blurCanvas.height = canvasH;
      const blurCtx = blurCanvas.getContext('2d');
      blurCtx.imageSmoothingEnabled = true;
      blurCtx.imageSmoothingQuality = 'high';

      // Draw enlarged version of image covering whole background
      let scale = Math.max(canvasW / srcW, canvasH / srcH);
      let bgW = srcW * scale;
      let bgH = srcH * scale;
      let bgX = (canvasW - bgW) / 2;
      let bgY = (canvasH - bgH) / 2;
      blurCtx.drawImage(this.baseCanvas, bgX, bgY, bgW, bgH);

      // Fast Canvas Blur Filter
      this.currentCtx.filter = 'blur(28px) brightness(0.95)';
      this.currentCtx.drawImage(blurCanvas, 0, 0);
      this.currentCtx.filter = 'none';

      // Subtle translucent white overlay for Apple aesthetic
      this.currentCtx.fillStyle = 'rgba(255, 255, 255, 0.25)';
      this.currentCtx.fillRect(0, 0, canvasW, canvasH);
    } else if (mode === 'pad-white') {
      this.currentCtx.fillStyle = '#ffffff';
      this.currentCtx.fillRect(0, 0, canvasW, canvasH);
    } else if (mode === 'pad-black') {
      this.currentCtx.fillStyle = '#000000';
      this.currentCtx.fillRect(0, 0, canvasW, canvasH);
    }

    // Draw main centered image
    this.currentCtx.drawImage(this.baseCanvas, drawX, drawY, drawW, drawH);
  }

  // ==========================================
  // 2. CROP & ROTATE & FLIP
  // ==========================================

  crop(x, y, w, h) {
    x = Math.max(0, Math.round(x));
    y = Math.max(0, Math.round(y));
    w = Math.min(this.baseCanvas.width - x, Math.round(w));
    h = Math.min(this.baseCanvas.height - y, Math.round(h));

    if (w <= 0 || h <= 0) return;

    const temp = document.createElement('canvas');
    temp.width = w;
    temp.height = h;
    const ctx = temp.getContext('2d');
    ctx.drawImage(this.baseCanvas, x, y, w, h, 0, 0, w, h);

    this.setDimensions(w, h);
    this.currentCtx.clearRect(0, 0, w, h);
    this.currentCtx.drawImage(temp, 0, 0);
  }

  rotate90(clockwise = true) {
    const srcW = this.baseCanvas.width;
    const srcH = this.baseCanvas.height;

    this.setDimensions(srcH, srcW);
    this.currentCtx.clearRect(0, 0, srcH, srcW);
    this.currentCtx.save();
    if (clockwise) {
      this.currentCtx.translate(srcH, 0);
      this.currentCtx.rotate(Math.PI / 2);
    } else {
      this.currentCtx.translate(0, srcW);
      this.currentCtx.rotate(-Math.PI / 2);
    }
    this.currentCtx.drawImage(this.baseCanvas, 0, 0);
    this.currentCtx.restore();
  }

  rotateAngle(angleDegrees) {
    const rad = (angleDegrees * Math.PI) / 180;
    const srcW = this.baseCanvas.width;
    const srcH = this.baseCanvas.height;

    const cos = Math.abs(Math.cos(rad));
    const sin = Math.abs(Math.sin(rad));
    const newW = Math.round(srcW * cos + srcH * sin);
    const newH = Math.round(srcW * sin + srcH * cos);

    this.setDimensions(newW, newH);
    this.currentCtx.clearRect(0, 0, newW, newH);
    this.currentCtx.save();
    this.currentCtx.translate(newW / 2, newH / 2);
    this.currentCtx.rotate(rad);
    this.currentCtx.drawImage(this.baseCanvas, -srcW / 2, -srcH / 2);
    this.currentCtx.restore();
  }

  flip(horizontal = true, vertical = false) {
    const w = this.baseCanvas.width;
    const h = this.baseCanvas.height;
    this.setDimensions(w, h);
    this.currentCtx.clearRect(0, 0, w, h);
    this.currentCtx.save();
    this.currentCtx.translate(horizontal ? w : 0, vertical ? h : 0);
    this.currentCtx.scale(horizontal ? -1 : 1, vertical ? -1 : 1);
    this.currentCtx.drawImage(this.baseCanvas, 0, 0);
    this.currentCtx.restore();
  }

  // ==========================================
  // 3. TRANSPARENCY & MAGIC COLOR REMOVER
  // ==========================================

  /**
   * Adjust overall global transparency
   * @param {number} opacity 0.0 to 1.0
   */
  setGlobalOpacity(opacity) {
    this.restoreFromBase();
    const w = this.currentCanvas.width;
    const h = this.currentCanvas.height;
    const imgData = this.currentCtx.getImageData(0, 0, w, h);
    const data = imgData.data;

    for (let i = 3; i < data.length; i += 4) {
      data[i] = Math.round(data[i] * opacity);
    }
    this.currentCtx.putImageData(imgData, 0, 0);
  }

  /**
   * Remove background color by chroma key / color distance
   * @param {number} targetR 
   * @param {number} targetG 
   * @param {number} targetB 
   * @param {number} tolerance 0 to 100
   * @param {number} feather 0 to 50
   */
  removeColor(targetR, targetG, targetB, tolerance = 25, feather = 10) {
    this.restoreFromBase();
    const w = this.currentCanvas.width;
    const h = this.currentCanvas.height;
    const imgData = this.currentCtx.getImageData(0, 0, w, h);
    const data = imgData.data;

    // Convert tolerance from 0..100 to max distance in RGB space (0..441.67)
    const maxDist = 441.67;
    const threshold = (tolerance / 100) * maxDist;
    const featherDist = (feather / 100) * maxDist;

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = data[i + 3];

      if (a === 0) continue;

      // Euclidean color distance with perceptual weighting
      const dr = r - targetR;
      const dg = g - targetG;
      const db = b - targetB;
      const dist = Math.sqrt(dr * dr * 0.3 + dg * dg * 0.59 + db * db * 0.11) * 2;

      if (dist <= threshold) {
        data[i + 3] = 0; // completely transparent
      } else if (dist < threshold + featherDist && featherDist > 0) {
        // Smooth alpha ramp
        const factor = (dist - threshold) / featherDist;
        data[i + 3] = Math.round(a * factor);
      }
    }

    this.currentCtx.putImageData(imgData, 0, 0);
  }

  // ==========================================
  // 4. BLUR, PRIVACY & CENSOR
  // ==========================================

  /**
   * Apply Gaussian blur radius
   */
  applyBlur(radius = 10) {
    this.restoreFromBase();
    if (radius <= 0) return;
    
    this.currentCtx.filter = `blur(${radius}px)`;
    this.currentCtx.drawImage(this.baseCanvas, 0, 0);
    this.currentCtx.filter = 'none';
  }

  /**
   * Pixelate / Mosaic censor effect
   */
  applyPixelate(blockSize = 12) {
    this.restoreFromBase();
    if (blockSize <= 1) return;

    const w = this.currentCanvas.width;
    const h = this.currentCanvas.height;

    const scaledW = Math.max(1, Math.round(w / blockSize));
    const scaledH = Math.max(1, Math.round(h / blockSize));

    const small = document.createElement('canvas');
    small.width = scaledW;
    small.height = scaledH;
    const sCtx = small.getContext('2d');
    sCtx.imageSmoothingEnabled = false;
    sCtx.drawImage(this.baseCanvas, 0, 0, scaledW, scaledH);

    this.currentCtx.imageSmoothingEnabled = false;
    this.currentCtx.clearRect(0, 0, w, h);
    this.currentCtx.drawImage(small, 0, 0, scaledW, scaledH, 0, 0, w, h);
    this.currentCtx.imageSmoothingEnabled = true;
  }

  /**
   * Tilt-shift blur (depth of field)
   */
  applyTiltShift(centerYRatio = 0.5, focusHeightRatio = 0.25, blurRadius = 16) {
    this.restoreFromBase();
    if (blurRadius <= 0) return;

    const w = this.currentCanvas.width;
    const h = this.currentCanvas.height;

    // Create blurred version
    const blurred = document.createElement('canvas');
    blurred.width = w;
    blurred.height = h;
    const bCtx = blurred.getContext('2d');
    bCtx.filter = `blur(${blurRadius}px)`;
    bCtx.drawImage(this.baseCanvas, 0, 0);
    bCtx.filter = 'none';

    // Mask gradient
    const mask = document.createElement('canvas');
    mask.width = w;
    mask.height = h;
    const mCtx = mask.getContext('2d');

    const grad = mCtx.createLinearGradient(0, 0, 0, h);
    const mid = h * centerYRatio;
    const halfBand = (h * focusHeightRatio) / 2;

    const topFade = Math.max(0, (mid - halfBand * 2) / h);
    const topFocus = Math.max(0, (mid - halfBand) / h);
    const bottomFocus = Math.min(1, (mid + halfBand) / h);
    const bottomFade = Math.min(1, (mid + halfBand * 2) / h);

    grad.addColorStop(0, 'rgba(0,0,0,1)');
    grad.addColorStop(topFade, 'rgba(0,0,0,1)');
    grad.addColorStop(topFocus, 'rgba(0,0,0,0)');
    grad.addColorStop(bottomFocus, 'rgba(0,0,0,0)');
    grad.addColorStop(bottomFade, 'rgba(0,0,0,1)');
    grad.addColorStop(1, 'rgba(0,0,0,1)');

    mCtx.fillStyle = grad;
    mCtx.fillRect(0, 0, w, h);

    // Apply masked blur over base
    bCtx.globalCompositeOperation = 'destination-in';
    bCtx.drawImage(mask, 0, 0);
    bCtx.globalCompositeOperation = 'source-over';

    this.currentCtx.drawImage(blurred, 0, 0);
  }

  // ==========================================
  // 5. PRO FILTERS & COLOR ADJUSTMENTS
  // ==========================================

  applyAdjustments(adjustments) {
    const {
      brightness = 0,    // -100 to 100
      contrast = 0,      // -100 to 100
      saturation = 0,    // -100 to 100
      exposure = 0,      // -100 to 100
      warmth = 0,        // -100 to 100
      sepia = 0,         // 0 to 100
      grayscale = 0,     // 0 to 100
      invert = 0,        // 0 to 100
      hue = 0,           // 0 to 360
      sharpen = 0        // 0 to 100
    } = adjustments;

    this.restoreFromBase();

    // 1. Canvas CSS Filters for hardware acceleration
    const b = (100 + brightness) / 100;
    const c = (100 + contrast) / 100;
    const s = (100 + saturation) / 100;
    const sep = sepia / 100;
    const gray = grayscale / 100;
    const inv = invert / 100;

    let filterStr = `brightness(${b}) contrast(${c}) saturate(${s}) sepia(${sep}) grayscale(${gray}) invert(${inv}) hue-rotate(${hue}deg)`;
    this.currentCtx.filter = filterStr;
    this.currentCtx.drawImage(this.baseCanvas, 0, 0);
    this.currentCtx.filter = 'none';

    // 2. Pixel pass for Warmth/Temperature & Exposure & Sharpen if needed
    if (warmth !== 0 || exposure !== 0 || sharpen > 0) {
      const w = this.currentCanvas.width;
      const h = this.currentCanvas.height;
      const imgData = this.currentCtx.getImageData(0, 0, w, h);
      const data = imgData.data;

      // Warmth & Exposure lookup
      const expFactor = exposure !== 0 ? Math.pow(2, exposure / 50) : 1;
      const warmR = warmth > 0 ? (warmth / 100) * 25 : 0;
      const warmB = warmth < 0 ? (-warmth / 100) * 25 : (warmth > 0 ? -(warmth / 100) * 15 : 0);

      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] === 0) continue;
        
        let r = data[i];
        let g = data[i + 1];
        let b = data[i + 2];

        // Exposure
        if (exposure !== 0) {
          r = Math.min(255, Math.max(0, r * expFactor));
          g = Math.min(255, Math.max(0, g * expFactor));
          b = Math.min(255, Math.max(0, b * expFactor));
        }

        // Warmth
        if (warmth !== 0) {
          r = Math.min(255, Math.max(0, r + warmR));
          b = Math.min(255, Math.max(0, b + warmB));
        }

        data[i] = r;
        data[i + 1] = g;
        data[i + 2] = b;
      }
      this.currentCtx.putImageData(imgData, 0, 0);

      // Convolution Sharpen
      if (sharpen > 0) {
        this.applySharpenMatrix(sharpen / 100);
      }
    }
  }

  applySharpenMatrix(strength = 0.5) {
    const w = this.currentCanvas.width;
    const h = this.currentCanvas.height;
    const imgData = this.currentCtx.getImageData(0, 0, w, h);
    const src = imgData.data;
    const output = this.currentCtx.createImageData(w, h);
    const dst = output.data;

    // Kernel: [0, -k, 0], [-k, 1+4k, -k], [0, -k, 0]
    const k = strength * 0.8;
    const center = 1 + 4 * k;

    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const idx = (y * w + x) * 4;
        const top = ((y - 1) * w + x) * 4;
        const bot = ((y + 1) * w + x) * 4;
        const lft = (y * w + (x - 1)) * 4;
        const rgt = (y * w + (x + 1)) * 4;

        for (let c = 0; c < 3; c++) {
          const val = src[idx + c] * center -
                      (src[top + c] + src[bot + c] + src[lft + c] + src[rgt + c]) * k;
          dst[idx + c] = Math.min(255, Math.max(0, val));
        }
        dst[idx + 3] = src[idx + 3];
      }
    }
    this.currentCtx.putImageData(output, 0, 0);
  }

  // ==========================================
  // 6. WATERMARK & LOGO STAMPER
  // ==========================================

  /**
   * Add logo image onto canvas
   * @param {HTMLImageElement} logoImg 
   * @param {object} config 
   */
  addLogoWatermark(logoImg, config) {
    const {
      anchor = 'bottom-right',  // 9 positions
      scale = 0.2,             // 0.05 to 1.0 relative to canvas width
      opacity = 0.8,
      margin = 30,
      offsetX = 0,
      offsetY = 0
    } = config;

    this.restoreFromBase();
    const w = this.currentCanvas.width;
    const h = this.currentCanvas.height;

    const logoAspect = logoImg.width / logoImg.height;
    const logoW = Math.round(w * scale);
    const logoH = Math.round(logoW / logoAspect);

    let x = margin + offsetX;
    let y = margin + offsetY;

    if (anchor.includes('center')) {
      x = Math.round((w - logoW) / 2) + offsetX;
    } else if (anchor.includes('right')) {
      x = w - logoW - margin + offsetX;
    }

    if (anchor.startsWith('center')) {
      y = Math.round((h - logoH) / 2) + offsetY;
    } else if (anchor.startsWith('bottom')) {
      y = h - logoH - margin + offsetY;
    }

    this.currentCtx.save();
    this.currentCtx.globalAlpha = Math.max(0, Math.min(1, opacity));
    this.currentCtx.drawImage(logoImg, x, y, logoW, logoH);
    this.currentCtx.restore();
  }

  /**
   * Add text watermark
   */
  addTextWatermark(config) {
    const {
      text = '© Luminary Studio',
      fontSize = 32,
      fontFamily = 'Inter, sans-serif',
      color = '#ffffff',
      opacity = 0.7,
      anchor = 'bottom-right',
      margin = 30,
      repeat = false,
      angle = -25
    } = config;

    this.restoreFromBase();
    const w = this.currentCanvas.width;
    const h = this.currentCanvas.height;

    this.currentCtx.save();
    this.currentCtx.font = `600 ${fontSize}px ${fontFamily}`;
    this.currentCtx.fillStyle = color;
    this.currentCtx.globalAlpha = opacity;
    this.currentCtx.shadowColor = 'rgba(0,0,0,0.4)';
    this.currentCtx.shadowBlur = 4;

    if (repeat) {
      // Diagonal repeating tile
      const rad = (angle * Math.PI) / 180;
      this.currentCtx.rotate(rad);
      const textMetrics = this.currentCtx.measureText(text);
      const stepX = textMetrics.width + 120;
      const stepY = fontSize * 3.5;

      const diag = Math.sqrt(w * w + h * h) * 1.5;
      for (let y = -diag; y < diag; y += stepY) {
        for (let x = -diag; x < diag; x += stepX) {
          this.currentCtx.fillText(text, x, y);
        }
      }
    } else {
      const textMetrics = this.currentCtx.measureText(text);
      const textW = textMetrics.width;
      const textH = fontSize;

      let x = margin;
      let y = margin + textH;

      if (anchor.includes('center')) {
        x = Math.round((w - textW) / 2);
      } else if (anchor.includes('right')) {
        x = w - textW - margin;
      }

      if (anchor.startsWith('center')) {
        y = Math.round(h / 2);
      } else if (anchor.startsWith('bottom')) {
        y = h - margin;
      }

      this.currentCtx.fillText(text, x, y);
    }

    this.currentCtx.restore();
  }

  // ==========================================
  // 7. BORDERS, SQUIRCLE & MOCKUP FRAME
  // ==========================================

  applyBorderAndSquircle(config) {
    const {
      radius = 0,          // 0 to min(w,h)/2
      borderWidth = 0,
      borderColor = '#ffffff',
      padding = 0,         // backdrop padding for mockup
      bgColor = '#f8fafc',
      isSquircle = true,
      shadowBlur = 0,
      shadowColor = 'rgba(0,0,0,0.15)'
    } = config;

    this.restoreFromBase();
    const srcW = this.baseCanvas.width;
    const srcH = this.baseCanvas.height;

    const totalW = srcW + padding * 2;
    const totalH = srcH + padding * 2;

    this.setDimensions(totalW, totalH);
    this.currentCtx.clearRect(0, 0, totalW, totalH);

    // Fill backdrop if padding exists
    if (padding > 0) {
      this.currentCtx.fillStyle = bgColor;
      this.currentCtx.fillRect(0, 0, totalW, totalH);
    }

    const imgX = padding;
    const imgY = padding;

    // Draw shadow if requested
    if (shadowBlur > 0) {
      this.currentCtx.save();
      this.currentCtx.shadowColor = shadowColor;
      this.currentCtx.shadowBlur = shadowBlur;
      this.currentCtx.shadowOffsetY = shadowBlur * 0.4;
      this.currentCtx.fillStyle = '#ffffff';
      this.drawRoundedRectPath(imgX, imgY, srcW, srcH, radius, isSquircle);
      this.currentCtx.fill();
      this.currentCtx.restore();
    }

    // Clip rounded corners / squircle and draw image
    this.currentCtx.save();
    this.drawRoundedRectPath(imgX, imgY, srcW, srcH, radius, isSquircle);
    this.currentCtx.clip();
    this.currentCtx.drawImage(this.baseCanvas, imgX, imgY, srcW, srcH);
    this.currentCtx.restore();

    // Draw border
    if (borderWidth > 0) {
      this.currentCtx.save();
      this.currentCtx.lineWidth = borderWidth;
      this.currentCtx.strokeStyle = borderColor;
      this.drawRoundedRectPath(imgX, imgY, srcW, srcH, radius, isSquircle);
      this.currentCtx.stroke();
      this.currentCtx.restore();
    }
  }

  drawRoundedRectPath(x, y, w, h, r, squircle = false) {
    r = Math.min(r, Math.min(w, h) / 2);
    this.currentCtx.beginPath();

    if (r <= 0) {
      this.currentCtx.rect(x, y, w, h);
      return;
    }

    if (squircle) {
      // Apple superellipse approximation
      const c = r * 0.55;
      this.currentCtx.moveTo(x + r, y);
      this.currentCtx.lineTo(x + w - r, y);
      this.currentCtx.bezierCurveTo(x + w - c, y, x + w, y + c, x + w, y + r);
      this.currentCtx.lineTo(x + w, y + h - r);
      this.currentCtx.bezierCurveTo(x + w, y + h - c, x + w - c, y + h, x + w - r, y + h);
      this.currentCtx.lineTo(x + r, y + h);
      this.currentCtx.bezierCurveTo(x + c, y + h, x, y + h - c, x, y + h - r);
      this.currentCtx.lineTo(x, y + r);
      this.currentCtx.bezierCurveTo(x, y + c, x + c, y, x + r, y);
    } else {
      this.currentCtx.roundRect(x, y, w, h, r);
    }
    this.currentCtx.closePath();
  }

  // ==========================================
  // 8. EXPORTING & FORMAT BLOB GENERATOR
  // ==========================================

  /**
   * Export to Blob with target format and quality
   * @param {string} format 'image/png' | 'image/jpeg' | 'image/webp' | 'image/avif'
   * @param {number} quality 0.01 to 1.0
   * @returns {Promise<Blob>}
   */
  async exportBlob(format = null, quality = null) {
    const finalFormat = format || this.exportFormat || 'image/jpeg';
    const finalQuality = (quality !== null && quality !== undefined) ? quality : (this.exportQuality || 0.92);

    if (finalFormat === 'image/x-icon' || finalFormat === 'image/ico') {
      return this.exportICO();
    }

    if (finalFormat === 'image/bmp') {
      return this.exportBMP();
    }

    // If we have a verified compressed blob that satisfies the requested format, return it directly!
    if (this.lastCompressedBlob && (!format || format === this.exportFormat || format === this.lastCompressedBlob.type)) {
      return this.lastCompressedBlob;
    }

    return new Promise((resolve) => {
      let canvasToExport = this.currentCanvas;
      if (finalFormat === 'image/jpeg') {
        const temp = document.createElement('canvas');
        temp.width = this.currentCanvas.width;
        temp.height = this.currentCanvas.height;
        const ctx = temp.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, temp.width, temp.height);
        ctx.drawImage(this.currentCanvas, 0, 0);
        canvasToExport = temp;
      }

      canvasToExport.toBlob((blob) => {
        if (!blob) {
          // Fallback to PNG if browser fails to encode specific format
          canvasToExport.toBlob(resolve, 'image/png');
        } else {
          resolve(blob);
        }
      }, finalFormat, finalQuality);
    });
  }

  /**
   * Self-contained BMP encoder
   */
  exportBMP() {
    const w = this.currentCanvas.width;
    const h = this.currentCanvas.height;
    const imgData = this.currentCtx.getImageData(0, 0, w, h);
    const data = imgData.data;

    const rowSize = Math.floor((24 * w + 31) / 32) * 4;
    const pixelArraySize = rowSize * h;
    const fileSize = 54 + pixelArraySize;

    const buffer = new ArrayBuffer(fileSize);
    const view = new DataView(buffer);

    // Bitmap File Header (14 bytes)
    view.setUint16(0, 0x4D42, false); // "BM"
    view.setUint32(2, fileSize, true);
    view.setUint32(6, 0, true);
    view.setUint32(10, 54, true);

    // DIB Header (40 bytes - BITMAPINFOHEADER)
    view.setUint32(14, 40, true);
    view.setInt32(18, w, true);
    view.setInt32(22, h, true); // positive = bottom-up
    view.setUint16(26, 1, true); // color planes
    view.setUint16(28, 24, true); // 24-bit RGB
    view.setUint32(30, 0, true); // BI_RGB no compression
    view.setUint32(34, pixelArraySize, true);
    view.setInt32(38, 2835, true); // 72 DPI
    view.setInt32(42, 2835, true);
    view.setUint32(46, 0, true);
    view.setUint32(50, 0, true);

    // Pixels bottom-up BGR
    let offset = 54;
    for (let y = h - 1; y >= 0; y--) {
      for (let x = 0; x < w; x++) {
        const idx = (y * w + x) * 4;
        view.setUint8(offset++, data[idx + 2]); // Blue
        view.setUint8(offset++, data[idx + 1]); // Green
        view.setUint8(offset++, data[idx]);     // Red
      }
      // Row padding
      for (let p = 0; p < rowSize - w * 3; p++) {
        view.setUint8(offset++, 0);
      }
    }

    return new Blob([buffer], { type: 'image/bmp' });
  }

  /**
   * Export ICO favicon (32x32 standard icon)
   */
  async exportICO() {
    const icoSize = 32;
    const icoCanvas = document.createElement('canvas');
    icoCanvas.width = icoSize;
    icoCanvas.height = icoSize;
    const icoCtx = icoCanvas.getContext('2d');
    icoCtx.drawImage(this.currentCanvas, 0, 0, icoSize, icoSize);

    return new Promise((resolve) => {
      icoCanvas.toBlob((pngBlob) => {
        pngBlob.arrayBuffer().then((buf) => {
          const pngBytes = new Uint8Array(buf);
          const icoHeader = new Uint8Array([
            0, 0,             // Reserved
            1, 0,             // Type 1 = ICO
            1, 0,             // 1 image
            icoSize, icoSize, // Width, Height
            0,                // Color palette
            0,                // Reserved
            1, 0,             // Color planes
            32, 0,            // Bits per pixel
            pngBytes.length & 0xFF, (pngBytes.length >> 8) & 0xFF, (pngBytes.length >> 16) & 0xFF, (pngBytes.length >> 24) & 0xFF, // Image size
            22, 0, 0, 0       // Offset of PNG data
          ]);

          const combined = new Uint8Array(icoHeader.length + pngBytes.length);
          combined.set(icoHeader, 0);
          combined.set(pngBytes, icoHeader.length);

          resolve(new Blob([combined], { type: 'image/x-icon' }));
        });
      }, 'image/png');
    });
  }
}

// Export instance or class
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CanvasEngine;
}
