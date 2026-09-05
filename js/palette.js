/**
 * Luminary Image Studio - Color Palette Extractor & Loupe Eyedropper
 */

class PaletteExtractor {
  /**
   * Extract dominant color palette from canvas
   * @param {HTMLCanvasElement} canvas 
   * @param {number} colorCount number of colors to extract (default 6)
   * @returns {Array<{hex: string, rgb: {r: number, g: number, b: number}}>}
   */
  static extractPalette(canvas, colorCount = 6) {
    const ctx = canvas.getContext('2d');
    const w = Math.min(150, canvas.width);
    const h = Math.min(150, canvas.height);

    const thumb = document.createElement('canvas');
    thumb.width = w;
    thumb.height = h;
    const tCtx = thumb.getContext('2d');
    tCtx.drawImage(canvas, 0, 0, w, h);

    const imgData = tCtx.getImageData(0, 0, w, h);
    const data = imgData.data;

    // Simple fast color quantization via bucket histogram
    const colorBuckets = new Map();
    const quantStep = 24; // group similar colors

    for (let i = 0; i < data.length; i += 16) {
      const a = data[i + 3];
      if (a < 128) continue; // skip transparent

      const r = Math.round(data[i] / quantStep) * quantStep;
      const g = Math.round(data[i + 1] / quantStep) * quantStep;
      const b = Math.round(data[i + 2] / quantStep) * quantStep;

      const key = `${r},${g},${b}`;
      const count = colorBuckets.get(key) || 0;
      colorBuckets.set(key, count + 1);
    }

    // Sort buckets by frequency
    const sorted = Array.from(colorBuckets.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, colorCount);

    return sorted.map(([key]) => {
      const [r, g, b] = key.split(',').map(Number);
      return {
        rgb: { r, g, b },
        hex: this.rgbToHex(r, g, b)
      };
    });
  }

  static rgbToHex(r, g, b) {
    const toHex = (c) => {
      const hex = Math.min(255, Math.max(0, c)).toString(16);
      return hex.length === 1 ? '0' + hex : hex;
    };
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
  }

  /**
   * Get exact pixel color at coordinates (x, y)
   */
  static getPixelColor(canvas, x, y) {
    const ctx = canvas.getContext('2d');
    const pixel = ctx.getImageData(Math.round(x), Math.round(y), 1, 1).data;
    return {
      r: pixel[0],
      g: pixel[1],
      b: pixel[2],
      a: pixel[3],
      hex: this.rgbToHex(pixel[0], pixel[1], pixel[2])
    };
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = PaletteExtractor;
}
