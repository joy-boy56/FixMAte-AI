/**
 * Project Explorer Module
 * Renders and manages the project file tree
 */

const ProjectExplorer = {
  state: {
    files: [],
    expandedFolders: new Set(),
    selectedFile: null,
  },

  init() {
    this.cacheElements();
  },

  cacheElements() {
    this.elements = {
      fileTree: document.getElementById('file-tree'),
      statFiles: document.getElementById('stat-files'),
      statLanguages: document.getElementById('stat-languages'),
      statErrors: document.getElementById('stat-errors'),
      statWarnings: document.getElementById('stat-warnings'),
    };
  },

  render(files) {
    this.state.files = files;
    this.updateSummary(files);
    this.renderTree(files);
  },

  updateSummary(files) {
    const supported = files.filter(f => f.status === 'supported');
    const languages = [...new Set(supported.map(f => f.language).filter(l => l !== 'Unknown'))];

    this.elements.statFiles.textContent = `${supported.length} files`;
    this.elements.statLanguages.textContent = `${languages.length} languages`;
    this.elements.statErrors.textContent = `0 errors`;
    this.elements.statWarnings.textContent = `0 warnings`;
  },

  renderTree(files) {
    const tree = this.buildTree(files);
    this.elements.fileTree.innerHTML = this.renderTreeNode(tree, 0);
    this.bindTreeEvents();
  },

  buildTree(files) {
    const root = { name: '', path: '', type: 'folder', children: [], isRoot: true };

    for (const file of files) {
      const relativePath = file.path || file.webkitRelativePath || file.name;
      const parts = relativePath.split('/').filter(p => p);

      let current = root;
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        const isFile = i === parts.length - 1;
        const currentPath = parts.slice(0, i + 1).join('/');

        let child = current.children.find(c => c.name === part);

        if (!child) {
          child = {
            name: part,
            path: currentPath,
            type: isFile ? 'file' : 'folder',
            children: [],
            fileData: isFile ? file : null,
          };
          current.children.push(child);
        }

        if (!isFile) {
          current = child;
        }
      }
    }

    const sortChildren = (node) => {
      node.children.sort((a, b) => {
        if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
      node.children.forEach(sortChildren);
    };
    sortChildren(root);

    return root;
  },

  renderTreeNode(node, depth) {
    if (node.isRoot) {
      return node.children.map(child => this.renderTreeNode(child, depth)).join('');
    }

    if (node.type === 'folder') {
      const isExpanded = this.state.expandedFolders.has(node.path);
      const childCount = node.children.length;
      const fileCount = node.children.filter(c => c.type === 'file').length;
      const folderCount = node.children.filter(c => c.type === 'folder').length;

      let countText = '';
      if (fileCount > 0 && folderCount > 0) {
        countText = `${fileCount} files, ${folderCount} folders`;
      } else if (fileCount > 0) {
        countText = `${fileCount} file${fileCount !== 1 ? 's' : ''}`;
      } else if (folderCount > 0) {
        countText = `${folderCount} folder${folderCount !== 1 ? 's' : ''}`;
      }

      return `
        <div class="tree-folder" data-path="${this.escapeHtml(node.path)}">
          <div class="tree-folder-header ${isExpanded ? 'expanded' : ''}" data-path="${this.escapeHtml(node.path)}">
            <svg class="folder-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"></path>
            </svg>
            <span class="folder-name">${this.escapeHtml(node.name)}</span>
            ${countText ? `<span class="folder-count">${this.escapeHtml(countText)}</span>` : ''}
          </div>
          <div class="tree-files" data-path="${this.escapeHtml(node.path)}" style="max-height: ${isExpanded ? '500px' : '0'}; overflow: hidden; transition: max-height 0.2s ease;">
            ${node.children.map(child => this.renderTreeNode(child, depth + 1)).join('')}
          </div>
        </div>
      `;
    } else {
      const file = node.fileData;
      const isSelected = this.state.selectedFile === node.path;
      const langClass = this.getLanguageClass(file?.language);
      const diagnostics = file?.diagnostics || [];
      const errorCount = diagnostics.filter(d => d.type === 'error').length;
      const warningCount = diagnostics.filter(d => d.type === 'warning').length;

      return `
        <div class="tree-file ${isSelected ? 'selected' : ''} ${langClass}" data-path="${this.escapeHtml(node.path)}" data-file='${JSON.stringify(file).replace(/'/g, '&apos;')}'>
          <svg class="file-icon ${langClass}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            ${this.getFileIcon(file?.language)}
          </svg>
          <span class="file-name" title="${this.escapeHtml(node.name)}">${this.escapeHtml(node.name)}</span>
          <div class="file-diagnostics">
            ${errorCount > 0 ? `<span class="diag-dot error" title="${errorCount} error${errorCount !== 1 ? 's' : ''}"></span>` : ''}
            ${warningCount > 0 ? `<span class="diag-dot warning" title="${warningCount} warning${warningCount !== 1 ? 's' : ''}"></span>` : ''}
          </div>
        </div>
      `;
    }
  },

  getLanguageClass(language) {
    if (!language || language === 'Unknown') return 'unknown';
    return language.toLowerCase().replace(/[^a-z]/g, '');
  },

  getFileIcon(language) {
    return `<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"></path>
            <path d="M14 2v6h6"></path>`;
  },

  bindTreeEvents() {
    this.elements.fileTree.querySelectorAll('.tree-folder-header').forEach(header => {
      header.addEventListener('click', (e) => {
        e.stopPropagation();
        const path = header.dataset.path;
        this.toggleFolder(path);
      });
    });

    this.elements.fileTree.querySelectorAll('.tree-file').forEach(fileEl => {
      fileEl.addEventListener('click', (e) => {
        e.stopPropagation();
        const path = fileEl.dataset.path;
        this.selectFile(path);
      });
    });
  },

  toggleFolder(path) {
    if (this.state.expandedFolders.has(path)) {
      this.state.expandedFolders.delete(path);
    } else {
      this.state.expandedFolders.add(path);
    }
    this.renderTree(this.state.files);
  },

  selectFile(path) {
    this.state.selectedFile = path;
    this.renderTree(this.state.files);

    const file = this.findFileByPath(path);
    if (file) {
      App.showFileInEditor(file);
    }
  },

  findFileByPath(path) {
    return this.state.files.find(f => (f.path || f.webkitRelativePath || f.name) === path);
  },

  updateDiagnostics(filesWithDiagnostics) {
    for (const file of this.state.files) {
      const relPath = file.path || file.webkitRelativePath || file.name;
      const matching = filesWithDiagnostics.find(f => f.path === relPath);
      if (matching) {
        file.diagnostics = matching.diagnostics;
      }
    }
    this.renderTree(this.state.files);
  },

  updateSummaryStats(summary) {
    if (summary) {
      this.elements.statErrors.textContent = `${summary.errors} error${summary.errors !== 1 ? 's' : ''}`;
      this.elements.statWarnings.textContent = `${summary.warnings} warning${summary.warnings !== 1 ? 's' : ''}`;
    }
  },

  clear() {
    this.state.files = [];
    this.state.expandedFolders.clear();
    this.state.selectedFile = null;
    this.elements.fileTree.innerHTML = '';
    this.elements.statFiles.textContent = '0 files';
    this.elements.statLanguages.textContent = '0 languages';
    this.elements.statErrors.textContent = '0 errors';
    this.elements.statWarnings.textContent = '0 warnings';
  },

  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  },
};
