/**
 * File Handler Module
 * Handles individual file uploads, multiple files, and ZIP archives
 */

const path = require('path');
const fs = require('fs').promises;
const { extractZip, isZipFile } = require('./zipHandler');
const { detectLanguage } = require('../detection/languageDetector');
const { filterFiles, getExcludedDirectories } = require('../detection/fileFilter');

const MAX_FILE_SIZE = 1 * 1024 * 1024; // 1 MB per file
const MAX_TOTAL_SIZE = 25 * 1024 * 1024; // 25 MB total
const MAX_FILES = 200;

const SUPPORTED_EXTENSIONS = new Set([
  // Python
  '.py', '.pyw',
  // JavaScript
  '.js', '.mjs', '.cjs',
  // TypeScript
  '.ts', '.tsx',
  // Java
  '.java',
  // C
  '.c',
  // C++
  '.cpp', '.cc', '.cxx', '.h', '.hpp',
  // HTML
  '.html', '.htm',
  // CSS
  '.css',
  // JSON
  '.json',
]);

const BINARY_EXTENSIONS = new Set([
  '.exe', '.dll', '.so', '.dylib', '.bin', '.dat',
  '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.webp', '.svg',
  '.mp4', '.mov', '.avi', '.mkv', '.webm',
  '.mp3', '.wav', '.ogg', '.flac',
  '.zip', '.tar', '.gz', '.rar', '.7z',
  '.pdf', '.doc', '.docx', '.xls', '.xlsx',
  '.woff', '.woff2', '.ttf', '.eot',
]);

/**
 * Check if a file extension is supported for analysis
 */
function isSupportedExtension(ext) {
  return SUPPORTED_EXTENSIONS.has(ext.toLowerCase());
}

/**
 * Check if a file is likely binary
 */
function isBinaryFile(ext) {
  return BINARY_EXTENSIONS.has(ext.toLowerCase());
}

/**
 * Sanitize file path to prevent path traversal
 */
function sanitizePath(relativePath) {
  // Normalize path and remove any leading slashes or backslashes
  let normalized = path.normalize(relativePath).replace(/^[\/\\]+/, '');
  
  // Check for path traversal attempts
  if (normalized.includes('..') || path.isAbsolute(normalized)) {
    throw new Error(`Invalid file path: ${relativePath}`);
  }
  
  return normalized;
}

/**
 * Process a single file
 */
async function processFile(file, basePath = '') {
  const relativePath = sanitizePath(path.join(basePath, file.originalname || file.name));
  const ext = path.extname(relativePath).toLowerCase();
  
  // Check file size
  const fileSize = file.size || (file.buffer?.length) || 0;
  if (fileSize > MAX_FILE_SIZE) {
    return {
      path: relativePath,
      status: 'skipped',
      reason: `File exceeds maximum size of ${MAX_FILE_SIZE / 1024 / 1024} MB`,
      size: fileSize,
      language: null,
    };
  }
  
  // Check if binary
  if (isBinaryFile(ext)) {
    return {
      path: relativePath,
      status: 'skipped',
      reason: 'Binary file type not supported for analysis',
      size: fileSize,
      language: null,
    };
  }
  
  // Check if supported extension
  const isSupported = isSupportedExtension(ext);
  
  // Detect language
  const language = isSupported ? detectLanguage(relativePath, file.buffer || file.content) : 'Unknown';
  
  let content = '';
  if (file.buffer) {
    content = file.buffer.toString('utf-8');
  } else if (file.content) {
    content = file.content;
  }
  
  return {
    path: relativePath,
    status: isSupported ? 'supported' : 'skipped',
    reason: isSupported ? null : 'Unsupported file extension for analysis',
    size: fileSize,
    language,
    extension: ext,
    content: isSupported ? content : '',
    lines: isSupported ? content.split('\n').length : 0,
  };
}

/**
 * Process multiple files from a file upload
 */
async function processFiles(files) {
  const results = [];
  let totalSize = 0;
  let fileCount = 0;
  
  for (const file of files) {
    if (fileCount >= MAX_FILES) {
      results.push({
        path: file.originalname || file.name,
        status: 'skipped',
        reason: `Maximum file limit (${MAX_FILES}) reached`,
        size: file.size || 0,
        language: null,
      });
      continue;
    }
    
    if (totalSize >= MAX_TOTAL_SIZE) {
      results.push({
        path: file.originalname || file.name,
        status: 'skipped',
        reason: `Maximum total upload size (${MAX_TOTAL_SIZE / 1024 / 1024} MB) reached`,
        size: file.size || 0,
        language: null,
      });
      continue;
    }
    
    // Check if it's a ZIP file
    if (isZipFile(file)) {
      try {
        const zipResults = await extractZip(file);
        for (const zipFile of zipResults) {
          if (fileCount >= MAX_FILES || totalSize >= MAX_TOTAL_SIZE) break;
          
          const processed = await processFile(zipFile);
          results.push(processed);
          totalSize += processed.size;
          fileCount++;
        }
      } catch (err) {
        results.push({
          path: file.originalname,
          status: 'skipped',
          reason: `Failed to extract ZIP: ${err.message}`,
          size: file.size || 0,
          language: null,
        });
      }
      continue;
    }
    
    const processed = await processFile(file);
    results.push(processed);
    totalSize += processed.size;
    fileCount++;
  }
  
  // Apply file filtering (exclusions)
  const filtered = filterFiles(results);
  
  return {
    files: filtered,
    summary: {
      totalFiles: results.length,
      supportedFiles: filtered.filter(f => f.status === 'supported').length,
      skippedFiles: filtered.filter(f => f.status === 'skipped').length,
      totalSize,
      languages: [...new Set(filtered.filter(f => f.language !== 'Unknown').map(f => f.language))],
    },
  };
}

/**
 * Process files with webkitRelativePath (for folder uploads)
 */
async function processFolderFiles(files) {
  const fileMap = new Map();
  
  // Group by relative path
  for (const file of files) {
    const relativePath = file.webkitRelativePath || file.name;
    fileMap.set(relativePath, file);
  }
  
  // Convert to array of file objects
  const fileArray = Array.from(fileMap.values());
  
  return processFiles(fileArray);
}

/**
 * Get supported languages summary
 */
function getSupportedLanguages() {
  const langMap = new Map();
  
  for (const ext of SUPPORTED_EXTENSIONS) {
    const lang = detectLanguage(`test${ext}`);
    if (!langMap.has(lang)) {
      langMap.set(lang, []);
    }
    langMap.get(lang).push(ext);
  }
  
  return Array.from(langMap.entries()).map(([language, extensions]) => ({
    language,
    extensions,
  }));
}

module.exports = {
  processFiles,
  processFolderFiles,
  processFile,
  isSupportedExtension,
  getSupportedLanguages,
  MAX_FILE_SIZE,
  MAX_TOTAL_SIZE,
  MAX_FILES,
  sanitizePath,
};