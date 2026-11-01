/**
 * Upload Module
 * Handles file, folder, and ZIP uploads
 */

const Upload = {
  elements: {},
  state: {
    files: [],
    projectName: '',
  },

  init() {
    this.cacheElements();
    this.bindEvents();
  },

  cacheElements() {
    this.elements = {
      dropzone: document.getElementById('dropzone'),
      fileInput: document.getElementById('file-input'),
      zipInput: document.getElementById('zip-input'),
      uploadFilesBtn: document.getElementById('upload-files-btn'),
      uploadFolderBtn: document.getElementById('upload-folder-btn'),
      uploadZipBtn: document.getElementById('upload-zip-btn'),
      uploadSection: document.getElementById('upload-section'),
      projectTreeSection: document.getElementById('project-tree-section'),
      scanProgress: document.getElementById('scan-progress'),
      clearProjectBtn: document.getElementById('clear-project-btn'),
      scanBtn: document.getElementById('scan-btn'),
      rescanBtn: document.getElementById('rescan-btn'),
      projectName: document.getElementById('project-name'),
    };
  },

  bindEvents() {
    // Dropzone events
    this.elements.dropzone.addEventListener('click', (e) => {
      if (e.target === this.elements.dropzone || e.target.closest('.dropzone-content')) {
        this.elements.fileInput.click();
      }
    });

    this.elements.dropzone.addEventListener('dragover', (e) => this.handleDragOver(e));
    this.elements.dropzone.addEventListener('dragleave', (e) => this.handleDragLeave(e));
    this.elements.dropzone.addEventListener('drop', (e) => this.handleDrop(e));

    // File input
    this.elements.fileInput.addEventListener('change', (e) => this.handleFiles(e.target.files));
    this.elements.zipInput.addEventListener('change', (e) => this.handleZip(e.target.files));

    // Upload buttons
    this.elements.uploadFilesBtn.addEventListener('click', () => this.elements.fileInput.click());
    this.elements.uploadFolderBtn.addEventListener('click', () => {
      this.elements.fileInput.setAttribute('webkitdirectory', '');
      this.elements.fileInput.setAttribute('directory', '');
      this.elements.fileInput.click();
    });
    this.elements.uploadZipBtn.addEventListener('click', () => this.elements.zipInput.click());

    // Reset webkitdirectory after folder selection
    this.elements.fileInput.addEventListener('change', () => {
      this.elements.fileInput.removeAttribute('webkitdirectory');
      this.elements.fileInput.removeAttribute('directory');
    }, { once: false });

    // Clear project
    this.elements.clearProjectBtn.addEventListener('click', () => this.clearProject());

    // Scan buttons
    this.elements.scanBtn.addEventListener('click', () => App.scanProject());
    this.elements.rescanBtn.addEventListener('click', () => App.scanProject());
  },

  handleDragOver(e) {
    e.preventDefault();
    e.stopPropagation();
    this.elements.dropzone.classList.add('drag-over');
  },

  handleDragLeave(e) {
    e.preventDefault();
    e.stopPropagation();
    // Only remove if actually leaving the dropzone
    if (!this.elements.dropzone.contains(e.relatedTarget)) {
      this.elements.dropzone.classList.remove('drag-over');
    }
  },

  handleDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    this.elements.dropzone.classList.remove('drag-over');

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      this.handleFiles(files);
    }
  },

  handleFiles(fileList) {
    const files = Array.from(fileList);
    
    // Check for ZIP file
    const zipFile = files.find(f => f.name.toLowerCase().endsWith('.zip'));
    if (zipFile && files.length === 1) {
      this.handleZip([zipFile]);
      return;
    }

    // Filter out directories (they have size 0 and no extension typically)
    const validFiles = files.filter(f => f.size > 0 || f.webkitRelativePath);
    
    if (validFiles.length === 0) {
      App.showToast('No valid files selected', true);
      return;
    }

    // Add metadata to each file for ProjectExplorer, but keep original File object for upload
    const processedFiles = validFiles.map(file => {
      const relativePath = file.webkitRelativePath || file.name;
      const extension = '.' + relativePath.split('.').pop().toLowerCase();
      const language = this.detectLanguage(relativePath);
      
      return {
        // Keep reference to original File object for upload
        _file: file,
        // Metadata for display
        path: relativePath,
        status: 'supported',
        language: language,
        extension: extension,
        size: file.size,
        name: file.name,
      };
    });

    this.state.files = processedFiles;
    this.state.projectName = this.guessProjectName(processedFiles);
    this.showProjectTree();
  },

  detectLanguage(filePath) {
    const ext = '.' + filePath.split('.').pop().toLowerCase();
    const langMap = {
      '.py': 'Python', '.pyw': 'Python',
      '.js': 'JavaScript', '.mjs': 'JavaScript', '.cjs': 'JavaScript',
      '.ts': 'TypeScript', '.tsx': 'TypeScript',
      '.java': 'Java',
      '.c': 'C',
      '.cpp': 'C++', '.cc': 'C++', '.cxx': 'C++', '.h': 'C++', '.hpp': 'C++',
      '.html': 'HTML', '.htm': 'HTML',
      '.css': 'CSS',
      '.json': 'JSON',
    };
    return langMap[ext] || 'Unknown';
  },

  handleZip(fileList) {
    const files = Array.from(fileList);
    const zipFile = files.find(f => f.name.toLowerCase().endsWith('.zip'));
    
    if (!zipFile) {
      App.showToast('Please select a ZIP file', true);
      return;
    }

    if (zipFile.size > 25 * 1024 * 1024) {
      App.showToast('ZIP file exceeds 25 MB limit', true);
      return;
    }

    this.state.files = [zipFile];
    this.state.projectName = zipFile.name.replace('.zip', '');
    this.showProjectTree();
  },

  guessProjectName(files) {
    // Try to find a common root folder
    const paths = files
      .map(f => f.webkitRelativePath || f.name)
      .filter(p => p.includes('/'));
    
    if (paths.length > 0) {
      const firstPath = paths[0];
      const rootFolder = firstPath.split('/')[0];
      return rootFolder;
    }
    
    return 'Uploaded Project';
  },

  showProjectTree() {
    this.elements.uploadSection.classList.add('hidden');
    this.elements.projectTreeSection.classList.remove('hidden');
    this.elements.projectName.textContent = this.state.projectName;
    
    ProjectExplorer.render(this.state.files);
    App.showToast(`${this.state.files.length} files ready to scan`);
  },

  clearProject() {
    this.state.files = [];
    this.state.projectName = '';
    this.elements.fileInput.value = '';
    this.elements.zipInput.value = '';
    
    this.elements.uploadSection.classList.remove('hidden');
    this.elements.projectTreeSection.classList.add('hidden');
    this.elements.scanProgress.classList.add('hidden');
    this.elements.scanBtn.classList.remove('hidden');
    this.elements.rescanBtn.classList.add('hidden');
    
    ProjectExplorer.clear();
    Diagnostics.clear();
    Explanation.clear();
    
    App.showToast('Project cleared');
  },

  showScanProgress() {
    this.elements.scanBtn.classList.add('hidden');
    this.elements.rescanBtn.classList.add('hidden');
    this.elements.scanProgress.classList.remove('hidden');
    this.updateProgress(0, 'Initializing...');
  },

  hideScanProgress() {
    this.elements.scanProgress.classList.add('hidden');
    this.elements.rescanBtn.classList.remove('hidden');
  },

  updateProgress(percent, status, step = null) {
    document.getElementById('progress-fill').style.width = `${percent}%`;
    document.getElementById('progress-percent').textContent = `${Math.round(percent)}%`;
    document.getElementById('progress-status').textContent = status;
    
    if (step) {
      const steps = document.getElementById('progress-steps');
      const stepEl = document.getElementById(`step-${step}`);
      if (stepEl) {
        stepEl.classList.add('active');
      }
    }
  },

  getFiles() {
    // Return original File objects for uploading (stored in _file property)
    return this.state.files.map(f => f._file).filter(f => f instanceof File);
  },

  getProjectName() {
    return this.state.projectName;
  },
};