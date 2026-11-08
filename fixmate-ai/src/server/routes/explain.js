/**
 * AI Explanation Routes
 * Handles AI-powered diagnostic explanations
 */

const express = require('express');
const { explainDiagnostics, getExplanation } = require('../../ai/explainDiagnostics');
const { readMode: readModeFrom, resolveMode, sanitizeAiError } = require('../../config/aiModels');

const router = express.Router();

/**
 * Read and validate the requested analysis mode.
 * An unknown mode falls back to the server default.
 */
function readMode(req) {
  const mode = readModeFrom(req.body);
  if (mode === undefined && typeof req.body?.mode === 'string' && req.body.mode !== '') {
    console.warn(`[Explain] Unknown mode "${req.body.mode.slice(0, 32)}", using default mode`);
  }
  return mode;
}

/**
 * POST /api/explain
 * Get AI explanations for diagnostics
 */
router.post('/explain', async (req, res) => {
  try {
    const { diagnostics, files, projectContext } = req.body;
    const mode = readMode(req);
    
    if (!diagnostics || !Array.isArray(diagnostics)) {
      return res.status(400).json({
        success: false,
        error: 'diagnostics array required',
      });
    }
    
    if (!files || !Array.isArray(files)) {
      return res.status(400).json({
        success: false,
        error: 'files array required',
      });
    }
    
    // Filter to only diagnostics that need explanation (no AI explanation yet)
    const needsExplanation = diagnostics.filter(d => !d.aiExplanation);
    
    if (needsExplanation.length === 0) {
      return res.json({
        success: true,
        data: diagnostics.map(d => ({
          diagnosticId: d.id,
          success: true,
          explanation: d.aiExplanation,
        })),
      });
    }
    
    const results = await explainDiagnostics(needsExplanation, files, projectContext || {}, mode);
    
    res.json({
      success: true,
      mode: resolveMode(mode).id,
      data: results,
    });
  } catch (err) {
    console.error('Explain error:', err);
    // The raw error can embed the upstream base URL, model name and request
    // ids, so a generic message is returned instead.
    res.status(500).json({
      success: false,
      error: sanitizeAiError(err, 'Explanation failed.'),
    });
  }
});

/**
 * POST /api/explain/single
 * Get AI explanation for a single diagnostic
 */
router.post('/explain/single', async (req, res) => {
  try {
    const { diagnosticId, diagnostics, files, projectContext } = req.body;
    const mode = readMode(req);
    
    if (!diagnosticId || !diagnostics || !files) {
      return res.status(400).json({
        success: false,
        error: 'diagnosticId, diagnostics, and files required',
      });
    }
    
    const result = await getExplanation(diagnosticId, diagnostics, files, projectContext || {}, mode);
    
    res.json({
      success: result.success,
      mode: resolveMode(mode).id,
      data: result,
    });
  } catch (err) {
    console.error('Single explain error:', err);
    res.status(500).json({
      success: false,
      error: sanitizeAiError(err, 'Explanation failed.'),
    });
  }
});

module.exports = router;