// FixMate AI - Results Renderer

const Renderer = {
  // Render the complete diagnosis results
  render(diagnosis) {
    this.hideAllStates();
    this.showResultsActions();
    this.renderErrorOverview(diagnosis);
    this.renderPossibleCauses(diagnosis);
    this.renderRecommendedFix(diagnosis);
    this.renderCodeComparison(diagnosis);
    this.renderUnderstanding(diagnosis);
    this.renderAlternatives(diagnosis);
    this.renderVerification(diagnosis);
    this.renderPrevention(diagnosis);
    this.showElement('results-content');
  },

  // Show loading state with step progression
  showLoading(stepIndex = 0) {
    this.hideAllStates();
    this.showElement('loading-state');
    this.hideElement('results-actions');
    
    const steps = [
      { id: 'step-1', text: 'Analyzing your code...' },
      { id: 'step-2', text: 'Inspecting possible root causes...' },
      { id: 'step-3', text: 'Preparing recommended fixes...' }
    ];

    const container = document.getElementById('loading-steps');
    container.innerHTML = steps.map((step, i) => `
      <div class="loading-step ${i === stepIndex ? 'active' : (i < stepIndex ? 'done' : '')}" id="${step.id}">
        ${step.text}
      </div>
    `).join('');

    document.getElementById('loading-text').textContent = steps[stepIndex]?.text || 'Analyzing...';
  },

  // Update loading step
  updateLoadingStep(stepIndex) {
    const steps = document.querySelectorAll('.loading-step');
    steps.forEach((step, i) => {
      step.classList.remove('active', 'done');
      if (i < stepIndex) step.classList.add('done');
      else if (i === stepIndex) step.classList.add('active');
    });
    
    const stepTexts = [
      'Analyzing your code...',
      'Inspecting possible root causes...',
      'Preparing recommended fixes...'
    ];
    document.getElementById('loading-text').textContent = stepTexts[stepIndex] || 'Analyzing...';
  },

  // Show error state
  showError(message) {
    this.hideAllStates();
    this.hideElement('results-actions');
    document.getElementById('error-message').textContent = message;
    this.showElement('error-state');
  },

  // Show empty state
  showEmpty() {
    this.hideAllStates();
    this.hideElement('results-actions');
    this.showElement('empty-state');
  },

  // Hide all result states
  hideAllStates() {
    this.hideElement('empty-state');
    this.hideElement('loading-state');
    this.hideElement('results-content');
    this.hideElement('error-state');
  },

  showElement(id) {
    document.getElementById(id)?.classList.remove('hidden');
  },

  hideElement(id) {
    document.getElementById(id)?.classList.add('hidden');
  },

  showResultsActions() {
    document.getElementById('results-actions')?.classList.remove('hidden');
  },

  // Render Error Overview
  renderErrorOverview(diagnosis) {
    const setText = (id, value) => {
      const el = document.getElementById(id);
      if (el) el.textContent = value || '—';
    };

    setText('error-name', diagnosis.error_name);
    setText('error-category', diagnosis.error_category);
    setText('error-severity', diagnosis.severity);
    setText('error-confidence', diagnosis.confidence);
    setText('error-summary', diagnosis.summary);

    // Add severity/confidence classes
    const severityEl = document.getElementById('error-severity');
    if (severityEl && diagnosis.severity) {
      severityEl.className = 'overview-value severity-' + diagnosis.severity.toLowerCase();
    }

    const confidenceEl = document.getElementById('error-confidence');
    if (confidenceEl && diagnosis.confidence) {
      confidenceEl.className = 'overview-value confidence-' + diagnosis.confidence.toLowerCase();
    }
  },

  // Render Possible Causes
  renderPossibleCauses(diagnosis) {
    const container = document.getElementById('possible-causes');
    if (!container) return;

    if (!diagnosis.possible_causes || diagnosis.possible_causes.length === 0) {
      container.innerHTML = '<p style="color: var(--text-muted); font-size: 0.875rem;">No specific causes identified.</p>';
      return;
    }

    container.innerHTML = diagnosis.possible_causes.map(cause => `
      <div class="cause-card likelihood-${cause.likelihood?.toLowerCase() || 'medium'}">
        <div class="cause-header">
          <span class="cause-title">${this.escapeHtml(cause.cause)}</span>
          <span class="likelihood-badge likelihood-${cause.likelihood?.toLowerCase() || 'medium'}">${cause.likelihood || 'Medium'}</span>
        </div>
        <div class="cause-evidence"><strong>Evidence:</strong> ${this.escapeHtml(cause.evidence)}</div>
        <div class="cause-verification"><strong>Verification:</strong> ${this.escapeHtml(cause.verification)}</div>
      </div>
    `).join('');
  },

  // Render Recommended Fix
  renderRecommendedFix(diagnosis) {
    const explanationEl = document.getElementById('fix-explanation');
    const codeEl = document.getElementById('corrected-code');
    const codeDisplayEl = document.getElementById('corrected-code-display');

    if (explanationEl) {
      explanationEl.innerHTML = this.formatText(diagnosis.recommended_fix?.explanation || 'No explanation provided.');
    }

    const correctedCode = diagnosis.recommended_fix?.corrected_code || '';
    if (codeEl) {
      codeEl.textContent = correctedCode;
    }
    if (codeDisplayEl) {
      codeDisplayEl.textContent = correctedCode;
    }
  },

  // Render Code Comparison
  renderCodeComparison(diagnosis) {
    const originalEl = document.getElementById('original-code-display');
    const correctedEl = document.getElementById('corrected-code-display');

    // We need the original code from the form - we'll store it globally
    if (window.lastSubmittedCode) {
      if (originalEl) originalEl.textContent = window.lastSubmittedCode;
    }

    const correctedCode = diagnosis.recommended_fix?.corrected_code || '';
    if (correctedEl) correctedEl.textContent = correctedCode;
  },

  // Render Understanding the Error
  renderUnderstanding(diagnosis) {
    const container = document.getElementById('understanding-content');
    if (!container) return;

    container.innerHTML = this.formatText(diagnosis.explanation || 'No detailed explanation available.');
  },

  // Render Alternative Solutions
  renderAlternatives(diagnosis) {
    const container = document.getElementById('alternatives');
    if (!container) return;

    if (!diagnosis.alternative_fixes || diagnosis.alternative_fixes.length === 0) {
      container.innerHTML = '<p style="color: var(--text-muted); font-size: 0.875rem;">No alternative solutions provided.</p>';
      return;
    }

    container.innerHTML = diagnosis.alternative_fixes.map(alt => `
      <div class="alternative-item">
        <div class="alternative-solution">${this.escapeHtml(alt.solution)}</div>
        <div class="alternative-tradeoff"><strong>Trade-off:</strong> ${this.escapeHtml(alt.tradeoff)}</div>
      </div>
    `).join('');
  },

  // Render Verification Steps
  renderVerification(diagnosis) {
    const container = document.getElementById('verification');
    if (!container) return;

    if (!diagnosis.verification_steps || diagnosis.verification_steps.length === 0) {
      container.innerHTML = '<p style="color: var(--text-muted); font-size: 0.875rem;">No verification steps provided.</p>';
      return;
    }

    container.innerHTML = diagnosis.verification_steps.map((step, i) => `
      <div class="verification-item">
        <span class="verification-number">${i + 1}</span>
        <div class="verification-content">
          <div class="verification-step">${this.escapeHtml(step.step)}</div>
          <div class="verification-result">${this.escapeHtml(step.expected_result)}</div>
        </div>
      </div>
    `).join('');
  },

  // Render Prevention Tips
  renderPrevention(diagnosis) {
    const container = document.getElementById('prevention-tips');
    if (!container) return;

    if (!diagnosis.prevention_tips || diagnosis.prevention_tips.length === 0) {
      container.innerHTML = '<li style="color: var(--text-muted);">No prevention tips available.</li>';
      return;
    }

    container.innerHTML = diagnosis.prevention_tips.map(tip => `
      <li>${this.escapeHtml(tip)}</li>
    `).join('');
  },

  // Utility: Escape HTML to prevent XSS
  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  },

  // Utility: Format text with basic markdown-like formatting
  formatText(text) {
    if (!text) return '';
    return this.escapeHtml(text)
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/`(.*?)`/g, '<code style="background: var(--bg-code); padding: 0.1em 0.3em; border-radius: 3px; font-family: var(--font-mono); font-size: 0.9em;">$1</code>')
      .replace(/\n\n/g, '</p><p>')
      .replace(/\n/g, '<br>')
      .replace(/^/, '<p>')
      .replace(/$/, '</p>');
  }
};

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { Renderer };
}