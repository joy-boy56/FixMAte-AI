/**
 * Diagnostics Module
 * Stores and manages diagnostic data for the IDE-first layout.
 * Provides methods to highlight errors in editor and feed results to chat.
 */

const Diagnostics = {
  state: {
    diagnostics: [],
    files: [],
    selectedDiagnostic: null,
  },

  init() {
    this.state.diagnostics = [];
    this.state.files = [];
    this.state.selectedDiagnostic = null;
  },

  setDiagnostics(diagnostics, files) {
    this.state.diagnostics = diagnostics;
    this.state.files = files;
    console.log('[Diagnostics] setDiagnostics called:', diagnostics.length, 'diagnostics');
    console.log('[Diagnostics] First diagnostic file:', diagnostics[0]?.file);
    console.log('[Diagnostics] Files count:', files.length);
    console.log('[Diagnostics] First file path:', files[0]?.path);
  },

  getDiagnosticsForFile(filePath) {
    console.log('[Diagnostics] getDiagnosticsForFile called with:', filePath);
    console.log('[Diagnostics] Available diagnostics files:', [...new Set(this.state.diagnostics.map(d => d.file))]);
    const filtered = this.state.diagnostics.filter(d => d.file === filePath);
    console.log('[Diagnostics] Filtered:', filtered.length, 'for', filePath);
    return filtered;
  },

  getDiagnosticById(id) {
    return this.state.diagnostics.find(d => d.id === id);
  },

  getErrorCount() {
    return this.state.diagnostics.filter(d => d.type === 'error').length;
  },

  getWarningCount() {
    return this.state.diagnostics.filter(d => d.type === 'warning').length;
  },

  getInfoCount() {
    return this.state.diagnostics.filter(d => d.type === 'info').length;
  },

  getTotalCount() {
    return this.state.diagnostics.length;
  },

  formatChatMessages(diagnostics, files) {
    // Convert diagnostics into chat message format for the AI assistant panel
    const messages = [];

    if (diagnostics.length === 0) {
      messages.push({
        type: 'ai',
        content: `Great news! No issues detected in your project. Your code looks clean!`,
        timestamp: new Date().toISOString(),
      });
      return messages;
    }

    const errorCount = diagnostics.filter(d => d.type === 'error').length;
    const warningCount = diagnostics.filter(d => d.type === 'warning').length;

    messages.push({
      type: 'ai',
      content: `Scan complete. Found ${diagnostics.length} issue${diagnostics.length !== 1 ? 's' : ''} (${errorCount} error${errorCount !== 1 ? 's' : ''}, ${warningCount} warning${warningCount !== 1 ? 's' : ''}). Click on any diagnostic below to see details and fix suggestions.`,
      timestamp: new Date().toISOString(),
      diagnostics: diagnostics.slice(0, 5), // Show first 5 in summary
    });

    // Add individual diagnostic messages for errors
    diagnostics.slice(0, 10).forEach(diag => {
      messages.push({
        type: 'diagnostic',
        diagnostic: diag,
        timestamp: new Date().toISOString(),
      });
    });

    return messages;
  },

  clear() {
    this.state.diagnostics = [];
    this.state.files = [];
    this.state.selectedDiagnostic = null;
  },

  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  },

  // Render error panel for a specific file
  renderErrorPanel(filePath) {
    const diagnostics = this.getDiagnosticsForFile(filePath);
    const errorList = document.getElementById('error-list');
    const errorCount = document.getElementById('error-count');
    const errorEmpty = document.getElementById('error-empty');

    if (!errorList || !errorCount) return;

    // Update error count
    errorCount.textContent = diagnostics.length;

    if (diagnostics.length === 0) {
      // Show empty state
      if (errorEmpty) errorEmpty.style.display = 'flex';
      // Remove any existing error items
      const existingItems = errorList.querySelectorAll('.error-item');
      existingItems.forEach(el => el.remove());
      return;
    }

    // Hide empty state
    if (errorEmpty) errorEmpty.style.display = 'none';

    // Remove any existing error items
    const existingItems = errorList.querySelectorAll('.error-item');
    existingItems.forEach(el => el.remove());

    // Add error items
    diagnostics.forEach(diag => {
      const itemEl = document.createElement('div');
      itemEl.className = `error-item ${diag.type}`;
      itemEl.dataset.diagnosticId = diag.id;

      const severityIcon = diag.type === 'error' 
        ? '<circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line>'
        : diag.type === 'warning'
        ? '<path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line>'
        : '<circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line>';

      itemEl.innerHTML = `
        <div class="error-item-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            ${severityIcon}
          </svg>
        </div>
        <div class="error-item-content">
          <div class="error-item-header">
            <span class="error-item-type">${diag.type}</span>
            <span class="error-item-code">${this.escapeHtml(diag.code)}</span>
          </div>
          <div class="error-item-message">${this.escapeHtml(diag.message)}</div>
          <div class="error-item-location">${this.escapeHtml(diag.file)}:${diag.line}:${diag.column}</div>
        </div>
      `;

      // Click handler to show explanation in chat panel
      itemEl.addEventListener('click', () => {
        if (window.Explanation) {
          Explanation.showDiagnosticExplanation(diag);
        }
      });

      errorList.appendChild(itemEl);
    });
  },

  clearErrorPanel() {
    const errorList = document.getElementById('error-list');
    const errorCount = document.getElementById('error-count');
    const errorEmpty = document.getElementById('error-empty');

    if (errorList) {
      const existingItems = errorList.querySelectorAll('.error-item');
      existingItems.forEach(el => el.remove());
    }
    if (errorCount) errorCount.textContent = '0';
    if (errorEmpty) errorEmpty.style.display = 'flex';
  },
};

window.Diagnostics = Diagnostics;
