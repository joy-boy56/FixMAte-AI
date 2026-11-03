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
    console.log('[Diagnostics] Stored', diagnostics.length, 'diagnostics');
  },

  getDiagnosticsForFile(filePath) {
    return this.state.diagnostics.filter(d => d.file === filePath);
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
};
