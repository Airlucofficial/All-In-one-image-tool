/**
 * Luminary Image Studio - Batch Processor & Media Renaming Engine
 * Handles bulk image and video conversions, renaming, and client-side Folder/ZIP packaging.
 * Preserves 100% original lossless quality for videos (zero re-encoding).
 */

class BatchProcessor {
  constructor() {
    this.queue = [];          // Image queue (kept for full backwards compatibility)
    this.imageQueue = this.queue;
    this.videoQueue = [];     // Dedicated Video queue
    this.processedFiles = []; // Processed images
    this.processedVideos = [];
    this.isProcessing = false;

    // Renaming configuration defaults
    this.imageRenameOptions = {
      mode: 'prefix-suffix', // 'prefix-suffix' | 'pattern' | 'find-replace'
      prefix: '',
      suffix: '',
      pattern: '{name}_{index}',
      startNumber: 1,
      padding: 2,           // e.g. 01, 02
      numberMode: 'append',  // 'append' | 'replace' | 'none'
      findText: '',
      replaceText: '',
      matchCase: false,
      caseFormat: 'original' // 'original' | 'lowercase' | 'uppercase' | 'titlecase'
    };

    this.videoRenameOptions = {
      mode: 'prefix-suffix',
      prefix: 'Video_',
      suffix: '',
      pattern: '{name}_{index}',
      startNumber: 1,
      padding: 2,
      numberMode: 'append',
      findText: '',
      replaceText: '',
      matchCase: false,
      caseFormat: 'original'
    };
  }

  // ==========================================
  // 1. QUEUE MANAGEMENT: IMAGES
  // ==========================================

  /**
   * Add files to batch image queue
   * @param {FileList|Array<File>} files 
   */
  addFiles(files) {
    for (const file of files) {
      if (!this.isImageFile(file)) continue;
      const id = 'batch_img_' + Math.random().toString(36).substr(2, 9);
      const item = {
        id,
        file,
        name: file.name,
        size: file.size,
        type: 'image',
        status: 'pending', // 'pending' | 'processing' | 'done' | 'error'
        blob: null,
        outSize: 0,
        thumbUrl: (typeof URL !== 'undefined' && URL.createObjectURL) ? URL.createObjectURL(file) : null,
        customName: '',
        renamedName: file.name
      };
      this.queue.push(item);
    }
    this.updateRenamedNames('image');
  }

  clearQueue() {
    this.queue.forEach(item => {
      if (item.thumbUrl && typeof URL !== 'undefined' && URL.revokeObjectURL) {
        URL.revokeObjectURL(item.thumbUrl);
      }
    });
    this.queue.length = 0;
    this.processedFiles = [];
  }

  removeItem(id) {
    const idx = this.queue.findIndex(i => i.id === id);
    if (idx !== -1) {
      if (this.queue[idx].thumbUrl && typeof URL !== 'undefined' && URL.revokeObjectURL) {
        URL.revokeObjectURL(this.queue[idx].thumbUrl);
      }
      this.queue.splice(idx, 1);
      this.updateRenamedNames('image');
    }
  }

  // ==========================================
  // 2. QUEUE MANAGEMENT: VIDEOS
  // ==========================================

  /**
   * Add video files to video queue
   * @param {FileList|Array<File>} files 
   * @param {function} onItemReady optional callback when video thumbnail & metadata loaded
   */
  async addVideoFiles(files, onItemReady) {
    const newItems = [];
    for (const file of files) {
      if (!this.isVideoFile(file)) continue;
      const id = 'batch_vid_' + Math.random().toString(36).substr(2, 9);
      const item = {
        id,
        file,
        name: file.name,
        size: file.size,
        type: 'video',
        status: 'ready', // 'ready' | 'processing' | 'done' | 'error'
        blob: file,      // 100% original lossless stream preserved bit-for-bit
        outSize: file.size,
        thumbUrl: null,
        duration: 0,
        width: 0,
        height: 0,
        customName: '',
        renamedName: file.name
      };
      this.videoQueue.push(item);
      newItems.push(item);
    }

    this.updateRenamedNames('video');

    // Asynchronously extract metadata & thumbnails for videos
    for (const item of newItems) {
      try {
        const meta = await this.extractVideoMetadata(item.file);
        item.thumbUrl = meta.thumbUrl;
        item.duration = meta.duration;
        item.width = meta.width;
        item.height = meta.height;
      } catch (err) {
        console.warn('Video metadata extraction fallback for', item.name, err);
      }
      if (onItemReady) onItemReady(item);
    }
  }

