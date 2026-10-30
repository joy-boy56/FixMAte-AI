/**
 * FixMate AI - Main Application
 * Project Scanner & Debugging Assistant
 */

const App = {
  state: {
    isScanning: false,
    scanResult: null,
  },

  init() {
    this.checkHealth();
    Upload.init();
    ProjectExplorer.init();
    Diagnostics.init();
    Explanation.init();
    console.log('FixMate AI Project Scanner initialized');
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
    
    const files = Upload.getFiles();
    if (files.length === 0) {
      this.showToast('No files to scan', true);
      return;
    }

    this.state.isScanning = true;
    Upload.showScanProgress();

    try {
      const projectName = Upload.getProjectName();
      
      // Prepare form data
      const formData = new FormData();
      formData.append('projectName', projectName);
      
      for (const file of files) {
        formData.append('files', file);
      }

      // Determine endpoint based on file types
      const isZip = files.some(f => f.name.toLowerCase().endsWith('.zip'));
      const isFolder = files.some(f => f.webkitRelativePath);
      
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

      this.state.scanResult = result.data;
      
      // Update UI with results
      ProjectExplorer.updateDiagnostics(result.data.project.files);
      ProjectExplorer.updateSummaryStats(result.data.project.summary);
      
      Diagnostics.setDiagnostics(result.data.diagnostics, result.data.project.files);
      
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