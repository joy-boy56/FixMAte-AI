/**
 * Diagnostics Module
 * Renders and manages the diagnostics list panel
 */

const Diagnostics = {
  state: {
    diagnostics: [],
    files: [],
    currentFilter: { severity: 'all', language: 'all' },
    selectedDiagnostic: null,
  },

  init() {
    this.cacheElements();
    this.bindEvents();
  },

  cacheElements() {
    this.elements = {
      empty: document.getElementById('diagnostics-empty'),
      list: document.getElementById('diagnostics-list'),
      clean: document.getElementById('diagnostics-clean'),
      filterSeverity: document.getElementById('filter-severity'),
      filterLanguage: document.getElementById('filter-language'),
    };
  },

  bindEvents() {
    this.elements.filterSeverity.addEventListener('change', (e) => {
      this.state.currentFilter.severity = e.target.value;
      this.render();
    });

    this.elements.filterLanguage.addEventListener('change', (e) => {
      this.state.currentFilter.language = e.target.value;
      this.render();
    });
  },

  setDiagnostics(diagnostics, files) {
    console.log('[Diagnostics] setDiagnostics called:', diagnostics.length, 'diagnostics');
    console.log('[Diagnostics] files:', files?.length);
    try {
      this.state.diagnostics = diagnostics;
      this.state.files = files;
      console.log('[Diagnostics] Calling updateLanguageFilter');
      this.updateLanguageFilter(diagnostics);
      console.log('[Diagnostics] Calling render');
      this.render();
    } catch (err) {
      console.error('[Diagnostics] Error in setDiagnostics:', err);
    }
  },

  updateLanguageFilter(diagnostics) {
    console.log('[Diagnostics] updateLanguageFilter called');
    const languages = [...new Set(diagnostics.map(d => d.language).filter(l => l !== 'Unknown'))];
    console.log('[Diagnostics] languages found:', languages);
    console.log('[Diagnostics] filterLanguage element:', this.elements.filterLanguage);
    if (this.elements.filterLanguage) {
      this.elements.filterLanguage.innerHTML = `
        <option value="all">All Languages</option>
        ${languages.map(l => `<option value="${l}">${l}</option>`).join('')}
      `;
      console.log('[Diagnostics] filterLanguage updated');
    } else {
      console.error('[Diagnostics] filterLanguage element NOT FOUND!');
    }
  },

  render() {
    console.log('[Diagnostics] render called, diagnostics:', this.state.diagnostics.length);
    try {
      const filtered = this.getFilteredDiagnostics();
      console.log('[Diagnostics] filtered:', filtered.length, 'currentFilter:', this.state.currentFilter);
      
      if (this.state.diagnostics.length === 0) {
        console.log('[Diagnostics] showing empty state');
        this.showEmpty();
        return;
      }

      if (filtered.length === 0) {
        console.log('[Diagnostics] showing clean state (filtered out)');
        this.showClean();
        return;
      }

      console.log('[Diagnostics] showing list with', filtered.length, 'items');
      this.showList();
      this.elements.list.innerHTML = filtered.map(d => this.renderDiagnosticCard(d)).join('');
      this.bindCardEvents();
    } catch (err) {
      console.error('[Diagnostics] Error in render:', err);
    }
  },

  updateLanguageFilter(diagnostics) {
    const languages = [...new Set(diagnostics.map(d => d.language).filter(l => l !== 'Unknown'))];
    this.elements.filterLanguage.innerHTML = `
      <option value="all">All Languages</option>
      ${languages.map(l => `<option value="${l}">${l}</option>`).join('')}
    `;
  },

  render() {
    const filtered = this.getFilteredDiagnostics();
    
    if (this.state.diagnostics.length === 0) {
      this.showEmpty();
      return;
    }

    if (filtered.length === 0) {
      this.showClean();
      return;
    }

    this.showList();
    this.elements.list.innerHTML = filtered.map(d => this.renderDiagnosticCard(d)).join('');
    this.bindCardEvents();
  },

  getFilteredDiagnostics() {
    return this.state.diagnostics.filter(d => {
      if (this.state.currentFilter.severity !== 'all' && d.type !== this.state.currentFilter.severity) {
        return false;
      }
      if (this.state.currentFilter.language !== 'all' && d.language !== this.state.currentFilter.language) {
        return false;
      }
      return true;
    });
  },

  showEmpty() {
    console.log('[Diagnostics] showEmpty called');
    this.elements.empty.classList.remove('hidden');
    this.elements.list.classList.add('hidden');
    this.elements.clean.classList.add('hidden');
  },

  showClean() {
    console.log('[Diagnostics] showClean called');
    this.elements.empty.classList.add('hidden');
    this.elements.list.classList.add('hidden');
    this.elements.clean.classList.remove('hidden');
  },

  showList() {
    console.log('[Diagnostics] showList called');
    this.elements.empty.classList.add('hidden');
    this.elements.list.classList.remove('hidden');
    this.elements.clean.classList.add('hidden');
  },

  renderDiagnosticCard(diagnostic) {
    const file = this.state.files.find(f => (f.path || f.webkitRelativePath || f.name) === diagnostic.file);
    const fileName = diagnostic.file.split('/').pop() || diagnostic.file;
    
    // Get source line with highlighting
    const sourceLine = diagnostic.sourceLine || '';
    const errorColumn = diagnostic.column || 0;
    let highlightedLine = this.escapeHtml(sourceLine);
    
    // Try to highlight error position if we have column info
    if (errorColumn > 0 && sourceLine) {
      const before = sourceLine.substring(0, errorColumn - 1);
      const at = sourceLine.substring(errorColumn - 1, errorColumn + 10);
      const after = sourceLine.substring(errorColumn + 10);
      highlightedLine = `${this.escapeHtml(before)}<span class="error-highlight">${this.escapeHtml(at)}</span>${this.escapeHtml(after)}`;
    }

    return `
      <div class="diagnostic-card ${this.state.selectedDiagnostic === diagnostic.id ? 'selected' : ''}" data-id="${diagnostic.id}">
        <div class="diagnostic-header">
          <div class="diagnostic-type">
            <span class="severity-badge ${diagnostic.type}">${diagnostic.type}</span>
            <span class="diagnostic-code">${this.escapeHtml(diagnostic.code)}</span>
          </div>
          <span class="diagnostic-file" title="${this.escapeHtml(diagnostic.file)}">${this.escapeHtml(fileName)}:${diagnostic.line}:${diagnostic.column}</span>
        </div>
        <div class="diagnostic-message">${this.escapeHtml(diagnostic.message)}</div>
        <div class="diagnostic-source">
          <div class="source-line">
            <span class="line-number error-line">${diagnostic.line}</span>
            <span class="line-content">${highlightedLine}</span>
          </div>
        </div>
      </div>
    `;
  },

  bindCardEvents() {
    this.elements.list.querySelectorAll('.diagnostic-card').forEach(card => {
      card.addEventListener('click', () => {
        const id = card.dataset.id;
        this.selectDiagnostic(id);
      });
    });
  },

  selectDiagnostic(id) {
    this.state.selectedDiagnostic = id;
    this.render(); // Re-render to update selection
    
    const diagnostic = this.state.diagnostics.find(d => d.id === id);
    if (diagnostic) {
      Explanation.show(diagnostic, this.state.files);
    }
  },

  showFileDiagnostics(file) {
    // Filter diagnostics for this file
    const fileDiagnostics = this.state.diagnostics.filter(d => d.file === (file.path || file.webkitRelativePath || file.name));
    
    if (fileDiagnostics.length === 0) {
      this.showClean();
      return;
    }

    this.showList();
    this.elements.list.innerHTML = fileDiagnostics.map(d => this.renderDiagnosticCard(d)).join('');
    this.bindCardEvents();
  },

  clear() {
    this.state.diagnostics = [];
    this.state.files = [];
    this.state.selectedDiagnostic = null;
    this.showEmpty();
    this.elements.filterLanguage.innerHTML = '<option value="all">All Languages</option>';
  },

  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  },
};