// FixMate AI - Main Application

const App = {
  // State
  state: {
    isLoading: false,
    lastDiagnosis: null
  },

  // DOM Elements
  elements: {},

  // Initialize the application
  init() {
    this.cacheElements();
    this.bindEvents();
    this.setupExamples();
    this.validateForm();
    Renderer.showEmpty();
    console.log('FixMate AI initialized');
  },

  // Cache DOM elements
  cacheElements() {
    this.elements = {
      form: document.getElementById('diagnose-form'),
      diagnoseBtn: document.getElementById('diagnose-btn'),
      clearBtn: document.getElementById('clear-btn'),
      exampleBtn: document.getElementById('example-btn'),
      codeInput: document.getElementById('code'),
      errorInput: document.getElementById('error'),
      languageSelect: document.getElementById('language'),
      exampleModal: document.getElementById('example-modal'),
      exampleList: document.getElementById('example-list'),
      modalClose: document.querySelector('.modal-close'),
      copyDiagnosisBtn: document.getElementById('copy-diagnosis-btn'),
      copyCodeBtn: document.getElementById('copy-code-btn'),
      newAnalysisBtn: document.getElementById('new-analysis-btn'),
      regenerateBtn: document.getElementById('regenerate-btn'),
      retryBtn: document.getElementById('retry-btn'),
      modalOverlay: document.querySelector('.modal-overlay')
    };
  },

  // Bind event listeners
  bindEvents() {
    // Form submission
    this.elements.form.addEventListener('submit', (e) => this.handleSubmit(e));

    // Clear form
    this.elements.clearBtn.addEventListener('click', () => this.clearForm());

    // Example modal
    this.elements.exampleBtn.addEventListener('click', () => this.openExampleModal());
    this.elements.modalClose.addEventListener('click', () => this.closeExampleModal());
    this.elements.modalOverlay.addEventListener('click', () => this.closeExampleModal());

    // Result actions
    this.elements.copyDiagnosisBtn.addEventListener('click', () => this.copyDiagnosis());
    this.elements.copyCodeBtn.addEventListener('click', () => this.copyCorrectedCode());
    this.elements.newAnalysisBtn.addEventListener('click', () => this.newAnalysis());
    this.elements.regenerateBtn.addEventListener('click', () => this.regenerateDiagnosis());
    this.elements.retryBtn.addEventListener('click', () => this.regenerateDiagnosis());

    // Input validation on change
    this.elements.codeInput.addEventListener('input', () => this.validateForm());
    this.elements.errorInput.addEventListener('input', () => this.validateForm());
    this.elements.languageSelect.addEventListener('change', () => this.validateForm());

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => this.handleKeyboard(e));
  },

  // Setup example items in modal
  setupExamples() {
    if (!this.elements.exampleList) return;

    this.elements.exampleList.innerHTML = EXAMPLES.map(example => `
      <div class="example-item" data-example-id="${example.id}">
        <div class="example-item-header">
          <span class="example-title">${example.title}</span>
          <span class="example-language">${example.language}</span>
        </div>
        <div class="example-description">${example.description}</div>
      </div>
    `).join('');

    // Add click handlers
    this.elements.exampleList.querySelectorAll('.example-item').forEach(item => {
      item.addEventListener('click', () => this.loadExample(item.dataset.exampleId));
    });
  },

  // Validate form and enable/disable submit button
  validateForm() {
    const language = this.elements.languageSelect.value;
    const code = this.elements.codeInput.value.trim();
    const error = this.elements.errorInput.value.trim();

    const isValid = language && code.length >= 10 && error.length >= 5;
    this.elements.diagnoseBtn.disabled = !isValid;
  },

  // Handle form submission
  async handleSubmit(e) {
    e.preventDefault();

    if (this.state.isLoading) return;

    const formData = new FormData(this.elements.form);
    const payload = {
      language: formData.get('language'),
      runtime: formData.get('runtime') || '',
      code: formData.get('code'),
      error: formData.get('error'),
      expected: formData.get('expected') || '',
      actual: formData.get('actual') || '',
      mode: formData.get('mode') || 'beginner'
    };

    // Store original code for comparison
    window.lastSubmittedCode = payload.code;

    this.setLoading(true);
    Renderer.showLoading(0);

    try {
      // Simulate loading steps
      await this.delay(800);
      Renderer.updateLoadingStep(1);
      await this.delay(1000);
      Renderer.updateLoadingStep(2);
      await this.delay(800);

      const response = await fetch('/api/diagnose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Diagnosis failed');
      }

      if (!result.success) {
        throw new Error(result.error || 'Diagnosis failed');
      }

      this.state.lastDiagnosis = result.data;
      Renderer.render(result.data);

    } catch (err) {
      console.error('Diagnosis error:', err);
      Renderer.showError(err.message || 'An unexpected error occurred. Please try again.');
    } finally {
      this.setLoading(false);
    }
  },

  // Set loading state
  setLoading(loading) {
    this.state.isLoading = loading;
    this.elements.diagnoseBtn.disabled = loading || !this.validateFormSilent();
    this.elements.diagnoseBtn.innerHTML = loading
      ? '<span class="loading-spinner" style="width:16px;height:16px;border-width:2px;"></span><span>Analyzing...</span>'
      : '<svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg><span>Diagnose Error</span>';
  },

  // Validate without UI update
  validateFormSilent() {
    const language = this.elements.languageSelect.value;
    const code = this.elements.codeInput.value.trim();
    const error = this.elements.errorInput.value.trim();
    return language && code.length >= 10 && error.length >= 5;
  },

  // Clear form
  clearForm() {
    this.elements.form.reset();
    this.validateForm();
    window.lastSubmittedCode = null;
    this.state.lastDiagnosis = null;
    Renderer.showEmpty();
    this.elements.codeInput.focus();
  },

  // New analysis - clear and ready for new input
  newAnalysis() {
    this.clearForm();
  },

  // Regenerate diagnosis with same input
  async regenerateDiagnosis() {
    if (!this.state.lastDiagnosis) return;
    
    // Re-submit the form programmatically
    const formData = new FormData(this.elements.form);
    const payload = {
      language: formData.get('language'),
      runtime: formData.get('runtime') || '',
      code: formData.get('code'),
      error: formData.get('error'),
      expected: formData.get('expected') || '',
      actual: formData.get('actual') || '',
      mode: formData.get('mode') || 'beginner'
    };

    window.lastSubmittedCode = payload.code;
    this.setLoading(true);
    Renderer.showLoading(0);

    try {
      await this.delay(800);
      Renderer.updateLoadingStep(1);
      await this.delay(1000);
      Renderer.updateLoadingStep(2);
      await this.delay(800);

      const response = await fetch('/api/diagnose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Regeneration failed');
      }

      this.state.lastDiagnosis = result.data;
      Renderer.render(result.data);

    } catch (err) {
      console.error('Regeneration error:', err);
      Renderer.showError(err.message || 'Failed to regenerate diagnosis. Please try again.');
    } finally {
      this.setLoading(false);
    }
  },

  // Open example modal
  openExampleModal() {
    this.elements.exampleModal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  },

  // Close example modal
  closeExampleModal() {
    this.elements.exampleModal.classList.add('hidden');
    document.body.style.overflow = '';
  },

  // Load example into form
  loadExample(exampleId) {
    const example = EXAMPLES.find(e => e.id === exampleId);
    if (!example) return;

    this.elements.languageSelect.value = example.language;
    document.getElementById('runtime').value = example.runtime || '';
    this.elements.codeInput.value = example.code;
    this.elements.errorInput.value = example.error;
    document.getElementById('expected').value = example.expected || '';
    document.getElementById('actual').value = example.actual || '';

    // Set mode
    const modeRadio = document.querySelector(`input[name="mode"][value="${example.mode}"]`);
    if (modeRadio) modeRadio.checked = true;

    this.validateForm();
    this.closeExampleModal();
    this.elements.codeInput.focus();
  },

  // Copy full diagnosis to clipboard
  async copyDiagnosis() {
    if (!this.state.lastDiagnosis) return;

    const diagnosis = this.state.lastDiagnosis;
    const text = this.formatDiagnosisForCopy(diagnosis);

    try {
      await navigator.clipboard.writeText(text);
      this.showToast('Diagnosis copied to clipboard');
    } catch (err) {
      this.fallbackCopy(text);
    }
  },

  // Copy corrected code to clipboard
  async copyCorrectedCode() {
    if (!this.state.lastDiagnosis?.recommended_fix?.corrected_code) return;

    const code = this.state.lastDiagnosis.recommended_fix.corrected_code;

    try {
      await navigator.clipboard.writeText(code);
      this.showToast('Corrected code copied to clipboard');
    } catch (err) {
      this.fallbackCopy(code);
    }
  },

  // Format diagnosis for copying
  formatDiagnosisForCopy(diagnosis) {
    let text = `FixMate AI - Diagnosis Report\n`;
    text += `================================\n\n`;
    text += `Error: ${diagnosis.error_name || 'Unknown'}\n`;
    text += `Category: ${diagnosis.error_category || 'Unknown'}\n`;
    text += `Severity: ${diagnosis.severity || 'Unknown'}\n`;
    text += `Confidence: ${diagnosis.confidence || 'Unknown'}\n\n`;
    text += `Summary: ${diagnosis.summary}\n\n`;

    if (diagnosis.possible_causes?.length) {
      text += `Possible Causes:\n`;
      diagnosis.possible_causes.forEach((cause, i) => {
        text += `  ${i + 1}. ${cause.cause} (${cause.likelihood})\n`;
        text += `     Evidence: ${cause.evidence}\n`;
        text += `     Verification: ${cause.verification}\n`;
      });
      text += '\n';
    }

    if (diagnosis.recommended_fix) {
      text += `Recommended Fix:\n`;
      text += `${diagnosis.recommended_fix.explanation}\n\n`;
      text += `Corrected Code:\n${diagnosis.recommended_fix.corrected_code}\n\n`;
    }

    if (diagnosis.explanation) {
      text += `Understanding:\n${diagnosis.explanation}\n\n`;
    }

    if (diagnosis.alternative_fixes?.length) {
      text += `Alternative Solutions:\n`;
      diagnosis.alternative_fixes.forEach((alt, i) => {
        text += `  ${i + 1}. ${alt.solution}\n     Trade-off: ${alt.tradeoff}\n`;
      });
      text += '\n';
    }

    if (diagnosis.verification_steps?.length) {
      text += `Verification Steps:\n`;
      diagnosis.verification_steps.forEach((step, i) => {
        text += `  ${i + 1}. ${step.step}\n     Expected: ${step.expected_result}\n`;
      });
      text += '\n';
    }

    if (diagnosis.prevention_tips?.length) {
      text += `Prevention Tips:\n`;
      diagnosis.prevention_tips.forEach(tip => {
        text += `  - ${tip}\n`;
      });
    }

    return text;
  },

  // Fallback copy for older browsers
  fallbackCopy(text) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    try {
      document.execCommand('copy');
      this.showToast('Copied to clipboard');
    } catch (e) {
      this.showToast('Failed to copy', true);
    }
    document.body.removeChild(textarea);
  },

  // Show toast notification
  showToast(message, isError = false) {
    // Remove existing toast
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = `toast ${isError ? 'toast-error' : ''}`;
    toast.style.cssText = `
      position: fixed;
      bottom: 24px;
      right: 24px;
      padding: 12px 20px;
      background: ${isError ? 'var(--error-red)' : 'var(--accent-green)'};
      color: ${isError ? 'white' : 'var(--bg-primary)'};
      border-radius: var(--radius-sm);
      font-size: 0.875rem;
      font-weight: 500;
      z-index: 1000;
      animation: slideIn 0.3s ease;
      box-shadow: var(--shadow-lg);
    `;
    toast.textContent = message;

    // Add animation styles if not present
    if (!document.getElementById('toast-styles')) {
      const style = document.createElement('style');
      style.id = 'toast-styles';
      style.textContent = `
        @keyframes slideIn {
          from { transform: translateX(100px); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        @keyframes slideOut {
          from { transform: translateX(0); opacity: 1; }
          to { transform: translateX(100px); opacity: 0; }
        }
      `;
      document.head.appendChild(style);
    }

    document.body.appendChild(toast);

    setTimeout(() => {
      toast.style.animation = 'slideOut 0.3s ease forwards';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  },

  // Handle keyboard shortcuts
  handleKeyboard(e) {
    // Ctrl/Cmd + Enter to submit
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      if (!this.state.isLoading && this.validateFormSilent()) {
        this.elements.form.dispatchEvent(new Event('submit'));
      }
    }

    // Escape to close modal
    if (e.key === 'Escape') {
      this.closeExampleModal();
    }
  },

  // Utility delay
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
};

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => App.init());