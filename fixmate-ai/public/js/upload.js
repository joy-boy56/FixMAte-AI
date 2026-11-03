/**
 * Upload Module
 * Handles file, folder, ZIP uploads and paste code
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
      folderInput: document.getElementById('folder-input'),
      uploadFilesBtn: document.getElementById('upload-files-btn'),
      uploadFolderBtn: document.getElementById('upload-folder-btn'),
      uploadZipBtn: document.getElementById('upload-zip-btn'),
      pasteCodeBtn: document.getElementById('paste-code-btn'),
      uploadSection: document.getElementById('upload-section'),
      pasteSection: document.getElementById('paste-section'),
      projectTreeSection: document.getElementById('project-tree-section'),
      scanProgress: document.getElementById('scan-progress'),
      clearProjectBtn: document.getElementById('clear-project-btn'),
      scanBtn: document.getElementById('scan-btn'),
      rescanBtn: document.getElementById('rescan-btn'),
      projectName: document.getElementById('project-name'),
    };
  },

  bindEvents() {
    // Dropzone events - only trigger file input when clicking empty dropzone area
    this.elements.dropzone.addEventListener('click', (e) => {
      // Only trigger if clicking directly on dropzone or dropzone-content (not buttons)
      const isButton = e.target.closest('button');
      const isInput = e.target.closest('input');
      const isSelect = e.target.closest('select');
      if (!isButton && !isInput && !isSelect && (e.target === this.elements.dropzone || e.target.closest('.dropzone-content'))) {
        this.elements.fileInput.click();
      }
    });

    this.elements.dropzone.addEventListener('dragover', (e) => this.handleDragOver(e));
    this.elements.dropzone.addEventListener('dragleave', (e) => this.handleDragLeave(e));
    this.elements.dropzone.addEventListener('drop', (e) => this.handleDrop(e));

    // File input
    this.elements.fileInput.addEventListener('change', (e) => this.handleFiles(e.target.files));
    this.elements.zipInput.addEventListener('change', (e) => this.handleZip(e.target.files));
    this.elements.folderInput.addEventListener('change', (e) => this.handleFolder(e.target.files));

    // Upload buttons - stop propagation to prevent double-trigger
    this.elements.uploadFilesBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.elements.fileInput.click();
    });
    this.elements.uploadFolderBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.elements.folderInput.click();
    });
    this.elements.uploadZipBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.elements.zipInput.click();
    });

    // Paste code button
    this.elements.pasteCodeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.showPasteCode();
    });

    // Clear project
    this.elements.clearProjectBtn.addEventListener('click', () => this.clearProject());

    // Scan buttons
    this.elements.scanBtn.addEventListener('click', () => App.scanProject());
    this.elements.rescanBtn.addEventListener('click', () => App.scanProject());
  },

  showPasteCode() {
    this.elements.uploadSection.classList.add('hidden');
    this.elements.pasteSection.classList.remove('hidden');
  },

  handleDragOver(e) {
    e.preventDefault();
    e.stopPropagation();
    this.elements.dropzone.classList.add('drag-over');
  },

  handleDragLeave(e) {
    e.preventDefault();
    e.stopPropagation();
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
    console.log('[Upload] handleFiles called with', files.length, 'files');

    // Check for ZIP file
    const zipFile = files.find(f => f.name.toLowerCase().endsWith('.zip'));
    if (zipFile && files.length === 1) {
      console.log('[Upload] ZIP file detected, delegating to handleZip');
      this.handleZip([zipFile]);
      return;
    }

    // Filter out directories
    const validFiles = files.filter(f => f.size > 0 || f.webkitRelativePath);
    console.log('[Upload] Valid files after filter:', validFiles.length);

    if (validFiles.length === 0) {
      App.showToast('No valid files selected', true);
      return;
    }

    // Add metadata to each file
    const processedFiles = validFiles.map(file => {
      const relativePath = file.webkitRelativePath || file.name;
      const extension = '.' + relativePath.split('.').pop().toLowerCase();
      const language = this.detectLanguage(relativePath);

      return {
        _file: file,
        path: relativePath,
        status: 'supported',
        language: language,
        extension: extension,
        size: file.size,
        name: file.name,
      };
    });

    console.log('[Upload] Processed files:', processedFiles.map(f => ({name: f.name, path: f.path, hasFile: f._file instanceof File})));
    this.state.files = processedFiles;
    this.state.projectName = this.guessProjectName(processedFiles);
    this.showProjectTree();
  },

  handleFolder(fileList) {
    const files = Array.from(fileList).filter(f => f.size > 0 || f.webkitRelativePath);

    if (files.length === 0) {
      App.showToast('No valid files in folder', true);
      return;
    }

    const processedFiles = files.map(file => {
      const relativePath = file.webkitRelativePath || file.name;
      const extension = '.' + relativePath.split('.').pop().toLowerCase();
      const language = this.detectLanguage(relativePath);

      return {
        _file: file,
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
    this.elements.pasteSection.classList.add('hidden');
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
    this.elements.folderInput.value = '';

    // Reset paste form
    const pasteContent = document.getElementById('paste-content');
    const pasteFilename = document.getElementById('paste-filename');
    const pasteLanguage = document.getElementById('paste-language');
    if (pasteContent) pasteContent.value = '';
    if (pasteFilename) pasteFilename.value = '';
    if (pasteLanguage) pasteLanguage.value = 'auto';

    this.elements.uploadSection.classList.remove('hidden');
    this.elements.pasteSection.classList.add('hidden');
    this.elements.projectTreeSection.classList.add('hidden');
    this.elements.scanProgress.classList.add('hidden');
    this.elements.scanBtn.classList.remove('hidden');
    this.elements.rescanBtn.classList.add('hidden');

    ProjectExplorer.clear();
    Explanation.clear();
    Diagnostics.clear();

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
    const progressFill = document.getElementById('progress-fill');
    const progressPercent = document.getElementById('progress-percent');
    const progressStatus = document.getElementById('progress-status');

    if (progressFill) progressFill.style.width = `${percent}%`;
    if (progressPercent) progressPercent.textContent = `${Math.round(percent)}%`;
    if (progressStatus) progressStatus.textContent = status;

    if (step) {
      const stepEl = document.getElementById(`step-${step}`);
      if (stepEl) {
        stepEl.classList.add('active');
      }
    }
  },

  getFiles() {
    console.log('[Upload] getFiles called, state.files:', this.state.files.map(f => ({name: f.name, hasFile: f._file instanceof File, fileType: typeof f._file})));
    const files = this.state.files.map(f => f._file).filter(f => f instanceof File);
    console.log('[Upload] getFiles returning:', files.length, 'files');
    return files;
  },

  getProjectName() {
    return this.state.projectName;
  },
};
