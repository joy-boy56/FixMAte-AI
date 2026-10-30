/**
 * FixMate AI - Main Server
 * Automatic Project Scanning and Debugging Assistant
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

// Import routes
const healthRoutes = require('./src/server/routes/health');
const scanRoutes = require('./src/server/routes/scan');
const explainRoutes = require('./src/server/routes/explain');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));

// API Routes
app.use('/api', healthRoutes);
app.use('/api', scanRoutes);
app.use('/api', explainRoutes);

// Serve index.html for all other routes (SPA fallback)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        error: 'File too large. Maximum size is 25 MB.',
      });
    }
    if (err.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({
        success: false,
        error: 'Too many files. Maximum is 200 files.',
      });
    }
  }
  
  if (err.message === 'Only ZIP files allowed') {
    return res.status(400).json({
      success: false,
      error: 'Only ZIP files are allowed for ZIP upload.',
    });
  }
  
  res.status(500).json({
    success: false,
    error: 'Internal server error',
  });
});

// Import multer for error handling
const multer = require('multer');

app.listen(PORT, () => {
  console.log(`FixMate AI server running on http://localhost:${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/api/health`);
  console.log(`Scan endpoint: http://localhost:${PORT}/api/scan`);
  console.log(`Explain endpoint: http://localhost:${PORT}/api/explain`);
});