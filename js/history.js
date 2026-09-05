/**
 * Luminary Image Studio - History & Session Persistence Manager
 * Tracks actions, manages undo/redo stack, persists session log to localStorage,
 * and handles periodic 5-minute auto-saves.
 */

class HistoryManager {
  constructor(options = {}) {
    this.storageKey = 'luminary_studio_history_v1';
    this.actions = [];
    this.undoStack = [];
    this.redoStack = [];
    this.maxHistory = 50;
    this.autoSaveInterval = 5 * 60 * 1000; // 5 minutes
    this.lastSaved = Date.now();
    this.onHistoryChange = options.onHistoryChange || null;
    this.onStatusChange = options.onStatusChange || null;
    this.isSyncing = false;

    this.loadPersistedHistory();
    this.startAutoSaveTimer();
    this.syncToHistoryFile();
  }

  /**
   * Log an action in the project history
   * @param {string} toolName 
   * @param {string} description 
   * @param {object} details 
   */
  logAction(toolName, description, details = {}) {
    const entry = {
      id: 'act_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      timestamp: new Date().toISOString(),
      displayTime: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      toolName,
      description,
      details
    };

    this.actions.unshift(entry);
    if (this.actions.length > this.maxHistory) {
      this.actions.pop();
    }

    this.persistHistory();
    this.syncToHistoryFile(entry);

    if (this.onHistoryChange) {
      this.onHistoryChange(this.actions);
    }
  }

  /**
   * Save canvas snapshot for Undo
   */
  pushUndoState(canvas, label = 'Operation') {
    const copy = document.createElement('canvas');
    copy.width = canvas.width;
    copy.height = canvas.height;
    const ctx = copy.getContext('2d');
    ctx.drawImage(canvas, 0, 0);

    this.undoStack.push({
      canvas: copy,
      label,
      timestamp: Date.now()
    });

    if (this.undoStack.length > 20) {
      this.undoStack.shift();
    }

    // Clear redo on new action
    this.redoStack = [];
  }

  /**
   * Pop state for Undo
   */
  undo(currentCanvas) {
    if (this.undoStack.length === 0) return null;

    // Push current to redo
    const currentCopy = document.createElement('canvas');
    currentCopy.width = currentCanvas.width;
    currentCopy.height = currentCanvas.height;
    const ctx = currentCopy.getContext('2d');
    ctx.drawImage(currentCanvas, 0, 0);

    this.redoStack.push({
      canvas: currentCopy,
      label: 'Before Undo',
      timestamp: Date.now()
    });

    const prevState = this.undoStack.pop();
    this.logAction('Undo', `Reverted: ${prevState.label}`);
    return prevState.canvas;
  }

  /**
   * Pop state for Redo
   */
  redo(currentCanvas) {
    if (this.redoStack.length === 0) return null;

    // Push current to undo
    const currentCopy = document.createElement('canvas');
    currentCopy.width = currentCanvas.width;
    currentCopy.height = currentCanvas.height;
    const ctx = currentCopy.getContext('2d');
    ctx.drawImage(currentCanvas, 0, 0);

    this.undoStack.push({
      canvas: currentCopy,
      label: 'Before Redo',
      timestamp: Date.now()
    });

    const nextState = this.redoStack.pop();
    this.logAction('Redo', `Restored: ${nextState.label}`);
    return nextState.canvas;
  }

  canUndo() {
    return this.undoStack.length > 0;
  }

  canRedo() {
    return this.redoStack.length > 0;
  }

  /**
   * Persist action history to localStorage
   */
  persistHistory() {
    try {
      const data = {
        lastSaved: new Date().toISOString(),
        actions: this.actions.slice(0, 40)
      };
      localStorage.setItem(this.storageKey, JSON.stringify(data));
      this.lastSaved = Date.now();
    } catch (e) {
      console.warn('LocalStorage quota or permission error saving history:', e);
    }
  }

  loadPersistedHistory() {
    try {
      const saved = localStorage.getItem(this.storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && Array.isArray(parsed.actions)) {
          this.actions = parsed.actions;
        }
      }
    } catch (e) {
      console.warn('Could not parse persisted history:', e);
    }
  }

  /**
   * Sync session actions to server PROJECT_HISTORY.md endpoint
   */
  async syncToHistoryFile(entry = null) {
    if (typeof fetch === 'undefined') return;
    try {
      this.isSyncing = true;
      if (this.onStatusChange) this.onStatusChange('Syncing...');

      const payload = {
        timestamp: new Date().toISOString(),
        entry: entry,
        actions: this.actions.slice(0, 15)
      };

      const res = await fetch('/api/save-history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        if (this.onStatusChange) this.onStatusChange('Auto-Save: Synced to PROJECT_HISTORY.md');
      } else {
        if (this.onStatusChange) this.onStatusChange('Auto-Save: Active (Local)');
      }
    } catch (e) {
      if (this.onStatusChange) this.onStatusChange('Auto-Save: Active (Local)');
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * 5-minute Auto-save timer
   */
  startAutoSaveTimer() {
    this.timerId = setInterval(() => {
      this.persistHistory();
      this.syncToHistoryFile();
      this.logAction('Auto-Save', '5-Minute automatic session state backup checkpoint saved.');
    }, this.autoSaveInterval);

    // In Node test environment, unref timer so process can exit
    if (this.timerId && typeof this.timerId.unref === 'function') {
      this.timerId.unref();
    }
  }

  stopAutoSaveTimer() {
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
  }

  /**
   * Export history as Markdown document
   */
  exportHistoryMarkdown() {
    let md = `# Luminary Studio — Session History Export\n`;
    md += `**Exported At**: ${new Date().toLocaleString()}\n\n`;
    md += `## Action Log & Operations Timeline\n\n`;
    md += `| Time | Tool | Description |\n`;
    md += `| :--- | :--- | :--- |\n`;

    for (const act of this.actions) {
      md += `| ${act.displayTime || act.timestamp} | **${act.toolName}** | ${act.description} |\n`;
    }

    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `luminary-session-history-${Date.now()}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = HistoryManager;
}
