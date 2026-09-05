/**
 * Luminary Image Studio - Batch Processor Engine
 * Handles bulk image conversions, resizing, compression, and client-side ZIP packaging.
 */

class BatchProcessor {
  constructor() {
    this.queue = [];
    this.processedFiles = [];
    this.isProcessing = false;
  }

  /**
   * Add files to batch queue
   * @param {FileList|Array<File>} files 
   */
  addFiles(files) {
    for (const file of files) {
      if (!file.type.startsWith('image/')) continue;
      const id = 'batch_' + Math.random().toString(36).substr(2, 9);
      this.queue.push({
        id,
        file,
        name: file.name,
        size: file.size,
        status: 'pending', // 'pending' | 'processing' | 'done' | 'error'
        blob: null,
        outSize: 0,
        thumbUrl: URL.createObjectURL(file)
      });
    }
  }

  clearQueue() {
    this.queue.forEach(item => {
      if (item.thumbUrl) URL.revokeObjectURL(item.thumbUrl);
    });
    this.queue = [];
    this.processedFiles = [];
  }

  removeItem(id) {
    const idx = this.queue.findIndex(i => i.id === id);
    if (idx !== -1) {
      if (this.queue[idx].thumbUrl) URL.revokeObjectURL(this.queue[idx].thumbUrl);
      this.queue.splice(idx, 1);
    }
  }

  /**
   * Execute batch processing
   * @param {object} options { format, quality, maxDimension, scalePercent }
   * @param {function} onItemUpdate callback(item)
   * @param {function} onComplete callback(processedItems)
   */
  async processAll(options, onItemUpdate, onComplete) {
    if (this.isProcessing) return;
    this.isProcessing = true;
    this.processedFiles = [];

    const {
      format = 'image/jpeg',
      quality = 0.85,
      scale = 1.0,
      maxDimension = 0
    } = options;

    for (const item of this.queue) {
      item.status = 'processing';
      if (onItemUpdate) onItemUpdate(item);

      try {
        const processedBlob = await this.processSingleFile(item.file, {
          format,
          quality,
          scale,
          maxDimension
        });

        item.blob = processedBlob;
        item.outSize = processedBlob.size;
        item.status = 'done';
        this.processedFiles.push(item);
      } catch (err) {
        console.error('Batch process error on file', item.name, err);
        item.status = 'error';
      }

      if (onItemUpdate) onItemUpdate(item);
    }

    this.isProcessing = false;
    if (onComplete) onComplete(this.processedFiles);
  }

  /**
   * Process a single image file via offscreen canvas
   */
  async processSingleFile(file, options) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.crossOrigin = 'anonymous';

      img.onload = () => {
        let w = img.naturalWidth || img.width;
        let h = img.naturalHeight || img.height;

        // Scale calculation
        if (options.scale && options.scale !== 1.0) {
          w = Math.round(w * options.scale);
          h = Math.round(h * options.scale);
        } else if (options.maxDimension > 0) {
          if (w > options.maxDimension || h > options.maxDimension) {
            if (w > h) {
              h = Math.round((h * options.maxDimension) / w);
              w = options.maxDimension;
            } else {
              w = Math.round((w * options.maxDimension) / h);
              h = options.maxDimension;
            }
          }
        }

        w = Math.max(1, w);
        h = Math.max(1, h);

        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        // Background for JPEG
        if (options.format === 'image/jpeg') {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, w, h);
        }

        ctx.drawImage(img, 0, 0, w, h);

        canvas.toBlob((blob) => {
          URL.revokeObjectURL(url);
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error('Canvas toBlob failed'));
          }
        }, options.format, options.quality);
      };

      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Image decode error'));
      };

      img.src = url;
    });
  }

  /**
   * Package all completed files into a ZIP archive
   * @param {string} zipFilename 
   */
  async downloadZip(zipFilename = 'luminary-batch-images.zip') {
    if (this.processedFiles.length === 0) return;

    // Check if JSZip is available
    if (typeof JSZip !== 'undefined') {
      const zip = new JSZip();
      const usedNames = new Set();

      for (const item of this.processedFiles) {
        if (!item.blob) continue;
        const ext = this.getExtensionForMime(item.blob.type);
        const baseName = item.name.replace(/\.[^/.]+$/, "");
        let finalName = `${baseName}.${ext}`;
        let counter = 1;
        while (usedNames.has(finalName)) {
          finalName = `${baseName}_${counter}.${ext}`;
          counter++;
        }
        usedNames.add(finalName);
        zip.file(finalName, item.blob);
      }

      const content = await zip.generateAsync({ type: 'blob' });
      const downloadUrl = URL.createObjectURL(content);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = zipFilename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(downloadUrl);
    } else {
      // Fallback: download files individually with collision avoidance
      const usedNames = new Set();
      for (let i = 0; i < this.processedFiles.length; i++) {
        const item = this.processedFiles[i];
        if (!item.blob) continue;
        const ext = this.getExtensionForMime(item.blob.type);
        const baseName = item.name.replace(/\.[^/.]+$/, "");
        let finalName = `${baseName}.${ext}`;
        let counter = 1;
        while (usedNames.has(finalName)) {
          finalName = `${baseName}_${counter}.${ext}`;
          counter++;
        }
        usedNames.add(finalName);

        setTimeout(() => {
          const downloadUrl = URL.createObjectURL(item.blob);
          const a = document.createElement('a');
          a.href = downloadUrl;
          a.download = finalName;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(downloadUrl);
        }, i * 300);
      }
    }
  }

  getExtensionForMime(mime) {
    switch (mime) {
      case 'image/jpeg': return 'jpg';
      case 'image/webp': return 'webp';
      case 'image/avif': return 'avif';
      case 'image/bmp': return 'bmp';
      case 'image/x-icon': return 'ico';
      case 'image/png':
      default:
        return 'png';
    }
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = BatchProcessor;
}
