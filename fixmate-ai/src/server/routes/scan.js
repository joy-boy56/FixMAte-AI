/**
 * Scan Routes
 * Handles project scanning endpoints
 */

const express = require('express');
const multer = require('multer');
const { scanProject, scanProjectFolder, getFileContext, getFilesWithDiagnostics } = require('../../analysis/scanProject');
const { readMode: readModeFrom, resolveMode, sanitizeAiError } = require('../../config/aiModels');

const router = express.Router();

/**
 * Read and validate the requested analysis mode.
 * An unknown mode falls back to the server default rather than failing the
 * request, so a stale client can never trigger a broken scan.
 */
function readMode(req) {
  const mode = readModeFrom(req.body);
  if (mode === undefined && typeof req.body?.mode === 'string' && req.body.mode !== '') {
    console.warn(`[Scan] Unknown mode "${req.body.mode.slice(0, 32)}", using default mode`);
  }
  return mode;
}

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 25 * 1024 * 1024, // 25 MB
    files: 200,
  },
  fileFilter: (req, file, cb) => {
    // Accept all files, filtering happens in our handler
    cb(null, true);
  },
});

/**
 * POST /api/scan
 * Upload and scan project files
 */
router.post('/scan', upload.array('files', 200), async (req, res) => {
  try {
    const files = req.files || [];
    const projectName = req.body.projectName || req.body.name || 'Uploaded Project';
    const mode = readMode(req);
    
    if (files.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No files uploaded',
      });
    }
    
    // Check if this is a folder upload (has webkitRelativePath)
    const isFolderUpload = files.some(f => f.webkitRelativePath);
    
    let result;
    if (isFolderUpload) {
      result = await scanProjectFolder(files, { projectName, mode });
    } else {
      result = await scanProject(files, { projectName, mode });
    }
    
    if (!result.success) {
      return res.status(500).json({
        success: false,
        error: result.error,
      });
    }
    
    res.json({
      success: true,
      mode: resolveMode(mode).id,
      data: result,
    });
  } catch (err) {
    console.error('Scan error:', err);
    res.status(500).json({
      success: false,
      error: sanitizeAiError(err, 'Scan failed.'),
    });
  }
});

/**
 * POST /api/scan/folder
 * Explicit folder upload endpoint
 */
router.post('/scan/folder', upload.array('files', 200), async (req, res) => {
  try {
    const files = req.files || [];
    const projectName = req.body.projectName || 'Folder Upload';
    const mode = readMode(req);
    
    if (files.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No files uploaded',
      });
    }
    
    const result = await scanProjectFolder(files, { projectName, mode });
    
    if (!result.success) {
      return res.status(500).json({
        success: false,
        error: result.error,
      });
    }
    
    res.json({
      success: true,
      mode: resolveMode(mode).id,
      data: result,
    });
  } catch (err) {
    console.error('Folder scan error:', err);
    res.status(500).json({
      success: false,
      error: sanitizeAiError(err, 'Folder scan failed.'),
    });
  }
});

/**
 * POST /api/scan/zip
 * Upload and scan ZIP archive
 */
const zipUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 25 * 1024 * 1024,
  },
  fileFilter: (req, file, cb) => {
    const ext = file.originalname?.toLowerCase().split('.').pop();
    if (ext === 'zip') {
      cb(null, true);
    } else {
      cb(new Error('Only ZIP files allowed'), false);
    }
  },
});

router.post('/scan/zip', zipUpload.single('zip'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No ZIP file uploaded',
      });
    }
    
    // Convert single ZIP file to array format
    const files = [req.file];
    const projectName = req.body.projectName || req.file.originalname.replace('.zip', '');
    const mode = readMode(req);
    
    // The fileHandler will detect and extract the ZIP
    const result = await scanProject(files, { projectName, mode });
    
    if (!result.success) {
      return res.status(500).json({
        success: false,
        error: result.error,
      });
    }
    
    res.json({
      success: true,
      mode: resolveMode(mode).id,
      data: result,
    });
  } catch (err) {
    console.error('ZIP scan error:', err);
    res.status(500).json({
      success: false,
      error: sanitizeAiError(err, 'ZIP scan failed.'),
    });
  }
});

/**
 * GET /api/scan/file/:fileId
 * Get file context for a diagnostic
 */
router.get('/scan/file/:fileId', async (req, res) => {
  try {
    // This would typically fetch from a session/cache
    // For now, return not implemented
    res.status(501).json({
      success: false,
      error: 'File context retrieval not implemented in stateless mode',
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

module.exports = router;