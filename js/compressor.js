/**
 * Luminary Image Studio - Smart Compressor & Target Size Optimizer
 * Binary search quality/dimension optimization for exact target KB/MB and Megapixel reductions.
 */

class SmartCompressor {
  /**
   * Optimize image to reach a target file size in Kilobytes (KB)
   * Uses binary search on quality and adaptive downscaling if needed.
   * 
   * @param {HTMLCanvasElement} sourceCanvas 
   * @param {number} targetKB Target size in KB (e.g. 200)
   * @param {string} format 'image/jpeg' | 'image/webp'
   * @param {function} onProgress callback(percent, currentSizeKB)
   * @returns {Promise<{blob: Blob, quality: number, width: number, height: number, sizeKB: number, originalSizeKB: number}>}
   */
  static async compressToTargetKB(sourceCanvas, targetKB, format = 'image/jpeg', onProgress = null) {
    targetKB = Math.max(5, targetKB);
    const targetBytes = targetKB * 1024;

    let workCanvas = document.createElement('canvas');
    workCanvas.width = sourceCanvas.width;
    workCanvas.height = sourceCanvas.height;
    let workCtx = workCanvas.getContext('2d');
    workCtx.drawImage(sourceCanvas, 0, 0);

    let lowQ = 0.05;
    let highQ = 0.98;
    let bestUnderBlob = null;
    let bestUnderQuality = 0.8;
    let smallestOverBlob = null;
    let smallestOverQuality = lowQ;
    let iterations = 0;
    const maxIterations = 8;

    // 1. Binary search on quality at full resolution
    while (iterations < maxIterations) {
      iterations++;
      let midQ = (lowQ + highQ) / 2;
      let blob = await this.getCanvasBlob(workCanvas, format, midQ);
      if (!blob) break;

      if (onProgress) {
        onProgress(Math.round((iterations / maxIterations) * 60), Math.round(blob.size / 1024));
      }

      if (blob.size <= targetBytes) {
        if (!bestUnderBlob || blob.size > bestUnderBlob.size) {
          bestUnderBlob = blob;
          bestUnderQuality = midQ;
        }
        lowQ = midQ; // Try higher quality
      } else {
        if (!smallestOverBlob || blob.size < smallestOverBlob.size) {
          smallestOverBlob = blob;
          smallestOverQuality = midQ;
        }
        highQ = midQ; // Reduce quality
      }

      if (Math.abs(highQ - lowQ) < 0.02) break;
    }

    let finalBlob = bestUnderBlob;
    let finalQuality = bestUnderQuality;

    // 2. If image is still larger than target even at low quality, adaptively downscale resolution
    if (!finalBlob) {
      let scale = 0.85;
      while (scale >= 0.1) {
        const newW = Math.max(16, Math.round(sourceCanvas.width * scale));
        const newH = Math.max(16, Math.round(sourceCanvas.height * scale));

        workCanvas.width = newW;
        workCanvas.height = newH;
        workCtx.imageSmoothingEnabled = true;
        workCtx.imageSmoothingQuality = 'high';
        workCtx.clearRect(0, 0, newW, newH);
        workCtx.drawImage(sourceCanvas, 0, 0, newW, newH);

        // Binary search quality for this scale
        let sLow = 0.2;
        let sHigh = 0.92;
        let sBest = null;
        let sBestQ = 0.7;

        for (let sIter = 0; sIter < 4; sIter++) {
          let sMid = (sLow + sHigh) / 2;
          let sBlob = await this.getCanvasBlob(workCanvas, format, sMid);
          if (!sBlob) break;

          if (sBlob.size <= targetBytes) {
            if (!sBest || sBlob.size > sBest.size) {
              sBest = sBlob;
              sBestQ = sMid;
            }
            sLow = sMid;
          } else {
            sHigh = sMid;
          }
        }

        if (sBest) {
          finalBlob = sBest;
          finalQuality = sBestQ;
          break;
        }

        scale -= 0.15;
      }
    }

    // Ultimate fallback if extreme restriction
    if (!finalBlob) {
      finalBlob = smallestOverBlob || (await this.getCanvasBlob(workCanvas, format, 0.05));
      finalQuality = smallestOverQuality;
    }

    if (onProgress) onProgress(100, Math.round((finalBlob ? finalBlob.size : 0) / 1024));

    const finalSizeKB = finalBlob ? Math.round((finalBlob.size / 1024) * 10) / 10 : targetKB;

    return {
      blob: finalBlob,
      quality: Math.round(finalQuality * 100) / 100,
      width: workCanvas.width,
      height: workCanvas.height,
      sizeKB: finalSizeKB
    };
  }

  /**
   * Helper to convert canvas to blob with promise and fallback
   */
  static getCanvasBlob(canvas, format, quality) {
    return new Promise((resolve) => {
      canvas.toBlob((blob) => {
        if (!blob) {
          // Fallback to jpeg if browser failed
          canvas.toBlob(resolve, 'image/jpeg', quality);
        } else {
          resolve(blob);
        }
      }, format, quality);
    });
  }

  /**
   * Calculate Megapixels from dimensions
   */
  static calculateMegapixels(width, height) {
    return Math.round(((width * height) / 1000000) * 100) / 100;
  }

  /**
   * Calculate target dimensions from target Megapixels
   */
  static dimensionsFromTargetMP(currentW, currentH, targetMP) {
    const totalPixels = targetMP * 1000000;
    const aspect = currentW / currentH;
    const height = Math.max(1, Math.round(Math.sqrt(totalPixels / aspect)));
    const width = Math.max(1, Math.round(height * aspect));
    return { width, height, megapixels: (width * height) / 1000000 };
  }

  /**
   * Format human readable bytes
   */
  static formatBytes(bytes, decimals = 1) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = SmartCompressor;
}
