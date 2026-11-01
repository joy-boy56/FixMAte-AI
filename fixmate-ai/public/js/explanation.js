/**
 * Explanation Module
 * Renders and manages the explanation panel
 */

const Explanation = {
  state: {
    currentDiagnostic: null,
    currentExplanation: null,
    files: [],
  },

  init() {
    this.cacheElements();
  },

  cacheElements() {
    this.elements = {
      empty: document.getElementById('explanation-empty'),
      loading: document.getElementById('explanation-loading'),
      content: document.getElementById('explanation-content'),
      copyBtn: document.getElementById('copy-explanation-btn'),
    };
  },

  show(diagnostic, files) {
    this.state.currentDiagnostic = diagnostic;
    this.state.files = files;
    this.state.currentExplanation = diagnostic.aiExplanation;
    
    this.elements.empty.classList.add('hidden');
    this.elements.content.classList.add('hidden');
    this.elements.copyBtn.classList.add('hidden');
    
    if (diagnostic.aiExplanation) {
      this.renderExplanation(diagnostic.aiExplanation);
      this.elements.content.classList.remove('hidden');
      this.elements.copyBtn.classList.remove('hidden');
    } else {
      this.fetchExplanation(diagnostic);
    }
  },

  async fetchExplanation(diagnostic) {
    this.elements.loading.classList.remove('hidden');
    
    try {
      const response = await fetch('/api/explain/single', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          diagnosticId: diagnostic.id,
          diagnostics: [diagnostic],
          files: this.state.files,
          projectContext: {
            totalFiles: this.state.files.length,
            languages: [...new Set(this.state.files.map(f => f.language).filter(l => l !== 'Unknown'))],
            totalDiagnostics: this.state.files.reduce((sum, f) => sum + (f.diagnostics?.length || 0), 0),
          },
        }),
      });
      
      const result = await response.json();
      
      this.elements.loading.classList.add('hidden');
      
      if (result.success && result.data?.success) {
        diagnostic.aiExplanation = result.data.explanation;
        this.state.currentExplanation = result.data.explanation;
        this.renderExplanation(result.data.explanation);
        this.elements.content.classList.remove('hidden');
        this.elements.copyBtn.classList.remove('hidden');
      } else {
        this.showError(result.data?.error || 'Failed to generate explanation');
      }
    } catch (err) {
      this.elements.loading.classList.add('hidden');
      this.showError(err.message);
    }
  },

  renderExplanation(explanation) {
    this.elements.content.innerHTML = `
      <div class="explanation-section">
        <div class="section-label">What Happened</div>
        <div class="section-content">${this.escapeHtml(explanation.whatHappened)}</div>
      </div>
      <div class="explanation-section">
        <div class="section-label">Where</div>
        <div class="section-content">${this.escapeHtml(explanation.where)}</div>
      </div>
      <div class="explanation-section">
        <div class="section-label">Why</div>
        <div class="section-content">${this.escapeHtml(explanation.why)}</div>
      </div>
      <div class="explanation-section">
        <div class="section-label">Likely Mistake</div>
        <div class="section-content">${this.escapeHtml(explanation.likelyMistake)}</div>
      </div>
      ${explanation.recommendedFix?.code ? `
      <div class="explanation-section">
        <div class="section-label">Recommended Fix</div>
        <div class="fix-block">
          <div class="fix-label">Corrected Code</div>
          <div class="fix-code">${this.escapeHtml(explanation.recommendedFix.code)}</div>
          <div class="section-content" style="margin-top: 8px; font-size: 0.8rem;">${this.escapeHtml(explanation.recommendedFix.explanation)}</div>
        </div>
      </div>
      ` : ''}
      <div class="explanation-section">
        <div class="section-label">Programming Concept</div>
        <div class="section-content">${this.escapeHtml(explanation.concept)}</div>
      </div>
      <div class="explanation-section">
        <div class="section-label">Verification</div>
        <div class="section-content">${this.escapeHtml(explanation.verification)}</div>
      </div>
      <div class="explanation-section">
        <div class="section-label">Prevention</div>
        <div class="section-content">${this.escapeHtml(explanation.prevention)}</div>
      </div>
      ${explanation.notes ? `
      <div class="explanation-section">
        <div class="section-label">Notes</div>
        <div class="section-content" style="color: var(--warning-amber);">${this.escapeHtml(explanation.notes)}</div>
      </div>
      ` : ''}
    `;
    
    this.elements.content.classList.remove('hidden');
    this.elements.copyBtn.classList.remove('hidden');
    
    // Bind copy button
    this.elements.copyBtn.onclick = () => this.copyExplanation();
  },

  showError(message) {
    this.elements.content.innerHTML = `
      <div class="explanation-section">
        <div class="section-label">Error</div>
        <div class="section-content" style="color: var(--error-red);">${this.escapeHtml(message)}</div>
      </div>
    `;
    this.elements.content.classList.remove('hidden');
  },

  copyExplanation() {
    if (!this.state.currentExplanation) return;
    
    const exp = this.state.currentExplanation;
    const text = `FixMate - Explanation
=======================

What Happened: ${exp.whatHappened}
Where: ${exp.where}
Why: ${exp.why}
Likely Mistake: ${exp.likelyMistake}
${exp.recommendedFix?.code ? `Recommended Fix:\n${exp.recommendedFix.code}\n\nWhy this works: ${exp.recommendedFix.explanation}` : ''}
Concept: ${exp.concept}
Verification: ${exp.verification}
Prevention: ${exp.prevention}
${exp.notes ? `Notes: ${exp.notes}` : ''}
`;

    navigator.clipboard.writeText(text).then(() => {
      App.showToast('Explanation copied to clipboard');
    }).catch(() => {
      App.showToast('Failed to copy', true);
    });
  },

  clear() {
    this.state.currentDiagnostic = null;
    this.state.currentExplanation = null;
    this.state.files = [];
    this.elements.empty.classList.remove('hidden');
    this.elements.loading.classList.add('hidden');
    this.elements.content.classList.add('hidden');
    this.elements.copyBtn.classList.add('hidden');
  },

  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  },
};