  clearVideoQueue() {
    this.videoQueue.forEach(item => {
      if (item.thumbUrl && item.thumbUrl.startsWith('blob:') && typeof URL !== 'undefined' && URL.revokeObjectURL) {
        URL.revokeObjectURL(item.thumbUrl);
      }
    });
    this.videoQueue.length = 0;
    this.processedVideos = [];
  }

  removeVideoItem(id) {
    const idx = this.videoQueue.findIndex(i => i.id === id);
    if (idx !== -1) {
      if (this.videoQueue[idx].thumbUrl && this.videoQueue[idx].thumbUrl.startsWith('blob:') && typeof URL !== 'undefined' && URL.revokeObjectURL) {
        URL.revokeObjectURL(this.videoQueue[idx].thumbUrl);
      }
      this.videoQueue.splice(idx, 1);
      this.updateRenamedNames('video');
    }
  }

  // ==========================================
  // 3. VIDEO METADATA & THUMBNAIL EXTRACTION
  // ==========================================

  /**
   * Extract video frame thumbnail and dimensions in browser
   * @param {File} file 
   */
  async extractVideoMetadata(file) {
    if (typeof document === 'undefined' || typeof URL === 'undefined') {
      return { thumbUrl: null, duration: 0, width: 0, height: 0 };
    }

    return new Promise((resolve) => {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.muted = true;
      video.playsInline = true;

      let blobUrl = '';
      try {
        blobUrl = URL.createObjectURL(file);
      } catch (e) {
        return resolve({ thumbUrl: null, duration: 0, width: 0, height: 0 });
      }

      video.src = blobUrl;

      const cleanup = () => {
        if (blobUrl) {
          try { URL.revokeObjectURL(blobUrl); } catch (e) {}
        }
      };

      const timeout = setTimeout(() => {
        cleanup();
        resolve({ thumbUrl: null, duration: video.duration || 0, width: video.videoWidth || 0, height: video.videoHeight || 0 });
      }, 3500);

      video.onloadedmetadata = () => {
        // Seek to 1s or midpoint
        const seekTime = Math.min(1.0, (video.duration || 1) / 2);
        video.currentTime = isNaN(seekTime) ? 0.1 : seekTime;
      };

      video.onseeked = () => {
        clearTimeout(timeout);
        try {
          const w = video.videoWidth || 320;
          const h = video.videoHeight || 180;
          const canvas = document.createElement('canvas');
          const maxThumbW = 320;
          const scale = Math.min(1, maxThumbW / w);
          canvas.width = Math.max(1, Math.round(w * scale));
          canvas.height = Math.max(1, Math.round(h * scale));

          const ctx = canvas.getContext('2d');
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const thumbUrl = canvas.toDataURL('image/jpeg', 0.8);
          cleanup();
          resolve({
            thumbUrl,
            duration: video.duration || 0,
            width: video.videoWidth || 0,
            height: video.videoHeight || 0
          });
        } catch (e) {
          cleanup();
          resolve({
            thumbUrl: null,
            duration: video.duration || 0,
            width: video.videoWidth || 0,
            height: video.videoHeight || 0
          });
        }
      };

      video.onerror = () => {
        clearTimeout(timeout);
        cleanup();
        resolve({ thumbUrl: null, duration: 0, width: 0, height: 0 });
      };
    });
  }

  // ==========================================
  // 4. POWERFUL RENAMING ENGINE
  // ==========================================

  /**
   * Set rename options for given media type ('image' or 'video')
   */
  setRenameOptions(type, options) {
    if (type === 'video') {
      Object.assign(this.videoRenameOptions, options);
    } else {
      Object.assign(this.imageRenameOptions, options);
    }
    this.updateRenamedNames(type);
  }

  /**
   * Get rename options for given media type
   */
  getRenameOptions(type) {
    return type === 'video' ? this.videoRenameOptions : this.imageRenameOptions;
  }

