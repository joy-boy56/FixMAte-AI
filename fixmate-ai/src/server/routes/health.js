/**
 * Health Check Route
 */

const express = require('express');
const { checkPythonAvailable } = require('../../analysis/pythonAnalyzer');
const { checkNodeAvailable } = require('../../analysis/javascriptAnalyzer');
const { checkTscAvailable } = require('../../analysis/typescriptAnalyzer');

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
    
    const hasApiKey = !!process.env.NVIDIA_API_KEY;
    
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
        name: 'NVIDIA Nemotron 3 Ultra',
        model: 'nvidia/nemotron-3.5-super-vl-120b-a12b',
        configured: hasApiKey,
        available: hasApiKey,
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