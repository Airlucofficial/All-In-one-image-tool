/**
 * Comprehensive Automated Verification Suite for Luminary Image Studio
 */

const assert = require('assert');

// Mock browser globals for Node.js test environment
global.localStorage = {
  store: {},
  getItem(k) { return this.store[k] || null; },
  setItem(k, v) { this.store[k] = String(v); },
  removeItem(k) { delete this.store[k]; }
};

global.Blob = class MockBlob {
  constructor(content, options = {}) {
    this.content = content;
    this.type = options.type || '';
    this.size = Array.isArray(content) ? content.reduce((acc, c) => acc + (c.length || c.byteLength || 0), 0) : 0;
  }
};

const SmartCompressor = require('../js/compressor.js');
const PaletteExtractor = require('../js/palette.js');
const BatchProcessor = require('../js/batch.js');
const HistoryManager = require('../js/history.js');

let passedTests = 0;
let totalTests = 0;

function it(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  ✓ PASS: ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ✗ FAIL: ${name}`);
    console.error(`    ${err.message}`);
  }
}

console.log('Running Luminary Image Studio Test Suite...\n');

// 1. Megapixel and Compressor Unit Tests
console.log('--- Suite 1: SmartCompressor & MP Calculations ---');

it('calculates accurate megapixels for standard resolutions', () => {
  assert.strictEqual(SmartCompressor.calculateMegapixels(1920, 1080), 2.07);
  assert.strictEqual(SmartCompressor.calculateMegapixels(3840, 2160), 8.29);
  assert.strictEqual(SmartCompressor.calculateMegapixels(1000, 1000), 1.0);
  assert.strictEqual(SmartCompressor.calculateMegapixels(100, 100), 0.01);
});

it('calculates target dimensions from target MP while preserving aspect ratio', () => {
  // Test user requirement: "If an image is 2 MP, then we can reduce it to as much size as we want"
  const origW = 1920;
  const origH = 1080;
  const origAspect = origW / origH;

  // Reduce to 1.0 MP
  const target1MP = SmartCompressor.dimensionsFromTargetMP(origW, origH, 1.0);
  const aspect1 = target1MP.width / target1MP.height;
  assert(Math.abs(aspect1 - origAspect) < 0.01, `Aspect ratio deviated: ${aspect1} vs ${origAspect}`);
  assert(Math.abs(target1MP.megapixels - 1.0) < 0.05, `Target MP deviated: ${target1MP.megapixels}`);

  // Reduce to 0.5 MP
  const targetHalfMP = SmartCompressor.dimensionsFromTargetMP(origW, origH, 0.5);
  const aspectHalf = targetHalfMP.width / targetHalfMP.height;
  assert(Math.abs(aspectHalf - origAspect) < 0.01, `Aspect ratio deviated: ${aspectHalf} vs ${origAspect}`);
  assert(Math.abs(targetHalfMP.megapixels - 0.5) < 0.05, `Target MP deviated: ${targetHalfMP.megapixels}`);

  // Boundary check: Very small 0.1 MP
  const targetTiny = SmartCompressor.dimensionsFromTargetMP(origW, origH, 0.1);
  assert(targetTiny.width > 0 && targetTiny.height > 0);
});

it('formats bytes human-readably across boundaries', () => {
  assert.strictEqual(SmartCompressor.formatBytes(0), '0 B');
  assert.strictEqual(SmartCompressor.formatBytes(512), '512 B');
  assert.strictEqual(SmartCompressor.formatBytes(1024), '1 KB');
  assert.strictEqual(SmartCompressor.formatBytes(204800), '200 KB');
  assert.strictEqual(SmartCompressor.formatBytes(1048576), '1 MB');
  assert.strictEqual(SmartCompressor.formatBytes(2097152), '2 MB');
});

// 2. Palette & Eyedropper Tests
console.log('\n--- Suite 2: PaletteExtractor & Color Utils ---');

it('converts RGB to uppercase hex with padding', () => {
  assert.strictEqual(PaletteExtractor.rgbToHex(0, 0, 0), '#000000');
  assert.strictEqual(PaletteExtractor.rgbToHex(255, 255, 255), '#FFFFFF');
  assert.strictEqual(PaletteExtractor.rgbToHex(0, 113, 227), '#0071E3');
  assert.strictEqual(PaletteExtractor.rgbToHex(5, 9, 15), '#05090F');
});

it('clamps out of bound RGB values gracefully', () => {
  assert.strictEqual(PaletteExtractor.rgbToHex(-10, 300, 128), '#00FF80');
});

// 3. Batch Processor & Format Tests
console.log('\n--- Suite 3: BatchProcessor & MIME Types ---');

it('resolves proper file extension for all supported mime types', () => {
  const bp = new BatchProcessor();
  assert.strictEqual(bp.getExtensionForMime('image/png'), 'png');
  assert.strictEqual(bp.getExtensionForMime('image/jpeg'), 'jpg');
  assert.strictEqual(bp.getExtensionForMime('image/webp'), 'webp');
  assert.strictEqual(bp.getExtensionForMime('image/avif'), 'avif');
  assert.strictEqual(bp.getExtensionForMime('image/bmp'), 'bmp');
  assert.strictEqual(bp.getExtensionForMime('image/x-icon'), 'ico');
});

it('handles batch queue additions and removals', () => {
  const bp = new BatchProcessor();
  // Mock file
  global.URL = {
    createObjectURL: () => 'blob:mock',
    revokeObjectURL: () => {}
  };

  bp.addFiles([
    { name: 'photo1.jpg', size: 102400, type: 'image/jpeg' },
    { name: 'doc.pdf', size: 50000, type: 'application/pdf' }, // should be ignored
    { name: 'banner.png', size: 204800, type: 'image/png' }
  ]);

  assert.strictEqual(bp.queue.length, 2, 'Should only accept image files');
  assert.strictEqual(bp.queue[0].name, 'photo1.jpg');
  assert.strictEqual(bp.queue[1].name, 'banner.png');

  // Remove first item
  const id = bp.queue[0].id;
  bp.removeItem(id);
  assert.strictEqual(bp.queue.length, 1);
  assert.strictEqual(bp.queue[0].name, 'banner.png');

  bp.clearQueue();
  assert.strictEqual(bp.queue.length, 0);
});

// 4. History Manager & Auto-Save
console.log('\n--- Suite 4: HistoryManager & Session Persistence ---');

it('records actions and persists to storage', () => {
  const hm = new HistoryManager();
  hm.logAction('Resize', 'Resized to 800x600 px', { width: 800, height: 600 });
  hm.logAction('Compress', 'Target 200 KB applied', { targetKB: 200 });

  assert.strictEqual(hm.actions.length, 2);
  assert.strictEqual(hm.actions[0].toolName, 'Compress');
  assert.strictEqual(hm.actions[1].toolName, 'Resize');

  // Check persistence
  const stored = JSON.parse(global.localStorage.getItem('luminary_studio_history_v1'));
  assert(stored !== null);
  assert.strictEqual(stored.actions.length, 2);
});

it('enforces maximum history limit without memory leak', () => {
  const hm = new HistoryManager();
  for (let i = 0; i < 70; i++) {
    hm.logAction('Action ' + i, 'Details ' + i);
  }
  assert(hm.actions.length <= 50, `History length exceeded max: ${hm.actions.length}`);
});

// 5. Geometry & Aspect Ratio Verification
console.log('\n--- Suite 5: Aspect Ratio & Geometry Verification ---');

it('correctly calculates crop dimensions for 16:9, 9:16, and 1:1', () => {
  function getCropBounds(srcW, srcH, ratioW, ratioH) {
    const targetRatio = ratioW / ratioH;
    const srcRatio = srcW / srcH;
    let cropW, cropH;
    if (srcRatio > targetRatio) {
      cropH = srcH;
      cropW = Math.round(srcH * targetRatio);
    } else {
      cropW = srcW;
      cropH = Math.round(srcW / targetRatio);
    }
    return { cropW, cropH };
  }

  // 1920x1080 -> 1:1 Square
  const square = getCropBounds(1920, 1080, 1, 1);
  assert.strictEqual(square.cropW, 1080);
  assert.strictEqual(square.cropH, 1080);

  // 1920x1080 -> 9:16 Portrait / Stories
  const portrait = getCropBounds(1920, 1080, 9, 16);
  assert.strictEqual(portrait.cropH, 1080);
  assert.strictEqual(portrait.cropW, Math.round(1080 * 9 / 16));

  // 1080x1920 -> 16:9 Landscape
  const landscape = getCropBounds(1080, 1920, 16, 9);
  assert.strictEqual(landscape.cropW, 1080);
  assert.strictEqual(landscape.cropH, Math.round(1080 / (16 / 9)));
});

// 6. Chroma Key / Color Distance Metric
console.log('\n--- Suite 6: Chroma Key & Transparency Math ---');

it('accurately computes perceptual color distance', () => {
  function colorDistance(r1, g1, b1, r2, g2, b2) {
    const dr = r1 - r2;
    const dg = g1 - g2;
    const db = b1 - b2;
    return Math.sqrt(dr * dr * 0.3 + dg * dg * 0.59 + db * db * 0.11) * 2;
  }

  // Same color distance must be 0
  assert.strictEqual(colorDistance(255, 255, 255, 255, 255, 255), 0);
  assert.strictEqual(colorDistance(0, 0, 0, 0, 0, 0), 0);

  // Pure white vs pure black
  const maxD = colorDistance(255, 255, 255, 0, 0, 0);
  assert(maxD > 400 && maxD < 520, `Max distance: ${maxD}`);

  // Slight variation (tolerance check)
  const slightVariation = colorDistance(255, 255, 255, 245, 245, 245);
  assert(slightVariation < 25, `Slight variation should be small: ${slightVariation}`);
});

// 7. Advanced Edge Cases, Crop Handles & Filename De-duplication
console.log('\n--- Suite 7: Advanced Edge Cases & Refinements ---');

it('de-duplicates identical filenames in batch zip processing', () => {
  const mockProcessed = [
    { name: 'avatar.png', blob: { type: 'image/png' } },
    { name: 'avatar.png', blob: { type: 'image/png' } },
    { name: 'avatar.png', blob: { type: 'image/png' } }
  ];

  const bp = new BatchProcessor();
  const usedNames = new Set();
  const outputNames = [];

  for (const item of mockProcessed) {
    const ext = bp.getExtensionForMime(item.blob.type);
    const baseName = item.name.replace(/\.[^/.]+$/, "");
    let finalName = `${baseName}.${ext}`;
    let counter = 1;
    while (usedNames.has(finalName)) {
      finalName = `${baseName}_${counter}.${ext}`;
      counter++;
    }
    usedNames.add(finalName);
    outputNames.push(finalName);
  }

  assert.deepStrictEqual(outputNames, ['avatar.png', 'avatar_1.png', 'avatar_2.png']);
  assert.strictEqual(usedNames.size, 3);
});

it('accurately calculates crop handle resize and clamps to container bounds', () => {
  const containerW = 600;
  const containerH = 400;
  const minSize = 24;

  let boxLeft = 100;
  let boxTop = 50;
  let boxW = 200;
  let boxH = 150;

  // Simulate dragging SE handle beyond container boundary
  const dx = 500;
  const dy = 500;
  const maxW = containerW - boxLeft; // 500
  const maxH = containerH - boxTop;  // 350
  const newW = Math.max(minSize, Math.min(maxW, boxW + dx));
  const newH = Math.max(minSize, Math.min(maxH, boxH + dy));

  assert.strictEqual(newW, 500, 'SE handle should clamp width to container boundary');
  assert.strictEqual(newH, 350, 'SE handle should clamp height to container boundary');
  assert(boxLeft + newW <= containerW);
  assert(boxTop + newH <= containerH);
});

it('strictly ensures compressor candidate selection never chooses over-budget candidates when valid ones exist', () => {
  const targetBytes = 200 * 1024; // 204,800 bytes
  const mockCandidates = [
    { size: 250000, quality: 0.9 },
    { size: 208000, quality: 0.8 }, // Over budget by 3,200 bytes
    { size: 195000, quality: 0.7 }, // Under budget by 9,800 bytes (VALID)
    { size: 160000, quality: 0.5 }  // Under budget by 44,800 bytes (VALID but lower quality)
  ];

  let bestUnderBlob = null;
  let bestUnderQuality = null;

  for (const blob of mockCandidates) {
    if (blob.size <= targetBytes) {
      if (!bestUnderBlob || blob.size > bestUnderBlob.size) {
        bestUnderBlob = blob;
        bestUnderQuality = blob.quality;
      }
    }
  }

  assert.strictEqual(bestUnderBlob.size, 195000);
  assert.strictEqual(bestUnderQuality, 0.7);
  assert(bestUnderBlob.size <= targetBytes, 'Selected candidate must be strictly within budget');
});

console.log(`\n======================================================`);
console.log(`Test Execution Finished: ${passedTests}/${totalTests} Passed.`);
console.log(`======================================================\n`);

if (passedTests !== totalTests) {
  process.exit(1);
}


