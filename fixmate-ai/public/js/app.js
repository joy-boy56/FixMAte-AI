/**
 * FixMate - Main Application
 * Project Scanner & Debugging Assistant
 */

const App = {
  state: {
    isScanning: false,
    scanResult: null,
    currentFile: null,
  },

  init() {
    this.initTheme();
    this.checkHealth();
    Upload.init();
    ProjectExplorer.init();
    Diagnostics.init();
    Explanation.init();
    this.initPasteCode();
    this.initNewProject();
    console.log('FixMate Project Scanner initialized');
  },

  initTheme() {
    const themeToggle = document.getElementById('theme-toggle');
    if (!themeToggle) return;

    // Get saved theme or default to dark (no attribute = dark)
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme) {
      document.documentElement.setAttribute('data-theme', savedTheme);
    }

    themeToggle.addEventListener('click', () => this.toggleTheme());
  },

  toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    if (newTheme === 'dark') {
      document.documentElement.removeAttribute('data-theme');
    } else {
      document.documentElement.setAttribute('data-theme', newTheme);
    }
    localStorage.setItem('theme', newTheme);
  },

  initPasteCode() {
    const backBtn = document.getElementById('back-to-upload');
    const pasteBtn = document.getElementById('analyze-paste-btn');

    if (backBtn) {
      backBtn.addEventListener('click', () => {
        document.getElementById('paste-section').classList.add('hidden');
        document.getElementById('upload-section').classList.remove('hidden');
      });
    }

    if (pasteBtn) {
      pasteBtn.addEventListener('click', () => this.handlePasteCode());
    }
  },

  initNewProject() {
    const newBtn = document.getElementById('new-project-btn');
    if (newBtn) {
      newBtn.addEventListener('click', () => Upload.clearProject());
    }
    this.initToggleButtons();
  },

  initToggleButtons() {
    const sidebarToggle = document.getElementById('sidebar-toggle');
    const chatToggle = document.getElementById('chat-toggle');
    const closeSidebar = document.getElementById('close-sidebar');
    const sidebarOverlay = document.getElementById('sidebar-overlay');
    const sidebar = document.getElementById('sidebar');

    // Sidebar toggle (mobile)
    if (sidebarToggle) {
      sidebarToggle.addEventListener('click', () => {
        sidebar.classList.toggle('open');
        sidebarOverlay.classList.toggle('active');
      });
    }

    // Close sidebar button
    if (closeSidebar) {
      closeSidebar.addEventListener('click', () => {
        sidebar.classList.remove('open');
        sidebarOverlay.classList.remove('active');
      });
    }

    // Sidebar overlay click to close
    if (sidebarOverlay) {
      sidebarOverlay.addEventListener('click', () => {
        sidebar.classList.remove('open');
        sidebarOverlay.classList.remove('active');
      });
    }

    // Chat toggle (mobile/desktop)
    if (chatToggle) {
      chatToggle.addEventListener('click', () => {
        const chatPanel = document.querySelector('.chat-panel');
        if (chatPanel) {
          chatPanel.classList.toggle('open');
        }
      });
    }
  },

  async handlePasteCode() {
    const contentEl = document.getElementById('paste-content');
    const languageEl = document.getElementById('paste-language');
    const filenameEl = document.getElementById('paste-filename');

    if (!contentEl || !contentEl.value.trim()) {
      this.showToast('Please paste some code first', true);
      return;
    }

    const content = contentEl.value.trim();
    const language = languageEl.value;
    const filename = filenameEl.value.trim() || 'code.js';

    // Hide paste section, show upload section
    document.getElementById('paste-section').classList.add('hidden');
    document.getElementById('upload-section').classList.add('hidden');

    // Create a pseudo-file object
    const fileObj = {
      path: filename,
      name: filename,
      language: language === 'auto' ? Upload.detectLanguage(filename) : this.capitalize(language),
      extension: '.' + filename.split('.').pop().toLowerCase(),
      status: 'supported',
      size: content.length,
      _pasteContent: content,
    };

    Upload.state.files = [fileObj];
    Upload.state.projectName = 'Pasted Code';
    document.getElementById('project-name').textContent = 'Pasted Code';
    document.getElementById('upload-section').classList.add('hidden');
    document.getElementById('project-tree-section').classList.remove('hidden');
    ProjectExplorer.render([fileObj]);
    App.showToast('Code ready to scan');
  },

  capitalize(str) {
    if (!str) return str;
    return str.charAt(0).toUpperCase() + str.slice(1);
  },

  async checkHealth() {
    try {
      const response = await fetch('/api/health');
      const data = await response.json();
      this.updateAnalyzerStatus(data.analyzers);
      this.updateAIStatus(data.ai_provider);
    } catch (err) {
      console.error('Health check failed:', err);
    }
  },

  updateAnalyzerStatus(analyzers) {
    const container = document.getElementById('analyzer-status');
    if (!container) return;

    container.innerHTML = Object.entries(analyzers).map(([key, analyzer]) => `
      <span class="analyzer-badge ${analyzer.available ? 'available' : 'unavailable'}">
        <span class="analyzer-dot"></span>
        ${analyzer.name}
      </span>
    `).join('');
  },

  updateAIStatus(aiProvider) {
    // Could show AI status in header
  },

  async scanProject() {
    if (this.state.isScanning) return;

    // Use Upload.state.files directly to get full file info (including _pasteContent for pasted code)
    const fileWrappers = Upload.state.files;
    console.log('[App] scanProject - fileWrappers:', fileWrappers.length);
    if (fileWrappers.length === 0) {
      this.showToast('No files to scan', true);
      return;
    }

    // Debug: log file details
    fileWrappers.forEach((f, i) => console.log(`[App] FileWrapper ${i}:`, f.name, f.size, f._file instanceof File, '_pasteContent' in f));

    this.state.isScanning = true;
    Upload.showScanProgress();

    try {
      const projectName = Upload.getProjectName();

      // Prepare form data
      const formData = new FormData();
      formData.append('projectName', projectName);

      for (const fileWrapper of fileWrappers) {
        if (fileWrapper._pasteContent) {
          // Handle pasted code - create a blob
          const blob = new Blob([fileWrapper._pasteContent], { type: 'text/plain' });
          const fileWithName = new File([blob], fileWrapper.name, { type: 'text/plain' });
          formData.append('files', fileWithName);
          console.log('[App] Appended pasted file:', fileWithName.name, fileWithName.size);
        } else if (fileWrapper._file instanceof File) {
          formData.append('files', fileWrapper._file);
          console.log('[App] Appended file:', fileWrapper._file.name, fileWrapper._file.size, fileWrapper._file.type);
        } else {
          console.warn('[App] Skipping file with no valid content:', fileWrapper);
        }
      }

      // Debug: log FormData entries
      console.log('[App] FormData entries:');
      for (let pair of formData.entries()) {
        console.log('[App]   ', pair[0], pair[1] instanceof File ? `File: ${pair[1].name} (${pair[1].size} bytes)` : pair[1]);
      }

      // Determine endpoint
      const isZip = fileWrappers.some(f => f.name.toLowerCase().endsWith('.zip'));
      const isFolder = fileWrappers.some(f => f.webkitRelativePath);

      let endpoint = '/api/scan';
      if (isZip) endpoint = '/api/scan/zip';
      else if (isFolder) endpoint = '/api/scan/folder';

      Upload.updateProgress(10, 'Uploading files...', 'upload');

      const response = await fetch(endpoint, {
        method: 'POST',
        body: formData,
      });

      Upload.updateProgress(50, 'Processing scan results...', 'process');

      const result = await response.json();

      Upload.updateProgress(80, 'Rendering diagnostics...', 'render');

      if (!result.success) {
        throw new Error(result.error || 'Scan failed');
      }

      console.log('[App] Scan successful, diagnostics:', result.data.diagnostics?.length);
      console.log('[App] Backend files:', result.data.project.files.map(f => ({path: f.path, name: f.name})));
      console.log('[App] Backend diagnostics files:', [...new Set(result.data.diagnostics.map(d => d.file))]);

      this.state.scanResult = result.data;

      // Attach diagnostics to each file
      const filesWithDiagnostics = result.data.project.files.map(file => {
        const fileDiagnostics = result.data.diagnostics.filter(d => d.file === file.path);
        console.log('[App] File:', file.path, '-> diagnostics:', fileDiagnostics.length);
        return { ...file, diagnostics: fileDiagnostics };
      });

      // Set diagnostics state for error panel
      Diagnostics.setDiagnostics(result.data.diagnostics, filesWithDiagnostics);

      // Update UI with results
      ProjectExplorer.updateDiagnostics(filesWithDiagnostics);
      ProjectExplorer.updateSummaryStats(result.data.project.summary);

      // Send scan results to chat
      Explanation.showScanResult(result.data.diagnostics, result.data.project.files, result.data.generalAnalysis);

      Upload.updateProgress(100, 'Scan complete!', 'done');

      await this.delay(500);
      Upload.hideScanProgress();

      this.showToast(`Scan complete: ${result.data.diagnostics.length} diagnostics found`);

    } catch (err) {
      console.error('Scan error:', err);
      Upload.hideScanProgress();
      Upload.elements.scanBtn.classList.remove('hidden');
      this.showToast(err.message || 'Scan failed', true);
    } finally {
      this.state.isScanning = false;
    }
  },

  async explainDiagnostic(diagnosticId, diagnostic, files) {
    try {
      const response = await fetch('/api/explain/single', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          diagnosticId: diagnosticId,
          diagnostics: [diagnostic],
          files: files,
          projectContext: {
            totalFiles: files.length,
            languages: [...new Set(files.map(f => f.language).filter(l => l !== 'Unknown'))],
            totalDiagnostics: files.reduce((sum, f) => sum + (f.diagnostics?.length || 0), 0),
          },
        }),
      });

      const result = await response.json();

      if (result.success && result.data?.success) {
        diagnostic.aiExplanation = result.data.explanation;
        return result.data.explanation;
      } else {
        throw new Error(result.data?.error || 'Failed to generate explanation');
      }
    } catch (err) {
      console.error('Explain error:', err);
      throw err;
    }
  },

  showFileInEditor(file) {
    this.state.currentFile = file;
    console.log('[App] showFileInEditor called with file:', { name: file.name, path: file.path, hasDiagnostics: !!file.diagnostics, diagnosticsCount: file.diagnostics?.length });

    // Update editor title
    const filenameEl = document.getElementById('editor-filename');
    const languageEl = document.getElementById('editor-language');
    const editorEmpty = document.getElementById('editor-empty');
    const editorContent = document.getElementById('editor-content');

    if (filenameEl) filenameEl.textContent = file.name || file.path;
    if (languageEl) {
      languageEl.textContent = file.language || 'Unknown';
      languageEl.style.display = file.language ? 'inline-block' : 'none';
    }

    // Show editor content
    if (editorEmpty) editorEmpty.classList.add('hidden');
    if (editorContent) editorContent.classList.remove('hidden');

    // Get content
    let content = '';
    if (file._pasteContent) {
      content = file._pasteContent;
    } else if (file.content) {
      content = file.content;
    }

    // Set code text
    const codeText = document.getElementById('code-text');
    if (codeText) codeText.textContent = content;

    // Render line numbers
    const lineNumbers = document.getElementById('line-numbers');
    if (lineNumbers) {
      const lines = content.split('\n');
      lineNumbers.innerHTML = lines.map((_, i) => i + 1).join('<br>');
    }

    // Highlight error lines if diagnostics exist
    const diagnostics = file.diagnostics || [];
    if (diagnostics.length > 0) {
      this.highlightErrorLines(diagnostics);
    }

    // Render error panel for this file
    if (window.Diagnostics) {
      Diagnostics.renderErrorPanel(file.path);
    }
  },

  highlightErrorLines(diagnostics) {
    // This will add visual indicators for error lines
    // The actual line highlighting could be done via CSS classes
    const errorLines = diagnostics.map(d => d.line);
    console.log('[App] Error lines:', errorLines);
  },

  showToast(message, isError = false) {
    // Remove existing toast
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = `toast ${isError ? 'toast-error' : ''}`;
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.style.animation = 'slideOut 0.3s ease forwards';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  },

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  },
};

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => App.init());

// Global access for modules
window.App = App;
