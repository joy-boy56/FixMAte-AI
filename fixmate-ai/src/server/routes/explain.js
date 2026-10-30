/**
 * AI Explanation Routes
 * Handles AI-powered diagnostic explanations
 */

const express = require('express');
const { explainDiagnostics, getExplanation } = require('../../ai/explainDiagnostics');

const router = express.Router();

/**
 * POST /api/explain
 * Get AI explanations for diagnostics
 */
router.post('/explain', async (req, res) => {
  try {
    const { diagnostics, files, projectContext } = req.body;
    
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
    
    const results = await explainDiagnostics(needsExplanation, files, projectContext || {});
    
    res.json({
      success: true,
      data: results,
    });
  } catch (err) {
    console.error('Explain error:', err);
    res.status(500).json({
      success: false,
      error: err.message || 'Explanation failed',
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
    
    if (!diagnosticId || !diagnostics || !files) {
      return res.status(400).json({
        success: false,
        error: 'diagnosticId, diagnostics, and files required',
      });
    }
    
    const result = await getExplanation(diagnosticId, diagnostics, files, projectContext || {});
    
    res.json({
      success: result.success,
      data: result,
    });
  } catch (err) {
    console.error('Single explain error:', err);
    res.status(500).json({
      success: false,
      error: err.message || 'Explanation failed',
    });
  }
});

module.exports = router;