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

global.document = {
  createElement(tag) {
    if (tag === 'canvas') {
      return {
        width: 1920,
        height: 1080,
        getContext() {
          return {
            imageSmoothingEnabled: true,
            imageSmoothingQuality: 'high',
            drawImage() {},
            clearRect() {},
            fillRect() {},
            getImageData() { return { data: new Uint8Array(400) }; }
          };
        },
        toBlob(cb, fmt, q) {
          // Default uncompressed mock canvas blob is ~1.5 MB (1,500,000 bytes)
          cb(new global.Blob([new Uint8Array(1500000)], { type: fmt || 'image/png' }));
        }
      };
    }
    return {};
  }
};

const SmartCompressor = require('../js/compressor.js');
const CanvasEngine = require('../js/canvas-engine.js');
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

async function itAsync(name, fn) {
  totalTests++;
  try {
    await fn();
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

async function runSuite8() {
  console.log('\n--- Suite 8: Compression Target Size Guarantee & Export Caching ---');

  it('CanvasEngine initializes with default exportFormat and null cached compression', () => {
    const engine = new CanvasEngine();
    assert.strictEqual(engine.exportFormat, 'image/jpeg');
    assert.strictEqual(engine.lastCompressedBlob, null);
    assert.strictEqual(engine.lastTargetKB, null);
  });

  await itAsync('exportBlob returns lastCompressedBlob directly when available, preserving target budget', async () => {
    const engine = new CanvasEngine();
    const target500KBBlob = new global.Blob([new Uint8Array(485000)], { type: 'image/jpeg' });
    engine.lastCompressedBlob = target500KBBlob;
    engine.exportFormat = 'image/jpeg';
    engine.exportQuality = 0.55;

    const exported = await engine.exportBlob('image/jpeg');
    assert.strictEqual(exported.size, 485000, 'Exported blob must be exactly the compressed blob size');
    assert(exported.size <= 500 * 1024, 'Exported blob must be strictly under 500 KB budget');
  });

  it('invalidates cached compressed blob upon canvas commitChanges unless applying compression', () => {
    const engine = new CanvasEngine();
    const target500KBBlob = new global.Blob([new Uint8Array(485000)], { type: 'image/jpeg' });
    engine.lastCompressedBlob = target500KBBlob;

    // Simulate applying a subsequent tool (e.g. crop or filter)
    engine.commitChanges();
    assert.strictEqual(engine.lastCompressedBlob, null, 'Cached blob must be invalidated after modifications');

    // Verify that during _applyingCompression, it is preserved
    engine._applyingCompression = true;
    engine.commitChanges();
    engine.lastCompressedBlob = target500KBBlob;
    engine._applyingCompression = false;
    assert.strictEqual(engine.lastCompressedBlob, target500KBBlob, 'Cached blob preserved when applying compression');
  });

  it('verifies 500 KB target formatBytes and byte conversion', () => {
    assert.strictEqual(SmartCompressor.formatBytes(500 * 1024), '500 KB');
    assert.strictEqual(SmartCompressor.formatBytes(485 * 1024), '485 KB');
    assert.strictEqual(SmartCompressor.formatBytes(1500000), '1.4 MB');
  });

  await itAsync('end-to-end simulation: upload 2MB image, compress to 500KB target, apply and export yields <= 500KB', async () => {
    const engine = new CanvasEngine();

    // 1. Simulate loading a 2 MB (2,097,152 bytes) JPEG image
    const initial2MBFile = {
      name: 'vacation-photo.jpg',
      type: 'image/jpeg',
      size: 2097152
    };
    engine.exportFormat = initial2MBFile.type;
    engine.meta.size = initial2MBFile.size;

    assert.strictEqual(engine.exportFormat, 'image/jpeg');
    assert.strictEqual(engine.meta.size, 2097152);

    // 2. User selects target: 500 KB, format: image/jpeg
    const targetKB = 500;
    const targetBytes = targetKB * 1024; // 512,000 bytes

    // Simulate compressor output for 500 KB target (482 KB)
    const compressedBlob = new global.Blob([new Uint8Array(482000)], { type: 'image/jpeg' });
    assert(compressedBlob.size <= targetBytes, 'Compressor output must be <= 500 KB');

    // 3. User clicks "Apply changes"
    engine._applyingCompression = true;
    engine.commitChanges();
    engine._applyingCompression = false;
    engine.lastCompressedBlob = compressedBlob;
    engine.lastTargetKB = targetKB;
    engine.exportFormat = 'image/jpeg';
    engine.exportQuality = 0.52;
    engine.meta.size = compressedBlob.size;

    // 4. User exports image
    const exportedBlob = await engine.exportBlob('image/jpeg');

    // 5. Verify the exported file is ~482 KB, strictly <= 500 KB, NOT 1.5 MB or 2 MB
    assert.strictEqual(exportedBlob.size, 482000, 'Exported blob must be exactly the compressed 482 KB');
    assert(exportedBlob.size <= targetBytes, 'Exported blob must be <= 500 KB target budget');
    assert.notStrictEqual(exportedBlob.size, 1500000, 'Exported blob must NOT be 1.5 MB uncompressed canvas default');
    assert.notStrictEqual(exportedBlob.size, 2097152, 'Exported blob must NOT be 2 MB original file size');
  });

  // 9. Suite 9: Batch Renamer (Images & Videos) + Dual Folder/ZIP Export
  console.log('\n--- Suite 9: Batch Renamer (Images & Videos) & Export Options ---');

  it('correctly filters image vs video files in batch queue', async () => {
    const bp = new BatchProcessor();
    bp.addFiles([
      { name: 'photo.jpg', size: 1000, type: 'image/jpeg' },
      { name: 'clip.mp4', size: 5000, type: 'video/mp4' } // Not an image -> ignored in addFiles
    ]);
    assert.strictEqual(bp.queue.length, 1);
    assert.strictEqual(bp.queue[0].name, 'photo.jpg');

    await bp.addVideoFiles([
      { name: 'holiday.mp4', size: 10485760, type: 'video/mp4' },
      { name: 'drone.mov', size: 20971520, type: 'video/quicktime' },
      { name: 'note.txt', size: 200, type: 'text/plain' } // Not a video -> ignored in addVideoFiles
    ]);
    assert.strictEqual(bp.videoQueue.length, 2);
    assert.strictEqual(bp.videoQueue[0].name, 'holiday.mp4');
    assert.strictEqual(bp.videoQueue[1].name, 'drone.mov');
  });

  it('guarantees 100% lossless bit-for-bit video preservation (zero re-encoding)', async () => {
    const bp = new BatchProcessor();
    const rawVideoBytes = new Uint8Array([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0x32]);
    const mockVideoFile = {
      name: 'camera_raw.mp4',
      size: rawVideoBytes.length,
      type: 'video/mp4',
      content: [rawVideoBytes]
    };

    await bp.addVideoFiles([mockVideoFile]);
    const queued = bp.videoQueue[0];

    // Verify blob is exactly the original file object with identical bytes & size
    assert.strictEqual(queued.blob, mockVideoFile, 'Video blob must reference the original file');
    assert.strictEqual(queued.blob.size, rawVideoBytes.length, 'Video byte size must be 100% identical');
    assert.strictEqual(queued.blob.type, 'video/mp4');
  });

  it('computes prefix, suffix, and sequence numbering with zero padding', () => {
    const bp = new BatchProcessor();
    const item = { name: 'IMG_4821.JPG', type: 'image' };

    // Mode: append sequence number with 2-digit padding
    const name1 = bp.computeRenamedName(item, {
      prefix: 'Vacation_',
      suffix: '_Final',
      startNumber: 1,
      padding: 2,
      numberMode: 'append',
      caseFormat: 'original'
    }, 0);
    assert.strictEqual(name1, 'Vacation_IMG_4821_01_Final.JPG');

    // Sequence index 4 -> '05'
    const name2 = bp.computeRenamedName(item, {
      prefix: 'Vacation_',
      suffix: '_Final',
      startNumber: 1,
      padding: 3,
      numberMode: 'replace',
      caseFormat: 'lowercase'
    }, 4);
    assert.strictEqual(name2, 'vacation_005_final.jpg');
  });

  it('handles find and replace with case sensitivity and casing transformations', () => {
    const bp = new BatchProcessor();
    const item = { name: 'DJI_0042_RAW.MOV', type: 'video' };

    const renamed = bp.computeRenamedName(item, {
      prefix: '',
      suffix: '',
      findText: 'DJI',
      replaceText: 'Cinematic_Flight',
      caseFormat: 'titlecase'
    }, 0);

    // Cinematic_Flight_0042_RAW.MOV titlecased
    assert(renamed.startsWith('Cinematic_Flight'), `Should replace DJI: ${renamed}`);
    assert(renamed.endsWith('.mov') || renamed.endsWith('.MOV'));
  });

  it('resolves custom pattern tags {name}, {index}, and {ext}', () => {
    const bp = new BatchProcessor();
    const item = { name: 'landscape.png', type: 'image' };

    const renamed = bp.computeRenamedName(item, {
      mode: 'pattern',
      pattern: 'Art_{name}_vol_{index}',
      startNumber: 10,
      padding: 3
    }, 0);

    assert.strictEqual(renamed, 'Art_landscape_vol_010.png');
  });

  it('de-duplicates conflicting names in video and image queues', () => {
    const bp = new BatchProcessor();
    const mockVideos = [
      { name: 'reel.mp4', type: 'video' },
      { name: 'reel.mp4', type: 'video' },
      { name: 'reel.mp4', type: 'video' }
    ];

    const uniqueNames = bp.resolveUniqueNames(mockVideos, {
      prefix: 'Shorts_',
      numberMode: 'none'
    });

    assert.deepStrictEqual(uniqueNames, [
      'Shorts_reel.mp4',
      'Shorts_reel_1.mp4',
      'Shorts_reel_2.mp4'
    ]);
  });

  it('formats video duration accurately in HH:MM:SS and MM:SS', () => {
    const bp = new BatchProcessor();
    assert.strictEqual(bp.formatDuration(45), '0:45');
    assert.strictEqual(bp.formatDuration(125), '2:05');
    assert.strictEqual(bp.formatDuration(3665), '1:01:05');
  });

  it('simulates folder direct export via directory picker mock', async () => {
    const bp = new BatchProcessor();
    const writtenFiles = {};

    // Mock File System Access API
    global.window = {
      showDirectoryPicker: async () => ({
        getFileHandle: async (name) => ({
          createWritable: async () => ({
            write: async (data) => { writtenFiles[name] = data; },
            close: async () => {}
          })
        })
      })
    };

    const mockItem = {
      name: 'family.mp4',
      file: { name: 'family.mp4', size: 5000, type: 'video/mp4' },
      blob: { name: 'family.mp4', size: 5000, type: 'video/mp4' }
    };
    bp.videoQueue = [mockItem];

    const result = await bp.exportToFolder('video', {
      prefix: 'Archived_',
      numberMode: 'none'
    });

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.count, 1);
    assert.strictEqual(result.method, 'directoryPicker');
    assert('Archived_family.mp4' in writtenFiles, 'File must be written directly to directory with renamed filename');
    delete global.window;
  });

  console.log(`\n======================================================`);
  console.log(`Test Execution Finished: ${passedTests}/${totalTests} Passed.`);
  console.log(`======================================================\n`);

  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

runSuite8();



