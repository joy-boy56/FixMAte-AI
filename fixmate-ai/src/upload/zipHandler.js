/**
 * ZIP Handler Module
 * Handles ZIP file extraction with security considerations
 */

const fs = require('fs').promises;
const path = require('path');
const AdmZip = require('adm-zip');

const MAX_ZIP_SIZE = 25 * 1024 * 1024; // 25 MB
const MAX_ZIP_FILES = 200;
const MAX_ZIP_ENTRY_SIZE = 1 * 1024 * 1024; // 1 MB per entry

const EXCLUDED_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'coverage',
  '.venv',
  'venv',
  '__pycache__',
  'vendor',
  '.next',
  '.nuxt',
  'target',
  'bin',
  'obj',
]);

const EXCLUDED_FILES = new Set([
  '.env',
  '.env.local',
  '.env.production',
  '.env.development',
  '.npmrc',
  '.yarnrc',
  'yarn.lock',
  'package-lock.json',
  'pnpm-lock.yaml',
  'requirements.txt',
  'Pipfile.lock',
  'poetry.lock',
]);

/**
 * Check if a file is a ZIP file
 */
function isZipFile(file) {
  const name = file.originalname || file.name || '';
  const ext = path.extname(name).toLowerCase();
  const mime = file.mimetype || file.type || '';
  
  return ext === '.zip' || mime === 'application/zip' || mime === 'application/x-zip-compressed';
}

/**
 * Check if a path should be excluded
 */
function shouldExcludePath(relativePath) {
  const parts = relativePath.split(path.sep);
  
  // Check if any part is an excluded directory
  for (const part of parts) {
    if (EXCLUDED_DIRS.has(part)) {
      return true;
    }
  }
  
  // Check if filename is excluded
  const fileName = parts[parts.length - 1];
  if (EXCLUDED_FILES.has(fileName)) {
    return true;
  }
  
  return false;
}

/**
 * Sanitize ZIP entry path to prevent path traversal
 */
function sanitizeZipPath(entryPath) {
  // Normalize the path
  let normalized = path.normalize(entryPath).replace(/^[\/\\]+/, '');
  
  // Remove any leading directory references
  while (normalized.startsWith('..') || normalized.startsWith('./') || normalized.startsWith('.\\')) {
    normalized = normalized.replace(/^\.\.?[\/\\]/, '');
  }
  
  // Check for absolute paths
  if (path.isAbsolute(normalized)) {
    throw new Error(`Absolute path in ZIP: ${entryPath}`);
  }
  
  // Check for path traversal
  if (normalized.includes('..')) {
    throw new Error(`Path traversal in ZIP: ${entryPath}`);
  }
  
  return normalized;
}

/**
 * Extract ZIP file with security checks
 */
async function extractZip(file) {
  const buffer = file.buffer || file.data;
  
  if (!buffer) {
    throw new Error('No ZIP data provided');
  }
  
  if (buffer.length > MAX_ZIP_SIZE) {
    throw new Error(`ZIP file exceeds maximum size of ${MAX_ZIP_SIZE / 1024 / 1024} MB`);
  }
  
  const zip = new AdmZip(buffer);
  const zipEntries = zip.getEntries();
  
  if (zipEntries.length > MAX_ZIP_FILES) {
    throw new Error(`ZIP contains too many files (max ${MAX_ZIP_FILES})`);
  }
  
  const results = [];
  
  for (const entry of zipEntries) {
    // Skip directories
    if (entry.isDirectory) continue;
    
    // Sanitize path
    let relativePath;
    try {
      relativePath = sanitizeZipPath(entry.entryName);
    } catch (err) {
      results.push({
        path: entry.entryName,
        status: 'skipped',
        reason: err.message,
        size: 0,
        language: null,
      });
      continue;
    }
    
    // Check if excluded
    if (shouldExcludePath(relativePath)) {
      results.push({
        path: relativePath,
        status: 'skipped',
        reason: 'Excluded by filter rules',
        size: entry.header.size,
        language: null,
      });
      continue;
    }
    
    // Check entry size
    if (entry.header.size > MAX_ZIP_ENTRY_SIZE) {
      results.push({
        path: relativePath,
        status: 'skipped',
        reason: `Entry exceeds maximum size of ${MAX_ZIP_ENTRY_SIZE / 1024 / 1024} MB`,
        size: entry.header.size,
        language: null,
      });
      continue;
    }
    
    // Get content
    const content = entry.getData().toString('utf-8');
    
    results.push({
      name: path.basename(relativePath),
      path: relativePath,
      size: entry.header.size,
      buffer: entry.getData(),
      content,
      webkitRelativePath: relativePath, // For compatibility with folder upload
    });
  }
  
  return results;
}

/**
 * Get excluded directories list for display
 */
function getExcludedDirectories() {
  return Array.from(EXCLUDED_DIRS);
}

/**
 * Get excluded files list for display
 */
function getExcludedFiles() {
  return Array.from(EXCLUDED_FILES);
}

module.exports = {
  isZipFile,
  extractZip,
  shouldExcludePath,
  sanitizeZipPath,
  getExcludedDirectories,
  getExcludedFiles,
  EXCLUDED_DIRS,
  EXCLUDED_FILES,
};