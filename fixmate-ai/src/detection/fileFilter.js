/**
 * File Filter Module
 * Handles exclusion rules for project files
 */

const path = require('path');

const DEFAULT_EXCLUDED_DIRS = new Set([
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
  '.idea',
  '.vscode',
  '.vs',
  '.sass-cache',
  '.cache',
  '.parcel-cache',
  '.turbo',
  '.vercel',
  '.netlify',
  'out',
  '.output',
]);

const DEFAULT_EXCLUDED_FILES = new Set([
  '.env',
  '.env.local',
  '.env.production',
  '.env.development',
  '.env.test',
  '.npmrc',
  '.yarnrc',
  '.pnpmrc',
  'yarn.lock',
  'package-lock.json',
  'pnpm-lock.yaml',
  'requirements.txt',
  'Pipfile.lock',
  'poetry.lock',
  'Cargo.lock',
  'composer.lock',
  'Gemfile.lock',
  'go.sum',
  '.DS_Store',
  'Thumbs.db',
  '*.log',
  '*.pid',
  '*.seed',
  '*.pid.lock',
]);

const DEFAULT_EXCLUDED_PATTERNS = [
  /^\./,           // Hidden files
  /~$/,            // Backup files
  /\.bak$/,        // Backup files
  /\.tmp$/,        // Temp files
  /\.temp$/,       // Temp files
  /\.swp$/,        // Vim swap
  /\.swo$/,        // Vim swap
  /\.orig$/,       // Merge orig
  /\.rej$/,        // Merge reject
];

/**
 * Default configuration
 */
const defaultConfig = {
  excludedDirs: DEFAULT_EXCLUDED_DIRS,
  excludedFiles: DEFAULT_EXCLUDED_FILES,
  excludedPatterns: DEFAULT_EXCLUDED_PATTERNS,
  maxFileSize: 1 * 1024 * 1024, // 1 MB
  maxTotalSize: 25 * 1024 * 1024, // 25 MB
  maxFiles: 200,
};

/**
 * Check if a file path should be excluded
 */
function shouldExclude(filePath, config = defaultConfig) {
  const relativePath = filePath.replace(/^[\/\\]+/, '');
  const parts = relativePath.split(path.sep);
  const fileName = parts[parts.length - 1];
  
  // Check excluded directories
  for (const part of parts) {
    if (config.excludedDirs.has(part)) {
      return { excluded: true, reason: `Excluded directory: ${part}` };
    }
  }
  
  // Check excluded files
  if (config.excludedFiles.has(fileName)) {
    return { excluded: true, reason: `Excluded file: ${fileName}` };
  }
  
  // Check excluded patterns
  for (const pattern of config.excludedPatterns) {
    if (pattern.test(fileName)) {
      return { excluded: true, reason: `Matches excluded pattern: ${pattern}` };
    }
  }
  
  return { excluded: false };
}

/**
 * Filter files array based on exclusion rules
 */
function filterFiles(files, config = defaultConfig) {
  const results = [];
  const skipped = [];
  
  for (const file of files) {
    const check = shouldExclude(file.path, config);
    
    if (check.excluded) {
      skipped.push({
        ...file,
        status: 'skipped',
        reason: check.reason,
      });
    } else {
      // Check file size limit
      if (file.size > config.maxFileSize) {
        skipped.push({
          ...file,
          status: 'skipped',
          reason: `File exceeds maximum size of ${config.maxFileSize / 1024 / 1024} MB`,
        });
      } else {
        results.push(file);
      }
    }
  }
  
  // Check total size
  let totalSize = 0;
  const finalResults = [];
  
  for (const file of results) {
    if (totalSize + file.size > config.maxTotalSize) {
      skipped.push({
        ...file,
        status: 'skipped',
        reason: `Total upload size limit (${config.maxTotalSize / 1024 / 1024} MB) exceeded`,
      });
    } else {
      finalResults.push(file);
      totalSize += file.size;
    }
  }
  
  // Check file count
  if (finalResults.length > config.maxFiles) {
    const excess = finalResults.splice(config.maxFiles);
    for (const file of excess) {
      skipped.push({
        ...file,
        status: 'skipped',
        reason: `Maximum file limit (${config.maxFiles}) reached`,
      });
    }
  }
  
  return [...finalResults, ...skipped];
}

/**
 * Get exclusion statistics
 */
function getExclusionStats(files) {
  const stats = {
    total: files.length,
    supported: 0,
    skipped: 0,
    byReason: {},
  };
  
  for (const file of files) {
    if (file.status === 'skipped') {
      stats.skipped++;
      const reason = file.reason || 'Unknown';
      stats.byReason[reason] = (stats.byReason[reason] || 0) + 1;
    } else {
      stats.supported++;
    }
  }
  
  return stats;
}

/**
 * Load custom ignore patterns from .fixmateignore or .gitignore
 */
async function loadIgnorePatterns(projectRoot) {
  const patterns = [...DEFAULT_EXCLUDED_PATTERNS];
  
  // Try .fixmateignore first
  try {
    const fixmateIgnorePath = path.join(projectRoot, '.fixmateignore');
    const content = await require('fs').promises.readFile(fixmateIgnorePath, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        // Convert gitignore pattern to regex
        const regex = gitignoreToRegex(trimmed);
        if (regex) patterns.push(regex);
      }
    }
  } catch (e) {
    // File doesn't exist, ignore
  }
  
  // Try .gitignore as fallback
  try {
    const gitIgnorePath = path.join(projectRoot, '.gitignore');
    const content = await require('fs').promises.readFile(gitIgnorePath, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#') && !trimmed.startsWith('!')) {
        const regex = gitignoreToRegex(trimmed);
        if (regex) patterns.push(regex);
      }
    }
  } catch (e) {
    // File doesn't exist, ignore
  }
  
  return patterns;
}

/**
 * Convert gitignore pattern to regex
 */
function gitignoreToRegex(pattern) {
  try {
    // Simple conversion - not full gitignore spec
    let regex = pattern
      .replace(/\./g, '\\.')
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.');
    
    // Anchor to start/end if not already
    if (!pattern.startsWith('*') && !pattern.startsWith('**')) {
      regex = '^' + regex;
    }
    if (!pattern.endsWith('*') && !pattern.endsWith('**')) {
      regex = regex + '$';
    }
    
    return new RegExp(regex);
  } catch (e) {
    return null;
  }
}

/**
 * Get default excluded directories for display
 */
function getExcludedDirectories() {
  return Array.from(DEFAULT_EXCLUDED_DIRS).sort();
}

/**
 * Get default excluded files for display
 */
function getExcludedFiles() {
  return Array.from(DEFAULT_EXCLUDED_FILES).sort();
}

module.exports = {
  filterFiles,
  shouldExclude,
  getExclusionStats,
  loadIgnorePatterns,
  getExcludedDirectories,
  getExcludedFiles,
  DEFAULT_EXCLUDED_DIRS,
  DEFAULT_EXCLUDED_FILES,
  DEFAULT_EXCLUDED_PATTERNS,
  defaultConfig,
};