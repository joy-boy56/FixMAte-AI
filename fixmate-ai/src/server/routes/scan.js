/**
 * Scan Routes
 * Handles project scanning endpoints
 */

const express = require('express');
const multer = require('multer');
const { scanProject, scanProjectFolder, getFileContext, getFilesWithDiagnostics } = require('../../analysis/scanProject');

const router = express.Router();

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
      result = await scanProjectFolder(files, { projectName });
    } else {
      result = await scanProject(files, { projectName });
    }
    
    if (!result.success) {
      return res.status(500).json({
        success: false,
        error: result.error,
      });
    }
    
    res.json({
      success: true,
      data: result,
    });
  } catch (err) {
    console.error('Scan error:', err);
    res.status(500).json({
      success: false,
      error: err.message || 'Scan failed',
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
    
    if (files.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No files uploaded',
      });
    }
    
    const result = await scanProjectFolder(files, { projectName });
    
    if (!result.success) {
      return res.status(500).json({
        success: false,
        error: result.error,
      });
    }
    
    res.json({
      success: true,
      data: result,
    });
  } catch (err) {
    console.error('Folder scan error:', err);
    res.status(500).json({
      success: false,
      error: err.message || 'Folder scan failed',
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
    
    // The fileHandler will detect and extract the ZIP
    const result = await scanProject(files, { projectName });
    
    if (!result.success) {
      return res.status(500).json({
        success: false,
        error: result.error,
      });
    }
    
    res.json({
      success: true,
      data: result,
    });
  } catch (err) {
    console.error('ZIP scan error:', err);
    res.status(500).json({
      success: false,
      error: err.message || 'ZIP scan failed',
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