  /**
   * Recalculate renamed names for all items in the specified queue
   */
  updateRenamedNames(type = 'image') {
    const queue = type === 'video' ? this.videoQueue : this.queue;
    const options = type === 'video' ? this.videoRenameOptions : this.imageRenameOptions;
    const uniqueNames = this.resolveUniqueNames(queue, options);

    for (let i = 0; i < queue.length; i++) {
      queue[i].renamedName = uniqueNames[i];
    }
    return uniqueNames;
  }

  /**
   * Compute renamed filename for a single item
   */
  computeRenamedName(item, options = {}, index = 0) {
    const lastDot = item.name.lastIndexOf('.');
    let baseName = lastDot !== -1 ? item.name.substring(0, lastDot) : item.name;
    let ext = lastDot !== -1 ? item.name.substring(lastDot + 1) : '';

    // 1. Manual item override if user specified custom name
    if (item.customName && item.customName.trim()) {
      baseName = item.customName.trim();
    }

    // 2. Find & Replace
    if (options.findText && options.findText.length > 0) {
      const flags = options.matchCase ? 'g' : 'gi';
      const escaped = options.findText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      baseName = baseName.replace(new RegExp(escaped, flags), options.replaceText || '');
    }

    // 3. Format sequence index
    const startNum = typeof options.startNumber === 'number' ? options.startNumber : 1;
    const currentNum = startNum + index;
    const padding = options.padding || 1;
    const formattedIndex = String(currentNum).padStart(padding, '0');

    // 4. Mode calculation
    if (options.mode === 'pattern' && options.pattern) {
      const today = new Date().toISOString().slice(0, 10);
      let templated = options.pattern
        .replace(/\{name\}/g, baseName)
        .replace(/\{index\}/g, formattedIndex)
        .replace(/\{date\}/g, today)
        .replace(/\{prefix\}/g, options.prefix || '')
        .replace(/\{suffix\}/g, options.suffix || '')
        .replace(/\{ext\}/g, ext);
      baseName = templated;
    } else {
      // Prefix & Suffix mode
      const prefix = options.prefix || '';
      const suffix = options.suffix || '';
      const numMode = options.numberMode || 'append';

      if (numMode === 'append') {
        baseName = `${prefix}${baseName}_${formattedIndex}${suffix}`;
      } else if (numMode === 'replace') {
        baseName = `${prefix}${formattedIndex}${suffix}`;
      } else {
        baseName = `${prefix}${baseName}${suffix}`;
      }
    }

    // 5. Letter Casing
    const casing = options.caseFormat || 'original';
    if (casing === 'lowercase') {
      baseName = baseName.toLowerCase();
      ext = ext.toLowerCase();
    } else if (casing === 'uppercase') {
      baseName = baseName.toUpperCase();
      ext = ext.toUpperCase();
    } else if (casing === 'titlecase') {
      baseName = baseName.replace(/\b\w/g, c => c.toUpperCase());
    }

    // Sanitize any dangerous path characters
    baseName = baseName.replace(/[\\/:*?"<>|]/g, '_').trim();
    if (!baseName) baseName = `media_${formattedIndex}`;

    return ext ? `${baseName}.${ext}` : baseName;
  }

  /**
   * Resolve unique filenames for an array of items, preventing collisions
   */
  resolveUniqueNames(items, options = {}) {
    const usedNames = new Set();
    const result = [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      let candidate = this.computeRenamedName(item, options, i);

      const lastDot = candidate.lastIndexOf('.');
      const base = lastDot !== -1 ? candidate.substring(0, lastDot) : candidate;
      const ext = lastDot !== -1 ? candidate.substring(lastDot + 1) : '';

      let finalName = candidate;
      let counter = 1;
      while (usedNames.has(finalName.toLowerCase())) {
        finalName = ext ? `${base}_${counter}.${ext}` : `${base}_${counter}`;
        counter++;
      }

      usedNames.add(finalName.toLowerCase());
      result.push(finalName);
    }

    return result;
  }

  // ==========================================
  // 5. FOLDER EXPORT: FILE SYSTEM ACCESS API
  // ==========================================

  /**
   * Export files directly to a directory on user's disk without creating a ZIP file.
   * Uses modern window.showDirectoryPicker().
   * @param {'image'|'video'} type 
   * @param {object} options 
   * @param {function} onProgress callback(savedCount, totalCount, currentFilename)
   */
  async exportToFolder(type = 'image', options = {}, onProgress = null) {
    const queue = type === 'video' ? this.videoQueue : this.queue;
    if (queue.length === 0) {
      throw new Error(`No ${type} files in queue to export.`);
    }

    const uniqueNames = this.resolveUniqueNames(queue, options);

    // 1. Check for modern File System Access API
    if (typeof window !== 'undefined' && 'showDirectoryPicker' in window) {
      try {
        const rootDirHandle = await window.showDirectoryPicker({
          mode: 'readwrite',
          startIn: 'downloads'
        });

        // Optionally create a subfolder if requested
        let targetDir = rootDirHandle;
        if (options.subfolderName && options.subfolderName.trim()) {
          const folderName = options.subfolderName.trim().replace(/[\\/:*?"<>|]/g, '_');
          targetDir = await rootDirHandle.getDirectoryHandle(folderName, { create: true });
        }

        let savedCount = 0;
        for (let i = 0; i < queue.length; i++) {
          const item = queue[i];
          const fileName = uniqueNames[i];

          // Use processed blob or raw original file
          // Videos are ALWAYS raw original item.file (100% lossless, 0% re-encoding)
          const dataBlob = item.blob || item.file;

          const fileHandle = await targetDir.getFileHandle(fileName, { create: true });
          const writable = await fileHandle.createWritable();
          await writable.write(dataBlob);
          await writable.close();

          savedCount++;
          if (onProgress) onProgress(savedCount, queue.length, fileName);
        }

        return {
          success: true,
          count: savedCount,
          method: 'directoryPicker'
        };
      } catch (err) {
        if (err.name === 'AbortError') {
          return { success: false, cancelled: true };
        }
        console.error('File System Access API error, attempting browser download fallback:', err);
        // Fall back to direct multi-file download if permissions failed
        return await this.fallbackDirectDownload(queue, uniqueNames, onProgress);
      }
    } else {
      // 2. Browser Fallback for browsers without showDirectoryPicker (e.g. Firefox)
      return await this.fallbackDirectDownload(queue, uniqueNames, onProgress);
    }
  }

  /**
   * Fallback for browsers lacking File System Access API: trigger direct downloads
   */
  async fallbackDirectDownload(queue, uniqueNames, onProgress) {
    if (typeof document === 'undefined') return { success: false };

    let count = 0;
    for (let i = 0; i < queue.length; i++) {
      const item = queue[i];
      const fileName = uniqueNames[i];
      const blob = item.blob || item.file;

      await new Promise(res => {
        setTimeout(() => {
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = fileName;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          count++;
          if (onProgress) onProgress(count, queue.length, fileName);
          res();
        }, i * 250);
      });
    }

    return {
      success: true,
      count,
      method: 'multiDownloadFallback'
    };
  }

  // ==========================================
  // 6. ZIP ARCHIVE EXPORT
  // ==========================================

  /**
   * Package files into a ZIP archive
   * Supports both legacy signature: downloadZip(zipFilename)
   * and new signature: downloadZip(type, zipFilename, options, onProgress)
   */
  async downloadZip(typeOrFilename = 'luminary-batch-images.zip', maybeZipFilename, maybeOptions, onProgress) {
    let type = 'image';
    let zipFilename = 'luminary-batch-images.zip';
    let options = {};

    if (typeOrFilename === 'video' || typeOrFilename === 'image') {
      type = typeOrFilename;
      zipFilename = maybeZipFilename || (type === 'video' ? 'luminary-renamed-videos.zip' : 'luminary-batch-images.zip');
      options = maybeOptions || {};
    } else if (typeof typeOrFilename === 'string') {
      zipFilename = typeOrFilename;
      type = 'image';
      options = maybeOptions || {};
    }

    const queue = type === 'video' ? this.videoQueue : (this.processedFiles.length > 0 ? this.processedFiles : this.queue);
    if (queue.length === 0) return;

    const uniqueNames = this.resolveUniqueNames(queue, options);

    if (typeof JSZip !== 'undefined') {
      const zip = new JSZip();

      for (let i = 0; i < queue.length; i++) {
        const item = queue[i];
        const finalName = uniqueNames[i];
        const data = item.blob || item.file;
        if (!data) continue;

        zip.file(finalName, data);
        if (onProgress) onProgress(i + 1, queue.length);
      }

      // For videos: use STORE (no compression) because video containers are already compressed,
      // which produces the ZIP archive instantly with zero CPU load and zero quality loss!
      const compression = type === 'video' ? 'STORE' : 'DEFLATE';
      const content = await zip.generateAsync({ type: 'blob', compression });

      if (typeof URL !== 'undefined' && typeof document !== 'undefined') {
        const downloadUrl = URL.createObjectURL(content);
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = zipFilename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(downloadUrl);
      }
      return { success: true, count: queue.length };
    } else {
      // Fallback: download files individually with collision avoidance
      return await this.fallbackDirectDownload(queue, uniqueNames, onProgress);
    }
  }

  // ==========================================
  // 7. BATCH IMAGE PROCESSING (CANVAS)
  // ==========================================

  /**
   * Execute batch processing for images
   * @param {object} options { format, quality, maxDimension, scale }
   * @param {function} onItemUpdate callback(item)
   * @param {function} onComplete callback(processedItems)
   */
  async processAll(options = {}, onItemUpdate, onComplete) {
    if (this.isProcessing) return;
    this.isProcessing = true;
    this.processedFiles = [];

    const {
      format = 'image/jpeg',
      quality = 0.85,
      scale = 1.0,
      maxDimension = 0,
      keepOriginal = false
    } = options;

    for (const item of this.queue) {
      item.status = 'processing';
      if (onItemUpdate) onItemUpdate(item);

      try {
        if (keepOriginal) {
          // 100% lossless bit-for-bit preservation
          item.blob = item.file;
          item.outSize = item.file.size;
        } else {
          const processedBlob = await this.processSingleFile(item.file, {
            format,
            quality,
            scale,
            maxDimension
          });
          item.blob = processedBlob;
          item.outSize = processedBlob.size;
        }
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
      if (typeof Image === 'undefined' || typeof document === 'undefined') {
        return resolve(file);
      }

      const url = URL.createObjectURL(file);
      const img = new Image();
      img.crossOrigin = 'anonymous';

      img.onload = () => {
        let w = img.naturalWidth || img.width;
        let h = img.naturalHeight || img.height;

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

  // ==========================================
  // 8. HELPERS & FORMATTING
  // ==========================================

  isImageFile(file) {
    if (!file) return false;
    if (file.type && file.type.startsWith('image/')) return true;
    const name = (file.name || '').toLowerCase();
    return /\.(png|jpe?g|webp|avif|gif|bmp|ico|svg|tiff?)$/i.test(name);
  }

  isVideoFile(file) {
    if (!file) return false;
    if (file.type && file.type.startsWith('video/')) return true;
    const name = (file.name || '').toLowerCase();
    return /\.(mp4|webm|mov|mkv|avi|m4v|flv|wmv|3gp|ts|ogv)$/i.test(name);
  }

  getExtensionForMime(mime) {
    switch (mime) {
      case 'image/jpeg': return 'jpg';
      case 'image/webp': return 'webp';
      case 'image/avif': return 'avif';
      case 'image/bmp': return 'bmp';
      case 'image/x-icon': return 'ico';
      case 'video/mp4': return 'mp4';
      case 'video/webm': return 'webm';
      case 'video/quicktime': return 'mov';
      case 'video/x-matroska': return 'mkv';
      case 'image/png':
      default:
        return 'png';
    }
  }

  formatDuration(seconds) {
    if (!seconds || isNaN(seconds) || seconds <= 0) return '0:00';
    const totalSec = Math.round(seconds);
    const hrs = Math.floor(totalSec / 3600);
    const mins = Math.floor((totalSec % 3600) / 60);
    const secs = totalSec % 60;
    const padSecs = String(secs).padStart(2, '0');

    if (hrs > 0) {
      const padMins = String(mins).padStart(2, '0');
      return `${hrs}:${padMins}:${padSecs}`;
    }
    return `${mins}:${padSecs}`;
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = BatchProcessor;
}
