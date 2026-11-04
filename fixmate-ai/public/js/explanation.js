/**
 * Explanation Module (Chat Panel)
 * Renders and manages the AI chat panel on the right side.
 * Shows scan results as chat messages and handles user chat input.
 */

const Explanation = {
  state: {
    currentDiagnostic: null,
    currentExplanation: null,
    files: [],
  },

  init() {
    this.cacheElements();
    this.bindChatEvents();
  },

  cacheElements() {
    this.elements = {
      chatMessages: document.getElementById('chat-messages'),
      chatInput: document.getElementById('chat-input'),
      chatSendBtn: document.getElementById('chat-send-btn'),
      chatInputArea: document.getElementById('chat-input-area'),
      chatEmptyHint: document.getElementById('chat-empty-hint'),
      clearChatBtn: document.getElementById('clear-chat-btn'),
      copyCodeBtn: document.getElementById('copy-code-btn'),
    };
  },

  bindChatEvents() {
    // Send button
    if (this.elements.chatSendBtn) {
      this.elements.chatSendBtn.addEventListener('click', () => this.handleSendMessage());
    }

    // Chat input - Enter to send, Shift+Enter for newline
    if (this.elements.chatInput) {
      this.elements.chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          this.handleSendMessage();
        }
        // Auto-resize textarea
        this.elements.chatInput.style.height = 'auto';
        this.elements.chatInput.style.height = this.elements.chatInput.scrollHeight + 'px';
      });
    }

    // Clear chat
    if (this.elements.clearChatBtn) {
      this.elements.clearChatBtn.addEventListener('click', () => this.clearChat());
    }

    // Copy code button
    if (this.elements.copyCodeBtn) {
      this.elements.copyCodeBtn.addEventListener('click', () => this.copyCurrentCode());
    }
  },

  showScanResult(diagnostics, files, generalAnalysis = null) {
    this.state.files = files;

    // Enable chat input area
    if (this.elements.chatInputArea) {
      this.elements.chatInputArea.classList.remove('hidden');
    }
    if (this.elements.chatEmptyHint) {
      this.elements.chatEmptyHint.classList.add('hidden');
    }

    // Clear existing messages
    if (this.elements.chatMessages) {
      this.elements.chatMessages.innerHTML = '';
    }

    // Show General Analysis in AI Assistant (NOT individual errors)
    if (generalAnalysis) {
      this.addGeneralAnalysisMessage(generalAnalysis);
    } else {
      // Fallback: simple scan summary if no general analysis
      this.addScanSummaryMessage(diagnostics, files);
    }

    // Scroll to bottom
    this.scrollToBottom();
  },

  addScanSummaryMessage(diagnostics, files) {
    const errorCount = diagnostics.filter(d => d.type === 'error').length;
    const warningCount = diagnostics.filter(d => d.type === 'warning').length;

    let content = `Scan complete. Found ${diagnostics.length} issue${diagnostics.length !== 1 ? 's' : ''}`;
    if (errorCount > 0) content += ` (${errorCount} error${errorCount !== 1 ? 's' : ''}`;
    if (warningCount > 0) content += errorCount > 0 ? `, ${warningCount} warning${warningCount !== 1 ? 's' : ''}` : ` (${warningCount} warning${warningCount !== 1 ? 's' : ''}`;
    if (errorCount > 0 || warningCount > 0) content += `).`;
    content += ` Click on any file in the explorer to view it, or select a diagnostic below to see the AI explanation.`;

    this.addAIMessage(content, { diagnostics: diagnostics.slice(0, 5) });
  },

  addGeneralAnalysisMessage(generalAnalysis) {
    console.log('[Explanation] addGeneralAnalysisMessage called with:', generalAnalysis);
    console.log('[Explanation] generalAnalysis type:', typeof generalAnalysis, Array.isArray(generalAnalysis));
    console.log('[Explanation] generalAnalysis keys:', generalAnalysis ? Object.keys(generalAnalysis) : 'null/undefined');

    const messageEl = document.createElement('div');
    messageEl.className = 'chat-message ai-message general-analysis-message';

    let content = `<div class="message-section">
      <div class="section-label" style="font-size: 0.7rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--accent); margin-bottom: var(--space-2);">General Analysis</div>
      <div class="section-content" style="font-size: 0.875rem; color: var(--text-secondary); line-height: 1.7; margin-bottom: var(--space-4);">
        ${this.escapeHtml(generalAnalysis.summary || 'No summary available')}
      </div>
    </div>`;

    if (generalAnalysis.patterns && generalAnalysis.patterns.length > 0) {
      content += `<div class="message-section">
        <div class="section-label" style="font-size: 0.7rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); margin-bottom: var(--space-2);">Patterns Detected</div>
        <div style="display: flex; flex-direction: column; gap: var(--space-2);">
          ${generalAnalysis.patterns.map(p => `
            <div style="background: var(--bg-input); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: var(--space-3);">
              <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--space-1);">
                <span style="font-weight: 500; color: var(--text);">${this.escapeHtml(p.pattern)}</span>
                <span style="font-size: 0.65rem; font-weight: 600; text-transform: uppercase; padding: 2px 6px; border-radius: var(--radius-sm); background: ${p.severity === 'high' ? 'var(--error-dim)' : p.severity === 'medium' ? 'var(--warning-dim)' : 'var(--accent-dim)'}; color: ${p.severity === 'high' ? 'var(--error)' : p.severity === 'medium' ? 'var(--warning)' : 'var(--accent)'}">${p.severity}</span>
              </div>
              <div style="font-size: 0.8rem; color: var(--text-secondary); margin-bottom: var(--space-2);">${this.escapeHtml(p.description)}</div>
              <div style="font-size: 0.7rem; color: var(--text-muted); font-family: var(--font-mono);">Affected: ${p.affectedFiles?.join(', ') || 'N/A'}</div>
            </div>
          `).join('')}
        </div>
      </div>`;
    }

    if (generalAnalysis.priorities && generalAnalysis.priorities.length > 0) {
      content += `<div class="message-section">
        <div class="section-label" style="font-size: 0.7rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); margin-bottom: var(--space-2);">Priority Fixes</div>
        <div style="display: flex; flex-direction: column; gap: var(--space-2);">
          ${generalAnalysis.priorities.slice(0, 5).map(p => `
            <div style="background: var(--bg-input); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: var(--space-3); cursor: pointer;" data-file="${this.escapeHtml(p.file)}" data-line="${p.line}" data-diagnostic="${this.escapeHtml(p.diagnostic)}">
              <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--space-1);">
                <span style="font-weight: 500; color: var(--text); font-family: var(--font-mono); font-size: 0.8rem;">${this.escapeHtml(p.file)}:${p.line}</span>
                <span style="font-size: 0.65rem; font-weight: 600; text-transform: uppercase; padding: 2px 6px; border-radius: var(--radius-sm); background: ${p.priority === 'critical' ? 'var(--error-dim)' : p.priority === 'high' ? 'var(--warning-dim)' : 'var(--accent-dim)'}; color: ${p.priority === 'critical' ? 'var(--error)' : p.priority === 'high' ? 'var(--warning)' : 'var(--accent)'}">${p.priority}</span>
              </div>
              <div style="font-size: 0.8rem; color: var(--text-secondary); margin-bottom: var(--space-1);">${this.escapeHtml(p.diagnostic)}</div>
              <div style="font-size: 0.7rem; color: var(--text-muted);">${this.escapeHtml(p.reason)}</div>
            </div>
          `).join('')}
        </div>
      </div>`;
    }

    if (generalAnalysis.quickWins && generalAnalysis.quickWins.length > 0) {
      content += `<div class="message-section">
        <div class="section-label" style="font-size: 0.7rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--success); margin-bottom: var(--space-2);">Quick Wins</div>
        <div style="display: flex; flex-direction: column; gap: var(--space-2);">
          ${generalAnalysis.quickWins.slice(0, 5).map(qw => `
            <div style="background: var(--success-dim); border: 1px solid var(--success); border-radius: var(--radius-sm); padding: var(--space-3);">
              <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--space-1);">
                <span style="font-weight: 500; color: var(--text); font-family: var(--font-mono); font-size: 0.8rem;">${this.escapeHtml(qw.file)}:${qw.line}</span>
                <span style="font-size: 0.65rem; font-weight: 600; text-transform: uppercase; padding: 2px 6px; border-radius: var(--radius-sm); background: ${qw.effort === 'high' ? 'var(--warning-dim)' : 'var(--success-dim)'}; color: ${qw.effort === 'high' ? 'var(--warning)' : 'var(--success)'}">${qw.effort}</span>
              </div>
              <div style="font-size: 0.8rem; color: var(--text-secondary);">${this.escapeHtml(qw.fix)}</div>
            </div>
          `).join('')}
        </div>
      </div>`;
    }

    if (generalAnalysis.normalFixes && generalAnalysis.normalFixes.length > 0) {
      content += `<div class="message-section">
        <div class="section-label" style="font-size: 0.7rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--accent); margin-bottom: var(--space-2);">Normal Fixes</div>
        <div style="display: flex; flex-direction: column; gap: var(--space-2);">
          ${generalAnalysis.normalFixes.slice(0, 5).map(nf => `
            <div style="background: var(--bg-input); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: var(--space-3); cursor: pointer;" data-file="${this.escapeHtml(nf.file)}" data-line="${nf.line}" data-diagnostic="${this.escapeHtml(nf.issue)}">
              <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--space-1);">
                <span style="font-weight: 500; color: var(--text); font-family: var(--font-mono); font-size: 0.8rem;">${this.escapeHtml(nf.file)}:${nf.line}</span>
                <span style="font-size: 0.65rem; font-weight: 600; text-transform: uppercase; padding: 2px 6px; border-radius: var(--radius-sm); background: ${nf.effort === 'high' ? 'var(--warning-dim)' : nf.effort === 'medium' ? 'var(--accent-dim)' : 'var(--success-dim)'}; color: ${nf.effort === 'high' ? 'var(--warning)' : nf.effort === 'medium' ? 'var(--accent)' : 'var(--success)'}">${nf.effort}</span>
              </div>
              <div style="font-size: 0.8rem; color: var(--text-secondary); margin-bottom: var(--space-1);">${this.escapeHtml(nf.fix)}</div>
              <div style="font-size: 0.7rem; color: var(--text-muted);">${this.escapeHtml(nf.explanation || '')}</div>
            </div>
          `).join('')}
        </div>
      </div>`;
    }

    messageEl.innerHTML = `
      <div class="message-avatar">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"></circle>
          <path d="M12 6v6l4 2"></path>
        </svg>
      </div>
      <div class="message-content">
        ${content}
      </div>
    `;

    // Add click handlers for priority items
    messageEl.querySelectorAll('[data-file][data-line]').forEach(el => {
      el.addEventListener('click', () => {
        const file = el.dataset.file;
        const line = parseInt(el.dataset.line, 10);
        const diagnosticCode = el.dataset.diagnostic;
        // Find the diagnostic and show explanation
        const diag = this.state.files.flatMap(f => f.diagnostics || []).find(d => d.file === file && d.line === line && d.code === diagnosticCode);
        if (diag) {
          this.showDiagnosticExplanation(diag);
        } else {
          // Navigate to file and line
          App.showFileInEditor(file, line);
        }
      });
    });

    if (this.elements.chatMessages) {
      this.elements.chatMessages.appendChild(messageEl);
      this.scrollToBottom();
    }
  },

  addDiagnosticMessage(diagnostic) {
    const messageEl = document.createElement('div');
    messageEl.className = 'chat-message diagnostic-message';
    messageEl.dataset.diagnosticId = diagnostic.id;

    const severityColor = diagnostic.type === 'error' ? 'var(--error)' : diagnostic.type === 'warning' ? 'var(--warning)' : 'var(--accent)';

    messageEl.innerHTML = `
      <div class="message-avatar">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"></circle>
          <path d="M12 6v6l4 2"></path>
        </svg>
      </div>
      <div class="message-content">
        <div class="message-header" style="display: flex; align-items: center; gap: var(--space-2); margin-bottom: var(--space-2);">
          <span style="font-size: 0.7rem; font-weight: 600; text-transform: uppercase; color: ${severityColor};">
            ${diagnostic.type}
          </span>
          <span style="font-size: 0.7rem; color: var(--text-muted);">${diagnostic.code}</span>
        </div>
        <div class="message-text" style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: var(--space-2);">
          ${this.escapeHtml(diagnostic.message)}
        </div>
        <div class="message-meta" style="font-size: 0.7rem; color: var(--text-muted); font-family: var(--font-mono);">
          ${diagnostic.file}:${diagnostic.line}:${diagnostic.column}
        </div>
      </div>
    `;

    // Click to view explanation
    messageEl.addEventListener('click', () => {
      this.showDiagnosticExplanation(diagnostic);
    });

    if (this.elements.chatMessages) {
      this.elements.chatMessages.appendChild(messageEl);
      this.scrollToBottom();
    }
  },

  addAIMessage(text, data = null) {
    const messageEl = document.createElement('div');
    messageEl.className = 'chat-message ai-message';

    messageEl.innerHTML = `
      <div class="message-avatar">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"></circle>
          <path d="M12 6v6l4 2"></path>
        </svg>
      </div>
      <div class="message-content">
        <div class="message-text">${this.formatMessageText(text)}</div>
      </div>
    `;

    if (data && data.diagnostics) {
      // Add clickable diagnostic links
      const diagnosticsEl = document.createElement('div');
      diagnosticsEl.style.marginTop = 'var(--space-3)';
      diagnosticsEl.style.display = 'flex';
      diagnosticsEl.style.flexDirection = 'column';
      diagnosticsEl.style.gap = 'var(--space-2)';

      data.diagnostics.forEach(diag => {
        const linkEl = document.createElement('div');
        linkEl.style.padding = 'var(--space-2)';
        linkEl.style.background = 'var(--bg-input)';
        linkEl.style.border = '1px solid var(--border)';
        linkEl.style.borderRadius = 'var(--radius-sm)';
        linkEl.style.cursor = 'pointer';
        linkEl.innerHTML = `
          <div style="font-size: 0.75rem; font-weight: 500; color: var(--text); margin-bottom: var(--space-1);">
            ${this.escapeHtml(diag.code)} - ${this.escapeHtml(diag.message)}
          </div>
          <div style="font-size: 0.7rem; color: var(--text-muted); font-family: var(--font-mono);">
            ${this.escapeHtml(diag.file)}:${diag.line}:${diag.column}
          </div>
        `;
        linkEl.addEventListener('click', () => this.showDiagnosticExplanation(diag));
        diagnosticsEl.appendChild(linkEl);
      });

      messageEl.querySelector('.message-content').appendChild(diagnosticsEl);
    }

    if (this.elements.chatMessages) {
      this.elements.chatMessages.appendChild(messageEl);
      this.scrollToBottom();
    }
  },

  formatMessageText(text) {
    // Convert simple markdown-like formatting
    return text
      .replace(/\n/g, '<br>')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  },

  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  },

  async showDiagnosticExplanation(diagnostic) {
    this.state.currentDiagnostic = diagnostic;

    // Add a "thinking" message
    const thinkingEl = this.addAIMessage('Analyzing this issue...');

    try {
      const explanation = await App.explainDiagnostic(diagnostic.id, diagnostic, this.state.files);

      // Remove thinking message and add real explanation
      if (thinkingEl && thinkingEl.parentNode) {
        thinkingEl.parentNode.removeChild(thinkingEl);
      }

      this.renderExplanation(explanation);
    } catch (err) {
      console.error('Explain error:', err);
      if (thinkingEl && thinkingEl.parentNode) {
        thinkingEl.parentNode.removeChild(thinkingEl);
      }
      this.addAIMessage(`Failed to generate explanation: ${err.message}`);
    }
  },

  renderExplanation(explanation) {
    const messageEl = document.createElement('div');
    messageEl.className = 'chat-message ai-message';

    messageEl.innerHTML = `
      <div class="message-avatar">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"></circle>
          <path d="M12 6v6l4 2"></path>
        </svg>
      </div>
      <div class="message-content">
        <div class="message-section">
          <div class="section-label" style="font-size: 0.7rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); margin-bottom: var(--space-2);">What Happened</div>
          <div class="section-content" style="font-size: 0.875rem; color: var(--text-secondary); line-height: 1.7; margin-bottom: var(--space-4);">
            ${this.escapeHtml(explanation.whatHappened || 'No details available')}
          </div>
        </div>
        <div class="message-section">
          <div class="section-label" style="font-size: 0.7rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); margin-bottom: var(--space-2);">Why</div>
          <div class="section-content" style="font-size: 0.875rem; color: var(--text-secondary); line-height: 1.7; margin-bottom: var(--space-4);">
            ${this.escapeHtml(explanation.why || 'No details available')}
          </div>
        </div>
        ${explanation.recommendedFix?.code ? `
        <div class="message-section">
          <div class="section-label" style="font-size: 0.7rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); margin-bottom: var(--space-2);">Recommended Fix</div>
          <div style="background: var(--success-dim); border: 1px solid var(--success-dim); border-radius: var(--radius-sm); padding: var(--space-3); margin-bottom: var(--space-4);">
            <div style="font-size: 0.7rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--success); margin-bottom: var(--space-2);">Corrected Code</div>
            <pre style="font-family: var(--font-mono); font-size: 0.8rem; color: var(--text); background: var(--bg-code); padding: var(--space-3); border-radius: var(--radius-sm); overflow-x: auto; white-space: pre; margin: 0;">${this.escapeHtml(explanation.recommendedFix.code)}</pre>
            <div style="font-size: 0.8rem; color: var(--text-secondary); margin-top: var(--space-2);">${this.escapeHtml(explanation.recommendedFix.explanation || '')}</div>
          </div>
        </div>
        ` : ''}
        <div class="message-section">
          <div class="section-label" style="font-size: 0.7rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); margin-bottom: var(--space-2);">Prevention</div>
          <div class="section-content" style="font-size: 0.875rem; color: var(--text-secondary); line-height: 1.7;">
            ${this.escapeHtml(explanation.prevention || 'No details available')}
          </div>
        </div>
      </div>
    `;

    if (this.elements.chatMessages) {
      this.elements.chatMessages.appendChild(messageEl);
      this.scrollToBottom();
    }
  },

  async handleSendMessage() {
    if (!this.elements.chatInput) return;

    const text = this.elements.chatInput.value.trim();
    if (!text) return;

    // Add user message
    this.addUserMessage(text);
    this.elements.chatInput.value = '';
    this.elements.chatInput.style.height = 'auto';

    // Add thinking message
    const thinkingEl = this.addAIMessage('Thinking...');

    try {
      // Send to AI explanation endpoint with user context
      const response = await fetch('/api/explain/single', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          diagnosticId: 'chat-' + Date.now(),
          diagnostics: [{
            id: 'chat-' + Date.now(),
            type: 'info',
            code: 'UserQuery',
            message: text,
            line: 0,
            column: 0,
            sourceLine: '',
            severity: 'low',
            source: 'chat',
            timestamp: new Date().toISOString(),
          }],
          files: this.state.files,
          projectContext: {
            totalFiles: this.state.files.length,
            languages: [...new Set(this.state.files.map(f => f.language).filter(l => l !== 'Unknown'))],
            totalDiagnostics: this.state.files.reduce((sum, f) => sum + (f.diagnostics?.length || 0), 0),
          },
        }),
      });

      const result = await response.json();

      if (thinkingEl && thinkingEl.parentNode) {
        thinkingEl.parentNode.removeChild(thinkingEl);
      }

      if (result.success && result.data?.success) {
        this.addAIMessage(result.data.explanation?.whatHappened || 'I received your message.');
      } else {
        this.addAIMessage(result.data?.error || 'Failed to process your message.');
      }
    } catch (err) {
      if (thinkingEl && thinkingEl.parentNode) {
        thinkingEl.parentNode.removeChild(thinkingEl);
      }
      this.addAIMessage(`Error: ${err.message}`);
    }
  },

  addUserMessage(text) {
    const messageEl = document.createElement('div');
    messageEl.className = 'chat-message user-message';

    messageEl.innerHTML = `
      <div class="message-content">
        <div class="message-text" style="color: var(--text);">${this.escapeHtml(text)}</div>
      </div>
    `;

    if (this.elements.chatMessages) {
      this.elements.chatMessages.appendChild(messageEl);
      this.scrollToBottom();
    }
    return messageEl;
  },

  scrollToBottom() {
    if (this.elements.chatMessages) {
      this.elements.chatMessages.scrollTop = this.elements.chatMessages.scrollHeight;
    }
  },

  clearChat() {
    if (this.elements.chatMessages) {
      this.elements.chatMessages.innerHTML = '';
    }
    this.state.currentDiagnostic = null;
    this.state.currentExplanation = null;
  },

  copyCurrentCode() {
    const codeText = document.getElementById('code-text');
    if (codeText && codeText.textContent) {
      navigator.clipboard.writeText(codeText.textContent).then(() => {
        App.showToast('Code copied to clipboard');
      }).catch(() => {
        App.showToast('Failed to copy', true);
      });
    }
  },

  clear() {
    this.state.currentDiagnostic = null;
    this.state.currentExplanation = null;
    this.state.files = [];
    if (this.elements.chatMessages) {
      this.elements.chatMessages.innerHTML = '';
    }
    if (this.elements.chatInputArea) {
      this.elements.chatInputArea.classList.add('hidden');
    }
    if (this.elements.chatEmptyHint) {
      this.elements.chatEmptyHint.classList.remove('hidden');
    }
  },
};

window.Explanation = Explanation;
