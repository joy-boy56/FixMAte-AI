/**
 * Health Check Route
 */

const express = require('express');
const { checkPythonAvailable } = require('../../analysis/pythonAnalyzer');
const { checkNodeAvailable } = require('../../analysis/javascriptAnalyzer');
const { checkTscAvailable } = require('../../analysis/typescriptAnalyzer');
const { getAvailableModes, getDefaultModeId, getProviderName, resolveMode, hasApiKey } = require('../../config/aiModels');

const router = express.Router();

/**
 * GET /api/health
 * Check backend and analyzer status
 */
router.get('/health', async (req, res) => {
  try {
    const [pythonAvailable, nodeAvailable, tscAvailable] = await Promise.all([
      checkPythonAvailable(),
      checkNodeAvailable(),
      checkTscAvailable(),
    ]);
    
    const hasKey = hasApiKey();
    const defaultMode = resolveMode(getDefaultModeId());
    
    res.json({
      status: 'ok',
      application: 'FixMate AI',
      version: '2.0.0',
      mode: 'project-scanner',
      analyzers: {
        python: { available: pythonAvailable, name: 'Python AST' },
        javascript: { available: nodeAvailable, name: 'Node.js --check' },
        typescript: { available: tscAvailable, name: 'TypeScript tsc --noEmit' },
        json: { available: true, name: 'JSON.parse' },
      },
      ai_provider: {
        name: getProviderName(),
        // The model used when the client does not request a specific mode.
        // Per-mode models are listed in `modes` below.
        model: defaultMode.model,
        configured: hasKey,
        available: hasKey,
        // Frontend renders the mode toggle from this - no model name is
        // hardcoded in the browser.
        defaultMode: defaultMode.id,
        modes: getAvailableModes(),
      },
      features: {
        folder_upload: true,
        zip_upload: true,
        drag_drop: true,
        ai_explanations: hasApiKey,
        max_files: 200,
        max_file_size_mb: 1,
        max_total_size_mb: 25,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({
      status: 'error',
      error: err.message,
    });
  }
});

module.exports = router;